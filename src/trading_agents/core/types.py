"""Shared data types used across adapters, agents and the backtester.

These are the *structured facts* layer of the protocol described in the paper:
analysts emit reports composed of these typed objects, and downstream agents
read fields directly. Free-form natural language is reserved for the debate
sub-agents (Bull/Bear researchers, risk team).
"""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Decision schema
# ---------------------------------------------------------------------------


class Side(str, Enum):
    BUY = "BUY"
    OVERWEIGHT = "OVERWEIGHT"
    HOLD = "HOLD"
    UNDERWEIGHT = "UNDERWEIGHT"
    SELL = "SELL"


class Decision(BaseModel):
    """Final trading decision emitted by the Fund Manager node."""

    ticker: str
    asof: date
    side: Side
    target_weight: float = Field(ge=-1.0, le=1.0)  # signed portfolio weight
    confidence: float = Field(ge=0.0, le=1.0)
    rationale: str
    risk_notes: str
    flags: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Market data primitives
# ---------------------------------------------------------------------------


class Quote(BaseModel):
    ticker: str
    asof: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


class Fundamentals(BaseModel):
    ticker: str
    asof: date
    market_cap: float | None = None
    pe_ratio: float | None = None
    pb_ratio: float | None = None
    eps_ttm: float | None = None
    revenue_ttm: float | None = None
    revenue_growth_yoy: float | None = None
    gross_margin: float | None = None
    operating_margin: float | None = None
    net_margin: float | None = None
    free_cash_flow_ttm: float | None = None
    debt_to_equity: float | None = None
    notes: str | None = None  # free-form summary the analyst can quote


class NewsItem(BaseModel):
    ticker: str
    headline: str
    summary: str
    source: str
    url: str | None = None
    published_at: datetime
    sentiment_score: float | None = None  # -1..+1 if pre-scored


class SentimentSummary(BaseModel):
    """Social/forum-derived sentiment over a lookback window."""

    ticker: str
    asof: date
    lookback_days: int
    mention_count: int
    bullish_share: float = Field(ge=0.0, le=1.0)
    bearish_share: float = Field(ge=0.0, le=1.0)
    top_themes: list[str] = Field(default_factory=list)
    notable_posts: list[str] = Field(default_factory=list)


class TechnicalSnapshot(BaseModel):
    ticker: str
    asof: date
    last_close: float
    sma_20: float | None = None
    sma_50: float | None = None
    sma_200: float | None = None
    ema_12: float | None = None
    ema_26: float | None = None
    macd: float | None = None
    macd_signal: float | None = None
    rsi_14: float | None = None
    kdj_k: float | None = None
    kdj_d: float | None = None
    kdj_j: float | None = None
    bollinger_upper: float | None = None
    bollinger_lower: float | None = None
    atr_14: float | None = None
    notes: str | None = None


# ---------------------------------------------------------------------------
# Analyst report objects (what each analyst node emits)
# ---------------------------------------------------------------------------


class AnalystReport(BaseModel):
    """Common parent for the four analyst reports.

    The `body` is structured natural language the researcher debate can quote
    from; `signals` is the machine-readable summary the trader / risk team
    consume to avoid information loss across the relay.
    """

    analyst: Literal["fundamentals", "sentiment", "news", "technical"]
    ticker: str
    asof: date
    body: str
    signals: dict[str, float | str | bool] = Field(default_factory=dict)
    sources: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Researcher / risk debate transcripts
# ---------------------------------------------------------------------------


class DebateTurn(BaseModel):
    speaker: str  # e.g. "bull", "bear", "aggressive", "neutral", "conservative"
    content: str
    round: int


class DebateTranscript(BaseModel):
    topic: str
    rounds: int
    turns: list[DebateTurn]
    synthesis: str | None = None  # facilitator's summary if any


# ---------------------------------------------------------------------------
# Memory / reflection objects
# ---------------------------------------------------------------------------


class ReflectionEntry(BaseModel):
    ticker: str
    decision_date: date
    decision: Decision
    realised_return: float | None = None
    alpha_vs_benchmark: float | None = None
    reflection: str | None = None


# ---------------------------------------------------------------------------
# Cost accounting (Phase 3 — visible per decision)
# ---------------------------------------------------------------------------


class TokenUsage(BaseModel):
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    usd_cost: float = 0.0


class DecisionTrace(BaseModel):
    ticker: str
    asof: date
    decision: Decision
    analyst_reports: list[AnalystReport] = Field(default_factory=list)
    researcher_debate: DebateTranscript | None = None
    risk_debate: DebateTranscript | None = None
    trader_plan: str | None = None
    manager_review: str | None = None
    usage: list[TokenUsage] = Field(default_factory=list)

    @property
    def total_cost_usd(self) -> float:
        return round(sum(u.usd_cost for u in self.usage), 4)
