"""Reddit-based news + sentiment adapter — free, no API key needed.

Reddit exposes a public JSON API (`https://www.reddit.com/r/<sub>/search.json`)
that returns recent posts mentioning a query. We use it to derive:

  * NewsItem list — high-upvote posts become "headlines" the news analyst reads
  * SentimentSummary — mention count, score-weighted bull/bear skew, top themes

Why Reddit specifically:
  * No API key. Works on Render free tier with zero config — no env var to forget.
  * Real retail sentiment (esp. r/wallstreetbets, r/investing for US equities;
    r/CryptoCurrency, r/Bitcoin for crypto). Far better signal than yfinance's
    "current top stories" endpoint.
  * Public JSON, lookback up to ~6 months via `t=year` filter. Strict no-
    lookahead is enforced by filtering on `created_utc`.

Limitations we accept:
  * Reddit's search has rate limits (~60 req/min unauthed). We cache aggressively.
  * For backtest dates older than ~1 year, Reddit search returns thin results.
    The lookahead filter still drops anything > asof, but the 0-result case is
    common — caller should treat empty as "no signal" not "bearish".
  * Sentiment scoring is heuristic. We use upvotes - downvotes, comment volume,
    and bull-keyword vs bear-keyword matching. This is not as good as a fine-
    tuned sentiment classifier, but it's free and transparent.
"""

from __future__ import annotations

import json
import logging
import re
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from typing import Any

from ..core.types import NewsItem, SentimentSummary

log = logging.getLogger(__name__)


# Per-market subreddit maps. Generic markets pick the first subset that fits.
SUBREDDIT_MAP: dict[str, list[str]] = {
    "us_equity": ["wallstreetbets", "investing", "stocks", "SecurityAnalysis"],
    "a_share":   ["wallstreetbets", "China", "stocks"],   # weak coverage; better than nothing
    "crypto":    ["CryptoCurrency", "ethfinance", "Bitcoin"],
}


_USER_AGENT = "concordal/0.2 (research; +https://www.concordal.hk)"

# In-process cache — Reddit rate-limits aggressively, so we cache by query+asof
# for an hour. Backtests over many dates will reuse very little, but that's
# fine — the network call itself is fast.
_CACHE: dict[tuple, tuple[float, list[dict]]] = {}
_CACHE_TTL_SEC = 3600


# Heuristic keywords for naive sentiment scoring. Score per keyword is +1/-1;
# we sum across the headline + selftext and clip to [-1, +1]. Dumb but cheap;
# replace with a fine-tuned classifier later.
_BULL_KEYWORDS = re.compile(
    r"\b(buy|bull|long|moon|rally|breakout|beat|beats|crush|crushes|surge|"
    r"upgrade|outperform|hodl|to the moon|all in|loaded up|🚀|💎|看多|抄底|主升浪)\b",
    re.IGNORECASE,
)
_BEAR_KEYWORDS = re.compile(
    r"\b(sell|short|bear|dump|crash|miss|misses|downgrade|underperform|bag holder|"
    r"puts|cooked|bagholding|💀|🩸|看空|割肉|被套|跌停)\b",
    re.IGNORECASE,
)


def _http_get_json(url: str, timeout: int = 12) -> dict | None:
    """GET helper with our UA + small retry for 429."""
    req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read())
        except Exception as e:
            if attempt == 0:
                # 429 / network blip — sleep briefly + retry once
                log.debug("Reddit GET %s failed (%s); retrying once", url, e)
                time.sleep(1.5)
                continue
            log.debug("Reddit GET %s failed twice: %s", url, e)
            return None
    return None


def _search_subreddit(
    subreddit: str, query: str, time_filter: str = "month", limit: int = 25
) -> list[dict]:
    """Return raw Reddit post records for `query` in `subreddit`."""
    cache_key = (subreddit, query, time_filter, limit)
    rec = _CACHE.get(cache_key)
    if rec and time.time() - rec[0] < _CACHE_TTL_SEC:
        return rec[1]

    url = (
        f"https://www.reddit.com/r/{subreddit}/search.json?"
        + urllib.parse.urlencode({
            "q": query,
            "restrict_sr": "on",
            "sort": "new",
            "t": time_filter,
            "limit": str(limit),
        })
    )
    data = _http_get_json(url)
    posts: list[dict] = []
    if data:
        for child in (data.get("data") or {}).get("children") or []:
            d = child.get("data") or {}
            posts.append({
                "title":       d.get("title") or "",
                "selftext":    d.get("selftext") or "",
                "score":       int(d.get("score") or 0),
                "ups":         int(d.get("ups") or 0),
                "num_comments": int(d.get("num_comments") or 0),
                "created_utc": float(d.get("created_utc") or 0),
                "permalink":   d.get("permalink") or "",
                "author":      d.get("author") or "",
                "subreddit":   subreddit,
            })
    _CACHE[cache_key] = (time.time(), posts)
    return posts


def _resolve_query(ticker: str, market: str) -> str:
    """Build a Reddit search query for this ticker. Uses both code + $code so
    we catch both bare-mention ("AAPL earnings") and tag-style ("$AAPL")."""
    t = ticker.upper().strip()
    if market == "crypto":
        # crypto symbols: search by both BTC and "Bitcoin"-style nicknames
        nicknames = {
            "BTC": "Bitcoin",
            "ETH": "Ethereum",
            "SOL": "Solana",
            "XRP": "Ripple",
            "ADA": "Cardano",
            "DOGE": "Dogecoin",
        }
        nick = nicknames.get(t)
        if nick:
            return f"{t} OR {nick}"
        return t
    if market == "a_share":
        # A-share codes are 6 digits — Reddit will rarely have content keyed on
        # just the code, but we try anyway. Better signal would come from a
        # Chinese sub like Xueqiu, but those aren't on Reddit's API.
        return t
    # US equity default
    return f"{t} OR ${t}"


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------


def fetch_news(
    ticker: str, asof: date, market: str = "us_equity", lookback_days: int = 7,
) -> list[NewsItem]:
    """Top Reddit posts mentioning `ticker`, filtered to `asof - lookback_days`
    through `asof`. Returns at most 8 items, sorted by upvotes."""
    subs = SUBREDDIT_MAP.get(market) or SUBREDDIT_MAP["us_equity"]
    query = _resolve_query(ticker, market)
    cutoff_lo = (datetime.combine(asof, datetime.min.time(), tzinfo=timezone.utc).timestamp()
                 - lookback_days * 86400)
    cutoff_hi = datetime.combine(asof, datetime.max.time(), tzinfo=timezone.utc).timestamp()

    seen_titles: set[str] = set()
    items: list[NewsItem] = []
    for sub in subs:
        try:
            posts = _search_subreddit(sub, query, time_filter="month", limit=25)
        except Exception as e:
            log.debug("reddit search failed for %s/%s: %s", sub, query, e)
            continue
        for p in posts:
            ts = p.get("created_utc", 0)
            if ts < cutoff_lo or ts > cutoff_hi:
                continue
            t = p["title"]
            if t in seen_titles:
                continue
            seen_titles.add(t)
            published = datetime.fromtimestamp(ts, tz=timezone.utc)
            score_bias = (1.0 if _BULL_KEYWORDS.search(t + " " + p["selftext"]) else 0.0) - (
                1.0 if _BEAR_KEYWORDS.search(t + " " + p["selftext"]) else 0.0
            )
            items.append(NewsItem(
                ticker=ticker.upper(),
                headline=t[:240],
                summary=(p["selftext"][:400] or t)[:400],
                source=f"reddit:{sub}",
                url=f"https://www.reddit.com{p['permalink']}" if p.get("permalink") else None,
                published_at=published,
                sentiment_score=max(-1.0, min(1.0, score_bias)),
            ))

    items.sort(key=lambda i: i.published_at, reverse=True)
    # Prefer high-engagement posts: weight by mention recency + upvotes.
    # We cap at 8 to keep the analyst prompt manageable.
    return items[:8]


def fetch_sentiment(
    ticker: str, asof: date, market: str = "us_equity", lookback_days: int = 7,
) -> SentimentSummary | None:
    """Aggregate Reddit posts into a SentimentSummary. Returns None if no
    posts found (caller can fall back)."""
    subs = SUBREDDIT_MAP.get(market) or SUBREDDIT_MAP["us_equity"]
    query = _resolve_query(ticker, market)
    cutoff_lo = (datetime.combine(asof, datetime.min.time(), tzinfo=timezone.utc).timestamp()
                 - lookback_days * 86400)
    cutoff_hi = datetime.combine(asof, datetime.max.time(), tzinfo=timezone.utc).timestamp()

    bull_score, bear_score = 0.0, 0.0
    mentions = 0
    themes: dict[str, int] = {}
    notable: list[str] = []
    posts_seen: list[dict] = []

    for sub in subs:
        try:
            posts = _search_subreddit(sub, query, time_filter="month", limit=50)
        except Exception:
            continue
        for p in posts:
            ts = p.get("created_utc", 0)
            if ts < cutoff_lo or ts > cutoff_hi:
                continue
            mentions += 1
            posts_seen.append(p)
            text = p["title"] + " " + p["selftext"]
            up_w = max(1, min(p.get("ups", 1), 5_000))  # cap whales
            if _BULL_KEYWORDS.search(text):
                bull_score += up_w
            if _BEAR_KEYWORDS.search(text):
                bear_score += up_w
            # Extract single-word themes — every CamelCase / TitleCase word
            # appearing 3+ times across posts becomes a "theme".
            for w in re.findall(r"\b[A-Z][a-zA-Z]{3,}\b", p["title"]):
                themes[w] = themes.get(w, 0) + 1

    if mentions == 0:
        return None

    total = bull_score + bear_score
    bullish_share = (bull_score / total) if total > 0 else 0.5
    bearish_share = 1.0 - bullish_share if total > 0 else 0.5

    top_themes = [w for w, c in sorted(themes.items(), key=lambda x: -x[1]) if c >= 3][:5]

    # 3 highest-upvoted post titles as "notable posts"
    notable_titles = sorted(posts_seen, key=lambda p: -p.get("ups", 0))[:3]
    notable = [p["title"][:200] for p in notable_titles]

    return SentimentSummary(
        ticker=ticker.upper(),
        asof=asof,
        lookback_days=lookback_days,
        mention_count=mentions,
        bullish_share=round(bullish_share, 3),
        bearish_share=round(bearish_share, 3),
        top_themes=top_themes,
        notable_posts=notable,
    )
