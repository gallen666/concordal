"""Perplexity Sonar API adapter — real-time web search layer.

Why this exists
---------------
DeepSeek API (our primary LLM) is chat-completion only — it cannot browse
the web during inference. Without something like this adapter, every
analyst sees only pre-fetched data from yfinance / akshare / Reddit /
guba etc. — which is fine for technicals and fundamentals but stale for
breaking news (e.g., a SEC filing posted 30 minutes ago, a Fed speaker
event happening right now).

Perplexity Sonar (https://docs.perplexity.ai/api-reference/chat-completions-post)
is a chat-completion endpoint that runs a web search BEFORE answering,
and returns the answer + the source citations. We use it as a structured
"realtime news adapter": ask it about a ticker, get back today's relevant
headlines with URLs, hand the bullet list to DeepSeek as additional
context for the news analyst.

How it wires in
---------------
agents/analysts.py :: _fetch_news() — calls into the data bus by default
(reddit / guba). After this lands, we additionally invoke fetch_sonar_news
and merge the results into the news payload, so DeepSeek sees both the
social-signal news AND the realtime web-search news in the same prompt.

The adapter is intentionally cheap: one Sonar call per decision, capped at
~500 output tokens, ~$0.001/decision. If PERPLEXITY_API_KEY is unset the
adapter returns an empty list — the rest of the pipeline degrades to its
existing bus-only behaviour.

Pricing reference (June 2026, sonar model):
  input  $1 / 1M tokens
  output $1 / 1M tokens
  search $5 / 1k requests
A 500-token answer costs ~$0.001 — negligible at our scale.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any

import httpx

log = logging.getLogger(__name__)


SONAR_ENDPOINT = "https://api.perplexity.ai/chat/completions"
DEFAULT_MODEL = "sonar"  # cheapest realtime-search model; upgrade to sonar-pro for deeper reasoning


@dataclass
class SonarNews:
    """One news item Sonar surfaced. Citations come back as URLs from the
    Perplexity response; we attach them so the news analyst (and the audit
    log) can show users WHERE each claim came from."""

    headline: str
    summary: str
    citations: list[str]


def is_configured() -> bool:
    """True iff PERPLEXITY_API_KEY is set. Caller can gate cheaply on this
    instead of attempting a request and catching auth failure."""
    return bool(os.environ.get("PERPLEXITY_API_KEY", "").strip())


def fetch_sonar_news(
    ticker: str,
    *,
    locale: str = "en",
    market: str = "us_equity",
    max_items: int = 5,
    timeout: float = 20.0,
) -> list[dict[str, Any]]:
    """Ask Perplexity Sonar for today's news on `ticker`. Returns a list of
    dicts shaped like the rest of our news pipeline expects:
      [{"headline": str, "summary": str, "url": str, "source": "perplexity"}, ...]

    Empty list on:
      - PERPLEXITY_API_KEY unset (degrade silently — pipeline still has reddit/guba)
      - HTTP error (logged at WARNING, not raised, to keep pipeline robust)
      - parse failure (Sonar occasionally returns prose instead of a list)

    Locale-aware prompt: zh-CN gets Chinese, otherwise English. This matches
    the rest of our analyst i18n.
    """
    api_key = os.environ.get("PERPLEXITY_API_KEY", "").strip()
    if not api_key:
        return []

    is_zh = locale == "zh"
    is_a_share = market == "a_share"

    if is_zh:
        prompt = (
            f"今天关于股票代码 {ticker} 的最新真实新闻，"
            f"按时间倒序最多 {max_items} 条。"
            f"每条用一行短中文摘要，附原文 URL。"
            f"只列基于真实信息源（路透社、彭博、新华、东方财富、雪球、SEC、公司公告）的事实。"
            f"不要编造、不要给投资建议。如无相关新闻就明说 \"无相关新闻\"。"
        )
        if is_a_share:
            prompt = "A 股市场。" + prompt
    else:
        prompt = (
            f"What are the most recent factual news headlines for ticker {ticker} today? "
            f"Give me up to {max_items} items, newest first. "
            f"For each, write one short English sentence plus the source URL. "
            f"Only use real sources (Reuters, Bloomberg, SEC filings, company press releases, etc.). "
            f"Do not fabricate, do not give investment advice. "
            f"If there is no relevant news today say so explicitly."
        )

    body = {
        "model": DEFAULT_MODEL,
        "messages": [
            {"role": "system", "content": "You are a factual real-time financial news aggregator. Cite every claim."},
            {"role": "user", "content": prompt},
        ],
        # Cap output — we want headlines not essays. Keeps cost ~$0.001.
        "max_tokens": 600,
        # Low temperature: deterministic factual output, no creative summarisation.
        "temperature": 0.1,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        with httpx.Client(timeout=httpx.Timeout(timeout)) as c:
            resp = c.post(SONAR_ENDPOINT, json=body, headers=headers)
        if resp.status_code >= 400:
            log.warning(
                "perplexity_sonar: HTTP %s for ticker=%s — %s",
                resp.status_code,
                ticker,
                resp.text[:200],
            )
            return []
        data = resp.json()
    except (httpx.RequestError, ValueError) as e:
        log.warning("perplexity_sonar: request failed for ticker=%s — %s", ticker, e)
        return []

    try:
        text = data["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, TypeError):
        return []

    # Perplexity returns citation URLs in a top-level "citations" field
    # (separate from the message text). We surface them on each item so the
    # audit log can show users every URL Sonar consulted.
    citations: list[str] = data.get("citations") or []

    # Parse the text into items. Sonar usually returns one item per line or
    # numbered list. We use a permissive split — if Sonar gave free-form
    # prose, we still return it as a single item rather than dropping it.
    items: list[dict[str, Any]] = []
    lines = [ln.strip().lstrip("0123456789.").strip("-•* ").strip() for ln in text.splitlines() if ln.strip()]
    if not lines:
        return []
    if len(lines) == 1:
        # Single blob — return as one item so the analyst still sees it.
        items.append({
            "headline": lines[0][:200],
            "summary": lines[0],
            "url": citations[0] if citations else "",
            "source": "perplexity",
        })
    else:
        for idx, line in enumerate(lines[:max_items]):
            items.append({
                "headline": line[:200],
                "summary": line,
                "url": citations[idx] if idx < len(citations) else (citations[0] if citations else ""),
                "source": "perplexity",
            })

    return items
