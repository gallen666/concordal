"use client";

/**
 * /hot — EastMoney 个股人气榜 (retail attention rank) for A-shares.
 *
 * Data flows directly from `/v1/markets/hot-rankings/cn` (no auth).
 * Click a ticker → jump to /decision?ticker=XXXXXX so users can run
 * the 7-agent pipeline on whatever the crowd is watching.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  Flame,
  Loader2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { cn } from "../lib/cn";
import { useT } from "../lib/i18n";

const BASE = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

interface HotRow {
  rank: number | null;
  ticker: string | null;
  name: string | null;
  last_price: number | null;
  change_pct: number | null;
  heat: number | null;
}

interface HotResp {
  source: string;
  fetched_at: string;
  rows: HotRow[];
}

export default function HotPage() {
  const { t, locale } = useT();
  const [data, setData] = useState<HotResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${BASE}/v1/markets/hot-rankings/cn?limit=20`, {
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData((await r.json()) as HotResp);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <span className="label-cap inline-flex items-center gap-1.5">
            <Flame className="w-3 h-3" />
            {t("hot.label")}
          </span>
          <h1 className="text-2xl font-semibold mt-1">{t("hot.heading")}</h1>
          <p className="text-sm text-ink-secondary mt-1 max-w-2xl">
            {t("hot.subheading")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <span className="text-xs text-ink-tertiary font-mono whitespace-nowrap">
              {t("hot.fetched")}{" "}
              {new Date(data.fetched_at).toLocaleString(
                locale === "zh" ? "zh-CN" : "en-US"
              )}
            </span>
          )}
          <button onClick={fetchData} disabled={loading} className="btn-secondary">
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {t("hot.refresh")}
          </button>
        </div>
      </header>

      {error && (
        <div className="surface border-signal-sell/30 p-4 text-sm text-signal-sell">
          {error}
        </div>
      )}

      {!data && loading && (
        <div className="surface p-12 flex items-center justify-center gap-3 text-ink-secondary">
          <Loader2 className="w-5 h-5 animate-spin" /> {t("common.loading")}
        </div>
      )}

      {data && data.rows.length > 0 && <RankTable rows={data.rows} />}

      <p className="text-xs text-ink-tertiary text-center pt-4">
        Source:{" "}
        <a
          href="https://emrnweb.eastmoney.com/api/security/getlist?type=10000"
          className="text-accent hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          EastMoney 个股人气榜
        </a>{" "}
        via akshare
        <ExternalLink className="w-3 h-3 inline-block ml-1" />
      </p>
    </div>
  );
}

function RankTable({ rows }: { rows: HotRow[] }) {
  const { t } = useT();
  return (
    <div className="surface overflow-hidden">
      <div className="grid grid-cols-[60px_100px_1fr_100px_100px_120px_100px] text-xs label-cap bg-bg-elevated border-b border-border-subtle">
        <div className="px-3 py-2.5">{t("hot.colRank")}</div>
        <div className="px-3 py-2.5">{t("hot.colTicker")}</div>
        <div className="px-3 py-2.5">{t("hot.colName")}</div>
        <div className="px-3 py-2.5 text-right">{t("hot.colPrice")}</div>
        <div className="px-3 py-2.5 text-right">{t("hot.colChange")}</div>
        <div className="px-3 py-2.5 text-right">{t("hot.colHeat")}</div>
        <div className="px-3 py-2.5 text-right"></div>
      </div>
      {rows.map((r) => {
        const ch = r.change_pct ?? 0;
        const up = ch > 0;
        const down = ch < 0;
        return (
          <div
            key={r.ticker || String(r.rank)}
            className="grid grid-cols-[60px_100px_1fr_100px_100px_120px_100px] text-sm border-b border-border-subtle last:border-b-0 hover:bg-bg-hover/30 transition-colors items-center"
          >
            <div className="px-3 py-3 font-mono text-ink-tertiary">
              {r.rank ?? "—"}
            </div>
            <div className="px-3 py-3">
              <Link
                href={`/decision?ticker=${r.ticker}`}
                className="font-mono font-semibold tracking-wider text-accent hover:underline"
              >
                {r.ticker ?? "—"}
              </Link>
            </div>
            <div className="px-3 py-3 truncate text-ink-primary">
              {r.name ?? "—"}
            </div>
            <div className="px-3 py-3 text-right font-mono">
              {r.last_price != null ? r.last_price.toFixed(2) : "—"}
            </div>
            <div
              className={cn(
                "px-3 py-3 text-right font-mono flex items-center justify-end gap-1",
                up ? "text-signal-buy" : down ? "text-signal-sell" : "text-ink-tertiary"
              )}
            >
              {up && <TrendingUp className="w-3 h-3" />}
              {down && <TrendingDown className="w-3 h-3" />}
              {ch != null ? `${up ? "+" : ""}${ch.toFixed(2)}%` : "—"}
            </div>
            <div className="px-3 py-3 text-right font-mono text-ink-secondary">
              {r.heat != null ? Math.round(r.heat).toLocaleString() : "—"}
            </div>
            <div className="px-3 py-3 text-right">
              <Link
                href={`/decision?ticker=${r.ticker}`}
                className="btn-ghost text-xs"
              >
                {t("hot.runAnalysis")}
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
