import type { Metadata } from "next";
import Link from "next/link";
import { Calendar, Clock, Sparkles } from "lucide-react";
import { POSTS } from "./posts";

const API_BASE = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

interface DailyBriefMeta {
  date: string;
  title: string;
  locale: string;
  generated_at: number;
}

/**
 * /blog — index page listing every long-form article.
 *
 * Server component (no client state). Each card links to /blog/[slug].
 * Articles are ordered by date desc — newest first.
 */

export const metadata: Metadata = {
  title: "Blog · Concordal",
  description:
    "Long-form essays on multi-agent LLMs, lookahead bias, A-share data sources, and how Concordal compares to Bloomberg / single-prompt ChatGPT.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Concordal Blog",
    description:
      "Methodology essays on multi-agent LLM analysis, backtest hygiene, and market-specific data sources.",
    type: "website",
  },
};

async function fetchDailyBriefs(): Promise<DailyBriefMeta[]> {
  try {
    const r = await fetch(`${API_BASE}/v1/daily-brief?limit=10`, {
      next: { revalidate: 600 }, // 10 min ISR cache
    });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.items as DailyBriefMeta[]) || [];
  } catch {
    return [];
  }
}

export default async function BlogIndex() {
  const sorted = [...POSTS].sort((a, b) => (a.meta.date < b.meta.date ? 1 : -1));
  const briefs = await fetchDailyBriefs();
  // De-dup by date_str prefix (briefs keyed as "YYYY-MM-DD:locale"; we show
  // one row per date, preferring zh-CN if both exist).
  const seen = new Set<string>();
  const dedupedBriefs: DailyBriefMeta[] = [];
  for (const b of briefs) {
    const day = (b.date || "").split(":")[0];
    if (!seen.has(day)) {
      seen.add(day);
      dedupedBriefs.push(b);
    }
  }

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

      {/* Daily briefs — show only if cron has populated some */}
      {dedupedBriefs.length > 0 && (
        <section className="mb-10 surface-elev p-6">
          <div className="kicker mb-3">
            <Sparkles className="w-3.5 h-3.5" /> Daily AI briefs
          </div>
          <ul className="space-y-2">
            {dedupedBriefs.slice(0, 7).map((b) => {
              const day = (b.date || "").split(":")[0];
              return (
                <li key={b.date} className="flex items-baseline justify-between gap-4 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
                  <Link
                    href={`/blog/daily/${day}`}
                    className="text-sm text-ink-primary hover:text-gold transition-colors truncate"
                  >
                    {b.title}
                  </Link>
                  <span className="text-2xs font-mono text-ink-tertiary shrink-0 tabular-nums">
                    {day}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
