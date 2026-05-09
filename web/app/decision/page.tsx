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
  Gavel,
  LineChart,
  Loader2,
  MessageCircle,
  Newspaper,
  Play,
  RefreshCw,
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
  type DecisionTrace,
  type DebateTranscript,
  type AnalystReport,
  type CurrentUser,
  type DecisionProgress,
} from "../lib/api";
import { cn } from "../lib/cn";
import { useT } from "../lib/i18n";

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

  useEffect(() => {
    if (!auth.isLoggedIn()) return;
    api.me().then(setUser).catch(() => undefined);
  }, []);

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
      setStage(t("decision.running"));
      // Poll the job status; the response includes a `progress` object
      // that updates as each agent reports start/done. We forward it
      // straight to <LiveProgress/>.
      for (let i = 0; i < 240; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const j = await api.getDecision(job.job_id);
        if (j.progress) setProgress(j.progress);
        if (j.status === "done") {
          setResult(j.result);
          setMode(j.mode || null);
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
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      {user && !user.real_llm && <MockBanner />}
      <div className="mb-6">
        <span className="label-cap">{t("decision.label")}</span>
        <h1 className="text-2xl font-semibold mt-1">
          {t("decision.heading")}
        </h1>
        <p className="text-sm text-ink-secondary mt-1">
          {t("decision.subheading")}
        </p>
      </div>

      <div className="surface-elev p-3 flex flex-col sm:flex-row gap-3">
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="AAPL"
          className="input flex-1 sm:max-w-xs font-mono uppercase tracking-wider"
          disabled={loading}
          spellCheck={false}
        />
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
        <div className="mt-3 flex items-center gap-2 text-xs text-ink-tertiary">
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

      {result && <DecisionView trace={result} />}
    </div>
  );
}

function DecisionView({ trace }: { trace: DecisionTrace }) {
  const { t } = useT();
  const d = trace.decision;
  const style = SIDE_STYLES[d.side] || SIDE_STYLES.HOLD;
  return (
    <div className="mt-8 space-y-8 animate-fade-in">
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
            <p className="text-ink-primary leading-relaxed text-base">
              {d.rationale}
            </p>
            {d.risk_notes && (
              <div className="mt-3 flex items-start gap-2 text-sm text-ink-secondary">
                <AlertTriangle className="w-4 h-4 text-signal-warn shrink-0 mt-0.5" />
                <span>{d.risk_notes}</span>
              </div>
            )}
            {d.flags && d.flags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {d.flags.map((f) => (
                  <span
                    key={f}
                    className="pill bg-signal-warn_soft text-signal-warn"
                  >
                    {f}
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
              value={`${trace.analyst_reports.length} / 4`}
              mono
            />
          </div>
        </div>
      </div>

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

      <FeedbackBar trace={trace} />
    </div>
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
  { icon: React.ReactNode; color: string; labelKey: "decision.fundamentals" | "decision.sentiment" | "decision.news" | "decision.technical" }
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

function DebateView({ transcript }: { transcript: DebateTranscript }) {
  const { t } = useT();
  const turns = transcript.turns || [];
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-3">
        <DebateColumn
          label={t("decision.bull")}
          icon={<TrendingUp className="w-4 h-4" />}
          turns={turns.filter((t) => t.speaker === "bull")}
          color="signal-buy"
        />
        <DebateColumn
          label={t("decision.bear")}
          icon={<TrendingDown className="w-4 h-4" />}
          turns={turns.filter((t) => t.speaker === "bear")}
          color="signal-sell"
        />
      </div>
      {transcript.synthesis && (
        <div className="surface p-4 border-l-2 border-l-accent">
          <div className="flex items-center gap-2 mb-1.5">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="label-cap text-accent">Synthesis</span>
          </div>
          <p className="text-sm text-ink-primary leading-relaxed">
            {transcript.synthesis}
          </p>
        </div>
      )}
    </div>
  );
}

function DebateColumn({
  label,
  icon,
  turns,
  color,
}: {
  label: string;
  icon: React.ReactNode;
  turns: DebateTranscript["turns"];
  color: string;
}) {
  return (
    <div className="surface overflow-hidden">
      <div
        className={cn(
          "flex items-center gap-2 px-4 py-2.5 border-b border-border-subtle",
          color === "signal-buy" ? "bg-signal-buy_soft" : "bg-signal-sell_soft"
        )}
      >
        <span
          className={cn(
            color === "signal-buy" ? "text-signal-buy" : "text-signal-sell"
          )}
        >
          {icon}
        </span>
        <span className="font-semibold text-sm">{label}</span>
        <span className="text-xs text-ink-tertiary ml-auto">
          {turns.length} turn{turns.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="p-4 space-y-4">
        {turns.map((t, i) => (
          <div key={i}>
            <div className="label-cap mb-1.5">Round {t.round}</div>
            <p className="text-sm text-ink-primary leading-relaxed">
              {stripRolePrefix(t.content)}
            </p>
          </div>
        ))}
      </div>
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
    if (["fundamentals", "sentiment", "news", "technical"].includes(k))
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
        href="https://github.com/gallen666/trading-agents-platform/issues"
        target="_blank"
        rel="noopener noreferrer"
        className="btn-ghost text-xs whitespace-nowrap"
      >
        {t("mockBanner.contact")}
      </Link>
    </div>
  );
}
