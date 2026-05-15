"""Langfuse trace wrapper for LLM + agent observability.

Goals:
- Every `LLMRouter.complete()` call shows up as a SPAN in Langfuse with
  tier / model / tokens / usd_cost / latency / system+user prompt / output.
- Every agent NODE (fundamentals, sentiment, news, technical, macro, bull,
  bear, trader, risk, manager) shows up as a parent SPAN that contains
  its LLM call(s) as children — so the Langfuse UI shows a true tree of
  the 7-agent pipeline per decision.
- A top-level `pipeline(ticker, asof)` context manager creates the root
  TRACE so every span inside lands under one navigable decision-trace.
- When Langfuse keys aren't set, every wrapper is a near-zero-overhead
  pass-through (it does still log a one-liner to stdlib `logging` so
  local debugging works even without the cloud).

Env vars:
- LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY — turns on cloud traces
- LANGFUSE_HOST — defaults to https://cloud.langfuse.com (use https://us.cloud.langfuse.com for US region)
- TA_LOCAL_TRACE_LOG=1 — also pretty-print spans to stdout (debugging)

Wire-up:
- `from trading_agents.llm.observability import traced, span, pipeline`
- Decorate node fns:  `@span("analyst.fundamentals")` — captures input/output
- Inside LLMRouter:    `with current_span("llm.complete", attrs={...}): ...`
- Decorate top-level:  `with pipeline("decision", ticker=..., asof=...):`
"""

from __future__ import annotations

import contextvars
import json
import logging
import os
import time
from contextlib import contextmanager
from functools import wraps
from typing import Any, Callable, TypeVar

log = logging.getLogger(__name__)

_client = None
_warned_unavailable = False

# Current Langfuse object that subsequent spans should attach to. May be
# either a Trace (top-level) or a Span (nested). Both expose `.span()` to
# create children. None means "create a fresh top-level trace".
_current = contextvars.ContextVar[Any]("langfuse_current", default=None)


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


def is_enabled() -> bool:
    """True iff Langfuse is configured + reachable (best effort)."""
    return _get_client() is not None


def status() -> dict:
    """Health snapshot used by the /v1/observability/status endpoint.

    Surfaced via the public API so the user can see "is my LLM
    pipeline actually being traced?" without leaving the site.
    """
    pub = os.environ.get("LANGFUSE_PUBLIC_KEY")
    sec_set = bool(os.environ.get("LANGFUSE_SECRET_KEY"))
    host = os.environ.get("LANGFUSE_HOST", "https://cloud.langfuse.com")
    local_log = os.environ.get("TA_LOCAL_TRACE_LOG") == "1"
    try:
        import langfuse  # type: ignore  # noqa: F401
        sdk_present = True
    except ImportError:
        sdk_present = False
    return {
        "langfuse_enabled": is_enabled(),
        "public_key_set": bool(pub),
        "public_key_preview": (pub[:8] + "…") if pub else None,
        "secret_key_set": sec_set,
        "host": host,
        "sdk_installed": sdk_present,
        "local_trace_log": local_log,
    }


def _maybe_local_log(name: str, kind: str, attrs: dict | None = None, output: Any = None):
    """Stdout pretty-print when TA_LOCAL_TRACE_LOG=1. Helps local debug
    without setting up Langfuse cloud."""
    if os.environ.get("TA_LOCAL_TRACE_LOG") != "1":
        return
    try:
        payload = {"kind": kind, "name": name}
        if attrs:
            # Keep payload small — we'll be flooding stdout otherwise.
            payload["attrs"] = {k: (str(v)[:200] if not isinstance(v, (int, float, bool)) else v) for k, v in attrs.items()}
        if output is not None:
            payload["out"] = str(output)[:200]
        log.info("TRACE %s", json.dumps(payload, default=str))
    except Exception:
        pass


@contextmanager
def pipeline(name: str, **trace_attrs):
    """Create the ROOT trace for a decision pipeline.

    Every `span()` / `traced()` opened inside this block is attached as
    a child, so the Langfuse UI shows the whole 7-agent decision as one
    navigable trace tree.

    Usage in api/main.py around the LangGraph invoke():
        with pipeline("decision", ticker=ticker, asof=str(asof)):
            result = graph.invoke(state)
    """
    client = _get_client()
    if client is None:
        _maybe_local_log(name, "pipeline_start", attrs=trace_attrs)
        try:
            yield None
        finally:
            _maybe_local_log(name, "pipeline_end")
        return

    try:
        trace = client.trace(name=name, metadata=trace_attrs)
    except Exception as e:
        log.warning("Langfuse trace() failed: %s", e)
        try:
            yield None
        finally:
            pass
        return

    token = _current.set(trace)
    try:
        yield trace
    except Exception as e:
        try:
            trace.update(output=f"ERROR: {e}", metadata={**trace_attrs, "failed": True})
        except Exception:
            pass
        raise
    finally:
        _current.reset(token)


@contextmanager
def current_span(name: str, **attrs):
    """Open a span attached to the current trace/span, or create a fresh
    top-level trace if nothing is open.

    Use directly when you want to measure a block without changing fn
    signatures — e.g. inside `LLMRouter.complete()` to capture per-LLM
    metadata (tier, model, tokens, usd_cost)."""
    client = _get_client()
    start = time.time()
    if client is None:
        _maybe_local_log(name, "span_start", attrs=attrs)
        try:
            yield None
        finally:
            _maybe_local_log(name, "span_end", attrs={"latency_ms": int((time.time() - start) * 1000)})
        return

    parent = _current.get()
    sp = None
    try:
        if parent is not None:
            sp = parent.span(name=name, metadata=attrs)
        else:
            sp = client.trace(name=name, metadata=attrs)
    except Exception as e:
        log.warning("Langfuse span() failed: %s", e)
        try:
            yield None
        finally:
            pass
        return

    token = _current.set(sp)
    try:
        yield sp
    except Exception as e:
        try:
            sp.update(
                output=f"ERROR: {e}",
                metadata={**attrs, "failed": True, "latency_ms": int((time.time() - start) * 1000)},
            )
        except Exception:
            pass
        raise
    finally:
        _current.reset(token)
        try:
            sp.update(metadata={**attrs, "latency_ms": int((time.time() - start) * 1000)})
            if hasattr(sp, "end"):
                sp.end()
        except Exception:
            pass


F = TypeVar("F", bound=Callable[..., Any])


def span(name: str):
    """Decorator: wrap fn in a span attached to the current trace.

    Captures fn args as input (best-effort string repr, truncated) and
    fn return value as output (truncated). Use on agent NODE functions
    to get hierarchical traces.
    """
    def deco(fn: F) -> F:
        @wraps(fn)
        def wrapper(*args, **kwargs):
            # Best-effort summary of args. We DON'T dump the whole state
            # dict (which is huge); we just record positional arg types
            # and selected kwargs.
            summary: dict[str, Any] = {}
            for k, v in kwargs.items():
                if k in {"adapter", "llm", "pack"}:
                    summary[k] = type(v).__name__
                else:
                    summary[k] = (str(v)[:200] if not isinstance(v, (int, float, bool, type(None))) else v)
            with current_span(name, **summary) as sp:
                result = fn(*args, **kwargs)
                if sp is not None:
                    try:
                        sp.update(output=_short_output(result))
                    except Exception:
                        pass
                return result
        return wrapper  # type: ignore
    return deco


def _short_output(x: Any) -> str:
    """Render a span/trace output safely. Reports are big — we cap to 2KB."""
    try:
        if hasattr(x, "text"):
            return str(x.text)[:2000]
        if isinstance(x, (dict, list)):
            return json.dumps(x, default=str)[:2000]
        return str(x)[:2000]
    except Exception:
        return "<unprintable>"


def traced(name: str) -> Callable[[F], F]:
    """Legacy alias for @span() — kept so prior docstring examples keep
    working. New code should prefer @span(name)."""
    return span(name)


def shutdown() -> None:
    """Flush queued events on app shutdown. FastAPI lifespan calls this."""
    client = _get_client()
    if client is None:
        return
    try:
        client.flush()
        log.info("Langfuse: flushed pending events")
    except Exception as e:
        log.warning("Langfuse flush failed: %s", e)
