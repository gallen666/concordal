"use client";

import { LegalLayout } from "../components/LegalLayout";
import { useT } from "../lib/i18n";

export default function DisclaimerPage() {
  const { locale } = useT();
  return (
    <LegalLayout title={locale === "zh" ? "免责声明" : "Risk Disclaimer"} lastUpdated="2026-05-10">
      {locale === "zh" ? <ZhContent /> : <EnContent />}
    </LegalLayout>
  );
}

function EnContent() {
  return (
    <>
      <Section title="Not investment advice">
        Outputs from this platform — trade decisions, target weights, confidence
        scores, analyst commentary, backtest results — are <strong>decision
        support, not investment advice</strong>. They are not personalised to
        your financial situation, risk tolerance, tax position, or investment
        objectives. We are not registered as an investment adviser, broker-
        dealer, or financial planner in any jurisdiction.
      </Section>
      <Section title="Past performance ≠ future results">
        Backtest results show how a strategy WOULD have performed if applied
        historically. They do not guarantee future performance. Backtests are
        subject to (a) survivorship bias in the universe selection, (b) data-
        provider revisions, (c) the gap between modeled and live execution
        costs, (d) regime changes that invalidate historical patterns. Real
        live performance can deviate substantially.
      </Section>
      <Section title="LLM-specific risks">
        Decisions are produced by large language models that can:
        <ul className="list-disc ml-5 space-y-1 mt-2">
          <li><strong>Hallucinate</strong> — invent facts not in the underlying data.</li>
          <li><strong>Drift</strong> — give different answers to the same prompt across calls.</li>
          <li><strong>Bias</strong> — reflect training-data biases in their judgement.</li>
          <li><strong>Be wrong</strong> — even when confident.</li>
        </ul>
        We mitigate (multi-source data, structured prompts, debate, cross-
        validation) but cannot eliminate these failure modes. Treat every
        decision as one input to your own analysis, not the final word.
      </Section>
      <Section title="Trading is risky">
        You can lose all or substantially all of your invested capital. Margin
        and leverage amplify losses. Crypto is exceptionally volatile and can
        lose 50%+ in days. A-share daily-limit and T+1 mechanics can trap
        positions. Foreign exchange exposure compounds equity risk.
      </Section>
      <Section title="No guarantees of availability">
        The Service depends on third-party LLM, data, and hosting providers
        any of which may fail, rate-limit, or discontinue at any time.
      </Section>
      <Section title="Your responsibility">
        You are solely responsible for: understanding the instruments you
        trade; sizing positions appropriately; executing through your own
        brokerage; tax compliance; regulatory compliance in your jurisdiction;
        deciding whether to act on any output of this platform.
      </Section>
      <Section title="Consult professionals">
        Before making material financial decisions, consult a licensed
        financial adviser, tax professional, and (where relevant) a lawyer
        in your jurisdiction.
      </Section>
    </>
  );
}

function ZhContent() {
  return (
    <>
      <Section title="非投资建议">
        本平台的输出——交易决策、目标仓位、置信度、分析师评论、回测结果——是<strong>决策支持，非投资建议</strong>。它们未根据您的财务状况、风险承受能力、税务情况或投资目标进行个性化定制。我们未在任何司法辖区注册为投资顾问、券商或财务规划师。
      </Section>
      <Section title="历史业绩 ≠ 未来表现">
        回测显示一个策略在历史上"假如应用"会怎样。它不保证未来表现。回测受以下因素影响：(a) 全集选择中的存活者偏差，(b) 数据提供方修订，(c) 模型成本与真实执行成本之间的差距，(d) 使历史模式失效的市场制度变化。真实业绩可能大幅偏离。
      </Section>
      <Section title="LLM 特有风险">
        决策由大语言模型产生，它们可能：
        <ul className="list-disc ml-5 space-y-1 mt-2">
          <li><strong>幻觉</strong>——编造底层数据中不存在的"事实"。</li>
          <li><strong>漂移</strong>——同一 prompt 在不同 call 给出不同答案。</li>
          <li><strong>偏见</strong>——判断中体现训练数据的偏见。</li>
          <li><strong>错误</strong>——即使表现得很自信。</li>
        </ul>
        我们用多源数据 + 结构化 prompt + 辩论 + 交叉验证缓解，但无法消除这些失败模式。把每个决策当作您自己分析的一个输入，不是最终结论。
      </Section>
      <Section title="交易有风险">
        您可能损失全部或绝大部分投入资金。杠杆放大损失。加密货币极其波动，几天内可能跌 50%+。A 股涨跌停板 + T+1 机制可能套牢仓位。外汇敞口叠加股票风险。
      </Section>
      <Section title="不保证可用性">
        本服务依赖第三方 LLM、数据和托管提供方，任何一方都可能失败、限流或随时停止服务。
      </Section>
      <Section title="您的责任">
        您对以下事项独自负责：了解您交易的金融工具；根据您的情况合理调整仓位；通过自己的券商执行交易；税务合规；所在司法辖区的监管合规；决定是否根据本平台任何输出采取行动。
      </Section>
      <Section title="咨询专业人士">
        在做出实质性财务决策前，请咨询所在司法辖区有牌照的财务顾问、税务专业人士及（必要时）律师。
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
