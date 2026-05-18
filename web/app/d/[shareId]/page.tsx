"use client";

/**
 * /d/[shareId] — public read-only view of a shared decision.
 *
 * No auth required. Renders just enough of the DecisionTrace to be
 * compelling, plus a strong CTA to /pricing. This is the funnel
 * entry-point for viral acquisition: every shared decision is a
 * landing page for a potential new user.
 *
 * Note: the existing DecisionView component lives in /decision/page.tsx
 * but is co-located there and not exported. To avoid a refactor risk
 * mid-session, we duplicate the headline/rationale/analyst layout
 * here in a slimmer form. Backend is the single source of truth.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Globe,
  LineChart,
  Loader2,
  Newspaper,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { api, type DecisionTrace } from "../../lib/api";
import { cn } from "../../lib/cn";
import { useT } from "../../lib/i18n";

const SIDE_STYLES: Record<
  string,
  { bg: string; text: string; border: string; glow: string; icon: React.ReactNode; accent: string }
> = {
  BUY:         { bg: "bg-signal-buy_soft",  text: "text-signal-buy",  border: "border-signal-buy/30",  glow: "rgba(63,185,80,0.18)", icon: <TrendingUp className="w-4 h-4" />,   accent: "border-l-signal-buy" },
  OVERWEIGHT:  { bg: "bg-signal-buy_soft",  text: "text-signal-buy",  border: "border-signal-buy/30",  glow: "rgba(63,185,80,0.18)", icon: <TrendingUp className="w-4 h-4" />,   accent: "border-l-signal-buy" },
  HOLD:        { bg: "bg-bg-hover",         text: "text-ink-secondary", border: "border-border",       glow: "rgba(154,166,184,0.15)", icon: <Activity className="w-4 h-4" />,   accent: "border-l-ink-tertiary" },
  UNDERWEIGHT: { bg: "bg-signal-sell_soft", text: "text-signal-sell", border: "border-signal-sell/30", glow: "rgba(248,81,73,0.18)", icon: <TrendingDown className="w-4 h-4" />, accent: "border-l-signal-sell" },
  SELL:        { bg: "bg-signal-sell_soft", text: "text-signal-sell", border: "border-signal-sell/30", glow: "rgba(248,81,73,0.18)", icon: <TrendingDown className="w-4 h-4" />, accent: "border-l-signal-sell" },
};

const ANALYST_ICON: Record<string, React.ReactNode> = {
  fundamentals: <BarChart3 className="w-4 h-4 text-signal-buy" />,
  sentiment:    <Users className="w-4 h-4 text-signal-info" />,
  news:         <Newspaper className="w-4 h-4 text-signal-warn" />,
  technical:    <LineChart className="w-4 h-4 text-purple-400" />,
  macro:        <Globe className="w-4 h-4 text-signal-info" />,
};

export default function SharedDecisionPage() {
  const { t, locale } = useT();
  const params = useParams<{ shareId: string }>();
  const shareId = params.shareId;
  const [trace, setTrace] = useState<DecisionTrace | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shareId) return;
    api.getSharedDecision(shareId)
      .then((rec) => {
        setTrace(rec.result);
        setMode(rec.mode || null);
      })
      .catch(() => setError("expired"));
  }, [shareId]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center space-y-5">
        <AlertTriangle className="w-10 h-10 text-signal-warn mx-auto" />
        <h1 className="text-xl font-semibold">{t("share.publicView.expired")}</h1>
        <Link href="/decision" className="btn-primary inline-flex">
          <ArrowRight className="w-4 h-4" />
          {t("share.publicView.cta")}
        </Link>
      </div>
    );
  }

  if (!trace) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 flex items-center justify-center gap-3 text-ink-secondary">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  const d = trace.decision;
  const style = SIDE_STYLES[d.side] || SIDE_STYLES.HOLD;

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      {/* Banner: this is a shared decision */}
      <div className="surface bg-bg-hover/40 p-4 flex items-center gap-3 flex-wrap">
        <span className="label-cap">{t("share.publicView.label")}</span>
        {mode === "mock" && (
          <span className="pill bg-signal-warn_soft text-signal-warn text-2xs">
            mock LLM
          </span>
        )}
        {mode === "real_llm" && (
          <span className="pill bg-signal-buy_soft text-signal-buy text-2xs">
            <Sparkles className="w-3 h-3" />
            real LLM
          </span>
        )}
        {/* Report links — pushed to the right */}
        <div className="ml-auto flex gap-2">
          <Link href={`/d/${shareId}/report`} className="btn-secondary text-xs">
            完整报告 / Full report
          </Link>
        </div>
      </div>

      {/* Headline decision card (compact version of /decision's DecisionView) */}
      <div className={cn("surface-elev relative overflow-hidden border-l-2", style.accent)}>
        <div
          className="absolute inset-0 pointer-events-none opacity-60"
          style={{ background: `radial-gradient(ellipse 70% 60% at 0% 0%, ${style.glow}, transparent 70%)` }}
        />
        <div className="relative px-6 py-5">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <span className="font-mono text-3xl font-semibold tracking-wider leading-none">
              {d.ticker}
            </span>
            <span className={cn("pill px-3 py-1 text-sm font-semibold border", style.bg, style.text, style.border)}>
              {style.icon}
              {d.side}
            </span>
            <span className="text-xs text-ink-tertiary ml-auto font-mono">asof {d.asof}</span>
          </div>
          <p className="text-ink-primary leading-relaxed text-base">{d.rationale}</p>
          {d.risk_notes && (
            <div className="mt-3 flex items-start gap-2 text-sm text-ink-secondary">
              <AlertTriangle className="w-4 h-4 text-signal-warn shrink-0 mt-0.5" />
              <span>{d.risk_notes}</span>
            </div>
          )}
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <Stat label="Target" value={signedPct(d.target_weight)} mono />
            <Stat label="Confidence" value={`${(d.confidence * 100).toFixed(0)}%`} accent />
            <Stat label="Reports" value={`${trace.analyst_reports.length}`} mono />
          </div>
        </div>
      </div>

      {/* Analyst summaries — one line each */}
      {trace.analyst_reports.length > 0 && (
        <div className="surface p-5 space-y-3">
          <div className="label-cap">Analyst signals</div>
          <ul className="space-y-2">
            {trace.analyst_reports.map((r) => (
              <li key={r.analyst} className="flex items-start gap-3 text-sm">
                <span className="shrink-0 mt-0.5">{ANALYST_ICON[r.analyst]}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold capitalize">{r.analyst}</div>
                  <div className="text-ink-secondary text-xs leading-snug truncate">
                    {Object.entries(r.signals).slice(0, 4).map(([k, v]) => (
                      <span key={k} className="mr-2">
                        <span className="text-ink-tertiary">{k}=</span>
                        <span className="font-mono">{String(v)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* v54: Public audit log. The whole point of the McKinsey strategy's
          "every LLM call audit-logged" promise — the model/tokens/cost for
          every single inference during this decision, viewable by anyone
          with the share link. No auth. This is what makes the SFC Type 4
          "audit trail" claim believable in writing. */}
      {trace.usage && trace.usage.length > 0 && (
        <div className="surface p-5 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="label-cap">
                {locale === "zh" ? "审计日志 · 每一次 LLM 调用" : "Audit log · every LLM call"}
              </div>
              <div className="text-xs text-ink-tertiary mt-1">
                {locale === "zh"
                  ? "公开可查 · 每行 = 一次模型调用 · 费用为实际 API 计价"
                  : "Publicly verifiable · one row = one model call · cost is metered API price"}
              </div>
            </div>
            {typeof trace.total_cost_usd === "number" && (
              <div className="font-mono text-sm">
                <span className="text-ink-tertiary uppercase tracking-wider text-2xs mr-2">
                  {locale === "zh" ? "总计" : "Total"}
                </span>
                <span className="text-accent">${trace.total_cost_usd.toFixed(4)}</span>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead className="text-ink-tertiary uppercase tracking-wider text-2xs">
                <tr className="border-b border-border-subtle">
                  <th className="text-left py-2 pr-3">#</th>
                  <th className="text-left py-2 pr-3">{locale === "zh" ? "模型" : "Model"}</th>
                  <th className="text-right py-2 pr-3">In</th>
                  <th className="text-right py-2 pr-3">Out</th>
                  <th className="text-right py-2">USD</th>
                </tr>
              </thead>
              <tbody className="text-ink-secondary">
                {trace.usage.map((u, i) => (
                  <tr key={i} className="border-b border-border-subtle/40 hover:bg-bg-hover/40">
                    <td className="py-1.5 pr-3 text-ink-tertiary">{i + 1}</td>
                    <td className="py-1.5 pr-3 text-ink-primary">{u.model}</td>
                    <td className="py-1.5 pr-3 text-right">{u.input_tokens.toLocaleString()}</td>
                    <td className="py-1.5 pr-3 text-right">{u.output_tokens.toLocaleString()}</td>
                    <td className="py-1.5 text-right text-accent">${u.usd_cost.toFixed(5)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link
            href="/compliance"
            className="text-xs text-accent hover:underline inline-flex items-center gap-1 pt-1"
          >
            {locale === "zh" ? "了解我们的审计日志政策 →" : "Read the audit-log policy →"}
          </Link>
        </div>
      )}

      {/* Footer CTA — the whole point of this page */}
      <div className="surface-elev p-6 mt-8">
        <h2 className="text-lg font-semibold mb-2">
          {t("share.publicView.cta")}
        </h2>
        <p className="text-sm text-ink-secondary leading-relaxed mb-4">
          {t("share.publicView.body")}
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/decision" className="btn-primary">
            <ArrowRight className="w-4 h-4" />
            {locale === "zh" ? "免费做一次决策" : "Run a decision — Free"}
          </Link>
          <Link href="/pricing" className="btn-secondary text-sm">
            {locale === "zh" ? "看 Pro 价格" : "See Pro pricing"}
          </Link>
          <Link href="/proof" className="btn-ghost text-sm">
            {locale === "zh" ? "看证据" : "See proof"}
          </Link>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, mono, accent }: { label: string; value: string; mono?: boolean; accent?: boolean }) {
  return (
    <div>
      <div className="label-cap">{label}</div>
      <div className={cn("mt-1 text-lg font-semibold leading-none", mono && "font-mono", accent && "text-accent")}>
        {value}
      </div>
    </div>
  );
}

function signedPct(w: number) {
  return `${w >= 0 ? "+" : ""}${(w * 100).toFixed(2)}%`;
}
