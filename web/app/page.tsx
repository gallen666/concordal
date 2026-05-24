"use client";

/**
 * Landing — Editorial Dialectic.
 *
 * Visual story: the bull and the bear argue, in writing, side by side,
 * before any number is shown. The product's unique mechanism is the
 * debate — so the landing IS the debate.
 *
 * Section pacing (one big idea per scroll):
 *   1. HERO — split-screen "Bull says BUY / Bear says SELL" with the
 *      manager's verdict as a typographic pull-quote in the middle.
 *   2. THE WAY — three-paragraph editorial on why role separation
 *      beats single-prompt ChatGPT (no decorative cards, just prose).
 *   3. ARCHITECTURE — single column, numbered 1..7, as a long list.
 *   4. COVERAGE — three markets × five lenses, magazine-style table.
 *   5. WHY WE EXIST — full-width pull-quote (Stratechery-style).
 *   6. CTA — quiet, restrained, single primary button.
 *
 * The dual-locale headlines are intentional: English-then-Chinese,
 * always paired. Both audiences are first-class.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Quote,
  Sparkles,
  MessageSquare,
  GitBranch,
  Flame,
  BarChart3,
  Trophy,
  Calendar,
  Building2,
  Star,
  Microscope,
  Network,
  ShieldCheck,
} from "lucide-react";
import { api } from "./lib/api";
import { useT } from "./lib/i18n";
import { CrossMarketCallout } from "./components/PaperBacked";

export default function Landing() {
  return (
    <div className="min-h-screen">
      <Hero />
      <FeatureHub />
      <section className="max-w-6xl mx-auto px-6">
        <CrossMarketCallout />
      </section>
      <TodayPulse />
      <TheWay />
      <Architecture />
      <Coverage />
      <PullQuote />
      <ClosingCta />
      <Disclaimer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FEATURE HUB — answer "what can I do here?" in one screen.
// ---------------------------------------------------------------------------
//
// First-principles IA: a retail-investor user comes here for one of four
// jobs. The hub cards mirror the four Header nav categories so the user
// learns the site's structure in one glance.
//
// Order matters: 决策 first (the moat), 市场 second (the daily habit),
// 业绩 third (trust before tools), 研究 fourth (power-user tail).

function FeatureHub() {
  const { locale } = useT();
  const isZh = locale === "zh";
  const lbl = (zh: string, en: string) => (isZh ? zh : en);

  const cards: HubCardData[] = [
    {
      kicker: lbl("决策", "Decide"),
      title:  lbl("把一只票交给 7 个 agent 辩论", "Run a 7-agent debate on any ticker"),
      desc:   lbl(
        "多空写对立报告 → 风险三角色横排 → manager 拍板。每个 LLM 调用都可追溯。",
        "Bulls and bears write opposing reports. Risk panel votes. Manager signs off. Every LLM call traced.",
      ),
      primary: { href: "/decision",            label: lbl("新建决策", "New decision") },
      links: [
        { href: "/ask",         label: lbl("AI 问答 · 问财 clone", "Ask AI · 问财 clone"),  icon: <MessageSquare className="w-3.5 h-3.5" /> },
        { href: "/me/history",  label: lbl("我的历史决策",          "My decisions"),         icon: <Star className="w-3.5 h-3.5" /> },
        { href: "/watchlist",   label: lbl("自选股 + 早评",          "Watchlist + AI brief"), icon: <Sparkles className="w-3.5 h-3.5" /> },
      ],
      icon: <Sparkles className="w-5 h-5" />,
      tone: "accent",
    },
    {
      kicker: lbl("市场", "Markets"),
      title:  lbl("今天有什么值得关注", "What's interesting today"),
      desc:   lbl(
        "涨停股池、主力资金流向、申万板块、港股、ETF、财经日历 — 一站式 A 股 + 海外。",
        "Limit-up pool, fund flow, sectors, HK, ETF, calendar — A-share + worldwide in one place.",
      ),
      primary: { href: "/hot/zt-pool", label: lbl("涨停股池", "Limit-up pool") },
      links: [
        { href: "/cn-markets/fund-flow", label: lbl("资金流向",     "Fund flow"),    icon: <TrendingUp className="w-3.5 h-3.5" /> },
        { href: "/cn-markets/sectors",   label: lbl("板块热力图",    "Sector heat"),  icon: <BarChart3 className="w-3.5 h-3.5" /> },
        { href: "/hk-markets",           label: lbl("港股 / 南向",   "HK markets"),   icon: <Building2 className="w-3.5 h-3.5" /> },
        { href: "/calendar",             label: lbl("财经日历",     "Calendar"),     icon: <Calendar className="w-3.5 h-3.5" /> },
      ],
      icon: <Flame className="w-5 h-5" />,
      tone: "bull",
    },
    {
      kicker: lbl("业绩", "Proof"),
      title:  lbl("准不准？拿历史回测说话", "Does it work? Backtest evidence."),
      desc:   lbl(
        "20 ticker × 78 周回测 sharpe + 命中率。每个决策可点开追溯，看 LLM 是怎么想的。",
        "20 ticker × 78 week backtest — sharpe + hit rate. Click any decision to trace LLM reasoning.",
      ),
      primary: { href: "/track-record", label: lbl("回测战绩", "Track record") },
      links: [
        { href: "/proof",       label: lbl("信任证据",     "Trust evidence"),  icon: <ShieldCheck className="w-3.5 h-3.5" /> },
        { href: "/how-it-works",label: lbl("工作原理",     "How it works"),    icon: <Microscope className="w-3.5 h-3.5" /> },
        { href: "/blog",        label: lbl("AI 早评 · Blog","AI daily · Blog"), icon: <Sparkles className="w-3.5 h-3.5" /> },
      ],
      icon: <Trophy className="w-5 h-5" />,
      tone: "gold",
    },
    {
      kicker: lbl("研究", "Research"),
      title:  lbl("数据脊柱可见的研究工具", "Power-user research tooling"),
      desc:   lbl(
        "FRED → Qlib → Backtrader → Lean 一条龙。生态图实时显示 12 个上游集成的健康度。",
        "FRED → Qlib → Backtrader → Lean live chain. Ecosystem map shows 12 integrations in real time.",
      ),
      primary: { href: "/chain",        label: lbl("数据脊柱", "Data spine") },
      links: [
        { href: "/backtest",   label: lbl("回测引擎",    "Backtest engine"),   icon: <Microscope className="w-3.5 h-3.5" /> },
        { href: "/ecosystem",  label: lbl("生态地图",    "Ecosystem map"),     icon: <Network className="w-3.5 h-3.5" /> },
        { href: "/developers", label: lbl("开发者 API",   "Developers API"),    icon: <GitBranch className="w-3.5 h-3.5" /> },
      ],
      icon: <GitBranch className="w-5 h-5" />,
      tone: "neutral",
    },
  ];

  return (
    <section className="border-t border-border-subtle">
      <div className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <div className="kicker justify-center mb-4">
            {isZh ? "你来这里想做什么？" : "What brings you here?"}
          </div>
          <h2 className="display text-3xl md:text-4xl text-ink-primary tracking-tighter leading-tight">
            {isZh
              ? "四件事 — 决策、看市场、看业绩、用工具。"
              : "Four jobs. Decide, browse, verify, build."}
          </h2>
          <p className="text-ink-secondary mt-4 max-w-2xl mx-auto">
            {isZh
              ? "每张卡片下面的链接对应顶部导航的一组功能 — 任何一个页面都在 3 次点击之内。"
              : "Each card mirrors a navigation group above — every page is within 3 clicks."}
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {cards.map((c) => (
            <HubCard key={c.kicker} data={c} />
          ))}
        </div>
      </div>
    </section>
  );
}

interface HubLink {
  href: string;
  label: string;
  icon: React.ReactNode;
}
interface HubCardData {
  kicker: string;
  title: string;
  desc: string;
  primary: { href: string; label: string };
  links: HubLink[];
  icon: React.ReactNode;
  tone: "accent" | "bull" | "gold" | "neutral";
}

function HubCard({ data }: { data: HubCardData }) {
  const toneClass = {
    accent:  "border-l-accent",
    bull:    "border-l-signal-buy",
    gold:    "border-l-gold",
    neutral: "border-l-border",
  }[data.tone];
  const iconClass = {
    accent:  "text-accent",
    bull:    "text-signal-buy",
    gold:    "text-gold",
    neutral: "text-ink-secondary",
  }[data.tone];
  return (
    <div className={`surface-elev p-6 border-l-4 ${toneClass} flex flex-col`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="kicker">{data.kicker}</div>
        <span className={iconClass}>{data.icon}</span>
      </div>
      <h3 className="text-xl text-ink-primary leading-snug font-semibold">
        {data.title}
      </h3>
      <p className="text-ink-secondary text-sm leading-relaxed mt-3 flex-1">
        {data.desc}
      </p>
      <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
        <Link
          href={data.primary.href}
          className="btn-primary text-sm py-1.5"
        >
          {data.primary.label}
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {data.links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="inline-flex items-center gap-1 text-ink-tertiary hover:text-accent transition-colors"
            >
              {l.icon}
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HERO — the argument is the brand
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* very faint paper texture */}
      <div className="absolute inset-0 paper opacity-60 pointer-events-none" />
      <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-16 sm:pt-28 sm:pb-24">

        {/* v47: Strategic kicker replacing generic "closed beta" tagline.
            New positioning per McKinsey strategy doc: 持牌 + 透明 + 多 agent
            = the three pillars that distinguish us from 同花顺/雪球/Bloomberg.
            "SFC 申请中" is the regulatory honesty signal that builds trust. */}
        <div className="kicker mb-6 text-center">
          持牌申请中 · HK SFC Type 4 · 多 agent 辩证 · 完整 audit log
        </div>

        {/* v47: Hero strap — what we are in one bilingual line.
            This is the single sentence that should outlive every redesign. */}
        <div className="text-center mb-12">
          <p className="display text-xl md:text-2xl text-ink-primary/85 italic leading-snug max-w-3xl mx-auto">
            <span className="block">The dialectical, auditable AI advisor.</span>
            <span className="block text-base md:text-lg text-ink-secondary mt-1 not-italic">
              像辩论员而非黑盒的 AI 投顾.
            </span>
          </p>
        </div>

        {/* The Debate — two opposing display columns */}
        <div className="grid md:grid-cols-2 gap-10 md:gap-16 mb-16">
          <div className="opinion-column is-bull">
            <div className="flex items-center gap-2 mb-4 text-2xs uppercase tracking-kicker text-bull-ink/80">
              <TrendingUp className="w-3.5 h-3.5" />
              The bull
            </div>
            <h2 className="display text-display-sm md:text-display-md italic">
              &ldquo;Buy.&rdquo;
            </h2>
            <p className="display text-2xl md:text-3xl text-ink-primary/85 italic leading-snug mt-3">
              多头：买入。
            </p>
            <p className="text-ink-secondary leading-relaxed mt-5 max-w-md">
              Services revenue is compounding at 14% year-over-year and now
              comprises 26% of the top line. Margin mix shift is structurally
              under-priced.
            </p>
          </div>

          <div className="opinion-column is-bear md:border-l md:border-border-subtle md:pl-10 lg:pl-16">
            <div className="flex items-center gap-2 mb-4 text-2xs uppercase tracking-kicker text-bear-ink/80">
              <TrendingDown className="w-3.5 h-3.5" />
              The bear
            </div>
            <h2 className="display text-display-sm md:text-display-md italic">
              &ldquo;Sell.&rdquo;
            </h2>
            <p className="display text-2xl md:text-3xl text-ink-primary/85 italic leading-snug mt-3">
              空头：卖出。
            </p>
            <p className="text-ink-secondary leading-relaxed mt-5 max-w-md">
              At 28× forward earnings the structural story is fully priced.
              Vision Pro is soft. China revenue is decelerating. Wait for
              the next quarter.
            </p>
          </div>
        </div>

        {/* The verdict — pull-quote style */}
        <div className="max-w-4xl mx-auto text-center border-t border-b border-border-subtle py-12 my-12">
          <div className="kicker justify-center mb-6 text-gold">
            <span className="before:content-none">The manager · synthesises</span>
          </div>
          <p className="display text-display-md md:text-display-lg text-ink-primary leading-[0.95]">
            <span className="block">Reduce both sides</span>
            <span className="block italic text-gold">to one trade.</span>
          </p>
          <p className="display text-2xl md:text-3xl text-ink-primary/70 italic mt-6 leading-snug">
            把两边的话，化成一笔交易。
          </p>
          <p className="text-ink-secondary leading-relaxed mt-8 max-w-2xl mx-auto">
            Seven specialist agents — fundamentals, sentiment, news,
            technical, macro, plus bull-and-bear advocates — argue in writing.
            A manager weighs every line and outputs a single,
            confidence-calibrated call. The whole transcript is auditable.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mt-10">
            <Link href="/decision?ticker=AAPL" className="btn-primary">
              See AAPL decision · free, no signup
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/how-it-works"
              className="text-sm text-gold hover:underline underline-offset-4 ml-2"
            >
              How it works ↗
            </Link>
          </div>
          <p className="text-2xs text-ink-tertiary mt-3 font-mono uppercase tracking-wider">
            No password · email later · 90 seconds
          </p>
        </div>

        {/* trust strip. v52: honest LLM-provider count — only 2 actually
            wired in production (DeepSeek V4 primary, Gemini fallback). The
            router scaffolds 6 families (OpenAI/Anthropic/Qwen/GLM/...), but
            only the ones with API keys set on Render count toward this
            stat. Bumps as new keys go live. */}
        <div className="max-w-3xl mx-auto grid grid-cols-3 gap-6 text-center pt-2">
          <TrustItem n="27" l="Regression tests · zero lookahead" />
          <TrustItem n="2"  l="LLM providers live · DeepSeek V4 + Gemini" />
          <TrustItem n="3"  l="Markets · US · A-share · Crypto" />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// TODAY'S PULSE — five ticker decisions, refreshed daily by cron
// ---------------------------------------------------------------------------
// Surfaces a curated set of "today's calls" so the landing page DOES something
// the visitor can immediately inspect. Currently a static seed — wire to a
// `/v1/decisions/today` endpoint once a cron job populates it.

interface PulseRow {
  ticker: string;
  name: string;
  market: "US" | "A" | "Crypto";
  call: "BUY" | "HOLD" | "SELL";
  conf: number;
  bullSnip: string;
  bearSnip: string;
}

const PULSE_SEED: PulseRow[] = [
  { ticker: "AAPL",   name: "Apple Inc.",     market: "US", call: "BUY",  conf: 0.62, bullSnip: "Services mix shift +14% YoY", bearSnip: "Forward P/E at 28× already prices it in" },
  { ticker: "NVDA",   name: "NVIDIA",         market: "US", call: "HOLD", conf: 0.51, bullSnip: "Data-center capex unbroken",    bearSnip: "Customer concentration risk rising" },
  { ticker: "600519", name: "贵州茅台",       market: "A",  call: "BUY",  conf: 0.58, bullSnip: "Pricing power intact",           bearSnip: "白酒 demand softening in tier-1" },
  { ticker: "300750", name: "宁德时代 CATL",  market: "A",  call: "SELL", conf: 0.57, bullSnip: "Solid-state pipeline visible",   bearSnip: "EV margin compression continues" },
  { ticker: "BTC",    name: "Bitcoin",        market: "Crypto", call: "BUY", conf: 0.55, bullSnip: "ETF inflows accelerated last week", bearSnip: "Fed-tightening tail risk" },
];

function TodayPulse() {
  const { locale } = useT();
  // v71 hydration fix: `new Date()` differs between the server (build-time on a
  // statically-prerendered page) and the client (runtime), so rendering it
  // directly produced a React #418 text-mismatch on every landing-page load
  // once a day had passed since the last deploy. Gate it behind mount: the
  // server and the client's first render both emit no date (identical HTML),
  // then the effect fills in the real current date after hydration.
  const [stamp, setStamp] = useState<string>("");
  useEffect(() => {
    setStamp(new Date().toISOString().slice(0, 10));
  }, []);
  return (
    <section className="border-t border-border-subtle">
      <div className="max-w-6xl mx-auto px-6 py-20">
        <div className="flex items-baseline justify-between flex-wrap gap-4 mb-10">
          <div>
            <div className="kicker mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              {locale === "zh" ? "今日 AI 决策" : "Today's calls"}
            </div>
            <h2 className="display text-3xl md:text-4xl text-ink-primary tracking-tighter leading-tight">
              {locale === "zh" ? "五只票，两方观点，一个结论。" : "Five tickers. Two sides. One call each."}
            </h2>
          </div>
          <div className="text-2xs font-mono uppercase tracking-kicker text-ink-tertiary">
            {stamp ? `Updated ${stamp} · refreshed daily` : "Refreshed daily"}
          </div>
        </div>

        <div className="surface-elev overflow-hidden">
          {PULSE_SEED.map((r, i) => (
            <Link
              key={r.ticker}
              href={`/decision?ticker=${r.ticker}`}
              className="group grid grid-cols-[6rem_2fr_3fr_2fr_auto] gap-4 items-center px-5 py-4 hover:bg-bg-hover transition-colors border-t border-border-subtle first:border-t-0"
            >
              <div>
                <div className="font-mono font-medium text-ink-primary tabular-nums">{r.ticker}</div>
                <div className="text-2xs text-ink-tertiary uppercase tracking-wider mt-0.5">{r.market}</div>
              </div>
              <div>
                <div className="text-sm text-ink-primary">{r.name}</div>
                <div className="hidden md:flex items-center gap-2 mt-1 text-xs text-bull-ink">
                  <span className="inline-block w-1 h-1 rounded-full bg-bull-ink" />
                  <span className="truncate">{r.bullSnip}</span>
                </div>
              </div>
              <div className="hidden md:block">
                <div className="text-xs text-bear-ink flex items-center gap-2">
                  <span className="inline-block w-1 h-1 rounded-full bg-bear-ink" />
                  <span className="truncate">{r.bearSnip}</span>
                </div>
              </div>
              <div className="text-right">
                <div className={`font-mono font-semibold ${r.call === "BUY" ? "text-signal-buy" : r.call === "SELL" ? "text-signal-sell" : "text-ink-secondary"}`}>
                  {r.call}
                </div>
                <div className="text-2xs text-ink-tertiary tabular-nums">{r.conf.toFixed(2)}</div>
              </div>
              <ArrowRight className="w-4 h-4 text-ink-tertiary group-hover:text-gold transition-colors" />
            </Link>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between text-xs text-ink-tertiary font-mono">
          <span>
            {locale === "zh"
              ? "样例数据 · 真实决策每天 06:30 UTC 由 cron 重新生成"
              : "Seed sample · live decisions refresh nightly at 06:30 UTC"}
          </span>
          <Link href="/hot" className="text-gold hover:underline">
            {locale === "zh" ? "更多 ↗" : "More tickers ↗"}
          </Link>
        </div>
      </div>
    </section>
  );
}

function TrustItem({ n, l }: { n: string; l: string }) {
  return (
    <div className="border-t border-border-subtle pt-4">
      <div className="font-mono text-3xl text-gold tabular-nums">{n}</div>
      <div className="label-cap mt-2 leading-snug">{l}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// THE WAY — methodology prose
// ---------------------------------------------------------------------------

function TheWay() {
  return (
    <section className="border-t border-border-subtle">
      <div className="max-w-3xl mx-auto px-6 py-24">
        <div className="kicker mb-8">Why role separation</div>
        <h2 className="display text-4xl md:text-5xl text-ink-primary leading-tight tracking-tighter">
          One ChatGPT prompt cannot do five specialists&apos; jobs.
        </h2>
        <p className="display text-2xl md:text-3xl text-ink-primary/65 italic mt-4 leading-snug">
          一条 prompt 干不了五个专家的活。
        </p>

        <div className="space-y-6 text-ink-secondary leading-relaxed mt-12 text-lg">
          <p>
            Ask a single model &ldquo;should I buy AAPL?&rdquo; and it hedges every direction.
            Attention is finite. Conflicting signals get smoothed into a HOLD
            with low confidence — rarely the optimal trade.
          </p>
          <p>
            Our pipeline runs five specialist analysts with separate prompts,
            separate context windows, separate evidence. Each forms an
            opinion in isolation. Then a <span className="text-bull-ink">bull</span>{" "}
            and a <span className="text-bear-ink">bear</span> persona read all five reports
            and write opposing pitches. Then a <span className="text-gold">trader</span>{" "}
            synthesises. Then risk approves. Then a manager signs off.
          </p>
          <p>
            In our 78-week backtest across 20 tickers, the multi-agent
            pipeline produced calibrated confidence — the system&apos;s
            70%-confidence calls were right roughly 70% of the time. The
            single-prompt baseline was systematically over-confident.
          </p>
        </div>

        <div className="mt-10">
          <Link
            href="/blog/multi-agent-llm-vs-single-prompt-chatgpt"
            className="text-gold hover:underline underline-offset-4 inline-flex items-center gap-1.5 text-sm"
          >
            Read the full essay <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ARCHITECTURE — a single, numbered list, calmly
// ---------------------------------------------------------------------------

function Architecture() {
  const stages = [
    { name: "Fundamentals",       data: "SEC EDGAR · akshare",            tone: "bull"    as const },
    { name: "Technical",          data: "OHLCV · Alpha158-lite factors",  tone: "neutral" as const },
    { name: "Sentiment",          data: "Reddit · 东方财富股吧 · 雪球",   tone: "neutral" as const },
    { name: "News",               data: "Reuters · WSJ · Bloomberg wires",tone: "neutral" as const },
    { name: "Macro",              data: "FRED · OpenBB",                  tone: "bear"    as const },
    { name: "Bull / Bear debate", data: "Two adversarial personae",       tone: "split"   as const },
    { name: "Manager + risk",     data: "Synthesis + position size + stop", tone: "gold"  as const },
  ];

  return (
    <section className="border-t border-border-subtle bg-bg-subtle/40">
      <div className="max-w-4xl mx-auto px-6 py-24">
        <div className="kicker mb-8">Architecture</div>
        <h2 className="display text-4xl md:text-5xl text-ink-primary tracking-tighter leading-tight">
          Seven stages. Every one auditable.
        </h2>
        <p className="display text-2xl md:text-3xl text-ink-primary/65 italic mt-3 leading-snug">
          七个阶段。每一步都可回溯。
        </p>

        <ol className="mt-14 space-y-0">
          {stages.map((s, i) => (
            <li
              key={s.name}
              className="grid grid-cols-[3rem_1fr_auto] items-baseline gap-6 py-5 border-t border-border-subtle last:border-b last:border-border-subtle"
            >
              <span className="font-mono text-ink-tertiary text-sm tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="display text-2xl md:text-3xl text-ink-primary leading-tight">
                  {s.name}
                </h3>
                <p className="text-sm text-ink-tertiary font-mono mt-1">{s.data}</p>
              </div>
              <ToneMark tone={s.tone} />
            </li>
          ))}
        </ol>

        <div className="mt-12">
          <Link
            href="/how-it-works"
            className="text-gold hover:underline underline-offset-4 inline-flex items-center gap-1.5 text-sm"
          >
            Full architecture, with code <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function ToneMark({ tone }: { tone: "bull" | "bear" | "split" | "gold" | "neutral" }) {
  const style =
    tone === "bull"    ? "bg-bull"
    : tone === "bear"  ? "bg-bear"
    : tone === "gold"  ? "bg-gold"
    : tone === "split" ? "bg-gradient-to-r from-bull to-bear"
    : "bg-border-strong";
  return <span className={`w-12 h-px ${style} inline-block`} />;
}

// ---------------------------------------------------------------------------
// COVERAGE — magazine-style table
// ---------------------------------------------------------------------------

function Coverage() {
  const cols = ["Fundamentals", "Technical", "Sentiment", "News", "Macro"];
  const rows: { market: string; sub: string; coverage: Array<"on" | "partial" | "off"> }[] = [
    { market: "US Equity",  sub: "yfinance · SEC EDGAR XBRL",     coverage: ["on","on","on","on","on"] },
    { market: "A-Share",    sub: "akshare · 东方财富 · 雪球",      coverage: ["on","on","on","partial","on"] },
    { market: "Crypto",     sub: "CCXT · Binance default",        coverage: ["off","on","on","on","on"] },
  ];
  return (
    <section className="border-t border-border-subtle">
      <div className="max-w-5xl mx-auto px-6 py-24">
        <div className="kicker mb-8">Coverage</div>
        <h2 className="display text-4xl md:text-5xl text-ink-primary tracking-tighter leading-tight">
          Three markets. Five analyst lenses. Real data, every cell.
        </h2>
        <p className="display text-2xl md:text-3xl text-ink-primary/65 italic mt-3 leading-snug">
          三个市场，五个视角，每一格都是真实数据。
        </p>

        <div className="mt-14 surface-elev overflow-hidden">
          <table className="w-full text-sm tabular">
            <thead>
              <tr className="border-b border-border bg-bg-subtle text-ink-tertiary">
                <th className="text-left px-6 py-4 label-cap">Market</th>
                {cols.map(c => (
                  <th key={c} className="text-center px-3 py-4 label-cap">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.market} className="border-b border-border-subtle last:border-b-0">
                  <td className="px-6 py-5">
                    <div className="text-ink-primary font-medium">{r.market}</div>
                    <div className="text-2xs font-mono text-ink-tertiary mt-1">{r.sub}</div>
                  </td>
                  {r.coverage.map((c, i) => (
                    <td key={i} className="text-center px-3 py-5">
                      <CoverageDot state={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function CoverageDot({ state }: { state: "on" | "partial" | "off" }) {
  if (state === "on") {
    return <span className="w-2 h-2 rounded-full bg-gold inline-block" style={{ boxShadow: "0 0 8px rgba(201,169,97,0.5)" }} />;
  }
  if (state === "partial") {
    return <span className="w-2 h-2 rounded-full bg-gold/40 inline-block" />;
  }
  return <span className="w-2 h-2 rounded-full border border-border-strong inline-block" />;
}

// ---------------------------------------------------------------------------
// PULL QUOTE — Stratechery-style full-width
// ---------------------------------------------------------------------------

function PullQuote() {
  return (
    <section className="border-t border-border-subtle">
      <div className="max-w-4xl mx-auto px-6 py-32 text-center">
        <Quote className="w-12 h-12 text-gold/40 mx-auto mb-8" strokeWidth={1} />
        <p className="display text-3xl md:text-5xl text-ink-primary leading-[1.15] tracking-tighter">
          A Bloomberg seat costs <span className="line-through text-ink-tertiary">$25,000</span>.
          <br />
          The reasoning behind a good trade should cost <span className="italic text-gold">cents</span>.
        </p>
        <p className="display text-xl md:text-2xl text-ink-primary/65 italic mt-8 leading-snug">
          一台 Bloomberg 终端两万五；
          <br />
          一次好的决策推理，应该只值几分钱。
        </p>
        <p className="text-ink-tertiary text-sm font-mono uppercase tracking-kicker mt-10">
          — TradingAgents · 2026
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// CTA — quiet
// ---------------------------------------------------------------------------

function ClosingCta() {
  return (
    <section className="border-t border-border-subtle bg-bg-subtle/30">
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h2 className="display text-4xl md:text-5xl text-ink-primary tracking-tighter leading-tight">
          See your first decision in 90 seconds.
        </h2>
        <p className="display text-xl md:text-2xl text-ink-primary/65 italic mt-3 leading-snug">
          90 秒，看到你的第一份决策。
        </p>
        <p className="text-ink-secondary leading-relaxed mt-6 max-w-xl mx-auto">
          Magic-link sign-in. No password, no card. First decision is free.
          Authenticated users get five real-LLM decisions a day.
        </p>

        <Waitlist />
      </div>
    </section>
  );
}

function Waitlist() {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setState("loading");
    setError(null);
    try {
      await api.joinWaitlist({ email, note });
      setState("ok");
    } catch (e: unknown) {
      setState("err");
      setError((e as Error).message);
    }
  }

  if (state === "ok") {
    return (
      <div className="mt-10 max-w-md mx-auto border border-gold/40 bg-gold-soft rounded p-5 text-left">
        <div className="kicker text-gold mb-2">You&apos;re on the list</div>
        <p className="text-sm text-ink-secondary leading-relaxed">
          We&apos;ll email a sign-in link when capacity opens. Have an invite code?{" "}
          <Link href="/redeem" className="text-gold hover:underline">Redeem now</Link>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-10 max-w-md mx-auto text-left space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@firm.com"
          className="input flex-1 font-mono"
          disabled={state === "loading"}
        />
        <button
          type="submit"
          disabled={state === "loading" || !email}
          className="btn-primary"
        >
          {state === "loading" ? "..." : "Request access"}
          {state !== "loading" && <ArrowRight className="w-4 h-4" />}
        </button>
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional · what would you use this for?"
        className="input w-full font-mono"
        disabled={state === "loading"}
      />
      {error && <p className="text-sm text-bear-ink font-mono">{error}</p>}
      <p className="text-2xs text-ink-tertiary font-mono uppercase tracking-wider pt-1">
        Have an invite code?{" "}
        <Link href="/redeem" className="text-gold hover:underline">
          Redeem →
        </Link>
      </p>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Disclaimer — small, like a magazine masthead footnote
// ---------------------------------------------------------------------------

function Disclaimer() {
  return (
    <section className="border-t border-border-subtle">
      <div className="max-w-3xl mx-auto px-6 py-12 text-center text-xs font-mono text-ink-tertiary uppercase tracking-wider">
        Decision support · not investment advice · markets remain uncertain ·{" "}
        <Link href="/disclaimer" className="text-gold hover:underline">full disclaimer</Link>
      </div>
    </section>
  );
}
