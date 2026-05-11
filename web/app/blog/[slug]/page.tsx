import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calendar, Clock } from "lucide-react";
import { POSTS_BY_SLUG, BLOG_SLUGS } from "../posts";

/**
 * /blog/[slug] — long-form SEO articles.
 *
 * Each article is rendered server-side from the registry in
 * `../posts.tsx`, generating full meta tags and Article JSON-LD for
 * Google + Baidu rich snippets. Static params at build time so every
 * known article ships as pre-rendered HTML.
 *
 * Why long-form articles matter for this product:
 *   1. Bloomberg / lookahead / multi-agent / A-share queries land here
 *      and convert to /decision via inline CTAs.
 *   2. Internal-link graph: every article links to /decision, /proof,
 *      or /how-it-works, distributing pagerank to the conversion pages.
 *   3. Both Google and Baidu reward in-depth original content over
 *      thin landing pages.
 */

interface Props {
  params: Promise<{ slug: string }>;
}

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://trading-agents-platform.vercel.app";

export async function generateStaticParams() {
  return BLOG_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = POSTS_BY_SLUG[slug];
  if (!post) {
    return { title: "Post not found | TradingAgents Blog" };
  }
  const url = `${SITE}/blog/${slug}`;
  return {
    title: `${post.meta.title} | TradingAgents Blog`,
    description: post.meta.description,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      title: post.meta.title,
      description: post.meta.description,
      type: "article",
      url,
      publishedTime: post.meta.date,
    },
    twitter: {
      card: "summary_large_image",
      title: post.meta.title,
      description: post.meta.description,
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = POSTS_BY_SLUG[slug];
  if (!post) notFound();

  const { meta, render } = post;
  const url = `${SITE}/blog/${slug}`;

  // Article JSON-LD — gets us into Google's Top Stories / Discover
  // carousel eligibility and surfaces author + date in regular SERPs.
  const ld = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: meta.title,
    description: meta.description,
    datePublished: meta.date,
    dateModified: meta.date,
    author: { "@type": "Organization", name: "TradingAgents" },
    publisher: {
      "@type": "Organization",
      name: "TradingAgents",
      url: SITE,
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    inLanguage: meta.lang === "zh" ? "zh-CN" : "en",
  };

  return (
    <article className="max-w-3xl mx-auto px-6 py-10">
      {/* JSON-LD for rich snippets */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />

      <Link
        href="/blog"
        className="inline-flex items-center text-sm text-foreground/60 hover:text-accent mb-6"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> All posts
      </Link>

      <header className="mb-8">
        <div className="text-xs uppercase tracking-wide text-accent mb-2">
          {meta.category}
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3 leading-tight">
          {meta.title}
        </h1>
        <p className="text-foreground/70 text-lg mb-4">{meta.description}</p>
        <div className="flex items-center gap-4 text-xs text-foreground/50">
          <span className="inline-flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {meta.date}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {meta.readMinutes} min read
          </span>
          <span className="uppercase tracking-wider">{meta.lang}</span>
        </div>
      </header>

      <div className="prose prose-invert max-w-none">{render()}</div>

      <footer className="mt-16 pt-8 border-t border-foreground/10">
        <div className="text-sm text-foreground/60">
          Liked this? See{" "}
          <Link href="/how-it-works" className="text-accent hover:underline">
            how the pipeline works
          </Link>{" "}
          or{" "}
          <Link href="/decision" className="text-accent hover:underline">
            run a decision
          </Link>{" "}
          on your ticker.
        </div>
      </footer>
    </article>
  );
}
