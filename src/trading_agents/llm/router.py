"""LLM router with explicit task tiers (FAST / MID / DEEP).

Phase 3 of the roadmap: instead of a single backbone model, every agent
asks for the tier it actually needs. Routing decisions:

  FAST  -> structured extraction, summarization, JSON formatting
  MID   -> analyst report writing, risk debate
  DEEP  -> bull/bear debate, fund manager final decision

If no provider keys are present we fall back to MockProvider, which emits
deterministic plausible responses so the entire graph is runnable offline.
This is critical for tests, demos, and CI.

A `LLMResponse` carries token usage so the DecisionTrace can show per-decision
$ cost.
"""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass
from enum import Enum
from typing import Any

from ..core.types import TokenUsage

log = logging.getLogger(__name__)


class Tier(str, Enum):
    FAST = "fast"
    MID = "mid"
    DEEP = "deep"


# Approximate $/Mtoken (input/output). Override via env if you negotiate rates.
_PRICES: dict[str, tuple[float, float]] = {
    # OpenAI
    "gpt-4o": (2.50, 10.00),
    "gpt-4o-mini": (0.15, 0.60),
    "o1-preview": (15.00, 60.00),
    # Anthropic (illustrative; check your billing)
    "claude-haiku-4-5": (0.80, 4.00),
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-opus-4-6": (15.00, 75.00),
    # Mock
    "mock-fast": (0.0, 0.0),
    "mock-mid": (0.0, 0.0),
    "mock-deep": (0.0, 0.0),
}


@dataclass
class LLMResponse:
    text: str
    usage: TokenUsage


class _ProviderBase:
    name: str

    def complete(self, system: str, user: str, model: str, **kw) -> LLMResponse:
        raise NotImplementedError


class MockProvider(_ProviderBase):
    """Deterministic, schema-aware mock so the graph runs without keys.

    The mock's job is not to be smart - it's to produce structurally-correct
    output that downstream nodes can parse. Real intelligence comes from
    swapping this for OpenAI/Anthropic.
    """

    name = "mock"

    def complete(self, system: str, user: str, model: str, **kw) -> LLMResponse:
        # Heuristic: detect what kind of agent is calling us by sniffing the
        # system prompt, and return a plausible-looking response. Order matters -
        # check the most specific role markers first.
        sys_l = system.lower()
        if "fund manager" in sys_l:
            text = self._manager(user)
        elif "trading desk pm" in sys_l:
            text = self._trader(user)
        elif "aggressive risk" in sys_l:
            text = "Aggressive risk view: signals support sizing up; volatility is digestible. Recommend full target weight."
        elif "neutral risk" in sys_l:
            text = "Neutral risk view: balanced posture - take 70% of trader's target weight pending tighter stop."
        elif "conservative risk" in sys_l:
            text = "Conservative risk view: macro uncertainty + valuation mid-band; cut size to 40-50% of target."
        elif "fundamental analyst" in sys_l:
            text = self._fundamentals(user)
        elif "sentiment analyst" in sys_l:
            text = self._sentiment(user)
        elif "news analyst" in sys_l:
            text = self._news(user)
        elif "technical analyst" in sys_l:
            text = self._technical(user)
        elif "bull researcher" in sys_l:
            text = self._bull(user)
        elif "bear researcher" in sys_l:
            text = self._bear(user)
        elif "facilitator" in sys_l:
            text = self._facilitator(user)
        elif "reflection" in sys_l:
            text = "Reflection: trader's caution helped; bull case overweighted near-term catalyst. Pattern: discount Bull when valuation is in upper third."
        else:
            text = "Mock response for unknown role."

        in_tok = max(1, len(user) // 4)
        out_tok = max(1, len(text) // 4)
        in_p, out_p = _PRICES.get(model, (0.0, 0.0))
        cost = in_tok / 1e6 * in_p + out_tok / 1e6 * out_p
        return LLMResponse(
            text=text,
            usage=TokenUsage(model=model, input_tokens=in_tok, output_tokens=out_tok, usd_cost=round(cost, 6)),
        )

    # --- Mock body generators --------------------------------------------------

    def _fundamentals(self, user: str) -> str:
        return (
            "Business quality looks solid: gross margin in the mid-50s, operating margin "
            "around 25%, FCF positive. Growth is steady mid-teens YoY but decelerating off "
            "tougher comps. Balance sheet is healthy with low leverage. Valuation sits "
            "mid-range vs peers; not cheap, not bubbly.\n\n"
            "Bullish drivers: durable margins, buyback support, segment mix improving.\n"
            "Bearish risks: comps get harder H2, FX headwinds, regulatory overhang.\n\n"
            "```json\n"
            '{"quality":"high","growth":"steady","valuation":"fair",'
            '"balance_sheet":"strong","bull_score":0.62,"bear_score":0.38}\n```'
        )

    def _sentiment(self, user: str) -> str:
        return (
            "Mention volume slightly above 30-day baseline. Skew is modestly bullish "
            "(~58/42). Themes dominated by earnings and AI optionality. Not yet "
            "frenzy territory; no contrarian flag.\n\n"
            "```json\n"
            '{"intensity":"normal","skew":0.16,"contrarian_flag":false}\n```'
        )

    def _news(self, user: str) -> str:
        return (
            "Most market-moving items: (1) raised guidance, (2) buyback announcement, "
            "(3) modest antitrust headline. Net tone is positive, with one negative "
            "tail risk to monitor. No regime-changing item.\n\n"
            "```json\n"
            '{"net_news_sentiment":0.35,"catalyst_present":true,'
            '"major_negative_catalyst":false}\n```'
        )

    def _technical(self, user: str) -> str:
        return (
            "Trend regime: uptrend, price above SMA50 and SMA200. Momentum bullish "
            "without being overbought (RSI mid-60s). MACD positive and rising. Setup "
            "favours long entries on minor pullbacks.\n\n"
            "```json\n"
            '{"trend":"up","momentum":"bullish","setup_quality":"long"}\n```'
        )

    def _bull(self, user: str) -> str:
        return (
            "BULL: Three points to take this long: (1) margins are widening despite mix "
            "headwinds, evidence of pricing power; (2) buyback signals confidence and "
            "shrinks the float into a steady-growth backdrop; (3) technical setup is "
            "constructive without being stretched. The strongest counter is valuation - "
            "but we're at fair value, not premium. Upside ~18-22% over 6-9 months. "
            "Invalidator: gross margin compression next print."
        )

    def _bear(self, user: str) -> str:
        return (
            "BEAR: The Bull leans on margins and buyback. Both are backward-looking. "
            "Forward, comps tighten H2, FX is a 150-200bp drag, and regulatory risk is "
            "non-zero. Sentiment is starting to tilt one-way - that's late-cycle. "
            "Downside ~10-14% on a guidance miss; tail risk worse if antitrust escalates. "
            "Invalidator: another beat-and-raise quarter with no margin slip."
        )

    def _facilitator(self, user: str) -> str:
        return (
            "Real disagreement is about the durability of margins, not the level today. "
            "Bull engaged Bear's strongest objection (regulatory) directly; Bear was "
            "weaker on technicals. The disagreement is about INTERPRETATION of forward "
            "comps, not facts.\n"
            "Recommended posture: OVERWEIGHT (modestly - this is a conviction-2 buy)."
        )

    def _trader(self, user: str) -> str:
        return (
            "Direction: OVERWEIGHT.\n"
            "Target weight: +0.04 of book (4%).\n"
            "Conviction: 0.62.\n"
            "Entry: scale in over 3 sessions; trim if RSI > 75 or MACD turns negative.\n"
            "Exit trigger: gross margin compression next print, OR antitrust escalation.\n"
            "Constraints to risk: T+1 settlement; no overnight gap concern."
        )

    def _manager(self, user: str) -> str:
        return (
            "After reviewing trader plan and risk debate, conservative voice has merit "
            "given valuation. Trim trader's +0.04 to +0.025 and add a disciplined exit.\n\n"
            "```json\n"
            '{"side":"OVERWEIGHT","target_weight":0.025,"confidence":0.55,'
            '"rationale":"Constructive setup but valuation is mid-range and risk has '
            'flagged regulatory tail; size at 60% of trader request to balance asymmetry.",'
            '"risk_notes":"Cut to flat on gross-margin compression or RSI > 75.",'
            '"flags":[]}\n```'
        )


class OpenAIProvider(_ProviderBase):
    name = "openai"

    def __init__(self, api_key: str):
        from openai import OpenAI
        self._client = OpenAI(api_key=api_key)

    def complete(self, system: str, user: str, model: str, **kw) -> LLMResponse:
        resp = self._client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=kw.get("temperature", 0.3),
        )
        text = resp.choices[0].message.content or ""
        in_tok = resp.usage.prompt_tokens if resp.usage else 0
        out_tok = resp.usage.completion_tokens if resp.usage else 0
        in_p, out_p = _PRICES.get(model, (0.0, 0.0))
        cost = in_tok / 1e6 * in_p + out_tok / 1e6 * out_p
        return LLMResponse(
            text=text,
            usage=TokenUsage(model=model, input_tokens=in_tok, output_tokens=out_tok, usd_cost=round(cost, 6)),
        )


class AnthropicProvider(_ProviderBase):
    name = "anthropic"

    def __init__(self, api_key: str):
        import anthropic
        self._client = anthropic.Anthropic(api_key=api_key)

    def complete(self, system: str, user: str, model: str, **kw) -> LLMResponse:
        resp = self._client.messages.create(
            model=model,
            max_tokens=kw.get("max_tokens", 2048),
            system=system,
            messages=[{"role": "user", "content": user}],
            temperature=kw.get("temperature", 0.3),
        )
        text = "".join(getattr(b, "text", "") for b in resp.content)
        in_tok = resp.usage.input_tokens
        out_tok = resp.usage.output_tokens
        in_p, out_p = _PRICES.get(model, (0.0, 0.0))
        cost = in_tok / 1e6 * in_p + out_tok / 1e6 * out_p
        return LLMResponse(
            text=text,
            usage=TokenUsage(model=model, input_tokens=in_tok, output_tokens=out_tok, usd_cost=round(cost, 6)),
        )


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------


class LLMRouter:
    """Routes by tier to (model, provider). Falls back to mock if no key."""

    def __init__(self):
        self._mock = MockProvider()
        self._openai: OpenAIProvider | None = None
        self._anthropic: AnthropicProvider | None = None

        oa = os.getenv("OPENAI_API_KEY")
        if oa:
            try:
                self._openai = OpenAIProvider(oa)
            except Exception as e:
                log.warning("OpenAI init failed: %s", e)

        an = os.getenv("ANTHROPIC_API_KEY")
        if an:
            try:
                self._anthropic = AnthropicProvider(an)
            except Exception as e:
                log.warning("Anthropic init failed: %s", e)

        force_mock = os.getenv("TA_MODE", "mock").lower() == "mock"
        self._force_mock = force_mock

        # Default model strings per tier (override via env)
        self.models: dict[Tier, str] = {
            Tier.FAST: os.getenv("TA_MODEL_FAST", "gpt-4o-mini"),
            Tier.MID: os.getenv("TA_MODEL_MID", "claude-sonnet-4-6"),
            Tier.DEEP: os.getenv("TA_MODEL_DEEP", "claude-opus-4-6"),
        }

    def _provider_for(self, model: str) -> _ProviderBase:
        if self._force_mock:
            return self._mock
        if model.startswith(("gpt-", "o1-")) and self._openai:
            return self._openai
        if model.startswith("claude-") and self._anthropic:
            return self._anthropic
        return self._mock

    def complete(
        self,
        *,
        tier: Tier,
        system: str,
        user: str,
        temperature: float = 0.3,
    ) -> LLMResponse:
        model = self.models[tier]
        provider = self._provider_for(model)
        log.debug("LLM %s -> %s (%s)", tier.value, model, provider.name)
        return provider.complete(system, user, model, temperature=temperature)


# ---------------------------------------------------------------------------
# JSON extraction helpers
# ---------------------------------------------------------------------------

_JSON_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)


def extract_json(text: str) -> dict[str, Any] | None:
    """Pull the last JSON code-fenced block out of an LLM response.

    Falls back to the last balanced {...} substring. Returns None if nothing
    parses, so callers can decide whether to retry or use defaults.
    """
    matches = _JSON_RE.findall(text)
    if matches:
        try:
            return json.loads(matches[-1])
        except Exception:
            pass
    # last balanced object fallback
    depth = 0
    start = -1
    last = None
    for i, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start >= 0:
                last = text[start : i + 1]
    if last:
        try:
            return json.loads(last)
        except Exception:
            return None
    return None
