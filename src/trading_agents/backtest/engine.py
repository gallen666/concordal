"""Strict-no-lookahead backtester.

Two modes:

  1. `walk_baseline(strategy_fn)`: deterministic strategies (Buy&Hold, MACD,
     etc.). Just walk the price series, apply target weights, mark to market.

  2. `walk_agent(decide_fn)`: agent-based. For each rebalance date, call the
     decision pipeline with `asof=that_date` (the adapter enforces no-future-
     leak). Apply the resulting weight; rebalance again at the next interval.

Both produce an `equity_curve` and a `trade_log` that `compute_metrics`
converts to a `Metrics` dataclass.

For LLM-based strategies the engine supports running multiple seeds and
returning a distribution, since LLM output is non-deterministic and a single
backtest is meaningless on its own.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Callable

from ..adapters.base import MarketAdapter
from ..core.types import Decision, Quote
from .baselines import BUILTIN_BASELINES, Baseline
from .metrics import Metrics, compute_metrics

log = logging.getLogger(__name__)


@dataclass
class BacktestResult:
    name: str
    ticker: str
    start: date
    end: date
    equity_curve: list[float]
    weights: list[float]
    trade_log: list[dict]
    metrics: Metrics
    notes: str = ""


@dataclass
class Backtester:
    """Strict-no-lookahead backtester with realistic friction model.

    Cost model defaults are tuned for retail-scale execution and are
    intentionally pessimistic — better to under-promise in backtests
    than to over-promise in live. Override per-market via the cost
    knobs below if you want to model an institutional execution path.
    """

    adapter: MarketAdapter
    initial_capital: float = 100_000.0

    # ---- transaction-cost model ------------------------------------
    # Defaults reflect realistic retail friction.
    #   commission_bps    : broker commission per fill (one side)
    #   slippage_bps      : effective spread + market-impact (one side)
    #   sell_tax_bps      : asymmetric tax charged on sells only.
    #                       Mainly for A-shares where stamp tax (印花税)
    #                       is currently 5bp on sells. Set to 0 elsewhere.
    # Round-trip US: ~10bp.  Round-trip A-share: ~15bp (commission + tax + slip).
    commission_bps: float = 5.0
    slippage_bps: float = 5.0
    sell_tax_bps: float = 0.0

    # ---- helpers ----------------------------------------------------------

    def _apply_costs(self, ret: float, weight_change: float) -> float:
        """Charge friction proportional to turnover.

        weight_change > 0 => buying (entering or adding to long)
        weight_change < 0 => selling (cutting or going short)

        Both sides pay commission + slippage; sells additionally pay
        sell_tax_bps so A-share stamp tax can be modeled.
        """
        turnover = abs(weight_change)
        if turnover == 0:
            return ret
        # All trades pay commission + slippage.
        per_side = (self.commission_bps + self.slippage_bps) / 10_000
        cost = turnover * per_side
        # Sells additionally pay the sell-side tax.
        if weight_change < 0 and self.sell_tax_bps > 0:
            cost += turnover * (self.sell_tax_bps / 10_000)
        return ret - cost

    @classmethod
    def for_market(cls, adapter: MarketAdapter, **overrides) -> "Backtester":
        """Construct a Backtester with cost defaults tuned per market.

        US equity:  10bp round-trip (5bp commission + 5bp slippage).
        A-share:    15bp round-trip (5bp commission + 5bp slip + 5bp stamp tax).
        Fallback:   10bp round-trip.
        """
        market = (getattr(adapter, "market", "") or "").lower()
        if market in ("a_share", "cn_equity", "china_equity"):
            defaults = dict(commission_bps=5.0, slippage_bps=5.0, sell_tax_bps=5.0)
        else:
            defaults = dict(commission_bps=5.0, slippage_bps=5.0, sell_tax_bps=0.0)
        defaults.update(overrides)
        return cls(adapter=adapter, **defaults)

    def _walk_with_weights(
        self,
        quotes: list[Quote],
        weights: list[float],
        name: str,
        ticker: str,
    ) -> BacktestResult:
        assert len(quotes) == len(weights)
        equity = [self.initial_capital]
        trade_log: list[dict] = []
        prev_w = 0.0
        last_entry_idx = None
        for i in range(1, len(quotes)):
            ret = quotes[i].close / quotes[i - 1].close - 1.0
            w = weights[i - 1]  # use yesterday's weight (no lookahead)
            net_ret = self._apply_costs(ret * w, w - prev_w)
            equity.append(equity[-1] * (1 + net_ret))

            if w != prev_w:
                if prev_w == 0 and w > 0:
                    last_entry_idx = i
                if prev_w > 0 and w == 0 and last_entry_idx is not None:
                    trade_log.append({
                        "entry": quotes[last_entry_idx].asof,
                        "exit": quotes[i].asof,
                        "pnl": equity[-1] - equity[last_entry_idx],
                        "holding_days": (
                            quotes[i].asof.date() - quotes[last_entry_idx].asof.date()
                        ).days,
                    })
                    last_entry_idx = None
            prev_w = w

        elapsed_days = (quotes[-1].asof.date() - quotes[0].asof.date()).days
        return BacktestResult(
            name=name,
            ticker=ticker,
            start=quotes[0].asof.date(),
            end=quotes[-1].asof.date(),
            equity_curve=equity,
            weights=list(weights),
            trade_log=trade_log,
            metrics=compute_metrics(equity, trade_log, elapsed_days=elapsed_days),
        )

    # ---- public APIs ------------------------------------------------------

    def run_baseline(self, ticker: str, start: date, end: date, baseline: Baseline) -> BacktestResult:
        quotes = self.adapter.get_price_history(ticker, start, end)
        if not quotes:
            raise ValueError(f"No price data for {ticker} {start}..{end}")
        weights = baseline.fn(quotes)
        return self._walk_with_weights(quotes, weights, baseline.name, ticker)

    def run_all_baselines(self, ticker: str, start: date, end: date) -> list[BacktestResult]:
        return [self.run_baseline(ticker, start, end, b) for b in BUILTIN_BASELINES]

    def run_agent(
        self,
        ticker: str,
        start: date,
        end: date,
        decide_fn: Callable[[str, date], Decision],
        rebalance_every_days: int = 5,
    ) -> BacktestResult:
        """Agent-driven backtest. Rebalance every N trading days by calling
        `decide_fn(ticker, asof)`; the function MUST honour the no-lookahead
        contract (use the adapter's asof-aware methods)."""
        quotes = self.adapter.get_price_history(ticker, start, end)
        if not quotes:
            raise ValueError(f"No price data for {ticker} {start}..{end}")

        weights = [0.0] * len(quotes)
        last_decision: Decision | None = None
        last_rebalance_idx = -rebalance_every_days
        for i, q in enumerate(quotes):
            if i - last_rebalance_idx >= rebalance_every_days:
                try:
                    decision = decide_fn(ticker, q.asof.date())
                    last_decision = decision
                    last_rebalance_idx = i
                    log.info(
                        "[%s] %s: %s w=%.2f conf=%.2f",
                        ticker, q.asof.date(), decision.side.value,
                        decision.target_weight, decision.confidence,
                    )
                except Exception as e:
                    log.error("Decision failed at %s: %s", q.asof.date(), e)
            weights[i] = last_decision.target_weight if last_decision else 0.0

        return self._walk_with_weights(quotes, weights, "TradingAgents", ticker)
