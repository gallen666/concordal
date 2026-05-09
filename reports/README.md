# Backtest reports

Output of `python -m trading_agents.backtest.agent_backtest`. Each file is one
end-to-end run of the 7-agent pipeline across multiple tickers and dates.

## File naming

- `backtest-YYYY-MM-DD-HHMM.json` — historical runs (kept for audit)
- `latest.json` — symlink to the most recent run, read by the frontend
- `smoke.json` — mock-mode smoke test output (no LLM, useful for harness CI)

## Schema (one run)

```jsonc
{
  "config": { "tickers": [...], "start": "...", "end": "...", ... },
  "started_at": "...",
  "wall_clock_seconds": 0,
  "n_decisions": 0,
  "estimated_cost_usd": 0,
  "per_ticker": [
    {
      "ticker": "AAPL",
      "agent_metrics": { "cumulative_return": ..., "sharpe": ..., ... },
      "bh_metrics":    { ... },             // Buy & Hold baseline
      "macd_metrics":  { ... } | null,
      "agent_curve":   [...],                // equity curve (start = 100k)
      "bh_curve":      [...],
      "rebalance_dates": ["2025-08-04", ...],
      "decisions":      [{ "asof": "...", "side": "BUY", ... }, ...]
    }
  ],
  "portfolio": {
    "agent": { "cumulative_return": ..., "sharpe": ..., ... },
    "bh":    { ... },
    "excess_return_vs_bh": ...,
    "excess_sharpe_vs_bh": ...,
    "pct_tickers_agent_beats_bh": ...
  }
}
```

## How to run

Local (Mac / Linux):

```sh
double-click outputs/run_agent_backtest.command
```

Or directly:

```sh
export GEMINI_API_KEY=AIzaSy...
export PYTHONPATH=src
python -m trading_agents.backtest.agent_backtest \
    --tickers AAPL,NVDA,300750 \
    --start 2025-04-01 --end 2025-05-01 \
    --rebalance-days 5 \
    --output reports/backtest-$(date +%F-%H%M).json
```
