"use client";

/**
 * MarketHeader — live-quote strip rendered above any /decision view.
 *
 * Fetches /v1/quote for the ticker, shows the current price + day-over-day
 * change + a 30-day sparkline. Mirrors what Eastmoney puts on its stock
 * detail page so visitors arriving from there see something familiar.
 *
 * Graceful degradation:
 *   - upstream rate-limited / network error → empty state with ticker still visible
 *   - quote endpoint 5xx → don't crash the decision view, just hide ourselves
 */

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

interface QuoteResponse {
  ticker: string;
  market: string;
  currency: string;
  ohlcv: {
    date: string;
    open: number; high: number; low: number; close: number; volume: number;
  }[];
  current: number | null;
  prev:    number | null;
  change:  number | null;
  changePct: number | null;
  asof: string;
  source_status: "ok" | "unavailable";
  message?: string;
}

export function MarketHeader({ ticker }: { ticker: string }) {
  const [data, setData] = useState<QuoteResponse | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    fetch(`${API_BASE}/v1/quote?ticker=${encodeURIComponent(ticker)}&days=60`)
      .then((r) => r.json())
      .then((d: QuoteResponse) => { if (!cancelled) setData(d); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [ticker]);

  if (!loaded) {
    return (
      <div className="surface-elev p-5 animate-pulse">
        <div className="h-3 w-32 bg-bg-hover rounded mb-3" />
        <div className="h-8 w-48 bg-bg-hover rounded mb-2" />
        <div className="h-3 w-24 bg-bg-hover rounded" />
      </div>
    );
  }

  if (!data || data.source_status !== "ok" || !data.current) {
    return (
      <div className="surface-elev p-5">
        <div className="text-2xs uppercase tracking-kicker text-ink-tertiary">
          {ticker} · {data?.market || "—"}
        </div>
        <div className="font-mono text-2xl text-ink-secondary mt-2">
          —
        </div>
        <div className="text-2xs text-ink-tertiary mt-2 font-mono">
          Live quote unavailable
        </div>
      </div>
    );
  }

  const up = (data.change ?? 0) >= 0;
  const ToneIcon = up ? TrendingUp : (data.change ?? 0) < 0 ? TrendingDown : Minus;
  const toneClass = up ? "text-signal-buy" : (data.change ?? 0) < 0 ? "text-signal-sell" : "text-ink-secondary";
  const formatted = formatPrice(data.current, data.currency);
  const changeFmt = formatPrice(Math.abs(data.change ?? 0), data.currency);
  const pctFmt = ((data.changePct ?? 0)).toFixed(2);
  const sign = (data.change ?? 0) >= 0 ? "+" : "-";

  return (
    <div className="surface-elev overflow-hidden">
      <div className="grid md:grid-cols-[1fr_2fr] gap-0">
        {/* LEFT — price block */}
        <div className="p-5 md:border-r border-border-subtle">
          <div className="flex items-center justify-between gap-3">
            <div className="text-2xs uppercase tracking-kicker text-ink-tertiary">
              {data.ticker} · {marketLabel(data.market)}
            </div>
            <span className="text-2xs text-ink-tertiary font-mono">
              {new Date(data.asof).toUTCString().slice(5, 22)} UTC
            </span>
          </div>
          <div className={`font-mono text-3xl mt-2 tabular-nums ${toneClass}`}>
            {formatted}
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <ToneIcon className={`w-4 h-4 ${toneClass}`} />
            <span className={`font-mono tabular-nums ${toneClass}`}>
              {sign}{changeFmt} ({sign}{Math.abs(parseFloat(pctFmt)).toFixed(2)}%)
            </span>
            <span className="text-2xs text-ink-tertiary uppercase tracking-wider ml-2">
              vs previous close
            </span>
          </div>
        </div>

        {/* RIGHT — 30-day sparkline */}
        <div className="p-5 min-h-[110px]">
          <div className="flex items-center justify-between text-2xs text-ink-tertiary uppercase tracking-kicker mb-2">
            <span>Last {data.ohlcv.length} sessions</span>
            <span className="font-mono">
              {data.ohlcv[0]?.date} → {data.ohlcv[data.ohlcv.length - 1]?.date}
            </span>
          </div>
          <Sparkline points={data.ohlcv.map((p) => p.close)} up={up} />
        </div>
      </div>
    </div>
  );
}

function Sparkline({ points, up }: { points: number[]; up: boolean }) {
  if (!points.length) return null;
  const W = 600, H = 70, P = 4;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const x = (i: number) => P + (i / (points.length - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - min) / range) * (H - 2 * P);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(" ");
  const area = `${path} L ${x(points.length - 1).toFixed(1)} ${H - P} L ${x(0).toFixed(1)} ${H - P} Z`;
  const colour = up ? "#3FB950" : "#F85149";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <defs>
        <linearGradient id={`fill-${up ? "u" : "d"}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={colour} stopOpacity="0.30" />
          <stop offset="100%" stopColor={colour} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#fill-${up ? "u" : "d"})`} />
      <path d={path} fill="none" stroke={colour} strokeWidth="1.5" />
    </svg>
  );
}

function formatPrice(v: number, currency: string): string {
  if (v >= 1000) return `${currencySymbol(currency)}${v.toFixed(2)}`;
  if (v >= 1) return `${currencySymbol(currency)}${v.toFixed(2)}`;
  return `${currencySymbol(currency)}${v.toFixed(4)}`;
}

function currencySymbol(c: string): string {
  return c === "CNY" ? "¥" : c === "USD" ? "$" : "";
}

function marketLabel(m: string): string {
  return m === "us_equity" ? "US Equity" : m === "a_share" ? "A-Share" : m === "crypto" ? "Crypto" : m;
}
