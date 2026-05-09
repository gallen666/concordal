"""Decision reflection: what worked, what didn't, what to do this time.

Inspired by TauricResearch/TradingAgents v0.2.4's persistent decision log:
each completed run leaves a record, and on the next run for the same ticker
the system fetches the prior decisions + their realised returns and writes
a short reflection that gets injected into the Manager's prompt.

Why this matters:
    Without reflection the framework is a stateless function — every call
    is a fresh roll of the dice. With reflection the system genuinely
    learns from its own history: "last time on AAPL we went OVERWEIGHT at
    $182, and 14 days later it was up 4.2% so the bull thesis was right
    BUT the risk team flagged buyback dilution which proved overstated.
    This time keep that lesson in mind."

The injected reflection is short by design (200-400 chars) — long enough
to anchor the manager's view, short enough not to dominate the prompt.

Lookups are O(N_files * N_lines); fine for closed beta. Move to indexed
storage when this gets slow.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterable

from ..adapters.base import MarketAdapter
from ..core.types import ReflectionEntry
from .store import MemoryStore

log = logging.getLogger(__name__)


@dataclass
class PastCallSummary:
    """One historical decision, enriched with how it actually played out."""

    decision_date: date
    side: str                       # BUY/OVERWEIGHT/HOLD/UNDERWEIGHT/SELL
    target_weight: float
    confidence: float
    rationale_first_line: str
    realised_return: float | None   # close_today / close_at_decision - 1
    days_held: int | None
    was_correct_direction: bool | None  # signed-correct (BUY+up = True)


def _enrich(
    entry: ReflectionEntry,
    today: date,
    adapter: MarketAdapter,
) -> PastCallSummary:
    """Compute realised return + correctness for one historical entry."""
    realised = None
    correct = None
    days = None
    if entry.decision_close:
        try:
            from datetime import datetime, timezone
            ts = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc)
            q = adapter.get_quote(entry.ticker, ts)
            if q and q.close:
                realised = q.close / entry.decision_close - 1.0
                days = (today - entry.decision_date).days
                w = entry.decision.target_weight
                if w != 0:
                    direction = 1 if w > 0 else -1
                    correct = (1 if realised > 0 else -1) == direction
        except Exception as e:
            log.debug("could not enrich %s @ %s: %s", entry.ticker, entry.decision_date, e)
    rationale = (entry.decision.rationale or "").split("\n")[0]
    if len(rationale) > 200:
        rationale = rationale[:197] + "..."
    side = (
        entry.decision.side.value
        if hasattr(entry.decision.side, "value")
        else str(entry.decision.side)
    )
    return PastCallSummary(
        decision_date=entry.decision_date,
        side=side,
        target_weight=entry.decision.target_weight,
        confidence=entry.decision.confidence,
        rationale_first_line=rationale,
        realised_return=realised,
        days_held=days,
        was_correct_direction=correct,
    )


def collect_lessons(
    *,
    ticker: str,
    user_id: str | None,
    today: date,
    memory: MemoryStore,
    adapter: MarketAdapter,
    max_calls: int = 5,
    max_age_days: int = 365,
    locale: str = "en",
) -> str:
    """Build a short string for injection into the next decision's prompt.

    Returns "" when there's nothing useful to say (no past calls, all too
    old, or no realised data yet). The caller should treat empty string
    as "no-op" and skip injection.
    """
    raw_entries = memory.recent(ticker, n=50)
    cutoff = today - timedelta(days=max_age_days)

    # Filter: same user (if given), recent, has realised data we can compute
    candidates: list[ReflectionEntry] = []
    for e in raw_entries:
        if e.decision_date >= today:
            continue  # the call we're making right now
        if e.decision_date < cutoff:
            continue
        if user_id and e.user_id and e.user_id != user_id:
            # If we have a user_id filter, only count the user's own past calls.
            # Treat null user_id as "anyone" for back-compat with old rows.
            continue
        candidates.append(e)
    if not candidates:
        return ""

    # Sort by date desc, take most recent N
    candidates.sort(key=lambda x: x.decision_date, reverse=True)
    candidates = candidates[:max_calls]

    summaries = [_enrich(e, today, adapter) for e in candidates]
    # Drop ones we couldn't enrich at all (no realised return) — they don't
    # carry a lesson yet.
    summaries = [s for s in summaries if s.realised_return is not None]
    if not summaries:
        return ""

    return _format(summaries, ticker, locale)


# ---------------------------------------------------------------------------
# Formatting
# ---------------------------------------------------------------------------


def _format(rows: list[PastCallSummary], ticker: str, locale: str) -> str:
    if locale == "zh":
        return _format_zh(rows, ticker)
    return _format_en(rows, ticker)


def _format_en(rows: list[PastCallSummary], ticker: str) -> str:
    lines: list[str] = []
    lines.append(
        f"---\nLessons from prior decisions on {ticker} (most recent first). "
        "Treat this as institutional memory — repeat what worked, avoid prior "
        "mistakes, and explicitly acknowledge any contradictions in your "
        "current rationale:"
    )
    correct = sum(1 for r in rows if r.was_correct_direction)
    if rows:
        hit_rate = correct / len(rows)
        lines.append(f"Track record on this ticker: {correct}/{len(rows)} prior calls were directionally correct ({hit_rate:.0%}).")
    for r in rows:
        outcome = "n/a"
        if r.realised_return is not None:
            sign = "+" if r.realised_return >= 0 else ""
            outcome = f"{sign}{r.realised_return * 100:.1f}% in {r.days_held}d"
            if r.was_correct_direction is True:
                outcome += " (call was right)"
            elif r.was_correct_direction is False:
                outcome += " (call was wrong)"
        lines.append(
            f"- {r.decision_date}: {r.side} @ weight {r.target_weight:+.2f}, "
            f"confidence {r.confidence:.0%}, outcome={outcome}. "
            f"Rationale: {r.rationale_first_line}"
        )
    lines.append("---")
    return "\n".join(lines)


def _format_zh(rows: list[PastCallSummary], ticker: str) -> str:
    lines: list[str] = []
    lines.append(
        f"---\n关于 {ticker} 的历史决策回顾（最新在前）。请把这视作机构记忆 —— "
        "复用有效的判断、避免之前的错误，并在本次理由中明确承认任何矛盾："
    )
    correct = sum(1 for r in rows if r.was_correct_direction)
    if rows:
        hit_rate = correct / len(rows)
        lines.append(
            f"该股票历史方向命中率：{correct}/{len(rows)} 次（{hit_rate:.0%}）。"
        )
    for r in rows:
        outcome = "暂无"
        if r.realised_return is not None:
            sign = "+" if r.realised_return >= 0 else ""
            outcome = f"{sign}{r.realised_return * 100:.1f}%（{r.days_held} 天）"
            if r.was_correct_direction is True:
                outcome += "，方向正确"
            elif r.was_correct_direction is False:
                outcome += "，方向错误"
        lines.append(
            f"- {r.decision_date}：{r.side}，目标仓位 {r.target_weight:+.2f}，"
            f"置信度 {r.confidence:.0%}，结果={outcome}。理由：{r.rationale_first_line}"
        )
    lines.append("---")
    return "\n".join(lines)
