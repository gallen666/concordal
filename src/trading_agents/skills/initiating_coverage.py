"""initiating-coverage — institutional-grade initiation report.

Ported from anthropics/financial-services-plugins/equity-research/skills/
initiating-coverage. The most comprehensive single skill: full thesis +
valuation + risk + price target + rating.

Output schema:
  {
    ticker, sector, market_cap_usd_b,
    rating: "Overweight" | "Neutral" | "Underweight",
    target_price, target_price_horizon_months, upside_pct,
    investment_thesis: {
        summary,                  // 3-5 sentence elevator pitch
        long_term_drivers: [...], // 3-5 items
        moat,
        management_quality
    },
    valuation: {
        method,           // "DCF" | "comps" | "sum-of-parts"
        wacc,
        terminal_growth,
        target_multiple,
        bull_case_target,
        bear_case_target
    },
    key_risks: [{risk, severity_pct, mitigation}, ...],  // 5 items
    competitive_landscape: { peers: [...], moat_score_0_to_10 },
    next_catalysts: [str, ...]   // 3-5 items
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
You are an institutional sell-side analyst writing an INITIATION
report — the report a desk publishes the first time it covers a name.
Format follows Morgan Stanley / Goldman Sachs initiation standards.
Audience: institutional PMs deciding whether to enter the name at all.

NON-NEGOTIABLE RULES:
1. Every number in valuation, target_price, financial metrics must
   either come from the structured facts or be derived with an
   explicit formula. If unfetchable, mark [N/A].
2. target_price must be within ±50% of ground-truth close. Larger
   ranges require bull_case_target / bear_case_target to bracket it.
3. rating is Overweight/Neutral/Underweight only — no 'Buy', no
   'Strong Sell', no in-between.
4. Risk severity_pct is the estimated drawdown if the risk fires
   (0..1). 5 risks minimum.
5. JSON output only.
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
    from ._validator import validate_initiating_coverage, integrity_envelope
    parsed = _extract_json(resp.text)
    gt_close = (facts.get("quote") or {}).get("close") if isinstance(facts.get("quote"), dict) else None
    is_valid, errors = validate_initiating_coverage(parsed, gt_close)
    return integrity_envelope({
        "skill": "initiating-coverage", "ticker": ticker, "asof": str(asof),
        "raw_body": resp.text, "parsed": parsed, "ground_truth_close": gt_close,
        "usage": [resp.usage.model_dump()] if hasattr(resp.usage, "model_dump") else [resp.usage.__dict__],
        "model": resp.usage.model,
    }, is_valid, errors)
