"""idea-generation skill — stock screening with thesis snippets.

Ported from anthropics/financial-services-plugins/equity-research/skills/
idea-generation. Maps to the `/screen` slash command in Anthropic's
Cowork distribution.

OUTPUT FORMAT (per Anthropic spec + Morgan Stanley sector idea note):
  1. SCREEN CRITERIA (echoes the user's criteria back for verification)
  2. CANDIDATE LIST — 10-20 tickers, each with:
      - Sector / market cap
      - Why-it-passes-the-screen (one sentence)
      - Catalyst (next 6 months)
      - Risk (top 1)
      - Score 0-1
  3. TOP 3 RANKED with deeper thesis snippets (2-3 paragraphs each)
  4. WATCHLIST — additional names to monitor but not yet rank

This skill is more search/synthesize than analyze. It reads the
universe (currently: zt-pool, hot rankings, north-flow, manual list)
and applies the user's criteria.
"""

from __future__ import annotations

import json as _json
from datetime import date
from typing import Any

from ..agents._quote_block import ground_truth_quote_block
from ..llm.router import LLMRouter, Tier


SYSTEM_PROMPT = """\
You are an institutional equity-research analyst running an
IDEA-GENERATION SCREEN for a portfolio manager. Your output is a
ranked watchlist of 10-20 candidate tickers with one-sentence
explanations and 3 deep-dive thesis snippets for the top picks.

NON-NEGOTIABLE RULES:

1. The criteria the user passed are sacred. If they ask for 'growth
   semiconductors under 500B market cap', do NOT return AAPL.
2. For every ticker in the candidate list, provide a 'why-passes'
   sentence that explicitly references at least one numeric criterion
   (P/E, growth rate, market cap, momentum, etc.) and cite its source.
3. For the TOP 3, write a 2-3 paragraph snippet that an analyst could
   paste into a morning note. Include: position thesis, catalyst,
   monitoring plan.
4. NEVER fabricate tickers. Use only names provided in the candidate
   universe in `facts`. If the universe is too small to fill 10-20
   slots, return what you have and explicitly note the universe was
   too narrow — DO NOT pad with hallucinated tickers.
5. Output JSON in the exact schema. No extra prose.

OUTPUT SCHEMA:

{
  "criteria_received": dict,            // echo user's criteria
  "universe_size": int,
  "candidates": [
      {
          "ticker": str,
          "sector": str,
          "market_cap_usd_b": float | null,
          "why_passes": str,             // one sentence with numeric anchor
          "next_catalyst": str,
          "top_risk": str,
          "score": float                  // 0..1
      }, ...                              // 10-20 items
  ],
  "top_picks": [
      {
          "ticker": str,
          "thesis": str,                  // 2-3 paragraphs
          "catalyst": str,
          "monitoring": [str, ...]        // 3-5 items
      }, ...                              // top 3
  ],
  "watchlist": [str, ...],              // additional tickers
  "universe_note": str | null           // optional: e.g. 'universe smaller than requested'
}
"""


def run(
    criteria: dict[str, Any],
    universe: list[dict[str, Any]] | None = None,
    locale: str = "en",
) -> dict[str, Any]:
    """Run idea-generation screen.

    criteria: user-provided filter. Free-form dict. Examples:
      {"sector": "semiconductors", "min_market_cap_usd_b": 10,
       "max_market_cap_usd_b": 500, "tilt": "growth"}

    universe: list of candidate dicts with {ticker, sector, market,
      latest_close, change_pct, market_cap_usd_b?, sector?, etc.}.
      The endpoint pulls this from /v1/cn/zt-pool, /v1/hot-rankings,
      and any other source the user wires.
    """
    universe = universe or []

    facts: dict[str, Any] = {
        "criteria": criteria,
        "universe_size": len(universe),
        "universe": universe[:50],  # cap at 50 to keep prompt tractable
        "asof": str(date.today()),
    }

    # No single-ticker quote here — this is a multi-name skill. We
    # still call the quote block helper with an empty quote so the LLM
    # sees the standard preamble pattern and is reminded not to invent
    # prices.
    gt = ground_truth_quote_block({"ticker": "(multi-name screen)", "market": "screen", "quote": None})

    user_prompt = (
        gt
        + "SCREEN INPUTS:\n"
        + _json.dumps(facts, indent=2, default=str)
        + "\n\nReturn ONLY the JSON object per the system prompt."
    )

    router = LLMRouter(locale=locale)
    resp = router.complete(tier=Tier.DEEP, system=SYSTEM_PROMPT, user=user_prompt)

    from .earnings_preview import _extract_json
    from ._validator import validate_idea_generation, integrity_envelope
    parsed = _extract_json(resp.text)

    universe_set = {
        (u.get("ticker") or "").upper().strip()
        for u in universe if isinstance(u, dict) and u.get("ticker")
    }
    is_valid, errors = validate_idea_generation(parsed, universe_set)

    return integrity_envelope({
        "skill": "idea-generation",
        "criteria": criteria,
        "raw_body": resp.text,
        "parsed": parsed,
        "universe_size": len(universe),
        "usage": [resp.usage.model_dump()] if hasattr(resp.usage, "model_dump") else [resp.usage.__dict__],
        "model": resp.usage.model,
    }, is_valid, errors)
