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
