"""Lazy registry so we don't import every provider just to use one."""

from __future__ import annotations

from typing import Callable

from .base import MarketAdapter

_FACTORIES: dict[str, Callable[[], MarketAdapter]] = {}


def register_adapter(name: str, factory: Callable[[], MarketAdapter]) -> None:
    _FACTORIES[name] = factory


def get_adapter(name: str) -> MarketAdapter:
    if name not in _FACTORIES:
        raise KeyError(
            f"No adapter registered for '{name}'. Known: {list(_FACTORIES)}"
        )
    return _FACTORIES[name]()


# ---- bootstrap built-in adapters ------------------------------------------

def _register_builtins() -> None:
    # Imported lazily so missing optional deps don't break the world.
    from .mock import MockAdapter
    from .yahoo_us_equity import YahooUSEquityAdapter
    from .cn_equity import CnEquityAdapter

    register_adapter("mock", MockAdapter)
    # Real US-equity data via Yahoo Finance. Falls back to MockAdapter
    # automatically if yfinance can't reach Yahoo (rate limit, network, etc.).
    register_adapter("us_equity", YahooUSEquityAdapter)
    # Real A-share data via akshare (东方财富 / 新浪 / 腾讯). Falls back to
    # MockAdapter if akshare is missing or upstream fails.
    register_adapter("a_share", CnEquityAdapter)
    register_adapter("crypto", MockAdapter)


_register_builtins()
