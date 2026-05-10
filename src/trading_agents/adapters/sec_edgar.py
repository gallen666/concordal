"""SEC EDGAR — point-in-time fundamentals for US equities.

Why this exists: yfinance's `Ticker.info` returns *current* snapshot. For
backtest dates the Yahoo path returns an empty stub (see lookahead-safety
guard in yahoo_us_equity.py). EDGAR is the canonical source of historical
filings keyed by their actual filing date — perfect for PIT.

We use the EDGAR XBRL company-concept API:

    https://data.sec.gov/api/xbrl/companyconcept/CIK{cik}/us-gaap/{tag}.json

Each response includes a list of filings with:
  - `end`        : fiscal-period end date
  - `filed`      : actual filing date (this is what makes it PIT-safe)
  - `val`        : the reported value
  - `accn`       : accession number (used to derive PE/PB later)

We fetch one tag per metric and pick the most recent filing where
`filed <= asof` — guaranteeing zero lookahead even for tight backtests.

Notes:
  * The SEC requires a User-Agent identifying the requester. We construct
    one from TA_SEC_USER_AGENT env or a polite default.
  * Rate limit: 10 req/sec per the SEC's fair-access policy.
  * Ticker → CIK mapping is fetched once (cached) from
    https://www.sec.gov/files/company_tickers.json.
"""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.parse
import urllib.request
from datetime import date
from typing import Any

from ..core.types import Fundamentals

log = logging.getLogger(__name__)


_USER_AGENT = os.environ.get(
    "TA_SEC_USER_AGENT",
    "trading-agents-platform research/0.1 (gallen666@github)",
)
_BASE = "https://data.sec.gov/api/xbrl/companyconcept"
_TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json"

# in-process caches — these don't change often
_ticker_to_cik: dict[str, str] | None = None
_concept_cache: dict[tuple[str, str], list[dict]] = {}


def _http_get(url: str, timeout: int = 12) -> dict | None:
    """GET helper that respects SEC's user-agent + rate-limit etiquette."""
    req = urllib.request.Request(url, headers={
        "User-Agent": _USER_AGENT,
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except Exception as e:
        log.debug("EDGAR GET %s failed: %s", url, e)
        return None


def _load_ticker_map() -> dict[str, str]:
    global _ticker_to_cik
    if _ticker_to_cik is not None:
        return _ticker_to_cik
    raw = _http_get(_TICKER_MAP_URL)
    out: dict[str, str] = {}
    if raw:
        # Format is {"0": {"cik_str": 320193, "ticker": "AAPL", "title": "..."}, ...}
        for row in raw.values():
            t = str(row.get("ticker") or "").upper()
            cik = row.get("cik_str")
            if t and cik is not None:
                out[t] = str(cik).zfill(10)
    _ticker_to_cik = out
    log.info("EDGAR: loaded %d ticker→CIK mappings", len(out))
    return out


def _fetch_concept(cik: str, tag: str) -> list[dict]:
    """Return USD-USD entries from a `us-gaap/<tag>` concept response."""
    cache_key = (cik, tag)
    if cache_key in _concept_cache:
        return _concept_cache[cache_key]
    url = f"{_BASE}/CIK{cik}/us-gaap/{tag}.json"
    data = _http_get(url)
    if not data:
        _concept_cache[cache_key] = []
        return []
    units = (data.get("units") or {})
    # Most metrics live under "USD". Some under "USD/shares" (EPS).
    rows: list[dict] = []
    for unit_key in ("USD", "USD/shares", "shares", "pure"):
        rows.extend(units.get(unit_key) or [])
    _concept_cache[cache_key] = rows
    # Tiny politeness delay (SEC asks for ≤10 req/s)
    time.sleep(0.1)
    return rows


def _latest_value_before(rows: list[dict], asof: date) -> Any | None:
    """Pick the row with the largest `filed` date that is <= asof."""
    if not rows:
        return None
    asof_iso = asof.isoformat()
    candidates = [
        r for r in rows
        if r.get("filed") and r["filed"] <= asof_iso and "val" in r
    ]
    if not candidates:
        return None
    candidates.sort(key=lambda r: r["filed"], reverse=True)
    return candidates[0]["val"]


def _ttm_sum(rows: list[dict], asof: date) -> float | None:
    """Sum the four most recent quarterly values for trailing-12-month metrics.

    EDGAR rows include FY (`fp=FY`) and quarterly (`fp=Q1..Q4`). For TTM we
    grab the four most-recent quarters whose `filed <= asof`. If we only
    find FY data we fall back to the most recent FY value.
    """
    asof_iso = asof.isoformat()
    qtr = [
        r for r in rows
        if r.get("filed") and r["filed"] <= asof_iso
        and r.get("fp", "").startswith("Q")
        and "val" in r
    ]
    qtr.sort(key=lambda r: r.get("end", ""), reverse=True)
    # de-dup by `end` to avoid double-counting amendments
    seen: set[str] = set()
    picked: list[float] = []
    for r in qtr:
        end = r.get("end")
        if end in seen:
            continue
        seen.add(end)
        try:
            picked.append(float(r["val"]))
        except (TypeError, ValueError):
            continue
        if len(picked) == 4:
            break
    if len(picked) == 4:
        return sum(picked)
    # Fallback: latest FY
    fy = _latest_value_before([r for r in rows if r.get("fp") == "FY"], asof)
    if fy is None:
        return None
    try:
        return float(fy)
    except (TypeError, ValueError):
        return None


def get_pit_fundamentals(ticker: str, asof: date) -> Fundamentals | None:
    """Fetch point-in-time fundamentals for `ticker` as of `asof`.

    Returns None if the ticker isn't in EDGAR (foreign issuers, ETFs, etc.)
    or if the network call fails — caller should fall back to whatever
    stub policy they already have.
    """
    cik = _load_ticker_map().get(ticker.upper())
    if not cik:
        return None

    # Pull the underlying concepts. Each is one HTTP request.
    revenue_rows = _fetch_concept(cik, "Revenues") or _fetch_concept(cik, "RevenueFromContractWithCustomerExcludingAssessedTax")
    ni_rows = _fetch_concept(cik, "NetIncomeLoss")
    eps_rows = _fetch_concept(cik, "EarningsPerShareDiluted")
    gross_profit_rows = _fetch_concept(cik, "GrossProfit")
    op_income_rows = _fetch_concept(cik, "OperatingIncomeLoss")
    fcf_rows = (
        _fetch_concept(cik, "NetCashProvidedByUsedInOperatingActivities")
    )
    capex_rows = _fetch_concept(cik, "PaymentsToAcquirePropertyPlantAndEquipment")
    debt_rows = _fetch_concept(cik, "LongTermDebt")
    equity_rows = _fetch_concept(cik, "StockholdersEquity")

    revenue_ttm = _ttm_sum(revenue_rows, asof)
    ni_ttm = _ttm_sum(ni_rows, asof)
    gross_ttm = _ttm_sum(gross_profit_rows, asof)
    op_ttm = _ttm_sum(op_income_rows, asof)
    cfo_ttm = _ttm_sum(fcf_rows, asof)
    capex_ttm = _ttm_sum(capex_rows, asof)

    fcf_ttm = None
    if cfo_ttm is not None and capex_ttm is not None:
        # capex from cash-flow statement is typically negative or absolute;
        # we compute FCF = CFO - |capex|.
        fcf_ttm = cfo_ttm - abs(capex_ttm)

    eps_ttm_val = _ttm_sum(eps_rows, asof)
    debt = _latest_value_before(debt_rows, asof)
    equity = _latest_value_before(equity_rows, asof)

    debt_to_equity = None
    if debt is not None and equity not in (None, 0):
        try:
            debt_to_equity = float(debt) / float(equity)
        except Exception:
            debt_to_equity = None

    gross_margin = None
    operating_margin = None
    net_margin = None
    if revenue_ttm and revenue_ttm > 0:
        if gross_ttm is not None:
            gross_margin = gross_ttm / revenue_ttm
        if op_ttm is not None:
            operating_margin = op_ttm / revenue_ttm
        if ni_ttm is not None:
            net_margin = ni_ttm / revenue_ttm

    # Did we actually get anything meaningful?
    has_data = any(
        v is not None
        for v in (revenue_ttm, ni_ttm, gross_margin, fcf_ttm, debt_to_equity, eps_ttm_val)
    )
    if not has_data:
        return None

    return Fundamentals(
        ticker=ticker.upper(),
        asof=asof,
        # EDGAR XBRL doesn't directly expose marketCap (that's a price ×
        # shares-outstanding calc). We leave it None and let the
        # technical analyst pick up price context.
        market_cap=None,
        pe_ratio=None,         # needs price; we don't have PIT prices here
        pb_ratio=None,
        eps_ttm=float(eps_ttm_val) if eps_ttm_val is not None else None,
        revenue_ttm=revenue_ttm,
        revenue_growth_yoy=None,
        gross_margin=gross_margin,
        operating_margin=operating_margin,
        net_margin=net_margin,
        free_cash_flow_ttm=fcf_ttm,
        debt_to_equity=debt_to_equity,
        notes=(
            f"Point-in-time from SEC EDGAR (filings filed on/before {asof.isoformat()}). "
            "Margins computed from trailing-4Q sums. Ratios needing live "
            "price (P/E, P/B, market cap) are not provided here."
        ),
    )
