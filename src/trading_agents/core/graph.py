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
from typing import Any, Callable

# Progress callback type: (stage_id, status) where status ∈ {"start","done","error"}
ProgressCallback = Callable[[str, str], None]

# Canonical stage IDs that the frontend renders. Keep in sync with web/.
STAGES = [
    "quote",
    "fundamentals",
    "sentiment",
    "news",
    "technical",
    "macro",
    "researcher_debate",
    "trader",
    "risk_debate",
    "manager",
]

from ..adapters.base import MarketAdapter
from ..agents.analysts import (
    fundamentals_node,
    macro_node,
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
    g.add_node("macro", wrap(macro_node, **deps))
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
    g.add_edge("technical", "macro")
    g.add_edge("macro", "researcher_debate")
    g.add_edge("researcher_debate", "trader")
    g.add_edge("trader", "risk_debate")
    g.add_edge("risk_debate", "manager")
    g.add_edge("manager", END)
    return g.compile()


def _step(
    stage: str,
    fn,
    state: DecisionState,
    *,
    progress_cb: ProgressCallback | None,
    **kwargs,
) -> DecisionState:
    """Run one pipeline stage and report progress before/after.

    Each stage transition is reported to `progress_cb` so the frontend can
    show "正在分析基本面..." rather than a single 90s spinner. Errors are
    reported then re-raised so the api job marker can capture them.
    """
    if progress_cb:
        try:
            progress_cb(stage, "start")
        except Exception:
            pass  # progress callback never breaks the pipeline
    try:
        result = fn(state, **kwargs)
        if progress_cb:
            try:
                progress_cb(stage, "done")
            except Exception:
                pass
        return result
    except Exception:
        if progress_cb:
            try:
                progress_cb(stage, "error")
            except Exception:
                pass
        raise


def _fallback_runner(
    state: DecisionState,
    *,
    adapter: MarketAdapter,
    pack: PromptPack,
    llm: LLMRouter,
    debate_rounds: int,
    progress_cb: ProgressCallback | None = None,
) -> DecisionState:
    deps = dict(adapter=adapter, pack=pack, llm=llm)
    state = _step("quote", quote_node, state, progress_cb=progress_cb, **deps)
    state = _step("fundamentals", fundamentals_node, state, progress_cb=progress_cb, **deps)
    state = _step("sentiment", sentiment_node, state, progress_cb=progress_cb, **deps)
    state = _step("news", news_node, state, progress_cb=progress_cb, **deps)
    state = _step("technical", technical_node, state, progress_cb=progress_cb, **deps)
    state = _step("macro", macro_node, state, progress_cb=progress_cb, **deps)
    state = _step(
        "researcher_debate", researcher_debate_node, state,
        progress_cb=progress_cb, rounds=debate_rounds, **deps,
    )
    state = _step("trader", trader_node, state, progress_cb=progress_cb, **deps)
    state = _step("risk_debate", risk_debate_node, state, progress_cb=progress_cb, **deps)
    state = _step("manager", manager_node, state, progress_cb=progress_cb, **deps)
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
    locale: str = "en",
    lessons: str = "",
    progress_cb: ProgressCallback | None = None,
) -> DecisionTrace:
    """Run the full 7-agent pipeline for one (ticker, asof) and return a
    DecisionTrace suitable for storage / UI rendering.

    `locale="zh"` makes every LLM call return its free-text fields in
    Simplified Chinese (analyst body, debate turns, trader plan, risk
    notes, manager rationale). Numeric signals stay in English keys so
    downstream code parses cleanly.
    """
    from ..adapters import get_adapter
    from ..prompts import get_pack

    adapter = adapter or get_adapter(market)
    pack = pack or get_pack(market)
    llm = llm or LLMRouter(locale=locale)

    state: DecisionState = {
        "ticker": ticker,
        "asof": asof,
        "market": market,
        "user_risk_profile": user_risk_profile,
        "usage": [],
        "flags": [],
        "lessons": lessons,
    }

    # When a progress callback is provided we always use the sequential
    # runner, since wrapping LangGraph nodes for per-stage progress is
    # noticeably more invasive than the value it adds.
    if progress_cb is not None:
        log.info("Running via fallback sequential runner (with progress)")
        result: dict[str, Any] = _fallback_runner(
            state,
            adapter=adapter,
            pack=pack,
            llm=llm,
            debate_rounds=debate_rounds,
            progress_cb=progress_cb,
        )
    else:
        compiled = _try_langgraph(adapter, pack, llm, debate_rounds)
        if compiled is not None:
            log.info("Running via LangGraph")
            result = compiled.invoke(state)
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
                result.get("macro_report"),  # may be missing if adapter has no macro
            ) if r is not None
        ],
        researcher_debate=result.get("researcher_debate"),
        risk_debate=result.get("risk_debate"),
        trader_plan=result.get("trader_plan"),
        manager_review=result.get("manager_review"),
        usage=result.get("usage", []),
    )
