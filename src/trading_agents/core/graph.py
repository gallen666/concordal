"""Wire all seven roles into a single decision pipeline.

Tries to use LangGraph if installed (matches the official paper's reference
implementation). If LangGraph isn't available, falls back to a hand-rolled
sequential runner with the same I/O contract - which keeps the demo runnable
on minimal installs.
"""

from __future__ import annotations

import logging
from datetime import date
from functools import partial
from typing import Any

from ..adapters.base import MarketAdapter
from ..agents.analysts import (
    fundamentals_node,
    news_node,
    quote_node,
    sentiment_node,
    technical_node,
)
from ..agents.manager import manager_node
from ..agents.researchers import researcher_debate_node
from ..agents.risk import risk_debate_node
from ..agents.trader import trader_node
from ..llm.router import LLMRouter
from ..prompts.base import PromptPack
from .state import DecisionState
from .types import DecisionTrace

log = logging.getLogger(__name__)


def _try_langgraph(adapter, pack, llm, debate_rounds):
    """Build a LangGraph StateGraph if the package is installed."""
    try:
        from langgraph.graph import StateGraph, END
    except ImportError:
        return None

    g = StateGraph(DecisionState)

    def wrap(fn, **deps):
        def inner(state):
            return fn(state, **deps)
        return inner

    deps = dict(adapter=adapter, pack=pack, llm=llm)
    g.add_node("quote", wrap(quote_node, **deps))
    g.add_node("fundamentals", wrap(fundamentals_node, **deps))
    g.add_node("sentiment", wrap(sentiment_node, **deps))
    g.add_node("news", wrap(news_node, **deps))
    g.add_node("technical", wrap(technical_node, **deps))
    g.add_node(
        "researcher_debate",
        wrap(researcher_debate_node, rounds=debate_rounds, **deps),
    )
    g.add_node("trader", wrap(trader_node, **deps))
    g.add_node("risk_debate", wrap(risk_debate_node, **deps))
    g.add_node("manager", wrap(manager_node, **deps))

    g.set_entry_point("quote")
    g.add_edge("quote", "fundamentals")
    g.add_edge("fundamentals", "sentiment")
    g.add_edge("sentiment", "news")
    g.add_edge("news", "technical")
    g.add_edge("technical", "researcher_debate")
    g.add_edge("researcher_debate", "trader")
    g.add_edge("trader", "risk_debate")
    g.add_edge("risk_debate", "manager")
    g.add_edge("manager", END)
    return g.compile()


def _fallback_runner(
    state: DecisionState,
    *,
    adapter: MarketAdapter,
    pack: PromptPack,
    llm: LLMRouter,
    debate_rounds: int,
) -> DecisionState:
    deps = dict(adapter=adapter, pack=pack, llm=llm)
    state = quote_node(state, **deps)
    state = fundamentals_node(state, **deps)
    state = sentiment_node(state, **deps)
    state = news_node(state, **deps)
    state = technical_node(state, **deps)
    state = researcher_debate_node(state, rounds=debate_rounds, **deps)
    state = trader_node(state, **deps)
    state = risk_debate_node(state, **deps)
    state = manager_node(state, **deps)
    return state


def run_decision(
    *,
    ticker: str,
    asof: date,
    market: str = "us_equity",
    adapter: MarketAdapter | None = None,
    pack: PromptPack | None = None,
    llm: LLMRouter | None = None,
    debate_rounds: int = 2,
    user_risk_profile: str = "balanced",
) -> DecisionTrace:
    """Run the full 7-agent pipeline for one (ticker, asof) and return a
    DecisionTrace suitable for storage / UI rendering."""
    from ..adapters import get_adapter
    from ..prompts import get_pack

    adapter = adapter or get_adapter(market)
    pack = pack or get_pack(market)
    llm = llm or LLMRouter()

    state: DecisionState = {
        "ticker": ticker,
        "asof": asof,
        "market": market,
        "user_risk_profile": user_risk_profile,
        "usage": [],
        "flags": [],
    }

    compiled = _try_langgraph(adapter, pack, llm, debate_rounds)
    if compiled is not None:
        log.info("Running via LangGraph")
        result: dict[str, Any] = compiled.invoke(state)
    else:
        log.info("Running via fallback sequential runner")
        result = _fallback_runner(
            state, adapter=adapter, pack=pack, llm=llm, debate_rounds=debate_rounds,
        )

    return DecisionTrace(
        ticker=ticker,
        asof=asof,
        decision=result["decision"],
        analyst_reports=[
            r for r in (
                result.get("fundamentals_report"),
                result.get("sentiment_report"),
                result.get("news_report"),
                result.get("technical_report"),
            ) if r is not None
        ],
        researcher_debate=result.get("researcher_debate"),
        risk_debate=result.get("risk_debate"),
        trader_plan=result.get("trader_plan"),
        manager_review=result.get("manager_review"),
        usage=result.get("usage", []),
    )
