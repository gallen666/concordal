# Architecture

## High-level

```
                           ┌──────────────────────────┐
                           │   FastAPI / Next.js UI   │
                           └────────────┬─────────────┘
                                        │ /v1/decisions, /v1/backtests
                                        ▼
                           ┌──────────────────────────┐
                           │  run_decision() pipeline │
                           └────────────┬─────────────┘
                                        │
   ┌────────────────────────────────────┴──────────────────────────────────┐
   ▼                                    ▼                                    ▼
┌───────────────┐    ┌──────────────────────────────────────┐    ┌────────────────┐
│ MarketAdapter │    │ 7-agent LangGraph state machine      │    │  PromptPack    │
│  (per market) │    │                                      │    │ (per market+   │
│  ─ Yahoo       │    │  Quote → Fund / Sent / News / Tech  │    │   language)    │
│  ─ Finnhub     │ ─► │           ↓                          │ ─► │  ─ system      │
│  ─ Tushare     │    │  Researcher debate (Bull / Bear)    │    │  ─ user        │
│  ─ CoinGecko   │    │           ↓                          │    │     templates  │
│  ─ Mock        │    │  Trader plan                         │    └────────────────┘
└───────────────┘    │           ↓                          │
                     │  Risk debate (Aggr / Cons / Neutral) │           ▲
                     │           ↓                          │           │
                     │  Fund Manager → Decision JSON        │ ◄──── LLMRouter
                     └──────────────────────────────────────┘   (FAST/MID/DEEP)
                                        │
                                        ▼
                           ┌──────────────────────────┐
                           │ MemoryStore + Cache      │
                           └──────────────────────────┘
```

## Layers

### Adapter layer (`src/trading_agents/adapters/`)

Every market - US equity, A-share, HK equity, crypto, futures - implements
`MarketAdapter` (in `base.py`). The agent graph never has market-specific
code; it talks to whichever adapter was passed in.

To add a market:

1. Subclass `MarketAdapter`, implement the 6 methods.
2. Build a matching `PromptPack`.
3. Define a `RegimeProfile` in `core/regime.py`.
4. Register the adapter via `register_adapter("market_name", FactoryClass)`.

### LLM layer (`src/trading_agents/llm/`)

`LLMRouter.complete(tier=Tier.DEEP, system=..., user=...)` returns an
`LLMResponse` with text + token usage + cost. Tiers:

| Tier  | Used by                                      | Default model      |
|-------|----------------------------------------------|---------------------|
| FAST  | (currently unused; reserve for cache fills)  | gpt-4o-mini        |
| MID   | 4 analysts, risk debate, trader, facilitator | claude-sonnet-4-6  |
| DEEP  | bull/bear debate, fund manager               | claude-opus-4-6    |

Falls back to `MockProvider` if no API keys present, so tests + CI run
deterministically.

### Agent layer (`src/trading_agents/agents/`)

One module per role. Each is a function `(state, *, adapter, pack, llm,
**deps) -> state` so it composes either into LangGraph (preferred) or a
plain sequential runner.

- `analysts.py` — fundamentals / sentiment / news / technical
- `researchers.py` — bull/bear N-round debate + facilitator synthesis
- `trader.py` — synthesis into a concrete plan
- `risk.py` — three-way risk committee
- `manager.py` — final Decision with regime-constraint enforcement

### Backtest layer (`src/trading_agents/backtest/`)

`Backtester` walks a price series day by day. Two modes:

1. `run_baseline(strategy_fn)` — deterministic strategies (Buy&Hold, MACD,
   KDJ+RSI, SMA, ZMR).
2. `run_agent(decide_fn)` — calls the agent decision pipeline at each
   rebalance; the adapter enforces no-lookahead.

Apply costs as turnover * (commission_bps + slippage_bps).

### Memory + Cache (`src/trading_agents/memory/`, `cache/`)

- `MemoryStore` — append-only JSONL of (decision, realised_return,
  reflection). Per-ticker file. Upgrade path: Postgres + pgvector for
  semantic recall.
- `TickerCache` — pickled DecisionTrace by (ticker, asof, market). Lets
  multiple users share the analyst layer for the same ticker on the same
  day. The single biggest cost lever in the system.

### API layer (`api/main.py`)

- `POST /v1/decisions` — enqueue a decision job
- `GET /v1/decisions/{job_id}` — fetch result (status: queued|done|error)
- `POST /v1/backtests` / `GET /v1/backtests/{id}`
- `GET /v1/watchlist` / `POST /v1/watchlist/items`
- `GET /v1/decisions/{ticker}/history`

In-process background tasks for v0; switch to Celery/Arq + Redis when
scaling. Auth is stubbed (`X-User-Id` header) — swap for Clerk/Auth0.

### Frontend (`web/`)

Next.js 15 App Router. Three pages:

- `/decision` — run a single ticker, see all 7 agents' contributions.
- `/backtest` — compare strategies over a window.
- `/watchlist` — daily auto-briefings (when cron worker is wired).

## State flow (`DecisionState`)

```
{
  ticker: "AAPL",
  asof: 2026-05-02,
  market: "us_equity",
  user_risk_profile: "balanced",

  # adapter populates
  fundamentals: Fundamentals(...),
  news: [NewsItem(...), ...],
  sentiment: SentimentSummary(...),
  technical: TechnicalSnapshot(...),
  quote: Quote(...),

  # analysts populate
  fundamentals_report: AnalystReport(...),
  sentiment_report:    AnalystReport(...),
  news_report:         AnalystReport(...),
  technical_report:    AnalystReport(...),

  # researchers populate
  researcher_debate: DebateTranscript(turns=[bull, bear, bull, bear, ...], synthesis=...),

  # trader populates
  trader_plan: "...",

  # risk populates
  risk_debate: DebateTranscript(turns=[aggressive, conservative, neutral]),

  # manager populates
  decision: Decision(side, target_weight, confidence, ...),
  manager_review: "...",

  # bookkeeping
  usage: [TokenUsage, ...],
  flags: ["short_blocked_by_regime", ...],
}
```

## Extension recipes

### Add a new market (e.g. crypto)

1. `src/trading_agents/adapters/coingecko_crypto.py`:
   ```python
   class CoinGeckoCryptoAdapter(MarketAdapter):
       market = "crypto"
       regime = CRYPTO
       def get_quote(self, ticker, asof): ...
       # implement remaining methods
   ```
2. `src/trading_agents/prompts/crypto_en.py`:
   ```python
   CRYPTO_EN = _CryptoPack(
       market="crypto", language="en",
       fundamentals_analyst_system=_ON_CHAIN_PROMPT,  # not financials!
       ...
   )
   ```
3. `register_adapter("crypto", CoinGeckoCryptoAdapter)` in registry bootstrap.
4. Add tests under `tests/test_crypto.py`.

### Replace the deterministic baselines

Edit `src/trading_agents/backtest/baselines.py` — each is a pure function
`list[Quote] -> list[float weight]`. The signature is the only contract.

### Plug in a real LLM

Set `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` and `TA_MODE=live` in `.env`.
The router auto-detects.
