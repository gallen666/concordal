"""The five paper baselines re-implemented as deterministic strategies that
take a list of historical Quotes and return a target-weight series."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from ..core.types import Quote


def _closes(quotes: list[Quote]) -> list[float]:
    return [q.close for q in quotes]


def buy_and_hold(quotes: list[Quote]) -> list[float]:
    return [1.0] * len(quotes)


def macd_strategy(quotes: list[Quote]) -> list[float]:
    closes = _closes(quotes)
    if len(closes) < 26:
        return [0.0] * len(closes)

    def ema(period):
        out = []
        k = 2 / (period + 1)
        for i, c in enumerate(closes):
            if i == 0:
                out.append(c)
            else:
                out.append(out[-1] + k * (c - out[-1]))
        return out

    e12 = ema(12)
    e26 = ema(26)
    macd = [a - b for a, b in zip(e12, e26)]
    # signal = ema9 of macd
    signal = []
    k9 = 2 / (9 + 1)
    for i, m in enumerate(macd):
        if i == 0:
            signal.append(m)
        else:
            signal.append(signal[-1] + k9 * (m - signal[-1]))
    weights = []
    for i in range(len(closes)):
        if i < 26:
            weights.append(0.0)
        else:
            weights.append(1.0 if macd[i] > signal[i] else 0.0)
    return weights


def kdj_rsi_strategy(quotes: list[Quote]) -> list[float]:
    closes = _closes(quotes)
    n = len(closes)
    if n < 14:
        return [0.0] * n

    # RSI 14
    gains = [0.0]
    losses = [0.0]
    for i in range(1, n):
        ch = closes[i] - closes[i - 1]
        gains.append(max(0.0, ch))
        losses.append(max(0.0, -ch))
    rsi = [50.0]
    period = 14
    for i in range(1, n):
        if i < period:
            rsi.append(50.0)
            continue
        avg_gain = sum(gains[i - period + 1 : i + 1]) / period
        avg_loss = sum(losses[i - period + 1 : i + 1]) / period
        rs = avg_gain / avg_loss if avg_loss > 0 else float("inf")
        rsi.append(100 - 100 / (1 + rs))

    # very simple KDJ proxy via stochastic on closes
    weights = []
    for i in range(n):
        if i < 14:
            weights.append(0.0)
            continue
        window = closes[i - 13 : i + 1]
        hi, lo = max(window), min(window)
        k = (closes[i] - lo) / (hi - lo) * 100 if hi != lo else 50.0
        long_signal = (k > 50) and (rsi[i] > 50) and (rsi[i] < 70)
        weights.append(1.0 if long_signal else 0.0)
    return weights


def sma_strategy(quotes: list[Quote]) -> list[float]:
    closes = _closes(quotes)
    n = len(closes)
    weights = []
    for i in range(n):
        if i < 50:
            weights.append(0.0)
            continue
        sma20 = sum(closes[i - 19 : i + 1]) / 20
        sma50 = sum(closes[i - 49 : i + 1]) / 50
        weights.append(1.0 if sma20 > sma50 else 0.0)
    return weights


def zmr_strategy(quotes: list[Quote]) -> list[float]:
    """Zero-mean reversion: long when price is N std-devs below 50d mean."""
    import math
    closes = _closes(quotes)
    n = len(closes)
    weights = []
    for i in range(n):
        if i < 50:
            weights.append(0.0)
            continue
        window = closes[i - 49 : i + 1]
        mu = sum(window) / 50
        var = sum((x - mu) ** 2 for x in window) / 49
        sd = math.sqrt(var) if var > 0 else 0.0
        z = (closes[i] - mu) / sd if sd > 0 else 0.0
        weights.append(1.0 if z < -1.0 else 0.0)
    return weights


@dataclass(frozen=True)
class Baseline:
    name: str
    fn: Callable[[list[Quote]], list[float]]


BUILTIN_BASELINES: list[Baseline] = [
    Baseline("Buy&Hold", buy_and_hold),
    Baseline("MACD", macd_strategy),
    Baseline("KDJ+RSI", kdj_rsi_strategy),
    Baseline("SMA", sma_strategy),
    Baseline("ZMR", zmr_strategy),
]
