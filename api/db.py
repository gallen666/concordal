"""Backend-agnostic DB layer: SQLite (default) or Postgres (when DATABASE_URL).

Tech-item #2 (persistence). On Render's free tier the SQLite file lives on an
ephemeral filesystem and is wiped on every redeploy — which is why
`known_users`, `shared_decisions`, paid tiers, etc. all reset to zero. Pointing
DATABASE_URL at a managed Postgres (e.g. a free Supabase project) makes that
state survive forever, with no code change at the call sites.

This module is the ONE place that knows which backend is active. It picks
Postgres iff DATABASE_URL is set, else SQLite at TA_DATA_DIR, and papers over
the two dialect differences that actually bite this codebase:

  1. Placeholders — SQLite uses `?`, Postgres (psycopg) uses `%s`. The wrapper
     rewrites `?`→`%s` for Postgres. (Verified safe: no SQL string in
     persistence.py contains a literal `%` or LIKE pattern.)

  2. `REAL` width — SQLite's REAL is an 8-byte double, but Postgres REAL is a
     4-byte float (~7 significant digits). Every timestamp we store is a
     `time.time()` unix epoch (10 integer digits + fraction), which a 4-byte
     float SILENTLY TRUNCATES — e.g. an expiry could land minutes off. So for
     Postgres we rewrite the `REAL` column type to `DOUBLE PRECISION` at schema
     creation. SQLite keeps REAL (already 8-byte there).

Everything else is the portable common subset: all upserts use the standard
`INSERT ... ON CONFLICT(pk) DO UPDATE/NOTHING` form, which both SQLite (>=3.24)
and Postgres support, so no INSERT-OR-REPLACE translation lives here.

Concurrency: a single shared connection guarded by a module lock. Traffic is
low (beta), so serializing DB access is fine and avoids psycopg's
not-thread-safe-per-connection footgun. Results are materialized eagerly so a
cursor never outlives the lock.
"""

from __future__ import annotations

import logging
import os
import sqlite3
import threading
from pathlib import Path
from typing import Any, Iterator, Sequence

log = logging.getLogger(__name__)

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
IS_POSTGRES = bool(DATABASE_URL)

# Backend-agnostic exception for `except db.IntegrityError:` at call sites.
if IS_POSTGRES:  # pragma: no cover - import only exercised on PG deploys
    import psycopg  # type: ignore
    import psycopg.errors  # type: ignore

    IntegrityError: type[Exception] = psycopg.errors.IntegrityError
else:
    IntegrityError = sqlite3.IntegrityError


class Result:
    """Eagerly-materialized result set with the slice of the sqlite3 cursor
    API that persistence.py actually uses: fetchone(), fetchall(), iteration.
    Materializing up front means we can release the connection lock before the
    caller iterates, so no cursor outlives its critical section."""

    def __init__(self, rows: list[tuple], rowcount: int = -1):
        self._rows = rows
        self._i = 0
        # Mirrors DB-API cursor.rowcount — number of rows affected by the last
        # INSERT/UPDATE/DELETE (used by cache_purge_expired). -1 if unknown.
        self.rowcount = rowcount

    def fetchone(self) -> tuple | None:
        if self._i < len(self._rows):
            row = self._rows[self._i]
            self._i += 1
            return row
        return None

    def fetchall(self) -> list[tuple]:
        rest = self._rows[self._i:]
        self._i = len(self._rows)
        return rest

    def __iter__(self) -> Iterator[tuple]:
        rest = self._rows[self._i:]
        self._i = len(self._rows)
        return iter(rest)


class Conn:
    """Thin wrapper exposing the `.execute()` / `.executescript()` surface
    persistence.py relies on, backed by either sqlite3 or psycopg."""

    def __init__(self, raw: Any, is_pg: bool):
        self._raw = raw
        self._is_pg = is_pg
        self._lock = threading.Lock()

    def execute(self, sql: str, params: Sequence[Any] = ()) -> Result:
        if self._is_pg:
            sql = sql.replace("?", "%s")
        with self._lock:
            cur = self._raw.cursor()
            try:
                cur.execute(sql, tuple(params))
                # description is None for non-SELECT (INSERT/UPDATE/DELETE).
                rows = cur.fetchall() if cur.description is not None else []
                rc = cur.rowcount if cur.rowcount is not None else -1
            finally:
                cur.close()
        return Result([tuple(r) for r in rows], rowcount=rc)

    def executescript(self, script: str) -> None:
        if not self._is_pg:
            self._raw.executescript(script)
            return
        # Postgres: fix the REAL→DOUBLE PRECISION precision trap, then run each
        # statement individually (psycopg's extended protocol is one-statement).
        script = script.replace(" REAL", " DOUBLE PRECISION")
        with self._lock:
            cur = self._raw.cursor()
            try:
                for stmt in script.split(";"):
                    if stmt.strip():
                        cur.execute(stmt)
            finally:
                cur.close()


_lock = threading.Lock()
_conn: Conn | None = None


def connect(sqlite_path: Path | None = None, init_schema=None) -> Conn:
    """Open (once) and return the shared connection. `init_schema` is an
    optional callable(Conn) run after first connect — persistence.py passes
    its `_init_schema` so the tables exist on both backends."""
    global _conn
    if _conn is not None:
        return _conn
    with _lock:
        if _conn is not None:
            return _conn
        if IS_POSTGRES:
            import psycopg  # type: ignore

            raw = psycopg.connect(DATABASE_URL, autocommit=True)
            conn = Conn(raw, is_pg=True)
            log.info("Postgres persistence initialised (DATABASE_URL set)")
        else:
            path = sqlite_path or Path(
                os.environ.get("TA_DATA_DIR", "/app/.tradingagents")
            ) / "platform.db"
            path.parent.mkdir(parents=True, exist_ok=True)
            raw = sqlite3.connect(
                str(path), check_same_thread=False, isolation_level=None
            )
            raw.execute("PRAGMA journal_mode=WAL")
            raw.execute("PRAGMA synchronous=NORMAL")
            raw.execute("PRAGMA busy_timeout=5000")
            conn = Conn(raw, is_pg=False)
            log.info("SQLite persistence initialised at %s", path)
        if init_schema is not None:
            init_schema(conn)
        _conn = conn
        return conn


def backend_name() -> str:
    return "postgres" if IS_POSTGRES else "sqlite"
