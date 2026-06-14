import { ImageResponse } from "next/og";

/**
 * Default OG image for the landing page and any route that doesn't override.
 * Renders a branded social-share preview — dialectic mark on the left, headline
 * on the right, dark warm background. Generated on-the-fly by Next.js, cached
 * by Vercel's edge.
 *
 * Routes that want their own OG image (e.g. /blog/[slug]) can add their own
 * `opengraph-image.tsx` inside that route segment.
 */

export const runtime = "edge";
export const alt = "Concordal — Seven AI analysts debate every ticker";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0E0C0A",
          backgroundImage:
            "linear-gradient(90deg, rgba(90,138,111,0.10) 0%, transparent 30%, transparent 70%, rgba(160,82,74,0.10) 100%)",
          color: "#EDE6D8",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "70px 80px",
          fontFamily: "Georgia, serif",
        }}
      >
        {/* Top — brand + kicker */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {/* dialectic mark */}
          <svg width="44" height="44" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 4 A10 10 0 0 0 14 24 Z" fill="#5A8A6F" />
            <path d="M14 4 A10 10 0 0 1 14 24 Z" fill="#A0524A" />
            <rect x="13" y="3" width="2" height="22" fill="#C9A961" />
          </svg>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
            <div style={{ fontSize: 26, fontWeight: 600 }}>Concordal</div>
            <div style={{ fontSize: 12, letterSpacing: 3, color: "#7A7163", marginTop: 6, textTransform: "uppercase", fontFamily: "ui-monospace, monospace" }}>
              The Decision Dialectic
            </div>
          </div>
        </div>

        {/* Hero — bull / bear / verdict */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 18, alignItems: "baseline" }}>
            <span style={{ fontSize: 12, letterSpacing: 3, color: "#5A8A6F", textTransform: "uppercase", fontFamily: "ui-monospace, monospace" }}>
              The bull
            </span>
            <span style={{ fontSize: 50, color: "#9CC5A8", fontStyle: "italic" }}>&ldquo;Buy.&rdquo;</span>

            <span style={{ width: 1, height: 60, background: "#2F2620", margin: "0 16px" }} />

            <span style={{ fontSize: 12, letterSpacing: 3, color: "#A0524A", textTransform: "uppercase", fontFamily: "ui-monospace, monospace" }}>
              The bear
            </span>
            <span style={{ fontSize: 50, color: "#D08A82", fontStyle: "italic" }}>&ldquo;Sell.&rdquo;</span>
          </div>

          <div style={{ fontSize: 64, lineHeight: 1.05, letterSpacing: "-0.025em", marginTop: 12 }}>
            Seven AI analysts.
          </div>
          <div style={{ fontSize: 64, lineHeight: 1.05, letterSpacing: "-0.025em", color: "#C9A961", fontStyle: "italic" }}>
            One reasoned trade.
          </div>
        </div>

        {/* Bottom strip */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 48, color: "#A8A089", fontFamily: "ui-monospace, monospace", fontSize: 14, letterSpacing: 2, textTransform: "uppercase" }}>
            <span>27 tests · 0 lookahead</span>
            <span>6 LLM providers</span>
            <span>US · A-share · Crypto</span>
          </div>
          <div style={{ color: "#C9A961", fontFamily: "ui-monospace, monospace", fontSize: 14, letterSpacing: 2, textTransform: "uppercase" }}>
            www.concordal.hk
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
