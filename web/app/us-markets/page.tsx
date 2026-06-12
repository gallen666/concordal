"use client";

/**
 * /us-markets — US-equities market overview landing page (v75).
 *
 * Parallel to /cn-markets/: a hub linking to indices / sectors heatmap /
 * movers detail pages, plus an inline 8-tile indices snapshot at the top
 * so the page is useful even without a click. All data comes from yfinance
 * + Yahoo's predefined screener (free, 15-min delayed, no API key).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, BarChart3, TrendingUp, ArrowUpRight } from "lucide-react";
import { useT } from "../lib/i18n";

const API_BASE = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

type IndexRow = {
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

type IndicesResp = {
  status: "ok" | "unavailable";
  asof?: string;
  rows: IndexRow[];
  source?: string;
  message?: string;
  stale?: boolean;
};

export default function USMarketsLandingPage() {
  const { locale } = useT();
  const zh = locale === "zh";
  const [idx, setIdx] = useState<IndicesResp | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/v1/us/indices`)
      .then((r) => r.json())
      .then(setIdx)
      .catch(() => setIdx({ status: "unavailable", rows: [], message: "network" }));
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">
      <header>
        <Link href="/" className="text-xs text-ink-tertiary hover:text-ink-primary">
          ← {zh ? "首页" : "Home"}
        </Link>
        <div className="kicker mt-2 mb-2">
          <Activity className="w-3.5 h-3.5" /> {zh ? "美股市场" : "US markets"} / US EQUITIES
        </div>
        <h1 className="display text-3xl md:text-4xl text-ink-primary tracking-tighter">
          {zh
            ? "S&P · NASDAQ · 罗素 · VIX — 一页看懂今天"
            : "S&P · NASDAQ · Russell · VIX — today at a glance"}
        </h1>
        <p className="text-ink-secondary mt-3 max-w-2xl">
          {zh
            ? "指数 / GICS 11 大板块 / 涨跌排行 三块, 数据走 yfinance + Yahoo screener, 15 分钟延迟但可对账。点任何代码可直接对它跑 7-agent 决策辩论。"
            : "Indices, 11 GICS sectors, and daily movers — all from yfinance + Yahoo screener (15-min delayed, audit-friendly). Click any ticker to run the 7-agent decision pipeline."}
        </p>
      </header>

      {/* Indices snapshot — inline preview so the page is useful with zero clicks */}
      <section className="surface-elev p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="kicker text-2xs">
            <BarChart3 className="w-3.5 h-3.5" /> {zh ? "指数快照" : "Indices snapshot"}
          </div>
          <Link
            href="/us-markets/indices"
            className="text-xs text-accent hover:underline inline-flex items-center gap-1"
          >
            {zh ? "完整指数表" : "Full indices"} <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
        {!idx ? (
          <SkeletonTiles />
        ) : idx.status !== "ok" || idx.rows.length === 0 ? (
          <div className="text-sm text-ink-tertiary">
            {zh
              ? "指数数据暂时不可达 — yfinance 限流, 请稍后重试。"
              : "Indices unavailable — yfinance rate-limited, try again shortly."}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {idx.rows.slice(0, 8).map((r) => (
                <IndexTile key={r.symbol} row={r} zh={zh} />
              ))}
            </div>
            <div className="mt-3 text-2xs font-mono uppercase tracking-wider text-ink-tertiary">
              {idx.stale ? (zh ? "⚠ 缓存数据" : "⚠ stale cache") + " · " : ""}
              {idx.source} · asof {idx.asof?.slice(0, 16)}Z
            </div>
          </>
        )}
      </section>

      {/* 3 navigation cards into the detail pages */}
      <section className="grid md:grid-cols-3 gap-4">
        <NavCard
          href="/us-markets/indices"
          icon={<BarChart3 className="w-5 h-5" />}
          title={zh ? "指数总览" : "Indices"}
          desc={
            zh
              ? "S&P 500 / NASDAQ / Dow / Russell 2000 · VIX 恐慌指数 · 美十债收益率 · DXY 美元指数"
              : "S&P 500 / NASDAQ / Dow / Russell 2000 · VIX volatility · 10Y Treasury yield · DXY"
          }
        />
        <NavCard
          href="/us-markets/sectors"
          icon={<Activity className="w-5 h-5" />}
          title={zh ? "GICS 板块热力图" : "GICS sector heatmap"}
          desc={
            zh
              ? "标普 11 大行业 SPDR ETF — XLF / XLK / XLE / XLV / XLI / XLP / XLY / XLB / XLU / XLRE / XLC"
              : "11 GICS sector ETFs — XLF / XLK / XLE / XLV / XLI / XLP / XLY / XLB / XLU / XLRE / XLC"
          }
        />
        <NavCard
          href="/us-markets/movers"
          icon={<TrendingUp className="w-5 h-5" />}
          title={zh ? "涨跌排行" : "Top movers"}
          desc={
            zh
              ? "今日 Top Gainers / Losers / Most Active — 点击任一代码直接跑 7-agent 决策"
              : "Today's top gainers / losers / most active — click any ticker to run the 7-agent pipeline"
          }
        />
      </section>

      <div className="text-2xs font-mono uppercase tracking-wider text-ink-tertiary border-t border-border-subtle pt-3">
        {zh
          ? "数据源 yfinance + Yahoo Finance predefined screener · 15 分钟延迟 · 免费 · 无需 API key"
          : "Sourced from yfinance + Yahoo Finance predefined screener · 15-min delayed · free · no API key"}
      </div>
    </div>
  );
}

function IndexTile({ row, zh }: { row: IndexRow; zh: boolean }) {
  const name = zh ? row.name_zh : row.name_en;
  const pct = row.changePct;
  const flat = pct == null || pct === 0;
  const up = (pct ?? 0) > 0;
  const color = flat ? "text-ink-secondary" : up ? "text-signal-buy" : "text-signal-sell";
  return (
    <Link
      href={`/decision?ticker=${encodeURIComponent(row.symbol)}`}
      className="surface p-3 block hover:border-accent/40 transition-colors"
    >
      <div className="text-2xs uppercase tracking-kicker text-ink-tertiary mb-1 truncate">
        {name}
      </div>
      <div className={`font-mono text-lg tabular-nums ${color}`}>
        {row.last != null ? formatNum(row.last) : "—"}
      </div>
      <div className={`text-2xs font-mono tabular-nums ${color}`}>
        {pct != null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : "—"}
      </div>
    </Link>
  );
}

function NavCard({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="surface-elev p-5 hover:border-accent/40 transition-colors block"
    >
      <div className="flex items-center gap-2 mb-2 text-accent">
        {icon}
        <span className="text-2xs font-mono uppercase tracking-wider">{title}</span>
      </div>
      <p className="text-sm text-ink-secondary leading-relaxed">{desc}</p>
      <div className="mt-3 text-xs text-accent inline-flex items-center gap-1">→</div>
    </Link>
  );
}

function SkeletonTiles() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="surface p-3 animate-pulse">
          <div className="h-3 w-20 bg-bg-hover rounded mb-2" />
          <div className="h-5 w-24 bg-bg-hover rounded mb-1.5" />
          <div className="h-3 w-16 bg-bg-hover rounded" />
        </div>
      ))}
    </div>
  );
}

function formatNum(v: number): string {
  if (Math.abs(v) >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (Math.abs(v) >= 1) return v.toFixed(2);
  return v.toFixed(4);
}
