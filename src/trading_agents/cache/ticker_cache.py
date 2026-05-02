"""Ticker-level shared cache.

Same (ticker, asof) decisions across users share the analyst layer. This is
the single biggest cost lever in the system: with N users on the same daily
watchlist, we run analysts once per ticker per day, not N times.

Keys are deterministic hashes of (ticker, asof, market). Values are pickled
DecisionTrace objects. Upgrade path: Redis. v0 is filesystem.
"""

from __future__ import annotations

import hashlib
import os
import pickle
from datetime import date
from pathlib import Path

from ..core.types import DecisionTrace


class TickerCache:
    def __init__(self, root: str | Path | None = None, ttl_seconds: int = 86400):
        root = root or os.getenv("TA_DATA_DIR", "./.tradingagents")
        self.root = Path(root) / "cache"
        self.root.mkdir(parents=True, exist_ok=True)
        self.ttl = ttl_seconds

    def _key(self, ticker: str, asof: date, market: str) -> Path:
        h = hashlib.sha1(f"{ticker}:{asof}:{market}".encode()).hexdigest()[:16]
        return self.root / f"{h}.pkl"

    def get(self, ticker: str, asof: date, market: str) -> DecisionTrace | None:
        p = self._key(ticker, asof, market)
        if not p.exists():
            return None
        try:
            return pickle.loads(p.read_bytes())
        except Exception:
            return None

    def put(self, trace: DecisionTrace, market: str) -> None:
        p = self._key(trace.ticker, trace.asof, market)
        p.write_bytes(pickle.dumps(trace))
