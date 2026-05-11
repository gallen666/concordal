"use client";

/**
 * Track Record page — renders the latest agent backtest report.
 *
 * Source of truth: `reports/latest.json` in the GitHub repo. We fetch it
 * directly from raw.githubusercontent.com so we don't have to redeploy
 * the frontend every time a new backtest finishes — pushing the JSON to
 * the repo is enough.
 *
 * The shape mirrors `AgentBacktestReport` in
 * `src/trading_agents/backtest/agent_backtest.py`.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Award,
  ExternalLink,
  GitBranch,
  Loader2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "../lib/cn";
import { useT } from "../lib/i18n";

const REPORT_URL =
  "https://raw.githubusercontent.com/gallen666/trading-agents-platform/main/reports/latest.json";

// ---------------------------------------------------------------------------
// Types — mirror the Python dataclass JSON
// ---------------------------------------------------------------------------

interface Metrics {
  cumulative_return: number;
  annual_return: number;
  annual_volatility: number;
  sharpe: number;
  sortino: number;
  max_drawdown: number;
  win_rate: number;
  n_trades: number;
  avg_holding_days: number;
}

interface PortfolioMetrics {
  agent: Metrics;
  bh: Metrics;
  excess_return_vs_bh: number;
  excess_sharpe_vs_bh: number;
  pct_tickers_agent_beats_bh: number;
}

interface TickerOutcome {
  ticker: string;
  market: string;
  agent_metrics: Metrics;
  bh_metrics: Metrics;
  macd_metrics: Metrics | null;
  agent_curve: number[];
  bh_curve: number[];
  rebalance_dates: string[];
  decisions: Array<{
    asof: string;
    side: string;
    target_weight: number;
    confidence: number;
    rationale: string;
  }>;
}

interface Report {
  config: {
    tickers: [string, string][];
    start: string;
    end: string;
    rebalance_every_days: number;
    locale: string;
    debate_rounds: number;
  };
  started_at: string;
  finished_at: string;
  wall_clock_seconds: number;
  per_ticker: TickerOutcome[];
  portfolio: PortfolioMetrics;
  n_decisions: number;
  estimated_cost_usd: number;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TrackRecordPage() {
  const { t, locale } = useT();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(REPORT_URL, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as Report;
        setReport(j);
      })
      .catch((e: unknown) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">
      <header>
        <span className="label-cap">{t("track.label")}</span>
        <h1 className="text-3xl font-semibold mt-2">
          {t("track.heading")}
        </h1>
        <p className="text-ink-secondary mt-2 max-w-2xl">
          {t("track.subheading")}
        </p>
      </header>

      {loading && (
        <div className="surface p-12 flex items-center justify-center gap-3 text-ink-secondary">
          <Loader2 className="w-5 h-5 animate-spin" />
          {t("common.loading")}
        </div>
      )}

      {!loading && (error || !report) && <EmptyState error={error} />}

      {report && <ReportView report={report} locale={locale} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty / error
// ---------------------------------------------------------------------------

function EmptyState({ error }: { error: string | null }) {
  const { t, locale } = useT();
  // 404 / no file yet → friendly "not run yet" view with concrete steps.
  // Anything else → show the raw error too so the user can debug.
  const looksLikeNotFound = !error || error.includes("404") || error.toLowerCase().includes("not found");

  return (
    <div className="space-y-4">
      <div className="surface-elev p-8 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-signal-warn_soft text-signal-warn flex items-center justify-center">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">
              {locale === "zh" ? "回测还没跑过" : "Backtest not run yet"}
            </h2>
            <p className="text-sm text-ink-tertiary mt-0.5">
              {locale === "zh"
                ? "reports/latest.json 不存在。下面三步生成它。"
                : "reports/latest.json doesn't exist yet. Three steps to generate it:"}
            </p>
          </div>
        </div>

        <ol className="space-y-3 mt-2 text-sm">
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-accent-muted text-accent border border-accent/30 flex items-center justify-center text-xs font-semibold font-mono">1</span>
            <div>
              <div className="font-medium">
                {locale === "zh" ? "确保至少一个 LLM key 设了" : "Make sure at least one LLM key is configured"}
              </div>
              <p className="text-xs text-ink-tertiary mt-0.5">
                {locale === "zh"
                  ? "Render env 加 DEEPSEEK_API_KEY (或 GEMINI_API_KEY / ANTHROPIC_API_KEY)。免费档够用。"
                  : "Render env: DEEPSEEK_API_KEY (or GEMINI_API_KEY / ANTHROPIC_API_KEY). Free tiers are sufficient."}
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-accent-muted text-accent border border-accent/30 flex items-center justify-center text-xs font-semibold font-mono">2</span>
            <div>
              <div className="font-medium">
                {locale === "zh" ? "双击 outputs/run_agent_backtest.command" : "Double-click outputs/run_agent_backtest.command"}
              </div>
              <p className="text-xs text-ink-tertiary mt-0.5">
                {locale === "zh"
                  ? "脚本 git pull + 跑 20 票 × 12 周回测，1-2 小时完成。"
                  : "Script git pulls + runs 20 tickers × 12 weeks of backtests. 1-2 hours."}
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-accent-muted text-accent border border-accent/30 flex items-center justify-center text-xs font-semibold font-mono">3</span>
            <div>
              <div className="font-medium">
                {locale === "zh" ? "完成后自动 git push" : "Auto git push when done"}
              </div>
              <p className="text-xs text-ink-tertiary mt-0.5">
                {locale === "zh"
                  ? "reports/latest.json 推到 GitHub，本页 5 分钟内显示真实曲线。"
                  : "reports/latest.json gets pushed to GitHub; this page shows the real curves within 5 minutes."}
              </p>
            </div>
          </li>
        </ol>

        <div className="flex gap-3 flex-wrap pt-3">
          <a
            href="https://github.com/gallen666/trading-agents-platform/blob/main/src/trading_agents/backtest/agent_backtest.py"
            target="_blank" rel="noopener noreferrer"
            className="btn-secondary text-sm"
          >
            <GitBranch className="w-3.5 h-3.5" />
            {locale === "zh" ? "看回测引擎源码" : "See backtest engine source"}
            <ExternalLink className="w-3 h-3" />
          </a>
          <Link href="/proof" className="btn-ghost text-sm">
            {locale === "zh" ? "其他证据 →" : "Other proof →"}
          </Link>
        </div>
      </div>

      {/* Show raw error only if it's not the expected 404 */}
      {error && !looksLikeNotFound && (
        <div className="surface p-3 text-xs text-ink-tertiary font-mono">
          {error}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main report view
// ---------------------------------------------------------------------------

function ReportView({ report, locale }: { report: Report; locale: string }) {
  const { t } = useT();
  const p = report.portfolio;
  const beatsMarket = p.excess_return_vs_bh > 0;

  return (
    <>
      {/* Top stats strip */}
      <section className="surface-elev overflow-hidden">
        <div
          className={cn(
            "px-6 py-5 border-l-2",
            beatsMarket ? "border-l-signal-buy" : "border-l-signal-sell"
          )}
        >
          <div className="flex items-center gap-3">
            {beatsMarket ? (
              <span className="pill bg-signal-buy_soft text-signal-buy">
                <Award className="w-3.5 h-3.5" />
                {t("track.excess")}: {fmtPct(p.excess_return_vs_bh, true)}
              </span>
            ) : (
              <span className="pill bg-signal-sell_soft text-signal-sell">
                <TrendingDown className="w-3.5 h-3.5" />
                {t("track.excess")}: {fmtPct(p.excess_return_vs_bh, true)}
              </span>
            )}
            <span className="text-xs text-ink-tertiary font-mono">
              {report.config.start} → {report.config.end}
            </span>
            <span className="text-xs text-ink-tertiary ml-auto">
              {new Date(report.finished_at).toLocaleString(
                locale === "zh" ? "zh-CN" : "en-US"
              )}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border-subtle border-t border-border-subtle">
          <Stat label={t("track.tickers")} value={String(report.per_ticker.length)} mono />
          <Stat label={t("track.decisions")} value={String(report.n_decisions)} mono />
          <Stat label={t("track.cost")} value={`$${report.estimated_cost_usd.toFixed(2)}`} mono />
          <Stat
            label={t("track.winRate")}
            value={fmtPct(p.pct_tickers_agent_beats_bh)}
            accent={p.pct_tickers_agent_beats_bh >= 0.5}
          />
        </div>
      </section>

      {/* Portfolio comparison */}
      <Section title={t("track.portfolioHeading")}>
        <div className="grid lg:grid-cols-[1fr_360px] gap-4">
          <PortfolioChart report={report} />
          <PortfolioStats portfolio={p} />
        </div>
      </Section>

      {/* Per-ticker table */}
      <Section title={t("track.tickerHeading")}>
        <PerTickerTable rows={report.per_ticker} />
      </Section>

      {/* Decisions log */}
      <Section title={locale === "zh" ? "决策日志" : "Decision log"}>
        <DecisionsLog rows={report.per_ticker} />
      </Section>

      {/* Footer links */}
      <div className="flex flex-wrap gap-3 pt-2 text-sm">
        <a
          href="https://github.com/gallen666/trading-agents-platform/tree/main/src/trading_agents/backtest"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary"
        >
          <GitBranch className="w-4 h-4" />
          {t("track.runYourself")}
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <a
          href="https://github.com/gallen666/trading-agents-platform/blob/main/reports/latest.json"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost"
        >
          {locale === "zh" ? "查看原始 JSON" : "View raw JSON"}
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
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
    </div>
  );
}

function PortfolioChart({ report }: { report: Report }) {
  // Build chart data: index along x-axis, agent vs bh equity (normalized to 100).
  // Use the FIRST ticker's date axis as approximate (we don't store global dates
  // on the portfolio curve in the current schema, but tickers share enough
  // overlap that this is fine for a visual).
  if (!report.per_ticker.length) return null;
  const longest = report.per_ticker.reduce((acc, t) =>
    t.agent_curve.length > acc.agent_curve.length ? t : acc
  );
  const n = longest.agent_curve.length;

  // Compute portfolio curves on the fly from per-ticker.
  const portAgent: number[] = [];
  const portBH: number[] = [];
  for (let i = 0; i < n; i++) {
    let a = 0;
    let b = 0;
    let count = 0;
    for (const ticker of report.per_ticker) {
      if (i < ticker.agent_curve.length && i < ticker.bh_curve.length) {
        a += ticker.agent_curve[i];
        b += ticker.bh_curve[i];
        count++;
      }
    }
    if (count > 0) {
      portAgent.push(a / count);
      portBH.push(b / count);
    }
  }

  // Normalize both to start at 100 for visual comparability.
  const a0 = portAgent[0] || 1;
  const b0 = portBH[0] || 1;
  const data = portAgent.map((v, i) => ({
    i,
    Agent: (v / a0) * 100,
    "Buy & Hold": (portBH[i] / b0) * 100,
  }));

  return (
    <div className="surface p-4 h-[360px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="agentGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#56d364" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#56d364" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="bhGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#9aa6b8" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#9aa6b8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="i"
            tick={{ fontSize: 10, fill: "var(--ink-tertiary)" }}
            stroke="rgba(255,255,255,0.1)"
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--ink-tertiary)" }}
            stroke="rgba(255,255,255,0.1)"
            domain={["auto", "auto"]}
            tickFormatter={(v: number) => `${v.toFixed(0)}`}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(20, 24, 32, 0.95)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(v: number) => v.toFixed(2)}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area
            type="monotone"
            dataKey="Agent"
            stroke="#56d364"
            strokeWidth={2}
            fill="url(#agentGrad)"
          />
          <Area
            type="monotone"
            dataKey="Buy & Hold"
            stroke="#9aa6b8"
            strokeWidth={2}
            strokeDasharray="4 4"
            fill="url(#bhGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function PortfolioStats({ portfolio }: { portfolio: PortfolioMetrics }) {
  const { t } = useT();
  return (
    <div className="surface overflow-hidden">
      <div className="grid grid-cols-3 text-xs label-cap bg-bg-elevated border-b border-border-subtle">
        <div className="px-3 py-2">{t("track.cumReturn")}</div>
        <div className="px-3 py-2 text-center">Agent</div>
        <div className="px-3 py-2 text-center">B&amp;H</div>
      </div>
      <Row label={t("track.cumReturn")} a={portfolio.agent.cumulative_return} b={portfolio.bh.cumulative_return} pct />
      <Row label={t("track.annualReturn")} a={portfolio.agent.annual_return} b={portfolio.bh.annual_return} pct />
      <Row label={t("track.sharpe")} a={portfolio.agent.sharpe} b={portfolio.bh.sharpe} />
      <Row label={t("track.maxDD")} a={portfolio.agent.max_drawdown} b={portfolio.bh.max_drawdown} pct invert />
    </div>
  );
}

function Row({
  label,
  a,
  b,
  pct,
  invert,
}: {
  label: string;
  a: number;
  b: number;
  pct?: boolean;
  invert?: boolean;
}) {
  // For metrics where lower is better (e.g. drawdown), agent is "better"
  // when its value is greater (closer to zero) than B&H.
  const better = invert ? a > b : a > b;
  return (
    <div className="grid grid-cols-3 px-3 py-2.5 text-sm border-b border-border-subtle last:border-b-0">
      <span className="text-ink-tertiary">{label}</span>
      <span
        className={cn(
          "text-right font-mono",
          better ? "text-signal-buy" : "text-ink-secondary"
        )}
      >
        {pct ? fmtPct(a) : a.toFixed(2)}
      </span>
      <span className="text-right font-mono text-ink-tertiary">
        {pct ? fmtPct(b) : b.toFixed(2)}
      </span>
    </div>
  );
}

function PerTickerTable({ rows }: { rows: TickerOutcome[] }) {
  const { t } = useT();
  return (
    <div className="surface overflow-hidden">
      <div className="grid grid-cols-[1fr_repeat(4,minmax(0,1fr))] text-xs label-cap bg-bg-elevated border-b border-border-subtle">
        <div className="px-4 py-2.5">{t("track.colTicker")}</div>
        <div className="px-4 py-2.5 text-right">{t("track.colAgent")}</div>
        <div className="px-4 py-2.5 text-right">{t("track.colBH")}</div>
        <div className="px-4 py-2.5 text-right">{t("track.colExcess")}</div>
        <div className="px-4 py-2.5 text-right">{t("track.colSharpe")}</div>
      </div>
      {rows.map((r) => {
        const excess = r.agent_metrics.cumulative_return - r.bh_metrics.cumulative_return;
        const beats = excess > 0;
        return (
          <div
            key={r.ticker}
            className="grid grid-cols-[1fr_repeat(4,minmax(0,1fr))] px-0 text-sm border-b border-border-subtle last:border-b-0 hover:bg-bg-hover/30 transition-colors"
          >
            <div className="px-4 py-3 flex items-center gap-2">
              <span className="font-mono font-semibold tracking-wider">{r.ticker}</span>
              <span className="text-2xs label-cap text-ink-tertiary">{r.market}</span>
            </div>
            <div className="px-4 py-3 text-right font-mono">{fmtPct(r.agent_metrics.cumulative_return)}</div>
            <div className="px-4 py-3 text-right font-mono text-ink-tertiary">{fmtPct(r.bh_metrics.cumulative_return)}</div>
            <div
              className={cn(
                "px-4 py-3 text-right font-mono flex items-center justify-end gap-1",
                beats ? "text-signal-buy" : "text-signal-sell"
              )}
            >
              {beats ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {fmtPct(excess, true)}
            </div>
            <div className="px-4 py-3 text-right font-mono text-ink-secondary">
              {r.agent_metrics.sharpe.toFixed(2)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DecisionsLog({ rows }: { rows: TickerOutcome[] }) {
  const all = rows.flatMap((r) =>
    r.decisions.map((d) => ({
      ticker: r.ticker,
      market: r.market,
      ...d,
    }))
  );
  // Sort by date descending so most recent rebalance is on top
  all.sort((a, b) => (a.asof < b.asof ? 1 : -1));
  const recent = all.slice(0, 30);

  return (
    <div className="surface overflow-hidden">
      <div className="max-h-[400px] overflow-y-auto">
        {recent.map((d, i) => (
          <div
            key={i}
            className="px-4 py-3 border-b border-border-subtle last:border-b-0 grid grid-cols-[110px_70px_90px_70px_1fr] gap-3 text-xs items-start"
          >
            <span className="font-mono text-ink-tertiary">{d.asof}</span>
            <span className="font-mono font-semibold">{d.ticker}</span>
            <SideBadge side={d.side} />
            <span className="font-mono text-right">
              {(d.target_weight * 100).toFixed(1)}%
            </span>
            <span className="text-ink-secondary line-clamp-2">{d.rationale}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SideBadge({ side }: { side: string }) {
  const upper = side.toUpperCase();
  const cls =
    upper === "BUY" || upper === "OVERWEIGHT"
      ? "bg-signal-buy_soft text-signal-buy"
      : upper === "SELL" || upper === "UNDERWEIGHT"
      ? "bg-signal-sell_soft text-signal-sell"
      : "bg-bg-hover text-ink-secondary";
  return <span className={cn("pill text-2xs", cls)}>{upper}</span>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtPct(x: number, signed = false): string {
  const v = (x * 100).toFixed(2);
  if (signed && x > 0) return `+${v}%`;
  return `${v}%`;
}
