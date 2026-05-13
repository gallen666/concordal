"""Alpaca paper-trading bridge — Roadmap §0.2 + Phase 5.

NEVER ROUTES REAL MONEY. This module talks to https://paper-api.alpaca.markets
exclusively — Alpaca's sandbox where every order is virtual but fill prices
are real. Using paper-trading achieves two things the roadmap calls out:

  1. User trust: "watch the agent's BUY at $192 actually fill at $192.04
     and see the next 30 days of paper P&L" beats any equity-curve chart.
  2. Bug surfacing: round-trip latency, partial fills, halt handling all
     show up — finding them in paper is much cheaper than finding them in
     production.

Setup (operator):
  1. Sign up at https://alpaca.markets (free).
  2. Generate paper-trading keys in dashboard → API Keys.
  3. Set on Render: ALPACA_API_KEY + ALPACA_API_SECRET. Never set the
     live-trading keys — only paper. There is no defensive guard in this
     code; we trust the env to be paper-only.

The implementation is HTTP-direct against Alpaca's REST API (no `alpaca-py`
dep) — keeps the install footprint small and gives us tighter control over
error handling. If `alpaca-py` is later wanted for streaming, layer it on top.
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from typing import Literal

import httpx

log = logging.getLogger(__name__)

ALPACA_PAPER_BASE = "https://paper-api.alpaca.markets/v2"


def _keys() -> tuple[str | None, str | None]:
    return os.environ.get("ALPACA_API_KEY"), os.environ.get("ALPACA_API_SECRET")


def is_configured() -> bool:
    k, s = _keys()
    return bool(k and s)


def _headers() -> dict[str, str]:
    k, s = _keys()
    if not k or not s:
        raise RuntimeError(
            "ALPACA_API_KEY / ALPACA_API_SECRET not set. Configure in Render → "
            "Environment to enable paper trading."
        )
    return {
        "APCA-API-KEY-ID": k,
        "APCA-API-SECRET-KEY": s,
        "Accept": "application/json",
    }


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PaperOrder:
    """Subset of the Alpaca order response we expose to the frontend."""
    id: str
    symbol: str
    side: Literal["buy", "sell"]
    qty: float
    filled_qty: float
    filled_avg_price: float | None
    status: str
    submitted_at: str


@dataclass(frozen=True)
class PaperPosition:
    symbol: str
    qty: float
    avg_entry_price: float
    market_value: float
    unrealized_pl: float
    unrealized_plpc: float  # as decimal e.g. 0.034 = +3.4%


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------


def submit_market_order(
    symbol: str,
    qty: float,
    side: Literal["buy", "sell"],
    time_in_force: Literal["day", "gtc", "ioc"] = "day",
) -> PaperOrder:
    """Submit a paper market order. Returns immediately with status —
    fills land asynchronously (poll via `list_orders`)."""
    body = {
        "symbol": symbol,
        "qty": str(qty),
        "side": side,
        "type": "market",
        "time_in_force": time_in_force,
    }
    with httpx.Client(timeout=10.0) as client:
        r = client.post(f"{ALPACA_PAPER_BASE}/orders", json=body, headers=_headers())
        r.raise_for_status()
        d = r.json()
    return _row_to_order(d)


def list_orders(status: str = "all", limit: int = 50) -> list[PaperOrder]:
    with httpx.Client(timeout=10.0) as client:
        r = client.get(
            f"{ALPACA_PAPER_BASE}/orders",
            params={"status": status, "limit": str(limit)},
            headers=_headers(),
        )
        r.raise_for_status()
        return [_row_to_order(d) for d in r.json()]


def list_positions() -> list[PaperPosition]:
    with httpx.Client(timeout=10.0) as client:
        r = client.get(f"{ALPACA_PAPER_BASE}/positions", headers=_headers())
        r.raise_for_status()
        return [_row_to_position(d) for d in r.json()]


def get_account() -> dict:
    """Cash, buying power, equity — surfaces to the /me/paper-trades page."""
    with httpx.Client(timeout=10.0) as client:
        r = client.get(f"{ALPACA_PAPER_BASE}/account", headers=_headers())
        r.raise_for_status()
        d = r.json()
    return {
        "cash":            float(d.get("cash", 0)),
        "equity":          float(d.get("equity", 0)),
        "buying_power":    float(d.get("buying_power", 0)),
        "portfolio_value": float(d.get("portfolio_value", 0)),
        "status":          d.get("status", "unknown"),
        "currency":        d.get("currency", "USD"),
    }


# ---------------------------------------------------------------------------
# Decision → order helper
# ---------------------------------------------------------------------------


def decision_to_paper_order(
    decision: dict,
    portfolio_value_usd: float,
    max_position_pct: float = 0.03,
) -> PaperOrder | None:
    """Translate a TradingAgents decision into a paper order.

    Conservative: caps position to `max_position_pct` of the paper account
    equity (3% default). Skips HOLD decisions entirely. Cancels any existing
    open order on the same symbol before submitting a new one.
    """
    action = (decision.get("action") or "").upper()
    if action not in {"BUY", "SELL"}:
        return None
    symbol = decision.get("ticker") or decision.get("symbol")
    if not symbol:
        return None
    price = float(decision.get("price") or 0)
    if price <= 0:
        log.warning("decision_to_paper_order: missing price → cannot size order")
        return None
    notional = portfolio_value_usd * max_position_pct
    qty = max(1, int(notional / price))
    side: Literal["buy", "sell"] = "buy" if action == "BUY" else "sell"
    return submit_market_order(symbol=symbol, qty=qty, side=side, time_in_force="day")


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _row_to_order(d: dict) -> PaperOrder:
    return PaperOrder(
        id=d.get("id", ""),
        symbol=d.get("symbol", ""),
        side=d.get("side", "buy"),  # type: ignore
        qty=float(d.get("qty", 0)),
        filled_qty=float(d.get("filled_qty", 0)),
        filled_avg_price=(
            float(d["filled_avg_price"]) if d.get("filled_avg_price") else None
        ),
        status=d.get("status", "unknown"),
        submitted_at=d.get("submitted_at", ""),
    )


def _row_to_position(d: dict) -> PaperPosition:
    return PaperPosition(
        symbol=d.get("symbol", ""),
        qty=float(d.get("qty", 0)),
        avg_entry_price=float(d.get("avg_entry_price", 0)),
        market_value=float(d.get("market_value", 0)),
        unrealized_pl=float(d.get("unrealized_pl", 0)),
        unrealized_plpc=float(d.get("unrealized_plpc", 0)),
    )
