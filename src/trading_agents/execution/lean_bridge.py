"""Lean / QuantConnect bridge — Roadmap Phase 5+, status=PLANNED.

Vision: every TradingAgents decision can be exported as a Lean Algorithm
Framework `Insight` so a user who already has QC infrastructure can fork our
strategy. Builds a moat against "I want to backtest your decisions on my own
universe with my own cost model".

Status: SKELETON. The function below produces the JSON shape Lean accepts;
real integration needs:
  1. Lean CLI installed locally / Docker image deployed.
  2. A `QCAlgorithm` template (Python) that calls our `/v1/decisions/{ticker}`
     endpoint nightly and converts results into insights.
  3. CI step that runs the QC backtest as cross-validation against our own
     equity curve.

For now we just emit the Insight JSON so users can paste into QC manually.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal


@dataclass(frozen=True)
class LeanInsight:
    """Lean Insight payload — mirrors QC's Insight class."""
    symbol: str
    direction: Literal["Up", "Down", "Flat"]
    confidence: float
    weight: float                       # in [0, 1]
    generated_time_utc: str             # ISO
    close_time_utc: str                 # ISO; when the insight expires
    source_model: str = "tradingagents"

    def to_lean_json(self) -> dict:
        """Lean's Insight.From() constructor format."""
        return {
            "Symbol":     self.symbol,
            "Direction":  self.direction,
            "Confidence": self.confidence,
            "Weight":     self.weight,
            "GeneratedTimeUtc": self.generated_time_utc,
            "CloseTimeUtc":    self.close_time_utc,
            "SourceModel":     self.source_model,
        }


def decision_to_insight(decision: dict, hold_days: int = 5) -> LeanInsight:
    """Convert a TradingAgents decision dict → LeanInsight.

    BUY → Up, SELL → Down, HOLD → Flat. Position-sizing maps to
    Insight.Weight (capped at 0.03 per the trader's standard limit).
    """
    action = (decision.get("action") or "HOLD").upper()
    direction: Literal["Up", "Down", "Flat"] = (
        "Up" if action == "BUY" else "Down" if action == "SELL" else "Flat"
    )
    conf = float(decision.get("confidence", 0.5))
    weight = min(0.03, float(decision.get("position_pct", 0.015)))
    now = datetime.utcnow()
    close = now + timedelta(days=hold_days)
    return LeanInsight(
        symbol=decision.get("ticker", ""),
        direction=direction,
        confidence=conf,
        weight=weight,
        generated_time_utc=now.isoformat(timespec="seconds"),
        close_time_utc=close.isoformat(timespec="seconds"),
    )
