"""Equity-research skills ported from Anthropic's official
`anthropics/financial-services-plugins` repo (4.5k stars, Apache 2.0).

The upstream repo ships SKILL.md / system-prompt assets designed for
Claude Code + Cowork (client-side). Our backend is FastAPI + DeepSeek,
so we re-implement the same methodology as Python modules with system
prompts that follow the same institutional standards (JPMorgan / Goldman
Sachs / Morgan Stanley equity research format).

Three skills are in scope for v56 (per user pick: 'precisely build 3'):

  earnings_preview   — Pre-earnings scenario analysis (4 scenarios with
                       price reaction estimates, key metrics to watch,
                       trade ideas pre/post).
  thesis_tracker     — Maintains and updates the investor thesis for a
                       ticker, surfacing thesis-breakers and catalyst
                       pipeline.
  idea_generation    — Stock screening with thesis snippets per
                       candidate; powers the /screen workflow.

Each module exposes a single `run(...)` callable that:
  1. Pulls structured facts via the shared data adapters
     (cn_equity / yfinance / SEC EDGAR / akshare).
  2. Builds the Anthropic-style system prompt + ground-truth quote
     block (v55).
  3. Calls the DeepSeek LLMRouter at Tier.DEEP.
  4. Returns a structured response (markdown body + parsed signals +
     usage list) the API endpoint can ship to the frontend.

The skill modules are deliberately thin — heavy lifting stays in the
adapters and the LLM. This mirrors Anthropic's pattern: the skill is
the *methodology*, not the *data ETL*.
"""

from . import (
    earnings_preview,
    thesis_tracker,
    idea_generation,
    # v58 — 6 additional skills covering the rest of Anthropic's
    # equity-research vertical.
    earnings_analysis,
    initiating_coverage,
    model_update,
    morning_note,
    sector_overview,
    catalyst_calendar,
)

__all__ = [
    "earnings_preview", "thesis_tracker", "idea_generation",
    "earnings_analysis", "initiating_coverage", "model_update",
    "morning_note", "sector_overview", "catalyst_calendar",
]
