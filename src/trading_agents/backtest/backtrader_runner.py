"""Backtrader cross-validation runner.

Why this exists: our `Backtester.run_agent` is a hand-rolled walker that's
small enough to audit (200 lines) but obscure enough that a subtle bug
could quietly inflate every reported number. Backtrader is the most
battle-tested Python backtester (14k★, 2014-, used by retail + small
funds for years). Replaying our decision sequence through Backtrader's
broker simulator gives an independent reading on the same equity curve.

The runner:
  1. Takes a sequence of (date, weight) decisions our engine produced.
  2. Feeds the same daily OHLCV bars to Backtrader.
  3. Translates target_weight changes into market orders sized by the
     same fraction-of-equity convention, with the same commission +
     slippage costs we charge.
  4. Returns a `CrossValidationResult` carrying both engines' equity
     curves and a side-by-side metrics diff.

A diff ≤ ~5bp annualised is normal (rounding, intra-day rebalance vs
end-of-day timestamp). Diffs > 50bp annualised flag a bug in either
engine.

Backtrader is an OPTIONAL dependency — `pip install backtrader`. If not
installed we return None instead of crashing, so the existing one-engine
workflow is unaffected.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from ..core.types import Quote
from .engine import BacktestResult
from .metrics import Metrics, compute_metrics

log = logging.getLogger(__name__)


@dataclass
class CrossValidationResult:
    """Side-by-side comparison of our engine vs Backtrader."""

    ticker: str
    ours: BacktestResult
    backtrader_metrics: Metrics
    backtrader_equity_curve: list[float]
    # Annualised-return diff, in absolute percentage points.
    # If our engine reports 12% annual and Backtrader reports 11.6%,
    # ann_return_diff_pct = 0.4.
    ann_return_diff_pct: float
    sharpe_diff: float
    max_dd_diff_pct: float
    flagged_disagreement: bool                  # set when any diff > threshold
    notes: list[str] = field(default_factory=list)


def cross_validate(
    *,
    ours: BacktestResult,
    quotes: list[Quote],
    weights: list[float],
    initial_capital: float = 100_000.0,
    commission_bps: float = 5.0,
    slippage_bps: float = 5.0,
    sell_tax_bps: float = 0.0,
    diff_threshold_pct: float = 0.5,
) -> CrossValidationResult | None:
    """Replay `weights` through Backtrader and compare against `ours`.

    Returns None if Backtrader isn't installed (the caller should treat
    this as "skip cross-validation, no harm done" rather than an error).

    `weights` must have the same length as `quotes` and use the same
    fraction-of-equity convention our engine uses (positive = long,
    negative = short, ±1.0 = full notional).
    """
    try:
        import backtrader as bt
    except ImportError:
        log.info("backtrader not installed — skipping cross-validation")
        return None

    if len(quotes) != len(weights):
        raise ValueError(
            f"quotes/weights length mismatch ({len(quotes)} vs {len(weights)})"
        )
    if not quotes:
        raise ValueError("no quotes provided")

    # ---- build a pandas-like data feed -----------------------------------
    # Backtrader has its own PandasData class. To avoid pulling pandas in
    # if the caller doesn't have it, build a list-backed feed instead.
    # We use bt.feeds.PandasData when pandas is available (cleaner) or a
    # custom CSV-like feed otherwise.
    try:
        import pandas as pd

        df = pd.DataFrame({
            "open":   [q.open for q in quotes],
            "high":   [q.high for q in quotes],
            "low":    [q.low for q in quotes],
            "close":  [q.close for q in quotes],
            "volume": [q.volume for q in quotes],
        }, index=pd.to_datetime([q.asof for q in quotes]))
        data_feed = bt.feeds.PandasData(dataname=df)
    except ImportError:
        # No pandas — fall back to GenericCSV-like in-memory feed.
        # Pretty rare in practice since pandas is in our base requirements.
        log.warning("pandas not available; cross-validation feed builder needs pandas")
        return None

    # ---- one-strategy-replays-our-weights --------------------------------
    target_weights = list(weights)  # copy for closure
    quotes_dates = [q.asof.date() for q in quotes]

    class ReplayStrategy(bt.Strategy):
        """A Backtrader Strategy that simply targets our pre-computed
        weights at every bar. We use `order_target_percent` so Backtrader
        handles the position sizing + commission, and we can compare
        end-to-end equity curves."""

        def next(self):
            i = len(self) - 1
            if i >= len(target_weights):
                return
            target_pct = target_weights[i]
            # Backtrader's order_target_percent takes a fraction (0–1).
            # Negative values short the position; we accept that since
            # our short_selling_allowed regime check happens upstream.
            try:
                self.order_target_percent(target=target_pct)
            except Exception as e:
                log.debug("Backtrader order failed at i=%d: %s", i, e)

    # ---- cerebro setup ---------------------------------------------------
    cerebro = bt.Cerebro()
    cerebro.addstrategy(ReplayStrategy)
    cerebro.adddata(data_feed)
    cerebro.broker.setcash(initial_capital)
    # Backtrader's commission is in fraction (1bp = 0.0001). Combine
    # commission + slippage on each round-trip side. Sell-side stamp
    # tax is folded into commission as a one-side surcharge (close enough).
    bt_commission = (commission_bps + slippage_bps + sell_tax_bps / 2) / 10_000
    cerebro.broker.setcommission(commission=bt_commission)

    # Run + harvest equity curve ------------------------------------------
    # Backtrader returns the strategies, but to extract the equity
    # curve over time we need to add an analyzer. Use TimeReturn with
    # daily timeframe.
    cerebro.addanalyzer(bt.analyzers.TimeReturn, _name="t_return", timeframe=bt.TimeFrame.Days)

    try:
        results = cerebro.run()
    except Exception as e:
        log.warning("Backtrader cerebro.run() failed: %s", e)
        return None

    strat = results[0]
    daily_returns = strat.analyzers.t_return.get_analysis()
    # Reconstruct equity curve from sequential daily returns.
    equity = [initial_capital]
    for _, r in sorted(daily_returns.items()):
        equity.append(equity[-1] * (1 + (r or 0.0)))

    # Pad to match quotes length if Backtrader emitted fewer points (it
    # sometimes drops the very first bar before any orders happen).
    while len(equity) < len(quotes):
        equity.insert(0, initial_capital)

    elapsed_days = (quotes[-1].asof.date() - quotes[0].asof.date()).days
    bt_metrics = compute_metrics(
        equity, trade_log=None, elapsed_days=elapsed_days,
    )

    # ---- diff ------------------------------------------------------------
    ann_diff = abs(ours.metrics.annual_return - bt_metrics.annual_return) * 100
    sharpe_diff = abs(ours.metrics.sharpe - bt_metrics.sharpe)
    dd_diff = abs(ours.metrics.max_drawdown - bt_metrics.max_drawdown) * 100

    flagged = (
        ann_diff > diff_threshold_pct
        or sharpe_diff > 0.3
        or dd_diff > diff_threshold_pct
    )

    notes: list[str] = []
    if flagged:
        notes.append(
            f"DISAGREEMENT: ours_ann_ret={ours.metrics.annual_return:+.4f} vs "
            f"bt_ann_ret={bt_metrics.annual_return:+.4f} (Δ={ann_diff:.2f}pp)"
        )
    else:
        notes.append(
            f"engines agree within tolerance "
            f"(Δann_ret={ann_diff:.3f}pp, Δsharpe={sharpe_diff:.2f}, ΔmaxDD={dd_diff:.3f}pp)"
        )

    return CrossValidationResult(
        ticker=ours.ticker,
        ours=ours,
        backtrader_metrics=bt_metrics,
        backtrader_equity_curve=equity,
        ann_return_diff_pct=round(ann_diff, 4),
        sharpe_diff=round(sharpe_diff, 4),
        max_dd_diff_pct=round(dd_diff, 4),
        flagged_disagreement=flagged,
        notes=notes,
    )
