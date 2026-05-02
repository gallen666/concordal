"use client";

import { useState } from "react";
import { api } from "./lib/api";

export default function Landing() {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function joinWaitlist() {
    if (!email) return;
    setLoading(true);
    setError(null);
    try {
      await api.joinWaitlist({ email, note });
      setSubmitted(true);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 24 }}>
      <span
        style={{
          display: "inline-block",
          padding: "4px 10px",
          background: "#1f2937",
          border: "1px solid #374151",
          borderRadius: 999,
          fontSize: 12,
          color: "#a3b3c2",
        }}
      >
        Closed Beta · Decision-support, not investment advice
      </span>
      <h1 style={{ fontSize: 40, lineHeight: 1.15, margin: "20px 0 12px" }}>
        Seven AI agents debate every ticker on your watchlist.
      </h1>
      <p style={{ color: "#8b9bb4", fontSize: 17, lineHeight: 1.6 }}>
        TradingAgents simulates a small trading firm — fundamental analyst,
        sentiment analyst, news analyst, technical analyst, bull/bear
        researchers, trader, three-way risk committee, fund manager — and
        produces a fully traceable recommendation you can read line by line.
      </p>

      <div style={{ marginTop: 24, padding: 20, background: "#0f1318", border: "1px solid #1f2937", borderRadius: 12 }}>
        {submitted ? (
          <div>
            <h3 style={{ marginTop: 0 }}>You're on the list ✓</h3>
            <p style={{ color: "#8b9bb4" }}>
              We'll send your invite code as we onboard the first cohort.
              Already have one?{" "}
              <a href="/redeem" style={{ color: "#56d364" }}>
                Redeem here
              </a>
              .
            </p>
          </div>
        ) : (
          <>
            <h3 style={{ marginTop: 0 }}>Request access</h3>
            <p style={{ color: "#8b9bb4", margin: "0 0 16px" }}>
              We're in invite-only beta. Drop your email and we'll send a code.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@firm.com"
                style={inp}
                disabled={loading}
              />
              <button onClick={joinWaitlist} disabled={loading || !email} style={btn(loading)}>
                {loading ? "Sending…" : "Join waitlist"}
              </button>
            </div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="(optional) what would you use this for?"
              style={{ ...inp, marginTop: 8, width: "100%" }}
              disabled={loading}
            />
            {error && (
              <p style={{ color: "#f85149", marginTop: 12, fontSize: 14 }}>
                {error}
              </p>
            )}
            <p style={{ marginTop: 16, fontSize: 13, color: "#5b6470" }}>
              Already have an invite code?{" "}
              <a href="/redeem" style={{ color: "#56d364" }}>
                Redeem
              </a>
            </p>
          </>
        )}
      </div>

      <div style={{ marginTop: 48 }}>
        <h3 style={{ fontSize: 20 }}>What you get</h3>
        <ul style={{ color: "#c9d1d9", lineHeight: 1.8, paddingLeft: 20 }}>
          <li>
            One-click decision: enter a ticker, get an explained Buy / Hold /
            Sell with target weight and confidence — and the full debate log.
          </li>
          <li>
            Backtest replay: see how the agents would have decided on past
            dates, with strict no-lookahead enforced at the data layer.
          </li>
          <li>
            Daily watchlist briefings (rolling out): every ticker you follow
            gets a pre-market report.
          </li>
        </ul>
      </div>

      <div
        style={{
          marginTop: 32,
          padding: 16,
          background: "#161b22",
          border: "1px solid #30363d",
          borderRadius: 8,
          fontSize: 13,
          color: "#8b9bb4",
        }}
      >
        ⚠️ <strong>Decision-support tool only.</strong> Outputs are research,
        not investment advice. We do not execute trades. Past results do not
        predict future results. Read the{" "}
        <a href="/disclaimer" style={{ color: "#56d364" }}>
          full disclaimer
        </a>
        .
      </div>
    </div>
  );
}

const inp: React.CSSProperties = {
  flex: 1,
  padding: 10,
  background: "#0d1117",
  border: "1px solid #30363d",
  color: "white",
  borderRadius: 6,
  fontSize: 15,
};

function btn(loading: boolean): React.CSSProperties {
  return {
    padding: "10px 18px",
    background: loading ? "#30363d" : "#2da44e",
    color: "white",
    border: 0,
    borderRadius: 6,
    cursor: loading ? "default" : "pointer",
    fontWeight: 600,
  };
}
