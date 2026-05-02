"use client";

import { useEffect, useState } from "react";
import { auth } from "../lib/api";

interface Item {
  ticker: string;
  market: string;
  note?: string;
}

const BASE = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

function authedFetch(path: string, init?: RequestInit) {
  const tok = auth.getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string>) || {}),
  };
  if (tok) headers["Authorization"] = `Bearer ${tok}`;
  return fetch(`${BASE}${path}`, { ...init, headers });
}

export default function WatchlistPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [ticker, setTicker] = useState("");

  async function load() {
    const r = await authedFetch("/v1/watchlist");
    if (r.ok) setItems(await r.json());
  }

  useEffect(() => {
    if (!auth.isLoggedIn() && typeof window !== "undefined") {
      window.location.href = "/redeem";
      return;
    }
    load();
  }, []);

  async function add() {
    if (!ticker) return;
    await authedFetch("/v1/watchlist/items", {
      method: "POST",
      body: JSON.stringify({ ticker, market: "us_equity" }),
    });
    setTicker("");
    load();
  }

  return (
    <div>
      <h2 style={{ fontSize: 22 }}>Watchlist</h2>
      <p style={{ color: "#8b9bb4" }}>
        Tickers here will get an automatic pre-market briefing each trading day
        (when the daily-cron worker is enabled).
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="Add ticker (e.g. NVDA)"
          style={{
            padding: 8,
            background: "#0d1117",
            border: "1px solid #30363d",
            color: "white",
            borderRadius: 6,
            width: 240,
          }}
        />
        <button
          onClick={add}
          style={{
            padding: "8px 14px",
            background: "#2da44e",
            color: "white",
            border: 0,
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Add
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        {items.length === 0 ? (
          <p style={{ color: "#5b6470" }}>No tickers yet.</p>
        ) : (
          items.map((i) => (
            <div
              key={i.ticker}
              style={{
                padding: 12,
                marginBottom: 6,
                border: "1px solid #21262d",
                borderRadius: 6,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <strong>{i.ticker}</strong>
              <span style={{ color: "#8b9bb4" }}>{i.market}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
