"""A-share (中国大陆股票) adapter via the `akshare` library.

`akshare` wraps multiple free Chinese data sources (东方财富, 新浪财经,
腾讯财经) and exposes them as Pandas DataFrames. No API key is required.

Symbol convention: bare 6-digit ticker (e.g. "301308", "600519", "000001").
akshare picks the right exchange (SH/SZ/BJ) internally.

Falls back to MockAdapter on any error so the demo never breaks.
"""

from __future__ import annotations

import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any

from ..core.regime import A_SHARE
from ..core.types import (
    Fundamentals,
    MacroSnapshot,
    NewsItem,
    Quote,
    SentimentSummary,
    TechnicalSnapshot,
)
from .base import AdapterError, MarketAdapter
from .macro_openbb import fetch_macro_snapshot
from .mock import MockAdapter

log = logging.getLogger(__name__)

_TICKER_RE = re.compile(r"^\d{6}$")


def _ymd(d: date) -> str:
    return d.strftime("%Y%m%d")


def _to_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        f = float(str(v).replace(",", "").replace("亿", "").replace("万", ""))
        return f
    except (TypeError, ValueError):
        return None


def _parse_cn_number(v: Any) -> float | None:
    """Parse Chinese-formatted numbers like '1.23万亿' / '5,432.10亿' / '987.6万'.

    akshare returns these as raw strings in some endpoints. We normalise to
    plain floats in the underlying base unit (元 for amounts, count for
    shares). Returns None if the value can't be parsed.
    """
    if v is None:
        return None
    s = str(v).strip().replace(",", "")
    if not s or s in ("-", "--", "nan", "None"):
        return None
    # Strip Chinese suffixes and scale appropriately.
    multiplier = 1.0
    if s.endswith("万亿"):
        multiplier = 1e12
        s = s[:-2]
    elif s.endswith("亿"):
        multiplier = 1e8
        s = s[:-1]
    elif s.endswith("万"):
        multiplier = 1e4
        s = s[:-1]
    elif s.endswith("%"):
        # Percent — return as decimal fraction
        try:
            return float(s[:-1]) / 100.0
        except ValueError:
            return None
    try:
        return float(s) * multiplier
    except ValueError:
        return None


class CnEquityAdapter(MarketAdapter):
    market = "a_share"
    regime = A_SHARE

    def __init__(self):
        try:
            import akshare  # noqa: F401
            self._available = True
        except ImportError:
            log.warning("akshare not installed; falling back to MockAdapter")
            self._available = False
        self._fallback = MockAdapter()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _ak(self):
        import akshare as ak
        return ak

    def _normalize_ticker(self, ticker: str) -> str:
        s = (ticker or "").strip()
        if not _TICKER_RE.fullmatch(s):
            raise AdapterError(
                f"A-share ticker must be 6 digits (e.g. 301308, 600519); got '{ticker}'."
            )
        return s

    def _hist_df(self, ticker: str, start: date, end: date):
        ak = self._ak()
        return ak.stock_zh_a_hist(
            symbol=self._normalize_ticker(ticker),
            period="daily",
            start_date=_ymd(start),
            end_date=_ymd(end),
            adjust="qfq",  # forward-adjusted prices (post-split, post-dividend)
        )

    # ------------------------------------------------------------------
    # MarketAdapter interface
    # ------------------------------------------------------------------

    def get_quote(self, ticker: str, asof: datetime) -> Quote:
        if not self._available:
            return self._fallback.get_quote(ticker, asof)
        try:
            asof_d = asof.date() if isinstance(asof, datetime) else asof
            df = self._hist_df(ticker, asof_d - timedelta(days=10), asof_d)
            if df is None or df.empty:
                raise AdapterError(f"No A-share price data for {ticker} on {asof_d}")
            row = df.iloc[-1]
            return Quote(
                ticker=ticker,
                asof=asof,
                open=float(row["开盘"]),
                high=float(row["最高"]),
                low=float(row["最低"]),
                close=float(row["收盘"]),
                volume=float(row["成交量"]),
            )
        except AdapterError:
            raise
        except Exception as e:
            log.warning("akshare quote failed (%s); falling back to mock", e)
            return self._fallback.get_quote(ticker, asof)

    def get_fundamentals(self, ticker: str, asof: date) -> Fundamentals:
        if not self._available:
            return self._fallback.get_fundamentals(ticker, asof)
        try:
            ak = self._ak()
            t = self._normalize_ticker(ticker)
            # `stock_individual_info_em` returns a 2-column frame (item, value)
            # with rows like 总市值, 流通市值, 行业, 上市时间, 股票代码, 股票简称
            info_df = ak.stock_individual_info_em(symbol=t)
            info: dict[str, Any] = {}
            if info_df is not None and not info_df.empty:
                # robust to columns being named in either Chinese or English
                cols = list(info_df.columns)
                k_col = cols[0]
                v_col = cols[1] if len(cols) > 1 else cols[0]
                for _, r in info_df.iterrows():
                    info[str(r[k_col]).strip()] = r[v_col]

            market_cap = _parse_cn_number(info.get("总市值"))
            name = str(info.get("股票简称") or "").strip() or None
            industry = str(info.get("行业") or "").strip() or None

            # Try to pull P/E and P/B from the realtime spot snapshot —
            # cheaper than the full financial report and good enough for
            # the analyst LLM's framing.
            pe = pb = None
            try:
                spot = ak.stock_individual_spot_xq(symbol=("SH" if t.startswith("6") else "SZ") + t)
                if spot is not None and not spot.empty:
                    spot_d: dict[str, Any] = {}
                    cols = list(spot.columns)
                    k_col = cols[0]
                    v_col = cols[1] if len(cols) > 1 else cols[0]
                    for _, r in spot.iterrows():
                        spot_d[str(r[k_col]).strip()] = r[v_col]
                    pe = _parse_cn_number(spot_d.get("市盈率(动)") or spot_d.get("市盈率"))
                    pb = _parse_cn_number(spot_d.get("市净率"))
            except Exception:
                pass  # spot is best-effort

            looks_real = market_cap is not None or pe is not None or name is not None
            if not looks_real:
                raise AdapterError(
                    f"akshare returned no fundamentals for '{ticker}'. "
                    "Possibly delisted or invalid A-share code."
                )

            notes_bits: list[str] = []
            if name:
                notes_bits.append(f"股票名称：{name}")
            if industry:
                notes_bits.append(f"行业：{industry}")
            return Fundamentals(
                ticker=ticker,
                asof=asof,
                market_cap=market_cap,
                pe_ratio=pe,
                pb_ratio=pb,
                eps_ttm=None,
                revenue_ttm=None,
                revenue_growth_yoy=None,
                gross_margin=None,
                operating_margin=None,
                net_margin=None,
                free_cash_flow_ttm=None,
                debt_to_equity=None,
                notes="；".join(notes_bits) if notes_bits else None,
            )
        except AdapterError:
            raise
        except Exception as e:
            log.warning("akshare fundamentals failed (%s); falling back to mock", e)
            return self._fallback.get_fundamentals(ticker, asof)

    def get_news(
        self, ticker: str, asof: date, lookback_days: int = 7
    ) -> list[NewsItem]:
        if not self._available:
            return self._fallback.get_news(ticker, asof, lookback_days)
        try:
            ak = self._ak()
            t = self._normalize_ticker(ticker)
            df = ak.stock_news_em(symbol=t)
            if df is None or df.empty:
                return self._fallback.get_news(ticker, asof, lookback_days)

            # akshare's stock_news_em returns columns: 关键词, 新闻标题, 新闻内容,
            # 发布时间, 文章来源, 新闻链接
            cutoff_start = datetime.combine(
                asof - timedelta(days=lookback_days),
                datetime.min.time(),
                tzinfo=timezone.utc,
            )
            cutoff_end = datetime.combine(
                asof, datetime.max.time(), tzinfo=timezone.utc
            )
            items: list[NewsItem] = []
            for _, r in df.iterrows():
                pub_str = str(r.get("发布时间") or "").strip()
                try:
                    # "2026-05-08 14:30:00" or similar
                    published = datetime.fromisoformat(pub_str.replace("/", "-"))
                    if published.tzinfo is None:
                        # akshare returns Beijing time; convert to UTC.
                        published = published.replace(tzinfo=timezone(timedelta(hours=8)))
                    published = published.astimezone(timezone.utc)
                except (ValueError, TypeError):
                    continue
                if published > cutoff_end or published < cutoff_start:
                    continue
                items.append(
                    NewsItem(
                        ticker=ticker,
                        headline=str(r.get("新闻标题") or "").strip(),
                        summary=str(r.get("新闻内容") or r.get("新闻标题") or "").strip()[:600],
                        source=str(r.get("文章来源") or "东方财富").strip(),
                        url=str(r.get("新闻链接") or "").strip() or None,
                        published_at=published,
                    )
                )
                if len(items) >= 12:
                    break
            return items or self._fallback.get_news(ticker, asof, lookback_days)
        except Exception as e:
            log.warning("akshare news failed (%s); falling back to mock", e)
            return self._fallback.get_news(ticker, asof, lookback_days)

    def get_sentiment(
        self, ticker: str, asof: date, lookback_days: int = 7
    ) -> SentimentSummary:
        """Synthesize sentiment from EastMoney 关注度排行榜 + 个股热门关键词.

        akshare exposes:
            stock_hot_rank_em()             - top-100 retail-attention list
            stock_hot_keyword_em(symbol)    - per-ticker hot keywords
            stock_hot_rank_detail_em(sym)   - historical rank time-series

        We mine these for: how popular is THIS ticker right now, what
        themes are people talking about, and is the buzz trending up or
        down. Output is shaped to fit the SentimentSummary schema so
        downstream sentiment analyst doesn't need to know the data source.

        Falls back to mock on any error — akshare endpoints can change.
        """
        if not self._available:
            return self._fallback.get_sentiment(ticker, asof, lookback_days)
        try:
            ak = self._ak()
            t = self._normalize_ticker(ticker)

            # Top retail-attention ranking. Try Baidu first (works globally),
            # fall back to EastMoney if available.
            rank_list = None
            try:
                from datetime import datetime as _dt
                rank_list = ak.stock_hot_search_baidu(
                    symbol="A股", date=_dt.now().strftime("%Y%m%d"), time="今日"
                )
            except Exception as e:
                log.debug("Baidu hot search failed: %s", e)
            if rank_list is None or rank_list.empty:
                try:
                    rank_list = ak.stock_hot_rank_em()
                except Exception as e:
                    log.debug("stock_hot_rank_em failed: %s", e)

            mention_count = 0
            attention_rank: int | None = None
            top_total = 0
            if rank_list is not None and not rank_list.empty:
                top_total = len(rank_list)
                # akshare returns columns like 当前排名/代码/股票名称/最新价/涨跌幅/...
                cols = list(rank_list.columns)
                code_col = next(
                    (c for c in cols if "代码" in c or "code" in c.lower()),
                    cols[1] if len(cols) > 1 else cols[0],
                )
                rank_col = next(
                    (c for c in cols if "排名" in c or "rank" in c.lower()),
                    cols[0],
                )
                # The code may include market prefix e.g. SZ301308; match on suffix
                hits = rank_list[rank_list[code_col].astype(str).str.endswith(t)]
                if not hits.empty:
                    try:
                        attention_rank = int(hits.iloc[0][rank_col])
                    except (TypeError, ValueError):
                        attention_rank = None
                    # Use rank position as a proxy for "mention count" — top
                    # of the list = more mentions. Scale: 1st = 100, 100th = 1.
                    mention_count = max(1, top_total - (attention_rank or top_total) + 1)

            # Per-ticker hot keywords → top_themes
            top_themes: list[str] = []
            try:
                kw = ak.stock_hot_keyword_em(symbol=t)
                if kw is not None and not kw.empty:
                    cols = list(kw.columns)
                    # Common shape: 时间/股票代码/概念名称/概念代码/热度值
                    name_col = next(
                        (c for c in cols if "概念" in c or "关键词" in c or "name" in c.lower()),
                        cols[2] if len(cols) > 2 else cols[0],
                    )
                    top_themes = [
                        str(v).strip()
                        for v in kw[name_col].head(8).tolist()
                        if str(v).strip()
                    ]
            except Exception as e:
                log.debug("stock_hot_keyword_em failed: %s", e)

            # We don't have a reliable bullish/bearish split — leave as 0.5/0.5
            # and let the analyst LLM read top_themes + rank context to form
            # its own qualitative view. Set notable_posts with rank context.
            notable: list[str] = []
            if attention_rank is not None and top_total:
                notable.append(
                    f"东方财富个股人气榜：第 {attention_rank} 名 / 共 {top_total} 只（值越小越热）"
                )
            if top_themes:
                notable.append("热门概念关键词：" + "、".join(top_themes[:5]))

            if not notable and not top_themes:
                # No useful signal — fall back to mock instead of empty data
                return self._fallback.get_sentiment(ticker, asof, lookback_days)

            return SentimentSummary(
                ticker=ticker,
                asof=asof,
                lookback_days=lookback_days,
                mention_count=mention_count,
                bullish_share=0.5,
                bearish_share=0.5,
                top_themes=top_themes,
                notable_posts=notable,
            )
        except Exception as e:
            log.warning("akshare sentiment failed (%s); falling back to mock", e)
            return self._fallback.get_sentiment(ticker, asof, lookback_days)

    def get_technical(self, ticker: str, asof: date) -> TechnicalSnapshot:
        if not self._available:
            return self._fallback.get_technical(ticker, asof)
        try:
            import pandas as pd

            df = self._hist_df(ticker, asof - timedelta(days=400), asof)
            if df is None or df.empty:
                return self._fallback.get_technical(ticker, asof)
            close = df["收盘"].astype(float)
            last = float(close.iloc[-1])
            sma20 = float(close.rolling(20).mean().iloc[-1])
            sma50 = float(close.rolling(50).mean().iloc[-1])
            sma200 = float(close.rolling(200).mean().iloc[-1]) if len(close) >= 200 else None
            ema12 = float(close.ewm(span=12).mean().iloc[-1])
            ema26 = float(close.ewm(span=26).mean().iloc[-1])
            macd = ema12 - ema26
            signal = float(
                pd.Series(close.ewm(span=12).mean() - close.ewm(span=26).mean())
                .ewm(span=9).mean().iloc[-1]
            )
            delta = close.diff()
            up = delta.clip(lower=0).rolling(14).mean()
            down = (-delta.clip(upper=0)).rolling(14).mean()
            rs = (up / down).iloc[-1] if not down.iloc[-1] == 0 else None
            rsi = float(100 - 100 / (1 + rs)) if rs else 50.0
            return TechnicalSnapshot(
                ticker=ticker,
                asof=asof,
                last_close=last,
                sma_20=sma20,
                sma_50=sma50,
                sma_200=sma200,
                ema_12=ema12,
                ema_26=ema26,
                macd=macd,
                macd_signal=signal,
                rsi_14=rsi,
                notes=(
                    f"趋势：{'上行' if last > sma50 else '下行'}（vs SMA50）；"
                    f"RSI14={rsi:.1f}；MACD={macd:.2f}。"
                ),
            )
        except Exception as e:
            log.warning("akshare technical failed (%s); falling back to mock", e)
            return self._fallback.get_technical(ticker, asof)

    def get_price_history(
        self, ticker: str, start: date, end: date
    ) -> list[Quote]:
        if not self._available:
            return self._fallback.get_price_history(ticker, start, end)
        try:
            df = self._hist_df(ticker, start, end)
            if df is None or df.empty:
                return self._fallback.get_price_history(ticker, start, end)
            quotes: list[Quote] = []
            for _, r in df.iterrows():
                d_str = str(r["日期"])
                d = datetime.fromisoformat(d_str).date() if "T" not in d_str else datetime.fromisoformat(d_str).date()
                ts = datetime.combine(d, datetime.min.time(), tzinfo=timezone.utc)
                quotes.append(
                    Quote(
                        ticker=ticker,
                        asof=ts,
                        open=float(r["开盘"]),
                        high=float(r["最高"]),
                        low=float(r["最低"]),
                        close=float(r["收盘"]),
                        volume=float(r["成交量"]),
                    )
                )
            return quotes
        except Exception as e:
            log.warning("akshare price history failed (%s)", e)
            return self._fallback.get_price_history(ticker, start, end)

    # ---- macro context (OpenBB / FRED, region=CN) ------------------------

    def get_macro(self, asof: date) -> MacroSnapshot | None:
        """Top-down macro snapshot for A-share decisions.

        We pass region="CN" so OpenBB pulls China-specific series (CPI,
        PMI, LPR) when available. Falls back gracefully if neither
        OpenBB nor FRED can serve the data.
        """
        return fetch_macro_snapshot(asof, region="CN")
