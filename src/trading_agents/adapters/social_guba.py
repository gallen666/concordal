"""东方财富股吧 (EastMoney Guba) — A-share retail social signal.

Reddit's A-share coverage is paper-thin (mostly English-only commentary
on US-listed Chinese ADRs). The real Chinese retail conversation
happens on:
  * 东方财富股吧 (eastmoney.com)  — every A-share has /list,SH600519.html
  * 雪球 (xueqiu.com)             — needs cookie warmup, harder
  * 同花顺财经                     — limited public API

akshare exposes the 股吧 firehose via `stock_guba_em(symbol="600519")`,
which returns a DataFrame of recent posts with `帖子标题 / 阅读 / 评论
/ 发帖时间`. We mine that for both `NewsItem` (post titles as headlines)
and `SentimentSummary` (mention count + bull/bear keyword analysis).

This is the missing piece for honest A-share decisions — without it,
the sentiment analyst was running off Baidu hot-search rankings + mock
data, which is intensity-only, no directionality.

No API key needed. No extra dependency (akshare already in requirements).
Strict no-lookahead: filter by `发帖时间`.
"""

from __future__ import annotations

import logging
import re
import time
from datetime import date, datetime, timezone
from typing import Any

from ..core.types import NewsItem, SentimentSummary

log = logging.getLogger(__name__)


# Reuse the same bilingual bull/bear regex from social_reddit. Keeping
# them duplicated (not imported) so this module stays self-contained.
_BULL = re.compile(
    r"\b(buy|bull|long|moon|rally|breakout|beat|crush|surge|upgrade|"
    r"outperform|看多|抄底|主升浪|涨停|大涨|利好|加仓|建仓|继续看多|"
    r"突破|放量|金叉|多头|强势)\b",
    re.IGNORECASE,
)
_BEAR = re.compile(
    r"\b(sell|short|bear|dump|crash|miss|downgrade|underperform|"
    r"看空|割肉|被套|跌停|大跌|利空|减仓|清仓|继续看空|破位|缩量|"
    r"死叉|空头|弱势|杀跌|套牢)\b",
    re.IGNORECASE,
)


# 1h cache — Guba refreshes constantly so don't hold longer
_CACHE: dict[tuple, tuple[float, list[dict]]] = {}
_CACHE_TTL_SEC = 3600


def _normalize_ticker(t: str) -> str:
    """Strip exchange prefix if user passed 'SH600519' style."""
    t = t.strip().upper()
    if t.startswith(("SH", "SZ", "BJ")) and len(t) == 8:
        t = t[2:]
    return t


def _fetch_guba_posts(ticker: str, max_pages: int = 1) -> list[dict]:
    """Pull recent 股吧 posts via akshare. Returns raw dicts so caller
    can decide how to filter / aggregate."""
    cache_key = (ticker, max_pages)
    rec = _CACHE.get(cache_key)
    if rec and time.time() - rec[0] < _CACHE_TTL_SEC:
        return rec[1]

    try:
        import akshare as ak
    except ImportError:
        log.debug("akshare not installed — Guba fetch skipped")
        return []

    posts: list[dict] = []
    try:
        # akshare's stock_guba_em accepts the bare 6-digit code.
        df = ak.stock_guba_em(symbol=_normalize_ticker(ticker))
    except Exception as e:
        log.debug("stock_guba_em failed for %s: %s", ticker, e)
        return []

    if df is None or df.empty:
        return []

    # Column names from akshare: 帖子标题, 阅读, 评论, 作者, 发帖时间
    # Some versions return slightly different names; handle both.
    title_col = next((c for c in df.columns if "标题" in c or "title" in c.lower()), None)
    read_col = next((c for c in df.columns if "阅读" in c or "read" in c.lower()), None)
    comment_col = next((c for c in df.columns if "评论" in c or "comment" in c.lower()), None)
    author_col = next((c for c in df.columns if "作者" in c or "author" in c.lower()), None)
    time_col = next((c for c in df.columns if "发帖" in c or "时间" in c or "time" in c.lower()), None)

    if not title_col or not time_col:
        log.debug("Unexpected stock_guba_em columns: %s", list(df.columns))
        return []

    for _, r in df.iterrows():
        try:
            t_str = str(r[time_col])
            # Common formats: "2024-06-01 10:30" or "06-01 10:30"
            try:
                ts = datetime.fromisoformat(t_str.replace("/", "-"))
            except Exception:
                # akshare often returns "MM-DD HH:MM" — assume current year
                try:
                    ts = datetime.strptime(t_str, "%m-%d %H:%M")
                    ts = ts.replace(year=datetime.now().year)
                except Exception:
                    continue
            ts = ts.replace(tzinfo=timezone.utc)
            posts.append({
                "title":    str(r[title_col]),
                "read":     int(float(r[read_col])) if read_col and r[read_col] is not None else 0,
                "comments": int(float(r[comment_col])) if comment_col and r[comment_col] is not None else 0,
                "author":   str(r[author_col]) if author_col else "",
                "ts":       ts,
            })
        except Exception:
            continue

    _CACHE[cache_key] = (time.time(), posts)
    return posts


# --------------------------------------------------------------------------
# Public API — mirrors social_reddit so swapping the source is trivial
# --------------------------------------------------------------------------


def fetch_news(
    ticker: str, asof: date, lookback_days: int = 7,
) -> list[NewsItem]:
    """Return up to 8 股吧 posts about `ticker` within asof ± lookback,
    sorted by 阅读 desc."""
    posts = _fetch_guba_posts(ticker)
    if not posts:
        return []

    cutoff_lo = datetime.combine(asof, datetime.min.time(), tzinfo=timezone.utc).timestamp() - lookback_days * 86400
    cutoff_hi = datetime.combine(asof, datetime.max.time(), tzinfo=timezone.utc).timestamp()

    items: list[NewsItem] = []
    seen: set[str] = set()
    for p in posts:
        ts = p["ts"].timestamp()
        if ts < cutoff_lo or ts > cutoff_hi:
            continue
        if p["title"] in seen:
            continue
        seen.add(p["title"])
        text = p["title"]
        score = (1.0 if _BULL.search(text) else 0.0) - (1.0 if _BEAR.search(text) else 0.0)
        items.append(NewsItem(
            ticker=ticker.upper(),
            headline=text[:240],
            summary=f"阅读 {p['read']:,} · 评论 {p['comments']:,}",
            source="eastmoney_guba",
            url=None,
            published_at=p["ts"],
            sentiment_score=max(-1.0, min(1.0, score)),
        ))

    items.sort(key=lambda i: -((i.sentiment_score or 0) + 0.001))  # bull first
    return items[:8]


def fetch_sentiment(
    ticker: str, asof: date, lookback_days: int = 7,
) -> SentimentSummary | None:
    """Aggregate Guba posts into a SentimentSummary. Mention weighting
    uses 阅读 (read count) which correlates with retail attention."""
    posts = _fetch_guba_posts(ticker)
    if not posts:
        return None

    cutoff_lo = datetime.combine(asof, datetime.min.time(), tzinfo=timezone.utc).timestamp() - lookback_days * 86400
    cutoff_hi = datetime.combine(asof, datetime.max.time(), tzinfo=timezone.utc).timestamp()

    bull_w, bear_w = 0.0, 0.0
    mentions = 0
    themes: dict[str, int] = {}
    in_window: list[dict] = []

    for p in posts:
        ts = p["ts"].timestamp()
        if ts < cutoff_lo or ts > cutoff_hi:
            continue
        mentions += 1
        in_window.append(p)
        text = p["title"]
        # Cap weight per post to avoid one mega-thread skewing everything
        weight = max(1, min(p.get("read", 1), 100_000))
        if _BULL.search(text):
            bull_w += weight
        if _BEAR.search(text):
            bear_w += weight
        # Themes: 2+ char Chinese words appearing 3+ times across posts
        for w in re.findall(r"[一-鿿]{2,4}", text):
            themes[w] = themes.get(w, 0) + 1

    if mentions == 0:
        return None

    total = bull_w + bear_w
    bullish_share = bull_w / total if total > 0 else 0.5
    bearish_share = 1.0 - bullish_share if total > 0 else 0.5

    # Filter "stop words" — 股票, 公司, 一直 etc. give no signal
    STOP = {"股票", "公司", "一直", "我们", "他们", "现在", "今天", "明天",
            "看看", "怎么", "什么", "这个", "那个", "可以", "已经", "还是"}
    top_themes = [
        w for w, c in sorted(themes.items(), key=lambda x: -x[1])
        if c >= 3 and w not in STOP
    ][:5]

    notable = [p["title"][:200] for p in sorted(in_window, key=lambda x: -x.get("read", 0))[:3]]

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
