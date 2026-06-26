"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Briefcase,
  CheckCircle2,
  Copy,
  Gavel,
  Globe,
  LineChart,
  Loader2,
  MessageCircle,
  Newspaper,
  Play,
  RefreshCw,
  Share2,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import {
  api,
  auth,
  PaywallError,
  type DecisionTrace,
  type DebateTranscript,
  type AnalystReport,
  type CurrentUser,
  type DecisionProgress,
} from "../lib/api";
import { cn } from "../lib/cn";
import { useT } from "../lib/i18n";
import { MarketHeader } from "../components/MarketHeader";
import { KLinePanel } from "../components/KLinePanel";
import { PhaseTimeline } from "../components/PhaseTimeline";
import { DriverMatrix } from "../components/DriverMatrix";
import { MoatRadar } from "../components/MoatRadar";

const SIDE_STYLES: Record<
  string,
  {
    pillBg: string;
    pillText: string;
    pillBorder: string;
    icon: React.ReactNode;
    accent: string;
    glow: string;
  }
> = {
  BUY: {
    pillBg: "bg-signal-buy_soft",
    pillText: "text-signal-buy",
    pillBorder: "border-signal-buy/30",
    icon: <TrendingUp className="w-4 h-4" />,
    accent: "border-l-signal-buy",
    glow: "rgba(63,185,80,0.18)",
  },
  OVERWEIGHT: {
    pillBg: "bg-signal-buy_soft",
    pillText: "text-signal-buy",
    pillBorder: "border-signal-buy/30",
    icon: <TrendingUp className="w-4 h-4" />,
    accent: "border-l-signal-buy",
    glow: "rgba(63,185,80,0.18)",
  },
  HOLD: {
    pillBg: "bg-bg-hover",
    pillText: "text-ink-secondary",
    pillBorder: "border-border",
    icon: <Activity className="w-4 h-4" />,
    accent: "border-l-ink-tertiary",
    glow: "rgba(154,166,184,0.15)",
  },
  UNDERWEIGHT: {
    pillBg: "bg-signal-sell_soft",
    pillText: "text-signal-sell",
    pillBorder: "border-signal-sell/30",
    icon: <TrendingDown className="w-4 h-4" />,
    accent: "border-l-signal-sell",
    glow: "rgba(248,81,73,0.18)",
  },
  SELL: {
    pillBg: "bg-signal-sell_soft",
    pillText: "text-signal-sell",
    pillBorder: "border-signal-sell/30",
    icon: <TrendingDown className="w-4 h-4" />,
    accent: "border-l-signal-sell",
    glow: "rgba(248,81,73,0.18)",
  },
};

// --- text cleanup helpers --------------------------------------------------

/** Strip fenced code blocks (```...```) from analyst body — the structured
 * signals are already shown as pills, so the JSON dump is redundant. */
function stripCodeFences(s: string): string {
  return s
    .replace(/```[\w-]*\s*[\s\S]*?```/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Strip leading role-style prefixes from debate / risk content.
 * Matches "BULL:", "BEAR:", "Aggressive risk view:", "Neutral risk view:",
 * "Conservative risk view:", etc. */
function stripRolePrefix(s: string): string {
  return s
    .replace(/^\s*(BULL|BEAR|AGGRESSIVE|NEUTRAL|CONSERVATIVE)\s*:\s*/i, "")
    .replace(/^\s*(aggressive|neutral|conservative)\s+risk\s+view\s*:\s*/i, "")
    .trim();
}

export default function DecisionPage() {
  const { t, locale } = useT();
  const [ticker, setTicker] = useState("AAPL");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [result, setResult] = useState<DecisionTrace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [mode, setMode] = useState<string | null>(null);  // cached / real_llm / mock
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  // Live progress reported by the backend job; populated while the
  // pipeline runs so the UI can highlight the currently-working agent.
  const [progress, setProgress] = useState<DecisionProgress | null>(null);
  // Did the Manager prompt get reflection memory injected this run?
  const [lessonsInjected, setLessonsInjected] = useState(false);
  // Job id of the just-finished decision — used as the source for share()
  const [jobId, setJobId] = useState<string | null>(null);
  // Daily-cap usage for the conversion banner. Refreshes after each run.
  const [usage, setUsage] = useState<{ used: number; cap: number | null; tier: string } | null>(null);
  // Set when a 402 comes back so we can render a paywall modal.
  const [paywall, setPaywall] = useState<PaywallError["detail"] | null>(null);
  // v71 hydration fix: auth.isLoggedIn() reads localStorage, so it returns
  // false during SSR and true on the client for a logged-in user. Gating any
  // render directly on it makes the server and the client's first paint
  // disagree (DemoBanner present on the server, absent on the client) → React
  // #418 on every /decision load. Defer auth-dependent rendering until after
  // mount, when server and client agree.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!auth.isLoggedIn()) return;
    api.me().then(setUser).catch(() => undefined);
  }, []);

  // Pull usage so we can render the badge for both anon + logged-in users.
  useEffect(() => {
    api.myUsage().then(setUsage).catch(() => undefined);
  }, [result]); // refresh after each completed decision

  // Read ?ticker=XXX from the URL so /hot, /watchlist etc. can deep-link.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const t = params.get("ticker");
    if (t) setTicker(t.toUpperCase());
  }, []);

  async function run({ forceRefresh = false }: { forceRefresh?: boolean } = {}) {
    setLoading(true);
    setError(null);
    setResult(null);
    setMode(null);
    setProgress(null);
    setStage(t("decision.running"));
    try {
      const job = await api.createDecision({
        ticker,
        debate_rounds: 2,
        locale,
        use_cache: !forceRefresh,
      });
      setJobId(job.job_id);
      setStage(t("decision.running"));
      // Poll the job status with **gentle backoff** — first 5 seconds we
      // poll fast (1s) so the user sees the early stages light up, then
      // we slow down to every 3s. This keeps the LiveProgress feeling
      // responsive without hammering the backend with 90+ polls per
      // 90-second decision (which on Render free tier can saturate one
      // worker).
      // v44: bumped from 240s → 420s. 7-agent pipeline (especially manager
      // + risk_debate with DEEP tier LLM and triple-stage debate) often
      // takes 4-6 minutes on free-tier Render. 240s was cutting off real
      // jobs at the manager stage — user saw 'decision.timeout' i18n key.
      const MAX_WAIT_SEC = 420;
      let elapsed = 0;
      while (elapsed < MAX_WAIT_SEC) {
        const intervalMs = elapsed < 5 ? 1000 : 3000;
        await new Promise((r) => setTimeout(r, intervalMs));
        elapsed += intervalMs / 1000;
        const j = await api.getDecision(job.job_id);
        if (j.progress) setProgress(j.progress);
        // v42 defensive: only finalize when status=done AND result is present.
        // Catches race where backend sets status before result, and avoids
        // stopping polling on a half-written job dict.
        if (j.status === "done" && j.result) {
          setResult(j.result);
          setMode(j.mode || null);
          setLessonsInjected(!!j.lessons_injected);
          setGeneratedAt(new Date());
          setStage("done");
          break;
        }
        if (j.status === "error") {
          setError(j.error || "Decision failed");
          setStage(null);
          break;
        }
      }
      // v44: hard-coded Chinese fallback. Previously used t("decision.timeout")
      // which returns the KEY literal "decision.timeout" when no translation
      // exists — user saw raw "decision.timeout" string. Skip i18n here.
      if (elapsed >= MAX_WAIT_SEC) {
        setError(
          `决策已运行 ${MAX_WAIT_SEC} 秒仍未完成 (manager 阶段 LLM 可能慢). 流水线大概率还在后台跑, 点这里查看追溯: /decision/${job.job_id}/trace`
        );
        setStage(null);
      }
    } catch (e: unknown) {
      if (e instanceof PaywallError) {
        // Free-tier daily cap exceeded — switch to paywall modal flow.
        setPaywall(e.detail);
      } else {
        const msg = (e as Error).message || "";
        // v43: "Unknown job" 404 happens when the user's previous jobId
        // is stale (e.g. Render restarted and cleared the in-memory _jobs
        // dict). Show friendly Chinese message + auto-clear stale state
        // so the user can simply click 开始辩论 again.
        if (msg.includes("Unknown job") || msg.includes("404")) {
          setJobId(null);
          setResult(null);
          setProgress(null);
          setStage(null);
          setError("上次会话因服务更新已重置, 请重新点击 “开始辩论”.");
        } else {
          setError(msg);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      {paywall && <PaywallModal detail={paywall} onClose={() => setPaywall(null)} />}
      {/* Anonymous visitors get a friendly "try without signup" banner so
          the homepage CTA can deep-link them straight here. Real-only
          mode: every user (including anon) gets the real LLM pipeline,
          so we no longer show the "you're in mock" banner. */}
      {mounted && !auth.isLoggedIn() && <DemoBanner />}
      {usage && usage.cap !== null && <UsageBadge usage={usage} />}
      <div className="mb-6">
        <span className="label-cap">{t("decision.label")}</span>
        <h1 className="text-2xl font-semibold mt-1">
          {t("decision.heading")}
        </h1>
        <p className="text-sm text-ink-secondary mt-1">
          {t("decision.subheading")}
        </p>
      </div>

      {/* v48 Phase 2: Trust banner — four institutional signals stacked
          right above the run form. Same gold pulse used in Footer + Hero
          kicker so brand reads consistent across pages. This is the
          highest-leverage spot for "持牌 · audit log · multi-LLM" because
          it sits in the user's eyeline at the moment they decide whether
          to type a ticker. */}
      <div className="mb-6 surface p-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-2xs font-mono uppercase tracking-wider">
        <span className="inline-flex items-center gap-1.5 text-gold/90">
          <span className="status-dot bg-gold animate-pulse-slow" />
          {t("decision.trust.licensed")}
        </span>
        <span className="text-ink-tertiary">·</span>
        <span className="text-ink-secondary">{t("decision.trust.regression")}</span>
        <span className="text-ink-tertiary">·</span>
        <span className="text-ink-secondary">{t("decision.trust.consensus")}</span>
        <span className="text-ink-tertiary">·</span>
        <span className="text-ink-secondary">{t("decision.trust.audit")}</span>
      </div>

      {/* Live quote strip — shows current price + 60-day sparkline for the
          ticker currently in the input. Defaults to AAPL on first load. */}
      {ticker && (
        <div className="mb-6 space-y-3">
          <MarketHeader ticker={ticker.toUpperCase()} />
          {/* Full K-line chart with MA20/MA60 overlays + tooltip.
              This is what makes the page feel like a professional
              terminal vs a sparkline-only landing. */}
          <KLinePanel ticker={ticker.toUpperCase()} />
        </div>
      )}

      <div className="surface-elev p-3 flex flex-col sm:flex-row gap-3">
        <div className="flex-1 sm:max-w-xs flex flex-col gap-2">
          <input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="AAPL · 600519 · BTC"
            className="input font-mono uppercase tracking-wider"
            disabled={loading}
            spellCheck={false}
          />
          <QuickPicks
            disabled={loading}
            current={ticker}
            onPick={(t) => setTicker(t)}
          />
        </div>
        <button
          onClick={() => run()}
          disabled={loading || !ticker}
          className="btn-primary"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {stage || t("decision.running")}
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              {t("decision.run")}
            </>
          )}
        </button>
        {result && !loading && (
          <button
            onClick={() => run({ forceRefresh: true })}
            disabled={loading || !ticker}
            className="btn-secondary"
            title={t("decision.refresh")}
          >
            <RefreshCw className="w-4 h-4" />
            {t("decision.refresh")}
          </button>
        )}
      </div>

      {/* Mode + timestamp banner above the result */}
      {result && mode && generatedAt && (
        <div className="mt-3 flex items-center gap-2 text-xs text-ink-tertiary flex-wrap">
          {mode === "cached" ? (
            <span className="pill bg-bg-hover text-ink-secondary">
              {t("decision.cached")}
            </span>
          ) : (
            <span className="pill bg-signal-buy_soft text-signal-buy">
              <Sparkles className="w-3 h-3" />
              {t("decision.fresh")}
            </span>
          )}
          {lessonsInjected && (
            <span
              className="pill bg-accent-muted text-accent border border-accent/30 cursor-help"
              title={t("decision.lessonsBody")}
            >
              <Sparkles className="w-3 h-3" />
              {t("decision.lessonsInjected")}
            </span>
          )}
          <span className="font-mono">
            {t("decision.dataAt")} {generatedAt.toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}
          </span>
        </div>
      )}

      {error && (
        <div className="mt-6 surface border-signal-sell/30 p-4 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-signal-sell" />
          <span className="text-sm text-signal-sell">{error}</span>
        </div>
      )}

      {loading && !result && (
        <>
          <LiveProgress progress={progress} />
          <SkeletonReport />
        </>
      )}

      {result && <DecisionView trace={result} jobId={jobId} lessonsInjected={lessonsInjected} />}
    </div>
  );
}

/**
 * MoatBadges — surfaces the three features 东方财富/同花顺 don't have:
 *   1. Forward-return reflection (the manager saw your past calls)
 *   2. Dual-LLM consensus score (two model families voted)
 *   3. Langfuse trace link (per-LLM-call timing/cost/output)
 *
 * Renders inline beneath the decision headline so it's the FIRST thing
 * the eye lands on after the verdict. Each badge is colour-coded by
 * confidence — agreement < 0.5 turns red so disagreement is visible
 * at a glance (the opposite of what East-money does — they hide
 * uncertainty).
 */
function MoatBadges({
  lessonsInjected,
  consensus,
  jobId,
  locale,
}: {
  lessonsInjected: boolean;
  consensus: {
    agreement_score: number;
    primary_model: string;
    second_model: string;
    primary_side: string;
    second_side: string;
    primary_confidence: number;
    second_confidence: number;
  } | null;
  jobId: string | null;
  locale: "en" | "zh";
}) {
  const badges: React.ReactNode[] = [];

  // Forward-return memory injected into manager
  if (lessonsInjected) {
    badges.push(
      <div
        key="memory"
        className="surface-elev p-3 flex items-start gap-3 border-l-2 border-l-accent flex-1 min-w-[200px]"
        title={locale === "zh"
          ? "经理 prompt 注入了你过去对这只票的决策 + 实际回报。系统在记账。"
          : "Manager prompt was injected with your past decisions on this ticker + their realised returns."}
      >
        <Sparkles className="w-4 h-4 text-accent shrink-0 mt-0.5" />
        <div className="leading-tight">
          <div className="text-xs font-semibold text-ink-primary">
            {locale === "zh" ? "记忆已注入" : "Memory injected"}
          </div>
          <div className="text-2xs text-ink-tertiary mt-0.5">
            {locale === "zh"
              ? "经理看到了你过去的决策 + 实际回报"
              : "Manager saw past calls + realised returns"}
          </div>
        </div>
      </div>
    );
  }

  // Dual-LLM consensus
  if (consensus) {
    const score = consensus.agreement_score;
    const sideMatch = consensus.primary_side === consensus.second_side;
    const ok = score >= 0.7;
    const warn = score >= 0.5 && score < 0.7;
    const accent = ok
      ? "border-l-signal-buy"
      : warn
      ? "border-l-signal-warn"
      : "border-l-signal-sell";
    const dotColor = ok
      ? "bg-signal-buy"
      : warn
      ? "bg-signal-warn"
      : "bg-signal-sell";
    badges.push(
      <div
        key="consensus"
        className={cn("surface-elev p-3 border-l-2 flex-1 min-w-[240px]", accent)}
        title={locale === "zh"
          ? `主模型 ${consensus.primary_model} 给出 ${consensus.primary_side} (${(consensus.primary_confidence * 100).toFixed(0)}%); 第二模型 ${consensus.second_model} 给出 ${consensus.second_side} (${(consensus.second_confidence * 100).toFixed(0)}%).`
          : `Primary ${consensus.primary_model}: ${consensus.primary_side} @ ${(consensus.primary_confidence * 100).toFixed(0)}%; Secondary ${consensus.second_model}: ${consensus.second_side} @ ${(consensus.second_confidence * 100).toFixed(0)}%.`}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className={cn("w-1.5 h-1.5 rounded-full", dotColor)} />
          <span className="text-xs font-semibold text-ink-primary">
            {locale === "zh" ? "双 LLM 共识" : "Dual-LLM consensus"}
          </span>
          <span className="ml-auto text-xs font-mono text-ink-primary">
            {(score * 100).toFixed(0)}%
          </span>
        </div>
        <div className="text-2xs text-ink-tertiary leading-snug">
          {sideMatch ? (
            locale === "zh"
              ? `两个模型都给 ${consensus.primary_side}`
              : `Both models agree: ${consensus.primary_side}`
          ) : (
            <span className="text-signal-sell font-semibold">
              {locale === "zh"
                ? `分歧：${consensus.primary_side} vs ${consensus.second_side}`
                : `Disagree: ${consensus.primary_side} vs ${consensus.second_side}`}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Langfuse trace link
  if (jobId) {
    badges.push(
      <Link
        key="trace"
        href={`/decision/${jobId}/trace`}
        className="surface-elev p-3 border-l-2 border-l-ink-tertiary flex-1 min-w-[200px] hover:border-l-accent transition-colors group"
        title={locale === "zh"
          ? "查看每个 LLM 调用的模型、延迟、token、成本"
          : "See every LLM call: model, latency, tokens, cost"}
      >
        <div className="flex items-center gap-2 mb-1">
          <Activity className="w-3.5 h-3.5 text-ink-tertiary group-hover:text-accent transition-colors" />
          <span className="text-xs font-semibold text-ink-primary">
            {locale === "zh" ? "推理追溯" : "Inference trace"}
          </span>
          <ArrowRight className="w-3 h-3 ml-auto text-ink-tertiary group-hover:text-accent transition-colors" />
        </div>
        <div className="text-2xs text-ink-tertiary leading-snug">
          {locale === "zh"
            ? "每个 LLM 调用: 模型 · 延迟 · token · 成本"
            : "Every LLM call: model · latency · tokens · $"}
        </div>
      </Link>
    );
  }

  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3">
      {badges}
    </div>
  );
}


function DecisionView({
  trace,
  jobId,
  lessonsInjected,
}: {
  trace: DecisionTrace;
  jobId: string | null;
  lessonsInjected?: boolean;
}) {
  const { t, locale } = useT();
  const d = trace.decision;
  const style = SIDE_STYLES[d.side] || SIDE_STYLES.HOLD;
  // Extract consensus score safely — backend may set the field to
  // {agreement_score:...} or {error:...} or omit it entirely.
  const consensus =
    d.consensus && "agreement_score" in d.consensus ? d.consensus : null;
  return (
    <div className="mt-8 space-y-8 animate-fade-in">
      {/* MOAT BADGES — features 东方财富/同花顺 structurally can't ship.
          Renders only what actually fired this run (no dummy badges). */}
      {(lessonsInjected || consensus || jobId) && (
        <MoatBadges
          lessonsInjected={!!lessonsInjected}
          consensus={consensus}
          jobId={jobId}
          locale={locale}
        />
      )}
      {/* Headline card with side accent + horizontal stat strip at bottom */}
      <div
        className={cn(
          "surface-elev relative overflow-hidden border-l-2",
          style.accent
        )}
      >
        <div
          className="absolute inset-0 pointer-events-none opacity-60"
          style={{
            background: `radial-gradient(ellipse 70% 60% at 0% 0%, ${style.glow}, transparent 70%)`,
          }}
        />
        <div className="relative">
          {/* Top: ticker + side + asof */}
          <div className="px-6 pt-6 pb-4">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <span className="font-mono text-3xl font-semibold tracking-wider leading-none">
                {d.ticker}
              </span>
              <span
                className={cn(
                  "pill px-3 py-1 text-sm font-semibold border",
                  style.pillBg,
                  style.pillText,
                  style.pillBorder
                )}
              >
                {style.icon}
                {d.side}
              </span>
              <span className="text-xs text-ink-tertiary ml-auto font-mono">
                {t("decision.asof")} {d.asof}
              </span>
            </div>
            {/* v90/v91 sell-side research format: when the manager emits
                a Morgan-Stanley-style headline + key takeaways, surface
                them prominently above the rationale. Falls back silently
                to rationale-only for older / out-of-format decisions. */}
            {d.headline && (
              <h2 className="text-xl sm:text-2xl font-semibold tracking-tight leading-snug text-ink-primary mb-2">
                {d.headline}
              </h2>
            )}
            {/* Relative-rating meta strip — the legal/analytical hook.
                "Overweight vs S&P 500, 12-18 months, risk-adjusted basis"
                signals that the call is benchmarked + horizoned + relative,
                not an absolute price prediction. */}
            {(d.benchmark || d.time_horizon) && (
              <p className="text-xs text-ink-tertiary mb-3 font-mono">
                {[
                  d.benchmark ? `vs. ${d.benchmark}` : null,
                  d.time_horizon || "12-18 months",
                  d.risk_adjusted === false ? null : "risk-adjusted",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            {/* v97a: BofA-style Shock Anchor — the single most compressible
                quantitative claim of the thesis. Renders as a callout
                block above the Market View strip when manager emitted one. */}
            {d.shock_anchor && (
              <div className="mb-3 rounded-md border-l-2 border-accent bg-accent/5 px-3 py-2">
                <div className="text-[10px] uppercase tracking-widest text-accent mb-0.5 font-mono">
                  {locale === "zh" ? "核心锚点" : "Shock Anchor"}
                </div>
                <div className="text-sm font-semibold text-ink-primary leading-snug">
                  {d.shock_anchor}
                </div>
              </div>
            )}
            {/* v97a: BofA-style Market View strip — Industry TAM / Company
                share / Δshare 5yr. The Δshare is the real alpha signal:
                a +5pp gainer beats a 20%-share incumbent who only adds +1pp. */}
            {(d.industry_tam_usd_bn != null ||
              d.company_share_pct != null ||
              d.share_delta_5y_pp != null) && (
              <div className="mb-4 rounded-md border border-border-subtle bg-bg-elev/30 px-4 py-3">
                <div className="text-[10px] uppercase tracking-widest text-ink-tertiary mb-2 font-mono">
                  {locale === "zh" ? "市场全景" : "Market View"}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-sm">
                  {d.industry_tam_usd_bn != null && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary font-mono mb-0.5">
                        {locale === "zh" ? "行业 TAM" : "Industry TAM"}
                      </div>
                      <div className="font-semibold text-ink-primary leading-tight">
                        ${d.industry_tam_usd_bn}bn
                      </div>
                      {d.industry_tam_year && (
                        <div className="text-[11px] text-ink-tertiary mt-0.5 leading-snug">
                          {d.industry_tam_year}
                        </div>
                      )}
                    </div>
                  )}
                  {d.company_share_pct != null && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary font-mono mb-0.5">
                        {locale === "zh" ? "公司份额" : "Company Share"}
                      </div>
                      <div className="font-semibold text-ink-primary leading-tight">
                        {d.company_share_pct.toFixed(1)}%
                      </div>
                      <div className="text-[11px] text-ink-tertiary mt-0.5 leading-snug">
                        {locale === "zh" ? "当前" : "current"}
                      </div>
                    </div>
                  )}
                  {d.share_delta_5y_pp != null && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-ink-tertiary font-mono mb-0.5">
                        {locale === "zh" ? "5 年 Δ 份额" : "Δ Share (5y)"}
                      </div>
                      <div
                        className={cn(
                          "font-semibold leading-tight",
                          d.share_delta_5y_pp > 0
                            ? "text-signal-good"
                            : d.share_delta_5y_pp < 0
                              ? "text-signal-bad"
                              : "text-ink-primary",
                        )}
                      >
                        {d.share_delta_5y_pp > 0 ? "+" : ""}
                        {d.share_delta_5y_pp.toFixed(1)}pp
                      </div>
                      <div className="text-[11px] text-ink-tertiary mt-0.5 leading-snug">
                        {d.share_delta_5y_pp > 0
                          ? locale === "zh"
                            ? "份额提升"
                            : "share gainer"
                          : d.share_delta_5y_pp < 0
                            ? locale === "zh"
                              ? "份额流失"
                              : "share loser"
                            : locale === "zh"
                              ? "持平"
                              : "stable"}
                      </div>
                    </div>
                  )}
                </div>
                {d.share_delta_note && (
                  <p className="mt-3 pt-3 border-t border-border-subtle text-xs text-ink-secondary leading-relaxed">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-ink-tertiary mr-2">
                      {locale === "zh" ? "机理" : "Mechanism"}:
                    </span>
                    {d.share_delta_note}
                  </p>
                )}
              </div>
            )}
            {Array.isArray(d.key_takeaways) && d.key_takeaways.length > 0 && (
              <div className="mb-4 rounded-md border border-border-subtle bg-bg-elev/40 px-4 py-3">
                <div className="text-[10px] uppercase tracking-widest text-ink-tertiary mb-2 font-mono">
                  {locale === "zh" ? "关键观点" : "Key Takeaways"}
                </div>
                <ul className="space-y-1.5">
                  {d.key_takeaways.map((kt, i) => (
                    <li
                      key={i}
                      className="flex gap-2 text-sm text-ink-primary leading-relaxed"
                    >
                      <span className={cn("shrink-0", style.pillText)}>▪</span>
                      <span>{typeof kt === "string" ? kt : JSON.stringify(kt)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* v97b: BofA-style visual aids. Each component gates on its
                own data and returns null when missing — so a manager that
                only fills 1 of 3 still renders cleanly. The components
                self-style and slot into the same vertical flow as the
                Market View / Key Takeaways blocks above. */}
            <PhaseTimeline phases={d.phases || []} locale={locale} />
            <DriverMatrix matrix={d.driver_matrix} locale={locale} />
            <MoatRadar criteria={d.moat_criteria || []} locale={locale} />
            <p className="text-ink-primary leading-relaxed text-base">
              {d.rationale}
            </p>
            {d.risk_notes && (
              <div className="mt-3 flex items-start gap-2 text-sm text-ink-secondary">
                <AlertTriangle className="w-4 h-4 text-signal-warn shrink-0 mt-0.5" />
                <span>{d.risk_notes}</span>
              </div>
            )}
            {Array.isArray(d.flags) && d.flags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {/* v63: Array.isArray guard above. The Decision TypeScript
                    interface declares flags: string[], but a misbehaving
                    backend / LLM-shaped payload could send a bare string,
                    and `d.flags.length > 0` would let it through to crash
                    .map(). Runtime guard prevents the white-screen. */}
                {d.flags.map((f) => (
                  <span
                    key={typeof f === "string" ? f : JSON.stringify(f)}
                    className="pill bg-signal-warn_soft text-signal-warn"
                  >
                    {typeof f === "string" ? f : JSON.stringify(f)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Stats strip across the bottom */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border-subtle border-t border-border-subtle">
            <StatCell label={t("decision.targetWeight")} value={signedPct(d.target_weight)} mono />
            <StatCell
              label={t("decision.confidence")}
              value={`${(d.confidence * 100).toFixed(0)}%`}
              accent
            >
              <div className="mt-1.5 h-1 bg-bg-base rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${d.confidence * 100}%` }}
                />
              </div>
            </StatCell>
            <StatCell
              label={t("decision.llmCost")}
              value={`$${(trace.total_cost_usd ?? 0).toFixed(4)}`}
              mono
            />
            <StatCell
              label={t("decision.reports")}
              value={`${trace.analyst_reports.length} / 5`}
              mono
            />
          </div>
        </div>
      </div>

      {/* Prominent export bar — first thing the user sees after the
          decision card. One click → full report, no "share first" friction. */}
      {jobId && (
        <div className="surface-elev p-4 flex items-center gap-3 flex-wrap">
          <div className="text-sm text-ink-secondary">
            <span className="text-ink-primary font-medium">{t("decision.exportPrompt") || "导出本次决策"}</span>
            <span className="text-ink-tertiary ml-2">/ Export this decision</span>
          </div>
          <div className="ml-auto">
            <ShareButton jobId={jobId} prominent />
          </div>
        </div>
      )}

      <PipelineTimeline trace={trace} />

      {trace.analyst_reports.length > 0 && (
        <Section
          title={t("decision.analystReports")}
          subtitle={t("decision.analystSubtitle")}
        >
          <AnalystTabs reports={trace.analyst_reports} />
        </Section>
      )}

      {trace.researcher_debate && (
        <Section
          title={t("decision.researchers")}
          subtitle={t("decision.researchersSubtitle")}
        >
          <DebateView transcript={trace.researcher_debate} />
        </Section>
      )}

      {trace.trader_plan && (
        <Section
          title={t("decision.trader")}
          subtitle={t("decision.traderSubtitle")}
          icon={<Briefcase className="w-4 h-4" />}
        >
          <TraderPlan text={trace.trader_plan} />
        </Section>
      )}

      {trace.risk_debate && (
        <Section
          title={t("decision.risk")}
          subtitle={t("decision.riskSubtitle")}
          icon={<ShieldCheck className="w-4 h-4" />}
        >
          <RiskView transcript={trace.risk_debate} />
        </Section>
      )}

      <BrokerLinks trace={trace} />
      {/* v92b: Sell-side-research-style Compliance Footer. Modelled on
          Morgan Stanley's end-of-report Disclosures section. Three goals:
          (1) signal "professional research" rather than "AI agent output"
          to the user at a glance, (2) lay the groundwork for SFC Type 4
          license review (Analyst Certification + relative-rating framing
          + risk boilerplate are all auditor-friendly), (3) shield the
          firm from the legal exposure that BUY/HOLD/SELL absolute calls
          create. */}
      <ComplianceFooter decision={trace.decision} locale={locale} />
      <div className="flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-border-subtle">
        <FeedbackBar trace={trace} />
        {jobId && <ShareButton jobId={jobId} />}
      </div>
    </div>
  );
}

/** v92b Compliance Footer — Morgan-Stanley-style end-of-report disclosures.
 *
 *  Renders three blocks: Analyst Certification + Rating-methodology note +
 *  Risk boilerplate. All copy is generated client-side from the Decision
 *  object so the footer adapts to whichever rating + benchmark + horizon
 *  the manager actually emitted. Defaults are MS standard ("12-18 months",
 *  "risk-adjusted basis", "industry coverage universe").
 */
function ComplianceFooter({
  decision,
  locale,
}: {
  decision: DecisionTrace["decision"];
  locale: "en" | "zh";
}) {
  const benchmark = decision.benchmark || "industry coverage universe";
  const horizon = decision.time_horizon || "12-18 months";
  const isZh = locale === "zh";
  return (
    <section className="surface-elev px-5 py-4 text-[11px] leading-relaxed text-ink-tertiary font-mono space-y-3">
      <div className="text-[10px] uppercase tracking-widest text-ink-secondary">
        {isZh ? "披露与方法论" : "Disclosures & Methodology"}
      </div>

      <div>
        <span className="text-ink-secondary font-semibold">
          {isZh ? "AI 分析师认证：" : "Analyst Certification: "}
        </span>
        {isZh
          ? `本决策由 Concordal 7 个 AI agent 协同生成。各 agent 兹证明：本报告中关于所述证券的观点准确反映其基于所提供数据的分析，agent 不因表达特定建议而获得直接或间接补偿。`
          : `This decision was generated by Concordal's 7 AI agents in concert. The agents hereby certify that the views about the companies and securities discussed in this report accurately reflect their analysis of the data provided, and they have not received and will not receive direct or indirect compensation in exchange for expressing specific recommendations or views.`}
      </div>

      <div>
        <span className="text-ink-secondary font-semibold">
          {isZh ? "评级方法论：" : "Rating Methodology: "}
        </span>
        {isZh
          ? `本系统使用相对评级体系。Overweight (超配) / Equal-weight (标配) / Underweight (低配) 分别指标的预期总回报相对于「${benchmark}」在未来 ${horizon} 内、风险调整后的表现。评级并非买入/持有/卖出的等价表达，不构成具体买卖建议。`
          : `This system uses a relative-rating framework. Overweight / Equal-weight / Underweight indicate the stock's expected total return relative to "${benchmark}" over the next ${horizon}, on a risk-adjusted basis. Ratings are not equivalent to Buy / Hold / Sell and do not constitute specific buy or sell recommendations.`}
      </div>

      <div>
        <span className="text-ink-secondary font-semibold">
          {isZh ? "风险提示：" : "Risk Disclosures: "}
        </span>
        <ul className="mt-1 ml-3 list-disc space-y-0.5">
          {(isZh
            ? [
                "政策变化超预期 — 监管 / 财政 / 货币政策方向调整可能影响行业基本面",
                "经济变化超预期 — 宏观增长放缓或加速可能改变估值锚",
                "流动性风险 — 市场资金面变化可能放大短期波动",
                "数据源延迟 — 部分数据存在 T+1 / T+30 滞后，请以最新公告为准",
              ]
            : [
                "Policy risk — regulatory / fiscal / monetary shifts may alter sector fundamentals",
                "Economic risk — macro acceleration or slowdown may reset valuation anchors",
                "Liquidity risk — capital-flow changes may amplify short-term volatility",
                "Data latency — some sources publish on a T+1 / T+30 delay; verify against the latest official disclosures"
              ]
          ).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="pt-2 border-t border-border-subtle text-ink-tertiary">
        {isZh
          ? "本报告仅供研究参考，不构成投资建议。投资者应独立判断、自担风险。Concordal 香港 SFC Type 4 牌照申请中。"
          : "This report is for research reference only and does not constitute investment advice. Investors should make independent decisions and bear all risks. Concordal is in the process of applying for a Hong Kong SFC Type 4 license."}
      </div>
    </section>
  );
}

/** Thumbs up / down on the decision. Persists to /v1/feedback so we can
 *  later use it as ground-truth labels for prompt iteration / RLHF. */
function FeedbackBar({ trace }: { trace: DecisionTrace }) {
  const { t } = useT();
  const [sent, setSent] = useState<"up" | "down" | null>(null);

  async function send(verdict: "up" | "down") {
    if (sent) return;
    setSent(verdict);
    try {
      await api.feedback({
        ticker: trace.ticker,
        asof: trace.asof,
        side: trace.decision.side,
        verdict,
      });
    } catch {
      // best-effort; UI already says thanks
    }
  }

  if (sent) {
    return (
      <div className="flex items-center justify-center gap-2 text-sm text-ink-tertiary py-2">
        <CheckCircle2 className="w-4 h-4 text-accent" />
        {t("feedback.thanks")}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center gap-3 py-2 text-sm">
      <span className="text-ink-tertiary">{t("feedback.prompt")}</span>
      <button
        onClick={() => send("up")}
        className="btn-ghost px-3 py-1.5"
        aria-label={t("feedback.helpful")}
      >
        <span aria-hidden>👍</span>
        <span>{t("feedback.helpful")}</span>
      </button>
      <button
        onClick={() => send("down")}
        className="btn-ghost px-3 py-1.5"
        aria-label={t("feedback.notHelpful")}
      >
        <span aria-hidden>👎</span>
        <span>{t("feedback.notHelpful")}</span>
      </button>
    </div>
  );
}

/** BrokerLinks — affiliate hand-off after the decision is made.
 *
 *  We never execute trades on the user's behalf, but each market has a
 *  set of brokers the user might want to open the position with. These
 *  are affiliate links (operator earns referral when the user opens an
 *  account). Set TA_AFFILIATE_* env vars / NEXT_PUBLIC_AFFILIATE_*
 *  prefixes to plug your own ref codes.
 *
 *  Per-market broker map keeps US users from seeing CN brokers and vice
 *  versa. Crypto market gets exchange links instead (Binance, Coinbase).
 */
const BROKER_LINKS: Record<string, { name: string; href: string; note?: string }[]> = {
  us_equity: [
    { name: "Interactive Brokers", href: "https://www.interactivebrokers.com/?aff=tradingagents" },
    { name: "Alpaca",               href: "https://alpaca.markets/?ref=tradingagents" },
    { name: "Robinhood",            href: "https://join.robinhood.com/tradingagents" },
  ],
  a_share: [
    { name: "富途 Futu",            href: "https://www.futunn.com/?ref=tradingagents", note: "支持 A股 + 港美股" },
    { name: "老虎 Tiger",           href: "https://www.tigerbrokers.com/?ref=tradingagents", note: "国际券商" },
  ],
  crypto: [
    { name: "Binance",              href: "https://www.binance.com/en/register?ref=tradingagents" },
    { name: "Coinbase",             href: "https://coinbase.com/join/tradingagents" },
    { name: "OKX",                  href: "https://www.okx.com/join/tradingagents" },
  ],
};

function BrokerLinks({ trace }: { trace: DecisionTrace }) {
  const { t } = useT();
  // Infer market from the decision: ticker shape → market
  const ticker = trace.ticker.toUpperCase();
  let market: keyof typeof BROKER_LINKS = "us_equity";
  if (/^\d{6}$/.test(ticker)) market = "a_share";
  else if (ticker.includes("/") || ["BTC","ETH","SOL","BNB","XRP","ADA","DOGE","DOT"].includes(ticker)) market = "crypto";

  const brokers = BROKER_LINKS[market] || [];
  if (brokers.length === 0) return null;

  // Don't show broker links on flat / hold decisions — no trade to execute
  if (trace.decision.side === "HOLD") return null;

  return (
    <section className="surface p-5">
      <div className="label-cap mb-2">{t("broker.label")}</div>
      <p className="text-sm text-ink-secondary mb-3 leading-relaxed">{t("broker.body")}</p>
      <div className="flex flex-wrap gap-2">
        {brokers.map((b) => (
          <a
            key={b.name}
            href={b.href}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="btn-ghost text-sm"
            title={b.note}
          >
            {b.name}
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        ))}
      </div>
      <p className="text-2xs text-ink-tertiary mt-3">{t("broker.disclaimer")}</p>
    </section>
  );
}

/** Share button — generates a /d/[shareId] public URL the user can paste anywhere. */
/**
 * ShareButton — post-decision export hub.
 *
 * One-click flow: clicking ANY of the actions auto-mints a share-id behind
 * the scenes (idempotent — only minted once, reused thereafter), so the
 * user never has to "first share, then do thing X". That two-step dance
 * was the friction point the user called out.
 *
 *   📄 完整报告 → auto-share + open /d/{shareId}/report in new tab
 *   ⬇ Markdown → auto-share + download .md
 *   🔗 复制链接 → auto-share + copy share URL to clipboard
 *
 * The minted share is cached in component state so subsequent clicks
 * don't ping the backend again.
 */
function ShareButton({ jobId, prominent = false }: { jobId: string; prominent?: boolean }) {
  const { t, locale } = useT();
  const [busy, setBusy] = useState<null | "report" | "md" | "copy">(null);
  const [shareId, setShareId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function ensureShare(): Promise<string> {
    if (shareId) return shareId;
    const { share_id } = await api.shareDecision(jobId);
    setShareId(share_id);
    return share_id;
  }

  async function openReport() {
    if (busy) return;
    setBusy("report");
    try {
      const sid = await ensureShare();
      window.open(`/d/${sid}/report`, "_blank", "noopener");
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function downloadMd() {
    if (busy) return;
    setBusy("md");
    try {
      const sid = await ensureShare();
      window.location.href = `${process.env.NEXT_PUBLIC_API || "http://localhost:8000"}/v1/decisions/share/${sid}/report.md`;
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    if (busy) return;
    setBusy("copy");
    try {
      const sid = await ensureShare();
      const url = `${window.location.origin}/d/${sid}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // PROMINENT variant — used at top of decision result. Single big primary CTA.
  if (prominent) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={openReport}
          disabled={busy !== null}
          className="btn-primary text-sm"
        >
          {busy === "report" ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> {locale === "zh" ? "生成中..." : "Generating..."}</>
          ) : (
            <>📄 {locale === "zh" ? "完整报告" : "Full report"}</>
          )}
        </button>
        <button onClick={downloadMd} disabled={busy !== null} className="btn-secondary text-sm">
          {busy === "md" ? (
            <><Loader2 className="w-4 h-4 animate-spin" /></>
          ) : (
            <>⬇ Markdown</>
          )}
        </button>
        <button onClick={copyLink} disabled={busy !== null} className="btn-secondary text-sm">
          {busy === "copy" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : copied ? (
            <><CheckCircle2 className="w-4 h-4 text-accent" /> {locale === "zh" ? "已复制" : "Copied"}</>
          ) : (
            <><Share2 className="w-4 h-4" /> {locale === "zh" ? "复制链接" : "Copy link"}</>
          )}
        </button>
      </div>
    );
  }

  // COMPACT variant — used at bottom of decision view.
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button onClick={openReport} disabled={busy !== null} className="btn-secondary text-xs">
        {busy === "report" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <>📄 {locale === "zh" ? "完整报告" : "Report"}</>}
      </button>
      <button onClick={downloadMd} disabled={busy !== null} className="btn-ghost text-xs px-2 py-1">
        {busy === "md" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <>⬇ .md</>}
      </button>
      <button onClick={copyLink} disabled={busy !== null} className="btn-ghost text-xs px-2 py-1">
        {busy === "copy" ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : copied ? (
          <><CheckCircle2 className="w-3.5 h-3.5 text-accent" /> {t("share.copied")}</>
        ) : (
          <><Share2 className="w-3.5 h-3.5" /> {t("share.button")}</>
        )}
      </button>
    </div>
  );
}

/** Render trader plan: split lines into key/value rows when possible. */
function TraderPlan({ text }: { text: string }) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Each line ideally looks like "Key: value." — split on first ":"
  const rows = lines.map((line) => {
    const colon = line.indexOf(":");
    if (colon === -1 || colon > 40) return { key: null, value: line };
    return {
      key: line.slice(0, colon).trim(),
      value: line.slice(colon + 1).trim().replace(/\.$/, ""),
    };
  });

  return (
    <div className="surface overflow-hidden">
      <div className="divide-y divide-border-subtle">
        {rows.map((r, i) =>
          r.key ? (
            <div
              key={i}
              className="grid grid-cols-[160px_1fr] gap-4 px-5 py-3 hover:bg-bg-hover/30 transition-colors"
            >
              <span className="label-cap pt-0.5">{r.key}</span>
              <span className="text-sm text-ink-primary leading-relaxed">
                {r.value}
              </span>
            </div>
          ) : (
            <div key={i} className="px-5 py-3 text-sm text-ink-primary leading-relaxed">
              {r.value}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
  mono,
  accent,
  children,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-bg-elevated p-4">
      <div className="label-cap">{label}</div>
      <div
        className={cn(
          "mt-1.5 text-lg font-semibold leading-none",
          mono && "font-mono",
          accent && "text-accent"
        )}
      >
        {value}
      </div>
      {children}
    </div>
  );
}

function signedPct(w: number) {
  const s = w >= 0 ? "+" : "";
  return `${s}${(w * 100).toFixed(2)}%`;
}

function Section({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-3 mb-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          {icon && <span className="text-ink-tertiary">{icon}</span>}
          {title}
        </h2>
        {subtitle && (
          <p className="text-sm text-ink-tertiary hidden sm:block">
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

const ANALYST_META: Record<
  string,
  { icon: React.ReactNode; color: string; labelKey: "decision.fundamentals" | "decision.sentiment" | "decision.news" | "decision.technical" | "decision.macro" }
> = {
  fundamentals: {
    icon: <BarChart3 className="w-4 h-4" />,
    color: "text-signal-buy",
    labelKey: "decision.fundamentals",
  },
  sentiment: {
    icon: <Users className="w-4 h-4" />,
    color: "text-signal-info",
    labelKey: "decision.sentiment",
  },
  news: {
    icon: <Newspaper className="w-4 h-4" />,
    color: "text-signal-warn",
    labelKey: "decision.news",
  },
  technical: {
    icon: <LineChart className="w-4 h-4" />,
    color: "text-purple-400",
    labelKey: "decision.technical",
  },
  macro: {
    icon: <Globe className="w-4 h-4" />,
    color: "text-signal-info",
    labelKey: "decision.macro",
  },
};

function AnalystTabs({ reports }: { reports: AnalystReport[] }) {
  const { t } = useT();
  const [active, setActive] = useState(reports[0]?.analyst || "fundamentals");
  const current = reports.find((r) => r.analyst === active) || reports[0];
  const cleanedBody = current ? stripCodeFences(current.body) : "";

  return (
    <div className="surface overflow-hidden">
      <div className="flex border-b border-border-subtle overflow-x-auto">
        {reports.map((r) => {
          const meta = ANALYST_META[r.analyst];
          const isActive = r.analyst === active;
          return (
            <button
              key={r.analyst}
              onClick={() => setActive(r.analyst)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-colors",
                isActive
                  ? "border-accent text-ink-primary bg-bg-hover"
                  : "border-transparent text-ink-secondary hover:text-ink-primary hover:bg-bg-hover/50"
              )}
            >
              <span className={cn(isActive ? meta?.color : "")}>
                {meta?.icon}
              </span>
              {meta?.labelKey ? t(meta.labelKey) : r.analyst}
            </button>
          );
        })}
      </div>
      {current && (
        <div className="p-5 space-y-4">
          <div className="text-sm text-ink-primary leading-relaxed whitespace-pre-wrap">
            {cleanedBody}
          </div>
          {Object.keys(current.signals || {}).length > 0 && (
            <div>
              <div className="label-cap mb-2">{t("decision.signals")}</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(current.signals).map(([k, v]) => (
                  <span
                    key={k}
                    className="pill bg-bg-subtle border border-border-subtle text-ink-secondary"
                  >
                    <span className="text-ink-tertiary">{k}</span>
                    <span className="font-mono text-ink-primary">
                      {String(v)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {current.sources && current.sources.length > 0 && (
            <div className="text-xs text-ink-tertiary">
              {current.sources.length} {t("decision.sources")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * DebateView — bull vs bear, ROUND-ALIGNED.
 *
 * Why round-aligned (not pure-column): the dialectic is the product. A
 * reader needs to see "bear countered the bull's round 1 with round 1
 * of their own" laid out horizontally, like a court transcript, not
 * two separate stacks. The previous render had bull-stack + bear-stack
 * which collapsed the back-and-forth into two parallel monologues.
 *
 * Layout per round:
 *
 *   ┌─ Round N ──────────────────────────────────────────────┐
 *   │  BULL (left, green)           BEAR (right, red)        │
 *   │  "..."                         "..."                   │
 *   └────────────────────────────────────────────────────────┘
 *
 * On mobile, the two columns stack vertically but the round number
 * stays as a banding header so the reader doesn't lose the structure.
 *
 * Synthesis (facilitator's verdict) lives at the bottom as a pull-quote.
 */
function DebateView({ transcript }: { transcript: DebateTranscript }) {
  const { t } = useT();
  const turns = transcript.turns || [];
  // Group turns by round, then split each round into bull/bear sides.
  const rounds = Array.from(new Set(turns.map((x) => x.round))).sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      {/* Column headers — visible above all rounds */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-center sticky top-14 z-10 bg-bg-base/95 backdrop-blur-xl pt-2 pb-2 -mt-2">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-signal-buy/30 bg-signal-buy_soft text-signal-buy text-sm font-semibold">
          <TrendingUp className="w-4 h-4" />
          {t("decision.bull")}
        </div>
        <div className="hidden md:block w-px h-6 bg-border-subtle mx-auto" />
        <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-signal-sell/30 bg-signal-sell_soft text-signal-sell text-sm font-semibold">
          <TrendingDown className="w-4 h-4" />
          {t("decision.bear")}
        </div>
      </div>

      {/* One row per round, bull left + bear right, horizontally aligned. */}
      {rounds.map((r) => {
        const bull = turns.find((x) => x.round === r && x.speaker === "bull");
        const bear = turns.find((x) => x.round === r && x.speaker === "bear");
        return (
          <div key={r} className="relative">
            <div className="absolute -left-2 top-0 bottom-0 w-px bg-border-subtle hidden md:block" />
            <div className="label-cap mb-2 ml-1 text-accent">
              {t("decision.round") || "Round"} {r}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <DebateBubble
                content={bull?.content}
                color="bull"
              />
              <DebateBubble
                content={bear?.content}
                color="bear"
              />
            </div>
          </div>
        );
      })}

      {/* Facilitator synthesis — pull-quote style */}
      {transcript.synthesis && (
        <div className="surface-elev p-5 border-l-2 border-l-accent mt-6">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="label-cap text-accent">
              {t("decision.synthesis") || "Synthesis"}
            </span>
          </div>
          <p className="text-sm text-ink-primary leading-relaxed italic">
            "{transcript.synthesis}"
          </p>
        </div>
      )}
    </div>
  );
}

function DebateBubble({
  content,
  color,
}: {
  content?: string;
  color: "bull" | "bear";
}) {
  const accent =
    color === "bull"
      ? "border-l-signal-buy bg-signal-buy_soft/40"
      : "border-l-signal-sell bg-signal-sell_soft/40";
  if (!content) {
    return (
      <div className={cn("surface p-4 border-l-2 opacity-50", accent)}>
        <span className="text-xs text-ink-tertiary italic">
          (no statement)
        </span>
      </div>
    );
  }
  return (
    <div className={cn("surface p-4 border-l-2 leading-relaxed", accent)}>
      <p className="text-sm text-ink-primary">
        {stripRolePrefix(content)}
      </p>
    </div>
  );
}

const RISK_META: Record<
  string,
  { color: string; bg: string; labelKey: "decision.aggressive" | "decision.neutral" | "decision.conservative" }
> = {
  aggressive: {
    color: "text-signal-buy",
    bg: "bg-signal-buy_soft border-signal-buy/30",
    labelKey: "decision.aggressive",
  },
  neutral: {
    color: "text-ink-secondary",
    bg: "bg-bg-hover border-border",
    labelKey: "decision.neutral",
  },
  conservative: {
    color: "text-signal-sell",
    bg: "bg-signal-sell_soft border-signal-sell/30",
    labelKey: "decision.conservative",
  },
};

function RiskView({ transcript }: { transcript: DebateTranscript }) {
  const { t } = useT();
  return (
    <div className="grid md:grid-cols-3 gap-3">
      {(["aggressive", "neutral", "conservative"] as const).map((role) => {
        const turn = transcript.turns?.find((t) => t.speaker === role);
        const meta = RISK_META[role];
        return (
          <div key={role} className={cn("rounded-xl border p-4", meta.bg)}>
            <div className="flex items-center gap-2 mb-3">
              <Gavel className={cn("w-4 h-4", meta.color)} />
              <span className={cn("font-semibold text-sm", meta.color)}>
                {t(meta.labelKey)}
              </span>
            </div>
            <p className="text-sm text-ink-primary leading-relaxed">
              {turn?.content ? (
                stripRolePrefix(turn.content)
              ) : (
                <span className="text-ink-tertiary italic">No statement</span>
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function useStages() {
  const { t } = useT();
  return [
    { key: "quote", label: "Quote", icon: <LineChart className="w-3.5 h-3.5" /> },
    {
      key: "fundamentals",
      label: t("decision.fundamentals"),
      icon: <BarChart3 className="w-3.5 h-3.5" />,
    },
    { key: "sentiment", label: t("decision.sentiment"), icon: <Users className="w-3.5 h-3.5" /> },
    { key: "news", label: t("decision.news"), icon: <Newspaper className="w-3.5 h-3.5" /> },
    { key: "technical", label: t("decision.technical"), icon: <LineChart className="w-3.5 h-3.5" /> },
    { key: "macro", label: t("decision.macro"), icon: <Globe className="w-3.5 h-3.5" /> },
    {
      key: "researcher",
      label: `${t("decision.bull")} / ${t("decision.bear")}`,
      icon: <MessageCircle className="w-3.5 h-3.5" />,
    },
    { key: "trader", label: t("decision.trader").replace(" plan", "").replace(" 方案", ""), icon: <Briefcase className="w-3.5 h-3.5" /> },
    { key: "risk", label: t("decision.risk").replace(" committee", "").replace(" 委员会", ""), icon: <ShieldCheck className="w-3.5 h-3.5" /> },
    { key: "manager", label: t("decision.manager").replace(" final call", "").replace(" 终审", ""), icon: <Gavel className="w-3.5 h-3.5" /> },
  ];
}

function PipelineTimeline({ trace }: { trace: DecisionTrace }) {
  const STAGES = useStages();
  const reports = new Set(trace.analyst_reports.map((r) => r.analyst));
  const completed = (k: string) => {
    if (k === "quote") return true;
    if (["fundamentals", "sentiment", "news", "technical", "macro"].includes(k))
      return reports.has(k);
    if (k === "researcher") return !!trace.researcher_debate;
    if (k === "trader") return !!trace.trader_plan;
    if (k === "risk") return !!trace.risk_debate;
    if (k === "manager") return !!trace.decision;
    return false;
  };
  return (
    <div className="surface p-3">
      <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto pb-1">
        {STAGES.map((s, i) => {
          const done = completed(s.key);
          return (
            <div key={s.key} className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              <span
                className={cn(
                  "pill border whitespace-nowrap",
                  done
                    ? "bg-accent-muted border-accent/30 text-accent"
                    : "bg-bg-subtle border-border-subtle text-ink-tertiary"
                )}
              >
                {done ? <CheckCircle2 className="w-3 h-3" /> : s.icon}
                {s.label}
              </span>
              {i < STAGES.length - 1 && (
                <ArrowRight className="w-3 h-3 text-ink-muted shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Live progress timeline shown while the decision pipeline is running.
 *
 * Stages mirror `STAGES` in src/trading_agents/core/graph.py. Each stage
 * is one of:
 *   - completed  → green check
 *   - errored    → red X
 *   - running    → spinner + "Running" pill
 *   - waiting    → muted icon
 *
 * The currently-running stage is also called out in a prominent banner
 * above the timeline so the user always sees a verb ("Fetching quote…")
 * instead of a single 90-second spinner.
 */
const LIVE_STAGES: Array<{
  key: string;
  labelKey:
    | "progress.quote"
    | "progress.fundamentals"
    | "progress.sentiment"
    | "progress.news"
    | "progress.technical"
    | "progress.macro"
    | "progress.researcher_debate"
    | "progress.trader"
    | "progress.risk_debate"
    | "progress.manager";
  icon: React.ReactNode;
}> = [
  { key: "quote", labelKey: "progress.quote", icon: <LineChart className="w-3.5 h-3.5" /> },
  { key: "fundamentals", labelKey: "progress.fundamentals", icon: <BarChart3 className="w-3.5 h-3.5" /> },
  { key: "sentiment", labelKey: "progress.sentiment", icon: <Users className="w-3.5 h-3.5" /> },
  { key: "news", labelKey: "progress.news", icon: <Newspaper className="w-3.5 h-3.5" /> },
  { key: "technical", labelKey: "progress.technical", icon: <LineChart className="w-3.5 h-3.5" /> },
  { key: "macro", labelKey: "progress.macro", icon: <Globe className="w-3.5 h-3.5" /> },
  { key: "researcher_debate", labelKey: "progress.researcher_debate", icon: <MessageCircle className="w-3.5 h-3.5" /> },
  { key: "trader", labelKey: "progress.trader", icon: <Briefcase className="w-3.5 h-3.5" /> },
  { key: "risk_debate", labelKey: "progress.risk_debate", icon: <ShieldCheck className="w-3.5 h-3.5" /> },
  { key: "manager", labelKey: "progress.manager", icon: <Gavel className="w-3.5 h-3.5" /> },
];

function LiveProgress({ progress }: { progress: DecisionProgress | null }) {
  const { t } = useT();
  const completed = new Set(progress?.completed || []);
  const errored = new Set(progress?.errored || []);
  const current = progress?.current_stage || null;
  const currentStage = LIVE_STAGES.find((s) => s.key === current);
  const totalDone = completed.size + errored.size;

  return (
    <div className="mt-6 surface-elev p-5 animate-fade-in">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div>
          <span className="label-cap">{t("progress.heading")}</span>
          <h3 className="text-sm font-semibold mt-0.5 text-ink-primary">
            {currentStage
              ? t(currentStage.labelKey)
              : totalDone === 0
                ? t("progress.starting")
                : t("progress.starting")}
            {currentStage && <span className="text-ink-tertiary"> …</span>}
          </h3>
        </div>
        <span className="font-mono text-xs text-ink-tertiary shrink-0">
          {totalDone} / {LIVE_STAGES.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-bg-base rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-accent transition-all duration-500"
          style={{ width: `${(totalDone / LIVE_STAGES.length) * 100}%` }}
        />
      </div>

      {/* Per-stage timeline */}
      <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto pb-1">
        {LIVE_STAGES.map((s, i) => {
          const isDone = completed.has(s.key);
          const isErr = errored.has(s.key);
          const isRunning = current === s.key;
          let pillCls = "bg-bg-subtle border-border-subtle text-ink-tertiary";
          let leadIcon: React.ReactNode = s.icon;
          if (isDone) {
            pillCls = "bg-accent-muted border-accent/30 text-accent";
            leadIcon = <CheckCircle2 className="w-3 h-3" />;
          } else if (isErr) {
            pillCls = "bg-signal-sell_soft border-signal-sell/30 text-signal-sell";
            leadIcon = <XCircle className="w-3 h-3" />;
          } else if (isRunning) {
            pillCls = "bg-signal-info_soft border-signal-info/30 text-signal-info animate-pulse";
            leadIcon = <Loader2 className="w-3 h-3 animate-spin" />;
          }
          return (
            <div key={s.key} className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              <span className={cn("pill border whitespace-nowrap", pillCls)}>
                {leadIcon}
                {t(s.labelKey)}
              </span>
              {i < LIVE_STAGES.length - 1 && (
                <ArrowRight className="w-3 h-3 text-ink-muted shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-ink-tertiary mt-3">
        {t("progress.subheading")}
      </p>
    </div>
  );
}

/** Quick-pick ticker chips so users don't have to type. Three groups
 *  (US / A-share / Crypto) so the auto-routing path gets exercised. */
function QuickPicks({
  current,
  disabled,
  onPick,
}: {
  current: string;
  disabled: boolean;
  onPick: (t: string) => void;
}) {
  const { t } = useT();
  const groups: Array<{ label: string; items: string[] }> = [
    { label: t("decision.quickPicks.us"), items: ["AAPL", "NVDA", "TSLA", "MSFT"] },
    { label: t("decision.quickPicks.cn"), items: ["600519", "000001", "300750", "002594"] },
    { label: t("decision.quickPicks.crypto"), items: ["BTC", "ETH", "SOL"] },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-cap">{t("decision.quickPicks")}</span>
      <div className="flex flex-wrap gap-1">
        {groups.flatMap((g) =>
          g.items.map((sym) => (
            <button
              key={sym}
              disabled={disabled}
              onClick={() => onPick(sym)}
              className={cn(
                "pill border whitespace-nowrap text-2xs font-mono transition-colors",
                current === sym
                  ? "bg-accent-muted text-accent border-accent/30"
                  : "bg-bg-subtle text-ink-secondary border-border-subtle hover:bg-bg-hover hover:text-ink-primary",
                disabled && "opacity-50 cursor-not-allowed"
              )}
              title={`${g.label} · ${sym}`}
            >
              {sym}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function SkeletonReport() {
  return (
    <div className="mt-8 space-y-4 animate-fade-in">
      <div className="surface-elev p-6 space-y-3">
        <div className="h-8 w-48 bg-bg-hover rounded animate-pulse" />
        <div className="h-5 w-full bg-bg-hover rounded animate-pulse" />
        <div className="h-5 w-4/5 bg-bg-hover rounded animate-pulse" />
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="surface p-5 space-y-2">
          <div className="h-4 w-24 bg-bg-hover rounded animate-pulse" />
          <div className="h-20 bg-bg-hover rounded animate-pulse" />
        </div>
        <div className="surface p-5 space-y-2">
          <div className="h-4 w-24 bg-bg-hover rounded animate-pulse" />
          <div className="h-20 bg-bg-hover rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}

/**
 * Banner shown above the decision form when the current user is NOT on the
 * real-LLM allowlist. Mock mode produces deterministic template output that
 * looks like analysis but is unrelated to the actual ticker — without this
 * banner, friends might mistake mock for real signal. Honest by default.
 */
/** Compact usage progress bar — visible to free-tier and anonymous
 *  users so they see their daily quota burning down. Hidden for Pro. */
function UsageBadge({ usage }: { usage: { used: number; cap: number | null; tier: string } }) {
  const { t } = useT();
  if (usage.cap == null) return null;
  const pct = Math.min(100, (usage.used / usage.cap) * 100);
  const nearCap = usage.used >= usage.cap - 1;
  return (
    <div className="mb-3 flex items-center gap-3 text-xs text-ink-secondary">
      <span className="font-mono">
        {t("usage.freeUsed")
          .replace("{used}", String(usage.used))
          .replace("{cap}", String(usage.cap))}
      </span>
      <div className="flex-1 max-w-xs h-1 bg-bg-base rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full transition-all",
            nearCap ? "bg-signal-warn" : "bg-accent",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {nearCap && (
        <Link href="/pricing#pro" className="btn-secondary text-xs px-2 py-0.5">
          {t("paywall.upgrade")}
        </Link>
      )}
    </div>
  );
}

/** Friendly banner shown to anonymous visitors so they know they can
 *  try the system without signing up. */
function DemoBanner() {
  const { t } = useT();
  return (
    <div className="mb-6 surface border-accent/30 bg-accent-muted/30 p-4 flex gap-3 items-start">
      <Sparkles className="w-5 h-5 text-accent shrink-0 mt-0.5" />
      <div className="flex-1 text-sm">
        <div className="font-semibold text-ink-primary">{t("demo.banner.title")}</div>
        <p className="text-ink-secondary mt-1 leading-relaxed">{t("demo.banner.body")}</p>
      </div>
      <Link href="/redeem" className="btn-ghost text-xs whitespace-nowrap">
        {t("header.redeemInvite")}
      </Link>
    </div>
  );
}

/** Modal that pops when 402 comes back. The whole point is the upgrade
 *  CTA; "tomorrow" is a passive secondary option. */
function PaywallModal({
  detail,
  onClose,
}: {
  detail: PaywallError["detail"];
  onClose: () => void;
}) {
  const { t } = useT();
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="surface-elev max-w-md w-full p-6 space-y-4 animate-fade-in"
      >
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-lg bg-signal-warn_soft text-signal-warn flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </span>
          <h2 className="text-lg font-semibold">{t("paywall.title")}</h2>
        </div>
        <p className="text-sm text-ink-secondary leading-relaxed">
          {t("paywall.body").replace("{cap}", String(detail.cap))}
        </p>
        <div className="flex items-center gap-2 flex-wrap pt-2">
          <Link href={detail.upgrade_url || "/pricing#pro"} className="btn-primary">
            <Sparkles className="w-4 h-4" />
            {t("paywall.upgrade")}
          </Link>
          <button onClick={onClose} className="btn-ghost text-sm">
            {t("paywall.tomorrow")}
          </button>
        </div>
      </div>
    </div>
  );
}

function MockBanner() {
  const { t } = useT();
  return (
    <div className="mb-6 surface border-signal-warn/40 p-4 flex gap-3 items-start bg-signal-warn_soft/40">
      <AlertTriangle className="w-5 h-5 text-signal-warn shrink-0 mt-0.5" />
      <div className="flex-1 text-sm">
        <div className="font-semibold text-ink-primary">
          {t("mockBanner.title")}
        </div>
        <p className="text-ink-secondary mt-1 leading-relaxed">
          {t("mockBanner.body")}
        </p>
      </div>
      <Link
        href="/pricing#pro"
        className="btn-primary text-xs whitespace-nowrap"
      >
        <Sparkles className="w-3.5 h-3.5" />
        {t("pricing.cta.pro")}
      </Link>
    </div>
  );
}
