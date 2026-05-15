"""Ecosystem layer — turns 10 best-of-breed open-source quant projects
into a single, data-shared platform.

Each project plays one specific role in the AI-augmented quant stack.
None of them alone is a complete solution; together, with shared data
flowing through a common bus, they compound:

    Data sources (OpenBB, AKShare, CCXT, yfinance)
              ↓
    Factor / feature engineering (Qlib)
              ↓
    LLM signal layer (TradingAgents, FinGPT)
              ↓
    Quant strategy layer (FinRL, Backtrader)
              ↓
    Execution layer (Lean, vnpy)

Our website is the **integration surface** — every project's data,
signals, and decisions become visible on one page, and any agent can
pull from any source through a single typed interface.
"""

from .registry import ECOSYSTEM, EcosystemProject, IntegrationStatus  # noqa: F401

# Side-effect import: registers every available adapter as a UniversalDataBus
# Source at boot. This is what turns the bus from a façade into the spine —
# now `bus.fetch(Need.QUOTE, ticker, asof)` routes to akshare → tencent →
# sina → xueqiu for A-shares, yfinance for US equities, etc.
from . import sources  # noqa: F401, E402
