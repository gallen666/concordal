"""sector-overview — industry landscape + thematic report.

Ported from anthropics/financial-services-plugins/equity-research/skills/
sector-overview.

Output schema:
  {
    sector,
    market_size_usd_b, market_growth_pct_5yr,
    key_themes: [str, ...],          // 3-5 secular themes
    competitive_dynamics: {leaders: [...], challengers: [...], market_share_concentration: float},
    near_term_catalysts: [str, ...],
    long_term_drivers: [str, ...],
    headwinds: [str, ...],
    portfolio_recommendations: {overweight: [...], neutral: [...], underweight: [...]}
  }
"""
from __future__ import annotations
import json as _json
from datetime import date
from typing import Any
from ..agents._quote_block import ground_truth_quote_block
from ..llm.router import LLMRouter, Tier

SYSTEM_PROMPT = """\
You are an institutional sector strategist writing a 20-page sector
overview. Output is a structured JSON the desk uses for portfolio
allocation across names within the sector.

OUTPUT MUST USE EXACTLY THESE TOP-LEVEL KEYS (do NOT rename):
  sector                  : echo the input sector name (string)
  asof                    : ISO date (string)
  market_size             : {value, source}
  growth_rate             : {value, source}
  key_themes              : [str, ...]   // 3-5 secular themes — REQUIRED non-empty
  near_term_catalysts     : [str, ...]
  long_term_drivers       : [str, ...]   // REQUIRED non-empty
  headwinds               : [str, ...]   // REQUIRED non-empty
  competitive_dynamics    : {leaders: [...], challengers: [...], market_share_concentration: float}
  portfolio_recommendations: {overweight: [...], neutral: [...], underweight: [...]}

DO NOT emit `key_trends`, `tailwinds`, or `competitive_landscape` — those
were keys from a previous schema and our validator will reject them.

NON-NEGOTIABLE RULES:
1. All numeric estimates (market size, growth) must be flagged with
   source if from the dataset, or [N/A — estimate not in dataset].
2. portfolio_recommendations tickers must be plausible public
   companies in the sector. The desk will sanity-check, so don't list
   obscure unverifiable names without explicit indication.
3. key_themes / long_term_drivers / headwinds must be specific
   (e.g. 'CHIPS Act funding slowdown post-2026'), not vague ('macro').
   Each list MUST have at least 3 items.
4. JSON only.
"""

def run(sector: str, locale: str = "en") -> dict[str, Any]:
    facts: dict[str, Any] = {"sector": sector, "asof": str(date.today())}
    gt = ground_truth_quote_block({"ticker": f"(sector: {sector})", "market": "sector", "quote": None})
    user = gt + "FACTS:\n" + _json.dumps(facts, indent=2, default=str) + "\n\nReturn ONLY JSON."
    router = LLMRouter(locale=locale)
    resp = router.complete(tier=Tier.DEEP, system=SYSTEM_PROMPT, user=user)
    from .earnings_preview import _extract_json
    from ._validator import validate_sector_overview, integrity_envelope
    parsed = _extract_json(resp.text)
    is_valid, errors = validate_sector_overview(parsed)
    return integrity_envelope({
        "skill": "sector-overview", "sector": sector,
        "raw_body": resp.text, "parsed": parsed,
        "usage": [resp.usage.model_dump()] if hasattr(resp.usage, "model_dump") else [resp.usage.__dict__],
        "model": resp.usage.model,
    }, is_valid, errors)
