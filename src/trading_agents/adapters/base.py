"""MarketAdapter protocol.

The adapter is the *only* place where the system knows which API/data source
to call for a given market. The agent graph receives an adapter instance and
calls a fixed interface on it. To add a new market you:

1. Create a class implementing this Protocol.
2. Register it via `registry.register_adapter`.
3. Provide a matching `PromptPack`.
4. Provide a `RegimeProfile`.

Critically, every method takes an `asof` parameter. Backtests pass historical
dates and the adapter MUST NOT return data with `published_at > asof`. This
strict no-lookahead is enforced at the adapter boundary so individual analysts
can't accidentally violate it.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date, datetime

from ..core.regime import RegimeProfile
from ..core.types import (
    Fundamentals,
    MacroSnapshot,
    NewsItem,
    Quote,
    SentimentSummary,
    TechnicalSnapshot,
)


class AdapterError(RuntimeError):
    """Raised when adapter cannot fulfil a request (bad ticker, no data, etc.)."""


class MarketAdapter(ABC):
    """Pluggable per-market data source.

    Implementations:
        - MockAdapter (canned data, runs offline)
        - YahooUSEquityAdapter (free, US stocks)
        - FinnhubUSEquityAdapter (paid, broader)
        - CoinGeckoCryptoAdapter (free, crypto)
        - TushareAShareAdapter (paid, A-shares)
    """

    market: str
    regime: RegimeProfile

    # ---- core data accessors -------------------------------------------------

    @abstractmethod
    def get_quote(self, ticker: str, asof: datetime) -> Quote:
        ...

    @abstractmethod
    def get_fundamentals(self, ticker: str, asof: date) -> Fundamentals:
        ...

    @abstractmethod
    def get_news(
        self, ticker: str, asof: date, lookback_days: int = 7
    ) -> list[NewsItem]:
        """Return news with `published_at <= asof end-of-day`. No future leak."""

    @abstractmethod
    def get_sentiment(
        self, ticker: str, asof: date, lookback_days: int = 7
    ) -> SentimentSummary:
        ...

    @abstractmethod
    def get_technical(self, ticker: str, asof: date) -> TechnicalSnapshot:
        ...

    @abstractmethod
    def get_price_history(
        self, ticker: str, start: date, end: date
    ) -> list[Quote]:
        """Used by the backtester (its only data source)."""

    # ---- optional accessors (default no-op) ---------------------------------

    def get_macro(self, asof: date) -> MacroSnapshot | None:
        """Top-down macro context for the Macro analyst.

        Default: returns None, which causes the Macro analyst stage to be
        skipped. Adapters that have access to a macro data source (FRED
        via OpenBB, NBS via akshare, etc.) should override.

        We keep this OPTIONAL on purpose — macro adds latency and cost,
        and not every market / decision benefits from it. Markets where
        macro is essential (rates trades, FX) override; others default.
        """
        return None

    # ---- helpers (default implementations) -----------------------------------

    def assert_no_future(self, asof: date, observed: datetime) -> None:
        """Adapter implementations should call this on every news/social item
        before returning it, to keep lookahead bias impossible."""
        if observed.date() > asof:
            raise AdapterError(
                f"Lookahead bias: data dated {observed.date()} > asof {asof}"
            )
