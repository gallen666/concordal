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
    s = (s or "").upper().strip().replace("-", "_").replace(" ", "_")
    try:
        return Side[s]
    except KeyError:
        # v90: map MS / industry-standard abbreviations to the canonical
        # enum value. "O/W" / "U/W" are common in research notes,
        # "EW" / "OW" / "UW" are common in trader chat, "LONG/SHORT"
        # come from older trader-plan prompts.
        aliases = {
            "OW": Side.OVERWEIGHT, "O_W": Side.OVERWEIGHT, "O": Side.OVERWEIGHT,
            "EW": Side.HOLD, "E_W": Side.HOLD, "E": Side.HOLD,
            "EQUALWEIGHT": Side.HOLD,
            "UW": Side.UNDERWEIGHT, "U_W": Side.UNDERWEIGHT, "U": Side.UNDERWEIGHT,
            "LONG": Side.BUY,
            "SHORT": Side.SELL,
            "NEUTRAL": Side.HOLD,
            "NR": Side.HOLD, "NOT_RATED": Side.HOLD,
        }
        return aliases.get(s, Side.HOLD)


def _infer_default_benchmark(state: DecisionState) -> str:
    """v90: pick a sensible benchmark from the regime profile when the
    LLM doesn't volunteer one. Used in the legally-defensible "X is
    Overweight VS benchmark Y" phrasing.
    """
    try:
        market = (state.get("regime") or {}).get("market") or ""
    except Exception:
        market = ""
    market = market.lower()
    if "us" in market or "nasdaq" in market or "nyse" in market:
        return "S&P 500"
    if "a_share" in market or "cn" in market or "sse" in market or "szse" in market:
        return "CSI 300"
    if "hk" in market or "hong_kong" in market:
        return "Hang Seng Index"
    if "crypto" in market:
        return "BTC"
    return "industry coverage universe"


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
        # v69: json_mode=True ports upstream TradingAgents v0.2.4's
        # structured-output manager — the provider returns guaranteed-valid
        # JSON (DeepSeek/OpenAI response_format, Gemini response_mime_type)
        # instead of free text we hope parses.
        resp = llm.complete(
            tier=Tier.DEEP, system=pack.fund_manager_system, user=user, json_mode=True
        )
    state.setdefault("usage", []).append(resp.usage)
    payload = extract_json(resp.text) or {}

    # v69: never let a parse failure SILENTLY become HOLD/0.5. If the model
    # still didn't return parseable JSON (json_mode unsupported by the
    # fallback model, or a stray wrapper), flag it loudly and retry ONCE with
    # an explicit JSON-only instruction. This makes the failure visible in the
    # decision's flags (and the audit log) — consistent with the v55-v62
    # data-integrity stance: surface problems, don't hide them.
    if not payload:
        state.setdefault("flags", []).append("manager_json_parse_failed")
        strict_user = (
            user
            + "\n\nIMPORTANT: Return ONLY a single valid JSON object for the "
            "Decision — no prose, no explanation, no markdown code fences."
        )
        with current_span("manager.json_retry"):
            resp_retry = llm.complete(
                tier=Tier.DEEP, system=pack.fund_manager_system,
                user=strict_user, json_mode=True,
            )
        state.setdefault("usage", []).append(resp_retry.usage)
        retry_payload = extract_json(resp_retry.text) or {}
        if retry_payload:
            payload = retry_payload
            state["flags"].append("manager_json_recovered_on_retry")
            resp = resp_retry  # so manager_review reflects the parsed response
        else:
            state["flags"].append("manager_json_unrecoverable_held")

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

    # v90: pull the new sell-side research fields out of the payload with
    # sensible fallbacks. Frontend renders the headline + takeaways when
    # present and quietly falls back to rationale prose when they're empty,
    # so older decisions and out-of-format LLM responses still display.
    headline = payload.get("headline")
    if headline is not None:
        headline = str(headline).strip() or None

    takeaways_raw = payload.get("key_takeaways") or []
    if isinstance(takeaways_raw, str):
        takeaways_raw = [takeaways_raw]
    takeaways = [str(t).strip() for t in takeaways_raw if str(t).strip()][:6]

    benchmark = payload.get("benchmark")
    if not benchmark or not str(benchmark).strip():
        benchmark = _infer_default_benchmark(state)
    else:
        benchmark = str(benchmark).strip()

    time_horizon = str(payload.get("time_horizon") or "").strip() or "12-18 months"
    risk_adjusted_raw = payload.get("risk_adjusted")
    risk_adjusted = True if risk_adjusted_raw is None else bool(risk_adjusted_raw)

    decision = Decision(
        ticker=state["ticker"],
        asof=state["asof"],
        side=side,
        target_weight=weight,
        confidence=confidence,
        rationale=payload.get("rationale", "(no rationale)"),
        risk_notes=payload.get("risk_notes", ""),
        flags=list(payload.get("flags", [])) + list(state.get("flags", [])),
        headline=headline,
        key_takeaways=takeaways,
        benchmark=benchmark,
        time_horizon=time_horizon,
        risk_adjusted=risk_adjusted,
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
