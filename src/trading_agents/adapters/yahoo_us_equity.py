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
    NewsItem,
    Quote,
    SentimentSummary,
    TechnicalSnapshot,
)
from .base import AdapterError, MarketAdapter
from .mock import MockAdapter

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
        # Yahoo doesn't expose social sentiment directly; punt to mock.
        # Real impl would call StockTwits / Reddit / X API here.
        return self._fallback.get_sentiment(ticker, asof, lookback_days)

    def get_technical(self, ticker: str, asof: date) -> TechnicalSnapshot:
        if not self._available:
            return self._fallback.get_technical(ticker, asof)
        try:
            import pandas as pd

            hist = self._yf(ticker).history(
                period="1y",
                end=(asof + timedelta(days=1)).isoformat(),
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
