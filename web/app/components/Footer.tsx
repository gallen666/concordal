"use client";

import Link from "next/link";
import { Github, Twitter } from "lucide-react";
import { useT } from "../lib/i18n";

/**
 * Footer — editorial masthead.
 *
 * Three rows:
 *   1. Brand line + tagline + small dialectic mark.
 *   2. 4-column link grid (Product / Methodology / Trust / Connect).
 *   3. Disclaimer + version stamp.
 */
export default function Footer() {
  const { locale } = useT();

  // Chinese regulatory norm — always-visible risk warning.
  const riskLine = locale === "zh"
    ? "投资有风险，入市需谨慎。本服务为决策支持工具，不构成投资建议。"
    : "Investing carries risk. This service is a decision-support tool, not investment advice.";

  const cols: { heading: string; links: { href: string; label: string }[] }[] = [
    {
      heading: locale === "zh" ? "产品" : "Product",
      links: [
        { href: "/decision?ticker=AAPL", label: locale === "zh" ? "运行一次决策" : "Run a decision" },
        { href: "/track-record",         label: locale === "zh" ? "回测战绩" : "Track record" },
        { href: "/pricing",              label: locale === "zh" ? "定价" : "Pricing" },
        { href: "/developers",           label: locale === "zh" ? "开发者 API" : "Developer API" },
      ],
    },
    {
      heading: locale === "zh" ? "方法论" : "Methodology",
      links: [
        { href: "/how-it-works", label: locale === "zh" ? "工作原理" : "How it works" },
        { href: "/proof",        label: locale === "zh" ? "证据" : "Evidence" },
        { href: "/ecosystem",    label: locale === "zh" ? "生态" : "Ecosystem" },
        { href: "/blog",         label: "Blog" },
      ],
    },
    {
      heading: locale === "zh" ? "信任" : "Trust",
      links: [
        { href: "/terms",       label: locale === "zh" ? "服务条款" : "Terms" },
        { href: "/privacy",     label: locale === "zh" ? "隐私" : "Privacy" },
        { href: "/disclaimer",  label: locale === "zh" ? "免责声明" : "Disclaimer" },
      ],
    },
    {
      heading: locale === "zh" ? "联系" : "Connect",
      links: [
        { href: "https://github.com/gallen666/trading-agents-platform", label: "GitHub" },
        { href: "/sponsor", label: locale === "zh" ? "支持我们" : "Sponsor" },
        { href: "/me/referral", label: locale === "zh" ? "邀请朋友" : "Refer a friend" },
      ],
    },
  ];

  return (
    <footer className="mt-auto border-t border-border-subtle bg-bg-subtle/40">
      <div className="max-w-6xl mx-auto px-6 py-14">

        {/* Top row — brand */}
        <div className="grid md:grid-cols-[1.5fr_2fr] gap-10 mb-12">
          <div>
            <div className="flex items-center gap-2">
              {/* dialectic mark */}
              <svg width="20" height="20" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                <path d="M14 4 A10 10 0 0 0 14 24 Z" fill="#5A8A6F" />
                <path d="M14 4 A10 10 0 0 1 14 24 Z" fill="#A0524A" />
                <rect x="13" y="3" width="2" height="22" fill="#C9A961" />
              </svg>
              <span className="font-display text-lg text-ink-primary">TradingAgents</span>
            </div>
            <p className="text-sm text-ink-tertiary mt-3 leading-relaxed max-w-sm">
              {locale === "zh"
                ? "把「该买还是该卖」交给一个会自我辩论的 AI 研究台。"
                : "An AI research desk that argues with itself before telling you to buy or sell."}
            </p>
          </div>

          {/* Right grid — links */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {cols.map((c) => (
              <div key={c.heading}>
                <div className="label-cap mb-3">{c.heading}</div>
                <ul className="space-y-2">
                  {c.links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        className="text-sm text-ink-secondary hover:text-ink-primary transition-colors"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Risk line — Chinese regulatory norm, always visible */}
        <div className="border-t border-border-subtle pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-2xs font-mono uppercase tracking-wider text-bear-ink/80 leading-relaxed">
            ⚠ {riskLine}
          </p>
          <div className="flex items-center gap-4 text-2xs font-mono uppercase tracking-wider text-ink-tertiary shrink-0">
            <span>v0.1.0</span>
            <span>{locale === "zh" ? "封闭测试" : "Closed beta"}</span>
            <a
              href="https://github.com/gallen666/trading-agents-platform"
              className="hover:text-ink-primary inline-flex items-center gap-1"
              target="_blank" rel="noopener noreferrer"
            >
              <Github className="w-3 h-3" />
              MIT
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
