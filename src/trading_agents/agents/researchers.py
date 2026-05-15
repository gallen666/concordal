"""Bull/Bear researcher debate node.

Implements the dialectical analysis stage: N rounds of alternating Bull/Bear
turns, then a facilitator synthesis. Natural-language only here - this is
where the paper says the structured-protocol rule is intentionally relaxed
so deeper reasoning can emerge."""

from __future__ import annotations

from ..core.state import DecisionState
from ..core.types import DebateTranscript, DebateTurn
from ..llm.observability import current_span
from ..llm.router import LLMRouter, Tier
from ..prompts.base import PromptPack


def researcher_debate_node(
    state: DecisionState,
    *,
    pack: PromptPack,
    llm: LLMRouter,
    rounds: int = 2,
    **_,
) -> DecisionState:
    with current_span(
        "researcher.debate",
        ticker=state.get("ticker"),
        asof=str(state.get("asof")),
        rounds=rounds,
    ):
        transcript = DebateTranscript(topic=f"{state['ticker']} on {state['asof']}", rounds=rounds, turns=[])
        state["researcher_debate"] = transcript

        for r in range(1, rounds + 1):
            # Bull
            with current_span(f"researcher.bull.round{r}"):
                user = pack.render_debate_user("bull", r, state)
                resp = llm.complete(tier=Tier.DEEP, system=pack.bullish_researcher_system, user=user)
                transcript.turns.append(DebateTurn(speaker="bull", round=r, content=resp.text))
                state.setdefault("usage", []).append(resp.usage)

            # Bear
            with current_span(f"researcher.bear.round{r}"):
                user = pack.render_debate_user("bear", r, state)
                resp = llm.complete(tier=Tier.DEEP, system=pack.bearish_researcher_system, user=user)
                transcript.turns.append(DebateTurn(speaker="bear", round=r, content=resp.text))
                state.setdefault("usage", []).append(resp.usage)

        # Facilitator synthesis
        with current_span("researcher.facilitator"):
            history = "\n\n".join(
                f"[round {t.round}] {t.speaker.upper()}: {t.content}" for t in transcript.turns
            )
            user = (
                f"Ticker: {state['ticker']}  Asof: {state['asof']}\n\n"
                f"=== FULL DEBATE ===\n{history}\n\n"
                "Now synthesize."
            )
            resp = llm.complete(tier=Tier.MID, system=pack.researcher_facilitator_system, user=user)
            transcript.synthesis = resp.text
            state.setdefault("usage", []).append(resp.usage)
        return state
