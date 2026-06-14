"use client";

/**
 * /why — Why Concordal: the competitive-positioning page (v76).
 *
 * Crystallises the three-word narrative — 辩证 / 可审 / 反幻觉 — into a
 * single shareable page. Every downstream surface (landing hero, pricing
 * strip, decision trust bar, sales deck, SEO articles) hammers the same
 * frame from here.
 *
 * Comparison matrix below benchmarks against 东方财富妙想 (the real China
 * retail incumbent), Public.com AI Agents (the US retail parallel), the
 * Bloomberg Terminal + ASKB agentic interface (institutional), and the
 * upstream TauricResearch/TradingAgents OSS framework (academic). All
 * competitor claims are based on public web research as of 2026-06.
 *
 * Sources noted at the bottom of the page so visitors can verify every
 * comparison-table cell themselves — this page invites scrutiny.
 */

import Link from "next/link";
import {
  Scale, ShieldCheck, ShieldAlert, ArrowRight, ExternalLink,
  Check, X, Minus, Sparkles,
} from "lucide-react";
import { useT } from "../lib/i18n";

export default function WhyPage() {
  const { locale } = useT();
  const zh = locale === "zh";
  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-16">
      {/* ─── Hero ─── */}
      <header className="text-center space-y-6 pt-6">
        <div className="kicker justify-center">
          <Sparkles className="w-3.5 h-3.5" /> {zh ? "为什么 Concordal" : "Why Concordal"}
        </div>
        <h1 className="display text-4xl md:text-5xl text-ink-primary tracking-tighter leading-tight max-w-3xl mx-auto">
          {zh
            ? "AI 投顾不缺数据 — 缺的是辩证、可审、反幻觉。"
            : "AI advisors don't lack data. They lack debate, auditability, and a hallucination gate."}
        </h1>
        <p className="text-ink-secondary text-lg max-w-2xl mx-auto leading-relaxed">
          {zh
            ? "东方财富给你行情、Bloomberg 给你数据、Public 给你自动执行。但每一家 AI 都是黑盒 — 它说买，你不知道为什么、不知道它是否在编、不知道它过没过风控。我们的三条护城河，每一条都是直接对应一类对手没做到的事。"
            : "Eastmoney gives you quotes, Bloomberg gives you data, Public gives you automated execution. Every one of them is a black box — when it says BUY, you don't know why, you can't tell if it's hallucinating, you can't audit if risk-control fired. The three pillars below each address something one of those competitors is structurally missing."}
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <Link href="/decision" className="btn-primary">
            {zh ? "现在跑一次决策" : "Run a decision now"} <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/how-it-works" className="btn-secondary">
            {zh ? "看 7-agent 流水线如何工作" : "See how the 7-agent pipeline works"}
          </Link>
        </div>
      </header>

      {/* ─── Three pillars ─── */}
      <section className="space-y-6">
        <div className="text-center">
          <div className="label-cap">{zh ? "三条护城河" : "The three moats"}</div>
          <h2 className="display text-2xl md:text-3xl mt-2">
            {zh ? "辩证 · 可审 · 反幻觉" : "Dialectical · Auditable · Hallucination-resistant"}
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <Pillar
            icon={<Scale className="w-5 h-5" />}
            title={zh ? "1. 辩证 (Dialectical)" : "1. Dialectical"}
            claim={
              zh
                ? "7 个角色互相辩驳, 不是 1 个 LLM 单口相声。"
                : "Seven roles argue with each other — not one LLM monologuing."
            }
            body={
              zh
                ? "5 个分析师 (基本面 / 情绪 / 新闻 / 技术 / 宏观) 各写自己的观点 → 多空双方研究员对辩 → 风险面板 27 cell 投票 → 经理终审。每一步都被下一步反驳, 没人能一句话定结论。这是 ChatGPT / 妙想 / Bloomberg ASKB 都不做的事 — 它们都是单 agent 给答案。"
                : "Five analysts (fundamentals / sentiment / news / technical / macro) each write their own thesis → bull and bear researchers debate → a Risk Panel votes across 27 cells → a Manager arbitrates. Every step is contested by the next. No single LLM gets to call it. ChatGPT, 妙想, and Bloomberg's ASKB all give you one agent's answer."
            }
            proofLabel={zh ? "看一次完整辩论 →" : "See a full debate →"}
            proofHref="/decision"
          />
          <Pillar
            icon={<ShieldCheck className="w-5 h-5" />}
            title={zh ? "2. 可审 (Auditable)" : "2. Auditable"}
            claim={
              zh
                ? "每个决策都有完整 audit log + 公开 trace 链接。"
                : "Every decision ships with a full audit log and a public trace link."
            }
            body={
              zh
                ? "从拉数据 → 每个 agent 的 prompt / response / token / cost → 多空辩论 → 风控投票 → 经理理由 → 实现 5 日前瞻收益, 全程留痕。任何一句话可以下钻到底它从哪儿来。东财妙想 / 同花顺问财 / Public.com / Trade Ideas 全部不暴露推理过程 — 你只看到 BUY/SELL, 不知道为什么。"
                : "Data pull → each agent's prompt / response / token / cost → bull-bear debate → risk votes → manager rationale → realised 5-day forward return — the whole chain is traceable. Any single sentence can be drilled down to its source. Eastmoney, Public.com, Trade Ideas all hide the reasoning — you see BUY/SELL with no path to the why."
            }
            proofLabel={zh ? "看任一公开 trace →" : "View a public trace →"}
            proofHref="/track-record"
          />
          <Pillar
            icon={<ShieldAlert className="w-5 h-5" />}
            title={zh ? "3. 反幻觉 (Hallucination gate)" : "3. Hallucination gate"}
            claim={
              zh
                ? "三层闸门, LLM 编数字 = 不让出门。"
                : "Three layers. If an LLM fabricates a number, it doesn't ship."
            }
            body={
              zh
                ? "(1) Prompt 禁止编造规则 + (2) v55 GROUND TRUTH QUOTE block (后端把真实报价/财报锁进 prompt, LLM 必须引用) + (3) 程序化 validator 校验结构与字段。任何一层失败 → 红色告警 + body 不渲染。其他 AI 投顾都没明示这道闸门, 出 hallucination 时只能事后修。"
                : "(1) An explicit prompt rule banning fabrication + (2) the v55 GROUND TRUTH QUOTE block — the backend locks the real price / financials into the prompt and the LLM must cite them + (3) a programmatic validator on structure and fields. Any layer fails → red banner + body suppressed. No other AI advisor exposes this gate; they patch hallucinations post-hoc, you discover them by being wrong."
            }
            proofLabel={zh ? "看数据完整性策略 →" : "See the data-integrity policy →"}
            proofHref="/compliance"
          />
        </div>
      </section>

      {/* ─── Comparison matrix ─── */}
      <section className="space-y-6">
        <div className="text-center">
          <div className="label-cap">{zh ? "横向对比" : "Head-to-head"}</div>
          <h2 className="display text-2xl md:text-3xl mt-2">
            {zh ? "我们和谁不一样" : "How we differ"}
          </h2>
          <p className="text-ink-tertiary text-sm mt-3 max-w-2xl mx-auto">
            {zh
              ? "每一列代表一类真实对手。每一格都是基于 2026 年 6 月公开资料的核对 — 错了请直接发邮件, 我们会改。"
              : "Each column is a real competitor category. Every cell is grounded in public information as of June 2026 — if anything is wrong, email us and we'll fix it."}
          </p>
        </div>
        <div className="surface-elev overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="text-left px-4 py-3 font-medium text-2xs uppercase tracking-wider text-ink-tertiary">
                  {zh ? "能力维度" : "Capability"}
                </th>
                <th className="text-center px-3 py-3 font-medium bg-accent-muted/30">
                  <div className="text-2xs uppercase tracking-wider text-accent">Concordal</div>
                  <div className="text-2xs text-ink-tertiary mt-1">{zh ? "本平台" : "this platform"}</div>
                </th>
                <th className="text-center px-3 py-3 font-medium">
                  <div className="text-2xs uppercase tracking-wider text-ink-secondary">{zh ? "东方财富妙想" : "Eastmoney 妙想"}</div>
                  <div className="text-2xs text-ink-tertiary mt-1">{zh ? "中国零售" : "China retail"}</div>
                </th>
                <th className="text-center px-3 py-3 font-medium">
                  <div className="text-2xs uppercase tracking-wider text-ink-secondary">Public.com AI</div>
                  <div className="text-2xs text-ink-tertiary mt-1">{zh ? "美国零售" : "US retail"}</div>
                </th>
                <th className="text-center px-3 py-3 font-medium">
                  <div className="text-2xs uppercase tracking-wider text-ink-secondary">Bloomberg ASKB</div>
                  <div className="text-2xs text-ink-tertiary mt-1">{zh ? "机构终端" : "institutional"}</div>
                </th>
                <th className="text-center px-3 py-3 font-medium">
                  <div className="text-2xs uppercase tracking-wider text-ink-secondary">{zh ? "OSS 框架" : "OSS framework"}</div>
                  <div className="text-2xs text-ink-tertiary mt-1">TauricResearch</div>
                </th>
              </tr>
            </thead>
            <tbody className="text-sm">
              <Row label={zh ? "多 agent 辩论 (不是协作)" : "Multi-agent debate (not coordination)"}
                ta="full" ta_note={zh ? "7 角色多空对辩" : "7 roles bull/bear"}
                em="partial" em_note={zh ? "协作不对辩" : "coordinate, not debate"}
                pu="none" bb="partial" bb_note={zh ? "单 agent ASKB" : "single ASKB agent"}
                os="full" os_note={zh ? "原版 5 agent" : "the original 5-agent design"} />
              <Row label={zh ? "公开 audit log / 推理过程" : "Public audit log / reasoning trace"}
                ta="full" ta_note={zh ? "完整 trace 链接" : "full trace links"}
                em="none" pu="none" bb="partial" bb_note={zh ? "BQL 代码" : "BQL code shown"}
                os="partial" os_note={zh ? "命令行 logs" : "CLI logs only"} />
              <Row label={zh ? "反幻觉数据闸门" : "Hallucination gate (ground-truth injection)"}
                ta="full" ta_note={zh ? "三层闸门" : "three-layer"}
                em="none" pu="none" bb="none" os="none" />
              <Row label={zh ? "跨市场决策同档" : "Cross-market decisions, single workflow"}
                ta="full" ta_note="A股 + 美股 + 加密"
                em="partial" em_note={zh ? "A 股全, 美股筛选" : "A-share full, US screener"}
                pu="partial" pu_note={zh ? "美股 / 加密" : "US + crypto"}
                bb="full" bb_note={zh ? "全球" : "global"}
                os="partial" os_note={zh ? "看你怎么接" : "depends on integration"} />
              <Row label={zh ? "经纪商通道 / 自动执行" : "Brokerage / auto-execution"}
                ta="none" ta_note={zh ? "决策支持工具" : "decision-support only"}
                em="full" pu="full" pu_note={zh ? "AI 自动下单" : "AI auto-orders"}
                bb="full" os="none" />
              <Row label={zh ? "可解释 / 反黑盒" : "Explainable (not black-box)"}
                ta="full" em="partial" em_note={zh ? "AI 选股理由" : "stock-pick reasons"}
                pu="none" pu_note={zh ? "媒体批 缺信息边" : "media: lacks information edge"}
                bb="partial" os="full" os_note={zh ? "源码可读" : "source readable"} />
              <Row label={zh ? "Reflection / 学习闭环" : "Reflection / learning loop"}
                ta="full" ta_note={zh ? "夜间反思 cron" : "nightly reflection cron"}
                em="none" pu="none" bb="none" os="partial" os_note={zh ? "v0.2.4 加了" : "added in v0.2.4"} />
              <Row label={zh ? "数据广度 (国内)" : "Data breadth (China)"}
                ta="partial" ta_note={zh ? "akshare + 多源" : "akshare + multi-source"}
                em="full" em_note={zh ? "全数据源" : "all licensed"}
                pu="none" bb="full" os="partial" />
              <Row label={zh ? "监管定位" : "Regulatory posture"}
                ta="partial" ta_note={zh ? "HK SFC Type 4 申请筹备中" : "HK SFC Type 4 in preparation"}
                em="full" em_note={zh ? "中国持牌" : "China licensed"}
                pu="full" pu_note="SEC"
                bb="full" os="none" />
              <Row label={zh ? "价格起点 (个人 / 月)" : "Starting price (retail / mo)"}
                ta="full" ta_note={zh ? "免费 → ¥199 → ¥549" : "free → ¥199 → ¥549"}
                em="full" em_note={zh ? "免费 + 增值" : "free + extras"}
                pu="full" pu_note={zh ? "免费 + 经纪商收益" : "free, broker spreads"}
                bb="none" bb_note={zh ? "$32 k / 年" : "$32k / year"}
                os="full" os_note={zh ? "开源" : "open source"} />
            </tbody>
          </table>
        </div>
        <div className="text-2xs font-mono uppercase tracking-wider text-ink-tertiary flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <Check className="w-3 h-3 text-signal-buy" /> {zh ? "完整" : "Full"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Minus className="w-3 h-3 text-gold" /> {zh ? "部分" : "Partial"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <X className="w-3 h-3 text-signal-sell" /> {zh ? "没有" : "None / unclear"}
          </span>
          <span className="text-ink-tertiary ml-auto">
            {zh ? "更新于 2026 年 6 月" : "Updated June 2026"}
          </span>
        </div>
      </section>

      {/* ─── Mini summary by competitor ─── */}
      <section className="space-y-4">
        <div className="text-center mb-2">
          <h2 className="display text-2xl text-ink-primary tracking-tight">
            {zh ? "他们最擅长什么 / 不擅长什么" : "Where each one wins, where each one falls short"}
          </h2>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <CompetitorCard
            name={zh ? "东方财富妙想" : "Eastmoney 妙想"}
            tag={zh ? "中国零售" : "China retail"}
            wins={zh
              ? "全数据源、亿级用户、刚上线多 agent 协作系统 (帮你管自选股、找数、模拟组合)。是你在中国大陆的现实正面对手。"
              : "Full licensed data sources, hundreds of millions of retail users, just rolled out a multi-agent coordination system (manage watchlist, look up data, simulate portfolio). The real frontal competitor in mainland China."}
            falls={zh
              ? "多 agent 是工具拼盘不是辩证决策, 不暴露推理过程, 数据完整性闸门不可见。"
              : "Their multi-agent is a tool palette, not a debate engine. No reasoning surfaced. No visible hallucination gate."}
          />
          <CompetitorCard
            name="Public.com AI Agents"
            tag={zh ? "美国零售" : "US retail"}
            wins={zh
              ? "经纪商通道 + AI 自动多腿期权 / 止损 / 对冲。SEC 持牌。是你出海后最近赛道的参照。"
              : "Brokerage rails + AI auto-execution for multi-leg options / stops / hedges. SEC-licensed. Closest US-retail comparable once you go international."}
            falls={zh
              ? "媒体直接批 “给散户算法交易工具但缺信息边和风控” — 这恰恰是你 own 的 narrative。"
              : "Media critique: “gives retail algo trading tools but lacks information edge and risk controls” — exactly the narrative you own."}
          />
          <CompetitorCard
            name="Bloomberg Terminal + ASKB"
            tag={zh ? "机构终端" : "institutional"}
            wins={zh
              ? "数据天书、ASKB agentic interface 已上线、BloombergGPT (50B 参数 / 363B 金融 token)、SEAR / report generation / financial modeling 全套 AI。"
              : "Encyclopedic data, ASKB agentic interface live, BloombergGPT (50B params / 363B finance tokens), SEAR + report generation + financial modeling — full AI stack."}
            falls={zh
              ? "$31,980/seat/year. 中端机构 (SMB 资管 / family office / 港新小型 hedge) 买不起 — 这是你 Enterprise tier 的真实 TAM。"
              : "$31,980/seat/year. Mid-tier institutions (SMB asset managers / family offices / HK-Singapore boutique funds) can't afford it — that's your Enterprise tier's real TAM."}
          />
          <CompetitorCard
            name="TauricResearch/TradingAgents"
            tag={zh ? "OSS 学术框架" : "OSS academic framework"}
            wins={zh
              ? "开源框架 + 学术论文 (arxiv:2412.20138)。v0.2.5 (2026 年 5 月) 加了 grounded Sentiment Analyst, 我们的方法学灵感来源。"
              : "Open-source framework + academic paper (arxiv:2412.20138). v0.2.5 (May 2026) added a grounded Sentiment Analyst — our methodology lineage."}
            falls={zh
              ? "是个库, 不是产品 — 无 web UI、无数据集成、无合规、无生产级 audit。学术 vs 产品化的降维差异。"
              : "It's a library, not a product — no web UI, no integrated data, no compliance posture, no production audit. Academic vs productised is the asymmetric advantage."}
          />
        </div>
      </section>

      {/* ─── Closing CTA ─── */}
      <section className="surface-elev p-8 text-center space-y-4">
        <h2 className="display text-2xl md:text-3xl text-ink-primary tracking-tight">
          {zh ? "证据就在产品里" : "The evidence is the product"}
        </h2>
        <p className="text-ink-secondary max-w-xl mx-auto">
          {zh
            ? "上面任何一句话, 都可以直接到 /decision 跑一次实验、到 /track-record 翻 audit log、到 /compliance 核对数据闸门。每一个 cell 都欢迎反驳。"
            : "Every claim above can be tested: run a real decision at /decision, drill the audit log at /track-record, verify the integrity policy at /compliance. Every cell is open to challenge."}
        </p>
        <div className="flex justify-center gap-3 pt-2 flex-wrap">
          <Link href="/decision" className="btn-primary">
            {zh ? "现在跑一次决策" : "Run a decision now"} <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/track-record" className="btn-secondary">
            {zh ? "看真实战绩" : "See real track record"}
          </Link>
          <Link href="/compliance" className="btn-ghost">
            {zh ? "看合规与数据政策" : "See compliance & data policy"}
          </Link>
        </div>
      </section>

      {/* ─── Sources ─── */}
      <section className="text-2xs font-mono uppercase tracking-wider text-ink-tertiary border-t border-border-subtle pt-4 space-y-2">
        <div className="text-ink-secondary">
          {zh ? "对比依据 (2026 年 6 月公开资料)" : "Sources (public information, June 2026)"}
        </div>
        <ul className="space-y-1 normal-case tracking-normal font-sans">
          <li>
            <a className="hover:text-ink-secondary" href="https://github.com/TauricResearch/TradingAgents" target="_blank" rel="noopener noreferrer">
              TauricResearch/TradingAgents v0.2.4 / v0.2.5 release notes
              <ExternalLink className="w-3 h-3 inline ml-1" />
            </a>
          </li>
          <li>
            <a className="hover:text-ink-secondary" href="https://arxiv.org/pdf/2412.20138" target="_blank" rel="noopener noreferrer">
              Multi-Agents LLM Financial Trading Framework — arXiv:2412.20138
              <ExternalLink className="w-3 h-3 inline ml-1" />
            </a>
          </li>
          <li>
            <a className="hover:text-ink-secondary" href="https://professional.bloomberg.com/products/bloomberg-terminal/ai/" target="_blank" rel="noopener noreferrer">
              Bloomberg Terminal AI features (ASKB, BloombergGPT)
              <ExternalLink className="w-3 h-3 inline ml-1" />
            </a>
          </li>
          <li>
            <a className="hover:text-ink-secondary" href="https://public.com/ai-agents" target="_blank" rel="noopener noreferrer">
              Public.com AI Agents
              <ExternalLink className="w-3 h-3 inline ml-1" />
            </a>
          </li>
          <li>
            <a className="hover:text-ink-secondary" href="https://caifuhao.eastmoney.com/news/20260417164439259767630" target="_blank" rel="noopener noreferrer">
              2026 金融类 Skills 横向评测 (东方财富妙想 vs 同花顺 vs 雪球)
              <ExternalLink className="w-3 h-3 inline ml-1" />
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}

/* ============================================================ */

function Pillar({
  icon, title, claim, body, proofLabel, proofHref,
}: {
  icon: React.ReactNode;
  title: string;
  claim: string;
  body: string;
  proofLabel: string;
  proofHref: string;
}) {
  return (
    <div className="surface-elev p-6 flex flex-col gap-3 h-full">
      <div className="flex items-center gap-2 text-accent">
        {icon}
        <div className="text-2xs font-mono uppercase tracking-wider">{title}</div>
      </div>
      <div className="font-serif text-xl text-ink-primary leading-snug">{claim}</div>
      <p className="text-sm text-ink-secondary leading-relaxed flex-1">{body}</p>
      <Link href={proofHref} className="text-xs text-accent hover:underline inline-flex items-center gap-1 mt-1">
        {proofLabel}
      </Link>
    </div>
  );
}

type Cell = "full" | "partial" | "none";

function CellIcon({ kind }: { kind: Cell }) {
  if (kind === "full") return <Check className="w-4 h-4 text-signal-buy" />;
  if (kind === "partial") return <Minus className="w-4 h-4 text-gold" />;
  return <X className="w-4 h-4 text-signal-sell" />;
}

function Row({
  label,
  ta, ta_note,
  em, em_note,
  pu, pu_note,
  bb, bb_note,
  os, os_note,
}: {
  label: string;
  ta: Cell; ta_note?: string;
  em: Cell; em_note?: string;
  pu: Cell; pu_note?: string;
  bb: Cell; bb_note?: string;
  os: Cell; os_note?: string;
}) {
  return (
    <tr className="border-b border-border-subtle/40 hover:bg-bg-hover/30">
      <td className="px-4 py-3 text-ink-primary font-medium">{label}</td>
      <CellTd cell={ta} note={ta_note} highlight />
      <CellTd cell={em} note={em_note} />
      <CellTd cell={pu} note={pu_note} />
      <CellTd cell={bb} note={bb_note} />
      <CellTd cell={os} note={os_note} />
    </tr>
  );
}

function CellTd({ cell, note, highlight }: { cell: Cell; note?: string; highlight?: boolean }) {
  return (
    <td className={`px-3 py-3 text-center ${highlight ? "bg-accent-muted/15" : ""}`}>
      <div className="flex flex-col items-center gap-1">
        <CellIcon kind={cell} />
        {note ? (
          <div className="text-2xs text-ink-tertiary leading-tight max-w-[120px]">{note}</div>
        ) : null}
      </div>
    </td>
  );
}

function CompetitorCard({
  name, tag, wins, falls,
}: {
  name: string;
  tag: string;
  wins: string;
  falls: string;
}) {
  return (
    <div className="surface-elev p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-semibold text-ink-primary">{name}</div>
        <div className="text-2xs font-mono uppercase tracking-wider text-ink-tertiary">{tag}</div>
      </div>
      <div>
        <div className="text-2xs uppercase tracking-kicker text-signal-buy mb-1">✓</div>
        <p className="text-sm text-ink-secondary leading-relaxed">{wins}</p>
      </div>
      <div>
        <div className="text-2xs uppercase tracking-kicker text-signal-sell mb-1">✗</div>
        <p className="text-sm text-ink-secondary leading-relaxed">{falls}</p>
      </div>
    </div>
  );
}
