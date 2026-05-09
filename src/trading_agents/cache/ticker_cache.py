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
import time
from datetime import date
from pathlib import Path

from ..core.types import DecisionTrace


# 30 min default. Short enough that intra-day re-runs pick up fresh news and
# fresh quotes; long enough that two users opening the same ticker within a
# few minutes share the analyst layer. Override via TA_CACHE_TTL_SECONDS.
DEFAULT_TTL_SECONDS = 30 * 60


class TickerCache:
    def __init__(self, root: str | Path | None = None, ttl_seconds: int | None = None):
        root = root or os.getenv("TA_DATA_DIR", "./.tradingagents")
        self.root = Path(root) / "cache"
        self.root.mkdir(parents=True, exist_ok=True)
        if ttl_seconds is None:
            ttl_seconds = int(os.getenv("TA_CACHE_TTL_SECONDS", DEFAULT_TTL_SECONDS))
        self.ttl = ttl_seconds

    def _key(self, ticker: str, asof: date, market: str) -> Path:
        h = hashlib.sha1(f"{ticker}:{asof}:{market}".encode()).hexdigest()[:16]
        return self.root / f"{h}.pkl"

    def get(self, ticker: str, asof: date, market: str) -> DecisionTrace | None:
        """Return cached trace only if within TTL — otherwise None.

        Previous version had no TTL check and returned a cache hit forever,
        which meant intra-day re-runs were served stale news / stale prices.
        Critical bug for "fresh data" UX.
        """
        p = self._key(ticker, asof, market)
        if not p.exists():
            return None
        try:
            age = time.time() - p.stat().st_mtime
            if age > self.ttl:
                return None
            return pickle.loads(p.read_bytes())
        except Exception:
            return None

    def put(self, trace: DecisionTrace, market: str) -> None:
        p = self._key(trace.ticker, trace.asof, market)
        p.write_bytes(pickle.dumps(trace))
