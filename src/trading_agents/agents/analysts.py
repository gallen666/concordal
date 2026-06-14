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


def _is_a_share_ticker(ticker: str) -> bool:
    """v45: A-share tickers are exactly 6 digits. yfinance / OpenBB sources
    on the bus don't have proper A-share coverage; they may return stale
    or wrong-stock data when queried with a 6-digit ticker. We skip the
    bus for A-share and go straight to the cn_equity adapter."""
    return bool(ticker and ticker.isdigit() and len(ticker) == 6)


def _via_bus(kind: NeedKind, params: dict, fallback):
    """Bus-first fetch. Try the UniversalDataBus; if it returns None
    (no source matched / all sources failed), fall back to the supplied
    direct-adapter callable. Either way the data flows; the bus path
    additionally records telemetry that surfaces at /v1/databus/telemetry.

    v45: skip the bus entirely for A-share tickers. The bus's only TECHNICAL
    source is yfinance which has no proper A-share coverage — it can
    silently return data from a wrong stock or a year-old window, which
    causes the LLM to narrate bearish analysis around fake numbers
    (verified bug: 688017 +15% but AI said SELL based on ¥114 from 2024).

    Wrapping in try/except so a buggy Source can never break a decision —
    the analyst gets the adapter's answer and the run continues."""
    ticker = params.get("ticker") if isinstance(params, dict) else None
    if ticker and _is_a_share_ticker(str(ticker)):
        # Skip bus for A-share — go straight to cn_equity adapter which
        # has proper Tencent/Sina fallback chain.
        return fallback()
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
    # v78: optional post-LLM validator. Signature: (state, raw_input, signals)
    # → signals. Runs once after JSON extraction, before the AnalystReport
    # is written. Used by the grounded Sentiment Analyst (v0.2.5-inspired)
    # to verify every `evidence.quote` exists in the input posts.
    validator: callable = None,
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
            # v78 grounded sentiment: run optional validator on the
            # (raw_input, signals) tuple. The validator may drop fabricated
            # evidence and/or downgrade the signal envelope. Catch all
            # exceptions — the decision must not crash on a validator bug.
            if validator is not None:
                try:
                    signals = validator(state, state.get(state_key), signals)
                except Exception as e:  # noqa: BLE001 — see comment above
                    if isinstance(signals, dict):
                        signals["_validator_error"] = str(e)[:200]
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


def _validate_sentiment_grounding(state: DecisionState, raw_sentiment, signals):
    """v78 — TauricResearch v0.2.5 inspired grounded-sentiment validator.

    Sentiment prompt now requires the LLM to emit ``evidence`` — a list of
    ``{theme, quote, source_id}`` triples where each ``quote`` must be a
    verbatim substring of some input post. This validator spot-checks
    every quote against the raw input corpus and:

      • drops items whose quote is not present (i.e. fabricated)
      • if ALL evidence is fabricated, downgrades intensity to "low",
        skew to 0, contrarian_flag to false — the LLM has nothing real
        to stand on, so its signal should not influence the manager
      • annotates ``signals["_grounded_validator"]`` with a status tag
        so /decision UI + /track-record audit log can surface it.

    The check is intentionally lenient on whitespace and uses a 30-char
    prefix match as a fallback so minor LLM normalisation (smart quotes,
    trimmed whitespace) doesn't false-positive as fabrication.
    """
    if not isinstance(signals, dict):
        return signals
    evidence = signals.get("evidence")
    if not isinstance(evidence, list):
        return signals

    # Build the input-post corpus from raw_sentiment. We try the common
    # field names; if the adapter returns something else, we degrade
    # gracefully and skip validation.
    posts = []
    if isinstance(raw_sentiment, dict):
        for key in ("posts", "sample_posts", "examples", "samples", "items"):
            v = raw_sentiment.get(key)
            if isinstance(v, list) and v:
                posts = v
                break
    corpus_parts = []
    for p in posts:
        if isinstance(p, dict):
            for key in ("text", "body", "content", "title", "post"):
                v = p.get(key)
                if isinstance(v, str) and v:
                    corpus_parts.append(v)
                    break
        elif isinstance(p, str):
            corpus_parts.append(p)
    corpus = " \n ".join(corpus_parts)

    if not corpus:
        signals["_grounded_validator"] = "no_input_corpus"
        return signals

    good, bad = [], []
    for item in evidence:
        if not isinstance(item, dict):
            continue
        quote = str(item.get("quote") or "").strip()
        if not quote:
            continue
        # Exact substring OR 30-char prefix substring (tolerant to LLM
        # smart-quote / whitespace normalisation).
        if quote in corpus or (len(quote) >= 30 and quote[:30] in corpus):
            good.append(item)
        else:
            bad.append(item)

    if bad:
        signals["evidence"] = good
        signals["_grounded_validator"] = (
            f"dropped_{len(bad)}_fabricated_of_{len(bad) + len(good)}"
        )
        if not good:
            # Every quote was fabricated. The LLM had no real evidence —
            # neutralise the signal so manager doesn't follow it.
            signals["intensity"] = "low"
            signals["skew"] = 0.0
            signals["contrarian_flag"] = False
    else:
        signals["_grounded_validator"] = "passed"

    return signals


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
    # v78: TauricResearch v0.2.5-inspired grounded sentiment — verifies
    # every LLM-emitted `evidence.quote` is verbatim-present in the raw
    # input posts. Fabricated quotes are dropped; if all evidence is
    # fabricated, the signal is neutralised so the manager ignores it.
    validator=_validate_sentiment_grounding,
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
