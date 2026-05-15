"use client";

/**
 * /cn-markets/block-trade — 大宗交易 daily summary.
 *
 * Reuses the column-inference pattern from fund-flow / sectors: every
 * akshare response has different column names; the table component
 * picks priority cols at runtime so a slight upstream rename doesn't
 * break the page.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Loader2, Sparkles } from "lucide-react";
import { cn } from "../../lib/cn";

const API_BASE = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

interface BlockResp {
  status: string;
  rows: Array<Record<string, string | number | null>>;
  date?: string;
  source?: string;
  message?: string;
}

export default function BlockTradePage() {
  const [data, setData] = useState<BlockResp | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/v1/cn/block-trade?top=80`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ status: "unavailable", rows: [], message: "network" }));
  }, []);

  const rows = data?.rows ?? [];
  const sample = rows[0] || {};
  const cols = Object.keys(sample);
  const tickerKey = cols.find((c) => /代码|^code$/i.test(c));
  const nameKey = cols.find((c) => /名称/.test(c));
  const dateKey = cols.find((c) => /日期/.test(c));
  // For each col render up to 6 priority cols
  const priorityCols = cols
    .filter(
      (c) =>
        /日期|代码|名称|价格|成交价|成交量|成交额|溢价|折价|买方|卖方/.test(c)
    )
    .slice(0, 8);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <header className="mb-6">
        <Link href="/cn-markets" className="text-xs text-ink-tertiary hover:text-ink-primary">
          ← A 股市场
        </Link>
        <div className="kicker mt-2 mb-2">
          <Activity className="w-3.5 h-3.5" /> 大宗交易 / Block trades
        </div>
        <h1 className="display text-3xl md:text-4xl text-ink-primary tracking-tighter">
          大宗交易 · 今日
        </h1>
        <p className="text-ink-secondary mt-3 text-sm max-w-2xl leading-relaxed">
          OTC 成交在监管要求下披露的 block trades — 大股东出货 / 机构调仓的最直接信号。
          深度折价的 block trade 通常意味着 selling pressure。
        </p>
      </header>

      {!data ? (
        <div className="surface-elev p-6 flex items-center gap-2 text-ink-tertiary text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : data.status !== "ok" || rows.length === 0 ? (
        <div className="surface p-4 text-xs text-ink-tertiary">
          数据暂时不可用 — {data.message || "今日无大宗交易"}
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
                        // Link the 代码 column to /stock/{t}
                        if (c === tickerKey && ticker && /^\d{6}$/.test(ticker)) {
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
                        if (typeof val === "number") {
                          return (
                            <td key={c} className="px-3 py-2 font-mono text-xs text-ink-secondary">
                              {Math.abs(val) > 1e6 ? `${(val / 1e8).toFixed(2)} 亿` : val.toFixed(2)}
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
        点代码列进 /stock/{`{ticker}`} 综合页 → 一键发起 7-agent 决策。
      </p>
    </div>
  );
}
