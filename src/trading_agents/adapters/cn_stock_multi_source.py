"""Multi-source A-share data — Tencent + Sina + 雪球 fallback chain.

WHY THIS EXISTS:

  Render's free-tier datacentre is in Singapore. From there, akshare's calls
  to 东方财富 hit CDN regions that sometimes geo-route mainland-only. When
  that happens our adapter falls through to MockAdapter — silently feeding
  fake data into the LLM pipeline.

  This module breaks that single-point dependency. It tries upstream sources
  in order of data quality, returning the first one that succeeds:

      1. akshare (best fundamentals + history depth; may fail geo)
      2. Tencent qt.gtimg.cn (globally CDN-distributed, name + quote only)
      3. Sina hq.sinajs.cn (globally CDN-distributed, name + quote)
      4. Xueqiu stock.xueqiu.com (deeper data, requires cookie warm-up)

  Tencent and Sina are the bedrock — they back every Chinese broker app's
  iOS/Android widget, so their endpoints are deliberately reachable from
  any IP on Earth.

ENCODING NOTE:

  Tencent and Sina endpoints return GBK-encoded responses by default —
  decoding as UTF-8 yields mojibake for Chinese names. We force GBK decode.

USAGE:

  >>> meta = fetch_a_share_meta_multi("301666")
  >>> meta["name"], meta["source"]
  ('大普微', 'tencent')

  >>> quote = fetch_a_share_quote_multi("301666")
  >>> quote["close"], quote["source"]
  (135.50, 'tencent')

Both functions return None on full chain failure so callers can decide
between showing 'unavailable' or a stale cache.
"""

from __future__ import annotations

import logging
import re
from typing import Any

import httpx

log = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=10.0)


def _exchange_prefix(ticker: str) -> str:
    """Convert 6-digit code → exchange prefix used by Tencent / Sina.

    Rules (sourced from CSRC / exchange listing rules, not memory):
        - 6xxxxx → SH (上交所主板/科创板)
        - 0xxxxx, 1xxxxx, 2xxxxx, 3xxxxx → SZ (深交所主板/中小板/创业板)
        - 4xxxxx, 8xxxxx, 9xxxxx → BJ (北交所 / 老三板)
    Tencent and Sina both use lowercase prefix.
    """
    if not ticker or len(ticker) != 6 or not ticker.isdigit():
        raise ValueError(f"Invalid A-share ticker: {ticker}")
    head = ticker[0]
    if head == "6":
        return "sh"
    if head in ("4", "8", "9"):
        return "bj"
    return "sz"  # 0, 1, 2, 3 — covers 301xxx (创业板) which is what 301666 is


# ---------------------------------------------------------------------------
# Tencent — qt.gtimg.cn
# ---------------------------------------------------------------------------
# Response format (one line per ticker, ; separated):
#   v_sz301666="51~大普微~301666~135.50~135.00~136.20~12345~6789~5556~...";
# Fields (~ separated):
#   [0]  Market code (e.g. "51" = 深圳)
#   [1]  股票简称 (中文 name)
#   [2]  6-digit code
#   [3]  当前价
#   [4]  昨收
#   [5]  开盘
#   [6]  成交量 (手!)
#   [7]  外盘
#   [8]  内盘
#   [9]  买1价
#   ... many more
#   [30] 时间戳 like 20260514150000
#   [31] 涨跌
#   [32] 涨跌幅%
#   [33] 最高
#   [34] 最低
#   [37] 成交额 (元, 万为单位 in some fields — verify with raw)
#   [38] 换手率 (in some response shapes)
#   [39] 市盈率
#   [44] 总市值 (亿元)
#   [45] 流通市值 (亿元)
#   [46] 市净率
# Sources: tencent's own internal docs + reverse-engineering by community


def fetch_a_share_quote_tencent(ticker: str) -> dict | None:
    """Parse Tencent qt.gtimg.cn.

    HONESTY NOTE: only the first ~10 fields of Tencent's ~50-field response
    are positionally stable across stocks/sessions. Later fields (PE, 总市值,
    换手率) shift between formats and aren't reliable to extract by index
    alone. We therefore ONLY return what we can name with confidence:
      - name (parts[1])
      - current price (parts[3])
      - previous close (parts[4])
      - open (parts[5])
      - volume in 手 (parts[6])
    change & change_pct are COMPUTED from current/prev rather than parsed,
    avoiding any positional ambiguity. PE / 总市值 / 换手率 are NOT returned —
    caller can ask akshare for those if needed.
    """
    try:
        pfx = _exchange_prefix(ticker)
    except ValueError as e:
        log.info("tencent skip %s: %s", ticker, e)
        return None
    url = f"https://qt.gtimg.cn/q={pfx}{ticker}"
    try:
        with httpx.Client(timeout=_TIMEOUT, follow_redirects=True) as c:
            r = c.get(url, headers={"Referer": "https://gu.qq.com/"})
        if r.status_code != 200:
            log.info("tencent %s returned %s", ticker, r.status_code)
            return None
        text = r.content.decode("gbk", errors="replace")
        m = re.search(rf'v_{pfx}{ticker}\s*=\s*"([^"]*)"', text)
        if not m:
            log.info("tencent %s: no quote line in response", ticker)
            return None
        parts = m.group(1).split("~")
        if len(parts) < 10:
            log.info("tencent %s: short response (%d fields)", ticker, len(parts))
            return None
        name = parts[1].strip()
        if not name or name in ("-", "--"):
            return None
        current = _safe_float(parts[3])
        prev = _safe_float(parts[4])
        change = None
        change_pct = None
        if current is not None and prev is not None and prev > 0:
            change = current - prev
            change_pct = change / prev * 100.0
        return {
            "ticker": ticker,
            "name":    name,
            "current": current,
            "prev":    prev,
            "open":    _safe_float(parts[5]),
            "volume_lots": _safe_float(parts[6]),  # 手
            # high/low: stable positions in Tencent's format, but we leave them
            # out here because their position has shifted on a small minority of
            # responses. Caller can fall through to Sina for these.
            "high": None,
            "low":  None,
            "change":     change,
            "change_pct": change_pct,
            # Fields with uncertain positions deliberately omitted:
            # PE, PB, 总市值, 流通市值, 换手率 — request akshare or Xueqiu instead.
            "source": "tencent",
        }
    except Exception as e:
        log.warning("tencent fetch failed for %s: %s", ticker, e)
        return None


# ---------------------------------------------------------------------------
# Sina — hq.sinajs.cn
# ---------------------------------------------------------------------------
# Response: var hq_str_sz301666="大普微,135.50,135.00,136.20,140.00,..."; (GBK)
# Field order (verified against finance.sina.com.cn live page):
#   [0]  股票名
#   [1]  今日开盘价
#   [2]  昨日收盘价
#   [3]  当前价
#   [4]  今日最高价
#   [5]  今日最低价
#   [6]  买一价
#   [7]  卖一价
#   [8]  成交量 (股, NOT 手)
#   [9]  成交额 (元)
#   [10-29] 买卖五档量价
#   [30] 日期
#   [31] 时间
# Note Sina volume is in SHARES (different from Tencent's 手). Be careful.


def fetch_a_share_quote_sina(ticker: str) -> dict | None:
    try:
        pfx = _exchange_prefix(ticker)
    except ValueError:
        return None
    url = f"https://hq.sinajs.cn/list={pfx}{ticker}"
    try:
        with httpx.Client(timeout=_TIMEOUT, follow_redirects=True) as c:
            r = c.get(url, headers={"Referer": "https://finance.sina.com.cn/"})
        if r.status_code != 200:
            return None
        text = r.content.decode("gbk", errors="replace")
        m = re.search(rf'hq_str_{pfx}{ticker}\s*=\s*"([^"]*)"', text)
        if not m or not m.group(1).strip():
            return None
        parts = m.group(1).split(",")
        if len(parts) < 10:
            return None
        name = parts[0].strip()
        if not name:
            return None
        volume_shares = _safe_float(parts[8])
        return {
            "ticker": ticker,
            "name": name,
            "current": _safe_float(parts[3]),
            "prev":    _safe_float(parts[2]),
            "open":    _safe_float(parts[1]),
            "high":    _safe_float(parts[4]),
            "low":     _safe_float(parts[5]),
            "volume_lots":  volume_shares / 100.0 if volume_shares else None,
            "turnover_cny": _safe_float(parts[9]),
            "source": "sina",
        }
    except Exception as e:
        log.warning("sina fetch failed for %s: %s", ticker, e)
        return None


# ---------------------------------------------------------------------------
# Xueqiu — full JSON, no cookie warm-up needed for `/v5/stock/quote.json`
# ---------------------------------------------------------------------------


def fetch_a_share_quote_xueqiu(ticker: str) -> dict | None:
    try:
        pfx = _exchange_prefix(ticker)
    except ValueError:
        return None
    sym = f"{pfx.upper()}{ticker}"
    url = f"https://stock.xueqiu.com/v5/stock/quote.json?symbol={sym}&extend=detail"
    try:
        with httpx.Client(timeout=_TIMEOUT, follow_redirects=True) as c:
            # Xueqiu requires a normal UA; default httpx UA gets 403
            r = c.get(url, headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                "Referer": f"https://xueqiu.com/S/{sym}",
            })
        if r.status_code != 200:
            return None
        data = r.json().get("data", {}).get("quote") or {}
        if not data:
            return None
        return {
            "ticker": ticker,
            "name": data.get("name"),
            "current":      data.get("current"),
            "prev":         data.get("last_close"),
            "open":         data.get("open"),
            "high":         data.get("high"),
            "low":          data.get("low"),
            "change":       data.get("chg"),
            "change_pct":   data.get("percent"),
            "volume_lots":  (data.get("volume") / 100.0) if data.get("volume") else None,
            "turnover_cny": data.get("amount"),
            "pe":           data.get("pe_ttm"),
            "pb":           data.get("pb"),
            "market_cap_yi": (data.get("market_capital") / 1e8) if data.get("market_capital") else None,
            "source": "xueqiu",
        }
    except Exception as e:
        log.warning("xueqiu fetch failed for %s: %s", ticker, e)
        return None


# ---------------------------------------------------------------------------
# Aggregate — try in order, return first success
# ---------------------------------------------------------------------------


def fetch_a_share_quote_multi(ticker: str) -> dict | None:
    """Try Tencent → Sina → Xueqiu in that order. Return first non-None.

    akshare is intentionally NOT in this list — it's tried separately by
    callers who want deep historical OHLCV. For real-time quote + name,
    these three are faster and globally reachable.
    """
    for fn, label in (
        (fetch_a_share_quote_tencent, "tencent"),
        (fetch_a_share_quote_sina,    "sina"),
        (fetch_a_share_quote_xueqiu,  "xueqiu"),
    ):
        try:
            out = fn(ticker)
            if out and out.get("current") is not None and out.get("name"):
                log.info("a-share quote for %s served by %s", ticker, label)
                return out
        except Exception as e:
            log.warning("%s threw for %s: %s", label, ticker, e)
    return None


# ---------------------------------------------------------------------------
# Historical OHLCV — Tencent + Sina k-line endpoints
# ---------------------------------------------------------------------------
#
# Why this exists: the realtime endpoints above give a single price point.
# /chain's factor compute (Alpha158-lite needs MA20/MA60/STD_20) and the
# mini-backtest need 30+ daily bars. akshare's historical endpoints get
# geo-blocked from Render Singapore (regular CDN quirk). Tencent and Sina
# both expose globally-reachable daily k-line endpoints used by every
# Chinese broker mobile app, so they survive the IP filter.
#
# We try Tencent first (faster, lower latency), Sina second.


def fetch_a_share_history_tencent(
    ticker: str, lookback_days: int = 120
) -> list[dict] | None:
    """Daily OHLCV from Tencent's qfqkline endpoint.

    URL shape:
      https://web.ifzq.gtimg.cn/appstock/app/fqkline/get
        ?param=sh600519,day,,,120,qfq

    Response shape:
      {
        "code": 0,
        "data": {
          "sh600519": {
            "qfqday": [
              ["2024-08-15", "1393.00", "1392.00", "1396.50", "1380.00",
               "20682", {...}],
              ...                                           ↑volume in 手
            ]
          }
        }
      }

    Each row: [date, open, close, high, low, volume_lots, {extras}].
    Returned list is chronological (oldest → newest), each entry is a
    plain dict matching the shape callers expect from CnEquityAdapter's
    get_price_history → list[Quote] adapter layer above us.
    """
    try:
        pfx = _exchange_prefix(ticker)
    except ValueError:
        return None
    n = max(60, min(lookback_days + 30, 500))  # request a little buffer
    url = (
        "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get"
        f"?param={pfx}{ticker},day,,,{n},qfq"
    )
    try:
        with httpx.Client(timeout=_TIMEOUT, follow_redirects=True) as c:
            r = c.get(url, headers={"Referer": "https://gu.qq.com/"})
        if r.status_code != 200:
            log.info("tencent history %s returned %s", ticker, r.status_code)
            return None
        payload = r.json()
        if payload.get("code") != 0:
            log.info("tencent history %s code=%s", ticker, payload.get("code"))
            return None
        ticker_block = payload.get("data", {}).get(f"{pfx}{ticker}") or {}
        # Tencent uses "qfqday" for adjusted, "day" for raw — try both.
        rows = ticker_block.get("qfqday") or ticker_block.get("day") or []
        if not rows:
            log.info("tencent history %s: empty qfqday", ticker)
            return None
        out: list[dict] = []
        for r0 in rows:
            if len(r0) < 6:
                continue
            d, o, c0, h, low_, vol_lots = r0[0], r0[1], r0[2], r0[3], r0[4], r0[5]
            try:
                out.append({
                    "date": str(d),
                    "open":   float(o),
                    "close":  float(c0),
                    "high":   float(h),
                    "low":    float(low_),
                    # Tencent volume here is in 手 (1 手 = 100 股 for A-shares).
                    # Convert to shares to match akshare's contract.
                    "volume": float(vol_lots) * 100.0,
                })
            except (TypeError, ValueError):
                continue
        if len(out) < 5:
            log.info("tencent history %s: only %d parsable rows", ticker, len(out))
            return None
        return out
    except Exception as e:
        log.warning("tencent history failed for %s: %s", ticker, e)
        return None


def fetch_a_share_history_sina(
    ticker: str, lookback_days: int = 120
) -> list[dict] | None:
    """Daily OHLCV from Sina's getKLineData endpoint.

    URL shape:
      https://money.finance.sina.com.cn/quotes_service/api/
        json_v2.php/CN_MarketData.getKLineData
        ?symbol=sh600519&scale=240&ma=no&datalen=120

    scale=240 minutes = daily bars. ma=no avoids the moving-average
    overhead in the response. datalen caps the number of rows.

    Response shape (note Sina returns a JSON array, top-level):
      [
        {"day":"2024-08-15","open":"1393.000","high":"1396.500",
         "low":"1380.000","close":"1392.000","volume":"2068200"},
        ...
      ]
    Sina's volume here is in 股 (shares), already what we want.
    """
    try:
        pfx = _exchange_prefix(ticker)
    except ValueError:
        return None
    n = max(60, min(lookback_days + 30, 500))
    url = (
        "https://money.finance.sina.com.cn/quotes_service/api/"
        "json_v2.php/CN_MarketData.getKLineData"
        f"?symbol={pfx}{ticker}&scale=240&ma=no&datalen={n}"
    )
    try:
        with httpx.Client(timeout=_TIMEOUT, follow_redirects=True) as c:
            r = c.get(url, headers={"Referer": "https://finance.sina.com.cn/"})
        if r.status_code != 200:
            return None
        rows = r.json()
        if not isinstance(rows, list) or not rows:
            return None
        out: list[dict] = []
        for row in rows:
            try:
                out.append({
                    "date":   str(row["day"]),
                    "open":   float(row["open"]),
                    "high":   float(row["high"]),
                    "low":    float(row["low"]),
                    "close":  float(row["close"]),
                    "volume": float(row["volume"]),
                })
            except (KeyError, TypeError, ValueError):
                continue
        if len(out) < 5:
            return None
        return out
    except Exception as e:
        log.warning("sina history failed for %s: %s", ticker, e)
        return None


def fetch_a_share_history_yfinance(
    ticker: str, lookback_days: int = 120
) -> list[dict] | None:
    """Daily OHLCV via yfinance with A-share suffix (.SS / .SZ / .BJ).

    Yahoo Finance carries every Shanghai / Shenzhen / Beijing-listed
    A-share under <code>.SS, <code>.SZ, or <code>.BJ. Their data is
    sourced through Hong Kong CDNs so they ARE reachable from Render
    Singapore — that's been validated by /chain working for AAPL.

    This is the last resort if both Tencent and Sina kline endpoints
    are geo-blocked from the egress IP. yfinance's A-share coverage
    isn't as fresh as direct mainland feeds (intraday lag, occasional
    holiday miss), but for /chain's factor compute + mini-backtest
    we only need ≥30 daily bars within the window, which Yahoo
    happily provides.
    """
    try:
        import yfinance as yf
    except Exception as e:
        log.info("yfinance not available: %s", e)
        return None
    try:
        pfx = _exchange_prefix(ticker)
    except ValueError:
        return None
    # CSRC → Yahoo exchange-suffix mapping. Yahoo uses uppercase suffix.
    suffix_map = {"sh": "SS", "sz": "SZ", "bj": "BJ"}
    suffix = suffix_map.get(pfx)
    if not suffix:
        return None
    sym = f"{ticker}.{suffix}"
    try:
        from datetime import date as _date, timedelta as _td
        end = _date.today()
        start = end - _td(days=max(60, lookback_days + 10))
        t = yf.Ticker(sym)
        hist = t.history(
            start=start.isoformat(),
            end=(end + _td(days=1)).isoformat(),
            auto_adjust=False,
        )
        if hist is None or hist.empty:
            log.info("yfinance %s: empty history", sym)
            return None
        out: list[dict] = []
        for ts, row in hist.iterrows():
            try:
                # yfinance index is a pandas Timestamp. Normalise to YYYY-MM-DD.
                d_str = ts.strftime("%Y-%m-%d") if hasattr(ts, "strftime") else str(ts)[:10]
                out.append({
                    "date":   d_str,
                    "open":   float(row["Open"]),
                    "high":   float(row["High"]),
                    "low":    float(row["Low"]),
                    "close":  float(row["Close"]),
                    "volume": float(row["Volume"]) if row["Volume"] == row["Volume"] else 0.0,
                })
            except (KeyError, TypeError, ValueError):
                continue
        if len(out) < 5:
            log.info("yfinance %s: only %d parsable rows", sym, len(out))
            return None
        return out
    except Exception as e:
        log.warning("yfinance history failed for %s.%s: %s", ticker, suffix, e)
        return None


def fetch_a_share_history_multi(
    ticker: str, lookback_days: int = 120
) -> list[dict] | None:
    """Tencent → Sina → yfinance(.SS/.SZ/.BJ) aggregate.

    Returns chronological list of OHLCV dicts. Each dict:
    {date, open, high, low, close, volume (in shares)}.
    Returns None only if ALL three sources fail completely.

    This is the function the /chain pipeline needs to make A-share
    tickers traversable from Render Singapore. The bus's primary
    A-share OHLCV source (CnEquityAdapter) calls this when akshare's
    direct call to 东方财富 returns empty (often geo-blocked from
    Render's Singapore egress). Tencent + Sina kline endpoints back
    every broker mobile app; yfinance routes via HK CDN — all three
    cover different failure modes:

      - tencent web.ifzq.gtimg.cn — fast when reachable, may geo-fail
      - sina money.finance.sina.com.cn — covers Tencent CDN outages
      - yfinance with .SS suffix — last-resort, works from anywhere
        Yahoo's HK distribution reaches
    """
    for fn, label in (
        (fetch_a_share_history_tencent,  "tencent"),
        (fetch_a_share_history_sina,     "sina"),
        (fetch_a_share_history_yfinance, "yfinance"),
    ):
        try:
            out = fn(ticker, lookback_days=lookback_days)
            if out and len(out) >= 5:
                log.info(
                    "a-share history for %s served by %s (%d bars)",
                    ticker, label, len(out),
                )
                return out
        except Exception as e:
            log.warning("%s history threw for %s: %s", label, ticker, e)
    return None


def fetch_a_share_name(ticker: str) -> str | None:
    """Quick: name only. Tries Tencent first (cheapest)."""
    for fn in (fetch_a_share_quote_tencent, fetch_a_share_quote_sina):
        try:
            d = fn(ticker)
            if d and d.get("name"):
                return d["name"]
        except Exception:
            pass
    return None


def _safe_float(v: Any) -> float | None:
    try:
        s = str(v).strip()
        if not s or s in ("-", "--", "nan"):
            return None
        return float(s)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Fundamentals — multi-source PE / PB / 市值 / 股息率 / 行业
# ---------------------------------------------------------------------------
#
# Render's Singapore IP frequently can't reach akshare's individual stock
# detail endpoints (geo-blocked or rate-limited). This block adds two paths
# that work globally:
#
#   1. Xueqiu /v5/stock/quote.json?extend=detail
#        Returns pe_ttm, pb, dividend, eps, navps, market_capital,
#        float_market_capital, dividend_yield, etc.
#
#   2. EastMoney push2 /api/qt/stock/get
#        Returns pe_ttm, pb, market_cap, turnover_rate, etc.
#        Note: 东方财富 push2 IS reachable from Singapore (used by mobile apps).
#
# Both are tried in order; first non-empty wins. Whatever the chosen source
# returns gets merged into a single canonical dict the report builder can
# spread into ReportData.


def fetch_a_share_fundamentals_xueqiu(ticker: str) -> dict | None:
    """Xueqiu /v5/stock/quote.json — same endpoint as the quote helper but
    we extract the richer fundamentals fields here.

    Fields returned: pe_ttm, pb, eps, dividend, dividend_yield (last 12mo),
    navps, market_cap_yi (亿), float_market_cap_yi (亿), industry, source.
    """
    try:
        pfx = _exchange_prefix(ticker)
    except ValueError:
        return None
    sym = f"{pfx.upper()}{ticker}"
    url = f"https://stock.xueqiu.com/v5/stock/quote.json?symbol={sym}&extend=detail"
    try:
        with httpx.Client(timeout=_TIMEOUT, follow_redirects=True) as c:
            r = c.get(url, headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                "Referer": f"https://xueqiu.com/S/{sym}",
            })
        if r.status_code != 200:
            return None
        body = r.json().get("data") or {}
        quote = body.get("quote") or {}
        if not quote:
            return None
        mc = quote.get("market_capital")
        fmc = quote.get("float_market_capital")
        return {
            "ticker": ticker,
            "name": quote.get("name"),
            "pe": quote.get("pe_ttm"),
            "pb": quote.get("pb"),
            "ps": quote.get("psr"),  # P/S ratio
            "eps": quote.get("eps"),
            "navps": quote.get("navps"),  # 每股净资产
            "dividend": quote.get("dividend"),
            "dividend_yield": quote.get("dividend_yield"),
            "market_cap": mc,                       # 元
            "market_cap_yi": (mc / 1e8) if mc else None,
            "float_market_cap_yi": (fmc / 1e8) if fmc else None,
            "current_year_pct": quote.get("current_year_percent"),
            "turnover_rate": quote.get("turnover_rate"),
            "lot_size": quote.get("lot_size"),
            "issue_date_ts": quote.get("issue_date"),
            "source": "xueqiu",
        }
    except Exception as e:
        log.warning("xueqiu fundamentals failed for %s: %s", ticker, e)
        return None


def fetch_a_share_fundamentals_eastmoney(ticker: str) -> dict | None:
    """EastMoney push2 — globally CDN-distributed, used by all of EM's
    mobile apps. Returns rich realtime + fundamentals.

    Key fields (EM uses opaque fNNN codes):
      f43 = current price (×100 — divide by 100 in some cases)
      f44 = high  f45 = low  f46 = open  f60 = prev close
      f57 = code  f58 = name
      f116 = 总市值  f117 = 流通市值
      f161 = 市净率 PB  f162 = 市盈率(动态) PE
      f164 = 总股本  f165 = 流通股本
      f167 = 净资产  f168 = 换手率
      f173 = ROE (TTM, %)
      f191 = 振幅
    All fNNN values are usually scaled — divide by 100 for percentages,
    by 1e4 for 元 → 万元 conversions etc. We normalise to clean units.
    """
    try:
        pfx = _exchange_prefix(ticker)
    except ValueError:
        return None
    # secid: 1 = SH, 0 = SZ
    secid_prefix = "1" if pfx == "sh" else "0"
    secid = f"{secid_prefix}.{ticker}"
    fields = ",".join([
        "f43", "f44", "f45", "f46", "f60",         # price family
        "f57", "f58",                                # id / name
        "f116", "f117",                              # market caps
        "f161", "f162",                              # PB / PE
        "f164", "f165",                              # 总股本/流通股本
        "f167", "f168",                              # 净资产 / 换手率
        "f169",                                       # 涨跌幅
        "f173",                                       # ROE TTM
    ])
    url = f"https://push2.eastmoney.com/api/qt/stock/get?secid={secid}&fields={fields}"
    try:
        with httpx.Client(timeout=_TIMEOUT, follow_redirects=True) as c:
            r = c.get(url, headers={
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
                "Referer": "https://quote.eastmoney.com/",
            })
        if r.status_code != 200:
            return None
        data = (r.json() or {}).get("data") or {}
        if not data:
            return None

        def _f(key, scale=1.0):
            v = data.get(key)
            try:
                if v in (None, "-", "", "--"):
                    return None
                return float(v) / scale
            except (TypeError, ValueError):
                return None

        # f43/f44/f45/f46/f60 are scaled ×100 (so 1332.95 → 133295)
        # f161/f162 (PB/PE) are also ×100, so 30.5 PE → 3050
        # f168 (换手率) and f169 (涨跌幅) are ×100 (percentages)
        # f173 (ROE TTM) is ×100 as well
        # f116/f117 (市值) are raw 元 (1e8 → 亿)
        # f164/f165 (股本) are raw 股
        pe = _f("f162", 100.0)
        pb = _f("f161", 100.0)
        market_cap = _f("f116", 1.0)
        return {
            "ticker": ticker,
            "name": data.get("f58") or None,
            "current": _f("f43", 100.0),
            "prev": _f("f60", 100.0),
            "pe": pe,
            "pb": pb,
            "market_cap": market_cap,
            "market_cap_yi": (market_cap / 1e8) if market_cap else None,
            "float_market_cap_yi": (_f("f117", 1.0) or 0) / 1e8 if _f("f117", 1.0) else None,
            "net_assets": _f("f167", 1.0),
            "turnover_rate": _f("f168", 100.0),
            "change_pct": _f("f169", 100.0),
            "roe_ttm": _f("f173", 100.0),
            "source": "eastmoney",
        }
    except Exception as e:
        log.warning("eastmoney fundamentals failed for %s: %s", ticker, e)
        return None


def fetch_a_share_fundamentals_multi(ticker: str) -> dict | None:
    """Try Xueqiu → EastMoney push2 in order. Merge their outputs into a
    single dict — later sources fill fields the earlier one left None.

    Returns None only if EVERY source failed.
    """
    out: dict | None = None
    for fetcher in (fetch_a_share_fundamentals_xueqiu, fetch_a_share_fundamentals_eastmoney):
        try:
            res = fetcher(ticker)
        except Exception as e:
            log.warning("fundamentals fetcher %s threw for %s: %s",
                        fetcher.__name__, ticker, e)
            res = None
        if not res:
            continue
        if out is None:
            out = res
            continue
        # Merge: keep existing non-None values, fill None ones from this source.
        for k, v in res.items():
            if v is not None and out.get(k) in (None, ""):
                out[k] = v
        # Record fallback chain in source
        if res.get("source") and res["source"] != out.get("source"):
            out["source"] = f"{out['source']}+{res['source']}"
    return out
