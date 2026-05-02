"""Centralized config so production deploys touch one file.

Read once at module load. All values come from env vars with safe defaults.
Don't import this module before .env has been loaded if you rely on python-
dotenv. In Railway/Fly we set env vars in the dashboard, no .env needed.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Config:
    # --- core ---
    env: str                              # "development" | "staging" | "production"
    api_base_url: str                     # for emails, etc.
    allowed_origins: list[str]            # CORS

    # --- auth ---
    jwt_secret: str
    jwt_ttl_hours: int

    # --- feature flags ---
    require_invite_code: bool             # closed beta gate
    real_llm_user_ids: set[str]           # explicit allowlist who gets real LLM
    real_data_user_ids: set[str]          # explicit allowlist who gets real data adapters

    # --- safety / kill switches ---
    emergency_stop_decisions: bool        # if true, /v1/decisions returns 503
    rate_limit_per_min: int               # per user id

    # --- observability ---
    sentry_dsn: str | None
    log_level: str

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            env=os.getenv("TA_ENV", "development"),
            api_base_url=os.getenv("TA_API_BASE_URL", "http://localhost:8000"),
            allowed_origins=[
                o.strip() for o in os.getenv(
                    "TA_ALLOWED_ORIGINS",
                    "http://localhost:3000",
                ).split(",") if o.strip()
            ],
            jwt_secret=os.getenv("TA_JWT_SECRET", "dev-secret-change-me"),
            jwt_ttl_hours=int(os.getenv("TA_JWT_TTL_HOURS", "168")),
            require_invite_code=os.getenv("TA_REQUIRE_INVITE", "true").lower() == "true",
            real_llm_user_ids={
                u.strip() for u in os.getenv("TA_REAL_LLM_USERS", "").split(",") if u.strip()
            },
            real_data_user_ids={
                u.strip() for u in os.getenv("TA_REAL_DATA_USERS", "").split(",") if u.strip()
            },
            emergency_stop_decisions=os.getenv("TA_EMERGENCY_STOP", "false").lower() == "true",
            rate_limit_per_min=int(os.getenv("TA_RATE_LIMIT_PER_MIN", "10")),
            sentry_dsn=os.getenv("SENTRY_DSN") or None,
            log_level=os.getenv("TA_LOG_LEVEL", "INFO"),
        )


cfg = Config.from_env()
