"""The four analyst agents (data gathering stage).

Each runs the relevant adapter call, hands the structured fact object to the
LLM with the role-specific prompt, and emits an `AnalystReport` whose `body`
is free-form natural language but whose `signals` is a strict JSON dict for
downstream consumption.
"""

from __future__ import annotations

from datetime import datetime, timezone

from ..adapters.base import MarketAdapter
from ..core.state import DecisionState
from ..core.types import AnalystReport
from ..ecosystem.data_bus import Need, NeedKind, bus
from ..llm.observability import current_span
from ..llm.router import LLMRouter, Tier, extract_json
from ..prompts.base import PromptPack


def _via_bus(kind: NeedKind, params: dict, fallback):
    """Bus-first fetch. Try the UniversalDataBus; if it returns None
    (no source matched / all sources failed), fall back to the supplied
    direct-adapter callable. Either way the data flows; the bus path
    additionally records telemetry that surfaces at /v1/databus/telemetry.

    Wrapping in try/except so a buggy Source can never break a decision —
    the analyst gets the adapter's answer and the run continues."""
    try:
        result = bus.fetch(Need(kind, params))
        if result is not None:
            return result
    except Exception:
        pass
    return fallback()


def _make_analyst(
    role: str,
    system_attr: str,
    fetch: callable,
    state_key: str,
    state_report_key: str,
    tier: Tier = Tier.MID,
):
    def run(state: DecisionState, *, adapter: MarketAdapter, pack: PromptPack, llm: LLMRouter) -> DecisionState:
        with current_span(
            f"analyst.{role}",
            ticker=state.get("ticker"),
            asof=str(state.get("asof")),
            tier=tier.value,
        ):
            if state_key not in state:
                state[state_key] = fetch(adapter, state)  # type: ignore[index]
            rendered = pack.render_analyst_user(role, state)
            resp = llm.complete(
                tier=tier,
                system=getattr(pack, system_attr),
                user=rendered,
            )
            signals = extract_json(resp.text) or {}
            # Some models (notably Gemini 2.5) wrap the dict in another
            # "signals" key, producing {"signals": {...real keys...}}. Unwrap
            # one layer if we detect that exact shape.
            if (
                isinstance(signals, dict)
                and len(signals) == 1
                and "signals" in signals
                and isinstance(signals["signals"], dict)
            ):
                signals = signals["signals"]
            state[state_report_key] = AnalystReport(  # type: ignore[index]
                analyst=role,
                ticker=state["ticker"],
                asof=state["asof"],
                body=resp.text,
                signals=signals,
            )
            state.setdefault("usage", []).append(resp.usage)  # type: ignore[index]
            return state

    return run


# ---- per-analyst fetchers ----------------------------------------------------


def _fetch_fundamentals(a: MarketAdapter, s: DecisionState):
    """Bus-first: tries sec_edgar (PIT priority 10) → yfinance (current,
    priority 20) → falls through to the adapter on miss. The adapter is
    still in the picture as a defence-in-depth net."""
    return _via_bus(
        NeedKind.FUNDAMENTALS,
        {"ticker": s["ticker"], "asof": s["asof"]},
        lambda: a.get_fundamentals(s["ticker"], s["asof"]),
    )


def _fetch_sentiment(a: MarketAdapter, s: DecisionState):
    """Bus-first: reddit (US, prio 10) → guba (A-share, prio 20). The
    bus picks the right one because irrelevant sources just return empty/
    raise. Falls through to adapter on miss."""
    return _via_bus(
        NeedKind.SENTIMENT,
        {"ticker": s["ticker"], "asof": s["asof"], "market": s.get("market", "us_equity")},
        lambda: a.get_sentiment(s["ticker"], s["asof"]),
    )


def _fetch_news(a: MarketAdapter, s: DecisionState):
    """Bus-first: reddit → guba. See _fetch_sentiment for routing notes."""
    return _via_bus(
        NeedKind.NEWS,
        {"ticker": s["ticker"], "asof": s["asof"], "market": s.get("market", "us_equity")},
        lambda: a.get_news(s["ticker"], s["asof"]),
    )


def _fetch_technical(a: MarketAdapter, s: DecisionState):
    """Bus-first: yfinance technical. Adapter fallback covers A-share +
    crypto markets where the bus has no Source yet."""
    return _via_bus(
        NeedKind.TECHNICAL,
        {"ticker": s["ticker"], "asof": s["asof"]},
        lambda: a.get_technical(s["ticker"], s["asof"]),
    )


def _fetch_macro(a: MarketAdapter, s: DecisionState):
    """Bus-first: openbb→FRED. Returns None if no source has macro for
    this asof; the macro_node treats None as 'skip this stage'."""
    try:
        result = bus.fetch(Need(NeedKind.MACRO, {"asof": s["asof"], "region": "US"}))
        if result is not None:
            return result
    except Exception:
        pass
    # Adapter fallback — most adapters return None for macro, which is
    # fine because the macro_node is opportunistic.
    try:
        return a.get_macro(s["asof"])
    except Exception:
        return None


fundamentals_node = _make_analyst(
    "fundamentals", "fundamentals_analyst_system", _fetch_fundamentals,
    "fundamentals", "fundamentals_report",
)
sentiment_node = _make_analyst(
    "sentiment", "sentiment_analyst_system", _fetch_sentiment,
    "sentiment", "sentiment_report",
)
news_node = _make_analyst(
    "news", "news_analyst_system", _fetch_news,
    "news", "news_report",
)
technical_node = _make_analyst(
    "technical", "technical_analyst_system", _fetch_technical,
    "technical", "technical_report",
)


def macro_node(
    state: DecisionState,
    *,
    adapter: MarketAdapter,
    pack: PromptPack,
    llm: LLMRouter,
) -> DecisionState:
    """Macro analyst — runs only if the adapter returned a MacroSnapshot.

    When the adapter has no macro data (no OpenBB, no FRED key, etc.),
    this stage is a no-op and the rest of the pipeline carries on with
    just the four micro-level analysts. We treat macro as enrichment,
    not as a blocker.
    """
    with current_span(
        "analyst.macro",
        ticker=state.get("ticker"),
        asof=str(state.get("asof")),
    ):
        if "macro" not in state:
            state["macro"] = _fetch_macro(adapter, state)  # type: ignore[index]
        if not state.get("macro"):
            # No macro context available — skip without writing a report.
            return state
        if not getattr(pack, "macro_analyst_system", None):
            # Pack hasn't defined a macro prompt — skip.
            return state
        rendered = pack.render_analyst_user("macro", state)
        resp = llm.complete(
            tier=Tier.MID,
            system=pack.macro_analyst_system,  # type: ignore[attr-defined]
            user=rendered,
        )
        signals = extract_json(resp.text) or {}
        if (
            isinstance(signals, dict)
            and len(signals) == 1
            and "signals" in signals
            and isinstance(signals["signals"], dict)
        ):
            signals = signals["signals"]
        state["macro_report"] = AnalystReport(  # type: ignore[index]
            analyst="macro",
            ticker=state["ticker"],
            asof=state["asof"],
            body=resp.text,
            signals=signals,
        )
        state.setdefault("usage", []).append(resp.usage)  # type: ignore[index]
        return state


def quote_node(state: DecisionState, *, adapter: MarketAdapter, **_) -> DecisionState:
    """Cheap leaf node: fetch latest quote so backtester / UI can use it.

    Bus-first: routes through `cn_equity_multi_source` (A-shares — akshare
    → Tencent → Sina → Xueqiu chain) and `yfinance` (US equities). Adapter
    fallback covers any market the bus doesn't have a Source for."""
    asof = state["asof"]
    ts = datetime.combine(asof, datetime.min.time(), tzinfo=timezone.utc)
    state["quote"] = _via_bus(
        NeedKind.QUOTE,
        {"ticker": state["ticker"], "asof": ts, "market": state.get("market", "auto")},
        lambda: adapter.get_quote(state["ticker"], ts),
    )
    return state
