/** API client with JWT bearer auth + closed-beta awareness. */

const BASE = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

export type Side =
  | "BUY"
  | "OVERWEIGHT"
  | "HOLD"
  | "UNDERWEIGHT"
  | "SELL";

export interface Decision {
  ticker: string;
  asof: string;
  side: Side;
  target_weight: number;
  confidence: number;
  rationale: string;
  risk_notes: string;
  flags: string[];
}

export interface AnalystReport {
  analyst: string;
  ticker: string;
  asof: string;
  body: string;
  signals: Record<string, unknown>;
  sources?: string[];
}

export interface DebateTurn {
  speaker: string;
  content: string;
  round: number;
}

export interface DebateTranscript {
  topic: string;
  rounds: number;
  turns: DebateTurn[];
  synthesis: string | null;
}

export interface DecisionTrace {
  ticker: string;
  asof: string;
  decision: Decision;
  analyst_reports: AnalystReport[];
  researcher_debate: DebateTranscript | null;
  risk_debate: DebateTranscript | null;
  trader_plan: string | null;
  manager_review: string | null;
  total_cost_usd?: number;
}

export interface CurrentUser {
  id: string;
  real_llm: boolean;
  real_data: boolean;
}

const TOKEN_KEY = "ta_jwt";

export const auth = {
  getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
  },
  setToken(token: string) {
    if (typeof window === "undefined") return;
    localStorage.setItem(TOKEN_KEY, token);
  },
  clearToken() {
    if (typeof window === "undefined") return;
    localStorage.removeItem(TOKEN_KEY);
  },
  isLoggedIn(): boolean {
    return !!this.getToken();
  },
};

/** Thrown when the backend returns 402 (free-tier daily cap exceeded).
 *  Caller can read `.detail` to get `{message, used, cap, upgrade_url}`. */
export class PaywallError extends Error {
  detail: {
    error: string;
    message: string;
    used: number;
    cap: number;
    upgrade_url: string;
    tier: string;
  };
  constructor(detail: PaywallError["detail"]) {
    super(detail.message);
    this.detail = detail;
  }
}

async function _fetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string>) || {}),
  };
  const tok = auth.getToken();
  if (tok) headers["Authorization"] = `Bearer ${tok}`;

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (res.status === 401) {
    auth.clearToken();
    if (typeof window !== "undefined") window.location.href = "/redeem";
    throw new Error("Session expired");
  }
  if (res.status === 402) {
    // Free-tier daily cap exceeded — surface as a typed exception so
    // pages like /decision can show a paywall modal instead of a toast.
    let detail: PaywallError["detail"];
    try {
      const body = await res.json();
      detail = (body.detail || body) as PaywallError["detail"];
    } catch {
      detail = {
        error: "daily_cap_exceeded",
        message: "Daily free-tier limit reached.",
        used: 0,
        cap: 0,
        upgrade_url: "/pricing#pro",
        tier: "pro",
      };
    }
    throw new PaywallError(detail);
  }
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const body = await res.json();
      msg = body.detail || JSON.stringify(body);
    } catch {
      msg = await res.text();
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => _fetch<{ status: string; mode: string; emergency_stop: boolean }>("/v1/health"),

  /**
   * Daily-cap status for the current user (or anonymous). Used to
   * render the "X / 5 free decisions today" usage badge on /decision.
   */
  myUsage: () =>
    _fetch<{ used: number; cap: number | null; tier: "free" | "pro" }>("/v1/me/usage"),

  joinWaitlist: (req: { email: string; note?: string }) =>
    _fetch<{ ok: boolean; message: string }>("/v1/waitlist", {
      method: "POST",
      body: JSON.stringify(req),
    }),

  redeem: (req: { email: string; invite_code: string }) =>
    _fetch<{
      token: string;
      user_id: string;
      expires_at: number;
      real_llm: boolean;
      real_data: boolean;
    }>("/v1/auth/redeem", {
      method: "POST",
      body: JSON.stringify(req),
    }),

  me: () => _fetch<CurrentUser>("/v1/auth/me"),

  createDecision: (req: {
    ticker: string;
    market?: string;
    debate_rounds?: number;
    user_risk_profile?: string;
    /** "en" or "zh" — controls language of LLM free-text fields. */
    locale?: string;
    /** When false, bypasses TickerCache and forces a fresh run. */
    use_cache?: boolean;
  }) =>
    _fetch<{ job_id: string; status: string }>("/v1/decisions", {
      method: "POST",
      body: JSON.stringify(req),
    }),

  getDecision: (id: string) =>
    _fetch<{
      status: string;
      result: DecisionTrace | null;
      error: string | null;
      mode?: string;
      progress?: DecisionProgress | null;
      lessons_injected?: boolean;
      lessons_chars?: number;
    }>(`/v1/decisions/job/${id}`),

  createBacktest: (req: {
    ticker: string;
    days?: number;
    market?: string;
    rebalance_every_days?: number;
    baselines_only?: boolean;
    cross_validate?: boolean;
  }) =>
    _fetch<{ job_id: string; status: string }>("/v1/backtests", {
      method: "POST",
      body: JSON.stringify(req),
    }),

  getBacktest: (id: string) =>
    _fetch<{
      status: string;
      result: {
        rows: Array<{
          name: string;
          metrics: Record<string, number>;
          cross_validation?: {
            backtrader_metrics: Record<string, number>;
            ann_return_diff_pct: number;
            sharpe_diff: number;
            max_dd_diff_pct: number;
            flagged_disagreement: boolean;
            notes: string[];
          };
        }>;
      } | null;
      error: string | null;
    }>(`/v1/backtests/${id}`),

  /**
   * Current user's full decision history with forward-return enrichment.
   * Used to render the /me/history page.
   */
  myDecisions: () =>
    _fetch<MyDecision[]>("/v1/me/decisions?enrich_pnl=true&limit=200"),

  /**
   * Mint a public share-id for the just-finished decision. Anyone with
   * the resulting URL can view it at /d/<id>. Only the user who created
   * the decision can share it.
   */
  shareDecision: (job_id: string) =>
    _fetch<{ share_id: string }>(`/v1/decisions/job/${job_id}/share`, {
      method: "POST",
    }),

  /**
   * Public, no-auth read of a shared decision. Used by /d/[shareId].
   * Bypasses the JWT-injection helper since this endpoint is unauthed.
   */
  getSharedDecision: (share_id: string) =>
    fetch(`${BASE}/v1/decisions/share/${share_id}`).then(async (r) => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json() as Promise<{
        share_id: string;
        result: DecisionTrace;
        mode?: string;
        lessons_injected?: boolean;
        shared_at: number;
      }>;
    }),

  /**
   * Begin an upgrade flow for a paid tier. Returns the URL the frontend
   * should open. Today this is a Tally/Payment-Link URL; once Stripe is
   * wired the backend swaps in a Stripe Checkout Session — no client change.
   */
  upgradeCheckout: (req: { tier: "pro" | "team" }) =>
    _fetch<{ url: string; tier: string }>("/v1/upgrade/checkout", {
      method: "POST",
      body: JSON.stringify(req),
    }),

  /**
   * Thumbs up / down on a specific decision. Stored to a JSONL log for
   * later prompt iteration and (eventually) RLHF training data.
   */
  feedback: (req: {
    ticker: string;
    asof: string;
    side: string;
    verdict: "up" | "down";
    note?: string;
  }) =>
    _fetch<{ ok: boolean }>("/v1/feedback", {
      method: "POST",
      body: JSON.stringify(req),
    }),
};

/**
 * Live progress reported by the decision pipeline. Polled while the
 * job is running so the UI can highlight the agent currently working
 * (instead of showing a single 90s spinner).
 *
 * Stage IDs match `STAGES` in src/trading_agents/core/graph.py:
 *   quote, fundamentals, sentiment, news, technical,
 *   researcher_debate, trader, risk_debate, manager
 */
export interface DecisionProgress {
  current_stage: string | null;
  completed: string[];
  errored: string[];
  history: Array<{ stage: string; status: string; ts: number }>;
}

/** A single past decision the user made, optionally enriched with forward PnL. */
export interface MyDecision {
  ticker: string;
  market: string | null;
  decision_date: string;
  decision: {
    side: string;
    target_weight: number;
    confidence: number;
    rationale: string;
    risk_notes?: string;
  };
  decision_close: number | null;
  forward_return?: number | null;   // null/undefined when not yet enriched
  forward_close?: number | null;
  days_held?: number | null;
}
