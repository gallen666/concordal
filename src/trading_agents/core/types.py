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

from pydantic import BaseModel, Field, computed_field


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
    # --- consensus check (optional, env-gated) ----------------------------
    # When TA_DECISIONS_CONSENSUS_CHECK=true AND a second LLM provider key
    # is set (e.g. DEEPSEEK_API_KEY), the manager re-runs the final
    # synthesis with a different model and compares. agreement_score=1.0
    # = identical side + identical confidence; <1.0 = disagreement. None
    # = consensus check disabled or unavailable.
    consensus: dict | None = None

    # --- v90 sell-side research format ------------------------------------
    # Modelled after Morgan Stanley equity research format. The four fields
    # below let the frontend render the decision as a professional research
    # note (headline + key takeaways + relative rating + compliance footer)
    # instead of a generic "BUY/HOLD/SELL" sticker. All are optional for
    # backward compatibility — pre-v90 decisions render unchanged.

    # MS-style headline: action verb + quantified object + state
    # e.g. "AI Inference Demand Drives $800bn Capex Supercycle — AAPL O/W"
    headline: str | None = None

    # 4 bullet Key Takeaways, each loaded with numbers + time anchor + delta
    # e.g. "May rack deployment down 11-12% MoM — first decline since 2025"
    key_takeaways: list[str] = Field(default_factory=list)

    # Rating relativity: "vs industry coverage universe" / "vs S&P 500" /
    # "vs CSI 300". Used in the footer to make Overweight/Underweight
    # legally defensible (relative call, not an absolute price prediction).
    benchmark: str | None = None

    # Investment horizon. MS standard is 12-18 months. Sets reader
    # expectation that short-term price moves don't invalidate the call.
    time_horizon: str = "12-18 months"

    # Whether the rating is risk-adjusted (Sharpe-style) or raw total return.
    # MS uses risk-adjusted — gives the analyst legal cover when a high-vol
    # name underperforms in absolute terms but outperforms vs the peer set
    # on a risk-adjusted basis.
    risk_adjusted: bool = True


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


class MacroSnapshot(BaseModel):
    """Top-down macro context — sourced from OpenBB / FRED / IMF / BLS.

    Optional snapshot. When the adapter doesn't provide one, the Macro
    analyst stage is skipped. All numeric fields are point-in-time as of
    `asof` (no lookahead). Free-form `notes` may include qualitative
    context like "FOMC raised 25bp at last meeting" that the analyst can
    quote.

    Source values are kept generic so the same shape works for US-equity
    decisions (FRED-led) and CN/EM decisions (PBoC / NBS / IMF-led).
    """

    asof: date
    region: str = "US"  # "US" | "CN" | "EU" | "JP" | "EM"
    # ---- inflation ----
    cpi_yoy: float | None = None        # headline CPI year-over-year %
    core_cpi_yoy: float | None = None   # ex food & energy
    pce_yoy: float | None = None        # Fed-preferred inflation gauge
    # ---- labor ----
    unemployment_rate: float | None = None
    nfp_change_3mo_avg: float | None = None  # nonfarm payrolls 3-month avg
    # ---- rates / yield curve ----
    policy_rate: float | None = None    # Fed funds upper / PBoC LPR / ECB depo
    yield_2y: float | None = None
    yield_10y: float | None = None
    yield_curve_2y10y: float | None = None  # 10y - 2y, negative = inverted
    # ---- growth ----
    gdp_yoy: float | None = None
    ism_pmi_manufacturing: float | None = None  # >50 expansion, <50 contraction
    ism_pmi_services: float | None = None
    retail_sales_yoy: float | None = None
    # ---- liquidity ----
    m2_yoy: float | None = None
    dxy_level: float | None = None      # US dollar index — risk-on/off proxy
    # ---- free-form context ----
    sources: list[str] = Field(default_factory=list)
    notes: str | None = None


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
    # Alpha158-inspired factor priors (ROC_*, STD_*, VSTD_*, BIAS_*, RSV_5,
    # MA_DIFF, KMID) computed inline from price/volume history. Populated
    # by adapters that have a price-history endpoint; empty dict means the
    # adapter declined to compute (e.g. <60 bars available).
    factors: dict[str, float] = Field(default_factory=dict)
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

    analyst: Literal["fundamentals", "sentiment", "news", "technical", "macro"]
    ticker: str
    asof: date
    body: str
    # `Any` because real LLMs sometimes return nested objects (e.g. a
    # "signals" wrapper around the actual key/value pairs, or a list of
    # qualifiers per signal). Strict scalar typing here was causing
    # cascade failures from Gemini output. Downstream consumers stringify
    # this for the trader/risk prompts so any JSON-serializable shape works.
    signals: dict[str, object] = Field(default_factory=dict)
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
    # Who triggered this decision. Optional for backward compatibility with
    # older JSONL rows written before this field existed.
    user_id: str | None = None
    # Snapshot of close at decision time, so forward return can be computed
    # later without re-fetching historical adjusted prices.
    decision_close: float | None = None
    market: str | None = None


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

    # v52: was @property — Pydantic v2 doesn't serialize @property into JSON,
    # so frontend's `trace.total_cost_usd` was always undefined → UI showed
    # $0.0000. @computed_field tells Pydantic to include it in model_dump().
    @computed_field  # type: ignore[prop-decorator]
    @property
    def total_cost_usd(self) -> float:
        return round(sum(u.usd_cost for u in self.usage), 4)
