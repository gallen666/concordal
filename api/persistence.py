"""SQLite-backed persistence for user-facing state.

Before this module: every user-state dict (`_known_users`, `_referrals`,
`_referral_bonus`, `_magic_tokens`, `_shared_decisions`, paid `_tiers`)
lived in process memory. Every Render redeploy wiped them.

After this module: all of the above are SQLite tables on disk at
TA_DATA_DIR. The in-memory dicts in `api/main.py` become a read-through
cache populated lazily — first read hits SQLite, subsequent reads are
free. Writes go to SQLite first, cache after.

WAL mode + UNIQUE constraints + idempotent INSERTs let two processes /
restarts share the same file without corruption. Pure stdlib (sqlite3),
no extra deps.

On Render free tier TA_DATA_DIR is ephemeral, so SQLite gets wiped on
redeploy just like the in-memory dicts did — same outcome, no worse.
On Render Starter ($7) + persistent disk ($1) at /var/data, this file
survives forever. The /v1/health endpoint already warns about
ephemeral storage so the operator knows when to upgrade.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from . import db

log = logging.getLogger(__name__)

# v65 tech-#2: the backend (SQLite vs Postgres) now lives in api/db.py, chosen
# by DATABASE_URL. This module is unchanged at the call sites — every function
# still does `c = _get_conn(); c.execute("... ?", (...))`. The db.Conn wrapper
# translates `?`→`%s` and the schema's REAL→DOUBLE PRECISION for Postgres.
# IntegrityError is re-exported from db so `except sqlite3.IntegrityError`
# call-sites become backend-agnostic.
IntegrityError = db.IntegrityError


def _get_conn() -> db.Conn:
    """Return the shared backend connection (SQLite or Postgres). Lazily
    opened and schema-initialised on first call by api/db.py."""
    return db.connect(init_schema=_init_schema)


def _init_schema(conn: "db.Conn") -> None:
    """Create the six tables we need. All idempotent — safe to call
    repeatedly. Add new tables here; never drop columns."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS known_users (
            email TEXT PRIMARY KEY,
            first_seen REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS referrals (
            referee_email TEXT PRIMARY KEY,
            inviter_email TEXT NOT NULL,
            claimed_at REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_referrals_inviter ON referrals(inviter_email);

        CREATE TABLE IF NOT EXISTS referral_bonus (
            email TEXT PRIMARY KEY,
            expires_at REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS magic_tokens (
            token TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            expires_at REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS shared_decisions (
            share_id TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            shared_at REAL NOT NULL
        );

        -- v43: persist decision jobs so they survive Render redeploys.
        -- Previously the in-memory _jobs dict was lost on every restart,
        -- causing frontend polling to hit "Unknown job" 404.
        CREATE TABLE IF NOT EXISTS decision_jobs (
            job_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            payload TEXT NOT NULL,
            updated_at REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_tiers (
            email TEXT PRIMARY KEY,
            tier TEXT NOT NULL,
            stripe_customer_id TEXT,
            stripe_subscription_id TEXT,
            updated_at REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS daily_briefs (
            date_str TEXT PRIMARY KEY,    -- YYYY-MM-DD
            title TEXT NOT NULL,
            body_md TEXT NOT NULL,
            locale TEXT NOT NULL,         -- "en" | "zh"
            generated_at REAL NOT NULL,
            model TEXT
        );

        -- Ticker-level shared cache. The roadmap's "10× cost reduction"
        -- bet: same ticker, same date, same agent role → same LLM output;
        -- so every user can read from the same row. cache_key is a
        -- compact composite — `${ticker}|${market}|${date}|${role}|${locale}`.
        CREATE TABLE IF NOT EXISTS analyst_cache (
            cache_key TEXT PRIMARY KEY,
            output_json TEXT NOT NULL,
            model TEXT,
            cost_usd REAL,
            cached_at REAL NOT NULL,
            ttl_seconds INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_cache_cached_at ON analyst_cache(cached_at);

        -- Multi-seed evaluation results — one row per (ticker, date, seed).
        CREATE TABLE IF NOT EXISTS seed_runs (
            ticker TEXT NOT NULL,
            decision_date TEXT NOT NULL,
            seed INTEGER NOT NULL,
            action TEXT NOT NULL,         -- "BUY" | "HOLD" | "SELL"
            confidence REAL NOT NULL,
            generated_at REAL NOT NULL,
            PRIMARY KEY (ticker, decision_date, seed)
        );

        -- Ticker metadata (name, sector, market cap) fetched from upstream
        -- providers. Cached 24h. Source-of-truth column lets us audit which
        -- provider we trusted (akshare vs yfinance vs ccxt vs fallback).
        CREATE TABLE IF NOT EXISTS ticker_meta (
            ticker TEXT PRIMARY KEY,
            market TEXT NOT NULL,
            name TEXT,
            sector TEXT,
            industry TEXT,
            market_cap REAL,
            currency TEXT,
            listing_date TEXT,
            source TEXT NOT NULL,         -- "akshare" | "yfinance" | "ccxt" | "fallback"
            fetched_at REAL NOT NULL
        );
    """)


# ---------------------------------------------------------------------------
# Known users
# ---------------------------------------------------------------------------


def remember_user(email: str) -> None:
    if not email or "@" not in email:
        return
    c = _get_conn()
    c.execute(
        "INSERT INTO known_users (email, first_seen) VALUES (?, ?) "
        "ON CONFLICT(email) DO NOTHING",
        (email, time.time()),
    )


def all_known_emails() -> list[str]:
    c = _get_conn()
    cur = c.execute("SELECT email FROM known_users")
    return [row[0] for row in cur]


# ---------------------------------------------------------------------------
# Referrals
# ---------------------------------------------------------------------------


def record_referral(referee_email: str, inviter_email: str) -> bool:
    """Return True if newly recorded, False if referee was already referred."""
    c = _get_conn()
    try:
        c.execute(
            "INSERT INTO referrals (referee_email, inviter_email, claimed_at) VALUES (?, ?, ?)",
            (referee_email, inviter_email, time.time()),
        )
        return True
    except IntegrityError:
        return False


def has_been_referred(referee_email: str) -> bool:
    c = _get_conn()
    cur = c.execute("SELECT 1 FROM referrals WHERE referee_email = ?", (referee_email,))
    return cur.fetchone() is not None


def invitees_of(inviter_email: str) -> list[str]:
    c = _get_conn()
    cur = c.execute(
        "SELECT referee_email FROM referrals WHERE inviter_email = ?",
        (inviter_email,),
    )
    return [row[0] for row in cur]


# ---------------------------------------------------------------------------
# Referral bonus
# ---------------------------------------------------------------------------


def grant_bonus(email: str, ttl_seconds: int) -> None:
    """Stack onto existing bonus — take max(existing, new)."""
    c = _get_conn()
    new_exp = time.time() + ttl_seconds
    c.execute(
        # Portable "keep the later expiry" upsert. SQLite's scalar MAX(a, b)
        # does NOT exist in Postgres (MAX is aggregate-only there) and PG's
        # GREATEST does not exist in SQLite — so neither is portable. CASE WHEN
        # works in both. Reference the existing row by table name (valid in
        # both dialects inside ON CONFLICT DO UPDATE).
        """INSERT INTO referral_bonus (email, expires_at) VALUES (?, ?)
           ON CONFLICT(email) DO UPDATE SET expires_at =
             CASE WHEN excluded.expires_at > referral_bonus.expires_at
                  THEN excluded.expires_at ELSE referral_bonus.expires_at END""",
        (email, new_exp),
    )


def bonus_expires_at(email: str) -> float:
    c = _get_conn()
    cur = c.execute("SELECT expires_at FROM referral_bonus WHERE email = ?", (email,))
    row = cur.fetchone()
    return float(row[0]) if row else 0.0


# ---------------------------------------------------------------------------
# Magic-link tokens
# ---------------------------------------------------------------------------


def put_magic_token(token: str, email: str, ttl_seconds: int) -> None:
    c = _get_conn()
    c.execute(
        "INSERT INTO magic_tokens (token, email, expires_at) VALUES (?, ?, ?) "
        "ON CONFLICT(token) DO UPDATE SET email=excluded.email, expires_at=excluded.expires_at",
        (token, email, time.time() + ttl_seconds),
    )
    # Opportunistic GC every time we add a token — keeps the table tiny.
    c.execute("DELETE FROM magic_tokens WHERE expires_at < ?", (time.time(),))


def consume_magic_token(token: str) -> str | None:
    """Return the bound email iff the token is fresh; delete on consume."""
    c = _get_conn()
    cur = c.execute(
        "SELECT email, expires_at FROM magic_tokens WHERE token = ?", (token,)
    )
    row = cur.fetchone()
    if not row:
        return None
    email, exp = row
    c.execute("DELETE FROM magic_tokens WHERE token = ?", (token,))
    if exp < time.time():
        return None
    return email


# ---------------------------------------------------------------------------
# Shared decisions
# ---------------------------------------------------------------------------


def put_shared_decision(share_id: str, payload_json: str) -> None:
    c = _get_conn()
    c.execute(
        "INSERT INTO shared_decisions (share_id, payload, shared_at) VALUES (?, ?, ?) "
        "ON CONFLICT(share_id) DO UPDATE SET payload=excluded.payload, shared_at=excluded.shared_at",
        (share_id, payload_json, time.time()),
    )


def get_shared_decision(share_id: str) -> str | None:
    c = _get_conn()
    cur = c.execute("SELECT payload FROM shared_decisions WHERE share_id = ?", (share_id,))
    row = cur.fetchone()
    return row[0] if row else None


# ---------------------------------------------------------------------------
# v43: Decision jobs (survive Render redeploys)
# ---------------------------------------------------------------------------


def put_decision_job(job_id: str, user_id: str, payload_json: str) -> None:
    """Upsert a job's current state to SQLite. Called whenever _jobs[id]
    changes — status, progress, result. Idempotent."""
    c = _get_conn()
    c.execute(
        "INSERT INTO decision_jobs (job_id, user_id, payload, updated_at) VALUES (?, ?, ?, ?) "
        "ON CONFLICT(job_id) DO UPDATE SET user_id=excluded.user_id, "
        "payload=excluded.payload, updated_at=excluded.updated_at",
        (job_id, user_id, payload_json, time.time()),
    )


def get_decision_job(job_id: str) -> tuple[str, str] | None:
    """Returns (user_id, payload_json) or None if not found."""
    c = _get_conn()
    cur = c.execute("SELECT user_id, payload FROM decision_jobs WHERE job_id = ?", (job_id,))
    row = cur.fetchone()
    return (row[0], row[1]) if row else None


def list_recent_decision_jobs(limit: int = 500) -> list[tuple[str, str, float]]:
    """v54: list recent decision-job rows for /v1/track-record/live aggregation.

    Returns (job_id, payload_json, updated_at) tuples, newest first.
    Capped at `limit` to keep the aggregation cheap. We don't filter by
    user — this is for global anonymous track-record stats. Filters
    happen downstream (only count rows where status='done', etc.).
    """
    c = _get_conn()
    cur = c.execute(
        "SELECT job_id, payload, updated_at FROM decision_jobs "
        "ORDER BY updated_at DESC LIMIT ?",
        (limit,),
    )
    return [(r[0], r[1], r[2]) for r in cur.fetchall()]


# ---------------------------------------------------------------------------
# Paid tiers (Stripe webhook target)
# ---------------------------------------------------------------------------


def set_user_tier(
    email: str,
    tier: str,
    stripe_customer_id: str | None = None,
    stripe_subscription_id: str | None = None,
) -> None:
    """Upsert the paid-tier record for `email`."""
    c = _get_conn()
    c.execute(
        """INSERT INTO user_tiers (email, tier, stripe_customer_id, stripe_subscription_id, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(email) DO UPDATE SET
             tier = excluded.tier,
             stripe_customer_id = COALESCE(excluded.stripe_customer_id, user_tiers.stripe_customer_id),
             stripe_subscription_id = COALESCE(excluded.stripe_subscription_id, user_tiers.stripe_subscription_id),
             updated_at = excluded.updated_at""",
        (email, tier, stripe_customer_id, stripe_subscription_id, time.time()),
    )


def get_user_tier(email: str) -> str:
    """Return 'free' / 'pro' / 'team'. Defaults to 'free' for unknown."""
    c = _get_conn()
    cur = c.execute("SELECT tier FROM user_tiers WHERE email = ?", (email,))
    row = cur.fetchone()
    return row[0] if row else "free"


# ---------------------------------------------------------------------------
# Daily AI briefs (LLM-generated morning commentary)
# ---------------------------------------------------------------------------


def save_daily_brief(
    date_str: str,
    title: str,
    body_md: str,
    locale: str = "en",
    model: str | None = None,
) -> None:
    """Upsert today's brief. `date_str` is YYYY-MM-DD; primary key.
    Re-running the cron for the same day overwrites — useful for fixing typos."""
    c = _get_conn()
    c.execute(
        """INSERT INTO daily_briefs
           (date_str, title, body_md, locale, generated_at, model)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(date_str) DO UPDATE SET
             title=excluded.title, body_md=excluded.body_md,
             locale=excluded.locale, generated_at=excluded.generated_at,
             model=excluded.model""",
        (date_str, title, body_md, locale, time.time(), model),
    )


def get_daily_brief(date_str: str) -> dict | None:
    """Return the brief for a given YYYY-MM-DD, or None."""
    c = _get_conn()
    cur = c.execute(
        "SELECT date_str, title, body_md, locale, generated_at, model "
        "FROM daily_briefs WHERE date_str = ?",
        (date_str,),
    )
    row = cur.fetchone()
    if not row:
        return None
    return {
        "date":        row[0],
        "title":       row[1],
        "body_md":     row[2],
        "locale":      row[3],
        "generated_at": float(row[4]),
        "model":       row[5],
    }


def list_daily_briefs(limit: int = 30) -> list[dict]:
    """Most-recent-first list of briefs for blog indexing.

    Body is omitted to keep responses light — the index only needs
    title + date + locale. Fetch individual bodies via get_daily_brief().
    """
    c = _get_conn()
    cur = c.execute(
        "SELECT date_str, title, locale, generated_at "
        "FROM daily_briefs ORDER BY date_str DESC LIMIT ?",
        (limit,),
    )
    return [
        {"date": r[0], "title": r[1], "locale": r[2], "generated_at": float(r[3])}
        for r in cur
    ]


# ---------------------------------------------------------------------------
# Analyst cache (ticker × date shared across users)
# ---------------------------------------------------------------------------
# Roadmap Phase 3: "ticker 级共享缓存能直接把成本压一个数量级".
# Same ticker on the same date should produce the same analyst report no
# matter which user asked, so we share. User-specific stuff (position size,
# risk preference) is NOT cached here — caller is responsible for personalising
# the cached output before showing it.


def cache_get(cache_key: str) -> dict | None:
    """Return cached output_json (parsed) if still fresh, else None."""
    c = _get_conn()
    cur = c.execute(
        "SELECT output_json, cached_at, ttl_seconds, model, cost_usd "
        "FROM analyst_cache WHERE cache_key = ?",
        (cache_key,),
    )
    row = cur.fetchone()
    if not row:
        return None
    output_json, cached_at, ttl_seconds, model, cost_usd = row
    if time.time() - float(cached_at) > int(ttl_seconds):
        # Expired — opportunistically delete
        c.execute("DELETE FROM analyst_cache WHERE cache_key = ?", (cache_key,))
        return None
    import json
    try:
        out = json.loads(output_json)
    except Exception:
        return None
    return {
        "output": out,
        "model": model,
        "cost_usd": cost_usd,
        "cached_at": float(cached_at),
    }


def cache_put(
    cache_key: str,
    output: Any,
    ttl_seconds: int,
    model: str | None = None,
    cost_usd: float | None = None,
) -> None:
    import json
    c = _get_conn()
    c.execute(
        "INSERT INTO analyst_cache "
        "(cache_key, output_json, model, cost_usd, cached_at, ttl_seconds) "
        "VALUES (?, ?, ?, ?, ?, ?) "
        "ON CONFLICT(cache_key) DO UPDATE SET "
        "output_json=excluded.output_json, model=excluded.model, "
        "cost_usd=excluded.cost_usd, cached_at=excluded.cached_at, "
        "ttl_seconds=excluded.ttl_seconds",
        (cache_key, json.dumps(output, default=str), model, cost_usd, time.time(), int(ttl_seconds)),
    )


def cache_stats() -> dict:
    c = _get_conn()
    total = c.execute("SELECT COUNT(*) FROM analyst_cache").fetchone()[0]
    fresh = c.execute(
        "SELECT COUNT(*) FROM analyst_cache WHERE cached_at + ttl_seconds > ?",
        (time.time(),),
    ).fetchone()[0]
    return {"total_rows": total, "fresh_rows": fresh}


def cache_purge_expired() -> int:
    c = _get_conn()
    cur = c.execute(
        "DELETE FROM analyst_cache WHERE cached_at + ttl_seconds < ?",
        (time.time(),),
    )
    return cur.rowcount or 0


# ---------------------------------------------------------------------------
# Multi-seed evaluation
# ---------------------------------------------------------------------------


def save_seed_run(
    ticker: str,
    decision_date: str,
    seed: int,
    action: str,
    confidence: float,
) -> None:
    c = _get_conn()
    c.execute(
        "INSERT INTO seed_runs "
        "(ticker, decision_date, seed, action, confidence, generated_at) "
        "VALUES (?, ?, ?, ?, ?, ?) "
        "ON CONFLICT(ticker, decision_date, seed) DO UPDATE SET "
        "action=excluded.action, confidence=excluded.confidence, "
        "generated_at=excluded.generated_at",
        (ticker, decision_date, int(seed), action, float(confidence), time.time()),
    )


def get_seed_distribution(ticker: str, decision_date: str) -> dict:
    """Aggregate N seeds → {p_buy, p_hold, p_sell, mean_conf, n}."""
    c = _get_conn()
    cur = c.execute(
        "SELECT action, confidence FROM seed_runs "
        "WHERE ticker = ? AND decision_date = ?",
        (ticker, decision_date),
    )
    rows = list(cur)
    if not rows:
        return {"n": 0, "p_buy": 0.0, "p_hold": 0.0, "p_sell": 0.0, "mean_conf": 0.0}
    n = len(rows)
    actions = [r[0] for r in rows]
    confs = [float(r[1]) for r in rows]
    return {
        "n": n,
        "p_buy":  actions.count("BUY") / n,
        "p_hold": actions.count("HOLD") / n,
        "p_sell": actions.count("SELL") / n,
        "mean_conf": sum(confs) / n,
    }


# ---------------------------------------------------------------------------
# Ticker metadata (24h cache around upstream lookups)
# ---------------------------------------------------------------------------


_TICKER_META_TTL_SEC = 24 * 3600


def get_ticker_meta(ticker: str) -> dict | None:
    c = _get_conn()
    cur = c.execute(
        "SELECT ticker, market, name, sector, industry, market_cap, currency, "
        "       listing_date, source, fetched_at "
        "FROM ticker_meta WHERE ticker = ?",
        (ticker,),
    )
    row = cur.fetchone()
    if not row:
        return None
    fetched_at = float(row[9])
    if time.time() - fetched_at > _TICKER_META_TTL_SEC:
        # Stale — return None so caller re-fetches. We don't auto-delete:
        # if upstream is down, the stale row is better than a 500.
        return None
    return {
        "ticker": row[0], "market": row[1], "name": row[2],
        "sector": row[3], "industry": row[4],
        "market_cap": row[5], "currency": row[6],
        "listing_date": row[7], "source": row[8],
        "fetched_at": fetched_at,
    }


def get_ticker_meta_stale_ok(ticker: str) -> dict | None:
    """Return cached row even if TTL expired — used as last-resort
    fallback when upstream is unreachable and we want a possibly-stale
    name rather than 'unknown'."""
    c = _get_conn()
    cur = c.execute(
        "SELECT ticker, market, name, sector, industry, market_cap, currency, "
        "       listing_date, source, fetched_at "
        "FROM ticker_meta WHERE ticker = ?",
        (ticker,),
    )
    row = cur.fetchone()
    if not row:
        return None
    return {
        "ticker": row[0], "market": row[1], "name": row[2],
        "sector": row[3], "industry": row[4],
        "market_cap": row[5], "currency": row[6],
        "listing_date": row[7], "source": row[8],
        "fetched_at": float(row[9]),
    }


def save_ticker_meta(
    ticker: str,
    market: str,
    name: str | None,
    sector: str | None = None,
    industry: str | None = None,
    market_cap: float | None = None,
    currency: str | None = None,
    listing_date: str | None = None,
    source: str = "unknown",
) -> None:
    c = _get_conn()
    c.execute(
        "INSERT INTO ticker_meta "
        "(ticker, market, name, sector, industry, market_cap, currency, "
        " listing_date, source, fetched_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
        "ON CONFLICT(ticker) DO UPDATE SET "
        "market=excluded.market, name=excluded.name, sector=excluded.sector, "
        "industry=excluded.industry, market_cap=excluded.market_cap, "
        "currency=excluded.currency, listing_date=excluded.listing_date, "
        "source=excluded.source, fetched_at=excluded.fetched_at",
        (ticker, market, name, sector, industry, market_cap,
         currency, listing_date, source, time.time()),
    )


# ---------------------------------------------------------------------------
# Diagnostics
# ---------------------------------------------------------------------------


def stats() -> dict[str, Any]:
    """Counts for /v1/health debugging."""
    c = _get_conn()
    return {
        "known_users":      c.execute("SELECT COUNT(*) FROM known_users").fetchone()[0],
        "referrals":        c.execute("SELECT COUNT(*) FROM referrals").fetchone()[0],
        "active_bonuses":   c.execute(
            "SELECT COUNT(*) FROM referral_bonus WHERE expires_at > ?",
            (time.time(),),
        ).fetchone()[0],
        "magic_tokens":     c.execute("SELECT COUNT(*) FROM magic_tokens").fetchone()[0],
        "shared_decisions": c.execute("SELECT COUNT(*) FROM shared_decisions").fetchone()[0],
        "paid_users":       c.execute(
            "SELECT COUNT(*) FROM user_tiers WHERE tier IN ('pro', 'team')",
        ).fetchone()[0],
        "daily_briefs":     c.execute("SELECT COUNT(*) FROM daily_briefs").fetchone()[0],
        "analyst_cache":    c.execute("SELECT COUNT(*) FROM analyst_cache").fetchone()[0],
        "seed_runs":        c.execute("SELECT COUNT(*) FROM seed_runs").fetchone()[0],
        "backend":          db.backend_name(),
    }
