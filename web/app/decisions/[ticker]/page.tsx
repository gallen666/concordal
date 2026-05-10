"use client";

/**
 * /decisions/[ticker] — vertical timeline of every past decision the
 * current user has made on this specific ticker.
 *
 * Each card shows: date, side, target weight, confidence, realised
 * forward return (if past holding window), and a delta vs the previous
 * decision (weight change, side flip). Reading top-to-bottom is
 * "how the system's view of this ticker evolved over time".
 *
 * Data source: existing /v1/me/decisions endpoint, filtered client-side
 * by ticker — no new API needed.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Loader2,
  Play,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Activity,
  AlertTriangle,
} from "lucide-react";
import { api, auth, type MyDecision } from "../../lib/api";
import { cn } from "../../lib/cn";
import { useT } from "../../lib/i18n";

const SIDE_STYLES: Record<
  string,
  { bg: string; text: string; border: string; icon: React.ReactNode }
> = {
  BUY:         { bg: "bg-signal-buy_soft",  text: "text-signal-buy",  border: "border-signal-buy/30",  icon: <TrendingUp className="w-3.5 h-3.5" /> },
  OVERWEIGHT:  { bg: "bg-signal-buy_soft",  text: "text-signal-buy",  border: "border-signal-buy/30",  icon: <TrendingUp className="w-3.5 h-3.5" /> },
  HOLD:        { bg: "bg-bg-hover",         text: "text-ink-secondary", border: "border-border",       icon: <Activity className="w-3.5 h-3.5" /> },
  UNDERWEIGHT: { bg: "bg-signal-sell_soft", text: "text-signal-sell", border: "border-signal-sell/30", icon: <TrendingDown className="w-3.5 h-3.5" /> },
  SELL:        { bg: "bg-signal-sell_soft", text: "text-signal-sell", border: "border-signal-sell/30", icon: <TrendingDown className="w-3.5 h-3.5" /> },
};

export default function DecisionTimelinePage() {
  const { t, locale } = useT();
  const params = useParams<{ ticker: string }>();
  const ticker = decodeURIComponent(params.ticker || "").toUpperCase();
  const [rows, setRows] = useState<MyDecision[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.isLoggedIn() && typeof window !== "undefined") {
      window.location.href = "/redeem";
      return;
    }
    api.myDecisions()
      .then((all) => setRows(all.filter((r) => r.ticker.toUpperCase() === ticker)))
      .catch((e: Error) => setError(e.message));
  }, [ticker]);

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
      <header>
        <span className="label-cap">{t("tl.label")}</span>
        <h1 className="text-2xl font-semibold mt-1 font-mono tracking-wider">
          {t("tl.heading").replace("{ticker}", ticker)}
        </h1>
        <p className="text-sm text-ink-secondary mt-2 max-w-2xl">
          {t("tl.subheading")}
        </p>
      </header>

      {!rows && !error && (
        <div className="surface p-12 flex items-center justify-center gap-3 text-ink-secondary">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      )}

      {error && (
        <div className="surface border-signal-sell/30 p-4 flex gap-2 items-center text-sm text-signal-sell">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="surface p-12 text-center space-y-4">
          <div className="inline-flex w-12 h-12 rounded-xl bg-bg-hover text-ink-secondary items-center justify-center">
            <Activity className="w-5 h-5" />
          </div>
          <p className="text-ink-secondary">{t("tl.empty")}</p>
          <Link href={`/decision?ticker=${encodeURIComponent(ticker)}`} className="btn-primary inline-flex">
            <Play className="w-4 h-4" /> {t("tl.runFirst")}
          </Link>
        </div>
      )}

      {rows && rows.length > 0 && (
        <>
          <StatStrip rows={rows} />
          <Timeline rows={rows} locale={locale} />
        </>
      )}
    </div>
  );
}

// ---- Stats strip ----------------------------------------------------------

function StatStrip({ rows }: { rows: MyDecision[] }) {
  const { t } = useT();
  let scored = 0, right = 0, signedRetSum = 0, confSum = 0;
  for (const r of rows) {
    confSum += r.decision.confidence ?? 0;
    if (r.forward_return == null || isNaN(r.forward_return)) continue;
    scored++;
    const w = r.decision.target_weight ?? 0;
    const sign = w > 0 ? 1 : w < 0 ? -1 : 0;
    signedRetSum += r.forward_return * sign;
    if (sign !== 0 && Math.sign(r.forward_return) === sign) right++;
  }
  const hitRate = scored > 0 ? right / scored : 0;
  const avgConf = rows.length > 0 ? confSum / rows.length : 0;
  const avgRet = scored > 0 ? signedRetSum / scored : 0;

  return (
    <div className="surface-elev grid grid-cols-2 sm:grid-cols-4 gap-px bg-border-subtle border-t border-border-subtle">
      <Cell label={t("tl.totalCalls")} value={String(rows.length)} mono />
      <Cell
        label={t("tl.hitRate")}
        value={scored > 0 ? `${(hitRate * 100).toFixed(0)}% (${right}/${scored})` : "—"}
        accent={hitRate >= 0.5 && scored > 0}
      />
      <Cell
        label={t("tl.avgReturn")}
        value={scored > 0 ? `${avgRet >= 0 ? "+" : ""}${(avgRet * 100).toFixed(2)}%` : "—"}
        accent={avgRet > 0}
      />
      <Cell
        label={t("tl.avgConfidence")}
        value={`${(avgConf * 100).toFixed(0)}%`}
      />
    </div>
  );
}

function Cell({ label, value, mono, accent }: {
  label: string; value: string; mono?: boolean; accent?: boolean;
}) {
  return (
    <div className="bg-bg-elevated p-4">
      <div className="label-cap">{label}</div>
      <div className={cn(
        "mt-1.5 text-lg font-semibold leading-none",
        mono && "font-mono",
        accent && "text-signal-buy",
      )}>{value}</div>
    </div>
  );
}

// ---- Timeline -------------------------------------------------------------

function Timeline({ rows, locale }: { rows: MyDecision[]; locale: string }) {
  // Newest first (matches /me/history). For deltas, "previous" means the
  // chronologically EARLIER decision — so we walk in reverse to compute
  // deltas, then render in original order.
  const sorted = [...rows].sort(
    (a, b) => new Date(b.decision_date).getTime() - new Date(a.decision_date).getTime(),
  );
  // Compute deltas relative to the previous chronological decision.
  const decorated = sorted.map((r, i) => {
    const prev = sorted[i + 1]; // older neighbour
    return { row: r, prev };
  });

  return (
    <div className="space-y-3 relative">
      {/* Vertical guide line */}
      <div className="absolute left-3 top-2 bottom-2 w-px bg-border-subtle" />
      {decorated.map(({ row, prev }, i) => (
        <DecisionCard key={i} row={row} prev={prev} locale={locale} />
      ))}
    </div>
  );
}

function DecisionCard({
  row, prev, locale,
}: {
  row: MyDecision; prev: MyDecision | undefined; locale: string;
}) {
  const { t } = useT();
  const w = row.decision.target_weight ?? 0;
  const conf = row.decision.confidence ?? 0;
  const fr = row.forward_return;
  const sideStyle = SIDE_STYLES[row.decision.side] || SIDE_STYLES.HOLD;

  const direction = w > 0 ? 1 : w < 0 ? -1 : 0;
  const wasRight = fr != null && direction !== 0 && Math.sign(fr) === direction;

  // Deltas
  const prevW = prev?.decision.target_weight ?? 0;
  const dW = w - prevW;
  const sideFlipped = !!prev && prev.decision.side !== row.decision.side;

  const daysAgo = Math.floor(
    (Date.now() - new Date(row.decision_date).getTime()) / 86400_000,
  );

  return (
    <div className="relative pl-9">
      {/* Dot on the timeline */}
      <span
        className={cn(
          "absolute left-1.5 top-4 w-3 h-3 rounded-full border-2 border-bg-base",
          sideStyle.bg,
        )}
      />
      <div className="surface p-4 border-l-2 hover:border-l-accent transition-colors"
           style={{ borderLeftColor: "var(--tw-shadow-color, transparent)" }}>
        {/* Top row: side + date + days-ago */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              "pill border whitespace-nowrap font-semibold",
              sideStyle.bg, sideStyle.text, sideStyle.border,
            )}>
              {sideStyle.icon}
              {row.decision.side}
            </span>
            {sideFlipped && (
              <span className="pill bg-signal-warn_soft text-signal-warn border border-signal-warn/30">
                <Sparkles className="w-3 h-3" />
                {t("tl.deltaSide")}
              </span>
            )}
            {prev && Math.abs(dW) > 0.001 && (
              <span className="pill bg-bg-hover text-ink-secondary text-2xs">
                {t("tl.deltaWeight")}: {dW >= 0 ? "+" : ""}{(dW * 100).toFixed(1)}%
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-ink-tertiary">
            <span className="font-mono">{row.decision_date}</span>
            <span>·</span>
            <span>{t("tl.daysAgo").replace("{n}", String(daysAgo))}</span>
          </div>
        </div>

        {/* Stat row */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="label-cap mb-0.5">target</div>
            <div className="font-mono font-semibold">
              {w >= 0 ? "+" : ""}{(w * 100).toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="label-cap mb-0.5">conf</div>
            <div className="font-mono">{(conf * 100).toFixed(0)}%</div>
          </div>
          <div>
            <div className="label-cap mb-0.5">forward</div>
            <div className={cn(
              "font-mono flex items-center gap-1",
              fr == null ? "text-ink-tertiary"
                : wasRight ? "text-signal-buy"
                : "text-signal-sell",
            )}>
              {fr == null ? (
                <span>—</span>
              ) : (
                <>
                  {fr >= 0 ? (
                    <TrendingUp className="w-3.5 h-3.5" />
                  ) : (
                    <TrendingDown className="w-3.5 h-3.5" />
                  )}
                  {fr >= 0 ? "+" : ""}{(fr * 100).toFixed(2)}%
                </>
              )}
            </div>
          </div>
          <div>
            <div className="label-cap mb-0.5">held</div>
            <div className="font-mono text-ink-secondary">
              {row.days_held != null
                ? t("tl.daysHeld").replace("{n}", String(row.days_held))
                : t("tl.notRealisedYet")}
            </div>
          </div>
        </div>

        {/* Rationale */}
        {row.decision.rationale && (
          <p className="mt-3 text-sm text-ink-primary leading-relaxed">
            {row.decision.rationale}
          </p>
        )}
        {row.decision.risk_notes && (
          <div className="mt-2 flex items-start gap-1.5 text-xs text-ink-secondary">
            <AlertTriangle className="w-3.5 h-3.5 text-signal-warn shrink-0 mt-0.5" />
            <span>{row.decision.risk_notes}</span>
          </div>
        )}
      </div>
    </div>
  );
}
