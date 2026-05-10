"""Yahoo Finance adapter (free, US equities).

Falls back to MockAdapter if `yfinance` isn't installed or the network
call fails - so demos keep running.

Install: pip install yfinance
Register: from .yahoo_us_equity import YahooUSEquityAdapter
          register_adapter("us_equity", YahooUSEquityAdapter)
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone

from ..core.regime import US_EQUITY
from ..core.types import (
    Fundamentals,
    MacroSnapshot,
    NewsItem,
    Quote,
    SentimentSummary,
    TechnicalSnapshot,
)
from ..factors import compute_factors
from .base import AdapterError, MarketAdapter
from .macro_openbb import fetch_macro_snapshot
from .mock import MockAdapter
from .sec_edgar import get_pit_fundamentals
from .social_reddit import (
    fetch_news as fetch_reddit_news,
    fetch_sentiment as fetch_reddit_sentiment,
)

log = logging.getLogger(__name__)


class YahooUSEquityAdapter(MarketAdapter):
    market = "us_equity"
    regime = US_EQUITY

    def __init__(self):
        try:
            import yfinance  # noqa: F401
            self._available = True
        except ImportError:
            log.warning("yfinance not installed; falling back to MockAdapter")
            self._available = False
        self._fallback = MockAdapter()

    # ---------------------------------------------------------------
    def _yf(self, ticker: str):
        import yfinance as yf
        return yf.Ticker(ticker)

    def get_quote(self, ticker: str, asof: datetime) -> Quote:
        if not self._available:
            return self._fallback.get_quote(ticker, asof)
        try:
            t = self._yf(ticker)
            hist = t.history(
                start=(asof.date() - timedelta(days=5)).isoformat(),
                end=(asof.date() + timedelta(days=1)).isoformat(),
                auto_adjust=False,
            )
            if hist.empty:
                raise AdapterError(f"No price data for {ticker} on {asof.date()}")
            row = hist.iloc[-1]
            return Quote(
                ticker=ticker,
                asof=asof,
                open=float(row["Open"]),
                high=float(row["High"]),
                low=float(row["Low"]),
                close=float(row["Close"]),
                volume=float(row["Volume"]),
            )
        except Exception as e:
            log.warning("Yahoo quote failed (%s); falling back to mock", e)
            return self._fallback.get_quote(ticker, asof)

    def get_fundamentals(self, ticker: str, asof: date) -> Fundamentals:
        # ---- backtest path: SEC EDGAR (point-in-time) -------------------
        # yfinance's .info is current-only — useless for historical asof.
        # For any asof older than ~7 days we hit SEC EDGAR's XBRL company
        # concept API, which is keyed by actual filing date and therefore
        # PIT-safe. If EDGAR doesn't have the ticker (foreign issuer, ETF,
        # SPAC, etc.) or the network call fails, fall through to a stub
        # so the analyst prompt knows to skip rather than hallucinate.
        if (date.today() - asof).days > 7:
            try:
                edgar = get_pit_fundamentals(ticker, asof)
                if edgar is not None:
                    return edgar
            except Exception as e:
                log.warning("EDGAR PIT fetch failed for %s @ %s: %s", ticker, asof, e)
            return Fundamentals(
                ticker=ticker,
                asof=asof,
                notes=(
                    f"PIT fundamentals via SEC EDGAR not available for {ticker} "
                    f"as of {asof}. Treat this analyst slot as intentionally "
                    "empty — do not fabricate metrics."
                ),
            )
        if not self._available:
            return self._fallback.get_fundamentals(ticker, asof)
        try:
            info = self._yf(ticker).info or {}
            # Detect "yfinance succeeded but returned an empty/placeholder
            # info dict" — this happens for tickers Yahoo doesn't recognize
            # (typo, non-US code like an A-share '301308', delisted, etc.).
            # If we don't catch it here, all fields below become None and
            # the analyst LLM hallucinates plausible-looking nonsense from
            # the empty record. Better to fail loudly so the API layer
            # can return a clear error.
            #
            # We require AT LEAST ONE of (marketCap, totalRevenue, trailingPE)
            # to be present; legitimate US equities virtually always have
            # at least one of these populated.
            looks_real = any(
                info.get(k) is not None
                for k in ("marketCap", "totalRevenue", "trailingPE", "regularMarketPrice")
            )
            if not looks_real:
                raise AdapterError(
                    f"yfinance returned no fundamentals for '{ticker}'. "
                    "Likely not a US equity (e.g. A-share / HK / crypto codes "
                    "are not supported on this market adapter)."
                )
            return Fundamentals(
                ticker=ticker,
                asof=asof,
                market_cap=info.get("marketCap"),
                pe_ratio=info.get("trailingPE"),
                pb_ratio=info.get("priceToBook"),
                eps_ttm=info.get("trailingEps"),
                revenue_ttm=info.get("totalRevenue"),
                revenue_growth_yoy=info.get("revenueGrowth"),
                gross_margin=info.get("grossMargins"),
                operating_margin=info.get("operatingMargins"),
                net_margin=info.get("profitMargins"),
                free_cash_flow_ttm=info.get("freeCashflow"),
                debt_to_equity=info.get("debtToEquity"),
                notes=info.get("longBusinessSummary"),
            )
        except AdapterError:
            # Empty-data is a hard error — propagate so the API can show
            # a user-facing "ticker not found" message instead of falling
            # back to mock data the user definitely doesn't want.
            raise
        except Exception as e:
            log.warning("Yahoo fundamentals failed (%s); falling back to mock", e)
            return self._fallback.get_fundamentals(ticker, asof)

    def get_news(
        self, ticker: str, asof: date, lookback_days: int = 7
    ) -> list[NewsItem]:
        # Reddit is our primary news source: real timestamps, no API key,
        # better signal than yfinance's "current top stories" (which doesn't
        # honour asof at all). Yfinance is the secondary fallback for the
        # rare ticker that Reddit users don't talk about.
        try:
            reddit_items = fetch_reddit_news(
                ticker, asof, market="us_equity", lookback_days=lookback_days,
            )
            if reddit_items:
                return reddit_items
        except Exception as e:
            log.debug("Reddit news fetch failed for %s: %s", ticker, e)

        if not self._available:
            return self._fallback.get_news(ticker, asof, lookback_days)
        try:
            raw = self._yf(ticker).news or []
            items: list[NewsItem] = []
            cutoff = datetime.combine(
                asof - timedelta(days=lookback_days),
                datetime.min.time(),
                tzinfo=timezone.utc,
            )
            asof_end = datetime.combine(
                asof, datetime.max.time(), tzinfo=timezone.utc
            )
            for r in raw:
                ts = r.get("providerPublishTime")
                if not ts:
                    continue
                published = datetime.fromtimestamp(ts, tz=timezone.utc)
                if published > asof_end:
                    continue  # strict no-lookahead
                if published < cutoff:
                    continue
                items.append(
                    NewsItem(
                        ticker=ticker,
                        headline=r.get("title", ""),
                        summary=r.get("summary", "") or r.get("title", ""),
                        source=r.get("publisher", "yahoo"),
                        url=r.get("link"),
                        published_at=published,
                    )
                )
            return items or self._fallback.get_news(ticker, asof, lookback_days)
        except Exception as e:
            log.warning("Yahoo news failed (%s)", e)
            return self._fallback.get_news(ticker, asof, lookback_days)

    def get_sentiment(
        self, ticker: str, asof: date, lookback_days: int = 7
    ) -> SentimentSummary:
        # Reddit is our primary sentiment source — wallstreetbets / investing /
        # stocks / SecurityAnalysis. Free, no API key, mention count + skew
        # actually correlate with retail interest. Falls back to mock if
        # Reddit returns nothing (unknown ticker, network issue, etc.).
        try:
            s = fetch_reddit_sentiment(
                ticker, asof, market="us_equity", lookback_days=lookback_days,
            )
            if s is not None:
                return s
        except Exception as e:
            log.debug("Reddit sentiment fetch failed for %s: %s", ticker, e)
        return self._fallback.get_sentiment(ticker, asof, lookback_days)

    def get_technical(self, ticker: str, asof: date) -> TechnicalSnapshot:
        if not self._available:
            return self._fallback.get_technical(ticker, asof)
        try:
            import pandas as pd

            # IMPORTANT: pass explicit start/end. Using `period="1y"` together
            # with `end=...` was a lookahead trap — yfinance silently ignores
            # `end` when `period` is set, so technicals were always trailing
            # 1y ending today (not ending at asof). For a 2023 backtest,
            # SMA200 / RSI14 would reflect 2026 prices.
            start = (asof - timedelta(days=400)).isoformat()
            end = (asof + timedelta(days=1)).isoformat()
            hist = self._yf(ticker).history(
                start=start,
                end=end,
                auto_adjust=False,
            )
            if hist.empty:
                return self._fallback.get_technical(ticker, asof)
            close = hist["Close"]
            last = float(close.iloc[-1])
            sma20 = float(close.rolling(20).mean().iloc[-1])
            sma50 = float(close.rolling(50).mean().iloc[-1])
            sma200 = float(close.rolling(200).mean().iloc[-1]) if len(close) >= 200 else None
            ema12 = float(close.ewm(span=12).mean().iloc[-1])
            ema26 = float(close.ewm(span=26).mean().iloc[-1])
            macd = ema12 - ema26
            signal = float(
                pd.Series(close.ewm(span=12).mean() - close.ewm(span=26).mean())
                .ewm(span=9).mean().iloc[-1]
            )
            delta = close.diff()
            up = delta.clip(lower=0).rolling(14).mean()
            down = (-delta.clip(upper=0)).rolling(14).mean()
            rs = (up / down).iloc[-1]
            rsi = float(100 - 100 / (1 + rs)) if rs else 50.0

            # Alpha158-lite quant factors — computed from the full bar
            # series so the technical analyst can reference momentum /
            # volatility / mean-reversion / pattern signals beyond the
            # classic SMA/RSI vocabulary. Uses only OHLCV; no extra deps.
            factor_quotes = [
                Quote(
                    ticker=ticker,
                    asof=ts.to_pydatetime() if hasattr(ts, "to_pydatetime") else ts,
                    open=float(row["Open"]),
                    high=float(row["High"]),
                    low=float(row["Low"]),
                    close=float(row["Close"]),
                    volume=float(row["Volume"]),
                )
                for ts, row in hist.iterrows()
            ]
            try:
                factors = compute_factors(factor_quotes)
            except Exception as e:
                log.debug("compute_factors failed for %s: %s", ticker, e)
                factors = {}

            return TechnicalSnapshot(
                ticker=ticker,
                asof=asof,
                last_close=last,
                sma_20=sma20,
                sma_50=sma50,
                sma_200=sma200,
                ema_12=ema12,
                ema_26=ema26,
                macd=macd,
                macd_signal=signal,
                rsi_14=rsi,
                factors=factors,
                notes=(
                    f"Trend: {'up' if last > sma50 else 'down'} vs SMA50; "
                    f"RSI={rsi:.1f}; MACD={macd:.2f}."
                ),
            )
        except Exception as e:
            log.warning("Yahoo technical failed (%s)", e)
            return self._fallback.get_technical(ticker, asof)

    def get_price_history(
        self, ticker: str, start: date, end: date
    ) -> list[Quote]:
        if not self._available:
            return self._fallback.get_price_history(ticker, start, end)
        try:
            hist = self._yf(ticker).history(
                start=start.isoformat(),
                end=(end + timedelta(days=1)).isoformat(),
                auto_adjust=False,
            )
            out: list[Quote] = []
            for ts, row in hist.iterrows():
                ts_py = ts.to_pydatetime()
                if ts_py.tzinfo is None:
                    ts_py = ts_py.replace(tzinfo=timezone.utc)
                out.append(
                    Quote(
                        ticker=ticker,
                        asof=ts_py,
                        open=float(row["Open"]),
                        high=float(row["High"]),
                        low=float(row["Low"]),
                        close=float(row["Close"]),
                        volume=float(row["Volume"]),
                    )
                )
            return out
        except Exception as e:
            log.warning("Yahoo price history failed (%s)", e)
            return self._fallback.get_price_history(ticker, start, end)

    # ---- macro context (OpenBB / FRED) -----------------------------------

    def get_macro(self, asof: date) -> MacroSnapshot | None:
        """Top-down US macro snapshot.

        Tries OpenBB first, falls back to direct FRED REST. Returns None
        if neither backend is available — the pipeline will then skip
        the Macro analyst stage gracefully.
        """
        return fetch_macro_snapshot(asof, region="US")
