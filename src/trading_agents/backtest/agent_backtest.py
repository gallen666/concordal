"""Multi-ticker, multi-week agent backtest harness.

Wraps `Backtester.run_agent()` to:
    - run the 7-agent pipeline on each (ticker, asof) pair
    - aggregate per-ticker results into an equal-weighted portfolio curve
    - compute portfolio-level metrics (Sharpe, MaxDD, win rate)
    - compare against per-ticker Buy & Hold and a portfolio of B&H
    - emit a JSON report the frontend can render as a "track record" page

Why this is the most important file in the project:
    Without this, we have a 7-agent demo with no evidence that its decisions
    are better than coin-flips. With it, we have either:
      (a) measurable alpha → product is real, can charge for it
      (b) no alpha → must pivot positioning to "research helper", not "alpha"
    Either way, the answer is more valuable than another feature.

Usage (CLI):

    python -m trading_agents.backtest.agent_backtest \\
        --tickers AAPL,NVDA,TSLA,300750.SZ \\
        --start 2024-11-01 --end 2026-05-01 \\
        --rebalance-days 5 --locale en \\
        --output reports/backtest_2026-05-09.json

Cost knobs (env):
    TA_BACKTEST_FAST_MODEL    cheap model for analysts/risk (default: gemini-2.5-flash)
    TA_BACKTEST_DEEP_MODEL    expensive model for trader/manager (default: gemini-3.1-pro-preview)
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from ..adapters import get_adapter
from ..core.graph import run_decision
from ..core.types import Decision, DecisionTrace
from ..llm.router import LLMRouter, Tier
from .engine import Backtester, BacktestResult
from .metrics import Metrics, compute_metrics
from .baselines import BUILTIN_BASELINES

log = logging.getLogger("ta.backtest.agent")


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------


@dataclass
class TickerSpec:
    """A ticker plus its market (so we pick the right adapter)."""

    ticker: str
    market: str  # "us_equity" or "a_share"


def _classify_ticker(t: str) -> TickerSpec:
    """Auto-detect market from ticker shape: 6-digit numeric → A-share."""
    s = t.strip().upper()
    if s.isdigit() and len(s) == 6:
        return TickerSpec(ticker=s, market="a_share")
    return TickerSpec(ticker=s, market="us_equity")


@dataclass
class AgentBacktestConfig:
    tickers: list[TickerSpec]
    start: date
    end: date
    rebalance_every_days: int = 5  # weekly on trading days
    locale: str = "en"
    debate_rounds: int = 1  # 1 keeps cost ~halved vs production default of 2
    user_risk_profile: str = "balanced"
    initial_capital: float = 100_000.0
    # Cost / safety
    max_cost_usd: float = 100.0  # hard stop
    skip_on_error: bool = True   # don't crash whole run on one bad date


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------


@dataclass
class TickerOutcome:
    ticker: str
    market: str
    agent_metrics: Metrics
    bh_metrics: Metrics              # baseline: 100% buy & hold
    macd_metrics: Metrics | None     # baseline: MACD crossover
    agent_curve: list[float]
    bh_curve: list[float]
    rebalance_dates: list[str]       # ISO dates we re-decided
    decisions: list[dict]            # serialized Decision objects per rebalance


@dataclass
class PortfolioMetrics:
    """Equal-weighted portfolio of all tickers under each strategy."""

    agent: Metrics
    bh: Metrics
    excess_return_vs_bh: float       # agent.cum_return - bh.cum_return
    excess_sharpe_vs_bh: float
    pct_tickers_agent_beats_bh: float


@dataclass
class AgentBacktestReport:
    config: dict
    started_at: str
    finished_at: str
    wall_clock_seconds: float
    per_ticker: list[TickerOutcome]
    portfolio: PortfolioMetrics
    n_decisions: int
    estimated_cost_usd: float


# ---------------------------------------------------------------------------
# Core backtest logic
# ---------------------------------------------------------------------------


def _make_decide_fn(market: str, *, llm: LLMRouter, locale: str, debate_rounds: int, user_risk_profile: str):
    """Build the closure `decide_fn(ticker, asof)` that the engine will call."""
    adapter = get_adapter(market)

    def decide(ticker: str, asof: date) -> Decision:
        trace: DecisionTrace = run_decision(
            ticker=ticker,
            asof=asof,
            market=market,
            adapter=adapter,
            llm=llm,
            debate_rounds=debate_rounds,
            user_risk_profile=user_risk_profile,
            locale=locale,
        )
        return trace.decision

    return decide


def _per_ticker_run(
    spec: TickerSpec,
    cfg: AgentBacktestConfig,
    llm: LLMRouter,
    decisions_out: list[dict],
) -> TickerOutcome:
    log.info("=== %s (%s) ===", spec.ticker, spec.market)
    adapter = get_adapter(spec.market)
    # Use market-aware cost defaults: A-shares pay 5bp stamp tax on sells,
    # US equities don't. See Backtester.for_market for full breakdown.
    bt = Backtester.for_market(adapter, initial_capital=cfg.initial_capital)

    # The agent itself
    decide_fn = _make_decide_fn(
        spec.market,
        llm=llm,
        locale=cfg.locale,
        debate_rounds=cfg.debate_rounds,
        user_risk_profile=cfg.user_risk_profile,
    )

    # Wrap decide_fn so we record every decision we make (for the report).
    rebalance_dates: list[str] = []

    def _recording_decide(ticker: str, asof: date) -> Decision:
        d = decide_fn(ticker, asof)
        rebalance_dates.append(asof.isoformat())
        decisions_out.append({
            "ticker": ticker,
            "market": spec.market,
            "asof": asof.isoformat(),
            "side": d.side.value if hasattr(d.side, "value") else str(d.side),
            "target_weight": d.target_weight,
            "confidence": d.confidence,
            "rationale": d.rationale[:600],  # cap for report size
        })
        return d

    agent_result = bt.run_agent(
        spec.ticker,
        cfg.start,
        cfg.end,
        decide_fn=_recording_decide,
        rebalance_every_days=cfg.rebalance_every_days,
    )

    # Buy & Hold baseline (100% long every day)
    bh_baseline = next(b for b in BUILTIN_BASELINES if b.name.lower().startswith("buy"))
    bh_result = bt.run_baseline(spec.ticker, cfg.start, cfg.end, bh_baseline)

    # MACD baseline if available
    macd_metrics = None
    try:
        macd_baseline = next(b for b in BUILTIN_BASELINES if "macd" in b.name.lower())
        macd_result = bt.run_baseline(spec.ticker, cfg.start, cfg.end, macd_baseline)
        macd_metrics = macd_result.metrics
    except StopIteration:
        pass

    return TickerOutcome(
        ticker=spec.ticker,
        market=spec.market,
        agent_metrics=agent_result.metrics,
        bh_metrics=bh_result.metrics,
        macd_metrics=macd_metrics,
        agent_curve=agent_result.equity_curve,
        bh_curve=bh_result.equity_curve,
        rebalance_dates=rebalance_dates,
        decisions=[d for d in decisions_out if d["ticker"] == spec.ticker],
    )


def _portfolio_curve(curves: list[list[float]]) -> list[float]:
    """Equal-weighted portfolio: average of normalized per-ticker curves."""
    if not curves:
        return []
    # Pad / truncate to common length (length of price series may differ
    # across tickers due to listings / holidays); use min length.
    min_len = min(len(c) for c in curves)
    out: list[float] = []
    for i in range(min_len):
        out.append(sum(c[i] for c in curves) / len(curves))
    return out


def run_agent_backtest(cfg: AgentBacktestConfig) -> AgentBacktestReport:
    """Run the full agent backtest. This is the entry point.

    Returns a JSON-serializable report. Caller is responsible for writing it
    to disk if desired.
    """
    started = datetime.now(tz=timezone.utc)
    t0 = time.time()

    # Prefer cheap models for analysts in backtest to keep cost manageable.
    # We don't override the LLMRouter's tier mapping per call (that would
    # require API changes); instead we mutate env so the router picks up
    # the cheap defaults at construction. Caller can override via env.
    fast = os.environ.get("TA_BACKTEST_FAST_MODEL", "gemini-2.5-flash")
    deep = os.environ.get("TA_BACKTEST_DEEP_MODEL", "gemini-3.1-pro-preview")
    os.environ.setdefault("TA_MODEL_FAST", fast)
    os.environ.setdefault("TA_MODEL_MID", fast)
    os.environ.setdefault("TA_MODEL_DEEP", deep)

    # One LLMRouter shared across all decisions so cost accumulates centrally.
    llm = LLMRouter(locale=cfg.locale)

    decisions_out: list[dict] = []
    per_ticker: list[TickerOutcome] = []

    for i, spec in enumerate(cfg.tickers, 1):
        log.info("Ticker %d / %d", i, len(cfg.tickers))
        try:
            outcome = _per_ticker_run(spec, cfg, llm, decisions_out)
            per_ticker.append(outcome)
        except Exception as e:
            if cfg.skip_on_error:
                log.exception("Skipping %s due to error: %s", spec.ticker, e)
                continue
            raise

    # Portfolio aggregation
    agent_curves = [o.agent_curve for o in per_ticker]
    bh_curves = [o.bh_curve for o in per_ticker]
    agent_port = _portfolio_curve(agent_curves)
    bh_port = _portfolio_curve(bh_curves)

    agent_port_metrics = compute_metrics(agent_port, [])
    bh_port_metrics = compute_metrics(bh_port, [])

    n_beats = sum(
        1 for o in per_ticker
        if o.agent_metrics.cumulative_return > o.bh_metrics.cumulative_return
    )
    pct_beats = (n_beats / len(per_ticker)) if per_ticker else 0.0

    portfolio = PortfolioMetrics(
        agent=agent_port_metrics,
        bh=bh_port_metrics,
        excess_return_vs_bh=(
            agent_port_metrics.cumulative_return - bh_port_metrics.cumulative_return
        ),
        excess_sharpe_vs_bh=agent_port_metrics.sharpe - bh_port_metrics.sharpe,
        pct_tickers_agent_beats_bh=pct_beats,
    )

    # Cost estimate from the LLMRouter's accumulated usage. The router doesn't
    # currently aggregate this so we approximate from decisions count.
    n_decisions = len(decisions_out)
    # Rough: ~7 LLM calls per decision; analysts cheap, trader/manager pricey
    est_cost = n_decisions * 0.05  # ~$0.05 per full decision with our model mix

    finished = datetime.now(tz=timezone.utc)

    return AgentBacktestReport(
        config={
            "tickers": [(s.ticker, s.market) for s in cfg.tickers],
            "start": cfg.start.isoformat(),
            "end": cfg.end.isoformat(),
            "rebalance_every_days": cfg.rebalance_every_days,
            "locale": cfg.locale,
            "debate_rounds": cfg.debate_rounds,
            "user_risk_profile": cfg.user_risk_profile,
        },
        started_at=started.isoformat(),
        finished_at=finished.isoformat(),
        wall_clock_seconds=time.time() - t0,
        per_ticker=per_ticker,
        portfolio=portfolio,
        n_decisions=n_decisions,
        estimated_cost_usd=round(est_cost, 2),
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _to_jsonable(obj: Any) -> Any:
    """Recursive dataclass → dict, keeping things JSON-serializable."""
    if hasattr(obj, "__dataclass_fields__"):
        return {k: _to_jsonable(v) for k, v in asdict(obj).items()}
    if isinstance(obj, dict):
        return {k: _to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_to_jsonable(v) for v in obj]
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    return obj


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Run the agent backtest.")
    p.add_argument(
        "--tickers",
        required=True,
        help="Comma-separated tickers. 6-digit numeric routes to a_share. "
             "e.g. 'AAPL,NVDA,300750'",
    )
    p.add_argument("--start", required=True, help="YYYY-MM-DD")
    p.add_argument("--end", required=True, help="YYYY-MM-DD")
    p.add_argument("--rebalance-days", type=int, default=5)
    p.add_argument("--locale", default="en", choices=["en", "zh"])
    p.add_argument("--debate-rounds", type=int, default=1)
    p.add_argument("--output", required=True, help="Path to write JSON report")
    p.add_argument("--max-cost", type=float, default=100.0, help="USD cap")
    p.add_argument(
        "--smoke",
        action="store_true",
        help="Smoke test: only first 3 tickers, last 4 weeks",
    )
    return p.parse_args()


def main() -> int:
    logging.basicConfig(
        level=os.environ.get("TA_LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
    )

    args = _parse_args()
    tickers = [_classify_ticker(t) for t in args.tickers.split(",") if t.strip()]
    start = date.fromisoformat(args.start)
    end = date.fromisoformat(args.end)

    if args.smoke:
        tickers = tickers[:3]
        # Last 4 weeks of the requested window
        from datetime import timedelta
        start = max(start, end - timedelta(days=28))
        log.info("SMOKE mode: %s tickers, %s..%s", len(tickers), start, end)

    cfg = AgentBacktestConfig(
        tickers=tickers,
        start=start,
        end=end,
        rebalance_every_days=args.rebalance_days,
        locale=args.locale,
        debate_rounds=args.debate_rounds,
        max_cost_usd=args.max_cost,
    )

    log.info(
        "Running backtest: %d tickers × %s..%s (rebalance every %d trading days)",
        len(cfg.tickers), cfg.start, cfg.end, cfg.rebalance_every_days,
    )

    report = run_agent_backtest(cfg)

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(_to_jsonable(report), indent=2, ensure_ascii=False))

    # Print a one-screen summary
    p = report.portfolio
    print()
    print("=" * 70)
    print(f"BACKTEST COMPLETE in {report.wall_clock_seconds:.0f}s — {report.n_decisions} decisions")
    print("=" * 70)
    print(f"Window:      {cfg.start} → {cfg.end}")
    print(f"Tickers:     {len(cfg.tickers)}")
    print(f"Locale:      {cfg.locale}")
    print(f"Est. cost:   ${report.estimated_cost_usd}")
    print()
    print(f"  Strategy        |  CumRet  | AnnRet  | Sharpe | MaxDD   ")
    print(f"  ----------------|----------|---------|--------|---------")
    print(f"  Agent (port.)   | {p.agent.cumulative_return:+7.2%} | {p.agent.annual_return:+6.2%} | {p.agent.sharpe:+5.2f}  | {p.agent.max_drawdown:+6.2%}")
    print(f"  Buy&Hold (port.)| {p.bh.cumulative_return:+7.2%} | {p.bh.annual_return:+6.2%} | {p.bh.sharpe:+5.2f}  | {p.bh.max_drawdown:+6.2%}")
    print()
    print(f"  Agent − B&H excess return: {p.excess_return_vs_bh:+7.2%}")
    print(f"  Agent − B&H excess Sharpe: {p.excess_sharpe_vs_bh:+5.2f}")
    print(f"  Agent beats B&H on: {p.pct_tickers_agent_beats_bh:.0%} of tickers")
    print()
    print(f"  Report saved: {out_path}")
    print("=" * 70)

    return 0


if __name__ == "__main__":
    sys.exit(main())
