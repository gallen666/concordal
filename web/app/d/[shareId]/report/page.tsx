"use client";

/**
 * /d/[shareId]/report — print-friendly decision report.
 *
 * Server-rendered HTML view of a shared decision. The layout is optimised
 * for `@media print` so users can "Save as PDF" from the browser and get
 * a clean A4 PDF with no chrome.
 *
 * Provides two download paths:
 *   - "Download Markdown" → /v1/decisions/share/{id}/report.md (raw .md)
 *   - "Print / Save PDF" → triggers window.print() — uses our print CSS
 *
 * No new heavyweight backend deps (no weasyprint, no headless Chrome) —
 * we lean on the browser's existing PDF rendering.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  Printer,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

interface SharePayload {
  share_id: string;
  result: any;       // DecisionTrace JSON
  mode: string;
  shared_at: number;
}

export default function ReportPage() {
  const params = useParams();
  const shareId = (params?.shareId as string) || "";
  const [data, setData] = useState<SharePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shareId) return;
    fetch(`${API_BASE}/v1/decisions/share/${shareId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [shareId]);

  if (loading) {
    return (
      <div className="report-shell text-center py-20 text-ink-tertiary font-mono">
        Loading report…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="report-shell py-20 max-w-2xl mx-auto text-center">
        <AlertCircle className="w-10 h-10 text-bear-ink mx-auto mb-4" />
        <h1 className="display text-2xl text-ink-primary mb-2">Report not found</h1>
        <p className="text-ink-secondary text-sm mb-6">
          Share-id <code className="text-gold">{shareId}</code> doesn&apos;t exist or has expired.
        </p>
        <Link href="/decision" className="btn-secondary text-sm">← New decision</Link>
      </div>
    );
  }

  const decision = data.result?.decision || {};
  const ticker = decision.ticker || data.result?.ticker || "?";
  const asof = decision.asof || data.result?.asof || "";
  const side = (decision.side || "HOLD").toUpperCase();
  const weight = decision.target_weight ?? 0;
  const conf = decision.confidence ?? 0;
  const rationale = decision.rationale || "";
  const riskNotes = decision.risk_notes || "";
  const flags: string[] = decision.flags || [];
  const reports = data.result?.analyst_reports || [];
  const rdebate = data.result?.researcher_debate;
  const rkdebate = data.result?.risk_debate;
  const traderPlan = data.result?.trader_plan;
  const managerReview = data.result?.manager_review;
  const usage = data.result?.usage || [];
  const totalCost = usage.reduce((s: number, u: any) => s + (Number(u.usd_cost) || 0), 0);

  const sideColor =
    side === "BUY" ? "text-signal-buy"
    : side === "SELL" ? "text-signal-sell"
    : "text-ink-secondary";
  const SideIcon = side === "BUY" ? TrendingUp : side === "SELL" ? TrendingDown : Minus;

  function downloadMd() {
    window.location.href = `${API_BASE}/v1/decisions/share/${shareId}/report.md`;
  }
  function printPage() {
    window.print();
  }

  return (
    <>
      {/* Print CSS — strip chrome, expand to full A4 */}
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
          .report-shell { max-width: none !important; padding: 0 !important; }
          .report-card { background: white !important; border: 1px solid #ccc !important; }
          h1, h2, h3, h4 { color: black !important; page-break-after: avoid; }
          .page-break { page-break-before: always; }
          .text-ink-primary, .text-ink-secondary, .text-ink-tertiary {
            color: #111 !important;
          }
        }
      `}</style>

      {/* Sticky toolbar — hidden in print */}
      <div className="no-print sticky top-0 z-30 border-b border-border-subtle bg-bg-base/85 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-6 h-12 flex items-center justify-between text-sm">
          <Link href={`/d/${shareId}`} className="inline-flex items-center text-ink-tertiary hover:text-gold">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to decision
          </Link>
          <div className="flex items-center gap-2">
            <button onClick={downloadMd} className="btn-secondary text-xs">
              <Download className="w-3.5 h-3.5" /> Markdown
            </button>
            <button onClick={printPage} className="btn-primary text-xs">
              <Printer className="w-3.5 h-3.5" /> Print / PDF
            </button>
          </div>
        </div>
      </div>

      <article className="report-shell max-w-4xl mx-auto px-6 py-10">

        {/* Title block */}
        <header className="mb-10 pb-8 border-b border-border-subtle">
          <div className="text-xs font-mono uppercase tracking-kicker text-ink-tertiary mb-3">
            Concordal · 决策报告 · {asof}
          </div>
          <div className="flex items-baseline gap-6 flex-wrap">
            <h1 className="display text-5xl md:text-6xl text-ink-primary tracking-tighter font-mono">
              {ticker}
            </h1>
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded ${sideColor}`}
                 style={{
                   background: side === "BUY" ? "rgba(63,185,80,0.10)"
                              : side === "SELL" ? "rgba(248,81,73,0.10)"
                              : "rgba(168,160,137,0.10)",
                 }}>
              <SideIcon className="w-5 h-5" />
              <span className="text-2xl font-mono font-semibold">{side}</span>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Kv label="目标仓位" value={`${(Number(weight) * 100).toFixed(2)}%`} />
            <Kv label="置信度"   value={`${(Number(conf) * 100).toFixed(0)}%`} />
            <Kv label="运行模式" value={data.mode || "—"} mono />
            <Kv label="生成时间" value={data.shared_at ? new Date(data.shared_at * 1000).toISOString().slice(0, 16).replace("T", " ") + "Z" : "—"} mono />
          </div>
          {flags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {flags.map((f) => (
                <span key={f} className="pill-amber">{f}</span>
              ))}
            </div>
          )}
        </header>

        {rationale && (
          <Section title="经理终审 · Manager rationale">
            <p className="whitespace-pre-line text-ink-primary leading-relaxed">{rationale}</p>
          </Section>
        )}

        {riskNotes && (
          <Section title="风险提示 · Risk notes" tone="warn">
            <p className="whitespace-pre-line text-bear-ink leading-relaxed">{riskNotes}</p>
          </Section>
        )}

        {reports.length > 0 && (
          <Section title="分析师报告 · Analyst reports">
            {reports.map((r: any, i: number) => (
              <div key={i} className="mb-6 last:mb-0">
                <h3 className="display text-xl text-gold mb-2">
                  {labelFor(r.analyst)}
                </h3>
                {r.body && (
                  <div className="whitespace-pre-line text-ink-primary leading-relaxed">
                    {r.body}
                  </div>
                )}
                {r.signals && Object.keys(r.signals).length > 0 && (
                  <pre className="mt-3 bg-bg-subtle border border-border-subtle rounded p-3 text-xs overflow-x-auto font-mono">
                    {JSON.stringify(r.signals, null, 2)}
                  </pre>
                )}
                {r.sources?.length > 0 && (
                  <div className="text-2xs font-mono text-ink-tertiary mt-2">
                    Sources: {r.sources.map((s: string) => <code key={s} className="mr-2">{s}</code>)}
                  </div>
                )}
              </div>
            ))}
          </Section>
        )}

        {rdebate?.turns?.length > 0 && (
          <Section title="多空辩论 · Bull / Bear debate">
            {rdebate.turns.map((t: any, i: number) => (
              <div key={i} className={`mb-4 last:mb-0 pl-4 border-l-2 ${t.speaker === "bull" ? "border-bull" : t.speaker === "bear" ? "border-bear" : "border-gold"}`}>
                <div className="text-2xs font-mono uppercase tracking-kicker text-ink-tertiary mb-1">
                  {t.speaker} · Round {t.round}
                </div>
                <div className="text-ink-primary whitespace-pre-line leading-relaxed">
                  {t.content}
                </div>
              </div>
            ))}
            {rdebate.synthesis && (
              <div className="mt-6 pt-4 border-t border-border-subtle">
                <div className="text-2xs font-mono uppercase tracking-kicker text-gold mb-2">Synthesis</div>
                <p className="text-ink-primary leading-relaxed whitespace-pre-line">{rdebate.synthesis}</p>
              </div>
            )}
          </Section>
        )}

        {rkdebate?.turns?.length > 0 && (
          <Section title="风控委员会 · Risk committee">
            {rkdebate.turns.map((t: any, i: number) => (
              <div key={i} className="mb-3 last:mb-0">
                <span className="text-2xs font-mono uppercase tracking-kicker text-gold mr-2">{t.speaker}</span>
                <span className="text-ink-primary whitespace-pre-line">{t.content}</span>
              </div>
            ))}
          </Section>
        )}

        {traderPlan && (
          <Section title="交易员组装方案 · Trader plan">
            <p className="whitespace-pre-line text-ink-primary leading-relaxed">{traderPlan}</p>
          </Section>
        )}

        {managerReview && managerReview.trim() !== rationale.trim() && (
          <Section title="基金经理终审 · Manager review">
            <p className="whitespace-pre-line text-ink-primary leading-relaxed">{managerReview}</p>
          </Section>
        )}

        {usage.length > 0 && (
          <Section title="LLM 调用 · Token usage">
            <div className="text-ink-primary mb-3">
              Total cost: <span className="font-mono text-gold">${totalCost.toFixed(4)}</span>
              {" "}across <span className="font-mono">{usage.length}</span> calls
            </div>
            <table className="w-full text-xs font-mono tabular">
              <thead>
                <tr className="border-b border-border-subtle text-ink-tertiary">
                  <th className="text-left py-2">Model</th>
                  <th className="text-right py-2">Input</th>
                  <th className="text-right py-2">Output</th>
                  <th className="text-right py-2">USD</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((u: any, i: number) => (
                  <tr key={i} className="border-b border-border-subtle last:border-b-0 text-ink-primary">
                    <td className="py-2">{u.model || "?"}</td>
                    <td className="text-right">{u.input_tokens || 0}</td>
                    <td className="text-right">{u.output_tokens || 0}</td>
                    <td className="text-right">${(Number(u.usd_cost) || 0).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {/* Footer disclaimer */}
        <footer className="mt-12 pt-8 border-t border-bear/40">
          <p className="text-bear-ink text-sm">
            ⚠ <strong>投资有风险，入市需谨慎。</strong> 本报告为 AI 决策支持，不构成投资建议。
            历史模式不预示未来表现。LLM 输出可能含错误；执行前请独立判断。
          </p>
          <p className="text-2xs font-mono text-ink-tertiary mt-3">
            Generated by Concordal · trading-agents-platform.vercel.app · share-id <code>{shareId}</code>
          </p>
        </footer>
      </article>
    </>
  );
}

function Section({ title, children, tone }: { title: string; children: React.ReactNode; tone?: "warn" }) {
  return (
    <section className={`report-card mb-8 pb-8 border-b border-border-subtle ${tone === "warn" ? "border-l-2 border-l-bear pl-4" : ""}`}>
      <h2 className="display text-2xl text-ink-primary tracking-tighter mb-4">{title}</h2>
      {children}
    </section>
  );
}

function Kv({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-2xs font-mono uppercase tracking-kicker text-ink-tertiary">{label}</div>
      <div className={`mt-1 text-ink-primary ${mono ? "font-mono text-sm" : "font-display text-lg"}`}>{value}</div>
    </div>
  );
}

function labelFor(analyst: string): string {
  return ({
    fundamentals: "基本面 · Fundamentals",
    sentiment:    "情绪 · Sentiment",
    news:         "新闻 · News",
    technical:    "技术面 · Technical",
    macro:        "宏观 · Macro",
  } as Record<string, string>)[analyst] || analyst;
}
