"use client";

/**
 * KLinePanel — wraps the KLineChart with a /v1/quote fetch, period
 * toggle (60d / 1y), and graceful empty/loading states. Drop into
 * any page that takes a ticker.
 */

import { useEffect, useState } from "react";
import { KLineChart, type OHLCBar } from "./KLineChart";
import { LineChart as LineIcon, Loader2 } from "lucide-react";
import { cn } from "../lib/cn";

const API_BASE = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

interface QuoteResp {
  ohlcv?: OHLCBar[];
  source_status: "ok" | "unavailable";
  message?: string;
}

export function KLinePanel({ ticker }: { ticker: string }) {
  const [days, setDays] = useState<60 | 120 | 250>(60);
  const [data, setData] = useState<QuoteResp | null>(null);

  useEffect(() => {
    if (!ticker) return;
    setData(null);
    fetch(`${API_BASE}/v1/quote?ticker=${encodeURIComponent(ticker)}&days=${days}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() =>
        setData({
          source_status: "unavailable",
          message: "network",
        }),
      );
  }, [ticker, days]);

  if (!ticker) return null;

  return (
    <section className="surface-elev p-5">
      <div className="flex items-baseline gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
          <LineIcon className="w-4 h-4 text-accent" />
          K 线 · {days} 日
        </div>
        <span className="text-2xs uppercase tracking-wider text-ink-tertiary">
          Candles · MA20 · MA60
        </span>
        <div className="ml-auto flex items-center gap-1 surface p-0.5 text-2xs">
          {([60, 120, 250] as const).map((n) => (
            <button
              key={n}
              onClick={() => setDays(n)}
              className={cn(
                "px-2 py-0.5 rounded transition",
                days === n
                  ? "bg-accent/15 text-accent font-semibold"
                  : "text-ink-secondary hover:text-ink-primary"
              )}
            >
              {n === 250 ? "1Y" : `${n}D`}
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="flex items-center gap-2 text-2xs text-ink-tertiary py-8">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading bars…
        </div>
      ) : data.source_status !== "ok" || !data.ohlcv?.length ? (
        <div className="text-2xs text-ink-tertiary py-4 italic">
          K 线数据暂时不可用 {data.message ? `(${data.message})` : ""}
        </div>
      ) : (
        <KLineChart
          bars={data.ohlcv}
          ma={[20, 60]}
          height={300}
        />
      )}
    </section>
  );
}
