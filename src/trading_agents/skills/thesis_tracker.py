"""thesis-tracker skill — maintains investment thesis for a ticker.

Ported from anthropics/financial-services-plugins/equity-research/skills/
thesis-tracker. Outputs a structured thesis document that the user
revisits over time, with explicit thesis-breakers ('what would change
my mind') and a catalyst pipeline.

OUTPUT FORMAT (per Anthropic spec + Goldman Sachs research format):
  1. CURRENT THESIS (3-5 paragraphs, plain English):
      - Why we own / would own
      - 2-3 key drivers (top of the funnel for ROI)
      - Estimated time horizon
  2. THESIS-BREAKERS — top 5 things that would invalidate the thesis,
     ranked by probability × severity. THIS IS THE MOST IMPORTANT
     SECTION — institutional PMs read this first.
  3. CATALYST PIPELINE — next 3 events (earnings, FDA, guidance update,
     macro), each with: date, expected outcome range, price reaction.
  4. THESIS HEALTH SCORE 0.0-1.0 — algorithmic: how many breakers have
     fired so far, how many catalysts skewed positive vs negative.
  5. NEXT STEPS / monitoring checklist (5 items).

This skill uniquely leverages our SQLite decision history (the same
data feeding /me/history) — the LLM gets the user's prior decisions
on this ticker so the thesis is anchored to their actual investing
narrative, not a generic 'company overview'.
"""

from __future__ import annotations

import json as _json
from datetime import date
from typing import Any

from ..adapters import get_adapter
from ..agents._quote_block import ground_truth_quote_block
from ..llm.router import LLMRouter, Tier


SYSTEM_PROMPT = """\
You are an institutional buy-side research analyst maintaining a long-
running INVESTMENT THESIS document for a single ticker on behalf of a
portfolio manager. The thesis must be defensible in an investment
committee meeting and survive cross-examination from a CIO who knows
the position size.

NON-NEGOTIABLE RULES:

1. The thesis has 5 explicit sections (per the schema). Each section
   is a self-contained paragraph; do not blend them.
2. THESIS-BREAKERS section ranks risks by **probability × severity**,
   not by 'how scared the analyst feels'. Show the multiplication.
3. The HEALTH SCORE is algorithmic. Compute it as:
      health = 0.5 - 0.10*(breakers_fired) + 0.05*(positive_catalysts) - 0.05*(negative_catalysts)
   then clip to [0.05, 0.95]. Document the inputs.
4. Catalyst dates must be specific (Q1 FY26 / Aug 15 2026 / next FOMC).
   Do not write 'soon' or 'eventually'.
5. If user's prior decisions on this ticker exist (provided in facts),
   reference them by side + asof in the thesis — the user wants to see
   their own narrative evolving, not a generic company report.
6. Output JSON in the exact schema. No extra prose.

OUTPUT SCHEMA:

{
  "ticker": str,
  "current_thesis": {
      "summary": str,                  // 2-3 sentence elevator pitch
      "key_drivers": [str, ...],       // 2-3 items
      "time_horizon_months": int
  },
  "thesis_breakers": [
      {
          "trigger": str,                 // concrete observable
          "probability": float,            // 0..1
          "severity_pct_loss": float,      // e.g. 0.25 for -25%
          "risk_score": float,             // probability × severity
          "monitoring": str                // how to know if it's firing
      }, ...                              // 5 items, sorted by risk_score desc
  ],
  "catalyst_pipeline": [
      {
          "event": str,
          "date_estimate": str,
          "expected_outcome": str,
          "price_reaction_range_pct": [low, high],
          "skew": "positive" | "neutral" | "negative"
      }, ...                              // 3 items
  ],
  "thesis_health": {
      "score": float,                   // 0..1
      "breakers_fired": int,
      "positive_catalysts": int,
      "negative_catalysts": int,
      "narrative": str                   // 1-2 sentence read of overall health
  },
  "next_steps": [str, ...]              // 5 monitoring checklist items
}
"""


def run(
    ticker: str,
    prior_decisions: list[dict] | None = None,
    asof: date | None = None,
    locale: str = "en",
) -> dict[str, Any]:
    """Build + dispatch the thesis-tracker skill.

    prior_decisions: optional list of the user's prior decision rows
    on this ticker (subset of fields: asof, side, confidence,
    target_weight, rationale). When provided, the thesis is anchored
    to the user's own narrative.
    """
    if asof is None:
        asof = date.today()

    market = "a_share" if ticker.isdigit() and len(ticker) == 6 else "us_equity"
    adapter = get_adapter(market)

    facts: dict[str, Any] = {
        "ticker": ticker,
        "asof": str(asof),
        "market": market,
        "prior_decisions": prior_decisions or [],
    }

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

    user_prompt = (
        gt
        + "STRUCTURED FACTS:\n"
        + _json.dumps(facts, indent=2, default=str)
        + "\n\nReturn ONLY the JSON object per the system prompt."
    )

    router = LLMRouter(locale=locale)
    resp = router.complete(tier=Tier.DEEP, system=SYSTEM_PROMPT, user=user_prompt)

    from .earnings_preview import _extract_json
    from ._validator import validate_thesis_tracker, integrity_envelope
    parsed = _extract_json(resp.text)
    is_valid, errors = validate_thesis_tracker(parsed)

    return integrity_envelope({
        "skill": "thesis-tracker",
        "ticker": ticker,
        "asof": str(asof),
        "raw_body": resp.text,
        "parsed": parsed,
        "usage": [resp.usage.model_dump()] if hasattr(resp.usage, "model_dump") else [resp.usage.__dict__],
        "model": resp.usage.model,
    }, is_valid, errors)
