"""FinRL bridge — Roadmap Phase 5+, ecosystem.registry status=PLANNED.

Vision: pre-trained Deep-RL policy (PPO/A2C/DDPG) serves as a *prior* for the
Trader role. When the LLM's confidence is low (σ across analysts > 0.15) we
fall back to the RL policy's position-sizing recommendation; when LLM
confidence is high we use it as a sanity check.

Status: SKELETON. To finish:
  1. Train a PPO on SPY+AAPL+NVDA daily bars 2018-2023, using FinRL's
     `StockPortfolioEnv`. ~4 hours on a single A100 or 24h on CPU.
  2. Export the policy to `models/finrl_us_equity.zip` (stable-baselines3
     format).
  3. Implement `predict_position(snapshot)` below using sb3's `PPO.load`.
  4. Add `FINRL_POLICY_PATH` env var, fail gracefully if missing.
  5. Wire into Trader prompt: add "RL prior says {pos}" to system message.

Dependencies (not in requirements.txt yet — add when activating):
  finrl==0.3.6
  stable-baselines3==2.3.0
  gymnasium
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class RLPrior:
    """RL policy's recommendation for the Trader role to consider."""
    position: float       # in [-1, 1]; sign = direction, magnitude = sizing
    confidence: float     # in [0, 1]; how peaked the policy distribution is
    model_id: str         # e.g. "finrl-ppo-us-2024Q4"


def is_available() -> bool:
    """True if FINRL_POLICY_PATH is set AND the file exists AND sb3 is installed."""
    path = os.environ.get("FINRL_POLICY_PATH")
    if not path or not os.path.exists(path):
        return False
    try:
        import stable_baselines3  # noqa: F401
        return True
    except ImportError:
        return False


def predict_position(snapshot: dict) -> RLPrior | None:
    """Predict from a TechnicalSnapshot-like dict.

    Returns None when the policy isn't loaded — caller should fall through
    to the LLM-only path.
    """
    if not is_available():
        return None
    # TODO: implement once we have a trained policy.
    # Sketch:
    #   from stable_baselines3 import PPO
    #   import numpy as np
    #   model = PPO.load(os.environ["FINRL_POLICY_PATH"])
    #   obs = _snapshot_to_obs(snapshot)  # shape (1, n_features)
    #   action, _ = model.predict(obs, deterministic=True)
    #   pos = float(np.clip(action[0], -1, 1))
    #   conf = _action_confidence(model, obs)
    #   return RLPrior(position=pos, confidence=conf, model_id="finrl-ppo-us-skeleton")
    log.info("FinRL predict_position: model loaded but inference not implemented yet")
    return None
