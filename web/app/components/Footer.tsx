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

  // ICP 备案号 — show only when set via env. Empty string by default so
  // we don't fake it. Reads from NEXT_PUBLIC_ICP_BEIAN (set on Vercel
  // once the operator has the actual beian number from MIIT).
  const icpBeian = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_ICP_BEIAN) || "";

  const cols: { heading: string; links: { href: string; label: string }[] }[] = [
    {
      heading: locale === "zh" ? "产品" : "Product",
      links: [
        { href: "/decision?ticker=AAPL", label: locale === "zh" ? "运行一次决策" : "Run a decision" },
        { href: "/track-record",         label: locale === "zh" ? "回测战绩" : "Track record" },
        { href: "/me/paper-trades",      label: locale === "zh" ? "模拟盘 (Alpaca)" : "Paper trades" },
        { href: "/cn-markets",           label: locale === "zh" ? "北向资金 / 龙虎榜" : "A-share flows" },
        { href: "/pricing",              label: locale === "zh" ? "定价" : "Pricing" },
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
        // v53: /compliance 头条放在 Trust 列, 因为它是 SFC Type 4 + audit
        // log + 数据政策的 single source of truth, 优先级高于 Terms.
        { href: "/compliance",  label: locale === "zh" ? "合规透明" : "Compliance" },
        { href: "/terms",       label: locale === "zh" ? "服务条款" : "Terms" },
        { href: "/privacy",     label: locale === "zh" ? "隐私" : "Privacy" },
        { href: "/disclaimer",  label: locale === "zh" ? "免责声明" : "Disclaimer" },
      ],
    },
    {
      heading: locale === "zh" ? "联系" : "Connect",
      links: [
        { href: "https://github.com/gallen666/concordal", label: "GitHub" },
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
            <div className="flex items-baseline gap-2">
              {/* dialectic mark */}
              <svg width="20" height="20" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                <path d="M14 4 A10 10 0 0 0 14 24 Z" fill="#5A8A6F" />
                <path d="M14 4 A10 10 0 0 1 14 24 Z" fill="#A0524A" />
                <rect x="13" y="3" width="2" height="22" fill="#C9A961" />
              </svg>
              <span className="font-display text-lg text-ink-primary">Concordal</span>
              {/* v47: 中文双名 "协奏" (Concord) per brand strategy doc */}
              <span className="font-display text-base text-gold">协奏</span>
            </div>
            <p className="text-sm text-ink-tertiary mt-3 leading-relaxed max-w-sm">
              {locale === "zh"
                ? "把「该买还是该卖」交给一个会自我辩论的 AI 研究台。"
                : "An AI research desk that argues with itself before telling you to buy or sell."}
            </p>
            {/* v47: Regulatory transparency badge — SFC Type 4 application status.
                Standard practice for HK fintech: state license posture clearly. */}
            <div className="mt-4 inline-flex items-center gap-1.5 text-2xs font-mono tracking-wider uppercase text-gold/80 border border-gold/20 bg-gold-soft/30 rounded px-2 py-1">
              <span className="status-dot bg-gold animate-pulse-slow" />
              {locale === "zh"
                ? "SFC Type 4 申请筹备中 · 香港注册中"
                : "SFC Type 4 in preparation · HK incorporation"}
            </div>
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

        {/* Risk banner — full-width, prominent. Regulatory norm in CN. */}
        <div className="border border-bear/40 bg-bear-soft/40 rounded p-3 mb-5 flex items-start gap-3">
          <span className="text-bear-ink font-mono text-sm mt-0.5">⚠</span>
          <p className="text-sm text-bear-ink/90 leading-relaxed">
            {riskLine}
          </p>
        </div>

        {/* Compact version stamp + ICP */}
        <div className="border-t border-border-subtle pt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-2xs font-mono uppercase tracking-wider text-ink-tertiary">
            <span>v0.1.0</span>
            <span>{locale === "zh" ? "封闭测试" : "Closed beta"}</span>
            <a
              href="https://github.com/gallen666/concordal"
              className="hover:text-ink-primary inline-flex items-center gap-1"
              target="_blank" rel="noopener noreferrer"
            >
              <Github className="w-3 h-3" />
              MIT
            </a>
            {icpBeian && (
              <a
                href="https://beian.miit.gov.cn/"
                target="_blank" rel="noopener noreferrer"
                className="hover:text-ink-primary"
              >
                {icpBeian}
              </a>
            )}
          </div>
          <span className="text-2xs font-mono text-ink-tertiary tracking-wider uppercase">
            {/* v47: Pre-HK-OpCo copyright. After Vistra registers Concordal (HK) Ltd,
                change to "© 2026 TradingAgents (HK) Ltd. · EST. Hong Kong". */}
            © 2026 Concordal · 协奏 Concord · Est. Hong Kong
          </span>
        </div>
      </div>
    </footer>
  );
}
