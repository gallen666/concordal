"""End-to-end smoke + invariant tests. These are the regression net.

If you change anything in the agent graph, run:
    pytest -q

These tests use the MockAdapter and MockProvider so they're deterministic and
fast - no API keys needed."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from trading_agents.adapters import get_adapter
from trading_agents.adapters.base import AdapterError
from trading_agents.backtest.engine import Backtester
from trading_agents.backtest.metrics import compute_metrics
from trading_agents.core.graph import run_decision
from trading_agents.core.regime import US_EQUITY, A_SHARE, get_regime
from trading_agents.core.types import Side


def test_full_pipeline_runs():
    trace = run_decision(ticker="AAPL", asof=date.today(), market="us_equity", debate_rounds=1)
    assert trace.decision.ticker == "AAPL"
    assert isinstance(trace.decision.side, Side)
    assert -1.0 <= trace.decision.target_weight <= 1.0
    assert 0.0 <= trace.decision.confidence <= 1.0
    assert len(trace.analyst_reports) == 4
    assert trace.researcher_debate is not None
    assert len(trace.researcher_debate.turns) == 2  # 1 round = 1 bull + 1 bear
    assert trace.risk_debate is not None
    assert len(trace.risk_debate.turns) == 3
    assert trace.total_cost_usd >= 0


def test_short_blocked_in_a_share_regime():
    """Even if the manager wants to short, A-share rules forbid it.
    The manager node must clamp negative weights to 0 and add a flag."""
    # Use mock adapter but override its regime to A_SHARE-like
    from trading_agents.adapters.mock import MockAdapter
    a = MockAdapter()
    a.regime = A_SHARE  # type: ignore
    trace = run_decision(
        ticker="600519",
        asof=date.today(),
        market="us_equity",  # pack still ok for smoke
        adapter=a,
        debate_rounds=1,
    )
    assert trace.decision.target_weight >= 0.0  # never short


def test_no_lookahead_in_news():
    a = get_adapter("mock")
    asof = date.today() - timedelta(days=10)
    items = a.get_news("TEST", asof, lookback_days=7)
    for item in items:
        assert item.published_at.date() <= asof, (
            f"Lookahead violation: {item.published_at.date()} > {asof}"
        )


def test_no_lookahead_assertion_raises():
    from datetime import datetime, timezone

    a = get_adapter("mock")
    future = datetime.combine(
        date.today() + timedelta(days=2), datetime.min.time(), tzinfo=timezone.utc
    )
    with pytest.raises(AdapterError):
        a.assert_no_future(date.today(), future)


def test_metrics_basic():
    # 10% gain with no drawdown
    curve = [100, 101, 102, 105, 110]
    m = compute_metrics(curve)
    assert m.cumulative_return == pytest.approx(0.10, abs=1e-3)
    assert m.max_drawdown == 0.0


def test_metrics_drawdown():
    curve = [100, 110, 120, 90, 95]
    m = compute_metrics(curve)
    # peak 120 -> 90 = -25%
    assert m.max_drawdown == pytest.approx(-0.25, abs=1e-3)


def test_baseline_buyhold_full_capture():
    a = get_adapter("mock")
    bt = Backtester(adapter=a, commission_bps=0, slippage_bps=0)
    end = date.today()
    start = end - timedelta(days=60)
    res = bt.run_baseline(
        "TEST", start, end,
        next(b for b in __import__("trading_agents.backtest.baselines", fromlist=["BUILTIN_BASELINES"]).BUILTIN_BASELINES if b.name == "Buy&Hold"),
    )
    # Buy&hold's cum return should track the price exactly when costs=0
    quotes = a.get_price_history("TEST", start, end)
    expected = quotes[-1].close / quotes[0].close - 1.0
    assert abs(res.metrics.cumulative_return - round(expected, 4)) < 0.01


def test_regime_lookup():
    assert get_regime("us_equity").market == "us_equity"
    assert get_regime("a_share").short_selling_allowed is False
    assert get_regime("crypto").trading_hours.weekdays_only is False


def test_regime_unknown_raises():
    with pytest.raises(KeyError):
        get_regime("forex_3am_japan")


def test_decision_serializes_round_trip():
    trace = run_decision(ticker="MSFT", asof=date.today(), debate_rounds=1)
    blob = trace.model_dump_json()
    assert "MSFT" in blob
    assert "decision" in blob
