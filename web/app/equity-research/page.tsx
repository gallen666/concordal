"use client";

/**
 * /equity-research — Equity-research workbench (v61, 9 tabs).
 *
 * Drives all 9 v56+v58 skill endpoints, grouped into three families:
 *   Per-ticker  (5): earnings-preview, earnings-analysis, thesis-tracker,
 *                    initiating-coverage, model-update
 *   Multi-ticker(2): morning-note, catalyst-calendar
 *   Sector/Screen(2): sector-overview, idea-generation (screen)
 *
 * Every skill output is wrapped in the v56 data-integrity envelope.
 * passed=true → green check banner. passed=false → BIG RED banner +
 * errors list, report body suppressed. That's 数据要正确精准 made
 * visual.
 */

import { useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileSpreadsheet,
  FileText,
  Globe,
  Loader2,
  Plus,
  ScrollText,
  Search,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import { useT } from "../lib/i18n";
import { cn } from "../lib/cn";

const API_BASE =
  process.env.NEXT_PUBLIC_API ||
  "https://trading-agents-platform.onrender.com";

type SkillId =
  | "earnings-preview"
  | "earnings-analysis"
  | "thesis-tracker"
  | "initiating-coverage"
  | "model-update"
  | "morning-note"
  | "catalyst-calendar"
  | "sector-overview"
  | "screen";

interface IntegrityEnvelope {
  passed: boolean;
  errors: string[];
  note: string;
}

interface SkillResult {
  skill: string;
  ticker?: string;
  criteria?: Record<string, unknown>;
  asof?: string;
  raw_body?: string;
  parsed?: unknown;
  ground_truth_close?: number | null;
  universe_size?: number;
  usage?: Array<{ model: string; input_tokens: number; output_tokens: number; usd_cost: number }>;
  model?: string;
  data_integrity?: IntegrityEnvelope;
}

// ---- Tab groups ----------------------------------------------------------

const GROUPS: {
  id: string;
  zh: string;
  en: string;
  tabs: { id: SkillId; zh: string; en: string; icon: React.ReactNode }[];
}[] = [
  {
    id: "per-ticker",
    zh: "单票深度",
    en: "Per-ticker",
    tabs: [
      { id: "earnings-preview", zh: "财报前情景", en: "Earnings Preview", icon: <Calendar className="w-3.5 h-3.5" /> },
      { id: "earnings-analysis", zh: "财报后分析", en: "Earnings Analysis", icon: <FileSpreadsheet className="w-3.5 h-3.5" /> },
      { id: "thesis-tracker", zh: "投资论点", en: "Thesis Tracker", icon: <Target className="w-3.5 h-3.5" /> },
      { id: "initiating-coverage", zh: "首次覆盖", en: "Initiating Coverage", icon: <BookOpen className="w-3.5 h-3.5" /> },
      { id: "model-update", zh: "模型更新", en: "Model Update", icon: <FileText className="w-3.5 h-3.5" /> },
    ],
  },
  {
    id: "multi-ticker",
    zh: "多票看板",
    en: "Multi-ticker",
    tabs: [
      { id: "morning-note", zh: "早盘备忘", en: "Morning Note", icon: <Sun className="w-3.5 h-3.5" /> },
      { id: "catalyst-calendar", zh: "催化剂日历", en: "Catalyst Calendar", icon: <Clock className="w-3.5 h-3.5" /> },
    ],
  },
  {
    id: "sector",
    zh: "行业 / 筛选",
    en: "Sector & Screen",
    tabs: [
      { id: "sector-overview", zh: "行业概览", en: "Sector Overview", icon: <Globe className="w-3.5 h-3.5" /> },
      { id: "screen", zh: "股票筛选", en: "Idea Generation", icon: <Search className="w-3.5 h-3.5" /> },
    ],
  },
];

export default function ResearchPage() {
  const { locale } = useT();
  const [tab, setTab] = useState<SkillId>("earnings-preview");
  const isZh = locale === "zh";

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      <header className="space-y-2">
        <span className="label-cap inline-flex items-center gap-2">
          <ScrollText className="w-3.5 h-3.5 text-accent" />
          {isZh ? "投研工作台 · v58 · 9 个 skill" : "Equity Research Workbench · v58 · 9 skills"}
        </span>
        <h1 className="text-3xl md:text-4xl font-display font-medium">
          {isZh
            ? "完整 9 个 Anthropic equity-research skill · 数据精准三重守门"
            : "All 9 Anthropic equity-research skills · Triple data-integrity gate"}
        </h1>
        <p className="text-sm text-ink-secondary leading-relaxed max-w-3xl">
          {isZh
            ? "全部 9 个 skill 源自 Anthropic 官方 financial-services-plugins (4.5k stars), 转译到 DeepSeek V4. 每次输出过三层校验: (1) prompt 禁止编造规则 + (2) v55 GROUND TRUTH QUOTE block + (3) 程序化 validator. 校验失败 → 红色告警 + body 不渲染."
            : "All 9 skills ported from Anthropic's official financial-services-plugins (4.5k stars), retargeted to DeepSeek V4. Three layers: (1) prompt-level fabrication ban, (2) v55 ground-truth quote injection, (3) programmatic validator. Failure → red banner, body suppressed."}
        </p>
      </header>

      {/* Tab strip — grouped */}
      <div className="space-y-3 border-b border-border-subtle pb-3">
        {GROUPS.map((g) => (
          <div key={g.id} className="flex items-center gap-3 flex-wrap">
            <span className="label-cap text-2xs w-24 shrink-0">
              {isZh ? g.zh : g.en}
            </span>
            <div className="flex flex-wrap gap-2">
              {g.tabs.map((t) => (
                <TabBtn
                  key={t.id}
                  id={t.id}
                  active={tab === t.id}
                  setActive={setTab}
                  icon={t.icon}
                  label={isZh ? t.zh : t.en}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="pt-2">
        {tab === "earnings-preview" && <EarningsPreviewPanel locale={locale} />}
        {tab === "earnings-analysis" && <EarningsAnalysisPanel locale={locale} />}
        {tab === "thesis-tracker" && <ThesisTrackerPanel locale={locale} />}
        {tab === "initiating-coverage" && <InitiatingCoveragePanel locale={locale} />}
        {tab === "model-update" && <ModelUpdatePanel locale={locale} />}
        {tab === "morning-note" && <MorningNotePanel locale={locale} />}
        {tab === "catalyst-calendar" && <CatalystCalendarPanel locale={locale} />}
        {tab === "sector-overview" && <SectorOverviewPanel locale={locale} />}
        {tab === "screen" && <ScreenPanel locale={locale} />}
      </div>
    </div>
  );
}

function TabBtn({
  id,
  active,
  setActive,
  icon,
  label,
}: {
  id: SkillId;
  active: boolean;
  setActive: (t: SkillId) => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={() => setActive(id)}
      className={cn(
        "px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 rounded border transition-colors",
        active
          ? "bg-accent-muted text-accent border-accent/40"
          : "border-border-subtle text-ink-secondary hover:text-ink-primary hover:bg-bg-hover/40",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// ---- Generic POST helper -------------------------------------------------

async function callSkill(url: string, body?: unknown): Promise<SkillResult> {
  const init: RequestInit = { method: "POST", cache: "no-store" };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.json();
}

// ---- 1. Earnings Preview -------------------------------------------------

function EarningsPreviewPanel({ locale }: { locale: string }) {
  const [ticker, setTicker] = useState("AAPL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SkillResult | null>(null);

  async function run() {
    if (!ticker.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      setResult(await callSkill(`${API_BASE}/v1/equity-research/earnings-preview?ticker=${encodeURIComponent(ticker.toUpperCase())}&locale=${locale}`));
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  const p = (result?.parsed as Record<string, unknown>) || null;
  const scenarios = arr(p?.scenarios);

  return (
    <div className="space-y-4">
      <TickerForm ticker={ticker} setTicker={setTicker} loading={loading} onRun={run} locale={locale} />
      {error && <ErrorBanner msg={error} />}
      {result && <IntegrityHeader integ={result.data_integrity} locale={locale} />}
      {result && result.data_integrity?.passed === false && <IntegrityFailedBody result={result} locale={locale} />}
      {result && result.data_integrity?.passed && p && (
        <div className="space-y-4">
          <HeaderBar ticker={result.ticker} gtClose={result.ground_truth_close} extraLabel={locale === "zh" ? "下次财报" : "Next earnings"} extraValue={(p.next_earnings_date as string) || "—"} locale={locale} />
          <div className="grid sm:grid-cols-2 gap-3">
            <Stat label={locale === "zh" ? "共识 EPS" : "Consensus EPS"} value={p.consensus_eps != null ? String(p.consensus_eps) : "[N/A]"} />
            <Stat label={locale === "zh" ? "共识收入" : "Consensus revenue"} value={p.consensus_rev_usd != null ? `$${(p.consensus_rev_usd as number).toLocaleString()}` : "[N/A]"} />
          </div>
          {scenarios.length > 0 && (
            <div className="surface p-5 space-y-3">
              <div className="label-cap">{locale === "zh" ? "4 种情景" : "4 scenarios"}</div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {scenarios.map((s, i) => (
                  <div key={i} className="surface p-3 text-xs">
                    <div className="font-mono text-ink-primary text-sm">{s.name as string}</div>
                    <div className="text-ink-tertiary mt-1">Beat: <span className="font-mono">{fmtPct(s.beat_pct)}</span></div>
                    <div className="text-ink-tertiary">Target: <span className="font-mono text-accent">{s.target_price as number}</span></div>
                    <div className="text-ink-tertiary">P: <span className="font-mono">{fmtPct(s.probability)}</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-3">
            <ListPanel title={locale === "zh" ? "关键观察指标" : "Key metrics to watch"} items={(p.key_metrics_to_watch as string[]) || []} icon={<TrendingUp className="w-4 h-4 text-bull-ink" />} />
            <ListPanel title={locale === "zh" ? "风险标记" : "Risk flags"} items={(p.risk_flags as string[]) || []} icon={<AlertTriangle className="w-4 h-4 text-bear-ink" />} />
          </div>
          {p.trade_idea ? <TradeIdeaCard trade={p.trade_idea as Record<string, unknown>} locale={locale} /> : null}
          <DebugFooter result={result} />
        </div>
      )}
    </div>
  );
}

// ---- 2. Earnings Analysis ------------------------------------------------

function EarningsAnalysisPanel({ locale }: { locale: string }) {
  const [ticker, setTicker] = useState("AAPL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SkillResult | null>(null);

  async function run() {
    if (!ticker.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      setResult(await callSkill(`${API_BASE}/v1/equity-research/earnings-analysis?ticker=${encodeURIComponent(ticker.toUpperCase())}&locale=${locale}`));
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  const p = (result?.parsed as Record<string, unknown>) || null;
  const h = (p?.headline as Record<string, unknown>) || null;
  const segments = arr(p?.segments);
  const impact = (p?.thesis_impact as string) || "";

  return (
    <div className="space-y-4">
      <TickerForm ticker={ticker} setTicker={setTicker} loading={loading} onRun={run} locale={locale} />
      {error && <ErrorBanner msg={error} />}
      {result && <IntegrityHeader integ={result.data_integrity} locale={locale} />}
      {result && result.data_integrity?.passed === false && <IntegrityFailedBody result={result} locale={locale} />}
      {result && result.data_integrity?.passed && p && (
        <div className="space-y-4">
          <HeaderBar ticker={result.ticker} gtClose={result.ground_truth_close} extraLabel={locale === "zh" ? "季度" : "Quarter"} extraValue={(p.quarter as string) || "—"} locale={locale} />
          {h && (
            <div className="surface p-5">
              <div className="label-cap mb-3">{locale === "zh" ? "Beat / Miss 头条" : "Beat / Miss headline"}</div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat label="EPS actual" value={fmtNum(h.eps_actual)} />
                <Stat label="EPS consensus" value={fmtNum(h.eps_consensus)} />
                <Stat label="Beat %" value={fmtPct(h.beat_pct)} />
                <Stat label="Rev actual" value={fmtMoney(h.rev_actual)} />
              </div>
            </div>
          )}
          {impact && (
            <div className={cn(
              "surface p-3 border-l-4 text-sm",
              impact === "strengthened" ? "border-bull text-bull-ink"
                : impact === "weakened" ? "border-bear text-bear-ink"
                : "border-gold/60 text-gold",
            )}>
              <span className="label-cap">{locale === "zh" ? "论点影响" : "Thesis impact"}</span> · {impact.toUpperCase()}
            </div>
          )}
          {segments.length > 0 && (
            <div className="surface p-5 space-y-2">
              <div className="label-cap">{locale === "zh" ? "业务分部" : "Segments"}</div>
              <table className="w-full text-xs">
                <thead className="text-ink-tertiary uppercase text-2xs font-mono">
                  <tr className="border-b border-border-subtle">
                    <th className="text-left py-2">Segment</th>
                    <th className="text-right py-2">Growth</th>
                    <th className="text-right py-2">vs Consensus</th>
                  </tr>
                </thead>
                <tbody>
                  {segments.map((s, i) => (
                    <tr key={i} className="border-b border-border-subtle/40">
                      <td className="py-1.5 text-ink-primary">{s.name as string}</td>
                      <td className="py-1.5 text-right font-mono">{fmtPct(s.growth_pct)}</td>
                      <td className="py-1.5 text-right font-mono text-accent">{fmtPct(s.vs_consensus_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <ListPanel title={locale === "zh" ? "关键要点" : "Key takeaways"} items={(p.key_takeaways as string[]) || []} icon={<ChevronRight className="w-4 h-4 text-accent" />} />
          <ListPanel title={locale === "zh" ? "下一步催化剂" : "Next catalysts"} items={(p.next_catalysts as string[]) || []} icon={<Clock className="w-4 h-4 text-gold" />} />
          <DebugFooter result={result} />
        </div>
      )}
    </div>
  );
}

// ---- 3. Thesis Tracker ---------------------------------------------------

function ThesisTrackerPanel({ locale }: { locale: string }) {
  const [ticker, setTicker] = useState("600519");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SkillResult | null>(null);

  async function run() {
    if (!ticker.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      setResult(await callSkill(`${API_BASE}/v1/equity-research/thesis-tracker?ticker=${encodeURIComponent(ticker.toUpperCase())}&locale=${locale}`));
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  const p = (result?.parsed as Record<string, unknown>) || null;
  const breakers = arr(p?.thesis_breakers);
  const catalysts = arr(p?.catalyst_pipeline);
  const health = (p?.thesis_health as Record<string, unknown>) || null;
  const thesis = (p?.current_thesis as Record<string, unknown>) || null;

  return (
    <div className="space-y-4">
      <TickerForm ticker={ticker} setTicker={setTicker} loading={loading} onRun={run} locale={locale} />
      {error && <ErrorBanner msg={error} />}
      {result && <IntegrityHeader integ={result.data_integrity} locale={locale} />}
      {result && result.data_integrity?.passed === false && <IntegrityFailedBody result={result} locale={locale} />}
      {result && result.data_integrity?.passed && p && (
        <div className="space-y-4">
          {health && (
            <div className="surface p-5 flex items-center justify-between">
              <div>
                <div className="label-cap">{locale === "zh" ? "论点健康度" : "Thesis health"}</div>
                <div className="text-3xl font-display font-medium mt-1 text-accent">{(((health.score as number) || 0) * 100).toFixed(0)}%</div>
              </div>
              <div className="text-xs text-ink-secondary text-right max-w-xs">{(health.narrative as string) || ""}</div>
            </div>
          )}
          {thesis && (
            <div className="surface p-5 space-y-2">
              <div className="label-cap">{locale === "zh" ? "当前论点" : "Current thesis"}</div>
              <p className="text-sm text-ink-primary leading-relaxed">{(thesis.summary as string) || ""}</p>
              {Array.isArray(thesis.key_drivers) && (
                <ul className="text-sm text-ink-secondary list-disc list-inside mt-2 space-y-1">
                  {(thesis.key_drivers as string[]).map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              )}
            </div>
          )}
          {breakers.length > 0 && (
            <div className="surface p-5">
              <div className="label-cap mb-3">{locale === "zh" ? "论点破坏者" : "Thesis-breakers"}</div>
              <table className="w-full text-xs font-mono">
                <thead className="text-ink-tertiary uppercase text-2xs">
                  <tr className="border-b border-border-subtle">
                    <th className="text-left py-2 pr-3">#</th>
                    <th className="text-left py-2 pr-3">Trigger</th>
                    <th className="text-right py-2 pr-3">P</th>
                    <th className="text-right py-2 pr-3">Sev</th>
                    <th className="text-right py-2">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {breakers.map((b, i) => (
                    <tr key={i} className="border-b border-border-subtle/40">
                      <td className="py-1.5 pr-3 text-ink-tertiary">{i + 1}</td>
                      <td className="py-1.5 pr-3 text-ink-primary">{b.trigger as string}</td>
                      <td className="py-1.5 pr-3 text-right">{fmtPct(b.probability)}</td>
                      <td className="py-1.5 pr-3 text-right">{fmtPct(b.severity_pct_loss)}</td>
                      <td className="py-1.5 text-right text-bear-ink">{((b.risk_score as number) || 0).toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {catalysts.length > 0 && (
            <CatalystGrid catalysts={catalysts} locale={locale} />
          )}
          <DebugFooter result={result} />
        </div>
      )}
    </div>
  );
}

// ---- 4. Initiating Coverage ----------------------------------------------

function InitiatingCoveragePanel({ locale }: { locale: string }) {
  const [ticker, setTicker] = useState("AAPL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SkillResult | null>(null);

  async function run() {
    if (!ticker.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      setResult(await callSkill(`${API_BASE}/v1/equity-research/initiating-coverage?ticker=${encodeURIComponent(ticker.toUpperCase())}&locale=${locale}`));
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  const p = (result?.parsed as Record<string, unknown>) || null;
  const rating = (p?.rating as string) || "";
  const it = (p?.investment_thesis as Record<string, unknown>) || null;
  const val = (p?.valuation as Record<string, unknown>) || null;
  const risks = arr(p?.key_risks);

  const ratingColor = rating === "Overweight" ? "text-bull-ink bg-bull-soft border-bull/40"
    : rating === "Underweight" ? "text-bear-ink bg-bear-soft border-bear/40"
    : "text-gold bg-gold-soft border-gold/40";

  return (
    <div className="space-y-4">
      <TickerForm ticker={ticker} setTicker={setTicker} loading={loading} onRun={run} locale={locale} />
      {error && <ErrorBanner msg={error} />}
      {result && <IntegrityHeader integ={result.data_integrity} locale={locale} />}
      {result && result.data_integrity?.passed === false && <IntegrityFailedBody result={result} locale={locale} />}
      {result && result.data_integrity?.passed && p && (
        <div className="space-y-4">
          <div className="surface-elev p-5 space-y-3">
            <div className="flex items-baseline justify-between flex-wrap gap-3">
              <div>
                <div className="label-cap">{result.ticker} · {p.sector as string}</div>
                {p.market_cap_usd_b ? (
                  <div className="text-xs text-ink-tertiary font-mono">Market cap: ${(p.market_cap_usd_b as number).toFixed(1)}B</div>
                ) : null}
              </div>
              <div className="flex items-baseline gap-3">
                <span className={cn("px-3 py-1 rounded border text-2xs font-mono uppercase tracking-wider", ratingColor)}>
                  {rating}
                </span>
                {p.target_price ? (
                  <div className="text-right">
                    <div className="text-2xs text-ink-tertiary uppercase tracking-wider">Target</div>
                    <div className="font-mono text-xl text-accent">{p.target_price as number}</div>
                    {p.upside_pct ? <div className="text-2xs font-mono text-bull-ink">{fmtPct(p.upside_pct)} upside</div> : null}
                  </div>
                ) : null}
              </div>
            </div>
            {it && (
              <div className="border-t border-border-subtle pt-3 space-y-2">
                <div className="label-cap">{locale === "zh" ? "投资论点" : "Investment thesis"}</div>
                <p className="text-sm text-ink-primary leading-relaxed">{(it.summary as string) || ""}</p>
                {Array.isArray(it.long_term_drivers) && (
                  <ul className="text-sm text-ink-secondary list-disc list-inside mt-2">
                    {(it.long_term_drivers as string[]).map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>
          {val && (
            <div className="surface p-5">
              <div className="label-cap mb-3">{locale === "zh" ? "估值" : "Valuation"} · {val.method as string}</div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat label="WACC" value={fmtPct(val.wacc)} />
                <Stat label="Terminal g" value={fmtPct(val.terminal_growth)} />
                <Stat label="Bull case" value={fmtNum(val.bull_case_target)} />
                <Stat label="Bear case" value={fmtNum(val.bear_case_target)} />
              </div>
            </div>
          )}
          {risks.length > 0 && (
            <div className="surface p-5 space-y-2">
              <div className="label-cap">{locale === "zh" ? "主要风险" : "Key risks"}</div>
              {risks.map((r, i) => (
                <div key={i} className="text-sm border-l-2 border-bear/40 pl-3 py-1">
                  <div className="font-medium text-ink-primary">{r.risk as string}</div>
                  <div className="text-xs text-ink-tertiary mt-0.5">
                    Severity {fmtPct(r.severity_pct)} · {r.mitigation as string}
                  </div>
                </div>
              ))}
            </div>
          )}
          <DebugFooter result={result} />
        </div>
      )}
    </div>
  );
}

// ---- 5. Model Update -----------------------------------------------------

function ModelUpdatePanel({ locale }: { locale: string }) {
  const [ticker, setTicker] = useState("NVDA");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SkillResult | null>(null);

  async function run() {
    if (!ticker.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      setResult(await callSkill(`${API_BASE}/v1/equity-research/model-update?ticker=${encodeURIComponent(ticker.toUpperCase())}&locale=${locale}`));
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  const p = (result?.parsed as Record<string, unknown>) || null;
  const changes = arr(p?.estimate_changes);
  const vi = (p?.valuation_impact as Record<string, unknown>) || null;

  return (
    <div className="space-y-4">
      <TickerForm ticker={ticker} setTicker={setTicker} loading={loading} onRun={run} locale={locale} />
      {error && <ErrorBanner msg={error} />}
      {result && <IntegrityHeader integ={result.data_integrity} locale={locale} />}
      {result && result.data_integrity?.passed === false && <IntegrityFailedBody result={result} locale={locale} />}
      {result && result.data_integrity?.passed && p && (
        <div className="space-y-4">
          <HeaderBar ticker={result.ticker} gtClose={result.ground_truth_close} extraLabel="Confidence" extraValue={(p.confidence as string) || "—"} locale={locale} />
          {changes.length > 0 && (
            <div className="surface p-5 space-y-2">
              <div className="label-cap">{locale === "zh" ? "估算变更" : "Estimate changes"}</div>
              <table className="w-full text-xs">
                <thead className="text-ink-tertiary uppercase text-2xs font-mono">
                  <tr className="border-b border-border-subtle">
                    <th className="text-left py-2 pr-3">Metric</th>
                    <th className="text-left py-2 pr-3">Period</th>
                    <th className="text-right py-2 pr-3">Old</th>
                    <th className="text-right py-2 pr-3">New</th>
                    <th className="text-right py-2 pr-3">Δ%</th>
                    <th className="text-left py-2">Rationale</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c, i) => (
                    <tr key={i} className="border-b border-border-subtle/40">
                      <td className="py-1.5 pr-3 text-ink-primary">{c.metric as string}</td>
                      <td className="py-1.5 pr-3 text-ink-secondary">{c.period as string}</td>
                      <td className="py-1.5 pr-3 text-right font-mono">{fmtNum(c.old_value)}</td>
                      <td className="py-1.5 pr-3 text-right font-mono">{fmtNum(c.new_value)}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-accent">{fmtPct(c.delta_pct)}</td>
                      <td className="py-1.5 text-ink-secondary text-xs">{c.rationale as string}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {vi && (
            <div className="surface p-5">
              <div className="label-cap mb-3">{locale === "zh" ? "估值影响" : "Valuation impact"}</div>
              <div className="grid sm:grid-cols-3 gap-3">
                <Stat label="Old target" value={fmtNum(vi.old_target)} />
                <Stat label="New target" value={fmtNum(vi.new_target)} />
                <Stat label="Δ%" value={fmtPct(vi.delta_pct)} />
              </div>
            </div>
          )}
          <ListPanel title={locale === "zh" ? "监控触发器" : "Monitoring triggers"} items={(p.monitoring_triggers as string[]) || []} icon={<Clock className="w-4 h-4 text-gold" />} />
          <DebugFooter result={result} />
        </div>
      )}
    </div>
  );
}

// ---- 6. Morning Note -----------------------------------------------------

function MorningNotePanel({ locale }: { locale: string }) {
  return (
    <WatchlistSkillPanel
      locale={locale}
      defaultList={["AAPL", "NVDA", "TSLA", "MSFT", "GOOGL"]}
      endpoint="morning-note"
      renderResult={(result, locale) => {
        const p = (result.parsed as Record<string, unknown>) || null;
        if (!p) return null;
        const movers = arr(p?.overnight_movers);
        const ideas = arr(p?.top_trade_ideas);
        return (
          <div className="space-y-4">
            <div className="surface p-5">
              <div className="label-cap mb-2">{locale === "zh" ? "市场背景" : "Market context"}</div>
              <p className="text-sm text-ink-primary">{(p.market_context as string) || "—"}</p>
            </div>
            {movers.length > 0 && (
              <div className="surface p-5 space-y-2">
                <div className="label-cap">{locale === "zh" ? "隔夜异动" : "Overnight movers"}</div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {movers.map((m, i) => (
                    <div key={i} className="surface p-3 text-xs">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono font-semibold">{m.ticker as string}</span>
                        <span className={cn("text-2xs font-mono", m.direction === "up" ? "text-bull-ink" : "text-bear-ink")}>
                          {fmtPct(m.pct)} {m.direction as string}
                        </span>
                      </div>
                      <p className="text-ink-secondary mt-1">{m.why as string}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {ideas.length > 0 && (
              <div className="surface p-5 space-y-3">
                <div className="label-cap">{locale === "zh" ? "今日交易思路" : "Top trade ideas"}</div>
                {ideas.map((idea, i) => (
                  <div key={i} className="surface-elev p-3 space-y-2 border-l-4 border-accent">
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <span className="font-mono text-lg font-semibold">{idea.ticker as string}</span>
                      <span className="text-2xs font-mono uppercase tracking-wider text-accent">{idea.action as string}</span>
                      <span className="text-2xs text-ink-tertiary">Size: {fmtPct(idea.size_pct)}</span>
                      <span className="text-2xs text-ink-tertiary">Target: {fmtNum(idea.target)}</span>
                      <span className="text-2xs text-ink-tertiary">Stop: {fmtNum(idea.stop)}</span>
                    </div>
                    <p className="text-sm text-ink-secondary">{idea.rationale as string}</p>
                  </div>
                ))}
              </div>
            )}
            <ListPanel title={locale === "zh" ? "宏观提醒" : "Macro callouts"} items={(p.macro_callouts as string[]) || []} icon={<Globe className="w-4 h-4 text-gold" />} />
            <DebugFooter result={result} />
          </div>
        );
      }}
    />
  );
}

// ---- 7. Catalyst Calendar ------------------------------------------------

function CatalystCalendarPanel({ locale }: { locale: string }) {
  const [horizon, setHorizon] = useState(90);
  const [watchlist, setWatchlist] = useState<string[]>(["AAPL", "NVDA", "TSLA", "MSFT"]);
  const [newTicker, setNewTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SkillResult | null>(null);

  async function run() {
    setLoading(true); setError(null); setResult(null);
    try {
      setResult(await callSkill(`${API_BASE}/v1/equity-research/catalyst-calendar`, { watchlist, horizon_days: horizon, locale }));
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  const p = (result?.parsed as Record<string, unknown>) || null;
  const catalysts = arr(p?.catalysts);

  return (
    <div className="space-y-4">
      <div className="surface p-5 space-y-3">
        <TickerListEditor list={watchlist} setList={setWatchlist} newTicker={newTicker} setNewTicker={setNewTicker} locale={locale} />
        <label className="block">
          <span className="label-cap">{locale === "zh" ? "时间窗口 (天)" : "Horizon (days)"}</span>
          <input type="number" min={7} max={365} value={horizon} onChange={(e) => setHorizon(Math.max(7, Math.min(365, parseInt(e.target.value) || 90)))} className="input mt-1 w-32" />
        </label>
        <button onClick={run} disabled={loading || watchlist.length === 0} className="btn-primary w-full">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
          {locale === "zh" ? "生成日历" : "Generate calendar"}
        </button>
      </div>
      {error && <ErrorBanner msg={error} />}
      {result && <IntegrityHeader integ={result.data_integrity} locale={locale} />}
      {result && result.data_integrity?.passed === false && <IntegrityFailedBody result={result} locale={locale} />}
      {result && result.data_integrity?.passed && catalysts.length > 0 && (
        <div className="space-y-4">
          <CatalystGrid catalysts={catalysts} locale={locale} />
          <DebugFooter result={result} />
        </div>
      )}
    </div>
  );
}

// ---- 8. Sector Overview --------------------------------------------------

function SectorOverviewPanel({ locale }: { locale: string }) {
  const [sector, setSector] = useState("semiconductors");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SkillResult | null>(null);

  async function run() {
    if (!sector.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      setResult(await callSkill(`${API_BASE}/v1/equity-research/sector-overview?sector=${encodeURIComponent(sector)}&locale=${locale}`));
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  const p = (result?.parsed as Record<string, unknown>) || null;
  const cd = (p?.competitive_dynamics as Record<string, unknown>) || null;
  const recs = (p?.portfolio_recommendations as Record<string, unknown>) || null;

  return (
    <div className="space-y-4">
      <div className="surface p-4 flex gap-3 items-center">
        <input value={sector} onChange={(e) => setSector(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !loading && run()} placeholder="semiconductors · AI · biotech · banks" className="input flex-1" disabled={loading} />
        <button onClick={run} disabled={loading || !sector.trim()} className="btn-primary">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
          {locale === "zh" ? "运行" : "Run"}
        </button>
      </div>
      {error && <ErrorBanner msg={error} />}
      {result && <IntegrityHeader integ={result.data_integrity} locale={locale} />}
      {result && result.data_integrity?.passed === false && <IntegrityFailedBody result={result} locale={locale} />}
      {result && result.data_integrity?.passed && p && (
        <div className="space-y-4">
          <div className="surface p-5">
            <div className="label-cap mb-3">{p.sector as string}</div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Stat label={locale === "zh" ? "市场规模" : "Market size"} value={p.market_size_usd_b != null ? `$${(p.market_size_usd_b as number).toFixed(1)}B` : "[N/A]"} />
              <Stat label={locale === "zh" ? "5 年增长" : "5yr growth"} value={fmtPct(p.market_growth_pct_5yr)} />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <ListPanel title={locale === "zh" ? "核心主题" : "Key themes"} items={(p.key_themes as string[]) || []} icon={<TrendingUp className="w-4 h-4 text-bull-ink" />} />
            <ListPanel title={locale === "zh" ? "长期驱动" : "Long-term drivers"} items={(p.long_term_drivers as string[]) || []} icon={<Target className="w-4 h-4 text-accent" />} />
            <ListPanel title={locale === "zh" ? "近期催化剂" : "Near-term catalysts"} items={(p.near_term_catalysts as string[]) || []} icon={<Clock className="w-4 h-4 text-gold" />} />
            <ListPanel title={locale === "zh" ? "逆风" : "Headwinds"} items={(p.headwinds as string[]) || []} icon={<AlertTriangle className="w-4 h-4 text-bear-ink" />} />
          </div>
          {cd && (
            <div className="surface p-5 space-y-2">
              <div className="label-cap">{locale === "zh" ? "竞争格局" : "Competitive dynamics"}</div>
              <div className="text-xs">
                <div><strong>{locale === "zh" ? "领导者: " : "Leaders: "}</strong>{strs(cd.leaders).join(", ")}</div>
                <div><strong>{locale === "zh" ? "挑战者: " : "Challengers: "}</strong>{strs(cd.challengers).join(", ")}</div>
                <div><strong>{locale === "zh" ? "市场集中度: " : "Concentration: "}</strong>{fmtPct(cd.market_share_concentration)}</div>
              </div>
            </div>
          )}
          {recs && (
            <div className="surface p-5 space-y-2">
              <div className="label-cap">{locale === "zh" ? "组合推荐" : "Portfolio recommendations"}</div>
              <div className="grid sm:grid-cols-3 gap-3 text-xs">
                <div><div className="text-bull-ink font-mono mb-1">OVERWEIGHT</div><div>{strs(recs.overweight).join(", ")}</div></div>
                <div><div className="text-gold font-mono mb-1">NEUTRAL</div><div>{strs(recs.neutral).join(", ")}</div></div>
                <div><div className="text-bear-ink font-mono mb-1">UNDERWEIGHT</div><div>{strs(recs.underweight).join(", ")}</div></div>
              </div>
            </div>
          )}
          <DebugFooter result={result} />
        </div>
      )}
    </div>
  );
}

// ---- 9. Screen (Idea Generation) -----------------------------------------

function ScreenPanel({ locale }: { locale: string }) {
  const [sector, setSector] = useState("semiconductors");
  const [tilt, setTilt] = useState("growth");
  const [universe, setUniverse] = useState<string[]>([]);
  const [newTicker, setNewTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SkillResult | null>(null);

  async function run() {
    setLoading(true); setError(null); setResult(null);
    try {
      setResult(await callSkill(`${API_BASE}/v1/equity-research/screen`, {
        criteria: { sector, tilt },
        universe: universe.map((t) => ({ ticker: t })),
        locale,
      }));
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  const p = (result?.parsed as Record<string, unknown>) || null;
  const candidates = arr(p?.candidates);
  const topPicks = arr(p?.top_picks);

  return (
    <div className="space-y-4">
      <div className="surface p-5 space-y-3">
        <div className="grid md:grid-cols-2 gap-3">
          <label className="block">
            <span className="label-cap">{locale === "zh" ? "行业" : "Sector"}</span>
            <input value={sector} onChange={(e) => setSector(e.target.value)} className="input mt-1" />
          </label>
          <label className="block">
            <span className="label-cap">{locale === "zh" ? "倾向" : "Tilt"}</span>
            <select value={tilt} onChange={(e) => setTilt(e.target.value)} className="input mt-1">
              <option value="growth">growth</option>
              <option value="value">value</option>
              <option value="momentum">momentum</option>
              <option value="quality">quality</option>
              <option value="contrarian">contrarian</option>
            </select>
          </label>
        </div>
        <TickerListEditor list={universe} setList={setUniverse} newTicker={newTicker} setNewTicker={setNewTicker} locale={locale} title={locale === "zh" ? "Universe (留空自动拉)" : "Universe (auto-fills if empty)"} />
        <button onClick={run} disabled={loading} className="btn-primary w-full">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {locale === "zh" ? "运行筛选" : "Run screen"}
        </button>
      </div>
      {error && <ErrorBanner msg={error} />}
      {result && <IntegrityHeader integ={result.data_integrity} locale={locale} />}
      {result && result.data_integrity?.passed === false && <IntegrityFailedBody result={result} locale={locale} />}
      {result && result.data_integrity?.passed && p && (
        <div className="space-y-4">
          {result.universe_size != null && (
            <div className="text-xs text-ink-tertiary">
              {locale === "zh" ? `Universe 大小: ${result.universe_size}` : `Universe size: ${result.universe_size}`}
            </div>
          )}
          {topPicks.length > 0 && (
            <div className="space-y-3">
              <div className="label-cap">{locale === "zh" ? `前 ${topPicks.length} 名深度论点` : `Top ${topPicks.length} deep-dive`}</div>
              {topPicks.map((tp, i) => (
                <div key={i} className="surface p-5 space-y-2">
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-lg font-semibold">{tp.ticker as string}</span>
                    <span className="text-2xs font-mono uppercase tracking-wider text-accent">#{i + 1}</span>
                  </div>
                  <p className="text-sm text-ink-primary leading-relaxed whitespace-pre-wrap">{tp.thesis as string}</p>
                  <div className="text-xs text-ink-tertiary"><strong>Catalyst: </strong>{tp.catalyst as string}</div>
                </div>
              ))}
            </div>
          )}
          {candidates.length > 0 && (
            <div className="surface p-5">
              <div className="label-cap mb-2">{locale === "zh" ? "完整候选" : "Full candidates"}</div>
              <table className="w-full text-xs">
                <thead className="text-ink-tertiary uppercase text-2xs font-mono">
                  <tr className="border-b border-border-subtle">
                    <th className="text-left py-2 pr-3">Ticker</th>
                    <th className="text-left py-2 pr-3">Sector</th>
                    <th className="text-left py-2 pr-3">Why passes</th>
                    <th className="text-right py-2">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c, i) => (
                    <tr key={i} className="border-b border-border-subtle/40 hover:bg-bg-hover/40">
                      <td className="py-1.5 pr-3 font-mono">{c.ticker as string}</td>
                      <td className="py-1.5 pr-3">{c.sector as string}</td>
                      <td className="py-1.5 pr-3 text-xs">{c.why_passes as string}</td>
                      <td className="py-1.5 text-right font-mono text-accent">{((c.score as number) || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <DebugFooter result={result} />
        </div>
      )}
    </div>
  );
}

// ---- Generic watchlist-skill panel (used by morning-note) ----------------

function WatchlistSkillPanel({
  locale,
  defaultList,
  endpoint,
  renderResult,
}: {
  locale: string;
  defaultList: string[];
  endpoint: string;
  renderResult: (r: SkillResult, locale: string) => React.ReactNode;
}) {
  const [list, setList] = useState<string[]>(defaultList);
  const [newTicker, setNewTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SkillResult | null>(null);

  async function run() {
    setLoading(true); setError(null); setResult(null);
    try {
      setResult(await callSkill(`${API_BASE}/v1/equity-research/${endpoint}`, { watchlist: list, locale }));
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-4">
      <div className="surface p-5 space-y-3">
        <TickerListEditor list={list} setList={setList} newTicker={newTicker} setNewTicker={setNewTicker} locale={locale} />
        <button onClick={run} disabled={loading || list.length === 0} className="btn-primary w-full">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {locale === "zh" ? "生成" : "Generate"}
        </button>
      </div>
      {error && <ErrorBanner msg={error} />}
      {result && <IntegrityHeader integ={result.data_integrity} locale={locale} />}
      {result && result.data_integrity?.passed === false && <IntegrityFailedBody result={result} locale={locale} />}
      {result && result.data_integrity?.passed && renderResult(result, locale)}
    </div>
  );
}

// ---- Building blocks -----------------------------------------------------

function TickerForm({ ticker, setTicker, loading, onRun, locale }: { ticker: string; setTicker: (t: string) => void; loading: boolean; onRun: () => void; locale: string }) {
  return (
    <div className="surface p-4 flex gap-3 items-center">
      <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && !loading && onRun()} placeholder="AAPL · 600519 · TSLA" className="input flex-1 font-mono uppercase tracking-wider" disabled={loading} />
      <button onClick={onRun} disabled={loading || !ticker.trim()} className="btn-primary">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {locale === "zh" ? "运行" : "Run"}
      </button>
    </div>
  );
}

function TickerListEditor({ list, setList, newTicker, setNewTicker, locale, title }: { list: string[]; setList: (l: string[]) => void; newTicker: string; setNewTicker: (t: string) => void; locale: string; title?: string }) {
  function addT() {
    const t = newTicker.trim().toUpperCase();
    if (t && !list.includes(t)) { setList([...list, t]); setNewTicker(""); }
  }
  return (
    <div>
      <div className="label-cap mb-1">{title || (locale === "zh" ? `Watchlist (${list.length})` : `Watchlist (${list.length})`)}</div>
      <div className="flex flex-wrap gap-2 mb-2">
        {list.map((t) => (
          <span key={t} className="pill bg-bg-subtle text-ink-secondary inline-flex items-center gap-1">
            {t}
            <button onClick={() => setList(list.filter(x => x !== t))} className="hover:text-bear-ink"><X className="w-3 h-3" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={newTicker} onChange={(e) => setNewTicker(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && addT()} placeholder={locale === "zh" ? "加 ticker, 回车" : "Add ticker, Enter"} className="input flex-1" />
        <button onClick={addT} className="btn-secondary"><Plus className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

function HeaderBar({ ticker, gtClose, extraLabel, extraValue, locale }: { ticker?: string; gtClose?: number | null; extraLabel: string; extraValue: string; locale: string }) {
  return (
    <div className="surface p-3 flex flex-wrap items-baseline gap-3 text-sm">
      <span className="label-cap">{ticker}</span>
      <span className="text-ink-tertiary font-mono">{extraLabel}: {extraValue}</span>
      {gtClose != null && <span className="font-mono text-accent">{locale === "zh" ? "真实收盘: " : "GT close: "}{gtClose}</span>}
    </div>
  );
}

function IntegrityHeader({ integ, locale }: { integ?: IntegrityEnvelope; locale: string }) {
  if (!integ || !integ.passed) return null;
  return (
    <div className="surface p-3 border border-signal-buy/30 bg-signal-buy_soft/30 flex items-center gap-2 text-sm">
      <CheckCircle2 className="w-4 h-4 text-signal-buy shrink-0" />
      <span className="text-ink-primary">
        {locale === "zh" ? "数据完整性校验通过" : "Data integrity passed"}
      </span>
    </div>
  );
}

function IntegrityFailedBody({ result, locale }: { result: SkillResult; locale: string }) {
  const errors = result.data_integrity?.errors || [];
  return (
    <div className="surface border border-signal-sell bg-signal-sell_soft/50 p-5 space-y-3">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-signal-sell shrink-0" />
        <h2 className="text-lg font-semibold text-signal-sell">
          {locale === "zh" ? "数据完整性校验失败 · 报告内容不可信" : "Data integrity check FAILED · report body suppressed"}
        </h2>
      </div>
      <p className="text-sm text-ink-secondary">
        {locale === "zh" ? "校验失败, 报告 body 不渲染. 错误清单:" : "Validation failed; report body suppressed. Errors:"}
      </p>
      <ul className="text-xs font-mono text-ink-primary space-y-1 list-disc list-inside">
        {errors.map((e, i) => <li key={i}>{e}</li>)}
      </ul>
      <details className="text-xs text-ink-tertiary">
        <summary className="cursor-pointer hover:text-ink-secondary">{locale === "zh" ? "原始 LLM 输出 (调试)" : "Raw LLM output (debug)"}</summary>
        <pre className="mt-2 surface p-3 overflow-x-auto whitespace-pre-wrap">{result.raw_body || ""}</pre>
      </details>
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return <div className="surface border border-signal-sell/40 bg-signal-sell_soft/30 p-3 flex items-center gap-2 text-sm text-signal-sell"><AlertTriangle className="w-4 h-4" />{msg}</div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><div className="label-cap">{label}</div><div className="mt-1 font-mono text-base">{value}</div></div>;
}

function ListPanel({ title, items, icon }: { title: string; items: unknown; icon: React.ReactNode }) {
  // v62: harden against LLM emitting a string instead of an array — TypeScript
  // `as string[]` casts at call-sites are runtime no-ops, so we defend here.
  // If `items` is a string, render it as a single paragraph; otherwise fall
  // back to [N/A]. This prevents `items.map is not a function` from killing
  // the whole React tree (real bug found in v61 smoke test, task #184).
  const safe: string[] = Array.isArray(items)
    ? (items as unknown[]).filter((x) => x != null).map((x) => (typeof x === "string" ? x : JSON.stringify(x)))
    : typeof items === "string" && items.trim()
      ? [items as string]
      : [];
  return (
    <div className="surface p-5">
      <div className="label-cap inline-flex items-center gap-2">{icon}{title}</div>
      <ul className="mt-3 space-y-2">
        {safe.length === 0 ? <li className="text-xs text-ink-tertiary">[N/A]</li> : safe.map((it, i) => (
          <li key={i} className="text-sm text-ink-secondary flex items-start gap-2">
            <ChevronRight className="w-3 h-3 mt-1 text-ink-tertiary shrink-0" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TradeIdeaCard({ trade, locale }: { trade: Record<string, unknown>; locale: string }) {
  return (
    <div className="surface-elev p-5 space-y-3 border-l-4 border-accent">
      <div className="flex items-center gap-2"><Target className="w-4 h-4 text-accent" /><span className="label-cap">{locale === "zh" ? "交易方案" : "Trade idea"}</span><span className="font-mono text-accent text-sm">{(trade.structure as string) || "—"}</span></div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Stat label="Entry" value={fmtNum(trade.entry)} />
        <Stat label="Target" value={fmtNum(trade.exit_target)} />
        <Stat label="Stop" value={fmtNum(trade.stop_loss)} />
        <Stat label={locale === "zh" ? "仓位 %" : "Size %"} value={fmtPct(trade.size_pct_of_portfolio)} />
      </div>
      <p className="text-sm text-ink-secondary">{(trade.rationale as string) || ""}</p>
    </div>
  );
}

function CatalystGrid({ catalysts, locale }: { catalysts: Array<Record<string, unknown>>; locale: string }) {
  return (
    <div className="surface p-5 space-y-2">
      <div className="label-cap">{locale === "zh" ? "催化剂日历" : "Catalyst calendar"}</div>
      <div className="grid md:grid-cols-3 gap-2">
        {catalysts.map((c, i) => (
          <div key={i} className="surface p-3 text-xs space-y-1">
            <div className="font-mono text-ink-primary">{c.ticker as string} · {c.event as string}</div>
            <div className="text-ink-tertiary">{c.date_estimate as string} {c.days_to_event != null ? `(${c.days_to_event}d)` : ""}</div>
            <div className={cn("inline-block px-1.5 py-0.5 rounded text-2xs", c.skew === "positive" ? "bg-bull-soft text-bull-ink" : c.skew === "negative" ? "bg-bear-soft text-bear-ink" : "bg-bg-subtle text-ink-tertiary")}>{c.skew as string || "neutral"}</div>
            <p className="text-ink-secondary">{c.expected_outcome as string}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DebugFooter({ result }: { result: SkillResult }) {
  const totalCost = (result.usage || []).reduce((acc, u) => acc + (u.usd_cost || 0), 0);
  return (
    <div className="border-t border-border-subtle pt-3 flex justify-between text-2xs font-mono uppercase tracking-wider text-ink-tertiary">
      <span>model={result.model || "?"} · cost=${totalCost.toFixed(5)}</span>
      <span>{result.asof || ""}</span>
    </div>
  );
}

function fmtPct(v: unknown): string {
  if (typeof v === "number") return `${(v * 100).toFixed(1)}%`;
  if (Array.isArray(v) && v.length === 2) return `${(Number(v[0]) * 100).toFixed(0)}%—${(Number(v[1]) * 100).toFixed(0)}%`;
  return "—";
}
function fmtNum(v: unknown): string { return v != null && typeof v === "number" ? String(v) : "[N/A]"; }
function fmtMoney(v: unknown): string { return typeof v === "number" ? `$${v.toLocaleString()}` : "[N/A]"; }

// v62 hardening: TypeScript `as Array<T>` casts are runtime no-ops, so if
// the LLM emits a string where we expect an array (e.g. key_takeaways as
// a single paragraph), `(p.foo as Array<T>) || []` returns the truthy
// string and the next `.map(...)` crashes the React tree. This helper
// enforces the array-ness at runtime.
function arr<T = Record<string, unknown>>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
function strs(v: unknown): string[] {
  if (Array.isArray(v)) return (v as unknown[]).filter((x) => x != null).map((x) => String(x));
  if (typeof v === "string" && v.trim()) return [v];
  return [];
}
