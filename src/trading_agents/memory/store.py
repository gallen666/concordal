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

    def append_decision(
        self,
        decision: Decision,
        *,
        user_id: str | None = None,
        decision_close: float | None = None,
        market: str | None = None,
    ) -> None:
        entry = ReflectionEntry(
            ticker=decision.ticker,
            decision_date=decision.asof,
            decision=decision,
            user_id=user_id,
            decision_close=decision_close,
            market=market,
        )
        with self._path(decision.ticker).open("a", encoding="utf-8") as f:
            f.write(entry.model_dump_json() + "\n")

    def user_history(self, user_id: str, limit: int = 200) -> list[ReflectionEntry]:
        """Scan all per-ticker JSONL files for entries belonging to user_id.

        Returns most recent first. v0 is O(files * rows); fine for closed beta.
        Move to SQLite when this gets slow.
        """
        out: list[ReflectionEntry] = []
        for path in self.root.glob("*.jsonl"):
            try:
                for line in path.read_text(encoding="utf-8").splitlines():
                    if not line.strip():
                        continue
                    try:
                        e = ReflectionEntry.model_validate_json(line)
                    except Exception:
                        continue
                    if e.user_id == user_id:
                        out.append(e)
            except OSError:
                continue
        out.sort(key=lambda e: e.decision_date, reverse=True)
        return out[:limit]

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
