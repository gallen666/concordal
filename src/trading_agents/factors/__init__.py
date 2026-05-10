"""Factor library — quant signals computed from price/volume history.

We deliberately do NOT pull in Qlib's full SDK as a hard dependency:
  * It's ~500 MB once installed, blowing past Render's free-tier image budget.
  * It expects a local Qlib data dir (`qlib_data/cn`) populated by their
    bin/get_data.py script — extra ops weight.

Instead we implement the 10 highest-signal factors from Microsoft's
Alpha158 set (Yang et al. 2020) in pure numpy/pandas. Same conceptual
contribution: momentum / volatility / volume / mean-reversion / pattern
priors that the technical analyst can reference. When users want the
*full* Alpha158 / Alpha360 / Qlib ML models, they install Qlib themselves
and our factor module gracefully picks it up.
"""

from .alpha158_lite import compute_factors, FACTOR_NAMES  # noqa: F401
