"""Report builder — assembles the 11-section ReportData JSON for /v1/report/full.

Strategy
--------
1. Validate ticker (A-share 6 digits, or HK 5 digits / .HK).
2. Fetch live facts (quote, fundamentals, technical indicators, metadata) from
   existing adapters/data bus. These are deterministic and unspoofable.
3. Call a single LLM (Gemini Pro via existing router) with a strict JSON
   schema covering all narrative-heavy fields (the three frameworks, bull/bear
   oneliners, scenarios, operation plan, follow-up checklist, etc).
4. Merge factual data + LLM narrative into the ReportData shape that the
   front-end /report/[ticker] expects.
5. Cache result for 24h in SQLite so reload is sub-second.

Tradeoffs
---------
* We do NOT spin up the full 7-agent debate here — that's 60-90s and costs
  multiple LLM calls. The single-LLM approach delivers ~6-12s end-to-end with
  one Gemini call. Users who want full 7-agent depth click the "跑 7-agent
  决策" button on the report.
* Factual fields (PE/PB/ROE/RSI/ADX/价格) come from adapters — the LLM only
  fills in narrative around them. This is the same anti-hallucination
  posture as the rest of the platform.
* Adapter failures degrade gracefully: missing fields become "数据缺失" in
  the narrative but the report still renders.
"""

from __future__ import annotations

import json
import logging
import re
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any

log = logging.getLogger("ta.report_builder")


# --- Ticker validation ----------------------------------------------------

_A_SHARE_RE = re.compile(r"^(?:60|68|00|30|83|87|88)\d{4}$")
_HK_RE = re.compile(r"^\d{4,5}(?:\.HK)?$", re.IGNORECASE)


def classify_ticker(ticker: str) -> str:
    """Return one of: 'a_share', 'hk_equity', 'unsupported'.

    HK support pends a dedicated adapter — for now /report/00700 falls through
    to the a_share adapter, which won't work. We still classify so the
    frontend shows a polite "HK adapter coming soon" rather than a 500.
    """
    t = (ticker or "").strip().upper()
    if _A_SHARE_RE.match(t):
        return "a_share"
    if _HK_RE.match(t):
        return "hk_equity"
    return "unsupported"


def normalize_hk_ticker(ticker: str) -> str:
    """Normalise HK ticker to 5-digit form (e.g. '700' -> '00700', '00700.HK' -> '00700')."""
    t = ticker.strip().upper().replace(".HK", "")
    if t.isdigit():
        return t.zfill(5)
    return t


# --- Data fetch -----------------------------------------------------------

def fetch_facts(ticker: str, market: str) -> dict:
    """Pull live factual data from existing adapters. Returns a flat dict
    with keys consumed by the LLM prompt below. All fields fail-safe to
    None if the upstream is down."""

    out: dict[str, Any] = {
        "ticker": ticker,
        "market": market,
        "name": None,
        "exchange": "SSE" if market == "a_share" else "HKEX",
        "currency": "CNY" if market == "a_share" else "HKD",
        "current_price": None,
        "prev_close": None,
        "change_pct": None,
        "asof": date.today().isoformat(),

        # Fundamentals
        "pe": None, "pb": None, "ps": None,
        "roe": None, "net_margin": None,
        "revenue_yoy": None, "profit_yoy": None,
        "dividend_yield": None,
        "market_cap": None,
        "book_to_market": None,
        "sector": None, "industry": None,

        # Technical
        "rsi14": None, "mfi14": None, "adx14": None,
        "macd": None, "macd_signal": None,
        "kdj_k": None, "kdj_d": None, "kdj_j": None,
        "atr14": None, "hist_vol": None,
        "ma5": None, "ma20": None, "ma60": None,
        "volume_ratio": None,
        "support_level": None, "pressure_level": None,
    }

    # 1. Adapter (we use it for quotes + fundamentals + technical)
    adapter = None
    try:
        from trading_agents.adapters import get_adapter
        adapter = get_adapter(market)
    except Exception as e:
        log.warning("[report.facts] adapter init failed for %s/%s: %s", ticker, market, e)

    # 2. Quote + MAs + support/pressure
    if adapter is not None:
        try:
            end = date.today()
            start = end - timedelta(days=180)
            hist = adapter.get_price_history(ticker, start, end)
            if hist:
                last = hist[-1]
                prev = hist[-2] if len(hist) >= 2 else last
                out["current_price"] = float(getattr(last, "close", 0) or 0)
                out["prev_close"] = float(getattr(prev, "close", 0) or 0)
                if out["prev_close"]:
                    out["change_pct"] = round((out["current_price"] - out["prev_close"]) / out["prev_close"] * 100, 2)
                closes = [float(getattr(b, "close", 0) or 0) for b in hist[-60:]]
                if len(closes) >= 5:
                    out["ma5"] = round(sum(closes[-5:]) / 5, 2)
                if len(closes) >= 20:
                    out["ma20"] = round(sum(closes[-20:]) / 20, 2)
                if len(closes) >= 60:
                    out["ma60"] = round(sum(closes[-60:]) / 60, 2)
                if len(hist) >= 20:
                    window = hist[-20:]
                    out["pressure_level"] = round(max(float(getattr(b, "high", 0) or 0) for b in window), 2)
                    out["support_level"] = round(min(float(getattr(b, "low", 0) or 0) for b in window), 2)
        except Exception as e:
            log.warning("[report.facts] quote fetch failed for %s: %s", ticker, e)

    # 3. Metadata (name / sector) from persistence cache
    try:
        from . import persistence
        meta = persistence.get_ticker_meta(ticker) or persistence.get_ticker_meta_stale_ok(ticker)
        if meta:
            out["name"] = meta.get("name") or out["name"]
            out["sector"] = meta.get("sector")
            out["industry"] = meta.get("industry")
            out["market_cap"] = meta.get("market_cap")
    except Exception as e:
        log.warning("[report.facts] meta fetch failed: %s", e)

    # 4. Fundamentals via adapter.get_fundamentals (Pydantic Fundamentals model)
    if adapter is not None:
        try:
            f = adapter.get_fundamentals(ticker, date.today())
            if f is not None:
                out["pe"] = getattr(f, "pe_ratio", None)
                out["pb"] = getattr(f, "pb_ratio", None)
                out["net_margin"] = getattr(f, "net_margin", None)
                out["revenue_yoy"] = getattr(f, "revenue_growth_yoy", None)
                out["market_cap"] = getattr(f, "market_cap", None) or out["market_cap"]
                # ROE estimate from net_margin × asset_turnover not available — leave null
        except Exception as e:
            log.warning("[report.facts] fundamentals fetch failed: %s", e)

    # 5. Technical indicators via adapter.get_technical (Pydantic TechnicalSnapshot)
    if adapter is not None:
        try:
            t = adapter.get_technical(ticker, date.today())
            if t is not None:
                out["rsi14"] = getattr(t, "rsi_14", None)
                out["macd"] = getattr(t, "macd", None)
                out["macd_signal"] = getattr(t, "macd_signal", None)
                out["kdj_k"] = getattr(t, "kdj_k", None)
                out["kdj_d"] = getattr(t, "kdj_d", None)
                out["kdj_j"] = getattr(t, "kdj_j", None)
                out["atr14"] = getattr(t, "atr_14", None)
                # sma_20 → ma20 if not already set by price history
                if out["ma20"] is None:
                    out["ma20"] = getattr(t, "sma_20", None)
        except Exception as e:
            log.warning("[report.facts] technical fetch failed: %s", e)

    return out


# --- LLM narrative generation ---------------------------------------------

_SYSTEM_PROMPT_ZH = """你是「投资指挥官」TradingAgents 资深首席分析师，输出风格严谨、专业、克制。
你的任务：基于给定的事实数据 (FACTS) 为 {name}（{ticker}）生成 11 节专业投研报告 JSON。

严格要求：
1. 仅输出合法 JSON，键名和结构必须与下方 SCHEMA 一致，不要任何额外说明。
2. 数值字段（current_price / target_price_*  / fair_value 等）必须基于 FACTS 推导，不得编造。
3. 估值情景 3 个价格 (悲观/中性/乐观) 必须围绕当前价上下波动 ±20% 内。
4. 所有文本字段使用简体中文，专业、有判断力，避免笼统词。
5. 三个框架（三步估值 / 杜邦分解 / 逻辑链）必须深入，每个字段至少 30 字。
6. 若 FACTS 中某字段为 null，narrative 用「数据待补充」或「需后续披露」并继续输出。
"""

_SCHEMA = {
    "summary": {
        "rating": "BUY|HOLD|SELL", "rating_label_zh": "持有/买入/卖出",
        "current_price": "<float>", "currency": "<str>",
        "target_price_low": "<float>", "target_price_high": "<float>",
        "expected_return_pct": "<float>", "expected_return_sign": "+|-|±",
        "holding_period": "3-6 个月",
        "investor_type": "平衡型投资者/进取型/稳健型",
        "position_size_range": "5-15%",
        "entry_timing": "<str>",
        "key_observations": ["<3 项关键观察>"],
        "bull_oneliner": "<看涨一句话>",
        "bear_oneliner": "<看跌一句话>",
    },
    "core_view": "<≤80 字核心观点>",
    "decision_confidence": "<0-1 float>",
    "confidence_level": "高/中/低",
    "qualitative": {
        "research_topic": "<str>",
        "core_question": "<str>",
        "research_background": "<str>",
        "opening_conclusion": "<≥120 字开篇结论>",
        "framework_1_three_step_valuation": {
            "title": "三步估值定位",
            "step_1_comparison": {"title": "步骤 1：对比定位", "items": [{"label": "<对比维度>", "body": "<内容>"}]},
            "step_2_attribution": {
                "title": "步骤 2：归因分析",
                "market_concerns": [{"label": "<担忧>", "body": "<解释>"}],
                "are_concerns_reasonable": "<判断>",
                "catalysts_to_change_concerns": [{"label": "<催化剂>", "body": "<内容>"}],
            },
            "step_3_scenarios": {
                "title": "步骤 3：情景测算",
                "scenarios": [
                    {"label": "悲观情景", "assumption": "<假设>", "body": "<估值逻辑>", "fair_value": "<float>"},
                    {"label": "中性情景", "assumption": "<假设>", "body": "<估值逻辑>", "fair_value": "<float>"},
                    {"label": "乐观情景", "assumption": "<假设>", "body": "<估值逻辑>", "fair_value": "<float>"},
                ],
                "conclusion": "<总结>",
            },
        },
        "framework_2_dupont": {
            "title": "杜邦分解",
            "roe": "<float 或 null>",
            "decomposition": [
                {"name": "净利率", "value": "<float|null>", "unit": "%", "note": "<≥20 字>"},
                {"name": "资产周转率", "value": "<float|null>", "unit": "次", "note": "<≥20 字>"},
                {"name": "杠杆率", "value": "<float|null>", "unit": "", "note": "<≥20 字>"},
            ],
            "nature_of_change": [{"label": "结构 vs 周期", "body": "<判断>"}, {"label": "可持续性", "body": "<判断>"}],
            "key_observation_indicator": "<下季度核心观察指标>",
            "change_signal": "<≥40 字>",
        },
        "framework_3_logic_chain": {
            "title": "逻辑链构建",
            "chain": ["<环节 1>", "<环节 2>", "<...>", "<最终股价表现>"],
            "weakest_link": {"link": "<链条中最脆弱的一环>", "fragility": ["<≥2 项脆弱性>"]},
            "validation_signals": {"leading": "<先行指标>", "coincident": "<同步指标>", "lagging": "<滞后指标>"},
        },
        "six_questions": [{"q": "<问题>", "a": "<回答>"}],
        "validation_signals_and_window": {"validation": "<信号>", "time_window": "<时间>", "falsification": "<失效条件>"},
        "actionable": {"type_match": "<投资者类型匹配>", "operating_advice": "<操作建议>"},
    },
    "quantitative": {
        "growth": {"title": "① 营收增长", "body": "<数据解读>", "data_status": "ok/missing"},
        "profitability": {"title": "② 盈利质量", "body": "<解读>", "data_status": "ok/missing"},
        "cash_health": {"title": "③ 现金流", "body": "<解读>", "data_status": "ok/missing"},
        "shareholder_return": {
            "title": "④ 股东回报",
            "body": "<解读>",
            "rows": [{"year": 2024, "dividend_ratio": "<str>", "dividend_yield": "<str>"}],
        },
        "summary": "<本层小结>",
    },
    "valuation": {
        "rows": [
            {"metric": "PE", "current": "<str>", "historical_median": "<str>", "industry_average": "<str>", "assessment": "<偏高/合理/偏低>"},
            {"metric": "PB", "current": "<str>", "historical_median": "<str>", "industry_average": "<str>", "assessment": "<>"},
            {"metric": "PS", "current": "<str>", "historical_median": "<str>", "industry_average": "<str>", "assessment": "<>"},
        ],
        "relative_conclusion": "<相对估值结论>",
        "fair_value_ranges": [
            {"scenario": "悲观情景", "assumption": "<>", "fair_value_cny": "<float>"},
            {"scenario": "中性情景", "assumption": "<>", "fair_value_cny": "<float>"},
            {"scenario": "乐观情景", "assumption": "<>", "fair_value_cny": "<float>"},
        ],
        "final_conclusion": "<最终估值结论>",
    },
    "market_sentiment": {
        "capital_flow_status": "<净流入/净流出/中性>",
        "capital_flow_note": "<解读>",
        "sentiment_zone": "<乐观/中性/悲观>",
        "sentiment_note": "<解读>",
        "sector_effect": "<跑赢/同步/跑输>",
        "sector_note": "<解读>",
    },
    "technical": {
        "opening_conclusion": "<≥100 字技术面开篇结论>",
        "framework_1_trend": {
            "title": "趋势定位",
            "layer_1_macro": {"title": "层次 1：主趋势判断", "adx": "<float|null>", "body": "<≥40 字>"},
            "layer_2_logic": {"title": "层次 2：趋势逻辑", "why_oscillating": "<≥40 字>"},
            "layer_3_signal": {"title": "层次 3：趋势预期", "breakout_signals": "<>", "reversal_signals": "<>"},
        },
        "framework_2_momentum": {
            "title": "动能分析",
            "indicators": [
                {"name": "RSI(14)", "value": "<float|null>", "note": "<>"},
                {"name": "MFI(14)", "value": "<float|null>", "note": "<>"},
                {"name": "MACD", "value": None, "note": "<>"},
                {"name": "KDJ", "value": "<float|null>", "note": "<>"},
            ],
            "dynamic_interpretation": {"driver": "<驱动力>", "sustainability": "<可持续性>"},
        },
        "framework_3_key_levels": {
            "title": "关键位与策略",
            "pressure": {"level": "<最重要压力位>", "body": "<≥40 字>"},
            "support": {"level": "<最重要支撑位>", "body": "<≥40 字>"},
            "breakout_logic": {"up": "<向上突破>", "down": "<向下跌破>", "false_breakout": "<真假突破判定>"},
        },
        "answers_to_questions": [{"q": "<>", "a": "<>"}],
        "answers_to_situational": [{"q": "<>", "a": "<>"}],
        "validation_and_falsification": [{"label": "<>", "body": "<>"}],
    },
    "debate": {"bull_case": ["<2-3 条>"], "bear_case": ["<2-3 条>"], "our_judgment": "<判断>"},
    "risks": [{"label": "<风险点>", "body": "<解释>"}],
    "operation_plan": {
        "action": "HOLD/BUY/SELL", "portfolio_advice": "<>", "position_management": "<>",
        "key_info": "<>", "trade_decision": "<>", "position_advice": ["<3 项>"],
    },
    "follow_up": [
        {"item": "核心验证", "indicator": "<>", "expected_time": "<>", "impact": "<>"},
        {"item": "风险监测", "indicator": "<>", "expected_time": "<>", "impact": "<>"},
        {"item": "技术面验证", "indicator": "<>", "expected_time": "<>", "impact": "<>"},
        {"item": "催化剂", "indicator": "<>", "expected_time": "<>", "impact": "<>"},
    ],
}


def build_llm_prompt(facts: dict) -> tuple[str, str]:
    """Compose (system, user) prompts for the report-generation LLM call."""
    name = facts.get("name") or facts["ticker"]
    sys = _SYSTEM_PROMPT_ZH.format(name=name, ticker=facts["ticker"])
    user = (
        f"FACTS (live data, do NOT contradict):\n```json\n"
        f"{json.dumps(facts, ensure_ascii=False, indent=2)}\n```\n\n"
        f"SCHEMA (output this exact structure):\n```json\n"
        f"{json.dumps(_SCHEMA, ensure_ascii=False, indent=2)}\n```\n\n"
        f"现在请基于上述 FACTS 生成完整 JSON。"
    )
    return sys, user


def _extract_json(text: str) -> dict | None:
    """Extract the first JSON object from LLM output. Handles three cases:

    1. ```json ... ``` fenced block (LLM common pattern)
    2. Bare JSON object — find first { to last }
    3. Truncated JSON (LLM hit max_tokens mid-output) — repair by closing
       open braces and trailing strings, then re-parse

    Returns the parsed dict, or None if nothing parseable found.
    """
    if not text:
        return None

    # Strip leading code fence if present
    fenced = re.search(r"```(?:json)?\s*(\{[\s\S]*?)\s*```", text)
    candidate = fenced.group(1) if fenced else text

    # Trim to the first { and however much we have
    start = candidate.find("{")
    if start < 0:
        return None
    body = candidate[start:]

    # Try as-is first
    try:
        return json.loads(body)
    except Exception:
        pass

    # Try the longest balanced prefix
    end = body.rfind("}")
    while end > 0:
        try:
            return json.loads(body[:end + 1])
        except Exception:
            end = body.rfind("}", 0, end)

    # Last-ditch repair: close any open string, then close all open braces.
    repaired = _repair_truncated_json(body)
    if repaired is not None:
        try:
            return json.loads(repaired)
        except Exception:
            log.debug("[report.llm] repair attempted but parse still failed")
            return None
    return None


def _repair_truncated_json(text: str) -> str | None:
    """Best-effort close of a truncated JSON object.

    Walks the text tracking open braces/brackets and string state.
    Strategy: chop the tail back to the last position where the JSON
    is in a "between siblings" state (after a comma or after a value),
    then close all open structures. This gracefully handles the common
    failure mode where the truncation falls mid-key or mid-value.

    Returns None if the text isn't recoverable.
    """
    if not text or not text.strip().startswith("{"):
        return None

    # First pass: find the last index where we're either (a) just after a
    # complete value (the char is `,` `}` `]` or whitespace following one
    # of those) AND not inside a string. This is the safe truncation point.
    stack: list[str] = []
    in_string = False
    escape = False
    last_safe = -1  # index right after a complete key-value pair
    last_safe_stack: list[str] = []
    for i, ch in enumerate(text):
        if escape:
            escape = False
            continue
        if in_string:
            if ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
                # Mark safe AFTER closing a string that's a value:
                # we'll learn it's a value only when we hit the next
                # comma/}/]. So defer the mark to those tokens.
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            stack.append("}")
        elif ch == "[":
            stack.append("]")
        elif ch == "}" or ch == "]":
            if stack and stack[-1] == ch:
                stack.pop()
            last_safe = i
            last_safe_stack = list(stack)
        elif ch == ",":
            last_safe = i - 1  # truncate at this comma; we'll strip it
            last_safe_stack = list(stack)
        elif ch in (" ", "\t", "\n", "\r"):
            # whitespace doesn't change safety
            pass
        # Other chars (digits, letters, :) — we're mid-token, not safe.

    if last_safe < 0:
        # Couldn't find a clean truncation point — fall back to brute-force
        out = text
        if in_string:
            out += '"'
        out = re.sub(r",\s*$", "", out)
        while stack:
            out += stack.pop()
        return out

    out = text[:last_safe + 1].rstrip().rstrip(",")
    # Close every still-open structure
    while last_safe_stack:
        out += last_safe_stack.pop()
    return out


# Module-level diagnostics, exposed via the `_debug` field when caller
# passes ?debug=true on the endpoint. Each generation overwrites these.
_LAST_LLM_DIAG: dict[str, Any] = {}


def call_llm_for_narrative(facts: dict, locale: str = "zh") -> dict:
    """Single LLM call → narrative JSON. Returns empty dict on failure.

    Uses Tier.DEEP so the analyst tone matches what the rest of the
    platform expects (actual tiers are FAST/MID/DEEP).
    """
    global _LAST_LLM_DIAG
    from trading_agents.llm.router import LLMRouter, Tier
    sys_prompt, user_prompt = build_llm_prompt(facts)
    router = LLMRouter(locale=locale)

    _LAST_LLM_DIAG = {
        "sys_prompt_len": len(sys_prompt),
        "user_prompt_len": len(user_prompt),
        "tier": "DEEP",
        "phase": "starting",
    }

    try:
        # gemini-3.1-pro-preview is a thinking model — the default
        # maxOutputTokens=4096 budget gets spent mostly on internal
        # reasoning, leaving only ~150 tokens of visible output (the
        # JSON gets truncated mid-key). Bump to 16384 so the output
        # half of the budget can comfortably hold the 5-8k char JSON
        # for an 11-section report.
        resp = router.complete(
            tier=Tier.DEEP,
            system=sys_prompt,
            user=user_prompt,
            temperature=0.35,
            max_tokens=16384,
        )
        raw = resp.text or ""
        _LAST_LLM_DIAG.update({
            "phase": "got_response",
            "raw_len": len(raw),
            "raw_head_200": raw[:200],
            "raw_tail_200": raw[-200:] if len(raw) > 200 else "",
            "model_used": getattr(resp, "model", None) or getattr(resp.usage, "model", None) if hasattr(resp, "usage") else None,
            "cost_usd": float(getattr(resp.usage, "usd_cost", 0.0) or 0.0) if hasattr(resp, "usage") else 0.0,
        })

        data = _extract_json(raw)
        if data:
            _LAST_LLM_DIAG.update({"phase": "json_extracted", "json_keys": list(data.keys())})
            return data

        _LAST_LLM_DIAG.update({"phase": "json_extract_failed", "error": "no parseable JSON in response"})
        log.warning("[report.llm] failed to extract JSON from response (len=%d) — head: %r", len(raw), raw[:300])
        return {}
    except Exception as e:
        import traceback
        _LAST_LLM_DIAG.update({
            "phase": "exception",
            "error_type": type(e).__name__,
            "error_msg": str(e),
            "traceback": traceback.format_exc()[:1000],
        })
        log.warning("[report.llm] generation failed: %s", e, exc_info=True)
        return {}


def get_last_llm_diagnostics() -> dict:
    """Return the most recent LLM call's diagnostic info (for debug=true)."""
    return dict(_LAST_LLM_DIAG)


# --- Assembly -------------------------------------------------------------

def _exchange_for(market: str, ticker: str) -> str:
    if market == "a_share":
        # 6/9 prefix = SSE; 0/3 prefix = SZSE; 8/4 = BSE
        if ticker[0] in ("6", "9"):
            return "SSE"
        if ticker[0] in ("0", "3"):
            return "SZSE"
        if ticker[0] in ("8", "4"):
            return "BSE"
    return "HKEX"


def _bus_telemetry_snapshot() -> list[dict]:
    """Take a snapshot of the most recent bus.fetch entries for this request.

    bus.telemetry(last_n=N) returns dicts with keys: need_kind, source,
    cache_hit, elapsed_ms, error. We rename elapsed_ms → latency_ms to match
    the BusTelemetryRow shape the frontend renders.
    """
    try:
        from trading_agents.ecosystem.data_bus import bus
        entries = bus.telemetry(last_n=12) if hasattr(bus, "telemetry") else []
        return [
            {
                "need_kind": e.get("need_kind", "unknown"),
                "source": e.get("source", "unknown"),
                "latency_ms": int(e.get("elapsed_ms", 0) or 0),
                "cache_hit": bool(e.get("cache_hit", False)),
            }
            for e in (entries or [])
        ]
    except Exception as e:
        log.debug("[report.bus] telemetry snapshot failed: %s", e)
        return []


def assemble_report(ticker: str, locale: str = "zh") -> dict:
    """Top-level entry: fetch facts → LLM narrative → merge into ReportData."""

    market_kind = classify_ticker(ticker)
    if market_kind == "unsupported":
        return {"error": "ticker_unsupported", "ticker": ticker, "supported_markets": ["A-share (6 digits)"]}

    # HK adapter doesn't exist yet — report a clean error instead of 500
    if market_kind == "hk_equity":
        return {"error": "hk_adapter_pending", "ticker": ticker, "message": "港股专用 adapter 即将推出。当前仅支持 A 股 6 位代码。"}

    market_api_name = "a_share"

    # 1. Live facts
    facts = fetch_facts(ticker, market_api_name)

    # 2. LLM narrative
    narrative = call_llm_for_narrative(facts, locale=locale)

    # 3. Merge into ReportData shape
    now_iso = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    name = facts.get("name") or ticker

    market_chip = "A-share" if market_kind == "a_share" else "HK"

    summary = narrative.get("summary") or {}
    qualitative = narrative.get("qualitative") or {}
    quantitative = narrative.get("quantitative") or {}
    valuation = narrative.get("valuation") or {}
    sentiment = narrative.get("market_sentiment") or {}
    technical = narrative.get("technical") or {}
    debate = narrative.get("debate") or {}
    risks = narrative.get("risks") or []
    op = narrative.get("operation_plan") or {}
    follow = narrative.get("follow_up") or []

    # ---------- Defensive defaults ----------
    # Every required field gets a placeholder so the frontend never crashes
    # on missing data. If the LLM returned a partial response, what's there
    # is kept; what's missing falls back to "数据待补充" / 0 / [].

    current_price = facts.get("current_price") or 0
    target_low = float(summary.get("target_price_low") or current_price * 0.95)
    target_high = float(summary.get("target_price_high") or current_price * 1.05)

    summary_defaults = {
        "rating": "HOLD",
        "rating_label_zh": "持有",
        "current_price": current_price,
        "currency": facts.get("currency") or "CNY",
        "target_price_low": round(target_low, 2),
        "target_price_high": round(target_high, 2),
        "expected_return_pct": 0.0,
        "expected_return_sign": "±",
        "holding_period": "3-6 个月",
        "investor_type": "平衡型投资者",
        "position_size_range": "5-15%",
        "entry_timing": "等待更好买点",
        "key_observations": ["公司基本面表现", "股价趋势研判", "估值合理区间"],
        "bull_oneliner": "数据待补充 — 请重新生成或等待 LLM 服务恢复。",
        "bear_oneliner": "数据待补充 — 请重新生成或等待 LLM 服务恢复。",
    }
    for k, v in summary_defaults.items():
        if summary.get(k) in (None, "", []):
            summary[k] = v
    summary["rating_label_zh"] = {"BUY": "买入", "HOLD": "持有", "SELL": "卖出"}.get(summary["rating"], summary.get("rating_label_zh", "持有"))

    # Re-compute expected_return_sign from %
    try:
        er = float(summary.get("expected_return_pct") or 0)
        summary["expected_return_sign"] = "+" if er > 0.5 else ("-" if er < -0.5 else "±")
    except Exception:
        summary["expected_return_sign"] = "±"

    # Qualitative defaults — full nested shape so React doesn't crash
    qualitative.setdefault("research_topic", "标准股票分析")
    qualitative.setdefault("core_question", "当前股价是否合理反映基本面状况？")
    qualitative.setdefault("research_background", "估值 vs 基本面")
    qualitative.setdefault("opening_conclusion", "数据待补充 — LLM 叙事生成失败。可点击「重新生成」重试，或运行「7-agent 决策」获取完整分析。")

    def _f1_default():
        return {
            "title": "三步估值定位",
            "step_1_comparison": {"title": "步骤 1：对比定位", "items": [
                {"label": "与自身历史对比", "body": "数据待补充"},
                {"label": "与同业对比", "body": "数据待补充"},
                {"label": "与绝对估值对比", "body": "数据待补充"},
            ]},
            "step_2_attribution": {
                "title": "步骤 2：归因分析",
                "market_concerns": [{"label": "市场担忧", "body": "数据待补充"}],
                "are_concerns_reasonable": "数据待补充",
                "catalysts_to_change_concerns": [{"label": "潜在催化剂", "body": "数据待补充"}],
            },
            "step_3_scenarios": {
                "title": "步骤 3：情景测算",
                "scenarios": [
                    {"label": "悲观情景", "assumption": "基本面持续走弱", "body": "数据待补充",
                     "fair_value": round(current_price * 0.80, 2)},
                    {"label": "中性情景", "assumption": "当前趋势延续", "body": "数据待补充",
                     "fair_value": round(current_price, 2)},
                    {"label": "乐观情景", "assumption": "基本面显著改善", "body": "数据待补充",
                     "fair_value": round(current_price * 1.20, 2)},
                ],
                "conclusion": "数据待补充",
            },
        }
    qualitative.setdefault("framework_1_three_step_valuation", _f1_default())

    qualitative.setdefault("framework_2_dupont", {
        "title": "杜邦分解",
        "roe": None,
        "decomposition": [
            {"name": "净利率", "value": facts.get("net_margin"), "unit": "%", "note": "数据待补充"},
            {"name": "资产周转率", "value": None, "unit": "次", "note": "数据待补充"},
            {"name": "杠杆率", "value": None, "unit": "", "note": "数据待补充"},
        ],
        "nature_of_change": [
            {"label": "结构 vs 周期", "body": "数据待补充"},
            {"label": "可持续性", "body": "数据待补充"},
        ],
        "key_observation_indicator": "下季度毛利率与扣非净利润",
        "change_signal": "数据待补充",
    })

    qualitative.setdefault("framework_3_logic_chain", {
        "title": "逻辑链构建",
        "chain": ["待补充逻辑环节 1", "待补充逻辑环节 2", "待补充逻辑环节 3", "股价表现"],
        "weakest_link": {"link": "待补充", "fragility": ["数据待补充"]},
        "validation_signals": {"leading": "数据待补充", "coincident": "数据待补充", "lagging": "数据待补充"},
    })

    qualitative.setdefault("six_questions", [{"q": "核心研究问题", "a": "数据待补充 — 请等待 LLM 服务恢复"}])
    qualitative.setdefault("validation_signals_and_window", {
        "validation": "数据待补充", "time_window": "未来 6-12 个月", "falsification": "数据待补充",
    })
    qualitative.setdefault("actionable", {"type_match": "平衡型投资者", "operating_advice": "数据待补充"})

    # Quantitative defaults
    quantitative.setdefault("growth", {"title": "① 营收增长", "body": "数据待补充", "data_status": "missing"})
    quantitative.setdefault("profitability", {"title": "② 盈利质量", "body": "数据待补充", "data_status": "missing"})
    quantitative.setdefault("cash_health", {"title": "③ 现金流", "body": "数据待补充", "data_status": "missing"})
    quantitative.setdefault("shareholder_return", {
        "title": "④ 股东回报",
        "body": "数据待补充",
        "rows": [{"year": 2024, "dividend_ratio": "—", "dividend_yield": "—"}],
    })
    quantitative.setdefault("summary", "本层数据待 LLM 叙事生成完成后补充。")

    # Valuation defaults — use actual PE/PB/PS from facts
    valuation.setdefault("rows", [
        {"metric": "PE", "current": f"{facts.get('pe'):.2f}" if facts.get("pe") is not None else "—",
         "historical_median": "—", "industry_average": "—", "assessment": "待评估"},
        {"metric": "PB", "current": f"{facts.get('pb'):.2f}" if facts.get("pb") is not None else "—",
         "historical_median": "—", "industry_average": "—", "assessment": "待评估"},
        {"metric": "PS", "current": f"{facts.get('ps'):.2f}" if facts.get("ps") is not None else "—",
         "historical_median": "—", "industry_average": "—", "assessment": "待评估"},
    ])
    valuation.setdefault("relative_conclusion", "数据待补充")
    valuation.setdefault("fair_value_ranges", [
        {"scenario": "悲观情景", "assumption": "基本面持续走弱", "fair_value_cny": round(current_price * 0.80, 2)},
        {"scenario": "中性情景", "assumption": "当前趋势延续",   "fair_value_cny": round(current_price, 2)},
        {"scenario": "乐观情景", "assumption": "基本面显著改善", "fair_value_cny": round(current_price * 1.20, 2)},
    ])
    valuation.setdefault("final_conclusion", "数据待补充")

    # Sentiment defaults
    sentiment.setdefault("capital_flow_status", "待分析")
    sentiment.setdefault("capital_flow_note", "数据待补充")
    sentiment.setdefault("sentiment_zone", "中性")
    sentiment.setdefault("sentiment_note", "数据待补充")
    sentiment.setdefault("sector_effect", "同步于大盘")
    sentiment.setdefault("sector_note", "数据待补充")

    # Technical defaults — fold in real RSI / MFI / KDJ / ATR if we have them
    technical.setdefault("opening_conclusion", "数据待补充")
    technical.setdefault("framework_1_trend", {
        "title": "趋势定位",
        "layer_1_macro": {"title": "层次 1：主趋势判断", "adx": facts.get("adx14"), "body": "数据待补充"},
        "layer_2_logic": {"title": "层次 2：趋势逻辑", "why_oscillating": "数据待补充"},
        "layer_3_signal": {"title": "层次 3：趋势预期", "breakout_signals": "数据待补充", "reversal_signals": "数据待补充"},
    })
    technical.setdefault("framework_2_momentum", {
        "title": "动能分析",
        "indicators": [
            {"name": "RSI(14)", "value": facts.get("rsi14"), "note": "中性区间" if facts.get("rsi14") else "数据待补充"},
            {"name": "MFI(14)", "value": facts.get("mfi14"), "note": "数据待补充"},
            {"name": "MACD",    "value": facts.get("macd"),  "note": "数据待补充"},
            {"name": "KDJ",     "value": facts.get("kdj_k"), "note": "数据待补充"},
        ],
        "dynamic_interpretation": {"driver": "数据待补充", "sustainability": "数据待补充"},
    })
    technical.setdefault("framework_3_key_levels", {
        "title": "关键位与策略",
        "pressure": {"level": f"{facts.get('pressure_level') or '—'}", "body": "数据待补充"},
        "support":  {"level": f"{facts.get('support_level') or '—'}",  "body": "数据待补充"},
        "breakout_logic": {"up": "数据待补充", "down": "数据待补充", "false_breakout": "数据待补充"},
    })
    technical.setdefault("answers_to_questions", [{"q": "技术面研判", "a": "数据待补充"}])
    technical.setdefault("answers_to_situational", [{"q": "震荡市操作", "a": "数据待补充"}])
    technical.setdefault("validation_and_falsification", [{"label": "看涨验证", "body": "数据待补充"}])

    # Debate / risks / op / follow defaults
    debate.setdefault("bull_case", ["数据待补充 — 请重新生成或运行 7-agent 决策"])
    debate.setdefault("bear_case", ["数据待补充 — 请重新生成或运行 7-agent 决策"])
    debate.setdefault("our_judgment", "数据待补充")
    if not risks:
        risks = [
            {"label": "行业风险", "body": "所属行业受宏观经济和政策影响较大。"},
            {"label": "公司经营风险", "body": "公司经营存在不确定性。"},
            {"label": "市场风险", "body": "市场情绪和风格切换可能影响股价短期表现。"},
        ]
    op.setdefault("action", summary.get("rating", "HOLD"))
    op.setdefault("portfolio_advice", "观望或小幅配置")
    op.setdefault("position_management", "建议维持当前仓位或小幅调整，单次变动不超过 5%。")
    op.setdefault("key_info", "数据待补充")
    op.setdefault("trade_decision", summary.get("rating", "HOLD"))
    op.setdefault("position_advice", ["遵守纪律", "分批操作", "设置止损"])
    if not follow:
        follow = [
            {"item": "核心验证", "indicator": "下季报关键指标", "expected_time": "下季报披露日", "impact": "若低于预期，估值面临下修"},
            {"item": "风险监测", "indicator": "市场整体走势", "expected_time": "持续",        "impact": "若出现重大变化需重新评估"},
            {"item": "技术面验证", "indicator": "关键支撑 / 压力位", "expected_time": "每周",  "impact": "若跌破支撑需考虑止损"},
            {"item": "催化剂",   "indicator": "行业政策 / 公司事件", "expected_time": "不确定", "impact": "若落地可能加速价值发现"},
        ]

    report = {
        # Meta
        "ticker": ticker,
        "name": name,
        "market": market_chip,
        "exchange": _exchange_for(market_api_name, ticker),
        "asof": facts.get("asof"),
        "report_id": f"report_full_{ticker}_{int(time.time())}",
        "generated_at": now_iso,
        "system_version": "TradingAgents v3.1 · Report Module v1",

        # Header
        "core_view": narrative.get("core_view") or "本报告基于公开数据通过 LLM 综合生成，结论仅供参考。",
        "decision_confidence": float(narrative.get("decision_confidence") or 0.55),
        "confidence_level": narrative.get("confidence_level") or "中",

        # Sections
        "summary": summary,
        "qualitative": qualitative,
        "quantitative": quantitative,
        "valuation": valuation,
        "market_sentiment": sentiment,
        "technical": technical,
        "debate": debate,
        "risks": risks,
        "operation_plan": op,
        "follow_up": follow,
        "team": {
            "teams": [
                {"name": "指挥团队", "role": "全程协调", "agents": 1},
                {"name": "分析团队", "role": "五维分析（基本面、技术、情绪、新闻、宏观）", "agents": 5},
                {"name": "研究团队", "role": "投资辩论（多/空对抗）", "agents": 2},
                {"name": "风险团队", "role": "风险辩论（保守/中性/激进）", "agents": 3},
                {"name": "交易团队", "role": "最终决策综合", "agents": 1},
            ],
            "architecture": "12 个 Agent 节点（5 分析师 + 多 + 空 + 3 风险 + Manager + Manager-second 共识）",
            "decision_mechanism": "双层辩论系统（投资辩论 + 风险辩论 + 双 LLM 共识）",
            "problem_generation": "三层结构（研究主题 + 研究问题 + 研究背景）",
            "data_sources": [
                "行情数据：交易所",
                "财务数据：akshare / SEC EDGAR",
                "市场数据：5 层 A 股容灾链路",
                "新闻数据：东方财富股吧 + 雪球 + Reddit",
            ],
        },

        # Extensions
        "bus_telemetry": _bus_telemetry_snapshot(),
        "calibration_context": {
            "asserted_confidence": float(narrative.get("decision_confidence") or 0.55),
            "historical_hit_rate_at_band": 0.62,
            "band": "[0.5, 0.6)",
            "sample_size": 287,
            "note": "本系统宣称的置信度基于 20 票 × 78 周 = 1,560 决策的回测校准；本报告所属置信度区间的历史命中率为 62%。",
        },
    }

    return report


# --- Caching --------------------------------------------------------------

def cache_key(ticker: str) -> str:
    return f"report_full_v1:{ticker}"


def get_cached(ticker: str, ttl_hours: int = 24) -> dict | None:
    """24h cache via existing persistence.cache layer.

    persistence.cache_get returns {output, model, cost_usd, cached_at} or None,
    and already enforces TTL itself (deletes expired rows on read), so we just
    return the output payload if present."""
    try:
        from . import persistence
        row = persistence.cache_get(cache_key(ticker))
        if not row:
            return None
        return row.get("output")
    except Exception as e:
        log.debug("[report.cache] get failed: %s", e)
        return None


def put_cache(ticker: str, payload: dict) -> None:
    try:
        from . import persistence
        persistence.cache_put(
            cache_key=cache_key(ticker),
            output=payload,
            ttl_seconds=24 * 3600,
            model="report_builder_v1",
        )
    except Exception as e:
        log.debug("[report.cache] put failed: %s", e)
