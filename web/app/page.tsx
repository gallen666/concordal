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
import { useT } from "./lib/i18n";

export default function Landing() {
  const { t } = useT();
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
              {t("landing.pillBeta")}
            </span>

            <h1 className="text-5xl sm:text-6xl font-semibold tracking-tight leading-[1.05]">
              <span className="text-gradient">{t("landing.heroLine1")}</span>
              <br />
              <span className="text-gradient-accent">{t("landing.heroLine2")}</span>
              <br />
              <span className="text-gradient">{t("landing.heroLine3")}</span>
            </h1>

            <p className="text-lg text-ink-secondary max-w-xl leading-relaxed">
              {t("landing.heroBlurb")}
            </p>

            <Waitlist />

            <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-ink-tertiary pt-2">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                {t("landing.checkNoLookahead")}
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                {t("landing.checkOpenSource")}
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                {t("landing.checkNoTrades")}
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
          <span className="label-cap">{t("landing.featuresLabel")}</span>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-2 text-gradient">
            {t("landing.featuresHeading")}
          </h2>
          <p className="text-ink-secondary mt-3 max-w-2xl mx-auto">
            {t("landing.featuresBlurb")}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Feature
            icon={<Layers className="w-5 h-5" />}
            title={t("landing.feature1Title")}
            body={t("landing.feature1Body")}
          />
          <Feature
            icon={<GitBranch className="w-5 h-5" />}
            title={t("landing.feature2Title")}
            body={t("landing.feature2Body")}
          />
          <Feature
            icon={<Zap className="w-5 h-5" />}
            title={t("landing.feature3Title")}
            body={t("landing.feature3Body")}
          />
        </div>
      </section>

      {/* PIPELINE */}
      <section className="max-w-6xl mx-auto px-6 py-16 border-t border-border-subtle">
        <div className="text-center mb-10">
          <span className="label-cap">{t("landing.pipelineLabel")}</span>
          <h2 className="text-2xl sm:text-3xl font-semibold mt-2">
            {t("landing.pipelineHeading")}
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
              {t("landing.disclaimerStrong")}
            </strong>{" "}
            {t("landing.disclaimerBody")}{" "}
            <Link
              href="/disclaimer"
              className="text-accent hover:text-accent-hover underline-offset-4 hover:underline"
            >
              {t("landing.disclaimerLink")}
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
  const { t } = useT();
  const stages = [
    {
      label: t("landing.pipeline1Label"),
      detail: t("landing.pipeline1Detail"),
      color: "#56d364",
    },
    {
      label: t("landing.pipeline2Label"),
      detail: t("landing.pipeline2Detail"),
      color: "#5fa8e8",
    },
    {
      label: t("landing.pipeline3Label"),
      detail: t("landing.pipeline3Detail"),
      color: "#a371f7",
    },
    {
      label: t("landing.pipeline4Label"),
      detail: t("landing.pipeline4Detail"),
      color: "#d4a72c",
    },
    {
      label: t("landing.pipeline5Label"),
      detail: t("landing.pipeline5Detail"),
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
              <span className="text-2xs label-cap">
                {t("landing.pipelineStep")} {i + 1}
              </span>
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
  const { t } = useT();
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
          <span className="font-medium">{t("waitlist.successTitle")}</span>
        </div>
        <p className="text-sm text-ink-secondary mt-2">
          {t("waitlist.successBody1")}{" "}
          <Link href="/redeem" className="text-accent hover:underline">
            {t("waitlist.successRedeem")}
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
          placeholder={t("waitlist.emailPlaceholder")}
          className="input flex-1"
          disabled={state === "loading"}
        />
        <button
          type="submit"
          disabled={state === "loading" || !email}
          className="btn-primary"
        >
          {state === "loading" ? t("waitlist.sending") : t("waitlist.join")}
          {state !== "loading" && <ArrowRight className="w-4 h-4" />}
        </button>
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("waitlist.notePlaceholder")}
        className="input w-full"
        disabled={state === "loading"}
      />
      {error && <p className="text-sm text-signal-sell">{error}</p>}
      <p className="text-xs text-ink-tertiary">
        {t("waitlist.alreadyHaveCode")}{" "}
        <Link href="/redeem" className="text-accent hover:underline">
          {t("waitlist.redeem")}
        </Link>
      </p>
    </form>
  );
}
