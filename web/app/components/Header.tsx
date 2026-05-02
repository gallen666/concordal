"use client";

import { useEffect, useState } from "react";
import { auth, api, type CurrentUser } from "../lib/api";

export default function Header() {
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    if (!auth.isLoggedIn()) return;
    api.me()
      .then(setUser)
      .catch(() => auth.clearToken());
  }, []);

  function logout() {
    auth.clearToken();
    window.location.href = "/";
  }

  return (
    <header
      style={{
        padding: "16px 24px",
        borderBottom: "1px solid #21262d",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <a
        href="/"
        style={{ color: "white", textDecoration: "none", fontWeight: 600 }}
      >
        TradingAgents
      </a>
      <nav style={{ display: "flex", gap: 16, fontSize: 14, alignItems: "center" }}>
        {user ? (
          <>
            <a href="/watchlist" style={lk}>
              Watchlist
            </a>
            <a href="/decision" style={lk}>
              New Decision
            </a>
            <a href="/backtest" style={lk}>
              Backtest
            </a>
            <span
              style={{
                padding: "2px 8px",
                background: user.real_llm ? "#1a4731" : "#3a2a0a",
                color: user.real_llm ? "#7ee2a8" : "#f3c969",
                borderRadius: 4,
                fontSize: 12,
              }}
              title={
                user.real_llm
                  ? "Real LLM enabled for your account"
                  : "Mock mode - upgrade to real LLM access"
              }
            >
              {user.real_llm ? "REAL" : "MOCK"}
            </span>
            <span style={{ color: "#5b6470", fontSize: 12 }}>{user.id}</span>
            <button
              onClick={logout}
              style={{
                background: "transparent",
                border: "1px solid #30363d",
                color: "#8b9bb4",
                padding: "4px 10px",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Logout
            </button>
          </>
        ) : (
          <a href="/redeem" style={lk}>
            Redeem invite
          </a>
        )}
      </nav>
    </header>
  );
}

const lk: React.CSSProperties = { color: "#8b9bb4", textDecoration: "none" };
