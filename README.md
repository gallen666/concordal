# TradingAgents Platform

### 👉 Live site: **[trading-agents-platform.vercel.app](https://trading-agents-platform.vercel.app)**

Closed beta — invite code `trial` lets anyone in to try the demo. Friend codes
`gallen-fr-1` … `gallen-fr-10` are also active. Real-LLM mode (Gemini 3.1 Pro
Preview) is gated to allowlisted accounts; everyone else sees the mock pipeline
so the demo never burns through the API quota.

---

A multi-agent LLM trading **decision-support** platform inspired by the
[TradingAgents paper](https://arxiv.org/abs/2412.20138)
(Xiao, Sun, Luo, Wang — UCLA / MIT / Tauric Research). Specialized
LLM agents — fundamentals, sentiment, news, technical, **macro**,
bull/bear researcher debate, trader, three-way risk committee, fund
manager — produce a fully traceable buy / overweight / hold / underweight
/ sell recommendation per ticker.

> ⚠️ **Decision support, not investment advice.** See `docs/COMPLIANCE.md`.

## What ships today

* **Multi-market**: US equities (yfinance), A-share (akshare), **crypto via CCXT**.
* **5-analyst pipeline**: fundamentals + sentiment + news + technical + **macro** (FRED/IMF via OpenBB SDK).
* **Point-in-time fundamentals** for backtests via SEC EDGAR XBRL — no lookahead bias.
* **Live progress**: every stage reports start/done so the UI shows a live timeline instead of a 90s spinner.
* **OpenBB Workspace integration**: 3 widgets (Decision / Macro Brief / Track Record) — paste `<host>/openbb/widgets.json` into OpenBB Workspace settings.
* **Ecosystem hub** (`/ecosystem`): registry of 10 best-of-breed OSS quant projects + universal data bus + cross-pollination.
* **Reflection loop**: prior decisions on a ticker, enriched with realised forward return, get injected into the Manager prompt.
* **Honest cost model**: 10bp round-trip US, 15bp A-share with stamp tax — defaults are pessimistic by design.
* **Self-diagnosis**: `GET /v1/health` lists every feature flag + env var status; missing keys surface as a "warnings" badge in the header.
* **6 LLM providers** auto-detected: Gemini, OpenAI, Anthropic, plus the Chinese tier — **DeepSeek** (V3 + R1 reasoner), **Qwen** (DashScope), **GLM** (智谱). Same fallback-chain mechanism applies — a provider rate-limit drops to its own family's cheaper tier, then mock. Set any of `DEEPSEEK_API_KEY` / `DASHSCOPE_API_KEY` / `ZHIPU_API_KEY` to opt in. CN-locale users get better Chinese output and ~10× lower cost.

## Why this codebase exists vs. the paper repo

The official [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents)
is a single-user research CLI hard-coded to US equities + OpenAI. This fork
adds the production layer:

| Concern               | Paper repo  | This repo                                  |
|-----------------------|-------------|---------------------------------------------|
| Markets               | US equity   | Pluggable `MarketAdapter` (US, A-share, HK, crypto, futures) |
| LLM providers         | OpenAI only | Router across OpenAI, Anthropic, mock      |
| Cost control          | Implicit    | Explicit FAST/MID/DEEP tiers + ticker cache |
| No-lookahead          | Best effort | Enforced at adapter boundary               |
| Backtest baselines    | Yes         | Yes (Buy&Hold, MACD, KDJ+RSI, SMA, ZMR)    |
| Multi-tenant API      | No          | FastAPI with per-user job isolation        |
| Frontend              | No          | Next.js 15 (Watchlist / Decision / Backtest) |
| Compliance posture    | N/A         | Documented, regime-aware, never executes trades |
| Tests                 | Sparse      | End-to-end + invariants                    |

## Quick start (no API keys needed)

```bash
git clone <this repo>
cd trading-agents-platform

# Install deps
pip install -e .

# Run a single decision (uses MockAdapter + MockProvider)
PYTHONPATH=src python examples/run_decision.py

# Run a backtest comparing 5 baselines + the agent
PYTHONPATH=src python examples/run_backtest.py

# Or via the CLI
ta decide AAPL --rounds 2
ta backtest AAPL --days 120

# Run tests
PYTHONPATH=src pytest -q tests/
```

## Plug in real providers

Copy `.env.example` to `.env` and set:

```
TA_MODE=live
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
TA_MODEL_FAST=gpt-4o-mini
TA_MODEL_MID=claude-sonnet-4-6
TA_MODEL_DEEP=claude-opus-4-6
```

For real US equity data:

```bash
pip install yfinance
```

Then in `adapters/registry.py`:
```python
from .yahoo_us_equity import YahooUSEquityAdapter
register_adapter("us_equity", YahooUSEquityAdapter)
```

## Run the API

```bash
pip install -e ".[api]"
cp .env.example .env          # has invite code "trial:*" for local
uvicorn api.main:app --reload --port 8000
```

The OpenAPI docs are at `http://localhost:8000/docs`. In closed-beta mode
you need to redeem an invite code first (`POST /v1/auth/redeem`).

## 试运营上线 (closed beta deploy)

See [`docs/DEPLOY.md`](docs/DEPLOY.md) for the half-day path:
GitHub → Railway (backend) → Vercel (frontend) → invite users via
`TA_INVITE_CODES`. Total cost <$10/mo until you flip on real LLM access.

## Run the frontend

```bash
cd web
cp .env.example .env.local      # set NEXT_PUBLIC_API
npm install
npm run dev
```

## Project layout

```
trading-agents-platform/
├── src/trading_agents/
│   ├── core/         # state, types, regime profiles, LangGraph wiring
│   ├── adapters/     # MarketAdapter implementations (mock, yahoo, ...)
│   ├── prompts/      # PromptPack per (market, language)
│   ├── agents/       # the 7 roles
│   ├── llm/          # router with FAST/MID/DEEP tiers and mock fallback
│   ├── backtest/     # strict-no-lookahead engine, metrics, baselines
│   ├── memory/       # JSONL store of decisions + reflections
│   ├── cache/        # ticker-level shared cache (cost lever)
│   └── cli.py
├── api/              # FastAPI service
├── web/              # Next.js 15 frontend
├── examples/         # runnable demos
├── tests/
└── docs/
    ├── ARCHITECTURE.md
    └── COMPLIANCE.md
```

## Roadmap

See `TradingAgents_产品路线图.md` (Chinese) for the six-phase plan that
shipped this codebase. Major milestones:

- ✅ Phase 0 — Fork & understand official repo
- ✅ Phase 1 — Backtester + metrics + baselines (no-lookahead enforced)
- ✅ Phase 2 — `MarketAdapter` + `PromptPack` + `RegimeProfile` abstractions
- ✅ Phase 3 — LLM router with tier-based cost optimization + ticker cache
- ✅ Phase 4 — FastAPI + Next.js product shell
- ✅ Phase 5 — Compliance docs + paper-trading-only stance
- 🔜 Phase 6 — Real adapter for second market (crypto recommended)
- 🔜 Phase 7 — Postgres migration, Celery workers, Clerk + Stripe

## Test status

```
$ PYTHONPATH=src pytest -q tests/
..........                                                               [100%]
10 passed in 0.06s
```

## License

MIT (this repo). Original TradingAgents paper © Tauric Research; respect
their licence in any derivative work.
