"""Register every real adapter as a UniversalDataBus Source.

Before this module ran, `bus.registered_sources()` returned exactly one
entry: `macro: [openbb]`. Every other Need type had zero handlers and
every analyst/adapter call bypassed the bus completely — calling adapter
methods directly. The bus was a decorative façade.

This module turns the bus into the actual spine:

  Need.QUOTE          → akshare → tencent → sina → xueqiu  (A-shares)
                      → yfinance                          (US equities)
                      → ccxt                              (crypto)
  Need.FUNDAMENTALS   → edgar (PIT, US) → yfinance (current snapshot)
  Need.NEWS           → reddit (US) | guba (A-share)
  Need.SENTIMENT      → reddit (US) | guba (A-share)
  Need.TECHNICAL      → adapter.get_technical (per-market)
  Need.OHLCV          → adapter.get_price_history
  Need.MACRO          → openbb / FRED                     (already registered)
  Need.CRYPTO_OHLCV   → ccxt
  Need.FACTOR         → alpha158_lite                     (Qlib-named factors)

Registration is best-effort: any import failure (missing optional dep,
network-blocked region, etc.) is logged and skipped — the bus survives
with whatever sources DID load. This is why every block below is wrapped
in a try/except ImportError.

Side effect imports the right way: this module is imported at the end of
ecosystem/__init__.py, which itself is imported by api/main.py at boot.
By the time the first decision runs, every available Source is wired.

Priority convention:
   10 — primary canonical source (e.g. yfinance for US equities)
   20 — first fallback (e.g. tencent for A-shares when akshare blocked)
   30 — second fallback
   40 — last resort (e.g. xueqiu)
   50 — degraded / partial data only
"""

from __future__ import annotations

import logging
from datetime import date as Date, datetime as DateTime

from .data_bus import Need, NeedKind, Source, bus

log = logging.getLogger(__name__)


# -------------------- Quote sources ----------------------------------------

def _register_a_share_quote_sources() -> None:
    """A-share quote.

    Primary path: CnEquityAdapter.get_quote() — already chains akshare →
    Tencent → Sina → Xueqiu internally and handles GBK + 成交量 unit
    conversion. We expose it as a single Source rather than registering
    each upstream individually, because the adapter encapsulates the
    routing logic (sh/sz/bj prefix etc) that we'd otherwise duplicate.
    The /v1/datasource/test endpoint already exposes per-upstream health."""
    try:
        from ..adapters.cn_equity import CnEquityAdapter
        adapter = CnEquityAdapter()
        bus.register(Source(
            project_slug="cn_equity_multi_source",
            handles=NeedKind.QUOTE,
            priority=10,
            handler=lambda n: (
                adapter.get_quote(n.params["ticker"], n.params["asof"])
                if str(n.params["ticker"])[:1].isdigit()  # A-share 6-digit code
                else None
            ),
            description="akshare → Tencent → Sina → Xueqiu chain (A-shares only)",
        ))
    except Exception as e:
        log.info("databus: cn_equity quote source not registered (%s)", e)


def _register_us_equity_sources() -> None:
    """US equities via yfinance — quote, OHLCV, fundamentals, technical."""
    try:
        from ..adapters.yahoo_us_equity import YahooUSEquityAdapter
        adapter = YahooUSEquityAdapter()
        bus.register(Source(
            project_slug="yfinance",
            handles=NeedKind.QUOTE,
            priority=15,  # tried after akshare for A-shares, but a fresh A-share
                          # ticker won't match yfinance's symbol space so it'll
                          # just raise — bus moves on. For US tickers this fires.
            handler=lambda n: adapter.get_quote(n.params["ticker"], n.params["asof"]),
            description="Yahoo Finance — US equities spot + day OHLC",
        ))
        from datetime import timedelta as _td
        bus.register(Source(
            project_slug="yfinance",
            handles=NeedKind.OHLCV,
            priority=10,
            handler=lambda n: adapter.get_price_history(
                n.params["ticker"],
                start=(n.params["asof"] - _td(days=n.params.get("lookback_days", 90))),
                end=n.params["asof"],
            ),
            description="Yahoo Finance OHLCV — daily bars (start..end)",
        ))
        bus.register(Source(
            project_slug="yfinance",
            handles=NeedKind.FUNDAMENTALS,
            priority=20,  # EDGAR fires first for historical asof; yfinance for today.
            handler=lambda n: adapter.get_fundamentals(n.params["ticker"], n.params["asof"]),
            description="Yahoo Finance fundamentals — current snapshot only",
        ))
        bus.register(Source(
            project_slug="yfinance",
            handles=NeedKind.TECHNICAL,
            priority=10,
            handler=lambda n: adapter.get_technical(n.params["ticker"], n.params["asof"]),
            description="Yahoo Finance — RSI/MA derived inline",
        ))
    except Exception as e:
        log.info("databus: yfinance sources not registered (%s)", e)


def _register_sec_edgar() -> None:
    """SEC EDGAR — PIT fundamentals with strict `filed <= asof` guard.
    Priority 10 so this beats yfinance for historical backtests."""
    try:
        from ..adapters.sec_edgar import get_pit_fundamentals
        bus.register(Source(
            project_slug="sec_edgar",
            handles=NeedKind.FUNDAMENTALS,
            priority=10,
            handler=lambda n: get_pit_fundamentals(n.params["ticker"], n.params["asof"]),
            description="SEC EDGAR XBRL — point-in-time, lookahead-safe",
        ))
    except Exception as e:
        log.info("databus: sec_edgar not registered (%s)", e)


def _register_crypto() -> None:
    """CCXT — crypto OHLCV via Binance public API. Best-effort: skips if
    ccxt isn't installed or the constructor raises."""
    try:
        from ..adapters.crypto_ccxt import CryptoCCXTAdapter
        adapter = CryptoCCXTAdapter()
        bus.register(Source(
            project_slug="ccxt",
            handles=NeedKind.CRYPTO_OHLCV,
            priority=10,
            handler=lambda n: adapter.get_quote(n.params["symbol"], n.params.get("asof")),
            description="CCXT → Binance public spot quote",
        ))
    except Exception as e:
        log.info("databus: ccxt not registered (%s)", e)


# -------------------- News + sentiment -------------------------------------

def _register_social() -> None:
    """Reddit + Guba (东方财富股吧) → news + sentiment.

    These two are MARKET-specific: Reddit for US tickers, Guba for A-shares.
    Both register against the same Need; the bus tries them in priority
    order, and an irrelevant source naturally returns empty/raises."""
    try:
        from ..adapters.social_reddit import fetch_news as reddit_news, fetch_sentiment as reddit_sent
        bus.register(Source(
            project_slug="reddit",
            handles=NeedKind.NEWS,
            priority=10,
            handler=lambda n: reddit_news(
                ticker=n.params["ticker"], asof=n.params["asof"],
                market=n.params.get("market", "us_equity"),
            ),
            description="Reddit r/wallstreetbets etc — public search JSON",
        ))
        bus.register(Source(
            project_slug="reddit",
            handles=NeedKind.SENTIMENT,
            priority=10,
            handler=lambda n: reddit_sent(
                ticker=n.params["ticker"], asof=n.params["asof"],
                market=n.params.get("market", "us_equity"),
            ),
            description="Reddit bull/bear regex over recent posts",
        ))
    except Exception as e:
        log.info("databus: reddit not registered (%s)", e)

    try:
        from ..adapters.social_guba import fetch_news as guba_news, fetch_sentiment as guba_sent
        bus.register(Source(
            project_slug="guba",
            handles=NeedKind.NEWS,
            priority=20,
            handler=lambda n: guba_news(
                ticker=n.params["ticker"], asof=n.params["asof"],
            ),
            description="东方财富股吧 — A-share retail thread titles",
        ))
        bus.register(Source(
            project_slug="guba",
            handles=NeedKind.SENTIMENT,
            priority=20,
            handler=lambda n: guba_sent(
                ticker=n.params["ticker"], asof=n.params["asof"],
            ),
            description="股吧 bilingual bull/bear regex scoring",
        ))
    except Exception as e:
        log.info("databus: guba not registered (%s)", e)


# -------------------- Factors ----------------------------------------------

def _register_factors() -> None:
    """Alpha158-lite — Qlib-naming-convention factor compute.

    Honest: this isn't actual Qlib (no `import qlib`), it's the same
    ~10 factors recomputed in pure Python so we ship without the heavy
    dependency. The bus composes: factor-fetching first asks the bus for
    OHLCV (which routes to yfinance / akshare based on ticker), then
    feeds those Quote bars into compute_factors."""
    try:
        from ..factors.alpha158_lite import compute_factors
        def _factor_handler(n: Need) -> dict | None:
            quotes = bus.fetch(Need(NeedKind.OHLCV, {
                "ticker": n.params["ticker"],
                "asof": n.params["asof"],
                "lookback_days": 90,
            }))
            if not quotes:
                return None
            return compute_factors(quotes)
        bus.register(Source(
            project_slug="alpha158_lite",
            handles=NeedKind.FACTOR,
            priority=10,
            handler=_factor_handler,
            description="Alpha158-lite — Qlib naming, pure-Python compute (OHLCV via bus)",
        ))
    except Exception as e:
        log.info("databus: alpha158_lite not registered (%s)", e)


# -------------------- Entry point ------------------------------------------

def register_all() -> dict[str, list[str]]:
    """Idempotent: register every available real adapter as a bus Source.

    Returns the same shape as `bus.registered_sources()` so callers (e.g.
    /v1/databus/status) can show what's wired right now."""
    _register_a_share_quote_sources()
    _register_us_equity_sources()
    _register_sec_edgar()
    _register_crypto()
    _register_social()
    _register_factors()
    return bus.registered_sources()


# Auto-register on import — making the bus useful from boot.
_registered = register_all()
log.info(
    "DataBus boot: %d need-types covered: %s",
    len(_registered),
    ", ".join(f"{k}={len(v)}" for k, v in _registered.items()),
)
