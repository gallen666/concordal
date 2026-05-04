"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ShieldAlert,
  Layers,
  GitBranch,
  Zap,
  CheckCircle2,
} from "lucide-react";
import { api } from "./lib/api";
import { AgentOrbit } from "./components/AgentOrbit";

export default function Landing() {
  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border-subtle">
        <div className="absolute inset-0 grid-bg pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-6 py-12 sm:py-16 grid lg:grid-cols-[1.1fr_1fr] gap-12 items-center">
          <div className="space-y-6">
            <span className="pill bg-accent-muted text-accent border border-accent/20">
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inset-0 rounded-full bg-accent animate-pulse-slow" />
                <span className="relative rounded-full bg-accent w-1.5 h-1.5" />
              </span>
              Closed beta · Decision-support
            </span>

            <h1 className="text-5xl sm:text-6xl font-semibold tracking-tight leading-[1.05]">
              <span className="text-gradient">Seven AI agents</span>
              <br />
              <span className="text-gradient-accent">debate every ticker</span>
              <br />
              <span className="text-gradient">on your watchlist.</span>
            </h1>

            <p className="text-lg text-ink-secondary max-w-xl leading-relaxed">
              A multi-agent LLM research desk modeled on real trading firms —
              fundamentals, sentiment, news, technical analysts; bull/bear
              researcher debate; risk committee; fund manager. Every decision
              is fully traceable, line by line.
            </p>

            <Waitlist />

            <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-ink-tertiary pt-2">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                No-lookahead enforced
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                Fully open-source core
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                Never executes trades
              </span>
            </div>
          </div>

          <div className="hidden lg:block">
            <AgentOrbit />
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <span className="label-cap">What you get</span>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-2 text-gradient">
            Research, not a black box.
          </h2>
          <p className="text-ink-secondary mt-3 max-w-2xl mx-auto">
            Every recommendation comes with the full debate behind it. Read the
            reasoning, challenge it, override it.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Feature
            icon={<Layers className="w-5 h-5" />}
            title="One-click decision"
            body="Enter a ticker. Seven agents run in sequence — analysts, debaters, trader, risk committee, fund manager — and produce an explained Buy/Hold/Sell with target weight and confidence."
          />
          <Feature
            icon={<GitBranch className="w-5 h-5" />}
            title="Backtest replay"
            body="See how the agents would have decided on past dates. Strict no-lookahead enforced at the data layer, so you can trust the simulation."
          />
          <Feature
            icon={<Zap className="w-5 h-5" />}
            title="Daily watchlist briefings"
            body="Every ticker you follow gets an automatic pre-market report (rolling out). Wake up to a coherent argument, not a wall of indicators."
          />
        </div>
      </section>

      {/* PIPELINE */}
      <section className="max-w-6xl mx-auto px-6 py-16 border-t border-border-subtle">
        <div className="text-center mb-10">
          <span className="label-cap">Inside one decision</span>
          <h2 className="text-2xl sm:text-3xl font-semibold mt-2">
            The pipeline mirrors a real trading firm.
          </h2>
        </div>
        <Pipeline />
      </section>

      {/* DISCLAIMER */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="surface p-5 flex items-start gap-3 text-sm text-ink-secondary">
          <ShieldAlert className="w-5 h-5 text-signal-warn shrink-0 mt-0.5" />
          <p>
            <strong className="text-ink-primary">
              Decision-support tool only.
            </strong>{" "}
            Outputs are research generated by language models, not investment
            advice, not personal recommendations, and not solicitations to buy
            or sell any security. We don&apos;t execute trades. Past performance
            and backtests do not predict future results. Read the{" "}
            <Link
              href="/disclaimer"
              className="text-accent hover:text-accent-hover underline-offset-4 hover:underline"
            >
              full disclaimer
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="surface p-6 hover:border-border transition-colors group">
      <div className="w-10 h-10 rounded-lg bg-accent-muted text-accent flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
        {icon}
      </div>
      <h3 className="font-semibold mb-1.5">{title}</h3>
      <p className="text-sm text-ink-secondary leading-relaxed">{body}</p>
    </div>
  );
}

function Pipeline() {
  const stages = [
    {
      label: "Data gathering",
      detail: "4 analysts in parallel",
      color: "#56d364",
    },
    {
      label: "Dialectical analysis",
      detail: "Bull vs Bear debate",
      color: "#5fa8e8",
    },
    {
      label: "Trading decision",
      detail: "Trader synthesis",
      color: "#a371f7",
    },
    {
      label: "Risk control",
      detail: "Aggressive / Neutral / Conservative",
      color: "#d4a72c",
    },
    {
      label: "Final approval",
      detail: "Fund manager",
      color: "#f85149",
    },
  ];
  return (
    <div className="relative">
      <div className="grid md:grid-cols-5 gap-3">
        {stages.map((s, i) => (
          <div
            key={i}
            className="surface p-4 relative"
            style={{
              animation: `slideUp 0.5s ease-out ${i * 0.1}s both`,
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: s.color, boxShadow: `0 0 12px ${s.color}` }}
              />
              <span className="text-2xs label-cap">step {i + 1}</span>
            </div>
            <div className="font-medium text-sm">{s.label}</div>
            <div className="text-xs text-ink-tertiary mt-1 leading-relaxed">
              {s.detail}
            </div>
            {i < stages.length - 1 && (
              <ArrowRight className="hidden md:block absolute top-1/2 -right-2.5 w-4 h-4 text-ink-muted" />
            )}
          </div>
        ))}
      </div>
    </div>
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
      <div className="surface p-5 max-w-xl">
        <div className="flex items-center gap-2 text-accent">
          <CheckCircle2 className="w-5 h-5" />
          <span className="font-medium">You&apos;re on the list</span>
        </div>
        <p className="text-sm text-ink-secondary mt-2">
          We&apos;ll send your invite as we onboard the first cohort. Already
          have a code?{" "}
          <Link href="/redeem" className="text-accent hover:underline">
            Redeem here
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2 max-w-xl">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@firm.com"
          className="input flex-1"
          disabled={state === "loading"}
        />
        <button
          type="submit"
          disabled={state === "loading" || !email}
          className="btn-primary"
        >
          {state === "loading" ? "Sending…" : "Join waitlist"}
          {state !== "loading" && <ArrowRight className="w-4 h-4" />}
        </button>
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="(optional) what would you use this for?"
        className="input w-full"
        disabled={state === "loading"}
      />
      {error && <p className="text-sm text-signal-sell">{error}</p>}
      <p className="text-xs text-ink-tertiary">
        Already have a code?{" "}
        <Link href="/redeem" className="text-accent hover:underline">
          Redeem
        </Link>
      </p>
    </form>
  );
}
