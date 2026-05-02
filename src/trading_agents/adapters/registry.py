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

    register_adapter("mock", MockAdapter)
    register_adapter("us_equity", MockAdapter)  # default to mock until live wired
    register_adapter("crypto", MockAdapter)


_register_builtins()
