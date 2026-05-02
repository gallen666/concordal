"""Per-ticker memory store. Persists Decisions + (later) realised PnL +
reflection notes. v0 is a JSONL file - upgrade to Postgres + pgvector when
moving to multi-tenant."""

from __future__ import annotations

import json
import os
from datetime import date
from pathlib import Path

from ..core.types import Decision, ReflectionEntry


class MemoryStore:
    def __init__(self, root: str | Path | None = None):
        root = root or os.getenv("TA_DATA_DIR", "./.tradingagents")
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, ticker: str) -> Path:
        return self.root / f"{ticker.upper()}.jsonl"

    def append_decision(self, decision: Decision) -> None:
        entry = ReflectionEntry(
            ticker=decision.ticker,
            decision_date=decision.asof,
            decision=decision,
        )
        with self._path(decision.ticker).open("a", encoding="utf-8") as f:
            f.write(entry.model_dump_json() + "\n")

    def update_reflection(
        self,
        ticker: str,
        decision_date: date,
        realised_return: float,
        alpha: float | None,
        reflection: str,
    ) -> None:
        path = self._path(ticker)
        if not path.exists():
            return
        rows = [json.loads(l) for l in path.read_text().splitlines() if l.strip()]
        for r in rows:
            if r.get("decision_date") == decision_date.isoformat():
                r["realised_return"] = realised_return
                r["alpha_vs_benchmark"] = alpha
                r["reflection"] = reflection
        path.write_text("\n".join(json.dumps(r) for r in rows) + "\n")

    def recent(self, ticker: str, n: int = 10) -> list[ReflectionEntry]:
        path = self._path(ticker)
        if not path.exists():
            return []
        rows = path.read_text().splitlines()[-n:]
        return [ReflectionEntry.model_validate_json(r) for r in rows if r.strip()]
