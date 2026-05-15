"use client";

/**
 * /etf — ETF spot list + open-end fund daily NAV toggle.
 *
 * Two data sources combined under one page:
 *   - fund_etf_spot_em      ETF: current price, NAV, 净值溢价率, 成交额
 *   - fund_open_fund_daily  Open-end mutual funds: code, name, 净值, 涨跌幅
 *
 * Default sort = 成交额 desc (most-liquid first) so users see the
 * core ETFs (300/500/创业板) at the top instead of niche thematics.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Loader2, Sparkles } from "lucide-react";
import { cn } from "../lib/cn";

const API_BASE = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

interface Resp {
  status: string;
  rows: Array<Record<string, string | number | null>>;
  message?: string;
}

export default function EtfPage() {
  const [kind, setKind] = useState<"etf" | "fund">("etf");
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    setData(null);
    const path = kind === "etf" ? "/v1/cn/etf/spot" : "/v1/cn/fund/open-daily";
    fetch(`${API_BASE}${path}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ status: "unavailable", rows: [], message: "network" }));
  }, [kind]);

  const rows = data?.rows ?? [];
  const sample = rows[0] || {};
  const cols = Object.keys(sample);
  const tickerKey = cols.find((c) => /^代码$|fund_code/i.test(c));
  const priorityCols = cols
    .filter((c) =>
      /代码|^名称$|^最新价$|^涨跌幅$|^成交额$|净值|溢价率|^单位净值$|累计净值|日增长率/.test(c)
    )
    .slice(0, 8);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <header className="mb-6">
        <div className="kicker mb-2">
          <Activity className="w-3.5 h-3.5" /> ETF / 基金 / Funds
        </div>
        <h1 className="display text-3xl md:text-4xl text-ink-primary tracking-tighter">
          ETF · 基金
        </h1>
        <p className="text-ink-secondary mt-3 text-sm max-w-2xl leading-relaxed">
          ETF 现价/净值/溢价率 · 开放式基金每日净值。按成交额排序，核心宽基在最上。
        </p>
      </header>

      <div className="flex items-center gap-2 mb-6">
        <div className="flex items-center gap-1 surface p-0.5 text-xs">
          <button
            onClick={() => setKind("etf")}
            className={cn(
              "px-3 py-1 rounded",
              kind === "etf"
                ? "bg-accent/15 text-accent"
                : "text-ink-secondary hover:text-ink-primary"
            )}
          >
            ETF 现货
          </button>
          <button
            onClick={() => setKind("fund")}
            className={cn(
              "px-3 py-1 rounded",
              kind === "fund"
                ? "bg-accent/15 text-accent"
                : "text-ink-secondary hover:text-ink-primary"
            )}
          >
            开放式基金
          </button>
        </div>
        <div className="ml-auto text-2xs text-ink-tertiary uppercase tracking-wider">
          {rows.length} 个
        </div>
      </div>

      {!data ? (
        <div className="surface-elev p-6 flex items-center gap-2 text-ink-tertiary text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : data.status !== "ok" || rows.length === 0 ? (
        <div className="surface p-4 text-xs text-ink-tertiary">
          数据暂时不可用 — {data.message || "akshare 上游未返回"}
        </div>
      ) : (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg-hover text-2xs uppercase tracking-wider text-ink-tertiary">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">#</th>
                  {priorityCols.map((c) => (
                    <th key={c} className="text-left px-3 py-2 font-medium whitespace-nowrap">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const ticker = tickerKey ? String(r[tickerKey] || "") : "";
                  return (
                    <tr key={i} className="border-t border-border-subtle hover:bg-bg-hover/50">
                      <td className="px-3 py-2 text-ink-tertiary font-mono text-xs">{i + 1}</td>
                      {priorityCols.map((c) => {
                        const val = r[c];
                        if (c === tickerKey && ticker) {
                          return (
                            <td key={c} className="px-3 py-2 font-mono text-xs">
                              <Link
                                href={`/stock/${ticker}`}
                                className="text-ink-primary hover:text-accent"
                              >
                                {ticker}
                              </Link>
                            </td>
                          );
                        }
                        const isPctCol = /涨跌幅|溢价率|日增长率/.test(c);
                        if (typeof val === "number") {
                          const accent = isPctCol
                            ? val >= 0
                              ? "text-signal-buy"
                              : "text-signal-sell"
                            : "text-ink-secondary";
                          const txt = isPctCol
                            ? `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`
                            : Math.abs(val) > 1e7
                            ? `${(val / 1e8).toFixed(2)} 亿`
                            : val.toFixed(3);
                          return (
                            <td
                              key={c}
                              className={cn("px-3 py-2 font-mono text-xs", accent)}
                            >
                              {txt}
                            </td>
                          );
                        }
                        return (
                          <td key={c} className="px-3 py-2 text-ink-primary text-xs">
                            {String(val ?? "—")}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-2xs text-ink-tertiary mt-8 leading-relaxed">
        <Sparkles className="inline w-3 h-3 mr-1" />
        ETF 代码 → /stock/{`{code}`} 综合页 → 7-agent 决策。基金 NAV 不支持决策（净值标的）。
      </p>
    </div>
  );
}
