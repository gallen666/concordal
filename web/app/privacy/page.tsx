"use client";

import { LegalLayout } from "../components/LegalLayout";
import { useT } from "../lib/i18n";

export default function PrivacyPage() {
  const { locale } = useT();
  return (
    <LegalLayout title={locale === "zh" ? "隐私政策" : "Privacy Policy"} lastUpdated="2026-05-10">
      {locale === "zh" ? <ZhContent /> : <EnContent />}
    </LegalLayout>
  );
}

function EnContent() {
  return (
    <>
      <Section title="What we collect">
        <p>To provide the Service we collect:</p>
        <ul className="list-disc ml-5 space-y-1 mt-2">
          <li><strong>Account data</strong> — your invite-code-derived user id, email if you provide one, JWT token expiry.</li>
          <li><strong>Usage data</strong> — tickers you analyse, decisions you make, ratings you give (👍/👎), share-events. Stored linked to your user id so we can show your history back to you.</li>
          <li><strong>Technical data</strong> — IP (only for rate limiting; not retained), browser/OS for compatibility, error logs.</li>
          <li><strong>Anonymous analytics</strong> — page views, click events. We use PostHog with IP anonymisation; no fingerprinting.</li>
        </ul>
      </Section>
      <Section title="What we don't collect">
        <ul className="list-disc ml-5 space-y-1">
          <li>Brokerage account credentials. We don't have a place to put them.</li>
          <li>Financial position data unless you explicitly enter it (e.g. paste a watchlist).</li>
          <li>Payment-card numbers — Stripe handles those, we never see them.</li>
        </ul>
      </Section>
      <Section title="How we use it">
        <ul className="list-disc ml-5 space-y-1">
          <li>To run the analyst pipeline and return your decision.</li>
          <li>To populate your decision history and reflection memory (improves future decisions).</li>
          <li>To debug and improve prompts (anonymised aggregates only).</li>
          <li>To prevent abuse (rate limits, spam detection).</li>
        </ul>
      </Section>
      <Section title="LLM provider data">
        Your prompts go to whichever LLM the router selects (Gemini, OpenAI,
        Anthropic, DeepSeek, Qwen, GLM). Each provider has its own retention
        policy linked from their docs. We do not feed your queries into any
        training set on our side.
      </Section>
      <Section title="Cookies">
        We use a single cookie / localStorage key (`ta_jwt`) to keep you
        logged in. PostHog sets its own cookies if you allow analytics.
      </Section>
      <Section title="Sharing">
        We don't sell your data. We share data only with: (a) infrastructure
        providers strictly to operate the Service (Render, Vercel, Stripe,
        SendGrid/Resend); (b) law enforcement on valid legal request.
      </Section>
      <Section title="Your rights">
        Email us to: access your data, export your decision history, delete
        your account, or correct anything. We respond within 30 days.
        EU/UK/CA users have GDPR/CCPA-equivalent rights.
      </Section>
      <Section title="Retention">
        Decision history is retained as long as your account is active.
        After cancellation we keep aggregated, anonymous metrics; identifying
        data is purged within 90 days unless required for legal/tax purposes.
      </Section>
      <Section title="Children">
        The Service is not directed at users under 18. If we learn we have
        collected data from a minor we will delete it.
      </Section>
      <Section title="Changes">
        Material changes announced 30 days in advance via email + site banner.
      </Section>
      <Section title="Contact">
        File an issue at the GitHub repo or email the operator.
      </Section>
    </>
  );
}

function ZhContent() {
  return (
    <>
      <Section title="我们收集什么">
        <p>为提供本服务，我们收集：</p>
        <ul className="list-disc ml-5 space-y-1 mt-2">
          <li><strong>账户数据</strong>——您的邀请码派生用户 id、您提供的邮箱（如有）、JWT token 过期时间。</li>
          <li><strong>使用数据</strong>——您分析的 ticker、您做的决策、您的评分（👍/👎）、分享事件。与用户 id 关联存储以便回放您的历史。</li>
          <li><strong>技术数据</strong>——IP（仅用于限流，不留存）、浏览器/系统（兼容性）、错误日志。</li>
          <li><strong>匿名分析</strong>——页面访问、点击事件。我们用 PostHog 并启用 IP 匿名化；不做 fingerprinting。</li>
        </ul>
      </Section>
      <Section title="我们不收集什么">
        <ul className="list-disc ml-5 space-y-1">
          <li>券商账户凭证。我们没地方放。</li>
          <li>除非您明确输入（例如粘贴 watchlist），否则不收集您的金融持仓数据。</li>
          <li>支付卡号——由 Stripe 处理，我们看不到。</li>
        </ul>
      </Section>
      <Section title="如何使用">
        <ul className="list-disc ml-5 space-y-1">
          <li>运行分析师 pipeline 返回您的决策。</li>
          <li>填充您的决策历史 + 反思记忆（改善未来决策质量）。</li>
          <li>调试和改进 prompt（仅匿名聚合）。</li>
          <li>防止滥用（限流、垃圾检测）。</li>
        </ul>
      </Section>
      <Section title="LLM 提供方数据">
        您的 prompt 被发到 router 选择的 LLM（Gemini / OpenAI / Anthropic / DeepSeek / Qwen / GLM）。每个提供方有其自己的留存政策。我们不把您的 query 用于我方训练。
      </Section>
      <Section title="Cookies">
        我们仅用一个 cookie / localStorage key（`ta_jwt`）保持登录。如果您同意分析，PostHog 会设其自己的 cookies。
      </Section>
      <Section title="共享">
        我们不出售您的数据。仅与以下方共享：(a) 严格为运营本服务的基础设施提供方（Render, Vercel, Stripe, SendGrid/Resend）；(b) 收到合法请求的执法部门。
      </Section>
      <Section title="您的权利">
        发邮件给我们以：访问您的数据、导出决策历史、删除账户、更正错误。30 天内回复。欧盟/英国/加州用户享有 GDPR/CCPA 同等权利。
      </Section>
      <Section title="留存">
        账户活跃期间决策历史持续保留。取消后保留匿名聚合指标；除非法律/税务要求，可识别数据 90 天内清除。
      </Section>
      <Section title="未成年人">
        本服务不面向 18 岁以下用户。如发现收集了未成年人数据，我们会删除。
      </Section>
      <Section title="变更">
        重大变更通过邮件 + 站内 banner 提前 30 天公告。
      </Section>
      <Section title="联系">
        在 GitHub repo 提 issue 或邮件联系运营方。
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
