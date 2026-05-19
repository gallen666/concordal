"""catalyst-calendar — upcoming catalysts across a watchlist.

Ported from anthropics/financial-services-plugins/equity-research/skills/
catalyst-calendar.

Output schema:
  {
    horizon_days,
    catalysts: [
      {
        ticker, event, date_estimate,
        days_to_event, type: "earnings"|"FDA"|"macro"|"product"|"regulatory"|"other",
        expected_reaction_pct_range: [low, high],
        skew: "positive" | "neutral" | "negative",
        prep_actions: [str, ...]   // 2-3 monitoring steps
      }, ...
    ],
    weekly_breakdown: { "week_of_2026-MM-DD": [ticker, ...], ... }
  }
"""
from __future__ import annotations
import json as _json
from datetime import date, timedelta
from typing import Any
from ..agents._quote_block import ground_truth_quote_block
from ..llm.router import LLMRouter, Tier

SYSTEM_PROMPT = """\
You are an institutional calendar maintainer. Audience: the buy-side
PM who needs to know what's coming this week / month for each name
in their book.

NON-NEGOTIABLE RULES:
1. Every ticker in catalysts MUST be from the input watchlist. No
   inventing names.
2. date_estimate must be a specific date or quarter (e.g. '2026-09-12'
   or 'Q3 FY26'). 'soon' is forbidden.
3. days_to_event is an integer ≥ 0. Compute it from the asof date.
4. expected_reaction_pct_range — both values in [-0.5, 0.5]. Larger
   ranges require explicit prep_actions naming the structural risk.
5. JSON only.
"""

def run(watchlist: list[str], horizon_days: int = 90, locale: str = "en") -> dict[str, Any]:
    facts: dict[str, Any] = {
        "watchlist": [{"ticker": t.upper()} for t in watchlist],
        "horizon_days": int(horizon_days),
        "asof": str(date.today()),
        "asof_end": str(date.today() + timedelta(days=int(horizon_days))),
    }
    gt = ground_truth_quote_block({"ticker": "(calendar multi-name)", "market": "watchlist", "quote": None})
    user = gt + "FACTS:\n" + _json.dumps(facts, indent=2, default=str) + "\n\nReturn ONLY JSON."
    router = LLMRouter(locale=locale)
    resp = router.complete(tier=Tier.DEEP, system=SYSTEM_PROMPT, user=user)
    from .earnings_preview import _extract_json
    from ._validator import validate_catalyst_calendar, integrity_envelope
    parsed = _extract_json(resp.text)
    watchlist_set = {t.upper() for t in watchlist}
    is_valid, errors = validate_catalyst_calendar(parsed, watchlist_set)
    return integrity_envelope({
        "skill": "catalyst-calendar", "watchlist": watchlist, "horizon_days": int(horizon_days),
        "raw_body": resp.text, "parsed": parsed,
        "usage": [resp.usage.model_dump()] if hasattr(resp.usage, "model_dump") else [resp.usage.__dict__],
        "model": resp.usage.model,
    }, is_valid, errors)
