"""MockAdapter - deterministic canned data so the whole graph is runnable
without any API keys. Used in tests, demos, and CI.

The data is intentionally reproducible (seeded by ticker hash) and the price
series is a synthetic geometric brownian motion so the backtester has
something coherent to chew on."""

from __future__ import annotations

import hashlib
import math
import random
from datetime import date, datetime, timedelta, timezone

from ..core.regime import US_EQUITY
from ..core.types import (
    Fundamentals,
    NewsItem,
    Quote,
    SentimentSummary,
    TechnicalSnapshot,
)
from .base import MarketAdapter


def _seed_for(ticker: str) -> int:
    return int.from_bytes(hashlib.md5(ticker.encode()).digest()[:4], "big")


def _gbm_close(seed: int, days: int, start: float = 100.0) -> list[float]:
    rng = random.Random(seed)
    prices = [start]
    mu = 0.0003       # ~7.5% annual drift
    sigma = 0.018     # ~28% annual vol
    for _ in range(days - 1):
        z = rng.gauss(0.0, 1.0)
        prices.append(prices[-1] * math.exp(mu - 0.5 * sigma * sigma + sigma * z))
    return prices


class MockAdapter(MarketAdapter):
    market = "mock"
    regime = US_EQUITY

    def __init__(self, history_days: int = 400):
        self.history_days = history_days
        self._cache: dict[str, list[float]] = {}

    # ---- price utilities -----------------------------------------------------

    def _series(self, ticker: str) -> list[float]:
        if ticker not in self._cache:
            self._cache[ticker] = _gbm_close(_seed_for(ticker), self.history_days)
        return self._cache[ticker]

    def _close_on(self, ticker: str, day: date) -> float:
        series = self._series(ticker)
        # day index: day 0 == today() - history_days, day -1 == today
        offset = (day - (date.today() - timedelta(days=self.history_days))).days
        idx = max(0, min(len(series) - 1, offset))
        return series[idx]

    # ---- adapter interface ---------------------------------------------------

    def get_quote(self, ticker: str, asof: datetime) -> Quote:
        c = self._close_on(ticker, asof.date())
        return Quote(
            ticker=ticker,
            asof=asof,
            open=c * 0.998,
            high=c * 1.012,
            low=c * 0.989,
            close=c,
            volume=1_500_000,
        )

    def get_fundamentals(self, ticker: str, asof: date) -> Fundamentals:
        rng = random.Random(_seed_for(ticker) ^ asof.toordinal())
        return Fundamentals(
            ticker=ticker,
            asof=asof,
            market_cap=rng.uniform(5e9, 3e12),
            pe_ratio=rng.uniform(8, 45),
            pb_ratio=rng.uniform(0.5, 18),
            eps_ttm=rng.uniform(0.5, 12),
            revenue_ttm=rng.uniform(1e9, 3e11),
            revenue_growth_yoy=rng.uniform(-0.10, 0.45),
            gross_margin=rng.uniform(0.20, 0.65),
            operating_margin=rng.uniform(0.05, 0.35),
            net_margin=rng.uniform(0.03, 0.30),
            free_cash_flow_ttm=rng.uniform(5e8, 8e10),
            debt_to_equity=rng.uniform(0.0, 2.5),
            notes=(
                f"{ticker} (mock fundamentals): margins reasonable, "
                f"growth in mid-teens YoY."
            ),
        )

    def get_news(
        self, ticker: str, asof: date, lookback_days: int = 7
    ) -> list[NewsItem]:
        rng = random.Random(_seed_for(ticker) ^ asof.toordinal() ^ 0xA1)
        templates = [
            ("{ticker} beats Q earnings, guidance raised", 0.6),
            ("{ticker} faces antitrust scrutiny in EU", -0.5),
            ("Analysts upgrade {ticker} citing AI tailwinds", 0.4),
            ("{ticker} CFO unexpectedly resigns", -0.6),
            ("{ticker} announces $20B buyback", 0.5),
            ("Supply-chain disruption hits {ticker} margins", -0.4),
            ("{ticker} unveils new product line, mixed reception", 0.0),
        ]
        items: list[NewsItem] = []
        for i in range(rng.randint(3, 6)):
            head, sent = rng.choice(templates)
            offset_days = rng.randint(0, lookback_days - 1)
            published = datetime.combine(
                asof - timedelta(days=offset_days),
                datetime.min.time(),
                tzinfo=timezone.utc,
            ) + timedelta(hours=rng.randint(0, 23))
            self.assert_no_future(asof, published)
            items.append(
                NewsItem(
                    ticker=ticker,
                    headline=head.format(ticker=ticker),
                    summary=f"Mock summary #{i} for {ticker}",
                    source="mock-newsroom",
                    published_at=published,
                    sentiment_score=sent + rng.uniform(-0.1, 0.1),
                )
            )
        return sorted(items, key=lambda n: n.published_at, reverse=True)

    def get_sentiment(
        self, ticker: str, asof: date, lookback_days: int = 7
    ) -> SentimentSummary:
        rng = random.Random(_seed_for(ticker) ^ asof.toordinal() ^ 0xB2)
        bull = rng.uniform(0.25, 0.75)
        bear = max(0.0, min(1.0 - bull, rng.uniform(0.10, 0.50)))
        return SentimentSummary(
            ticker=ticker,
            asof=asof,
            lookback_days=lookback_days,
            mention_count=rng.randint(80, 4000),
            bullish_share=bull,
            bearish_share=bear,
            top_themes=rng.sample(
                ["earnings", "AI", "guidance", "macro", "product", "valuation"],
                k=3,
            ),
            notable_posts=[
                f"{ticker} to the moon, fundamentals strong",
                f"Concerned about {ticker}'s capex trajectory",
            ],
        )

    def get_technical(self, ticker: str, asof: date) -> TechnicalSnapshot:
        s = self._series(ticker)
        offset = (asof - (date.today() - timedelta(days=self.history_days))).days
        idx = max(0, min(len(s) - 1, offset))
        last = s[idx]
        sma20 = sum(s[max(0, idx - 19) : idx + 1]) / max(1, min(20, idx + 1))
        sma50 = sum(s[max(0, idx - 49) : idx + 1]) / max(1, min(50, idx + 1))
        sma200 = sum(s[max(0, idx - 199) : idx + 1]) / max(1, min(200, idx + 1))
        # crude RSI proxy
        gains = sum(max(0, s[i] - s[i - 1]) for i in range(max(1, idx - 13), idx + 1))
        losses = sum(max(0, s[i - 1] - s[i]) for i in range(max(1, idx - 13), idx + 1))
        rs = gains / losses if losses else 0
        rsi = 100 - 100 / (1 + rs) if rs else 50.0
        return TechnicalSnapshot(
            ticker=ticker,
            asof=asof,
            last_close=last,
            sma_20=sma20,
            sma_50=sma50,
            sma_200=sma200,
            macd=sma20 - sma50,
            macd_signal=sma20 - sma50,
            rsi_14=rsi,
            notes=(
                f"Trend: {'up' if last > sma50 else 'down'} vs 50d. "
                f"RSI={rsi:.1f}."
            ),
        )

    def get_price_history(
        self, ticker: str, start: date, end: date
    ) -> list[Quote]:
        out: list[Quote] = []
        d = start
        while d <= end:
            if d.weekday() < 5:  # mon-fri
                ts = datetime.combine(d, datetime.min.time(), tzinfo=timezone.utc)
                out.append(self.get_quote(ticker, ts))
            d += timedelta(days=1)
        return out
