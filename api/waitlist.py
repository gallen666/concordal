"""Public waitlist endpoint - landing-page form posts here.

v0 stores the list in a single JSONL file under TA_DATA_DIR. Replace with
Postgres + a notification webhook (e.g. Slack) when the volume warrants it.
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, EmailStr

log = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/waitlist", tags=["waitlist"])


class JoinRequest(BaseModel):
    email: EmailStr
    note: str | None = None
    referrer: str | None = None


def _path() -> Path:
    root = Path(os.getenv("TA_DATA_DIR", "./.tradingagents"))
    root.mkdir(parents=True, exist_ok=True)
    return root / "waitlist.jsonl"


# Crude per-IP rate limit so the form isn't easy to spam.
_LAST: dict[str, float] = {}
_RATE_WINDOW_S = 30.0


def _check_rate(ip: str) -> None:
    now = time.time()
    last = _LAST.get(ip, 0)
    if now - last < _RATE_WINDOW_S:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Slow down")
    _LAST[ip] = now


@router.post("")
def join(req: JoinRequest, request: Request) -> dict:
    ip = request.client.host if request.client else "unknown"
    _check_rate(ip)

    row = {
        "email": req.email,
        "note": (req.note or "")[:500],
        "referrer": req.referrer,
        "ip": ip,
        "joined_at": datetime.now(timezone.utc).isoformat(),
    }
    with _path().open("a", encoding="utf-8") as f:
        f.write(json.dumps(row) + "\n")

    log.info("Waitlist: %s", req.email)
    return {"ok": True, "message": "You're on the list. We'll be in touch."}


@router.get("/_admin/count")
def count(token: str = "") -> dict:
    """Tiny ops endpoint: GET /v1/waitlist/_admin/count?token=$TA_ADMIN_TOKEN"""
    if not token or token != os.getenv("TA_ADMIN_TOKEN"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "nope")
    p = _path()
    if not p.exists():
        return {"count": 0}
    return {"count": sum(1 for _ in p.open())}
