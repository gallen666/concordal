"""Ground-truth quote preamble for every LLM prompt in the 7-agent pipeline.

WHY THIS EXISTS (v55, P0):

Prior to v55, the prompt design had a fatal gap: NO single LLM call in the
pipeline (analyst / bull / bear / trader / risk / manager) ever received
the current quote as direct ground truth in its `user` message.

Each analyst saw its own fetcher snapshot (fundamentals → FactSheet,
technical → TechnicalSnapshot, ...). Each downstream agent saw only the
*narratives* upstream analysts produced. So if any upstream layer
hallucinated or read a stale row, the error was unrecoverable — manager
had no anchor to cross-check.

This module builds a frozen `=== GROUND TRUTH QUOTE ===` block, fed
into the `user` prompt of every LLM call. The block is concatenated
*above* role-specific content so the LLM sees it before reasoning
starts. We then tell the LLM (via the block's own copy) that this is
authoritative — if a downstream analyst's body contradicts the close
price here, it should flag the discrepancy rather than carry it forward.

The block pulls from `state["quote"]` (set by `quote_node` in
analysts.py:236) which is sourced from the adapter's get_quote() with
the cn_equity multi-source fallback (Tencent → Sina → Xueqiu for
A-share, yfinance for US, CCXT for crypto).

If `state["quote"]` is missing or doesn't have a usable close (network
miss), the block produces a small `UNAVAILABLE` notice — the LLM is
explicitly told "no quote available, do not fabricate one" rather than
being given silent space to invent.

USAGE:

    from ._quote_block import ground_truth_quote_block
    user = ground_truth_quote_block(state) + role_specific_user_body

That's it. One import line per agent / prompt-render call site.
"""

from __future__ import annotations

from typing import Any


def ground_truth_quote_block(state: dict[str, Any]) -> str:
    """Render the GROUND TRUTH QUOTE preamble for any LLM user-prompt.

    Returns either a populated block (when state["quote"] is a valid
    Quote-shaped object) or a 'UNAVAILABLE' block telling the LLM
    explicitly not to fabricate a price.

    Returns include trailing double-newline so callers can simply
    concatenate without thinking about spacing.
    """
    quote = state.get("quote")
    ticker = state.get("ticker", "?")
    market = state.get("market", "?")

    if not quote:
        return (
            "=== GROUND TRUTH QUOTE (DO NOT FABRICATE) ===\n"
            f"Ticker: {ticker} (market={market})\n"
            "UNAVAILABLE — the quote fetcher returned no data for this ticker.\n"
            "Do NOT invent a price. If a price is referenced, label it as\n"
            "UNKNOWN and recommend HOLD with a low confidence due to data\n"
            "insufficiency.\n"
            "============================================\n\n"
        )

    # Quote can be a pydantic model (core.types.Quote) or a dict; handle both.
    def _get(obj: Any, key: str, default: Any = None) -> Any:
        if obj is None:
            return default
        if isinstance(obj, dict):
            return obj.get(key, default)
        return getattr(obj, key, default)

    close = _get(quote, "close")
    open_ = _get(quote, "open")
    high = _get(quote, "high")
    low = _get(quote, "low")
    volume = _get(quote, "volume")
    asof_ts = _get(quote, "asof")

    # Currency hint — handy for the LLM so it doesn't render $ on an A-share.
    if market == "a_share":
        currency = "CNY (¥)"
    elif market in {"crypto", "btc", "eth"}:
        currency = "USD (₿ instrument)"
    elif market in {"hk_equity", "hong_kong"}:
        currency = "HKD (HK$)"
    else:
        currency = "USD ($)"

    asof_str = asof_ts.isoformat() if hasattr(asof_ts, "isoformat") else str(asof_ts)

    lines = [
        "=== GROUND TRUTH QUOTE (DO NOT FABRICATE) ===",
        f"Ticker: {ticker} (market={market})",
        f"Currency: {currency}",
        f"Asof timestamp: {asof_str}",
    ]
    if close is not None:
        lines.append(f"Close: {close}")
    if open_ is not None:
        lines.append(f"Open: {open_}")
    if high is not None:
        lines.append(f"High: {high}")
    if low is not None:
        lines.append(f"Low: {low}")
    if volume is not None:
        lines.append(f"Volume: {volume}")
    lines.append(
        "RULES: This is the authoritative price. If any analyst body /"
    )
    lines.append(
        "snapshot below disagrees with the close above, FLAG the"
    )
    lines.append(
        "discrepancy ('upstream stale data') instead of trusting it."
    )
    lines.append("============================================")

    return "\n".join(lines) + "\n\n"
