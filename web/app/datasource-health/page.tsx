"use client";

/**
 * /datasource-health — live data-source health dashboard.
 *
 * Hits /v1/datasource/health on mount + every 30s.
 * Renders one card per source with: name, latency_ms, ok flag, sample
 * value (the price/PE we got from a 600519 canary probe), and last
 * error message if any.
 *
 * This page exists because the user complained: "你经常拿不到最新数据".
 * Now they can see at a glance whether the upstreams are healthy and
 * which one is currently flaky. The /report module quietly skips any
 * source that's been failing — but humans needed visibility too.
 */

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, RefreshCw, AlertTriangle } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API || "https://trading-agents-platform.onrender.com";

type SourceProbe = {
  name: string;
  ok: boolean;
  latency_ms: number;
  value_sample: number | string | null;
  error: string | null;
};

type HealthReport = {
  canary: string;
  as_of: number;
  sources: SourceProbe[];
  healthy_count: number;
  total_sources: number;
  health_status: "ok" | "degraded" | "down";
};

export default function DataSourceHealthPage() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<number>(0);

  async function probe() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/v1/datasource/health`, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j: HealthReport = await r.json();
      setReport(j);
      setLastFetch(Date.now());
    } catch (e: any) {
      setError(e?.message || "probe failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    probe();
    const id = setInterval(probe, 30_000);
    return () => clearInterval(id);
  }, []);

  const statusColor =
    report?.health_status === "ok"        ? "text-signal-buy" :
    report?.health_status === "degraded"  ? "text-gold"        :
                                             "text-signal-sell";
  const statusLabel =
    report?.health_status === "ok"        ? "全部正常" :
    report?.health_status === "degraded"  ? "部分降级"  :
    report?.health_status === "down"      ? "全部失效"  : "—";

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-8">
        <div>
          <div className="kicker text-xs mb-1">系统健康</div>
          <h1 className="text-3xl font-serif text-ink-primary">数据源健康看板</h1>
          <p className="text-sm text-ink-tertiary mt-2 max-w-2xl">
            用 <span className="font-mono">{report?.canary || "600519"}</span> 作为 canary 实时探测每个上游数据源。
            报告生成过程中，系统按优先级顺序调用这些源，并要求关键字段（价格、PE、市值）
            至少 2 个源一致才采用。
          </p>
        </div>
        <button onClick={probe} className="btn-secondary text-xs" disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> 立即刷新
        </button>
      </div>

      {error && (
        <div className="border-2 border-signal-sell bg-signal-sell_soft p-4 rounded mb-6">
          <div className="flex items-center gap-2 text-signal-sell">
            <AlertTriangle className="w-4 h-4" /> 健康检查失败：{error}
          </div>
        </div>
      )}

      {report && (
        <>
          <div className="surface-elev p-6 mb-6">
            <div className="grid sm:grid-cols-3 gap-4 items-center">
              <div>
                <div className="text-2xs uppercase tracking-wider text-ink-tertiary mb-1">整体状态</div>
                <div className={`text-3xl font-bold ${statusColor}`}>{statusLabel}</div>
              </div>
              <div>
                <div className="text-2xs uppercase tracking-wider text-ink-tertiary mb-1">健康源</div>
                <div className="text-3xl font-mono text-ink-primary">{report.healthy_count} / {report.total_sources}</div>
              </div>
              <div>
                <div className="text-2xs uppercase tracking-wider text-ink-tertiary mb-1">最后探测</div>
                <div className="text-sm font-mono text-ink-secondary">
                  {lastFetch ? new Date(lastFetch).toLocaleTimeString("zh-CN") : "—"}
                </div>
                <div className="text-2xs text-ink-tertiary mt-0.5">每 30s 自动刷新</div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {report.sources.map((s) => (
              <div key={s.name} className={`surface p-4 border-l-4 ${s.ok ? "border-l-signal-buy" : "border-l-signal-sell"}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {s.ok
                      ? <CheckCircle2 className="w-5 h-5 text-signal-buy flex-shrink-0" />
                      : <XCircle      className="w-5 h-5 text-signal-sell flex-shrink-0" />}
                    <span className="font-mono text-sm text-ink-primary truncate">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <div>
                      <span className="text-ink-tertiary">延迟：</span>
                      <span className={`font-mono ${s.latency_ms > 2000 ? "text-signal-sell" : s.latency_ms > 500 ? "text-gold" : "text-ink-primary"}`}>
                        {s.latency_ms}ms
                      </span>
                    </div>
                    <div>
                      <span className="text-ink-tertiary">样本：</span>
                      <span className="font-mono text-ink-primary">
                        {s.value_sample !== null ? String(s.value_sample) : "—"}
                      </span>
                    </div>
                  </div>
                </div>
                {s.error && (
                  <div className="mt-2 text-xs text-signal-sell pl-7">
                    错误：{s.error}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 text-xs text-ink-tertiary space-y-1">
            <p>· 探测使用 600519（贵州茅台）作为 canary，所有源理论上都应有该 ticker 数据。</p>
            <p>· 健康定义：HTTP 200 且关键字段（quote: current、fundamentals: pe）非空。</p>
            <p>· 报告生成时，单源失败自动跳过到下一个；连续 3 次失败的源会在 30 分钟内降级。</p>
            <p>· 关键字段（价格、PE、市值）在报告生成时强制至少 2 个独立源一致才采用。</p>
          </div>
        </>
      )}
    </div>
  );
}
