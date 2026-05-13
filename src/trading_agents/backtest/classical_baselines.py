"""Classical-strategy baselines for backtest comparison.

Roadmap §1 Phase 1: "基线对比模块: Buy & Hold, MACD, KDJ+RSI, SMA, ZMR
一应俱全". Buy & hold is already in `agent_backtest.py`; this file adds
the other four so the track-record page can show "agent beats / underperforms
which classical strategy" honestly.

All baselines take an OHLCV pandas DataFrame (close-anchored) and return a
position series in {-1, 0, +1} per row. Position-sizing + cost model live
upstream in the backtest engine; these strategies only emit signals.

The goal isn't to find a profitable strategy — it's to give the LLM a fair
comparison set. If the LLM can't beat MACD on a 78-week window after costs,
that's data the user deserves to see.
"""

from __future__ import annotations

from typing import Iterable, Literal
import pandas as pd
import numpy as np


# ---------------------------------------------------------------------------
# Buy-and-hold — included for completeness so all baselines have the same
# signature. Always long.
# ---------------------------------------------------------------------------

def buy_and_hold(df: pd.DataFrame) -> pd.Series:
    return pd.Series(1.0, index=df.index, name="bh")


# ---------------------------------------------------------------------------
# MACD — Moving Average Convergence Divergence
# Signal: long when MACD > signal line; flat when below.
# Default params (12, 26, 9) per Appel 1979.
# ---------------------------------------------------------------------------

def macd(
    df: pd.DataFrame,
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
) -> pd.Series:
    close = df["close"]
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    pos = (macd_line > signal_line).astype(float)
    return pos.rename("macd")


# ---------------------------------------------------------------------------
# KDJ + RSI combo — common Chinese retail strategy.
# Long when K crosses above D AND RSI < 70 (i.e. KDJ says enter, RSI confirms
# we're not over-bought). Flat otherwise.
# ---------------------------------------------------------------------------

def kdj_rsi(
    df: pd.DataFrame,
    kdj_period: int = 9,
    kdj_k_smooth: int = 3,
    kdj_d_smooth: int = 3,
    rsi_period: int = 14,
    rsi_max: float = 70.0,
) -> pd.Series:
    close = df["close"]
    high = df["high"]
    low = df["low"]
    # KDJ
    low_min = low.rolling(kdj_period).min()
    high_max = high.rolling(kdj_period).max()
    rsv = (close - low_min) / (high_max - low_min).replace(0, np.nan) * 100
    k = rsv.ewm(alpha=1 / kdj_k_smooth, adjust=False).mean()
    d = k.ewm(alpha=1 / kdj_d_smooth, adjust=False).mean()
    # RSI
    diff = close.diff()
    up = diff.where(diff > 0, 0.0).rolling(rsi_period).mean()
    down = (-diff.where(diff < 0, 0.0)).rolling(rsi_period).mean()
    rs = up / down.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    pos = ((k > d) & (rsi < rsi_max)).astype(float)
    return pos.rename("kdj_rsi")


# ---------------------------------------------------------------------------
# SMA cross — golden-cross / death-cross. Long when fast SMA > slow SMA.
# ---------------------------------------------------------------------------

def sma_cross(df: pd.DataFrame, fast: int = 20, slow: int = 50) -> pd.Series:
    close = df["close"]
    sma_fast = close.rolling(fast).mean()
    sma_slow = close.rolling(slow).mean()
    pos = (sma_fast > sma_slow).astype(float)
    return pos.rename("sma_cross")


# ---------------------------------------------------------------------------
# ZMR — Z-score mean reversion. Long when z(close, 20) < -1.0,
# flat when |z| < 0.3 (re-entry zone), short when z > 1.0.
# A simple stat-arb baseline; tends to bleed in trending regimes which is
# exactly what we want to expose if the agent disagrees with it.
# ---------------------------------------------------------------------------

def zmr(df: pd.DataFrame, window: int = 20, enter: float = 1.0, exit_: float = 0.3) -> pd.Series:
    close = df["close"]
    mean = close.rolling(window).mean()
    std = close.rolling(window).std()
    z = (close - mean) / std.replace(0, np.nan)
    pos = pd.Series(0.0, index=close.index, name="zmr")
    in_long = False
    in_short = False
    for i, zi in enumerate(z):
        if pd.isna(zi):
            continue
        if not in_long and not in_short:
            if zi < -enter: in_long = True
            elif zi > enter: in_short = True
        elif in_long and abs(zi) < exit_:
            in_long = False
        elif in_short and abs(zi) < exit_:
            in_short = False
        pos.iat[i] = (1.0 if in_long else 0.0) + (-1.0 if in_short else 0.0)
    return pos


# ---------------------------------------------------------------------------
# Aggregate — return all baselines as a {name: Series} dict for easy charting.
# Caller can join into a single DataFrame for cumulative-return comparison.
# ---------------------------------------------------------------------------

ALL_BASELINES = ("buy_and_hold", "macd", "kdj_rsi", "sma_cross", "zmr")


def compute_all(df: pd.DataFrame, which: Iterable[str] = ALL_BASELINES) -> dict[str, pd.Series]:
    fns = {
        "buy_and_hold": buy_and_hold,
        "macd": macd,
        "kdj_rsi": kdj_rsi,
        "sma_cross": sma_cross,
        "zmr": zmr,
    }
    return {name: fns[name](df) for name in which if name in fns}


def equity_curve(
    df: pd.DataFrame,
    position: pd.Series,
    cost_bps_per_side: float = 5.0,
) -> pd.Series:
    """Naive equity curve for a position series. Each position change pays
    cost_bps_per_side basis points on both legs."""
    close = df["close"]
    ret = close.pct_change().fillna(0)
    pnl = position.shift(1).fillna(0) * ret
    # Transaction cost on position changes
    turnover = position.diff().abs().fillna(0)
    cost_per_change = cost_bps_per_side / 10_000.0
    pnl -= turnover * cost_per_change * 2  # both sides
    return (1 + pnl).cumprod()
