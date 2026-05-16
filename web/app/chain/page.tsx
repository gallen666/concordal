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

import { useState } from "react";
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
  const [ticker, setTicker] = useState("AAPL");
  const [data, setData] = useState<ChainResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

            <DataPanel title="Factors (Alpha158-lite)" icon={<Sparkles />}>
              {data.factors ? (
                Object.entries(data.factors)
                  .slice(0, 8)
                  .map(([k, v]) => <KV key={k} k={k} v={Number(v).toFixed(3)} />)
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
