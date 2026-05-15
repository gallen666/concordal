"use client";

/**
 * /calendar — 财经日历 (econ events + IPO timeline).
 *
 * akshare's calendar functions are notoriously inconsistent across
 * releases, so the backend tries several fn names and the frontend
 * just renders whichever columns came back. Grouping by date if a
 * date column is detected.
 */

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Loader2, Sparkles } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

interface Resp {
  status: string;
  rows: Array<Record<string, string | number | null>>;
  source_fn?: string;
  message?: string;
}

export default function CalendarPage() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/v1/cn/calendar?days=21`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ status: "unavailable", rows: [], message: "network" }));
  }, []);

  const grouped = useMemo(() => {
    if (!data?.rows) return [];
    const sample = data.rows[0] || {};
    const cols = Object.keys(sample);
    const dateKey = cols.find((c) => /日期|date|时间/i.test(c)) || cols[0];

    // Group rows by date string (yyyy-mm-dd)
    const buckets = new Map<string, typeof data.rows>();
    for (const r of data.rows) {
      const d = String(r[dateKey] ?? "").slice(0, 10) || "—";
      if (!buckets.has(d)) buckets.set(d, []);
      buckets.get(d)!.push(r);
    }
    return Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [data]);

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <header className="mb-6">
        <div className="kicker mb-2">
          <CalendarDays className="w-3.5 h-3.5" /> 财经日历 / Calendar
        </div>
        <h1 className="display text-3xl md:text-4xl text-ink-primary tracking-tighter">
          财经日历 · 未来 3 周
        </h1>
        <p className="text-ink-secondary mt-3 text-sm max-w-2xl leading-relaxed">
          CPI / PMI / FOMC / 央行公开市场操作 / IPO / 除权除息 / 财报截止日。
          akshare 上游 schema 会随版本变化，本页 schema-adaptive，把上游返回的列都列出来。
        </p>
      </header>

      {!data ? (
        <div className="surface-elev p-6 flex items-center gap-2 text-ink-tertiary text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : data.status !== "ok" || data.rows.length === 0 ? (
        <div className="surface p-4 text-xs text-ink-tertiary">
          数据暂时不可用 — {data.message || "akshare 上游未返回"}
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, rows]) => (
            <DayGroup key={date} date={date} rows={rows} />
          ))}
        </div>
      )}

      {data?.source_fn && (
        <p className="text-2xs text-ink-tertiary mt-6 font-mono">
          source: akshare/{data.source_fn}
        </p>
      )}
      <p className="text-2xs text-ink-tertiary mt-2 leading-relaxed">
        <Sparkles className="inline w-3 h-3 mr-1" />
        日历事件可作为下一次 /decision 的 catalyst 来源。
      </p>
    </div>
  );
}

function DayGroup({
  date,
  rows,
}: {
  date: string;
  rows: Array<Record<string, string | number | null>>;
}) {
  const sample = rows[0] || {};
  const cols = Object.keys(sample);
  // Hide the date column inside each group (the header already shows it)
  const showCols = cols
    .filter((c) => !/日期|date|时间/i.test(c))
    .slice(0, 5);
  return (
    <section className="surface-elev p-4">
      <div className="text-xs font-mono text-accent uppercase tracking-wider mb-3">
        {date}
      </div>
      <ul className="space-y-1.5">
        {rows.map((r, i) => (
          <li
            key={i}
            className="flex gap-3 text-sm border-b border-border-subtle pb-1.5 last:border-0 flex-wrap"
          >
            {showCols.map((c) => (
              <span key={c} className="text-ink-secondary">
                <span className="text-2xs text-ink-tertiary mr-1 uppercase tracking-wider">
                  {c}:
                </span>
                <span className="text-ink-primary">{String(r[c] ?? "—")}</span>
              </span>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
