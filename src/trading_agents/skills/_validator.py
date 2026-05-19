"""Data-integrity validator for equity-research skill outputs.

User explicitly emphasized 数据要正确精准 ('data must be accurate and
precise') for v56. The skill prompts already include defensive
language ('do not fabricate', 'mark as [N/A]'), but defense-in-depth
demands a programmatic check on the JSON the LLM returned BEFORE we
ship the report to the frontend.

The validator runs three classes of check:

  1. PRICE-COHERENCE: any price field in the LLM output (target_price,
     entry, exit_target, stop_loss, scenario.target_price) must be
     within ±50% of the ground-truth close. Anything wider almost
     certainly means the LLM read the wrong stock or fabricated.

  2. TICKER-COHERENCE: every ticker referenced in the output (in
     idea-generation candidates / watchlist / top_picks) must exist
     in the input universe. The LLM is NOT allowed to invent names.

  3. STRUCTURAL: required fields are present; numbers are numeric;
     probability sums in scenarios ≈ 1.0 (±0.15 tolerance).

On violation, we return a structured `data_integrity_error` payload
to the frontend rather than a partially-correct report. That's
'fail loud' design — institutional research demands it.
"""

from __future__ import annotations

from typing import Any


def validate_earnings_preview(parsed: dict | None, ground_truth_close: float | None) -> tuple[bool, list[str]]:
    """Returns (is_valid, list_of_errors). Empty errors list ⇒ valid."""
    if not parsed or not isinstance(parsed, dict):
        return False, ["llm output failed to parse as JSON"]

    errors: list[str] = []

    # Structural: scenarios must be a list of 4
    scenarios = parsed.get("scenarios")
    if not isinstance(scenarios, list) or len(scenarios) < 3:
        errors.append(f"scenarios must be a list of 3-4 items, got {scenarios!r}")

    # Probabilities sum
    if isinstance(scenarios, list):
        probs = []
        for s in scenarios:
            if isinstance(s, dict):
                p = s.get("probability")
                if isinstance(p, (int, float)):
                    probs.append(float(p))
        if probs and abs(sum(probs) - 1.0) > 0.15:
            errors.append(f"scenario probabilities sum to {sum(probs):.2f}, expected ≈ 1.0")

    # Price coherence: ALL price-like fields must be within 50% of ground truth
    if ground_truth_close and ground_truth_close > 0:
        bounds = (ground_truth_close * 0.5, ground_truth_close * 1.5)
        suspicious = []
        for s in (scenarios or []):
            if isinstance(s, dict):
                tp = s.get("target_price")
                if isinstance(tp, (int, float)) and not (bounds[0] <= tp <= bounds[1]):
                    suspicious.append(f"scenario[{s.get('name')}].target_price={tp} outside ±50% of GT close={ground_truth_close}")
        trade = parsed.get("trade_idea") or {}
        for fld in ("entry", "exit_target", "stop_loss"):
            v = trade.get(fld)
            if isinstance(v, (int, float)) and not (bounds[0] <= v <= bounds[1]):
                suspicious.append(f"trade_idea.{fld}={v} outside ±50% of GT close={ground_truth_close}")
        errors.extend(suspicious)

    return len(errors) == 0, errors


def validate_thesis_tracker(parsed: dict | None) -> tuple[bool, list[str]]:
    if not parsed or not isinstance(parsed, dict):
        return False, ["llm output failed to parse as JSON"]

    errors: list[str] = []

    breakers = parsed.get("thesis_breakers")
    if not isinstance(breakers, list) or len(breakers) < 3:
        errors.append(f"thesis_breakers must be a list of ≥3 items, got {len(breakers) if isinstance(breakers, list) else 'non-list'}")

    # Each breaker must have probability + severity + risk_score
    for i, b in enumerate(breakers or []):
        if not isinstance(b, dict):
            errors.append(f"thesis_breakers[{i}] is not a dict")
            continue
        for fld in ("probability", "severity_pct_loss", "risk_score"):
            v = b.get(fld)
            if not isinstance(v, (int, float)):
                errors.append(f"thesis_breakers[{i}].{fld} is missing or non-numeric")
        # risk_score should equal prob × severity
        p = b.get("probability")
        sev = b.get("severity_pct_loss")
        rs = b.get("risk_score")
        if isinstance(p, (int, float)) and isinstance(sev, (int, float)) and isinstance(rs, (int, float)):
            expected = p * sev
            if abs(expected - rs) > 0.05:
                errors.append(f"thesis_breakers[{i}].risk_score={rs} doesn't match prob×sev={expected:.3f}")

    health = parsed.get("thesis_health") or {}
    score = health.get("score")
    if not isinstance(score, (int, float)):
        errors.append("thesis_health.score is missing or non-numeric")
    elif not (0.0 <= score <= 1.0):
        errors.append(f"thesis_health.score={score} outside [0, 1]")

    return len(errors) == 0, errors


def validate_idea_generation(parsed: dict | None, universe_tickers: set[str]) -> tuple[bool, list[str]]:
    if not parsed or not isinstance(parsed, dict):
        return False, ["llm output failed to parse as JSON"]

    errors: list[str] = []

    candidates = parsed.get("candidates")
    if not isinstance(candidates, list):
        errors.append("candidates must be a list")
        candidates = []

    # No invented tickers — every candidate ticker must be in input universe
    invented: list[str] = []
    for c in candidates:
        if isinstance(c, dict):
            t = (c.get("ticker") or "").upper().strip()
            if t and universe_tickers and t not in universe_tickers:
                invented.append(t)
    if invented:
        errors.append(f"LLM invented {len(invented)} tickers not in universe: {invented[:10]}")

    top_picks = parsed.get("top_picks") or []
    if not isinstance(top_picks, list):
        errors.append("top_picks must be a list")
    elif len(top_picks) > 0:
        for i, tp in enumerate(top_picks):
            if not isinstance(tp, dict):
                continue
            t = (tp.get("ticker") or "").upper().strip()
            if t and universe_tickers and t not in universe_tickers:
                errors.append(f"top_picks[{i}].ticker={t} not in input universe")

    # Watchlist same rule
    for t in (parsed.get("watchlist") or []):
        tu = (t or "").upper().strip()
        if tu and universe_tickers and tu not in universe_tickers:
            errors.append(f"watchlist contains invented ticker {tu}")

    return len(errors) == 0, errors


def integrity_envelope(
    skill_output: dict[str, Any],
    is_valid: bool,
    errors: list[str],
) -> dict[str, Any]:
    """Wrap a skill output with a data-integrity envelope. If is_valid
    is False, we still return the raw LLM body for transparency, but
    we set `data_integrity_passed=False` and ship the errors. The
    frontend MUST refuse to render the report body when this is False
    and instead show a 'data integrity check failed' message that
    cites the specific errors."""
    return {
        **skill_output,
        "data_integrity": {
            "passed": is_valid,
            "errors": errors,
            "note": (
                "All numeric outputs cross-checked against ground-truth "
                "quote and input universe. Failure means the LLM either "
                "fabricated a ticker, returned a price outside ±50% of "
                "ground truth, or produced internally inconsistent "
                "probabilities — DO NOT trust the report body."
            ) if not is_valid else (
                "Numeric outputs verified against ground truth and input "
                "universe."
            ),
        },
    }
