"use client";

/**
 * /cn-markets/sectors — 申万行业 + 概念股 heatmap.
 *
 * Two toggle modes:
 *   - industry  →  ak.stock_board_industry_name_em  (申万 28 行业)
 *   - concept   →  ak.stock_board_concept_name_em   (~400 themes)
 *
 * Rendered as a colour-coded grid card per sector + sortable detail
 * table. The grid view mimics east-money's heatmap; the table is for
 * power users who want exact pct/换手率/总市值.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUp,
  ArrowDown,
  Layers,
  Loader2,
  Sparkles,
} from "lucide-react";
import { cn } from "../../lib/cn";

const API_BASE = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

interface SectorRow {
  [k: string]: string | number | null;
}
interface SectorResponse {
  status: string;
  rows: SectorRow[];
  source?: string;
  message?: string;
}

type SortKey = "pct" | "name";

export default function SectorsPage() {
  const [kind, setKind] = useState<"industry" | "concept">("industry");
  const [data, setData] = useState<SectorResponse | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("pct");
  const [view, setView] = useState<"heatmap" | "table">("heatmap");

  useEffect(() => {
    setData(null);
    const path =
      kind === "industry" ? "/v1/cn/sectors/industry" : "/v1/cn/sectors/concept";
    fetch(`${API_BASE}${path}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ status: "unavailable", rows: [], message: "network" }));
  }, [kind]);

  const rows = data?.rows ?? [];
  // Column inference — akshare returns Chinese headers that vary slightly.
  const sample = rows[0] || {};
  const cols = Object.keys(sample);
  const nameKey = cols.find((c) => /板块名称|名称/.test(c)) || cols[1] || cols[0];
  const changeKey = cols.find((c) => /涨跌幅/.test(c)) || cols[2];
  const turnoverKey = cols.find((c) => /换手率/.test(c));
  const marketCapKey = cols.find((c) => /总市值/.test(c));
  const upDownCntKey = cols.find((c) => /上涨家数|领涨/.test(c));
  const leaderKey = cols.find((c) => /领涨/.test(c) && /股/.test(c));

  const sorted = [...rows].sort((a, b) => {
    if (sortKey === "name") return String(a[nameKey]).localeCompare(String(b[nameKey]), "zh");
    return Number(b[changeKey || ""] || 0) - Number(a[changeKey || ""] || 0);
  });

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <header className="mb-8">
        <Link
          href="/cn-markets"
          className="text-xs text-ink-tertiary hover:text-ink-primary"
        >
          ← A 股市场
        </Link>
        <div className="kicker mt-2 mb-2">
          <Layers className="w-3.5 h-3.5" /> 板块行情 / Sector heatmap
        </div>
        <h1 className="display text-3xl md:text-4xl text-ink-primary tracking-tighter">
          {kind === "industry" ? "申万行业" : "概念股"} · 今日行情
        </h1>
        <p className="text-ink-secondary mt-3 text-sm max-w-2xl leading-relaxed">
          akshare → 东方财富。颜色按涨跌幅冷热映射；点任意行查看详情。
        </p>
      </header>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-1 surface p-0.5 text-xs">
          <button
            onClick={() => setKind("industry")}
            className={cn(
              "px-3 py-1 rounded",
              kind === "industry"
                ? "bg-accent/15 text-accent"
                : "text-ink-secondary hover:text-ink-primary"
            )}
          >
            申万行业
          </button>
          <button
            onClick={() => setKind("concept")}
            className={cn(
              "px-3 py-1 rounded",
              kind === "concept"
                ? "bg-accent/15 text-accent"
                : "text-ink-secondary hover:text-ink-primary"
            )}
          >
            概念股
          </button>
        </div>

        <div className="flex items-center gap-1 surface p-0.5 text-xs">
          <button
            onClick={() => setView("heatmap")}
            className={cn(
              "px-3 py-1 rounded",
              view === "heatmap" ? "bg-accent/15 text-accent" : "text-ink-secondary"
            )}
          >
            热力图
          </button>
          <button
            onClick={() => setView("table")}
            className={cn(
              "px-3 py-1 rounded",
              view === "table" ? "bg-accent/15 text-accent" : "text-ink-secondary"
            )}
          >
            表格
          </button>
        </div>

        <div className="ml-auto text-2xs text-ink-tertiary uppercase tracking-wider">
          {rows.length} 个板块
        </div>
      </div>

      {!data ? (
        <div className="surface-elev p-6 flex items-center gap-2 text-ink-tertiary text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading…
        </div>
      ) : data.status !== "ok" ? (
        <div className="surface p-4 text-xs text-ink-tertiary">
          数据暂时不可用 — {data.message || "akshare 上游未返回"}
        </div>
      ) : view === "heatmap" ? (
        <SectorHeatmap
          rows={sorted}
          nameKey={nameKey}
          changeKey={changeKey || ""}
          leaderKey={leaderKey}
        />
      ) : (
        <SectorTable
          rows={sorted}
          nameKey={nameKey}
          changeKey={changeKey || ""}
          turnoverKey={turnoverKey}
          marketCapKey={marketCapKey}
          upDownCntKey={upDownCntKey}
          leaderKey={leaderKey}
          sortKey={sortKey}
          onSort={(k) => setSortKey(k)}
        />
      )}

      <p className="text-2xs text-ink-tertiary mt-8 leading-relaxed">
        <Sparkles className="inline-block w-3 h-3 mr-1" />
        看到一个发力的板块？点领涨股进 /decision 让 7-agent 分析。
      </p>
    </div>
  );
}

function pctColor(pct: number): string {
  if (pct > 4) return "bg-signal-buy text-white";
  if (pct > 2) return "bg-signal-buy/70 text-white";
  if (pct > 0.5) return "bg-signal-buy/40 text-ink-primary";
  if (pct > -0.5) return "bg-bg-hover text-ink-secondary";
  if (pct > -2) return "bg-signal-sell/40 text-ink-primary";
  if (pct > -4) return "bg-signal-sell/70 text-white";
  return "bg-signal-sell text-white";
}

function fmtPct(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!isFinite(n)) return String(v);
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function SectorHeatmap({
  rows,
  nameKey,
  changeKey,
  leaderKey,
}: {
  rows: SectorRow[];
  nameKey: string;
  changeKey: string;
  leaderKey?: string;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
      {rows.map((r, i) => {
        const change = Number(r[changeKey] || 0);
        const leader = leaderKey ? String(r[leaderKey] || "") : "";
        return (
          <div
            key={i}
            className={cn(
              "rounded-md p-3 transition hover:opacity-80 cursor-default",
              pctColor(change)
            )}
            title={leader ? `领涨股: ${leader}` : undefined}
          >
            <div className="text-sm font-semibold truncate">
              {String(r[nameKey] || "—")}
            </div>
            <div className="text-xs font-mono mt-1 opacity-95">
              {fmtPct(change)}
            </div>
            {leader && (
              <div className="text-2xs opacity-70 mt-1 truncate font-mono">
                领涨: {leader}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SectorTable({
  rows,
  nameKey,
  changeKey,
  turnoverKey,
  marketCapKey,
  upDownCntKey,
  leaderKey,
  sortKey,
  onSort,
}: {
  rows: SectorRow[];
  nameKey: string;
  changeKey: string;
  turnoverKey?: string;
  marketCapKey?: string;
  upDownCntKey?: string;
  leaderKey?: string;
  sortKey: SortKey;
  onSort: (k: SortKey) => void;
}) {
  return (
    <div className="surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-bg-hover text-2xs uppercase tracking-wider text-ink-tertiary">
            <tr>
              <th className="text-left px-3 py-2 font-medium">#</th>
              <th
                className="text-left px-3 py-2 font-medium cursor-pointer"
                onClick={() => onSort("name")}
              >
                板块名称 {sortKey === "name" ? <ArrowDown className="inline w-3 h-3" /> : null}
              </th>
              <th
                className="text-right px-3 py-2 font-medium cursor-pointer"
                onClick={() => onSort("pct")}
              >
                涨跌幅 {sortKey === "pct" ? <ArrowDown className="inline w-3 h-3" /> : null}
              </th>
              {turnoverKey && <th className="text-right px-3 py-2 font-medium">换手率</th>}
              {marketCapKey && <th className="text-right px-3 py-2 font-medium">总市值</th>}
              {upDownCntKey && <th className="text-right px-3 py-2 font-medium">上涨家数</th>}
              {leaderKey && <th className="text-left px-3 py-2 font-medium">领涨股</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const change = Number(r[changeKey] || 0);
              return (
                <tr key={i} className="border-t border-border-subtle hover:bg-bg-hover/50">
                  <td className="px-3 py-2 text-ink-tertiary font-mono text-xs">{i + 1}</td>
                  <td className="px-3 py-2 text-ink-primary">{String(r[nameKey] || "—")}</td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-mono text-xs",
                      change >= 0 ? "text-signal-buy" : "text-signal-sell"
                    )}
                  >
                    {change >= 0 ? <ArrowUp className="inline w-3 h-3" /> : <ArrowDown className="inline w-3 h-3" />}
                    {fmtPct(change)}
                  </td>
                  {turnoverKey && (
                    <td className="px-3 py-2 text-right font-mono text-xs text-ink-secondary">
                      {fmtPct(Number(r[turnoverKey]))}
                    </td>
                  )}
                  {marketCapKey && (
                    <td className="px-3 py-2 text-right font-mono text-xs text-ink-secondary">
                      {r[marketCapKey] != null
                        ? `${(Number(r[marketCapKey]) / 1e8).toFixed(0)} 亿`
                        : "—"}
                    </td>
                  )}
                  {upDownCntKey && (
                    <td className="px-3 py-2 text-right font-mono text-xs text-ink-secondary">
                      {String(r[upDownCntKey] || "—")}
                    </td>
                  )}
                  {leaderKey && (
                    <td className="px-3 py-2 text-ink-secondary text-xs">
                      {String(r[leaderKey] || "—")}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
