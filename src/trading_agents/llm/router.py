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
from .observability import current_span

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
    # Google Gemini (USD per 1M tokens, input/output)
    # 3.1 Pro tiered pricing: standard <=200k context, extended >200k.
    # We use the standard tier since our analyst prompts are well under 200k.
    "gemini-3.1-pro-preview": (2.00, 12.00),
    "gemini-3-pro-preview": (2.00, 12.00),  # alias; Google now redirects this to 3.1
    "gemini-2.5-pro": (1.25, 10.00),
    "gemini-2.5-flash": (0.30, 2.50),
    "gemini-2.5-flash-lite": (0.10, 0.40),
    "gemini-2.0-flash": (0.10, 0.40),
    # DeepSeek (USD/Mtoken; check live pricing on api-docs.deepseek.com).
    # V3 chat: cheap; R1 reasoner: 5–10× cheaper than o1 for similar quality.
    "deepseek-chat": (0.27, 1.10),
    "deepseek-reasoner": (0.55, 2.19),
    # Qwen / 通义千问 via DashScope OpenAI-compatible mode.
    # qwen-max ~ Claude Sonnet tier; turbo and flash are cheap workhorses.
    "qwen-max": (1.60, 6.40),
    "qwen-plus": (0.40, 1.20),
    "qwen-turbo": (0.05, 0.20),
    "qwen-flash": (0.05, 0.20),
    # GLM / 智谱 (open.bigmodel.cn). 4-plus ~ GPT-4o mid-tier in CN; flash is free-tier-ish.
    "glm-4-plus": (0.69, 0.69),
    "glm-4": (0.14, 0.14),
    "glm-4-flash": (0.0, 0.0),
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


class OpenAICompatProvider(_ProviderBase):
    """Generic OpenAI-compatible provider — used for DeepSeek, Qwen, GLM.

    All three (DeepSeek api.deepseek.com, Aliyun DashScope OpenAI-compat
    endpoint, 智谱 open.bigmodel.cn /v4) accept OpenAI-shaped chat-completion
    requests, so one class with a configurable base_url + key handles them.

    Why direct httpx instead of `openai.OpenAI(base_url=...)`: avoids
    version-coupling the openai sdk to all three vendors at once. Each
    vendor occasionally breaks compat with the openai sdk's auto-retry
    logic. A thin httpx call is more robust.
    """

    def __init__(self, *, name: str, api_key: str, base_url: str):
        self.name = name
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")

    def complete(self, system: str, user: str, model: str, **kw) -> LLMResponse:
        import httpx

        url = f"{self._base_url}/chat/completions"
        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": kw.get("temperature", 0.3),
            "max_tokens": kw.get("max_tokens", 2048),
        }
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        # Read timeout is 120s — DeepSeek-R1 can take 60s+ for deep reasoning.
        with httpx.Client(timeout=httpx.Timeout(connect=15.0, read=120.0, write=30.0, pool=30.0)) as c:
            resp = c.post(url, json=body, headers=headers)
        if resp.status_code >= 400:
            raise RuntimeError(
                f"{self.name} call failed: HTTP {resp.status_code} {resp.text[:300]}"
            )
        data = resp.json()
        try:
            text = data["choices"][0]["message"]["content"] or ""
        except Exception:
            text = ""
        usage = data.get("usage") or {}
        in_tok = int(usage.get("prompt_tokens") or 0)
        out_tok = int(usage.get("completion_tokens") or 0)
        in_p, out_p = _PRICES.get(model, (0.0, 0.0))
        cost = in_tok / 1e6 * in_p + out_tok / 1e6 * out_p
        return LLMResponse(
            text=text,
            usage=TokenUsage(
                model=model, input_tokens=in_tok, output_tokens=out_tok,
                usd_cost=round(cost, 6),
            ),
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


class GeminiProvider(_ProviderBase):
    """Google Gemini.

    Two transport modes, chosen at __init__:

    * **Direct REST** when `GEMINI_API_BASE` is set — used to route around
      the Singapore IP geo-block on Render free tier by going through a
      tiny Vercel edge proxy. The base URL should point at the proxy root
      that re-emits requests to https://generativelanguage.googleapis.com.

    * **Official google-genai SDK** otherwise, for local dev / non-blocked
      regions.
    """

    name = "gemini"

    def __init__(self, api_key: str, base_url: str | None = None):
        self._api_key = api_key
        self._base_url = (base_url or "").rstrip("/") or None
        self._client = None  # lazy-initialised SDK client
        if self._base_url is None:
            # Only import the SDK if we'll actually use it. This keeps the
            # container tiny in proxy-mode and avoids the SDK's circular
            # import quirk during sandbox tests.
            from google import genai  # noqa: F401  (validated at boot)

    def _sdk_complete(self, system: str, user: str, model: str, **kw) -> LLMResponse:
        from google import genai
        from google.genai import types

        if self._client is None:
            self._client = genai.Client(api_key=self._api_key)

        resp = self._client.models.generate_content(
            model=model,
            config=types.GenerateContentConfig(
                system_instruction=system,
                temperature=kw.get("temperature", 0.3),
                max_output_tokens=kw.get("max_tokens", 4096),
            ),
            contents=user,
        )
        text = resp.text or ""
        meta = getattr(resp, "usage_metadata", None)
        in_tok = getattr(meta, "prompt_token_count", 0) or 0
        out_tok = getattr(meta, "candidates_token_count", 0) or 0
        return self._wrap(text, in_tok, out_tok, model)

    def _rest_complete(self, system: str, user: str, model: str, **kw) -> LLMResponse:
        import httpx

        url = f"{self._base_url}/v1beta/models/{model}:generateContent"
        body = {
            "system_instruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {
                "temperature": kw.get("temperature", 0.3),
                "maxOutputTokens": kw.get("max_tokens", 4096),
            },
        }
        # Pass the key via header — same as the SDK. Some proxies strip
        # query params; header form is safer.
        headers = {
            "x-goog-api-key": self._api_key,
            "content-type": "application/json",
        }
        with httpx.Client(timeout=httpx.Timeout(connect=15.0, read=120.0, write=30.0, pool=30.0)) as client:
            resp = client.post(url, json=body, headers=headers)
        if resp.status_code >= 400:
            raise RuntimeError(
                f"gemini proxy call failed: HTTP {resp.status_code} {resp.text[:400]}"
            )
        data = resp.json()
        # Extract text from candidates[0].content.parts[*].text
        text = ""
        try:
            cand = (data.get("candidates") or [{}])[0]
            parts = (cand.get("content") or {}).get("parts") or []
            text = "".join(p.get("text", "") for p in parts if isinstance(p, dict))
        except Exception:
            text = ""
        usage = data.get("usageMetadata") or {}
        in_tok = int(usage.get("promptTokenCount") or 0)
        out_tok = int(usage.get("candidatesTokenCount") or 0)
        return self._wrap(text, in_tok, out_tok, model)

    def _wrap(self, text: str, in_tok: int, out_tok: int, model: str) -> LLMResponse:
        in_p, out_p = _PRICES.get(model, (0.0, 0.0))
        cost = in_tok / 1e6 * in_p + out_tok / 1e6 * out_p
        return LLMResponse(
            text=text,
            usage=TokenUsage(
                model=model,
                input_tokens=in_tok,
                output_tokens=out_tok,
                usd_cost=round(cost, 6),
            ),
        )

    def complete(self, system: str, user: str, model: str, **kw) -> LLMResponse:
        if self._base_url is not None:
            return self._rest_complete(system, user, model, **kw)
        return self._sdk_complete(system, user, model, **kw)


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------


class LLMRouter:
    """Routes by tier to (model, provider). Falls back to mock if no key.

    The optional `locale` parameter lets the caller force LLM output into
    a specific language. Internally we just prepend a language directive
    to the system prompt for every call — works for any provider (OpenAI,
    Anthropic, Gemini) without provider-specific changes.
    """

    def __init__(self, locale: str = "en"):
        self.locale = locale or "en"
        self._mock = MockProvider()
        self._openai: OpenAIProvider | None = None
        self._anthropic: AnthropicProvider | None = None
        self._gemini: GeminiProvider | None = None
        # OpenAI-compatible 中文 LLMs — cheaper + better Chinese tuning + no
        # Singapore IP blocking. Initialised lazily from their respective
        # env vars below.
        self._deepseek: OpenAICompatProvider | None = None
        self._qwen: OpenAICompatProvider | None = None
        self._glm: OpenAICompatProvider | None = None
        # FinGPT — finance-tuned LLM via OpenAI-compatible HF endpoint.
        # Only initialised when FINGPT_API_KEY + FINGPT_API_BASE are set.
        self._fingpt: OpenAICompatProvider | None = None

        oa = os.getenv("OPENAI_API_KEY")
        if oa:
            try:
                self._openai = OpenAIProvider(oa)
            except Exception as e:
                log.warning("OpenAI init failed: %s", e)

        gm = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if gm:
            try:
                # Optional proxy: route Gemini calls through a Vercel edge
                # function so that backend hosts in Gemini-blocked regions
                # (e.g. Render free-tier Singapore) can still reach the API.
                gm_base = os.getenv("GEMINI_API_BASE") or None
                self._gemini = GeminiProvider(gm, base_url=gm_base)
            except Exception as e:
                log.warning("Gemini init failed: %s", e)

        an = os.getenv("ANTHROPIC_API_KEY")
        if an:
            try:
                self._anthropic = AnthropicProvider(an)
            except Exception as e:
                log.warning("Anthropic init failed: %s", e)

        ds = os.getenv("DEEPSEEK_API_KEY")
        if ds:
            try:
                self._deepseek = OpenAICompatProvider(
                    name="deepseek",
                    api_key=ds,
                    base_url=os.getenv("DEEPSEEK_API_BASE", "https://api.deepseek.com/v1"),
                )
            except Exception as e:
                log.warning("DeepSeek init failed: %s", e)

        qw = os.getenv("DASHSCOPE_API_KEY") or os.getenv("QWEN_API_KEY")
        if qw:
            try:
                self._qwen = OpenAICompatProvider(
                    name="qwen",
                    api_key=qw,
                    # DashScope OpenAI-compat endpoint (Aliyun's official path).
                    base_url=os.getenv(
                        "QWEN_API_BASE",
                        "https://dashscope.aliyuncs.com/compatible-mode/v1",
                    ),
                )
            except Exception as e:
                log.warning("Qwen init failed: %s", e)

        gl = os.getenv("ZHIPU_API_KEY") or os.getenv("GLM_API_KEY")
        if gl:
            try:
                self._glm = OpenAICompatProvider(
                    name="glm",
                    api_key=gl,
                    base_url=os.getenv("GLM_API_BASE", "https://open.bigmodel.cn/api/paas/v4"),
                )
            except Exception as e:
                log.warning("GLM init failed: %s", e)

        # FinGPT — finance-fine-tuned LLM. Two activation paths:
        #   1. HuggingFace Inference Endpoint that exposes an OpenAI-compatible
        #      route (works with `text-generation-inference` deployments).
        #   2. A self-hosted vLLM/llama.cpp server with the same shape.
        # Either way: set FINGPT_API_KEY + FINGPT_API_BASE on Render. When set
        # and `TA_USE_FINGPT=true`, the router prefers it for analyst-stage
        # calls where finance-domain priors help (fundamentals, news).
        fg_key = os.getenv("FINGPT_API_KEY")
        fg_base = os.getenv("FINGPT_API_BASE")
        if fg_key and fg_base:
            try:
                self._fingpt = OpenAICompatProvider(
                    name="fingpt",
                    api_key=fg_key,
                    base_url=fg_base,
                )
                log.info("FinGPT provider enabled (base=%s)", fg_base)
            except Exception as e:
                log.warning("FinGPT init failed: %s", e)

        # `TA_MODE=live` (default) → use whatever LLM provider keys are set.
        # `TA_MODE=mock` → force mock provider (used by tests / offline demos).
        # We default to LIVE because the product is meant to be real
        # analysis; mock is the test mode, not the production mode.
        force_mock = os.getenv("TA_MODE", "live").lower() == "mock"
        self._force_mock = force_mock

        # Default model strings per tier (override via env). Defaults pick a
        # working free/cheap path based on which keys are present. Order of
        # preference reflects cost + Chinese-locale fitness:
        #   1. DeepSeek (cheap + reasoning model)
        #   2. Qwen (Chinese-tuned, cheap)
        #   3. GLM (Chinese-tuned, free tier)
        #   4. Gemini (good but quota-limited)
        #   5. OpenAI/Anthropic (premium fallback)
        if self._deepseek and not (self._openai or self._anthropic or self._gemini):
            default_fast = "deepseek-chat"
            default_mid = "deepseek-chat"
            default_deep = "deepseek-reasoner"
        elif self._qwen and not (self._openai or self._anthropic or self._gemini):
            default_fast = "qwen-flash"
            default_mid = "qwen-plus"
            default_deep = "qwen-max"
        elif self._glm and not (self._openai or self._anthropic or self._gemini or self._qwen):
            default_fast = "glm-4-flash"
            default_mid = "glm-4"
            default_deep = "glm-4-plus"
        elif self._gemini and not (self._openai or self._anthropic):
            default_fast = "gemini-2.5-flash-lite"
            default_mid = "gemini-2.5-flash"
            default_deep = "gemini-2.5-pro"
        else:
            default_fast = "gpt-4o-mini"
            default_mid = "claude-sonnet-4-6"
            default_deep = "claude-opus-4-6"

        self.models: dict[Tier, str] = {
            Tier.FAST: os.getenv("TA_MODEL_FAST", default_fast),
            Tier.MID: os.getenv("TA_MODEL_MID", default_mid),
            Tier.DEEP: os.getenv("TA_MODEL_DEEP", default_deep),
        }

    def _provider_for(self, model: str) -> _ProviderBase:
        if self._force_mock:
            return self._mock
        if model.startswith("gemini-") and self._gemini:
            return self._gemini
        if model.startswith(("gpt-", "o1-")) and self._openai:
            return self._openai
        if model.startswith("claude-") and self._anthropic:
            return self._anthropic
        if model.startswith("deepseek-") and self._deepseek:
            return self._deepseek
        if model.startswith("qwen-") and self._qwen:
            return self._qwen
        if model.startswith("glm-") and self._glm:
            return self._glm
        return self._mock

    def has_any_real_provider(self) -> bool:
        """True iff at least one real LLM provider is configured.

        Used by /v1/health to honestly tell users "you'll get mock
        output" when no keys are set, and by `complete()` to relabel
        TokenUsage.model so the cost ledger doesn't claim we paid GPT
        prices for a mock-served response.
        """
        return any((
            self._openai, self._anthropic, self._gemini,
            self._deepseek, self._qwen, self._glm,
        ))

    # Per-family fallback chains. The router cycles through these on
    # transient errors (rate limit / 5xx) so a single quota exhaustion
    # can't bring the pipeline down. Each chain only fires for models
    # in that family; cross-family fallback is handled by the closing
    # mock entry which never errors.
    _GEMINI_FALLBACK_CHAIN = [
        "gemini-2.5-pro",          # if 3.1-pro-preview is rate-limited
        "gemini-2.5-flash",        # cheap and high-quota
        "gemini-2.5-flash-lite",   # last resort before mock
    ]
    _DEEPSEEK_FALLBACK_CHAIN = [
        "deepseek-chat",           # cheap V3 fallback if reasoner fails
    ]
    _QWEN_FALLBACK_CHAIN = [
        "qwen-plus",
        "qwen-turbo",
        "qwen-flash",
    ]
    _GLM_FALLBACK_CHAIN = [
        "glm-4",
        "glm-4-flash",
    ]

    def complete(
        self,
        *,
        tier: Tier,
        system: str,
        user: str,
        temperature: float = 0.3,
    ) -> LLMResponse:
        model = self.models[tier]
        # Append a language directive when the request asks for non-English
        # output. Done at the router level so every provider (OpenAI,
        # Anthropic, Gemini, Mock) gets the same treatment without us
        # having to touch each agent node's complete() call site.
        sys_with_lang = self._with_lang_directive(system)

        # Build the model-fallback list: configured model first, then
        # same-family backup tiers, then mock as last resort. We try each
        # on a rate-limit / 429 / 5xx error so a single agent can't bring
        # down the whole pipeline when the user's free quota is exhausted.
        chain: list[str] = [model]
        if model.startswith("gemini-"):
            family = self._GEMINI_FALLBACK_CHAIN
        elif model.startswith("deepseek-"):
            family = self._DEEPSEEK_FALLBACK_CHAIN
        elif model.startswith("qwen-"):
            family = self._QWEN_FALLBACK_CHAIN
        elif model.startswith("glm-"):
            family = self._GLM_FALLBACK_CHAIN
        else:
            family = []
        for m in family:
            if m not in chain:
                chain.append(m)
        # Always end with mock so the pipeline NEVER hard-fails.
        chain.append("mock-deep" if tier == Tier.DEEP else "mock-mid")

        # Wrap the whole fallback loop in one observability span so the
        # Langfuse trace records: configured tier, primary model, model
        # actually used (after fallback), tokens, cost, latency.
        with current_span(
            "llm.complete",
            tier=tier.value,
            primary_model=model,
            chain=",".join(chain[:4]),
        ) as sp:
            last_err: Exception | None = None
            for m in chain:
                provider = self._provider_for(m)
                log.debug("LLM %s -> %s (%s)", tier.value, m, provider.name)
                try:
                    resp = provider.complete(sys_with_lang, user, m, temperature=temperature)
                    # Honesty: if we silently fell through to mock (because
                    # the configured model had no real provider — e.g. user
                    # set TA_MODEL_DEEP=gemini-3.1-pro-preview but never set
                    # GEMINI_API_KEY), the response's TokenUsage.model would
                    # still say "gemini-3.1-pro-preview" and the cost ledger
                    # would claim we paid Gemini prices for a template
                    # response. Relabel to a mock-* model name so the UI +
                    # billing know what really happened.
                    if provider is self._mock and not m.startswith("mock-"):
                        fake_model = "mock-deep" if tier == Tier.DEEP else "mock-mid"
                        resp.usage.model = fake_model
                        resp.usage.usd_cost = 0.0
                    # Enrich the trace span with what actually happened —
                    # this is what makes Langfuse useful when looking at a
                    # decision two weeks later.
                    if sp is not None:
                        try:
                            sp.update(
                                input={"system": sys_with_lang[:1500], "user": user[:1500]},
                                output=resp.text[:2000],
                                metadata={
                                    "tier": tier.value,
                                    "primary_model": model,
                                    "actual_model": resp.usage.model,
                                    "tokens_prompt": resp.usage.prompt_tokens,
                                    "tokens_completion": resp.usage.completion_tokens,
                                    "tokens_total": resp.usage.prompt_tokens + resp.usage.completion_tokens,
                                    "usd_cost": resp.usage.usd_cost,
                                    "fell_through_to_mock": provider is self._mock,
                                },
                            )
                        except Exception:
                            pass
                    return resp
                except Exception as e:
                    last_err = e
                    msg = str(e)
                    # Retry on transient / rate-limit; raise immediately on
                    # config errors (auth, missing key) so we don't pointlessly
                    # cycle through the whole chain.
                    if "401" in msg or "403" in msg or "API key" in msg:
                        raise
                    log.warning(
                        "LLM call to %s failed (%s); falling through chain",
                        m, msg[:200],
                    )
                    continue
            # Should be unreachable because mock providers always succeed, but
            # be explicit if somehow not.
            if last_err:
                raise last_err
            raise RuntimeError("LLMRouter chain exhausted without response")

    def _with_lang_directive(self, system: str) -> str:
        if self.locale == "zh":
            # Strong, repeated instruction — Gemini occasionally still drifts
            # back to English on the first few tokens of a long structured
            # response, so we anchor it twice (start + end) and explicitly
            # cover the JSON case (keys stay English, values switch to ZH).
            zh_instr = (
                "\n\n---\n请用简体中文回答。所有自由文本（如分析、辩论、推理、风险提示）"
                "必须使用简体中文。如果输出 JSON：JSON 的键（key）保持英文，值（value）"
                "如果是描述性文本就用简体中文，如果是分类标签（如 'high' / 'medium' / 'low'）"
                "保持英文。术语和金融指标的英文缩写（如 P/E, FCF, RSI, MACD, EBITDA）"
                "可以保留原文，无需翻译。"
            )
            return system + zh_instr
        return system


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
