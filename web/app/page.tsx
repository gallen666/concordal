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

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Quote,
} from "lucide-react";
import { api } from "./lib/api";

export default function Landing() {
  return (
    <div className="min-h-screen">
      <Hero />
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
// HERO — the argument is the brand
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* very faint paper texture */}
      <div className="absolute inset-0 paper opacity-60 pointer-events-none" />
      <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-16 sm:pt-28 sm:pb-24">

        {/* kicker */}
        <div className="kicker mb-12 text-center">
          Multi-agent · decision support · closed beta
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
            <Link href="/login" className="btn-primary">
              Try a decision · free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/how-it-works"
              className="text-sm text-gold hover:underline underline-offset-4 ml-2"
            >
              How it works ↗
            </Link>
          </div>
        </div>

        {/* trust strip */}
        <div className="max-w-3xl mx-auto grid grid-cols-3 gap-6 text-center pt-2">
          <TrustItem n="27" l="Regression tests · zero lookahead" />
          <TrustItem n="6"  l="LLM providers · auto-fallback" />
          <TrustItem n="3"  l="Markets · US · A-share · Crypto" />
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
