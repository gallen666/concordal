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
import os
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)


def _db_path() -> Path:
    base = Path(os.environ.get("TA_DATA_DIR", "/app/.tradingagents"))
    base.mkdir(parents=True, exist_ok=True)
    return base / "platform.db"


_lock = threading.Lock()
_conn: sqlite3.Connection | None = None


def _get_conn() -> sqlite3.Connection:
    """Open the SQLite file lazily. WAL mode allows concurrent reads
    while a single writer is active — important for FastAPI's threadpool."""
    global _conn
    if _conn is not None:
        return _conn
    with _lock:
        if _conn is not None:
            return _conn
        path = _db_path()
        conn = sqlite3.connect(str(path), check_same_thread=False, isolation_level=None)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA busy_timeout=5000")
        _init_schema(conn)
        _conn = conn
        log.info("SQLite persistence initialised at %s", path)
        return conn


def _init_schema(conn: sqlite3.Connection) -> None:
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

        CREATE TABLE IF NOT EXISTS user_tiers (
            email TEXT PRIMARY KEY,
            tier TEXT NOT NULL,
            stripe_customer_id TEXT,
            stripe_subscription_id TEXT,
            updated_at REAL NOT NULL
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
        "INSERT OR IGNORE INTO known_users (email, first_seen) VALUES (?, ?)",
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
    except sqlite3.IntegrityError:
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
        """INSERT INTO referral_bonus (email, expires_at) VALUES (?, ?)
           ON CONFLICT(email) DO UPDATE SET expires_at = MAX(expires_at, excluded.expires_at)""",
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
        "INSERT OR REPLACE INTO magic_tokens (token, email, expires_at) VALUES (?, ?, ?)",
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
        "INSERT OR REPLACE INTO shared_decisions (share_id, payload, shared_at) VALUES (?, ?, ?)",
        (share_id, payload_json, time.time()),
    )


def get_shared_decision(share_id: str) -> str | None:
    c = _get_conn()
    cur = c.execute("SELECT payload FROM shared_decisions WHERE share_id = ?", (share_id,))
    row = cur.fetchone()
    return row[0] if row else None


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
        "db_path":          str(_db_path()),
    }
