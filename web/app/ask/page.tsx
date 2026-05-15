"use client";

/**
 * /ask — natural-language research assistant (问财-style).
 *
 * User types a free-form question, backend extracts mentioned tickers,
 * pre-fetches live data (quote / fund-flow / sectors), runs an LLM
 * call, returns:
 *
 *   - free-form answer (rendered as markdown-light)
 *   - clickable ticker chips → /decision?ticker=XXX
 *   - "what to do next" CTA
 *   - cost + latency metadata (transparency 💪)
 *
 * Example questions (the curated examples below are 同花顺-问财 prompts):
 *   "茅台和五粮液选哪个"
 *   "今天涨停板都是什么板块"
 *   "AI 板块这周怎么样"
 *   "300750 最近的资金流向"
 *   "PE < 20 且 ROE > 15% 的 A 股"
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  Zap,
} from "lucide-react";
import { useT } from "../lib/i18n";
import { cn } from "../lib/cn";

const API_BASE = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

interface AskResponse {
  answer: string;
  tickers_to_research: string[];
  suggested_next: string;
  mentioned_tickers: string[];
  context_used: string[];
  cost_usd: number;
  latency_ms: number;
}

const EXAMPLES_ZH = [
  "茅台和五粮液选哪个？",
  "今天涨停板都是什么板块？",
  "AI 板块这周怎么样？",
  "300750 最近的资金流向",
  "美股科技七巨头里哪个最值得看？",
  "300666 的近期风险点",
];
const EXAMPLES_EN = [
  "Compare NVDA vs AMD — which has the better setup?",
  "What's the FOMC calendar look like this week?",
  "Why is 300750 moving today?",
  "Show me semis with PE < 30 + recent insider buying",
  "BTC vs ETH — which is the better risk/reward right now?",
  "What sectors are seeing inflow today?",
];

export default function AskPage() {
  const { t, locale } = useT();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const examples = locale === "zh" ? EXAMPLES_ZH : EXAMPLES_EN;

  // Hydrate from ?q=... so users can deep-link an example into the page.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) {
      setQuestion(q);
      // Auto-submit if non-empty
      submit(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(forceQuestion?: string) {
    const q = (forceQuestion ?? question).trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setResp(null);
    try {
      const r = await fetch(`${API_BASE}/v1/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, locale }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j: AskResponse = await r.json();
      setResp(j);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <header className="mb-8">
        <div className="kicker mb-2">
          <MessageCircle className="w-3.5 h-3.5" />{" "}
          {locale === "zh" ? "AI 投研问答" : "AI research Q&A"}
        </div>
        <h1 className="display text-3xl md:text-4xl text-ink-primary tracking-tighter">
          {locale === "zh" ? "用大白话问股票" : "Ask about any stock"}
        </h1>
        <p className="text-ink-secondary mt-3 max-w-2xl text-sm leading-relaxed">
          {locale === "zh"
            ? "类似同花顺问财——但每个推荐的股票都可一键进 7-agent 多空辩论。"
            : "Like 同花顺's 问财 — but every suggested ticker is one click from a 7-agent bull/bear debate."}
        </p>
      </header>

      {/* Input */}
      <div className="surface-elev p-4 mb-6">
        <div className="flex gap-2 flex-wrap">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={
              locale === "zh"
                ? "比如：茅台和五粮液选哪个？（Cmd+Enter 发送）"
                : "e.g. Compare NVDA vs AMD — which has the better setup? (Cmd+Enter to send)"
            }
            rows={2}
            className="flex-1 min-w-[260px] bg-bg-hover border border-border rounded px-3 py-2 text-sm text-ink-primary placeholder:text-ink-tertiary focus:border-accent outline-none resize-y"
          />
          <button
            onClick={() => submit()}
            disabled={loading || !question.trim()}
            className="btn-primary self-start"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {locale === "zh" ? "思考中…" : "Thinking…"}
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                {locale === "zh" ? "问" : "Ask"}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Example chips — show when there's no live answer */}
      {!resp && !loading && (
        <div className="mb-8">
          <div className="text-2xs uppercase tracking-wider text-ink-tertiary mb-2">
            {locale === "zh" ? "示例问题" : "Try one of these"}
          </div>
          <div className="flex gap-2 flex-wrap">
            {examples.map((ex) => (
              <button
                key={ex}
                onClick={() => {
                  setQuestion(ex);
                  submit(ex);
                }}
                className="surface px-3 py-1.5 text-sm text-ink-secondary hover:text-accent hover:border-accent/30 transition rounded"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="surface border-signal-sell/30 p-4 text-sm text-signal-sell mb-6">
          {error}
        </div>
      )}

      {/* Answer */}
      {resp && (
        <section className="space-y-5">
          <AnswerBody text={resp.answer} />

          {resp.tickers_to_research.length > 0 && (
            <div className="surface-elev p-5">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-accent" />
                <span className="text-sm font-semibold text-ink-primary">
                  {locale === "zh" ? "建议深入研究的股票" : "Worth deeper research"}
                </span>
                {resp.suggested_next && (
                  <span className="text-2xs text-ink-tertiary italic ml-auto truncate">
                    {resp.suggested_next}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {resp.tickers_to_research.map((t) => (
                  <TickerChip key={t} ticker={t} />
                ))}
              </div>
            </div>
          )}

          <Meta resp={resp} locale={locale} />
        </section>
      )}

      <p className="text-2xs text-ink-tertiary mt-10 leading-relaxed">
        <Sparkles className="inline w-3 h-3 mr-1" />
        {locale === "zh"
          ? "Q&A 用 MID tier LLM (~$0.001/次)。最终决策建议跑 /decision 7-agent 辩论。"
          : "Q&A uses the MID-tier LLM (~$0.001/call). For a real call, run /decision 7-agent debate."}
      </p>
    </div>
  );
}

function AnswerBody({ text }: { text: string }) {
  // Strip the trailing JSON block so we don't render raw code in the answer.
  const cleaned = text
    .replace(/```json[\s\S]*?```\s*$/i, "")
    .replace(/\{[^{}]*"tickers_to_research"[^{}]*\}\s*$/i, "")
    .trim();
  return (
    <div className="surface-elev p-5 border-l-2 border-l-accent">
      <pre className="whitespace-pre-wrap text-sm text-ink-primary font-sans leading-relaxed">
        {cleaned}
      </pre>
    </div>
  );
}

function TickerChip({ ticker }: { ticker: string }) {
  const isAShare = /^\d{6}$/.test(ticker);
  return (
    <Link
      href={isAShare ? `/stock/${ticker}` : `/decision?ticker=${ticker}`}
      className="px-3 py-1.5 rounded surface text-sm font-mono text-ink-primary hover:text-accent hover:border-accent/30 transition group"
    >
      {ticker}
      <ArrowRight className="w-3 h-3 ml-1 inline-block opacity-50 group-hover:opacity-100" />
    </Link>
  );
}

function Meta({ resp, locale }: { resp: AskResponse; locale: "en" | "zh" }) {
  return (
    <div className="text-2xs text-ink-tertiary font-mono flex gap-4 flex-wrap">
      <span>
        ⏱ {resp.latency_ms} ms
      </span>
      <span>
        ${resp.cost_usd.toFixed(5)}
      </span>
      {resp.mentioned_tickers.length > 0 && (
        <span>
          {locale === "zh" ? "提到" : "mentioned"}: {resp.mentioned_tickers.join(", ")}
        </span>
      )}
      {resp.context_used.length > 0 && (
        <span>
          {locale === "zh" ? "已注入" : "context"}: {resp.context_used.join(", ")}
        </span>
      )}
    </div>
  );
}
