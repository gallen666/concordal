"""model-update — structured financial-model update.

Ported from anthropics/financial-services-plugins/equity-research/skills/
model-update. Emits structured deltas to estimates with explicit
rationale per change.

Output schema:
  {
    ticker, model_version, asof,
    estimate_changes: [
      {metric, period, old_value, new_value, delta_pct, rationale}, ...
    ],
    valuation_impact: { old_target, new_target, delta_pct, methodology_changed: bool },
    confidence: "high" | "medium" | "low",
    monitoring_triggers: [str, ...]
  }
"""
from __future__ import annotations
import json as _json
from datetime import date
from typing import Any
from ..adapters import get_adapter
from ..agents._quote_block import ground_truth_quote_block
from ..llm.router import LLMRouter, Tier

SYSTEM_PROMPT = """\
You are an institutional research associate maintaining a covered name's
financial model. Output a STRUCTURED LIST of changes — each change has
metric, period, old_value, new_value, delta_pct, and a rationale.

OUTPUT MUST USE EXACTLY THESE TOP-LEVEL KEYS (do NOT rename):
  ticker            : echo input
  model_version     : string (e.g. "v2.3")
  asof              : ISO date
  estimate_changes  : [
                        {metric, period, old_value, new_value, delta_pct, rationale},
                        ...
                      ]   // REQUIRED non-empty list
  valuation_impact  : {old_target, new_target, delta_pct, methodology_changed: bool}
  confidence        : one of "high" | "medium" | "low"
  monitoring_triggers: [str, ...]

DO NOT emit a top-level `changes` array — our validator looks for
`estimate_changes` and will reject the output otherwise.

NON-NEGOTIABLE RULES:
1. delta_pct = (new − old) / old. Compute it precisely to 3 decimals.
2. Every change has a rationale tied to a specific input (segment
   growth / margin / capex / repurchase pace / guidance).
3. valuation_impact.new_target within ±50% of ground-truth close.
4. JSON output only.
"""

def run(ticker: str, asof: date | None = None, locale: str = "en") -> dict[str, Any]:
    if asof is None:
        asof = date.today()
    market = "a_share" if ticker.isdigit() and len(ticker) == 6 else "us_equity"
    adapter = get_adapter(market)
    facts: dict[str, Any] = {"ticker": ticker, "asof": str(asof), "market": market}
    try:
        f = adapter.get_fundamentals(ticker, asof)
        facts["fundamentals"] = f.model_dump(mode="json") if f else None
    except Exception as e:
        facts["fundamentals_error"] = str(e)
    try:
        from datetime import datetime, timezone
        ts = datetime.combine(asof, datetime.min.time(), tzinfo=timezone.utc)
        q = adapter.get_quote(ticker, ts)
        facts["quote"] = q.model_dump(mode="json") if q else None
    except Exception as e:
        facts["quote_error"] = str(e)

    gt = ground_truth_quote_block({"ticker": ticker, "market": market, "quote": facts.get("quote")})
    user = gt + "FACTS:\n" + _json.dumps(facts, indent=2, default=str) + "\n\nReturn ONLY the JSON."
    router = LLMRouter(locale=locale)
    resp = router.complete(tier=Tier.DEEP, system=SYSTEM_PROMPT, user=user)
    from .earnings_preview import _extract_json
    from ._validator import validate_model_update, integrity_envelope
    parsed = _extract_json(resp.text)
    gt_close = (facts.get("quote") or {}).get("close") if isinstance(facts.get("quote"), dict) else None
    is_valid, errors = validate_model_update(parsed, gt_close)
    return integrity_envelope({
        "skill": "model-update", "ticker": ticker, "asof": str(asof),
        "raw_body": resp.text, "parsed": parsed, "ground_truth_close": gt_close,
        "usage": [resp.usage.model_dump()] if hasattr(resp.usage, "model_dump") else [resp.usage.__dict__],
        "model": resp.usage.model,
    }, is_valid, errors)
