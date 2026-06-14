"""ta CLI - run a single decision or a backtest from the terminal."""

from __future__ import annotations

import json
from datetime import date, timedelta

try:
    import typer
    from rich.console import Console
    from rich.table import Table
except ImportError:  # pragma: no cover - fallback so module is importable
    typer = None
    Console = None
    Table = None

from .backtest.engine import Backtester
from .core.graph import run_decision

app = typer.Typer(help="Concordal CLI") if typer else None
console = Console() if Console else None


def _print_trace(trace) -> None:
    if not console:
        print(json.dumps(trace.decision.model_dump(mode="json"), indent=2))
        return
    d = trace.decision
    table = Table(title=f"Decision for {d.ticker} ({d.asof})")
    table.add_column("Field")
    table.add_column("Value")
    table.add_row("Side", d.side.value)
    table.add_row("Target weight", f"{d.target_weight:+.3f}")
    table.add_row("Confidence", f"{d.confidence:.2f}")
    table.add_row("Rationale", d.rationale)
    table.add_row("Risk notes", d.risk_notes)
    table.add_row("Flags", ", ".join(d.flags) or "(none)")
    table.add_row("LLM cost", f"${trace.total_cost_usd:.4f}")
    table.add_row("Tokens (in/out)", f"{sum(u.input_tokens for u in trace.usage)}/{sum(u.output_tokens for u in trace.usage)}")
    console.print(table)


if app:

    @app.command()
    def decide(
        ticker: str,
        asof: str = typer.Option(None, help="YYYY-MM-DD; defaults to today"),
        market: str = typer.Option("us_equity"),
        rounds: int = typer.Option(2, help="Bull/Bear debate rounds"),
        risk_profile: str = typer.Option("balanced"),
    ):
        """Run the full 7-agent decision pipeline for one ticker."""
        d = date.fromisoformat(asof) if asof else date.today()
        trace = run_decision(
            ticker=ticker.upper(),
            asof=d,
            market=market,
            debate_rounds=rounds,
            user_risk_profile=risk_profile,
        )
        _print_trace(trace)

    @app.command()
    def backtest(
        ticker: str,
        days: int = typer.Option(120, help="Number of days back from today"),
        rebalance_days: int = typer.Option(5),
        market: str = typer.Option("us_equity"),
        baselines_only: bool = typer.Option(False, help="Skip the agent run"),
    ):
        """Run baselines (and optionally the agent strategy) over a window."""
        from .adapters import get_adapter
        adapter = get_adapter(market)
        end = date.today()
        start = end - timedelta(days=days)

        bt = Backtester(adapter=adapter)

        if console:
            table = Table(title=f"Backtest {ticker} {start}..{end}")
            for col in ("Strategy", "CumRet", "Annual", "Sharpe", "MDD", "Trades"):
                table.add_column(col)
        else:
            table = None

        for r in bt.run_all_baselines(ticker, start, end):
            row = (
                r.name,
                f"{r.metrics.cumulative_return:+.2%}",
                f"{r.metrics.annual_return:+.2%}",
                f"{r.metrics.sharpe:.2f}",
                f"{r.metrics.max_drawdown:.2%}",
                str(r.metrics.n_trades),
            )
            if table:
                table.add_row(*row)
            else:
                print(row)

        if not baselines_only:
            def decide_fn(t: str, asof: date):
                return run_decision(ticker=t, asof=asof, market=market, debate_rounds=1).decision

            r = bt.run_agent(ticker, start, end, decide_fn, rebalance_every_days=rebalance_days)
            row = (
                "TradingAgents",
                f"{r.metrics.cumulative_return:+.2%}",
                f"{r.metrics.annual_return:+.2%}",
                f"{r.metrics.sharpe:.2f}",
                f"{r.metrics.max_drawdown:.2%}",
                str(r.metrics.n_trades),
            )
            if table:
                table.add_row(*row, style="bold")
            else:
                print(row)

        if console and table:
            console.print(table)


if __name__ == "__main__":
    if app:
        app()
    else:
        print("Install `typer` and `rich` to use the CLI: pip install typer rich")
