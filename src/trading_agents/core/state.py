"""LangGraph state schema for one decision run.

A `DecisionState` flows through the graph: analysts populate their slots,
researchers append their debate, the trader fills `trader_plan`, risk fills
`risk_debate`, the manager fills `decision`. Mid-run the graph can branch on
flags (e.g. skip risk debate if conviction is borderline-uniform).
"""

from __future__ import annotations

from datetime import date
from typing import TypedDict

from .types import (
    AnalystReport,
    DebateTranscript,
    Decision,
    Fundamentals,
    NewsItem,
    Quote,
    SentimentSummary,
    TechnicalSnapshot,
    TokenUsage,
)


class DecisionState(TypedDict, total=False):
    # --- inputs ---
    ticker: str
    asof: date
    market: str
    user_risk_profile: str  # "conservative" | "balanced" | "aggressive"

    # --- raw data populated by adapter (Phase 2) ---
    fundamentals: Fundamentals
    news: list[NewsItem]
    sentiment: SentimentSummary
    technical: TechnicalSnapshot
    quote: Quote

    # --- analyst outputs ---
    fundamentals_report: AnalystReport
    sentiment_report: AnalystReport
    news_report: AnalystReport
    technical_report: AnalystReport

    # --- researcher debate ---
    researcher_debate: DebateTranscript

    # --- trader synthesis ---
    trader_plan: str

    # --- risk team debate ---
    risk_debate: DebateTranscript

    # --- final decision (manager) ---
    decision: Decision
    manager_review: str

    # --- bookkeeping ---
    usage: list[TokenUsage]
    flags: list[str]
