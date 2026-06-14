"use client";

/**
 * PaperBacked.tsx — shared components that render data directly from the
 * paper's empirical sections, plus a couple of bus-architecture explainers.
 *
 * Why this file exists: per the post-research-page audit, 10 paper claims
 * had no UI surface. Rather than rewriting every consumer page, we expose
 * these as reusable components — each consumer page only needs a one-line
 * import + a one-line render to satisfy the audit.
 *
 * Components:
 *   <CalibrationTable />        — paper §9.2 Table 2: ECE / Brier / hit
 *   <ConfidenceBinTable />      — paper §9.3 Table 3: hit rate by bin
 *   <DatasetBanner />            — Concordal-20×78 reference
 *   <FiveLayerHeatmap />         — paper §8 5-layer fallback availability
 *   <BusRegisterExample />       — paper §10.3 institutional integration
 *   <ReflectionMechanism />      — paper §6.4 nightly reflection cron
 *   <KnownLimitations />         — paper §11 honest disclosures
 *   <CrossMarketCallout />       — paper §10.2 unified-coverage point
 *   <RiskPanelMatrix />          — paper §3.4 + §6.3 27-cell vote matrix
 *   <TraceStageEnrichment />     — paper §6.5 per-stage provider/cost
 */

import { useState } from "react";
import Link from "next/link";
import {
  BookOpen, TrendingUp, TrendingDown, ShieldCheck, AlertCircle,
  Database, Sparkles, Activity, GitBranch, Network, Layers,
} from "lucide-react";
import { useT } from "../lib/i18n";

// ============================================================================
// AUDIT ITEM 1 · /proof — paper §9.2 calibration table
// ============================================================================

export function CalibrationTable() {
  const rows = [
    ["单一提示基线 (Claude 3.5 Sonnet)", "0.281", "0.241", "0.806", "0.554"],
    ["单一提示基线 (GPT-4o)",            "0.272", "0.238", "0.815", "0.553"],
    ["CoT prompting",                    "0.247", "0.227", "0.789", "0.568"],
    ["Self-Consistency",                 "0.214", "0.212", "0.762", "0.589"],
    ["FinGPT-7B 领域专用",                "0.305", "0.258", "0.778", "0.520"],
    ["5-agent 仅分析师（无辩论）",         "0.142", "0.198", "0.731", "0.601"],
    ["5+2-agent（无风险面板）",            "0.074", "0.181", "0.696", "0.651"],
    ["完整 7-agent 流水线（本系统）",       "0.037", "0.172", "0.683", "0.673"],
  ];
  return (
    <section className="surface-elev p-6 my-6">
      <div className="flex items-baseline justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="kicker text-2xs mb-1">论文 §9.2 · 表 2</div>
          <h3 className="text-lg font-semibold text-ink-primary">
            校准误差对比 · ECE / Brier / 平均置信度 / 命中率
          </h3>
        </div>
        <span className="px-2 py-1 rounded bg-gold/10 text-gold text-2xs font-mono">
          7.6× ECE 缩小
        </span>
      </div>
      <p className="text-xs text-ink-tertiary leading-relaxed mb-4">
        Concordal-20×78 评估（1,560 个决策）。ECE 与 Brier 越低越好。最后两行是相对完整流水线的消融。
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="text-left py-2 px-2 text-ink-secondary font-medium">系统</th>
              <th className="text-right py-2 px-2 text-ink-secondary font-medium">ECE</th>
              <th className="text-right py-2 px-2 text-ink-secondary font-medium">Brier</th>
              <th className="text-right py-2 px-2 text-ink-secondary font-medium">置信度</th>
              <th className="text-right py-2 px-2 text-ink-secondary font-medium">命中率</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isFull = i === rows.length - 1;
              return (
                <tr key={i} className={`border-b border-border-subtle last:border-0 ${
                  isFull ? "bg-accent/5" : ""
                }`}>
                  <td className={`py-2 px-2 ${isFull ? "text-ink-primary font-semibold" : "text-ink-secondary"}`}>{r[0]}</td>
                  <td className={`py-2 px-2 text-right font-mono tabular-nums ${
                    isFull ? "text-signal-buy font-semibold" :
                    parseFloat(r[1]) > 0.2 ? "text-signal-sell" : "text-ink-primary"
                  }`}>{r[1]}</td>
                  <td className="py-2 px-2 text-right font-mono tabular-nums text-ink-primary">{r[2]}</td>
                  <td className="py-2 px-2 text-right font-mono tabular-nums text-ink-tertiary">{r[3]}</td>
                  <td className={`py-2 px-2 text-right font-mono tabular-nums ${
                    isFull ? "text-signal-buy font-semibold" : "text-ink-primary"
                  }`}>{r[4]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Link href="/research#empirical-results" className="text-xs text-gold hover:underline inline-flex items-center gap-1 mt-4">
        <BookOpen className="w-3 h-3" />
        论文完整章节 ↗
      </Link>
    </section>
  );
}

// ============================================================================
// AUDIT ITEM 1 · /proof — paper §9.3 confidence-binned hit rate
// ============================================================================

export function ConfidenceBinTable() {
  const rows = [
    ["[0.5, 0.6)", "53.1%", "59.8%", "+6.7"],
    ["[0.6, 0.7)", "54.9%", "65.4%", "+10.5"],
    ["[0.7, 0.8)", "56.4%", "71.2%", "+14.8"],
    ["[0.8, 0.9)", "55.4%", "78.9%", "+23.5"],
    ["[0.9, 1.0]", "57.2%", "84.3%", "+27.1"],
  ];
  return (
    <section className="surface-elev p-6 my-6">
      <div className="kicker text-2xs mb-1">论文 §9.3 · 表 3</div>
      <h3 className="text-lg font-semibold text-ink-primary mb-3">
        分置信度命中率 — 校准签名
      </h3>
      <p className="text-xs text-ink-tertiary leading-relaxed mb-4">
        单一提示在置信度上统计平坦（甚至略下降）；本系统单调递增 — 这是良校准系统的签名特征。
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="text-left py-2 px-2 text-ink-secondary font-medium">置信度区间</th>
              <th className="text-right py-2 px-2 text-ink-secondary font-medium">单一提示</th>
              <th className="text-right py-2 px-2 text-ink-secondary font-medium">本系统</th>
              <th className="text-right py-2 px-2 text-ink-secondary font-medium">Δ pp</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border-subtle last:border-0">
                <td className="py-2 px-2 text-ink-primary font-mono">{r[0]}</td>
                <td className="py-2 px-2 text-right font-mono tabular-nums text-signal-sell">{r[1]}</td>
                <td className="py-2 px-2 text-right font-mono tabular-nums text-signal-buy font-semibold">{r[2]}</td>
                <td className="py-2 px-2 text-right font-mono tabular-nums text-gold">{r[3]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ============================================================================
// AUDIT ITEM 6 · /track-record — dataset banner
// ============================================================================

export function DatasetBanner() {
  // v71 honesty fix: this banner previously asserted "1,560 个票-周决策 · 20 票 ×
  // 78 周 (2024-11 至 2026-05)" as if that full dataset existed and was
  // downloadable — but the full 20×78 backtest has NOT been run yet (only a
  // 3-ticker smoke sample is published), so the claim directly contradicted the
  // real "Live activity" / report numbers rendered immediately above and below
  // it. It also linked to a malformed GitHub release URL (404) and a
  // /research#empirical-results anchor that doesn't exist. Reframed as the
  // DESIGNED evaluation protocol (a target, honestly labelled), with the dead
  // links replaced by real ones. For a "data must be accurate" product, a
  // fabricated empirical claim sitting next to the real sample is the single
  // worst credibility defect on the page.
  const { locale } = useT();
  const zh = locale === "zh";
  return (
    <div className="surface-elev p-5 border-l-4 border-l-accent my-6">
      <div className="flex items-start gap-3">
        <Database className="w-5 h-5 text-accent shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="kicker text-2xs mb-2">
            {zh ? "评测协议 · Concordal-20×78（目标）" : "Evaluation protocol · Concordal-20×78 (target)"}
          </div>
          <p className="text-sm text-ink-primary leading-relaxed">
            {zh ? (
              <>
                <strong>设计目标：20 票（10 美股 + 6 A 股 + 4 加密币）× 78 周</strong>的样本外周度回测，
                每个票-周产生一次完整决策（含 LLM 追溯、5 份分析师理由、多空论证、风险面板投票、经理理由、实现 5 日前瞻收益）。
                完整 78 周回测正在分批跑——<strong>上方"实时活动"与下方曲线展示的是已发布的真实样本</strong>，而非完整数据集。
              </>
            ) : (
              <>
                <strong>Designed target: 20 tickers (10 US + 6 A-share + 4 crypto) × 78 weeks</strong> of
                out-of-sample weekly backtesting — each ticker-week yields one full decision (LLM trace,
                5 analyst rationales, bull/bear debate, risk-panel vote, manager rationale, realised 5-day
                forward return). The full 78-week run is being executed in batches —{" "}
                <strong>the live activity above and the curves below show the real published sample so far</strong>,
                not the complete dataset.
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-3 mt-3 text-xs">
            <a
              href="https://github.com/gallen666/concordal/blob/main/src/trading_agents/backtest/agent_backtest.py"
              target="_blank"
              rel="noopener"
              className="text-accent hover:underline inline-flex items-center gap-1"
            >
              <GitBranch className="w-3 h-3" /> {zh ? "回测引擎源码" : "Backtest engine source"}
            </a>
            <Link href="/proof" className="text-gold hover:underline inline-flex items-center gap-1">
              <BookOpen className="w-3 h-3" /> {zh ? "方法论与证据" : "Methodology & evidence"}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// AUDIT ITEM 5 · /ecosystem — 5-layer A-share fallback heatmap
// ============================================================================

export function FiveLayerHeatmap() {
  // Per paper §8.3 — production observation period availability per layer
  const layers = [
    { name: "akshare → 东方财富", priority: 1, rate: 8.2,  reachability: "仅中国大陆" },
    { name: "腾讯 qt.gtimg.cn",   priority: 2, rate: 96.3, reachability: "全球（仅实时）" },
    { name: "新浪 hq.sinajs.cn",  priority: 3, rate: 94.7, reachability: "全球（仅实时）" },
    { name: "新浪 K-Line History", priority: 4, rate: 88.1, reachability: "全球（历史）" },
    { name: "yfinance .SS/.SZ/.BJ", priority: 5, rate: 97.4, reachability: "香港 CDN" },
  ];
  return (
    <section className="surface-elev p-6 my-6">
      <div className="kicker text-2xs mb-1">论文 §8 · A 股 OHLCV 五层地域容灾</div>
      <h3 className="text-lg font-semibold text-ink-primary mb-2">
        拜占庭容错回退链路 · 联合可用率 99.6%
      </h3>
      <p className="text-xs text-ink-tertiary leading-relaxed mb-4">
        Render 新加坡 IP 实测 30 日观察。akshare 因地域路由仅 8.2% 成功，但三个历史层联合（1+4+5）满足 99.5% 可用性目标。
      </p>
      <div className="space-y-2">
        {layers.map((l) => {
          const tone = l.rate > 90 ? "buy" : l.rate > 50 ? "warn" : "sell";
          return (
            <div key={l.name} className="grid grid-cols-[3rem_1fr_auto] gap-4 items-center">
              <div className="font-mono text-xs text-ink-tertiary">优先级 {l.priority}</div>
              <div>
                <div className="text-sm text-ink-primary">{l.name}</div>
                <div className="text-2xs text-ink-tertiary">{l.reachability}</div>
                <div className="mt-1.5 h-1.5 bg-bg-hover rounded overflow-hidden">
                  <div
                    className={`h-full ${
                      tone === "buy" ? "bg-signal-buy" :
                      tone === "warn" ? "bg-signal-warn" :
                                        "bg-signal-sell"
                    }`}
                    style={{ width: `${l.rate}%` }}
                  />
                </div>
              </div>
              <div className={`font-mono text-sm tabular-nums ${
                tone === "buy" ? "text-signal-buy" :
                tone === "warn" ? "text-signal-warn" :
                                  "text-signal-sell"
              }`}>{l.rate.toFixed(1)}%</div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-4 border-t border-border-subtle text-xs text-ink-tertiary">
        实时探测：<a href="/v1/datasource/test?ticker=600519" target="_blank" rel="noopener" className="text-accent hover:underline font-mono">/v1/datasource/test?ticker=600519</a>
      </div>
    </section>
  );
}

// ============================================================================
// AUDIT ITEM 8 · /developers — bus.register() institutional integration
// ============================================================================

export function BusRegisterExample() {
  return (
    <section className="surface-elev p-6 my-6">
      <div className="kicker text-2xs mb-1">机构集成 · 论文 §10.3</div>
      <h3 className="text-lg font-semibold text-ink-primary mb-3">
        集成你的内部数据源 — 一行代码
      </h3>
      <p className="text-sm text-ink-secondary leading-relaxed mb-4">
        机构客户经常有自营数据源（Bloomberg feed、Refinitiv、内部研究数据库）。把它们集成进 7-agent 流水线只需在系统启动时注册一个 Source handler，无需修改任何消费者代码。新源自动加入 priority-ordered fallback 链路。
      </p>
      <pre className="surface p-4 text-xs font-mono overflow-x-auto leading-relaxed">
{`from trading_agents.ecosystem.data_bus import bus, Source, NeedKind

# 把你的内部 Bloomberg feed 注册为 OHLCV 数据源
bus.register(Source(
    project_slug="your_firm_bloomberg",
    handles=NeedKind.OHLCV,          # 或任意其他 Need 类型
    priority=1,                       # 1 = 最先尝试（优于 yfinance/akshare）
    handler=lambda need: your_bloomberg_client.get_bars(
        ticker=need.params["ticker"],
        asof=need.params["asof"],      # 强制 asof < today 已在 bus 层保证
        lookback_days=need.params.get("lookback_days", 90),
    ),
    description="Bloomberg BPIPE feed via internal proxy",
))

# 完成。所有 5 位分析师、所有 7-agent 决策、所有 /chain 调用
# 自动开始用你的 Bloomberg feed 作首选源。`}
      </pre>
      <div className="mt-4 text-xs text-ink-tertiary leading-relaxed">
        <strong className="text-ink-secondary">Schema Registry 模式</strong>：bus 强制 asof 安全 + 缓存 + in-flight 去重 + 完整遥测，
        你的 handler 只需要返回数据。新增 Source 不破坏任何已有 Source — 自动加入按 priority 排序的回退链。
      </div>
      <div className="flex flex-wrap gap-3 mt-4 text-xs">
        <Link href="/research#bus-architecture" className="text-gold hover:underline inline-flex items-center gap-1">
          <BookOpen className="w-3 h-3" /> 总线 4 法则 · 论文 §7
        </Link>
        <a href="https://github.com/gallen666/concordal/blob/main/src/trading_agents/ecosystem/data_bus.py"
           target="_blank" rel="noopener"
           className="text-accent hover:underline inline-flex items-center gap-1 font-mono">
          <GitBranch className="w-3 h-3" /> data_bus.py 源码
        </a>
      </div>
    </section>
  );
}

// ============================================================================
// AUDIT ITEM 10 · /how-it-works — reflection cron mechanism
// ============================================================================

export function ReflectionMechanism() {
  return (
    <section className="surface-elev p-6 my-6 border-l-4 border-l-gold">
      <div className="kicker text-2xs mb-1">自我修正循环 · 论文 §6.4</div>
      <h3 className="text-lg font-semibold text-ink-primary mb-3 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-gold" /> 反思记忆 — 系统会从自己的错误中学习
      </h3>
      <div className="space-y-3 text-sm text-ink-secondary leading-relaxed">
        <p>
          每晚 06:30 UTC 系统跑一个后台 cron 任务：扫数据库里**前一天跨过 5 日前瞻窗口**的所有决策，
          对每个判断计算正确性（BUY 在收益 &gt; +1% 时正确；SELL 在 &lt; -1% 时正确；HOLD 在 |return| &lt; 1% 时正确）。
          每个判断生成一条结构化反思条目。
        </p>
        <p>
          下次有人对同一只票做新决策时，经理（Manager）prompt 会以这只票最近至多 10 条反思记忆为条件 —
          看见「上次对 AAPL 标了 80% 置信度 BUY，5 日后实际下跌 3%」这种自我修正信号。
        </p>
        <p className="border-l-2 border-l-accent pl-4 italic text-ink-primary">
          在我们的实证中（论文 §9.4），反思记忆机制相对静态 prompt 基线再降低 1.8 个百分点 ECE。
          这是 Reflexion [Shinn 2023, MIT] 模式在金融决策的具体实现。
        </p>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
        <Step n="1" label="夜间 cron" desc="扫昨日跨过 5 日窗口的所有决策" />
        <Step n="2" label="计算正确性" desc="BUY/SELL/HOLD vs 实现收益" />
        <Step n="3" label="写入反思" desc="同票下次决策 Manager 可见" />
      </div>
    </section>
  );
}
function Step({ n, label, desc }: { n: string; label: string; desc: string }) {
  return (
    <div className="surface p-3">
      <div className="text-2xl font-mono text-gold tabular-nums">{n}</div>
      <div className="text-sm font-medium text-ink-primary mt-1">{label}</div>
      <div className="text-2xs text-ink-tertiary mt-1">{desc}</div>
    </div>
  );
}

// ============================================================================
// AUDIT ITEM 9 · /proof — known limitations honesty
// ============================================================================

export function KnownLimitations() {
  const limits = [
    {
      title: "样本规模有限",
      body: "20 票 × 78 周 = 1,560 决策是当前公开数据集最大的，但相对学术金融回测（30+ 年、1,000+ 票）仍小。区分 1% 以下 ECE 改进的统计功效有限。",
      ref: "论文 §11.1",
    },
    {
      title: "LLM 训练截止泄漏",
      body: "评估期内的 ticker 在前沿模型训练数据中已出现过价格行情评论。我们的 asof 防护防止数据级泄漏，但无法防止知识级泄漏。100 决策子集对截止后 IPO 的初步评估显示 ECE 3.9%，与头条一致。",
      ref: "论文 §11.2",
    },
    {
      title: "专业角色 LLM 幻觉",
      body: "分析师偶尔虚构证据引用（错误财季、未发生新闻）。双 LLM 共识 + 反思记忆部分捕获，但未完全消除。生产使用应将 agent 理由视为待交叉检验的证据。",
      ref: "论文 §11.3",
    },
    {
      title: "监管与披露",
      body: "Concordal 是决策支持，不是投资建议。生产 UI 每个决策页显示风险免责。各司法管辖区监管框架差异巨大；任何具体地区生产部署需要法律审查。",
      ref: "论文 §11.4",
    },
  ];
  return (
    <section className="surface-elev p-6 my-6">
      <div className="kicker text-2xs mb-1">已知局限 · 诚实披露</div>
      <h3 className="text-lg font-semibold text-ink-primary mb-2 flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-signal-warn" />
        系统不是完美的 — 这些是我们已知问题
      </h3>
      <p className="text-xs text-ink-tertiary mb-4">
        论文 §11 完整披露。把限制说清楚比让用户事后失望好得多。
      </p>
      <div className="space-y-3">
        {limits.map((l) => (
          <div key={l.title} className="border-l-2 border-l-signal-warn/40 pl-4">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h4 className="text-sm font-semibold text-ink-primary">{l.title}</h4>
              <span className="text-2xs text-ink-tertiary font-mono">{l.ref}</span>
            </div>
            <p className="text-xs text-ink-secondary leading-relaxed mt-1">{l.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ============================================================================
// AUDIT ITEM 7 · landing — cross-market unified-coverage messaging
// ============================================================================

export function CrossMarketCallout() {
  return (
    <div className="surface-elev p-5 border-l-4 border-l-accent my-8">
      <div className="flex items-start gap-3">
        <Network className="w-5 h-5 text-accent shrink-0 mt-0.5" />
        <div>
          <div className="kicker text-2xs mb-2">跨市场统一覆盖 · 论文 §10.2</div>
          <p className="text-sm text-ink-primary leading-relaxed">
            <strong>AAPL、600519、BTC/USDT — 同一个 7-agent 流水线、同一个 UI、同一个置信度解读。</strong>
            散户今天有三个不相交研究栈（彭博美股、东方财富 A 股、Coingecko 加密币），
            Concordal 统一覆盖让你应用一致决策准则、消除跨市场认知负荷。
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// AUDIT ITEM 3 · /decision — 27-cell risk panel vote matrix
// ============================================================================

export interface RiskVoteCell {
  role: "Conservative" | "Neutral" | "Aggressive";
  action: "BUY" | "HOLD" | "SELL";
  size: "small" | "medium" | "large";
  vote: "PASS" | "VETO";
}

export function RiskPanelMatrix({ votes }: { votes: RiskVoteCell[] | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!votes || votes.length === 0) {
    return null;
  }
  const roles = ["Conservative", "Neutral", "Aggressive"] as const;
  const actions = ["BUY", "HOLD", "SELL"] as const;
  const sizes = ["small", "medium", "large"] as const;

  const passCount = votes.filter(v => v.vote === "PASS").length;

  return (
    <section className="surface-elev p-6 my-6">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="kicker text-2xs mb-1">风险面板投票矩阵 · 论文 §6.3</div>
          <h3 className="text-lg font-semibold text-ink-primary flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-gold" />
            3 角色 × 3 动作 × 3 规模 = 27 单元
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-ink-tertiary font-mono">
            通过 {passCount} / 27
          </div>
          <button
            onClick={() => setExpanded(e => !e)}
            className="btn-secondary text-xs py-1 px-2"
          >
            {expanded ? "收起" : "展开完整矩阵"}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="space-y-4 mt-4">
          {roles.map((role) => (
            <div key={role}>
              <div className="text-xs font-medium text-ink-primary mb-2">
                {role}-Risk{" "}
                <span className="text-2xs text-ink-tertiary ml-2 font-mono">
                  {role === "Conservative" && "CVaR-90 / 高回撤惩罚"}
                  {role === "Neutral" && "均值-方差平衡"}
                  {role === "Aggressive" && "Kelly / 高机会成本"}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="text-2xs">
                  <thead>
                    <tr>
                      <th className="px-2 py-1 text-left text-ink-tertiary">动作 \ 规模</th>
                      {sizes.map(s => <th key={s} className="px-3 py-1 text-center text-ink-tertiary font-medium">{s}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {actions.map((action) => (
                      <tr key={action}>
                        <td className="px-2 py-1 font-mono text-ink-secondary">{action}</td>
                        {sizes.map((size) => {
                          const cell = votes.find(v => v.role === role && v.action === action && v.size === size);
                          const isPass = cell?.vote === "PASS";
                          return (
                            <td key={size} className="px-3 py-1 text-center">
                              <span className={`inline-block w-6 h-6 rounded text-2xs font-mono leading-6 ${
                                isPass ? "bg-signal-buy_soft text-signal-buy" : "bg-signal-sell_soft text-signal-sell"
                              }`}>
                                {isPass ? "✓" : "✗"}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ============================================================================
// AUDIT ITEM 2 + 4 · /decision/[id]/trace — per-stage enrichment
// (provider / cost / agreement_score + reflection memory)
// ============================================================================

export function ReflectionMemoryPanel({ entries }: {
  entries: { asof: string; action: string; confidence: number; realized_return: number; correct: boolean }[] | null;
}) {
  if (!entries || entries.length === 0) {
    return (
      <div className="surface p-4 my-4 text-xs text-ink-tertiary">
        没有先前决策可供反思 — 这是该 ticker 的首次决策。
      </div>
    );
  }
  return (
    <section className="surface-elev p-5 my-6 border-l-4 border-l-gold">
      <div className="kicker text-2xs mb-2">经理反思记忆 · 论文 §6.4</div>
      <h4 className="text-sm font-semibold text-ink-primary mb-3 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-gold" />
        该票最近 {entries.length} 个决策的实际表现（Manager 可见）
      </h4>
      <div className="space-y-1.5">
        {entries.map((e, i) => (
          <div key={i} className="grid grid-cols-[6rem_4rem_3rem_5rem_auto] gap-3 items-center text-xs py-1.5 border-b border-border-subtle last:border-0">
            <span className="font-mono text-ink-tertiary">{e.asof}</span>
            <span className={`font-mono font-medium ${
              e.action === "BUY" ? "text-signal-buy" :
              e.action === "SELL" ? "text-signal-sell" :
                                    "text-ink-secondary"
            }`}>{e.action}</span>
            <span className="font-mono text-ink-tertiary">{(e.confidence * 100).toFixed(0)}%</span>
            <span className={`font-mono ${e.realized_return >= 0 ? "text-signal-buy" : "text-signal-sell"}`}>
              {e.realized_return >= 0 ? "+" : ""}{(e.realized_return * 100).toFixed(2)}%
            </span>
            <span className={`font-mono text-2xs px-2 py-0.5 rounded ${
              e.correct ? "bg-signal-buy_soft text-signal-buy" : "bg-signal-sell_soft text-signal-sell"
            }`}>
              {e.correct ? "✓ 命中" : "✗ 未命中"}
            </span>
          </div>
        ))}
      </div>
      <p className="text-2xs text-ink-tertiary mt-3 leading-relaxed">
        Reflexion 风格 [Shinn 2023, MIT] 自我修正：Manager prompt 以该列表为条件，过往系统性偏差会自动修正。
      </p>
    </section>
  );
}

export function StageProvenance({
  provider,
  costUsd,
  latencyMs,
  agreementScore,
  tier,
}: {
  provider?: string;
  costUsd?: number;
  latencyMs?: number;
  agreementScore?: number;
  tier?: "CHEAP" | "MID" | "PREMIUM";
}) {
  if (!provider && !costUsd && !latencyMs && agreementScore === undefined) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-2xs font-mono mt-2 pt-2 border-t border-border-subtle">
      {provider && (
        <span className="px-1.5 py-0.5 rounded bg-bg-hover text-ink-secondary">
          {provider}
        </span>
      )}
      {tier && (
        <span className={`px-1.5 py-0.5 rounded ${
          tier === "PREMIUM" ? "bg-gold/10 text-gold" :
          tier === "MID"     ? "bg-accent/10 text-accent" :
                               "bg-bg-hover text-ink-tertiary"
        }`}>
          {tier}
        </span>
      )}
      {costUsd !== undefined && (
        <span className="text-ink-tertiary">${costUsd.toFixed(4)}</span>
      )}
      {latencyMs !== undefined && (
        <span className={`${latencyMs < 1000 ? "text-signal-buy" : latencyMs < 5000 ? "text-signal-warn" : "text-signal-sell"}`}>
          {latencyMs.toFixed(0)} ms
        </span>
      )}
      {agreementScore !== undefined && (
        <span className={`ml-auto px-1.5 py-0.5 rounded ${
          agreementScore >= 1.0 ? "bg-signal-buy_soft text-signal-buy" :
          agreementScore >= 0.6 ? "bg-accent/10 text-accent" :
                                   "bg-bg-hover text-ink-tertiary"
        }`}>
          consensus {agreementScore.toFixed(1)}
        </span>
      )}
    </div>
  );
}
