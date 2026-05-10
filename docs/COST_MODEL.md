# Backtest cost model

We charge realistic friction in backtests because under-charging makes
strategies look better than they are, and the whole point of running
the agent on history is to reality-check expected forward performance.

## Defaults

| Market | Commission (one side) | Slippage (one side) | Sell-side tax | Round-trip |
|---|---|---|---|---|
| US equity | 5 bp | 5 bp | — | **10 bp** |
| A-share | 5 bp | 5 bp | 5 bp (印花税) | **15 bp** |
| Crypto | 5 bp | 5 bp | — | **10 bp** |

Costs are charged proportional to absolute weight change (turnover).
A 100% → 0% exit pays one full round-trip; a 50% → 50% (no change)
pays nothing.

## How to override

```python
from trading_agents.backtest.engine import Backtester

# Per-market defaults (recommended)
bt = Backtester.for_market(adapter)

# Custom — institutional execution path
bt = Backtester.for_market(
    adapter,
    commission_bps=2.0,    # 2bp commission
    slippage_bps=1.0,      # 1bp slip
    sell_tax_bps=0.0,
)
```

## What changed (May 2026)

The previous defaults were 1bp commission + 2bp slippage = **3bp
round-trip**, which was unrealistic for retail-scale execution. Backtest
reports generated before May 10 2026 used those numbers; they are
**not directly comparable** to current outputs.

If you have an old `reports/*.json` and want to roughly translate to
the new model, expect ~7bp lower annualised return per round-trip per
year of holding period for a strategy that turns over its book once a
year. For high-turnover strategies the gap will be wider.

## Why we keep it pessimistic

A backtest that under-charges friction is a backtest that lies to you
about live performance. Better to be unpleasantly surprised by a
lower-than-expected backtest number than to be unpleasantly surprised
by lower-than-expected real PnL.
