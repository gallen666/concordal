"""Fund Manager node - emits the final Decision JSON, enforcing
regime constraints (e.g. cannot short if regime forbids it)."""

from __future__ import annotations

from ..adapters.base import MarketAdapter
from ..core.state import DecisionState
from ..core.types import Decision, Side
from ..llm.router import LLMRouter, Tier, extract_json
from ..prompts.base import PromptPack


def _coerce_side(s: str) -> Side:
    s = (s or "").upper().strip()
    try:
        return Side[s]
    except KeyError:
        if s in {"LONG"}:
            return Side.BUY
        if s in {"SHORT"}:
            return Side.SELL
        return Side.HOLD


def manager_node(
    state: DecisionState,
    *,
    pack: PromptPack,
    llm: LLMRouter,
    adapter: MarketAdapter,
    **_,
) -> DecisionState:
    plan = state.get("trader_plan", "")
    rd = state.get("risk_debate")
    risk_blob = ""
    if rd:
        risk_blob = "\n".join(f"{t.speaker.upper()}: {t.content}" for t in rd.turns)
    regime = adapter.regime
    regime_blob = (
        f"market={regime.market} settlement={regime.settlement} "
        f"daily_limit={regime.daily_limit_pct} short_allowed={regime.short_selling_allowed} "
        f"funding_rate_relevant={regime.funding_rate_relevant} benchmark={regime.benchmark_ticker}"
    )
    user = (
        f"Ticker: {state['ticker']}  Asof: {state['asof']}\n"
        f"Regime: {regime_blob}\n\n"
        f"=== TRADER PLAN ===\n{plan}\n\n"
        f"=== RISK DEBATE ===\n{risk_blob}\n\n"
        "Emit your final Decision JSON."
    )
    resp = llm.complete(tier=Tier.DEEP, system=pack.fund_manager_system, user=user)
    state.setdefault("usage", []).append(resp.usage)
    payload = extract_json(resp.text) or {}

    # Build a Decision with safety nets
    side = _coerce_side(payload.get("side", "HOLD"))
    weight = float(payload.get("target_weight", 0.0))
    if not regime.short_selling_allowed and weight < 0:
        weight = 0.0
        side = Side.HOLD if side in (Side.SELL, Side.UNDERWEIGHT) else side
        state.setdefault("flags", []).append("short_blocked_by_regime")
    weight = max(-1.0, min(1.0, weight))
    confidence = float(payload.get("confidence", 0.5))
    confidence = max(0.0, min(1.0, confidence))

    decision = Decision(
        ticker=state["ticker"],
        asof=state["asof"],
        side=side,
        target_weight=weight,
        confidence=confidence,
        rationale=payload.get("rationale", "(no rationale)"),
        risk_notes=payload.get("risk_notes", ""),
        flags=list(payload.get("flags", [])) + list(state.get("flags", [])),
    )
    state["decision"] = decision
    state["manager_review"] = resp.text
    return state
