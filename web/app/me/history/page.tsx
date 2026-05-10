"use client";

/**
 * "我的历史" — every past decision the current user has made, plus an
 * honest "what happened next" column. This is the headline retention
 * feature: the second-time-visit reason for the product.
 *
 * The forward-return enrichment is computed by the API (`/v1/me/decisions`)
 * — we just render it.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Loader2,
  TrendingDown,
  TrendingUp,
  Activity,
} from "lucide-react";
import { api, auth, type MyDecision } from "../../lib/api";
import { cn } from "../../lib/cn";
import { useT } from "../../lib/i18n";

export default function MyHistoryPage() {
  const { t, locale } = useT();
  const [rows, setRows] = useState<MyDecision[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.isLoggedIn() && typeof window !== "undefined") {
      window.location.href = "/redeem";
      return;
    }
    api
      .myDecisions()
      .then(setRows)
      .catch((e: unknown) => setError((e as Error).message));
  }, []);

  const stats = rows ? computeStats(rows) : null;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      <header>
        <span className="label-cap">{t("history.label")}</span>
        <h1 className="text-2xl font-semibold mt-1">{t("history.heading")}</h1>
        <p className="text-sm text-ink-secondary mt-1 max-w-2xl">
          {t("history.subheading")}
        </p>
      </header>

      {!rows && !error && (
        <div className="surface p-12 flex items-center justify-center gap-3 text-ink-secondary">
          <Loader2 className="w-5 h-5 animate-spin" /> {t("common.loading")}
        </div>
      )}

      {error && (
        <div className="surface border-signal-sell/30 p-4 text-sm text-signal-sell">
          {error}
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="surface p-12 text-center space-y-4">
          <div className="inline-flex w-12 h-12 rounded-xl bg-bg-hover text-ink-secondary items-center justify-center">
            <Activity className="w-5 h-5" />
          </div>
          <p className="text-ink-secondary">{t("history.empty")}</p>
          <Link href="/decision" className="btn-primary inline-flex">
            {t("history.runFirst")}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {rows && rows.length > 0 && stats && (
        <>
          <StatStrip stats={stats} />
          <DecisionsTable rows={rows} locale={locale} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stats strip
// ---------------------------------------------------------------------------

interface Stats {
  total: number;
  /** Number of calls where direction matched outcome (BUY → up, SELL → down) */
  rightDirection: number;
  /** Subset of rows that have a forward_return (excludes today / not enough days) */
  scoredCount: number;
  /** Mean of (forward_return * sign(target_weight)) across scored rows */
  avgSignedReturn: number;
}

function computeStats(rows: MyDecision[]): Stats {
  let right = 0;
  let scored = 0;
  let signedRetSum = 0;
  for (const r of rows) {
    if (r.forward_return == null || isNaN(r.forward_return)) continue;
    scored++;
    const w = r.decision.target_weight ?? 0;
    const sign = w > 0 ? 1 : w < 0 ? -1 : 0;
    signedRetSum += r.forward_return * sign;
    if (sign !== 0 && Math.sign(r.forward_return) === sign) right++;
  }
  return {
    total: rows.length,
    rightDirection: right,
    scoredCount: scored,
    avgSignedReturn: scored > 0 ? signedRetSum / scored : 0,
  };
}

function StatStrip({ stats }: { stats: Stats }) {
  const { t } = useT();
  const hitRate = stats.scoredCount > 0 ? stats.rightDirection / stats.scoredCount : 0;
  return (
    <div className="surface-elev grid grid-cols-3 gap-px bg-border-subtle border-t border-border-subtle">
      <Cell label={t("history.totalCalls")} value={String(stats.total)} mono />
      <Cell
        label={t("history.hitRate")}
        value={
          stats.scoredCount > 0
            ? `${(hitRate * 100).toFixed(0)}% (${stats.rightDirection}/${stats.scoredCount})`
            : "—"
        }
        accent={hitRate >= 0.5}
      />
      <Cell
        label={t("history.avgReturn")}
        value={fmtPct(stats.avgSignedReturn, true)}
        accent={stats.avgSignedReturn > 0}
      />
    </div>
  );
}

function Cell({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="bg-bg-elevated p-4">
      <div className="label-cap">{label}</div>
      <div
        className={cn(
          "mt-1.5 text-lg font-semibold leading-none",
          mono && "font-mono",
          accent && "text-signal-buy"
        )}
      >
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

function DecisionsTable({
  rows,
  locale,
}: {
  rows: MyDecision[];
  locale: string;
}) {
  const { t } = useT();
  return (
    <div className="surface overflow-hidden">
      <div className="grid grid-cols-[110px_90px_110px_90px_90px_120px_60px] text-xs label-cap bg-bg-elevated border-b border-border-subtle">
        <div className="px-3 py-2.5">{t("history.colDate")}</div>
        <div className="px-3 py-2.5">{t("history.colTicker")}</div>
        <div className="px-3 py-2.5">{t("history.colSide")}</div>
        <div className="px-3 py-2.5 text-right">{t("history.colWeight")}</div>
        <div className="px-3 py-2.5 text-right">{t("history.colConfidence")}</div>
        <div className="px-3 py-2.5 text-right">{t("history.colReturn")}</div>
        <div className="px-3 py-2.5 text-right">{t("history.colDays")}</div>
      </div>
      <div className="max-h-[600px] overflow-y-auto">
        {rows.map((r, i) => (
          <DecisionRow key={i} row={r} locale={locale} />
        ))}
      </div>
    </div>
  );
}

function DecisionRow({ row, locale }: { row: MyDecision; locale: string }) {
  const w = row.decision.target_weight ?? 0;
  const conf = row.decision.confidence ?? 0;
  const fr = row.forward_return;
  const direction = w > 0 ? 1 : w < 0 ? -1 : 0;
  const wasRight = fr != null && direction !== 0 && Math.sign(fr) === direction;
  return (
    <div className="grid grid-cols-[110px_90px_110px_90px_90px_120px_60px] text-sm border-b border-border-subtle last:border-b-0 hover:bg-bg-hover/30 transition-colors">
      <div className="px-3 py-3 font-mono text-xs text-ink-tertiary">
        {row.decision_date}
      </div>
      <div className="px-3 py-3 font-mono font-semibold tracking-wider">
        <Link
          href={`/decisions/${encodeURIComponent(row.ticker)}`}
          className="hover:text-accent transition-colors"
          title="View decision timeline for this ticker"
        >
          {row.ticker}
        </Link>
      </div>
      <div className="px-3 py-3">
        <SideBadge side={row.decision.side} />
      </div>
      <div className="px-3 py-3 text-right font-mono">
        {(w * 100).toFixed(1)}%
      </div>
      <div className="px-3 py-3 text-right text-ink-secondary">
        {(conf * 100).toFixed(0)}%
      </div>
      <div
        className={cn(
          "px-3 py-3 text-right font-mono flex items-center justify-end gap-1",
          fr == null
            ? "text-ink-tertiary"
            : wasRight
              ? "text-signal-buy"
              : "text-signal-sell"
        )}
      >
        {fr != null && wasRight && <TrendingUp className="w-3 h-3" />}
        {fr != null && !wasRight && direction !== 0 && (
          <TrendingDown className="w-3 h-3" />
        )}
        {fr == null
          ? (locale === "zh" ? "等待中" : "pending")
          : fmtPct(fr, true)}
      </div>
      <div className="px-3 py-3 text-right text-ink-tertiary text-xs font-mono">
        {row.days_held ?? "—"}
      </div>
    </div>
  );
}

function SideBadge({ side }: { side: string }) {
  const upper = side.toUpperCase();
  const cls =
    upper === "BUY" || upper === "OVERWEIGHT"
      ? "bg-signal-buy_soft text-signal-buy"
      : upper === "SELL" || upper === "UNDERWEIGHT"
        ? "bg-signal-sell_soft text-signal-sell"
        : "bg-bg-hover text-ink-secondary";
  return <span className={cn("pill text-2xs", cls)}>{upper}</span>;
}

function fmtPct(x: number, signed = false): string {
  const v = (x * 100).toFixed(2);
  if (signed && x > 0) return `+${v}%`;
  return `${v}%`;
}
