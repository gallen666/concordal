"use client";

/**
 * /decision/[jobId]/trace — per-LLM-call inference trace.
 *
 * This is the moat 东方财富/同花顺 structurally cannot ship: every
 * single LLM call is visible — which model, how many tokens, how
 * much $$, which agent fired it. The trace page reads the same job
 * object the result page reads; nothing extra to fetch.
 *
 * Layout:
 *   - Summary strip: total calls / total tokens / total $ / models used
 *   - Stage-grouped timeline of LLM calls with model + tokens + cost
 *   - Optional Langfuse deep-link if LANGFUSE_HOST is configured
 *
 * Stage attribution is heuristic — backend `usage[]` is a flat list of
 * TokenUsage rows in call order. We re-thread the call order against
 * the known 7-agent pipeline structure (5 analysts → debate × N rounds
 * → facilitator → trader → 3 risk roles → manager → optional consensus).
 * If the heuristic overruns we just call the rest "tail" rather than
 * mislabel — better to be honest than wrong.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Activity,
  Coins,
  Cpu,
  Loader2,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { api, auth, type DecisionTrace } from "../../../lib/api";
import { cn } from "../../../lib/cn";

interface TokenUsage {
  model: string;
  input_tokens: number;
  output_tokens: number;
  usd_cost: number;
}

interface JobResponse {
  status: string;
  result: DecisionTrace | null;
  mode: string | null;
  lessons_injected: boolean;
  error: string | null;
}

export default function TracePage() {
  const params = useParams<{ jobId: string }>();
  const jobId = params?.jobId as string;
  const [job, setJob] = useState<JobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    const token = auth.getToken();
    fetch(`${process.env.NEXT_PUBLIC_API || "http://localhost:8000"}/v1/decisions/job/${jobId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setJob)
      .catch((e: Error) => setError(e.message));
  }, [jobId]);

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <Link href="/decision" className="text-sm text-ink-secondary hover:text-ink-primary flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" />
          Back to decision
        </Link>
        <div className="mt-6 surface border-signal-sell/30 p-4 text-sm text-signal-sell flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Trace unavailable</div>
            <div className="text-xs mt-1 font-mono">{error}</div>
            <div className="text-xs mt-2 text-ink-secondary">
              Job IDs are owned by the user who created them. If you didn&apos;t run this decision yourself, you can&apos;t see its trace.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10 animate-pulse">
        <div className="h-5 w-40 bg-bg-hover rounded mb-3" />
        <div className="h-4 w-72 bg-bg-hover rounded" />
      </div>
    );
  }

  const trace = job.result;
  if (!trace) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <Link href="/decision" className="text-sm text-ink-secondary hover:text-ink-primary flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" />
          Back to decision
        </Link>
        <div className="mt-6 text-sm text-ink-secondary">
          Decision still running ({job.status}). Refresh in a few seconds.
        </div>
      </div>
    );
  }

  const usage = trace.usage || [];
  const totalIn = usage.reduce((acc, u) => acc + (u.input_tokens || 0), 0);
  const totalOut = usage.reduce((acc, u) => acc + (u.output_tokens || 0), 0);
  const totalCost = usage.reduce((acc, u) => acc + (u.usd_cost || 0), 0);
  const models = Array.from(new Set(usage.map((u) => u.model)));
  const debateRounds = trace.researcher_debate?.rounds || 2;
  const haveMacro = trace.analyst_reports.some((r) => r.analyst === "macro");
  const stages = inferStages({
    usage,
    debateRounds,
    haveMacro,
    haveTrader: !!trace.trader_plan,
    haveRiskDebate: !!trace.risk_debate,
    haveManager: !!trace.manager_review,
    haveConsensus: !!(trace.decision.consensus && "agreement_score" in trace.decision.consensus),
  });

  const langfuseHost = process.env.NEXT_PUBLIC_LANGFUSE_HOST;

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <Link
        href="/decision"
        className="text-sm text-ink-secondary hover:text-ink-primary flex items-center gap-1 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to decision
      </Link>

      <div className="mb-6">
        <span className="label-cap">INFERENCE TRACE · 推理追溯</span>
        <h1 className="text-2xl font-semibold mt-1 leading-tight">
          {trace.ticker} · {trace.asof} · {trace.decision.side}
        </h1>
        <p className="text-ink-secondary mt-2 text-sm leading-relaxed">
          Every LLM call that produced this verdict — model, tokens in/out, cost.
          The kind of transparency 东方财富/同花顺&apos;s AI tabs never give you.
        </p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryCard icon={<Activity />} label="LLM calls" value={String(usage.length)} />
        <SummaryCard
          icon={<Cpu />}
          label="Tokens (in / out)"
          value={`${formatK(totalIn)} / ${formatK(totalOut)}`}
        />
        <SummaryCard
          icon={<Coins />}
          label="Total cost"
          value={`$${totalCost.toFixed(4)}`}
        />
        <SummaryCard
          icon={<Activity />}
          label="Models used"
          value={String(models.length)}
          detail={models.join(" · ")}
        />
      </div>

      {/* Mode banner */}
      {job.mode && (
        <div
          className={cn(
            "surface p-3 mb-6 text-sm flex items-center gap-2",
            job.mode === "real_llm"
              ? "border-l-2 border-l-signal-buy"
              : "border-l-2 border-l-signal-warn"
          )}
        >
          <span className="label-cap">Run mode</span>
          <span className="font-mono text-xs">{job.mode}</span>
          {job.mode !== "real_llm" && (
            <span className="text-2xs text-ink-tertiary ml-2">
              (cached or mock — token / cost figures reflect a prior real run)
            </span>
          )}
        </div>
      )}

      {/* Per-stage timeline */}
      <section className="surface-elev p-5 mb-6">
        <div className="label-cap mb-4">Stage timeline</div>
        <div className="space-y-1">
          {stages.map((s, i) => (
            <StageRow key={i} index={i + 1} stage={s.label} usage={s.usage} />
          ))}
        </div>
      </section>

      {/* Langfuse deep link */}
      {langfuseHost && (
        <a
          href={`${langfuseHost}/project/default/traces?search=${encodeURIComponent(`decision ${jobId}`)}`}
          target="_blank"
          rel="noreferrer noopener"
          className="surface-elev p-3 flex items-center gap-2 text-sm hover:border-accent transition-colors group"
        >
          <ExternalLink className="w-4 h-4 text-ink-tertiary group-hover:text-accent" />
          <span className="text-ink-primary">Open in Langfuse</span>
          <span className="ml-auto text-2xs text-ink-tertiary font-mono">
            {langfuseHost.replace("https://", "")}
          </span>
        </a>
      )}

      <p className="text-2xs text-ink-tertiary mt-6">
        Token counts come from the LLM provider response (Gemini / DeepSeek / Mock).
        Costs are computed at the configured price-per-million-token in <code>llm/router.py</code>.
        Stage attribution is heuristic — order matches the canonical
        7-agent pipeline (analysts → researcher debate → trader → risk → manager).
      </p>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="surface-elev p-3">
      <div className="flex items-center gap-2 text-2xs uppercase tracking-wider text-ink-tertiary">
        <span className="w-3.5 h-3.5">{icon}</span>
        {label}
      </div>
      <div className="font-mono text-lg text-ink-primary mt-1">{value}</div>
      {detail && (
        <div className="text-2xs text-ink-tertiary mt-0.5 font-mono truncate" title={detail}>
          {detail}
        </div>
      )}
    </div>
  );
}

function StageRow({
  index,
  stage,
  usage,
}: {
  index: number;
  stage: string;
  usage: TokenUsage | null;
}) {
  if (!usage) {
    return (
      <div className="flex items-center gap-3 py-1.5 opacity-40 border-b border-border-subtle last:border-0">
        <span className="text-2xs font-mono w-6 text-ink-tertiary">{String(index).padStart(2, "0")}</span>
        <span className="text-sm font-mono text-ink-tertiary w-48">{stage}</span>
        <span className="text-2xs text-ink-tertiary italic">skipped</span>
      </div>
    );
  }
  const isMock = usage.model.startsWith("mock-");
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-border-subtle last:border-0 flex-wrap">
      <span className="text-2xs font-mono w-6 text-ink-tertiary">{String(index).padStart(2, "0")}</span>
      <span className="text-sm font-mono text-ink-primary w-48">{stage}</span>
      <span
        className={cn(
          "px-2 py-0.5 rounded text-2xs font-mono",
          isMock ? "bg-signal-warn_soft text-signal-warn" : "bg-bg-hover text-ink-primary"
        )}
      >
        {usage.model}
      </span>
      <span className="text-2xs font-mono text-ink-secondary">
        {usage.input_tokens}↓ {usage.output_tokens}↑
      </span>
      <span className="ml-auto text-2xs font-mono text-ink-primary">
        ${usage.usd_cost.toFixed(5)}
      </span>
    </div>
  );
}

function formatK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/**
 * Map a flat list of TokenUsage rows to the canonical 7-agent pipeline
 * stage names by index. We can't rely on stage-tagged usage rows because
 * the backend appends usage in call order without attribution. This
 * function is intentionally lenient: if there are more usage rows than
 * expected stages, the tail rows show under "tail.*".
 */
function inferStages(opts: {
  usage: TokenUsage[];
  debateRounds: number;
  haveMacro: boolean;
  haveTrader: boolean;
  haveRiskDebate: boolean;
  haveManager: boolean;
  haveConsensus: boolean;
}): { label: string; usage: TokenUsage | null }[] {
  const order: string[] = [
    "analyst.fundamentals",
    "analyst.sentiment",
    "analyst.news",
    "analyst.technical",
  ];
  if (opts.haveMacro) order.push("analyst.macro");
  for (let r = 1; r <= opts.debateRounds; r++) {
    order.push(`researcher.bull.r${r}`);
    order.push(`researcher.bear.r${r}`);
  }
  order.push("researcher.facilitator");
  if (opts.haveTrader) order.push("trader");
  if (opts.haveRiskDebate) {
    order.push("risk.aggressive");
    order.push("risk.conservative");
    order.push("risk.neutral");
  }
  if (opts.haveManager) order.push("manager");
  if (opts.haveConsensus) order.push("manager.consensus_check");

  // Zip into rows. If usage has fewer rows, mark remaining stages skipped.
  const rows: { label: string; usage: TokenUsage | null }[] = order.map((label, i) => ({
    label,
    usage: opts.usage[i] ?? null,
  }));
  // Append any tail rows we can't attribute.
  for (let i = order.length; i < opts.usage.length; i++) {
    rows.push({ label: `tail.${i - order.length + 1}`, usage: opts.usage[i] });
  }
  return rows;
}
