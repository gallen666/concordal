"""Alpha158-lite — 10 high-signal factors computed inline from OHLCV.

Inspired by Microsoft Qlib's Alpha158 factor set (158 factors organised
into momentum / volatility / volume / pattern / mean-reversion families).
We pick the ~10 factors that empirically carry the most signal across
US equities + A-share + crypto (per various replication studies).

Output shape: a flat `dict[str, float]` keyed by Qlib-style names so a
future Qlib SDK upgrade can substitute in seamlessly:

    {
        "ROC_5":    0.034,    # 5-day rate of change
        "ROC_20":   0.082,
        "ROC_60":  -0.015,
        "STD_20":   0.018,    # 20-day return std (annualised)
        "VSTD_20":  0.21,     # 20-day volume std / mean (CV)
        "BIAS_5":   0.012,    # close vs 5-day MA
        "BIAS_20":  0.045,
        "RSV_5":    0.76,     # raw stochastic value
        "MA_DIFF":  0.018,    # short MA - long MA, normalised
        "KMID":     0.31,     # candle body strength
    }

We include enough that the technical analyst can quote 3-4 specific
numbers without overwhelming the prompt. The dict is JSON-serialised
into the prompt as part of the technical signal pack.

Pure-Python implementation — no pandas required. We accept a list of
Quote objects and return floats. Caller decides how to render them.
"""

from __future__ import annotations

import math
from typing import Sequence

from ..core.types import Quote

FACTOR_NAMES = (
    "ROC_5", "ROC_20", "ROC_60",
    "STD_20",
    "VSTD_20",
    "BIAS_5", "BIAS_20",
    "RSV_5",
    "MA_DIFF",
    "KMID",
)


def _ret_series(closes: list[float]) -> list[float]:
    """Daily simple returns."""
    out: list[float] = []
    for i in range(1, len(closes)):
        if closes[i - 1] == 0:
            out.append(0.0)
        else:
            out.append(closes[i] / closes[i - 1] - 1.0)
    return out


def _std(xs: list[float]) -> float:
    if len(xs) < 2:
        return 0.0
    m = sum(xs) / len(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))


def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def compute_factors(
    quotes: Sequence[Quote],
) -> dict[str, float]:
    """Compute Alpha158-lite factors from a sequence of OHLCV bars.

    Caller supplies daily bars in chronological order. We need ≥60 bars
    to populate every factor; with fewer we still emit what's possible
    and silently leave the rest at 0.0 so the analyst prompt's
    structured input never has missing keys.
    """
    closes = [float(q.close) for q in quotes]
    highs = [float(q.high) for q in quotes]
    lows = [float(q.low) for q in quotes]
    opens = [float(q.open) for q in quotes]
    vols = [float(q.volume) for q in quotes]

    out: dict[str, float] = {k: 0.0 for k in FACTOR_NAMES}

    if len(closes) < 2:
        return out

    last = closes[-1]

    # ---- ROC: rate of change over k bars --------------------------------
    for k in (5, 20, 60):
        if len(closes) > k:
            base = closes[-1 - k]
            if base > 0:
                out[f"ROC_{k}"] = round(closes[-1] / base - 1.0, 4)

    # ---- STD_20: 20-day return std (annualised) -------------------------
    if len(closes) >= 21:
        rets = _ret_series(closes[-21:])
        out["STD_20"] = round(_std(rets) * math.sqrt(252), 4)

    # ---- VSTD_20: 20-day volume coefficient of variation ----------------
    if len(vols) >= 20:
        v = vols[-20:]
        m = _mean(v)
        if m > 0:
            out["VSTD_20"] = round(_std(v) / m, 4)

    # ---- BIAS_k: close vs k-day MA, normalised --------------------------
    for k in (5, 20):
        if len(closes) >= k:
            ma = _mean(closes[-k:])
            if ma > 0:
                out[f"BIAS_{k}"] = round((last - ma) / ma, 4)

    # ---- RSV_5: raw stochastic value over 5 bars ------------------------
    # (close - min low) / (max high - min low). Range [0, 1].
    if len(closes) >= 5:
        lo = min(lows[-5:])
        hi = max(highs[-5:])
        if hi > lo:
            out["RSV_5"] = round((last - lo) / (hi - lo), 4)

    # ---- MA_DIFF: SMA20 vs SMA60, normalised by close -------------------
    if len(closes) >= 60:
        sma20 = _mean(closes[-20:])
        sma60 = _mean(closes[-60:])
        if last > 0:
            out["MA_DIFF"] = round((sma20 - sma60) / last, 4)

    # ---- KMID: candle body strength (close - open) / (high - low) -------
    # Range [-1, 1]. Strong positive bar near +1; doji near 0.
    if len(closes) >= 1:
        rng = highs[-1] - lows[-1]
        if rng > 0:
            out["KMID"] = round((closes[-1] - opens[-1]) / rng, 4)

    return out
