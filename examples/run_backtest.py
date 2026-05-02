"""Backtest demo - runs the 5 baselines + the agent over a 90-day window
on the mock adapter, prints a comparison table.
"""

from __future__ import annotations

from datetime import date, timedelta

from trading_agents.adapters import get_adapter
from trading_agents.backtest.engine import Backtester
from trading_agents.core.graph import run_decision


def main() -> None:
    adapter = get_adapter("us_equity")
    bt = Backtester(adapter=adapter)
    ticker = "AAPL"
    end = date.today()
    start = end - timedelta(days=120)

    print(f"Backtest {ticker}  {start}..{end}\n")
    rows = []
    for r in bt.run_all_baselines(ticker, start, end):
        rows.append((r.name, r.metrics))

    def decide_fn(t: str, asof: date):
        return run_decision(ticker=t, asof=asof, market="us_equity", debate_rounds=1).decision

    agent = bt.run_agent(ticker, start, end, decide_fn, rebalance_every_days=10)
    rows.append((agent.name, agent.metrics))

    header = f"{'Strategy':<14}{'CumRet':>10}{'Annual':>10}{'Sharpe':>8}{'MDD':>10}{'#Trd':>6}"
    print(header)
    print("-" * len(header))
    for name, m in rows:
        print(
            f"{name:<14}"
            f"{m.cumulative_return:>+10.2%}"
            f"{m.annual_return:>+10.2%}"
            f"{m.sharpe:>8.2f}"
            f"{m.max_drawdown:>+10.2%}"
            f"{m.n_trades:>6d}"
        )


if __name__ == "__main__":
    main()
