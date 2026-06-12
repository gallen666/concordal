"use client";

/**
 * /us-markets/sectors — GICS 11-sector heatmap (v75).
 *
 * Uses the 11 SPDR sector ETFs (XLF, XLK, XLE, ...) as cheap proxies for
 * sector breadth — same pattern Bloomberg / Yahoo / TradingView use. Color
 * intensity is mapped to today's change% so the heatmap reads like the
 * A-share equivalent on /cn-markets/sectors. Click any cell to run the
 * 7-agent decision pipeline on that sector's ETF.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Layers, RefreshCw } from "lucide-react";
import { useT } from "../../lib/i18n";

const API_BASE = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

type Row = {
  symbol: string;
  name_en: string;
  name_zh: string;
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

export default function USSectorsPage() {
  const { locale } = useT();
  const zh = locale === "zh";
  const [data, setData] = useState<Resp | null>(null);
  const [reloading, setReloading] = useState(false);

  const load = () => {
    setReloading(true);
    fetch(`${API_BASE}/v1/us/sectors`, { cache: "no-store" })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ status: "unavailable", rows: [], message: "network" }))
      .finally(() => setReloading(false));
  };

  useEffect(load, []);

  // Sort by changePct desc so the heatmap reads top-to-bottom green→red,
  // matching the visual convention on /cn-markets/sectors.
  const sorted = data?.rows
    ? [...data.rows].sort(
        (a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity),
      )
    : [];

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      <header>
        <Link href="/us-markets" className="text-xs text-ink-tertiary hover:text-ink-primary">
          ← {zh ? "美股市场" : "US markets"}
        </Link>
        <div className="flex items-baseline justify-between flex-wrap gap-3 mt-2">
          <div>
            <div className="kicker mb-2">
              <Layers className="w-3.5 h-3.5" /> {zh ? "GICS 板块" : "GICS sectors"} / SECTOR HEATMAP
            </div>
            <h1 className="display text-3xl md:text-4xl text-ink-primary tracking-tighter">
              {zh ? "11 大板块 · 今日资金流向" : "11 GICS sectors · today's breadth"}
            </h1>
            <p className="text-ink-secondary mt-2 max-w-2xl">
              {zh
                ? "SPDR 行业 ETF 代理标普 11 大板块 (XLF / XLK / XLE / ...)。颜色按涨跌幅冷热映射, 点任意 cell 直接对它跑 7-agent 决策。"
                : "SPDR sector ETFs proxy the 11 GICS sectors (XLF / XLK / XLE / ...). Cell colour reflects today's change %. Click any cell to run the 7-agent pipeline on it."}
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
        <SkeletonGrid />
      ) : data.status !== "ok" || sorted.length === 0 ? (
        <Unavailable zh={zh} message={data.message} />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {sorted.map((r) => (
              <SectorTile key={r.symbol} row={r} zh={zh} />
            ))}
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

/** Map a change-% into a Tailwind background-color class. Caps at ±3% so
 *  a single outlier doesn't wash out the rest of the heatmap. */
function pctColor(pct: number | undefined | null): string {
  if (pct == null) return "bg-bg-hover";
  const v = Math.max(-3, Math.min(3, pct));
  if (v >= 2)    return "bg-signal-buy/40 border-signal-buy/30";
  if (v >= 1)    return "bg-signal-buy/25 border-signal-buy/20";
  if (v >= 0.2)  return "bg-signal-buy/15 border-signal-buy/15";
  if (v <= -2)   return "bg-signal-sell/40 border-signal-sell/30";
  if (v <= -1)   return "bg-signal-sell/25 border-signal-sell/20";
  if (v <= -0.2) return "bg-signal-sell/15 border-signal-sell/15";
  return "bg-bg-hover border-border-subtle";
}

function SectorTile({ row, zh }: { row: Row; zh: boolean }) {
  const pct = row.changePct;
  const color = pctColor(pct);
  return (
    <Link
      href={`/decision?ticker=${encodeURIComponent(row.symbol)}`}
      className={`block p-4 rounded border transition-colors ${color} hover:border-accent/60`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-semibold text-ink-primary leading-tight">
          {zh ? row.name_zh : row.name_en}
        </div>
        <div className="text-2xs font-mono uppercase tracking-wider text-ink-tertiary shrink-0">
          {row.symbol}
        </div>
      </div>
      <div className="mt-2 font-mono text-xl tabular-nums text-ink-primary">
        {pct != null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : "—"}
      </div>
      <div className="text-2xs font-mono tabular-nums text-ink-tertiary mt-0.5">
        {row.last != null ? `$${row.last.toFixed(2)}` : ""}
        {row.change != null
          ? `  ${row.change >= 0 ? "+" : ""}${row.change.toFixed(2)}`
          : ""}
      </div>
    </Link>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {Array.from({ length: 11 }).map((_, i) => (
        <div key={i} className="surface p-4 animate-pulse">
          <div className="h-4 w-24 bg-bg-hover rounded mb-2" />
          <div className="h-6 w-16 bg-bg-hover rounded" />
        </div>
      ))}
    </div>
  );
}

function Unavailable({ zh, message }: { zh: boolean; message?: string }) {
  return (
    <div className="surface-elev p-8 text-center space-y-2">
      <Activity className="w-6 h-6 mx-auto text-ink-tertiary" />
      <div className="text-sm text-ink-secondary">
        {zh ? "板块数据暂时不可达" : "Sector data temporarily unavailable"}
      </div>
      {message ? (
        <div className="text-2xs font-mono text-ink-tertiary">{message}</div>
      ) : null}
      <div className="text-xs text-ink-tertiary">
        {zh
          ? "yfinance 在 Render 上偶尔限流, 请稍后再试。"
          : "yfinance is occasionally rate-limited — try again shortly."}
      </div>
    </div>
  );
}
