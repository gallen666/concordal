"""MarketAdapter registry. Every market implements the same Protocol so that
the agent graph never has market-specific code in it."""

from .base import MarketAdapter, AdapterError  # noqa: F401
from .registry import get_adapter, register_adapter  # noqa: F401
