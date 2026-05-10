"use client";

import { LegalLayout } from "../components/LegalLayout";
import { useT } from "../lib/i18n";

export default function TermsPage() {
  const { locale } = useT();
  return (
    <LegalLayout title={locale === "zh" ? "服务条款" : "Terms of Service"} lastUpdated="2026-05-10">
      {locale === "zh" ? <ZhContent /> : <EnContent />}
    </LegalLayout>
  );
}

function EnContent() {
  return (
    <>
      <Section title="1. Acceptance of Terms">
        By accessing or using trading-agents-platform (the "Service"), you agree
        to be bound by these Terms of Service. If you don't agree, don't use
        the Service.
      </Section>
      <Section title="2. Description of Service">
        The Service is a decision-support tool that uses large language models
        to analyse public market data and produce structured trade-decision
        artifacts. <strong>It does not execute trades, give personalised
        investment advice, or hold customer funds.</strong> See Disclaimer.
      </Section>
      <Section title="3. Eligibility">
        You must be at least 18 years old and legally able to enter into a
        binding contract in your jurisdiction. The Service is intended for
        educational and research use; it is not registered as an investment
        adviser in any jurisdiction.
      </Section>
      <Section title="4. Accounts and security">
        You're responsible for maintaining the confidentiality of your
        account credentials and for all activity under your account. Tell us
        immediately if you discover unauthorised use.
      </Section>
      <Section title="5. Acceptable use">
        Don't: scrape the Service at industrial volume, attempt to reverse-
        engineer LLM prompts at scale to evade rate limits, share your API
        keys, attempt to deny-of-service the platform, or use the Service to
        violate any law.
      </Section>
      <Section title="6. Subscriptions and payments">
        Paid plans are billed monthly in advance. Cancellation takes effect at
        the end of the current billing period — no refunds for partial months
        unless required by your local consumer-protection law. Prices may
        change with 30 days notice.
      </Section>
      <Section title="7. Intellectual property">
        The Service, including the analyst pipeline, prompt packs, and UI, is
        licensed to you for personal/team use during your subscription. The
        underlying open-source code is available at
        github.com/gallen666/trading-agents-platform under its respective
        license. Decision artifacts you generate are yours.
      </Section>
      <Section title="8. Disclaimers">
        THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES. We don't warrant
        that decisions will be profitable, accurate, or free from errors. See
        the Disclaimer page for the full risk discussion.
      </Section>
      <Section title="9. Limitation of liability">
        To the maximum extent permitted by law, our aggregate liability for
        any claim arising from the Service is capped at the greater of (a) the
        fees you paid in the 12 months before the claim, or (b) USD 100. We
        are not liable for trading losses, even if foreseeable.
      </Section>
      <Section title="10. Termination">
        Either party may terminate at any time. We may suspend accounts that
        violate these Terms or threaten the platform's integrity. On
        termination, your access to paid features ends; data export is
        available on request.
      </Section>
      <Section title="11. Governing law and disputes">
        These Terms are governed by the laws of the operator's principal
        jurisdiction. Disputes will be resolved through good-faith
        negotiation, then binding arbitration if necessary.
      </Section>
      <Section title="12. Changes">
        We may update these Terms; material changes will be announced 30 days
        in advance via email and a banner on the site. Continued use after
        the effective date constitutes acceptance.
      </Section>
      <Section title="13. Contact">
        Questions: open an issue at the GitHub repo or email the operator.
      </Section>
    </>
  );
}

function ZhContent() {
  return (
    <>
      <Section title="1. 接受条款">
        通过访问或使用 trading-agents-platform（"本服务"），您同意受本《服务条款》约束。若不同意，请勿使用。
      </Section>
      <Section title="2. 服务描述">
        本服务是一个基于大语言模型分析公开市场数据并生成结构化交易决策的工具。<strong>本服务不执行交易、不提供个性化投资建议、不持有客户资金。</strong>详见免责声明页。
      </Section>
      <Section title="3. 资格">
        使用者须年满 18 岁且在所在司法辖区可订立有约束力的合同。本服务用于教育和研究用途，未在任何司法辖区注册为投资顾问。
      </Section>
      <Section title="4. 账户与安全">
        您负责保管账户凭证并对账户下所有活动负责。发现未授权使用请立即通知我们。
      </Section>
      <Section title="5. 可接受使用">
        禁止：工业级抓取、规模化逆向 LLM prompt 绕过限流、分享 API key、对平台发起拒绝服务攻击、使用本服务从事违法行为。
      </Section>
      <Section title="6. 订阅与支付">
        付费方案按月预付。取消在当前计费周期结束时生效——除非当地消费者保护法另有规定，部分月份不退款。价格变动会提前 30 天通知。
      </Section>
      <Section title="7. 知识产权">
        本服务（包括分析师 pipeline、prompt 包、UI）按订阅期内授权您个人/团队使用。底层开源代码在 github.com/gallen666/trading-agents-platform 按其各自许可证可用。您生成的决策产物归您所有。
      </Section>
      <Section title="8. 声明">
        本服务"按原样"提供，不作任何保证。我们不保证决策能盈利、准确或无错误。完整风险讨论详见免责声明页。
      </Section>
      <Section title="9. 责任限制">
        在法律允许的最大范围内，我们因本服务产生的任何索赔的累计责任上限为：(a) 索赔前 12 个月内您支付的费用，或 (b) 100 美元，二者中较大者。我们不对交易损失负责，即使可预见。
      </Section>
      <Section title="10. 终止">
        任何一方可随时终止。我们可暂停违反本条款或威胁平台完整性的账户。终止时您对付费功能的访问结束；可应请求导出数据。
      </Section>
      <Section title="11. 适用法律与争议">
        本条款由运营方主要司法辖区的法律管辖。争议优先通过善意协商解决，必要时通过有约束力的仲裁解决。
      </Section>
      <Section title="12. 变更">
        我们可更新本条款；重大变更会通过邮件 + 站内 banner 提前 30 天公告。生效日后继续使用即视为接受。
      </Section>
      <Section title="13. 联系">
        问题：在 GitHub repo 提 issue，或邮件联系运营方。
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-2 text-ink-primary">{title}</h2>
      <div className="text-sm text-ink-secondary leading-relaxed">{children}</div>
    </section>
  );
}
