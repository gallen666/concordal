"""PromptPack: a complete set of prompts for one (market, language) tuple.

Markets have different decision mental models:
- US equity: earnings & guidance driven, dense fundamentals
- A-share: policy & sentiment driven, T+1, daily limit
- Crypto: narrative + on-chain driven, no traditional fundamentals
- Futures: macro & rates driven, contract roll mechanics

You don't translate one pack into another - you write each from scratch with
the right vocabulary and analytical lens. This module just defines the shape.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PromptPack:
    market: str
    language: str  # "en", "zh-CN", "zh-TW"

    fundamentals_analyst_system: str
    sentiment_analyst_system: str
    news_analyst_system: str
    technical_analyst_system: str

    bullish_researcher_system: str
    bearish_researcher_system: str
    researcher_facilitator_system: str

    trader_system: str

    risk_aggressive_system: str
    risk_neutral_system: str
    risk_conservative_system: str

    fund_manager_system: str

    reflection_system: str

    # Per-stage user-message templates - take a state dict and produce a string.
    # Implementations live alongside the system prompts to keep packs cohesive.
    def render_analyst_user(
        self, role: str, state: dict
    ) -> str:  # pragma: no cover - overridden
        raise NotImplementedError

    def render_debate_user(
        self, side: str, round_index: int, state: dict
    ) -> str:  # pragma: no cover
        raise NotImplementedError
