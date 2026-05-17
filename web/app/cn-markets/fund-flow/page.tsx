"use client";

/**
 * /cn-markets/fund-flow — 主力资金流向.
 *
 * The single most-watched dataset on East-money's morning view.
 * Three panes:
 *   1. Market-wide net inflow time series (30-day chart)
 *   2. Top-50 individual stocks by 主力净流入 today
 *   3. Top-30 sectors (industry + concept toggle) by net flow
 *
 * Every row links to /decision?ticker=XXX so a user can immediately
 * ask the 7-agent why a name is being accumulated/distributed.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Layers,
  Loader2,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { cn } from "../../lib/cn";

const API_BASE = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

interface FlowRow {
  [k: string]: string | number | null;
}
interface FlowResponse {
  status: string;
  rows: FlowRow[];
  source?: string;
  message?: string;
}

export default function FundFlowPage() {
  const [individual, setIndividual] = useState<FlowResponse | null>(null);
  const [sectors, setSectors] = useState<FlowResponse | null>(null);
  const [market, setMarket] = useState<FlowResponse | null>(null);
  const [sectorKind, setSectorKind] = useState<"industry" | "concept">("industry");

  useEffect(() => {
    fetch(`${API_BASE}/v1/cn/fund-flow/individual?top=50`)
      .then((r) => r.json())
      .then(setIndividual)
      .catch(() => setIndividual({ status: "unavailable", rows: [], message: "network" }));
    fetch(`${API_BASE}/v1/cn/fund-flow/market?days=30`)
      .then((r) => r.json())
      .then(setMarket)
      .catch(() => setMarket({ status: "unavailable", rows: [], message: "network" }));
  }, []);

  useEffect(() => {
    setSectors(null);
    fetch(`${API_BASE}/v1/cn/fund-flow/sectors?kind=${sectorKind}`)
      .then((r) => r.json())
      .then(setSectors)
      .catch(() => setSectors({ status: "unavailable", rows: [], message: "network" }));
  }, [sectorKind]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <header className="mb-8">
        <Link
          href="/cn-markets"
          className="text-xs text-ink-tertiary hover:text-ink-primary"
        >
          ← A 股市场
        </Link>
        <div className="kicker mt-2 mb-2">
          <Activity className="w-3.5 h-3.5" /> 主力资金流向 / Smart-money flow
        </div>
        <h1 className="display text-3xl md:text-4xl text-ink-primary tracking-tighter">
          主力净流入 · 板块轮动
        </h1>
        <p className="text-ink-secondary mt-3 text-sm max-w-2xl leading-relaxed">
          akshare → 东方财富。每个个股都能一键发起 7-agent 决策辩论。
        </p>
      </header>

      {/* 1. Market-wide flow series */}
      <section className="mb-10">
        <PaneHeader
          icon={<TrendingUp className="w-4 h-4" />}
          title="大盘资金流向 · 最近 30 天"
          subtitle="Market-wide net inflow"
        />
        {!market ? (
          <SkeletonRow />
        ) : market.status !== "ok" ? (
          <Unavailable message={market.message} />
        ) : (
          <MarketFlowChart rows={market.rows} />
        )}
      </section>

      {/* 2. Top-50 individual flow */}
      <section className="mb-10">
        <PaneHeader
          icon={<ArrowUpRight className="w-4 h-4 text-signal-buy" />}
          title="主力净流入 · TOP 50"
          subtitle="Top individual inflow today · click ticker → 决策"
        />
        {!individual ? (
          <SkeletonRow />
        ) : individual.status !== "ok" ? (
          <Unavailable message={individual.message} />
        ) : (
          <FlowTable
            rows={individual.rows}
            tickerKey="代码"
            nameKey="名称"
            netKey="主力净流入-净额"
            pctKey="主力净流入-净占比"
            priceKey="最新价"
            changeKey="今日涨跌幅"
          />
        )}
      </section>

      {/* 3. Sector flow with toggle */}
      <section>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <PaneHeader
            icon={<Layers className="w-4 h-4" />}
            title="板块资金流向"
            subtitle="Sector inflow ranking"
            tightMargin
          />
          <div className="flex items-center gap-1 surface p-0.5 text-xs">
            <button
              onClick={() => setSectorKind("industry")}
              className={cn(
                "px-3 py-1 rounded transition",
                sectorKind === "industry"
                  ? "bg-accent/15 text-accent"
                  : "text-ink-secondary hover:text-ink-primary"
              )}
            >
              申万行业
            </button>
            <button
              onClick={() => setSectorKind("concept")}
              className={cn(
                "px-3 py-1 rounded transition",
                sectorKind === "concept"
                  ? "bg-accent/15 text-accent"
                  : "text-ink-secondary hover:text-ink-primary"
              )}
            >
              概念股
            </button>
          </div>
        </div>
        {!sectors ? (
          <SkeletonRow />
        ) : sectors.status !== "ok" ? (
          <Unavailable message={sectors.message} />
        ) : (
          <SectorTable rows={sectors.rows} />
        )}
      </section>

      <p className="text-2xs text-ink-tertiary mt-10 leading-relaxed">
        数据由 akshare 转发自东方财富。"主力" 通常指大单 + 超大单的净买入额。
        本页所有数据仅供参考，不构成投资建议。
        <Sparkles className="inline-block w-3 h-3 mx-1" />
        想看个股的多空辩论？点任意行进入 /decision。
      </p>
    </div>
  );
}

function PaneHeader({
  icon,
  title,
  subtitle,
  tightMargin,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  tightMargin?: boolean;
}) {
  return (
    <div className={tightMargin ? "" : "mb-3"}>
      <div className="flex items-center gap-2 text-base font-semibold text-ink-primary">
        {icon}
        {title}
      </div>
      <div className="text-2xs text-ink-tertiary uppercase tracking-wider mt-0.5">
        {subtitle}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="surface-elev p-6 flex items-center gap-2 text-ink-tertiary text-sm">
      <Loader2 className="w-4 h-4 animate-spin" />
      Loading…
    </div>
  );
}

function Unavailable({ message }: { message?: string }) {
  // Translate raw Python/urllib3 exception strings into user-friendly Chinese.
  // EastMoney's push2 API is geo-blocked from our Render Singapore region —
  // all three patterns below indicate the same root cause.
  const raw = (message || "").toLowerCase();
  const isGeoBlock =
    raw.includes("connection aborted") ||
    raw.includes("remotedisconnected") ||
    raw.includes("expecting value") ||
    raw.includes("远端关闭") ||
    raw.includes("timeout") ||
    raw.includes("akshare returned empty");

  if (isGeoBlock) {
    return (
      <div className="surface p-4 text-xs text-ink-tertiary leading-relaxed">
        <div className="font-medium text-ink-secondary mb-1">资金流向数据源暂不可达</div>
        <div>
          东方财富 push2 接口仅对中国大陆 IP 开放，本服务器位于
          Singapore 出口经常被屏（命中率 &lt; 20%）。可改用
          <a href="/report" className="text-accent underline mx-1">单股深度报告</a>
          ，那条链路走腾讯+新浪多源，Singapore 可达率 95%+。
        </div>
      </div>
    );
  }

  return (
    <div className="surface p-4 text-xs text-ink-tertiary">
      数据暂时不可用 — {message || "上游未返回"}
    </div>
  );
}

function fmtFlow(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!isFinite(n)) return String(v);
  // East-money values are in yuan; format as 亿元 (10^8) / 万元 (10^4).
  const abs = Math.abs(n);
  let s: string;
  if (abs >= 1e8) s = `${(n / 1e8).toFixed(2)} 亿`;
  else if (abs >= 1e4) s = `${(n / 1e4).toFixed(2)} 万`;
  else s = n.toFixed(0);
  return s;
}

function fmtPct(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!isFinite(n)) return String(v);
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function MarketFlowChart({ rows }: { rows: FlowRow[] }) {
  // Try to pull a (date, 主力净流入-净额) pair out of east-money's irregular column naming.
  const sample = rows[0] || {};
  const keys = Object.keys(sample);
  const dateKey = keys.find((k) => /日期|date/i.test(k)) || keys[0];
  const valueKey =
    keys.find((k) => /主力净流入-净额|主力净流入|net/i.test(k)) ||
    keys[1] ||
    keys[0];
  const series = rows
    .map((r) => ({
      date: String(r[dateKey] || "").slice(0, 10),
      v: Number(r[valueKey] || 0),
    }))
    .filter((p) => p.date);
  if (series.length === 0)
    return <Unavailable message="empty series" />;
  const max = Math.max(...series.map((p) => Math.abs(p.v))) || 1;
  return (
    <div className="surface-elev p-5">
      <div className="flex items-end gap-1 h-32">
        {series.map((p, i) => {
          const h = (Math.abs(p.v) / max) * 100;
          const positive = p.v >= 0;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col justify-end"
              title={`${p.date} · ${fmtFlow(p.v)}元`}
            >
              <div
                className={cn(
                  "rounded-sm",
                  positive ? "bg-signal-buy/70" : "bg-signal-sell/70"
                )}
                style={{ height: `${h}%`, minHeight: "1px" }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-2xs text-ink-tertiary mt-2 font-mono">
        <span>{series[0]?.date}</span>
        <span>{series[series.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function FlowTable({
  rows,
  tickerKey,
  nameKey,
  netKey,
  pctKey,
  priceKey,
  changeKey,
}: {
  rows: FlowRow[];
  tickerKey: string;
  nameKey: string;
  netKey: string;
  pctKey: string;
  priceKey: string;
  changeKey: string;
}) {
  return (
    <div className="surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-bg-hover text-2xs uppercase tracking-wider text-ink-tertiary">
            <tr>
              <th className="text-left px-3 py-2 font-medium">#</th>
              <th className="text-left px-3 py-2 font-medium">代码</th>
              <th className="text-left px-3 py-2 font-medium">名称</th>
              <th className="text-right px-3 py-2 font-medium">最新价</th>
              <th className="text-right px-3 py-2 font-medium">涨跌幅</th>
              <th className="text-right px-3 py-2 font-medium">主力净流入</th>
              <th className="text-right px-3 py-2 font-medium">占比</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const ticker = String(r[tickerKey] || "");
              const change = Number(r[changeKey] || 0);
              const net = Number(r[netKey] || 0);
              return (
                <tr
                  key={i}
                  className="border-t border-border-subtle hover:bg-bg-hover/50 transition-colors"
                >
                  <td className="px-3 py-2 text-ink-tertiary font-mono text-xs">{i + 1}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {ticker ? (
                      <Link
                        href={`/decision?ticker=${ticker}`}
                        className="text-ink-primary hover:text-accent"
                      >
                        {ticker}
                      </Link>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2 text-ink-primary">{String(r[nameKey] || "—")}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {r[priceKey] != null ? Number(r[priceKey]).toFixed(2) : "—"}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-mono text-xs",
                      change >= 0 ? "text-signal-buy" : "text-signal-sell"
                    )}
                  >
                    {fmtPct(change)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-mono text-xs",
                      net >= 0 ? "text-signal-buy" : "text-signal-sell"
                    )}
                  >
                    {net >= 0 ? (
                      <ArrowUpRight className="inline w-3 h-3 mr-0.5" />
                    ) : (
                      <ArrowDownRight className="inline w-3 h-3 mr-0.5" />
                    )}
                    {fmtFlow(net)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-ink-secondary">
                    {fmtPct(Number(r[pctKey]))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectorTable({ rows }: { rows: FlowRow[] }) {
  // akshare returns columns like: 名称, 今日涨跌幅, 今日主力净流入-净额, 今日主力净流入-净占比, ...
  const sample = rows[0] || {};
  const keys = Object.keys(sample);
  const nameKey = keys.find((k) => /名称/.test(k)) || keys[1] || keys[0];
  const changeKey = keys.find((k) => /涨跌幅/.test(k)) || keys[2];
  const netKey = keys.find((k) => /主力净流入-净额|主力净流入$/.test(k)) || keys[3];
  const pctKey = keys.find((k) => /净占比/.test(k)) || keys[4];

  return (
    <div className="surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-bg-hover text-2xs uppercase tracking-wider text-ink-tertiary">
            <tr>
              <th className="text-left px-3 py-2 font-medium">#</th>
              <th className="text-left px-3 py-2 font-medium">板块名称</th>
              <th className="text-right px-3 py-2 font-medium">涨跌幅</th>
              <th className="text-right px-3 py-2 font-medium">主力净流入</th>
              <th className="text-right px-3 py-2 font-medium">占比</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const change = Number(r[changeKey || ""] || 0);
              const net = Number(r[netKey || ""] || 0);
              return (
                <tr key={i} className="border-t border-border-subtle hover:bg-bg-hover/50">
                  <td className="px-3 py-2 text-ink-tertiary font-mono text-xs">{i + 1}</td>
                  <td className="px-3 py-2 text-ink-primary">{String(r[nameKey] || "—")}</td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-mono text-xs",
                      change >= 0 ? "text-signal-buy" : "text-signal-sell"
                    )}
                  >
                    {fmtPct(change)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-mono text-xs",
                      net >= 0 ? "text-signal-buy" : "text-signal-sell"
                    )}
                  >
                    {fmtFlow(net)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-ink-secondary">
                    {fmtPct(Number(r[pctKey || ""]))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
