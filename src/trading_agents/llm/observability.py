"""Langfuse trace wrapper for LLM calls.

Env-gated, no-op if `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY` aren't set.
Provides a single decorator `traced(name)` that wraps any router `.complete()`
call and pushes a trace to Langfuse's cloud (free tier covers our volume).

Why a custom wrapper rather than the official `@observe` decorator: the
official one assumes you're inside an `async` event loop and `httpx`. Our
router is sync httpx → mixing in their decorator caused event-loop reentrancy
bugs in testing.

Usage:
    from trading_agents.llm.observability import traced

    @traced("analyst.fundamentals")
    def run_fundamentals(...):
        return router.complete(...)

When Langfuse keys aren't set, `traced` is a passthrough — no overhead.
"""

from __future__ import annotations

import logging
import os
import time
from functools import wraps
from typing import Any, Callable, TypeVar

log = logging.getLogger(__name__)

_client = None
_warned_unavailable = False


def _get_client():
    """Lazy-init Langfuse client. None when keys not set OR package missing."""
    global _client, _warned_unavailable
    if _client is not None:
        return _client
    pub = os.environ.get("LANGFUSE_PUBLIC_KEY")
    sec = os.environ.get("LANGFUSE_SECRET_KEY")
    if not pub or not sec:
        return None
    try:
        from langfuse import Langfuse  # type: ignore
    except ImportError:
        if not _warned_unavailable:
            log.warning("LANGFUSE keys set but `langfuse` package not installed")
            _warned_unavailable = True
        return None
    try:
        _client = Langfuse(
            public_key=pub,
            secret_key=sec,
            host=os.environ.get("LANGFUSE_HOST", "https://cloud.langfuse.com"),
        )
    except Exception as e:
        log.warning("Langfuse init failed: %s", e)
        return None
    return _client


F = TypeVar("F", bound=Callable[..., Any])


def traced(name: str) -> Callable[[F], F]:
    """Wrap an LLM-calling function. Logs latency + (best-effort) tokens.

    Falls through silently when Langfuse isn't configured — production code
    can use this decorator unconditionally with zero overhead at import.
    """
    def deco(fn: F) -> F:
        @wraps(fn)
        def wrapper(*args, **kwargs):
            client = _get_client()
            if client is None:
                return fn(*args, **kwargs)
            start = time.time()
            try:
                trace = client.trace(name=name)
            except Exception:
                # Don't let observability errors propagate
                return fn(*args, **kwargs)
            try:
                result = fn(*args, **kwargs)
                latency_ms = int((time.time() - start) * 1000)
                try:
                    trace.update(
                        output=str(getattr(result, "text", result))[:2000],
                        metadata={"latency_ms": latency_ms},
                    )
                except Exception:
                    pass
                return result
            except Exception as e:
                try:
                    trace.update(
                        output=f"ERROR: {e}",
                        metadata={"failed": True, "latency_ms": int((time.time() - start) * 1000)},
                    )
                except Exception:
                    pass
                raise
        return wrapper  # type: ignore
    return deco


def shutdown() -> None:
    """Flush queued events on app shutdown. FastAPI calls this on stop."""
    client = _get_client()
    if client is None:
        return
    try:
        client.flush()
    except Exception:
        pass
