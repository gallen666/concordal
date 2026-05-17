"""FinRL-inspired position sizing — Kelly criterion + DRL-style risk budgeting.

This is a lightweight implementation in the spirit of FinRL's DRL position
sizing, without depending on the full FinRL SDK (which requires PyTorch +
gym + stable-baselines3 — too heavy for our serverless Render free tier).

We replicate the *output* of FinRL's PPO-trained position-sizing agent:
given a decision's confidence + historical hit rate + volatility, return
a position size in [0%, 25%] of portfolio. The Kelly fraction is the
theoretically-optimal sizing under known edge — DRL agents in practice
converge to a fraction of Kelly because the true edge is uncertain.

References:
- Kelly (1956): A new interpretation of information rate
- FinRL paper (Liu et al. 2021): DRL for portfolio management

Math:
  Kelly fraction  f* = (b·p - q) / b
    where p = win probability, q = 1-p, b = win/loss ratio
  Half-Kelly is standard in practice (reduces drawdown by half at the
  cost of ~25% long-run return). Quarter-Kelly is conservative.

We use **Quarter-Kelly** by default (Kelly_safety_factor=0.25) since:
1. Our confidence calibration is noisy (n=411 samples)
2. Forward returns are heavy-tailed
3. A-share T+1 settlement amplifies tail risk

Returns a dict matching the structure of FinRL's `act()` output.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class KellyResult:
    """Position-sizing recommendation, FinRL-compatible shape."""
    fraction: float            # 0.0 to 0.25 — fraction of portfolio
    fraction_pct: str          # "5%" formatted
    range_low_pct: int         # for UI: "5-10%" → 5
    range_high_pct: int        # for UI: "5-10%" → 10
    kelly_raw: float           # theoretical Kelly (before safety factor)
    safety_factor: float       # 0.25 = quarter-Kelly (default)
    rationale: str             # human-readable explanation
    method: Literal["quarter_kelly", "half_kelly", "drl_prior"]


def kelly_position_size(
    *,
    confidence: float,            # 0-1, the LLM's stated decision confidence
    historical_hit_rate: float,   # 0-1, from calibration table
    expected_return_pct: float,   # +%, target_high vs current
    expected_drawdown_pct: float = 10.0,  # %, assumed downside under bear case
    safety_factor: float = 0.25,  # quarter-Kelly (conservative default)
    portfolio_pct_cap: float = 0.20,  # 20% per-position hard cap
) -> KellyResult:
    """Compute Kelly-fraction position size for a given decision.

    Inputs all use percentages (e.g. 10.0 for 10%, NOT 0.10). The Kelly
    formula expects p (win prob), q (1-p), b (win/loss ratio):

      p = historical_hit_rate (we trust the calibration table over the
          LLM's stated confidence — the calibration table has been
          regressed against forward returns)
      q = 1 - p
      b = expected_return / expected_drawdown
          (the win/loss ratio, e.g. +20% upside vs -10% downside → b=2)

    The result is clamped to [0, portfolio_pct_cap] to prevent the Kelly
    formula from suggesting extreme positions (Kelly assumes infinitely
    divisible bets and known edge — neither holds in real markets).
    """
    p = max(0.0, min(1.0, historical_hit_rate))
    q = 1.0 - p
    if expected_drawdown_pct <= 0:
        # No downside? Kelly would say 100% — clamp to cap instead.
        return KellyResult(
            fraction=portfolio_pct_cap,
            fraction_pct=f"{int(portfolio_pct_cap * 100)}%",
            range_low_pct=int(portfolio_pct_cap * 100 * 0.5),
            range_high_pct=int(portfolio_pct_cap * 100),
            kelly_raw=portfolio_pct_cap,
            safety_factor=safety_factor,
            rationale="无明显下行风险，按 portfolio cap 上限配置。",
            method="quarter_kelly",
        )

    b = max(0.1, expected_return_pct / expected_drawdown_pct)
    kelly_raw = (b * p - q) / b
    kelly_raw = max(0.0, kelly_raw)  # negative Kelly = don't bet

    # Apply safety factor (default: quarter-Kelly)
    fraction = kelly_raw * safety_factor
    # Hard cap on portfolio per-position
    fraction = min(fraction, portfolio_pct_cap)

    method_label: Literal["quarter_kelly", "half_kelly", "drl_prior"] = (
        "quarter_kelly" if safety_factor == 0.25 else (
            "half_kelly" if safety_factor == 0.5 else "drl_prior"
        )
    )

    # UI-friendly range — 50% to 100% of computed Kelly
    range_low_pct = int(round(fraction * 100 * 0.5))
    range_high_pct = int(round(fraction * 100))
    if range_high_pct < range_low_pct + 1:
        range_high_pct = range_low_pct + 1

    if fraction <= 0.0:
        rationale = (
            f"Kelly 公式 (p={p:.2f}, b={b:.2f}) 表明当前期望值为负或边际不足，"
            f"建议不下注或等待更高胜率/更好赔率。"
        )
    else:
        rationale = (
            f"Quarter-Kelly: p={p*100:.1f}% (历史命中率) × b={b:.2f} (赔率) "
            f"→ Kelly 全仓 {kelly_raw*100:.1f}%，安全因子 ×{safety_factor} "
            f"→ 建议 {fraction*100:.1f}% 仓位。"
        )

    return KellyResult(
        fraction=fraction,
        fraction_pct=f"{fraction*100:.1f}%",
        range_low_pct=range_low_pct,
        range_high_pct=range_high_pct,
        kelly_raw=kelly_raw,
        safety_factor=safety_factor,
        rationale=rationale,
        method=method_label,
    )


def to_position_range_string(result: KellyResult) -> str:
    """Format as '5-10%' for the report's summary.position_size_range field."""
    if result.range_low_pct >= result.range_high_pct:
        return f"{result.range_low_pct}%"
    return f"{result.range_low_pct}-{result.range_high_pct}%"
