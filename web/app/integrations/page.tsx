"use client";

/**
 * /integrations — landing for cross-distribution channels.
 *
 * Today we ship one integration: OpenBB Workspace custom widgets. The
 * page advertises the manifest URL the user pastes into OpenBB Settings,
 * shows the three widgets they'll get, and links out to OpenBB's docs.
 *
 * The backend lives on Render at the same host that serves /v1/* — so
 * we resolve the manifest URL from NEXT_PUBLIC_API at runtime instead
 * of hard-coding a stale Render URL.
 */

import { useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  Copy,
  Globe,
  LayoutDashboard,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useT } from "../lib/i18n";

const API_BASE = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

export default function IntegrationsPage() {
  const { t } = useT();
  const manifestUrl = `${API_BASE}/openbb/widgets.json`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(manifestUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore — fall back to user manually selecting + copying
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-8">
        <span className="label-cap">{t("integrations.label")}</span>
        <h1 className="text-3xl font-semibold mt-1">
          {t("integrations.heading")}
        </h1>
        <p className="text-ink-secondary mt-2 max-w-2xl">
          {t("integrations.subheading")}
        </p>
      </div>

      {/* OpenBB integration card */}
      <section className="surface-elev p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-2xl font-semibold">
                {t("integrations.openbb.title")}
              </h2>
              <span className="pill bg-accent-muted text-accent border border-accent/30">
                <Sparkles className="w-3 h-3" />
                {t("integrations.openbb.tag")}
              </span>
            </div>
            <p className="text-ink-secondary leading-relaxed max-w-2xl">
              {t("integrations.openbb.body")}
            </p>
          </div>
        </div>

        {/* Backend URL block */}
        <div className="mt-6">
          <div className="label-cap mb-2">
            {t("integrations.openbb.urlLabel")}
          </div>
          <div className="flex items-stretch gap-2">
            <code className="flex-1 px-3 py-2.5 bg-bg-base border border-border-subtle rounded-md font-mono text-sm break-all">
              {manifestUrl}
            </code>
            <button
              onClick={copy}
              className="btn-secondary text-sm whitespace-nowrap"
              aria-label={t("integrations.openbb.copy")}
            >
              {copied ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-accent" />
                  {t("integrations.openbb.copied")}
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  {t("integrations.openbb.copy")}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Setup steps */}
        <div className="mt-8">
          <div className="label-cap mb-3">
            {t("integrations.openbb.steps")}
          </div>
          <ol className="space-y-2.5">
            <Step n={1}>{t("integrations.openbb.step1")}</Step>
            <Step n={2}>{t("integrations.openbb.step2")}</Step>
            <Step n={3}>{t("integrations.openbb.step3")}</Step>
          </ol>
        </div>

        {/* Widgets exposed */}
        <div className="mt-8 grid sm:grid-cols-3 gap-3">
          <WidgetCard
            icon={<LayoutDashboard className="w-4 h-4" />}
            title={t("integrations.widget1")}
            color="text-signal-buy"
          />
          <WidgetCard
            icon={<Globe className="w-4 h-4" />}
            title={t("integrations.widget2")}
            color="text-signal-info"
          />
          <WidgetCard
            icon={<TrendingUp className="w-4 h-4" />}
            title={t("integrations.widget3")}
            color="text-purple-400"
          />
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="https://pro.openbb.co"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary text-sm"
          >
            {t("integrations.openbb.cta")}
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
          <a
            href="https://docs.openbb.co/workspace/custom-backend"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost text-sm"
          >
            {t("integrations.openbb.docs")}
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </section>

      {/* Future integrations teaser */}
      <section className="mt-6 surface p-5">
        <div className="label-cap mb-1.5">{t("integrations.future")}</div>
        <p className="text-sm text-ink-secondary leading-relaxed">
          {t("integrations.future.body")}
        </p>
      </section>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 items-start">
      <span className="flex-none w-6 h-6 rounded-full bg-accent-muted text-accent border border-accent/30 flex items-center justify-center text-xs font-semibold font-mono">
        {n}
      </span>
      <span className="text-sm text-ink-primary leading-relaxed pt-0.5">
        {children}
      </span>
    </li>
  );
}

function WidgetCard({
  icon,
  title,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  color: string;
}) {
  return (
    <div className="surface p-3 flex items-center gap-2.5">
      <span className={color}>{icon}</span>
      <span className="text-sm text-ink-primary">{title}</span>
    </div>
  );
}
