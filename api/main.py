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

# v31: Install global monkey-patch on requests.Session.send to route every
# Chinese-market HTTP call (akshare, xueqiu, eastmoney, etc.) through our
# Vercel HK proxy. This must happen BEFORE any module that initiates
# CN-domain requests is imported.
try:
    from trading_agents.net.cn_proxy_patch import apply_patch as _apply_cn_proxy_patch
    _apply_cn_proxy_patch()
except Exception as _e:
    import logging as _logging
    _logging.getLogger(__name__).warning("[cn_proxy_patch] failed to apply: %s", _e)

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
                # CurrentUser doesn't carry tier directly; look it up
                # from the same source the cap check uses. Defensive
                # getattr so this can't ever crash the pipeline.
                tier=_base_cap_and_tier(user)[1] if hasattr(user, "id") else "unknown",
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
        # v42: CRITICAL race fix — set result + mode BEFORE status="done".
        # Frontend polls /v1/decisions/job/{id} every 1-3s. If poll hits
        # between status="done" and result=..., user sees status=done but
        # result=undefined → frontend stops polling, renders blank page.
        # Order matters: result first, then status.
        _jobs[job_id]["result"] = trace.model_dump(mode="json")
        _jobs[job_id]["mode"] = "real_llm" if user.real_llm else "mock"
        _jobs[job_id]["status"] = "done"
        _persist_job(job_id)  # v43: snapshot final result to SQLite
    except Exception as e:
        log.exception("decision job failed")
        _jobs[job_id]["status"] = "error"
        _jobs[job_id]["error"] = str(e)
        _persist_job(job_id)  # v43: snapshot error too so frontend sees it


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
    # v43: persist immediately so Render redeploys mid-pipeline don't lose the job
    _persist_job(jid)
    return jid


def _persist_job(job_id: str) -> None:
    """v43: snapshot _jobs[job_id] to SQLite. Called on creation + each
    status change so polls survive Render restarts. Fail-silent — never
    breaks the pipeline if the disk write fails."""
    import json as _json
    j = _jobs.get(job_id)
    if not j:
        return
    try:
        # Pydantic models in result are already model_dump'd to JSON-safe dicts
        payload = _json.dumps(j, default=str)
        persistence.put_decision_job(job_id, j.get("user", "anonymous"), payload)
    except Exception as e:
        log.warning("[persist_job] %s failed: %s", job_id, e)


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


@app.get("/v1/chain/full-stack")
def chain_full_stack(ticker: str, lookback_days: int = 90) -> dict:
    """Flagship demo: the FRED → Qlib → Backtrader → Lean chain materialised.

    Every step routes through the UniversalDataBus, so adding a new
    factor library or swapping in a new macro source is one-line registration
    — every downstream layer picks up the new data for free.

    Pipeline:
      1. bus.fetch(Need.MACRO)           — OpenBB / FRED yield curve + CPI
      2. bus.fetch(Need.OHLCV)            — yfinance daily bars (90d window)
      3. bus.fetch(Need.FACTOR)           — Alpha158-lite, computed lazily by
                                            calling bus.fetch(OHLCV) inside —
                                            composability through the spine
      4. signal ensembler                 — deterministic linear combo of
                                            factor signs × macro tilt
      5. mini-backtest                    — flat-weight strategy applied to the
                                            same OHLCV window we just fetched
      6. lean_bridge.decision_to_insight  — JSON the user pastes into a
                                            QuantConnect algorithm

    Designed for transparency, not alpha: every chain step is shown so the
    'whole > sum of parts' claim is auditable instead of hand-wavy."""
    from trading_agents.ecosystem.data_bus import Need, NeedKind
    from trading_agents.execution.lean_bridge import decision_to_insight
    chain_log: list[dict] = []

    def _step(name: str, source: str, started_at: float, extra: dict | None = None) -> None:
        rec = {
            "step": name,
            "source": source,
            "elapsed_ms": round((time.time() - started_at) * 1000, 1),
        }
        if extra:
            rec.update(extra)
        chain_log.append(rec)

    asof_d = date.today() - timedelta(days=1)

    # --- 1. Macro ---------------------------------------------------------
    t0 = time.time()
    try:
        macro = data_bus.fetch(Need.macro(asof=asof_d))
    except Exception:
        macro = None
    _step(
        "macro", "openbb→fred", t0,
        {"got": macro is not None},
    )
    macro_dict = None
    if macro:
        # MacroSnapshot may be a dataclass — pull what we need.
        macro_dict = {
            k: getattr(macro, k, None)
            for k in ("yield_curve_2y10y_bps", "cpi_yoy", "unemployment_rate")
            if hasattr(macro, k)
        }

    # --- 2. OHLCV ---------------------------------------------------------
    t0 = time.time()
    try:
        ohlcv = data_bus.fetch(Need(NeedKind.OHLCV, {
            "ticker": ticker, "asof": asof_d, "lookback_days": lookback_days,
        }))
    except Exception:
        ohlcv = None
    bars = len(ohlcv) if ohlcv else 0
    _step("ohlcv", "yfinance", t0, {"bars": bars})

    if not ohlcv or bars < 30:
        return {
            "ticker": ticker,
            "asof": str(asof_d),
            "chain": chain_log,
            "error": "insufficient OHLCV bars — bus could not fulfil Need.OHLCV",
            "spine_status": data_bus.registered_sources(),
        }

    # --- 3. Factors (Qlib-named, pure-Python) ----------------------------
    t0 = time.time()
    try:
        factors = data_bus.fetch(Need.factor(
            name="alpha158_lite", ticker=ticker, asof=asof_d,
        ))
    except Exception:
        factors = None
    _step(
        "factor", "alpha158_lite", t0,
        {"computed": bool(factors), "n_factors": len(factors) if factors else 0},
    )

    # --- 4. Signal ensemble (deterministic; no LLM call) -----------------
    t0 = time.time()
    factor_sum = 0.0
    if factors:
        for v in factors.values():
            if isinstance(v, (int, float)) and not (v != v):  # not NaN
                factor_sum += max(-2.0, min(2.0, float(v)))
    macro_tilt = 0
    if macro_dict and macro_dict.get("yield_curve_2y10y_bps") is not None:
        macro_tilt = 1 if macro_dict["yield_curve_2y10y_bps"] > 0 else -1
    score = factor_sum * 0.05 + macro_tilt * 0.4
    if score > 0.3:
        side = "BUY"
    elif score < -0.3:
        side = "SELL"
    else:
        side = "HOLD"
    target_weight = max(-0.03, min(0.03, score * 0.01))
    confidence = round(min(0.85, abs(score) / 1.5), 2)
    _step(
        "signal", "deterministic ensembler", t0,
        {"side": side, "score": round(score, 3), "weight": target_weight},
    )

    # --- 5. Mini backtest (hand-rolled flat-weight) -----------------------
    # Apply target_weight constantly across the OHLCV window. Daily P&L =
    # weight * close-to-close return. This is intentionally simple — the
    # full Backtrader cross-validation lives in /v1/backtest and needs a
    # real BacktestResult input.
    t0 = time.time()
    closes = [float(q.close) for q in ohlcv]
    daily_rets = [
        (closes[i] / closes[i - 1] - 1.0) for i in range(1, len(closes))
    ]
    pnl = sum(daily_rets) * target_weight if target_weight else 0.0
    final_eq = 1.0 + pnl
    sharpe = 0.0
    if daily_rets:
        mean_r = sum(daily_rets) / len(daily_rets) * target_weight
        var_r = sum((r * target_weight - mean_r) ** 2 for r in daily_rets) / max(1, len(daily_rets) - 1)
        std_r = var_r ** 0.5
        if std_r:
            sharpe = round((mean_r / std_r) * (252 ** 0.5), 3)
    _step(
        "backtest", "mini in-memory", t0,
        {"days": len(daily_rets), "return_pct": round(pnl * 100, 2), "sharpe": sharpe},
    )

    # --- 6. Lean export ---------------------------------------------------
    t0 = time.time()
    try:
        lean_json = decision_to_insight({
            "ticker": ticker,
            "action": side,
            "confidence": confidence,
            "position_pct": abs(target_weight),
        }).to_lean_json()
    except Exception as e:
        lean_json = {"error": str(e)}
    _step("lean", "lean_bridge.decision_to_insight", t0)

    return {
        "ticker": ticker,
        "asof": str(asof_d),
        "lookback_days": lookback_days,
        "chain": chain_log,
        "macro": macro_dict,
        "factors": factors,
        "signal": {
            "side": side,
            "target_weight": target_weight,
            "confidence": confidence,
            "score": round(score, 3),
        },
        "backtest": {
            "days": len(daily_rets),
            "final_equity": round(final_eq, 4),
            "return_pct": round(pnl * 100, 2),
            "sharpe_annualised": sharpe,
        },
        "lean_insight": lean_json,
        "spine_traversed": [r["step"] for r in chain_log],
    }


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

    # Persistence. v65 tech-#2: when DATABASE_URL points at a managed Postgres
    # (e.g. Supabase), state survives redeploys and the ephemeral-disk warning
    # no longer applies. Only the SQLite-on-/app case is ephemeral.
    data_dir = os.getenv("TA_DATA_DIR", "/app/.tradingagents")
    _pg = bool(os.getenv("DATABASE_URL", "").strip())
    features["persistence"] = {
        "backend": "postgres" if _pg else "sqlite",
        "data_dir": None if _pg else data_dir,
        "warning": (
            ""
            if _pg
            else (
                "ephemeral filesystem detected — decisions wiped on redeploy "
                "(set DATABASE_URL to a managed Postgres to persist)"
                if data_dir.startswith("/app")
                else ""
            )
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


@app.get("/v1/track-record/live")
def get_track_record_live(limit: int = 500) -> dict:
    """v54: aggregate live decision-job stats from SQLite.

    Public, no-auth. Returns:
      - total_decisions  : # of finished jobs in window
      - by_side          : { BUY, HOLD, SELL } counts (only finished w/ result)
      - by_market        : market guess from ticker (US / A-share / crypto)
      - avg_confidence   : mean across finished decisions
      - unique_tickers   : distinct symbol count
      - recent           : last 10 anonymised entries {ticker, side, confidence, asof}

    This is the foundation for /track-record's 'live' section — proves
    the system is actually running, not a demo. Anonymised: no user_id,
    no shareId, no PII. Ticker + side + confidence + asof only.
    """
    import json as _json

    rows = persistence.list_recent_decision_jobs(limit=max(10, min(1000, int(limit))))
    by_side: dict[str, int] = {"BUY": 0, "HOLD": 0, "SELL": 0}
    by_market: dict[str, int] = {"US": 0, "A": 0, "CRYPTO": 0, "OTHER": 0}
    tickers: set[str] = set()
    confs: list[float] = []
    recent: list[dict] = []
    finished_count = 0

    for _jid, payload_json, updated_at in rows:
        try:
            payload = _json.loads(payload_json)
        except Exception:
            continue
        if payload.get("status") != "done":
            continue
        result = payload.get("result") or {}
        decision = result.get("decision") or {}
        side = (decision.get("side") or "").upper()
        if side not in by_side:
            continue  # malformed / interrupted job — skip
        finished_count += 1
        by_side[side] += 1
        try:
            confs.append(float(decision.get("confidence") or 0))
        except (TypeError, ValueError):
            pass
        ticker = (result.get("ticker") or "").upper()
        if ticker:
            tickers.add(ticker)
            # crude market detection: 6-digit numeric → A-share,
            # /USDT-like crypto pair → CRYPTO, else US equity. The
            # backend has a more sophisticated `market` field elsewhere
            # but this guess is enough for the badge.
            if ticker.isdigit() and len(ticker) == 6:
                by_market["A"] += 1
            elif ticker.endswith("USDT") or ticker in {"BTC", "ETH", "SOL"}:
                by_market["CRYPTO"] += 1
            else:
                by_market["US"] += 1
        if len(recent) < 10:
            recent.append({
                "ticker": ticker,
                "side": side,
                "confidence": decision.get("confidence"),
                "asof": result.get("asof"),
                "updated_at": updated_at,
            })

    avg_conf = round(sum(confs) / len(confs), 3) if confs else None
    return {
        "total_decisions": finished_count,
        "by_side": by_side,
        "by_market": by_market,
        "unique_tickers": len(tickers),
        "avg_confidence": avg_conf,
        "recent": recent,
        "window_sample_size": len(rows),
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
    # v43: try in-memory _jobs first (fast path), then SQLite (survives
    # Render redeploys). Previously a Render restart would drop the
    # in-memory dict and any in-flight poll returned 404 "Unknown job",
    # confusing the user. Persistence stays warm across restarts.
    if job_id in _jobs:
        j = _jobs[job_id]
    else:
        import json as _json
        row = persistence.get_decision_job(job_id)
        if not row:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown job")
        user_id, payload_json = row
        try:
            j = _json.loads(payload_json)
        except Exception:
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Job payload corrupted")
        j["user"] = user_id  # ensure user field present
        _jobs[job_id] = j  # warm cache so subsequent polls are fast
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


# ---------------------------------------------------------------------------
# vnpy SignalData export — converts a report or decision to vnpy CtaTemplate
# compatible JSON. Read-only — vnpy users paste into their on_signal() handler.
# ---------------------------------------------------------------------------

@app.get("/v1/vnpy/signal", tags=["execution"])
def vnpy_signal_export(ticker: str, force: bool = False) -> dict:
    """Generate a vnpy-compatible SignalData JSON for an A-share ticker.

    Internally calls /v1/report/full to get the latest decision, then
    converts to vnpy's CtaTemplate signal schema (direction / stop_loss /
    take_profit / size_fraction / support_level). Suitable for ingestion
    into a vnpy strategy via `on_signal(signal)`.
    """
    try:
        from api.report_builder import assemble_report
        from trading_agents.execution.vnpy_bridge import report_to_vnpy_signal
    except Exception as e:
        raise HTTPException(500, f"vnpy bridge import failed: {e}")

    try:
        report = assemble_report(ticker, locale="zh")
        if "error" in report:
            raise HTTPException(400, report.get("error"))
        signal = report_to_vnpy_signal(report)
        return {
            "signal": signal,
            "source_report_id": report.get("report_id"),
            "generated_at": report.get("generated_at"),
            "_note": "Read-only export. Paste into vnpy CtaTemplate.on_signal() handler.",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"vnpy signal generation failed: {e}")


# ---------------------------------------------------------------------------
# FinRL Kelly position-sizing — DRL-inspired risk budgeting helper.
# Pure-math endpoint; no LLM calls; sub-millisecond response.
# ---------------------------------------------------------------------------

@app.get("/v1/finrl/kelly", tags=["execution"])
def finrl_kelly_sizing(
    confidence: float = 0.6,
    hit_rate: float = 0.62,
    expected_return_pct: float = 15.0,
    expected_drawdown_pct: float = 10.0,
    safety_factor: float = 0.25,
) -> dict:
    """Quarter-Kelly position sizing — DRL-equivalent risk budgeting.

    Lightweight stand-in for FinRL's PPO position-sizing agent (which
    requires PyTorch + gym + stable-baselines3 — too heavy for our
    serverless free tier). Returns the same shape FinRL's `act()` would.

    Inputs are percentages (e.g. 15.0 for 15%, NOT 0.15).

    Example: /v1/finrl/kelly?hit_rate=0.7&expected_return_pct=20&expected_drawdown_pct=8
      → Kelly fraction ~5%, suggested range "3-5%"
    """
    try:
        from trading_agents.strategies.finrl_kelly import (
            kelly_position_size,
            to_position_range_string,
        )
        result = kelly_position_size(
            confidence=confidence,
            historical_hit_rate=hit_rate,
            expected_return_pct=expected_return_pct,
            expected_drawdown_pct=expected_drawdown_pct,
            safety_factor=safety_factor,
        )
        return {
            "fraction": result.fraction,
            "fraction_pct": result.fraction_pct,
            "range": to_position_range_string(result),
            "range_low_pct": result.range_low_pct,
            "range_high_pct": result.range_high_pct,
            "kelly_raw": result.kelly_raw,
            "safety_factor": result.safety_factor,
            "method": result.method,
            "rationale": result.rationale,
            "_note": "Inspired by FinRL DRL position sizing — quarter-Kelly default.",
        }
    except Exception as e:
        raise HTTPException(500, f"Kelly sizing failed: {e}")


# ---------------------------------------------------------------------------
# FinGPT vocabulary endpoint — returns the FinNLP-style finance glossary.
# Used by the /ecosystem page to advertise integration coverage.
# ---------------------------------------------------------------------------

@app.get("/v1/fingpt/glossary", tags=["llm"])
def fingpt_glossary_endpoint(max_terms: int = 0) -> dict:
    """Return the FinNLP-style finance vocabulary used to enrich LLM prompts.

    When max_terms=0 (default), returns the full curated set. Otherwise
    truncates to the top N most-cited terms. The same glossary is injected
    into report-builder system prompts (when enabled).
    """
    try:
        from trading_agents.llm.fingpt_glossary import _FINNLP_TERMS, get_term_count
        items = list(_FINNLP_TERMS.items())
        if max_terms > 0:
            items = items[:max_terms]
        return {
            "total_terms": get_term_count(),
            "returned": len(items),
            "vocabulary": [{"zh": zh, "en": en} for zh, en in items],
            "source": "FinNLP corpus (top-frequency) + Wind/iFinD professional terms",
            "license": "MIT (term curation only — no FinGPT weights bundled)",
            "_note": "Inspired by FinGPT — vocabulary anchor only, full SDK not installed.",
        }
    except Exception as e:
        raise HTTPException(500, f"Glossary load failed: {e}")


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


# ---------------------------------------------------------------------------
# Package C — A-share parity endpoints
# ---------------------------------------------------------------------------
# These six endpoints close the most-cited gaps vs 东方财富 / 同花顺:
#   - fund-flow: 主力净流入 individual + sector + market-wide
#   - sectors:    申万行业 + 概念股 daily metrics
#   - zt-pool:    涨停 / 跌停 / 炸板 daily pools
# All free via akshare; the user's Singapore-IP Render still hits them
# fine because akshare proxies through East-money's public CDN, which
# doesn't geo-fence the same way akshare-spot does. (We tested.)
#
# Shape of each response: { status: "ok"|"unavailable", rows: [...] }
# Frontends should treat status="unavailable" as a friendly empty state
# rather than an error — Eastmoney occasionally rate-limits a method,
# and the right UX is "data temporarily missing" not "500 error".


def _rows_to_jsonable(df) -> list[dict]:
    """Coerce a pandas DataFrame's records to JSON-safe primitives.
    Numeric → float; everything else → str (preserves date stamps,
    bilingual labels, etc.). Survives DataFrames with mixed-typed cells
    that East-money loves to return."""
    rows = df.to_dict(orient="records")
    for r in rows:
        for k, v in list(r.items()):
            if v is None:
                r[k] = None
                continue
            try:
                # Bools first — bool is a subclass of int in Python.
                if isinstance(v, bool):
                    r[k] = bool(v)
                elif isinstance(v, (int, float)):
                    r[k] = float(v)
                else:
                    r[k] = str(v)
            except Exception:
                r[k] = str(v)
    return rows


# ---------------------------------------------------------------------------
# CN proxy helper — routes EastMoney/Xueqiu calls through Vercel HK Node
# function (region: hkg1) to bypass Render Singapore's geo-block. Set via
# env var TA_CN_PROXY_BASE (e.g. https://trading-agents-platform.vercel.app).
# Falls back to direct call when env not set (for local dev).
# ---------------------------------------------------------------------------

_CN_PROXY_BASE = os.environ.get(
    "TA_CN_PROXY_BASE", "https://trading-agents-platform.vercel.app"
).rstrip("/")


def _fetch_cn_url_via_proxy(upstream_url: str, timeout: int = 15) -> tuple[int, str]:
    """Fetch a Chinese-market URL through the Vercel HK proxy.

    Returns (status_code, response_text). On proxy failure, returns
    (0, error_message).

    v35: For URLs ≥1.5K chars (where GET ?upstream= triggers Vercel edge
    URL-length 502), pass the upstream URL via X-Cn-Proxy-Upstream header
    instead. Headers have 8K+ limit on default nginx config — comfortable.
    """
    import urllib.parse
    import requests
    proxy_get_url = f"{_CN_PROXY_BASE}/api/cn-proxy?upstream={urllib.parse.quote(upstream_url, safe='')}"
    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    }
    try:
        if len(proxy_get_url) >= 1500:
            # Long URL — use header path
            hdr = dict(headers)
            hdr["X-Cn-Proxy-Upstream"] = upstream_url
            r = requests.get(
                f"{_CN_PROXY_BASE}/api/cn-proxy",
                timeout=timeout,
                headers=hdr,
            )
        else:
            r = requests.get(proxy_get_url, timeout=timeout, headers=headers)
        return r.status_code, r.text
    except Exception as e:
        return 0, f"proxy fetch failed: {e}"


def _eastmoney_clist_via_proxy(
    *,
    fs: str,
    fields: str,
    fid: str = "f3",
    po: int = 1,
    pn: int = 1,
    pz: int = 200,
    extra: dict | None = None,
) -> list[dict]:
    """Generic EastMoney push2/api/qt/clist/get fetcher routed via cn-proxy.
    Returns a list of raw f*-keyed dicts; caller renames fields for display.
    """
    params: list[str] = [
        f"pn={pn}", f"pz={pz}", f"po={po}", "np=1",
        "fltt=2", "invt=2",
        f"fs={fs}", f"fid={fid}", f"fields={fields}",
    ]
    if extra:
        for k, v in extra.items():
            params.append(f"{k}={v}")
    url = "https://push2.eastmoney.com/api/qt/clist/get?" + "&".join(params)
    status, body = _fetch_cn_url_via_proxy(url)
    if status != 200 or not body:
        return []
    try:
        import json as _json
        data = _json.loads(body).get("data") or {}
        diff = data.get("diff") or []
        if isinstance(diff, list):
            return [item for item in diff if isinstance(item, dict)]
        if isinstance(diff, dict):
            return [item for item in diff.values() if isinstance(item, dict)]
        return []
    except Exception as e:
        log.warning("eastmoney push2 clist parse failed: %s", e)
        return []


def _eastmoney_fund_flow_rank_via_proxy() -> list[dict]:
    """Direct EastMoney push2 call via Vercel HK proxy, bypassing akshare
    which calls eastmoney from-process (and gets blocked on Singapore IP).

    The push2 endpoint /api/qt/clist/get with the right field codes is what
    EastMoney's own UI uses for the 主力净流入排行 table. Field codes:
      f12=代码, f14=名称, f2=最新价, f3=涨跌幅,
      f62=主力净流入-净额, f184=主力净流入-净占比,
      f66=超大单净流入-净额, f72=大单净流入-净额,
      f78=中单净流入-净额, f84=小单净流入-净额
    """
    fields = ",".join([
        "f12", "f14", "f2", "f3",
        "f62", "f184", "f66", "f72", "f78", "f84",
    ])
    url = (
        "https://push2.eastmoney.com/api/qt/clist/get"
        "?pn=1&pz=200&po=1&np=1&fltt=2&invt=2"
        "&fs=m:0+t:6+f:!2,m:0+t:13+f:!2,m:0+t:80+f:!2,m:1+t:2+f:!2,m:1+t:23+f:!2,m:0+t:7+f:!2,m:1+t:3+f:!2"
        f"&fid=f62&fields={fields}"
    )
    status, body = _fetch_cn_url_via_proxy(url)
    if status != 200 or not body:
        return []
    try:
        import json as _json
        data = _json.loads(body).get("data") or {}
        diff = data.get("diff") or []
        # EastMoney returns either list-of-dicts or dict-of-dicts; normalise.
        rows: list[dict] = []
        if isinstance(diff, list):
            iter_ = diff
        elif isinstance(diff, dict):
            iter_ = list(diff.values())
        else:
            return []
        for item in iter_:
            if not isinstance(item, dict):
                continue
            rows.append({
                "代码": item.get("f12"),
                "名称": item.get("f14"),
                "最新价": item.get("f2"),
                "涨跌幅": item.get("f3"),
                "主力净流入-净额": item.get("f62"),
                "主力净流入-净占比": item.get("f184"),
                "超大单净流入-净额": item.get("f66"),
                "大单净流入-净额": item.get("f72"),
                "中单净流入-净额": item.get("f78"),
                "小单净流入-净额": item.get("f84"),
            })
        return rows
    except Exception as e:
        log.warning("eastmoney push2 parse failed: %s", e)
        return []


@app.get("/v1/cn/fund-flow/individual", tags=["markets"])
def cn_fund_flow_individual(market: str = "沪深A股", top: int = 50) -> dict:
    """Top individual-stock 主力净流入 ranking — fetches directly from
    EastMoney push2 via our Vercel HK proxy to bypass Render Singapore
    geo-block.

    v37: Switched to single-market fs (m:0+t:6) instead of multi-market
    comma-joined fs. The multi-market form returned empty; single-market
    via _eastmoney_clist_via_proxy is the same pattern as fund-flow/sectors
    which is proven working. We do multiple single-market calls and merge.
    """
    # Each (fs_code, market_label) covers one Chinese market segment
    # m:0+t:6 = 沪市A股, m:0+t:80 = 创业板, m:0+t:13 = 深市A股, etc.
    market_fs = [
        ("m:0+t:6", "沪市A股"),
        ("m:0+t:80", "深市A股"),
        ("m:1+t:2", "沪市A股"),
        ("m:1+t:23", "创业板"),
        ("m:0+t:7", "科创板"),
    ]
    fields = "f12,f14,f2,f3,f62,f184,f66,f72,f78,f84"

    combined: list[dict] = []
    for fs, _ in market_fs[:2]:  # Just try first 2 markets to keep URL count low
        try:
            # v38: use retry helper for transient push2 blocks
            diff = _retry_clist_via_proxy(
                fs=fs, fields=fields, fid="f62", po=1, pz=50, attempts=3,
            )
            for d in diff:
                combined.append({
                    "代码": d.get("f12"),
                    "名称": d.get("f14"),
                    "最新价": d.get("f2"),
                    "涨跌幅": d.get("f3"),
                    "主力净流入-净额": d.get("f62"),
                    "主力净流入-净占比": d.get("f184"),
                    "超大单净流入-净额": d.get("f66"),
                    "大单净流入-净额": d.get("f72"),
                    "中单净流入-净额": d.get("f78"),
                    "小单净流入-净额": d.get("f84"),
                })
        except Exception as e:
            log.info("fund-flow market %s failed: %s", fs, e)

    cache_key = "fund-flow/individual"
    if combined:
        # Sort by 主力净流入-净额 desc, take top N
        combined.sort(
            key=lambda r: r.get("主力净流入-净额") or 0,
            reverse=True,
        )
        payload = {
            "status": "ok",
            "market": market,
            "rows": combined[: max(10, min(top, 200))],
            "source": "eastmoney via cn-proxy (short-url multi-market)",
        }
        _cache_put(cache_key, payload)
        return payload

    # Fallback: try akshare directly (will likely fail with long URL too)
    try:
        import akshare as ak
        df = ak.stock_individual_fund_flow_rank(indicator="今日")
        if df is not None and not df.empty:
            df = df.head(max(10, min(top, 200)))
            payload = {
                "status": "ok",
                "market": market,
                "rows": _rows_to_jsonable(df),
                "source": "akshare/eastmoney (fallback)",
            }
            _cache_put(cache_key, payload)
            return payload
    except Exception as e:
        log.info("fund-flow akshare fallback failed: %s", e)

    # v39: stale-while-revalidate
    stale = _cache_get_stale(cache_key)
    if stale:
        age = _cache_age_min(cache_key)
        return {
            **stale,
            "source": f"{stale.get('source','cached')} | stale ({age}m ago)",
            "stale": True,
        }
    return {"status": "unavailable", "market": market, "message": "push2 临时不可达, 已重试 3 次", "rows": []}


@app.get("/v1/cn/fund-flow/sectors", tags=["markets"])
def cn_fund_flow_sectors(kind: str = "industry") -> dict:
    """板块资金流向 — industry-level (申万) or concept-level (theme)
    daily flow ranking. Showing this side-by-side with the individual
    flow above is east-money's standard 'see the rotation' view.

    kind ∈ {"industry", "concept"}.
    """
    # Primary: Vercel HK proxy → EastMoney push2 board flow
    # fs="m:90 t:2 f:!50" = 概念板块 ; "m:90 t:3 f:!50" = 行业板块
    fs = "m:90+t:3+f:!50" if kind != "concept" else "m:90+t:2+f:!50"
    fields = "f12,f14,f2,f3,f62,f184,f66,f72,f78,f84,f204,f205,f206"
    cache_key = f"fund-flow/sectors/{kind}"  # v39: separate cache per kind
    diff = _retry_clist_via_proxy(fs=fs, fields=fields, fid="f62", po=1, pz=80, attempts=3)
    if diff:
        rows = [{
            "代码":           d.get("f12"),
            "名称":           d.get("f14"),
            "最新价":         d.get("f2"),
            "涨跌幅":         d.get("f3"),
            "主力净流入-净额": d.get("f62"),
            "主力净流入-净占比": d.get("f184"),
            "超大单净流入-净额": d.get("f66"),
            "大单净流入-净额":  d.get("f72"),
            "中单净流入-净额":  d.get("f78"),
            "小单净流入-净额":  d.get("f84"),
            "领涨股":         d.get("f204"),
            "领涨股涨跌幅":   d.get("f206"),
        } for d in diff]
        payload = {
            "status": "ok",
            "kind": kind,
            "rows": rows,
            "source": "eastmoney via vercel-hk-proxy",
        }
        _cache_put(cache_key, payload)
        return payload

    # Fallback: akshare direct (works locally, fails on Singapore)
    try:
        import akshare as ak
        if kind == "concept":
            df = ak.stock_sector_fund_flow_rank(indicator="今日", sector_type="概念资金流")
        else:
            df = ak.stock_sector_fund_flow_rank(indicator="今日", sector_type="行业资金流")
        if df is not None and not df.empty:
            df = df.head(80)
            payload = {
                "status": "ok",
                "kind": kind,
                "rows": _rows_to_jsonable(df),
                "source": "akshare/eastmoney (direct fallback)",
            }
            _cache_put(cache_key, payload)
            return payload
    except Exception as e:
        log.info("[fund-flow-sectors] akshare fallback failed: %s", e)

    # v39: stale-while-revalidate
    stale = _cache_get_stale(cache_key)
    if stale:
        age = _cache_age_min(cache_key)
        return {
            **stale,
            "source": f"{stale.get('source','cached')} | stale ({age}m ago)",
            "stale": True,
        }
    return {"status": "unavailable", "kind": kind, "message": "push2 临时不可达, 已重试 3 次", "rows": []}


@app.get("/v1/cn/fund-flow/market", tags=["markets"])
def cn_fund_flow_market(days: int = 30) -> dict:
    """Market-wide net inflow time series, last N days. Shows whether
    money is flowing into A-shares as a whole — leading indicator
    retail tracks every morning."""
    # Primary: Vercel HK proxy → EastMoney push2/api/qt/dpsj/get for market flow
    import json as _json
    url = (
        "https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get"
        "?lmt=0&klt=101&secid=1.000001&secid2=0.399001"
        "&fields1=f1,f2,f3,f7"
        "&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65"
    )
    status, body = _fetch_cn_url_via_proxy(url)
    if status == 200 and body:
        try:
            data = _json.loads(body).get("data") or {}
            klines = data.get("klines") or []
            # Each kline string: "date,主力净额,小单净额,中单净额,大单净额,超大单净额,主力净占比,..."
            rows: list[dict] = []
            for k in klines[-max(7, min(days, 180)):]:
                parts = k.split(",")
                if len(parts) < 6:
                    continue
                try:
                    rows.append({
                        "日期":            parts[0],
                        "主力净流入-净额": float(parts[1]) if parts[1] else None,
                        "小单净流入-净额": float(parts[2]) if parts[2] else None,
                        "中单净流入-净额": float(parts[3]) if parts[3] else None,
                        "大单净流入-净额": float(parts[4]) if parts[4] else None,
                        "超大单净流入-净额": float(parts[5]) if parts[5] else None,
                        "上证-收盘价": float(parts[11]) if len(parts) > 11 and parts[11] else None,
                        "上证-涨跌幅": float(parts[12]) if len(parts) > 12 and parts[12] else None,
                    })
                except (ValueError, IndexError):
                    continue
            if rows:
                return {
                    "status": "ok",
                    "rows": rows,
                    "source": "eastmoney via vercel-hk-proxy",
                }
        except Exception as e:
            log.warning("eastmoney market flow parse failed: %s", e)

    # Fallback: akshare
    try:
        import akshare as ak
    except ImportError:
        return {"status": "unavailable", "message": "akshare not installed and proxy returned empty", "rows": []}
    try:
        df = ak.stock_market_fund_flow()
        if df is None or df.empty:
            return {"status": "unavailable", "message": "akshare returned empty", "rows": []}
        df = df.tail(max(7, min(days, 180)))
        return {
            "status": "ok",
            "rows": _rows_to_jsonable(df),
            "source": "akshare/eastmoney (direct fallback)",
        }
    except Exception as e:
        log.warning("fund-flow-market fetch failed: %s", e)
        return {"status": "unavailable", "message": str(e), "rows": []}


# v36: 申万 28-industry list with Tencent qt.gtimg.cn fallback.
# When push2.eastmoney.com is unreachable (Vercel HK ↔ EastMoney transient
# blocks), we fall back to Tencent's industry-index quotes which are served
# from a CDN with much broader IP whitelist tolerance.
_SHENWAN_INDUSTRY_CODES: list[tuple[str, str]] = [
    ("sh.881101", "农林牧渔"), ("sh.881102", "采掘"),       ("sh.881103", "化工"),
    ("sh.881104", "钢铁"),     ("sh.881105", "有色金属"),    ("sh.881106", "电子"),
    ("sh.881107", "家用电器"), ("sh.881108", "食品饮料"),    ("sh.881109", "纺织服装"),
    ("sh.881110", "轻工制造"), ("sh.881111", "医药生物"),    ("sh.881112", "公用事业"),
    ("sh.881113", "交通运输"), ("sh.881114", "房地产"),      ("sh.881115", "商业贸易"),
    ("sh.881116", "休闲服务"), ("sh.881117", "综合"),       ("sh.881118", "建筑材料"),
    ("sh.881119", "建筑装饰"), ("sh.881120", "电气设备"),    ("sh.881121", "国防军工"),
    ("sh.881122", "计算机"),   ("sh.881123", "传媒"),       ("sh.881124", "通信"),
    ("sh.881125", "银行"),     ("sh.881126", "非银金融"),    ("sh.881127", "汽车"),
    ("sh.881128", "机械设备"),
]


def _tencent_sectors_industry() -> list[dict]:
    """Fetch 申万行业 quotes via Tencent qt.gtimg.cn batch endpoint.
    Returns list of rows with 板块名称, 最新点位, 涨跌幅, 涨跌额."""
    import requests
    codes = ",".join(code.replace(".", "") for code, _ in _SHENWAN_INDUSTRY_CODES)
    url = f"https://qt.gtimg.cn/q={codes}"
    try:
        # Goes via monkey-patched session — will route through cn-proxy
        r = requests.get(url, timeout=12, headers={
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
            "Referer": "https://gu.qq.com/",
        })
        if r.status_code != 200 or not r.text:
            return []
        # Response format: v_sh881101="...~农林牧渔~881101~3120.5~3098.2~3120.5~...~~..."
        rows: list[dict] = []
        for line in r.text.splitlines():
            line = line.strip()
            if not line or not line.startswith("v_"):
                continue
            # Strip prefix and trailing ;
            try:
                eq = line.index("=")
                value = line[eq + 1:].rstrip(";").strip('"')
                parts = value.split("~")
                if len(parts) < 10:
                    continue
                name = parts[1]
                code = parts[2]
                latest = float(parts[3]) if parts[3] else 0.0
                prev_close = float(parts[4]) if parts[4] else latest
                chg_amt = latest - prev_close if prev_close else 0.0
                chg_pct = (chg_amt / prev_close * 100) if prev_close else 0.0
                # Tencent 板块指数 also reports turnover at parts[36] (近似)
                rows.append({
                    "板块名称": name,
                    "板块代码": code,
                    "最新价": round(latest, 2),
                    "涨跌额": round(chg_amt, 2),
                    "涨跌幅": round(chg_pct, 2),
                })
            except Exception:
                continue
        return rows
    except Exception as e:
        log.warning("tencent sectors fetch failed: %s", e)
        return []


def _retry_clist_via_proxy(*, fs: str, fields: str, fid: str = "f3", po: int = 1, pz: int = 100, attempts: int = 3) -> list[dict]:
    """v38: Wrap _eastmoney_clist_via_proxy with retry. push2.eastmoney.com
    reachability from Vercel HK is intermittent — retry 3× with 1s delay
    catches transient windows."""
    import time
    for i in range(attempts):
        diff = _eastmoney_clist_via_proxy(fs=fs, fields=fields, fid=fid, po=po, pz=pz)
        if diff:
            return diff
        if i < attempts - 1:
            time.sleep(1.0)
    return []


# v39: stale-while-revalidate cache for CN market endpoints. push2.eastmoney.com
# has 10-30-min OFF windows; without cache the frontend sits at "Loading…"
# during the entire OFF window. With 5-min stale fallback, users see slightly
# stale data instead of an empty page during outages.
import time as _time

_CN_CACHE: dict[str, tuple[float, dict]] = {}
_CN_CACHE_TTL_SECS = 300  # 5 min


def _cache_get_stale(key: str) -> dict | None:
    """Return cached value if present and < TTL old, else None."""
    entry = _CN_CACHE.get(key)
    if not entry:
        return None
    ts, data = entry
    if _time.time() - ts > _CN_CACHE_TTL_SECS:
        return None
    return data


def _cache_put(key: str, data: dict) -> None:
    """Store value with current timestamp."""
    _CN_CACHE[key] = (_time.time(), data)


def _cache_age_min(key: str) -> int:
    """Age of cache entry in minutes (rounded), 999 if missing."""
    entry = _CN_CACHE.get(key)
    if not entry:
        return 999
    return int((_time.time() - entry[0]) / 60)


@app.get("/v1/cn/sectors/industry", tags=["markets"])
def cn_sectors_industry() -> dict:
    """申万行业 list with current-day metrics.

    v39: stale-while-revalidate — when push2 is in OFF window, return
    last good data within 5 min instead of empty page.
    """
    cache_key = "sectors/industry"
    diff = _retry_clist_via_proxy(
        fs="m:90+t:2",
        fields="f12,f14,f2,f3,f4,f8,f20,f62,f184,f104,f105,f128",
        fid="f3",
        po=1,
        pz=100,
        attempts=3,
    )
    if diff:
        rows = [{
            "代码": d.get("f12"),
            "名称": d.get("f14"),
            "最新价": d.get("f2"),
            "涨跌幅": d.get("f3"),
            "涨跌额": d.get("f4"),
            "换手率": d.get("f8"),
            "总市值": d.get("f20"),
            "主力净流入": d.get("f62"),
            "主力净流入占比": d.get("f184"),
            "上涨家数": d.get("f104"),
            "下跌家数": d.get("f105"),
            "领涨股": d.get("f128"),
        } for d in diff]
        payload = {
            "status": "ok",
            "rows": rows,
            "source": "eastmoney via cn-proxy (short-url path)",
        }
        _cache_put(cache_key, payload)
        return payload

    # Fallback: akshare (may 502 on long URLs but try in case it ever works)
    try:
        import akshare as ak
        df = ak.stock_board_industry_name_em()
        if df is not None and not df.empty:
            payload = {
                "status": "ok",
                "rows": _rows_to_jsonable(df),
                "source": "akshare/eastmoney (fallback)",
            }
            _cache_put(cache_key, payload)
            return payload
    except Exception as e:
        log.info("[sectors] akshare fallback failed: %s", e)

    # v39: stale-while-revalidate — both fresh paths failed; return cached if available
    stale = _cache_get_stale(cache_key)
    if stale:
        age = _cache_age_min(cache_key)
        return {
            **stale,
            "source": f"{stale.get('source','cached')} | stale ({age}m ago, push2 retrying)",
            "stale": True,
        }

    return {
        "status": "unavailable",
        "message": "push2 临时不可达, 已重试 3 次. 请 1 分钟后再试",
        "rows": [],
    }


@app.get("/v1/cn/sectors/concept", tags=["markets"])
def cn_sectors_concept() -> dict:
    """概念股 (AI / 半导体 / 新能源 ...) list with current metrics."""
    try:
        import akshare as ak
    except ImportError:
        return {"status": "unavailable", "message": "akshare not installed", "rows": []}
    try:
        df = ak.stock_board_concept_name_em()
        if df is None or df.empty:
            return {"status": "unavailable", "message": "akshare returned empty", "rows": []}
        return {
            "status": "ok",
            "rows": _rows_to_jsonable(df),
            "source": "akshare/eastmoney",
        }
    except Exception as e:
        log.warning("sectors-concept fetch failed: %s", e)
        return {"status": "unavailable", "message": str(e), "rows": []}


@app.get("/v1/cn/zt-pool", tags=["markets"])
def cn_zt_pool(kind: str = "zt", date_str: str | None = None) -> dict:
    """涨停 / 跌停 / 炸板 daily pool. The CN short-term trader's
    homepage. East-money calls this 涨停股池.

    kind:
      - "zt"     涨停板池        stock_zt_pool_em
      - "dt"     跌停板池        stock_zt_pool_dtgc_em
      - "zbgc"   炸板池          stock_zt_pool_zbgc_em
      - "qgc"    强势股池        stock_zt_pool_strong_em  (fallback)
    """
    d = date_str or date.today().strftime("%Y%m%d")

    # Primary: Vercel HK proxy → EastMoney push2 zt-pool endpoint
    # ZT pool uses a different URL family — datacenter-web.eastmoney.com.
    # Each kind has a different reportName parameter.
    import json as _json
    _kind_to_report = {
        "zt":   "RPT_DAILYBILLBOARD_DETAILS",      # 涨停板池
        "dt":   "RPT_DOWNLIMIT_BILLBOARD",          # 跌停板池
        "zbgc": "RPT_FAILED_BILLBOARD",             # 炸板池
        "qgc":  "RPT_STRONGSHOCK_BILLBOARD",        # 强势股池
    }
    report_name = _kind_to_report.get(kind)
    if report_name:
        url = (
            f"https://datacenter-web.eastmoney.com/api/data/v1/get"
            f"?sortColumns=SECURITY_CODE&sortTypes=1&pageSize=200&pageNumber=1"
            f"&reportName={report_name}"
            f"&columns=ALL&source=WEB&client=WEB"
            f"&filter=(TRADE_DATE%3D%27{d[:4]}-{d[4:6]}-{d[6:8]}%27)"
        )
        status, body = _fetch_cn_url_via_proxy(url)
        if status == 200 and body:
            try:
                data = _json.loads(body)
                result = data.get("result") or {}
                rows = result.get("data") or []
                if rows:
                    return {
                        "status": "ok",
                        "kind": kind,
                        "date": d,
                        "rows": rows,
                        "source": "eastmoney via vercel-hk-proxy",
                    }
            except Exception as e:
                log.warning("eastmoney zt-pool parse failed: %s", e)

    # Fallback: akshare direct
    try:
        import akshare as ak
    except ImportError:
        return {"status": "unavailable", "message": "akshare not installed and proxy returned empty", "rows": []}
    try:
        if kind == "zt":
            df = ak.stock_zt_pool_em(date=d)
        elif kind == "dt":
            df = ak.stock_zt_pool_dtgc_em(date=d)
        elif kind == "zbgc":
            df = ak.stock_zt_pool_zbgc_em(date=d)
        elif kind == "qgc":
            df = ak.stock_zt_pool_strong_em(date=d)
        else:
            return {"status": "unavailable", "message": f"unknown kind '{kind}'", "rows": []}
        if df is None or df.empty:
            return {
                "status": "unavailable",
                "message": "no rows — market closed or akshare upstream empty",
                "rows": [],
            }
        return {
            "status": "ok",
            "kind": kind,
            "date": d,
            "rows": _rows_to_jsonable(df),
            "source": "akshare/eastmoney",
        }
    except Exception as e:
        log.warning("zt-pool fetch failed: %s", e)
        return {"status": "unavailable", "message": str(e), "rows": []}


# ---------------------------------------------------------------------------
# Package D — F10 + 研报 + 公告 per-ticker depth
# ---------------------------------------------------------------------------
# East-money's F10 panels are what users open when they want to KNOW a
# stock, not just see its price. We tap the four most-cited datasets:
#
#   /v1/cn/f10/holders/{ticker}     大股东 + 流通股东        (snapshot table)
#   /v1/cn/f10/restricted/{ticker}  限售解禁 timeline         (calendar)
#   /v1/cn/f10/pledge/{ticker}      股权质押 比例 + 详情      (risk signal)
#   /v1/cn/f10/management/{ticker}  高管 + 大股东 增减持      (insider flow)
#   /v1/cn/research/{ticker}        卖方研报 标题/评级/目标价  (sell-side view)
#   /v1/cn/notice/{ticker}          公司公告 标题/日期/链接    (regulatory)
#
# Every response: {status, ticker, rows, source}. Failures degrade
# gracefully — the /stock/[ticker] page renders an "unavailable" pill
# rather than blowing up the whole panel.
#
# akshare function names sometimes shift between releases; each block
# is wrapped in try/except so an upstream rename doesn't take down the
# rest of the API. Source attribution is a string so the UI can show
# "from East-money" or "from CNINFO" depending on what fired.


def _normalize_cn_ticker(t: str) -> str:
    """Strip whitespace, uppercase, ensure 6-digit shape if numeric."""
    s = (t or "").strip().upper()
    if s.isdigit() and len(s) < 6:
        s = s.zfill(6)
    return s


@app.get("/v1/cn/f10/holders/{ticker}", tags=["markets"])
def cn_f10_holders(ticker: str) -> dict:
    """十大股东 + 十大流通股东 snapshot. East-money's F10 'shareholders'
    tab — the single most-read F10 view because it tells you who owns
    the stock. Tries main shareholders first, falls back to circulating
    shareholders if only those are available."""
    try:
        import akshare as ak
    except ImportError:
        return {"status": "unavailable", "message": "akshare not installed", "rows": []}
    t = _normalize_cn_ticker(ticker)
    try:
        try:
            df = ak.stock_main_stock_holder(stock=t)
            kind = "main"
        except Exception:
            df = ak.stock_circulate_stock_holder(symbol=t)
            kind = "circulate"
        if df is None or df.empty:
            return {"status": "unavailable", "message": "no rows", "rows": []}
        return {
            "status": "ok",
            "ticker": t,
            "kind": kind,
            "rows": _rows_to_jsonable(df.head(20)),
            "source": "akshare/eastmoney",
        }
    except Exception as e:
        log.warning("f10/holders fetch failed for %s: %s", t, e)
        return {"status": "unavailable", "message": str(e), "rows": []}


@app.get("/v1/cn/f10/restricted/{ticker}", tags=["markets"])
def cn_f10_restricted(ticker: str) -> dict:
    """限售解禁 — upcoming unlock dates + shares unlocked + market cap.
    Huge short-term mover; retail tracks 'next-week unlock' obsessively."""
    try:
        import akshare as ak
    except ImportError:
        return {"status": "unavailable", "message": "akshare not installed", "rows": []}
    t = _normalize_cn_ticker(ticker)
    try:
        # Try per-ticker detail first; some akshare versions only ship
        # the queue (all-tickers) function — filter that client-side.
        df = None
        for fn_name in (
            "stock_restricted_release_detail_em",
            "stock_restricted_release_queue_em",
        ):
            fn = getattr(ak, fn_name, None)
            if fn is None:
                continue
            try:
                df = fn(symbol=t) if "detail" in fn_name else fn()
                if df is not None and not df.empty:
                    # Filter the queue function to this ticker if needed.
                    if "queue" in fn_name and "代码" in df.columns:
                        df = df[df["代码"].astype(str).str.contains(t)]
                    break
            except Exception:
                continue
        if df is None or df.empty:
            return {"status": "unavailable", "message": "no rows", "rows": []}
        return {
            "status": "ok",
            "ticker": t,
            "rows": _rows_to_jsonable(df.head(40)),
            "source": "akshare/eastmoney",
        }
    except Exception as e:
        log.warning("f10/restricted fetch failed for %s: %s", t, e)
        return {"status": "unavailable", "message": str(e), "rows": []}


@app.get("/v1/cn/f10/pledge/{ticker}", tags=["markets"])
def cn_f10_pledge(ticker: str) -> dict:
    """股权质押比例 — controlling-shareholder pledged shares as % of total.
    High pledge ratio is a textbook risk flag (forced-selling spiral
    on margin call). East-money surfaces this prominently."""
    try:
        import akshare as ak
    except ImportError:
        return {"status": "unavailable", "message": "akshare not installed", "rows": []}
    t = _normalize_cn_ticker(ticker)
    try:
        # The market-wide ratio table; we filter client-side.
        df = ak.stock_gpzy_pledge_ratio_em()
        if df is None or df.empty:
            return {"status": "unavailable", "message": "akshare returned empty", "rows": []}
        if "股票代码" in df.columns:
            df = df[df["股票代码"].astype(str).str.contains(t)]
        if df.empty:
            return {"status": "unavailable", "message": f"no pledge row for {t}", "rows": []}
        return {
            "status": "ok",
            "ticker": t,
            "rows": _rows_to_jsonable(df.head(1)),
            "source": "akshare/eastmoney",
        }
    except Exception as e:
        log.warning("f10/pledge fetch failed for %s: %s", t, e)
        return {"status": "unavailable", "message": str(e), "rows": []}


@app.get("/v1/cn/f10/management/{ticker}", tags=["markets"])
def cn_f10_management(ticker: str) -> dict:
    """高管/大股东 增减持. 'Insider flow' signal — directors selling
    near the top is one of the cleanest behavioural-finance signals
    in CN markets."""
    try:
        import akshare as ak
    except ImportError:
        return {"status": "unavailable", "message": "akshare not installed", "rows": []}
    t = _normalize_cn_ticker(ticker)
    try:
        # Try a few akshare function names — coverage varies by release.
        df = None
        for fn_name in (
            "stock_management_change_ths",
            "stock_share_change_cninfo",
            "stock_holder_change_em",
        ):
            fn = getattr(ak, fn_name, None)
            if fn is None:
                continue
            try:
                df = fn(symbol=t)
                if df is not None and not df.empty:
                    break
            except Exception:
                continue
        if df is None or df.empty:
            return {"status": "unavailable", "message": "no rows", "rows": []}
        return {
            "status": "ok",
            "ticker": t,
            "rows": _rows_to_jsonable(df.head(30)),
            "source": "akshare/eastmoney",
        }
    except Exception as e:
        log.warning("f10/management fetch failed for %s: %s", t, e)
        return {"status": "unavailable", "message": str(e), "rows": []}


@app.get("/v1/cn/research/{ticker}", tags=["markets"])
def cn_research(ticker: str) -> dict:
    """卖方研报 list. Title / rating / target-price / institution.
    Eastmoney aggregates 国内卖方 research — we surface the headline
    line per report. Acts as a market-consensus prior the user can
    compare against our 7-agent verdict."""
    try:
        import akshare as ak
    except ImportError:
        return {"status": "unavailable", "message": "akshare not installed", "rows": []}
    t = _normalize_cn_ticker(ticker)
    try:
        df = None
        for fn_name in ("stock_research_report_em", "stock_zh_a_st_em"):
            fn = getattr(ak, fn_name, None)
            if fn is None:
                continue
            try:
                df = fn(symbol=t)
                if df is not None and not df.empty:
                    break
            except Exception:
                continue
        if df is None or df.empty:
            return {"status": "unavailable", "message": "no rows", "rows": []}
        return {
            "status": "ok",
            "ticker": t,
            "rows": _rows_to_jsonable(df.head(30)),
            "source": "akshare/eastmoney",
        }
    except Exception as e:
        log.warning("research fetch failed for %s: %s", t, e)
        return {"status": "unavailable", "message": str(e), "rows": []}


@app.get("/v1/cn/notice/{ticker}", tags=["markets"])
def cn_notice(ticker: str) -> dict:
    """公司公告. Title + date + url to PDF (CNINFO / 巨潮).
    The regulatory ground-truth — every 8-K-equivalent event lives here."""
    try:
        import akshare as ak
    except ImportError:
        return {"status": "unavailable", "message": "akshare not installed", "rows": []}
    t = _normalize_cn_ticker(ticker)
    try:
        df = None
        for fn_name in ("stock_notice_report", "stock_zh_a_news"):
            fn = getattr(ak, fn_name, None)
            if fn is None:
                continue
            try:
                df = fn(symbol=t) if "notice" in fn_name else fn(symbol=t)
                if df is not None and not df.empty:
                    break
            except Exception:
                continue
        if df is None or df.empty:
            return {"status": "unavailable", "message": "no rows", "rows": []}
        return {
            "status": "ok",
            "ticker": t,
            "rows": _rows_to_jsonable(df.head(30)),
            "source": "akshare/cninfo",
        }
    except Exception as e:
        log.warning("notice fetch failed for %s: %s", t, e)
        return {"status": "unavailable", "message": str(e), "rows": []}


# ---------------------------------------------------------------------------
# Package E — final breadth pass: 大宗交易 / ETF / 港股 / 财经日历
# ---------------------------------------------------------------------------
# These are the remaining MISSING_BUT_DATA_AVAILABLE categories from the
# audit. None is opened daily by typical retail (vs C-block 资金流向
# which IS daily), but their absence is what makes east-money users feel
# we're "still a partial product". Closing them gets us to ~95% feature
# parity on data breadth. The wedge stays the LLM layer on top.


@app.get("/v1/cn/block-trade", tags=["markets"])
def cn_block_trade(date_str: str | None = None, top: int = 50) -> dict:
    """大宗交易 daily summary — block trades > 30 万股 or > 200 万元.
    East-money's '大宗交易' tab. Daily summary first, fall back to
    transaction-detail if summary fn unavailable. Useful tell: when
    a block trade clears at a HUGE discount to spot, that's usually
    a 大股东 cashing out via the OTC channel."""
    try:
        import akshare as ak
    except ImportError:
        return {"status": "unavailable", "message": "akshare not installed", "rows": []}
    try:
        d = date_str or date.today().strftime("%Y%m%d")
        df = None
        for fn_name in ("stock_dzjy_sctj", "stock_dzjy_mrmx", "stock_dzjy_mrtj"):
            fn = getattr(ak, fn_name, None)
            if fn is None:
                continue
            try:
                df = fn(start_date=d, end_date=d) if fn_name == "stock_dzjy_mrmx" else fn()
                if df is not None and not df.empty:
                    break
            except Exception:
                continue
        if df is None or df.empty:
            return {"status": "unavailable", "message": "no rows", "rows": []}
        return {
            "status": "ok",
            "date": d,
            "rows": _rows_to_jsonable(df.head(max(10, min(top, 200)))),
            "source": "akshare/eastmoney",
        }
    except Exception as e:
        log.warning("block-trade fetch failed: %s", e)
        return {"status": "unavailable", "message": str(e), "rows": []}


@app.get("/v1/cn/etf/spot", tags=["markets"])
def cn_etf_spot() -> dict:
    """ETF spot list — current price / NAV / 净值溢价率 / 成交额.
    Default sort is by 成交额 desc so the user sees the most-liquid
    ETFs first (510300 / 510500 / 159915 etc)."""
    try:
        import akshare as ak
    except ImportError:
        return {"status": "unavailable", "message": "akshare not installed", "rows": []}
    try:
        df = ak.fund_etf_spot_em()
        if df is None or df.empty:
            return {"status": "unavailable", "message": "akshare returned empty", "rows": []}
        # Sort by 成交额 if column exists; else leave akshare's order.
        if "成交额" in df.columns:
            try:
                df = df.sort_values("成交额", ascending=False)
            except Exception:
                pass
        return {
            "status": "ok",
            "rows": _rows_to_jsonable(df.head(200)),
            "source": "akshare/eastmoney",
        }
    except Exception as e:
        log.warning("etf-spot fetch failed: %s", e)
        return {"status": "unavailable", "message": str(e), "rows": []}


@app.get("/v1/cn/fund/open-daily", tags=["markets"])
def cn_fund_open_daily() -> dict:
    """Open-end mutual fund daily NAV table. Companion to ETF spot;
    useful for users tracking active funds (not just ETF baskets)."""
    try:
        import akshare as ak
    except ImportError:
        return {"status": "unavailable", "message": "akshare not installed", "rows": []}
    try:
        df = None
        for fn_name in ("fund_open_fund_daily_em", "fund_open_fund_info_em"):
            fn = getattr(ak, fn_name, None)
            if fn is None:
                continue
            try:
                df = fn()
                if df is not None and not df.empty:
                    break
            except Exception:
                continue
        if df is None or df.empty:
            return {"status": "unavailable", "message": "no rows", "rows": []}
        return {
            "status": "ok",
            "rows": _rows_to_jsonable(df.head(200)),
            "source": "akshare/eastmoney",
        }
    except Exception as e:
        log.warning("fund-open-daily fetch failed: %s", e)
        return {"status": "unavailable", "message": str(e), "rows": []}


@app.get("/v1/hk/spot", tags=["markets"])
def hk_spot(top: int = 100) -> dict:
    """港股 spot list. Roughly 2000 listed names; we return top N by
    成交额 (default 100). Users typically only care about the top
    100-200 — beyond that liquidity drops off a cliff."""
    try:
        import akshare as ak
    except ImportError:
        return {"status": "unavailable", "message": "akshare not installed", "rows": []}
    try:
        df = ak.stock_hk_spot_em()
        if df is None or df.empty:
            return {"status": "unavailable", "message": "akshare returned empty", "rows": []}
        if "成交额" in df.columns:
            try:
                df = df.sort_values("成交额", ascending=False)
            except Exception:
                pass
        df = df.head(max(20, min(top, 500)))
        return {
            "status": "ok",
            "rows": _rows_to_jsonable(df),
            "source": "akshare/eastmoney",
        }
    except Exception as e:
        log.warning("hk-spot fetch failed: %s", e)
        return {"status": "unavailable", "message": str(e), "rows": []}


@app.get("/v1/cn/calendar", tags=["markets"])
def cn_calendar(days: int = 14) -> dict:
    """财经日历 — upcoming macro releases (CPI / PMI / FOMC) + IPO
    calendar + dividend ex-dates. Multi-source fallback because
    akshare's calendar functions are particularly inconsistent across
    releases."""
    try:
        import akshare as ak
    except ImportError:
        return {"status": "unavailable", "message": "akshare not installed", "rows": []}
    try:
        df = None
        used_fn = None
        for fn_name in (
            "news_economic_baidu",
            "tool_trade_date_hist_sina",
            "news_cctv",
        ):
            fn = getattr(ak, fn_name, None)
            if fn is None:
                continue
            try:
                df = fn()
                if df is not None and not df.empty:
                    used_fn = fn_name
                    break
            except Exception:
                continue
        if df is None or df.empty:
            return {"status": "unavailable", "message": "no rows", "rows": []}
        # Best-effort filter to "next N days" if a date column exists.
        date_cols = [c for c in df.columns if "日期" in c or "date" in c.lower() or "时间" in c]
        if date_cols and days > 0:
            from datetime import timedelta as _td
            cutoff_lo = date.today() - _td(days=2)
            cutoff_hi = date.today() + _td(days=days)
            try:
                df["__d"] = pd_to_datetime(df[date_cols[0]])
                df = df[(df["__d"] >= str(cutoff_lo)) & (df["__d"] <= str(cutoff_hi))]
                df = df.drop(columns=["__d"], errors="ignore")
            except Exception:
                pass
        return {
            "status": "ok",
            "source_fn": used_fn,
            "rows": _rows_to_jsonable(df.head(60)),
            "source": "akshare",
        }
    except Exception as e:
        log.warning("calendar fetch failed: %s", e)
        return {"status": "unavailable", "message": str(e), "rows": []}


def pd_to_datetime(s):
    """Wrap pandas.to_datetime in a lazy import so the module doesn't
    pull pandas in until somebody asks for the calendar."""
    import pandas as _pd
    return _pd.to_datetime(s, errors="coerce")


# ---------------------------------------------------------------------------
# Package F — natural-language Q&A (问财 clone)
# ---------------------------------------------------------------------------
# 同花顺's 问财 is the single sticky feature of their app — users type
# free-form questions and get back ranked-tickers + structured answers.
# We can match it AND go one step further: every suggested ticker is
# clickable into the 7-agent debate, which they don't have.
#
# Architecture:
#   1. POST /v1/ask {question, locale}
#   2. Backend extracts mentioned tickers (regex 6-digit + uppercase US)
#   3. Pre-fetches lightweight context (quote / top fund-flow / sector
#      ranking) so the LLM is grounded in today's data
#   4. Calls LLM (MID tier) with structured system prompt
#   5. LLM returns natural-language answer ENDING WITH a JSON block
#      {tickers_to_research: [...], suggested_next: [...]}
#   6. Backend parses + returns {answer, suggested_tickers,
#      context_used, latency_ms, cost_usd}
#
# Cost guard: capped at MID tier (~$0.001 per call) and answer length
# is bounded so 一次 ask 不会突然花掉 10x 决策成本.


class AskRequest(BaseModel):
    question: str
    locale: str = "zh"


_ASK_SYSTEM_ZH = """你是 TradingAgents 平台的 AI 投研助理。用户用自然语言问你 A 股 / 美股 / 港股 / 加密币的问题。

你的能力:
1. 解读问题意图(对比/解释/筛选/板块/新闻)
2. 用提供的实时数据回答
3. 推荐 2-5 只值得深入研究的 ticker
4. 引导用户用 7-agent 多空辩论做最终决策

规则:
- 不要给具体的买卖建议(那是 7-agent 决策的事)
- 如果数据不足,诚实说"需要看 7-agent 决策"
- 中文回答,数字保留 2 位小数
- 答案末尾必须用 JSON 标注:
  ```json
  {"tickers_to_research": ["600519", "000858"], "suggested_next": "对比这两只白酒龙头"}
  ```

输入会包括:
- USER_QUESTION: 用户原始问题
- CONTEXT: 我们预取的相关数据(若有)
"""

_ASK_SYSTEM_EN = """You are the TradingAgents AI research assistant. Users ask
natural-language questions about A-shares, US equities, HK stocks, or crypto.

Your job:
1. Parse intent (compare / explain / screen / sector / news)
2. Use the provided live data to answer
3. Recommend 2-5 tickers worth deeper research
4. Steer toward our 7-agent bull/bear debate for the actual call

Rules:
- DON'T give buy/sell calls — that's what /decision is for
- If data is thin, say so honestly
- English answer, 2 decimal places for numbers
- ALWAYS end the answer with a JSON block:
  ```json
  {"tickers_to_research": ["AAPL", "NVDA"], "suggested_next": "Compare these two semis"}
  ```

Input includes:
- USER_QUESTION: the raw question
- CONTEXT: pre-fetched live data we think is relevant
"""


def _extract_tickers_from_question(q: str) -> list[str]:
    """Pull 6-digit A-share codes + uppercase 1-5 letter US tickers out
    of the question text. Best-effort — passes false positives downstream
    where they'll just hit /v1/quote and return 'unavailable'."""
    import re
    found = set()
    # 6-digit codes (A-share)
    for m in re.findall(r"\b\d{6}\b", q):
        found.add(m)
    # Uppercase US tickers (length 1-5, common case)
    for m in re.findall(r"\b[A-Z]{1,5}\b", q):
        # Skip common words that look like tickers
        if m in {"I", "A", "AI", "VS", "US", "CN", "HK", "OR", "AND", "THE", "PE", "ROE", "AAPL"}:
            if m == "AAPL":
                found.add(m)
            continue
        found.add(m)
    return list(found)[:6]


def _ask_fetch_context(tickers: list[str], question_lower: str) -> dict:
    """Lightweight pre-fetch — quote for each mentioned ticker, plus
    sector flow if the question mentions 板块 / 行业, plus top fund
    inflows if it mentions 主力 / 资金."""
    ctx: dict = {}
    # Per-ticker quote (≤3 to control cost)
    quotes = []
    for t in tickers[:3]:
        try:
            q = get_quote(ticker=t, days=10)
            if q.get("source_status") == "ok":
                quotes.append({
                    "ticker": t,
                    "name": q.get("name") or None,
                    "current": q.get("current"),
                    "change_pct": q.get("changePct"),
                    "currency": q.get("currency"),
                })
        except Exception:
            pass
    if quotes:
        ctx["quotes"] = quotes

    # Sector / fund-flow context only on demand (these are heavy fetches)
    if any(kw in question_lower for kw in ("板块", "行业", "sector")):
        try:
            sect = cn_fund_flow_sectors(kind="industry")
            if sect.get("status") == "ok":
                ctx["top_sectors_today"] = sect["rows"][:10]
        except Exception:
            pass
    if any(kw in question_lower for kw in ("主力", "资金", "净流入", "fund flow", "inflow")):
        try:
            flow = cn_fund_flow_individual(top=20)
            if flow.get("status") == "ok":
                ctx["top_inflow_today"] = flow["rows"][:10]
        except Exception:
            pass
    if any(kw in question_lower for kw in ("涨停", "limit-up", "limit up", "zt")):
        try:
            zt = cn_zt_pool(kind="zt")
            if zt.get("status") == "ok":
                ctx["zt_pool_today"] = zt["rows"][:20]
        except Exception:
            pass
    return ctx


def _ask_parse_suggestions(answer_text: str) -> dict:
    """Extract the trailing JSON block we ask the LLM to emit.
    Tolerates ```json ... ``` fences and bare {...}. Returns
    {tickers_to_research, suggested_next} or empty dict on miss."""
    import json
    import re
    # Look for last fenced JSON
    m = re.search(r"```(?:json)?\s*(\{.+?\})\s*```", answer_text, re.DOTALL)
    if not m:
        # Bare trailing brace block
        m = re.search(r"(\{[^{}]*\"tickers_to_research\"[^{}]*\})", answer_text, re.DOTALL)
    if not m:
        return {}
    try:
        data = json.loads(m.group(1))
        return {
            "tickers_to_research": [str(t).upper() for t in (data.get("tickers_to_research") or [])][:6],
            "suggested_next": str(data.get("suggested_next") or "")[:300],
        }
    except Exception:
        return {}


@app.post("/v1/ask", tags=["ai"])
def ask(req: AskRequest) -> dict:
    """Natural-language research assistant (问财-style).

    Returns:
      answer: str            free-form LLM answer in user's locale
      tickers_to_research: list[str]   chips the UI links to /decision
      suggested_next: str    one-line CTA for the next user action
      mentioned_tickers: list[str]   tickers extracted from the question
      context_used: list[str]   which datasets we pre-fetched
      cost_usd: float        $-cost of the LLM call
      latency_ms: int        wall-clock latency
    """
    from time import time as _now
    started = _now()
    question = (req.question or "").strip()[:800]
    if not question:
        return {
            "answer": "请输入问题。" if req.locale == "zh" else "Please ask something.",
            "tickers_to_research": [],
            "suggested_next": "",
            "mentioned_tickers": [],
            "context_used": [],
            "cost_usd": 0.0,
            "latency_ms": 0,
        }

    # Extract tickers + pre-fetch context.
    mentioned = _extract_tickers_from_question(question)
    ctx = _ask_fetch_context(mentioned, question.lower())

    # Build the user payload — LLM sees question + JSON-serialised context.
    import json as _json
    user_prompt = (
        f"USER_QUESTION:\n{question}\n\n"
        f"CONTEXT (live data we pre-fetched for you):\n```json\n"
        f"{_json.dumps(ctx, ensure_ascii=False, default=str)[:6000]}\n```"
    )
    system = _ASK_SYSTEM_ZH if req.locale == "zh" else _ASK_SYSTEM_EN

    # Run the LLM via the existing router (Gemini / DeepSeek / Mock chain).
    answer = ""
    cost = 0.0
    try:
        from trading_agents.llm.router import LLMRouter, Tier
        router = LLMRouter(locale=req.locale)
        resp = router.complete(tier=Tier.MID, system=system, user=user_prompt, temperature=0.4)
        answer = resp.text or ""
        cost = float(getattr(resp.usage, "usd_cost", 0.0) or 0.0)
    except Exception as e:
        log.warning("ask LLM failed: %s", e)
        answer = (
            f"AI 暂时不可用 ({e}). 请直接对 ticker 跑 /decision 决策。"
            if req.locale == "zh" else
            f"AI temporarily unavailable ({e}). Run /decision on the ticker directly."
        )

    parsed = _ask_parse_suggestions(answer)
    suggested_tickers = parsed.get("tickers_to_research", [])
    if not suggested_tickers and mentioned:
        # Fallback: if the LLM didn't emit JSON, surface tickers we
        # already extracted from the question so the chips still render.
        suggested_tickers = mentioned

    return {
        "answer": answer,
        "tickers_to_research": suggested_tickers,
        "suggested_next": parsed.get("suggested_next", ""),
        "mentioned_tickers": mentioned,
        "context_used": list(ctx.keys()),
        "cost_usd": round(cost, 6),
        "latency_ms": int((_now() - started) * 1000),
    }


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

    # 5-7. Historical OHLCV providers — added because /chain needs ≥30 bars
    # and the current-snapshot tests above don't catch geo-blocking on the
    # /history/ endpoints (different hostnames, different CDN policies).
    history_results: list[dict] = []
    try:
        from trading_agents.adapters.cn_stock_multi_source import (
            fetch_a_share_history_tencent,
            fetch_a_share_history_sina,
            fetch_a_share_history_yfinance,
        )
        for fn, label in [
            (fetch_a_share_history_tencent,  "history.tencent"),
            (fetch_a_share_history_sina,     "history.sina"),
            (fetch_a_share_history_yfinance, "history.yfinance"),
        ]:
            t0 = time.time()
            try:
                rows = fn(ticker, lookback_days=90)
                n_rows = len(rows) if rows else 0
                history_results.append({
                    "source":     label,
                    "ok":         n_rows >= 5,
                    "n_bars":     n_rows,
                    "first_date": rows[0]["date"] if rows else None,
                    "last_date":  rows[-1]["date"] if rows else None,
                    "latency_ms": int((time.time() - t0) * 1000),
                    "error":      None if n_rows >= 5 else f"only {n_rows} bars",
                })
            except Exception as e:
                history_results.append({
                    "source": label, "ok": False, "n_bars": 0,
                    "first_date": None, "last_date": None,
                    "latency_ms": int((time.time() - t0) * 1000),
                    "error": str(e)[:200],
                })
    except ImportError as e:
        history_results.append({"source": "history", "ok": False, "n_bars": 0,
                                "first_date": None, "last_date": None,
                                "latency_ms": 0, "error": f"import: {e}"})

    return {
        "ticker": ticker,
        "sources": out,
        "history": history_results,
        "summary": {
            "n_ok":     sum(1 for s in out if s.get("ok")),
            "n_failed": sum(1 for s in out if not s.get("ok")),
            "history_n_ok":  sum(1 for h in history_results if h.get("ok")),
            "history_winner": next(
                (h["source"] for h in history_results if h.get("ok")), None,
            ),
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


# ---- v56: Equity-research skills (ported from anthropics/financial-services-plugins) ----

@app.post("/v1/equity-research/earnings-preview", tags=["equity-research"])
def equity_research_earnings_preview(ticker: str, locale: str = "en") -> dict:
    """Pre-earnings scenario analysis (4 scenarios + key metrics + trade
    idea). Methodology ported from Anthropic's equity-research/skills/
    earnings-preview. Output is data-integrity gated — every numeric
    field is cross-checked against the ground-truth quote before
    return, and a fabricated price triggers a `data_integrity_passed=
    false` envelope rather than a hallucinated report."""
    from trading_agents.skills import earnings_preview
    return earnings_preview.run(ticker=ticker.upper(), locale=locale)


@app.post("/v1/equity-research/thesis-tracker", tags=["equity-research"])
def equity_research_thesis_tracker(
    ticker: str,
    locale: str = "en",
    user: CurrentUser = Depends(get_optional_user),
) -> dict:
    """Investment thesis with thesis-breakers + catalyst pipeline +
    health score. Anchored to the user's prior decision history on
    this ticker (if any) so the thesis evolves with their narrative."""
    from trading_agents.skills import thesis_tracker
    # Pull user's prior decisions on this ticker (defensive — empty list if no history)
    prior: list[dict] = []
    try:
        history = memory.user_history(user_id=user.id, limit=200)
        for d in history:
            if (getattr(d, "ticker", "") or "").upper() == ticker.upper():
                prior.append({
                    "asof": str(getattr(d, "asof", "")),
                    "side": getattr(d, "side", ""),
                    "confidence": getattr(d, "confidence", None),
                    "target_weight": getattr(d, "target_weight", None),
                    "rationale": (getattr(d, "rationale", "") or "")[:200],
                })
    except Exception:
        pass
    return thesis_tracker.run(ticker=ticker.upper(), prior_decisions=prior, locale=locale)


@app.post("/v1/equity-research/screen", tags=["equity-research"])
def equity_research_screen(payload: dict) -> dict:
    """Stock screening — applies user criteria to a candidate universe,
    returns ranked watchlist + top-3 deep-dive thesis snippets. v59:
    when payload['universe'] is empty OR has fewer than 5 tickers, we
    auto-fill from /v1/cn/zt-pool + a curated US/HK universe so the
    user doesn't need to maintain a list manually."""
    from trading_agents.skills import idea_generation
    criteria = payload.get("criteria") or {}
    universe = payload.get("universe") or []
    locale = payload.get("locale", "en")
    if len(universe) < 5:
        universe = list(universe) + _autofill_universe(criteria)
    return idea_generation.run(criteria=criteria, universe=universe, locale=locale)


def _autofill_universe(criteria: dict) -> list[dict]:
    """v59: heuristic universe expander. Pulls top movers from existing
    market endpoints. Hard-coded lists are honest about being a starting
    point — the validator will reject any LLM output that references
    tickers outside this set, so we mark the boundary clearly."""
    market = (criteria.get("market") or "us_equity").lower()
    out: list[dict] = []
    # US large-cap canonical universe — curated, not LLM-derived.
    if market in ("us_equity", "us", "auto"):
        sector = (criteria.get("sector") or "").lower()
        if "semi" in sector:
            out = [{"ticker": t, "sector": "semiconductors"} for t in
                   ["NVDA", "AMD", "TSM", "AVGO", "QCOM", "MU", "ARM", "INTC", "AMAT", "LRCX"]]
        elif "tech" in sector or "software" in sector:
            out = [{"ticker": t, "sector": "tech"} for t in
                   ["AAPL", "MSFT", "GOOGL", "META", "AMZN", "NVDA", "ORCL", "CRM", "ADBE", "NFLX"]]
        elif "finance" in sector or "bank" in sector:
            out = [{"ticker": t, "sector": "financials"} for t in
                   ["JPM", "BAC", "WFC", "GS", "MS", "BLK", "SCHW", "C", "AXP", "V"]]
        elif "energy" in sector:
            out = [{"ticker": t, "sector": "energy"} for t in
                   ["XOM", "CVX", "COP", "SLB", "EOG", "PSX", "MPC", "VLO"]]
        else:
            out = [{"ticker": t, "sector": "diversified"} for t in
                   ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "JPM", "XOM", "JNJ"]]
        return out
    # A-share: pull zt-pool first (live data)
    if market in ("a_share", "cn", "china"):
        try:
            from trading_agents.adapters.cn_stock_multi_source import fetch_zt_pool_multi
            pool = fetch_zt_pool_multi(limit=20)
            return [{"ticker": p.get("ticker"), "sector": p.get("sector") or "A-share"} for p in (pool or []) if p.get("ticker")]
        except Exception:
            # Fallback: hard-coded blue-chips
            return [{"ticker": t, "sector": "A-share"} for t in
                    ["600519", "300750", "002594", "000001", "600036", "601318", "600276", "300059"]]
    return out


# ---- v58: 6 additional skills --------------------------------------------

@app.post("/v1/equity-research/earnings-analysis", tags=["equity-research"])
def equity_research_earnings_analysis(ticker: str, locale: str = "en") -> dict:
    """Post-earnings update — beat/miss decomposition + revised estimates."""
    from trading_agents.skills import earnings_analysis
    return earnings_analysis.run(ticker=ticker.upper(), locale=locale)


@app.post("/v1/equity-research/initiating-coverage", tags=["equity-research"])
def equity_research_initiating_coverage(ticker: str, locale: str = "en") -> dict:
    """Full initiation — thesis + valuation + risks + price target + rating."""
    from trading_agents.skills import initiating_coverage
    return initiating_coverage.run(ticker=ticker.upper(), locale=locale)


@app.post("/v1/equity-research/model-update", tags=["equity-research"])
def equity_research_model_update(ticker: str, locale: str = "en") -> dict:
    """Structured estimate changes with delta_pct + rationale per row."""
    from trading_agents.skills import model_update
    return model_update.run(ticker=ticker.upper(), locale=locale)


@app.post("/v1/equity-research/morning-note", tags=["equity-research"])
def equity_research_morning_note(payload: dict) -> dict:
    """Trading desk morning note across a watchlist."""
    from trading_agents.skills import morning_note
    watchlist = payload.get("watchlist") or []
    locale = payload.get("locale", "en")
    return morning_note.run(watchlist=list(watchlist), locale=locale)


@app.post("/v1/equity-research/sector-overview", tags=["equity-research"])
def equity_research_sector_overview(sector: str, locale: str = "en") -> dict:
    """Sector landscape + themes + headwinds + portfolio recommendations."""
    from trading_agents.skills import sector_overview
    return sector_overview.run(sector=sector, locale=locale)


@app.post("/v1/equity-research/catalyst-calendar", tags=["equity-research"])
def equity_research_catalyst_calendar(payload: dict) -> dict:
    """Upcoming catalysts across a watchlist over a horizon."""
    from trading_agents.skills import catalyst_calendar
    watchlist = payload.get("watchlist") or []
    horizon = int(payload.get("horizon_days", 90))
    locale = payload.get("locale", "en")
    return catalyst_calendar.run(watchlist=list(watchlist), horizon_days=horizon, locale=locale)


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


@app.get("/v1/datasource/health", tags=["report"])
def datasource_health() -> dict:
    """Live probe of every data source. Returns latency_ms + ok flag for
    each, plus an overall health_status (ok / degraded / down). Used by
    the /v1/datasource/health page + scheduled cron canary."""
    try:
        from . import data_fetcher
        return data_fetcher.probe_all_sources()
    except Exception as e:
        log.exception("/v1/datasource/health failed")
        raise HTTPException(500, f"health probe failed: {type(e).__name__}: {e}")


@app.get("/v1/datasource/cross-validate", tags=["report"])
def datasource_cross_validate(ticker: str) -> dict:
    """For a given ticker, hit 3 quote sources and report:
      - each source's price + diff_pct vs median
      - consensus (>=2 sources within 5%)
      - flag if any one disagrees by > 15% (likely stale)

    Designed so a user (or a debug script) can quickly verify whether a
    ticker's price is reliable across upstreams. The report builder uses
    the same primitive internally on every report generation.
    """
    try:
        from . import data_fetcher
        t = (ticker or "").strip().upper()
        if not data_fetcher.fetch_quote_a_share:  # sanity
            raise HTTPException(500, "data_fetcher not loaded")
        cv = data_fetcher.cross_validate_price(t)
        return {
            "ticker": t,
            "median": cv.median,
            "sources_total": cv.sources_total,
            "sources_agreed": cv.sources_agreed,
            "consensus": cv.consensus,
            "reliable": cv.is_reliable,
            "details": cv.details,
        }
    except HTTPException:
        raise
    except Exception as e:
        log.exception("/v1/datasource/cross-validate failed")
        raise HTTPException(500, f"cross-validate failed: {type(e).__name__}: {e}")


@app.get("/v1/report/full", tags=["report"])
def get_full_report(ticker: str, force: bool = False, locale: str = "zh", debug: bool = False) -> dict:
    """Build a full 11-section investment research report for `ticker`.

    Supports A-share (6-digit) tickers. Result is the ReportData shape
    the /report/[ticker] page consumes. 24h SQLite cache — set `force=true`
    to bypass.

    Tradeoff vs /decision: we do NOT run the full 7-agent debate (60-90s).
    Instead we fetch facts (quote / fundamentals / technical) and ask a
    single LLM call to fill in narrative-heavy sections. End-to-end
    ~8-15s. Users wanting full debate depth click "跑 7-agent 决策" on
    the report.

    All exceptions are caught and converted to clean JSON error responses
    so the frontend never sees an opaque "Internal Server Error" page.
    """
    # Wrap EVERYTHING in try/except — even the import — so any failure
    # returns a clean JSON detail instead of bubbling to Starlette which
    # would emit a plain-text 500.
    t = (ticker or "").strip().upper()
    if not t:
        raise HTTPException(400, "ticker required")

    try:
        from . import report_builder as rb
    except Exception as e:
        log.exception("/v1/report/full: report_builder import failed")
        raise HTTPException(500, f"report_builder import failed: {type(e).__name__}: {e}")

    try:
        kind = rb.classify_ticker(t)
    except Exception as e:
        log.exception("/v1/report/full: classify_ticker failed")
        raise HTTPException(500, f"classify_ticker failed: {type(e).__name__}: {e}")

    if kind == "unsupported":
        raise HTTPException(
            400,
            "Only A-share (6 digits) is supported in this release. HK / US / Crypto coming soon.",
        )
    if kind == "hk_equity":
        raise HTTPException(400, "港股专用 adapter 即将推出。当前仅支持 A 股 6 位代码。")

    if not force:
        try:
            cached = rb.get_cached(t)
        except Exception as e:
            log.warning("[report.cache] get failed for %s: %s", t, e)
            cached = None
        if cached:
            cached.setdefault("_cache_status", "hit")
            return cached

    try:
        report = rb.assemble_report(t, locale=locale)
    except Exception as e:
        log.exception("/v1/report/full: assemble_report failed for %s", t)
        raise HTTPException(500, f"assemble_report failed: {type(e).__name__}: {e}")

    if not isinstance(report, dict):
        raise HTTPException(500, f"assemble_report returned non-dict ({type(report).__name__})")

    if report.get("error"):
        raise HTTPException(400, str(report.get("error")))

    report["_cache_status"] = "miss"
    if debug:
        try:
            report["_debug"] = {
                "llm": rb.get_last_llm_diagnostics(),
                "facts_summary": {
                    "current_price": report.get("summary", {}).get("current_price"),
                    "name": report.get("name"),
                },
            }
        except Exception as e:
            report["_debug"] = {"error": f"diag fetch failed: {type(e).__name__}: {e}"}
    try:
        rb.put_cache(t, report)
    except Exception as e:
        log.warning("[report.cache] put failed for %s: %s", t, e)
    return report


# Minimal landing page redirect for visitors hitting the API root
@app.get("/", include_in_schema=False)
def root() -> dict:
    return {
        "name": "TradingAgents API",
        "docs": "/docs",
        "frontend": cfg.allowed_origins[0] if cfg.allowed_origins else None,
        "disclaimer": "Decision support only. Not investment advice.",
    }
