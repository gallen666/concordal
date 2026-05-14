import { ImageResponse } from "next/og";

/**
 * Dynamic OG image for shared decision pages.
 *
 * Fetches the share payload from the backend at build/request time and
 * renders a card showing ticker + BUY/HOLD/SELL + confidence. Drops into
 * Twitter cards, WeChat link previews, and Linkedin shares.
 *
 * Vercel caches the result on its edge for a few hours; if the underlying
 * decision changes the share-id changes too, so cache invalidation is free.
 */

export const runtime = "edge";
export const alt = "TradingAgents — shared decision";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const API_BASE = process.env.NEXT_PUBLIC_API || "https://trading-agents-api.onrender.com";

export default async function OG({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  let payload: {
    ticker?: string;
    action?: string;
    confidence?: number;
    market?: string;
    decision_date?: string;
  } = {};
  try {
    const r = await fetch(`${API_BASE}/v1/decisions/share/${shareId}`, {
      next: { revalidate: 3600 },
    });
    if (r.ok) {
      const j = await r.json();
      payload = j?.decision || j || {};
    }
  } catch {
    // Best-effort — fall through to the generic card.
  }

  const ticker = (payload.ticker || "?").toUpperCase();
  const action = (payload.action || "HOLD").toUpperCase();
  const conf = payload.confidence ?? 0.5;
  const market = payload.market || "us_equity";
  const dDate = payload.decision_date || new Date().toISOString().slice(0, 10);

  const actionColour =
    action === "BUY"  ? "#3FB950"
    : action === "SELL" ? "#F85149"
    : "#A8A089";
  const actionBg =
    action === "BUY"  ? "rgba(63,185,80,0.10)"
    : action === "SELL" ? "rgba(248,81,73,0.10)"
    : "rgba(168,160,137,0.10)";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%",
          background: "#0E0C0A",
          backgroundImage: "linear-gradient(90deg, rgba(90,138,111,0.10) 0%, transparent 30%, transparent 70%, rgba(160,82,74,0.10) 100%)",
          color: "#EDE6D8",
          display: "flex", flexDirection: "column", justifyContent: "space-between",
          padding: "70px 80px",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="36" height="36" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 4 A10 10 0 0 0 14 24 Z" fill="#5A8A6F" />
            <path d="M14 4 A10 10 0 0 1 14 24 Z" fill="#A0524A" />
            <rect x="13" y="3" width="2" height="22" fill="#C9A961" />
          </svg>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
            <div style={{ fontSize: 24, fontWeight: 600 }}>TradingAgents</div>
            <div style={{ fontSize: 11, letterSpacing: 3, color: "#7A7163", marginTop: 5, textTransform: "uppercase", fontFamily: "ui-monospace, monospace" }}>
              Shared decision · {dDate}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 14, letterSpacing: 3, color: "#7A7163", textTransform: "uppercase", fontFamily: "ui-monospace, monospace" }}>
            {market === "a_share" ? "A-Share" : market === "crypto" ? "Crypto" : "US Equity"}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 28 }}>
            <span style={{ fontSize: 110, fontFamily: "ui-monospace, monospace", fontWeight: 600, letterSpacing: "-0.04em" }}>
              {ticker}
            </span>
            <span
              style={{
                fontSize: 80, color: actionColour, padding: "10px 28px",
                background: actionBg, borderRadius: 6,
                fontFamily: "ui-monospace, monospace", fontWeight: 700,
              }}
            >
              {action}
            </span>
            <span style={{ fontSize: 60, color: "#A8A089", fontFamily: "ui-monospace, monospace" }}>
              conf {conf.toFixed(2)}
            </span>
          </div>
          <div style={{ fontSize: 24, color: "#A8A089", fontStyle: "italic", marginTop: 8 }}>
            Read the full transcript — every analyst, every counter-argument.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 14, letterSpacing: 2, color: "#7A7163", textTransform: "uppercase" }}>
            7 AI analysts · bull / bear debate · confidence-weighted call
          </div>
          <div style={{ color: "#C9A961", fontFamily: "ui-monospace, monospace", fontSize: 14, letterSpacing: 2, textTransform: "uppercase" }}>
            trading-agents-platform.vercel.app/d/{shareId.slice(0, 8)}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
