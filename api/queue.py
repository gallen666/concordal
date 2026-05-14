"""Arq-based job queue — Roadmap Phase 4.

The current implementation uses an in-memory `_jobs` dict in `main.py` which
loses everything on every Render restart. This module is the drop-in
replacement using Arq (a lightweight Python-3.10-friendly Redis queue).

Activation:
    1. Add to requirements.txt:  arq==0.26.3   redis==5.0.4
    2. Provision Redis on Render ($1/mo addon) and set REDIS_URL.
    3. Set TA_USE_ARQ=true on Render.

When inactive (no REDIS_URL or TA_USE_ARQ unset), `enqueue()` returns None
and callers fall back to the in-process BackgroundTasks path. Zero risk
to existing flows — purely additive.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Callable

log = logging.getLogger(__name__)


def is_enabled() -> bool:
    return bool(
        os.environ.get("TA_USE_ARQ", "").lower() == "true"
        and os.environ.get("REDIS_URL")
    )


_pool = None
_warned = False


async def _get_pool():
    """Lazy Redis pool. Returns None when arq isn't installed or REDIS_URL unset."""
    global _pool, _warned
    if _pool is not None:
        return _pool
    if not is_enabled():
        return None
    try:
        from arq import create_pool  # type: ignore
        from arq.connections import RedisSettings  # type: ignore
    except ImportError:
        if not _warned:
            log.warning("TA_USE_ARQ=true but `arq` package not installed")
            _warned = True
        return None
    try:
        url = os.environ["REDIS_URL"]
        _pool = await create_pool(RedisSettings.from_dsn(url))
    except Exception as e:
        log.warning("Arq pool init failed: %s", e)
        return None
    return _pool


async def enqueue(function: str, *args, **kwargs) -> str | None:
    """Enqueue a job. `function` is the registered worker function name.

    Returns the job_id, or None when the queue isn't active (caller should
    then run inline via BackgroundTasks).
    """
    pool = await _get_pool()
    if pool is None:
        return None
    try:
        job = await pool.enqueue_job(function, *args, **kwargs)
        return job.job_id if job else None
    except Exception as e:
        log.warning("Arq enqueue failed: %s", e)
        return None


# ---------------------------------------------------------------------------
# Worker registration — to be imported by `worker.py` (Render Worker service).
# ---------------------------------------------------------------------------


async def run_decision_job(ctx, ticker: str, market: str, user_id: str) -> dict:
    """Arq worker entrypoint mirroring `_run_decision_job` in main.py.

    Lives here so the worker process doesn't need to import the FastAPI app.
    Pulls from the same `run_decision()` core function.
    """
    from trading_agents.core.graph import run_decision
    from datetime import date
    log.info("arq decision job: %s %s for %s", ticker, market, user_id)
    result = run_decision(
        ticker=ticker,
        market=market,
        asof=date.today(),
        locale="en",
    )
    return {"ticker": ticker, "result_summary": str(result)[:500]}


# Worker config — `arq worker.WorkerSettings`
class WorkerSettings:
    functions = [run_decision_job]
    redis_settings = None  # populated at startup from REDIS_URL

    @staticmethod
    def on_startup(ctx):
        log.info("Arq worker started")

    @staticmethod
    def on_shutdown(ctx):
        log.info("Arq worker stopped")
