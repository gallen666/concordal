"""Market regime profiles - capture the per-market constraints that any
trader/risk agent must obey (T+1 settlement, daily price limits, short-sell
restrictions, 24/7 trading, funding-rate relevance, etc.)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


@dataclass(frozen=True)
class TradingHours:
    open_local: str   # "09:30"
    close_local: str  # "16:00"
    timezone: str     # "America/New_York"
    weekdays_only: bool = True


@dataclass(frozen=True)
class RegimeProfile:
    """Per-market rules. Add new markets by adding new instances."""

    market: str                                # e.g. "us_equity", "crypto"
    settlement: Literal["T+0", "T+1", "T+2"]
    daily_limit_pct: float | None              # None = no limit (US, crypto)
    short_selling_allowed: bool
    funding_rate_relevant: bool
    base_currency: str
    benchmark_ticker: str                      # e.g. "SPY", "BTC", "000300.SS"
    trading_hours: TradingHours
    typical_lot_size: float = 1.0              # 100 for HK equity
    notes: list[str] = field(default_factory=list)


US_EQUITY = RegimeProfile(
    market="us_equity",
    settlement="T+1",
    daily_limit_pct=None,
    short_selling_allowed=True,
    funding_rate_relevant=False,
    base_currency="USD",
    benchmark_ticker="SPY",
    trading_hours=TradingHours("09:30", "16:00", "America/New_York"),
)

A_SHARE = RegimeProfile(
    market="a_share",
    settlement="T+1",
    daily_limit_pct=10.0,
    short_selling_allowed=False,
    funding_rate_relevant=False,
    base_currency="CNY",
    benchmark_ticker="000300.SS",
    trading_hours=TradingHours("09:30", "15:00", "Asia/Shanghai"),
    typical_lot_size=100.0,
    notes=["涨跌停板 ±10%", "ST 股 ±5%", "存在停牌制度"],
)

HK_EQUITY = RegimeProfile(
    market="hk_equity",
    settlement="T+2",
    daily_limit_pct=None,
    short_selling_allowed=True,
    funding_rate_relevant=False,
    base_currency="HKD",
    benchmark_ticker="^HSI",
    trading_hours=TradingHours("09:30", "16:00", "Asia/Hong_Kong"),
)

CRYPTO = RegimeProfile(
    market="crypto",
    settlement="T+0",
    daily_limit_pct=None,
    short_selling_allowed=True,
    funding_rate_relevant=True,
    base_currency="USD",
    benchmark_ticker="BTC",
    trading_hours=TradingHours("00:00", "23:59", "UTC", weekdays_only=False),
    notes=["24/7 trading", "Funding rate impacts perp positions"],
)


REGIMES: dict[str, RegimeProfile] = {
    r.market: r for r in (US_EQUITY, A_SHARE, HK_EQUITY, CRYPTO)
}


def get_regime(market: str) -> RegimeProfile:
    if market not in REGIMES:
        raise KeyError(
            f"Unknown market '{market}'. Known: {list(REGIMES)}"
        )
    return REGIMES[market]
