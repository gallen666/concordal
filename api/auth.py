"""Closed-beta auth: invite codes -> JWT bearer tokens.

Flow:
    1. User visits landing page, submits email + invite code.
    2. POST /v1/auth/redeem -> returns JWT (7d TTL by default).
    3. Frontend stores in localStorage; subsequent API calls send
       `Authorization: Bearer <jwt>`.

Invite codes live in TA_INVITE_CODES env var (comma-separated). Use one per
user to revoke individually (delete the code from the env, redeploy).

This is intentionally simple. v0 doesn't need Auth0/Clerk for a 50-user
closed beta - swap in once you cross 100 users or need SSO.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, status
from pydantic import BaseModel, EmailStr

from .config import cfg

log = logging.getLogger(__name__)


# --- invite codes ---------------------------------------------------------


def _load_codes() -> dict[str, str]:
    """`TA_INVITE_CODES=abc123:alice@x.com,def456:bob@y.com,zzz999:*`
    The `*` after the colon means "any email".
    """
    raw = os.getenv("TA_INVITE_CODES", "")
    out: dict[str, str] = {}
    for entry in raw.split(","):
        entry = entry.strip()
        if not entry:
            continue
        if ":" not in entry:
            out[entry] = "*"
        else:
            code, email = entry.split(":", 1)
            out[code.strip()] = email.strip()
    return out


def _verify_code(code: str, email: str) -> bool:
    if not cfg.require_invite_code:
        return True
    codes = _load_codes()
    if code not in codes:
        return False
    bound = codes[code]
    return bound == "*" or bound.lower() == email.lower()


# --- JWT ------------------------------------------------------------------


def _issue_token(email: str) -> str:
    now = int(time.time())
    payload = {
        "sub": email,
        "iat": now,
        "exp": now + cfg.jwt_ttl_hours * 3600,
        "scope": "beta",
    }
    return jwt.encode(payload, cfg.jwt_secret, algorithm="HS256")


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, cfg.jwt_secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired")
    except jwt.PyJWTError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {e}")


# --- request models -------------------------------------------------------


class RedeemRequest(BaseModel):
    email: EmailStr
    invite_code: str


class TokenResponse(BaseModel):
    token: str
    user_id: str
    expires_at: int
    real_llm: bool          # whether this user gets real LLM or mock
    real_data: bool


def redeem(req: RedeemRequest) -> TokenResponse:
    if not _verify_code(req.invite_code, req.email):
        log.warning("Bad invite from %s", req.email)
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid invite code")
    tok = _issue_token(req.email)
    return TokenResponse(
        token=tok,
        user_id=req.email,
        expires_at=int(time.time()) + cfg.jwt_ttl_hours * 3600,
        real_llm=req.email in cfg.real_llm_user_ids,
        real_data=req.email in cfg.real_data_user_ids,
    )


# --- FastAPI dependency ---------------------------------------------------


class CurrentUser(BaseModel):
    id: str
    real_llm: bool
    real_data: bool


def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
) -> CurrentUser:
    if not cfg.require_invite_code:
        # Open mode (e.g. local dev). Identify via X-User-Id header or anon.
        return CurrentUser(id="anonymous", real_llm=False, real_data=False)
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Missing Authorization: Bearer <token>",
        )
    token = authorization.split(" ", 1)[1].strip()
    payload = _decode_token(token)
    uid = payload.get("sub", "")
    return CurrentUser(
        id=uid,
        real_llm=uid in cfg.real_llm_user_ids,
        real_data=uid in cfg.real_data_user_ids,
    )


def get_optional_user(
    authorization: Annotated[str | None, Header()] = None,
) -> CurrentUser:
    """Same as `get_current_user` but tolerates the no-auth case by
    returning a synthetic 'anonymous' user with mock-only privileges.

    Used on endpoints we want truly-anonymous visitors to be able to
    hit, like the demo decision flow on /decision (free-tier cap is
    enforced separately so we don't get hammered).
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        return CurrentUser(id="anonymous", real_llm=False, real_data=False)
    try:
        token = authorization.split(" ", 1)[1].strip()
        payload = _decode_token(token)
        uid = payload.get("sub", "")
        return CurrentUser(
            id=uid,
            real_llm=uid in cfg.real_llm_user_ids,
            real_data=uid in cfg.real_data_user_ids,
        )
    except HTTPException:
        # Bad / expired token — degrade to anon rather than 401
        return CurrentUser(id="anonymous", real_llm=False, real_data=False)
