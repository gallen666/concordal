"""earnings-analysis — POST-earnings quarterly update.

Ported from anthropics/financial-services-plugins/equity-research/skills/
earnings-analysis. Companion to earnings_preview but runs AFTER results
print. Output is a structured beat/miss decomposition + revised
estimates + thesis update.

Output schema (JSON only):
  {
    ticker, quarter (e.g. "Q3 FY26"), report_date,
    headline: { eps_actual, eps_consensus, beat_pct, rev_actual, rev_consensus },
    segments: [{name, growth_pct, vs_consensus_pct, commentary}],
    guidance_update: { next_q, full_year },
    thesis_impact: "strengthened" | "neutral" | "weakened",
    revised_estimates: { next_q_eps, next_q_rev, fy_eps, fy_rev },
    rating_change: "upgrade" | "maintain" | "downgrade" | null,
    target_price_new: float | null,
    target_price_change_pct: float | null,
    key_takeaways: [str, ...],   // 5-8 bullets
    next_catalysts: [str, ...]   // 3 items
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
You are an institutional sell-side analyst writing a POST-EARNINGS
UPDATE NOTE in JPMorgan/Goldman Sachs format. Audience: PMs deciding
whether to add, trim, or exit a position within the trading day after
earnings.

NON-NEGOTIABLE RULES:
1. Every number must come from the structured facts. If not in the
   dataset, mark as [N/A — not in dataset]. Do NOT infer figures
   from memory.
2. beat_pct = (actual − consensus) / consensus. Compute it; don't
   round to wishful direction.
3. thesis_impact must be one of strengthened/neutral/weakened. Be
   honest — a beat on revenue with a guidance cut is rarely
   'strengthened'.
4. target_price_new (if any) must be within ±30% of the ground-truth
   close. Larger moves require explicit justification in
   key_takeaways.
5. Output ONLY the JSON object specified below. No extra prose.
"""

def run(ticker: str, asof: date | None = None, locale: str = "en") -> dict[str, Any]:
    if asof is None:
        asof = date.today()
    market = "a_share" if ticker.isdigit() and len(ticker) == 6 else "us_equity"
    adapter = get_adapter(market)
    facts: dict[str, Any] = {"ticker": ticker, "asof": str(asof), "market": market}
    for key, fn in [
        ("fundamentals", lambda: adapter.get_fundamentals(ticker, asof)),
        ("technical", lambda: adapter.get_technical(ticker, asof)),
    ]:
        try:
            obj = fn()
            facts[key] = obj.model_dump(mode="json") if obj else None
        except Exception as e:
            facts[f"{key}_error"] = str(e)
    try:
        from datetime import datetime, timezone
        ts = datetime.combine(asof, datetime.min.time(), tzinfo=timezone.utc)
        q = adapter.get_quote(ticker, ts)
        facts["quote"] = q.model_dump(mode="json") if q else None
    except Exception as e:
        facts["quote_error"] = str(e)

    gt = ground_truth_quote_block({"ticker": ticker, "market": market, "quote": facts.get("quote")})
    user = gt + "STRUCTURED FACTS:\n" + _json.dumps(facts, indent=2, default=str) + "\n\nReturn ONLY the JSON per schema."
    router = LLMRouter(locale=locale)
    resp = router.complete(tier=Tier.DEEP, system=SYSTEM_PROMPT, user=user)
    from .earnings_preview import _extract_json
    from ._validator import validate_earnings_analysis, integrity_envelope
    parsed = _extract_json(resp.text)
    gt_close = (facts.get("quote") or {}).get("close") if isinstance(facts.get("quote"), dict) else None
    is_valid, errors = validate_earnings_analysis(parsed, gt_close)
    return integrity_envelope({
        "skill": "earnings-analysis", "ticker": ticker, "asof": str(asof),
        "raw_body": resp.text, "parsed": parsed, "ground_truth_close": gt_close,
        "usage": [resp.usage.model_dump()] if hasattr(resp.usage, "model_dump") else [resp.usage.__dict__],
        "model": resp.usage.model,
    }, is_valid, errors)
