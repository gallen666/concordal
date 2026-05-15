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
    # If reflection lessons from prior decisions on this ticker were collected,
    # inject them BEFORE trader/risk so the manager's framing acknowledges
    # institutional memory. Optional — empty string is a no-op.
    lessons = state.get("lessons") or ""
    lessons_block = f"=== LESSONS FROM PRIOR DECISIONS ===\n{lessons}\n\n" if lessons else ""

    user = (
        f"Ticker: {state['ticker']}  Asof: {state['asof']}\n"
        f"Regime: {regime_blob}\n\n"
        f"{lessons_block}"
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
    # Hard cap at 0.90 — 100%-confident equity decisions are a sign of
    # poor calibration, not insight. Even when every analyst agrees,
    # genuine uncertainty about regime / catalysts / execution remains.
    # Floor at 0.10 — anything lower is functionally HOLD and should be
    # set there explicitly.
    confidence = max(0.10, min(0.90, confidence))
    if float(payload.get("confidence", 0.5)) > 0.90:
        state.setdefault("flags", []).append("confidence_capped_at_90pct")

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
