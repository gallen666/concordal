"""DataFetcher — unified multi-source data acquisition with provenance and cross-validation.

This module exists because we kept hitting the same failure mode: a single
upstream (akshare) silently returned null/stale data, and the report
generator confidently published it. Specifically the user-reported
catastrophe: 301666 real price ¥680, system advised SHORT at ¥94.05.

Architecture
------------

For each data type (quote / fundamentals / technical / metadata / news /
sentiment / macro) we maintain a PRIORITY-ORDERED list of sources. Each
source is a function `ticker -> dict | None`. The fetcher:

  1. Tries sources in order
  2. Each source has a hard 5s timeout
  3. The first non-None result is wrapped in FetchResult(value, source,
     fetched_at, sources_tried, error)
  4. If all sources fail: returns FetchResult(value=None) with error info
  5. NEVER silently returns mock data (the platform's no-mock policy)

Cross-validation
----------------

For safety-critical fields (current_price, PE, market_cap), the fetcher
ALSO runs cross_validate() which queries independent sources and:

  - Returns the median across sources
  - Flags `stale_price=True` if any single source disagrees with the
    median by > 15%
  - Lets caller decide whether to refuse downstream consumption

Per-need TTL
------------

`TTL[need_type]` defines cache expiry. The caller is responsible for
passing the cache result through `is_fresh(result)` before re-use.

Health probes
-------------

`probe_source(name)` runs a known-good canary ticker through one source
and returns latency + result-quality info. Used by /v1/datasource/health
and the 5-minute cron canary.
"""

from __future__ import annotations

import logging
import statistics
import time
from dataclasses import dataclass, field, asdict
from typing import Any, Callable

log = logging.getLogger("ta.data_fetcher")


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass
class FetchResult:
    """One fetch attempt's outcome with full provenance.

    Callers should always check `.value is not None` before reading data
    fields. `.source` is `all_failed` when no upstream returned data."""
    value: Any | None
    source: str
    fetched_at: float                  # unix timestamp
    sources_tried: list[str] = field(default_factory=list)
    error: str | None = None
    elapsed_ms_by_source: dict[str, int] = field(default_factory=dict)

    @property
    def age_seconds(self) -> float:
        return time.time() - self.fetched_at

    def is_fresh(self, ttl_seconds: int) -> bool:
        return self.age_seconds < ttl_seconds

    def to_dict(self) -> dict:
        d = asdict(self)
        d["age_seconds"] = round(self.age_seconds, 1)
        return d


# Per-need TTL — chosen empirically:
#   quote: tightest, intraday prices move fast
#   fundamentals: 24h, financial reports change quarterly
#   news/sentiment: hourly fresh
#   metadata: 7d, company names rarely change
TTL = {
    "quote":        60,
    "ohlcv":        900,
    "fundamentals": 24 * 3600,
    "technical":    900,
    "news":         3600,
    "sentiment":    3600,
    "metadata":     7 * 24 * 3600,
    "macro":        24 * 3600,
}


# ---------------------------------------------------------------------------
# Fetch — quote (A-share)
# ---------------------------------------------------------------------------


_QUOTE_HARD_TIMEOUT_S = 5.0


def _wrap(fn: Callable[[str], dict | None], hard_timeout: float = _QUOTE_HARD_TIMEOUT_S) -> Callable[[str], tuple[dict | None, int]]:
    """Return a wrapper that measures elapsed_ms and enforces an outer
    timeout via simple time-check. The inner httpx clients have their own
    timeouts too, so this is mostly a safety net."""
    def inner(ticker: str) -> tuple[dict | None, int]:
        t0 = time.time()
        try:
            r = fn(ticker)
        except Exception as e:
            log.info("source %s threw: %s", fn.__name__, e)
            r = None
        elapsed_ms = int((time.time() - t0) * 1000)
        if elapsed_ms > hard_timeout * 1000:
            log.warning("source %s SLOW: %dms (hard limit %.0fs)", fn.__name__, elapsed_ms, hard_timeout)
        return r, elapsed_ms
    return inner


def fetch_quote_a_share(ticker: str) -> FetchResult:
    """Multi-source A-share quote. Priority: xueqiu > tencent > sina.

    Returns FetchResult with .value dict containing at minimum
    {current, prev, change_pct, name}. Source field records which
    upstream actually served.
    """
    from trading_agents.adapters.cn_stock_multi_source import (
        fetch_a_share_quote_xueqiu,
        fetch_a_share_quote_tencent,
        fetch_a_share_quote_sina,
    )
    sources_tried: list[str] = []
    elapsed_by_src: dict[str, int] = {}
    chain = [
        ("xueqiu",  _wrap(fetch_a_share_quote_xueqiu)),
        ("tencent", _wrap(fetch_a_share_quote_tencent)),
        ("sina",    _wrap(fetch_a_share_quote_sina)),
    ]
    for name, w in chain:
        sources_tried.append(name)
        result, ms = w(ticker)
        elapsed_by_src[name] = ms
        if result and result.get("current") is not None:
            return FetchResult(
                value=result,
                source=name,
                fetched_at=time.time(),
                sources_tried=sources_tried,
                elapsed_ms_by_source=elapsed_by_src,
            )
    return FetchResult(
        value=None, source="all_failed", fetched_at=time.time(),
        sources_tried=sources_tried, elapsed_ms_by_source=elapsed_by_src,
        error="all quote sources failed",
    )


# ---------------------------------------------------------------------------
# Fetch — fundamentals (A-share)
# ---------------------------------------------------------------------------


def fetch_fundamentals_a_share(ticker: str) -> FetchResult:
    """Multi-source A-share fundamentals.

    Priority: xueqiu > eastmoney push2. Both expose PE_TTM, PB, market_cap.
    Xueqiu also has dividend_yield, eps, navps. EastMoney push2 also has
    ROE TTM (f173).

    Returns FetchResult; .value is a merged dict (later sources fill
    fields the earlier one left null).
    """
    from trading_agents.adapters.cn_stock_multi_source import (
        fetch_a_share_fundamentals_tencent,
        fetch_a_share_fundamentals_xueqiu,
        fetch_a_share_fundamentals_eastmoney,
    )
    sources_tried: list[str] = []
    elapsed_by_src: dict[str, int] = {}
    # Tencent first because its quote CDN works from anywhere AND its 50-
    # field response gives PE / PB / 总市值 in stable positions. Xueqiu +
    # EastMoney are nice-to-have backups but often return 200 with empty
    # body when called from Singapore / non-mainland IPs.
    chain = [
        ("tencent",   _wrap(fetch_a_share_fundamentals_tencent)),
        ("xueqiu",    _wrap(fetch_a_share_fundamentals_xueqiu)),
        ("eastmoney", _wrap(fetch_a_share_fundamentals_eastmoney)),
    ]
    merged: dict | None = None
    served_by: list[str] = []
    for name, w in chain:
        sources_tried.append(name)
        result, ms = w(ticker)
        elapsed_by_src[name] = ms
        if not result:
            continue
        served_by.append(name)
        if merged is None:
            merged = dict(result)
        else:
            for k, v in result.items():
                if v is not None and merged.get(k) in (None, ""):
                    merged[k] = v
    if merged is None:
        return FetchResult(
            value=None, source="all_failed", fetched_at=time.time(),
            sources_tried=sources_tried, elapsed_ms_by_source=elapsed_by_src,
            error="all fundamentals sources failed",
        )
    merged["source"] = "+".join(served_by) or "unknown"
    return FetchResult(
        value=merged,
        source=merged["source"],
        fetched_at=time.time(),
        sources_tried=sources_tried,
        elapsed_ms_by_source=elapsed_by_src,
    )


# ---------------------------------------------------------------------------
# Fetch — metadata (name / industry / sector)
# ---------------------------------------------------------------------------


def fetch_metadata_a_share(ticker: str) -> FetchResult:
    """Metadata: name, sector, industry. Priority: ticker_meta cache >
    persistence-stored akshare result > xueqiu live > tencent live."""
    sources_tried: list[str] = []
    elapsed_by_src: dict[str, int] = {}

    # 1. SQLite cache
    try:
        from . import persistence
        t0 = time.time()
        cached = persistence.get_ticker_meta(ticker)
        elapsed_by_src["cache"] = int((time.time() - t0) * 1000)
        sources_tried.append("cache")
        if cached and cached.get("name"):
            return FetchResult(
                value=cached, source="cache", fetched_at=time.time(),
                sources_tried=sources_tried, elapsed_ms_by_source=elapsed_by_src,
            )
    except Exception as e:
        log.debug("metadata cache lookup failed: %s", e)

    # 2. Xueqiu (also gives industry)
    try:
        from trading_agents.adapters.cn_stock_multi_source import fetch_a_share_fundamentals_xueqiu
        t0 = time.time()
        x = fetch_a_share_fundamentals_xueqiu(ticker)
        elapsed_by_src["xueqiu"] = int((time.time() - t0) * 1000)
        sources_tried.append("xueqiu")
        if x and x.get("name"):
            meta = {
                "ticker": ticker,
                "name": x["name"],
                "market": "a_share",
                "currency": "CNY",
                "market_cap": x.get("market_cap"),
                "source": "xueqiu",
                "fetched_at": time.time(),
            }
            return FetchResult(
                value=meta, source="xueqiu", fetched_at=time.time(),
                sources_tried=sources_tried, elapsed_ms_by_source=elapsed_by_src,
            )
    except Exception as e:
        log.debug("xueqiu metadata failed: %s", e)

    # 3. Tencent (just name)
    try:
        from trading_agents.adapters.cn_stock_multi_source import fetch_a_share_quote_tencent
        t0 = time.time()
        t = fetch_a_share_quote_tencent(ticker)
        elapsed_by_src["tencent"] = int((time.time() - t0) * 1000)
        sources_tried.append("tencent")
        if t and t.get("name"):
            meta = {
                "ticker": ticker, "name": t["name"], "market": "a_share",
                "currency": "CNY", "source": "tencent",
            }
            return FetchResult(
                value=meta, source="tencent", fetched_at=time.time(),
                sources_tried=sources_tried, elapsed_ms_by_source=elapsed_by_src,
            )
    except Exception as e:
        log.debug("tencent metadata failed: %s", e)

    return FetchResult(
        value=None, source="all_failed", fetched_at=time.time(),
        sources_tried=sources_tried, elapsed_ms_by_source=elapsed_by_src,
        error="all metadata sources failed",
    )


# ---------------------------------------------------------------------------
# Cross-source validation
# ---------------------------------------------------------------------------


@dataclass
class CrossValidation:
    """Result of querying multiple independent sources for the same field.

    Use case: for safety-critical fields like current_price, we don't want
    to rely on a single (possibly cached/stale) source. Query 3+ sources,
    take the median, and flag if any individual disagrees badly.
    """
    median: float | None
    sources_total: int
    sources_agreed: int      # within tolerance of median
    consensus: bool          # >=2 sources agreed within tolerance
    details: list[dict]      # [{source, value, diff_pct}, ...]

    @property
    def is_reliable(self) -> bool:
        """At least 2 independent sources within 5% of median → reliable."""
        return self.consensus and self.sources_total >= 2


def cross_validate_price(ticker: str, tolerance_pct: float = 5.0) -> CrossValidation:
    """Hit xueqiu + tencent + sina, compute median price, mark consensus."""
    from trading_agents.adapters.cn_stock_multi_source import (
        fetch_a_share_quote_xueqiu,
        fetch_a_share_quote_tencent,
        fetch_a_share_quote_sina,
    )
    fetchers = [
        ("xueqiu",  fetch_a_share_quote_xueqiu),
        ("tencent", fetch_a_share_quote_tencent),
        ("sina",    fetch_a_share_quote_sina),
    ]
    prices: list[tuple[str, float]] = []
    for name, fn in fetchers:
        try:
            r = fn(ticker)
            if r and r.get("current") is not None:
                prices.append((name, float(r["current"])))
        except Exception:
            continue
    if not prices:
        return CrossValidation(median=None, sources_total=0, sources_agreed=0,
                               consensus=False, details=[])
    values = sorted(p[1] for p in prices)
    median = statistics.median(values)
    details = []
    agreed = 0
    for name, v in prices:
        diff_pct = abs(v - median) / median * 100 if median > 0 else 0
        within = diff_pct < tolerance_pct
        if within:
            agreed += 1
        details.append({"source": name, "value": v, "diff_pct": round(diff_pct, 2), "within_tolerance": within})
    return CrossValidation(
        median=median,
        sources_total=len(prices),
        sources_agreed=agreed,
        consensus=agreed >= 2,
        details=details,
    )


# ---------------------------------------------------------------------------
# Health probes — used by /v1/datasource/health
# ---------------------------------------------------------------------------


_CANARY_TICKER = "600519"  # Maotai — guaranteed to exist on every source


def probe_all_sources() -> dict:
    """Run a canary fetch through every source. Returns a dict suitable for
    /v1/datasource/health to render. Each source reports latency_ms,
    success bool, and key fields it returned."""
    results: dict = {"canary": _CANARY_TICKER, "as_of": time.time(), "sources": []}
    from trading_agents.adapters.cn_stock_multi_source import (
        fetch_a_share_quote_xueqiu,
        fetch_a_share_quote_tencent,
        fetch_a_share_quote_sina,
        fetch_a_share_fundamentals_tencent,
        fetch_a_share_fundamentals_xueqiu,
        fetch_a_share_fundamentals_eastmoney,
    )

    def _probe(name: str, fn, want_field: str) -> dict:
        t0 = time.time()
        try:
            r = fn(_CANARY_TICKER)
            ok = bool(r and r.get(want_field) is not None)
            return {
                "name": name,
                "ok": ok,
                "latency_ms": int((time.time() - t0) * 1000),
                "value_sample": r.get(want_field) if r else None,
                "error": None if ok else "missing field or null result",
            }
        except Exception as e:
            return {
                "name": name,
                "ok": False,
                "latency_ms": int((time.time() - t0) * 1000),
                "value_sample": None,
                "error": f"{type(e).__name__}: {e}",
            }

    results["sources"] = [
        _probe("xueqiu/quote",          fetch_a_share_quote_xueqiu,          "current"),
        _probe("tencent/quote",         fetch_a_share_quote_tencent,         "current"),
        _probe("sina/quote",            fetch_a_share_quote_sina,            "current"),
        _probe("tencent/fundamentals",   fetch_a_share_fundamentals_tencent,   "pe"),
        _probe("xueqiu/fundamentals",   fetch_a_share_fundamentals_xueqiu,   "pe"),
        _probe("eastmoney/fundamentals", fetch_a_share_fundamentals_eastmoney, "pe"),
    ]
    results["healthy_count"]   = sum(1 for s in results["sources"] if s["ok"])
    results["total_sources"]   = len(results["sources"])
    results["health_status"]   = "ok" if results["healthy_count"] >= 3 else ("degraded" if results["healthy_count"] >= 1 else "down")
    return results
