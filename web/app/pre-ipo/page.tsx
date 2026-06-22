"use client";

/**
 * /pre-ipo — Private Market Observatory (v85).
 *
 * Concordal 的 Type 4 兼容延伸：私募独角兽估值跟踪 + 7-agent 决策意见 +
 * 每周一份原始资料导读。**仅研究意见，不撮合任何交易、不代持资产、
 * 不参与任何 SPV / 代币发行** — 这四条声明既是给 SFC 看的，也是
 * 跟 Jarsy / Forge / EquityZen 这类做 marketplace 的玩家区分定位。
 *
 * 起步覆盖 6 家：OpenAI / Anthropic / SpaceX / xAI / Anduril / Stripe，
 * 横跨 AI / 国防 / 航天 / 金融科技四个赛道。估值数字来自公开报道
 * (Forbes / Reuters / Crunchbase tenders / SEC EDGAR S-1, as of 2026-06)。
 *
 * v85: 静态硬编码 + mock 决策。v86 接 /v1/pre-ipo/companies endpoint，
 * v87 让 7-agent pipeline 跑这些 ticker。
 */

import Link from "next/link";
import {
  Eye, AlertTriangle, ScrollText, Mail, Lock, ArrowRight,
  TrendingUp, TrendingDown, Minus, Sparkles, ExternalLink,
} from "lucide-react";
import { useT } from "../lib/i18n";

type Stance = "overweight" | "neutral" | "underweight" | "watch";

type Company = {
  ticker: string;        // ALL CAPS, 内部 ID
  name_en: string;
  name_zh: string;
  sector_en: string;
  sector_zh: string;
  valuation_usd_b: number;     // 估值（10 亿 USD）
  round_label_en: string;
  round_label_zh: string;
  yoy_change_pct: number;      // 同比变化，正数=涨
  stance: Stance;
  one_liner_en: string;
  one_liner_zh: string;
};

// 估值数据为公开报道整理 (Forbes / Reuters / Crunchbase / SEC EDGAR, ~2026-06)。
// 数字会过时 — 上线后由 /v1/pre-ipo/companies 每日刷新。
const COMPANIES: Company[] = [
  {
    ticker: "OPENAI",
    name_en: "OpenAI",
    name_zh: "OpenAI",
    sector_en: "AI · Foundation models",
    sector_zh: "AI · 基础模型",
    valuation_usd_b: 500,
    round_label_en: "2025 H2 tender",
    round_label_zh: "2025 下半年员工 tender",
    yoy_change_pct: 67,
    stance: "underweight",
    one_liner_en: "Valuation outpacing ARR · multiple compression risk if hyperscaler capex cools.",
    one_liner_zh: "估值跑赢 ARR · 若云厂商 capex 见顶则面临 multiple 压缩。",
  },
  {
    ticker: "ANTHROPIC",
    name_en: "Anthropic",
    name_zh: "Anthropic",
    sector_en: "AI · Foundation models",
    sector_zh: "AI · 基础模型",
    valuation_usd_b: 183,
    round_label_en: "2025 Q3 funding",
    round_label_zh: "2025 第三季度融资",
    yoy_change_pct: 200,
    stance: "overweight",
    one_liner_en: "Enterprise revenue compounding fastest in cohort · API gross margin best-in-class.",
    one_liner_zh: "企业端收入复合增长最快 · API 毛利在同业第一档。",
  },
  {
    ticker: "SPACEX",
    name_en: "SpaceX",
    name_zh: "SpaceX",
    sector_en: "Space · Launch + Starlink",
    sector_zh: "航天 · 发射 + 星链",
    valuation_usd_b: 350,
    round_label_en: "2024 tender",
    round_label_zh: "2024 员工 tender",
    yoy_change_pct: 17,
    stance: "neutral",
    one_liner_en: "Starlink scaling but Starship cadence still drives the multi-bagger thesis.",
    one_liner_zh: "星链规模化，但 Starship 节奏仍是数倍涨幅论的核心变量。",
  },
  {
    ticker: "XAI",
    name_en: "xAI",
    name_zh: "xAI",
    sector_en: "AI · Foundation models",
    sector_zh: "AI · 基础模型",
    valuation_usd_b: 50,
    round_label_en: "2024 Q4 funding",
    round_label_zh: "2024 第四季度融资",
    yoy_change_pct: 92,
    stance: "watch",
    one_liner_en: "Compute-rich, distribution-light · X integration is the make-or-break wedge.",
    one_liner_zh: "算力充沛、分发短板 · X 平台整合是成败分水岭。",
  },
  {
    ticker: "ANDURIL",
    name_en: "Anduril",
    name_zh: "Anduril",
    sector_en: "Defense · Autonomous systems",
    sector_zh: "国防 · 自主作战系统",
    valuation_usd_b: 14,
    round_label_en: "2024 Q3 funding",
    round_label_zh: "2024 第三季度融资",
    yoy_change_pct: 100,
    stance: "neutral",
    one_liner_en: "Contract pipeline strong · concentration risk in DoD budget cycles.",
    one_liner_zh: "合同管道充裕 · 高度依赖美国国防预算周期。",
  },
  {
    ticker: "STRIPE",
    name_en: "Stripe",
    name_zh: "Stripe",
    sector_en: "Fintech · Payments infrastructure",
    sector_zh: "金融科技 · 支付基础设施",
    valuation_usd_b: 91,
    round_label_en: "2024 tender",
    round_label_zh: "2024 员工 tender",
    yoy_change_pct: -14,
    stance: "neutral",
    one_liner_en: "Take-rate compression offset by volume · IPO timing remains the catalyst.",
    one_liner_zh: "费率压缩被交易量增长抵消 · IPO 时机仍是关键催化剂。",
  },
];

function stanceBadge(s: Stance, zh: boolean) {
  const map: Record<Stance, { label_en: string; label_zh: string; cls: string; icon: JSX.Element }> = {
    overweight:  { label_en: "Overweight",  label_zh: "增持", cls: "bg-signal-buy/15 text-signal-buy border-signal-buy/30",       icon: <TrendingUp className="w-3 h-3" /> },
    neutral:     { label_en: "Neutral",     label_zh: "中性", cls: "bg-bg-hover text-ink-secondary border-border-subtle",          icon: <Minus className="w-3 h-3" /> },
    underweight: { label_en: "Underweight", label_zh: "减持", cls: "bg-signal-sell/15 text-signal-sell border-signal-sell/30",     icon: <TrendingDown className="w-3 h-3" /> },
    watch:       { label_en: "Watch",       label_zh: "观望", cls: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",         icon: <Eye className="w-3 h-3" /> },
  };
  const c = map[s];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-mono uppercase tracking-wider border ${c.cls}`}>
      {c.icon} {zh ? c.label_zh : c.label_en}
    </span>
  );
}

export default function PreIPOPage() {
  const { locale } = useT();
  const zh = locale === "zh";

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-12">
      {/* ─── Hero ─── */}
      <header className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 text-2xs font-mono uppercase tracking-wider px-2.5 py-1 rounded bg-yellow-500/10 text-yellow-600 border border-yellow-500/30">
            <Lock className="w-3 h-3" /> {zh ? "牌照申请筹备中 · HK SFC Type 4" : "License application in progress · HK SFC Type 4"}
          </span>
          <span className="inline-flex items-center gap-1.5 text-2xs font-mono uppercase tracking-wider px-2.5 py-1 rounded bg-accent/10 text-accent border border-accent/30">
            <ScrollText className="w-3 h-3" /> {zh ? "仅研究 · 不撮合任何交易" : "Research only · No trade matching"}
          </span>
        </div>
        <h1 className="display text-4xl md:text-5xl text-ink-primary tracking-tighter leading-tight">
          {zh ? "私募市场观察站" : "The Private Market Observatory"}
        </h1>
        <p className="text-ink-secondary text-lg max-w-2xl leading-relaxed">
          {zh
            ? "把过去只对 Tiger Global、Coatue、Sequoia 这些机构开放的独角兽估值看板，配上 Concordal 的 7-agent 辩证决策。订阅一份每周原始资料导读，研究你买不到、但能影响判断的那部分市场。"
            : "The unicorn valuation dashboard that used to live only inside Tiger Global, Coatue, and Sequoia — paired with Concordal's 7-agent dialectic. Subscribe to one weekly raw-source brief and study the slice of the market you can't buy yet but should still understand."}
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="#brief" className="btn-primary">
            {zh ? "看本周 brief" : "Read this week's brief"} <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="#sample" className="btn-secondary">
            {zh ? "跑一次 7-agent" : "Run the 7-agent"}
          </Link>
        </div>
      </header>

      {/* ─── Section 2: Companies grid ─── */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="label-cap">{zh ? "六家覆盖" : "Six covered"}</div>
            <h2 className="display text-2xl mt-1">
              {zh ? "估值 · 上一轮 · 同比 · 当前权重" : "Valuation · Last round · YoY · Current weighting"}
            </h2>
          </div>
          <div className="text-2xs font-mono uppercase tracking-wider text-ink-tertiary">
            asof 2026-06
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {COMPANIES.map((c) => (
            <div key={c.ticker} className="surface p-4 space-y-2.5 hover:border-accent/40 transition-colors">
              <div className="flex items-baseline justify-between">
                <div className="font-mono text-xs uppercase tracking-wider text-ink-tertiary">{c.ticker}</div>
                {stanceBadge(c.stance, zh)}
              </div>
              <div className="font-mono text-2xl tabular-nums text-ink-primary">${c.valuation_usd_b}B</div>
              <div className="text-2xs font-mono uppercase tracking-wider text-ink-tertiary">
                {zh ? c.sector_zh : c.sector_en}
              </div>
              <div className="text-xs text-ink-secondary leading-relaxed pt-1 border-t border-border-subtle/40">
                {zh ? c.one_liner_zh : c.one_liner_en}
              </div>
              <div className="flex items-center justify-between text-2xs font-mono text-ink-tertiary">
                <span>{zh ? c.round_label_zh : c.round_label_en}</span>
                <span className={c.yoy_change_pct >= 0 ? "text-signal-buy" : "text-signal-sell"}>
                  {c.yoy_change_pct >= 0 ? "↑" : "↓"} {Math.abs(c.yoy_change_pct)}% YoY
                </span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-2xs font-mono uppercase tracking-wider text-ink-tertiary pt-2">
          {zh
            ? "数据源 · Crunchbase tenders + SEC EDGAR S-1 + Forbes/Reuters 公开报道 + Perplexity Sonar 实时新闻 · 每日 04:00 UTC 刷新"
            : "Sources · Crunchbase tenders + SEC EDGAR S-1 + Forbes/Reuters public reporting + Perplexity Sonar realtime · refresh daily 04:00 UTC"}
        </p>
      </section>

      {/* ─── Section 3: 7-agent sample ─── */}
      <section id="sample" className="space-y-4">
        <div>
          <div className="label-cap">{zh ? "样本辩论" : "Sample dialectic"}</div>
          <h2 className="display text-2xl mt-1">
            {zh ? "7-agent · OPENAI @ $500B" : "7-agent · OPENAI @ $500B"}
          </h2>
        </div>
        <div className="surface-elev p-5 space-y-4">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <div>
              <div className="font-mono text-2xs uppercase tracking-wider text-ink-tertiary">
                OPENAI · {zh ? "假设可在 $500B 估值买入" : "Hypothetical: buy at $500B valuation"}
              </div>
              <div className="text-xl font-semibold mt-1 text-signal-sell">
                {zh ? "UNDERWEIGHT · 目标权重 −0.05" : "UNDERWEIGHT · target weight −0.05"}
              </div>
            </div>
            <div className="font-mono text-2xs text-ink-tertiary">v85 · {zh ? "样本" : "sample"} · 2026-06</div>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="surface p-3 text-sm">
              <div className="label-cap text-signal-buy">{zh ? "多头" : "Bull"}</div>
              <p className="text-ink-secondary mt-2 leading-relaxed">
                {zh
                  ? "ChatGPT 月活仍领先 + 企业 API 收入 ~$12B ARR · 距 $500B 估值隐含的 $40B 仍有想象空间 · CapEx 优势短期不易追赶。"
                  : "ChatGPT MAU still leads · Enterprise API ARR ~$12B has room to grow toward the ~$40B implied by the $500B mark · CapEx moat hard to challenge near-term."}
              </p>
            </div>
            <div className="surface p-3 text-sm">
              <div className="label-cap text-signal-sell">{zh ? "空头" : "Bear"}</div>
              <p className="text-ink-secondary mt-2 leading-relaxed">
                {zh
                  ? "Anthropic 2025 增长率 ~200% YoY 显著高于 OpenAI · 估值/ARR 倍数对比下 OpenAI 已贵 30%+ · 治理结构遗留风险尚未充分定价。"
                  : "Anthropic's ~200% YoY growth materially outpaces OpenAI · OpenAI's valuation/ARR multiple now ~30% richer · governance overhang still under-priced."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border-subtle/40">
            {[
              { k: "fundamentals", zh: "基本面", en: "Fundamentals" },
              { k: "sentiment",    zh: "情绪",   en: "Sentiment" },
              { k: "news",         zh: "新闻 · Sonar 实时", en: "News · Sonar realtime" },
              { k: "technical",    zh: "技术面 N/A",       en: "Technical N/A" },
              { k: "macro",        zh: "宏观",   en: "Macro" },
              { k: "debate",       zh: "多空辩论", en: "Bull/Bear debate" },
              { k: "manager",      zh: "Manager 仲裁", en: "Manager arbitration" },
            ].map((c) => (
              <span key={c.k} className="text-2xs font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-bg-hover text-ink-secondary">
                {zh ? c.zh : c.en}
              </span>
            ))}
          </div>
          <div className="text-2xs font-mono text-ink-tertiary">
            {zh
              ? "每个 agent 引用的原始资料 + token 成本可在决策追溯页查阅 · v87 起 7-agent pipeline 真实跑此 ticker"
              : "Per-agent source citations + token costs viewable in trace · v87 will wire the live pipeline to this ticker"}
          </div>
        </div>
      </section>

      {/* ─── Section 4: Weekly brief ─── */}
      <section id="brief" className="space-y-4">
        <div>
          <div className="label-cap">{zh ? "每周 09:00 HK · 一封信" : "Every Monday 09:00 HK · one letter"}</div>
          <h2 className="display text-2xl mt-1">
            {zh ? "Pre-IPO Brief · 3000 字, 5 分钟读完" : "Pre-IPO Brief · 3000 words, 5-minute read"}
          </h2>
        </div>
        <div className="surface-elev p-5 grid md:grid-cols-[1fr_auto] gap-5 items-center">
          <div className="space-y-3">
            <div className="grid sm:grid-cols-3 gap-2">
              {[
                { zh: "本周估值变化", en: "Weekly valuation moves" },
                { zh: "新一轮融资跟踪", en: "New funding rounds" },
                { zh: "上周决策 · 复盘", en: "Last week · review" },
              ].map((b) => (
                <div key={b.en} className="surface p-3 text-xs">
                  <div className="font-mono text-2xs uppercase tracking-wider text-ink-tertiary mb-1">
                    {zh ? "板块" : "Block"}
                  </div>
                  <div className="text-ink-primary">{zh ? b.zh : b.en}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 text-2xs font-mono uppercase tracking-wider text-ink-tertiary">
              <span>PDF</span><span>·</span><span>{zh ? "网页" : "Web"}</span><span>·</span><span>{zh ? "邮件" : "Email"}</span>
            </div>
          </div>
          <div className="text-center md:text-right space-y-2 md:min-w-[180px]">
            <div className="font-mono text-3xl tabular-nums">¥99<span className="text-base text-ink-tertiary">/{zh ? "月" : "mo"}</span></div>
            <Link href="/pricing" className="btn-primary inline-flex">
              {zh ? "订阅 Pro" : "Subscribe Pro"} <ArrowRight className="w-4 h-4" />
            </Link>
            <div className="text-2xs font-mono text-ink-tertiary">
              <Mail className="w-3 h-3 inline-block" /> {zh ? "免费看上一期" : "Free last issue"}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Section 5: Tier callout (lives inside existing 4-tier pricing) ─── */}
      <section className="space-y-4">
        <div>
          <div className="label-cap">{zh ? "套餐内嵌" : "Lives inside existing tiers"}</div>
          <h2 className="display text-2xl mt-1">
            {zh ? "现有 4 档订阅自动开通此板块" : "Auto-unlocked in current 4 tiers"}
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { name: "Free",          zh: "1 家 · 最近 4 周决策",       en: "1 company · last 4 weeks" },
            { name: "Pro ¥99",        zh: "6 家全开 + Brief 周报",      en: "All 6 + weekly Brief" },
            { name: "Pro+ ¥899",      zh: "+ Sonar 原文 + API",         en: "+ Sonar citations + API", featured: true },
            { name: "Institutional ¥4,999", zh: "+ 私有 prompt + audit DB", en: "+ custom prompts + audit DB" },
          ].map((t) => (
            <div
              key={t.name}
              className={`p-4 rounded surface ${t.featured ? "border-accent/60 border-2" : ""}`}
            >
              <div className="font-semibold text-sm">{t.name}</div>
              <div className="text-xs text-ink-secondary mt-2 leading-relaxed">
                {zh ? t.zh : t.en}
              </div>
              {t.featured && (
                <div className="text-2xs font-mono uppercase tracking-wider text-accent mt-2">
                  {zh ? "推荐" : "Recommended"}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ─── Section 6: Compliance footer (always visible) ─── */}
      <section className="border-t border-border-subtle pt-6">
        <div className="surface p-4 space-y-2 border-yellow-500/30">
          <div className="label-cap flex items-center gap-1.5 text-yellow-600">
            <AlertTriangle className="w-3.5 h-3.5" />
            {zh ? "合规边界 · 请逐条阅读" : "Compliance perimeter · read carefully"}
          </div>
          <ul className="text-xs text-ink-secondary leading-relaxed space-y-1 list-disc list-inside">
            <li>{zh ? "本页内容为研究意见，不构成买卖证券的要约或推荐。" : "Content on this page is research opinion, not a solicitation or recommendation to buy or sell securities."}</li>
            <li>{zh ? "Concordal 不撮合任何交易、不代客户持有资产。" : "Concordal does not match trades and does not custody client assets."}</li>
            <li>{zh ? "Concordal 不参与任何 SPV、token、代币化产品的发行或销售。" : "Concordal does not issue or sell any SPV, token, or tokenised product."}</li>
            <li>{zh ? "私募公司估值波动剧烈、流动性极差。研究内容仅供合格读者参考。" : "Private company valuations are volatile and illiquid. Research is for sophisticated readers only."}</li>
          </ul>
          <div className="text-2xs font-mono text-ink-tertiary pt-2 border-t border-border-subtle/40">
            <ExternalLink className="w-3 h-3 inline-block" />{" "}
            <Link href="/compliance" className="text-accent hover:underline">
              {zh ? "看完整合规披露" : "Full compliance disclosure"}
            </Link>
            {" · "}
            <Link href="/why" className="text-accent hover:underline">
              {zh ? "为什么 Concordal 不做撮合" : "Why Concordal doesn't broker trades"}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
