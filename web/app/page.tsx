"use client";

/**
 * Landing page — Bloomberg-grade redesign.
 *
 * Structure:
 *   1. Status bar (live system pulse + version)
 *   2. Hero — display-serif headline + LIVE pill + ticker tape backdrop
 *   3. KPI strip — 4 vanity metrics in monospace columns
 *   4. Pipeline — 7-stage agent flow as a numbered terminal column
 *   5. Coverage matrix — markets × analyst stages grid
 *   6. Founders' note — credibility anchor
 *   7. CTA — magic-link sign-up + sample decision link
 *
 * Visual language: dense, monospace-heavy, amber accent, cream text,
 * tight 1-2px borders, all-caps kickers, no shadowed cards. Resembles
 * a Bloomberg Terminal screen capture more than a SaaS landing.
 */

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { api } from "./lib/api";

export default function Landing() {
  return (
    <div className="min-h-screen">
      <StatusBar />
      <Hero />
      <TickerTape />
      <KpiStrip />
      <Pipeline />
      <CoverageMatrix />
      <FoundersNote />
      <CtaBlock />
      <Disclaimer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1) Top status bar — sets the "terminal" tone before the hero
// ---------------------------------------------------------------------------

function StatusBar() {
  const now = new Date();
  const stamp = now.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  return (
    <div className="border-b border-border-subtle bg-bg-subtle/60 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-6 h-8 flex items-center justify-between text-2xs text-ink-tertiary font-mono">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="relative inline-flex">
              <span className="status-dot bg-signal-buy" />
              <span className="absolute inset-0 rounded-full bg-signal-buy animate-ping opacity-50" />
            </span>
            <span className="text-ink-secondary">SYSTEM</span>
            <span className="text-signal-buy">LIVE</span>
          </span>
          <span className="hidden sm:inline">v0.1.0</span>
          <span className="hidden md:inline">closed beta</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden md:inline">{stamp}</span>
          <span className="text-accent">TA{">"}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2) Hero — display serif + amber kicker + dense supporting copy
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border-subtle">
      <div className="absolute inset-0 grid-bg pointer-events-none" />
      <div className="absolute inset-0 bg-radial-fade pointer-events-none" />
      <div className="relative max-w-6xl mx-auto px-6 py-16 sm:py-24 grid lg:grid-cols-[1.3fr_1fr] gap-12 items-start">
        <div className="space-y-8">
          <span className="kicker">multi-agent decision support · closed beta</span>

          <h1 className="display text-5xl sm:text-6xl lg:text-7xl leading-[0.95] tracking-tighter">
            <span className="text-ink-primary">Seven AI analysts.</span>
            <br />
            <span className="text-gradient-accent">One conviction-weighted</span>
            <br />
            <span className="text-ink-primary">trade thesis.</span>
            <span className="cursor-blink" />
          </h1>

          <p className="text-lg text-ink-secondary max-w-xl leading-relaxed">
            Fundamentals · sentiment · news · technical · macro — independent specialists
            form opinions in isolation, then a bull/bear debate panel and a manager
            synthesise the call. Every reasoning step is auditable. Every data source
            is open.
          </p>

          <CtaInline />

          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-2xs font-mono uppercase tracking-wider text-ink-tertiary pt-2">
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-signal-buy" />
              No look-ahead bias
            </li>
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-signal-buy" />
              Open source
            </li>
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-signal-buy" />
              Decision support · not trade execution
            </li>
          </ul>
        </div>

        {/* Hero card — sample decision read-out, terminal style */}
        <SampleDecisionCard />
      </div>
    </section>
  );
}

function CtaInline() {
  return (
    <div className="flex flex-wrap gap-3">
      <Link href="/login" className="btn-primary">
        Get a sign-in link
        <ArrowRight className="w-4 h-4" />
      </Link>
      <Link href="/decision?ticker=AAPL" className="btn-secondary font-mono">
        Try AAPL{" "}
        <span className="text-ink-tertiary">·</span>{" "}
        <span className="text-signal-info">free</span>
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero accessory — a faux sample decision card so the user immediately
// sees what the output looks like. Inert (not live data).
// ---------------------------------------------------------------------------

function SampleDecisionCard() {
  return (
    <div className="surface-elev p-0 overflow-hidden font-mono text-xs">
      <div className="px-4 py-2.5 border-b border-border-subtle bg-bg-subtle flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-accent font-semibold tracking-wider">TA{">"}</span>
          <span className="text-ink-primary">DECISION · AAPL</span>
        </div>
        <span className="text-ink-tertiary">2026-05-13</span>
      </div>

      <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
        <div>
          <div className="label-cap">Manager call</div>
          <div className="text-xl font-medium text-signal-buy mt-1">BUY</div>
          <div className="text-2xs text-ink-tertiary mt-0.5">1.5% portfolio · stop $182 · target $215</div>
        </div>
        <div className="text-right">
          <div className="label-cap">Confidence</div>
          <div className="text-xl font-medium text-ink-primary tabular-nums mt-1">0.58</div>
          <div className="text-2xs text-ink-tertiary mt-0.5">σ=0.06 across analysts</div>
        </div>
      </div>

      <ul className="divide-y divide-border-subtle">
        <SampleRow stage="Fundamentals" call="BUY"   conf="0.62" note="Services mix shift +14% YoY" />
        <SampleRow stage="Technical"    call="HOLD"  conf="0.55" note="Range-bound, low vol" />
        <SampleRow stage="Sentiment"    call="HOLD"  conf="0.58" note="Vision Pro concerns lingering" />
        <SampleRow stage="News"         call="BUY"   conf="0.60" note="Q2 beat +6% vs consensus" />
        <SampleRow stage="Macro"        call="HOLD" conf="0.54" note="Yield curve mildly inverted" />
      </ul>

      <div className="px-4 py-2.5 border-t border-border-subtle bg-bg-subtle flex items-center justify-between text-2xs">
        <span className="text-ink-tertiary">87s · $0.08 · 6 providers polled</span>
        <span className="text-signal-info hover:underline cursor-pointer">View transcript →</span>
      </div>
    </div>
  );
}

function SampleRow({ stage, call, conf, note }: { stage: string; call: "BUY" | "HOLD" | "SELL"; conf: string; note: string }) {
  const Icon = call === "BUY" ? TrendingUp : call === "SELL" ? TrendingDown : Minus;
  const color =
    call === "BUY"  ? "text-signal-buy"
    : call === "SELL" ? "text-signal-sell"
    : "text-ink-secondary";
  return (
    <li className="px-4 py-2 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className={`w-3.5 h-3.5 ${color} shrink-0`} />
        <span className="text-ink-secondary w-24 shrink-0">{stage}</span>
        <span className="text-ink-tertiary truncate">{note}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className={`${color} font-semibold tabular-nums`}>{call}</span>
        <span className="text-ink-tertiary tabular-nums">{conf}</span>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// 3) Ticker tape — gives the page the unmistakable Bloomberg motion
// ---------------------------------------------------------------------------

function TickerTape() {
  const items = [
    { sym: "AAPL",   call: "BUY",  pct: "+0.62" },
    { sym: "NVDA",   call: "HOLD", pct: "-0.08" },
    { sym: "TSLA",   call: "SELL", pct: "-1.84" },
    { sym: "600519", call: "BUY",  pct: "+0.41" },
    { sym: "BTC",    call: "BUY",  pct: "+2.10" },
    { sym: "MSFT",   call: "HOLD", pct: "+0.12" },
    { sym: "ETH",    call: "SELL", pct: "-0.95" },
    { sym: "300750", call: "BUY",  pct: "+1.30" },
    { sym: "GOOGL",  call: "BUY",  pct: "+0.78" },
    { sym: "AMZN",   call: "HOLD", pct: "+0.05" },
  ];
  return (
    <div className="border-b border-border-subtle bg-bg-subtle/30 overflow-hidden">
      <div className="ticker-tape py-2.5">
        <div className="ticker-tape-track font-mono text-xs">
          {[...items, ...items].map((it, i) => (
            <span key={i} className="inline-flex items-center gap-2">
              <span className="text-ink-tertiary">{it.sym}</span>
              <span
                className={
                  it.call === "BUY" ? "text-signal-buy" :
                  it.call === "SELL" ? "text-signal-sell" :
                  "text-ink-secondary"
                }
              >
                {it.call}
              </span>
              <span
                className={
                  it.pct.startsWith("+") ? "num-up" :
                  it.pct.startsWith("-") ? "num-down" :
                  "num-flat"
                }
              >
                {it.pct}%
              </span>
              <span className="text-ink-muted">·</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4) KPI strip — 4 monospace columns. Bloomberg-style figures.
// ---------------------------------------------------------------------------

function KpiStrip() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-12 border-b border-border-subtle">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-6">
        <Kpi value="7"   label="Specialist agents" />
        <Kpi value="6"   label="LLM providers w/ auto-fallback" />
        <Kpi value="3"   label="Markets · US · A-share · Crypto" />
        <Kpi value="27"  label="Regression tests · zero lookahead" />
      </div>
    </section>
  );
}

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat">
      <div className="stat-value text-3xl text-accent">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5) Pipeline — 7 stages laid out vertically as a terminal column.
// ---------------------------------------------------------------------------

function Pipeline() {
  const stages = [
    { n: "01", name: "Fundamentals",        data: "SEC EDGAR · akshare",           color: "text-signal-buy"  },
    { n: "02", name: "Technical",           data: "OHLCV · Alpha158-lite",         color: "text-signal-info" },
    { n: "03", name: "Sentiment",           data: "Reddit · 东方财富股吧 · 雪球", color: "text-accent"      },
    { n: "04", name: "News",                data: "Reuters · Bloomberg headlines", color: "text-signal-warn" },
    { n: "05", name: "Macro",               data: "FRED · OpenBB",                  color: "text-signal-sell" },
    { n: "06", name: "Bull / Bear debate",  data: "Adversarial personas",          color: "text-accent"      },
    { n: "07", name: "Manager + risk",      data: "Synthesis + position size",     color: "text-ink-primary" },
  ];

  return (
    <section className="max-w-6xl mx-auto px-6 py-20 border-b border-border-subtle">
      <div className="grid md:grid-cols-[1fr_2fr] gap-8 md:gap-16">
        <div className="space-y-4">
          <span className="kicker">pipeline</span>
          <h2 className="display text-3xl sm:text-4xl tracking-tighter text-ink-primary leading-tight">
            Role separation by design.
          </h2>
          <p className="text-ink-secondary leading-relaxed">
            One model in one context window cannot be five specialists at once.
            Each stage sees only its data, forms an independent thesis, then debates.
            The output is calibrated confidence — not a hedge-y average.
          </p>
          <Link href="/how-it-works" className="text-signal-info hover:underline inline-flex items-center gap-1.5 text-sm">
            Full architecture <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <ol className="space-y-0 surface-elev p-0 overflow-hidden">
          {stages.map((s, i) => (
            <li
              key={s.n}
              className="flex items-center gap-4 px-5 py-4 border-b border-border-subtle last:border-b-0 hover:bg-bg-hover transition-colors"
            >
              <span className={`font-mono text-xs ${s.color} w-7 shrink-0`}>{s.n}</span>
              <span className="text-ink-primary font-medium w-44 shrink-0">{s.name}</span>
              <span className="text-ink-tertiary font-mono text-xs truncate">{s.data}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 6) Coverage matrix — markets × analyst stages, with green/grey dots
// ---------------------------------------------------------------------------

function CoverageMatrix() {
  const cols = ["Fundamentals", "Technical", "Sentiment", "News", "Macro"];
  const rows: { market: string; coverage: Array<"on" | "partial" | "off"> }[] = [
    { market: "US Equity",    coverage: ["on", "on", "on", "on", "on"] },
    { market: "A-Share",      coverage: ["on", "on", "on", "partial", "on"] },
    { market: "Crypto",       coverage: ["off", "on", "on", "on", "on"] },
  ];
  return (
    <section className="max-w-6xl mx-auto px-6 py-20 border-b border-border-subtle">
      <div className="mb-10">
        <span className="kicker">coverage matrix</span>
        <h2 className="display text-3xl sm:text-4xl tracking-tighter text-ink-primary mt-2">
          Three markets. Five analyst lenses. Real data, every cell.
        </h2>
      </div>

      <div className="surface-elev overflow-hidden">
        <table className="w-full text-sm tabular">
          <thead>
            <tr className="border-b border-border bg-bg-subtle text-ink-tertiary">
              <th className="text-left px-5 py-3 label-cap font-semibold">Market</th>
              {cols.map(c => (
                <th key={c} className="text-center px-3 py-3 label-cap font-semibold">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.market} className="border-b border-border-subtle last:border-b-0 hover:bg-bg-hover">
                <td className="px-5 py-3 font-medium text-ink-primary">{r.market}</td>
                {r.coverage.map((c, i) => (
                  <td key={i} className="text-center px-3 py-3">
                    <CoverageDot state={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CoverageDot({ state }: { state: "on" | "partial" | "off" }) {
  if (state === "on") {
    return (
      <span className="inline-flex items-center justify-center">
        <span className="w-2 h-2 rounded-full bg-signal-buy" style={{ boxShadow: "0 0 8px rgba(63,185,80,0.5)" }} />
      </span>
    );
  }
  if (state === "partial") {
    return <span className="w-2 h-2 rounded-full bg-signal-warn inline-block" />;
  }
  return <span className="w-2 h-2 rounded-full border border-border-strong inline-block" />;
}

// ---------------------------------------------------------------------------
// 7) Founders' note — credibility / personality
// ---------------------------------------------------------------------------

function FoundersNote() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-20 border-b border-border-subtle">
      <div className="max-w-3xl">
        <span className="kicker">why we built this</span>
        <p className="display text-2xl sm:text-3xl text-ink-primary tracking-tight leading-snug mt-4">
          &ldquo;Bloomberg costs $25,000 a year and is built for institutions.
          Retail traders need the same caliber of reasoning — not a watered-down
          consumer app. So we built it.&rdquo;
        </p>
        <div className="mt-6 flex items-center gap-3 text-sm text-ink-tertiary font-mono">
          <span className="text-ink-secondary">— TradingAgents team</span>
          <span>·</span>
          <Link href="/about" className="hover:text-accent">read more</Link>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 8) CTA block — magic-link form + sample link
// ---------------------------------------------------------------------------

function CtaBlock() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-24">
      <div className="surface-elev p-8 sm:p-12 grid md:grid-cols-[1.2fr_1fr] gap-10 items-center crosshatch">
        <div>
          <span className="kicker">closed beta · free</span>
          <h2 className="display text-3xl sm:text-4xl tracking-tighter text-ink-primary mt-3 leading-tight">
            Run your first decision in <span className="text-accent">90 seconds</span>.
          </h2>
          <p className="text-ink-secondary mt-4 leading-relaxed">
            Magic-link sign-in. No password, no card. First decision is free.
            Authenticated users get 5 decisions per day on real LLM.
          </p>
        </div>
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
      <div className="border border-signal-buy/30 bg-signal-buy_soft/40 rounded p-5">
        <div className="flex items-center gap-2 text-signal-buy">
          <CheckCircle2 className="w-5 h-5" />
          <span className="font-mono uppercase tracking-wider text-sm">Joined</span>
        </div>
        <p className="text-sm text-ink-secondary mt-2">
          We&apos;ll email you when capacity opens. Have an invite code?{" "}
          <Link href="/redeem" className="text-accent hover:underline">
            Redeem
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="input flex-1 font-mono"
          disabled={state === "loading"}
        />
        <button
          type="submit"
          disabled={state === "loading" || !email}
          className="btn-primary"
        >
          {state === "loading" ? "..." : "Join"}
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
      {error && <p className="text-sm text-signal-sell font-mono">{error}</p>}
      <p className="text-2xs text-ink-tertiary font-mono uppercase tracking-wider pt-1">
        Have an invite code?{" "}
        <Link href="/redeem" className="text-accent hover:underline">
          Redeem →
        </Link>
      </p>
    </form>
  );
}

// ---------------------------------------------------------------------------
// 9) Disclaimer
// ---------------------------------------------------------------------------

function Disclaimer() {
  return (
    <section className="max-w-6xl mx-auto px-6 pb-20">
      <div className="border-l-2 border-signal-warn pl-4 py-2 text-sm text-ink-tertiary">
        <span className="text-ink-primary font-medium">Decision support, not investment advice.</span>{" "}
        Markets are uncertain. Past performance is not predictive. This is a research
        tool — execute trades through a regulated broker yourself.
        <Link href="/disclaimer" className="text-signal-info hover:underline ml-1">
          Full disclaimer →
        </Link>
      </div>
    </section>
  );
}
