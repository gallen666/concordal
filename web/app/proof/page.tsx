"use client";

/**
 * /proof — the trust-anchor page.
 *
 * Every claim has a code link. The whole point is: nothing here is
 * marketing — every assertion can be verified by clicking through to
 * the public repo. This is the page we link from /pricing's "want proof?"
 * footer and from anywhere else a visitor needs to decide whether to
 * trust the system.
 */

import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  Database,
  GitBranch,
  Github,
  Layers,
  Network,
  Shield,
  TestTube2,
  Zap,
} from "lucide-react";
import { useT } from "../lib/i18n";
import {
  CalibrationTable,
  ConfidenceBinTable,
  KnownLimitations,
} from "../components/PaperBacked";

const REPO = "https://github.com/gallen666/trading-agents-platform";

interface Section {
  icon: React.ReactNode;
  title: string;
  body: string;
  bullets: { text: string; href?: string }[];
}

export default function ProofPage() {
  const { t, locale } = useT();

  const sections: Section[] = [
    {
      icon: <Database className="w-5 h-5 text-accent" />,
      title: t("proof.section.dataSources"),
      body: locale === "zh"
        ? "5 个 analyst stage 喂的不是 mock 数据，是真实公开数据源。每个都是开源社区/政府/交易所自己运营的端点，我们只是聚合。"
        : "Each of the 5 analyst stages reads from genuinely-public real data sources — not mocks, not aggregator middleware, not paid APIs. We're a thin layer on top of upstream sources operated by the OSS community / governments / exchanges.",
      bullets: [
        { text: "OpenBB SDK + FRED REST → Macro analyst (CPI, unemployment, Fed funds, yield curve)", href: `${REPO}/blob/main/src/trading_agents/adapters/macro_openbb.py` },
        { text: "SEC EDGAR XBRL → US fundamentals, point-in-time by filing date", href: `${REPO}/blob/main/src/trading_agents/adapters/sec_edgar.py` },
        { text: "akshare → A-share OHLCV + fundamentals", href: `${REPO}/blob/main/src/trading_agents/adapters/cn_equity.py` },
        { text: "CCXT (Binance default) → Crypto OHLCV + technicals", href: `${REPO}/blob/main/src/trading_agents/adapters/crypto_ccxt.py` },
        { text: "Reddit JSON → US/crypto news + sentiment, no API key", href: `${REPO}/blob/main/src/trading_agents/adapters/social_reddit.py` },
        { text: "东方财富股吧 → A-share retail discussion mining", href: `${REPO}/blob/main/src/trading_agents/adapters/social_guba.py` },
      ],
    },
    {
      icon: <Shield className="w-5 h-5 text-accent" />,
      title: t("proof.section.lookahead"),
      body: locale === "zh"
        ? "回测时所有 adapter 都强制按 asof 过滤。yfinance.info（current snapshot）和 akshare 实时数据在 asof > 7 天前会返回空 stub，分析师 prompt 明确要求「不准编造数字」。SEC EDGAR 按 filing date 过滤——零前瞻。Reddit / Guba 帖子按 created_utc 过滤。"
        : "Every adapter enforces strict no-lookahead at the boundary. yfinance.info (current snapshot only) and akshare realtime endpoints return empty stubs for asof > 7 days; analyst prompt explicitly tells the LLM not to fabricate numbers. SEC EDGAR is filtered by filing date — zero leak. Reddit + Guba posts filtered by created_utc.",
      bullets: [
        { text: "Adapter assertion: assert_no_future() + asof guards", href: `${REPO}/blob/main/src/trading_agents/adapters/base.py` },
        { text: "5 regression tests lock in lookahead behaviour", href: `${REPO}/blob/main/tests/test_pipeline.py` },
        { text: "EDGAR uses XBRL filing date, not period-end date", href: `${REPO}/blob/main/src/trading_agents/adapters/sec_edgar.py` },
      ],
    },
    {
      icon: <Network className="w-5 h-5 text-accent" />,
      title: t("proof.section.crossVal"),
      body: locale === "zh"
        ? "我们自己的 backtest engine 才 200 行——可能有 bug。所以每个回测结果会平行在 Backtrader（GitHub 14k★，2014 年至今）的 broker 模拟器里再跑一遍，年化收益偏差 > 0.5pp 自动标黄。这是免费 bug 探测器。"
        : "Our own backtest engine is 200 lines — could have bugs. So every result is independently replayed through Backtrader (14k★, battle-tested since 2014). Disagreement > 0.5pp annualised return auto-flagged in the report.",
      bullets: [
        { text: "Backtrader cross-validation runner", href: `${REPO}/blob/main/src/trading_agents/backtest/backtrader_runner.py` },
        { text: "Toggle on /backtest page or pass --cross-validate to CLI", href: "/backtest" },
      ],
    },
    {
      icon: <Layers className="w-5 h-5 text-accent" />,
      title: t("proof.section.costModel"),
      body: locale === "zh"
        ? "回测 cost model 默认值故意悲观——5bp commission + 5bp slippage = 单边 10bp，A 股卖出再加 5bp 印花税。比 industry「标准」3bp 高得多——因为 underchaging 让回测看起来好的策略真上活会失望。"
        : "Backtest cost defaults are intentionally pessimistic — 5bp commission + 5bp slippage = 10bp per side, A-share sells add 5bp stamp tax. Higher than the industry-typical 3bp because under-charging gives misleading 'good' backtest results that disappoint live.",
      bullets: [
        { text: "Backtester.for_market() — market-aware defaults", href: `${REPO}/blob/main/src/trading_agents/backtest/engine.py` },
        { text: "docs/COST_MODEL.md explains numbers", href: `${REPO}/blob/main/docs/COST_MODEL.md` },
      ],
    },
    {
      icon: <Github className="w-5 h-5 text-accent" />,
      title: t("proof.section.openSource"),
      body: locale === "zh"
        ? "整个后端 + 前端代码 100% 在 GitHub 上公开。你可以自部署、改 prompt、加 adapter、把它当 SDK 用。Pro 订阅买的是托管 + 真 LLM 配额，不是访问权——访问权一直是免费的。"
        : "The entire backend + frontend is on public GitHub. Self-host it, fork the prompts, plug your own adapters, use it as an SDK. Pro subscription buys hosting + real-LLM quota — access has always been free.",
      bullets: [
        { text: "github.com/gallen666/trading-agents-platform", href: REPO },
        { text: "Inspired by TauricResearch/TradingAgents (arXiv:2412.20138)", href: "https://github.com/TauricResearch/TradingAgents" },
        { text: "12 OSS integrations cataloged on /ecosystem", href: "/ecosystem" },
      ],
    },
    {
      icon: <TestTube2 className="w-5 h-5 text-accent" />,
      title: t("proof.section.tests"),
      body: locale === "zh"
        ? "25 个单元测试在 GitHub Actions 每次 push 跑。覆盖：lookahead 防护、cost model、annualisation 公式、EDGAR 过滤、Reddit 过滤、router 路由、5 个回归测试。我们自己每次发布前先看绿。"
        : "25 unit tests run on every push via GitHub Actions. Coverage: lookahead enforcement, cost model arithmetic, annualisation formula, EDGAR PIT filter, Reddit lookback filter, LLM router family routing. Green-build is the merge gate.",
      bullets: [
        { text: ".github/workflows/ci.yml", href: `${REPO}/blob/main/.github/workflows/ci.yml` },
        { text: "tests/test_pipeline.py — 25 invariants", href: `${REPO}/blob/main/tests/test_pipeline.py` },
      ],
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <header className="mb-10 max-w-3xl">
        <span className="label-cap">{t("proof.label")}</span>
        <h1 className="text-3xl font-semibold mt-1 leading-tight">
          {t("proof.heading")}
        </h1>
        <p className="text-sm text-ink-secondary mt-3 leading-relaxed">
          {t("proof.subheading")}
        </p>
      </header>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
        <Stat label={locale === "zh" ? "OSS 集成" : "OSS integrations"} value="12" sub={locale === "zh" ? "8 已上线" : "8 live"} />
        <Stat label={locale === "zh" ? "单元测试" : "Unit tests"} value="25" sub="all green" />
        <Stat label={locale === "zh" ? "数据源" : "Real data sources"} value="6" sub={locale === "zh" ? "无需付费 API" : "no paid APIs"} />
        <Stat label={locale === "zh" ? "回测引擎" : "Backtest engines"} value="2" sub={locale === "zh" ? "互相校验" : "cross-validated"} />
      </div>

      {/* Paper-backed calibration tables — added per audit. */}
      <CalibrationTable />
      <ConfidenceBinTable />
      <KnownLimitations />

      {/* Sections */}
      <div className="space-y-4">
        {sections.map((s, i) => (
          <section key={i} className="surface-elev p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-2">
              {s.icon}
              <h2 className="text-lg font-semibold">{s.title}</h2>
            </div>
            <p className="text-sm text-ink-secondary leading-relaxed">{s.body}</p>
            <ul className="mt-4 space-y-1.5">
              {s.bullets.map((b, j) => (
                <li key={j} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                  {b.href ? (
                    <a
                      href={b.href}
                      target={b.href.startsWith("http") ? "_blank" : undefined}
                      rel={b.href.startsWith("http") ? "noopener noreferrer" : undefined}
                      className="text-ink-secondary hover:text-ink-primary inline-flex items-center gap-1"
                    >
                      <span>{b.text}</span>
                      {b.href.startsWith("http") && (
                        <ArrowUpRight className="w-3 h-3 text-ink-tertiary shrink-0" />
                      )}
                    </a>
                  ) : (
                    <span className="text-ink-secondary">{b.text}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* Final CTA back to pricing */}
      <div className="mt-10 surface p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-sm font-semibold text-ink-primary">
            {locale === "zh" ? "看完了？回到定价页" : "Convinced? Back to pricing"}
          </div>
          <p className="text-xs text-ink-tertiary mt-0.5">
            {locale === "zh"
              ? "Free 永久免费 + mock LLM；Pro $29/月解锁真 LLM"
              : "Free forever (mock LLM); Pro $29/mo unlocks real LLM"}
          </p>
        </div>
        <Link href="/pricing" className="btn-primary">
          <Zap className="w-4 h-4" />
          {locale === "zh" ? "看定价" : "See pricing"}
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="surface p-4">
      <div className="label-cap">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold font-mono leading-none text-accent">{value}</div>
      {sub && <div className="text-2xs text-ink-tertiary mt-1">{sub}</div>}
    </div>
  );
}
