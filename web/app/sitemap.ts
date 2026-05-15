import type { MetadataRoute } from "next";
import { BLOG_SLUGS } from "./blog/posts";

/**
 * Dynamic sitemap.xml for Google + Baidu indexing.
 *
 * Next.js App Router treats this file as a route — emits an XML
 * response at /sitemap.xml at request time. We list every public
 * crawlable page with a lastModified date and a coarse priority.
 *
 * Critical for SEO: without this, Google takes 4-12 weeks to discover
 * /analysis/[ticker] pages by following links. With it, indexing is
 * usually within days. Submit the sitemap URL in Google Search Console
 * + Baidu Webmaster Tools after deploy.
 */

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://trading-agents-platform.vercel.app";

// Tickers we have dedicated landing pages for. Mirror the KNOWN_TICKERS
// map in /analysis/[ticker]/page.tsx — keep in sync as you add more.
const TICKERS = [
  "AAPL", "NVDA", "TSLA", "MSFT", "GOOGL", "AMZN", "META",
  "600519", "000001", "300750", "002594",
  "300059", "601318", "600036", "688981", "301666",
  "002475", "600276", "300015",
  "BTC", "ETH", "SOL",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // Static high-value pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE}/`,             lastModified: now, changeFrequency: "weekly",  priority: 1.0 },
    { url: `${SITE}/decision`,     lastModified: now, changeFrequency: "weekly",  priority: 0.9 },
    { url: `${SITE}/pricing`,      lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE}/proof`,        lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/ecosystem`,    lastModified: now, changeFrequency: "weekly",  priority: 0.7 },
    { url: `${SITE}/integrations`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/developers`,   lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/how-it-works`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/track-record`, lastModified: now, changeFrequency: "weekly",  priority: 0.6 },
    { url: `${SITE}/hot`,          lastModified: now, changeFrequency: "daily",   priority: 0.6 },
    { url: `${SITE}/cn-markets`,             lastModified: now, changeFrequency: "daily",   priority: 0.7 },
    { url: `${SITE}/cn-markets/fund-flow`,   lastModified: now, changeFrequency: "daily",   priority: 0.7 },
    { url: `${SITE}/cn-markets/sectors`,     lastModified: now, changeFrequency: "daily",   priority: 0.7 },
    { url: `${SITE}/hot/zt-pool`,            lastModified: now, changeFrequency: "daily",   priority: 0.7 },
    { url: `${SITE}/chain`,                  lastModified: now, changeFrequency: "weekly",  priority: 0.6 },
    { url: `${SITE}/backtest`,     lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/blog`,         lastModified: now, changeFrequency: "weekly",  priority: 0.8 },
    // /redeem is disallowed in robots.txt — keep it out of the sitemap
    // to avoid a "disallowed URL in sitemap" warning in Search Console.
    { url: `${SITE}/terms`,        lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${SITE}/privacy`,      lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${SITE}/disclaimer`,   lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
  ];

  // One entry per ticker landing page — these are the SEO long-tail
  // pages that should pull in organic traffic over time. Each ticker
  // gets BOTH /analysis/{t} (server-rendered marketing) and /stock/{t}
  // (interactive one-stop F10 + decision page).
  const tickerPages: MetadataRoute.Sitemap = [
    ...TICKERS.map((t) => ({
      url: `${SITE}/analysis/${t}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...TICKERS.map((t) => ({
      url: `${SITE}/stock/${t}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.75,
    })),
  ];

  // One entry per long-form blog post — these articles target Google
  // long-tail keywords (e.g. "lookahead bias backtest", "东方财富 量化")
  // and feed pagerank back into /decision via inline CTAs.
  const blogPages: MetadataRoute.Sitemap = BLOG_SLUGS.map((slug) => ({
    url: `${SITE}/blog/${slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticPages, ...tickerPages, ...blogPages];
}
