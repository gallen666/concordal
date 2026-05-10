"""Backtest metrics. Pure functions over an equity curve / return series.

Includes the four headline metrics from the TradingAgents paper plus a few
others that any production system needs.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class Metrics:
    cumulative_return: float       # e.g. 0.27 = +27%
    annual_return: float
    annual_volatility: float
    sharpe: float                  # annualized, rf=0
    sortino: float                 # annualized, downside vol only
    max_drawdown: float            # negative number, e.g. -0.18
    win_rate: float
    n_trades: int
    avg_holding_days: float


def _returns(curve: list[float]) -> list[float]:
    out = []
    for i in range(1, len(curve)):
        if curve[i - 1] == 0:
            out.append(0.0)
        else:
            out.append(curve[i] / curve[i - 1] - 1.0)
    return out


def _max_drawdown(curve: list[float]) -> float:
    peak = curve[0] if curve else 0.0
    mdd = 0.0
    for v in curve:
        peak = max(peak, v)
        if peak > 0:
            mdd = min(mdd, v / peak - 1.0)
    return mdd


def compute_metrics(
    equity_curve: list[float],
    trade_log: list[dict] | None = None,
    periods_per_year: int = 252,
    elapsed_days: float | None = None,
) -> Metrics:
    """Compute headline metrics over an equity curve.

    `periods_per_year` is used for vol / Sharpe scaling. If you also pass
    `elapsed_days` (calendar days from first to last bar), the annualised
    return uses calendar time — the previous formula `(1+cum)**(252/n) - 1`
    silently overstated the annual return when the price series had gaps
    (China holidays, halts, half-days, weekends-not-counted-as-bars).
    """
    if not equity_curve or equity_curve[0] <= 0:
        return Metrics(0, 0, 0, 0, 0, 0, 0, 0, 0)

    rets = _returns(equity_curve)
    n = len(rets)
    if n == 0:
        return Metrics(0, 0, 0, 0, 0, 0, 0, 0, 0)

    cum = equity_curve[-1] / equity_curve[0] - 1.0
    # Prefer calendar-time annualisation when caller can provide it.
    if elapsed_days and elapsed_days > 0:
        years = elapsed_days / 365.25
        annual = (1 + cum) ** (1.0 / years) - 1.0 if years > 0 else 0.0
    else:
        annual = (1 + cum) ** (periods_per_year / n) - 1.0 if n else 0.0
    mean = sum(rets) / n
    var = sum((r - mean) ** 2 for r in rets) / max(1, n - 1)
    vol = math.sqrt(var) * math.sqrt(periods_per_year)
    sharpe = (mean * periods_per_year) / vol if vol > 0 else 0.0
    downside = [r for r in rets if r < 0]
    if downside:
        d_var = sum(r * r for r in downside) / len(downside)
        d_vol = math.sqrt(d_var) * math.sqrt(periods_per_year)
        sortino = (mean * periods_per_year) / d_vol if d_vol > 0 else 0.0
    else:
        sortino = 0.0

    mdd = _max_drawdown(equity_curve)

    if trade_log:
        wins = sum(1 for t in trade_log if t.get("pnl", 0) > 0)
        n_trades = len(trade_log)
        win_rate = wins / n_trades if n_trades else 0.0
        durations = [t.get("holding_days", 0) for t in trade_log]
        avg_hold = sum(durations) / n_trades if n_trades else 0.0
    else:
        n_trades = 0
        win_rate = 0.0
        avg_hold = 0.0

    return Metrics(
        cumulative_return=round(cum, 4),
        annual_return=round(annual, 4),
        annual_volatility=round(vol, 4),
        sharpe=round(sharpe, 3),
        sortino=round(sortino, 3),
        max_drawdown=round(mdd, 4),
        win_rate=round(win_rate, 3),
        n_trades=n_trades,
        avg_holding_days=round(avg_hold, 2),
    )
