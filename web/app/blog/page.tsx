import type { Metadata } from "next";
import Link from "next/link";
import { Calendar, Clock } from "lucide-react";
import { POSTS } from "./posts";

/**
 * /blog — index page listing every long-form article.
 *
 * Server component (no client state). Each card links to /blog/[slug].
 * Articles are ordered by date desc — newest first.
 */

export const metadata: Metadata = {
  title: "Blog · TradingAgents",
  description:
    "Long-form essays on multi-agent LLMs, lookahead bias, A-share data sources, and how TradingAgents compares to Bloomberg / single-prompt ChatGPT.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "TradingAgents Blog",
    description:
      "Methodology essays on multi-agent LLM analysis, backtest hygiene, and market-specific data sources.",
    type: "website",
  },
};

export default function BlogIndex() {
  const sorted = [...POSTS].sort((a, b) => (a.meta.date < b.meta.date ? 1 : -1));

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <header className="mb-10">
        <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
          Blog
        </h1>
        <p className="text-foreground/70">
          Methodology, comparisons, and walkthroughs. Plain-prose, no marketing.
        </p>
      </header>

      <ul className="space-y-8">
        {sorted.map((post) => (
          <li key={post.meta.slug} className="border-b border-foreground/10 pb-8">
            <Link
              href={`/blog/${post.meta.slug}`}
              className="block group"
            >
              <div className="text-xs uppercase tracking-wide text-accent mb-2">
                {post.meta.category}
              </div>
              <h2 className="text-xl md:text-2xl font-semibold text-foreground group-hover:text-accent transition-colors mb-2 leading-snug">
                {post.meta.title}
              </h2>
              <p className="text-foreground/70 mb-3 leading-relaxed">
                {post.meta.description}
              </p>
              <div className="flex items-center gap-4 text-xs text-foreground/50">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {post.meta.date}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {post.meta.readMinutes} min
                </span>
                <span className="uppercase tracking-wider">
                  {post.meta.lang}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
