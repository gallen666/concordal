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
  # https://www.concordal.hk/api/cn-proxy (or .vercel.app fallback)
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


import re as _re

# akshare uses random-numbered CDN subdomains like 1.push2.eastmoney.com,
# 17.push2.eastmoney.com, 78.push2his.eastmoney.com to load-balance. These
# numbered subdomains are harder to reach from Vercel HK than the canonical
# domain (different CDN edges with different ACLs). Strip the numeric
# prefix to normalize to push2.eastmoney.com / push2his.eastmoney.com /
# etc. — the canonical entry routes the same way internally.
_NUMERIC_PREFIX_RE = _re.compile(r"^https?://(\d+)\.([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:/|$|\?)")


def _normalize_cn_url(url: str) -> str:
    """Strip numeric subdomain prefixes from CN data CDN URLs."""
    try:
        m = _NUMERIC_PREFIX_RE.match(url)
        if not m:
            return url
        scheme = url.split("://", 1)[0]
        rest = url.split("://", 1)[1]
        # rest like '17.push2.eastmoney.com/api/...'
        host_path = rest.split("/", 1)
        host = host_path[0]
        path = "/" + host_path[1] if len(host_path) > 1 else "/"
        # Drop leading numeric label if present
        labels = host.split(".")
        if labels and labels[0].isdigit():
            new_host = ".".join(labels[1:])
            return f"{scheme}://{new_host}{path}"
        return url
    except Exception:
        return url


def _proxy_url(original_url: str) -> str:
    proxy_base = os.environ.get(
        "TA_CN_PROXY_BASE", "https://trading-agents-platform.vercel.app"
    ).rstrip("/")
    # Normalize numeric subdomain (akshare CDN load-balancing prefix)
    normalized = _normalize_cn_url(original_url)
    return f"{proxy_base}/api/cn-proxy?upstream={urllib.parse.quote(normalized, safe='')}"


# v34: GET query-string URL has a ~1.5K char practical ceiling on Vercel —
# above that, nginx returns 502 BEFORE our serverless function runs (verified
# via v33 diagnostic catch-all NOT firing; response was text/html nginx page,
# not our JSON). Switch long URLs to POST with JSON body {upstream:...}.
_POST_THRESHOLD = 1500


def _proxy_post_url() -> str:
    proxy_base = os.environ.get(
        "TA_CN_PROXY_BASE", "https://trading-agents-platform.vercel.app"
    ).rstrip("/")
    return f"{proxy_base}/api/cn-proxy"


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
        import json as _json
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

                # Build GET-style proxy URL first to measure length
                get_proxy_url = _proxy_url(url)
                log.debug("[cn_proxy_patch] %s → cn-proxy", parsed.hostname)

                # Remove Host header to let requests reset it for vercel.app
                if request.headers.get("Host"):
                    del request.headers["Host"]

                # v35: If GET URL would be too long for Vercel edge, send
                # the upstream URL via X-Cn-Proxy-Upstream header (8K+ limit).
                # This is more reliable than POST body (v34 observed POST
                # path returning nginx 502 at Vercel edge for unknown reason).
                if len(get_proxy_url) >= _POST_THRESHOLD:
                    normalized = _normalize_cn_url(url)
                    request.url = _proxy_post_url()  # bare /api/cn-proxy, no query
                    # Preserve original HTTP method on the URL fetched by
                    # cn-proxy (route.ts uses req.method as upstream method
                    # when header mode is in play — so we must keep our
                    # request.method = original (GET for clist/get)).
                    request.headers["X-Cn-Proxy-Upstream"] = normalized
                    log.debug(
                        "[cn_proxy_patch] long URL %d chars → X-Cn-Proxy-Upstream header",
                        len(get_proxy_url),
                    )
                else:
                    request.url = get_proxy_url
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
