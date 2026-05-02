"""End-to-end demo: runs the full 7-agent pipeline on AAPL using the
mock adapter + mock LLM. No API keys required.

Usage (from project root):
    python -m examples.run_decision

Or after `pip install -e .`:
    ta decide AAPL
"""

from __future__ import annotations

from datetime import date

from trading_agents.core.graph import run_decision


def main() -> None:
    trace = run_decision(
        ticker="AAPL",
        asof=date.today(),
        market="us_equity",
        debate_rounds=2,
    )
    d = trace.decision
    print("=" * 72)
    print(f"FINAL DECISION  {d.ticker} on {d.asof}")
    print("=" * 72)
    print(f"  Side:        {d.side.value}")
    print(f"  Weight:      {d.target_weight:+.4f}")
    print(f"  Confidence:  {d.confidence:.2f}")
    print(f"  Rationale:   {d.rationale}")
    print(f"  Risk notes:  {d.risk_notes}")
    print(f"  Flags:       {d.flags or '(none)'}")
    print()
    print(f"  Total LLM cost: ${trace.total_cost_usd:.4f}")
    print(f"  Tokens (in/out): "
          f"{sum(u.input_tokens for u in trace.usage)}/{sum(u.output_tokens for u in trace.usage)}")
    print()
    print("---- Researcher debate synthesis ----")
    if trace.researcher_debate:
        print(trace.researcher_debate.synthesis)
    print()
    print("---- Risk debate (synthesis) ----")
    if trace.risk_debate:
        print(trace.risk_debate.synthesis)


if __name__ == "__main__":
    main()
