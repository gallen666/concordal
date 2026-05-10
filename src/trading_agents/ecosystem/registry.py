"""Canonical registry of every OSS project we integrate with.

Single source of truth — referenced by:
  * the /ecosystem web page (rendered server-side from the JSON dump)
  * the universal data bus (uses `role` + `interface` to route requests)
  * docs / README (auto-generated tables)

Adding a new integration is one entry here + an adapter implementation.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any


class IntegrationStatus(str, Enum):
    LIVE = "live"          # actively wired into the pipeline today
    BETA = "beta"          # working but behind a flag
    BUILDING = "building"  # adapter in progress
    PLANNED = "planned"    # specced, not started


class EcosystemRole(str, Enum):
    """Where in the stack a project sits."""
    DATA_SOURCE = "data_source"        # raw market / fundamental / alt data
    FEATURE_ENGINE = "feature_engine"  # factors, indicators, ML features
    LLM_LAYER = "llm_layer"            # language-model providers / agent frameworks
    STRATEGY_RL = "strategy_rl"        # RL / classical quant strategies
    BACKTEST = "backtest"              # historical simulation engines
    EXECUTION = "execution"            # broker connectivity / live trading
    TERMINAL = "terminal"              # UI / dashboard / analyst workspace


@dataclass(frozen=True)
class EcosystemProject:
    slug: str                    # url-safe id: "openbb", "qlib", "ccxt"
    name: str                    # display name
    tagline: str                 # one-line elevator pitch
    role: EcosystemRole          # where it sits in our stack
    github: str                  # github repo URL
    stars_k: float               # rough star count (in thousands) at integration time
    license: str                 # OSS license string ("MIT", "Apache-2.0", etc.)
    status: IntegrationStatus

    # How it plugs into US (concrete, not aspirational):
    integrates_via: str          # which file / interface
    we_consume: list[str] = field(default_factory=list)  # what we PULL from them
    we_export: list[str] = field(default_factory=list)   # what we EXPOSE back

    # Cross-pollination — which other slugs in this registry it interacts with.
    feeds_into: list[str] = field(default_factory=list)
    fed_by: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# The 10. Star counts are approximate snapshots — the front-end refreshes
# from the GitHub badges; this is just for offline / OG-card rendering.
# ---------------------------------------------------------------------------


ECOSYSTEM: list[EcosystemProject] = [
    # ---- 1. data sources (raw bytes flowing in) -----------------------
    EcosystemProject(
        slug="openbb",
        name="OpenBB",
        tagline="Open-source Bloomberg Terminal — unified data + AI workspace",
        role=EcosystemRole.DATA_SOURCE,
        github="https://github.com/OpenBB-finance/OpenBB",
        stars_k=67.0,
        license="AGPL-3.0",
        status=IntegrationStatus.LIVE,
        integrates_via="src/trading_agents/adapters/macro_openbb.py + api/openbb_widget.py",
        we_consume=["FRED macro series", "yield curve", "CPI / unemployment / Fed funds"],
        we_export=["Decision widget", "Macro brief widget", "Track-record widget"],
        feeds_into=["tradingagents"],
        fed_by=[],
    ),
    EcosystemProject(
        slug="akshare",
        name="AKShare",
        tagline="Comprehensive Chinese market data (A-share, HK, futures, ETF)",
        role=EcosystemRole.DATA_SOURCE,
        github="https://github.com/akfamily/akshare",
        stars_k=10.0,
        license="MIT",
        status=IntegrationStatus.LIVE,
        integrates_via="src/trading_agents/adapters/cn_equity.py",
        we_consume=["A-share quotes", "fundamentals (live only)", "EastMoney/Baidu hot rank"],
        we_export=[],
        feeds_into=["tradingagents"],
        fed_by=[],
    ),
    EcosystemProject(
        slug="ccxt",
        name="CCXT",
        tagline="Unified API to 100+ crypto exchanges",
        role=EcosystemRole.DATA_SOURCE,
        github="https://github.com/ccxt/ccxt",
        stars_k=33.0,
        license="MIT",
        status=IntegrationStatus.LIVE,
        integrates_via="src/trading_agents/adapters/crypto_ccxt.py",
        we_consume=["spot OHLCV (Binance default)", "ticker quotes", "400-day technical history"],
        we_export=["BTC/ETH/etc decisions via /v1/decisions with market='crypto'"],
        feeds_into=["tradingagents", "finrl"],
        fed_by=[],
    ),
    EcosystemProject(
        slug="reddit",
        name="Reddit (public JSON)",
        tagline="Free retail-sentiment + headlines from wallstreetbets / investing / CryptoCurrency",
        role=EcosystemRole.DATA_SOURCE,
        github="https://www.reddit.com/dev/api/",
        stars_k=0.0,  # not a github project; here for narrative completeness
        license="Reddit API Terms",
        status=IntegrationStatus.LIVE,
        integrates_via="src/trading_agents/adapters/social_reddit.py",
        we_consume=["search.json across r/wallstreetbets, r/investing, r/stocks, r/CryptoCurrency, r/Bitcoin"],
        we_export=["NewsItem feed for news analyst", "SentimentSummary for sentiment analyst"],
        feeds_into=["tradingagents"],
        fed_by=[],
    ),
    EcosystemProject(
        slug="eastmoney_guba",
        name="东方财富股吧",
        tagline="A-share 真社交信号 — Reddit 替代品，覆盖每只 A 股的股民讨论",
        role=EcosystemRole.DATA_SOURCE,
        github="https://github.com/akfamily/akshare",  # exposed via akshare
        stars_k=0.0,
        license="Public web data",
        status=IntegrationStatus.LIVE,
        integrates_via="src/trading_agents/adapters/social_guba.py (via akshare.stock_guba_em)",
        we_consume=["帖子标题 / 阅读量 / 评论数 / 发帖时间 per A-share code"],
        we_export=[
            "NewsItem feed (top-read posts in lookback window)",
            "SentimentSummary with 中文 keyword bull/bear scoring (看多/抄底 vs 割肉/被套)",
        ],
        feeds_into=["tradingagents"],
        fed_by=["akshare"],
    ),

    # ---- 2. feature engine (turns data into ML factors) ---------------
    EcosystemProject(
        slug="qlib",
        name="Qlib (Microsoft)",
        tagline="AI-oriented quant platform — Alpha158-lite factors live, full SDK on roadmap",
        role=EcosystemRole.FEATURE_ENGINE,
        github="https://github.com/microsoft/qlib",
        stars_k=18.0,
        license="MIT",
        status=IntegrationStatus.LIVE,
        integrates_via="src/trading_agents/factors/alpha158_lite.py",
        we_consume=[
            "Alpha158 factor naming convention (ROC_*, STD_*, BIAS_*, RSV_*, KMID, MA_DIFF)",
            "10 highest-signal factors implemented inline from OHLCV (no Qlib SDK install)",
        ],
        we_export=[
            "factors dict on every TechnicalSnapshot → technical analyst prompt",
            "Roadmap: full Qlib SDK swap-in for ML model outputs (LightGBM/GRU)",
        ],
        feeds_into=["tradingagents", "finrl", "backtrader"],
        fed_by=["openbb", "akshare"],
    ),

    # ---- 3. LLM layer (language model providers + agent frameworks) ---
    EcosystemProject(
        slug="tradingagents",
        name="TradingAgents (TauricResearch)",
        tagline="Multi-agent LLM trading framework — the 7-role architecture",
        role=EcosystemRole.LLM_LAYER,
        github="https://github.com/TauricResearch/TradingAgents",
        stars_k=8.0,
        license="Apache-2.0",
        status=IntegrationStatus.LIVE,
        integrates_via="src/trading_agents/agents/* (architecture inspiration)",
        we_consume=["7-role taxonomy", "dialectical debate pattern", "reflection loop concept"],
        we_export=["Production-grade implementation with i18n, A-share, real backtest"],
        feeds_into=["fingpt"],
        fed_by=["openbb", "akshare", "qlib", "fingpt"],
    ),
    EcosystemProject(
        slug="fingpt",
        name="FinGPT",
        tagline="Open-source LLM specialised for finance",
        role=EcosystemRole.LLM_LAYER,
        github="https://github.com/AI4Finance-Foundation/FinGPT",
        stars_k=14.0,
        license="MIT",
        status=IntegrationStatus.PLANNED,
        integrates_via="src/trading_agents/llm/router.py (alternate provider)",
        we_consume=["fine-tuned finance LLM weights", "FinNLP datasets"],
        we_export=["Finance-tuned analyst alternative to Gemini/GPT-4"],
        feeds_into=["tradingagents"],
        fed_by=["openbb"],
    ),

    # ---- 4. RL / quant strategies -------------------------------------
    EcosystemProject(
        slug="finrl",
        name="FinRL",
        tagline="Reinforcement learning for trading — DRL agents on equity / crypto",
        role=EcosystemRole.STRATEGY_RL,
        github="https://github.com/AI4Finance-Foundation/FinRL",
        stars_k=10.0,
        license="MIT",
        status=IntegrationStatus.PLANNED,
        integrates_via="src/trading_agents/strategies/finrl_agent.py (planned)",
        we_consume=["pre-trained DRL policies (PPO, A2C, DDPG)"],
        we_export=["RL position sizes as a prior into the Trader role"],
        feeds_into=["tradingagents"],
        fed_by=["qlib", "openbb", "ccxt"],
    ),

    # ---- 5. backtest engines ------------------------------------------
    EcosystemProject(
        slug="backtrader",
        name="Backtrader",
        tagline="Battle-tested Python backtesting framework — used as cross-validation oracle",
        role=EcosystemRole.BACKTEST,
        github="https://github.com/mementum/backtrader",
        stars_k=14.0,
        license="GPL-3.0",
        status=IntegrationStatus.LIVE,
        integrates_via="src/trading_agents/backtest/backtrader_runner.py",
        we_consume=["broker simulator", "TimeReturn analyzer", "PandasData feed"],
        we_export=[
            "Independent equity-curve replay of every agent backtest",
            "Disagreement flag when annualised return diff > 0.5pp",
        ],
        feeds_into=[],
        fed_by=["openbb", "akshare"],
    ),

    # ---- 6. execution layer (broker connectivity) ---------------------
    EcosystemProject(
        slug="lean",
        name="Lean / QuantConnect",
        tagline="Production-grade algo trading engine — paper + live execution",
        role=EcosystemRole.EXECUTION,
        github="https://github.com/QuantConnect/Lean",
        stars_k=10.0,
        license="Apache-2.0",
        status=IntegrationStatus.PLANNED,
        integrates_via="src/trading_agents/execution/lean_bridge.py (planned)",
        we_consume=["broker connectors (IB, Alpaca, Tradier)", "live data feeds"],
        we_export=["Decisions as Lean signals → paper / live execution"],
        feeds_into=[],
        fed_by=["tradingagents", "finrl"],
    ),
    EcosystemProject(
        slug="vnpy",
        name="vnpy",
        tagline="Chinese-market trading platform — A-share / futures / options brokers",
        role=EcosystemRole.EXECUTION,
        github="https://github.com/vnpy/vnpy",
        stars_k=27.0,
        license="MIT",
        status=IntegrationStatus.PLANNED,
        integrates_via="src/trading_agents/execution/vnpy_bridge.py (planned)",
        we_consume=["CTP / 中信 / 国泰 broker gateways", "tick-level live data"],
        we_export=["A-share decisions → vnpy strategy template"],
        feeds_into=[],
        fed_by=["tradingagents", "akshare"],
    ),
]


def to_json() -> list[dict[str, Any]]:
    """Serialise the registry for the front-end / OpenBB widget / docs."""
    out: list[dict[str, Any]] = []
    for p in ECOSYSTEM:
        d = asdict(p)
        # Enums → strings
        d["role"] = p.role.value
        d["status"] = p.status.value
        out.append(d)
    return out


def by_role() -> dict[str, list[EcosystemProject]]:
    """Group projects by stack layer (for the page's section grouping)."""
    groups: dict[str, list[EcosystemProject]] = {}
    for p in ECOSYSTEM:
        groups.setdefault(p.role.value, []).append(p)
    return groups


def stats() -> dict[str, Any]:
    """Aggregate stats — total stars, integration breakdown, etc."""
    total_stars = sum(p.stars_k for p in ECOSYSTEM)
    by_status: dict[str, int] = {}
    for p in ECOSYSTEM:
        by_status[p.status.value] = by_status.get(p.status.value, 0) + 1
    return {
        "total_projects": len(ECOSYSTEM),
        "total_stars_k": round(total_stars, 1),
        "by_status": by_status,
    }
