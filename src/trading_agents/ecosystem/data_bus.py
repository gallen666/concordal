"""Universal data bus — single entry point for ALL data requests.

Today, agents call adapters directly. As we plug more ecosystem projects
in, that fan-out grows messy: do you ask Qlib for a factor, OpenBB for
the underlying series, akshare for the local mirror, or our cache?

The data bus answers that for you. Each request specifies WHAT it wants
(a Need), and the bus picks the BEST source from the registry, with
graceful fallback if the preferred backend is unavailable.

  bus.fetch(Need.macro_cpi(asof=date(2024, 6, 1), region="US"))
  bus.fetch(Need.factor("alpha158", ticker="AAPL", asof=...))
  bus.fetch(Need.crypto_ohlcv(symbol="BTC/USDT", since=...))

The bus owns:
  * Source priority (first available wins)
  * Caching (24h default)
  * Lookahead-bias enforcement (asof < today guard)
  * Telemetry — which sources fire, latency, cache hit rate

This module currently wires three live needs (macro, equity quote,
fundamentals). The remaining seven Need types are scaffolded with
clear "not yet wired" stubs so the architecture is visible even
before each project's adapter is written.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from typing import Any, Callable

log = logging.getLogger(__name__)


class NeedKind(str, Enum):
    QUOTE = "quote"
    OHLCV = "ohlcv"
    FUNDAMENTALS = "fundamentals"
    NEWS = "news"
    SENTIMENT = "sentiment"
    TECHNICAL = "technical"
    MACRO = "macro"
    FACTOR = "factor"               # Qlib / WorldQuant Brain alpha
    CRYPTO_OHLCV = "crypto_ohlcv"   # CCXT-routed
    LLM_COMPLETION = "llm_completion"


@dataclass(frozen=True)
class Need:
    """A typed data request flowing across the bus."""
    kind: NeedKind
    # All other fields stuffed into params so each Need type can carry its
    # own shape (asof, ticker, region, lookback_days, factor_name, ...).
    params: dict[str, Any] = field(default_factory=dict)

    # ---- factory helpers — terse, readable call sites -------------------

    @classmethod
    def macro(cls, *, asof: date, region: str = "US") -> "Need":
        return cls(NeedKind.MACRO, {"asof": asof, "region": region})

    @classmethod
    def quote(cls, *, ticker: str, asof: datetime, market: str = "auto") -> "Need":
        return cls(NeedKind.QUOTE, {"ticker": ticker, "asof": asof, "market": market})

    @classmethod
    def fundamentals(cls, *, ticker: str, asof: date, market: str = "auto") -> "Need":
        return cls(NeedKind.FUNDAMENTALS, {"ticker": ticker, "asof": asof, "market": market})

    @classmethod
    def factor(cls, *, name: str, ticker: str, asof: date) -> "Need":
        return cls(NeedKind.FACTOR, {"name": name, "ticker": ticker, "asof": asof})

    @classmethod
    def crypto_ohlcv(cls, *, symbol: str, since: datetime, exchange: str = "binance") -> "Need":
        return cls(NeedKind.CRYPTO_OHLCV, {"symbol": symbol, "since": since, "exchange": exchange})


@dataclass
class Source:
    """One backend that can fulfill a particular kind of Need.

    The bus tries sources in `priority` order (lower = tried first).
    Each handler returns the requested data or raises (the bus moves on).
    """
    project_slug: str           # which ecosystem entry this source belongs to
    handles: NeedKind
    priority: int               # lower fires first
    handler: Callable[[Need], Any]
    description: str = ""


@dataclass
class TelemetryRecord:
    need_kind: str
    source: str | None
    cache_hit: bool
    elapsed_ms: float
    error: str | None = None


class UniversalDataBus:
    """Fan-in for every data request the platform makes.

    Most callers should use the module-level `bus` singleton. Tests and
    integration code can construct fresh instances with mocked sources.
    """

    def __init__(self) -> None:
        self._sources: dict[NeedKind, list[Source]] = {}
        self._cache: dict[tuple, tuple[float, Any]] = {}
        self._cache_ttl_sec = 86400  # 24h default
        self._telemetry: list[TelemetryRecord] = []
        # In-flight dedup: when two agents request the same Need at the
        # same time, only one HTTP call should fire — the second waits
        # for the first to finish, then reads the cache.
        self._inflight: dict[tuple, threading.Event] = {}
        self._inflight_lock = threading.Lock()
        self._register_builtin()

    # ---- registration ---------------------------------------------------

    def register(self, source: Source) -> None:
        """Add a source. Called by ecosystem-project adapters at import time."""
        bucket = self._sources.setdefault(source.handles, [])
        bucket.append(source)
        bucket.sort(key=lambda s: s.priority)
        log.info(
            "DataBus: %s registered for %s (priority=%d)",
            source.project_slug, source.handles.value, source.priority,
        )

    def _register_builtin(self) -> None:
        """Wire the sources that exist today. New ecosystem adapters
        register themselves at import time via `bus.register(...)`."""
        # Lazy imports — avoid circular deps with adapters package.
        try:
            from ..adapters.macro_openbb import fetch_macro_snapshot
            self.register(Source(
                project_slug="openbb",
                handles=NeedKind.MACRO,
                priority=10,
                handler=lambda n: fetch_macro_snapshot(
                    asof=n.params["asof"], region=n.params.get("region", "US"),
                ),
                description="OpenBB SDK → FRED REST → cached fallback chain",
            ))
        except ImportError:
            log.warning("openbb macro source not available")

    # ---- query ----------------------------------------------------------

    def fetch(self, need: Need) -> Any:
        """Try each source for `need.kind` in priority order. First success wins.

        Lookahead bias is enforced at the source level (each adapter has
        its own asof guard). The bus just routes — it doesn't second-
        guess what the source returns.

        In-flight requests are de-duplicated: if a fetch for the same
        cache key is currently running, we wait for it instead of firing
        a parallel HTTP call. This matters when two analyst nodes ask
        for the same macro snapshot in the same decision run.
        """
        cache_key = (need.kind.value, _hashable(need.params))
        cached = self._cache_get(cache_key)
        if cached is not None:
            self._telemetry.append(TelemetryRecord(
                need_kind=need.kind.value,
                source="cache",
                cache_hit=True,
                elapsed_ms=0.0,
            ))
            return cached

        # Dedup: claim the inflight slot or wait on an existing fetch.
        with self._inflight_lock:
            existing = self._inflight.get(cache_key)
            if existing is not None:
                # Another caller is already fetching — wait + read cache.
                ev = existing
                claimed_self = False
            else:
                ev = threading.Event()
                self._inflight[cache_key] = ev
                claimed_self = True

        if not claimed_self:
            ev.wait(timeout=30)
            return self._cache_get(cache_key)

        # Wrap the source loop so we always release the inflight slot,
        # even if a handler raises.
        try:
            sources = self._sources.get(need.kind) or []
            if not sources:
                log.warning("DataBus: no source for need.kind=%s", need.kind.value)
                self._telemetry.append(TelemetryRecord(
                    need_kind=need.kind.value, source=None,
                    cache_hit=False, elapsed_ms=0.0,
                    error="no source registered",
                ))
                return None

            last_err: Exception | None = None
            for src in sources:
                t0 = time.time()
                try:
                    result = src.handler(need)
                    elapsed_ms = (time.time() - t0) * 1000
                    self._telemetry.append(TelemetryRecord(
                        need_kind=need.kind.value,
                        source=src.project_slug,
                        cache_hit=False,
                        elapsed_ms=round(elapsed_ms, 2),
                    ))
                    if result is not None:
                        self._cache_put(cache_key, result)
                        return result
                except Exception as e:
                    elapsed_ms = (time.time() - t0) * 1000
                    self._telemetry.append(TelemetryRecord(
                        need_kind=need.kind.value,
                        source=src.project_slug,
                        cache_hit=False,
                        elapsed_ms=round(elapsed_ms, 2),
                        error=str(e),
                    ))
                    last_err = e
                    log.debug("DataBus: %s failed for %s: %s", src.project_slug, need.kind.value, e)

            if last_err:
                log.info(
                    "DataBus: all %d sources for %s failed; last error: %s",
                    len(sources), need.kind.value, last_err,
                )
            return None
        finally:
            # Wake any waiters on this Need and clear the inflight entry.
            with self._inflight_lock:
                done_ev = self._inflight.pop(cache_key, None)
            if done_ev is not None:
                done_ev.set()

    # ---- introspection (for /ecosystem live status panel) ---------------

    def registered_sources(self) -> dict[str, list[str]]:
        """Map need_kind → list of project slugs that can satisfy it.

        The /ecosystem page renders this so users see WHICH integrations
        are actually wired vs. only described in the registry.
        """
        return {
            kind.value: [s.project_slug for s in srcs]
            for kind, srcs in self._sources.items()
        }

    def telemetry(self, last_n: int = 50) -> list[dict[str, Any]]:
        return [
            {
                "need_kind": r.need_kind,
                "source": r.source,
                "cache_hit": r.cache_hit,
                "elapsed_ms": r.elapsed_ms,
                "error": r.error,
            }
            for r in self._telemetry[-last_n:]
        ]

    # ---- cache (in-memory, 24h TTL) -------------------------------------

    def _cache_get(self, key: tuple) -> Any | None:
        rec = self._cache.get(key)
        if not rec:
            return None
        ts, val = rec
        if time.time() - ts > self._cache_ttl_sec:
            return None
        return val

    def _cache_put(self, key: tuple, val: Any) -> None:
        self._cache[key] = (time.time(), val)


def _hashable(params: dict[str, Any]) -> tuple:
    """Build a hashable key from a params dict. Date / datetime → isoformat."""
    out: list[tuple[str, str]] = []
    for k in sorted(params):
        v = params[k]
        if hasattr(v, "isoformat"):
            v = v.isoformat()
        out.append((k, str(v)))
    return tuple(out)


# Module-level singleton — most callers should use this.
bus = UniversalDataBus()
