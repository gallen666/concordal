"use client";

/**
 * /report/[ticker] — Professional Investment Research Report Module.
 *
 * Modeled after the StockAlpha V0.0.2 11-section PDF layout, with 4
 * TradingAgents-exclusive extensions:
 *
 *   1. Bus Telemetry Audit — every bus.fetch this report made, with
 *      source / latency / cache-hit. (StockAlpha doesn't have a bus.)
 *   2. Calibration Context — the asserted confidence's historical hit
 *      rate from our 1,560-decision evaluation. (StockAlpha can't quote
 *      retrospective calibration.)
 *   3. Cross-market label — A-share / US / HK / Crypto chip.
 *   4. Export & share actions — PDF download, share link, OG image.
 *
 * Current state: seeded with sample 600418 data so the module is fully
 * renderable today. Backend endpoint /v1/report/full?ticker=XXX is the
 * planned future data source; the page just needs to swap the import.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle, BookOpen, ChevronRight, Database, Download,
  FileText, Link2, Loader2, Network, RefreshCw,
  Share2, ShieldCheck, Sparkles, TrendingDown, TrendingUp, Users,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { SAMPLE_600418 } from "../_data/sample-600418";
import type { ReportData } from "../_types";

const API_BASE = process.env.NEXT_PUBLIC_API || "https://trading-agents-platform.onrender.com";

/** Classify a ticker into a market the backend supports. */
function classifyTicker(ticker: string): "a_share" | "hk_equity" | "unsupported" {
  const t = (ticker || "").trim().toUpperCase();
  if (/^(60|68|00|30|83|87|88)\d{4}$/.test(t)) return "a_share";
  if (/^\d{4,5}(\.HK)?$/.test(t)) return "hk_equity";
  return "unsupported";
}

/** Fetch with timeout. 240s covers Render-free-tier cold-start (~60s)
 * + multi-source quote/fundamentals (~5s) + Gemini Flash LLM (~30s) +
 * potential Gemini fallback chain (+30s). Repeat visits hit the SQLite
 * cache in <500ms. We err on the longer side because 180s previously
 * triggered false-negative timeouts on legitimately-slow Render
 * cold-starts. Backend total time is logged in _timings for debug. */
async function fetchWithTimeout(url: string, ms = 240_000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Entry — for now seeds with sample data when ticker is 600418, otherwise
// shows a placeholder. Backend integration deferred to v2.
// ---------------------------------------------------------------------------

type LoadState =
  | { kind: "idle" }
  | { kind: "loading"; startedAt: number }
  | { kind: "ready"; data: ReportData }
  | { kind: "error"; message: string };

export default function ReportPage() {
  const params = useParams();
  const ticker = String(params?.ticker || "600418").toUpperCase();
  const kind = classifyTicker(ticker);

  // The 600418 sample stays bundled so it renders instantly without a
  // round-trip — great for share links and SEO indexing. Every other
  // ticker fetches /v1/report/full from the backend.
  const seededSample: ReportData | null = ticker === "600418" ? SAMPLE_600418 : null;

  const [state, setState] = useState<LoadState>(
    seededSample ? { kind: "ready", data: seededSample } : { kind: "idle" }
  );
  const [elapsed, setElapsed] = useState(0);

  const data: ReportData | null = state.kind === "ready" ? state.data : null;

  async function runFetch(force = false) {
    if (kind === "unsupported") {
      setState({
        kind: "error",
        message: `Ticker "${ticker}" 暂不支持。当前仅支持 A 股 6 位代码（如 600519 / 300750 / 601318）。港股 / 美股 / 加密即将推出。`,
      });
      return;
    }
    if (kind === "hk_equity") {
      setState({
        kind: "error",
        message: `港股专用 adapter 即将推出。当前仅支持 A 股 6 位代码。`,
      });
      return;
    }
    const started = Date.now();
    setState({ kind: "loading", startedAt: started });
    try {
      const url = `${API_BASE}/v1/report/full?ticker=${encodeURIComponent(ticker)}${force ? "&force=true" : ""}`;
      const res = await fetchWithTimeout(url, 240_000);
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          detail = j?.detail || detail;
        } catch { /* ignore */ }
        throw new Error(detail);
      }
      const payload: ReportData = await res.json();
      setState({ kind: "ready", data: payload });
    } catch (e: any) {
      const msg = e?.name === "AbortError"
        ? "180 秒超时 — 后端可能正在冷启动 (Render free tier)，或当前 LLM 服务繁忙。点击重试一次。"
        : e?.message || "请求失败";
      setState({ kind: "error", message: msg });
    }
  }

  // Auto-fetch on mount if there is no seeded sample.
  useEffect(() => {
    if (!seededSample && state.kind === "idle") {
      runFetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  // Tick a stopwatch while loading so the UI can show progress.
  useEffect(() => {
    if (state.kind !== "loading") return;
    setElapsed(0);
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - state.startedAt) / 1000)),
      500
    );
    return () => clearInterval(id);
  }, [state]);

  if (state.kind === "loading") {
    return <Generating ticker={ticker} elapsed={elapsed} />;
  }
  if (state.kind === "error") {
    return <FetchError ticker={ticker} message={state.message} onRetry={() => runFetch(true)} />;
  }
  if (!data) {
    return <NotYetGenerated ticker={ticker} />;
  }

  return (
    <article className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <ReportTopBar data={data} onRegenerate={() => runFetch(true)} />
      <StalePriceBanner data={data} onRegenerate={() => runFetch(true)} />
      <ReportHeader data={data} />
      <ExtensionStrip data={data} />

      <SectionDivider num="一" title="投资概要" />
      <InvestmentSummary data={data} />

      <SectionDivider num="二" title="基本面分析" />
      <QualitativeAnalysis data={data} />
      <QuantitativeVerification data={data} />
      <ProfessionalValuation data={data} />

      <SectionDivider num="三" title="市场与技术分析" />
      <MoneyFlowSentiment data={data} />
      <TechnicalAnalysis data={data} />

      <SectionDivider num="四" title="综合讨论与风险提示" />
      <BullBearDebate data={data} />
      <RiskDisclosure data={data} />

      <SectionDivider num="五" title="投资建议与操作计划" />
      <OperationPlan data={data} />
      <FollowUpChecklist data={data} />

      <SectionDivider num="附录" title="分析团队贡献与系统说明" />
      <TeamContribution data={data} />
      <BusTelemetryAudit data={data} />
      <CalibrationContext data={data} />
      <SystemDisclaimer data={data} />
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Loading / generating state
// ─────────────────────────────────────────────────────────────────────────

function Generating({ ticker, elapsed }: { ticker: string; elapsed: number }) {
  const phases = [
    { at: 0,  label: "唤醒后端 · 拉取行情数据" },
    { at: 5,  label: "调取基本面 + 技术面指标" },
    { at: 12, label: "Gemini Pro 生成 11 节专业研报" },
    { at: 30, label: "后端冷启动较慢，请稍候…" },
  ];
  const current = [...phases].reverse().find((p) => elapsed >= p.at) || phases[0];
  return (
    <div className="max-w-2xl mx-auto px-4 py-24 text-center">
      <Loader2 className="w-12 h-12 mx-auto animate-spin text-accent mb-6" />
      <h1 className="text-2xl font-serif text-ink-primary mb-2">
        正在为 <span className="font-mono">{ticker}</span> 生成深度报告
      </h1>
      <p className="text-sm text-ink-tertiary mb-8">{current.label} · {elapsed}s</p>
      <div className="text-xs text-ink-tertiary space-y-1.5 text-left max-w-md mx-auto bg-surface-elev p-4 rounded-lg">
        <div className="flex items-center justify-between"><span>· 拉行情 (OHLCV / 价格 / MA)</span><span className={elapsed >= 2 ? "text-signal-buy" : ""}>{elapsed >= 2 ? "✓" : "…"}</span></div>
        <div className="flex items-center justify-between"><span>· 拉基本面 (PE / PB / ROE / 营收)</span><span className={elapsed >= 5 ? "text-signal-buy" : ""}>{elapsed >= 5 ? "✓" : "…"}</span></div>
        <div className="flex items-center justify-between"><span>· 拉技术面 (RSI / MACD / KDJ / ADX)</span><span className={elapsed >= 8 ? "text-signal-buy" : ""}>{elapsed >= 8 ? "✓" : "…"}</span></div>
        <div className="flex items-center justify-between"><span>· LLM 生成 11 节叙事</span><span className={elapsed >= 25 ? "text-signal-buy" : ""}>{elapsed >= 25 ? "✓" : "…"}</span></div>
      </div>
      <p className="mt-6 text-xs text-ink-tertiary">
        首次约 15-40s；命中缓存秒返。
      </p>
    </div>
  );
}

function FetchError({ ticker, message, onRetry }: { ticker: string; message: string; onRetry: () => void }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-24 text-center">
      <AlertCircle className="w-12 h-12 mx-auto text-signal-sell mb-6" />
      <h1 className="text-2xl font-serif text-ink-primary mb-2">
        <span className="font-mono">{ticker}</span> 报告生成失败
      </h1>
      <p className="text-sm text-ink-tertiary mb-8 max-w-md mx-auto">{message}</p>
      <div className="flex justify-center gap-3">
        <button onClick={onRetry} className="btn-primary">
          <RefreshCw className="w-4 h-4" /> 重试
        </button>
        <Link href="/" className="btn-secondary">返回首页</Link>
      </div>
      <p className="mt-8 text-xs text-ink-tertiary">
        当前仅支持 A 股 6 位代码（如 600519 / 300750）。港股 / 美股 / 加密即将推出。
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SAFETY: stale-price banner — shows above EVERYTHING when the backend
// detected the cached/adapter price disagrees with real-time multi-source
// quote by >15%. Forces user to click "重新生成" before trusting numbers.
// ─────────────────────────────────────────────────────────────────────────

function StalePriceBanner({ data, onRegenerate }: { data: ReportData; onRegenerate?: () => void }) {
  if (!data.stale_price) return null;
  const diff = data.stale_price_diff_pct ?? 0;
  const live = data.live_price;
  return (
    <div className="mb-6 border-2 border-signal-sell bg-signal-sell_soft p-4 rounded-lg print:hidden">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-6 h-6 text-signal-sell flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-bold text-signal-sell mb-1">
            ⚠️ 行情数据陈旧 · 本报告中的价格 / 入场点 / 止盈止损 不可信
          </div>
          <div className="text-xs text-ink-secondary leading-relaxed">
            后端 adapter 报价与雪球/东方财富多源实时报价相差 <b>{diff}%</b>
            {typeof live === "number" && <> （实时约 ¥{live.toFixed(2)}）</>}。
            这通常是数据源缓存陈旧导致的。系统已自动把建议改为 HOLD 并隐藏所有具体交易价位 —
            请点「重新生成」获取最新数据，或刷新本页面。
            <b className="text-signal-sell"> 切勿据此报告下单。</b>
          </div>
          {onRegenerate && (
            <button onClick={onRegenerate} className="mt-3 btn-primary text-xs py-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> 立即重新生成
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Top bar — breadcrumb + export actions
// ─────────────────────────────────────────────────────────────────────────

function ReportTopBar({ data, onRegenerate }: { data: ReportData; onRegenerate?: () => void }) {
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  function copyShareLink() {
    if (shareUrl) navigator.clipboard?.writeText(shareUrl);
  }
  function downloadPdf() {
    if (typeof window !== "undefined") window.print();
  }

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap mb-6 print:hidden">
      <div className="flex items-center gap-1 text-xs text-ink-tertiary">
        <Link href="/" className="hover:text-ink-secondary">首页</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/research" className="hover:text-ink-secondary">学术研究</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-ink-secondary">投研报告</span>
        <ChevronRight className="w-3 h-3" />
        <span className="text-ink-primary font-mono">{data.ticker}</span>
      </div>
      <div className="flex items-center gap-2">
        {onRegenerate && (
          <button onClick={onRegenerate} className="btn-secondary text-xs py-1.5" title="重新生成 (绕过缓存)">
            <RefreshCw className="w-3.5 h-3.5" /> 重新生成
          </button>
        )}
        <button onClick={copyShareLink} className="btn-secondary text-xs py-1.5">
          <Share2 className="w-3.5 h-3.5" /> 复制链接
        </button>
        <button onClick={downloadPdf} className="btn-secondary text-xs py-1.5">
          <Download className="w-3.5 h-3.5" /> 导出 PDF
        </button>
        <Link href={`/decision?ticker=${data.ticker}`} className="btn-primary text-xs py-1.5">
          <Sparkles className="w-3.5 h-3.5" /> 跑 7-agent 决策
        </Link>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Report header — title + asof + core view + confidence bar
// ─────────────────────────────────────────────────────────────────────────

function ReportHeader({ data }: { data: ReportData }) {
  const conf = data.decision_confidence;
  const confColor =
    data.confidence_level === "高" ? "bg-signal-buy" :
    data.confidence_level === "中" ? "bg-gold"       :
                                      "bg-signal-warn";
  const marketBadge =
    data.market === "A-share"  ? { label: "A 股",      color: "bg-signal-sell_soft text-signal-sell" } :
    data.market === "US"       ? { label: "美股",      color: "bg-signal-buy_soft text-signal-buy"   } :
    data.market === "HK"       ? { label: "港股",      color: "bg-accent/10 text-accent"             } :
                                  { label: "加密币",   color: "bg-gold/10 text-gold"                 };

  return (
    <div className="border-b border-border-subtle pb-6 mb-8">
      <div className="flex items-baseline gap-3 flex-wrap mb-3">
        <span className={cn("px-2 py-0.5 rounded text-2xs font-mono", marketBadge.color)}>
          {marketBadge.label} · {data.exchange}
        </span>
        <span className="text-2xs text-ink-tertiary font-mono">报告日期 {data.asof}</span>
      </div>
      <h1 className="display text-display-md md:text-display-lg leading-[1.05] tracking-tighter text-ink-primary">
        {data.name} <span className="font-mono text-ink-secondary text-3xl">({data.ticker})</span>
      </h1>
      <p className="display text-2xl md:text-3xl text-ink-secondary mt-2 leading-snug">
        投资分析报告 · Investment Research Report
      </p>
      <div className="mt-6 max-w-4xl">
        <div className="kicker mb-2">核心观点 · Core View</div>
        <p className="text-base text-ink-primary leading-relaxed">{data.core_view}</p>
      </div>
      <div className="mt-6 max-w-md">
        <div className="flex items-baseline justify-between mb-2">
          <span className="kicker">决策置信度</span>
          <span className="font-mono text-ink-primary">
            {(conf * 100).toFixed(1)}% · {data.confidence_level}
          </span>
        </div>
        <div className="h-3 bg-bg-hover rounded relative overflow-hidden">
          <div className={cn("h-full", confColor)} style={{ width: `${conf * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Extension strip — TradingAgents 4 exclusive features banner
// ─────────────────────────────────────────────────────────────────────────

function ExtensionStrip({ data }: { data: ReportData }) {
  return (
    <div className="surface-elev p-4 mb-8 border-l-4 border-l-accent">
      <div className="kicker text-2xs mb-2 flex items-center gap-1.5">
        <Sparkles className="w-3 h-3 text-accent" />
        TradingAgents 独家扩展 · 比 StockAlpha 多 4 项
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <Link href="#bus-audit" className="hover:text-accent transition-colors">
          <div className="flex items-center gap-1.5 font-medium text-ink-primary">
            <Database className="w-3.5 h-3.5 text-accent" />
            总线遥测审计
          </div>
          <div className="text-2xs text-ink-tertiary mt-1">{data.bus_telemetry.length} 次 bus.fetch 全可见</div>
        </Link>
        <Link href="#calibration" className="hover:text-accent transition-colors">
          <div className="flex items-center gap-1.5 font-medium text-ink-primary">
            <ShieldCheck className="w-3.5 h-3.5 text-accent" />
            校准置信度
          </div>
          <div className="text-2xs text-ink-tertiary mt-1">
            {(data.calibration_context.asserted_confidence * 100).toFixed(0)}% → 历史命中 {(data.calibration_context.historical_hit_rate_at_band * 100).toFixed(1)}%
          </div>
        </Link>
        <Link href={`/decision?ticker=${data.ticker}`} className="hover:text-accent transition-colors">
          <div className="flex items-center gap-1.5 font-medium text-ink-primary">
            <Link2 className="w-3.5 h-3.5 text-accent" />
            可追溯到 7-agent
          </div>
          <div className="text-2xs text-ink-tertiary mt-1">完整 LLM 调用追溯</div>
        </Link>
        <div>
          <div className="flex items-center gap-1.5 font-medium text-ink-primary">
            <Network className="w-3.5 h-3.5 text-accent" />
            跨市场覆盖
          </div>
          <div className="text-2xs text-ink-tertiary mt-1">同 pipeline · 美 / A / 加密</div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Section divider — major roman-numeral section header
// ─────────────────────────────────────────────────────────────────────────

function SectionDivider({ num, title }: { num: string; title: string }) {
  return (
    <h2 className="display text-3xl md:text-4xl tracking-tighter text-ink-primary mt-12 mb-6 flex items-baseline gap-3 border-b border-border-subtle pb-3">
      <span className="text-gold">{num}.</span>
      <span>{title}</span>
    </h2>
  );
}

function Sub({ num, title }: { num: string; title: string }) {
  return (
    <h3 className="text-xl font-semibold text-ink-primary mt-8 mb-4 flex items-baseline gap-2">
      <span className="text-accent">{num}</span>
      <span>{title}</span>
    </h3>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// §1 Investment Summary
// ─────────────────────────────────────────────────────────────────────────

function InvestmentSummary({ data }: { data: ReportData }) {
  const s = data.summary;
  const ratingColor =
    s.rating === "BUY"  ? "bg-signal-buy_soft text-signal-buy border-signal-buy/30" :
    s.rating === "SELL" ? "bg-signal-sell_soft text-signal-sell border-signal-sell/30" :
                          "bg-bg-hover text-ink-secondary border-border";

  const fmt = (v: number | undefined | null, d = 2) => (typeof v === "number" ? v.toFixed(d) : "—");
  const rows: [string, React.ReactNode][] = [
    ["投资评级",   <span key="r" className={cn("px-2.5 py-1 rounded text-sm font-bold font-mono border", ratingColor)}>{s.rating} · {s.rating_label_zh}</span>],
    ["当前股价",   <span key="p" className="font-mono text-ink-primary">{s.currency === "CNY" ? "¥" : "$"}{fmt(s.current_price)}</span>],
    ["目标价位",   <span key="t" className="font-mono text-ink-primary">¥{fmt(s.target_price_low)} - ¥{fmt(s.target_price_high)}</span>],
    ["预期空间",   <span key="e" className="font-mono text-ink-primary">{s.expected_return_sign}{fmt(s.expected_return_pct, 0)}%</span>],
    ["建议持有周期", <span key="h" className="font-mono text-ink-primary">{s.holding_period}</span>],
  ];

  return (
    <section className="surface-elev p-6">
      <div className="grid md:grid-cols-2 gap-x-8 gap-y-3">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[8rem_1fr] items-center py-2 border-b border-border-subtle last:border-0">
            <span className="text-xs text-ink-tertiary">{k}</span>
            <span className="text-sm">{v}</span>
          </div>
        ))}
      </div>
      <div className="mt-6 grid md:grid-cols-2 gap-4">
        <div className="surface p-4 border-l-4 border-l-signal-buy">
          <div className="kicker mb-2 text-2xs">看涨理由 · Bull One-liner</div>
          <p className="text-sm text-ink-primary leading-relaxed">{s.bull_oneliner}</p>
        </div>
        <div className="surface p-4 border-l-4 border-l-signal-sell">
          <div className="kicker mb-2 text-2xs">主要风险 · Bear One-liner</div>
          <p className="text-sm text-ink-primary leading-relaxed">{s.bear_oneliner}</p>
        </div>
      </div>
      <div className="mt-6">
        <div className="kicker mb-2">操作建议</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <KV k="适合投资者" v={s.investor_type} />
          <KV k="仓位建议" v={s.position_size_range} />
          <KV k="入场时机" v={s.entry_timing} />
          <KV k="关键观测" v={s.key_observations.join(" · ")} />
        </div>
      </div>
    </section>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="surface p-3">
      <div className="text-2xs text-ink-tertiary uppercase tracking-wider">{k}</div>
      <div className="text-sm text-ink-primary mt-1">{v}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// §2.1 Qualitative — three frameworks
// ─────────────────────────────────────────────────────────────────────────

function QualitativeAnalysis({ data }: { data: ReportData }) {
  const q = data.qualitative;
  return (
    <>
      <Sub num="2.1" title="定性理解：这是一门什么样的生意？" />
      <div className="surface-elev p-6 space-y-6">
        <div>
          <div className="kicker mb-2">研究背景</div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge>研究主题: {q.research_topic}</Badge>
            <Badge>核心研究问题: {q.core_question}</Badge>
            <Badge>研究背景: {q.research_background}</Badge>
          </div>
        </div>
        <div>
          <div className="kicker mb-2">开篇核心结论</div>
          <p className="text-ink-primary leading-relaxed border-l-4 border-l-gold pl-4 italic">
            {q.opening_conclusion}
          </p>
        </div>

        {/* Framework 1 */}
        <FrameworkCard num="框架 1" title={q.framework_1_three_step_valuation.title}>
          <StepBlock num="步骤 1" title={q.framework_1_three_step_valuation.step_1_comparison.title}>
            {q.framework_1_three_step_valuation.step_1_comparison.items.map((it) => (
              <BulletItem key={it.label} label={it.label} body={it.body} />
            ))}
          </StepBlock>
          <StepBlock num="步骤 2" title={q.framework_1_three_step_valuation.step_2_attribution.title}>
            <div className="mb-3">
              <div className="text-2xs text-ink-tertiary mb-1.5">市场在担心什么？</div>
              {q.framework_1_three_step_valuation.step_2_attribution.market_concerns.map((it) => (
                <BulletItem key={it.label} label={it.label} body={it.body} sub />
              ))}
            </div>
            <div className="text-xs text-ink-primary mb-3 border-l-2 border-l-accent/40 pl-3">
              <span className="font-semibold">担忧是否合理？</span> {q.framework_1_three_step_valuation.step_2_attribution.are_concerns_reasonable}
            </div>
            <div className="text-2xs text-ink-tertiary mb-1.5">哪些因素可能改变这些担忧？</div>
            {q.framework_1_three_step_valuation.step_2_attribution.catalysts_to_change_concerns.map((it) => (
              <BulletItem key={it.label} label={it.label} body={it.body} sub />
            ))}
          </StepBlock>
          <StepBlock num="步骤 3" title={q.framework_1_three_step_valuation.step_3_scenarios.title}>
            <div className="grid md:grid-cols-3 gap-3">
              {q.framework_1_three_step_valuation.step_3_scenarios.scenarios.map((sc, i) => (
                <div key={sc.label} className={cn(
                  "surface p-3 border-l-4",
                  i === 0 ? "border-l-signal-sell" : i === 1 ? "border-l-ink-tertiary" : "border-l-signal-buy"
                )}>
                  <div className="text-sm font-semibold text-ink-primary">{sc.label}</div>
                  <div className="text-2xs text-ink-tertiary mt-0.5">{sc.assumption}</div>
                  <div className="font-mono text-2xl text-ink-primary tabular-nums mt-2">¥{typeof sc.fair_value === "number" ? sc.fair_value.toFixed(2) : "—"}</div>
                  <p className="text-2xs text-ink-secondary leading-relaxed mt-2">{sc.body}</p>
                </div>
              ))}
            </div>
            <div className="text-sm text-ink-primary mt-4 border-l-4 border-l-gold pl-3 italic">
              <span className="font-semibold">结论：</span>{q.framework_1_three_step_valuation.step_3_scenarios.conclusion}
            </div>
          </StepBlock>
        </FrameworkCard>

        {/* Framework 2 */}
        <FrameworkCard num="框架 2" title={q.framework_2_dupont.title}>
          <div className="text-sm mb-3">
            <span className="text-ink-tertiary">分解 ROE = </span>
            <span className="font-mono text-signal-sell font-semibold">
              {q.framework_2_dupont.roe != null ? `${q.framework_2_dupont.roe.toFixed(2)}%` : "数据待补充"}
            </span>
            <span className="text-ink-tertiary"> 变化来源：</span>
          </div>
          <div className="space-y-2">
            {q.framework_2_dupont.decomposition.map((d) => (
              <div key={d.name} className="grid grid-cols-[8rem_5rem_1fr] gap-3 items-baseline text-xs">
                <span className="font-medium text-ink-primary">· {d.name}</span>
                <span className="font-mono tabular-nums text-signal-sell">
                  {d.value !== null ? `${d.value}${d.unit.startsWith("(") ? " " : ""}${d.unit}` : "数据缺失"}
                </span>
                <span className="text-ink-secondary leading-relaxed">{d.note}</span>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <div className="kicker text-2xs mb-2">判断变化性质</div>
            {q.framework_2_dupont.nature_of_change.map((it) => (
              <BulletItem key={it.label} label={it.label} body={it.body} sub />
            ))}
          </div>
          <div className="mt-4 surface p-3 border-l-4 border-l-accent">
            <div className="text-2xs text-ink-tertiary uppercase mb-1">下季度核心观察指标</div>
            <div className="text-sm font-semibold text-ink-primary">{q.framework_2_dupont.key_observation_indicator}</div>
            <div className="text-xs text-ink-secondary mt-2 leading-relaxed">{q.framework_2_dupont.change_signal}</div>
          </div>
        </FrameworkCard>

        {/* Framework 3 */}
        <FrameworkCard num="框架 3" title={q.framework_3_logic_chain.title}>
          <div className="kicker text-2xs mb-3">当前核心投资逻辑链</div>
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            {q.framework_3_logic_chain.chain.map((link, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                <span className="text-xs px-2 py-1 rounded bg-bg-hover text-ink-primary border border-border-subtle">「{link}」</span>
                {i < q.framework_3_logic_chain.chain.length - 1 && <span className="text-accent">→</span>}
              </span>
            ))}
          </div>
          <div className="surface p-3 border-l-4 border-l-signal-warn">
            <div className="text-2xs text-ink-tertiary uppercase mb-1">链条中最脆弱的环节</div>
            <div className="text-sm font-semibold text-ink-primary">「{q.framework_3_logic_chain.weakest_link.link}」</div>
            <ul className="text-xs text-ink-secondary mt-2 space-y-1 list-disc list-inside leading-relaxed">
              {q.framework_3_logic_chain.weakest_link.fragility.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          </div>
          <div className="mt-4 grid md:grid-cols-3 gap-3 text-xs">
            <SignalCard label="先行指标 · Leading" body={q.framework_3_logic_chain.validation_signals.leading} />
            <SignalCard label="同步指标 · Coincident" body={q.framework_3_logic_chain.validation_signals.coincident} />
            <SignalCard label="滞后但确凿指标 · Lagging" body={q.framework_3_logic_chain.validation_signals.lagging} />
          </div>
        </FrameworkCard>

        {/* Six core questions */}
        <div>
          <div className="kicker mb-3">如何回答投资指挥官的问题</div>
          <div className="space-y-2">
            {q.six_questions.map((qa, i) => (
              <details key={i} className="surface p-3 group" open={i < 2}>
                <summary className="cursor-pointer text-sm font-medium text-ink-primary flex items-center gap-2">
                  <span className="font-mono text-accent">{i + 1}.</span>
                  <span>{qa.q}</span>
                </summary>
                <p className="text-xs text-ink-secondary mt-2 ml-6 leading-relaxed">{qa.a}</p>
              </details>
            ))}
          </div>
        </div>

        {/* Validation window */}
        <div className="surface p-4 border-l-4 border-l-accent">
          <div className="kicker text-2xs mb-2">关键验证信号与时间窗口</div>
          <div className="grid sm:grid-cols-3 gap-3 text-xs">
            <div>
              <div className="text-ink-tertiary mb-1">验证信号</div>
              <div className="text-ink-primary leading-relaxed">{q.validation_signals_and_window.validation}</div>
            </div>
            <div>
              <div className="text-ink-tertiary mb-1">时间窗口</div>
              <div className="text-ink-primary leading-relaxed font-mono">{q.validation_signals_and_window.time_window}</div>
            </div>
            <div>
              <div className="text-ink-tertiary mb-1">失效条件</div>
              <div className="text-signal-sell leading-relaxed">{q.validation_signals_and_window.falsification}</div>
            </div>
          </div>
        </div>

        <div className="surface p-3 border-l-4 border-l-gold text-xs">
          <div className="kicker text-2xs mb-1">震荡市操作建议</div>
          <p className="text-ink-primary leading-relaxed">{q.actionable.operating_advice}</p>
        </div>
      </div>
    </>
  );
}

function FrameworkCard({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <div className="surface p-4 border-l-4 border-l-accent">
      <div className="text-xs font-semibold text-accent mb-2">{num} · {title}</div>
      <div className="space-y-4 text-sm text-ink-primary">{children}</div>
    </div>
  );
}

function StepBlock({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-semibold text-ink-primary text-sm mb-2">{num}：{title}</div>
      <div className="space-y-2 ml-1">{children}</div>
    </div>
  );
}

function BulletItem({ label, body, sub }: { label: string; body: string; sub?: boolean }) {
  return (
    <div className={cn("text-xs leading-relaxed", sub ? "ml-3" : "")}>
      <span className="font-semibold text-ink-primary">· {label}：</span>
      <span className="text-ink-secondary">{body}</span>
    </div>
  );
}

function SignalCard({ label, body }: { label: string; body: string }) {
  return (
    <div className="surface p-3">
      <div className="text-2xs text-ink-tertiary uppercase tracking-wider mb-1">{label}</div>
      <div className="text-xs text-ink-secondary leading-relaxed">{body}</div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-1 rounded bg-bg-hover text-2xs font-mono text-ink-secondary">{children}</span>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// §2.2 Quantitative Verification
// ─────────────────────────────────────────────────────────────────────────

function QuantitativeVerification({ data }: { data: ReportData }) {
  const q = data.quantitative;
  return (
    <>
      <Sub num="2.2" title='定量验证：生意的健康度如何？' />
      <div className="surface-elev p-6 space-y-4">
        <p className="text-xs text-ink-tertiary leading-relaxed">导读：现在，让我们用财务数据来验证上面的判断。</p>

        <QuantBlock badge="①" title={q.growth.title} body={q.growth.body} placeholder={q.growth.data_status} />
        <QuantBlock badge="②" title={q.profitability.title} body={q.profitability.body} placeholder={q.profitability.data_status} />
        <QuantBlock badge="③" title={q.cash_health.title} body={q.cash_health.body} placeholder={q.cash_health.data_status} />

        <div>
          <div className="text-sm font-semibold text-ink-primary mb-2">④ 股东回报验证：企业对股东慷慨吗？</div>
          <p className="text-xs text-ink-secondary leading-relaxed mb-3">解读：{q.shareholder_return.body}</p>
          <table className="w-full text-xs">
            <thead><tr className="border-b border-border-subtle">
              <th className="py-2 text-left text-ink-tertiary font-medium">财年</th>
              <th className="py-2 text-left text-ink-tertiary font-medium">分红比例</th>
              <th className="py-2 text-left text-ink-tertiary font-medium">股息率</th>
            </tr></thead>
            <tbody>
              {q.shareholder_return.rows.map((r) => (
                <tr key={r.year} className="border-b border-border-subtle last:border-0">
                  <td className="py-2 font-mono text-ink-primary">{r.year}</td>
                  <td className="py-2 text-ink-secondary">{r.dividend_ratio}</td>
                  <td className="py-2 font-mono text-ink-secondary">{r.dividend_yield}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-border-subtle pt-3 text-xs">
          <span className="text-signal-buy font-semibold">✓ 本层小结：</span>
          <span className="text-ink-secondary">{q.summary}</span>
        </div>
      </div>
    </>
  );
}

function QuantBlock({ badge, title, body, placeholder }: { badge: string; title: string; body: string; placeholder: string }) {
  return (
    <div>
      <div className="text-sm font-semibold text-ink-primary mb-1">{badge} {title}</div>
      <p className="text-xs text-ink-secondary leading-relaxed">解读：{body}</p>
      <div className="text-2xs text-ink-tertiary italic mt-2 font-mono">[{placeholder}]</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// §2.3 Professional Valuation
// ─────────────────────────────────────────────────────────────────────────

function ProfessionalValuation({ data }: { data: ReportData }) {
  const v = data.valuation;
  return (
    <>
      <Sub num="2.3" title='专业估值：现在股价是"贵"还是"便宜"？' />
      <div className="surface-elev p-6 space-y-4">
        <p className="text-xs text-ink-tertiary leading-relaxed">导读：理解了生意的质地，我们最后来评估它的价格。</p>
        <table className="w-full text-xs">
          <thead><tr className="border-b border-border-subtle">
            <th className="py-2 px-2 text-left text-ink-tertiary font-medium">估值指标</th>
            <th className="py-2 px-2 text-left text-ink-tertiary font-medium">当前值</th>
            <th className="py-2 px-2 text-left text-ink-tertiary font-medium">历史中位数</th>
            <th className="py-2 px-2 text-left text-ink-tertiary font-medium">行业平均</th>
            <th className="py-2 px-2 text-left text-ink-tertiary font-medium">评估</th>
          </tr></thead>
          <tbody>
            {v.rows.map((r) => (
              <tr key={r.metric} className="border-b border-border-subtle last:border-0">
                <td className="py-2 px-2 font-medium text-ink-primary">{r.metric}</td>
                <td className="py-2 px-2 font-mono text-ink-primary">{r.current}</td>
                <td className="py-2 px-2 font-mono text-ink-tertiary">{r.historical_median}</td>
                <td className="py-2 px-2 font-mono text-ink-tertiary">{r.industry_average}</td>
                <td className="py-2 px-2 text-ink-secondary">{r.assessment}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-sm text-ink-secondary leading-relaxed">
          <span className="font-semibold text-ink-primary">相对估值结论：</span>{v.relative_conclusion}
        </p>
        <div>
          <div className="kicker mb-3">（情景分析）合理价值区间</div>
          <div className="grid md:grid-cols-3 gap-3">
            {v.fair_value_ranges.map((s, i) => (
              <div key={s.scenario} className={cn(
                "surface p-4 border-l-4",
                i === 0 ? "border-l-signal-sell" : i === 1 ? "border-l-ink-tertiary" : "border-l-signal-buy"
              )}>
                <div className="text-sm font-semibold text-ink-primary">{s.scenario}</div>
                <div className="text-2xs text-ink-tertiary mt-0.5 leading-relaxed">{s.assumption}</div>
                <div className="font-mono text-3xl text-ink-primary tabular-nums mt-3">¥{typeof s.fair_value_cny === "number" ? s.fair_value_cny.toFixed(2) : "—"}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="surface p-3 border-l-4 border-l-gold">
          <div className="text-xs text-signal-buy font-semibold mb-1">✓ 最终估值结论</div>
          <p className="text-xs text-ink-primary leading-relaxed">{v.final_conclusion}</p>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// §3.1 Money Flow + Sentiment
// ─────────────────────────────────────────────────────────────────────────

function MoneyFlowSentiment({ data }: { data: ReportData }) {
  const m = data.market_sentiment;
  return (
    <>
      <Sub num="3.1" title="资金流向与市场情绪" />
      <div className="surface-elev p-6 space-y-3 text-xs">
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="surface p-3">
            <div className="kicker text-2xs mb-1">资金面</div>
            <div className="font-medium text-ink-primary">{m.capital_flow_status}</div>
            <div className="text-2xs text-ink-secondary mt-1 leading-relaxed">{m.capital_flow_note}</div>
          </div>
          <div className="surface p-3">
            <div className="kicker text-2xs mb-1">情绪面</div>
            <div className="font-medium text-ink-primary">{m.sentiment_zone}</div>
            <div className="text-2xs text-ink-secondary mt-1 leading-relaxed">{m.sentiment_note}</div>
          </div>
          <div className="surface p-3">
            <div className="kicker text-2xs mb-1">板块效应</div>
            <div className="font-medium text-ink-primary">{m.sector_effect}</div>
            <div className="text-2xs text-ink-secondary mt-1 leading-relaxed">{m.sector_note}</div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// §3.2 Technical Analysis
// ─────────────────────────────────────────────────────────────────────────

function TechnicalAnalysis({ data }: { data: ReportData }) {
  const t = data.technical;
  return (
    <>
      <Sub num="3.2" title="技术形态与关键价位" />
      <div className="surface-elev p-6 space-y-6">
        <div>
          <div className="kicker mb-2">开篇核心结论</div>
          <p className="text-sm text-ink-primary leading-relaxed border-l-4 border-l-gold pl-4 italic">
            {t.opening_conclusion}
          </p>
        </div>

        <FrameworkCard num="框架 1" title={t.framework_1_trend.title}>
          <div className="text-sm">
            <div className="font-semibold text-ink-primary">· 层次 1：{t.framework_1_trend.layer_1_macro.title}</div>
            <div className="text-2xs text-ink-tertiary font-mono mt-1">ADX = {t.framework_1_trend.layer_1_macro.adx}</div>
            <p className="text-xs text-ink-secondary mt-1 leading-relaxed">{t.framework_1_trend.layer_1_macro.body}</p>
          </div>
          <div className="text-sm">
            <div className="font-semibold text-ink-primary">· 层次 2：{t.framework_1_trend.layer_2_logic.title}</div>
            <p className="text-xs text-ink-secondary mt-1 leading-relaxed">{t.framework_1_trend.layer_2_logic.why_oscillating}</p>
          </div>
          <div className="text-sm">
            <div className="font-semibold text-ink-primary">· 层次 3：{t.framework_1_trend.layer_3_signal.title}</div>
            <p className="text-xs text-ink-secondary mt-1 leading-relaxed">{t.framework_1_trend.layer_3_signal.breakout_signals}</p>
            <p className="text-xs text-ink-secondary mt-1 leading-relaxed">{t.framework_1_trend.layer_3_signal.reversal_signals}</p>
          </div>
        </FrameworkCard>

        <FrameworkCard num="框架 2" title={t.framework_2_momentum.title}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {t.framework_2_momentum.indicators.map((ind) => (
              <div key={ind.name} className="surface p-2">
                <div className="text-2xs text-ink-tertiary">{ind.name}</div>
                <div className="font-mono text-base text-ink-primary tabular-nums mt-0.5">
                  {ind.value !== null ? ind.value : "—"}
                </div>
                <div className="text-2xs text-ink-secondary mt-1">{ind.note}</div>
              </div>
            ))}
          </div>
          <div className="text-xs">
            <div className="font-semibold text-ink-primary mb-1">动能归因分析</div>
            <p className="text-ink-secondary leading-relaxed mb-2">
              <span className="font-semibold">· 驱动力：</span>{t.framework_2_momentum.dynamic_interpretation.driver}
            </p>
            <p className="text-ink-secondary leading-relaxed">
              <span className="font-semibold">· 可持续性：</span>{t.framework_2_momentum.dynamic_interpretation.sustainability}
            </p>
          </div>
        </FrameworkCard>

        <FrameworkCard num="框架 3" title={t.framework_3_key_levels.title}>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="surface p-3 border-l-4 border-l-signal-sell">
              <div className="text-2xs text-ink-tertiary uppercase mb-1">最重要压力位</div>
              <div className="text-sm font-semibold text-ink-primary">{t.framework_3_key_levels.pressure.level}</div>
              <p className="text-xs text-ink-secondary mt-2 leading-relaxed">{t.framework_3_key_levels.pressure.body}</p>
            </div>
            <div className="surface p-3 border-l-4 border-l-signal-buy">
              <div className="text-2xs text-ink-tertiary uppercase mb-1">最重要支撑位</div>
              <div className="text-sm font-semibold text-ink-primary">{t.framework_3_key_levels.support.level}</div>
              <p className="text-xs text-ink-secondary mt-2 leading-relaxed">{t.framework_3_key_levels.support.body}</p>
            </div>
          </div>
          <div className="space-y-2 text-xs">
            <div className="text-ink-primary"><span className="font-semibold">· 向上突破：</span>{t.framework_3_key_levels.breakout_logic.up}</div>
            <div className="text-ink-primary"><span className="font-semibold">· 向下跌破：</span>{t.framework_3_key_levels.breakout_logic.down}</div>
            <div className="text-ink-primary"><span className="font-semibold">· 如何判断真假突破？</span>{t.framework_3_key_levels.breakout_logic.false_breakout}</div>
          </div>
        </FrameworkCard>

        <div>
          <div className="kicker mb-2">对核心问题的回答</div>
          <div className="space-y-2">
            {t.answers_to_questions.map((qa, i) => (
              <details key={i} className="surface p-3 text-xs" open>
                <summary className="cursor-pointer font-medium text-ink-primary">{i + 1}. {qa.q}</summary>
                <p className="text-ink-secondary mt-2 leading-relaxed">{qa.a}</p>
              </details>
            ))}
          </div>
        </div>

        <div>
          <div className="kicker mb-2">对情境问题的回答</div>
          <div className="space-y-2">
            {t.answers_to_situational.map((qa, i) => (
              <BulletItem key={i} label={qa.q} body={qa.a} />
            ))}
          </div>
        </div>

        <div className="surface p-4 border-l-4 border-l-accent">
          <div className="kicker text-2xs mb-2">关键验证信号与失效条件</div>
          <div className="space-y-2 text-xs">
            {t.validation_and_falsification.map((it) => (
              <BulletItem key={it.label} label={it.label} body={it.body} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// §4.1 Bull vs Bear Debate
// ─────────────────────────────────────────────────────────────────────────

function BullBearDebate({ data }: { data: ReportData }) {
  return (
    <>
      <Sub num="4.1" title="核心分歧点总结" />
      <div className="surface-elev p-6">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="surface p-4 border-l-4 border-l-signal-buy">
            <div className="kicker text-2xs mb-2 flex items-center gap-1.5 text-signal-buy">
              <TrendingUp className="w-3 h-3" /> 看涨观点 · Bull Case
            </div>
            <ul className="space-y-2 text-xs text-ink-primary list-decimal list-inside leading-relaxed">
              {data.debate.bull_case.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          </div>
          <div className="surface p-4 border-l-4 border-l-signal-sell">
            <div className="kicker text-2xs mb-2 flex items-center gap-1.5 text-signal-sell">
              <TrendingDown className="w-3 h-3" /> 看跌观点 · Bear Case
            </div>
            <ul className="space-y-2 text-xs text-ink-primary list-decimal list-inside leading-relaxed">
              {data.debate.bear_case.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          </div>
        </div>
        <div className="mt-4 surface p-3 border-l-4 border-l-gold text-sm">
          <span className="font-semibold text-ink-primary">我们的判断：</span>
          <span className="text-ink-secondary"> {data.debate.our_judgment}</span>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// §4.2 Risk Disclosure
// ─────────────────────────────────────────────────────────────────────────

function RiskDisclosure({ data }: { data: ReportData }) {
  return (
    <>
      <Sub num="4.2" title="主要风险提示" />
      <div className="surface-elev p-6">
        <ol className="space-y-2 text-xs list-decimal list-inside text-ink-primary leading-relaxed">
          {data.risks.map((r, i) => (
            <li key={i}>
              <span className="font-semibold">{r.label}：</span>
              <span className="text-ink-secondary">{r.body}</span>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// §5.1 Operation Plan
// ─────────────────────────────────────────────────────────────────────────

function OperationPlan({ data }: { data: ReportData }) {
  const p = data.operation_plan;
  return (
    <>
      <Sub num="5.1" title="具体操作建议" />
      <div className="surface-elev p-6 space-y-3 text-sm">
        <KVRow k="建议操作" v={p.action} />
        <KVRow k="配置建议" v={p.portfolio_advice} />
        <KVRow k="仓位管理" v={p.position_management} />
        <KVRow k="关键信息" v={p.key_info} />
        <div className="border-t border-border-subtle pt-3 mt-3">
          <div className="text-2xs uppercase tracking-wider text-ink-tertiary mb-1">【交易决策】</div>
          <div className="text-ink-primary">{p.trade_decision}</div>
        </div>
      </div>
    </>
  );
}

function KVRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-3 text-sm">
      <span className="text-ink-tertiary">· {k}：</span>
      <span className="text-ink-primary leading-relaxed">{v}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// §5.2 Follow-up Checklist
// ─────────────────────────────────────────────────────────────────────────

function FollowUpChecklist({ data }: { data: ReportData }) {
  return (
    <>
      <Sub num="5.2" title="后续跟踪清单" />
      <div className="surface-elev p-0 overflow-hidden">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-border-subtle bg-bg-hover/30">
            <th className="py-2 px-3 text-left text-ink-tertiary font-medium">跟踪事项</th>
            <th className="py-2 px-3 text-left text-ink-tertiary font-medium">关键指标 / 事件</th>
            <th className="py-2 px-3 text-left text-ink-tertiary font-medium">预期时间</th>
            <th className="py-2 px-3 text-left text-ink-tertiary font-medium">对逻辑的影响</th>
          </tr></thead>
          <tbody>
            {data.follow_up.map((r, i) => (
              <tr key={i} className="border-b border-border-subtle last:border-0">
                <td className="py-2 px-3 font-medium text-ink-primary">{r.item}</td>
                <td className="py-2 px-3 text-ink-secondary">{r.indicator}</td>
                <td className="py-2 px-3 font-mono text-ink-secondary">{r.expected_time}</td>
                <td className="py-2 px-3 text-ink-secondary leading-relaxed">{r.impact}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Appendix · Team Contribution
// ─────────────────────────────────────────────────────────────────────────

function TeamContribution({ data }: { data: ReportData }) {
  return (
    <section className="surface-elev p-6 mt-4">
      <div className="kicker mb-3 flex items-center gap-2">
        <Users className="w-3.5 h-3.5 text-accent" /> 分析团队贡献
      </div>
      <p className="text-xs text-ink-secondary mb-4">本报告由 TradingAgents v3.1 多智能体系统协作完成：</p>
      <div className="grid sm:grid-cols-2 gap-3">
        {data.team.teams.map((t) => (
          <div key={t.name} className="surface p-3">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-sm font-semibold text-ink-primary">{t.name}</span>
              <span className="text-2xs text-ink-tertiary font-mono">{t.agents} agents</span>
            </div>
            <div className="text-xs text-ink-secondary">{t.role}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2 text-xs">
        <KVRow k="系统架构" v={data.team.architecture} />
        <KVRow k="决策机制" v={data.team.decision_mechanism} />
        <KVRow k="问题生成" v={data.team.problem_generation} />
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// TradingAgents Extension 1 — Bus Telemetry Audit
// ─────────────────────────────────────────────────────────────────────────

function BusTelemetryAudit({ data }: { data: ReportData }) {
  return (
    <section id="bus-audit" className="surface-elev p-6 mt-4 border-l-4 border-l-accent">
      <div className="kicker mb-3 flex items-center gap-2">
        <Database className="w-3.5 h-3.5 text-accent" /> 总线遥测审计 · TradingAgents 独家
      </div>
      <p className="text-xs text-ink-secondary mb-4">
        本报告生成时通过 <code className="text-accent">UniversalDataBus</code> 发起的全部 fetch。
        每一行是一次 bus.fetch 调用，含数据源、延迟、缓存命中。StockAlpha 不暴露这一层（黑盒）。
        <Link href="/research#bus-architecture" className="text-gold hover:underline ml-1">看总线 4 法则 ↗</Link>
      </p>
      <div className="overflow-hidden rounded border border-border-subtle">
        <table className="w-full text-xs">
          <thead><tr className="bg-bg-hover/30 border-b border-border-subtle">
            <th className="py-2 px-3 text-left text-ink-tertiary font-medium">#</th>
            <th className="py-2 px-3 text-left text-ink-tertiary font-medium">Need 类型</th>
            <th className="py-2 px-3 text-left text-ink-tertiary font-medium">数据源</th>
            <th className="py-2 px-3 text-left text-ink-tertiary font-medium">状态</th>
            <th className="py-2 px-3 text-right text-ink-tertiary font-medium">延迟</th>
          </tr></thead>
          <tbody>
            {data.bus_telemetry.map((r, i) => (
              <tr key={i} className="border-b border-border-subtle last:border-0">
                <td className="py-2 px-3 font-mono text-ink-tertiary">{String(i + 1).padStart(2, "0")}</td>
                <td className="py-2 px-3 font-mono text-2xs uppercase text-ink-primary">{r.need_kind}</td>
                <td className="py-2 px-3 font-mono text-ink-secondary">{r.source}</td>
                <td className={cn("py-2 px-3 text-2xs",
                  r.cache_hit ? "text-signal-buy" : "text-ink-tertiary"
                )}>
                  {r.cache_hit ? "✓ cache hit" : "→ fetched"}
                </td>
                <td className={cn("py-2 px-3 text-right font-mono tabular-nums",
                  r.latency_ms === 0      ? "text-signal-buy" :
                  r.latency_ms < 100      ? "text-ink-primary" :
                  r.latency_ms < 500      ? "text-ink-secondary" :
                  r.latency_ms < 2000     ? "text-signal-warn"   :
                                            "text-signal-sell"
                )}>
                  {r.latency_ms}ms
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-2xs text-ink-tertiary mt-3 font-mono">
        实时来自 <code className="text-accent">/v1/databus/telemetry</code> · Law 4：每次 bus.fetch 一条记录、含递归内调用
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// TradingAgents Extension 2 — Calibration Context
// ─────────────────────────────────────────────────────────────────────────

function CalibrationContext({ data }: { data: ReportData }) {
  const c = data.calibration_context;
  return (
    <section id="calibration" className="surface-elev p-6 mt-4 border-l-4 border-l-gold">
      <div className="kicker mb-3 flex items-center gap-2">
        <ShieldCheck className="w-3.5 h-3.5 text-gold" /> 校准置信度上下文 · TradingAgents 独家
      </div>
      <p className="text-xs text-ink-secondary mb-4 leading-relaxed">
        本系统宣称的置信度不是空话——基于 <strong>20 票 × 78 周 = 1,560 决策</strong>的回测，
        每个置信度区间对应的实际命中率有统计证据。StockAlpha 没有这一层，散户无法判断「60% 置信度」是否可信。
      </p>
      <div className="grid sm:grid-cols-4 gap-3">
        <Stat n={`${(c.asserted_confidence * 100).toFixed(0)}%`} l="本报告置信度" />
        <Stat n={c.band} l="所属置信度区间" />
        <Stat n={`${(c.historical_hit_rate_at_band * 100).toFixed(1)}%`} l="该区间历史命中率" tone="bull" />
        <Stat n={String(c.sample_size)} l="该区间历史样本数" />
      </div>
      <p className="text-xs text-ink-primary leading-relaxed mt-4 italic">{c.note}</p>
      <Link href="/proof" className="text-xs text-gold hover:underline mt-3 inline-flex items-center gap-1">
        <BookOpen className="w-3 h-3" /> 看完整校准表 ↗
      </Link>
    </section>
  );
}

function Stat({ n, l, tone }: { n: string; l: string; tone?: "bull" }) {
  return (
    <div className="surface p-3">
      <div className={cn(
        "font-mono text-2xl tabular-nums",
        tone === "bull" ? "text-signal-buy" : "text-ink-primary"
      )}>{n}</div>
      <div className="text-2xs text-ink-tertiary mt-1 leading-tight">{l}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// System Disclaimer + Data Sources
// ─────────────────────────────────────────────────────────────────────────

function SystemDisclaimer({ data }: { data: ReportData }) {
  return (
    <section className="surface p-6 mt-4 text-xs text-ink-secondary leading-relaxed space-y-3">
      <div>
        <div className="font-semibold text-ink-primary mb-1">免责声明</div>
        <p>本报告由 TradingAgents 多智能体系统（{data.system_version}）基于公开数据生成，所有结论仅供参考，不构成任何投资建议。</p>
      </div>
      <div>
        <div className="font-semibold text-ink-primary mb-1">系统局限性</div>
        <ul className="list-decimal list-inside space-y-0.5">
          <li>AI 分析可能存在偏差和错误</li>
          <li>历史数据不代表未来表现</li>
          <li>市场环境变化可能影响结论有效性</li>
        </ul>
      </div>
      <div>
        <div className="font-semibold text-ink-primary mb-1">数据来源</div>
        <ul className="list-disc list-inside space-y-0.5">
          {data.team.data_sources.map((s) => <li key={s}>{s}</li>)}
        </ul>
      </div>
      <div className="border-t border-border-subtle pt-3 font-mono text-2xs text-ink-tertiary">
        <div>报告 ID：{data.report_id}</div>
        <div>报告生成时间：{data.generated_at}</div>
        <div>系统版本：{data.system_version}</div>
      </div>
      <div className="text-center font-semibold text-signal-warn pt-2">
        市场有风险，投资需谨慎。
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Empty state — when ticker has no report yet
// ─────────────────────────────────────────────────────────────────────────

function NotYetGenerated({ ticker }: { ticker: string }) {
  return (
    <div className="max-w-3xl mx-auto px-6 py-20 text-center">
      <FileText className="w-12 h-12 text-ink-tertiary mx-auto mb-6" />
      <h1 className="display text-3xl text-ink-primary mb-3">
        <span className="font-mono">{ticker}</span> 暂未生成投研报告
      </h1>
      <p className="text-ink-secondary mb-8 leading-relaxed">
        本模块当前仅 demo <code className="text-accent">600418 江淮汽车</code> 一份完整样例。
        其他 ticker 的报告需要后端接入 <code className="text-accent">/v1/report/full?ticker={ticker}</code> 端点。
        预计 2026 Q1 上线。
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/report/600418" className="btn-primary">
          <FileText className="w-4 h-4" />
          看 600418 江淮汽车样例
        </Link>
        <Link href={`/decision?ticker=${ticker}`} className="btn-secondary">
          <Sparkles className="w-4 h-4" />
          现在跑 7-agent 决策（{ticker}）
        </Link>
      </div>
    </div>
  );
}
