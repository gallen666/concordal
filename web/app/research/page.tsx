"use client";

/**
 * /research — Equity-research workbench (v57).
 *
 * Three tabs, each driving one of the v56 skill endpoints:
 *   - Earnings Preview      → POST /v1/equity-research/earnings-preview?ticker=X
 *   - Thesis Tracker        → POST /v1/equity-research/thesis-tracker?ticker=X
 *   - Idea Generation       → POST /v1/equity-research/screen (body: criteria + universe)
 *
 * Methodology ported from anthropics/financial-services-plugins.
 * Data-integrity gate: every response carries `data_integrity.passed`.
 * If false, this page renders a BIG RED banner with the list of
 * validator errors and DOES NOT show the report body. That's the
 * 数据要正确精准 promise made visible.
 */

import { useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Plus,
  ScrollText,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import { useT } from "../lib/i18n";
import { cn } from "../lib/cn";

const API_BASE =
  process.env.NEXT_PUBLIC_API ||
  "https://trading-agents-platform.onrender.com";

type SkillId = "earnings-preview" | "thesis-tracker" | "screen";

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

export default function ResearchPage() {
  const { locale } = useT();
  const [tab, setTab] = useState<SkillId>("earnings-preview");

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      <header className="space-y-2">
        <span className="label-cap inline-flex items-center gap-2">
          <ScrollText className="w-3.5 h-3.5 text-accent" />
          {locale === "zh" ? "投研工作台 · v56" : "Equity Research Workbench · v56"}
        </span>
        <h1 className="text-3xl md:text-4xl font-display font-medium">
          {locale === "zh"
            ? "机构级研究 skill · 数据精准三重守门"
            : "Institutional research skills · Triple data-integrity gate"}
        </h1>
        <p className="text-sm text-ink-secondary leading-relaxed max-w-3xl">
          {locale === "zh"
            ? "三个 skill 源自 Anthropic 官方 financial-services-plugins (4.5k stars), 转译到我们的 DeepSeek V4 后端. 每次输出都过 (1) prompt 禁止编造规则 + (2) v55 GROUND TRUTH QUOTE block + (3) 程序化 validator 三层校验. 校验失败 → 红色告警, 不渲染报告."
            : "Three skills ported from Anthropic's official financial-services-plugins repo (4.5k stars). Every output passes through three layers: (1) prompt-level fabrication ban, (2) v55 GROUND TRUTH QUOTE injection, (3) programmatic validator. On failure: red banner, report body suppressed."}
        </p>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-border-subtle pb-2">
        <TabBtn id="earnings-preview" active={tab === "earnings-preview"} setActive={setTab}
          icon={<Calendar className="w-3.5 h-3.5" />}
          label={locale === "zh" ? "财报前情景" : "Earnings Preview"} />
        <TabBtn id="thesis-tracker" active={tab === "thesis-tracker"} setActive={setTab}
          icon={<Target className="w-3.5 h-3.5" />}
          label={locale === "zh" ? "投资论点" : "Thesis Tracker"} />
        <TabBtn id="screen" active={tab === "screen"} setActive={setTab}
          icon={<Search className="w-3.5 h-3.5" />}
          label={locale === "zh" ? "股票筛选" : "Idea Generation"} />
      </div>

      <div className="pt-2">
        {tab === "earnings-preview" && <EarningsPreviewPanel locale={locale} />}
        {tab === "thesis-tracker" && <ThesisTrackerPanel locale={locale} />}
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
        "px-3 py-2 text-sm font-medium inline-flex items-center gap-2 rounded border transition-colors",
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

// ---- Earnings Preview ----------------------------------------------------

function EarningsPreviewPanel({ locale }: { locale: string }) {
  const [ticker, setTicker] = useState("AAPL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SkillResult | null>(null);

  async function run() {
    if (!ticker.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const url = `${API_BASE}/v1/equity-research/earnings-preview?ticker=${encodeURIComponent(ticker.toUpperCase())}&locale=${locale}`;
      const r = await fetch(url, { method: "POST", cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setResult(await r.json());
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const parsed = (result?.parsed as Record<string, unknown>) || null;
  const scenarios = arr(parsed?.scenarios);

  return (
    <div className="space-y-4">
      <SkillForm ticker={ticker} setTicker={setTicker} loading={loading} onRun={run} locale={locale} />
      {error && <ErrorBanner msg={error} />}
      {result && <IntegrityHeader integ={result.data_integrity} locale={locale} />}
      {result && result.data_integrity?.passed === false && (
        <IntegrityFailedBody result={result} locale={locale} />
      )}
      {result && result.data_integrity?.passed && parsed && (
        <div className="space-y-4">
          <div className="surface p-5">
            <div className="flex flex-wrap items-baseline gap-3 mb-3">
              <span className="label-cap">{result.ticker}</span>
              <span className="text-sm text-ink-tertiary font-mono">
                {locale === "zh" ? "下次财报: " : "Next earnings: "}
                {(parsed.next_earnings_date as string) || "—"}
              </span>
              {result.ground_truth_close != null && (
                <span className="text-sm font-mono text-accent">
                  {locale === "zh" ? "真实收盘: " : "Ground-truth close: "}
                  {result.ground_truth_close}
                </span>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <Stat label={locale === "zh" ? "共识 EPS" : "Consensus EPS"}
                value={parsed.consensus_eps != null ? String(parsed.consensus_eps) : "[N/A]"} />
              <Stat label={locale === "zh" ? "共识收入" : "Consensus revenue"}
                value={parsed.consensus_rev_usd != null
                  ? `$${(parsed.consensus_rev_usd as number).toLocaleString()}` : "[N/A]"} />
            </div>
          </div>

          {scenarios.length > 0 && (
            <div className="surface p-5 space-y-3">
              <div className="label-cap">{locale === "zh" ? "4 种情景" : "4 scenarios"}</div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {scenarios.map((s, i) => (
                  <div key={i} className="surface p-3 text-xs">
                    <div className="font-mono text-ink-primary text-sm">{s.name as string}</div>
                    <div className="text-ink-tertiary mt-1">
                      Beat %: <span className="text-ink-primary font-mono">{fmtPct(s.beat_pct)}</span>
                    </div>
                    <div className="text-ink-tertiary">
                      {locale === "zh" ? "目标价: " : "Target: "}
                      <span className="font-mono text-accent">{s.target_price as number}</span>
                    </div>
                    <div className="text-ink-tertiary">
                      {locale === "zh" ? "概率: " : "Probability: "}
                      <span className="font-mono">{fmtPct(s.probability)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-3">
            <ListPanel title={locale === "zh" ? "关键观察指标" : "Key metrics to watch"}
              items={parsed.key_metrics_to_watch}
              icon={<TrendingUp className="w-4 h-4 text-bull-ink" />} />
            <ListPanel title={locale === "zh" ? "风险标记" : "Risk flags"}
              items={parsed.risk_flags}
              icon={<AlertTriangle className="w-4 h-4 text-bear-ink" />} />
          </div>

          {parsed.trade_idea ? (
            <TradeIdeaCard trade={parsed.trade_idea as Record<string, unknown>} locale={locale} />
          ) : null}

          <DebugFooter result={result} />
        </div>
      )}
    </div>
  );
}

// ---- Thesis Tracker ------------------------------------------------------

function ThesisTrackerPanel({ locale }: { locale: string }) {
  const [ticker, setTicker] = useState("600519");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SkillResult | null>(null);

  async function run() {
    if (!ticker.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const url = `${API_BASE}/v1/equity-research/thesis-tracker?ticker=${encodeURIComponent(ticker.toUpperCase())}&locale=${locale}`;
      const r = await fetch(url, { method: "POST", cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setResult(await r.json());
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const parsed = (result?.parsed as Record<string, unknown>) || null;
  const breakers = arr(parsed?.thesis_breakers);
  const catalysts = arr(parsed?.catalyst_pipeline);
  const health = (parsed?.thesis_health as Record<string, unknown>) || null;
  const thesis = (parsed?.current_thesis as Record<string, unknown>) || null;

  return (
    <div className="space-y-4">
      <SkillForm ticker={ticker} setTicker={setTicker} loading={loading} onRun={run} locale={locale} />
      {error && <ErrorBanner msg={error} />}
      {result && <IntegrityHeader integ={result.data_integrity} locale={locale} />}
      {result && result.data_integrity?.passed === false && (
        <IntegrityFailedBody result={result} locale={locale} />
      )}
      {result && result.data_integrity?.passed && parsed && (
        <div className="space-y-4">
          {health && (
            <div className="surface p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="label-cap">{locale === "zh" ? "论点健康度" : "Thesis health"}</div>
                  <div className="text-3xl font-display font-medium mt-1 text-accent">
                    {(((health.score as number) || 0) * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="text-xs text-ink-secondary text-right max-w-xs">
                  {(health.narrative as string) || ""}
                </div>
              </div>
              <div className="flex gap-3 text-xs font-mono text-ink-tertiary">
                <span>fired={String(health.breakers_fired ?? 0)}</span>
                <span>pos={String(health.positive_catalysts ?? 0)}</span>
                <span>neg={String(health.negative_catalysts ?? 0)}</span>
              </div>
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
              <div className="text-xs text-ink-tertiary mt-2">
                {locale === "zh" ? "时间窗口: " : "Time horizon: "}
                {String(thesis.time_horizon_months ?? "—")} {locale === "zh" ? "个月" : "months"}
              </div>
            </div>
          )}

          {breakers.length > 0 && (
            <div className="surface p-5 space-y-3">
              <div className="label-cap">
                {locale === "zh" ? "论点破坏者 (按风险分排序)" : "Thesis-breakers (by risk_score)"}
              </div>
              <table className="w-full text-xs font-mono">
                <thead className="text-ink-tertiary uppercase tracking-wider text-2xs">
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
                      <td className="py-1.5 text-right text-bear-ink">
                        {((b.risk_score as number) || 0).toFixed(3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {catalysts.length > 0 && (
            <div className="surface p-5 space-y-2">
              <div className="label-cap">{locale === "zh" ? "催化剂日历" : "Catalyst pipeline"}</div>
              <div className="grid md:grid-cols-3 gap-2">
                {catalysts.map((c, i) => (
                  <div key={i} className="surface p-3 text-xs space-y-1">
                    <div className="font-mono text-ink-primary">{c.event as string}</div>
                    <div className="text-ink-tertiary">{c.date_estimate as string}</div>
                    <div className={cn(
                      "inline-block px-1.5 py-0.5 rounded text-2xs",
                      c.skew === "positive" ? "bg-bull-soft text-bull-ink"
                        : c.skew === "negative" ? "bg-bear-soft text-bear-ink"
                        : "bg-bg-subtle text-ink-tertiary",
                    )}>{c.skew as string}</div>
                    <p className="text-ink-secondary">{c.expected_outcome as string}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DebugFooter result={result} />
        </div>
      )}
    </div>
  );
}

// ---- Idea Generation -----------------------------------------------------

function ScreenPanel({ locale }: { locale: string }) {
  const [sector, setSector] = useState("semiconductors");
  const [tilt, setTilt] = useState("growth");
  const [universe, setUniverse] = useState<string[]>([
    "NVDA", "AMD", "TSM", "AVGO", "QCOM", "MU", "ARM", "INTC",
  ]);
  const [newTicker, setNewTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SkillResult | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const url = `${API_BASE}/v1/equity-research/screen`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          criteria: { sector, tilt },
          universe: universe.map((t) => ({ ticker: t })),
          locale,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setResult(await r.json());
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function addTicker() {
    const t = newTicker.trim().toUpperCase();
    if (t && !universe.includes(t)) {
      setUniverse([...universe, t]);
      setNewTicker("");
    }
  }
  function removeTicker(t: string) {
    setUniverse(universe.filter((x) => x !== t));
  }

  const parsed = (result?.parsed as Record<string, unknown>) || null;
  const candidates = arr(parsed?.candidates);
  const topPicks = arr(parsed?.top_picks);

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
        <div>
          <div className="label-cap mb-1">
            {locale === "zh"
              ? `候选池 (LLM 不能编造池外 ticker · 当前 ${universe.length})`
              : `Universe (LLM cannot invent outside · ${universe.length} tickers)`}
          </div>
          <div className="flex flex-wrap gap-2 mb-2">
            {universe.map((t) => (
              <span key={t} className="pill bg-bg-subtle text-ink-secondary inline-flex items-center gap-1">
                {t}
                <button onClick={() => removeTicker(t)} className="hover:text-bear-ink">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={newTicker} onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && addTicker()}
              placeholder={locale === "zh" ? "加 ticker, 回车确认" : "Add ticker, press Enter"}
              className="input flex-1" />
            <button onClick={addTicker} className="btn-secondary"><Plus className="w-4 h-4" /></button>
          </div>
        </div>
        <button onClick={run} disabled={loading || universe.length === 0} className="btn-primary w-full">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {locale === "zh" ? "运行筛选" : "Run screen"}
        </button>
      </div>

      {error && <ErrorBanner msg={error} />}
      {result && <IntegrityHeader integ={result.data_integrity} locale={locale} />}
      {result && result.data_integrity?.passed === false && (
        <IntegrityFailedBody result={result} locale={locale} />
      )}

      {result && result.data_integrity?.passed && parsed && (
        <div className="space-y-4">
          {topPicks.length > 0 && (
            <div className="space-y-3">
              <div className="label-cap">
                {locale === "zh" ? `前 ${topPicks.length} 名深度论点` : `Top ${topPicks.length} deep-dive`}
              </div>
              {topPicks.map((p, i) => (
                <div key={i} className="surface p-5 space-y-2">
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-lg font-semibold text-ink-primary">{p.ticker as string}</span>
                    <span className="text-2xs font-mono uppercase tracking-wider text-accent">#{i + 1}</span>
                  </div>
                  <p className="text-sm text-ink-primary leading-relaxed whitespace-pre-wrap">
                    {p.thesis as string}
                  </p>
                  <div className="text-xs text-ink-tertiary">
                    <strong className="text-ink-secondary">
                      {locale === "zh" ? "催化剂: " : "Catalyst: "}
                    </strong>{p.catalyst as string}
                  </div>
                  {Array.isArray(p.monitoring) && (p.monitoring as string[]).length > 0 && (
                    <ul className="text-xs text-ink-secondary list-disc list-inside">
                      {(p.monitoring as string[]).map((m, j) => <li key={j}>{m}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}

          {candidates.length > 0 && (
            <div className="surface p-5 space-y-2">
              <div className="label-cap">
                {locale === "zh" ? "完整候选列表" : "Full candidate list"}
              </div>
              <table className="w-full text-xs">
                <thead className="text-ink-tertiary uppercase tracking-wider text-2xs font-mono">
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
                      <td className="py-1.5 pr-3 font-mono text-ink-primary">{c.ticker as string}</td>
                      <td className="py-1.5 pr-3 text-ink-secondary">{c.sector as string}</td>
                      <td className="py-1.5 pr-3 text-ink-secondary text-xs">{c.why_passes as string}</td>
                      <td className="py-1.5 text-right font-mono text-accent">
                        {((c.score as number) || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {parsed.universe_note ? (
            <div className="surface p-3 text-xs text-ink-tertiary border-l-2 border-gold/40">
              {parsed.universe_note as string}
            </div>
          ) : null}

          <DebugFooter result={result} />
        </div>
      )}
    </div>
  );
}

// ---- Shared ---------------------------------------------------------------

function SkillForm({ ticker, setTicker, loading, onRun, locale }: {
  ticker: string; setTicker: (t: string) => void;
  loading: boolean; onRun: () => void; locale: string;
}) {
  return (
    <div className="surface p-4 flex gap-3 items-center">
      <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())}
        onKeyDown={(e) => e.key === "Enter" && !loading && onRun()}
        placeholder="AAPL · 600519 · TSLA"
        className="input flex-1 font-mono uppercase tracking-wider" disabled={loading} />
      <button onClick={onRun} disabled={loading || !ticker.trim()} className="btn-primary">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {locale === "zh" ? "运行" : "Run"}
      </button>
    </div>
  );
}

function IntegrityHeader({ integ, locale }: { integ?: IntegrityEnvelope; locale: string }) {
  if (!integ || !integ.passed) return null;
  return (
    <div className="surface p-3 border border-signal-buy/30 bg-signal-buy_soft/30 flex items-center gap-2 text-sm">
      <CheckCircle2 className="w-4 h-4 text-signal-buy shrink-0" />
      <span className="text-ink-primary">
        {locale === "zh"
          ? "数据完整性校验通过 · 所有数字交叉对照 ground truth + universe"
          : "Data integrity passed · all numbers cross-checked vs ground truth + universe"}
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
          {locale === "zh"
            ? "数据完整性校验失败 · 报告内容不可信"
            : "Data integrity check FAILED · report body suppressed"}
        </h2>
      </div>
      <p className="text-sm text-ink-secondary leading-relaxed">
        {locale === "zh"
          ? "LLM 的输出未通过三重校验, 可能是: ticker 不在 universe 里 / 价格偏离真实 close ±50% / 概率不合理. 我们拒绝渲染报告 body. 请刷新重试, 或调整输入. 错误清单如下:"
          : "The LLM output failed validation — likely fabricated ticker, price off ±50% of ground truth, or inconsistent probabilities. We refuse to render the report body. Retry or adjust inputs. Errors:"}
      </p>
      <ul className="text-xs font-mono text-ink-primary space-y-1 list-disc list-inside">
        {errors.map((e, i) => <li key={i}>{e}</li>)}
      </ul>
      <details className="text-xs text-ink-tertiary">
        <summary className="cursor-pointer hover:text-ink-secondary">
          {locale === "zh" ? "查看原始 LLM 输出 (仅供调试)" : "Show raw LLM output (debug only)"}
        </summary>
        <pre className="mt-2 surface p-3 overflow-x-auto whitespace-pre-wrap">
          {result.raw_body || "(no body)"}
        </pre>
      </details>
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="surface border border-signal-sell/40 bg-signal-sell_soft/30 p-3 flex items-center gap-2 text-sm text-signal-sell">
      <AlertTriangle className="w-4 h-4" />{msg}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label-cap">{label}</div>
      <div className="mt-1 font-mono text-base">{value}</div>
    </div>
  );
}

function ListPanel({ title, items, icon }: { title: string; items: unknown; icon: React.ReactNode }) {
  // v63: same hardening as equity-research/page.tsx ListPanel — TypeScript
  // `as string[]` casts at call-sites are runtime no-ops, so if the LLM
  // emits a string where we expect an array (e.g. key_takeaways as a single
  // paragraph), the page crashes with "items.map is not a function" and the
  // whole React tree unmounts. Array.isArray guard at runtime fixes it.
  const safe: string[] = Array.isArray(items)
    ? (items as unknown[]).filter((x) => x != null).map((x) => (typeof x === "string" ? x : JSON.stringify(x)))
    : typeof items === "string" && items.trim()
      ? [items as string]
      : [];
  return (
    <div className="surface p-5">
      <div className="label-cap inline-flex items-center gap-2">{icon}{title}</div>
      <ul className="mt-3 space-y-2">
        {safe.length === 0 ? <li className="text-xs text-ink-tertiary">[N/A]</li>
          : safe.map((it, i) => (
            <li key={i} className="text-sm text-ink-secondary leading-relaxed flex items-start gap-2">
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
      <div className="flex items-center gap-2">
        <Target className="w-4 h-4 text-accent" />
        <span className="label-cap">{locale === "zh" ? "交易方案" : "Trade idea"}</span>
        <span className="font-mono text-accent text-sm">{(trade.structure as string) || "—"}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Stat label="Entry" value={String(trade.entry ?? "—")} />
        <Stat label="Exit target" value={String(trade.exit_target ?? "—")} />
        <Stat label="Stop loss" value={String(trade.stop_loss ?? "—")} />
        <Stat label={locale === "zh" ? "仓位 (%)" : "Size (%)"}
          value={fmtPct(trade.size_pct_of_portfolio)} />
      </div>
      <p className="text-sm text-ink-secondary leading-relaxed">{(trade.rationale as string) || ""}</p>
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

// v63: runtime array guards. TS `as Array<T>` is a no-op at runtime, so an
// LLM emitting a string where we expect an array slips past `|| []` and
// crashes the next `.map()`. These helpers enforce array-ness at runtime.
function arr<T = Record<string, unknown>>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
function strs(v: unknown): string[] {
  if (Array.isArray(v)) return (v as unknown[]).filter((x) => x != null).map((x) => String(x));
  if (typeof v === "string" && v.trim()) return [v];
  return [];
}

function fmtPct(v: unknown): string {
  if (typeof v === "number") return `${(v * 100).toFixed(1)}%`;
  if (Array.isArray(v) && v.length === 2) {
    return `${(Number(v[0]) * 100).toFixed(0)}%—${(Number(v[1]) * 100).toFixed(0)}%`;
  }
  return "—";
}
