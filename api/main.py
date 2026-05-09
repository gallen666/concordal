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
from datetime import date, timedelta
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
from trading_agents.memory.store import MemoryStore

from .auth import CurrentUser, RedeemRequest, TokenResponse, get_current_user, redeem
from .config import cfg
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
    version="0.1.0",
    description=(
        "Multi-agent LLM decision-support API. "
        "NOT investment advice. Closed beta."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cfg.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(waitlist_router)

cache = TickerCache()
memory = MemoryStore()


# --- in-memory job + rate-limit (swap to Redis when multi-replica) -------

_jobs: dict[str, dict[str, Any]] = {}
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


# --- background runners --------------------------------------------------


# Ticker syntactic checks per market.
#  - US equities: 1–5 letter codes with optional class suffix (AAPL, BRK-B, BF.B)
#  - A-shares  : 6 digits (301308, 600519, 000001) — akshare picks SH/SZ/BJ
_US_TICKER_RE = re.compile(r"^[A-Z][A-Z0-9.\-]{0,8}$")
_CN_TICKER_RE = re.compile(r"^\d{6}$")


def _is_supported_us_ticker(ticker: str) -> bool:
    s = (ticker or "").upper().strip()
    if not _US_TICKER_RE.fullmatch(s):
        return False
    return any(c.isalpha() for c in s)


def _is_supported_cn_ticker(ticker: str) -> bool:
    return bool(_CN_TICKER_RE.fullmatch((ticker or "").strip()))


def _auto_route_market(ticker: str, market: str) -> str:
    """Auto-detect market when the user typed a ticker that obviously
    belongs to a different market than the one the request came in on.

    Pattern: a 6-digit numeric ticker is unambiguously an A-share code,
    so even if the request says `market="us_equity"` (the frontend default)
    we route it to `a_share`. This means users don't need a market picker
    to try 中文股票.
    """
    if _is_supported_cn_ticker(ticker):
        return "a_share"
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

        # Force mock mode for users not on real-LLM allowlist (cost control).
        prev_mode = os.environ.get("TA_MODE")
        if not user.real_llm:
            os.environ["TA_MODE"] = "mock"
        try:
            trace = run_decision(
                ticker=req.ticker.upper(),
                asof=asof,
                market=req.market,
                debate_rounds=req.debate_rounds,
                user_risk_profile=req.user_risk_profile,
                locale=req.locale,
            )
        finally:
            if prev_mode is None:
                os.environ.pop("TA_MODE", None)
            else:
                os.environ["TA_MODE"] = prev_mode

        cache.put(trace, cache_market)
        memory.append_decision(trace.decision)
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
        bt = Backtester(adapter=adapter)
        end = date.today()
        start = end - timedelta(days=req.days)
        rows = []
        for r in bt.run_all_baselines(req.ticker, start, end):
            rows.append({"name": r.name, "metrics": r.metrics.__dict__})

        # Agent-strategy backtest is expensive. Allow only for real_llm users.
        if not req.baselines_only and user.real_llm:
            def decide_fn(t: str, asof: date):
                return run_decision(
                    ticker=t, asof=asof, market=req.market, debate_rounds=1
                ).decision
            r = bt.run_agent(
                req.ticker, start, end, decide_fn,
                rebalance_every_days=req.rebalance_every_days,
            )
            rows.append({"name": r.name, "metrics": r.metrics.__dict__})

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
    return {
        "status": "ok",
        "version": "0.1.0",
        "env": cfg.env,
        "mode": os.getenv("TA_MODE", "mock"),
        "emergency_stop": cfg.emergency_stop_decisions,
        "disclaimer": "decision_support_only",
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
    user: CurrentUser = Depends(get_current_user),
) -> JobResponse:
    if cfg.emergency_stop_decisions:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Decision engine is temporarily disabled. Try again later.",
        )
    _rate_limit(user.id)
    jid = _new_job(user)
    bg.add_task(_run_decision_job, jid, req, user)
    return JobResponse(job_id=jid, status="queued")


@app.get("/v1/decisions/job/{job_id}")
def get_decision(
    job_id: str,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    if job_id not in _jobs:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown job")
    j = _jobs[job_id]
    if j.get("user") != user.id and user.id != "anonymous":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your job")
    return j


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


# Minimal landing page redirect for visitors hitting the API root
@app.get("/", include_in_schema=False)
def root() -> dict:
    return {
        "name": "TradingAgents API",
        "docs": "/docs",
        "frontend": cfg.allowed_origins[0] if cfg.allowed_origins else None,
        "disclaimer": "Decision support only. Not investment advice.",
    }
