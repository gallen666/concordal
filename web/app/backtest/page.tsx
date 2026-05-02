"use client";

import { useState } from "react";
import { api } from "../lib/api";

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
      const job = await api.createBacktest({ ticker, days, baselines_only: true });
      for (let i = 0; i < 240; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const j = await api.getBacktest(job.job_id);
        if (j.status === "done") {
          setRows(j.result?.rows ?? null);
          break;
        }
        if (j.status === "error") {
          setError(j.error);
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
    <div>
      <h2 style={{ fontSize: 22 }}>Backtest</h2>
      <p style={{ color: "#8b9bb4" }}>
        Compare agent vs. baselines on historical data. No-lookahead enforced
        at the adapter boundary.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          style={inp}
        />
        <input
          type="number"
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value) || 120)}
          style={{ ...inp, width: 90 }}
        />
        <button onClick={run} disabled={loading} style={btn(loading)}>
          {loading ? "Running…" : "Run"}
        </button>
      </div>
      {error && <p style={{ color: "#f85149" }}>{error}</p>}
      {rows && (
        <table style={{ marginTop: 16, borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #30363d", textAlign: "left" }}>
              <th style={th}>Strategy</th>
              <th style={th}>Cumulative</th>
              <th style={th}>Annual</th>
              <th style={th}>Sharpe</th>
              <th style={th}>Max DD</th>
              <th style={th}>#Trades</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} style={{ borderBottom: "1px solid #21262d" }}>
                <td style={td}>{r.name}</td>
                <td style={td}>{pct(r.metrics.cumulative_return)}</td>
                <td style={td}>{pct(r.metrics.annual_return)}</td>
                <td style={td}>{r.metrics.sharpe?.toFixed(2)}</td>
                <td style={td}>{pct(r.metrics.max_drawdown)}</td>
                <td style={td}>{r.metrics.n_trades}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function pct(v: number) {
  return (v * 100).toFixed(2) + "%";
}

const inp: React.CSSProperties = {
  padding: 8,
  background: "#0d1117",
  border: "1px solid #30363d",
  color: "white",
  borderRadius: 6,
  width: 140,
};
const th: React.CSSProperties = { padding: 8, fontWeight: 600, color: "#8b9bb4" };
const td: React.CSSProperties = { padding: 8 };
function btn(loading: boolean): React.CSSProperties {
  return {
    padding: "8px 14px",
    background: loading ? "#30363d" : "#2da44e",
    color: "white",
    border: 0,
    borderRadius: 6,
    cursor: loading ? "default" : "pointer",
  };
}
