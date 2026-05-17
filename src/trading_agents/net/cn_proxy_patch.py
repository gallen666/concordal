"""Global monkey-patch: route Chinese-market HTTP requests through Vercel HK.

The problem: Render Singapore IP is geo-blocked from EastMoney, Xueqiu,
Tonghuashun, CNINFO, etc. akshare wraps all these in `requests.get`
calls — each one fails with "Connection aborted" or returns empty body.

The solution v29-v30 introduced /api/cn-proxy on Vercel (region hkg1) as a
reverse proxy. But that only helps endpoints we explicitly patched to
call the proxy. akshare's hundreds of helper functions still hit
EastMoney directly via `requests`.

This module installs a global monkey-patch on `requests.Session.send`
that automatically rewrites outbound URLs for blocked CN hosts to go
through cn-proxy. After `apply_patch()`:

  requests.get("https://push2.eastmoney.com/api/qt/...")
  # → silently rewritten to:
  # https://trading-agents-platform.vercel.app/api/cn-proxy
  #   ?upstream=https%3A%2F%2Fpush2.eastmoney.com%2Fapi%2Fqt%2F...
  # → Vercel HK fetches EastMoney → returns body
  # → caller (akshare) sees the response transparently

This makes every existing akshare call work without per-function patches.

Triggered hosts (suffix-matched):
  .eastmoney.com, .dfcfw.com
  .xueqiu.com
  .gtimg.cn, .qq.com
  .sinajs.cn, .sina.com.cn
  .10jqka.com.cn, .hexin.cn
  .cninfo.com.cn, .szse.cn, .sse.com.cn

Idempotent: apply_patch() is safe to call multiple times.
"""

from __future__ import annotations

import logging
import os
import urllib.parse

log = logging.getLogger(__name__)

# Hosts (suffix-matched) we need to proxy. Must match the Vercel cn-proxy
# whitelist (ALLOWED_SUFFIXES in web/app/api/cn-proxy/route.ts).
_CN_HOST_SUFFIXES: tuple[str, ...] = (
    ".eastmoney.com",
    ".dfcfw.com",
    ".xueqiu.com",
    ".gtimg.cn",
    ".qq.com",
    ".sinajs.cn",
    ".sina.com.cn",
    ".10jqka.com.cn",
    ".hexin.cn",
    ".cninfo.com.cn",
    ".szse.cn",
    ".sse.com.cn",
)


def _should_proxy(host: str) -> bool:
    h = (host or "").lower()
    if not h:
        return False
    # Strip port if any
    if ":" in h:
        h = h.split(":", 1)[0]
    for suf in _CN_HOST_SUFFIXES:
        if h.endswith(suf):
            return True
    return False


def _proxy_url(original_url: str) -> str:
    proxy_base = os.environ.get(
        "TA_CN_PROXY_BASE", "https://trading-agents-platform.vercel.app"
    ).rstrip("/")
    return f"{proxy_base}/api/cn-proxy?upstream={urllib.parse.quote(original_url, safe='')}"


_patched = False


def apply_patch() -> bool:
    """Install the monkey-patch on requests.Session.send. Returns True on
    first install, False on subsequent calls (idempotent).

    Call this once at app startup, before any code that calls akshare.
    """
    global _patched
    if _patched:
        return False

    try:
        import requests
        from urllib.parse import urlparse
    except ImportError:
        log.warning("[cn_proxy_patch] requests not installed — patch skipped")
        return False

    _orig_send = requests.Session.send

    def _patched_send(self, request, **kwargs):
        try:
            url = request.url
            if not isinstance(url, str):
                return _orig_send(self, request, **kwargs)
            parsed = urlparse(url)
            if _should_proxy(parsed.hostname or ""):
                # Don't proxy if the URL is ALREADY pointing at cn-proxy
                # (avoid infinite loops in the proxy itself).
                if "/api/cn-proxy" in url:
                    return _orig_send(self, request, **kwargs)
                new_url = _proxy_url(url)
                log.debug("[cn_proxy_patch] %s → cn-proxy", parsed.hostname)
                # Build a fresh PreparedRequest pointing at the proxy.
                # We keep method, headers, body — only swap URL.
                request.url = new_url
                # Remove Host header to let requests reset it for vercel.app
                if request.headers.get("Host"):
                    del request.headers["Host"]
        except Exception as e:
            log.warning("[cn_proxy_patch] URL rewrite failed: %s", e)
        return _orig_send(self, request, **kwargs)

    requests.Session.send = _patched_send  # type: ignore[assignment]
    _patched = True
    log.info("[cn_proxy_patch] requests.Session.send patched — CN hosts will route via Vercel HK")
    return True


def is_patched() -> bool:
    """Whether the patch is currently active."""
    return _patched
