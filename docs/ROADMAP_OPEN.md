# Open Roadmap Items (post-2026-05-14 audit)

Source of truth for what's planned but not yet "LIVE". Cross-referenced
against `TradingAgents_产品路线图.md` (master) and
`src/trading_agents/ecosystem/registry.py` (per-integration state).

Each item lists: status, work remaining, prerequisites the operator must
supply (API key, account, etc.), and where the skeleton code lives.

## ✅ Just shipped (this batch)

- **Ticker-level shared cache** — `analyst_cache` SQLite table + `cache_get/put` in `api/persistence.py`. Roadmap Phase 3's "压一个数量级成本". Wire each analyst node entry through `cache_get()` to activate.
- **Multi-seed evaluation** — `seed_runs` table + `save_seed_run/get_seed_distribution`. Pass `--seeds=5` to `agent_backtest.py` to populate.
- **Classical baselines** — `src/trading_agents/backtest/classical_baselines.py`: MACD, KDJ+RSI, SMA cross, Z-score mean reversion. Pure pandas/numpy; no new deps.
- **Alpaca paper trading** — `src/trading_agents/execution/alpaca_paper.py` + `/v1/alpaca/paper/*` endpoints. **Set `ALPACA_API_KEY` + `ALPACA_API_SECRET` (paper keys only!) on Render to activate.**
- **北向资金 endpoint** — `/v1/cn/north-flow` via akshare. No setup needed.
- **龙虎榜 endpoint** — `/v1/cn/lhb` via akshare. No setup needed.
- **Lean Insight export skeleton** — `src/trading_agents/execution/lean_bridge.py`. Decisions → QC Insight JSON.
- **vnpy A-share bridge skeleton** — `src/trading_agents/execution/vnpy_bridge.py`. Decisions → vnpy OrderRequest dict.
- **FinRL skeleton** — `src/trading_agents/strategies/finrl_agent.py`. Awaiting trained policy.

## 🟡 Skeleton-ready, needs operator action

### FinRL — trained policy
- Skeleton: `src/trading_agents/strategies/finrl_agent.py`
- Needs:
  1. `pip install finrl stable-baselines3 gymnasium` in requirements.
  2. Train PPO on SPY+AAPL+NVDA 2018-2023 (4h on A100, 24h on CPU).
  3. Drop `models/finrl_us_equity.zip`.
  4. Set `FINRL_POLICY_PATH` env var on Render.
- Activate: implement `predict_position()` body (sb3 load + predict + clip).

### Lean / QuantConnect — full bridge
- Skeleton: `src/trading_agents/execution/lean_bridge.py` (Insight export done)
- Needs:
  1. A QC `QCAlgorithm` template (Python) that calls `/v1/decisions/{ticker}` nightly.
  2. Docker image with Lean CLI for cross-validation CI step.
- Activate: add `/v1/lean/insight/{ticker}` endpoint returning `LeanInsight.to_lean_json()` for any decision.

### vnpy — A-share paper trading
- Skeleton: `src/trading_agents/execution/vnpy_bridge.py` (OrderRequest builder done)
- Needs:
  1. **CTP 模拟账户** — register https://simnow.com.cn.
  2. `pip install vnpy vnpy_ctp` (Linux libs are commercial; need licence).
  3. A `CtaTemplate` strategy in `examples/vnpy/`.
- Activate: wire OrderRequest into a vnpy strategy `on_trade()`.

### FinGPT — finance-tuned LLM provider
- Status: PLANNED in ecosystem registry, no file yet.
- Needs: a HuggingFace-hosted FinGPT weights URL OR a self-host endpoint.
- Activate: add a provider class in `src/trading_agents/llm/router.py` that posts to FinGPT inference endpoint.

### Sentry — error monitoring
- Hook: `_maybe_init_sentry()` already in `api/main.py:73`.
- Needs: `SENTRY_DSN` env var. Free tier covers 5k events/month.

### Langfuse — LLM trace observability
- Needs:
  1. `pip install langfuse` (add to requirements.txt).
  2. `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY` env vars (cloud free tier).
  3. Wrap router's `complete()` with `@langfuse.observe` decorator.

### Arq — replace in-memory `_jobs` dict
- Current: `_jobs` dict in `api/main.py`. Lost on every Render restart.
- Needs: Redis instance ($1/mo on Render).
- Activate: `pip install arq`, replace `BackgroundTasks` calls with Arq enqueue.

### PostgreSQL — replace SQLite for >50 users
- Current: SQLite at `TA_DATA_DIR/platform.db`.
- Needs: Postgres instance + `pip install psycopg2-binary`.
- Activate: SQL dialect tweaks in `api/persistence.py` (UPSERT syntax differs).

### Alipay / 微信支付
- Current: Stripe webhook works for USD.
- Needs: 国内主体公司 + 商户号 (ICP 备案 prerequisite for Alipay).
- Activate: write `api/alipay_webhook.py` mirroring stripe webhook pattern.

## 🔴 Cannot do without operator action

### M1 full backtest (`#21` task — pending since May 2)
- Needs: LLM key configured + local machine to run `run_agent_backtest.command` (~1-2h).
- Action: Double-click the .command file. Done.

### Mobile App (PWA or native)
- Effort: 2-4 weeks for a basic PWA wrapper.
- Defer until product-market fit signal.

### ICP 备案
- Needs: 国内主体 + 服务器在国内 + 网安部审批 (~2 weeks).
- Defer until we want 百度收录 / 国内主站 access.

## Engineering decisions to revisit at 50+ users

- Move job queue to Arq + Redis (currently in-memory `_jobs`)
- Move persistence to PostgreSQL (currently SQLite)
- Add Langfuse for LLM trace inspection
- Multi-replica deploy (need to externalise session state — done via SQLite already)
- CDN for static OG images (Vercel edge handles this already)

## Maintainer's notes

- The 5 just-shipped items in this batch unblock Phase 1 (evaluation), Phase 2 (RegimeProfile already existed), Phase 3 (cache), and a chunk of Phase 5 (Alpaca paper).
- The biggest remaining infra debt is the in-memory `_jobs` dict — fix when Render restart frequency becomes a complaint vector.
- For "超越东方财富" specifically: the moat is the AI reasoning layer on top of Eastmoney's data, not replacing it. North-flow + lhb endpoints close the obvious data-parity gap but we shouldn't try to clone every Eastmoney feature.
