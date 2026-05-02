"""Trader node - synthesizes analyst reports + researcher debate into a
concrete trading plan that risk and the manager will then audit."""

from __future__ import annotations

from ..core.state import DecisionState
from ..llm.router import LLMRouter, Tier
from ..prompts.base import PromptPack


def trader_node(state: DecisionState, *, pack: PromptPack, llm: LLMRouter, **_) -> DecisionState:
    debate = state.get("researcher_debate")
    syn = (debate.synthesis if debate else "") or ""
    history = (
        "\n\n".join(
            f"[r{t.round}] {t.speaker.upper()}: {t.content}" for t in (debate.turns if debate else [])
        )
        if debate
        else ""
    )
    reports = []
    for k in ("fundamentals_report", "sentiment_report", "news_report", "technical_report"):
        r = state.get(k)
        if r:
            reports.append(f"### {k}\n{r.body}\nSignals: {r.signals}")
    user = (
        f"Ticker: {state['ticker']}  Asof: {state['asof']}\n"
        f"User risk profile: {state.get('user_risk_profile', 'balanced')}\n\n"
        f"=== ANALYST REPORTS ===\n" + "\n\n".join(reports) + "\n\n"
        f"=== RESEARCHER DEBATE SYNTHESIS ===\n{syn}\n\n"
        f"=== FULL DEBATE ===\n{history}\n\n"
        "Produce your trading plan now."
    )
    resp = llm.complete(tier=Tier.MID, system=pack.trader_system, user=user)
    state["trader_plan"] = resp.text
    state.setdefault("usage", []).append(resp.usage)
    return state
