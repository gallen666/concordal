"use client";

/**
 * /ecosystem — the 10-project meta-platform showcase.
 *
 * Pulls live registry data from /v1/ecosystem so the page reflects
 * what's actually wired into the data bus right now (vs. what's
 * planned). The grouping/order matches the stack diagram below.
 *
 * Sections (in order, mirroring the data-flow diagram):
 *   1. Hero + 4 stat cards (total / live / building / planned)
 *   2. Data-flow stack diagram — vertical spine showing which layer
 *      each project sits in
 *   3. Per-role grouped grid of project cards
 *   4. "How the data bus works" explainer
 */

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Database,
  Layers,
  Network,
  Sparkles,
  Wrench,
  Zap,
} from "lucide-react";
import { useT } from "../lib/i18n";
import { cn } from "../lib/cn";

const API_BASE = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

type Status = "live" | "beta" | "building" | "planned";
type Role =
  | "data_source"
  | "feature_engine"
  | "llm_layer"
  | "strategy_rl"
  | "backtest"
  | "execution"
  | "terminal";

interface Project {
  slug: string;
  name: string;
  tagline: string;
  role: Role;
  github: string;
  stars_k: number;
  license: string;
  status: Status;
  integrates_via: string;
  we_consume: string[];
  we_export: string[];
  feeds_into: string[];
  fed_by: string[];
}

interface EcosystemResponse {
  projects: Project[];
  stats: {
    total_projects: number;
    total_stars_k: number;
    by_status: Partial<Record<Status, number>>;
  };
  wired_sources: Record<string, string[]>;
}

// Order roles top-to-bottom along the data-flow stack.
const ROLE_ORDER: Role[] = [
  "data_source",
  "feature_engine",
  "llm_layer",
  "strategy_rl",
  "backtest",
  "execution",
  "terminal",
];

const ROLE_ICON: Record<Role, React.ReactNode> = {
  data_source: <Database className="w-4 h-4" />,
  feature_engine: <Layers className="w-4 h-4" />,
  llm_layer: <Sparkles className="w-4 h-4" />,
  strategy_rl: <Zap className="w-4 h-4" />,
  backtest: <Network className="w-4 h-4" />,
  execution: <ArrowUpRight className="w-4 h-4" />,
  terminal: <Network className="w-4 h-4" />,
};

const STATUS_STYLE: Record<Status, { bg: string; text: string; border: string; icon: React.ReactNode }> = {
  live: {
    bg: "bg-signal-buy_soft",
    text: "text-signal-buy",
    border: "border-signal-buy/30",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  beta: {
    bg: "bg-signal-info_soft",
    text: "text-signal-info",
    border: "border-signal-info/30",
    icon: <Sparkles className="w-3 h-3" />,
  },
  building: {
    bg: "bg-signal-warn_soft",
    text: "text-signal-warn",
    border: "border-signal-warn/30",
    icon: <Wrench className="w-3 h-3" />,
  },
  planned: {
    bg: "bg-bg-hover",
    text: "text-ink-tertiary",
    border: "border-border",
    icon: <Clock className="w-3 h-3" />,
  },
};

export default function EcosystemPage() {
  const { t } = useT();
  const [data, setData] = useState<EcosystemResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/v1/ecosystem`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="surface border-signal-sell/30 p-4 text-sm text-signal-sell">
          Failed to load ecosystem registry: {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10 animate-pulse">
        <div className="h-8 w-64 bg-bg-hover rounded mb-3" />
        <div className="h-4 w-full max-w-2xl bg-bg-hover rounded mb-2" />
        <div className="h-4 w-3/4 max-w-xl bg-bg-hover rounded" />
      </div>
    );
  }

  const { projects, stats, wired_sources } = data;
  const groupedByRole: Partial<Record<Role, Project[]>> = {};
  for (const p of projects) {
    (groupedByRole[p.role] ||= []).push(p);
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      {/* Hero */}
      <div className="mb-8">
        <span className="label-cap">{t("eco.label")}</span>
        <h1 className="text-3xl font-semibold mt-1 leading-tight">
          {t("eco.heading")}
        </h1>
        <p className="text-ink-secondary mt-3 max-w-3xl leading-relaxed">
          {t("eco.subheading")}
        </p>
      </div>

      {/* Honesty banner — explicit about live vs roadmap */}
      <div className="surface border-signal-info/30 bg-signal-info_soft/40 p-4 mb-8 flex gap-3 items-start">
        <AlertTriangle className="w-5 h-5 text-signal-info shrink-0 mt-0.5" />
        <div className="flex-1 text-sm">
          <div className="font-semibold text-ink-primary">
            {t("eco.honesty.title")}
          </div>
          <p className="text-ink-secondary mt-1 leading-relaxed">
            {t("eco.honesty.body")}
          </p>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
        <StatCard label={t("eco.statTotal")} value={String(stats.total_projects)} accent />
        <StatCard
          label={t("eco.statStars")}
          value={`${stats.total_stars_k.toFixed(0)}k★`}
          accent
        />
        <StatCard
          label={t("eco.statLive")}
          value={String(stats.by_status.live ?? 0)}
        />
        <StatCard
          label={t("eco.statBuilding") + " / " + t("eco.statPlanned")}
          value={`${stats.by_status.building ?? 0} / ${stats.by_status.planned ?? 0}`}
        />
      </div>

      {/* DATA BUS · LIVE — pulled in real time from /v1/databus/status and
          /v1/databus/telemetry. This is the truth of the spine: which
          ecosystem projects are actually answering Need.X fetches right
          now, with last-N requests and their latency. Lands ABOVE the
          data-flow diagram because it's the live answer the diagram is
          claiming. */}
      <DataBusLive />

      {/* Data-flow stack diagram (vertical spine) */}
      <section className="mb-12">
        <div className="flex items-baseline gap-3 mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Network className="w-4 h-4 text-accent" />
            {t("eco.dataFlow")}
          </h2>
        </div>
        <div className="surface-elev p-6">
          <div className="space-y-2">
            {ROLE_ORDER.filter((r) => groupedByRole[r]?.length).map((role, idx, arr) => (
              <RoleStackRow
                key={role}
                role={role}
                projects={groupedByRole[role] ?? []}
                isLast={idx === arr.length - 1}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Status-grouped sections — Live first to spotlight what actually works */}
      <section className="mb-12 space-y-8">
        <StatusSection
          title={t("eco.section.live")}
          icon={<CheckCircle2 className="w-4 h-4 text-signal-buy" />}
          projects={projects.filter((p) => p.status === "live")}
          wired={wired_sources}
        />
        <StatusSection
          title={t("eco.section.building")}
          icon={<Wrench className="w-4 h-4 text-signal-warn" />}
          projects={projects.filter((p) => p.status === "building")}
          wired={wired_sources}
        />
        <StatusSection
          title={t("eco.section.roadmap")}
          icon={<Clock className="w-4 h-4 text-ink-tertiary" />}
          projects={projects.filter(
            (p) => p.status === "planned" || p.status === "beta"
          )}
          wired={wired_sources}
        />
      </section>

      {/* How it works explainer */}
      <section>
        <div className="surface p-6">
          <div className="flex items-baseline gap-3 mb-2">
            <h2 className="text-lg font-semibold">
              {t("eco.howItWorksTitle")}
            </h2>
          </div>
          <p className="text-sm text-ink-secondary leading-relaxed">
            {t("eco.howItWorksBody")}
          </p>
          <div className="mt-4 surface bg-bg-base p-3 font-mono text-xs leading-relaxed text-ink-secondary overflow-x-auto">
            <div>bus.fetch(Need.macro(asof=date(2024,6,1), region="US"))</div>
            <div>bus.fetch(Need.factor("alpha158", ticker="AAPL", asof=...))</div>
            <div>bus.fetch(Need.crypto_ohlcv(symbol="BTC/USDT", since=...))</div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ---- Sub-components -------------------------------------------------------

function StatusSection({
  title,
  icon,
  projects,
  wired,
}: {
  title: string;
  icon: React.ReactNode;
  projects: Project[];
  wired: Record<string, string[]>;
}) {
  if (projects.length === 0) return null;
  return (
    <div>
      <div className="flex items-baseline gap-3 mb-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          {icon}
          {title}
        </h2>
        <span className="text-xs text-ink-tertiary font-mono">
          {projects.length}
        </span>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {projects.map((p) => (
          <ProjectCard key={p.slug} project={p} wired={wired} />
        ))}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="surface p-4">
      <div className="label-cap">{label}</div>
      <div
        className={cn(
          "mt-1.5 text-2xl font-semibold leading-none font-mono",
          accent && "text-accent"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function RoleStackRow({
  role,
  projects,
  isLast,
}: {
  role: Role;
  projects: Project[];
  isLast: boolean;
}) {
  const { t } = useT();
  return (
    <>
      <div className="flex items-center gap-3 py-2">
        <span className="flex items-center gap-2 text-ink-secondary text-sm w-44 shrink-0">
          <span className="text-accent">{ROLE_ICON[role]}</span>
          {t(`eco.role.${role}` as `eco.role.${Role}`)}
        </span>
        <div className="flex flex-wrap gap-1.5 flex-1">
          {projects.map((p) => {
            const s = STATUS_STYLE[p.status];
            return (
              <span
                key={p.slug}
                className={cn(
                  "pill border whitespace-nowrap",
                  s.bg,
                  s.text,
                  s.border
                )}
                title={`${p.name} · ${p.tagline}`}
              >
                {s.icon}
                {p.name}
              </span>
            );
          })}
        </div>
      </div>
      {!isLast && (
        <div className="flex items-center pl-44 text-ink-muted">
          <ArrowDown className="w-3.5 h-3.5" />
        </div>
      )}
    </>
  );
}

function ProjectCard({
  project,
  wired,
}: {
  project: Project;
  wired: Record<string, string[]>;
}) {
  const { t } = useT();
  const s = STATUS_STYLE[project.status];

  // A project is "wired today" if any need_kind in wired_sources includes its slug.
  const isWiredToBus = Object.values(wired).some((slugs) =>
    slugs.includes(project.slug)
  );

  return (
    <div className="surface p-4 hover:border-border transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-ink-primary">
              {project.name}
            </h3>
            <span className="text-xs text-ink-tertiary font-mono">
              {project.stars_k}k★
            </span>
            <span className="text-2xs text-ink-muted">{project.license}</span>
          </div>
          <p className="text-sm text-ink-secondary mt-1 leading-snug">
            {project.tagline}
          </p>
        </div>
        <span
          className={cn(
            "pill border whitespace-nowrap shrink-0",
            s.bg,
            s.text,
            s.border
          )}
        >
          {s.icon}
          {t(`eco.status.${project.status}` as `eco.status.${Status}`)}
        </span>
      </div>

      {/* Consume / export breakdown */}
      {(project.we_consume.length > 0 || project.we_export.length > 0) && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {project.we_consume.length > 0 && (
            <div>
              <div className="label-cap text-ink-tertiary mb-1">
                ↓ {t("eco.consume")}
              </div>
              <ul className="space-y-0.5 text-ink-secondary">
                {project.we_consume.slice(0, 3).map((c) => (
                  <li key={c} className="leading-snug">• {c}</li>
                ))}
              </ul>
            </div>
          )}
          {project.we_export.length > 0 && (
            <div>
              <div className="label-cap text-accent mb-1">
                ↑ {t("eco.export")}
              </div>
              <ul className="space-y-0.5 text-ink-secondary">
                {project.we_export.slice(0, 3).map((c) => (
                  <li key={c} className="leading-snug">• {c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Cross-pollination + bus-wired badge */}
      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-1 text-xs text-ink-tertiary">
          {project.fed_by.length > 0 && (
            <span>
              {t("eco.fedBy")}:{" "}
              {project.fed_by.map((s) => (
                <code key={s} className="text-ink-secondary">
                  {s}{" "}
                </code>
              ))}
            </span>
          )}
          {project.feeds_into.length > 0 && (
            <span>
              {t("eco.feedsInto")}:{" "}
              {project.feeds_into.map((s) => (
                <code key={s} className="text-accent">
                  {s}{" "}
                </code>
              ))}
            </span>
          )}
        </div>
        <a
          href={project.github}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-ink-tertiary hover:text-ink-primary inline-flex items-center gap-1"
        >
          {t("eco.viewRepo")}
        </a>
      </div>

      {isWiredToBus && (
        <div className="mt-2 text-2xs text-accent flex items-center gap-1">
          <Zap className="w-3 h-3" />
          {t("eco.wiredToday")}
        </div>
      )}
    </div>
  );
}


/**
 * DataBusLive — real-time view of the UniversalDataBus.
 *
 * Polls /v1/databus/status + /v1/databus/telemetry + /v1/observability/status
 * once on mount and every 20s thereafter. Shows:
 *
 *   1. Health strip: spine wired? total sources? Langfuse traced?
 *   2. Per-Need grid of source chips, ranked by priority
 *   3. Last-N fetches with source + latency (color-coded)
 *
 * Renders cleanly even when telemetry is empty (Render just rebooted)
 * or when status fetch fails (e.g. CORS / cold start).
 */
function DataBusLive() {
  const [status, setStatus] = useState<{
    spine_wired?: boolean;
    total_sources?: number;
    need_kinds_covered?: number;
    sources_by_need?: Record<string, string[]>;
  } | null>(null);
  const [telemetry, setTelemetry] = useState<Array<{
    need_kind: string;
    source: string | null;
    cache_hit: boolean;
    elapsed_ms: number;
    error: string | null;
  }>>([]);
  const [obs, setObs] = useState<{
    langfuse_enabled?: boolean;
    sdk_installed?: boolean;
  } | null>(null);

  useEffect(() => {
    const pull = () => {
      fetch(`${API_BASE}/v1/databus/status`).then((r) => r.json()).then(setStatus).catch(() => {});
      fetch(`${API_BASE}/v1/databus/telemetry?last_n=10`)
        .then((r) => r.json())
        .then((d) => setTelemetry(d.records || []))
        .catch(() => {});
      fetch(`${API_BASE}/v1/observability/status`).then((r) => r.json()).then(setObs).catch(() => {});
    };
    pull();
    const id = setInterval(pull, 20000);
    return () => clearInterval(id);
  }, []);

  if (!status) {
    return (
      <section className="mb-12 surface-elev p-6 animate-pulse">
        <div className="h-5 w-40 bg-bg-hover rounded mb-3" />
        <div className="h-4 w-72 bg-bg-hover rounded" />
      </section>
    );
  }

  const wired = status.spine_wired ?? false;
  const total = status.total_sources ?? 0;
  const covered = status.need_kinds_covered ?? 0;
  const traced = obs?.langfuse_enabled ?? false;
  const sdkReady = obs?.sdk_installed ?? false;

  // Per-need card list, ordered by data-flow proximity for the eye.
  const needOrder = [
    "macro", "quote", "ohlcv", "fundamentals",
    "technical", "news", "sentiment", "factor",
    "crypto_ohlcv",
  ];
  const sourceMap = status.sources_by_need || {};
  const needs = needOrder.filter((k) => sourceMap[k]?.length);

  return (
    <section className="mb-12">
      <div className="flex items-baseline gap-3 mb-4 flex-wrap">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Database className="w-4 h-4 text-accent" />
          DATA BUS · LIVE
        </h2>
        <span className="text-2xs uppercase tracking-wider text-ink-tertiary">
          /v1/databus/status · auto-refresh 20s
        </span>
      </div>

      {/* Health strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <HealthChip
          ok={wired}
          label={wired ? "Spine wired" : "Spine empty"}
          detail={`${total} sources`}
        />
        <HealthChip
          ok={covered > 0}
          label="Need kinds covered"
          detail={`${covered} types`}
        />
        <HealthChip
          ok={sdkReady}
          label={sdkReady ? "Langfuse SDK ready" : "Langfuse SDK missing"}
          detail={sdkReady ? "import OK" : "pip install langfuse"}
        />
        <HealthChip
          ok={traced}
          label={traced ? "Traces flowing" : "Traces off"}
          detail={traced ? "keys set" : "set LANGFUSE_*_KEY"}
        />
      </div>

      {/* Per-Need source chips */}
      <div className="surface-elev p-5 mb-4">
        <div className="text-2xs uppercase tracking-wider text-ink-tertiary mb-3">
          Sources by Need · priority order
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {needs.map((k) => (
            <div key={k} className="flex items-center gap-2 flex-wrap py-1">
              <span className="font-mono text-xs text-ink-secondary min-w-[6.5rem] uppercase">
                {k}
              </span>
              <span className="text-ink-tertiary">→</span>
              {(sourceMap[k] || []).map((slug, i) => (
                <span
                  key={slug + i}
                  className={cn(
                    "px-2 py-0.5 rounded text-2xs font-mono border",
                    i === 0
                      ? "bg-accent/10 border-accent/30 text-accent"
                      : "bg-bg-hover border-border text-ink-secondary"
                  )}
                >
                  {slug}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Recent traffic */}
      <div className="surface-elev p-5">
        <div className="text-2xs uppercase tracking-wider text-ink-tertiary mb-3 flex items-center justify-between">
          <span>Recent fetches · last 10</span>
          {telemetry.length === 0 && (
            <span className="text-ink-tertiary normal-case tracking-normal">
              No traffic yet — trigger a decision to see this fill up
            </span>
          )}
        </div>
        {telemetry.length > 0 && (
          <div className="space-y-1 font-mono text-xs">
            {telemetry.slice().reverse().map((r, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-2 py-1 border-b border-border-subtle last:border-0",
                  r.error && "opacity-60"
                )}
              >
                <span className="text-ink-tertiary min-w-[6.5rem] uppercase">
                  {r.need_kind}
                </span>
                <span className="text-ink-secondary">→</span>
                <span className="px-2 py-0.5 rounded bg-bg-hover text-ink-primary">
                  {r.source ?? "(none)"}
                </span>
                {r.cache_hit && (
                  <span className="text-2xs text-accent">CACHE</span>
                )}
                <span
                  className={cn(
                    "ml-auto text-2xs",
                    r.elapsed_ms < 100
                      ? "text-signal-buy"
                      : r.elapsed_ms < 1000
                      ? "text-signal-warn"
                      : "text-signal-sell"
                  )}
                >
                  {r.elapsed_ms.toFixed(0)} ms
                </span>
                {r.error && (
                  <span className="text-2xs text-signal-sell" title={r.error}>
                    ERR
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}


function HealthChip({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail?: string;
}) {
  return (
    <div
      className={cn(
        "surface p-3 border-l-2",
        ok ? "border-l-signal-buy" : "border-l-signal-warn"
      )}
    >
      <div className="flex items-center gap-2 text-sm text-ink-primary">
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            ok ? "bg-signal-buy" : "bg-signal-warn"
          )}
        />
        {label}
      </div>
      {detail && (
        <div className="text-2xs text-ink-tertiary mt-1 font-mono">{detail}</div>
      )}
    </div>
  );
}
