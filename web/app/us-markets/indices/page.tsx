"use client";

/**
 * /us-markets/indices — full US indices + macro-tells table (v75).
 *
 * Eight rows: 5 equity-breadth indices (S&P 500 / NASDAQ Comp / NASDAQ 100 /
 * Dow / Russell 2000), plus VIX (vol), 10Y Treasury yield, and DXY (dollar)
 * — the three macro tells most US-equity decisions actually depend on.
 * Each row links to /decision?ticker=... so the user can run the 7-agent
 * pipeline on any index directly from this page.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, BarChart3, RefreshCw } from "lucide-react";
import { useT } from "../../lib/i18n";

const API_BASE = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

type Row = {
  symbol: string;
  name_en: string;
  name_zh: string;
  kind: string;
  last?: number;
  prev?: number;
  change?: number;
  changePct?: number;
  volume?: number;
};

type Resp = {
  status: "ok" | "unavailable";
  asof?: string;
  rows: Row[];
  source?: string;
  message?: string;
  stale?: boolean;
};

const KIND_LABEL: Record<string, { zh: string; en: string }> = {
  equity_index: { zh: "股指", en: "Equity index" },
  vol:          { zh: "波动率", en: "Volatility" },
  rate:         { zh: "利率", en: "Rate" },
  fx:           { zh: "外汇", en: "FX" },
};

export default function USIndicesPage() {
  const { locale } = useT();
  const zh = locale === "zh";
  const [data, setData] = useState<Resp | null>(null);
  const [reloading, setReloading] = useState(false);

  const load = () => {
    setReloading(true);
    fetch(`${API_BASE}/v1/us/indices`, { cache: "no-store" })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ status: "unavailable", rows: [], message: "network" }))
      .finally(() => setReloading(false));
  };

  useEffect(load, []);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      <header>
        <Link href="/us-markets" className="text-xs text-ink-tertiary hover:text-ink-primary">
          ← {zh ? "美股市场" : "US markets"}
        </Link>
        <div className="flex items-baseline justify-between flex-wrap gap-3 mt-2">
          <div>
            <div className="kicker mb-2">
              <BarChart3 className="w-3.5 h-3.5" /> {zh ? "美股指数" : "US indices"} / INDICES
            </div>
            <h1 className="display text-3xl md:text-4xl text-ink-primary tracking-tighter">
              {zh ? "股指 · 波动率 · 利率 · 美元" : "Equities · Volatility · Rates · Dollar"}
            </h1>
            <p className="text-ink-secondary mt-2 max-w-2xl">
              {zh
                ? "美股决策最常引用的 8 个市场代理。点任一代码可直接对它跑 7-agent 决策辩论。"
                : "The 8 market proxies US-equity decisions most often reference. Click any symbol to run the 7-agent pipeline."}
            </p>
          </div>
          <button
            onClick={load}
            disabled={reloading}
            className="btn-ghost text-xs inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reloading ? "animate-spin" : ""}`} />
            {zh ? "刷新" : "Refresh"}
          </button>
        </div>
      </header>

      {!data ? (
        <SkeletonTable />
      ) : data.status !== "ok" || data.rows.length === 0 ? (
        <Unavailable zh={zh} message={data.message} />
      ) : (
        <>
          <div className="surface-elev overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-2xs uppercase tracking-wider text-ink-tertiary border-b border-border-subtle">
                  <th className="text-left  px-3 py-3 font-medium">{zh ? "代码" : "Symbol"}</th>
                  <th className="text-left  px-3 py-3 font-medium">{zh ? "名称" : "Name"}</th>
                  <th className="text-left  px-3 py-3 font-medium">{zh ? "类别" : "Kind"}</th>
                  <th className="text-right px-3 py-3 font-medium">{zh ? "最新" : "Last"}</th>
                  <th className="text-right px-3 py-3 font-medium">{zh ? "涨跌额" : "Change"}</th>
                  <th className="text-right px-3 py-3 font-medium">{zh ? "涨跌幅" : "Change %"}</th>
                  <th className="text-right px-3 py-3 font-medium">{zh ? "昨收" : "Prev close"}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const pct = r.changePct;
                  const flat = pct == null || pct === 0;
                  const up = (pct ?? 0) > 0;
                  const color = flat
                    ? "text-ink-secondary"
                    : up
                    ? "text-signal-buy"
                    : "text-signal-sell";
                  const kindLabel = KIND_LABEL[r.kind];
                  return (
                    <tr key={r.symbol} className="border-b border-border-subtle/40 hover:bg-bg-hover/40">
                      <td className="px-3 py-3 font-mono">
                        <Link
                          href={`/decision?ticker=${encodeURIComponent(r.symbol)}`}
                          className="text-ink-primary hover:text-accent"
                        >
                          {r.symbol}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-ink-secondary">{zh ? r.name_zh : r.name_en}</td>
                      <td className="px-3 py-3 text-2xs uppercase tracking-wider text-ink-tertiary">
                        {kindLabel ? (zh ? kindLabel.zh : kindLabel.en) : r.kind}
                      </td>
                      <td className={`px-3 py-3 text-right font-mono tabular-nums ${color}`}>
                        {r.last != null ? formatNum(r.last) : "—"}
                      </td>
                      <td className={`px-3 py-3 text-right font-mono tabular-nums ${color}`}>
                        {r.change != null
                          ? `${r.change >= 0 ? "+" : ""}${r.change.toFixed(2)}`
                          : "—"}
                      </td>
                      <td className={`px-3 py-3 text-right font-mono tabular-nums ${color}`}>
                        {pct != null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : "—"}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-ink-tertiary">
                        {r.prev != null ? formatNum(r.prev) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="text-2xs font-mono uppercase tracking-wider text-ink-tertiary border-t border-border-subtle pt-3">
            {data.stale ? (zh ? "⚠ 缓存数据 · " : "⚠ stale cache · ") : ""}
            {data.source} · asof {data.asof?.slice(0, 16)}Z ·{" "}
            {zh ? "数据 ~15 分钟延迟" : "~15-min delayed"}
          </div>
        </>
      )}
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="surface-elev p-5 space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-10 bg-bg-hover/40 rounded animate-pulse" />
      ))}
    </div>
  );
}

function Unavailable({ zh, message }: { zh: boolean; message?: string }) {
  return (
    <div className="surface-elev p-8 text-center space-y-2">
      <Activity className="w-6 h-6 mx-auto text-ink-tertiary" />
      <div className="text-sm text-ink-secondary">
        {zh ? "美股指数数据暂时不可达" : "US indices temporarily unavailable"}
      </div>
      {message ? (
        <div className="text-2xs font-mono text-ink-tertiary">{message}</div>
      ) : null}
      <div className="text-xs text-ink-tertiary">
        {zh
          ? "yfinance 在 Render 上偶尔限流, 请 1–2 分钟后刷新。"
          : "yfinance is occasionally rate-limited on Render — refresh in a minute or two."}
      </div>
    </div>
  );
}

function formatNum(v: number): string {
  if (Math.abs(v) >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (Math.abs(v) >= 1) return v.toFixed(2);
  return v.toFixed(4);
}
