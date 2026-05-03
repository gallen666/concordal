"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Loader2, Play, TrendingDown, TrendingUp } from "lucide-react";
import { api } from "../lib/api";
import { cn } from "../lib/cn";

type Row = { name: string; metrics: Record<string, number> };

export default function BacktestPage() {
  const [ticker, setTicker] = useState("AAPL");
  const [days, setDays] = useState(120);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setRows(null);
    try {
      const job = await api.createBacktest({
        ticker,
        days,
        baselines_only: true,
      });
      for (let i = 0; i < 240; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const j = await api.getBacktest(job.job_id);
        if (j.status === "done") {
          setRows(j.result?.rows ?? null);
          break;
        }
        if (j.status === "error") {
          setError(j.error || "Backtest failed");
          break;
        }
      }
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="mb-8">
        <span className="label-cap">Backtest</span>
        <h1 className="text-2xl font-semibold mt-1">
          Compare strategies over a window
        </h1>
        <p className="text-sm text-ink-secondary mt-1">
          5 deterministic baselines (Buy &amp; Hold, MACD, KDJ+RSI, SMA, ZMR)
          run with strict no-lookahead enforced at the data layer.
        </p>
      </div>

      <div className="surface-elev p-3 flex flex-col sm:flex-row gap-2 mb-6">
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          className="input flex-1 sm:max-w-xs font-mono uppercase"
          placeholder="AAPL"
        />
        <input
          type="number"
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value) || 120)}
          className="input w-24"
          min={30}
          max={365}
        />
        <button onClick={run} disabled={loading} className="btn-primary">
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Running…
            </>
          ) : (
            <>
              <Play className="w-4 h-4" /> Run
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="surface p-4 border-signal-sell/30 text-signal-sell text-sm">
          {error}
        </div>
      )}

      {loading && !rows && (
        <div className="grid lg:grid-cols-3 gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="surface p-5 h-32 animate-pulse bg-bg-hover/30"
            />
          ))}
        </div>
      )}

      {rows && <Results rows={rows} />}
    </div>
  );
}

function Results({ rows }: { rows: Row[] }) {
  const sorted = [...rows].sort(
    (a, b) =>
      (b.metrics?.cumulative_return ?? 0) -
      (a.metrics?.cumulative_return ?? 0)
  );
  const winner = sorted[0];

  // Bar chart data: cumulative return per strategy
  const chartData = rows.map((r) => ({
    name: r.name,
    cum: (r.metrics?.cumulative_return ?? 0) * 100,
    sharpe: r.metrics?.sharpe ?? 0,
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid sm:grid-cols-3 gap-3">
        <Tile
          label="Best strategy"
          value={winner.name}
          accent
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <Tile
          label="Best cumulative"
          value={`${(winner.metrics.cumulative_return * 100).toFixed(2)}%`}
          mono
        />
        <Tile
          label="Best Sharpe"
          value={`${
            sorted.sort(
              (a, b) => (b.metrics.sharpe ?? 0) - (a.metrics.sharpe ?? 0)
            )[0].metrics.sharpe?.toFixed(2)
          }`}
          mono
        />
      </div>

      <div className="surface p-5">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-4 h-4 text-ink-tertiary" />
          <h2 className="text-sm font-medium">Cumulative return by strategy</h2>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 10, left: -10 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: "#9aa6b8", fontSize: 11 }}
                axisLine={{ stroke: "#272d36" }}
                tickLine={{ stroke: "#272d36" }}
              />
              <YAxis
                tick={{ fill: "#9aa6b8", fontSize: 11 }}
                axisLine={{ stroke: "#272d36" }}
                tickLine={{ stroke: "#272d36" }}
                tickFormatter={(v) => `${v.toFixed(0)}%`}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={{
                  background: "#11151a",
                  border: "1px solid #272d36",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => `${v.toFixed(2)}%`}
              />
              <Bar dataKey="cum" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, idx) => (
                  <rect
                    key={idx}
                    fill={
                      entry.cum >= 0 ? "#3fb950" : "#f85149"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="surface overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-subtle">
            <tr className="text-left">
              <Th>Strategy</Th>
              <Th align="right">Cumulative</Th>
              <Th align="right">Annual</Th>
              <Th align="right">Sharpe</Th>
              <Th align="right">Max DD</Th>
              <Th align="right">Win rate</Th>
              <Th align="right">#Trades</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={r.name}
                className="border-t border-border-subtle hover:bg-bg-hover/40"
              >
                <td className="px-4 py-3 font-medium">
                  <div className="flex items-center gap-2">
                    {r.name === winner.name && (
                      <span className="text-accent">★</span>
                    )}
                    {r.name}
                  </div>
                </td>
                <Td v={r.metrics.cumulative_return} pct signed />
                <Td v={r.metrics.annual_return} pct signed />
                <Td v={r.metrics.sharpe} mono />
                <Td v={r.metrics.max_drawdown} pct signed />
                <Td v={r.metrics.win_rate} pct />
                <Td v={r.metrics.n_trades} int />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  mono,
  accent,
  icon,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="surface p-4">
      <div className="flex items-center justify-between">
        <span className="label-cap">{label}</span>
        {icon && <span className="text-ink-tertiary">{icon}</span>}
      </div>
      <div
        className={cn(
          "mt-1 text-xl font-semibold",
          mono && "font-mono",
          accent && "text-accent"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={cn(
        "px-4 py-2 label-cap font-medium",
        align === "right" && "text-right"
      )}
    >
      {children}
    </th>
  );
}

function Td({
  v,
  pct,
  signed,
  mono,
  int,
}: {
  v: number | undefined;
  pct?: boolean;
  signed?: boolean;
  mono?: boolean;
  int?: boolean;
}) {
  if (v === undefined || v === null) {
    return <td className="px-4 py-3 text-right text-ink-tertiary">—</td>;
  }
  let display: string;
  if (int) display = `${v}`;
  else if (pct) {
    const num = (v * 100).toFixed(2);
    display = signed && v >= 0 ? `+${num}%` : `${num}%`;
  } else {
    display = v.toFixed(2);
  }
  const positive = signed && v > 0;
  const negative = signed && v < 0;
  return (
    <td
      className={cn(
        "px-4 py-3 text-right tabular-nums",
        mono && "font-mono",
        positive && "text-signal-buy",
        negative && "text-signal-sell"
      )}
    >
      {display}
    </td>
  );
}
