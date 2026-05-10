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
import { AlertTriangle, BarChart3, CheckCircle2, Loader2, Network, Play, TrendingDown, TrendingUp } from "lucide-react";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { useT } from "../lib/i18n";

type Row = {
  name: string;
  metrics: Record<string, number>;
  cross_validation?: {
    backtrader_metrics: Record<string, number>;
    ann_return_diff_pct: number;
    sharpe_diff: number;
    max_dd_diff_pct: number;
    flagged_disagreement: boolean;
    notes: string[];
  };
};

export default function BacktestPage() {
  const { t } = useT();
  const [ticker, setTicker] = useState("AAPL");
  const [days, setDays] = useState(120);
  const [crossValidate, setCrossValidate] = useState(false);
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
        cross_validate: crossValidate,
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
        <span className="label-cap">{t("backtest.label")}</span>
        <h1 className="text-2xl font-semibold mt-1">
          {t("backtest.heading")}
        </h1>
        <p className="text-sm text-ink-secondary mt-1">
          {t("backtest.subheading")}
        </p>
      </div>

      <div className="surface-elev p-3 flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
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
              <Loader2 className="w-4 h-4 animate-spin" /> {t("backtest.running")}
            </>
          ) : (
            <>
              <Play className="w-4 h-4" /> {t("backtest.run")}
            </>
          )}
        </button>
      </div>

      {/* Cross-validation toggle — separate row so the explainer can fit */}
      <label className="flex items-start gap-2.5 mb-6 cursor-pointer text-sm group">
        <input
          type="checkbox"
          checked={crossValidate}
          onChange={(e) => setCrossValidate(e.target.checked)}
          disabled={loading}
          className="mt-0.5 accent-accent"
        />
        <div className="flex-1">
          <div className="flex items-center gap-1.5 text-ink-primary group-hover:text-accent transition-colors">
            <Network className="w-3.5 h-3.5" />
            {t("backtest.crossValidate")}
          </div>
          <div className="text-xs text-ink-tertiary mt-0.5">
            {t("backtest.crossValidateBody")}
          </div>
        </div>
      </label>

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
  const hasCv = rows.some((r) => r.cross_validation);
  const flaggedRows = rows.filter((r) => r.cross_validation?.flagged_disagreement);

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
              {hasCv && <Th align="right">vs Backtrader</Th>}
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
                {hasCv && <CvCell cv={r.cross_validation} />}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cross-validation summary banner */}
      {hasCv && (
        <div className={cn(
          "surface p-4 flex gap-3 items-start",
          flaggedRows.length > 0
            ? "border-signal-warn/30 bg-signal-warn_soft/40"
            : "border-signal-buy/30 bg-signal-buy_soft/40",
        )}>
          {flaggedRows.length > 0 ? (
            <AlertTriangle className="w-5 h-5 text-signal-warn shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-signal-buy shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-sm">
            <div className="font-semibold text-ink-primary">
              {flaggedRows.length > 0
                ? `Cross-validation flagged ${flaggedRows.length} disagreement(s)`
                : "All strategies cross-validated within tolerance"}
            </div>
            <p className="text-ink-secondary mt-1 leading-relaxed">
              Each strategy was independently replayed through the Backtrader
              broker simulator. Differences {">"} 0.5pp annualised return,
              0.3 Sharpe, or 0.5pp max-drawdown are flagged. Small diffs
              (rounding, intra-day timestamping) are normal; large diffs
              indicate a bug in either engine.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function CvCell({ cv }: { cv: Row["cross_validation"] }) {
  if (!cv) {
    return <td className="px-4 py-3 text-right text-ink-tertiary">—</td>;
  }
  return (
    <td
      className={cn(
        "px-4 py-3 text-right tabular-nums font-mono text-xs",
        cv.flagged_disagreement
          ? "text-signal-warn"
          : "text-signal-buy",
      )}
      title={cv.notes.join("\n")}
    >
      <div className="flex items-center justify-end gap-1">
        {cv.flagged_disagreement ? (
          <AlertTriangle className="w-3 h-3" />
        ) : (
          <CheckCircle2 className="w-3 h-3" />
        )}
        Δ {cv.ann_return_diff_pct.toFixed(2)}pp
      </div>
    </td>
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
