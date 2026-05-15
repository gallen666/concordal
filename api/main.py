"""FastAPI app for the TradingAgents platform - production wiring.

Security posture:
    - Closed beta: invite codes -> JWT (TA_REQUIRE_INVITE=true).
    - Per-user rate limit (in-memory; switch to Redis for multi-replica).
    - CORS locked to TA_ALLOWED_ORIGINS.
    - EMERGENCY_STOP_DECISIONS flag turns off /v1/decisions instantly.

Compliance: every response is `decision_support`, never `investment_advice`.
"""

from __future__ import annotations

import logging
import os
import re
import time
import uuid
from collections import defaultdict, deque
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    HTTPException,
    Request,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from trading_agents.adapters import get_adapter
from trading_agents.backtest.engine import Backtester
from trading_agents.cache.ticker_cache import TickerCache
from trading_agents.core.graph import run_decision
from trading_agents.llm import observability as _obs
from trading_agents.ecosystem.data_bus import bus as data_bus
from trading_agents.ecosystem.registry import to_json as ecosystem_json, stats as ecosystem_stats
# Side-effect import: ecosystem.sources auto-registers every available
# adapter as a UniversalDataBus Source. Without this import the bus is
# empty except for the OpenBB→MACRO entry it self-registers.
from trading_agents import ecosystem as _ecosystem_pkg  # noqa: F401
from trading_agents.memory.reflection import collect_lessons
from trading_agents.memory.store import MemoryStore

from .auth import (
    CurrentUser,
    MagicLinkSendRequest,
    MagicLinkVerifyRequest,
    RedeemRequest,
    TokenResponse,
    get_current_user,
    get_optional_user,
    magic_link_send,
    magic_link_verify,
    redeem,
)
from .config import cfg
from .openbb_widget import router as openbb_router
from .waitlist import router as waitlist_router


# --- logging ---------------------------------------------------------------

logging.basicConfig(
    level=cfg.log_level,
    format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
)
log = logging.getLogger("ta.api")


# --- optional Sentry init -------------------------------------------------


def _maybe_init_sentry() -> None:
    if not cfg.sentry_dsn:
        return
    try:
        import sentry_sdk
        sentry_sdk.init(dsn=cfg.sentry_dsn, environment=cfg.env, traces_sample_rate=0.1)
        log.info("Sentry enabled (env=%s)", cfg.env)
    except ImportError:
        log.warning("SENTRY_DSN set but sentry-sdk not installed")


_maybe_init_sentry()


# --- app -----------------------------------------------------------------

app = FastAPI(
    title="TradingAgents Platform API",
    version="0.2.0",
    description=(
        "**Multi-agent LLM decision-support API.**\n\n"
        "Five-analyst pipeline (fundamentals + sentiment + news + technical + macro) "
        "running over real public data: SEC EDGAR (point-in-time fundamentals), "
        "Reddit + 东方财富股吧 (retail sentiment), OpenBB / FRED (macro), CCXT "
        "(crypto), akshare (A-share). Every decision is independently cross-validated "
        "against the Backtrader broker simulator.\n\n"
        "**Auth:** Bearer JWT issued via `POST /v1/auth/redeem`. Anonymous calls to "
        "decision endpoints are allowed but rate-limited to 2/day.\n\n"
        "**Pricing:** Free 5/day · Pro $29/mo (~30/day, real LLM) · API/Team $99+. "
        "See [/pricing](https://trading-agents-platform.vercel.app/pricing).\n\n"
        "**⚠️ Decision support, not investment advice.** Outputs are not personalised "
        "and do not constitute a recommendation under any securities law."
    ),
    contact={
        "name": "TradingAgents",
        "url": "https://github.com/gallen666/trading-agents-platform",
    },
    license_info={
        "name": "Apache 2.0",
        "url": "https://www.apache.org/licenses/LICENSE-2.0",
    },
    servers=[
        {"url": "https://trading-agents-platform.onrender.com", "description": "Production"},
        {"url": "http://localhost:8000", "description": "Local dev"},
    ],
    openapi_tags=[
        {"name": "decisions", "description": "Run a 5-analyst decision pipeline on a ticker."},
        {"name": "backtests", "description": "Replay strategies on history with optional Backtrader cross-validation."},
        {"name": "auth", "description": "Invite-code redemption for JWT bearer tokens."},
        {"name": "openbb-workspace", "description": "OpenBB Workspace custom widgets."},
        {"name": "ecosystem", "description": "Catalog of integrated OSS projects."},
    ],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cfg.allowed_origins,
    # Match OpenBB Workspace origins so /openbb/* widgets work cross-domain.
    # Covers the hosted Workspace (pro.openbb.co, workspace.openbb.co), any
    # *.openbb.co subdomain, and the local-dev Tauri shell on localhost.
    allow_origin_regex=r"^https?://(localhost(:\d+)?|127\.0\.0\.1(:\d+)?|([a-z0-9-]+\.)*openbb\.co)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(waitlist_router)
app.include_router(openbb_router)

cache = TickerCache()
memory = MemoryStore()


# --- in-memory job + rate-limit (swap to Redis when multi-replica) -------

_jobs: dict[str, dict[str, Any]] = {}

# Shared decisions are now persisted to SQLite — see api/persistence.py.
# The `_SHARE_LIMIT` is no longer enforced at write-time (DB handles
# storage), but kept as a soft target for future cleanup jobs.
_SHARE_LIMIT = 5_000
_watchlists: dict[str, list[dict]] = {}

# user -> deque of recent timestamps
_rl_window: dict[str, deque[float]] = defaultdict(deque)


def _rate_limit(user_id: str) -> None:
    now = time.time()
    q = _rl_window[user_id]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= cfg.rate_limit_per_min:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Rate limit: {cfg.rate_limit_per_min}/min",
        )
    q.append(now)


# --- daily-cap (per-user) for the free tier ---------------------------------
# Tracks decision counts per user per UTC-day so we can hard-stop free users
# at their daily quota and serve them a 402 with an upgrade URL. Pro users
# (real_llm=True) skip the cap entirely.
#
# GLOBAL TOGGLE: while the system is in beta debugging, the cap is NOT
# enforced — every user gets effectively unlimited decisions. The check
# code below is preserved so that when the product is ready to monetize,
# flipping TA_DECISIONS_ENFORCE_CAP=true on Render re-enables the gate.
_CAP_ENFORCED = os.environ.get("TA_DECISIONS_ENFORCE_CAP", "false").lower() == "true"
_FREE_DAILY_CAP = int(os.environ.get("TA_FREE_DAILY_DECISIONS", "5"))
# Anonymous (no JWT) gets a smaller cap because they share an IP-derived key
# in some deployments and we don't want to gift unauth'd quota.
_ANON_DAILY_CAP = int(os.environ.get("TA_ANON_DAILY_DECISIONS", "2"))
_daily_count: dict[tuple[str, str], int] = {}  # (user_id, "YYYY-MM-DD") -> count


_PRO_DAILY_CAP = int(os.environ.get("TA_PRO_DAILY_DECISIONS", "30"))

# --- Referral program ----------------------------------------------------
# Each user has a deterministic 8-char referral code derived from their
# email. When a new user signs up via /login?ref=XXXX:
#   1. The new user gets +5 bonus decisions/day for 7 days
#   2. The referring user (whose code matches) gets the same bonus
#
# State lives in memory; on production swap to Postgres / Redis. Format:
#   _referrals[referee_email] = referrer_email
#   _referral_bonus[email] = expires_at_epoch_seconds
import hashlib
from . import persistence  # SQLite-backed user state — survives redeploys
_REFERRAL_BONUS_DAYS = int(os.environ.get("TA_REFERRAL_BONUS_DAYS", "7"))
_REFERRAL_BONUS_DECISIONS = int(os.environ.get("TA_REFERRAL_BONUS_DECISIONS", "5"))


def _referral_code(email: str) -> str:
    """Deterministic 8-char code per email. Same email → same code,
    so a user can share a stable link without us minting state."""
    h = hashlib.sha256(email.encode("utf-8")).hexdigest()
    return h[:8]


def _email_for_code(code: str) -> str | None:
    """Reverse lookup: which email's referral_code is this? Brute force
    over the SQLite known_users table (cheap for <10k users; swap to a
    materialised reverse index when that becomes a hot path)."""
    for e in persistence.all_known_emails():
        if _referral_code(e) == code:
            return e
    return None


def _grant_referral_bonus(email: str) -> None:
    """Stack the 7-day bonus onto a user. Idempotent: multiple wins
    just extend the expiry (SQLite takes MAX), they don't compound
    the per-day quota."""
    persistence.grant_bonus(email, _REFERRAL_BONUS_DAYS * 86400)


def _bonus_cap_for(email: str) -> int:
    """How many extra decisions/day the bonus contributes for `email`
    right now. 0 once the bonus has expired."""
    exp = persistence.bonus_expires_at(email)
    if exp > time.time():
        return _REFERRAL_BONUS_DECISIONS
    return 0


def _bucket_key(user: CurrentUser, request: Request | None) -> tuple[str, str]:
    """Resolve the (identifier, day) bucket used for daily-cap accounting.

    For authenticated users we key on email (user.id). For anonymous
    callers we MUST key on IP — otherwise every anonymous request shares
    one global bucket and the first 2 visitors lock out everybody else.

    When `request` is None (e.g. cron / internal calls) we fall back to
    user.id so callers without HTTP context still work.
    """
    today = datetime.utcnow().strftime("%Y-%m-%d")
    if user.id == "anonymous" and request is not None:
        # X-Forwarded-For first (Render + Vercel both set it), else
        # the direct client IP. Take the first hop only — downstream
        # hops are spoofable.
        fwd = request.headers.get("x-forwarded-for", "")
        ip = fwd.split(",")[0].strip() if fwd else (
            request.client.host if request.client else "unknown"
        )
        return (f"anon:{ip}", today)
    return (user.id, today)


_TEAM_DAILY_CAP = int(os.environ.get("TA_TEAM_DAILY_DECISIONS", "100"))


def _base_cap_and_tier(user: CurrentUser) -> tuple[int, str]:
    if user.id == "anonymous":
        return _ANON_DAILY_CAP, "anon"
    # Look up persisted paid tier. Stripe webhook writes here on successful
    # checkout; the email then unlocks the matching cap. Free users (no
    # row in user_tiers) default to free's cap.
    persisted_tier = persistence.get_user_tier(user.id)
    if persisted_tier == "team":
        return _TEAM_DAILY_CAP, "team"
    if persisted_tier == "pro":
        return _PRO_DAILY_CAP, "pro"
    return _FREE_DAILY_CAP, "free"


def _daily_cap_check(user: CurrentUser, request: Request | None = None) -> None:
    """Enforce daily decision cap. Raises 402 with upgrade hint on overflow.

    Tier mapping (base, before referral bonus):
      anon          → 2 / day per IP   (TA_ANON_DAILY_DECISIONS)
      free          → 5 / day per user (TA_FREE_DAILY_DECISIONS)
      pro / team    → 30+/day per user (TA_PRO_DAILY_DECISIONS)
    A 7-day referral bonus adds +5/day on top for both inviter + invitee.
    """
    # Beta override — paid tiers not yet activated, so cap is a no-op.
    # Flip TA_DECISIONS_ENFORCE_CAP=true on Render to re-enable.
    if not _CAP_ENFORCED:
        return
    today_key = _bucket_key(user, request)
    base, tier = _base_cap_and_tier(user)
    bonus = _bonus_cap_for(user.id) if user.id != "anonymous" else 0
    cap = base + bonus
    used = _daily_count.get(today_key, 0)
    if used >= cap:
        raise HTTPException(
            status_code=402,
            detail={
                "error": "daily_cap_exceeded",
                "message": (
                    f"You've used your daily {cap} decisions on the {tier} tier. "
                    "Upgrade to Pro for ~30/day, or come back tomorrow."
                ),
                "used": used,
                "cap": cap,
                "base_cap": base,
                "bonus_cap": bonus,
                "tier": tier,
                "upgrade_url": "/pricing#pro",
            },
        )
    _daily_count[today_key] = used + 1


def _daily_cap_status(user: CurrentUser, request: Request | None = None) -> dict:
    """Read-only view used by the frontend's usage badge.

    When the global cap is disabled (beta debugging mode), `enforced=False`
    is returned so the frontend can hide the "X / N free decisions" badge
    and the upgrade-Pro nudge — there's no cap to display.
    """
    today_key = _bucket_key(user, request)
    base, tier = _base_cap_and_tier(user)
    bonus = _bonus_cap_for(user.id) if user.id != "anonymous" else 0
    used = _daily_count.get(today_key, 0)
    return {
        "used": used,
        "cap": (base + bonus) if _CAP_ENFORCED else None,
        "base_cap": base,
        "bonus_cap": bonus,
        "tier": tier,
        "enforced": _CAP_ENFORCED,
    }


# --- request models ------------------------------------------------------


class DecisionRequest(BaseModel):
    ticker: str
    asof: date | None = None
    market: str = "us_equity"
    debate_rounds: int = 2
    user_risk_profile: str = "balanced"
    use_cache: bool = True
    # "en" or "zh". When "zh" the LLM returns free-text fields (analyst
    # body, debate, rationale, risk notes) in Simplified Chinese. The
    # cache key includes locale so en/zh runs don't collide.
    locale: str = "en"


class JobResponse(BaseModel):
    job_id: str
    status: str


class WatchlistItem(BaseModel):
    ticker: str
    market: str = "us_equity"
    note: str | None = None


class BacktestRequest(BaseModel):
    ticker: str
    days: int = 120
    rebalance_every_days: int = 5
    market: str = "us_equity"
    baselines_only: bool = True   # default: don't burn LLM for backtests in beta
    # When True, replay each strategy's equity curve through Backtrader
    # and include a `cross_validation` payload in the response so the UI
    # can show side-by-side metrics. Free bug detector for our own engine.
    cross_validate: bool = False


# --- background runners --------------------------------------------------


# Ticker syntactic checks per market.
#  - US equities: 1–5 letter codes with optional class suffix (AAPL, BRK-B, BF.B)
#  - A-shares  : 6 digits (301308, 600519, 000001) — akshare picks SH/SZ/BJ
#  - Crypto   : "BTC", "ETH", or pair "BTC/USDT" — distinguishable by /
_US_TICKER_RE = re.compile(r"^[A-Z][A-Z0-9.\-]{0,8}$")
_CN_TICKER_RE = re.compile(r"^\d{6}$")
# Common crypto tickers we auto-route to the CCXT adapter even when the
# frontend sent market="us_equity". Keep this list narrow — anything not
# in here, the user can still hit by selecting market="crypto" explicitly.
_CRYPTO_TICKERS = {
    "BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE", "DOT",
    "AVAX", "MATIC", "LINK", "TRX", "LTC", "TON", "SHIB",
    "BCH", "ATOM", "NEAR", "ETC", "XLM", "APT", "ARB", "OP",
}


def _is_supported_us_ticker(ticker: str) -> bool:
    s = (ticker or "").upper().strip()
    if not _US_TICKER_RE.fullmatch(s):
        return False
    return any(c.isalpha() for c in s)


def _is_supported_cn_ticker(ticker: str) -> bool:
    return bool(_CN_TICKER_RE.fullmatch((ticker or "").strip()))


def _is_crypto_ticker(ticker: str) -> bool:
    s = (ticker or "").upper().strip()
    if "/" in s:
        return True  # explicit pair like "BTC/USDT"
    return s in _CRYPTO_TICKERS


def _auto_route_market(ticker: str, market: str) -> str:
    """Auto-detect market from ticker shape so the user doesn't need a
    market picker for the common cases:
      - 6-digit numeric → A-share
      - known crypto symbol or contains "/" → crypto
      - everything else → leave as-is (defaults to us_equity from the form)
    """
    if _is_supported_cn_ticker(ticker):
        return "a_share"
    if _is_crypto_ticker(ticker):
        return "crypto"
    return market


def _run_decision_job(job_id: str, req: DecisionRequest, user: CurrentUser) -> None:
    try:
        # Auto-detect market from ticker shape so 6-digit codes route to A-share
        # without requiring the frontend to expose a market picker.
        effective_market = _auto_route_market(req.ticker, req.market)
        # Mutate the request so downstream cache key + run_decision use it.
        req = req.model_copy(update={"market": effective_market})

        # Pre-flight: block obvious mismatches (e.g. user typed Chinese
        # characters or a 7-digit number that matches no convention).
        if effective_market == "us_equity" and not _is_supported_us_ticker(req.ticker):
            _jobs[job_id]["status"] = "error"
            _jobs[job_id]["error"] = (
                f"代码 '{req.ticker}' 看起来既不是美股（如 AAPL、NVDA）也不是 A 股（6 位数字，如 301308、600519）。"
                f" / Ticker '{req.ticker}' doesn't look like a US equity (e.g. AAPL) "
                "or an A-share (6 digits, e.g. 301308). Other markets aren't supported in this beta."
            )
            return
        if effective_market == "a_share" and not _is_supported_cn_ticker(req.ticker):
            _jobs[job_id]["status"] = "error"
            _jobs[job_id]["error"] = (
                f"A 股代码必须是 6 位数字，例如 301308、600519、000001。 / "
                f"A-share tickers must be exactly 6 digits."
            )
            return

        asof = req.asof or date.today()

        # Cache key incorporates locale so an English run doesn't get served
        # to a Chinese-locale request and vice versa. Cheap and avoids a
        # confusing mid-language flip in the UI.
        cache_market = f"{req.market}:{req.locale}" if req.locale != "en" else req.market
        if req.use_cache:
            cached = cache.get(req.ticker.upper(), asof, cache_market)
            if cached:
                _jobs[job_id]["status"] = "done"
                _jobs[job_id]["result"] = cached.model_dump(mode="json")
                _jobs[job_id]["mode"] = "cached"
                return

        # Real-only mode: TA_MODE was previously forced to "mock" for any
        # user not on the real_llm_user_ids allowlist. We've removed that
        # gating — every user (including anonymous) gets the real LLM
        # pipeline. Quota protection comes from `_daily_cap_check` and the
        # provider-fallback chain, not from mock-tier downgrade.
        prev_mode = os.environ.get("TA_MODE")
        try:
            # Reflection loop (a la TauricResearch v0.2.4 persistent log):
            # pull this user's prior decisions on the same ticker, enrich
            # with realised PnL, and inject as "institutional memory" into
            # the Manager prompt. Empty when there's no usable history.
            lessons = ""
            try:
                lessons = collect_lessons(
                    ticker=req.ticker.upper(),
                    user_id=user.id,
                    today=asof,
                    memory=memory,
                    adapter=get_adapter(req.market),
                    locale=req.locale,
                )
                if lessons:
                    log.info(
                        "Injecting %d-char reflection into manager for %s/%s",
                        len(lessons), user.id, req.ticker,
                    )
            except Exception as e:
                log.warning("collect_lessons failed (non-fatal): %s", e)

            # Live progress: each agent reports start/done so the UI can
            # render "正在分析新闻..." instead of a single 90s spinner.
            # Stored on the job dict, polled by GET /v1/decisions/job/{id}.
            _jobs[job_id]["progress"] = {
                "current_stage": None,
                "completed": [],
                "errored": [],
                "history": [],   # [{stage, status, ts}]
            }

            def _progress_cb(stage: str, status: str) -> None:
                p = _jobs[job_id].get("progress") or {
                    "current_stage": None, "completed": [], "errored": [], "history": [],
                }
                p["history"].append({
                    "stage": stage,
                    "status": status,
                    "ts": time.time(),
                })
                if status == "start":
                    p["current_stage"] = stage
                elif status == "done":
                    if stage not in p["completed"]:
                        p["completed"].append(stage)
                    p["current_stage"] = None
                elif status == "error":
                    if stage not in p["errored"]:
                        p["errored"].append(stage)
                    p["current_stage"] = None
                _jobs[job_id]["progress"] = p

            # Wrap the entire 7-agent pipeline in one Langfuse trace so the
            # observability UI shows: decision → [quote, fundamentals, sentiment,
            # news, technical, macro, researcher.debate.bull.r1, ...,
            # trader, risk.debate, manager.complete] as a navigable tree.
            with _obs.pipeline(
                "decision",
                job_id=job_id,
                ticker=req.ticker.upper(),
                asof=str(asof),
                market=req.market,
                user=user.id,
                tier=user.tier,
            ):
                trace = run_decision(
                    ticker=req.ticker.upper(),
                    asof=asof,
                    market=req.market,
                    debate_rounds=req.debate_rounds,
                    user_risk_profile=req.user_risk_profile,
                    locale=req.locale,
                    lessons=lessons,
                    progress_cb=_progress_cb,
                )
        finally:
            if prev_mode is None:
                os.environ.pop("TA_MODE", None)
            else:
                os.environ["TA_MODE"] = prev_mode

        cache.put(trace, cache_market)
        # Surface "did we inject reflection memory?" so the frontend can
        # show the user that the system used their history. Without this,
        # the reflection loop is invisible.
        _jobs[job_id]["lessons_injected"] = bool(lessons)
        _jobs[job_id]["lessons_chars"] = len(lessons) if lessons else 0
        # Snapshot the close at decision time so forward return can be
        # computed later (e.g. on the user's history page) without
        # re-fetching adjusted prices.
        decision_close = None
        try:
            quote = trace.model_dump(mode="json").get("quote") or {}
            decision_close = quote.get("close")
        except Exception:
            pass
        memory.append_decision(
            trace.decision,
            user_id=user.id,
            decision_close=decision_close,
            market=effective_market,
        )
        _jobs[job_id]["status"] = "done"
        _jobs[job_id]["result"] = trace.model_dump(mode="json")
        _jobs[job_id]["mode"] = "real_llm" if user.real_llm else "mock"
    except Exception as e:
        log.exception("decision job failed")
        _jobs[job_id]["status"] = "error"
        _jobs[job_id]["error"] = str(e)


def _run_backtest_job(job_id: str, req: BacktestRequest, user: CurrentUser) -> None:
    try:
        adapter = get_adapter(req.market)
        # Use market-aware cost defaults so A-share stamp tax is modeled etc.
        bt = Backtester.for_market(adapter)
        end = date.today()
        start = end - timedelta(days=req.days)

        # Pull price history once so cross-validation can re-use it without
        # re-fetching (especially important for free yfinance / akshare quotas).
        quotes = adapter.get_price_history(req.ticker, start, end) if req.cross_validate else None

        rows = []
        for br in bt.run_all_baselines(req.ticker, start, end):
            row = {"name": br.name, "metrics": br.metrics.__dict__}
            # Cross-validate every baseline through Backtrader if requested.
            if req.cross_validate and quotes:
                try:
                    from trading_agents.backtest.backtrader_runner import cross_validate
                    cv = cross_validate(
                        ours=br, quotes=quotes, weights=br.weights,
                        commission_bps=bt.commission_bps,
                        slippage_bps=bt.slippage_bps,
                        sell_tax_bps=bt.sell_tax_bps,
                    )
                    if cv is not None:
                        row["cross_validation"] = {
                            "backtrader_metrics": cv.backtrader_metrics.__dict__,
                            "ann_return_diff_pct": cv.ann_return_diff_pct,
                            "sharpe_diff": cv.sharpe_diff,
                            "max_dd_diff_pct": cv.max_dd_diff_pct,
                            "flagged_disagreement": cv.flagged_disagreement,
                            "notes": cv.notes,
                        }
                except Exception as e:
                    log.warning("cross_validate failed for %s: %s", br.name, e)
            rows.append(row)

        # Agent-strategy backtest is expensive. Allow only for real_llm users.
        if not req.baselines_only and user.real_llm:
            def decide_fn(t: str, asof: date):
                return run_decision(
                    ticker=t, asof=asof, market=req.market, debate_rounds=1
                ).decision
            ag = bt.run_agent(
                req.ticker, start, end, decide_fn,
                rebalance_every_days=req.rebalance_every_days,
            )
            agent_row = {"name": ag.name, "metrics": ag.metrics.__dict__}
            if req.cross_validate and quotes:
                try:
                    from trading_agents.backtest.backtrader_runner import cross_validate
                    cv = cross_validate(
                        ours=ag, quotes=quotes, weights=ag.weights,
                        commission_bps=bt.commission_bps,
                        slippage_bps=bt.slippage_bps,
                        sell_tax_bps=bt.sell_tax_bps,
                    )
                    if cv is not None:
                        agent_row["cross_validation"] = {
                            "backtrader_metrics": cv.backtrader_metrics.__dict__,
                            "ann_return_diff_pct": cv.ann_return_diff_pct,
                            "sharpe_diff": cv.sharpe_diff,
                            "max_dd_diff_pct": cv.max_dd_diff_pct,
                            "flagged_disagreement": cv.flagged_disagreement,
                            "notes": cv.notes,
                        }
                except Exception as e:
                    log.warning("cross_validate (agent) failed: %s", e)
            rows.append(agent_row)

        _jobs[job_id]["status"] = "done"
        _jobs[job_id]["result"] = {"rows": rows, "start": str(start), "end": str(end)}
    except Exception as e:
        log.exception("backtest job failed")
        _jobs[job_id]["status"] = "error"
        _jobs[job_id]["error"] = str(e)


def _new_job(user: CurrentUser) -> str:
    jid = uuid.uuid4().hex[:16]
    _jobs[jid] = {
        "status": "queued",
        "result": None,
        "error": None,
        "user": user.id,
    }
    return jid


# --- routes -------------------------------------------------------------


@app.get("/v1/databus/status")
def databus_status() -> dict:
    """Show what Sources are currently registered on the UniversalDataBus.

    Each Need kind (QUOTE, OHLCV, FUNDAMENTALS, NEWS, SENTIMENT, TECHNICAL,
    MACRO, CRYPTO_OHLCV, FACTOR) maps to a priority-ranked list of project
    slugs that can fulfill it. When the user looks at this endpoint they
    can see — at a glance — which of the 10 ecosystem projects are
    actually wired into the data spine vs just listed on /ecosystem.

    Companion to /v1/observability/status: that one shows whether the
    LLM pipeline is being traced; this shows whether the data layer is
    being routed through the spine.
    """
    registered = data_bus.registered_sources()
    total_sources = sum(len(v) for v in registered.values())
    return {
        "spine_wired": total_sources > 1,  # >1 because OpenBB→MACRO is always there
        "total_sources": total_sources,
        "need_kinds_covered": len(registered),
        "sources_by_need": registered,
    }


@app.get("/v1/databus/telemetry")
def databus_telemetry(last_n: int = 50) -> dict:
    """Recent bus fetches with source + latency + cache hit.

    Useful for spotting: which source is hot/cold, what's hitting cache,
    where the slowest fetches live, and which Need kinds get zero traffic
    (suggesting analysts still bypass the bus)."""
    return {"records": data_bus.telemetry(last_n=last_n)}


@app.get("/v1/observability/status")
def observability_status() -> dict:
    """Surface whether Langfuse is wired so the user can confirm in one
    request whether their LLM pipeline is actually being traced.

    Used by `make verify-observability` and the upcoming /admin page.
    Safe to expose publicly — only reports flag-set booleans and the
    first 8 chars of the public key (already public by definition).
    """
    return _obs.status()


@app.on_event("shutdown")
def _observability_shutdown() -> None:
    """Flush any queued Langfuse events before the process exits.

    Without this, traces from the last few decisions in a worker's
    lifetime can be lost on Render's graceful-restart window."""
    try:
        _obs.shutdown()
    except Exception:
        pass


@app.get("/v1/health")
def health() -> dict:
    """Health + capability report.

    Lists every feature flag, env var, and integration status — so a
    user / SRE looking at the deployment can immediately see what's
    actually running vs silently disabled. No more "macro stage shows
    in UI but never fired because FRED_API_KEY isn't set."
    """
    # Feature availability checks — all best-effort, no exceptions raised.
    features: dict[str, dict] = {}

    # LLM provider
    has_gemini = bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))
    has_openai = bool(os.getenv("OPENAI_API_KEY"))
    has_anthropic = bool(os.getenv("ANTHROPIC_API_KEY"))
    has_deepseek = bool(os.getenv("DEEPSEEK_API_KEY"))
    has_qwen = bool(os.getenv("DASHSCOPE_API_KEY") or os.getenv("QWEN_API_KEY"))
    has_glm = bool(os.getenv("ZHIPU_API_KEY") or os.getenv("GLM_API_KEY"))
    has_any_llm = any((has_gemini, has_openai, has_anthropic, has_deepseek, has_qwen, has_glm))
    features["llm"] = {
        "ok": has_any_llm,
        "providers": {
            "gemini": has_gemini,
            "openai": has_openai,
            "anthropic": has_anthropic,
            "deepseek": has_deepseek,
            "qwen": has_qwen,
            "glm": has_glm,
        },
        "note": (
            ""
            if has_any_llm
            else "no LLM key set — decisions will fall back to mock provider on every call"
        ),
    }

    # Macro analyst
    has_fred = bool(os.getenv("FRED_API_KEY"))
    try:
        import openbb  # noqa: F401
        has_openbb = True
    except ImportError:
        has_openbb = False
    features["macro_analyst"] = {
        "ok": has_fred or has_openbb,
        "fred_api_key_set": has_fred,
        "openbb_sdk_installed": has_openbb,
        "note": (
            "" if (has_fred or has_openbb)
            else "macro stage will silently skip — set FRED_API_KEY to enable"
        ),
    }

    # Data adapters
    try:
        import yfinance  # noqa: F401
        has_yfinance = True
    except ImportError:
        has_yfinance = False
    try:
        import akshare  # noqa: F401
        has_akshare = True
    except ImportError:
        has_akshare = False
    features["adapters"] = {
        "yfinance": {"installed": has_yfinance},
        "akshare": {"installed": has_akshare},
        "ccxt": {"installed": _has_pkg("ccxt")},
        "note": (
            "" if (has_yfinance and has_akshare)
            else "missing optional adapters fall back to MockAdapter — users won't see this in UI"
        ),
    }

    # Persistence
    data_dir = os.getenv("TA_DATA_DIR", "/app/.tradingagents")
    features["persistence"] = {
        "data_dir": data_dir,
        "warning": (
            "ephemeral filesystem detected — decisions wiped on redeploy"
            if data_dir.startswith("/app") else ""
        ),
    }

    # Auth
    using_default_secret = (
        cfg.jwt_secret == "dev-secret-change-me"
    )
    features["auth"] = {
        "require_invite": cfg.require_invite_code,
        "real_llm_user_count": len(cfg.real_llm_user_ids),
        "warning": (
            "JWT_SECRET is the dev default — all signed tokens are insecure"
            if using_default_secret else ""
        ),
    }

    # Cron — weekly-digest endpoint is callable by anyone unless we have
    # a shared secret to gate it. Loud warning so operator notices.
    features["cron"] = {
        "weekly_digest_protected": bool(os.getenv("TA_CRON_SECRET")),
        "warning": (
            ""
            if os.getenv("TA_CRON_SECRET")
            else "TA_CRON_SECRET not set — /v1/cron/weekly-digest is open to the public"
        ),
    }

    # Stripe — webhook can't be processed without the signing secret.
    features["stripe"] = {
        "webhook_configured": bool(os.getenv("STRIPE_WEBHOOK_SECRET")),
        "upgrade_url_pro_configured": bool(os.getenv("TA_UPGRADE_URL_PRO")),
        "upgrade_url_team_configured": bool(os.getenv("TA_UPGRADE_URL_TEAM")),
        "note": (
            ""
            if os.getenv("STRIPE_WEBHOOK_SECRET")
            else "STRIPE_WEBHOOK_SECRET not set — paid-tier upgrades can't auto-activate"
        ),
    }

    # SQLite persistence — surface row counts so the operator can confirm
    # state survives redeploys.
    try:
        features["persistence_db"] = persistence.stats()
    except Exception as e:
        features["persistence_db"] = {"error": str(e)}

    # OpenBB widget
    features["openbb_widget"] = {"manifest": "/openbb/widgets.json"}

    # Aggregate readiness — anything with a non-empty "warning" fails.
    warnings = [
        f["warning"] for f in features.values() if f.get("warning")
    ] + [
        f["note"] for f in features.values() if f.get("note")
    ]
    return {
        "status": "ok" if not warnings else "degraded",
        "version": "0.1.0",
        "env": cfg.env,
        "mode": os.getenv("TA_MODE", "live"),
        "emergency_stop": cfg.emergency_stop_decisions,
        "features": features,
        "warnings": warnings,
        "disclaimer": "decision_support_only",
    }


def _has_pkg(name: str) -> bool:
    """Return True if `name` can be imported."""
    try:
        __import__(name)
        return True
    except ImportError:
        return False


@app.post("/v1/stripe/webhook", tags=["auth"])
async def stripe_webhook(request: Request) -> dict:
    """Receive Stripe webhook → flip the buyer's tier in SQLite.

    Setup (Stripe dashboard → Developers → Webhooks):
      1. Add endpoint `<your-render-url>/v1/stripe/webhook`
      2. Subscribe to `checkout.session.completed`,
         `customer.subscription.deleted`, and `customer.subscription.updated`
      3. Copy the Signing secret → set `STRIPE_WEBHOOK_SECRET` in Render env

    Without `STRIPE_WEBHOOK_SECRET` we reject every request — webhooks are
    untrusted by design and signature verification is non-negotiable.

    What we map:
      `metadata.tier` on the checkout session → `pro` | `team`
      The buyer's email (from `customer_details.email`) becomes the
      key in our `user_tiers` table. The NEXT time they `auth/me` we
      return real_llm=True (already do — gated by daily-cap tier).
    """
    secret = os.environ.get("STRIPE_WEBHOOK_SECRET")
    if not secret:
        # Hard fail — webhook can't be safely processed without
        # signature verification. Operator must wire this up.
        raise HTTPException(503, "STRIPE_WEBHOOK_SECRET not configured")

    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    try:
        import stripe
        event = stripe.Webhook.construct_event(payload, sig, secret)
    except ImportError:
        # Stripe SDK not installed — verify manually with HMAC SHA-256
        # so the webhook works even without the package.
        import hmac, hashlib as _hl, json as _json
        try:
            ts_part, sig_part = [x.split("=", 1) for x in sig.split(",")]
            ts, expected = ts_part[1], sig_part[1]
            signed = f"{ts}.{payload.decode()}".encode()
            computed = hmac.new(secret.encode(), signed, _hl.sha256).hexdigest()
            if not hmac.compare_digest(computed, expected):
                raise HTTPException(400, "Bad signature")
            event = _json.loads(payload)
        except Exception as e:
            raise HTTPException(400, f"Webhook signature verification failed: {e}")
    except Exception as e:
        raise HTTPException(400, f"Webhook signature verification failed: {e}")

    event_type = event.get("type") if isinstance(event, dict) else event.type
    obj = (event.get("data") or {}).get("object", {}) if isinstance(event, dict) else event.data.object

    if event_type == "checkout.session.completed":
        email = (obj.get("customer_details") or {}).get("email") or obj.get("customer_email")
        tier = (obj.get("metadata") or {}).get("tier", "pro")
        sub_id = obj.get("subscription")
        cust_id = obj.get("customer")
        if email:
            persistence.set_user_tier(
                email=email.lower(),
                tier=tier,
                stripe_customer_id=cust_id,
                stripe_subscription_id=sub_id,
            )
            persistence.remember_user(email.lower())
            log.info("Stripe: %s upgraded to %s", email, tier)
            return {"received": True, "action": "upgraded", "email": email, "tier": tier}
    elif event_type == "customer.subscription.deleted":
        # Subscription cancelled — downgrade back to free.
        email = (obj.get("customer_email") or "").lower()
        if email:
            persistence.set_user_tier(email=email, tier="free")
            log.info("Stripe: %s downgraded to free (subscription deleted)", email)
            return {"received": True, "action": "downgraded", "email": email}

    return {"received": True, "action": "ignored", "type": event_type}


class UpgradeCheckoutRequest(BaseModel):
    tier: str  # "pro" | "team"


@app.post("/v1/upgrade/checkout")
def upgrade_checkout(
    req: UpgradeCheckoutRequest,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Return a checkout URL for the requested tier.

    Currently a placeholder — we route to a Tally/Stripe-Payment-Link
    URL the operator configures via env. When Stripe is properly wired
    we'll swap the body of this endpoint for a real Stripe Checkout
    session creation. Frontend already opens the returned `url`, so
    that swap requires no frontend change.

    Why this exists today: the upgrade button on /pricing must do SOMETHING
    real, even before payments are wired — otherwise visitors hit a dead
    button and bounce. Pointing at a Tally form / Stripe payment link
    captures intent + email without us needing PCI compliance yet.
    """
    if req.tier not in ("pro", "team"):
        raise HTTPException(400, f"Unknown tier: {req.tier}")
    configured = os.environ.get("TA_UPGRADE_URL_" + req.tier.upper())
    if configured:
        return {"url": configured, "tier": req.tier, "configured": True}
    # No upgrade URL configured — degrade gracefully back to the
    # /pricing page rather than handing out a Tally URL that 404s.
    # Frontend treats `configured=false` as "show contact form" later.
    site = os.environ.get("TA_SITE_URL", "https://trading-agents-platform.vercel.app")
    return {
        "url": f"{site}/pricing#{req.tier}",
        "tier": req.tier,
        "configured": False,
    }


@app.post("/v1/cron/weekly-digest", tags=["auth"])
def weekly_digest(
    request: Request,
) -> dict:
    """Send the weekly decision digest to every email-bound user.

    Cron-style endpoint — called by an external scheduler (UptimeRobot,
    cron-job.org, GitHub Actions). Protected by `TA_CRON_SECRET` shared
    secret in the `X-Cron-Secret` header so randos can't spam our users.

    For each user with decisions in the last 7 days, fetches their
    history (with forward-return enrichment) and emails the digest via
    Resend. No-op when RESEND_API_KEY isn't configured — endpoint still
    returns the count of would-be sends.
    """
    secret = os.environ.get("TA_CRON_SECRET")
    if secret:
        provided = request.headers.get("X-Cron-Secret", "")
        if provided != secret:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Bad cron secret")

    from .email_send import is_configured, weekly_digest_email
    sent = 0
    skipped = 0

    # Walk every known user via memory store. A real implementation would
    # join against a users table; for now we derive from decision history.
    users_with_emails: dict[str, list[dict]] = {}
    cutoff = datetime.utcnow() - timedelta(days=7)

    for entry in memory.iter_all():
        try:
            user_id = entry.user_id or ""
        except Exception:
            continue
        if not user_id or "@" not in user_id:
            skipped += 1
            continue
        # Only include decisions from the last 7 days
        try:
            d_date = entry.decision_date
            if isinstance(d_date, date):
                ts = datetime.combine(d_date, datetime.min.time())
            else:
                ts = datetime.fromisoformat(str(d_date))
            if ts < cutoff:
                continue
        except Exception:
            continue
        users_with_emails.setdefault(user_id, []).append(entry.model_dump(mode="json"))

    for email, decisions in users_with_emails.items():
        if weekly_digest_email(email, decisions):
            sent += 1

    return {
        "ok": True,
        "users_with_decisions_this_week": len(users_with_emails),
        "emails_sent": sent,
        "emails_skipped_no_address": skipped,
        "resend_configured": is_configured(),
    }


@app.get("/v1/ecosystem")
def ecosystem() -> dict:
    """Public catalog of every OSS project we integrate with.

    Powers the /ecosystem page on the frontend. Returns the full
    registry plus a live `wired_sources` map showing which need-kinds
    actually have a registered handler in the data bus right now —
    so users can distinguish "specced" from "shipping today".
    """
    return {
        "projects": ecosystem_json(),
        "stats": ecosystem_stats(),
        "wired_sources": data_bus.registered_sources(),
    }


@app.post("/v1/auth/redeem", response_model=TokenResponse, tags=["auth"])
def auth_redeem(req: RedeemRequest) -> TokenResponse:
    return redeem(req)


@app.post("/v1/auth/magic-link/send", tags=["auth"])
def auth_magic_send(req: MagicLinkSendRequest, request: Request) -> dict:
    """Send a passwordless sign-in link to the user's email.

    Public endpoint — no auth required. Rate limit applies per-IP via
    the standard `_rate_limit` (max 10/min) to deter abuse. Returns a
    uniform success response regardless of whether the email exists or
    Resend is configured (prevents email-enumeration).
    """
    # Rate-limit by IP rather than user.id (which is anonymous here)
    ip = (request.headers.get("x-forwarded-for", "") or
          (request.client.host if request.client else "anon")
         ).split(",")[0].strip() or "anon"
    _rate_limit(f"magic-link:{ip}")

    site_url = os.environ.get(
        "TA_SITE_URL", "https://trading-agents-platform.vercel.app",
    )
    return magic_link_send(req, site_url=site_url)


@app.post("/v1/auth/magic-link/verify", response_model=TokenResponse, tags=["auth"])
def auth_magic_verify(req: MagicLinkVerifyRequest) -> TokenResponse:
    """Exchange a magic-link token (from the email) for a JWT."""
    return magic_link_verify(req)


@app.get("/v1/auth/me", tags=["auth"])
def auth_me(user: CurrentUser = Depends(get_current_user)) -> dict:
    return user.model_dump()


@app.post("/v1/decisions", response_model=JobResponse)
def create_decision(
    req: DecisionRequest,
    bg: BackgroundTasks,
    request: Request,
    user: CurrentUser = Depends(get_optional_user),
) -> JobResponse:
    if cfg.emergency_stop_decisions:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Decision engine is temporarily disabled. Try again later.",
        )
    _rate_limit(user.id)
    # Daily cap: keyed on IP for anonymous, user.id for authenticated.
    # Returns 402 with upgrade hint when exceeded.
    _daily_cap_check(user, request)
    jid = _new_job(user)
    bg.add_task(_run_decision_job, jid, req, user)
    return JobResponse(job_id=jid, status="queued")


class ReferralClaimRequest(BaseModel):
    code: str


def _remember_user(email: str) -> None:
    """Track authenticated users so the referral reverse-lookup can find
    them. Backed by SQLite — survives Render redeploys."""
    persistence.remember_user(email)


@app.post("/v1/me/referral/claim", tags=["auth"])
def referral_claim(
    req: ReferralClaimRequest,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Bind the current (newly-signed-in) user to a referral code.

    Both inviter and invitee get a 7-day +5/day bonus. Idempotent.
    Self-referral rejected. Unknown codes return `unknown_code`.
    """
    if user.id == "anonymous":
        raise HTTPException(401, "Sign in first")
    _remember_user(user.id)
    code = req.code.strip().lower()
    if not code or code == _referral_code(user.id):
        return {"ok": False, "reason": "invalid_or_self"}
    if persistence.has_been_referred(user.id):
        return {"ok": False, "reason": "already_claimed"}

    inviter = _email_for_code(code)
    if not inviter:
        return {"ok": False, "reason": "unknown_code"}

    if not persistence.record_referral(user.id, inviter):
        # Race — another concurrent claim won; report as already_claimed.
        return {"ok": False, "reason": "already_claimed"}
    _grant_referral_bonus(user.id)
    _grant_referral_bonus(inviter)
    return {
        "ok": True,
        "inviter": inviter,
        "bonus_days": _REFERRAL_BONUS_DAYS,
        "bonus_decisions_per_day": _REFERRAL_BONUS_DECISIONS,
    }


@app.get("/v1/me/referral", tags=["auth"])
def referral_status(user: CurrentUser = Depends(get_current_user)) -> dict:
    """Return the current user's referral code + how many invitees they've
    landed + whether the bonus is still active."""
    if user.id == "anonymous":
        raise HTTPException(401, "Sign in first")
    _remember_user(user.id)
    code = _referral_code(user.id)
    invitees = persistence.invitees_of(user.id)
    bonus_expiry = persistence.bonus_expires_at(user.id)
    return {
        "code": code,
        "share_url_suffix": f"?ref={code}",
        "invitees_count": len(invitees),
        "bonus_active": bonus_expiry > time.time(),
        "bonus_expires_at": int(bonus_expiry) if bonus_expiry else None,
        "bonus_decisions_per_day": _REFERRAL_BONUS_DECISIONS,
    }


@app.get("/v1/me/usage")
def get_usage(
    request: Request,
    user: CurrentUser = Depends(get_optional_user),
) -> dict:
    """Return daily-cap status so the frontend can render a usage badge.

    Output shape: `{used: int, cap: int, tier: "anon"|"free"|"pro"}`.
    """
    return _daily_cap_status(user, request)


@app.get("/v1/decisions/job/{job_id}")
def get_decision(
    job_id: str,
    user: CurrentUser = Depends(get_optional_user),
) -> dict:
    if job_id not in _jobs:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown job")
    j = _jobs[job_id]
    # Anonymous visitors can only read decisions they themselves created
    # (we identify them by job's `user` field). Non-anon users follow
    # the original "your jobs only" rule.
    if j.get("user") != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your job")
    return j


@app.post("/v1/decisions/job/{job_id}/share")
def share_decision(
    job_id: str,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Mint a public share-id for the user's completed decision.

    Anyone with the resulting URL can view the trace at /d/<id>. Only
    the original requester can create a share — we enforce that via
    the job's `user` field. Trace is copied (not referenced) so it
    survives the job dict's natural GC.

    No DB — keeps Render-free-tier ops simple. The 5k-entry LRU cap
    means a runaway share-spam attempt eventually evicts old entries.
    """
    if job_id not in _jobs:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown job")
    j = _jobs[job_id]
    if j.get("user") != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your job to share")
    if j.get("status") != "done" or not j.get("result"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Decision not finished yet")

    import json as _json
    share_id = uuid.uuid4().hex[:12]
    payload = {
        "share_id": share_id,
        "result": j["result"],            # the DecisionTrace dict
        "mode": j.get("mode"),            # "real_llm" / "mock" / "cached"
        "lessons_injected": j.get("lessons_injected", False),
        "shared_at": time.time(),
    }
    persistence.put_shared_decision(share_id, _json.dumps(payload))
    return {"share_id": share_id}


@app.get("/v1/decisions/share/{share_id}")
def get_shared_decision(share_id: str) -> dict:
    """Public, no-auth read of a shared decision. 404 if unknown."""
    import json as _json
    raw = persistence.get_shared_decision(share_id)
    if not raw:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Share not found or expired")
    return _json.loads(raw)


from fastapi.responses import PlainTextResponse  # noqa: E402


@app.get("/v1/decisions/job/{job_id}/report.md", response_class=PlainTextResponse,
         tags=["decisions"])
def get_job_report_md(job_id: str, user: CurrentUser = Depends(get_current_user)) -> str:
    """Render a JUST-FINISHED job as a markdown report — skips the share step.

    Auth-gated to the original requester. Lets the frontend show a "View Report"
    button as soon as the pipeline completes without forcing the user to mint
    a share-id first.
    """
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown job")
    if job.get("user") != user.id and user.id != "anonymous":
        # Allow anonymous users to read their own anonymous jobs by ID
        # (they have the URL, the URL is essentially the token).
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your job")
    if job.get("status") != "done" or not job.get("result"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Decision not finished yet")
    payload = {
        "result": job["result"],
        "mode": job.get("mode"),
        "shared_at": time.time(),  # ad-hoc timestamp for the rendered report
    }
    return _decision_to_markdown(payload, share_id=None)


@app.get("/v1/decisions/share/{share_id}/report.md", response_class=PlainTextResponse,
         tags=["decisions"])
def get_shared_decision_report_md(share_id: str) -> str:
    """Render a shared decision as a self-contained Markdown report.

    Designed for archival / sharing — pastes cleanly into Notion, Obsidian,
    or anywhere markdown renders. The HTML cousin lives at /d/[shareId]/report
    and is print-friendly so users can also "save as PDF" from the browser.
    """
    import json as _json
    raw = persistence.get_shared_decision(share_id)
    if not raw:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Share not found or expired")
    payload = _json.loads(raw)
    return _decision_to_markdown(payload, share_id)


def _decision_to_markdown(payload: dict, share_id: str | None = None) -> str:
    """Format the shared-decision JSON as a structured Markdown report.

    Pure formatting — no LLM, no upstream calls, no chance of new
    hallucinations. Just turns the stored trace into a human-readable doc.
    """
    result = payload.get("result") or {}
    decision = result.get("decision") or {}
    ticker = decision.get("ticker") or result.get("ticker") or "?"
    asof = decision.get("asof") or result.get("asof") or ""
    side = (decision.get("side") or "HOLD").upper()
    weight = decision.get("target_weight")
    conf = decision.get("confidence")
    rationale = decision.get("rationale") or ""
    risk_notes = decision.get("risk_notes") or ""
    flags = decision.get("flags") or []
    mode = payload.get("mode") or "unknown"
    shared_at = payload.get("shared_at")

    lines: list[str] = []
    lines.append(f"# {ticker} — {side}  ·  {asof}")
    lines.append("")
    lines.append(f"> AI 多 agent 决策报告 · TradingAgents.platform")
    lines.append("")

    # Headline block
    lines.append("## 结论 · Verdict")
    lines.append("")
    lines.append("| 字段 | 值 |")
    lines.append("|------|----|")
    lines.append(f"| 行动 / Side | **{side}** |")
    if weight is not None:
        lines.append(f"| 目标仓位 / Target weight | {float(weight)*100:+.2f}% |")
    if conf is not None:
        lines.append(f"| 置信度 / Confidence | {float(conf)*100:.0f}% |")
    lines.append(f"| 分析时间 / As-of | {asof} |")
    lines.append(f"| 运行模式 / Mode | `{mode}` |")
    if shared_at:
        from datetime import datetime as _dt
        lines.append(f"| 生成时间 / Generated | {_dt.utcfromtimestamp(shared_at).isoformat()}Z |")
    if share_id:
        lines.append(f"| 永久链接 / Share | `/d/{share_id}` |")
    lines.append("")

    if flags:
        lines.append("**Flags:** " + ", ".join(f"`{f}`" for f in flags))
        lines.append("")

    # Rationale + risk
    if rationale:
        lines.append("### 经理终审 · Manager rationale")
        lines.append("")
        lines.append(rationale.strip())
        lines.append("")
    if risk_notes:
        lines.append("### 风险提示 · Risk notes")
        lines.append("")
        lines.append("> " + risk_notes.strip().replace("\n", "\n> "))
        lines.append("")

    # Analyst reports — one section per stage
    reports = result.get("analyst_reports") or []
    if reports:
        lines.append("---")
        lines.append("")
        lines.append("## 分析师报告 · Analyst reports")
        lines.append("")
        labels = {
            "fundamentals": "基本面 · Fundamentals",
            "sentiment":    "情绪 · Sentiment",
            "news":         "新闻 · News",
            "technical":    "技术面 · Technical",
            "macro":        "宏观 · Macro",
        }
        for r in reports:
            analyst = r.get("analyst") or "?"
            label = labels.get(analyst, analyst.title())
            body = (r.get("body") or "").strip()
            signals = r.get("signals") or {}
            sources = r.get("sources") or []
            lines.append(f"### {label}")
            lines.append("")
            if body:
                lines.append(body)
                lines.append("")
            if signals:
                lines.append("**Machine-readable signals:**")
                lines.append("")
                lines.append("```json")
                import json as _j
                lines.append(_j.dumps(signals, ensure_ascii=False, indent=2))
                lines.append("```")
                lines.append("")
            if sources:
                lines.append("Sources: " + ", ".join(f"`{s}`" for s in sources))
                lines.append("")

    # Researcher debate (bull / bear)
    rdebate = result.get("researcher_debate") or {}
    rturns = rdebate.get("turns") if isinstance(rdebate, dict) else None
    if rturns:
        lines.append("---")
        lines.append("")
        lines.append("## 多空辩论 · Bull / Bear debate")
        lines.append("")
        for t in rturns:
            speaker = (t.get("speaker") or "").upper()
            content = (t.get("content") or "").strip()
            lines.append(f"**{speaker}** (round {t.get('round', 0)})")
            lines.append("")
            lines.append("> " + content.replace("\n", "\n> "))
            lines.append("")
        synthesis = rdebate.get("synthesis")
        if synthesis:
            lines.append("**Synthesis:**")
            lines.append("")
            lines.append(synthesis.strip())
            lines.append("")

    # Risk debate (3-way risk committee)
    rkdebate = result.get("risk_debate") or {}
    rkturns = rkdebate.get("turns") if isinstance(rkdebate, dict) else None
    if rkturns:
        lines.append("---")
        lines.append("")
        lines.append("## 风控委员会 · Risk committee")
        lines.append("")
        for t in rkturns:
            speaker = (t.get("speaker") or "").upper()
            content = (t.get("content") or "").strip()
            lines.append(f"**{speaker}**: {content}")
            lines.append("")

    # Trader plan
    trader_plan = result.get("trader_plan")
    if trader_plan:
        lines.append("---")
        lines.append("")
        lines.append("## 交易员组装方案 · Trader plan")
        lines.append("")
        lines.append(trader_plan.strip())
        lines.append("")

    # Manager review (if different from rationale)
    manager_review = result.get("manager_review")
    if manager_review and manager_review.strip() != rationale.strip():
        lines.append("---")
        lines.append("")
        lines.append("## 基金经理终审 · Manager review")
        lines.append("")
        lines.append(manager_review.strip())
        lines.append("")

    # Cost summary
    usage = result.get("usage") or []
    if usage:
        total_cost = sum(float(u.get("usd_cost") or 0) for u in usage)
        lines.append("---")
        lines.append("")
        lines.append("## LLM 调用 · Token usage")
        lines.append("")
        lines.append(f"Total cost: **${total_cost:.4f}** across {len(usage)} calls")
        lines.append("")
        lines.append("| Model | Input tokens | Output tokens | Cost (USD) |")
        lines.append("|-------|--------------|---------------|------------|")
        for u in usage:
            lines.append(
                f"| `{u.get('model','?')}` "
                f"| {u.get('input_tokens', 0)} "
                f"| {u.get('output_tokens', 0)} "
                f"| ${float(u.get('usd_cost') or 0):.4f} |"
            )
        lines.append("")

    # Footer
    lines.append("---")
    lines.append("")
    lines.append("⚠ **投资有风险，入市需谨慎。本报告为 AI 决策支持，不构成投资建议。**")
    lines.append("")
    lines.append("Generated by TradingAgents · trading-agents-platform.vercel.app")
    return "\n".join(lines)


@app.post("/v1/backtests", response_model=JobResponse)
def create_backtest(
    req: BacktestRequest,
    bg: BackgroundTasks,
    user: CurrentUser = Depends(get_current_user),
) -> JobResponse:
    _rate_limit(user.id)
    jid = _new_job(user)
    bg.add_task(_run_backtest_job, jid, req, user)
    return JobResponse(job_id=jid, status="queued")


@app.get("/v1/backtests/{job_id}")
def get_backtest(
    job_id: str,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    if job_id not in _jobs:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown job")
    j = _jobs[job_id]
    if j.get("user") != user.id and user.id != "anonymous":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your job")
    return j


@app.get("/v1/watchlist")
def list_watchlist(user: CurrentUser = Depends(get_current_user)) -> list[dict]:
    return _watchlists.get(user.id, [])


@app.post("/v1/watchlist/items")
def add_to_watchlist(
    item: WatchlistItem,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    _watchlists.setdefault(user.id, []).append(item.model_dump())
    return {"ok": True}


@app.get("/v1/decisions/{ticker}/history")
def decision_history(
    ticker: str,
    limit: int = 20,
    user: CurrentUser = Depends(get_current_user),
) -> list[dict]:
    return [e.model_dump(mode="json") for e in memory.recent(ticker, n=limit)]


class FeedbackRequest(BaseModel):
    ticker: str
    asof: date
    side: str
    verdict: str  # "up" or "down"
    note: str | None = None


@app.post("/v1/feedback")
def submit_feedback(
    req: FeedbackRequest,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Persist a user's verdict on a past decision.

    Writes a JSONL line per feedback event. Cheap, append-only, easy to
    grep — exactly what we need for prompt iteration. When we have enough
    rows we'll move to a real DB and use them as RLHF labels.
    """
    if req.verdict not in ("up", "down"):
        raise HTTPException(status_code=400, detail="verdict must be up|down")
    feedback_dir = Path(os.getenv("TA_DATA_DIR", "./.tradingagents")) / "_feedback"
    feedback_dir.mkdir(parents=True, exist_ok=True)
    row = {
        "user_id": user.id,
        "ticker": req.ticker,
        "asof": req.asof.isoformat(),
        "side": req.side,
        "verdict": req.verdict,
        "note": req.note,
        "submitted_at": datetime.now(tz=timezone.utc).isoformat(),
    }
    with (feedback_dir / "feedback.jsonl").open("a", encoding="utf-8") as f:
        import json as _json
        f.write(_json.dumps(row, ensure_ascii=False) + "\n")
    return {"ok": True}


@app.get("/v1/me/decisions")
def my_decisions(
    limit: int = 200,
    enrich_pnl: bool = True,
    user: CurrentUser = Depends(get_current_user),
) -> list[dict]:
    """Return all past decisions made by the current user, most recent first.

    When `enrich_pnl=True` (default), each entry is augmented with the
    forward return ("how the stock did since you decided") so the frontend
    can render trust signals like "+3.2% in 7 days vs SPY +0.8%".

    Returns are computed against the SAME market's adapter (yfinance for
    US, akshare for A-share) and are best-effort — failures fall through
    silently with realised_return left as null.
    """
    rows = memory.user_history(user.id, limit=limit)
    out: list[dict] = []
    today = date.today()
    for e in rows:
        d = e.model_dump(mode="json")
        if enrich_pnl and e.decision_close and e.market:
            try:
                adapter = get_adapter(e.market)
                # Get most recent close for this ticker
                ts = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc)
                quote = adapter.get_quote(e.ticker, ts)
                if quote and quote.close:
                    forward_ret = quote.close / e.decision_close - 1.0
                    days_held = (today - e.decision_date).days
                    d["forward_return"] = round(forward_ret, 4)
                    d["forward_close"] = quote.close
                    d["days_held"] = days_held
            except Exception:
                # Silent — pnl enrichment is best-effort, do not break the list
                pass
        out.append(d)
    return out


def _df_find(df_columns: list[str], *needles: str) -> str | None:
    for c in df_columns:
        for n in needles:
            if n in c or n.lower() in c.lower():
                return c
    return None


def _normalize_hot_rows(df, limit: int) -> list[dict]:
    """Best-effort normalization of an akshare hot-ranking DataFrame to our
    canonical row shape. Works with both EastMoney (stock_hot_rank_em) and
    Baidu (stock_hot_search_baidu) column conventions."""
    cols = list(df.columns)
    rank_col = _df_find(cols, "排名", "rank")
    code_col = _df_find(cols, "代码", "code")
    name_col = _df_find(cols, "名称", "name", "股票")
    price_col = _df_find(cols, "最新价", "price")
    change_col = _df_find(cols, "涨跌幅", "change")
    heat_col = _df_find(cols, "热度", "heat", "综合热度")

    rows: list[dict] = []
    for i, (_, r) in enumerate(df.head(limit).iterrows()):
        try:
            rk = int(r[rank_col]) if rank_col else (i + 1)
            ticker = (
                str(r[code_col]).replace("SH", "").replace("SZ", "").strip()
                if code_col else None
            )
            row = {
                "rank": rk,
                "ticker": ticker,
                "name": str(r[name_col]).strip() if name_col else None,
                "last_price": (
                    float(r[price_col])
                    if price_col and r[price_col] not in ("-", None, "") else None
                ),
                "change_pct": (
                    float(r[change_col])
                    if change_col and r[change_col] not in ("-", None, "") else None
                ),
                "heat": (
                    float(r[heat_col])
                    if heat_col and r[heat_col] not in ("-", None, "") else None
                ),
            }
        except (TypeError, ValueError):
            continue
        rows.append(row)
    return rows


# ---------------------------------------------------------------------------
# Daily AI brief — auto-generated market commentary
# ---------------------------------------------------------------------------

@app.post("/v1/cron/daily-brief", tags=["auth"])
def cron_daily_brief(
    request: Request,
    locale: str = "zh",
    force: bool = False,
) -> dict:
    """Generate today's AI market brief and persist it.

    Designed to be hit daily by a Render cron / cron-job.org schedule.
    Protected by `TA_CRON_SECRET` in the X-Cron-Secret header. Idempotent:
    if today's brief is already saved, returns it unchanged unless `force=true`.

    The body is an LLM-generated commentary (≈ 800-1200 zh-CN chars), with:
      - one-line market headline
      - 3-bullet "what moved"
      - 3-bullet "what to watch"
      - a closing risk-disclaimer

    Locale defaults to zh-CN since the primary audience is Chinese retail.
    Pass `?locale=en` to generate the English variant (stored separately
    by date_str + locale composite — overwrites either independently).
    """
    secret = os.environ.get("TA_CRON_SECRET")
    if secret:
        provided = request.headers.get("X-Cron-Secret", "")
        if provided != secret:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Bad cron secret")

    today = date.today().isoformat()
    existing = persistence.get_daily_brief(f"{today}:{locale}")
    if existing and not force:
        return {"ok": True, "cached": True, "brief": existing}

    # Compose a tight prompt that gives the LLM enough context to generate
    # something useful even without scraping real-time news. We let the
    # model speak from its training prior plus the date stamp; the cron
    # operator can later wire in a news-feed scrape for fresher content.
    prompt_zh = (
        f"今天是 {today}。\n\n"
        "请生成一份简短的 A 股 + 美股 + 加密货币每日早评，800-1200 字，"
        "中文，markdown 格式。包含：\n\n"
        "1. **市场一句话** — 一句话概括今天的市场基调\n"
        "2. **昨日复盘** — 三个 bullet，每个 60-100 字\n"
        "3. **今日看点** — 三个 bullet，每个 60-100 字\n"
        "4. **风险提示** — 一段，强调投资风险\n\n"
        "语气专业克制，避免推荐具体股票。结尾加一句"
        "「— TradingAgents AI · {} 自动生成」。".format(today)
    )
    prompt_en = (
        f"Today is {today}.\n\n"
        "Write a concise daily brief covering A-share, US equity, and crypto "
        "markets, 600-900 words, markdown format. Include:\n\n"
        "1. **Tape headline** — one-sentence summary of today's mood\n"
        "2. **Yesterday's recap** — three bullets, 30-60 words each\n"
        "3. **Today's watch list** — three bullets, 30-60 words each\n"
        "4. **Risk note** — one paragraph emphasising market risk\n\n"
        "Professional, restrained tone. Do not recommend specific tickers. "
        f"End with: '— TradingAgents AI · {today} auto-generated'."
    )
    prompt = prompt_zh if locale == "zh" else prompt_en

    try:
        from trading_agents.llm.router import get_router
        router = get_router()
        result = router.complete(prompt=prompt, system="You are a professional market commentator.")
        body_md = result.text if hasattr(result, "text") else str(result)
        model_used = getattr(result, "model", None) or "unknown"
    except Exception as e:
        log.warning("daily-brief LLM failed: %s", e)
        # Persist a clearly-labelled fallback so the page always has SOMETHING
        body_md = (
            f"# {today} · Daily Brief Unavailable\n\n"
            f"The LLM router could not generate today's brief ({e}).\n\n"
            "This page will be regenerated automatically on the next cron run."
        )
        model_used = "fallback"

    # Extract title from first markdown H1, or fall back to date.
    title = f"市场早评 · {today}" if locale == "zh" else f"Daily Brief · {today}"
    for line in body_md.splitlines():
        if line.startswith("# "):
            title = line[2:].strip()
            break

    persistence.save_daily_brief(
        date_str=f"{today}:{locale}",
        title=title,
        body_md=body_md,
        locale=locale,
        model=model_used,
    )
    return {
        "ok": True,
        "cached": False,
        "brief": persistence.get_daily_brief(f"{today}:{locale}"),
    }


@app.get("/v1/daily-brief/{date_str}")
def get_daily_brief_route(date_str: str, locale: str = "zh") -> dict:
    """Fetch a stored brief by date (YYYY-MM-DD). Used by /blog/daily/[date]
    on the frontend. 404s if not generated yet."""
    brief = persistence.get_daily_brief(f"{date_str}:{locale}")
    if not brief:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Brief not yet generated for that date")
    return brief


@app.get("/v1/daily-brief")
def list_daily_briefs_route(limit: int = 30) -> dict:
    """List recent briefs for the blog index."""
    return {"items": persistence.list_daily_briefs(limit=limit)}


# ---------------------------------------------------------------------------
# Alpaca paper trading — never real money, sandbox only.
# ---------------------------------------------------------------------------

@app.get("/v1/alpaca/paper/account", tags=["execution"])
def alpaca_paper_account() -> dict:
    """Paper-account snapshot: cash, equity, buying power. 503 if env not set."""
    try:
        from trading_agents.execution import alpaca_get_paper_account, alpaca_paper_configured
    except ImportError:
        raise HTTPException(503, "alpaca module not available")
    if not alpaca_paper_configured():
        raise HTTPException(503, "ALPACA_API_KEY / ALPACA_API_SECRET not configured")
    try:
        return alpaca_get_paper_account()
    except Exception as e:
        raise HTTPException(502, f"Alpaca upstream error: {e}")


@app.get("/v1/alpaca/paper/orders", tags=["execution"])
def alpaca_paper_orders(status: str = "all", limit: int = 50) -> list[dict]:
    try:
        from trading_agents.execution import alpaca_list_paper_orders, alpaca_paper_configured
    except ImportError:
        raise HTTPException(503, "alpaca module not available")
    if not alpaca_paper_configured():
        raise HTTPException(503, "ALPACA_API_KEY / ALPACA_API_SECRET not configured")
    try:
        rows = alpaca_list_paper_orders(status=status, limit=limit)
        return [r.__dict__ for r in rows]
    except Exception as e:
        raise HTTPException(502, f"Alpaca upstream error: {e}")


@app.get("/v1/alpaca/paper/positions", tags=["execution"])
def alpaca_paper_positions() -> list[dict]:
    try:
        from trading_agents.execution import alpaca_list_paper_positions, alpaca_paper_configured
    except ImportError:
        raise HTTPException(503, "alpaca module not available")
    if not alpaca_paper_configured():
        raise HTTPException(503, "ALPACA_API_KEY / ALPACA_API_SECRET not configured")
    try:
        rows = alpaca_list_paper_positions()
        return [r.__dict__ for r in rows]
    except Exception as e:
        raise HTTPException(502, f"Alpaca upstream error: {e}")


class AlpacaPaperOrderRequest(BaseModel):
    symbol: str
    qty: float
    side: str = "buy"  # buy | sell


@app.post("/v1/alpaca/paper/orders", tags=["execution"])
def alpaca_submit_paper_order(req: AlpacaPaperOrderRequest, user: CurrentUser = Depends(get_current_user)) -> dict:
    """Submit a paper market order. Auth-gated — anonymous can't submit."""
    if user.id == "anonymous":
        raise HTTPException(401, "Sign in to submit paper orders")
    try:
        from trading_agents.execution import alpaca_submit_paper_order, alpaca_paper_configured
    except ImportError:
        raise HTTPException(503, "alpaca module not available")
    if not alpaca_paper_configured():
        raise HTTPException(503, "Alpaca paper not configured server-side")
    if req.side not in ("buy", "sell"):
        raise HTTPException(400, "side must be 'buy' or 'sell'")
    try:
        order = alpaca_submit_paper_order(
            symbol=req.symbol.upper(),
            qty=req.qty,
            side=req.side,  # type: ignore
        )
        return order.__dict__
    except Exception as e:
        raise HTTPException(502, f"Alpaca order error: {e}")


# ---------------------------------------------------------------------------
# Lean / QuantConnect Insight export — pure JSON, no auth required.
# ---------------------------------------------------------------------------

@app.get("/v1/lean/insight/{job_id}", tags=["execution"])
def lean_insight_export(job_id: str) -> dict:
    """Export a finished decision as a Lean Algorithm Framework Insight.

    QC users can take this JSON and paste it into their own QC algorithm
    via `Insight.From(json)`. Read-only — never executes anything.
    """
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.get("status") != "completed":
        raise HTTPException(409, f"Job not finished (status={job.get('status')})")
    result = job.get("result") or {}
    decision = result.get("decision") if isinstance(result, dict) else None
    if not decision:
        raise HTTPException(404, "No decision payload on job")
    try:
        from trading_agents.execution.lean_bridge import decision_to_insight
        insight = decision_to_insight(decision)
        return insight.to_lean_json()
    except Exception as e:
        raise HTTPException(500, f"Lean export failed: {e}")


@app.post("/v1/alpaca/paper/orders/from-decision/{job_id}", tags=["execution"])
def alpaca_order_from_decision(job_id: str, user: CurrentUser = Depends(get_current_user)) -> dict:
    """Convert a finished decision into a paper order on Alpaca.

    Auth-gated. Reads the cached decision, asks Alpaca to size it against
    the user's paper account (3% cap), submits a market order. Skips
    HOLD decisions entirely.
    """
    if user.id == "anonymous":
        raise HTTPException(401, "Sign in to submit paper orders")
    job = _jobs.get(job_id)
    if not job or job.get("status") != "completed":
        raise HTTPException(404, "Decision not found / not finished")
    result = job.get("result") or {}
    decision = result.get("decision") if isinstance(result, dict) else None
    if not decision:
        raise HTTPException(404, "No decision payload")
    try:
        from trading_agents.execution import (
            alpaca_paper_configured,
            alpaca_get_paper_account,
            alpaca_decision_to_paper_order,
        )
    except ImportError:
        raise HTTPException(503, "alpaca module not available")
    if not alpaca_paper_configured():
        raise HTTPException(503, "Alpaca paper not configured server-side")
    try:
        acct = alpaca_get_paper_account()
        order = alpaca_decision_to_paper_order(
            decision=decision,
            portfolio_value_usd=acct["portfolio_value"],
        )
        return {"order": order.__dict__ if order else None, "account": acct}
    except Exception as e:
        raise HTTPException(502, f"Alpaca order error: {e}")


# ---------------------------------------------------------------------------
# 北向资金 (Mainland-HK Stock Connect flows) — Eastmoney parity.
# ---------------------------------------------------------------------------

@app.get("/v1/cn/north-flow", tags=["markets"])
def cn_north_flow(days: int = 30) -> dict:
    """Northbound (mainland-via-HK) net buys for the last N days.

    Free, no API key, via akshare's `stock_hsgt_north_net_flow_in_em`. The
    north-flow series is one of the most-watched leading indicators in
    China retail; embedding it makes us look like a serious A-share tool.
    """
    try:
        import akshare as ak
    except ImportError:
        return {"status": "unavailable", "message": "akshare not installed", "rows": []}
    try:
        df = ak.stock_hsgt_north_net_flow_in_em(symbol="北上")
        if df is None or df.empty:
            return {"status": "unavailable", "message": "akshare returned empty", "rows": []}
        # Coerce to JSON-friendly: keep last `days` rows
        df = df.tail(max(7, min(days, 365)))
        # akshare returns columns "date" and "value" (in 万元)
        cols = list(df.columns)
        date_col = cols[0]
        val_col = cols[1] if len(cols) > 1 else cols[0]
        rows = [
            {"date": str(r[date_col])[:10], "net_inflow_wy": float(r[val_col])}
            for _, r in df.iterrows()
        ]
        return {"status": "ok", "rows": rows, "source": "akshare/eastmoney"}
    except Exception as e:
        log.warning("north-flow fetch failed: %s", e)
        return {"status": "unavailable", "message": str(e), "rows": []}


@app.get("/v1/cn/lhb", tags=["markets"])
def cn_lhb(date_str: str | None = None) -> dict:
    """龙虎榜 — daily top-50 block-trade leaderboard.

    `date_str` defaults to the latest available trading day. Eastmoney's
    flagship retail-attention dataset. Free via akshare.
    """
    try:
        import akshare as ak
    except ImportError:
        return {"status": "unavailable", "message": "akshare not installed", "rows": []}
    try:
        d = date_str or date.today().strftime("%Y%m%d")
        df = ak.stock_lhb_detail_em(start_date=d, end_date=d)
        if df is None or df.empty:
            return {"status": "unavailable", "message": "no lhb data for that date", "rows": []}
        df = df.head(50)
        rows = df.to_dict(orient="records")
        # Strip pd-specific types
        for r in rows:
            for k, v in list(r.items()):
                try:
                    r[k] = float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else str(v)
                except Exception:
                    r[k] = str(v)
        return {"status": "ok", "date": d, "rows": rows, "source": "akshare/eastmoney"}
    except Exception as e:
        log.warning("lhb fetch failed: %s", e)
        return {"status": "unavailable", "message": str(e), "rows": []}


@app.get("/v1/datasource/test", tags=["markets"])
def datasource_test(ticker: str = "600519") -> dict:
    """Probe every data source independently — for operators auditing
    which upstreams are reachable from this server's IP, and verifying
    that what we parse from each source matches what users expect.

    Each entry returns {source, ok, name, current, prev, error, latency_ms}.
    Use `?ticker=600519` (贵州茅台) as a sanity benchmark — every Chinese
    user knows what its current price should be.
    """
    out = []

    # 1. akshare (full data quality, may be geo-blocked)
    t0 = time.time()
    try:
        import akshare as ak
        df = ak.stock_individual_info_em(symbol=ticker)
        info: dict[str, Any] = {}
        if df is not None and not df.empty:
            cols = list(df.columns)
            for _, r in df.iterrows():
                info[str(r[cols[0]]).strip()] = r[cols[1]] if len(cols) > 1 else None
        name = str(info.get("股票简称") or "").strip() or None
        # Pull current quote
        try:
            from datetime import date as _d, timedelta as _td
            today = _d.today()
            hist = ak.stock_zh_a_hist(symbol=ticker, period="daily",
                                       start_date=(today - _td(days=7)).strftime("%Y%m%d"),
                                       end_date=today.strftime("%Y%m%d"), adjust="")
            current = float(hist.iloc[-1]["收盘"]) if hist is not None and not hist.empty else None
        except Exception:
            current = None
        out.append({
            "source": "akshare",
            "ok": bool(name),
            "name": name,
            "current": current,
            "latency_ms": int((time.time() - t0) * 1000),
            "error": None if name else "no name parsed",
        })
    except Exception as e:
        out.append({"source": "akshare", "ok": False, "name": None, "current": None,
                    "latency_ms": int((time.time() - t0) * 1000), "error": str(e)[:200]})

    # 2-4. Multi-source three providers, run individually
    try:
        from trading_agents.adapters.cn_stock_multi_source import (
            fetch_a_share_quote_tencent,
            fetch_a_share_quote_sina,
            fetch_a_share_quote_xueqiu,
        )
        for fn, label in [
            (fetch_a_share_quote_tencent, "tencent"),
            (fetch_a_share_quote_sina,    "sina"),
            (fetch_a_share_quote_xueqiu,  "xueqiu"),
        ]:
            t0 = time.time()
            try:
                d = fn(ticker)
                if d:
                    out.append({
                        "source": label, "ok": True,
                        "name": d.get("name"), "current": d.get("current"),
                        "latency_ms": int((time.time() - t0) * 1000),
                        "error": None,
                    })
                else:
                    out.append({"source": label, "ok": False, "name": None, "current": None,
                                "latency_ms": int((time.time() - t0) * 1000),
                                "error": "returned None"})
            except Exception as e:
                out.append({"source": label, "ok": False, "name": None, "current": None,
                            "latency_ms": int((time.time() - t0) * 1000), "error": str(e)[:200]})
    except ImportError as e:
        out.append({"source": "multi", "ok": False, "name": None, "current": None,
                    "latency_ms": 0, "error": f"import failed: {e}"})

    return {
        "ticker": ticker,
        "sources": out,
        "summary": {
            "n_ok":     sum(1 for s in out if s.get("ok")),
            "n_failed": sum(1 for s in out if not s.get("ok")),
            "names":    list({s["name"] for s in out if s.get("name")}),
        },
        "tested_at": datetime.now(tz=timezone.utc).isoformat(),
    }


@app.get("/v1/ticker/info", tags=["markets"])
def get_ticker_info(ticker: str) -> dict:
    """Authoritative ticker metadata — name, sector, market cap, listing date.

    NEVER guesses from training-set memory. Always fetches from the upstream
    provider (akshare for A-share, yfinance for US, CCXT for crypto), caches
    for 24h in SQLite. If upstream is down AND no cache exists, returns
    `source='unavailable'` so the frontend can show 'data unavailable' rather
    than a made-up name.
    """
    t = (ticker or "").strip().upper()
    if not t:
        raise HTTPException(400, "ticker required")
    # Fresh-cache path
    cached = persistence.get_ticker_meta(t)
    if cached:
        return cached

    market = _auto_route_market(t, "us_equity")

    # Per-market fetch
    out: dict | None = None
    if market == "a_share":
        out = _fetch_a_share_meta(t)
    elif market == "us_equity":
        out = _fetch_us_equity_meta(t)
    elif market == "crypto":
        out = _fetch_crypto_meta(t)

    if out:
        persistence.save_ticker_meta(
            ticker=t, market=market,
            name=out.get("name"),
            sector=out.get("sector"),
            industry=out.get("industry"),
            market_cap=out.get("market_cap"),
            currency=out.get("currency"),
            listing_date=out.get("listing_date"),
            source=out.get("source") or "unknown",
        )
        return persistence.get_ticker_meta(t) or out

    # Upstream failed — try stale cache before declaring unavailable
    stale = persistence.get_ticker_meta_stale_ok(t)
    if stale:
        stale["source"] = (stale.get("source") or "") + ":stale"
        return stale

    return {
        "ticker": t, "market": market, "name": None,
        "sector": None, "industry": None,
        "market_cap": None, "currency": _currency_for(market),
        "listing_date": None, "source": "unavailable",
        "fetched_at": time.time(),
    }


def _fetch_a_share_meta(ticker: str) -> dict | None:
    """Tries akshare first (deepest data: 行业 + 上市日期 + 总市值), then
    falls through to Tencent/Sina/Xueqiu via cn_stock_multi_source — those
    work from any IP so we never end up with zero data.

    Returns None only if ALL four sources fail. The `source` field on the
    returned dict tells the caller which one served, so we can audit.
    """
    # ---- 1) akshare — gives us 行业 + 上市日期 if reachable
    try:
        import akshare as ak
        df = ak.stock_individual_info_em(symbol=ticker)
        if df is not None and not df.empty:
            info: dict[str, Any] = {}
            cols = list(df.columns)
            k_col = cols[0]
            v_col = cols[1] if len(cols) > 1 else cols[0]
            for _, r in df.iterrows():
                info[str(r[k_col]).strip()] = r[v_col]
            name = str(info.get("股票简称") or "").strip() or None
            industry = str(info.get("行业") or "").strip() or None
            mc = info.get("总市值")
            try:
                market_cap = float(mc) if mc not in (None, "", "-", "--") else None
            except (TypeError, ValueError):
                market_cap = None
            listing = str(info.get("上市时间") or "").strip() or None
            if listing and len(listing) == 8 and listing.isdigit():
                listing = f"{listing[:4]}-{listing[4:6]}-{listing[6:]}"
            if name:
                return {
                    "name": name, "sector": industry, "industry": industry,
                    "market_cap": market_cap, "currency": "CNY",
                    "listing_date": listing, "source": "akshare",
                }
    except Exception as e:
        log.warning("akshare ticker info failed for %s: %s", ticker, e)

    # ---- 2-4) Tencent / Sina / Xueqiu via multi-source helper
    try:
        from trading_agents.adapters.cn_stock_multi_source import fetch_a_share_quote_multi
        q = fetch_a_share_quote_multi(ticker)
    except Exception as e:
        log.warning("multi-source ticker info failed for %s: %s", ticker, e)
        q = None
    if not q or not q.get("name"):
        return None
    # We deliberately don't pass through market_cap / PE / PB from the
    # multi-source path — those positions in Tencent's response aren't
    # 100% stable across stocks, and presenting an unverified number as
    # 总市值 is exactly the kind of "data dishonesty" we promised to avoid.
    # Sector/industry similarly require akshare; multi-source doesn't have them.
    return {
        "name": q["name"],
        "sector": None, "industry": None,
        "market_cap": None,  # only akshare gives this reliably; multi-source omits
        "currency": "CNY",
        "listing_date": None,
        "source": q.get("source") or "multi",
    }


def _fetch_us_equity_meta(ticker: str) -> dict | None:
    """yfinance Ticker(t).info — `longName`, `sector`, `industry`, `marketCap`."""
    try:
        import yfinance as yf
        info = yf.Ticker(ticker).info or {}
    except Exception as e:
        log.warning("yfinance ticker info failed for %s: %s", ticker, e)
        return None
    name = info.get("longName") or info.get("shortName")
    if not name:
        return None
    return {
        "name": name,
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "market_cap": float(info.get("marketCap")) if info.get("marketCap") else None,
        "currency": info.get("currency") or "USD",
        "listing_date": None,
        "source": "yfinance",
    }


def _fetch_crypto_meta(ticker: str) -> dict | None:
    """CCXT doesn't have rich metadata per-symbol; we return a minimal
    structured record so the frontend doesn't show 'unknown'."""
    t = ticker.upper().strip()
    base = t.split("/")[0] if "/" in t else t
    common_names = {
        "BTC": "Bitcoin", "ETH": "Ethereum", "SOL": "Solana",
        "BNB": "BNB", "XRP": "XRP", "ADA": "Cardano",
        "DOGE": "Dogecoin", "DOT": "Polkadot", "AVAX": "Avalanche",
        "MATIC": "Polygon", "LINK": "Chainlink", "TRX": "TRON",
        "LTC": "Litecoin", "TON": "Toncoin", "SHIB": "Shiba Inu",
        "BCH": "Bitcoin Cash", "ATOM": "Cosmos", "NEAR": "NEAR Protocol",
        "ETC": "Ethereum Classic", "XLM": "Stellar", "APT": "Aptos",
        "ARB": "Arbitrum", "OP": "Optimism",
    }
    name = common_names.get(base)
    if not name:
        return None
    return {
        "name": name, "sector": "Crypto", "industry": "Cryptocurrency",
        "market_cap": None, "currency": "USD",
        "listing_date": None, "source": "ccxt-static",
    }


@app.get("/v1/quote")
def get_quote(ticker: str, days: int = 30) -> dict:
    """Tiny quote endpoint for the /decision page's MarketHeader strip.

    Routes the ticker to the right adapter (US / A-share / Crypto) using the
    same _auto_route_market logic as the decision pipeline, then asks the
    adapter for the last N days of OHLCV via `get_price_history()`. Returns
    a compact JSON shape the frontend can render into a sparkline + price
    delta without further normalisation:

        {
          ticker, market, currency,
          ohlcv: [{date, open, high, low, close, volume}, ...],
          current: float,     // most recent close
          prev:    float,     // previous close (for change calc)
          change:  float,     // current - prev
          changePct: float,   // (change / prev) * 100
          asof: ISO timestamp,
          source_status: "ok" | "unavailable",
        }

    Designed to graceful-degrade: if the adapter can't reach the upstream
    (yfinance rate-limited, akshare network error), returns 200 with
    `source_status="unavailable"` and an empty `ohlcv` so the frontend can
    show a "no data" placeholder rather than a red error.
    """
    days = max(7, min(days, 365))  # clamp to sensible window
    effective_market = _auto_route_market(ticker, "us_equity")
    end = date.today()
    start = end - timedelta(days=int(days * 1.6) + 7)  # buffer for weekends

    try:
        from trading_agents.adapters import get_adapter
        adapter = get_adapter(effective_market)
        quotes = adapter.get_price_history(ticker, start, end)
    except Exception as e:
        log.warning("primary adapter failed for %s: %s — trying multi-source fallback", ticker, e)
        quotes = []

    # If we got no history from the primary adapter AND this is A-share,
    # try Tencent/Sina for at least the current quote so the UI isn't empty.
    if (not quotes) and effective_market == "a_share":
        try:
            from trading_agents.adapters.cn_stock_multi_source import fetch_a_share_quote_multi
            q = fetch_a_share_quote_multi(ticker)
        except Exception as e:
            log.warning("multi-source fallback also failed for %s: %s", ticker, e)
            q = None
        if q and q.get("current") is not None:
            # Synthesise a single-day OHLCV record so the response is well-formed.
            today = date.today().isoformat()
            current = q["current"]
            prev = q.get("prev") or current
            return {
                "ticker": ticker,
                "market": effective_market,
                "currency": "CNY",
                "ohlcv": [{
                    "date": today,
                    "open":  q.get("open")  or current,
                    "high":  q.get("high")  or current,
                    "low":   q.get("low")   or current,
                    "close": current,
                    "volume": (q.get("volume_lots") or 0) * 100,
                    "volume_lots":  q.get("volume_lots") or 0,
                    "turnover_cny": q.get("turnover_cny") or 0,
                }],
                "current": current,
                "prev": prev,
                "change": current - prev,
                "changePct": ((current - prev) / prev * 100.0) if prev else 0.0,
                "today_volume_lots":  q.get("volume_lots"),
                "today_turnover_cny": q.get("turnover_cny"),
                "asof": datetime.now(tz=timezone.utc).isoformat(),
                "source_status": "ok",
                "source": q.get("source") or "multi",  # audit field
                "note": "Single-day snapshot from " + (q.get("source") or "multi-source") + " — historical OHLCV unavailable from primary adapter",
            }

    if not quotes:
        return {
            "ticker": ticker,
            "market": effective_market,
            "currency": _currency_for(effective_market),
            "ohlcv": [],
            "current": None, "prev": None, "change": None, "changePct": None,
            "asof": datetime.now(tz=timezone.utc).isoformat(),
            "source_status": "unavailable",
        }

    # Trim to last `days` rows (adapter may return more)
    rows = quotes[-days:]
    current = rows[-1].close
    prev = rows[-2].close if len(rows) >= 2 else current
    change = current - prev
    change_pct = (change / prev * 100.0) if prev else 0.0

    # For A-share quotes, expose 成交量 in both shares (the standard) and
    # 手 (the way Chinese brokers display it), plus 成交额 (turnover ¥)
    # which retail Chinese investors check before price.
    last_row = rows[-1] if rows else None

    def serialise(q):
        out = {
            "date": q.asof.date().isoformat() if hasattr(q.asof, "date") else str(q.asof)[:10],
            "open":  q.open,
            "high":  q.high,
            "low":   q.low,
            "close": q.close,
            "volume": q.volume,        # shares
        }
        if effective_market == "a_share":
            out["volume_lots"] = q.volume / 100.0
            out["turnover_cny"] = q.volume * q.close  # ≈ vwap×shares; close-anchored
        return out

    return {
        "ticker": ticker,
        "market": effective_market,
        "currency": _currency_for(effective_market),
        "ohlcv": [serialise(q) for q in rows],
        "current": current,
        "prev": prev,
        "change": change,
        "changePct": change_pct,
        "today_volume_shares":  last_row.volume if last_row else None,
        "today_volume_lots":    (last_row.volume / 100.0) if (last_row and effective_market == "a_share") else None,
        "today_turnover_cny":   (last_row.volume * last_row.close) if (last_row and effective_market == "a_share") else None,
        "asof": datetime.now(tz=timezone.utc).isoformat(),
        "source_status": "ok",
    }


def _currency_for(market: str) -> str:
    return {
        "us_equity": "USD",
        "a_share":   "CNY",
        "crypto":    "USD",
    }.get(market, "USD")


@app.get("/v1/markets/hot-rankings/cn")
def cn_hot_rankings(limit: int = 20) -> dict:
    """A-share retail attention ranking, with multi-source fallback.

    Sources tried in order:
        1. Baidu hot search (`stock_hot_search_baidu`) — globally accessible,
           best for non-China deployments like Render Singapore.
        2. EastMoney 个股人气榜 (`stock_hot_rank_em`) — best data quality
           but `emrnweb.eastmoney.com` is geo-blocked from many regions.

    First source that returns non-empty rows wins. If both fail, return 200
    with `source_status="unavailable"` so the frontend shows a friendly
    explanation rather than a red HTTP error.
    """
    fetched_at = datetime.now(tz=timezone.utc).isoformat()

    try:
        import akshare as ak
    except ImportError:
        return {
            "source": "akshare",
            "source_status": "unavailable",
            "fetched_at": fetched_at,
            "rows": [],
            "message": "akshare not installed on this server.",
        }

    # Try Baidu first (more globally accessible)
    try:
        df = ak.stock_hot_search_baidu(symbol="A股", date=date.today().strftime("%Y%m%d"), time="今日")
        if df is not None and not df.empty:
            rows = _normalize_hot_rows(df, limit)
            if rows:
                return {
                    "source": "百度热搜 (A 股)",
                    "source_status": "ok",
                    "fetched_at": fetched_at,
                    "rows": rows,
                }
    except Exception as e:
        log.info("baidu hot search failed (%s); will try EastMoney next", e)

    # Fallback: EastMoney
    try:
        df = ak.stock_hot_rank_em()
        if df is not None and not df.empty:
            rows = _normalize_hot_rows(df, limit)
            if rows:
                return {
                    "source": "EastMoney 个股人气榜",
                    "source_status": "ok",
                    "fetched_at": fetched_at,
                    "rows": rows,
                }
    except Exception as e:
        log.warning("EastMoney hot rank failed (%s)", e)

    return {
        "source": "akshare (multi-source)",
        "source_status": "unavailable",
        "fetched_at": fetched_at,
        "rows": [],
        "message": (
            "暂时无法从百度热搜或东方财富拉到 A 股关注度数据。"
            "请稍后重试。 / Could not fetch A-share attention data from "
            "Baidu hot search or EastMoney. Try again shortly."
        ),
    }


# Minimal landing page redirect for visitors hitting the API root
@app.get("/", include_in_schema=False)
def root() -> dict:
    return {
        "name": "TradingAgents API",
        "docs": "/docs",
        "frontend": cfg.allowed_origins[0] if cfg.allowed_origins else None,
        "disclaimer": "Decision support only. Not investment advice.",
    }
