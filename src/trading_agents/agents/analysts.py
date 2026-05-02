"""The four analyst agents (data gathering stage).

Each runs the relevant adapter call, hands the structured fact object to the
LLM with the role-specific prompt, and emits an `AnalystReport` whose `body`
is free-form natural language but whose `signals` is a strict JSON dict for
downstream consumption.
"""

from __future__ import annotations

from datetime import datetime, timezone

from ..adapters.base import MarketAdapter
from ..core.state import DecisionState
from ..core.types import AnalystReport
from ..llm.router import LLMRouter, Tier, extract_json
from ..prompts.base import PromptPack


def _make_analyst(
    role: str,
    system_attr: str,
    fetch: callable,
    state_key: str,
    state_report_key: str,
    tier: Tier = Tier.MID,
):
    def run(state: DecisionState, *, adapter: MarketAdapter, pack: PromptPack, llm: LLMRouter) -> DecisionState:
        if state_key not in state:
            state[state_key] = fetch(adapter, state)  # type: ignore[index]
        rendered = pack.render_analyst_user(role, state)
        resp = llm.complete(
            tier=tier,
            system=getattr(pack, system_attr),
            user=rendered,
        )
        signals = extract_json(resp.text) or {}
        state[state_report_key] = AnalystReport(  # type: ignore[index]
            analyst=role,
            ticker=state["ticker"],
            asof=state["asof"],
            body=resp.text,
            signals=signals,
        )
        state.setdefault("usage", []).append(resp.usage)  # type: ignore[index]
        return state

    return run


# ---- per-analyst fetchers ----------------------------------------------------


def _fetch_fundamentals(a: MarketAdapter, s: DecisionState):
    return a.get_fundamentals(s["ticker"], s["asof"])


def _fetch_sentiment(a: MarketAdapter, s: DecisionState):
    return a.get_sentiment(s["ticker"], s["asof"])


def _fetch_news(a: MarketAdapter, s: DecisionState):
    return a.get_news(s["ticker"], s["asof"])


def _fetch_technical(a: MarketAdapter, s: DecisionState):
    return a.get_technical(s["ticker"], s["asof"])


fundamentals_node = _make_analyst(
    "fundamentals", "fundamentals_analyst_system", _fetch_fundamentals,
    "fundamentals", "fundamentals_report",
)
sentiment_node = _make_analyst(
    "sentiment", "sentiment_analyst_system", _fetch_sentiment,
    "sentiment", "sentiment_report",
)
news_node = _make_analyst(
    "news", "news_analyst_system", _fetch_news,
    "news", "news_report",
)
technical_node = _make_analyst(
    "technical", "technical_analyst_system", _fetch_technical,
    "technical", "technical_report",
)


def quote_node(state: DecisionState, *, adapter: MarketAdapter, **_) -> DecisionState:
    """Cheap leaf node: fetch latest quote so backtester / UI can use it."""
    asof = state["asof"]
    ts = datetime.combine(asof, datetime.min.time(), tzinfo=timezone.utc)
    state["quote"] = adapter.get_quote(state["ticker"], ts)
    return state
