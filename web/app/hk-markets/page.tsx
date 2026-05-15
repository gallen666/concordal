"use client";

/**
 * /hk-markets — 港股 spot list (top by 成交额).
 *
 * Pure read-only for now — the 7-agent pipeline doesn't have a
 * dedicated HK adapter yet (yfinance covers most HK ADRs via .HK
 * suffix, but the akshare path is cleaner for HK-listed names).
 *
 * Stub: when the user clicks a ticker, route to /decision with the
 * raw 5-digit HK code. The decision adapter logic already accepts
 * unknown markets and best-effort-falls-back to yfinance with .HK.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Loader2, Sparkles } from "lucide-react";
import { cn } from "../lib/cn";

const API_BASE = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

interface HkResp {
  status: string;
  rows: Array<Record<string, string | number | null>>;
  message?: string;
}

export default function HkMarketsPage() {
  const [data, setData] = useState<HkResp | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/v1/hk/spot?top=120`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ status: "unavailable", rows: [], message: "network" }));
  }, []);

  const rows = data?.rows ?? [];
  const sample = rows[0] || {};
  const cols = Object.keys(sample);
  const tickerKey = cols.find((c) => /^代码$|symbol/i.test(c));
  const priorityCols = cols
    .filter((c) =>
      /代码|^名称$|^最新价$|^涨跌幅$|^成交量$|^成交额$|今开|昨收|最高|最低/.test(c)
    )
    .slice(0, 9);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <header className="mb-6">
        <div className="kicker mb-2">
          <Activity className="w-3.5 h-3.5" /> 港股 / HK markets
        </div>
        <h1 className="display text-3xl md:text-4xl text-ink-primary tracking-tighter">
          港股 · TOP 120
        </h1>
        <p className="text-ink-secondary mt-3 text-sm max-w-2xl leading-relaxed">
          按成交额排序的港股龙头。点 5 位代码进 /stock 综合页，再发起 7-agent 决策（HK 走 yfinance .HK 适配）。
        </p>
      </header>

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
                                href={`/decision?ticker=${ticker}.HK&market=hk_equity`}
                                className="text-ink-primary hover:text-accent"
                                title="Run 7-agent decision (yfinance .HK)"
                              >
                                {ticker}
                              </Link>
                            </td>
                          );
                        }
                        const isPct = /涨跌幅/.test(c);
                        if (typeof val === "number") {
                          const accent = isPct
                            ? val >= 0
                              ? "text-signal-buy"
                              : "text-signal-sell"
                            : "text-ink-secondary";
                          const txt = isPct
                            ? `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`
                            : Math.abs(val) > 1e7
                            ? `${(val / 1e8).toFixed(2)} 亿`
                            : val.toFixed(2);
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
        港股 K 线 / F10 / 北向持仓 在 roadmap，目前 /decision 通过 yfinance .HK 后缀路由。
      </p>
    </div>
  );
}
