import type { Metadata } from "next";
import Header from "./components/Header";

export const metadata: Metadata = {
  title: "TradingAgents — Decision Support",
  description:
    "Multi-agent LLM research assistant. Decision support, not investment advice.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          margin: 0,
          background: "#0b0d10",
          color: "#e7eaee",
        }}
      >
        <Header />
        <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
          {children}
        </main>
        <footer
          style={{
            padding: "16px 24px",
            color: "#5b6470",
            fontSize: 12,
            textAlign: "center",
          }}
        >
          ⚠️ Decision-support tool only. Not investment advice. See{" "}
          <a href="/disclaimer" style={{ color: "#8b9bb4" }}>
            disclaimer
          </a>
          .
        </footer>
      </body>
    </html>
  );
}
