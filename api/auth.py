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
import secrets
import time
from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, status
from pydantic import BaseModel, EmailStr

from .config import cfg

log = logging.getLogger(__name__)


# --- magic-link tokens ----------------------------------------------------
# Persisted to SQLite at TA_DATA_DIR/platform.db so tokens survive a
# Render redeploy (otherwise every code push would invalidate every
# in-flight sign-in link). For multi-replica scale, swap SQLite for
# Redis — the schema migrates trivially.
_MAGIC_TTL_SEC = 15 * 60


def _mint_magic_token(email: str) -> str:
    """Generate a cryptographically random URL-safe magic-link token.

    16 bytes → 22-char base64-url string. Single-use: removed on verify
    or after TTL. Email is bound to the token so we can issue a JWT to
    the right user when the link is clicked.
    """
    from . import persistence
    tok = secrets.token_urlsafe(16)
    persistence.put_magic_token(tok, email, _MAGIC_TTL_SEC)
    return tok


def _consume_magic_token(tok: str) -> str | None:
    """Validate a magic-link token. Returns the email it was issued to,
    or None if the token is unknown / expired. Token is consumed on success
    so each link is single-use."""
    from . import persistence
    return persistence.consume_magic_token(tok)


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
    # v86: Founder JWT never effectively expires (100-year TTL), so a single
    # sign-in works across all the operator's devices forever without
    # re-authentication. The founder allowlist is read from the same env
    # var the API daily-cap bypass uses, so the two stay in sync.
    founders = {
        e.strip().lower()
        for e in os.environ.get("TA_FOUNDER_EMAILS", "").split(",")
        if e.strip()
    }
    if email.lower() in founders:
        ttl_seconds = 100 * 365 * 24 * 3600  # 100 years
        scope = "founder"
    else:
        ttl_seconds = cfg.jwt_ttl_hours * 3600
        scope = "beta"
    payload = {
        "sub": email,
        "iat": now,
        "exp": now + ttl_seconds,
        "scope": scope,
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


class MagicLinkSendRequest(BaseModel):
    email: EmailStr


class MagicLinkVerifyRequest(BaseModel):
    token: str


def magic_link_send(req: MagicLinkSendRequest, site_url: str) -> dict:
    """Send a sign-in link to the requested email.

    No invite-code gate — this is the public sign-up flow. Rate limits
    + daily caps protect against abuse. When RESEND_API_KEY isn't
    configured we still mint the token and LOG the link so a developer
    running locally can grab it from stdout.

    Returns `{ok: true, dev_link_shown_in_logs?: bool}`. We never echo
    the actual link in the response — that would let a third party spam
    "forgot login" emails to harvest the resulting URLs.
    """
    tok = _mint_magic_token(req.email)
    link = f"{site_url.rstrip('/')}/auth/verify?token={tok}"

    try:
        from .email_send import magic_link_email, is_configured
        if is_configured():
            ok = magic_link_email(to=req.email, link=link)
            log.info("magic-link sent to %s (ok=%s)", req.email, ok)
            return {"ok": True, "dev_link_shown_in_logs": False}
        # No Resend configured — surface the link in server logs so
        # a self-host dev / Render operator can paste it manually.
        log.warning(
            "magic-link generated but RESEND_API_KEY unset. Link for %s: %s",
            req.email, link,
        )
        return {"ok": True, "dev_link_shown_in_logs": True}
    except Exception as e:
        log.warning("magic-link send failed: %s", e)
        # Don't leak the failure mode — uniform success response prevents
        # email-enumeration attacks (yes/no signals).
        return {"ok": True, "dev_link_shown_in_logs": False}


def magic_link_verify(req: MagicLinkVerifyRequest) -> TokenResponse:
    """Exchange a magic-link token for a JWT."""
    email = _consume_magic_token(req.token)
    if not email:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Magic link is invalid or has expired. Request a new one.",
        )
    tok = _issue_token(email)
    return TokenResponse(
        token=tok,
        user_id=email,
        expires_at=int(time.time()) + cfg.jwt_ttl_hours * 3600,
        real_llm=True,
        real_data=True,
    )


def redeem(req: RedeemRequest) -> TokenResponse:
    if not _verify_code(req.invite_code, req.email):
        log.warning("Bad invite from %s", req.email)
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid invite code")
    tok = _issue_token(req.email)
    # Real-only mode: every authenticated user gets real LLM + real data.
    # The previous allowlist (real_llm_user_ids) was a closed-beta
    # cost-control device; now that daily caps + provider fallback chain
    # protect us, we let everyone hit the real pipeline.
    return TokenResponse(
        token=tok,
        user_id=req.email,
        expires_at=int(time.time()) + cfg.jwt_ttl_hours * 3600,
        real_llm=True,
        real_data=True,
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
        # Anonymous still gets real LLM — the daily cap is the protection,
        # not LLM-tier gating.
        return CurrentUser(id="anonymous", real_llm=True, real_data=True)
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Missing Authorization: Bearer <token>",
        )
    token = authorization.split(" ", 1)[1].strip()
    payload = _decode_token(token)
    uid = payload.get("sub", "")
    # Real-only mode: every authenticated user gets full pipeline.
    return CurrentUser(id=uid, real_llm=True, real_data=True)


def get_optional_user(
    authorization: Annotated[str | None, Header()] = None,
) -> CurrentUser:
    """Same as `get_current_user` but tolerates the no-auth case by
    returning a synthetic 'anonymous' user.

    Even anonymous gets real LLM — the daily cap (2/day for anon) is
    what protects us from quota drain, not LLM-tier gating. The whole
    point of removing mock mode is that visitors should see what the
    product actually does, not a watered-down demo.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        return CurrentUser(id="anonymous", real_llm=True, real_data=True)
    try:
        token = authorization.split(" ", 1)[1].strip()
        payload = _decode_token(token)
        uid = payload.get("sub", "")
        return CurrentUser(id=uid, real_llm=True, real_data=True)
    except HTTPException:
        # Bad / expired token — degrade to anon rather than 401
        return CurrentUser(id="anonymous", real_llm=True, real_data=True)
