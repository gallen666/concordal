"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, auth } from "../lib/api";

export default function RedeemPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.redeem({ email, invite_code: code });
      auth.setToken(res.token);
      router.push("/watchlist");
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 460, margin: "60px auto", padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>Redeem invite code</h2>
      <p style={{ color: "#8b9bb4" }}>Enter the email + code we sent you.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email"
          style={inp}
          disabled={loading}
        />
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="invite code"
          style={inp}
          disabled={loading}
        />
        <button
          onClick={submit}
          disabled={loading || !email || !code}
          style={{
            padding: "10px 14px",
            background: loading ? "#30363d" : "#2da44e",
            color: "white",
            border: 0,
            borderRadius: 6,
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "Redeeming…" : "Redeem"}
        </button>
        {error && (
          <p style={{ color: "#f85149", margin: 0, fontSize: 14 }}>{error}</p>
        )}
      </div>
      <p style={{ marginTop: 24, color: "#5b6470", fontSize: 13 }}>
        Don't have a code?{" "}
        <a href="/" style={{ color: "#56d364" }}>
          Join the waitlist
        </a>
        .
      </p>
    </div>
  );
}

const inp: React.CSSProperties = {
  padding: 10,
  background: "#0d1117",
  border: "1px solid #30363d",
  color: "white",
  borderRadius: 6,
  fontSize: 15,
};
