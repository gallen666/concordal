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
from trading_agents.ecosystem.data_bus import bus as data_bus
from trading_agents.ecosystem.registry import to_json as ecosystem_json, stats as ecosystem_stats
from trading_agents.memory.reflection import collect_lessons
from trading_agents.memory.store import MemoryStore

from .auth import (
    CurrentUser,
    RedeemRequest,
    TokenResponse,
    get_current_user,
    get_optional_user,
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

# Public, read-only registry of shared decisions. Created when a user
# explicitly clicks Share on their decision result. Values are the raw
# DecisionTrace JSON (anonymous — we don't store who created the share),
# and we cap the dict to 5_000 entries with simple LRU eviction so it
# fits in Render-free-tier memory and resets cleanly on redeploy.
_shared_decisions: dict[str, dict[str, Any]] = {}
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
_FREE_DAILY_CAP = int(os.environ.get("TA_FREE_DAILY_DECISIONS", "5"))
# Anonymous (no JWT) gets a smaller cap because they share an IP-derived key
# in some deployments and we don't want to gift unauth'd quota.
_ANON_DAILY_CAP = int(os.environ.get("TA_ANON_DAILY_DECISIONS", "2"))
_daily_count: dict[tuple[str, str], int] = {}  # (user_id, "YYYY-MM-DD") -> count


def _daily_cap_check(user: CurrentUser) -> None:
    """Enforce per-user daily decision cap for free-tier users.

    Returns None on success; raises HTTPException(402) when the user has
    used up their daily allotment, with an `X-Upgrade-Url` header so the
    frontend can deep-link to /pricing#pro on the response.
    """
    if user.real_llm:
        return  # Pro/Team users have their own (much higher) limits
    today = datetime.utcnow().strftime("%Y-%m-%d")
    key = (user.id, today)
    cap = _ANON_DAILY_CAP if user.id == "anonymous" else _FREE_DAILY_CAP
    used = _daily_count.get(key, 0)
    if used >= cap:
        raise HTTPException(
            status_code=402,                       # Payment Required
            detail={
                "error": "daily_cap_exceeded",
                "message": (
                    f"You've used your daily {cap} free decisions. "
                    "Upgrade to Pro for ~30/day."
                ),
                "used": used,
                "cap": cap,
                "upgrade_url": "/pricing#pro",
                "tier": "pro",
            },
        )
    _daily_count[key] = used + 1


def _daily_cap_status(user: CurrentUser) -> dict:
    """Read-only view used by the frontend's usage banner."""
    if user.real_llm:
        return {"used": 0, "cap": None, "tier": "pro"}
    today = datetime.utcnow().strftime("%Y-%m-%d")
    cap = _ANON_DAILY_CAP if user.id == "anonymous" else _FREE_DAILY_CAP
    used = _daily_count.get((user.id, today), 0)
    return {"used": used, "cap": cap, "tier": "free"}


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
    base = os.environ.get(
        "TA_UPGRADE_URL_" + req.tier.upper(),
        # Default: a Tally / Google Form / waitlist URL
        f"https://tally.so/r/upgrade?tier={req.tier}&user={user.id}",
    )
    return {"url": base, "tier": req.tier}


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


@app.post("/v1/auth/redeem", response_model=TokenResponse)
def auth_redeem(req: RedeemRequest) -> TokenResponse:
    return redeem(req)


@app.get("/v1/auth/me")
def auth_me(user: CurrentUser = Depends(get_current_user)) -> dict:
    return user.model_dump()


@app.post("/v1/decisions", response_model=JobResponse)
def create_decision(
    req: DecisionRequest,
    bg: BackgroundTasks,
    user: CurrentUser = Depends(get_optional_user),
) -> JobResponse:
    if cfg.emergency_stop_decisions:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Decision engine is temporarily disabled. Try again later.",
        )
    _rate_limit(user.id)
    # Free-tier daily cap (Pro/Team skip). Returns 402 with upgrade hint
    # when exceeded — the frontend uses this to switch to a paywall view.
    _daily_cap_check(user)
    jid = _new_job(user)
    bg.add_task(_run_decision_job, jid, req, user)
    return JobResponse(job_id=jid, status="queued")


@app.get("/v1/me/usage")
def get_usage(user: CurrentUser = Depends(get_current_user)) -> dict:
    """Return daily-cap status so the frontend can render a usage badge.

    Output shape: `{used: int, cap: int|null, tier: "free"|"pro"}`.
    `cap=null` means unlimited (Pro/Team).
    """
    return _daily_cap_status(user)


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

    share_id = uuid.uuid4().hex[:12]
    # Strip user-facing fields that are job-internal: we want the public
    # view to be just the decision artifact, not the job metadata.
    payload = {
        "share_id": share_id,
        "result": j["result"],            # the DecisionTrace dict
        "mode": j.get("mode"),            # "real_llm" / "mock" / "cached"
        "lessons_injected": j.get("lessons_injected", False),
        "shared_at": time.time(),
    }
    # LRU eviction: if we hit the cap, drop the oldest 100 entries by
    # `shared_at`. Cheap and simple — share storage is best-effort.
    if len(_shared_decisions) >= _SHARE_LIMIT:
        oldest = sorted(_shared_decisions.items(), key=lambda kv: kv[1].get("shared_at", 0))[:100]
        for k, _ in oldest:
            _shared_decisions.pop(k, None)
    _shared_decisions[share_id] = payload
    return {"share_id": share_id}


@app.get("/v1/decisions/share/{share_id}")
def get_shared_decision(share_id: str) -> dict:
    """Public, no-auth read of a shared decision. Returns 404 if the
    share id is unknown or has been evicted."""
    rec = _shared_decisions.get(share_id)
    if not rec:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Share not found or expired")
    return rec


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
