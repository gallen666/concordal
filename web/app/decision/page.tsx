"use client";

import { useState } from "react";
import { api, type DecisionTrace } from "../lib/api";

export default function DecisionPage() {
  const [ticker, setTicker] = useState("AAPL");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DecisionTrace | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const job = await api.createDecision({ ticker, debate_rounds: 2 });
      // Poll
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const j = await api.getDecision(job.job_id);
        if (j.status === "done") {
          setResult(j.result);
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
      <h2 style={{ fontSize: 22 }}>New decision</h2>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="AAPL"
          style={{
            padding: 8,
            background: "#0d1117",
            border: "1px solid #30363d",
            color: "white",
            borderRadius: 6,
            width: 140,
          }}
        />
        <button
          onClick={run}
          disabled={loading}
          style={{
            padding: "8px 14px",
            background: loading ? "#30363d" : "#2da44e",
            color: "white",
            border: 0,
            borderRadius: 6,
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "Running 7 agents…" : "Run"}
        </button>
      </div>

      {error && (
        <p style={{ color: "#f85149", marginTop: 12 }}>Error: {error}</p>
      )}

      {result && <DecisionDetail trace={result} />}
    </div>
  );
}

function DecisionDetail({ trace }: { trace: DecisionTrace }) {
  const d = trace.decision;
  return (
    <div style={{ marginTop: 24 }}>
      <div
        style={{
          padding: 16,
          background: "#161b22",
          border: "1px solid #30363d",
          borderRadius: 8,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>
            {d.ticker}{" "}
            <span
              style={{
                marginLeft: 8,
                padding: "2px 8px",
                background: sideColor(d.side),
                color: "white",
                borderRadius: 4,
                fontSize: 14,
              }}
            >
              {d.side}
            </span>
          </h3>
          <span style={{ color: "#8b9bb4", fontSize: 14 }}>
            asof {d.asof} · weight {d.target_weight.toFixed(3)} · conf{" "}
            {(d.confidence * 100).toFixed(0)}%
          </span>
        </div>
        <p style={{ marginTop: 8, color: "#c9d1d9" }}>{d.rationale}</p>
        <p style={{ color: "#8b9bb4", fontSize: 13 }}>
          <strong>Risk:</strong> {d.risk_notes}
        </p>
      </div>

      <Section title="Analyst reports">
        {trace.analyst_reports.map((r) => (
          <div
            key={r.analyst}
            style={{
              padding: 12,
              background: "#0d1117",
              border: "1px solid #21262d",
              borderRadius: 6,
              marginBottom: 8,
            }}
          >
            <strong style={{ textTransform: "capitalize" }}>{r.analyst}</strong>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>
              {r.body}
            </pre>
          </div>
        ))}
      </Section>

      {trace.researcher_debate && (
        <Section title="Bull / Bear debate">
          {trace.researcher_debate.turns.map((t, i) => (
            <div
              key={i}
              style={{
                padding: 10,
                marginBottom: 6,
                borderLeft: `3px solid ${
                  t.speaker === "bull" ? "#2da44e" : "#f85149"
                }`,
                background: "#0d1117",
              }}
            >
              <strong>
                Round {t.round} · {t.speaker.toUpperCase()}
              </strong>
              <p style={{ margin: 0, marginTop: 4 }}>{t.content}</p>
            </div>
          ))}
          {trace.researcher_debate.synthesis && (
            <p style={{ color: "#8b9bb4", marginTop: 8 }}>
              <strong>Synthesis:</strong> {trace.researcher_debate.synthesis}
            </p>
          )}
        </Section>
      )}

      {trace.risk_debate && (
        <Section title="Risk committee">
          {trace.risk_debate.turns.map((t, i) => (
            <div
              key={i}
              style={{
                padding: 10,
                marginBottom: 6,
                borderLeft: `3px solid ${riskColor(t.speaker)}`,
                background: "#0d1117",
              }}
            >
              <strong>{t.speaker.toUpperCase()}</strong>
              <p style={{ margin: 0, marginTop: 4 }}>{t.content}</p>
            </div>
          ))}
        </Section>
      )}

      {trace.trader_plan && (
        <Section title="Trader plan">
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
            {trace.trader_plan}
          </pre>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 24 }}>
      <h4 style={{ margin: "0 0 8px 0" }}>{title}</h4>
      {children}
    </div>
  );
}

function sideColor(s: string): string {
  return (
    {
      BUY: "#2da44e",
      OVERWEIGHT: "#56d364",
      HOLD: "#8b9bb4",
      UNDERWEIGHT: "#d4a72c",
      SELL: "#f85149",
    } as Record<string, string>
  )[s] || "#8b9bb4";
}

function riskColor(s: string): string {
  return (
    {
      aggressive: "#2da44e",
      neutral: "#8b9bb4",
      conservative: "#f85149",
    } as Record<string, string>
  )[s] || "#8b9bb4";
}
