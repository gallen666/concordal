"use client";

/**
 * /stock/[ticker] — east-money-style individual stock one-stop page.
 *
 * Pulls every signal we already have for one name into a single view:
 *
 *   - MarketHeader (price + 60d sparkline)
 *   - "Run 7-agent decision" prominent CTA — our wedge vs east-money
 *   - F10 cards: 大股东 · 限售解禁 · 股权质押 · 高管增减持
 *   - 研报 (sell-side reports)
 *   - 公告 (corporate filings)
 *   - Recent 决策 on this ticker (timeline link)
 *
 * Mobile-first: cards stack vertically. Every panel handles its own
 * loading / unavailable state — one slow upstream can't take down the
 * rest of the page.
 *
 * This page is the closest thing we have to the east-money '个股' page
 * — and the CTA on top is the thing they CAN'T match.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  FileText,
  Loader2,
  MessageCircle,
  Newspaper,
  Play,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import { MarketHeader } from "../../components/MarketHeader";
import { KLinePanel } from "../../components/KLinePanel";
import { cn } from "../../lib/cn";

const API_BASE = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

interface RowsResponse {
  status: string;
  rows: Array<Record<string, string | number | null>>;
  source?: string;
  message?: string;
  kind?: string;
}

interface TickerInfo {
  ticker: string;
  name?: string;
  exchange?: string;
  industry?: string;
  cap?: number;
  cached?: boolean;
}

export default function StockDetailPage() {
  const params = useParams<{ ticker: string }>();
  const ticker = (params?.ticker as string)?.toUpperCase() || "";

  const [info, setInfo] = useState<TickerInfo | null>(null);
  const [holders, setHolders] = useState<RowsResponse | null>(null);
  const [restricted, setRestricted] = useState<RowsResponse | null>(null);
  const [pledge, setPledge] = useState<RowsResponse | null>(null);
  const [research, setResearch] = useState<RowsResponse | null>(null);
  const [notice, setNotice] = useState<RowsResponse | null>(null);
  const [fundFlow, setFundFlow] = useState<Record<string, string | number | null> | null>(null);

  useEffect(() => {
    if (!ticker) return;
    // Pull info first — it's fast and decides what panels make sense.
    fetch(`${API_BASE}/v1/ticker/info?ticker=${ticker}`)
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => {});

    // For A-shares only, fire the F10 panels in parallel. yfinance
    // tickers won't match these endpoints; the panels will gracefully
    // show 'unavailable'.
    const isAShare = /^\d{6}$/.test(ticker);
    if (isAShare) {
      const fetch_ = (path: string, setter: (r: RowsResponse) => void) =>
        fetch(`${API_BASE}${path}`)
          .then((r) => r.json())
          .then(setter)
          .catch(() => setter({ status: "unavailable", rows: [], message: "network" }));
      fetch_(`/v1/cn/f10/holders/${ticker}`, setHolders);
      fetch_(`/v1/cn/f10/restricted/${ticker}`, setRestricted);
      fetch_(`/v1/cn/f10/pledge/${ticker}`, setPledge);
      fetch_(`/v1/cn/research/${ticker}`, setResearch);
      fetch_(`/v1/cn/notice/${ticker}`, setNotice);

      // Pull this ticker's row from the individual fund-flow ranking.
      // It's a single fetch — the user will see "not in top 50" if they
      // ask about an obscure name, which is honest.
      fetch(`${API_BASE}/v1/cn/fund-flow/individual?top=200`)
        .then((r) => r.json())
        .then((j: RowsResponse) => {
          const hit = (j.rows || []).find(
            (r) => String(r["代码"] || "") === ticker
          );
          setFundFlow(hit || null);
        })
        .catch(() => {});
    } else {
      // For non-A-share tickers, mark all CN panels unavailable.
      setHolders({ status: "unavailable", rows: [], message: "non A-share" });
      setRestricted({ status: "unavailable", rows: [], message: "non A-share" });
      setPledge({ status: "unavailable", rows: [], message: "non A-share" });
      setResearch({ status: "unavailable", rows: [], message: "non A-share" });
      setNotice({ status: "unavailable", rows: [], message: "non A-share" });
    }
  }, [ticker]);

  if (!ticker) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10 text-sm text-ink-secondary">
        Missing ticker.
      </div>
    );
  }

  const isAShare = /^\d{6}$/.test(ticker);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Hero — ticker title + meta */}
      <header className="mb-4">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="font-mono text-3xl font-semibold tracking-wider">
            {ticker}
          </h1>
          {info?.name && (
            <span className="text-xl text-ink-primary">{info.name}</span>
          )}
          {info?.industry && (
            <span className="px-2 py-0.5 rounded bg-bg-hover text-2xs text-ink-secondary">
              {info.industry}
            </span>
          )}
          {info?.exchange && (
            <span className="text-2xs uppercase text-ink-tertiary tracking-wider">
              {info.exchange}
            </span>
          )}
        </div>
        <div className="text-2xs text-ink-tertiary mt-2 uppercase tracking-wider">
          {isAShare ? "A 股 · 沪深市场" : "Non-CN ticker"} · 综合个股页
        </div>
      </header>

      {/* Quote strip — reuse MarketHeader for the sparkline. */}
      <MarketHeader ticker={ticker} />

      {/* Full K-line chart */}
      <div className="my-6">
        <KLinePanel ticker={ticker} />
      </div>

      {/* Run-decision CTA — this is the wedge */}
      <div className="surface-elev p-4 mb-6 flex items-center gap-4 flex-wrap border-l-2 border-l-accent">
        <Sparkles className="w-5 h-5 text-accent shrink-0" />
        <div className="flex-1 min-w-[200px]">
          <div className="text-base font-semibold text-ink-primary">
            想知道这只股票该买、该卖、还是该等？
          </div>
          <div className="text-2xs text-ink-tertiary mt-1">
            Run a 7-agent decision: bull/bear debate + risk committee + manager verdict + Langfuse trace
          </div>
        </div>
        <Link
          href={`/decision?ticker=${ticker}`}
          className="btn-primary"
        >
          <Play className="w-4 h-4" />
          运行 7-agent 决策
        </Link>
        <Link
          href={`/decisions/${ticker}`}
          className="btn-secondary text-sm"
        >
          历次决策
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Fund flow snippet — only if we found a row */}
      {isAShare && fundFlow && (
        <div className="surface-elev p-4 mb-6 flex items-center gap-4 flex-wrap">
          <BarChart3 className="w-4 h-4 text-accent shrink-0" />
          <div className="flex items-baseline gap-4 flex-wrap text-sm">
            <span className="text-ink-tertiary">今日主力净流入：</span>
            <span
              className={cn(
                "font-mono font-semibold",
                Number(fundFlow["主力净流入-净额"] || 0) >= 0
                  ? "text-signal-buy"
                  : "text-signal-sell"
              )}
            >
              {fmtFlow(Number(fundFlow["主力净流入-净额"] || 0))}
            </span>
            <span className="text-ink-tertiary">占比：</span>
            <span className="font-mono">
              {fmtPct(Number(fundFlow["主力净流入-净占比"] || 0))}
            </span>
          </div>
          <Link
            href="/cn-markets/fund-flow"
            className="ml-auto text-2xs text-accent hover:underline"
          >
            完整榜单 →
          </Link>
        </div>
      )}

      {/* Two-column grid: F10 left, research/notice right.
          Mobile stacks. Each panel handles its own state. */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <F10Panel
          title="十大股东"
          subtitle="Top shareholders"
          icon={<Users className="w-4 h-4" />}
          data={holders}
          renderRows={(rows) => <HoldersTable rows={rows} />}
        />
        <F10Panel
          title="限售解禁"
          subtitle="Restricted-share unlocks"
          icon={<AlertTriangle className="w-4 h-4 text-signal-warn" />}
          data={restricted}
          renderRows={(rows) => <SimpleTable rows={rows.slice(0, 8)} priorityCols={["解禁日期", "解禁数量", "解禁市值"]} />}
        />
        <F10Panel
          title="股权质押"
          subtitle="Share-pledge ratio"
          icon={<ShieldAlert className="w-4 h-4 text-signal-warn" />}
          data={pledge}
          renderRows={(rows) => <SimpleTable rows={rows} priorityCols={["质押比例", "质押笔数", "质押股数", "占总股本比例"]} compact />}
        />
        <F10Panel
          title="卖方研报"
          subtitle="Sell-side research"
          icon={<FileText className="w-4 h-4" />}
          data={research}
          renderRows={(rows) => <ResearchList rows={rows.slice(0, 8)} />}
        />
      </div>

      <F10Panel
        title="公司公告"
        subtitle="Corporate filings"
        icon={<Newspaper className="w-4 h-4" />}
        data={notice}
        renderRows={(rows) => <NoticeList rows={rows.slice(0, 15)} />}
      />

      <p className="text-2xs text-ink-tertiary mt-8 leading-relaxed">
        <MessageCircle className="inline w-3 h-3 mr-1" />
        所有数据来自 akshare → 东方财富/CNINFO，缓存 1-15 分钟。F10 panels for
        non A-share tickers will show 'unavailable' — that's expected.
        本页所有数据仅供参考，不构成投资建议。
      </p>
    </div>
  );
}

function F10Panel({
  title,
  subtitle,
  icon,
  data,
  renderRows,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  data: RowsResponse | null;
  renderRows: (rows: RowsResponse["rows"]) => React.ReactNode;
}) {
  return (
    <section className="surface-elev p-5">
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-accent">{icon}</span>
        <h2 className="text-base font-semibold text-ink-primary">{title}</h2>
        <span className="text-2xs text-ink-tertiary uppercase tracking-wider ml-auto">
          {subtitle}
        </span>
      </div>
      {!data ? (
        <div className="flex items-center gap-2 text-2xs text-ink-tertiary">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> loading…
        </div>
      ) : data.status !== "ok" || data.rows.length === 0 ? (
        <div className="text-2xs text-ink-tertiary italic">
          数据暂时不可用 {data.message ? `(${data.message})` : ""}
        </div>
      ) : (
        renderRows(data.rows)
      )}
    </section>
  );
}

function HoldersTable({ rows }: { rows: RowsResponse["rows"] }) {
  // Heuristic column detection — akshare returns Chinese headers that
  // vary between main vs circulating shareholder functions.
  const sample = rows[0] || {};
  const cols = Object.keys(sample);
  const nameKey = cols.find((c) => /股东名称|姓名/.test(c)) || cols[1] || cols[0];
  const sharesKey = cols.find((c) => /持股数|股本数/.test(c));
  const pctKey = cols.find((c) => /持股比例|占总股本/.test(c));
  return (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full text-xs">
        <thead className="text-2xs text-ink-tertiary uppercase tracking-wider">
          <tr>
            <th className="text-left px-2 py-1 font-medium">#</th>
            <th className="text-left px-2 py-1 font-medium">股东名称</th>
            {sharesKey && <th className="text-right px-2 py-1 font-medium">持股数</th>}
            {pctKey && <th className="text-right px-2 py-1 font-medium">占比</th>}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 10).map((r, i) => (
            <tr key={i} className="border-t border-border-subtle">
              <td className="px-2 py-1.5 text-ink-tertiary font-mono">{i + 1}</td>
              <td className="px-2 py-1.5 text-ink-primary truncate max-w-[220px]" title={String(r[nameKey] || "")}>
                {String(r[nameKey] || "—")}
              </td>
              {sharesKey && (
                <td className="px-2 py-1.5 text-right font-mono text-ink-secondary">
                  {fmtBigNum(r[sharesKey])}
                </td>
              )}
              {pctKey && (
                <td className="px-2 py-1.5 text-right font-mono text-ink-secondary">
                  {fmtPct(r[pctKey])}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SimpleTable({
  rows,
  priorityCols,
  compact,
}: {
  rows: RowsResponse["rows"];
  priorityCols: string[];
  compact?: boolean;
}) {
  if (rows.length === 0) return null;
  const sample = rows[0] || {};
  const allCols = Object.keys(sample);
  // Render priority cols (if present) first, then a few extras.
  const visible: string[] = [];
  for (const c of priorityCols) {
    if (allCols.includes(c)) visible.push(c);
  }
  if (!compact) {
    for (const c of allCols) {
      if (!visible.includes(c) && visible.length < 5 && !/代码|股票代码/.test(c)) {
        visible.push(c);
      }
    }
  }
  if (visible.length === 0) visible.push(...allCols.slice(0, 4));

  return (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full text-xs">
        <thead className="text-2xs text-ink-tertiary uppercase tracking-wider">
          <tr>
            {visible.map((c) => (
              <th key={c} className="text-left px-2 py-1 font-medium whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border-subtle">
              {visible.map((c) => (
                <td key={c} className="px-2 py-1.5 text-ink-secondary text-xs">
                  {String(r[c] ?? "—").slice(0, 60)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResearchList({ rows }: { rows: RowsResponse["rows"] }) {
  const sample = rows[0] || {};
  const cols = Object.keys(sample);
  const titleKey = cols.find((c) => /报告名称|标题/.test(c)) || cols[0];
  const instKey = cols.find((c) => /机构|研究机构/.test(c));
  const ratingKey = cols.find((c) => /评级|预测/.test(c));
  const dateKey = cols.find((c) => /日期|时间/.test(c));
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="border-l-2 border-l-accent pl-3 py-1">
          <div className="text-sm text-ink-primary leading-snug">
            {String(r[titleKey] || "—")}
          </div>
          <div className="text-2xs text-ink-tertiary mt-1 flex gap-2 flex-wrap font-mono">
            {dateKey && <span>{String(r[dateKey] || "")}</span>}
            {instKey && <span>· {String(r[instKey] || "")}</span>}
            {ratingKey && (
              <span className="text-accent">{String(r[ratingKey] || "")}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function NoticeList({ rows }: { rows: RowsResponse["rows"] }) {
  const sample = rows[0] || {};
  const cols = Object.keys(sample);
  const titleKey = cols.find((c) => /公告标题|标题|名称/.test(c)) || cols[0];
  const dateKey = cols.find((c) => /公告日期|日期|时间/.test(c));
  const urlKey = cols.find((c) => /url|链接|网址/.test(c.toLowerCase()));
  return (
    <ul className="space-y-1.5 text-sm">
      {rows.map((r, i) => {
        const title = String(r[titleKey] || "—");
        const url = urlKey ? String(r[urlKey] || "") : "";
        const date = dateKey ? String(r[dateKey] || "") : "";
        return (
          <li
            key={i}
            className="flex items-baseline gap-3 border-b border-border-subtle pb-1.5 last:border-0"
          >
            <span className="text-2xs text-ink-tertiary font-mono w-20 shrink-0">
              {date.slice(0, 10)}
            </span>
            {url && url.startsWith("http") ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-ink-primary hover:text-accent text-sm leading-tight"
              >
                {title}
              </a>
            ) : (
              <span className="text-ink-primary text-sm leading-tight">{title}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function fmtPct(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!isFinite(n)) return String(v).slice(0, 12);
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function fmtFlow(n: number): string {
  if (!isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e8) return `${(n / 1e8).toFixed(2)} 亿`;
  if (abs >= 1e4) return `${(n / 1e4).toFixed(2)} 万`;
  return n.toFixed(0);
}

function fmtBigNum(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!isFinite(n)) return String(v).slice(0, 12);
  if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(2)} 亿`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e4).toFixed(2)} 万`;
  return n.toFixed(0);
}
