"use client";

/**
 * /compliance — regulatory transparency + data policy page (v53 Phase 3).
 *
 * Audience: institutional clients during DD, monitors during SFC Type 4
 * review, IPO underwriters during legal review, journalists doing
 * fact-checks. The page exists to make every regulatory claim from the
 * marketing surface (Hero kicker, /pricing badge, Footer pill, /decision
 * trust banner) immutably verifiable — what's the license posture,
 * what's the data retention, what's the audit-log policy, who to email.
 *
 * Everything here is FACT (status as of build time), not aspiration.
 * The page intentionally has zero CTAs that try to upsell — its only
 * job is to be checked against and not embarrass us.
 */

import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  Database,
  FileText,
  Mail,
  ScrollText,
  Shield,
  Timer,
} from "lucide-react";
import { useT } from "../lib/i18n";

export default function CompliancePage() {
  const { locale } = useT();
  const isZh = locale === "zh";

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <header className="mb-12 text-center max-w-2xl mx-auto">
        <span className="label-cap">
          {isZh ? "合规与透明度" : "Compliance & transparency"}
        </span>
        <h1 className="text-3xl md:text-4xl font-display font-medium mt-2 mb-4">
          {isZh
            ? "我们怎么持牌、怎么留痕、怎么对得起监管"
            : "How we're licensed, how we audit, how we keep regulators sane"}
        </h1>
        <p className="text-sm text-ink-secondary leading-relaxed">
          {isZh
            ? "首页 Hero、/pricing 副标、Footer 角标、/decision 信任带 — 每一句话在这里都能被复核。如果发现哪一句和事实不一致，请直接邮件联系。"
            : "Every regulatory claim on this site — Hero kicker, /pricing badge, Footer pill, /decision trust strip — is verifiable on this page. If you spot a discrepancy, email the compliance address below."}
        </p>
        <div className="mt-6 inline-flex items-center gap-2 text-2xs font-mono tracking-wider uppercase text-gold/80 border border-gold/20 bg-gold-soft/30 rounded px-3 py-1.5">
          <span className="status-dot bg-gold animate-pulse-slow" />
          {isZh
            ? "本页面状态截至 2026 年 5 月 · 重大变化将同步更新"
            : "Status as of May 2026 · Material changes will be reflected here"}
        </div>
      </header>

      {/* ---- SFC Type 4 license posture ---- */}
      <section className="surface p-6 md:p-8 mb-8">
        <div className="flex items-start gap-3 mb-4">
          <Shield className="w-5 h-5 text-gold mt-0.5 shrink-0" />
          <div>
            <span className="label-cap">
              {isZh ? "持牌进度" : "License posture"}
            </span>
            <h2 className="text-xl font-semibold mt-1">
              {isZh
                ? "HK SFC Type 4 (Advising on Securities) — 申请筹备中"
                : "HK SFC Type 4 (Advising on Securities) — in preparation"}
            </h2>
          </div>
        </div>

        <p className="text-sm text-ink-secondary leading-relaxed mb-5">
          {isZh
            ? "TradingAgents 计划以 香港持牌法团身份 经营。当前阶段：(1) 香港子公司 TradingAgents (HK) Ltd. 注册中 (Vistra 代办); (2) 业务负责人 (RO) + 香港办公地址确认中; (3) SFC Type 4 申请预计于 HK OpCo 注册完成后 60 天内提交。"
            : "TradingAgents intends to operate as a licensed entity under HK SFC. Current state: (1) HK OpCo 'TradingAgents (HK) Ltd.' incorporation in progress (Vistra-assisted); (2) Responsible Officer (RO) + HK office address under confirmation; (3) Type 4 application targeted within 60 days of OpCo registration."}
        </p>

        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <Step done label={isZh ? "Cayman HoldCo 注册" : "Cayman HoldCo registered"} />
          <Step done label={isZh ? "麦肯锡式品牌定位 (协奏 Concord)" : "Brand positioning ('Concord')"} />
          <Step active label={isZh ? "HK OpCo 注册 (Vistra)" : "HK OpCo registration (Vistra)"} />
          <Step pending label={isZh ? "SFC Type 4 — RO 提名" : "SFC Type 4 — RO nomination"} />
          <Step pending label={isZh ? "SFC Type 4 — 正式申请" : "SFC Type 4 — application submitted"} />
          <Step pending label={isZh ? "SFC Type 4 — 牌照获批" : "SFC Type 4 — license granted"} />
        </div>

        <div className="mt-5 border-l-2 border-gold/40 pl-4 py-2 text-xs text-ink-tertiary leading-relaxed">
          <span className="font-mono uppercase tracking-wider text-gold/70">
            {isZh ? "重要披露" : "Material disclosure"}
          </span>
          <p className="mt-1">
            {isZh
              ? "在牌照获批前，TradingAgents 仅提供 决策支持工具 (decision-support tool)，不构成投资建议。任何 marketing 文案中提到 '持牌'、'licensed' 均明示为 '申请筹备中 / in preparation'。每个决策结果页底部都附 '不构成投资建议' 红色横幅。"
              : "Until license grant, TradingAgents provides a decision-support tool only — not investment advice. All marketing copy referring to 'licensed' is qualified with 'in preparation'. Every decision result includes a red disclaimer banner."}
          </p>
        </div>
      </section>

      {/* ---- Data retention ---- */}
      <section className="surface p-6 md:p-8 mb-8">
        <div className="flex items-start gap-3 mb-4">
          <Database className="w-5 h-5 text-accent mt-0.5 shrink-0" />
          <div>
            <span className="label-cap">
              {isZh ? "数据保留" : "Data retention"}
            </span>
            <h2 className="text-xl font-semibold mt-1">
              {isZh ? "什么数据，留多久，谁能看" : "What data, how long, who sees it"}
            </h2>
          </div>
        </div>

        <table className="w-full text-sm border border-border-subtle rounded overflow-hidden">
          <thead className="bg-bg-subtle">
            <tr>
              <th className="px-4 py-3 text-left label-cap">
                {isZh ? "数据类型" : "Data type"}
              </th>
              <th className="px-4 py-3 text-left label-cap">
                {isZh ? "保留期" : "Retention"}
              </th>
              <th className="px-4 py-3 text-left label-cap">
                {isZh ? "可见范围" : "Visibility"}
              </th>
            </tr>
          </thead>
          <tbody className="text-ink-secondary">
            <Row
              type={isZh ? "决策完整记录 (LLM 调用、token、推理)" : "Decision trace (LLM calls, tokens, reasoning)"}
              ret={isZh ? "无限期 (审计要求)" : "Indefinite (audit requirement)"}
              vis={isZh ? "本人 + 监管 (传票)" : "Owner + regulator (subpoena)"}
            />
            <Row
              type={isZh ? "邮箱 (magic-link 登录)" : "Email (magic-link auth)"}
              ret={isZh ? "账号删除后 30 天" : "30 days after account deletion"}
              vis={isZh ? "仅 Stripe + 邮件服务商" : "Stripe + email provider only"}
            />
            <Row
              type={isZh ? "支付信息 (Stripe)" : "Payment data (Stripe)"}
              ret={isZh ? "Stripe 政策 (≥ 7 年)" : "Per Stripe (≥ 7 years)"}
              vis={isZh ? "我们不存卡号; Stripe 全权处理" : "We never store card numbers; Stripe-side only"}
            />
            <Row
              type={isZh ? "决策分享链接 (shareId)" : "Decision share links (shareId)"}
              ret={isZh ? "用户手动撤销前一直保留" : "Until user revokes"}
              vis={isZh ? "公开 (持链接者)" : "Public to anyone with the link"}
            />
            <Row
              type={isZh ? "Reflection 记忆 (系统学习)" : "Reflection memory (system learning)"}
              ret={isZh ? "无限期; 用户可清空" : "Indefinite; user-clearable"}
              vis={isZh ? "仅本人账户的下次决策" : "Owner's future decisions only"}
            />
            <Row
              type={isZh ? "服务器日志 (IP, user-agent)" : "Server logs (IP, user-agent)"}
              ret={isZh ? "90 天" : "90 days"}
              vis={isZh ? "Render + Vercel 运维; 不外传" : "Render + Vercel ops only"}
            />
          </tbody>
        </table>

        <div className="mt-4 text-xs text-ink-tertiary leading-relaxed">
          <strong className="text-ink-secondary">
            {isZh ? "GDPR / PDPO 权利:" : "GDPR / PDPO rights:"}
          </strong>{" "}
          {isZh
            ? "任何用户可以请求导出/删除个人数据。流程：发邮件到 privacy@tradingagents.ai，72 小时内回应。"
            : "Any user may request data export / deletion by emailing privacy@tradingagents.ai. We respond within 72 hours."}
        </div>
      </section>

      {/* ---- Audit log policy ---- */}
      <section className="surface p-6 md:p-8 mb-8">
        <div className="flex items-start gap-3 mb-4">
          <ScrollText className="w-5 h-5 text-bull-ink mt-0.5 shrink-0" />
          <div>
            <span className="label-cap">
              {isZh ? "审计日志" : "Audit log"}
            </span>
            <h2 className="text-xl font-semibold mt-1">
              {isZh
                ? "每一次 LLM 调用都有 immutable 痕迹"
                : "Every LLM call leaves an immutable trace"}
            </h2>
          </div>
        </div>

        <p className="text-sm text-ink-secondary leading-relaxed mb-4">
          {isZh
            ? "用户每跑一次决策, 系统记录:"
            : "For every decision, the system records:"}
        </p>

        <ul className="space-y-2 text-sm text-ink-secondary mb-5">
          {[
            isZh ? "每个 agent (基本面/情绪/新闻/技术/宏观/多空/manager) 用了哪个 LLM 模型, 哪一刻调用, 输入/输出 token 量, 真实费用" : "Per-agent LLM model, exact call time, input/output token count, dollar cost",
            isZh ? "所有数据源响应的原始 timestamp (SEC EDGAR/Reddit/akshare/东方财富)" : "Raw timestamps from every data source (SEC EDGAR / Reddit / akshare / EastMoney)",
            isZh ? "决策最终建议 + 置信度 + 风险 flags (持仓 / 不持仓 / 卖出)" : "Final recommendation + confidence + risk flags (BUY / HOLD / SELL)",
            isZh ? "如果开启双 LLM consensus (manager 终审), 第二模型的独立结论 + 一致度评分" : "If dual-LLM consensus is enabled, the second model's independent verdict + agreement score",
            isZh ? "整条 trace 通过 share-link 公开 (用户授权), 或保留在私有账户内 (默认)" : "Full trace is shareable via public link (user-authorized) or kept private (default)",
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-signal-buy shrink-0 mt-0.5" />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <div className="grid sm:grid-cols-2 gap-3">
          <Link
            href="/decision?ticker=AAPL"
            className="surface p-4 hover:bg-bg-hover transition-colors flex items-start gap-3"
          >
            <FileText className="w-4 h-4 text-accent mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-medium text-ink-primary">
                {isZh ? "跑一次决策亲眼看" : "Run a decision yourself"}
              </div>
              <div className="text-xs text-ink-tertiary mt-1">
                {isZh ? "/decision 跑完后点 '推理追溯' 看完整 trace" : "After running, click '推理追溯' to see the full trace"}
              </div>
            </div>
          </Link>
          <Link
            href="/proof"
            className="surface p-4 hover:bg-bg-hover transition-colors flex items-start gap-3"
          >
            <Database className="w-4 h-4 text-accent mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-medium text-ink-primary">
                {isZh ? "查 /proof 信任页" : "See /proof trust page"}
              </div>
              <div className="text-xs text-ink-tertiary mt-1">
                {isZh ? "12 个真实数据集成 · 27 回归测试 · zero lookahead" : "12 real integrations · 27 regression tests · zero lookahead"}
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* ---- LLM provider posture ---- */}
      <section className="surface p-6 md:p-8 mb-8">
        <div className="flex items-start gap-3 mb-4">
          <Timer className="w-5 h-5 text-bear-ink mt-0.5 shrink-0" />
          <div>
            <span className="label-cap">
              {isZh ? "LLM 供应商" : "LLM provider posture"}
            </span>
            <h2 className="text-xl font-semibold mt-1">
              {isZh
                ? "目前在线 / 已 scaffold / 计划接入"
                : "Live / scaffolded / planned"}
            </h2>
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <ProviderCell name="DeepSeek V4" status="live" note={isZh ? "主推理 · deepseek-chat" : "Primary · deepseek-chat"} />
          <ProviderCell name="Gemini 2.5 Pro" status="live" note={isZh ? "Tier 故障兜底" : "Fallback"} />
          <ProviderCell name="OpenAI / Anthropic" status="scaffold" note={isZh ? "代码已接入, 等公司账号" : "Code wired, awaiting corp account"} />
          <ProviderCell name="Qwen / GLM (阿里 / 智谱)" status="scaffold" note={isZh ? "中国 LLM 兜底" : "China-side fallback"} />
          <ProviderCell name="FinGPT" status="planned" note={isZh ? "金融专用 LLM" : "Finance-specialised LLM"} />
          <ProviderCell name="Claude (Constitutional)" status="planned" note={isZh ? "manager 终审升档候选" : "Manager final-review candidate"} />
        </div>
      </section>

      {/* ---- Contact ---- */}
      <section className="surface p-6 md:p-8">
        <div className="flex items-start gap-3 mb-4">
          <Building2 className="w-5 h-5 text-ink-primary mt-0.5 shrink-0" />
          <div>
            <span className="label-cap">
              {isZh ? "联系合规" : "Contact compliance"}
            </span>
            <h2 className="text-xl font-semibold mt-1">
              {isZh ? "正确的人, 正确的邮箱" : "Right person, right inbox"}
            </h2>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <ContactCell
            icon={<AlertTriangle className="w-4 h-4 text-bear-ink" />}
            label={isZh ? "举报内容失实 / marketing 与事实不符" : "Report a misleading marketing claim"}
            email="compliance@tradingagents.ai"
          />
          <ContactCell
            icon={<Database className="w-4 h-4 text-accent" />}
            label={isZh ? "申请数据导出 / 删除 (GDPR/PDPO)" : "Data export / deletion (GDPR/PDPO)"}
            email="privacy@tradingagents.ai"
          />
          <ContactCell
            icon={<Calendar className="w-4 h-4 text-gold" />}
            label={isZh ? "机构客户尽职调查 (DD)" : "Institutional DD inquiry"}
            email="hello@tradingagents.ai"
          />
          <ContactCell
            icon={<Mail className="w-4 h-4 text-bull-ink" />}
            label={isZh ? "媒体 / 投资人 / 一般咨询" : "Press / investor / general"}
            email="hello@tradingagents.ai"
          />
        </div>
        <p className="text-xs text-ink-tertiary leading-relaxed mt-5">
          {isZh
            ? "邮箱 inbox 由 ROIS 监督的合规负责人轮值。每封邮件均 72 小时内首响。涉及监管投诉的邮件会自动同步给外聘法律顾问。"
            : "Inboxes are monitored by the compliance lead under RO supervision. Every email gets a first response within 72 hours. Regulatory complaints are automatically copied to external legal counsel."}
        </p>
      </section>

      {/* Page-level disclaimer footer */}
      <div className="mt-8 border-t border-border-subtle pt-6 text-2xs font-mono uppercase tracking-wider text-ink-tertiary text-center">
        {isZh
          ? "本页内容仅为透明度披露 · 不构成法律或财务建议 · TradingAgents · 协奏 Concord"
          : "Disclosure for transparency only · Not legal or financial advice · TradingAgents · Concord"}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Step({
  done,
  active,
  pending,
  label,
}: {
  done?: boolean;
  active?: boolean;
  pending?: boolean;
  label: string;
}) {
  const cls = done
    ? "bg-signal-buy_soft text-signal-buy border-signal-buy/40"
    : active
    ? "bg-gold-soft text-gold border-gold/40"
    : "bg-bg-subtle text-ink-tertiary border-border-subtle";
  const dot = done ? "✓" : active ? "●" : "○";
  return (
    <div className={`border rounded px-3 py-2 flex items-center gap-2 ${cls}`}>
      <span className="font-mono text-xs">{dot}</span>
      <span className="text-sm">{label}</span>
    </div>
  );
}

function Row({ type, ret, vis }: { type: string; ret: string; vis: string }) {
  return (
    <tr className="border-t border-border-subtle">
      <td className="px-4 py-3 text-ink-primary">{type}</td>
      <td className="px-4 py-3">{ret}</td>
      <td className="px-4 py-3">{vis}</td>
    </tr>
  );
}

function ProviderCell({
  name,
  status,
  note,
}: {
  name: string;
  status: "live" | "scaffold" | "planned";
  note: string;
}) {
  const cls =
    status === "live"
      ? "bg-signal-buy_soft text-signal-buy border-signal-buy/40"
      : status === "scaffold"
      ? "bg-accent-muted text-accent border-accent/40"
      : "bg-bg-subtle text-ink-tertiary border-border-subtle";
  const tag =
    status === "live"
      ? "● LIVE"
      : status === "scaffold"
      ? "○ SCAFFOLD"
      : "· PLANNED";
  return (
    <div className="surface p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-2xs font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls}`}>
          {tag}
        </span>
      </div>
      <div className="text-sm font-medium text-ink-primary">{name}</div>
      <div className="text-xs text-ink-tertiary mt-0.5">{note}</div>
    </div>
  );
}

function ContactCell({
  icon,
  label,
  email,
}: {
  icon: React.ReactNode;
  label: string;
  email: string;
}) {
  return (
    <a
      href={`mailto:${email}`}
      className="surface p-3 hover:bg-bg-hover transition-colors flex items-start gap-2.5"
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <div className="text-sm text-ink-primary leading-snug">{label}</div>
        <div className="text-xs font-mono text-accent mt-1">{email}</div>
      </div>
    </a>
  );
}
