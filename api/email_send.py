"""Transactional email — Resend integration, optional.

Why Resend: free tier 100 emails/day + 3000/month, the only one with
truly painless DX (single env var → working email). When operator
sets RESEND_API_KEY, all `send_email` calls go to real inboxes; when
they don't, calls log + return False so the rest of the platform keeps
working unchanged.

Used by:
  * Magic-link login (POST /v1/auth/magic-link)
  * Welcome on first decision
  * Weekly decision digest (POST /v1/cron/weekly-digest)
  * Daily-cap warning at 80% used (future)
  * Decision share notification (future)
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request

log = logging.getLogger(__name__)

_RESEND_KEY = os.environ.get("RESEND_API_KEY")
_FROM = os.environ.get("TA_EMAIL_FROM", "TradingAgents <no-reply@trading-agents.app>")
_REPLY_TO = os.environ.get("TA_EMAIL_REPLY_TO", "")

# v88 diagnostic: log a one-line fingerprint of the email config at import
# time so we can confirm Render picked up the right env vars without
# leaking the full API key. Helps debug 403s like "wrong key" or "wrong
# from address" that otherwise show up as opaque HTTP errors.
if _RESEND_KEY:
    _key_prefix = _RESEND_KEY[:8]
    _key_suffix = _RESEND_KEY[-4:] if len(_RESEND_KEY) > 12 else ""
    log.info(
        "email_send configured: from=%r key=%s...%s (len=%d) reply_to=%r",
        _FROM, _key_prefix, _key_suffix, len(_RESEND_KEY), _REPLY_TO or "<unset>",
    )
else:
    log.info("email_send not configured: RESEND_API_KEY missing")


def is_configured() -> bool:
    return bool(_RESEND_KEY)


def send_email(
    *,
    to: str | list[str],
    subject: str,
    html: str,
    text: str | None = None,
    tags: list[dict] | None = None,
) -> bool:
    """Send transactional email via Resend. Returns True on success.

    No-op + log warning when RESEND_API_KEY isn't set, so unit tests +
    free-tier deploys don't crash. The platform never depends on email
    succeeding — it's always "best-effort, follow up via UI if it fails".
    """
    if not _RESEND_KEY:
        log.info(
            "email skipped (RESEND_API_KEY not set): to=%s subject=%r",
            to, subject[:80],
        )
        return False

    recipients = [to] if isinstance(to, str) else to
    body = {
        "from": _FROM,
        "to": recipients,
        "subject": subject,
        "html": html,
    }
    if text:
        body["text"] = text
    if _REPLY_TO:
        body["reply_to"] = _REPLY_TO
    if tags:
        body["tags"] = tags

    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {_RESEND_KEY}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body_text = resp.read().decode("utf-8", errors="replace")[:500]
            ok = resp.status < 300
            if not ok:
                log.warning("resend send failed: HTTP %s body=%s", resp.status, body_text)
            else:
                log.info("resend send ok: to=%s subject=%r resp=%s", to, subject[:80], body_text[:200])
            return ok
    except urllib.error.HTTPError as e:
        # v88: surface the actual JSON error body from Resend, not just "HTTP 403"
        # so we can debug "domain not verified" / "from not allowed" / "invalid key"
        # without guessing.
        try:
            err_body = e.read().decode("utf-8", errors="replace")[:500]
        except Exception:
            err_body = "<could not read body>"
        log.warning(
            "resend send HTTPError %s %s | body=%s | from=%r to=%s",
            e.code, e.reason, err_body, _FROM, to,
        )
        return False
    except Exception as e:
        log.warning("resend send error: %s (type=%s)", e, type(e).__name__)
        return False


# ---- Templates ---------------------------------------------------------------


def magic_link_email(to: str, link: str) -> bool:
    """Single-click sign-in email used by the passwordless auth flow."""
    return send_email(
        to=to,
        subject="Your TradingAgents sign-in link",
        html=f"""
            <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
              <h2 style="color: #11151a;">Sign in to TradingAgents</h2>
              <p>Click the button below to sign in. This link expires in 15 minutes.</p>
              <p style="margin: 24px 0;">
                <a href="{link}" style="background: #56d364; color: #0d1014; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600;">
                  Sign in
                </a>
              </p>
              <p style="color: #888; font-size: 12px;">
                If you didn't request this, ignore this email — your account is safe.
              </p>
            </div>
        """,
        text=f"Sign in: {link}\n\nThis link expires in 15 minutes.",
        tags=[{"name": "category", "value": "magic-link"}],
    )


def weekly_digest_email(to: str, decisions: list[dict]) -> bool:
    """Weekly summary of the user's recent decisions + realised returns."""
    if not decisions:
        return False
    rows = "".join(
        f"""<tr>
          <td style="padding: 8px;">{d.get('decision_date','')}</td>
          <td style="padding: 8px; font-family: monospace;">{d.get('ticker','')}</td>
          <td style="padding: 8px;"><strong>{(d.get('decision') or {}).get('side','')}</strong></td>
          <td style="padding: 8px; text-align: right;">{_fmt_pct((d.get('decision') or {}).get('target_weight'))}</td>
          <td style="padding: 8px; text-align: right;">{_fmt_pct(d.get('forward_return'))}</td>
        </tr>"""
        for d in decisions[:10]
    )
    return send_email(
        to=to,
        subject=f"Your TradingAgents week — {len(decisions)} decisions",
        html=f"""
            <div style="font-family: -apple-system, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px;">
              <h2>Your week in TradingAgents</h2>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <thead style="background: #f4f6f8;">
                  <tr><th style="padding: 8px; text-align: left;">Date</th>
                      <th style="padding: 8px; text-align: left;">Ticker</th>
                      <th style="padding: 8px; text-align: left;">Side</th>
                      <th style="padding: 8px; text-align: right;">Target</th>
                      <th style="padding: 8px; text-align: right;">Forward ret</th>
                  </tr>
                </thead>
                <tbody>{rows}</tbody>
              </table>
              <p style="margin-top: 24px;">
                <a href="https://www.concordal.hk/me/history">View full history →</a>
              </p>
            </div>
        """,
        tags=[{"name": "category", "value": "weekly-digest"}],
    )


def _fmt_pct(v) -> str:
    if v is None or v == "":
        return "—"
    try:
        return f"{float(v) * 100:+.2f}%"
    except (TypeError, ValueError):
        return "—"
