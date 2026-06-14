"use client";

/**
 * /how-it-works — explains the 7-agent framework using the same narrative
 * as the Concordal paper: "modeled on a real trading firm's org chart".
 *
 * Sections:
 *   1. Hero: "AI framework that mirrors a real trading firm"
 *   2. Pipeline: 7-stage closed-loop visualization
 *   3. Analyst Team: 4-up grid with descriptions
 *   4. Trader × Risk: opportunity-vs-discipline framing
 *   5. Data Sources: honest list of what we actually use
 *   6. LLM Routing: how we keep cost down
 */

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Brain,
  Briefcase,
  CheckCircle2,
  Database,
  ExternalLink,
  FileText,
  Gavel,
  Globe,
  LineChart,
  MessageCircle,
  Newspaper,
  Scale,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import { useT } from "../lib/i18n";
import { ReflectionMechanism } from "../components/PaperBacked";

export default function HowItWorksPage() {
  const { t } = useT();
  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border-subtle">
        <div className="absolute inset-0 grid-bg pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-6 py-16 sm:py-20">
          <span className="label-cap">{t("how.label")}</span>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.1] mt-3 max-w-3xl">
            <span className="text-gradient">{t("how.heroTitle")}</span>
          </h1>
          <p className="text-lg text-ink-secondary mt-5 max-w-2xl leading-relaxed">
            {t("how.heroBody")}
          </p>
        </div>
      </section>

      {/* THREE VALUE PROPS (from latest TauricResearch slide) */}
      <ValueProps />

      {/* PIPELINE — full org chart */}
      <Pipeline />

      {/* ANALYSTS — 4-up grid */}
      <Analysts />

      {/* TRADER × RISK */}
      <TraderRiskFlow />

      {/* REFLECTION MECHANISM — paper §6.4, added per audit */}
      <section className="max-w-6xl mx-auto px-6">
        <ReflectionMechanism />
      </section>

      {/* DATA SOURCES */}
      <DataSources />

      {/* LLM ROUTING */}
      <LLMRouting />

      {/* CTA */}
      <CtaFooter />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 0. Three core value props (Realistic Firm Sim · Dialectical · Structured)
// ---------------------------------------------------------------------------

function ValueProps() {
  const { t } = useT();
  const props = [
    {
      icon: <Users className="w-5 h-5" />,
      color: "text-signal-buy",
      bg: "bg-signal-buy_soft",
      title: t("value.firmTitle"),
      body: t("value.firmBody"),
    },
    {
      icon: <Scale className="w-5 h-5" />,
      color: "text-signal-info",
      bg: "bg-signal-info_soft",
      title: t("value.dialecticTitle"),
      body: t("value.dialecticBody"),
    },
    {
      icon: <Workflow className="w-5 h-5" />,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
      title: t("value.commTitle"),
      body: t("value.commBody"),
    },
  ];
  return (
    <section className="max-w-6xl mx-auto px-6 py-16 border-t border-border-subtle">
      <div className="text-center mb-12 max-w-3xl mx-auto">
        <span className="label-cap">{t("value.label")}</span>
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mt-3 leading-snug">
          {t("value.title")}
        </h2>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {props.map((p, i) => (
          <div
            key={i}
            className="surface p-6 hover:border-border transition-colors"
          >
            <div
              className={`w-12 h-12 rounded-xl ${p.bg} ${p.color} flex items-center justify-center mb-4`}
            >
              {p.icon}
            </div>
            <h3 className="text-base font-semibold mb-2">{p.title}</h3>
            <p className="text-sm text-ink-secondary leading-relaxed">
              {p.body}
            </p>
          </div>
        ))}
      </div>
      <p className="text-center mt-8 text-xs text-ink-tertiary">
        {t("value.attribution")}{" "}
        <a
          href="https://github.com/TauricResearch/TradingAgents"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          github.com/TauricResearch/TradingAgents
        </a>
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 1. Pipeline
// ---------------------------------------------------------------------------

function Pipeline() {
  const { t } = useT();
  const stages = [
    {
      icon: <Database className="w-4 h-4" />,
      stage: t("how.stage.gather"),
      team: t("how.stage.gatherTeam"),
      detail: t("how.stage.gatherDetail"),
      color: "#56d364",
    },
    {
      icon: <MessageCircle className="w-4 h-4" />,
      stage: t("how.stage.dialect"),
      team: t("how.stage.dialectTeam"),
      detail: t("how.stage.dialectDetail"),
      color: "#5fa8e8",
    },
    {
      icon: <Briefcase className="w-4 h-4" />,
      stage: t("how.stage.trade"),
      team: t("how.stage.tradeTeam"),
      detail: t("how.stage.tradeDetail"),
      color: "#a371f7",
    },
    {
      icon: <ShieldCheck className="w-4 h-4" />,
      stage: t("how.stage.risk"),
      team: t("how.stage.riskTeam"),
      detail: t("how.stage.riskDetail"),
      color: "#d4a72c",
    },
    {
      icon: <Gavel className="w-4 h-4" />,
      stage: t("how.stage.final"),
      team: t("how.stage.finalTeam"),
      detail: t("how.stage.finalDetail"),
      color: "#f85149",
    },
    {
      icon: <CheckCircle2 className="w-4 h-4" />,
      stage: t("how.stage.exec"),
      team: t("how.stage.execTeam"),
      detail: t("how.stage.execDetail"),
      color: "#9aa6b8",
    },
  ];
  return (
    <section className="max-w-6xl mx-auto px-6 py-20">
      <div className="text-center mb-12">
        <span className="label-cap">{t("how.pipelineLabel")}</span>
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-2 text-gradient">
          {t("how.pipelineTitle")}
        </h2>
        <p className="text-ink-secondary mt-3 max-w-2xl mx-auto leading-relaxed">
          {t("how.pipelineBody")}
        </p>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {stages.map((s, i) => (
          <div
            key={i}
            className="surface p-5 relative group hover:border-border transition-colors"
            style={{ animation: `slideUp 0.5s ease-out ${i * 0.07}s both` }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  background: `${s.color}20`,
                  color: s.color,
                  boxShadow: `0 0 16px ${s.color}30`,
                }}
              >
                {s.icon}
              </div>
              <span className="label-cap">
                #{i + 1} · {s.stage}
              </span>
            </div>
            <div className="text-base font-semibold mb-1.5">{s.team}</div>
            <p className="text-sm text-ink-secondary leading-relaxed">
              {s.detail}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 2. Analyst Team (slide 2)
// ---------------------------------------------------------------------------

function Analysts() {
  const { t } = useT();
  const items = [
    {
      icon: <BarChart3 className="w-5 h-5" />,
      color: "text-signal-buy",
      bg: "bg-signal-buy_soft",
      title: t("how.analyst.fundTitle"),
      body: t("how.analyst.fundBody"),
    },
    {
      icon: <Users className="w-5 h-5" />,
      color: "text-signal-info",
      bg: "bg-signal-info_soft",
      title: t("how.analyst.sentTitle"),
      body: t("how.analyst.sentBody"),
    },
    {
      icon: <Newspaper className="w-5 h-5" />,
      color: "text-signal-warn",
      bg: "bg-signal-warn_soft",
      title: t("how.analyst.newsTitle"),
      body: t("how.analyst.newsBody"),
    },
    {
      icon: <LineChart className="w-5 h-5" />,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
      title: t("how.analyst.techTitle"),
      body: t("how.analyst.techBody"),
    },
  ];
  return (
    <section className="max-w-6xl mx-auto px-6 py-20 border-t border-border-subtle">
      <div className="text-center mb-12">
        <span className="label-cap">{t("how.analystsLabel")}</span>
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-2">
          {t("how.analystsTitle")}
        </h2>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {items.map((it, i) => (
          <div
            key={i}
            className="surface p-6 hover:border-border transition-colors group"
          >
            <div
              className={`w-12 h-12 rounded-xl ${it.bg} ${it.color} flex items-center justify-center mb-4 group-hover:scale-105 transition-transform`}
            >
              {it.icon}
            </div>
            <h3 className="text-lg font-semibold mb-2">{it.title}</h3>
            <p className="text-sm text-ink-secondary leading-relaxed">
              {it.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 3. Trader × Risk (slide 3)
// ---------------------------------------------------------------------------

function TraderRiskFlow() {
  const { t } = useT();
  return (
    <section className="max-w-6xl mx-auto px-6 py-20 border-t border-border-subtle">
      <div className="text-center mb-12">
        <span className="label-cap">{t("how.balanceLabel")}</span>
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-2 text-gradient">
          {t("how.balanceTitle")}
        </h2>
      </div>
      <div className="grid md:grid-cols-[1fr_auto_1fr] gap-6 items-center">
        <div className="surface-elev p-6 border-l-2 border-l-purple-400">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center">
              <Briefcase className="w-5 h-5" />
            </div>
            <span className="label-cap">step 1</span>
          </div>
          <h3 className="text-lg font-semibold mb-2">
            {t("how.balance.traderTitle")}
          </h3>
          <p className="text-sm text-ink-secondary leading-relaxed">
            {t("how.balance.traderBody")}
          </p>
        </div>

        <div className="hidden md:flex flex-col items-center gap-2">
          <ArrowRight className="w-6 h-6 text-ink-tertiary" />
          <span className="text-2xs label-cap">proposal</span>
        </div>

        <div className="surface-elev p-6 border-l-2 border-l-signal-warn">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-lg bg-signal-warn_soft text-signal-warn flex items-center justify-center">
              <Scale className="w-5 h-5" />
            </div>
            <span className="label-cap">step 2</span>
          </div>
          <h3 className="text-lg font-semibold mb-2">
            {t("how.balance.riskTitle")}
          </h3>
          <p className="text-sm text-ink-secondary leading-relaxed">
            {t("how.balance.riskBody")}
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 4. Data sources (honest list)
// ---------------------------------------------------------------------------

function DataSources() {
  const { t } = useT();
  const rows = [
    {
      icon: <LineChart className="w-4 h-4" />,
      label: t("how.data.usMarket"),
      src: t("how.data.usMarketSrc"),
      live: true,
    },
    {
      icon: <LineChart className="w-4 h-4" />,
      label: t("how.data.cnMarket"),
      src: t("how.data.cnMarketSrc"),
      live: true,
    },
    {
      icon: <Newspaper className="w-4 h-4" />,
      label: t("how.data.usNews"),
      src: t("how.data.usNewsSrc"),
      live: true,
    },
    {
      icon: <Newspaper className="w-4 h-4" />,
      label: t("how.data.cnNews"),
      src: t("how.data.cnNewsSrc"),
      live: true,
    },
    {
      icon: <FileText className="w-4 h-4" />,
      label: t("how.data.fundamentals"),
      src: t("how.data.fundamentalsSrc"),
      live: true,
    },
    {
      icon: <Globe className="w-4 h-4" />,
      label: t("how.data.sentiment"),
      src: t("how.data.sentimentSrc"),
      live: false,
    },
  ];
  return (
    <section className="max-w-6xl mx-auto px-6 py-20 border-t border-border-subtle">
      <div className="text-center mb-12">
        <span className="label-cap">{t("how.dataLabel")}</span>
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-2">
          {t("how.dataTitle")}
        </h2>
        <p className="text-ink-secondary mt-3 max-w-2xl mx-auto leading-relaxed">
          {t("how.dataBody")}
        </p>
      </div>
      <div className="surface overflow-hidden">
        {rows.map((r, i) => (
          <div
            key={i}
            className="px-5 py-4 grid grid-cols-[24px_1fr_2fr_auto] gap-3 items-center border-b border-border-subtle last:border-b-0 hover:bg-bg-hover/30 transition-colors"
          >
            <span className="text-ink-tertiary">{r.icon}</span>
            <span className="text-sm font-medium">{r.label}</span>
            <span className="text-sm text-ink-secondary font-mono text-xs">
              {r.src}
            </span>
            <span
              className={`pill text-2xs ${
                r.live
                  ? "bg-signal-buy_soft text-signal-buy"
                  : "bg-bg-hover text-ink-tertiary"
              }`}
            >
              {r.live ? "LIVE" : "MOCK"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 5. LLM Routing
// ---------------------------------------------------------------------------

function LLMRouting() {
  const { t } = useT();
  return (
    <section className="max-w-6xl mx-auto px-6 py-20 border-t border-border-subtle">
      <div className="text-center mb-12">
        <span className="label-cap">{t("how.modelsLabel")}</span>
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-2">
          {t("how.modelsTitle")}
        </h2>
        <p className="text-ink-secondary mt-3 max-w-2xl mx-auto leading-relaxed">
          {t("how.modelsBody")}
        </p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="surface-elev p-6 border-l-2 border-l-accent">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-lg bg-accent-muted text-accent flex items-center justify-center">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <div className="text-base font-semibold">
                {t("how.models.deep")}
              </div>
              <div className="text-xs text-ink-tertiary">
                {t("how.models.deepFor")}
              </div>
            </div>
          </div>
          <code className="text-xs font-mono text-ink-secondary block mt-2">
            {t("how.models.deepModel")}
          </code>
        </div>
        <div className="surface-elev p-6 border-l-2 border-l-signal-info">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-lg bg-signal-info_soft text-signal-info flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="text-base font-semibold">
                {t("how.models.fast")}
              </div>
              <div className="text-xs text-ink-tertiary">
                {t("how.models.fastFor")}
              </div>
            </div>
          </div>
          <code className="text-xs font-mono text-ink-secondary block mt-2">
            {t("how.models.fastModel")}
          </code>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 6. CTA
// ---------------------------------------------------------------------------

function CtaFooter() {
  const { t } = useT();
  return (
    <section className="max-w-6xl mx-auto px-6 py-16 border-t border-border-subtle">
      <div className="surface-elev p-8 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-accent" />
          <p className="text-base text-ink-primary">
            <Workflow className="w-4 h-4 inline-block mr-1 text-ink-tertiary" />
            <strong>End-to-end traceable.</strong>{" "}
            <span className="text-ink-secondary">
              Every analyst report, debate turn, and risk vote is stored in the JSON trace.
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/decision" className="btn-primary">
            {t("how.cta.try")}
            <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="https://github.com/gallen666/trading-agents-platform"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
          >
            {t("how.cta.code")}
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
