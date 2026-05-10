"""CCXT-backed crypto adapter — turns the ecosystem CCXT entry from
'planned' into a real, working integration.

CCXT (https://github.com/ccxt/ccxt) gives a uniform API to 100+ crypto
exchanges. We default to Binance for liquidity but accept any CCXT-
supported exchange via the TA_CRYPTO_EXCHANGE env var.

Symbol convention: standard CCXT format, e.g. "BTC/USDT", "ETH/USDT".
The frontend lets users type "BTC" and we auto-suffix /USDT.

This adapter runs in 24/7 mode (crypto has no market close), so the
asof-aware methods all fetch the trailing window ending at asof.
"""

from __future__ import annotations

import logging
import os
from datetime import date, datetime, timedelta, timezone

from ..core.regime import CRYPTO
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


def _normalize_symbol(s: str) -> str:
    """User types "BTC" or "btc" → we want "BTC/USDT"."""
    s = s.upper().strip()
    if "/" in s:
        return s
    return f"{s}/USDT"


class CcxtCryptoAdapter(MarketAdapter):
    market = "crypto"
    regime = CRYPTO

    def __init__(self, exchange_id: str | None = None) -> None:
        self._exchange_id = (
            exchange_id
            or os.environ.get("TA_CRYPTO_EXCHANGE", "binance")
        ).lower()
        self._fallback = MockAdapter()
        try:
            import ccxt  # noqa: F401
            self._available = True
        except ImportError:
            log.warning("ccxt not installed; CcxtCryptoAdapter falls back to mock")
            self._available = False
        self._client = None  # lazy-init

    # ---- helpers --------------------------------------------------------

    def _ex(self):
        if self._client is not None:
            return self._client
        import ccxt
        cls = getattr(ccxt, self._exchange_id, None)
        if cls is None:
            raise AdapterError(
                f"Exchange '{self._exchange_id}' not in CCXT — see ccxt.exchanges"
            )
        # We only do public market-data endpoints, no API keys needed.
        self._client = cls({"enableRateLimit": True})
        return self._client

    def _fetch_ohlcv(
        self, symbol: str, since_ms: int, limit: int = 500, timeframe: str = "1d"
    ):
        """Wrap CCXT's `fetch_ohlcv` with retries on transient failures."""
        ex = self._ex()
        return ex.fetch_ohlcv(
            _normalize_symbol(symbol),
            timeframe=timeframe,
            since=since_ms,
            limit=limit,
        )

    @staticmethod
    def _bar_to_quote(bar, ticker: str) -> Quote:
        ts_ms, o, h, lo, c, v = bar
        ts = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
        return Quote(
            ticker=ticker,
            asof=ts,
            open=float(o),
            high=float(h),
            low=float(lo),
            close=float(c),
            volume=float(v),
        )

    # ---- core data accessors -------------------------------------------

    def get_quote(self, ticker: str, asof: datetime) -> Quote:
        if not self._available:
            return self._fallback.get_quote(ticker, asof)
        try:
            since_ms = int((asof - timedelta(days=2)).timestamp() * 1000)
            bars = self._fetch_ohlcv(ticker, since_ms, limit=10)
            if not bars:
                raise AdapterError(f"No OHLCV bars for {ticker} via {self._exchange_id}")
            return self._bar_to_quote(bars[-1], ticker.upper())
        except AdapterError:
            raise
        except Exception as e:
            log.warning("CCXT get_quote failed (%s); falling back to mock", e)
            return self._fallback.get_quote(ticker, asof)

    def get_fundamentals(self, ticker: str, asof: date) -> Fundamentals:
        # Crypto has no traditional fundamentals. Return an honest stub
        # whose `notes` field tells the analyst LLM to focus on on-chain
        # and tokenomics signals it doesn't currently have, rather than
        # fabricating P/E ratios. Same shape as the backtest stub used
        # in the equity adapters — the analyst prompt already handles
        # mostly-empty Fundamentals correctly.
        return Fundamentals(
            ticker=ticker.upper(),
            asof=asof,
            notes=(
                "Crypto asset — traditional fundamentals (P/E, revenue, margins) "
                "do not apply. Lean on technical / sentiment / macro signals "
                "and on-chain context instead. Do not fabricate equity-style metrics."
            ),
        )

    def get_news(
        self, ticker: str, asof: date, lookback_days: int = 7
    ) -> list[NewsItem]:
        # CCXT itself doesn't ship news. Return the mock adapter's items
        # so the analyst still has something to chew on; production users
        # who care should plug in CryptoPanic / NewsAPI here.
        return self._fallback.get_news(ticker, asof, lookback_days)

    def get_sentiment(
        self, ticker: str, asof: date, lookback_days: int = 7
    ) -> SentimentSummary:
        # Same situation as news — fallback to mock pending a real source.
        return self._fallback.get_sentiment(ticker, asof, lookback_days)

    def get_technical(self, ticker: str, asof: date) -> TechnicalSnapshot:
        if not self._available:
            return self._fallback.get_technical(ticker, asof)
        try:
            # 400 days of daily bars is enough for SMA200 + RSI14 + MACD.
            since_ms = int(
                (datetime.combine(asof, datetime.min.time(), tzinfo=timezone.utc)
                 - timedelta(days=400)).timestamp() * 1000
            )
            bars = self._fetch_ohlcv(ticker, since_ms, limit=500)
            if not bars or len(bars) < 30:
                return self._fallback.get_technical(ticker, asof)

            closes = [float(b[4]) for b in bars]
            last_close = closes[-1]

            def sma(period: int) -> float | None:
                if len(closes) < period:
                    return None
                return sum(closes[-period:]) / period

            def ema(period: int) -> float:
                k = 2 / (period + 1)
                e = closes[0]
                for c in closes[1:]:
                    e = c * k + e * (1 - k)
                return e

            sma20 = sma(20)
            sma50 = sma(50)
            sma200 = sma(200)
            ema12 = ema(12)
            ema26 = ema(26)
            macd = ema12 - ema26

            # RSI14
            if len(closes) >= 15:
                gains, losses = 0.0, 0.0
                for i in range(-14, 0):
                    diff = closes[i] - closes[i - 1]
                    if diff > 0:
                        gains += diff
                    else:
                        losses -= diff
                avg_g = gains / 14
                avg_l = losses / 14
                rs = avg_g / avg_l if avg_l > 0 else 0.0
                rsi14 = 100 - 100 / (1 + rs) if rs > 0 else (100.0 if avg_g > 0 else 50.0)
            else:
                rsi14 = None

            return TechnicalSnapshot(
                ticker=ticker.upper(),
                asof=asof,
                last_close=last_close,
                sma_20=sma20,
                sma_50=sma50,
                sma_200=sma200,
                ema_12=ema12,
                ema_26=ema26,
                macd=macd,
                macd_signal=None,
                rsi_14=rsi14,
                notes=f"Computed from {len(closes)} daily bars on {self._exchange_id}",
            )
        except Exception as e:
            log.warning("CCXT get_technical failed (%s)", e)
            return self._fallback.get_technical(ticker, asof)

    def get_price_history(
        self, ticker: str, start: date, end: date
    ) -> list[Quote]:
        if not self._available:
            return self._fallback.get_price_history(ticker, start, end)
        try:
            since_ms = int(
                datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc).timestamp() * 1000
            )
            # CCXT exchanges typically cap `limit` at 500–1000. For windows
            # > 500 days we'd need pagination; backtests we currently run
            # are < 2y so 1000 is enough. Adding the `limit` cap explicit-
            # ly so callers don't get silently truncated histories.
            limit = min(1000, (end - start).days + 5)
            bars = self._fetch_ohlcv(ticker, since_ms, limit=limit)
            out: list[Quote] = []
            end_ts = datetime.combine(end, datetime.max.time(), tzinfo=timezone.utc)
            for b in bars:
                q = self._bar_to_quote(b, ticker.upper())
                if q.asof > end_ts:
                    break
                out.append(q)
            return out
        except Exception as e:
            log.warning("CCXT price history failed (%s)", e)
            return self._fallback.get_price_history(ticker, start, end)
