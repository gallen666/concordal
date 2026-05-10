import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Sparkles, TrendingUp } from "lucide-react";

/**
 * /analysis/[ticker] — server-rendered SEO landing page per ticker.
 *
 * Goals:
 *   - Crawlable by Google + 百度 (server-rendered, full meta tags)
 *   - Long-tail keywords: "AAPL multi-agent analysis", "茅台 AI 决策"
 *   - Funnel into /decision?ticker=AAPL with one click
 *
 * We avoid running an actual decision (LLM cost on every crawl request
 * would be lethal); instead we describe what the system WILL do for the
 * ticker, with the value-prop and proof signals. The CTA opens the real
 * decision page.
 *
 * To scale: pre-generate this list from the user's watchlist + S&P500 +
 * CSI300 (Hang Seng if needed). Per-ticker title/description gives each
 * page a unique <title> + meta — that's what Google indexes.
 */

interface Props {
  params: Promise<{ ticker: string }>;
}

const KNOWN_TICKERS: Record<string, { name: string; market: string; sector: string }> = {
  // US large caps
  AAPL: { name: "Apple Inc.", market: "us_equity", sector: "Technology" },
  NVDA: { name: "NVIDIA Corporation", market: "us_equity", sector: "Semiconductors" },
  TSLA: { name: "Tesla, Inc.", market: "us_equity", sector: "Auto" },
  MSFT: { name: "Microsoft Corporation", market: "us_equity", sector: "Technology" },
  GOOGL: { name: "Alphabet Inc.", market: "us_equity", sector: "Technology" },
  AMZN: { name: "Amazon.com", market: "us_equity", sector: "Consumer / Cloud" },
  META: { name: "Meta Platforms", market: "us_equity", sector: "Technology" },
  // A-share
  "600519": { name: "贵州茅台", market: "a_share", sector: "白酒" },
  "000001": { name: "平安银行", market: "a_share", sector: "Banking" },
  "300750": { name: "宁德时代 (CATL)", market: "a_share", sector: "电池 / Battery" },
  "002594": { name: "比亚迪 (BYD)", market: "a_share", sector: "Auto / EV" },
  // Crypto
  BTC: { name: "Bitcoin", market: "crypto", sector: "Crypto" },
  ETH: { name: "Ethereum", market: "crypto", sector: "Crypto" },
  SOL: { name: "Solana", market: "crypto", sector: "Crypto" },
};

function lookup(ticker: string) {
  const t = ticker.toUpperCase();
  return KNOWN_TICKERS[t] || KNOWN_TICKERS[ticker];
}

// ---- SEO metadata ---------------------------------------------------------

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const t = ticker.toUpperCase();
  const meta = lookup(ticker);
  const name = meta?.name || t;

  const title = `${t} Multi-Agent AI Analysis · ${name} | TradingAgents`;
  const description =
    meta
      ? `5-analyst LLM pipeline (fundamentals + sentiment + news + technical + macro) ` +
        `debates ${name} (${t}) on every run. Real SEC EDGAR / Reddit / OpenBB data. ` +
        `Free first decision; Pro $29/mo for unlimited real-LLM runs.`
      : `Multi-agent AI decision-support analysis for ${t}. ` +
        `5-analyst LLM pipeline + cross-validated backtest. Free trial.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description },
    alternates: { canonical: `/analysis/${t}` },
  };
}

// ---- Page render (RSC) ----------------------------------------------------

export default async function TickerLandingPage({ params }: Props) {
  const { ticker } = await params;
  const t = ticker.toUpperCase();
  const meta = lookup(ticker);
  // We don't 404 unknown tickers — Google would penalise broken links.
  // Unknown tickers still render with a generic frame and the CTA still
  // works; if the user runs the decision and the adapter rejects the
  // ticker, the API surfaces a clear error.

  const decisionLink = `/decision?ticker=${encodeURIComponent(t)}`;

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <header className="mb-8">
        <span className="label-cap text-accent">AI ANALYSIS</span>
        <h1 className="text-4xl font-semibold mt-1 leading-tight font-mono tracking-wider">
          {t}
        </h1>
        {meta && (
          <p className="text-ink-secondary mt-2 leading-relaxed">
            <span className="font-medium text-ink-primary">{meta.name}</span> ·{" "}
            <span className="font-mono text-xs">{meta.market}</span> · {meta.sector}
          </p>
        )}
      </header>

      <section className="surface-elev p-6 mb-6">
        <h2 className="text-lg font-semibold mb-3">
          What the AI does on every {t} request
        </h2>
        <ol className="space-y-2 text-sm text-ink-secondary list-decimal ml-5">
          <li>
            <strong className="text-ink-primary">Fundamentals analyst</strong> reads SEC
            EDGAR XBRL (US) or akshare (A-share) for point-in-time financials —
            no current-snapshot lookahead.
          </li>
          <li>
            <strong className="text-ink-primary">Sentiment analyst</strong> mines Reddit
            (r/wallstreetbets / r/CryptoCurrency) and 东方财富股吧 for retail attention
            and bull/bear keyword skew.
          </li>
          <li>
            <strong className="text-ink-primary">News analyst</strong> pulls real
            timestamped headlines (Reddit / yfinance / akshare).
          </li>
          <li>
            <strong className="text-ink-primary">Technical analyst</strong> computes
            SMA 20/50/200, RSI 14, MACD, plus 10 Alpha158-inspired quant factors
            (ROC, STD, BIAS, RSV, MA_DIFF, KMID).
          </li>
          <li>
            <strong className="text-ink-primary">Macro analyst</strong> reads FRED via
            OpenBB (CPI, Fed funds, yield curve, M2) — top-down context.
          </li>
          <li>
            <strong className="text-ink-primary">Bull vs Bear debate</strong> across
            multiple rounds, then 3-way risk committee (Aggressive / Neutral /
            Conservative), then Fund Manager final call.
          </li>
        </ol>
      </section>

      <section className="surface p-6 mb-6">
        <h2 className="text-lg font-semibold mb-2">
          Why this is more useful than vanilla ChatGPT
        </h2>
        <ul className="space-y-2 text-sm text-ink-secondary">
          <li>✅ Real cited data — every claim ties back to a public source.</li>
          <li>✅ Lookahead-free for backtests (zero leakage from current data).</li>
          <li>✅ Cross-validated with Backtrader (14k★) so engine bugs surface fast.</li>
          <li>✅ 5 analysts, structured debate, 3-way risk committee — not a single prompt.</li>
          <li>✅ Decision history that learns from your past calls (reflection memory).</li>
        </ul>
      </section>

      <div className="surface-elev p-6 flex flex-col items-start gap-3">
        <h2 className="text-lg font-semibold">Run a {t} decision now</h2>
        <p className="text-sm text-ink-secondary">
          2 free decisions/day on mock LLM, no signup. Real LLM via Pro ($29/mo).
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <Link href={decisionLink} className="btn-primary">
            <Sparkles className="w-4 h-4" />
            Analyze {t} (free)
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/proof" className="btn-secondary text-sm">
            See proof
          </Link>
          <Link href="/pricing" className="btn-ghost text-sm">
            Pricing
          </Link>
        </div>
      </div>

      {/* Schema.org structured data — helps Google understand what this page is */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: `${t} Multi-Agent AI Analysis`,
            datePublished: new Date().toISOString().slice(0, 10),
            author: { "@type": "Organization", name: "TradingAgents Platform" },
            about: meta?.name || t,
          }),
        }}
      />
    </div>
  );
}
