"use client";

/**
 * /hot/zt-pool — 涨停 / 跌停 / 炸板 / 强势股池.
 *
 * The CN short-term trader's morning routine. East-money calls this
 * 涨停股池. Four tabs:
 *   - zt    涨停板    今日封板成功的股
 *   - dt    跌停板
 *   - zbgc  炸板池    曾涨停过但收盘没守住
 *   - qgc   强势股池  非涨停但属强势
 *
 * Every row links to /decision so the user can ask the 7-agent
 * "why did this go limit-up?".
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUp,
  ArrowDown,
  Flame,
  Loader2,
  TrendingUp,
  Zap,
  Sparkles,
} from "lucide-react";
import { cn } from "../../lib/cn";

const API_BASE = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

type Kind = "zt" | "dt" | "zbgc" | "qgc";

interface PoolRow {
  [k: string]: string | number | null;
}
interface PoolResponse {
  status: string;
  rows: PoolRow[];
  date?: string;
  kind?: string;
  source?: string;
  message?: string;
}

const TABS: { key: Kind; label: string; icon: React.ReactNode; accent: string }[] = [
  {
    key: "zt",
    label: "涨停板",
    icon: <ArrowUp className="w-3.5 h-3.5" />,
    accent: "signal-buy",
  },
  {
    key: "zbgc",
    label: "炸板池",
    icon: <Flame className="w-3.5 h-3.5" />,
    accent: "signal-warn",
  },
  {
    key: "qgc",
    label: "强势股池",
    icon: <TrendingUp className="w-3.5 h-3.5" />,
    accent: "accent",
  },
  {
    key: "dt",
    label: "跌停板",
    icon: <ArrowDown className="w-3.5 h-3.5" />,
    accent: "signal-sell",
  },
];

export default function ZtPoolPage() {
  const [kind, setKind] = useState<Kind>("zt");
  const [data, setData] = useState<PoolResponse | null>(null);

  useEffect(() => {
    setData(null);
    fetch(`${API_BASE}/v1/cn/zt-pool?kind=${kind}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ status: "unavailable", rows: [], message: "network" }));
  }, [kind]);

  const rows = data?.rows ?? [];
  const sample = rows[0] || {};
  const cols = Object.keys(sample);

  // akshare returns these schemas (vary by kind):
  //   zt: 代码, 名称, 涨跌幅, 最新价, 成交额, 流通市值, 总市值, 换手率,
  //        封板资金, 首次封板时间, 最后封板时间, 连板数, 涨停统计, 所属行业
  //   dt: similar
  //   zbgc: 代码, 名称, 涨跌幅, 最新价, 涨停价, 成交额, 流通市值, 总市值,
  //         换手率, 涨速, 首次封板时间, 炸板次数, 涨停统计, 振幅, 所属行业
  //   qgc: 代码, 名称, 涨跌幅, 最新价, 涨停价, 成交额, 流通市值, 总市值,
  //         换手率, 涨速, 是否新高, 量比, 涨停统计, 入选理由, 所属行业

  const tickerKey = cols.find((c) => /^代码$/.test(c)) || "代码";
  const nameKey = cols.find((c) => /^名称$/.test(c)) || "名称";
  const changeKey = cols.find((c) => /^涨跌幅$/.test(c)) || "涨跌幅";
  const priceKey = cols.find((c) => /^最新价$/.test(c)) || "最新价";
  const turnoverKey = cols.find((c) => /^换手率$/.test(c)) || undefined;
  const industryKey = cols.find((c) => /^所属行业$/.test(c)) || undefined;
  const lianbanKey = cols.find((c) => /连板数/.test(c)) || undefined;
  const fengbanCashKey = cols.find((c) => /封板资金/.test(c)) || undefined;
  const zhabanCntKey = cols.find((c) => /炸板次数/.test(c)) || undefined;
  const reasonKey = cols.find((c) => /入选理由/.test(c)) || undefined;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <header className="mb-6">
        <Link href="/hot" className="text-xs text-ink-tertiary hover:text-ink-primary">
          ← 人气榜
        </Link>
        <div className="kicker mt-2 mb-2">
          <Zap className="w-3.5 h-3.5" /> 涨停股池 / Limit-up pool
        </div>
        <h1 className="display text-3xl md:text-4xl text-ink-primary tracking-tighter">
          涨停 · 炸板 · 强势 · 跌停
        </h1>
        <p className="text-ink-secondary mt-3 text-sm max-w-2xl leading-relaxed">
          akshare → 东方财富。短线交易员的早盘标配。每一行可一键发起 7-agent 决策。
        </p>
      </header>

      {/* Tab bar */}
      <div className="flex items-center gap-2 mb-6 flex-wrap border-b border-border-subtle">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setKind(t.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition -mb-px",
              kind === t.key
                ? cn(
                    "font-semibold",
                    t.accent === "signal-buy" && "border-signal-buy text-signal-buy",
                    t.accent === "signal-sell" && "border-signal-sell text-signal-sell",
                    t.accent === "signal-warn" && "border-signal-warn text-signal-warn",
                    t.accent === "accent" && "border-accent text-accent"
                  )
                : "border-transparent text-ink-secondary hover:text-ink-primary"
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
        <div className="ml-auto text-2xs text-ink-tertiary uppercase tracking-wider font-mono">
          {data?.date ? `日期 ${data.date.slice(0, 4)}-${data.date.slice(4, 6)}-${data.date.slice(6, 8)}` : ""}
        </div>
      </div>

      {!data ? (
        <div className="surface-elev p-6 flex items-center gap-2 text-ink-tertiary text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading…
        </div>
      ) : data.status !== "ok" ? (
        <div className="surface p-4 text-xs text-ink-tertiary">
          数据暂时不可用 — {data.message || "akshare 上游未返回（可能今日无涨/跌停股，或非交易日）"}
        </div>
      ) : rows.length === 0 ? (
        <div className="surface p-4 text-xs text-ink-tertiary">无数据</div>
      ) : (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg-hover text-2xs uppercase tracking-wider text-ink-tertiary">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">#</th>
                  <th className="text-left px-3 py-2 font-medium">代码</th>
                  <th className="text-left px-3 py-2 font-medium">名称</th>
                  <th className="text-right px-3 py-2 font-medium">最新价</th>
                  <th className="text-right px-3 py-2 font-medium">涨跌幅</th>
                  {turnoverKey && <th className="text-right px-3 py-2 font-medium">换手率</th>}
                  {lianbanKey && <th className="text-right px-3 py-2 font-medium">连板</th>}
                  {fengbanCashKey && <th className="text-right px-3 py-2 font-medium">封板资金</th>}
                  {zhabanCntKey && <th className="text-right px-3 py-2 font-medium">炸板次数</th>}
                  {industryKey && <th className="text-left px-3 py-2 font-medium">行业</th>}
                  {reasonKey && <th className="text-left px-3 py-2 font-medium">入选理由</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const ticker = String(r[tickerKey] || "");
                  const change = Number(r[changeKey] || 0);
                  return (
                    <tr
                      key={i}
                      className="border-t border-border-subtle hover:bg-bg-hover/50 transition-colors"
                    >
                      <td className="px-3 py-2 text-ink-tertiary font-mono text-xs">{i + 1}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {ticker ? (
                          <Link
                            href={`/decision?ticker=${ticker}`}
                            className="text-ink-primary hover:text-accent"
                          >
                            {ticker}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-ink-primary">{String(r[nameKey] || "—")}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {r[priceKey] != null ? Number(r[priceKey]).toFixed(2) : "—"}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-mono text-xs",
                          change >= 0 ? "text-signal-buy" : "text-signal-sell"
                        )}
                      >
                        {change >= 0 ? "+" : ""}
                        {change.toFixed(2)}%
                      </td>
                      {turnoverKey && (
                        <td className="px-3 py-2 text-right font-mono text-xs text-ink-secondary">
                          {r[turnoverKey] != null ? `${Number(r[turnoverKey]).toFixed(2)}%` : "—"}
                        </td>
                      )}
                      {lianbanKey && (
                        <td className="px-3 py-2 text-right font-mono text-xs text-accent">
                          {String(r[lianbanKey] || "—")}
                        </td>
                      )}
                      {fengbanCashKey && (
                        <td className="px-3 py-2 text-right font-mono text-xs text-ink-secondary">
                          {r[fengbanCashKey] != null
                            ? `${(Number(r[fengbanCashKey]) / 1e8).toFixed(2)} 亿`
                            : "—"}
                        </td>
                      )}
                      {zhabanCntKey && (
                        <td className="px-3 py-2 text-right font-mono text-xs text-ink-secondary">
                          {String(r[zhabanCntKey] || "—")}
                        </td>
                      )}
                      {industryKey && (
                        <td className="px-3 py-2 text-ink-secondary text-xs">
                          {String(r[industryKey] || "—")}
                        </td>
                      )}
                      {reasonKey && (
                        <td className="px-3 py-2 text-ink-secondary text-xs">
                          {String(r[reasonKey] || "—")}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-2xs text-ink-tertiary mt-8 leading-relaxed">
        <Sparkles className="inline-block w-3 h-3 mr-1" />
        点任意代码进 /decision 让 7-agent 给出辩论 + 风控建议。这里只是数据展示，不构成投资建议。
      </p>
    </div>
  );
}
