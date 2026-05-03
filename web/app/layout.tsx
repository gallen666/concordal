import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Header from "./components/Header";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TradingAgents — Decision Support",
  description:
    "Seven AI agents debate every ticker on your watchlist. Multi-agent LLM research assistant. Decision support, not investment advice.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 w-full">{children}</main>
        <footer className="mt-auto border-t border-border-subtle py-6 px-6">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-ink-tertiary">
            <div className="flex items-center gap-2">
              <span>⚠️</span>
              <span>
                Decision-support tool only. Not investment advice. Markets are
                unpredictable.
              </span>
            </div>
            <div className="flex items-center gap-4">
              <a href="/disclaimer" className="hover:text-ink-secondary">
                Disclaimer
              </a>
              <a
                href="https://github.com/gallen666/trading-agents-platform"
                className="hover:text-ink-secondary"
              >
                GitHub
              </a>
              <span className="opacity-50">v0.1.0 · Closed beta</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
