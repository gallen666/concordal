"""vnpy bridge — A-share paper trading, ecosystem.registry status=PLANNED.

Status: SKELETON. Real activation requires:
  1. CTP 模拟账户 — register at https://simnow.com.cn (free, mainland-only).
  2. vnpy installed: `pip install vnpy vnpy_ctp` (Linux build is fiddly;
     the CTP shared libs are commercial.)
  3. A vnpy CtaTemplate strategy that polls our /v1/decisions endpoint
     nightly and converts to vnpy OrderRequest objects.

The function below produces a vnpy-style OrderRequest dict so when the
above prerequisites land, wiring is one import away.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class VnpyOrderRequest:
    symbol: str                        # 6-digit A-share code e.g. "600519"
    exchange: Literal["SSE", "SZSE", "BSE"]   # 上交所 / 深交所 / 北交所
    direction: Literal["LONG", "SHORT"]
    offset: Literal["OPEN", "CLOSE", "CLOSETODAY"]
    volume: int                        # in lots of 100 (A-share lot)
    price: float
    order_type: Literal["LIMIT", "MARKET"] = "LIMIT"

    def to_vnpy_dict(self) -> dict:
        return self.__dict__.copy()


def decision_to_vnpy(decision: dict) -> VnpyOrderRequest | None:
    """Convert a TradingAgents A-share decision → vnpy OrderRequest."""
    action = (decision.get("action") or "").upper()
    if action == "HOLD":
        return None
    symbol = decision.get("ticker", "")
    if not (symbol.isdigit() and len(symbol) == 6):
        return None
    # 6 → SSE, 0/3 → SZSE, 4/8 → BSE
    if symbol[0] == "6":
        exchange: Literal["SSE", "SZSE", "BSE"] = "SSE"
    elif symbol[0] in ("0", "3"):
        exchange = "SZSE"
    else:
        exchange = "BSE"
    price = float(decision.get("price", 0))
    notional = float(decision.get("notional_cny", 100_000))
    volume_lots = max(1, int(notional / price / 100))
    return VnpyOrderRequest(
        symbol=symbol,
        exchange=exchange,
        direction="LONG" if action == "BUY" else "SHORT",
        offset="OPEN" if action == "BUY" else "CLOSE",
        volume=volume_lots * 100,
        price=price,
        order_type="LIMIT",
    )


def report_to_vnpy_signal(report: dict) -> dict:
    """Richer export — converts a /v1/report/full output to a vnpy-compatible
    SignalData dict that vnpy's CtaTemplate.on_signal() can ingest directly.

    Unlike decision_to_vnpy (which returns only OrderRequest with size/price),
    this includes stop_loss, take_profit, support_level, and a human-readable
    rationale — i.e. a complete signal a vnpy strategy can act on without
    re-querying our API.

    Output schema matches vnpy 3.x SignalData + our extensions:
      {
        symbol, exchange, direction, offset,
        price, stop_loss, support_level, take_profit,
        size_fraction, tif, rationale, source, schema_version
      }
    """
    summary = report.get("summary") or {}
    technical = report.get("technical") or {}
    op_plan = report.get("operation_plan") or {}

    rating = (summary.get("rating") or op_plan.get("action") or "HOLD").upper()
    direction_map = {"BUY": "long", "SELL": "short", "HOLD": "flat"}
    direction = direction_map.get(rating, "flat")

    ticker = report.get("ticker") or "UNKNOWN"
    exchange = (report.get("exchange") or "SSE").upper()
    current_price = float(summary.get("current_price") or 0.0)
    target_high = float(summary.get("target_price_high") or current_price)
    target_low = float(summary.get("target_price_low") or current_price * 0.9)

    # Pull support / pressure levels from technical framework_3 if present
    support_level = round(current_price * 0.95, 2)
    take_profit = target_high
    f3 = technical.get("framework_3_key_levels") or {}
    sup_dict = f3.get("support") or {}
    pres_dict = f3.get("pressure") or {}
    for raw in (sup_dict.get("level"),):
        try:
            if raw not in (None, "—", ""):
                support_level = float(str(raw).replace("元", "").strip())
        except (TypeError, ValueError):
            pass
    for raw in (pres_dict.get("level"),):
        try:
            if raw not in (None, "—", ""):
                take_profit = float(str(raw).replace("元", "").strip())
        except (TypeError, ValueError):
            pass

    # Parse "5-15%" → midpoint as fraction
    size_fraction = 0.10
    size_range = summary.get("position_size_range") or "5-15%"
    try:
        clean = str(size_range).replace("%", "").strip()
        if "-" in clean:
            lo, hi = clean.split("-", 1)
            size_fraction = (float(lo) + float(hi)) / 200.0
        else:
            size_fraction = float(clean) / 100.0
    except (TypeError, ValueError):
        size_fraction = 0.10

    rationale = (
        report.get("core_view")
        or summary.get("entry_timing")
        or op_plan.get("trade_decision")
        or "TradingAgents decision"
    )
    if isinstance(rationale, str) and len(rationale) > 280:
        rationale = rationale[:280] + "…"

    return {
        "symbol": f"{ticker}.{exchange}",
        "exchange": exchange,
        "direction": direction,
        "offset": "open" if direction != "flat" else "close",
        "price": round(current_price, 2),
        "stop_loss": round(target_low if direction == "long" else target_high, 2),
        "support_level": round(support_level, 2),
        "take_profit": round(take_profit, 2),
        "size_fraction": round(size_fraction, 4),
        "tif": "GFD",  # Good-For-Day (A-share T+1 standard)
        "rationale": rationale,
        "source": "tradingagents",
        "schema_version": "vnpy-signal-v1",
    }
