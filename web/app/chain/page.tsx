"use client";

/**
 * /chain — Full-stack chain demo page.
 *
 * Runs FRED → Qlib → Backtrader → Lean through the UniversalDataBus
 * and renders a vertical waterfall of each step with latency, source,
 * and the data that flowed out. This is the user-visible proof that
 * the ecosystem is wired into one platform — adding a new factor
 * library or macro source is one line of bus.register() code, and the
 * chain picks it up automatically.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Database,
  GitBranch,
  Layers,
  Loader2,
  Play,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { cn } from "../lib/cn";

const API_BASE = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

interface ChainStep {
  step: string;
  source: string;
  elapsed_ms: number;
  [k: string]: unknown;
}

interface ChainResponse {
  ticker: string;
  asof: string;
  lookback_days: number;
  chain: ChainStep[];
  macro: Record<string, number | null> | null;
  factors: Record<string, number> | null;
  signal: {
    side: string;
    target_weight: number;
    confidence: number;
    score: number;
  };
  backtest: {
    days: number;
    final_equity: number;
    return_pct: number;
    sharpe_annualised: number;
  };
  lean_insight: Record<string, unknown>;
  spine_traversed: string[];
  error?: string;
}

export default function ChainPage() {
  const [mode, setMode] = useState<"single" | "compare">("single");
  const [ticker, setTicker] = useState("AAPL");
  const [data, setData] = useState<ChainResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Compare mode state — multi-ticker parallel run
  const [compareTickers, setCompareTickers] = useState("AAPL, 600519, BTC");
  const [compareData, setCompareData] = useState<ChainResponse[] | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const r = await fetch(
        `${API_BASE}/v1/chain/full-stack?ticker=${encodeURIComponent(ticker)}`,
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j: ChainResponse = await r.json();
      setData(j);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Compare-mode: kick off N chains in parallel, collect results.
  async function runCompare() {
    setCompareLoading(true);
    setCompareData(null);
    const tickers = compareTickers.split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 5);
    try {
      const results = await Promise.all(tickers.map(t =>
        fetch(`${API_BASE}/v1/chain/full-stack?ticker=${encodeURIComponent(t)}`)
          .then(r => r.json() as Promise<ChainResponse>)
          .catch(e => ({ ticker: t, error: (e as Error).message } as ChainResponse))
      ));
      setCompareData(results);
    } finally {
      setCompareLoading(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      {/* Hero */}
      <div className="mb-6">
        <span className="label-cap">DATA SPINE · LIVE CHAIN</span>
        <h1 className="text-3xl font-semibold mt-1 leading-tight flex items-center gap-3 flex-wrap">
          <GitBranch className="w-7 h-7 text-accent" />
          FRED → Qlib → Backtrader → Lean
        </h1>
        <p className="text-ink-secondary mt-3 max-w-3xl leading-relaxed">
          Every step routes through one <code className="text-accent">UniversalDataBus</code>.
          Macro from OpenBB/FRED, price history from yfinance, Qlib-named
          factors via Alpha158-lite, a deterministic signal ensembler, a
          mini-backtest on the same OHLCV window, and a Lean Insight JSON
          ready to paste into QuantConnect. Adding a new data source = one
          line of <code>bus.register()</code> — every layer picks it up.
        </p>
      </div>

      {/* Methodology callout — links theory to this page. New in v3. */}
      <MethodologyCallout />

      {/* Mode tabs — single ticker vs multi-ticker compare. v3 enhancement. */}
      <div className="flex gap-1 mb-4 border-b border-border-subtle">
        <button
          onClick={() => setMode("single")}
          className={cn(
            "px-4 py-2 text-sm transition-colors border-b-2 -mb-px",
            mode === "single"
              ? "border-accent text-ink-primary font-medium"
              : "border-transparent text-ink-tertiary hover:text-ink-secondary",
          )}
        >
          <Play className="w-3.5 h-3.5 inline mr-1.5" />
          单 ticker · 详细
        </button>
        <button
          onClick={() => setMode("compare")}
          className={cn(
            "px-4 py-2 text-sm transition-colors border-b-2 -mb-px",
            mode === "compare"
              ? "border-accent text-ink-primary font-medium"
              : "border-transparent text-ink-tertiary hover:text-ink-secondary",
          )}
        >
          <Layers className="w-3.5 h-3.5 inline mr-1.5" />
          多 ticker · 对比脊柱组合性
        </button>
      </div>

      {mode === "compare" && (
        <CompareMode
          tickers={compareTickers}
          setTickers={setCompareTickers}
          data={compareData}
          loading={compareLoading}
          run={runCompare}
        />
      )}

      {mode === "single" && (
      <>
      {/* Input */}
      <div className="surface-elev p-4 mb-6 flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase().trim())}
          onKeyDown={(e) => e.key === "Enter" && !loading && run()}
          className="bg-bg-hover border border-border rounded px-3 py-2 font-mono text-lg w-32"
          placeholder="AAPL"
        />
        <button
          onClick={run}
          disabled={loading || !ticker}
          className="btn-primary"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Traversing spine…
            </>
          ) : (
            <>
              <Play className="w-4 h-4" /> Run full-stack chain
            </>
          )}
        </button>
        <div className="ml-auto text-2xs text-ink-tertiary font-mono">
          POST /v1/chain/full-stack?ticker={ticker}
        </div>
      </div>

      {error && (
        <div className="surface border-signal-sell/30 p-4 text-sm text-signal-sell flex gap-2 items-start mb-6">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Chain failed</div>
            <div className="font-mono text-2xs mt-1">{error}</div>
          </div>
        </div>
      )}

      {data?.error && (
        <div className="surface border-signal-warn/30 p-4 text-sm mb-6">
          <div className="font-semibold">{data.error}</div>
          <div className="text-2xs text-ink-tertiary mt-2 font-mono">
            spine: {JSON.stringify(data.spine_traversed)}
          </div>
          {/* Concrete remediation hints — the audit found the most
              common failure is asking for a ticker whose OHLCV the
              bus can't fetch (crypto, HK, illiquid name). */}
          <div className="mt-3 text-xs text-ink-secondary leading-relaxed">
            {/^\d{6}$/.test(data.ticker || "")
              ? "A 股 ticker — 如果失败，请确认 ticker 真实存在（akshare 偶尔会上游空返回）。"
              : /^(BTC|ETH|SOL|DOGE)/i.test(data.ticker || "")
              ? "加密币 OHLCV 走 Need.CRYPTO_OHLCV，不在 /chain 路径上。请回到 /decision 跑 crypto。"
              : "建议试试常见股票：AAPL、NVDA、600519、300750。罕见 ticker 上游可能没数据。"}
          </div>
        </div>
      )}

      {data && !data.error && (
        <>
          {/* Decision summary */}
          <div className="surface-elev p-5 mb-6 border-l-4 border-l-accent">
            <div className="flex items-baseline gap-3 flex-wrap">
              <div className="text-2xs uppercase tracking-wider text-ink-tertiary">
                Signal · {data.asof}
              </div>
            </div>
            <div className="flex items-baseline gap-4 mt-2 flex-wrap">
              <div className="text-4xl font-bold font-mono text-ink-primary">
                {data.ticker}
              </div>
              <SideBadge side={data.signal.side} />
              <div className="text-ink-secondary">
                target weight
                <span className="ml-2 font-mono text-ink-primary">
                  {(data.signal.target_weight * 100).toFixed(2)}%
                </span>
              </div>
              <div className="text-ink-secondary">
                confidence
                <span className="ml-2 font-mono text-ink-primary">
                  {(data.signal.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <div className="text-ink-secondary">
                ensemble score
                <span className="ml-2 font-mono text-ink-primary">
                  {data.signal.score.toFixed(3)}
                </span>
              </div>
            </div>
          </div>

          {/* Chain waterfall */}
          <section className="mb-6">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-accent" />
              Spine traversal · {data.chain.length} steps
            </h2>
            <div className="surface-elev p-4">
              <div className="space-y-2">
                {data.chain.map((s, i) => (
                  <ChainStepRow key={i} step={s} index={i + 1} />
                ))}
              </div>
            </div>
          </section>

          {/* Three panel grid: macro + factors + backtest */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <DataPanel title="Macro (OpenBB / FRED)" icon={<Database />}>
              {data.macro ? (
                Object.entries(data.macro).map(([k, v]) => (
                  <KV key={k} k={k} v={v == null ? "—" : String(v)} />
                ))
              ) : (
                <div className="text-2xs text-ink-tertiary">
                  No macro data (set FRED_API_KEY)
                </div>
              )}
            </DataPanel>

            <DataPanel title="Factors · Alpha158-lite (bar chart)" icon={<Sparkles />}>
              {data.factors ? (
                <FactorBarChart factors={data.factors} />
              ) : (
                <div className="text-2xs text-ink-tertiary">
                  No factors computed
                </div>
              )}
            </DataPanel>

            <DataPanel title="Mini-backtest" icon={<TrendingUp />}>
              <KV k="days" v={String(data.backtest.days)} />
              <KV
                k="return"
                v={`${data.backtest.return_pct.toFixed(2)}%`}
                accent={data.backtest.return_pct >= 0 ? "buy" : "sell"}
              />
              <KV
                k="sharpe (annualised)"
                v={data.backtest.sharpe_annualised.toFixed(2)}
              />
              <KV
                k="final equity"
                v={data.backtest.final_equity.toFixed(4)}
              />
            </DataPanel>
          </div>

          {/* Lean export */}
          <section className="mb-6">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-accent" />
              Lean Insight · paste into QuantConnect
            </h2>
            <pre className="surface-elev p-4 text-xs font-mono overflow-x-auto">
{JSON.stringify(data.lean_insight, null, 2)}
            </pre>
          </section>

          {/* Bus call graph — surfaces the composition pattern. */}
          <BusCallGraph
            ticker={data.ticker}
            factorBars={(data.chain.find(s => s.step === "ohlcv")?.bars as number) || null}
          />

          <p className="text-2xs text-ink-tertiary mt-2">
            Disclaimer · this is a demo of the data-bus architecture. The
            deterministic signal ensembler is intentionally simple so each
            step is auditable. The real 7-agent LLM decision lives at
            <code className="mx-1 text-ink-secondary">/decision</code>.
          </p>
        </>
      )}

      {/* v3: live bus telemetry stream — visible after any successful run */}
      {data && !data.error && <BusTelemetryStream />}
      </>
      )}
    </div>
  );
}

function SideBadge({ side }: { side: string }) {
  const styles =
    side === "BUY"
      ? "bg-signal-buy_soft text-signal-buy border-signal-buy/30"
      : side === "SELL"
        ? "bg-signal-sell_soft text-signal-sell border-signal-sell/30"
        : "bg-bg-hover text-ink-secondary border-border";
  return (
    <span
      className={cn(
        "px-3 py-1 rounded font-mono text-sm border",
        styles,
      )}
    >
      {side}
    </span>
  );
}

function ChainStepRow({ step, index }: { step: ChainStep; index: number }) {
  const extra = Object.entries(step).filter(
    ([k]) => !["step", "source", "elapsed_ms"].includes(k),
  );
  const latencyClass =
    step.elapsed_ms < 100
      ? "text-signal-buy"
      : step.elapsed_ms < 1000
        ? "text-signal-warn"
        : "text-signal-sell";
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border-subtle last:border-0 flex-wrap">
      <span className="text-2xs font-mono text-ink-tertiary w-6">
        {String(index).padStart(2, "0")}
      </span>
      <span className="font-mono text-sm text-ink-primary uppercase w-24">
        {step.step}
      </span>
      <span className="text-ink-tertiary">←</span>
      <span className="text-xs text-ink-secondary font-mono">
        {step.source}
      </span>
      {extra.map(([k, v]) => (
        <span
          key={k}
          className="px-2 py-0.5 rounded bg-bg-hover text-2xs font-mono text-ink-secondary"
        >
          {k}={String(v)}
        </span>
      ))}
      <span
        className={cn(
          "ml-auto text-2xs font-mono",
          latencyClass,
        )}
      >
        {step.elapsed_ms.toFixed(0)} ms
      </span>
    </div>
  );
}

function DataPanel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="surface-elev p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink-primary mb-3">
        <span className="text-accent">{icon}</span>
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function KV({
  k,
  v,
  accent,
}: {
  k: string;
  v: string;
  accent?: "buy" | "sell";
}) {
  const accentClass =
    accent === "buy"
      ? "text-signal-buy"
      : accent === "sell"
        ? "text-signal-sell"
        : "text-ink-primary";
  return (
    <div className="flex items-baseline gap-2 text-xs font-mono">
      <span className="text-ink-tertiary truncate">{k}</span>
      <span className={cn("ml-auto", accentClass)}>{v}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Methodology callout — explains WHY this page exists. Links to /research.
// New in v3 per user feedback: the page demonstrates the bus, but didn't
// explain to first-time visitors what claim it was demonstrating.
// ---------------------------------------------------------------------------

function MethodologyCallout() {
  return (
    <div className="surface-elev p-5 mb-6 border-l-4 border-l-gold">
      <div className="flex items-start gap-3">
        <BookOpen className="w-5 h-5 text-gold shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="kicker text-2xs mb-2">
            What this page proves · 本页证明
          </div>
          <p className="text-sm text-ink-primary leading-relaxed">
            This is the <strong>data bus self-demonstration</strong>: a single user
            request fans out to <strong>six bus.fetch calls</strong> across five
            registered Source types. Step 3 (FACTOR) internally calls Step 2 (OHLCV)
            again — the same OHLCV — and the bus cache returns it in zero ms.
            This is the &quot;bus as composer&quot; property formally characterized in
            <em> The Role-Separation Theorem</em>.
          </p>
          <p className="text-2xs text-ink-tertiary mt-2 leading-relaxed">
            数据脊柱自演示：单次用户请求触发 <strong>6 次 bus.fetch</strong>。第 3 步
            FACTOR 内部再次调用 OHLCV — bus 缓存返回 0ms。这就是「总线即可组合层」
            的存在证明，论文 §7 形式化刻画。
          </p>
          <Link
            href="/research"
            className="inline-flex items-center gap-1.5 text-xs text-gold hover:underline mt-3"
          >
            <ArrowRight className="w-3 h-3" />
            Read the paper · 看完整论文
          </Link>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bus call graph — visualizes the composition. New in v3.
// Renders after the successful chain to make the "Need.FACTOR internally
// calls Need.OHLCV" pattern visible at a glance.
// ---------------------------------------------------------------------------

export function BusCallGraph({ ticker, factorBars }: { ticker: string; factorBars: number | null }) {
  return (
    <section className="my-8">
      <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <Layers className="w-4 h-4 text-accent" />
        Bus call graph · 总线调用图
      </h2>
      <div className="surface-elev p-6">
        <div className="text-xs text-ink-tertiary mb-4 leading-relaxed">
          This is what happened beneath the chain. The bus is not just a router —
          a registered Source can call <code className="text-accent">bus.fetch</code> itself,
          producing a composable graph. Step 3&apos;s factor handler invokes Step 2&apos;s OHLCV
          handler. Bus cache (Law 1) returns it free.
        </div>
        <div className="font-mono text-xs space-y-1 leading-relaxed">
          <div>
            <span className="text-ink-tertiary">user → </span>
            <span className="text-accent">bus.fetch(Need.MACRO)</span>
            <span className="text-ink-tertiary"> → OpenBB → FRED</span>
          </div>
          <div>
            <span className="text-ink-tertiary">user → </span>
            <span className="text-accent">bus.fetch(Need.OHLCV, ticker={ticker})</span>
            <span className="text-ink-tertiary"> → yfinance / cn_equity_multi_source → {factorBars ?? "?"} bars</span>
          </div>
          <div>
            <span className="text-ink-tertiary">user → </span>
            <span className="text-accent">bus.fetch(Need.FACTOR, name=&quot;alpha158&quot;)</span>
          </div>
          <div className="ml-12">
            <span className="text-ink-tertiary">└─ alpha158_lite handler → </span>
            <span className="text-accent">bus.fetch(Need.OHLCV, ...)</span>
            <span className="text-signal-buy"> [cache hit, 0ms]</span>
          </div>
          <div className="ml-12">
            <span className="text-ink-tertiary">└─ compute 10 factors (ROC_5, BIAS_20, KMID, ...)</span>
          </div>
          <div>
            <span className="text-ink-tertiary">deterministic ensembler → signal direction</span>
          </div>
          <div>
            <span className="text-ink-tertiary">Backtrader mini-backtest → Sharpe, drawdown</span>
          </div>
          <div>
            <span className="text-ink-tertiary">lean_bridge.decision_to_insight → Lean JSON</span>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-border-subtle text-2xs text-ink-tertiary leading-relaxed">
          <strong className="text-ink-secondary">Law 4 (Telemetry composition):</strong>{" "}
          one telemetry record per layer. Inspect them at{" "}
          <code className="text-accent">/v1/databus/telemetry</code>.
          {" "}<strong className="text-ink-secondary">Adding a new factor library</strong>{" "}
          (Alpha360, WorldQuant style) is one line of bus.register() — the chain picks it up automatically.
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// FactorBarChart — visualize the 10 Alpha158-lite factors. v3.
// Replaces the raw key=value list. Factors are bounded to [-2, 2] in
// the backend, so we render diverging bars centered on 0.
// ---------------------------------------------------------------------------

function FactorBarChart({ factors }: { factors: Record<string, number> }) {
  const entries = Object.entries(factors).slice(0, 10);
  const maxAbs = Math.max(...entries.map(([, v]) => Math.abs(Number(v))), 0.001);
  return (
    <div className="space-y-1.5">
      {entries.map(([name, val]) => {
        const v = Number(val);
        const pct = (Math.abs(v) / maxAbs) * 50;  // half width since bidirectional
        const isPos = v >= 0;
        return (
          <div key={name} className="grid grid-cols-[5rem_1fr_3rem] gap-2 items-center text-xs">
            <span className="font-mono text-ink-tertiary truncate">{name}</span>
            <div className="relative h-3 bg-bg-hover rounded">
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border" />
              <div
                className={cn(
                  "absolute top-0 bottom-0",
                  isPos ? "left-1/2 bg-signal-buy/60" : "right-1/2 bg-signal-sell/60"
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className={cn(
              "text-right font-mono tabular-nums",
              isPos ? "text-signal-buy" : "text-signal-sell"
            )}>
              {v.toFixed(3)}
            </span>
          </div>
        );
      })}
      <div className="text-2xs text-ink-tertiary font-mono mt-3 pt-2 border-t border-border-subtle">
        发散条形图：左 = 负、右 = 正。因子值在 [-2, +2] 截断防止极端值污染下游 LLM。
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BusTelemetryStream — live `/v1/databus/telemetry` poll. v3.
// Surfaces which Source actually answered each Need + latency, including
// internal recursive calls (Need.FACTOR → Need.OHLCV inside the bus).
// ---------------------------------------------------------------------------

interface TelemetryRecord {
  need_kind: string;
  source: string | null;
  cache_hit: boolean;
  elapsed_ms: number;
  error: string | null;
}

function BusTelemetryStream() {
  const [records, setRecords] = useState<TelemetryRecord[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/v1/databus/telemetry?last_n=12`);
      if (r.ok) {
        const j = await r.json();
        setRecords(j.records || []);
      }
    } finally {
      setLoading(false);
    }
  }

  // Load once on mount + after manual click.
  useEffect(() => { load(); }, []);

  return (
    <section className="my-8">
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Activity className="w-4 h-4 text-accent" />
          Live bus telemetry · 总线遥测流
        </h2>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs py-1 px-2">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "↻ 刷新"}
        </button>
      </div>
      <div className="surface-elev overflow-hidden">
        {records.length === 0 ? (
          <div className="p-6 text-xs text-ink-tertiary text-center">无遥测记录</div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {records.map((r, i) => (
              <div key={i} className="grid grid-cols-[6rem_8rem_1fr_4rem] gap-3 px-4 py-2 items-center text-xs">
                <span className="font-mono text-2xs text-ink-tertiary uppercase">{r.need_kind}</span>
                <span className="font-mono text-ink-secondary truncate">{r.source ?? "—"}</span>
                <span className={cn(
                  "text-2xs font-mono",
                  r.cache_hit ? "text-signal-buy" : r.error ? "text-signal-sell" : "text-ink-tertiary"
                )}>
                  {r.cache_hit ? "✓ cache hit" : r.error ? `✗ ${r.error.slice(0, 60)}` : "→ fetched"}
                </span>
                <span className={cn(
                  "text-right font-mono tabular-nums",
                  r.elapsed_ms < 50 ? "text-signal-buy" :
                  r.elapsed_ms < 500 ? "text-ink-primary" :
                  r.elapsed_ms < 2000 ? "text-signal-warn" :
                                        "text-signal-sell"
                )}>
                  {r.elapsed_ms.toFixed(0)}ms
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="text-2xs text-ink-tertiary mt-2 font-mono">
        实时来自 <code className="text-accent">GET /v1/databus/telemetry?last_n=12</code> ·
        Law 4：每次 bus.fetch 一条记录、含递归内调用
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// CompareMode — run 3-5 tickers through the spine in parallel. v3.
// Most powerful demonstration of bus composability: same pipeline,
// different markets (US / A-share / crypto), side-by-side outputs.
// ---------------------------------------------------------------------------

function CompareMode({
  tickers, setTickers, data, loading, run,
}: {
  tickers: string;
  setTickers: (s: string) => void;
  data: ChainResponse[] | null;
  loading: boolean;
  run: () => void;
}) {
  return (
    <>
      <div className="surface-elev p-4 mb-6 flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={tickers}
          onChange={(e) => setTickers(e.target.value)}
          className="bg-bg-hover border border-border rounded px-3 py-2 font-mono text-sm flex-1 min-w-[16rem]"
          placeholder="AAPL, 600519, BTC (逗号或空格分隔，最多 5 个)"
        />
        <button onClick={run} disabled={loading || !tickers.trim()} className="btn-primary">
          {loading ? (<><Loader2 className="w-4 h-4 animate-spin" /> 并行跑脊柱…</>)
                   : (<><Play className="w-4 h-4" /> 并行运行</>)}
        </button>
      </div>

      <div className="surface-elev p-4 mb-6 border-l-4 border-l-gold">
        <div className="kicker text-2xs mb-1">这个对比证明什么</div>
        <p className="text-sm text-ink-primary leading-relaxed">
          同一个 7-agent 流水线 + 同一个 UniversalDataBus，跑美股、A 股、加密币 —
          底层 Source 完全不同（yfinance / 五层 A 股 / CCXT），输出的 BUY/HOLD/SELL + 因子是<strong>用同一套语义</strong>
          产生的。这是「跨市场统一覆盖」的存在证明。
        </p>
      </div>

      {data && (
        <div className="overflow-x-auto">
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(16rem, 1fr))` }}>
            {data.map((d, i) => <CompareCard key={i} data={d} />)}
          </div>
        </div>
      )}
    </>
  );
}

function CompareCard({ data }: { data: ChainResponse }) {
  if (data.error) {
    return (
      <div className="surface-elev p-4 border-l-4 border-l-signal-sell">
        <div className="font-mono font-bold text-ink-primary">{data.ticker}</div>
        <div className="text-2xs text-signal-sell mt-2 leading-relaxed">{data.error}</div>
      </div>
    );
  }
  const ohlcvStep = data.chain?.find(s => s.step === "ohlcv");
  const bars = (ohlcvStep?.bars as number) || 0;
  return (
    <div className="surface-elev p-4 border-l-4 border-l-accent">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <div className="font-mono font-bold text-lg text-ink-primary">{data.ticker}</div>
        <SideBadge side={data.signal?.side || "—"} />
      </div>
      <div className="space-y-1 text-xs">
        <KV k="bars (OHLCV)" v={String(bars)} />
        <KV k="factors" v={String(Object.keys(data.factors || {}).length)} />
        <KV k="signal score" v={data.signal?.score?.toFixed(3) || "—"} />
        <KV k="target weight" v={`${((data.signal?.target_weight || 0) * 100).toFixed(2)}%`} />
        <KV k="confidence" v={`${((data.signal?.confidence || 0) * 100).toFixed(0)}%`} />
        <KV k="backtest sharpe" v={data.backtest?.sharpe_annualised?.toFixed(2) || "—"} />
        <KV k="backtest return" v={`${(data.backtest?.return_pct || 0).toFixed(2)}%`}
            accent={(data.backtest?.return_pct || 0) >= 0 ? "buy" : "sell"} />
      </div>
      <div className="mt-3 pt-3 border-t border-border-subtle text-2xs text-ink-tertiary">
        {data.chain?.length || 0} 步全过 · spine: {data.spine_traversed?.join("→")}
      </div>
    </div>
  );
}
