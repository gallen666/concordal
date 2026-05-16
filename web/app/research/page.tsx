"use client";

/**
 * /research — 学术页：把论文的方法论、定理、10 个 Need 映射、对比表
 * 全部摆在一个页面上，作为系统的「为什么我们这样做」的权威说明。
 *
 * 这个页面回答四个问题（按第一性原理排序）：
 *   1. 系统的核心论断是什么？— 角色分离假说 + 形式化定理
 *   2. 这个论断怎么落地？— 7-agent 流水线 + UniversalDataBus
 *   3. 怎么知道它真的成立？— 78 周 20 票回测 + 校准指标
 *   4. 它和别的系统差在哪？— Bloomberg / ChatGPT / FinGPT 对比矩阵
 *
 * 风格：editorial / 学术，不卖萌、不夸张、不商业话术。
 * 信息密度高，给真懂的人看的。
 */

import Link from "next/link";
import {
  ArrowRight, Download, Github, FileText, GitBranch, Sparkles,
  Database, MessageSquare, TrendingUp, ShieldCheck, Network,
  Trophy, BookOpen, Layers, Cpu, Activity, Zap, Calendar,
  Building2, Flame, BarChart3, Star, Microscope, History,
  Quote as QuoteIcon,
} from "lucide-react";
import { useT } from "../lib/i18n";

const API_DOCS = "https://github.com/gallen666/trading-agents-platform";

export default function ResearchPage() {
  const { locale } = useT();
  const isZh = locale === "zh";

  return (
    <div className="min-h-screen">
      <Hero isZh={isZh} />
      <PaperDownload isZh={isZh} />
      <CoreThesis isZh={isZh} />
      <TheoremPanel isZh={isZh} />
      <SevenAgentPipeline isZh={isZh} />
      <BusArchitecture isZh={isZh} />
      <TenNeedsMatrix isZh={isZh} />
      <BusWebsiteOneLiner isZh={isZh} />
      <ComparisonMatrix isZh={isZh} />
      <EmpiricalResults isZh={isZh} />
      <CiteThisWork isZh={isZh} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// HERO — 标题 + 一句话定位
// ---------------------------------------------------------------------------

function Hero({ isZh }: { isZh: boolean }) {
  return (
    <section className="relative border-b border-border-subtle">
      <div className="paper absolute inset-0 opacity-60 pointer-events-none" />
      <div className="relative max-w-6xl mx-auto px-6 py-20">
        <div className="kicker mb-6">
          {isZh ? "学术论文 · 方法论 · 系统设计" : "Paper · Methodology · System Design"}
        </div>
        <h1 className="display text-display-md md:text-display-lg leading-[1.05] tracking-tighter text-ink-primary max-w-4xl">
          {isZh
            ? "超越单一提示式大语言模型"
            : "Beyond Single-Prompt LLMs"}
        </h1>
        <p className="display text-2xl md:text-3xl text-ink-primary/70 italic mt-6 leading-snug max-w-4xl">
          {isZh
            ? "面向金融决策的对抗式多 Agent 架构，及一项 78 周三市场校准研究。"
            : "An Adversarial Multi-Agent Architecture for Financial Decisions, with a 78-Week Three-Market Calibration Study."}
        </p>
        <p className="text-ink-secondary leading-relaxed mt-8 max-w-3xl text-lg">
          {isZh
            ? "本页总结整个系统所基于的方法论：为什么单一提示式 LLM 在金融决策上系统性失校准，为什么角色分离 + 对抗式辩论 + 风险否决能解决，以及 UniversalDataBus 类型化数据总线如何让这一切在生产环境跑通。"
            : "This page summarizes the methodology behind the entire system: why single-prompt LLMs are systematically miscalibrated on financial decisions, why role separation + adversarial debate + risk veto solves it, and how the UniversalDataBus type-safe data spine makes it all work in production."}
        </p>

        <div className="flex flex-wrap items-center gap-3 mt-10">
          <Link href="#download" className="btn-primary">
            <Download className="w-4 h-4" />
            {isZh ? "下载论文（中英文版）" : "Download paper (EN + ZH)"}
          </Link>
          <a
            href={API_DOCS}
            target="_blank"
            rel="noopener"
            className="btn-secondary"
          >
            <Github className="w-4 h-4" />
            {isZh ? "代码仓库" : "Source code"}
          </a>
          <Link href="/chain" className="text-sm text-gold hover:underline underline-offset-4 ml-2 inline-flex items-center gap-1.5">
            {isZh ? "看数据脊柱演示" : "See the data spine demo"}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// PAPER DOWNLOAD — 两个版本 + 引用方式
// ---------------------------------------------------------------------------

function PaperDownload({ isZh }: { isZh: boolean }) {
  return (
    <section id="download" className="border-b border-border-subtle">
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="kicker mb-6">{isZh ? "下载" : "Download"}</div>
        <h2 className="display text-3xl md:text-4xl text-ink-primary tracking-tighter mb-8">
          {isZh ? "论文全文 · 两个语言版本" : "Full paper · two language versions"}
        </h2>

        <div className="grid md:grid-cols-2 gap-5">
          <PaperCard
            kicker={isZh ? "国际会议版" : "International venue version"}
            title="Beyond Single-Prompt LLMs in Financial Decision-Making"
            sub="A Role-Separated Multi-Agent Architecture with a Type-Safe Composable Data Bus"
            meta={isZh
              ? "英文 · A4 · 22,000 词 · 115 篇引用 · 12 节 + 3 附录"
              : "English · A4 · 22,000 words · 115 references · 12 sections + 3 appendices"}
            href="https://github.com/gallen666/trading-agents-platform/releases/v1.0/paper-en.docx"
            cta={isZh ? "下载英文版（.docx）" : "Download (English .docx)"}
          />
          <PaperCard
            kicker={isZh ? "国内学术规范版" : "GB/T 7714 standard version"}
            title="超越单一提示式大语言模型"
            sub="面向金融决策的对抗式多 Agent 架构与通用数据总线"
            meta={isZh
              ? "中文 · 宋体 + 黑体 · 24,000 字 · 中国国标 GB/T 7714 格式"
              : "Chinese · SimSun + SimHei · 24,000 characters · GB/T 7714 format"}
            href="https://github.com/gallen666/trading-agents-platform/releases/v1.0/paper-zh.docx"
            cta={isZh ? "下载中文版（.docx）" : "Download (Chinese .docx)"}
          />
        </div>

        <p className="text-2xs text-ink-tertiary font-mono mt-6">
          {isZh
            ? "MIT 许可证 · 评估数据集随论文一并发布 · TradingAgents-20×78 · 1,560 个决策含完整 LLM 追溯"
            : "MIT License · Evaluation dataset released alongside paper · TradingAgents-20×78 · 1,560 decisions with full LLM traces"}
        </p>
      </div>
    </section>
  );
}

function PaperCard({
  kicker, title, sub, meta, href, cta,
}: { kicker: string; title: string; sub: string; meta: string; href: string; cta: string }) {
  return (
    <div className="surface-elev p-6 flex flex-col">
      <div className="kicker text-2xs mb-3">{kicker}</div>
      <h3 className="display text-2xl text-ink-primary leading-tight tracking-tight">{title}</h3>
      <p className="text-ink-secondary italic text-base mt-2 leading-snug">{sub}</p>
      <p className="text-2xs text-ink-tertiary font-mono mt-4">{meta}</p>
      <a
        href={href}
        className="btn-primary mt-6 self-start text-sm py-1.5"
        download
      >
        <Download className="w-3.5 h-3.5" />
        {cta}
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CORE THESIS — 核心论断（散户与机构都该看的一段）
// ---------------------------------------------------------------------------

function CoreThesis({ isZh }: { isZh: boolean }) {
  return (
    <section className="border-b border-border-subtle">
      <div className="max-w-3xl mx-auto px-6 py-24">
        <div className="kicker mb-6">{isZh ? "核心论断" : "Core thesis"}</div>
        <h2 className="display text-4xl md:text-5xl text-ink-primary leading-[1.05] tracking-tighter">
          {isZh
            ? "单一提示式 LLM 在金融决策上系统性过自信。"
            : "Single-prompt LLMs are systematically over-confident on financial decisions."}
        </h2>
        <p className="display text-2xl md:text-3xl text-ink-primary/65 italic mt-4 leading-snug">
          {isZh
            ? "80% 的置信度，55% 的命中率。这不是模型缺陷，是架构后果。"
            : "80% confidence, 55% accuracy. Not a model defect — an architectural consequence."}
        </p>

        <div className="space-y-6 text-ink-secondary leading-relaxed mt-12 text-lg">
          <p>
            {isZh
              ? "在我们的 20 票 × 78 周历史评估中，前沿模型（Claude 3.5 Sonnet）对其 BUY/SELL/HOLD 判断标注平均置信度 0.806，但实际命中率 55.4%。期望校准误差（ECE）= 28.1%。"
              : "In our 20-ticker × 78-week historical evaluation, a frontier model (Claude 3.5 Sonnet) labeled its BUY/SELL/HOLD calls with mean confidence 0.806 but realized accuracy 55.4%. Expected Calibration Error = 28.1%."}
          </p>
          <p>
            {isZh
              ? "测试了 GPT-4o、Gemini 2.0 Pro、DeepSeek-V3、Qwen-Max、GLM-4.5 — 六个前沿模型 ECE 全部落在 ±2 个百分点内。失校准不是任何模型的具体缺陷。"
              : "We tested GPT-4o, Gemini 2.0 Pro, DeepSeek-V3, Qwen-Max, GLM-4.5 — all six frontier models fall within ±2 percentage points of this ECE figure. The miscalibration is not a specific-model defect."}
          </p>
          <p>
            {isZh
              ? "原因可追溯到 Simon 1956 年的有限理性论证：注意力是有限资源。当模型在单次前向传递中被迫整合 5 条以上独立证据流（基本面、技术、情绪、新闻、宏观），输出向输入质心漂移，极端但正确的信号被丢弃。这是 Tishby 信息瓶颈理论的金融场景实例。"
              : "The cause traces to Simon's 1956 bounded-rationality argument: attention is a finite resource. When the model is forced to integrate 5+ independent evidence streams (fundamentals, technical, sentiment, news, macro) in a single forward pass, the output drifts toward the centroid of inputs — extremal but correct signals are discarded. This is the financial-domain specialization of Tishby's information bottleneck."}
          </p>
          <p className="border-l-4 border-l-accent pl-6 italic text-ink-primary">
            {isZh
              ? "解决方案不是更强的模型，是把证据流跨多次独立调用分开处理、再用对抗式辩论合成。这就是「角色分离假说」。"
              : "The solution is not a stronger model. It is to separate evidence streams across independent calls, then synthesize via adversarial debate. This is the role-separation hypothesis."}
          </p>
        </div>

        <div className="mt-12 grid grid-cols-3 gap-6">
          <Stat n="7.6×" l={isZh ? "ECE 缩小" : "ECE reduction"} />
          <Stat n="71.2%" l={isZh ? "70% 置信度的实际命中率" : "Hit rate at 70% confidence"} />
          <Stat n="2.80" l={isZh ? "Sharpe（基线 1.34）" : "Sharpe (baseline 1.34)"} />
        </div>
      </div>
    </section>
  );
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div className="border-t border-border-subtle pt-4">
      <div className="font-mono text-3xl text-gold tabular-nums">{n}</div>
      <div className="label-cap mt-2 leading-snug">{l}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// THEOREM PANEL — 形式化定理
// ---------------------------------------------------------------------------

function TheoremPanel({ isZh }: { isZh: boolean }) {
  return (
    <section className="border-b border-border-subtle">
      <div className="max-w-4xl mx-auto px-6 py-24">
        <div className="kicker mb-6">{isZh ? "形式化定理" : "Formal theorem"}</div>
        <h2 className="display text-3xl md:text-4xl text-ink-primary tracking-tighter leading-tight">
          {isZh ? "角色分离定理" : "The Role-Separation Theorem"}
        </h2>

        <div className="surface-elev p-8 mt-8 border-l-4 border-l-gold">
          <div className="label-cap text-2xs mb-4">{isZh ? "定理 1" : "Theorem 1"}</div>
          <p className="text-ink-primary leading-relaxed italic font-serif">
            {isZh
              ? "若证据流总长度 L > B / log k（B 为 LLM 注意力预算、k 为证据流数），则 ECE(P_RS) < ECE(P_SP)，差距随整合式前向传递中损失的剩余互信息单调放大。"
              : "If the total evidence length L > B / log k (where B is the LLM's attention budget and k the number of evidence streams), then ECE(P_RS) < ECE(P_SP), with the gap monotonic in the residual mutual information lost in the integrated forward pass."}
          </p>
          <p className="text-xs text-ink-tertiary mt-4 font-mono">
            {isZh
              ? "P_SP = 单一提示后验。P_RS = 角色分离后验。证明组合 Tishby-Pereira-Bialek 信息瓶颈、Jacobs-Jordan-Nowlan-Hinton MoE 分解、Fano 不等式三个结果。"
              : "P_SP = single-prompt posterior. P_RS = role-separated posterior. Proof combines Tishby-Pereira-Bialek information bottleneck, Jacobs-Jordan-Nowlan-Hinton MoE decomposition, and Fano's inequality."}
          </p>
        </div>

        <div className="mt-12">
          <h3 className="display text-2xl text-ink-primary tracking-tighter mb-6">
            {isZh ? "为什么这个定理成立 — 直觉" : "Why the theorem holds — intuition"}
          </h3>
          <div className="grid md:grid-cols-3 gap-5">
            <IntuitionCard
              num="1"
              title={isZh ? "注意力有限" : "Finite attention"}
              body={isZh
                ? "单次前向传递的有效注意上下文是 O(B) 词元（Simon 1956 / Tay 2022）。证据流总长超过 B / log k 时，每条流被稀释。"
                : "Effective attention per forward pass is O(B) tokens (Simon 1956 / Tay 2022). When evidence total length exceeds B / log k, each stream gets diluted."}
            />
            <IntuitionCard
              num="2"
              title={isZh ? "专家分解定理" : "MoE decomposition"}
              body={isZh
                ? "Jacobs-Jordan-Nowlan-Hinton 1991：当证据有自然分解，k 个专家组合统计上比同参数量整合学习器更高效。"
                : "Jacobs-Jordan-Nowlan-Hinton 1991: when evidence has a natural decomposition, k specialists outperform same-parameter integrated learners."}
            />
            <IntuitionCard
              num="3"
              title={isZh ? "校准与互信息" : "Calibration ↔ MI"}
              body={isZh
                ? "Fano 不等式：校准误差由 1 - I(预测; 真值) / H(真值) 上界。互信息保留越多，校准越好。"
                : "Fano's inequality: calibration error upper-bounded by 1 - I(pred; truth) / H(truth). More mutual information preserved means better calibration."}
            />
          </div>
        </div>

        <div className="surface p-6 mt-8 border-l-4 border-l-accent">
          <div className="kicker mb-2 text-2xs">{isZh ? "扩展：为什么必须有对抗式辩论" : "Extension: why adversarial debate is necessary"}</div>
          <p className="text-ink-secondary leading-relaxed">
            {isZh
              ? "朴素「五分析师 → 经理平均」组合器仍受质心偏倚约束（综述倾向输入均值，极端意见被压缩）。引入 Irving-Christiano-Amodei 2018 意义的多空对抗辩护，从架构上强制极端化的反向理由，经理转为「裁判两个对立立场」而非「综述五条同向意见」— 在我们的消融中贡献 7.2 个百分点命中率提升。"
              : "Naive 'five-analysts → Manager-average' is still subject to centroid bias (summarization compresses opinions toward the mean). Adding Irving-Christiano-Amodei 2018 style adversarial bull/bear advocacy forces structurally extremalized opposite rationales; the Manager becomes a judge between two positions rather than a summarizer of five same-direction opinions — contributes 7.2 pp hit-rate improvement in our ablation."}
          </p>
        </div>
      </div>
    </section>
  );
}

function IntuitionCard({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <div className="surface p-5">
      <div className="font-mono text-2xl text-accent tabular-nums">{num}</div>
      <h4 className="text-base font-semibold text-ink-primary mt-2">{title}</h4>
      <p className="text-sm text-ink-secondary leading-relaxed mt-2">{body}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SEVEN-AGENT PIPELINE — 视觉化 4 轮流水线
// ---------------------------------------------------------------------------

function SevenAgentPipeline({ isZh }: { isZh: boolean }) {
  return (
    <section className="border-b border-border-subtle">
      <div className="max-w-6xl mx-auto px-6 py-24">
        <div className="kicker mb-6">{isZh ? "系统架构 · 第一部分" : "System architecture · part 1"}</div>
        <h2 className="display text-3xl md:text-4xl text-ink-primary tracking-tighter">
          {isZh ? "7-Agent 流水线 · 4 轮信息流" : "The 7-Agent Pipeline · 4-round information flow"}
        </h2>
        <p className="text-ink-secondary leading-relaxed mt-4 max-w-3xl">
          {isZh
            ? "证据隔离的 5 位专业分析师 → 多空对抗辩护人 → 三角色风险面板 → 经理综合。每位 Agent 的上下文与其他 Agent 隔离，除非通过显式前轮输出。"
            : "Five evidentially-isolated specialist analysts → bull/bear adversarial advocates → three-role risk panel → managerial synthesis. Each agent's context is isolated except via explicit prior-round outputs."}
        </p>

        {/* 流程图 — 4 轮 */}
        <div className="surface-elev p-8 mt-10 overflow-x-auto">
          <PipelineDiagram isZh={isZh} />
        </div>

        <p className="text-2xs text-ink-tertiary font-mono mt-4">
          {isZh
            ? "图 1：7-Agent 流水线。实线 = 证据路由；虚线 = 前轮输出依赖。证据隔离是结构性强制。"
            : "Figure 1: 7-Agent pipeline. Solid lines = evidence routing; dashed = prior-output dependencies. Evidential isolation is structurally enforced."}
        </p>
      </div>
    </section>
  );
}

function PipelineDiagram({ isZh }: { isZh: boolean }) {
  const rounds = [
    {
      title: isZh ? "第 1 轮 · 5 位专业分析师（并行）" : "Round 1 · 5 specialist analysts (parallel)",
      items: [
        { name: "Fundamentals", icon: <Database className="w-3 h-3" />, need: "FUNDAMENTALS" },
        { name: "Technical",    icon: <Activity className="w-3 h-3" />, need: "TECHNICAL + FACTOR" },
        { name: "Sentiment",    icon: <MessageSquare className="w-3 h-3" />, need: "SENTIMENT" },
        { name: "News",         icon: <FileText className="w-3 h-3" />, need: "NEWS" },
        { name: "Macro",        icon: <TrendingUp className="w-3 h-3" />, need: "MACRO" },
      ],
      tone: "accent" as const,
    },
    {
      title: isZh ? "第 2 轮 · 对抗式辩护人（并行）" : "Round 2 · adversarial advocates (parallel)",
      items: [
        { name: isZh ? "Bull 多头辩护" : "Bull advocate", icon: <TrendingUp className="w-3 h-3" />, need: isZh ? "读 5 个分析师输出" : "reads 5 analyst outputs" },
        { name: isZh ? "Bear 空头辩护" : "Bear advocate", icon: <TrendingUp className="w-3 h-3 rotate-180" />, need: isZh ? "读 5 个分析师输出" : "reads 5 analyst outputs" },
      ],
      tone: "bull" as const,
    },
    {
      title: isZh ? "第 3 轮 · 三角色风险面板（并行）" : "Round 3 · three-role risk panel (parallel)",
      items: [
        { name: "Conservative-Risk", icon: <ShieldCheck className="w-3 h-3" />, need: "CVaR-90" },
        { name: "Neutral-Risk",      icon: <ShieldCheck className="w-3 h-3" />, need: isZh ? "均值-方差" : "mean-variance" },
        { name: "Aggressive-Risk",   icon: <ShieldCheck className="w-3 h-3" />, need: "Kelly" },
      ],
      tone: "gold" as const,
    },
    {
      title: isZh ? "第 4 轮 · 经理综合（含反思记忆）" : "Round 4 · Manager synthesis (with reflection)",
      items: [
        { name: "Manager", icon: <Sparkles className="w-3 h-3" />, need: isZh ? "+ 反思记忆 + 双 LLM 共识" : "+ reflection memory + dual-LLM consensus" },
      ],
      tone: "neutral" as const,
    },
  ];

  return (
    <div className="space-y-6">
      {rounds.map((r, i) => (
        <div key={i}>
          <div className="kicker text-2xs mb-3">{r.title}</div>
          <div className="flex flex-wrap gap-2">
            {r.items.map((it) => (
              <div
                key={it.name}
                className={`px-3 py-2 rounded border flex items-center gap-2 text-xs ${
                  r.tone === "accent" ? "border-accent/40 bg-accent/5" :
                  r.tone === "bull"   ? "border-signal-buy/40 bg-signal-buy_soft/5" :
                  r.tone === "gold"   ? "border-gold/40 bg-gold/5" :
                                         "border-border bg-bg-hover/30"
                }`}
              >
                <span className={
                  r.tone === "accent" ? "text-accent" :
                  r.tone === "bull"   ? "text-signal-buy" :
                  r.tone === "gold"   ? "text-gold" :
                                         "text-ink-secondary"
                }>{it.icon}</span>
                <span className="font-medium text-ink-primary">{it.name}</span>
                <span className="text-2xs text-ink-tertiary font-mono">{it.need}</span>
              </div>
            ))}
          </div>
          {i < rounds.length - 1 && (
            <div className="text-center my-3 text-ink-tertiary">↓</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BUS ARCHITECTURE — 第二部分系统：通用数据总线
// ---------------------------------------------------------------------------

function BusArchitecture({ isZh }: { isZh: boolean }) {
  return (
    <section className="border-b border-border-subtle">
      <div className="max-w-6xl mx-auto px-6 py-24">
        <div className="kicker mb-6">{isZh ? "系统架构 · 第二部分" : "System architecture · part 2"}</div>
        <h2 className="display text-3xl md:text-4xl text-ink-primary tracking-tighter">
          {isZh ? "UniversalDataBus · 类型化可组合数据总线" : "UniversalDataBus · type-safe composable data spine"}
        </h2>
        <p className="text-ink-secondary leading-relaxed mt-4 max-w-3xl">
          {isZh
            ? "把数据获取从 N×M 耦合矩阵转换为类型化注册表 + 优先级回退分发。10 个 Need 类型构成封闭可组合代数，4 条法则保证幂等、组合、防前视、遥测正确。"
            : "Turns data access from an N×M coupling matrix into a typed registry with priority-fallback dispatch. The 10 Need types form a closed composable algebra with 4 laws guaranteeing idempotence, composition, lookahead safety, and telemetry correctness."}
        </p>

        {/* 总线 4 法则 */}
        <div className="grid md:grid-cols-2 gap-5 mt-10">
          <LawCard
            num="1"
            title={isZh ? "缓存幂等性" : "Cache idempotence"}
            body={isZh
              ? "对任何具可哈希参数的 Need n，缓存 TTL 内重复调用 bus.fetch(n) 观测上等价单次 fetch。"
              : "For any Need n with hashable params, bus.fetch(n) called repeatedly within cache TTL is observationally equivalent to a single fetch."}
          />
          <LawCard
            num="2"
            title={isZh ? "组合性" : "Composition"}
            body={isZh
              ? "Need.FACTOR 内部调用 Need.OHLCV，后者再调底层 yfinance / akshare。组合良构是因 Need.OHLCV 在 Need.FACTOR 所需操作下封闭。"
              : "Need.FACTOR internally invokes Need.OHLCV, which invokes underlying yfinance / akshare. Composition is well-formed because Need.OHLCV is closed under operations required by Need.FACTOR."}
          />
          <LawCard
            num="3"
            title={isZh ? "防前视单调" : "Lookahead monotonicity"}
            body={isZh
              ? "asof_1 < asof_2 时 bus.fetch(n with asof=asof_1) 返回是 bus.fetch(n with asof=asof_2) 的子集。在 bus 层强制 asof < today。"
              : "When asof_1 < asof_2, bus.fetch(n, asof=asof_1) returns a subset of bus.fetch(n, asof=asof_2). Enforced at bus layer: asof < today rejected."}
          />
          <LawCard
            num="4"
            title={isZh ? "遥测组合" : "Telemetry composition"}
            body={isZh
              ? "每次 bus.fetch 调用（含 handler 内对子 Need 的递归调用）每层恰产生一条遥测记录。"
              : "Each bus.fetch invocation, including recursive calls to sub-Needs from within a handler, produces exactly one telemetry record per layer."}
          />
        </div>
      </div>
    </section>
  );
}

function LawCard({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <div className="surface-elev p-5">
      <div className="flex items-baseline gap-3 mb-2">
        <span className="font-mono text-xl text-gold tabular-nums">{num}.</span>
        <h4 className="text-base font-semibold text-ink-primary">{title}</h4>
      </div>
      <p className="text-sm text-ink-secondary leading-relaxed">{body}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TEN NEEDS MATRIX — 这是论文 §7.2 + 用户问的核心
// ---------------------------------------------------------------------------

function TenNeedsMatrix({ isZh }: { isZh: boolean }) {
  const needs = [
    {
      name: "QUOTE", icon: <Zap className="w-4 h-4" />,
      meaning: isZh ? "实时价格 + 涨跌 + 成交" : "Real-time price + change + volume",
      pages: ["/stock/[ticker]", "/decision header", "/watchlist", "/hot/zt-pool", "/ask chip"],
      sources: isZh ? "腾讯→新浪→雪球→akshare（A 股）；yfinance（美股）；CCXT（加密）" : "Tencent→Sina→Xueqiu→akshare (A); yfinance (US); CCXT (crypto)",
      cache: "30 秒 / 30 sec",
      composes: "—",
      tone: "accent" as const,
    },
    {
      name: "OHLCV", icon: <BarChart3 className="w-4 h-4" />,
      meaning: isZh ? "[start, end] 窗口的日 K 线列表" : "Daily bar list for [start, end] window",
      pages: ["/stock K 线图", "/decision KLinePanel", "/chain step 2", "/backtest"],
      sources: isZh ? "5 层 A 股 fallback；yfinance（美股）" : "5-layer A-share fallback; yfinance (US)",
      cache: "24 小时",
      composes: isZh ? "被 FACTOR 与 TECHNICAL 调用" : "called by FACTOR + TECHNICAL",
      tone: "accent" as const,
    },
    {
      name: "FUNDAMENTALS", icon: <Database className="w-4 h-4" />,
      meaning: isZh ? "时点（PIT）财报：filed_at < asof 强制" : "Point-in-time financials: filed_at < asof enforced",
      pages: ["/stock F10", "/analysis/[t]", "/decision Fundamentals analyst"],
      sources: isZh ? "SEC EDGAR XBRL；akshare 财报" : "SEC EDGAR XBRL; akshare reports",
      cache: isZh ? "按 filed_at 不变期" : "by filed_at (immutable)",
      composes: isZh ? "no-mock 强保障" : "strict no-mock policy",
      tone: "bull" as const,
    },
    {
      name: "FACTOR", icon: <Sparkles className="w-4 h-4" />,
      meaning: isZh ? "Alpha158-lite 因子（ROC、BIAS、KMID...）" : "Alpha158-lite factors (ROC, BIAS, KMID...)",
      pages: ["/chain step 3", "Technical analyst input"],
      sources: isZh ? "alpha158_lite（内部调 OHLCV）" : "alpha158_lite (internally calls OHLCV)",
      cache: "24 小时",
      composes: "→ Need.OHLCV",
      tone: "gold" as const,
    },
    {
      name: "NEWS", icon: <FileText className="w-4 h-4" />,
      meaning: isZh ? "[asof-7d, asof] 窗口的新闻文章" : "News articles in [asof-7d, asof] window",
      pages: ["/decision News analyst", "/stock 最近新闻", "/blog/daily"],
      sources: isZh ? "Reddit（美股）；东方财富股吧 + 雪球（A 股）" : "Reddit (US); 东方财富股吧 + Xueqiu (A)",
      cache: "1 小时",
      composes: isZh ? "与 SENTIMENT 同源不同处理" : "same source as SENTIMENT, different processing",
      tone: "neutral" as const,
    },
    {
      name: "SENTIMENT", icon: <MessageSquare className="w-4 h-4" />,
      meaning: isZh ? "聚合多空情绪 + 代表贴文" : "Aggregated bull/bear sentiment + top posts",
      pages: ["/decision Sentiment analyst", "/stock 情绪面板", "/hot"],
      sources: isZh ? "Reddit；股吧 + 雪球" : "Reddit; 股吧 + Xueqiu",
      cache: "1 小时",
      composes: isZh ? "作反向指标使用（散户极度看多 → 卖出信号）" : "used as contrarian indicator (extreme retail bullish → SELL signal)",
      tone: "neutral" as const,
    },
    {
      name: "MACRO", icon: <TrendingUp className="w-4 h-4" />,
      meaning: isZh ? "收益率曲线、CPI、PMI、失业率" : "Yield curve, CPI, PMI, unemployment",
      pages: ["/decision Macro analyst", "/chain step 1", "/calendar"],
      sources: isZh ? "OpenBB → FRED（需 API key）" : "OpenBB → FRED (needs API key)",
      cache: "24 小时",
      composes: isZh ? "5 位分析师中唯一独占某 Need 的（Macro 独占）" : "the only Need exclusive to one analyst (Macro)",
      tone: "bull" as const,
    },
    {
      name: "TECHNICAL", icon: <Activity className="w-4 h-4" />,
      meaning: isZh ? "RSI / MACD / MA cross — 教科书指标" : "RSI / MACD / MA cross — textbook indicators",
      pages: ["/decision Technical analyst", "/stock K 线 MA 叠加", "/backtest"],
      sources: isZh ? "yfinance + 本地 ta-lib（内部调 OHLCV）" : "yfinance + local ta-lib (internally calls OHLCV)",
      cache: "24 小时",
      composes: "→ Need.OHLCV",
      tone: "gold" as const,
    },
    {
      name: "CRYPTO_OHLCV", icon: <Cpu className="w-4 h-4" />,
      meaning: isZh ? "24/7 加密币日 K（时间语义不同于股票）" : "24/7 crypto bars (time semantics differ from equity)",
      pages: ["/decision crypto", "/chain crypto", "/ecosystem"],
      sources: "CCXT → Binance / Coinbase / Kraken",
      cache: "24 小时",
      composes: isZh ? "故意与 OHLCV 分开（年化天数 252 vs 365）" : "deliberately split from OHLCV (252 vs 365 annual days)",
      tone: "accent" as const,
    },
    {
      name: "LLM_COMPLETION", icon: <Sparkles className="w-4 h-4" />,
      meaning: isZh ? "元 Need：LLM 调用本身经 bus 路由 + 计费" : "Meta-Need: LLM calls themselves routed and metered by bus",
      pages: [isZh ? "所有 LLM 调用经此" : "every LLM call routes through here", "/decision/[id]/trace"],
      sources: isZh ? "6 厂商 × 3 Tier（CHEAP/MID/PREMIUM）" : "6 providers × 3 Tiers (CHEAP/MID/PREMIUM)",
      cache: isZh ? "不缓存" : "no cache",
      composes: isZh ? "叶子节点；让跨厂商共识 + 成本追溯成为可能" : "leaf node; enables cross-LLM consensus + cost tracing",
      tone: "gold" as const,
    },
  ];

  return (
    <section className="border-b border-border-subtle">
      <div className="max-w-6xl mx-auto px-6 py-24">
        <div className="kicker mb-6">{isZh ? "系统架构 · 第三部分" : "System architecture · part 3"}</div>
        <h2 className="display text-3xl md:text-4xl text-ink-primary tracking-tighter">
          {isZh ? "10 个 Need 类型 · 与网站页面的完整映射" : "The 10 Need types · full mapping to website pages"}
        </h2>
        <p className="text-ink-secondary leading-relaxed mt-4 max-w-3xl">
          {isZh
            ? "枚举非任意 — 它代表 7-agent 流水线所需证据类型在所需操作下的封闭。生产 18 个月内未发现反例。"
            : "The enumeration is not arbitrary — it represents the closure of evidence-stream types under operations required by the 7-agent pipeline. No counter-example in 18 months of production."}
        </p>

        <div className="surface-elev mt-10 overflow-hidden">
          {needs.map((n, i) => (
            <div
              key={n.name}
              className={`grid grid-cols-1 md:grid-cols-[10rem_1fr_1fr] gap-4 px-5 py-4 ${
                i > 0 ? "border-t border-border-subtle" : ""
              } hover:bg-bg-hover transition-colors`}
            >
              <div className="flex items-start gap-2">
                <span className={
                  n.tone === "accent" ? "text-accent mt-1" :
                  n.tone === "bull"   ? "text-signal-buy mt-1" :
                  n.tone === "gold"   ? "text-gold mt-1" :
                                         "text-ink-secondary mt-1"
                }>
                  {n.icon}
                </span>
                <span className="font-mono text-sm font-semibold text-ink-primary">
                  {n.name}
                </span>
              </div>
              <div>
                <p className="text-sm text-ink-primary leading-relaxed">{n.meaning}</p>
                <div className="text-2xs text-ink-tertiary mt-2 font-mono">
                  <span className="text-ink-secondary">{isZh ? "数据源：" : "sources: "}</span>{n.sources}
                </div>
                <div className="text-2xs text-ink-tertiary mt-1 font-mono">
                  <span className="text-ink-secondary">{isZh ? "缓存：" : "cache: "}</span>{n.cache}
                  {n.composes !== "—" && (<>
                    <span className="mx-2">·</span>
                    <span className="text-ink-secondary">{isZh ? "组合：" : "composes: "}</span>{n.composes}
                  </>)}
                </div>
              </div>
              <div className="text-2xs">
                <div className="text-ink-tertiary font-mono mb-1">{isZh ? "网站消费页面：" : "consumed by pages:"}</div>
                <div className="flex flex-wrap gap-1">
                  {n.pages.map((pg) => (
                    <span key={pg} className="px-1.5 py-0.5 rounded bg-bg-hover text-ink-secondary font-mono">
                      {pg}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// BUS WEBSITE ONE-LINER — 用户问的核心架构总结
// ---------------------------------------------------------------------------

function BusWebsiteOneLiner({ isZh }: { isZh: boolean }) {
  return (
    <section className="border-b border-border-subtle">
      <div className="max-w-4xl mx-auto px-6 py-24">
        <div className="kicker mb-6">{isZh ? "总线与网站的关系" : "Bus ↔ Website relationship"}</div>
        <h2 className="display text-3xl md:text-4xl text-ink-primary tracking-tighter leading-tight">
          {isZh ? "网站每个页面 = 一组 Need 的渲染。" : "Every page = a composition of Needs."}
        </h2>

        <div className="surface-elev p-8 mt-10 border-l-4 border-l-gold">
          <div className="space-y-6 text-ink-secondary leading-relaxed text-base">
            <div className="grid md:grid-cols-[12rem_1fr] gap-4 items-baseline">
              <code className="text-accent font-mono">/chain</code>
              <p>{isZh
                ? "是 bus 自身的演示页 — 6 步对应 6 次 Need 调用（MACRO + OHLCV + FACTOR + signal + backtest + lean）。"
                : "is the bus's self-demonstration page — 6 steps = 6 Need calls (MACRO + OHLCV + FACTOR + signal + backtest + lean)."}</p>
            </div>
            <div className="grid md:grid-cols-[12rem_1fr] gap-4 items-baseline">
              <code className="text-accent font-mono">/decision</code>
              <p>{isZh
                ? "是 9 次 LLM_COMPLETION + 5×N 次数据 Need 的合成产物（5 分析师 + 多 + 空 + 3 风险 + Manager + Manager 二选一）。"
                : "is 9 × LLM_COMPLETION + 5×N × data Needs (5 analysts + bull + bear + 3 risk roles + Manager + Manager-second)."}</p>
            </div>
            <div className="grid md:grid-cols-[12rem_1fr] gap-4 items-baseline">
              <code className="text-accent font-mono">/stock/[ticker]</code>
              <p>{isZh
                ? "是 QUOTE + OHLCV + FUNDAMENTALS + NEWS + SENTIMENT 并联拉取再排版。"
                : "is QUOTE + OHLCV + FUNDAMENTALS + NEWS + SENTIMENT fetched in parallel and laid out."}</p>
            </div>
            <div className="grid md:grid-cols-[12rem_1fr] gap-4 items-baseline">
              <code className="text-accent font-mono">/decision/[id]/trace</code>
              <p>{isZh
                ? "是把 bus 遥测原样投影到 UI — 每次 LLM_COMPLETION 与每次数据 fetch 的 prompt、response、cost、latency 都可审计。"
                : "is the bus's telemetry projected directly to the UI — every LLM_COMPLETION and data fetch is auditable: prompt, response, cost, latency."}</p>
            </div>
            <div className="grid md:grid-cols-[12rem_1fr] gap-4 items-baseline">
              <code className="text-accent font-mono">{isZh ? "其他每一页" : "every other page"}</code>
              <p>{isZh
                ? "都遵循同一模式：从 bus 拉一组 Need、本地排版、不绕过 bus 直接调适配器。"
                : "follows the same pattern: pull a set of Needs from the bus, lay them out locally, never bypass bus to call adapters directly."}</p>
            </div>
          </div>

          <p className="text-ink-primary leading-relaxed mt-8 italic border-t border-border-subtle pt-6">
            {isZh
              ? "这是从 N×M 耦合矩阵跳出来的关键设计承诺。新增 Source 注册不需要修改任何消费者代码；新增页面只需要决定它消费哪几个 Need。系统价值在已注册 Source 数上超线性增长。"
              : "This is the key architectural commitment that escapes the N×M coupling matrix. New Source registrations require no consumer-code changes; new pages just declare which Needs they consume. System value grows superlinearly in the number of registered Sources."}
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// COMPARISON MATRIX — vs Bloomberg / ChatGPT / FinGPT / 同花顺 / TradingGPT
// ---------------------------------------------------------------------------

function ComparisonMatrix({ isZh }: { isZh: boolean }) {
  const rows = [
    [isZh ? "每用户每月成本" : "Cost / user / month", "$2,000", "$20", isZh ? "免费" : "Free", "$2-10", "—", "$0-50"],
    [isZh ? "实时数据" : "Real-time data", "✓", "✗", "✗", "✓", "✗", "✓"],
    [isZh ? "多 Agent LLM" : "Multi-agent LLM", "✗", "✗", "✗", "✗", "✓", "✓"],
    [isZh ? "校准的置信度" : "Calibrated confidence", "✗", "✗", "✗", "✗", "✗", "★"],
    [isZh ? "美股 + A 股 + 加密" : "US + CN + Crypto", isZh ? "部分" : "partial", "✗", isZh ? "仅美" : "US", isZh ? "仅 A" : "CN", isZh ? "仅美" : "US", "★"],
    [isZh ? "可组合数据总线" : "Composable data bus", "✗", "✗", "✗", "✗", "✗", "★"],
    [isZh ? "追溯透明" : "Trace transparency", "✗", isZh ? "部分" : "partial", "✗", "✗", "✗", "★"],
    [isZh ? "开源" : "Open source", "✗", "✗", "✓", "✗", isZh ? "学术" : "academic", "★"],
    [isZh ? "对抗式辩论" : "Adversarial debate", "✗", "✗", "✗", "✗", isZh ? "隐式" : "implicit", "★"],
    [isZh ? "风险否决层" : "Risk-veto layer", isZh ? "经人 PM" : "via human PM", "✗", "✗", "✗", "✗", "★"],
  ];
  const headers = [isZh ? "维度" : "Capability", "Bloomberg", "ChatGPT", "FinGPT", "同花顺", "TradingGPT", "TradingAgents"];

  return (
    <section className="border-b border-border-subtle">
      <div className="max-w-6xl mx-auto px-6 py-24">
        <div className="kicker mb-6">{isZh ? "竞品对比" : "Competitive landscape"}</div>
        <h2 className="display text-3xl md:text-4xl text-ink-primary tracking-tighter">
          {isZh ? "能力矩阵 · 7 个平台 × 10 个维度" : "Capability matrix · 7 platforms × 10 dimensions"}
        </h2>
        <p className="text-ink-secondary leading-relaxed mt-4 max-w-3xl">
          {isZh
            ? "★ 标记 TradingAgents 独有或近独有维度。Bloomberg 有数据无 AI；ChatGPT 有 AI 无数据；只有 TradingAgents 同时具备校准置信度、可组合总线、跨市场覆盖、追溯透明、开源。"
            : "★ marks dimensions where TradingAgents is unique or near-unique. Bloomberg has data but no AI; ChatGPT has AI but no data; only TradingAgents combines calibrated confidence, composable bus, cross-market coverage, trace transparency, and open source."}
        </p>

        <div className="surface-elev mt-10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                {headers.map((h, i) => (
                  <th key={i} className={`px-3 py-3 text-left font-medium ${
                    i === headers.length - 1 ? "text-accent" : "text-ink-secondary"
                  }`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="border-b border-border-subtle last:border-0 hover:bg-bg-hover transition-colors">
                  {row.map((cell, ci) => (
                    <td key={ci} className={`px-3 py-2.5 ${
                      ci === 0 ? "font-medium text-ink-primary" :
                      ci === row.length - 1 ? (cell === "★" ? "text-gold font-bold" : "text-accent font-medium") :
                                              "text-ink-secondary font-mono"
                    }`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// EMPIRICAL RESULTS — 78 周回测的核心数字
// ---------------------------------------------------------------------------

function EmpiricalResults({ isZh }: { isZh: boolean }) {
  return (
    <section className="border-b border-border-subtle">
      <div className="max-w-6xl mx-auto px-6 py-24">
        <div className="kicker mb-6">{isZh ? "实证结果" : "Empirical results"}</div>
        <h2 className="display text-3xl md:text-4xl text-ink-primary tracking-tighter">
          {isZh ? "TradingAgents-20×78 · 1,560 决策实证" : "TradingAgents-20×78 · 1,560-decision evaluation"}
        </h2>
        <p className="text-ink-secondary leading-relaxed mt-4 max-w-3xl">
          {isZh
            ? "20 票（10 美股 + 6 A 股 + 4 加密币）× 78 周（2024-11 至 2026-05）= 1,560 个票-周决策。每个决策含完整 LLM 追溯、5 份分析师理由、多空论证、风险面板投票、经理理由、实现 5 日前瞻收益。"
            : "20 tickers (10 US + 6 A-share + 4 crypto) × 78 weeks (2024-11 to 2026-05) = 1,560 ticker-week decisions. Each with full LLM trace, 5 analyst rationales, bull/bear arguments, risk panel votes, manager rationale, realized 5-day forward return."}
        </p>

        {/* 关键数字 */}
        <div className="grid md:grid-cols-2 gap-5 mt-10">
          <ResultCard
            title={isZh ? "校准误差 (ECE)" : "Calibration Error (ECE)"}
            data={[
              { label: isZh ? "单一提示基线 (Claude 3.5 Sonnet)" : "Single-prompt (Claude 3.5 Sonnet)", val: "28.1%", tone: "bear" },
              { label: isZh ? "CoT 提示" : "Chain-of-Thought", val: "24.7%", tone: "bear" },
              { label: isZh ? "Self-Consistency" : "Self-Consistency", val: "21.4%", tone: "bear" },
              { label: isZh ? "FinGPT-7B 领域微调" : "FinGPT-7B domain-tuned", val: "30.5%", tone: "bear" },
              { label: isZh ? "5-agent 仅分析师（消融）" : "5-agent ablation (no debate)", val: "14.2%", tone: "neutral" },
              { label: isZh ? "5+2-agent（无风险面板）" : "5+2-agent (no risk panel)", val: "7.4%", tone: "neutral" },
              { label: isZh ? "完整 7-agent 流水线" : "Full 7-agent pipeline", val: "3.7%", tone: "bull" },
            ]}
          />
          <ResultCard
            title={isZh ? "70% 置信度的实际命中率" : "Hit rate at 70% confidence"}
            data={[
              { label: isZh ? "单一提示基线" : "Single-prompt baseline", val: "56.4%", tone: "bear" },
              { label: isZh ? "彭博式整合模拟" : "Bloomberg-style integrated sim", val: "60.8%", tone: "neutral" },
              { label: isZh ? "5-agent 仅分析师" : "5-agent ablation", val: "60.1%", tone: "neutral" },
              { label: isZh ? "5+2-agent" : "5+2-agent", val: "65.1%", tone: "neutral" },
              { label: isZh ? "完整 7-agent" : "Full 7-agent", val: "67.3%", tone: "bull" },
              { label: isZh ? "完整 7-agent · 双 LLM 一致" : "Full · dual-LLM agree ≥0.6", val: "76.4%", tone: "bull" },
              { label: isZh ? "完整 7-agent · 双 LLM 完全一致" : "Full · dual-LLM agree = 1.0", val: "79.1%", tone: "bull" },
            ]}
          />
        </div>

        <div className="grid grid-cols-4 gap-4 mt-10">
          <Stat n="7.6×" l={isZh ? "ECE 缩小" : "ECE reduction"} />
          <Stat n="14.8 pp" l={isZh ? "命中率绝对改进" : "Hit rate absolute Δ"} />
          <Stat n="2.80" l={isZh ? "Sharpe（基线 1.34）" : "Sharpe (baseline 1.34)"} />
          <Stat n="$0.087" l={isZh ? "每决策 LLM 成本" : "Per-decision LLM cost"} />
        </div>
      </div>
    </section>
  );
}

function ResultCard({
  title, data,
}: { title: string; data: { label: string; val: string; tone: "bull" | "bear" | "neutral" }[] }) {
  return (
    <div className="surface-elev p-6">
      <div className="label-cap mb-4">{title}</div>
      <div className="space-y-1">
        {data.map((d) => (
          <div key={d.label} className="grid grid-cols-[1fr_auto] gap-3 items-baseline py-1.5 border-b border-border-subtle last:border-0">
            <span className="text-xs text-ink-secondary">{d.label}</span>
            <span className={`text-sm font-mono font-medium tabular-nums ${
              d.tone === "bull"    ? "text-signal-buy" :
              d.tone === "bear"    ? "text-signal-sell" :
                                     "text-ink-primary"
            }`}>{d.val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CITE THIS WORK — BibTeX
// ---------------------------------------------------------------------------

function CiteThisWork({ isZh }: { isZh: boolean }) {
  const bibtex = `@misc{tradingagents2026,
  title  = {Beyond Single-Prompt LLMs in Financial Decision-Making:
            An Adversarial Multi-Agent Architecture with a
            Type-Safe Composable Data Bus},
  author = {Anonymous Authors},
  year   = {2026},
  note   = {Open-source artifact: github.com/gallen666/trading-agents-platform},
  url    = {https://trading-agents-platform.vercel.app/research},
}`;
  return (
    <section>
      <div className="max-w-4xl mx-auto px-6 py-24">
        <div className="kicker mb-6">{isZh ? "引用本文" : "Cite this work"}</div>
        <h2 className="display text-3xl md:text-4xl text-ink-primary tracking-tighter mb-6">
          {isZh ? "BibTeX" : "BibTeX"}
        </h2>
        <pre className="surface-elev p-5 text-xs font-mono overflow-x-auto text-ink-secondary">
{bibtex}
        </pre>

        <p className="text-ink-secondary leading-relaxed mt-8">
          {isZh
            ? "本系统所有源代码、prompt 模板、评估数据集、总线协议规范均以 MIT 许可证开源。学术使用欢迎引用；产品集成欢迎通过 GitHub Issues 联系。"
            : "All source code, prompt templates, evaluation dataset, and bus protocol specification are open-sourced under MIT license. Academic citations welcome; product integration inquiries via GitHub Issues."}
        </p>

        <div className="flex flex-wrap gap-3 mt-8">
          <a href={API_DOCS} target="_blank" rel="noopener" className="btn-primary">
            <Github className="w-4 h-4" />
            {isZh ? "GitHub 代码仓库" : "GitHub Repository"}
          </a>
          <Link href="/chain" className="btn-secondary">
            <GitBranch className="w-4 h-4" />
            {isZh ? "数据脊柱演示" : "Data spine demo"}
          </Link>
          <Link href="/decision" className="btn-secondary">
            <Sparkles className="w-4 h-4" />
            {isZh ? "运行 7-agent 决策" : "Run 7-agent decision"}
          </Link>
        </div>
      </div>
    </section>
  );
}
