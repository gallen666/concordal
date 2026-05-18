"""Fund Manager node - emits the final Decision JSON, enforcing
regime constraints (e.g. cannot short if regime forbids it)."""

from __future__ import annotations

from ..adapters.base import MarketAdapter
from ..core.state import DecisionState
from ..core.types import Decision, Side
from ..llm.observability import current_span
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

    # v55: GROUND-TRUTH-QUOTE prefix — Manager 终审必须直接对照真实
    # close, 否则前面 7 个 agent 任何一个 hallucinate 价 manager 都不知道.
    from ._quote_block import ground_truth_quote_block
    gt = ground_truth_quote_block(state)
    user = (
        gt
        + f"Ticker: {state['ticker']}  Asof: {state['asof']}\n"
        f"Regime: {regime_blob}\n\n"
        f"{lessons_block}"
        f"=== TRADER PLAN ===\n{plan}\n\n"
        f"=== RISK DEBATE ===\n{risk_blob}\n\n"
        "Emit your final Decision JSON."
    )
    with current_span("manager", ticker=state.get("ticker"), asof=str(state.get("asof"))):
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

    # ---- Consensus check (dual-LLM agreement score) ----------------------
    # Env-gated: only fires when TA_DECISIONS_CONSENSUS_CHECK=true AND a
    # second-family API key is set. Re-runs the manager prompt through a
    # different LLM family (DeepSeek by default) and computes:
    #   agreement_score = 0.6 * side_match + 0.4 * conf_proximity
    # Below 0.5 = clear disagreement → flag for human review.
    import os
    consensus_enabled = os.environ.get("TA_DECISIONS_CONSENSUS_CHECK", "false").lower() == "true"
    if consensus_enabled:
        with current_span("manager.consensus_check"):
            second_model = (
                "deepseek-chat" if os.environ.get("DEEPSEEK_API_KEY")
                else "qwen-plus" if os.environ.get("DASHSCOPE_API_KEY") or os.environ.get("QWEN_API_KEY")
                else "glm-4" if os.environ.get("ZHIPU_API_KEY") or os.environ.get("GLM_API_KEY")
                else None
            )
            if second_model:
                try:
                    resp2 = llm.complete(
                        tier=Tier.DEEP, system=pack.fund_manager_system, user=user,
                        force_model=second_model,
                    )
                    state.setdefault("usage", []).append(resp2.usage)
                    payload2 = extract_json(resp2.text) or {}
                    side2 = _coerce_side(payload2.get("side", "HOLD"))
                    conf2 = float(payload2.get("confidence", 0.5))
                    conf2 = max(0.10, min(0.90, conf2))
                    side_match = 1.0 if side2 == side else 0.0
                    conf_proximity = 1.0 - min(1.0, abs(conf2 - confidence))
                    agreement_score = round(0.6 * side_match + 0.4 * conf_proximity, 2)
                    decision.consensus = {
                        "agreement_score": agreement_score,
                        "primary_model": resp.usage.model,
                        "second_model": resp2.usage.model,
                        "primary_side": side.value,
                        "second_side": side2.value,
                        "primary_confidence": confidence,
                        "second_confidence": conf2,
                    }
                    if agreement_score < 0.5:
                        decision.flags.append("consensus_low_agreement")
                except Exception as e:
                    decision.consensus = {"error": f"second-model call failed: {e}"}

    state["decision"] = decision
    state["manager_review"] = resp.text
    return state
