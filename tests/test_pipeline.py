"""End-to-end smoke + invariant tests. These are the regression net.

If you change anything in the agent graph, run:
    pytest -q

These tests use the MockAdapter and MockProvider so they're deterministic and
fast - no API keys needed."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

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


# ---- backtest accuracy guards (regression tests for the audit fixes) ------


def test_fundamentals_returns_stub_for_historical_asof_when_edgar_unavailable(monkeypatch):
    """Yahoo .info has no point-in-time path. For backtest dates we now
    try SEC EDGAR first; if EDGAR is unreachable (no network in tests)
    or doesn't have the ticker, we must fall through to an empty stub
    instead of injecting current data."""
    from trading_agents.adapters.yahoo_us_equity import YahooUSEquityAdapter
    from trading_agents.adapters import yahoo_us_equity as yus

    # Force EDGAR to act as unavailable so we exercise the stub fallback
    monkeypatch.setattr(yus, "get_pit_fundamentals", lambda t, a: None)
    a = YahooUSEquityAdapter()
    old = date(2023, 1, 15)
    f = a.get_fundamentals("AAPL", old)
    assert f.market_cap is None
    assert f.pe_ratio is None
    # Stub message references either EDGAR or "intentionally empty"
    assert f.notes and (
        "edgar" in f.notes.lower() or "intentionally empty" in f.notes.lower()
    )


def test_cn_sentiment_returns_stub_for_historical_asof():
    """akshare hot-rank endpoints have no asof param — refuse to return
    today's hotness for a 2-year-old backtest date."""
    from trading_agents.adapters.cn_equity import CnEquityAdapter
    a = CnEquityAdapter()
    old = date(2023, 1, 15)
    s = a.get_sentiment("600519", old)
    assert s.mention_count == 0
    assert s.bullish_share == 0.5 and s.bearish_share == 0.5


def test_cost_model_us_round_trip_costs_10bp():
    """US round-trip should cost ~10bp (5bp commission + 5bp slippage),
    no stamp tax."""
    class _A:
        market = "us_equity"
    bt = Backtester.for_market(_A())
    # Buy 100% then sell 100% later. Each leg charges 10bp on 100% turnover.
    # (10/10000) * 1.0 = 0.001 = 10bp per leg.
    assert bt._apply_costs(0.0, +1.0) == pytest.approx(-0.001)
    assert bt._apply_costs(0.0, -1.0) == pytest.approx(-0.001)


def test_cost_model_a_share_charges_stamp_tax_on_sells_only():
    """A-share sells pay an extra 5bp stamp tax."""
    class _A:
        market = "a_share"
    bt = Backtester.for_market(_A())
    # buy: 10bp commission+slip
    assert bt._apply_costs(0.0, +1.0) == pytest.approx(-0.001)
    # sell: 10bp + 5bp stamp = 15bp
    assert bt._apply_costs(0.0, -1.0) == pytest.approx(-0.0015)


def test_metrics_annualisation_uses_elapsed_days_when_provided():
    """Old formula (252/n) silently overstated annual return when bars
    had gaps. With elapsed_days=365 a +10% curve should annualise to 10%."""
    m = compute_metrics([100.0, 110.0], elapsed_days=365)
    assert abs(m.annual_return - 0.10) < 0.001


def test_sec_edgar_pit_lookahead_filter():
    """EDGAR adapter must drop any filing with `filed > asof`."""
    from trading_agents.adapters import sec_edgar

    # Synthesize a concept response with two filings: one before, one after asof
    fake_rows = [
        {"end": "2023-12-31", "filed": "2024-02-01", "fp": "Q4", "val": 100.0},
        {"end": "2024-03-31", "filed": "2024-05-01", "fp": "Q1", "val": 110.0},
        {"end": "2024-06-30", "filed": "2024-08-01", "fp": "Q2", "val": 120.0},  # AFTER asof
    ]
    asof = date(2024, 7, 15)  # before the Q2 filing date
    v = sec_edgar._latest_value_before(fake_rows, asof)
    assert v == 110.0, f"expected the Q1 filing (filed 2024-05-01), got {v}"


def test_sec_edgar_ttm_sum_uses_4_quarters():
    """TTM aggregator must take exactly the 4 most-recent quarters whose
    `filed <= asof`, not 5 and not the FY annual figure when quarters exist."""
    from trading_agents.adapters import sec_edgar

    fake_rows = [
        {"end": "2023-03-31", "filed": "2023-05-01", "fp": "Q1", "val": 1.0},
        {"end": "2023-06-30", "filed": "2023-08-01", "fp": "Q2", "val": 2.0},
        {"end": "2023-09-30", "filed": "2023-11-01", "fp": "Q3", "val": 3.0},
        {"end": "2023-12-31", "filed": "2024-02-01", "fp": "Q4", "val": 4.0},
        {"end": "2024-03-31", "filed": "2024-05-01", "fp": "Q1", "val": 5.0},
        {"end": "2023-12-31", "filed": "2024-02-15", "fp": "FY", "val": 10.0},  # decoy
    ]
    asof = date(2024, 6, 1)
    ttm = sec_edgar._ttm_sum(fake_rows, asof)
    # Q2..Q4 of 2023 + Q1 of 2024 = 2+3+4+5 = 14
    assert ttm == 14.0, f"expected 14.0 (Q2'23 + Q3'23 + Q4'23 + Q1'24), got {ttm}"


def test_router_picks_deepseek_defaults_when_only_deepseek_key_set(monkeypatch):
    """If DEEPSEEK_API_KEY is the only LLM key, the router should pick
    deepseek-chat / deepseek-reasoner as defaults instead of falling
    through to OpenAI / Anthropic models we don't have keys for."""
    for k in (
        "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY",
        "GOOGLE_API_KEY", "DASHSCOPE_API_KEY", "QWEN_API_KEY",
        "ZHIPU_API_KEY", "GLM_API_KEY",
    ):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "fake")
    monkeypatch.setenv("TA_MODE", "mock")

    # Reload router module so __init__ re-reads env
    import importlib
    import trading_agents.llm.router as rt
    importlib.reload(rt)
    r = rt.LLMRouter()
    assert r.models[rt.Tier.FAST].startswith("deepseek-")
    assert r.models[rt.Tier.DEEP] == "deepseek-reasoner"
    assert r._deepseek is not None


def test_reddit_news_filters_lookahead_correctly(monkeypatch):
    """Reddit posts created AFTER asof must never end up in the result."""
    from trading_agents.adapters import social_reddit

    asof = date(2024, 6, 1)
    after_asof = datetime(2024, 7, 15, tzinfo=timezone.utc).timestamp()
    before_asof = datetime(2024, 5, 28, tzinfo=timezone.utc).timestamp()
    way_before = datetime(2023, 1, 1, tzinfo=timezone.utc).timestamp()

    fake_posts = [
        {"title": "AAPL future post (should be filtered)", "selftext": "",
         "score": 5000, "ups": 5000, "num_comments": 200,
         "created_utc": after_asof, "permalink": "/r/wallstreetbets/x", "author": "a", "subreddit": "wallstreetbets"},
        {"title": "AAPL recent post within lookback", "selftext": "buy buy buy",
         "score": 200, "ups": 200, "num_comments": 30,
         "created_utc": before_asof, "permalink": "/r/wallstreetbets/y", "author": "b", "subreddit": "wallstreetbets"},
        {"title": "AAPL ancient post outside lookback", "selftext": "",
         "score": 9999, "ups": 9999, "num_comments": 999,
         "created_utc": way_before, "permalink": "/r/wallstreetbets/z", "author": "c", "subreddit": "wallstreetbets"},
    ]
    monkeypatch.setattr(social_reddit, "_search_subreddit", lambda *a, **k: fake_posts)

    items = social_reddit.fetch_news("AAPL", asof, market="us_equity", lookback_days=7)
    titles = [i.headline for i in items]
    assert any("recent post" in t for t in titles)
    assert not any("future post" in t for t in titles), "lookahead leak"
    assert not any("ancient post" in t for t in titles), "outside lookback leak"


def test_alpha158_factors_produce_all_keys_with_enough_history():
    """compute_factors should populate every named factor when given >=60 bars."""
    from trading_agents.factors import compute_factors, FACTOR_NAMES
    from trading_agents.core.types import Quote
    from datetime import timezone

    today = datetime.now(tz=timezone.utc)
    quotes = []
    # 80 ascending-but-noisy bars
    for i in range(80):
        c = 100.0 + i * 0.3 + (i % 3) * 0.5
        quotes.append(Quote(
            ticker="X",
            asof=today - timedelta(days=80 - i),
            open=c - 0.2, high=c + 0.5, low=c - 0.5, close=c,
            volume=1_000_000 + (i % 5) * 50_000,
        ))
    f = compute_factors(quotes)
    for name in FACTOR_NAMES:
        assert name in f, f"missing factor {name}"
    # ROC_5 should be positive given monotonically rising prices
    assert f["ROC_5"] > 0, "expected positive 5-day ROC on rising series"
    # MA_DIFF: SMA20 above SMA60 in a rising market => positive
    assert f["MA_DIFF"] > 0


def test_share_endpoint_round_trip(monkeypatch):
    """Share a finished job, then read it back unauth'd at /v1/decisions/share/{id}."""
    import sys, os
    sys.path.insert(0, ".")
    monkeypatch.setenv("TA_MODE", "mock")
    monkeypatch.setenv("TA_REQUIRE_INVITE", "false")
    from fastapi.testclient import TestClient
    from api.main import app, _jobs

    c = TestClient(app)
    # Seed a fake completed job
    _jobs["test-share-1"] = {
        "user": "anonymous",
        "status": "done",
        "result": {"ticker": "AAPL", "decision": {"side": "BUY", "target_weight": 0.05}},
        "mode": "mock",
    }
    # Share it (auth as anonymous since require_invite=false)
    r = c.post("/v1/decisions/job/test-share-1/share")
    assert r.status_code == 200
    sid = r.json()["share_id"]
    assert len(sid) == 12

    # Read it back without auth
    r2 = c.get(f"/v1/decisions/share/{sid}")
    assert r2.status_code == 200
    payload = r2.json()
    assert payload["share_id"] == sid
    assert payload["result"]["ticker"] == "AAPL"

    # Unknown share id => 404
    r3 = c.get("/v1/decisions/share/doesnotexist")
    assert r3.status_code == 404


def test_share_endpoint_rejects_unfinished_job(monkeypatch):
    """A job that hasn't completed (status != 'done') must NOT be shareable."""
    import sys
    sys.path.insert(0, ".")
    monkeypatch.setenv("TA_MODE", "mock")
    monkeypatch.setenv("TA_REQUIRE_INVITE", "false")
    from fastapi.testclient import TestClient
    from api.main import app, _jobs

    c = TestClient(app)
    _jobs["test-share-pending"] = {"user": "anonymous", "status": "queued", "result": None}
    r = c.post("/v1/decisions/job/test-share-pending/share")
    assert r.status_code == 400


def test_alpha158_factors_short_history_no_crash():
    """With only 5 bars, compute_factors should not crash; missing factors
    default to 0.0 so analyst prompt's structured input has no holes."""
    from trading_agents.factors import compute_factors
    from trading_agents.core.types import Quote
    from datetime import timezone

    today = datetime.now(tz=timezone.utc)
    quotes = [
        Quote(ticker="X", asof=today - timedelta(days=4-i),
              open=100.0+i, high=101.0+i, low=99.0+i, close=100.5+i, volume=1e6)
        for i in range(5)
    ]
    f = compute_factors(quotes)
    # All names present, even if zero
    assert f["ROC_60"] == 0.0  # not enough history
    assert f["KMID"] != 0.0   # only needs the latest bar


def test_backtrader_runner_returns_none_when_unavailable():
    """If `backtrader` isn't installed, cross_validate must return None
    instead of crashing — the caller treats this as 'skip CV silently'."""
    from trading_agents.backtest.backtrader_runner import cross_validate
    from trading_agents.backtest.engine import BacktestResult
    from trading_agents.backtest.metrics import Metrics
    from trading_agents.core.types import Quote
    from datetime import datetime, timezone, timedelta

    # Synthesize a tiny BacktestResult + matching quotes/weights
    today = datetime.now(tz=timezone.utc)
    quotes = [
        Quote(ticker="X", asof=today - timedelta(days=2), open=100, high=102, low=99,  close=101, volume=1e6),
        Quote(ticker="X", asof=today - timedelta(days=1), open=101, high=103, low=100, close=102, volume=1e6),
        Quote(ticker="X", asof=today,                    open=102, high=104, low=101, close=103, volume=1e6),
    ]
    weights = [0.0, 1.0, 1.0]
    fake_ours = BacktestResult(
        name="X", ticker="X",
        start=quotes[0].asof.date(), end=quotes[-1].asof.date(),
        equity_curve=[100_000, 101_000, 102_000],
        weights=weights, trade_log=[],
        metrics=Metrics(0.02, 1.0, 0.1, 1.0, 1.5, -0.01, 1.0, 1, 1.0),
    )
    out = cross_validate(ours=fake_ours, quotes=quotes, weights=weights)
    # When backtrader isn't installed in the test sandbox, function returns None.
    # When it IS installed (CI image), function returns a proper CrossValidationResult.
    # Either is acceptable here — we just must not raise.
    assert out is None or out.ticker == "X"


def test_reddit_sentiment_returns_none_when_no_posts(monkeypatch):
    """When Reddit search yields zero posts in the window, fetch_sentiment
    must return None so caller can fall back rather than emit a fake 50/50."""
    from trading_agents.adapters import social_reddit
    monkeypatch.setattr(social_reddit, "_search_subreddit", lambda *a, **k: [])
    s = social_reddit.fetch_sentiment("AAPL", date(2024, 6, 1))
    assert s is None


def test_router_provider_routing_for_chinese_llms(monkeypatch):
    """Each prefix routes to its dedicated provider when the key is set."""
    monkeypatch.setenv("DEEPSEEK_API_KEY", "fake")
    monkeypatch.setenv("DASHSCOPE_API_KEY", "fake")
    monkeypatch.setenv("ZHIPU_API_KEY", "fake")
    # Don't force mock here so we exercise the real-provider routing path
    monkeypatch.setenv("TA_MODE", "live")

    import importlib
    import trading_agents.llm.router as rt
    importlib.reload(rt)
    r = rt.LLMRouter()

    from trading_agents.llm.router import OpenAICompatProvider
    assert isinstance(r._provider_for("deepseek-chat"), OpenAICompatProvider)
    assert isinstance(r._provider_for("qwen-max"), OpenAICompatProvider)
    assert isinstance(r._provider_for("glm-4"), OpenAICompatProvider)
    assert r._provider_for("deepseek-chat").name == "deepseek"
    assert r._provider_for("qwen-max").name == "qwen"
    assert r._provider_for("glm-4").name == "glm"


def test_yahoo_adapter_uses_edgar_for_historical_asof(monkeypatch):
    """When asof > 7 days old, Yahoo adapter should call SEC EDGAR before
    falling back to an empty stub."""
    from trading_agents.adapters.yahoo_us_equity import YahooUSEquityAdapter
    from trading_agents.adapters import yahoo_us_equity as yus

    sentinel = pytest.importorskip("trading_agents.core.types").Fundamentals(
        ticker="AAPL",
        asof=date(2024, 6, 1),
        revenue_ttm=999_999_999_999.0,
        notes="from EDGAR (test)",
    )

    def fake_pit(ticker: str, asof: date):
        return sentinel

    monkeypatch.setattr(yus, "get_pit_fundamentals", fake_pit)
    a = YahooUSEquityAdapter()
    out = a.get_fundamentals("AAPL", date(2024, 6, 1))
    assert out.revenue_ttm == 999_999_999_999.0
    assert "EDGAR" in (out.notes or "")


def test_regime_unknown_raises():
    with pytest.raises(KeyError):
        get_regime("forex_3am_japan")


def test_decision_serializes_round_trip():
    trace = run_decision(ticker="MSFT", asof=date.today(), debate_rounds=1)
    blob = trace.model_dump_json()
    assert "MSFT" in blob
    assert "decision" in blob
