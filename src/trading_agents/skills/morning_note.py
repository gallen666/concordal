"""morning-note — pre-market trading desk note across a watchlist.

Ported from anthropics/financial-services-plugins/equity-research/skills/
morning-note. Reads N tickers, produces a single morning note for the
trading desk with the day's top calls.

Output schema:
  {
    date, market_context,
    overnight_movers: [{ticker, direction, pct, why}, ...],
    top_trade_ideas: [
      {ticker, action: "long"|"short"|"trim"|"add", rationale,
       size_pct, target, stop}, ...
    ],   // 3-5 items
    watch_list: [{ticker, reason}, ...],
    macro_callouts: [str, ...]
  }
"""
from __future__ import annotations
import json as _json
from datetime import date
from typing import Any
from ..agents._quote_block import ground_truth_quote_block
from ..llm.router import LLMRouter, Tier

SYSTEM_PROMPT = """\
You are the equity-desk morning-note author. The desk reads this
note before the opening bell to decide what to trade. Target length:
tight — 200-400 words, scannable.

NON-NEGOTIABLE RULES:
1. Every ticker mentioned MUST be in the watchlist provided. No
   inventing names.
2. overnight_movers must have a 'why' field — never 'price moved
   because of momentum'. Concrete reason.
3. top_trade_ideas size_pct ∈ [0.005, 0.05] (50bp - 5% sizes only).
4. JSON only.
"""

def run(watchlist: list[str], locale: str = "en") -> dict[str, Any]:
    facts: dict[str, Any] = {
        "watchlist": [{"ticker": t.upper()} for t in watchlist],
        "date": str(date.today()),
    }
    gt = ground_truth_quote_block({"ticker": "(morning-note multi-name)", "market": "watchlist", "quote": None})
    user = gt + "FACTS:\n" + _json.dumps(facts, indent=2, default=str) + "\n\nReturn ONLY JSON."
    router = LLMRouter(locale=locale)
    resp = router.complete(tier=Tier.DEEP, system=SYSTEM_PROMPT, user=user)
    from .earnings_preview import _extract_json
    from ._validator import validate_morning_note, integrity_envelope
    parsed = _extract_json(resp.text)
    watchlist_set = {t.upper() for t in watchlist}
    is_valid, errors = validate_morning_note(parsed, watchlist_set)
    return integrity_envelope({
        "skill": "morning-note", "watchlist": watchlist,
        "raw_body": resp.text, "parsed": parsed,
        "usage": [resp.usage.model_dump()] if hasattr(resp.usage, "model_dump") else [resp.usage.__dict__],
        "model": resp.usage.model,
    }, is_valid, errors)
