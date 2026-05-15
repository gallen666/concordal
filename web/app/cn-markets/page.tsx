"use client";

/**
 * /cn-markets — Eastmoney-parity A-share data overlay.
 *
 * Two flagship retail-attention datasets fetched live from akshare:
 *   - 北向资金 net inflow (last 30 days)
 *   - 龙虎榜 today's top block trades
 *
 * These are the data points 东方财富 users check obsessively. Surfacing them
 * here closes the obvious "they have data we don't" gap without trying to
 * out-Eastmoney on volume.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, ArrowRight, Activity } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

interface NorthFlowRow { date: string; net_inflow_wy: number; }
interface NorthFlow { status: string; rows: NorthFlowRow[]; source?: string; message?: string; }

interface LhbRow { [k: string]: string | number; }
interface Lhb { status: string; date?: string; rows: LhbRow[]; source?: string; message?: string; }

export default function CnMarketsPage() {
  const [north, setNorth] = useState<NorthFlow | null>(null);
  const [lhb, setLhb] = useState<Lhb | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/v1/cn/north-flow?days=30`).then((r) => r.json()).catch(() => ({ status: "unavailable", rows: [] })),
      fetch(`${API_BASE}/v1/cn/lhb`).then((r) => r.json()).catch(() => ({ status: "unavailable", rows: [] })),
    ]).then(([n, l]) => {
      setNorth(n); setLhb(l);
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <header className="mb-10">
        <div className="kicker mb-3"><Activity className="w-3.5 h-3.5" /> A 股数据 / A-share data</div>
        <h1 className="display text-3xl md:text-4xl text-ink-primary tracking-tighter">
          北向资金 · 龙虎榜
        </h1>
        <p className="text-ink-primary/65 italic mt-2 display text-xl">
          Northbound flow · Block-trade leaderboard
        </p>
        <p className="text-ink-secondary mt-4 max-w-2xl text-sm leading-relaxed">
          来自东方财富/akshare 的实时数据，无需 API key。这两个数据集是 A 股散户决策的"基本动作"——
          北向资金看长期定调，龙虎榜看短期主力意图。
        </p>
      </header>

      {/* Tab strip to the three new sibling pages — fund-flow / sectors / zt-pool.
          Pure navigation; this landing page keeps showing 北向 + 龙虎. */}
      <nav className="flex items-center gap-2 mb-8 flex-wrap text-sm border-b border-border-subtle pb-3">
        <span className="text-2xs uppercase tracking-wider text-ink-tertiary mr-2">
          A 股工具:
        </span>
        <Link
          href="/cn-markets/fund-flow"
          className="px-3 py-1 rounded surface text-ink-secondary hover:text-accent hover:border-accent/30 transition"
        >
          💰 资金流向
        </Link>
        <Link
          href="/cn-markets/sectors"
          className="px-3 py-1 rounded surface text-ink-secondary hover:text-accent hover:border-accent/30 transition"
        >
          🔥 板块热力图
        </Link>
        <Link
          href="/hot/zt-pool"
          className="px-3 py-1 rounded surface text-ink-secondary hover:text-accent hover:border-accent/30 transition"
        >
          ⚡ 涨停股池
        </Link>
        <Link
          href="/hot"
          className="px-3 py-1 rounded surface text-ink-secondary hover:text-accent hover:border-accent/30 transition ml-auto"
        >
          🌡 人气榜 →
        </Link>
      </nav>

      {loading && (
        <div className="text-center text-ink-tertiary font-mono uppercase tracking-kicker py-20">
          loading…
        </div>
      )}

      {!loading && (
        <>
          <NorthSection data={north} />
          <LhbSection data={lhb} />
        </>
      )}
    </div>
  );
}

function NorthSection({ data }: { data: NorthFlow | null }) {
  if (!data || data.status !== "ok" || data.rows.length === 0) {
    return (
      <section className="surface-elev p-6 mb-10">
        <h2 className="display text-2xl text-ink-primary mb-2">北向资金 · Northbound flow</h2>
        <p className="text-sm text-ink-tertiary font-mono">
          {data?.message || "Data temporarily unavailable. akshare may be rate-limited from this region."}
        </p>
      </section>
    );
  }
  const rows = data.rows;
  const total30 = rows.reduce((s, r) => s + (r.net_inflow_wy || 0), 0);
  const positive = total30 >= 0;

  return (
    <section className="mb-12">
      <div className="flex items-baseline justify-between flex-wrap gap-3 mb-5">
        <h2 className="display text-2xl text-ink-primary">北向资金 · Northbound flow</h2>
        <span className="text-xs text-ink-tertiary font-mono uppercase tracking-wider">
          Last {rows.length} sessions · 单位 万元
        </span>
      </div>
      <div className="surface-elev p-6">
        <div className="flex items-baseline gap-4 mb-5">
          <div className={`text-3xl font-mono tabular-nums ${positive ? "text-signal-buy" : "text-signal-sell"}`}>
            {positive ? "+" : ""}{fmtWy(total30)}
          </div>
          <div className="text-xs text-ink-tertiary uppercase tracking-kicker">30-day net</div>
        </div>
        <Bars rows={rows} />
        <div className="text-2xs text-ink-tertiary font-mono uppercase tracking-wider mt-3 text-right">
          {data.source}
        </div>
      </div>
    </section>
  );
}

function Bars({ rows }: { rows: NorthFlowRow[] }) {
  const W = 800, H = 120, P = 4;
  const max = Math.max(...rows.map((r) => Math.abs(r.net_inflow_wy)));
  const bw = (W - 2 * P) / rows.length;
  const mid = H / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <line x1={P} x2={W - P} y1={mid} y2={mid} stroke="rgba(232,220,196,0.10)" />
      {rows.map((r, i) => {
        const h = (Math.abs(r.net_inflow_wy) / max) * (mid - 4);
        const x = P + i * bw + 1;
        const up = r.net_inflow_wy >= 0;
        return (
          <rect
            key={r.date}
            x={x}
            y={up ? mid - h : mid}
            width={Math.max(1, bw - 2)}
            height={h}
            fill={up ? "#3FB950" : "#F85149"}
            opacity="0.85"
          />
        );
      })}
    </svg>
  );
}

function fmtWy(v: number): string {
  if (Math.abs(v) >= 100_000) return (v / 10_000).toFixed(1) + " 亿元";
  return v.toFixed(0) + " 万元";
}

function LhbSection({ data }: { data: Lhb | null }) {
  if (!data || data.status !== "ok" || data.rows.length === 0) {
    return (
      <section className="surface-elev p-6">
        <h2 className="display text-2xl text-ink-primary mb-2">龙虎榜 · Block-trade leaderboard</h2>
        <p className="text-sm text-ink-tertiary font-mono">
          {data?.message || "No data for today (markets may be closed)."}
        </p>
      </section>
    );
  }
  const cols = Object.keys(data.rows[0]).slice(0, 6); // first 6 columns
  return (
    <section>
      <div className="flex items-baseline justify-between flex-wrap gap-3 mb-5">
        <h2 className="display text-2xl text-ink-primary">龙虎榜 · Block-trade leaderboard</h2>
        <span className="text-xs text-ink-tertiary font-mono uppercase tracking-wider">{data.date}</span>
      </div>
      <div className="surface-elev overflow-x-auto">
        <table className="w-full text-sm tabular">
          <thead>
            <tr className="border-b border-border bg-bg-subtle text-ink-tertiary text-left">
              {cols.map((c) => (
                <th key={c} className="px-3 py-3 label-cap whitespace-nowrap">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.slice(0, 20).map((r, i) => (
              <tr key={i} className="border-b border-border-subtle last:border-b-0 hover:bg-bg-hover">
                {cols.map((c) => (
                  <td key={c} className="px-3 py-2.5 whitespace-nowrap font-mono text-ink-primary text-xs">
                    {String(r[c]).slice(0, 24)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-2xs text-ink-tertiary font-mono uppercase tracking-wider mt-3 text-right">
        {data.source}
      </p>
    </section>
  );
}
