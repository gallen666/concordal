"""earnings-preview skill — pre-earnings scenario analysis.

Methodology ported from anthropics/financial-services-plugins:
equity-research/skills/earnings-preview/.

OUTPUT FORMAT (per Anthropic spec + JPMorgan/GS earnings preview note):
  1. Header (ticker, sector, upcoming earnings date, consensus EPS / Rev)
  2. 4 SCENARIOS:
      - BEAT_BIG  (+5% beat → +X% stock reaction, target px Y)
      - BEAT_LITE (+1-2% beat → +X%, target px Y)
      - MATCH     (in-line → -X to +X%, ranges)
      - MISS      (-2% miss → -X%, support level Y)
     Each scenario: implied price reaction, target px, probability weight.
  3. KEY METRICS TO WATCH (revenue segments, margins, guidance,
     buyback pace, capex, top-3 incremental drivers).
  4. RISK FLAGS pre-earnings (positioning, options vol, recent insider).
  5. TRADE IDEAS: pre-earnings positioning (long / short / straddle /
     pre-announce hedge) with specific entry/exit + size guidance.

The system prompt below is original wording but follows Anthropic's
institutional-research format requirements: explicit citations, no
fabricated numbers, JPMorgan/GS-style structure.
"""

from __future__ import annotations

import json as _json
from datetime import date
from typing import Any

from ..adapters import get_adapter
from ..agents._quote_block import ground_truth_quote_block
from ..llm.router import LLMRouter, Tier


SYSTEM_PROMPT = """\
You are an institutional sell-side equity research analyst writing a
PRE-EARNINGS PREVIEW note in the format published by JPMorgan, Goldman
Sachs, and Morgan Stanley equity research desks. Your audience is
institutional portfolio managers who will make a position-sizing decision
within minutes of reading.

NON-NEGOTIABLE RULES:

1. NEVER fabricate a number. If consensus, guidance, or a segment
   metric is not in the structured facts below, mark it explicitly
   as `[N/A — not in dataset]`. Do not infer a precise number from
   memory.
2. Every numeric claim that comes from the dataset must reference its
   source (yfinance / SEC EDGAR / akshare / Tencent / Sina) in
   parentheses.
3. The four scenarios MUST each contain: percentage of consensus
   beat/miss, implied 1-day stock reaction range, post-print target
   price, probability weight (subjective, document your reasoning).
4. RISK FLAGS section is where you call out asymmetries, NOT trade
   recommendations — risks are facts, not opinions.
5. Output JSON in the exact schema in the user prompt. No extra prose
   outside the JSON.

OUTPUT SCHEMA (return as JSON object):

{
  "ticker": str,
  "next_earnings_date": str | null,
  "consensus_eps": float | null,
  "consensus_rev_usd": float | null,
  "scenarios": [
    {
      "name": "BEAT_BIG" | "BEAT_LITE" | "MATCH" | "MISS",
      "beat_pct": float,           // e.g. 0.05 for +5% beat
      "reaction_range_pct": [low, high],
      "target_price": float,
      "probability": float         // sums across 4 scenarios should ≈ 1.0
    }, ...
  ],
  "key_metrics_to_watch": [str, ...],  // 5-8 items, bullet-point body
  "risk_flags": [str, ...],             // 3-5 items
  "trade_idea": {
    "structure": "long" | "short" | "straddle" | "pre-announce-hedge",
    "entry": float,
    "exit_target": float,
    "stop_loss": float,
    "size_pct_of_portfolio": float,
    "rationale": str                  // 2-4 sentences
  },
  "data_sources_used": [str, ...]
}
"""


def run(ticker: str, asof: date | None = None, locale: str = "en") -> dict[str, Any]:
    """Build + dispatch the earnings-preview skill.

    Returns: {markdown_body, parsed, usage, model}.

    On any data-fetch failure the skill still runs (LLM gets a
    [N/A — not in dataset] in the relevant slot rather than
    crashing). That's the Anthropic-spec way: never abort the report;
    surface gaps to the reader.
    """
    if asof is None:
        asof = date.today()

    market = "a_share" if ticker.isdigit() and len(ticker) == 6 else "us_equity"
    adapter = get_adapter(market)

    # Pull facts — best effort. Each block wraps its own try/except so
    # that one upstream miss doesn't take down the others.
    facts: dict[str, Any] = {"ticker": ticker, "asof": str(asof), "market": market}

    try:
        f = adapter.get_fundamentals(ticker, asof)
        facts["fundamentals"] = f.model_dump(mode="json") if f else None
    except Exception as e:
        facts["fundamentals_error"] = str(e)

    try:
        t = adapter.get_technical(ticker, asof)
        facts["technical"] = t.model_dump(mode="json") if t else None
    except Exception as e:
        facts["technical_error"] = str(e)

    try:
        from datetime import datetime, timezone
        ts = datetime.combine(asof, datetime.min.time(), tzinfo=timezone.utc)
        q = adapter.get_quote(ticker, ts)
        facts["quote"] = q.model_dump(mode="json") if q else None
    except Exception as e:
        facts["quote_error"] = str(e)

    # Ground-truth quote block (v55 design) — protects against price
    # hallucination across the rest of the analysis.
    gt = ground_truth_quote_block({"ticker": ticker, "market": market, "quote": facts.get("quote")})

    user_prompt = (
        gt
        + "STRUCTURED FACTS (use only these — flag missing fields):\n"
        + _json.dumps(facts, indent=2, default=str)
        + "\n\nReturn ONLY the JSON object specified in the system prompt."
    )

    router = LLMRouter(locale=locale)
    resp = router.complete(tier=Tier.DEEP, system=SYSTEM_PROMPT, user=user_prompt)

    # Try to parse the JSON the LLM produced; failure is non-fatal —
    # we still ship the markdown to the user even if JSON parsing
    # broke (the model might wrap it in code-fence etc.).
    parsed = _extract_json(resp.text)

    # v56 data-integrity gate (user explicitly demanded 数据要正确精准)
    from ._validator import validate_earnings_preview, integrity_envelope
    gt_close = (facts.get("quote") or {}).get("close") if isinstance(facts.get("quote"), dict) else None
    is_valid, errors = validate_earnings_preview(parsed, gt_close)

    return integrity_envelope({
        "skill": "earnings-preview",
        "ticker": ticker,
        "asof": str(asof),
        "raw_body": resp.text,
        "parsed": parsed,
        "ground_truth_close": gt_close,
        "usage": [resp.usage.model_dump()] if hasattr(resp.usage, "model_dump") else [resp.usage.__dict__],
        "model": resp.usage.model,
    }, is_valid, errors)


def _extract_json(text: str) -> dict | None:
    """Forgiving JSON extractor — handles raw JSON, code-fence-wrapped
    JSON, and JSON-with-leading-prose."""
    if not text:
        return None
    # Try direct
    try:
        return _json.loads(text)
    except Exception:
        pass
    # Try code-fence
    import re
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if m:
        try:
            return _json.loads(m.group(1))
        except Exception:
            pass
    # Try first {...} balanced
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            return _json.loads(text[start : end + 1])
        except Exception:
            pass
    return None
