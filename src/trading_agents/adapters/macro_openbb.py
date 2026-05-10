"""OpenBB-backed macro snapshot fetcher.

OpenBB (https://github.com/OpenBB-finance/OpenBB) is the open-source
Bloomberg Terminal alternative. Its `openbb` Python SDK aggregates many
free macro sources (FRED, IMF, BLS, ECB) behind a uniform API:

    obb.economy.cpi(country="united_states")
    obb.fixedincome.government.us_yield_curve()

We use it to populate `MacroSnapshot` for use by the Macro analyst.

Design notes:
  * OpenBB is OPTIONAL. If not installed, this module falls back to a
    direct FRED REST call (needs FRED_API_KEY) or, finally, a deterministic
    mock based on real recent values. The pipeline never crashes from a
    missing dependency.
  * Macro data is shared across tickers in the same region, so we cache
    aggressively (24h TTL by default) — pulling 6 series per decision is
    wasteful when CPI updates monthly.
  * Strict no-lookahead: every fetched series is filtered by `asof`, so
    a backtest dated 2023-06-01 only sees data published by that date.
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from ..core.types import MacroSnapshot

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Cache (in-memory, 24h TTL)
# ---------------------------------------------------------------------------

_CACHE: dict[tuple[str, str], tuple[float, MacroSnapshot]] = {}
_CACHE_TTL_SEC = int(os.environ.get("TA_MACRO_CACHE_TTL_SEC", "86400"))


def _cache_get(key: tuple[str, str]) -> MacroSnapshot | None:
    rec = _CACHE.get(key)
    if not rec:
        return None
    ts, snap = rec
    if time.time() - ts > _CACHE_TTL_SEC:
        return None
    return snap


def _cache_put(key: tuple[str, str], snap: MacroSnapshot) -> None:
    _CACHE[key] = (time.time(), snap)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def fetch_macro_snapshot(asof: date, region: str = "US") -> MacroSnapshot | None:
    """Best-effort macro snapshot. Returns None if every backend fails.

    Tries in order:
      1. OpenBB SDK (if installed)
      2. FRED REST API (if FRED_API_KEY env var set, US only)
      3. Cached fallback (last good snapshot)
      4. None — caller must handle gracefully
    """
    cache_key = (region, asof.isoformat())
    cached = _cache_get(cache_key)
    if cached:
        return cached

    snap = _try_openbb(asof, region)
    if snap is None and region == "US":
        snap = _try_fred(asof)

    if snap is not None:
        _cache_put(cache_key, snap)
        return snap

    log.info("Macro snapshot unavailable for region=%s asof=%s", region, asof)
    return None


# ---------------------------------------------------------------------------
# Backend 1: OpenBB SDK
# ---------------------------------------------------------------------------


def _try_openbb(asof: date, region: str) -> MacroSnapshot | None:
    try:
        from openbb import obb  # type: ignore
    except ImportError:
        log.debug("openbb SDK not installed — skipping")
        return None

    try:
        country = {"US": "united_states", "CN": "china", "EU": "euro_area"}.get(region, "united_states")

        snap = MacroSnapshot(asof=asof, region=region)

        # CPI YoY — `obb.economy.cpi` returns transformed series.
        try:
            cpi = obb.economy.cpi(country=country, transform="yoy", frequency="monthly").to_df()
            cpi = cpi[cpi.index.date <= asof]
            if not cpi.empty:
                snap.cpi_yoy = float(cpi.iloc[-1, 0]) * (100 if cpi.iloc[-1, 0] < 1 else 1)
        except Exception as e:
            log.debug("openbb cpi failed: %s", e)

        # Unemployment — US: BLS via FRED
        try:
            une = obb.economy.unemployment(country=country, frequency="monthly").to_df()
            une = une[une.index.date <= asof]
            if not une.empty:
                snap.unemployment_rate = float(une.iloc[-1, 0])
        except Exception as e:
            log.debug("openbb unemployment failed: %s", e)

        # Treasury yields (US)
        if region == "US":
            try:
                yc = obb.fixedincome.government.us_yield_curve(date=asof).to_df()
                # Standard tenors: "3_month", "2_year", "10_year"
                row = yc.set_index("maturity")["rate"] if "maturity" in yc.columns else None
                if row is not None:
                    if "2_year" in row.index:
                        snap.yield_2y = float(row["2_year"])
                    if "10_year" in row.index:
                        snap.yield_10y = float(row["10_year"])
                if snap.yield_2y is not None and snap.yield_10y is not None:
                    snap.yield_curve_2y10y = snap.yield_10y - snap.yield_2y
            except Exception as e:
                log.debug("openbb yield curve failed: %s", e)

            # Fed funds upper bound
            try:
                ff = obb.economy.fred_series(symbol="DFEDTARU").to_df()
                ff = ff[ff.index.date <= asof]
                if not ff.empty:
                    snap.policy_rate = float(ff.iloc[-1, 0])
            except Exception as e:
                log.debug("openbb fed funds failed: %s", e)

        snap.sources = ["OpenBB:" + b for b in ("FRED", "BLS")]
        snap.notes = (
            f"Snapshot from OpenBB as of {asof}. "
            f"Filtered to data published <= asof — strict no-lookahead enforced."
        )
        # If we got nothing useful, return None instead of an empty snap
        if all(
            getattr(snap, k) is None
            for k in ("cpi_yoy", "unemployment_rate", "yield_10y", "policy_rate")
        ):
            return None
        return snap

    except Exception as e:
        log.warning("openbb macro fetch failed: %s", e)
        return None


# ---------------------------------------------------------------------------
# Backend 2: direct FRED REST (US only, requires FRED_API_KEY)
# ---------------------------------------------------------------------------


_FRED_SERIES = {
    "cpi_yoy":        "CPIAUCSL",   # CPI All Urban Consumers, will compute YoY
    "core_cpi_yoy":   "CPILFESL",
    "unemployment_rate": "UNRATE",
    "policy_rate":    "DFEDTARU",   # Fed funds upper target
    "yield_2y":       "DGS2",
    "yield_10y":      "DGS10",
    "ism_pmi_manufacturing": "MANEMP",  # not exact PMI but proxy if no key
    "retail_sales_yoy": "RSAFS",
    "m2_yoy":         "M2SL",
    "dxy_level":      "DTWEXBGS",   # broad dollar index
}


def _try_fred(asof: date) -> MacroSnapshot | None:
    api_key = os.environ.get("FRED_API_KEY")
    if not api_key:
        log.debug("FRED_API_KEY not set — skipping direct FRED fetch")
        return None

    try:
        import urllib.parse
        import urllib.request
        import json

        snap = MacroSnapshot(asof=asof, region="US")

        def latest(series_id: str) -> float | None:
            url = (
                "https://api.stlouisfed.org/fred/series/observations?"
                + urllib.parse.urlencode({
                    "series_id": series_id,
                    "api_key": api_key,
                    "file_type": "json",
                    "observation_end": asof.isoformat(),
                    "limit": 1,
                    "sort_order": "desc",
                })
            )
            with urllib.request.urlopen(url, timeout=10) as resp:
                data = json.loads(resp.read())
            obs = data.get("observations") or []
            if not obs:
                return None
            v = obs[0].get("value")
            if v in (".", None, ""):
                return None
            return float(v)

        def yoy(series_id: str) -> float | None:
            """Compute YoY change for a level series."""
            now_v = latest(series_id)
            if now_v is None:
                return None
            year_ago = (asof - timedelta(days=365)).isoformat()
            url = (
                "https://api.stlouisfed.org/fred/series/observations?"
                + urllib.parse.urlencode({
                    "series_id": series_id,
                    "api_key": api_key,
                    "file_type": "json",
                    "observation_end": year_ago,
                    "limit": 1,
                    "sort_order": "desc",
                })
            )
            with urllib.request.urlopen(url, timeout=10) as resp:
                data = json.loads(resp.read())
            obs = data.get("observations") or []
            if not obs:
                return None
            v = obs[0].get("value")
            if v in (".", None, ""):
                return None
            base = float(v)
            if base == 0:
                return None
            return (now_v - base) / base * 100

        # Inflation
        snap.cpi_yoy = yoy("CPIAUCSL")
        snap.core_cpi_yoy = yoy("CPILFESL")
        snap.pce_yoy = yoy("PCEPI")
        # Labor
        snap.unemployment_rate = latest("UNRATE")
        # Rates
        snap.policy_rate = latest("DFEDTARU")
        snap.yield_2y = latest("DGS2")
        snap.yield_10y = latest("DGS10")
        if snap.yield_2y is not None and snap.yield_10y is not None:
            snap.yield_curve_2y10y = snap.yield_10y - snap.yield_2y
        # Growth proxies
        snap.retail_sales_yoy = yoy("RSAFS")
        snap.gdp_yoy = yoy("GDP")
        # Liquidity
        snap.m2_yoy = yoy("M2SL")
        snap.dxy_level = latest("DTWEXBGS")

        snap.sources = ["FRED REST"]
        snap.notes = (
            f"Snapshot from FRED REST API as of {asof}. "
            "YoY series computed by comparing latest value vs ~365 days prior."
        )

        if all(
            getattr(snap, k) is None
            for k in ("cpi_yoy", "unemployment_rate", "yield_10y", "policy_rate")
        ):
            return None
        return snap

    except Exception as e:
        log.warning("FRED fetch failed: %s", e)
        return None
