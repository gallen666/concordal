"use client";

/**
 * /us-markets/movers — top US movers, three tabs (v75).
 *
 * Gainers / Losers / Most Active. Backend hits Yahoo's predefined screener
 * (the same screener Yahoo Finance's own site uses) so we get the official
 * S&P 500 + NASDAQ daily ranking without paying for Polygon / IEX. Click
 * any symbol → /decision?ticker=X to immediately run the 7-agent pipeline.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown, Activity, RefreshCw, TrendingUp } from "lucide-react";
import { useT } from "../../lib/i18n";

const API_BASE = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

type Kind = "gainers" | "losers" | "active";

type Row = {
  symbol: string;
  name?: string;
  last?: number;
  change?: number;
  changePct?: number;
  volume?: number;
  marketCap?: number;
  exchange?: string;
};

type Resp = {
  status: "ok" | "unavailable";
  asof?: string;
  kind?: Kind;
  rows: Row[];
  source?: string;
  message?: string;
  stale?: boolean;
};

const TABS: { kind: Kind; label_zh: string; label_en: string; icon: React.ReactNode }[] = [
  { kind: "gainers", label_zh: "涨幅榜",   label_en: "Top gainers",  icon: <ArrowUp className="w-3.5 h-3.5" /> },
  { kind: "losers",  label_zh: "跌幅榜",   label_en: "Top losers",   icon: <ArrowDown className="w-3.5 h-3.5" /> },
  { kind: "active",  label_zh: "成交活跃", label_en: "Most active",  icon: <Activity className="w-3.5 h-3.5" /> },
];

export default function USMoversPage() {
  const { locale } = useT();
  const zh = locale === "zh";
  const [tab, setTab] = useState<Kind>("gainers");
  const [data, setData] = useState<Resp | null>(null);
  const [reloading, setReloading] = useState(false);

  const load = (k: Kind = tab) => {
    setReloading(true);
    setData(null);
    fetch(`${API_BASE}/v1/us/movers?kind=${k}&count=25`, { cache: "no-store" })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ status: "unavailable", rows: [], message: "network" }))
      .finally(() => setReloading(false));
  };

  useEffect(() => load(tab), [tab]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      <header>
        <Link href="/us-markets" className="text-xs text-ink-tertiary hover:text-ink-primary">
          ← {zh ? "美股市场" : "US markets"}
        </Link>
        <div className="flex items-baseline justify-between flex-wrap gap-3 mt-2">
          <div>
            <div className="kicker mb-2">
              <TrendingUp className="w-3.5 h-3.5" /> {zh ? "涨跌排行" : "Top movers"} / DAILY MOVERS
            </div>
            <h1 className="display text-3xl md:text-4xl text-ink-primary tracking-tighter">
              {zh ? "今日美股谁在动" : "Who's moving today"}
            </h1>
            <p className="text-ink-secondary mt-2 max-w-2xl">
              {zh
                ? "S&P 500 + NASDAQ 涨幅 / 跌幅 / 成交活跃 三档。点任一代码可直接对它跑 7-agent 决策辩论。"
                : "S&P 500 + NASDAQ gainers / losers / most active. Click any symbol to run the 7-agent pipeline on it."}
            </p>
          </div>
          <button
            onClick={() => load()}
            disabled={reloading}
            className="btn-ghost text-xs inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reloading ? "animate-spin" : ""}`} />
            {zh ? "刷新" : "Refresh"}
          </button>
        </div>
      </header>

      {/* Tab strip */}
      <div className="surface-elev p-1 inline-flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.kind}
            onClick={() => setTab(t.kind)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono uppercase tracking-wider transition-colors ${
              tab === t.kind
                ? "bg-bg-hover text-ink-primary"
                : "text-ink-tertiary hover:text-ink-primary"
            }`}
          >
            {t.icon}
            {zh ? t.label_zh : t.label_en}
          </button>
        ))}
      </div>

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
                  <th className="text-left  px-3 py-3 font-medium">#</th>
                  <th className="text-left  px-3 py-3 font-medium">{zh ? "代码" : "Symbol"}</th>
                  <th className="text-left  px-3 py-3 font-medium">{zh ? "名称" : "Name"}</th>
                  <th className="text-right px-3 py-3 font-medium">{zh ? "最新价" : "Last"}</th>
                  <th className="text-right px-3 py-3 font-medium">{zh ? "涨跌额" : "Change"}</th>
                  <th className="text-right px-3 py-3 font-medium">{zh ? "涨跌幅" : "Change %"}</th>
                  <th className="text-right px-3 py-3 font-medium">{zh ? "成交量" : "Volume"}</th>
                  <th className="text-right px-3 py-3 font-medium">{zh ? "市值" : "Market cap"}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => {
                  const pct = r.changePct;
                  const flat = pct == null || pct === 0;
                  const up = (pct ?? 0) > 0;
                  const color = flat
                    ? "text-ink-secondary"
                    : up
                    ? "text-signal-buy"
                    : "text-signal-sell";
                  return (
                    <tr key={r.symbol || i} className="border-b border-border-subtle/40 hover:bg-bg-hover/40">
                      <td className="px-3 py-3 font-mono text-ink-tertiary">{i + 1}</td>
                      <td className="px-3 py-3 font-mono">
                        {r.symbol ? (
                          <Link
                            href={`/decision?ticker=${encodeURIComponent(r.symbol)}`}
                            className="text-ink-primary hover:text-accent font-semibold"
                          >
                            {r.symbol}
                          </Link>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-3 text-ink-secondary truncate max-w-[260px]">
                        {r.name || "—"}
                      </td>
                      <td className={`px-3 py-3 text-right font-mono tabular-nums ${color}`}>
                        {r.last != null ? `$${r.last.toFixed(2)}` : "—"}
                      </td>
                      <td className={`px-3 py-3 text-right font-mono tabular-nums ${color}`}>
                        {r.change != null
                          ? `${r.change >= 0 ? "+" : ""}${r.change.toFixed(2)}`
                          : "—"}
                      </td>
                      <td className={`px-3 py-3 text-right font-mono tabular-nums ${color}`}>
                        {pct != null
                          ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-ink-tertiary">
                        {r.volume != null ? fmtCompact(r.volume) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-ink-tertiary">
                        {r.marketCap != null ? `$${fmtCompact(r.marketCap)}` : "—"}
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

function fmtCompact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3)  return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}

function SkeletonTable() {
  return (
    <div className="surface-elev p-5 space-y-2">
      {Array.from({ length: 10 }).map((_, i) => (
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
        {zh ? "涨跌榜数据暂时不可达" : "Movers data temporarily unavailable"}
      </div>
      {message ? (
        <div className="text-2xs font-mono text-ink-tertiary">{message}</div>
      ) : null}
      <div className="text-xs text-ink-tertiary">
        {zh
          ? "Yahoo screener 偶尔限流, 请 1–2 分钟后重试。"
          : "Yahoo's screener occasionally rate-limits — try again in a minute or two."}
      </div>
    </div>
  );
}
