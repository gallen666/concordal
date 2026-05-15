"""Risk team three-way debate (aggressive / neutral / conservative).

Same dialectical pattern as researchers but the topic is *position size*
under the trader's plan. The neutral analyst speaks LAST so it can react
to the two extremes."""

from __future__ import annotations

from ..core.state import DecisionState
from ..core.types import DebateTranscript, DebateTurn
from ..llm.observability import current_span
from ..llm.router import LLMRouter, Tier
from ..prompts.base import PromptPack


def risk_debate_node(state: DecisionState, *, pack: PromptPack, llm: LLMRouter, **_) -> DecisionState:
    with current_span("risk.debate", ticker=state.get("ticker"), asof=str(state.get("asof"))):
        plan = state.get("trader_plan", "")
        base_user = (
            f"Ticker: {state['ticker']}  Asof: {state['asof']}\n"
            f"Trader's plan:\n{plan}\n"
        )
        transcript = DebateTranscript(topic="risk sizing", rounds=1, turns=[])

        with current_span("risk.aggressive"):
            aggr = llm.complete(tier=Tier.MID, system=pack.risk_aggressive_system, user=base_user)
            transcript.turns.append(DebateTurn(speaker="aggressive", round=1, content=aggr.text))
            state.setdefault("usage", []).append(aggr.usage)

        with current_span("risk.conservative"):
            cons = llm.complete(tier=Tier.MID, system=pack.risk_conservative_system, user=base_user)
            transcript.turns.append(DebateTurn(speaker="conservative", round=1, content=cons.text))
            state.setdefault("usage", []).append(cons.usage)

        with current_span("risk.neutral"):
            neu_user = (
                base_user
                + f"\nAggressive view:\n{aggr.text}\n\nConservative view:\n{cons.text}\n\n"
                "Now give your balanced recommendation."
            )
            neu = llm.complete(tier=Tier.MID, system=pack.risk_neutral_system, user=neu_user)
            transcript.turns.append(DebateTurn(speaker="neutral", round=1, content=neu.text))
            state.setdefault("usage", []).append(neu.usage)

        transcript.synthesis = neu.text
        state["risk_debate"] = transcript
        return state
