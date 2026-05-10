"use client";

/**
 * /pricing — three-tier subscription page.
 *
 * Free is the actual product (mock LLM + real 8-source pipeline) so
 * visitors can see exactly what they're getting before paying. Pro
 * unlocks real LLMs + unlimited runs. Team adds shared seats + priority.
 *
 * The Upgrade button calls /v1/upgrade/checkout which today returns a
 * Tally / Stripe Payment Link URL. Once a real Stripe checkout is wired
 * in the backend, no frontend change is needed.
 */

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ExternalLink,
  Loader2,
  Minus,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { api, auth } from "../lib/api";
import { cn } from "../lib/cn";
import { useT } from "../lib/i18n";

// Static feature matrix — order matters. Used both for the per-card
// bullet list and the comparison table below.
type Tier = "free" | "pro" | "team";
const FEATURE_MATRIX: Array<{
  label_en: string;
  label_zh: string;
  free: boolean | string;
  pro: boolean | string;
  team: boolean | string;
}> = [
  { label_en: "5-analyst pipeline (fundamentals + sentiment + news + technical + macro)",
    label_zh: "5 分析师 pipeline（基本面 + 情绪 + 新闻 + 技术面 + 宏观）",
    free: true, pro: true, team: true },
  { label_en: "Bull/Bear debate + 3-way risk committee + Manager final call",
    label_zh: "多空辩论 + 三方风控委员会 + 基金经理终审",
    free: true, pro: true, team: true },
  { label_en: "Real data: SEC EDGAR PIT + Reddit + 东方财富股吧 + OpenBB macro + Alpha158 factors",
    label_zh: "真实数据：SEC EDGAR PIT + Reddit + 东方财富股吧 + OpenBB 宏观 + Alpha158 因子",
    free: true, pro: true, team: true },
  { label_en: "Markets: US equities + A-share + crypto",
    label_zh: "市场：美股 + A 股 + 加密货币",
    free: true, pro: true, team: true },
  { label_en: "Backtest engine + Backtrader cross-validation",
    label_zh: "回测引擎 + Backtrader 交叉验证",
    free: true, pro: true, team: true },
  { label_en: "Real LLM (Gemini 3.1 Pro / Claude / DeepSeek / Qwen)",
    label_zh: "真 LLM（Gemini 3.1 Pro / Claude / DeepSeek / Qwen）",
    free: true, pro: true, team: true },
  { label_en: "Decisions per day",
    label_zh: "每日决策次数",
    free: "5 (signed in) · 2 anon", pro: "30", team: "100 / seat" },
  { label_en: "Decision history (persisted)",
    label_zh: "决策历史持久化",
    free: "Local only", pro: true, team: true },
  { label_en: "Reflection memory (system learns from your past decisions)",
    label_zh: "反思记忆（系统从你的历史决策中学习）",
    free: false, pro: true, team: true },
  { label_en: "OpenBB Workspace widgets",
    label_zh: "OpenBB Workspace widgets",
    free: true, pro: true, team: true },
  { label_en: "Direct API access (use as backend)",
    label_zh: "直接 API 访问（当后端用）",
    free: false, pro: true, team: true },
  { label_en: "Priority queue (skip rate limits)",
    label_zh: "优先队列（绕过限流）",
    free: false, pro: false, team: true },
  { label_en: "Team seats + shared watchlists",
    label_zh: "团队席位 + 共享自选股",
    free: false, pro: false, team: "5 included" },
];

export default function PricingPage() {
  const { t, locale } = useT();
  const [busy, setBusy] = useState<Tier | null>(null);

  async function startUpgrade(tier: Tier) {
    if (tier === "free") {
      window.location.href = "/redeem";
      return;
    }
    if (!auth.isLoggedIn()) {
      window.location.href = `/redeem?then=${encodeURIComponent(`/pricing#${tier}`)}`;
      return;
    }
    setBusy(tier);
    try {
      const resp = await api.upgradeCheckout({ tier });
      window.open(resp.url, "_blank", "noopener,noreferrer");
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <header className="mb-10 text-center max-w-2xl mx-auto">
        <span className="label-cap">{t("pricing.label")}</span>
        <h1 className="text-3xl font-semibold mt-1">{t("pricing.heading")}</h1>
        <p className="text-sm text-ink-secondary mt-3 leading-relaxed">
          {t("pricing.subheading")}
        </p>
      </header>

      <div className="grid md:grid-cols-3 gap-4 mb-12">
        <TierCard
          tier="free"
          icon={<Sparkles className="w-4 h-4" />}
          accent={false}
          onClick={() => startUpgrade("free")}
          busy={busy === "free"}
          locale={locale}
        />
        <TierCard
          tier="pro"
          icon={<Zap className="w-4 h-4" />}
          accent
          highlight
          onClick={() => startUpgrade("pro")}
          busy={busy === "pro"}
          locale={locale}
        />
        <TierCard
          tier="team"
          icon={<Users className="w-4 h-4" />}
          accent={false}
          onClick={() => startUpgrade("team")}
          busy={busy === "team"}
          locale={locale}
        />
      </div>

      {/* Comparison table */}
      <section className="surface overflow-hidden mb-12">
        <table className="w-full text-sm">
          <thead className="bg-bg-subtle">
            <tr>
              <th className="px-4 py-3 text-left label-cap">Feature</th>
              <th className="px-4 py-3 text-center label-cap">Free</th>
              <th className="px-4 py-3 text-center label-cap text-accent">Pro</th>
              <th className="px-4 py-3 text-center label-cap">Team</th>
            </tr>
          </thead>
          <tbody>
            {FEATURE_MATRIX.map((row, i) => (
              <tr
                key={i}
                className="border-t border-border-subtle hover:bg-bg-hover/40"
              >
                <td className="px-4 py-3">
                  {locale === "zh" ? row.label_zh : row.label_en}
                </td>
                <FeatureCell v={row.free} />
                <FeatureCell v={row.pro} accent />
                <FeatureCell v={row.team} />
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Testimonials placeholder — fills with real quotes once you have them */}
      <section className="surface p-5 mb-12 max-w-3xl">
        <span className="label-cap">{t("testimonials.label")}</span>
        <h2 className="text-lg font-semibold mt-1 mb-2">
          {t("testimonials.heading")}
        </h2>
        <p className="text-sm text-ink-secondary leading-relaxed">
          {t("testimonials.placeholder")}
        </p>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl">
        <h2 className="text-xl font-semibold mb-4">{t("pricing.faq.title")}</h2>
        <div className="space-y-4">
          <FaqItem q={t("pricing.faq.q1")} a={t("pricing.faq.a1")} />
          <FaqItem q={t("pricing.faq.q2")} a={t("pricing.faq.a2")} />
          <FaqItem q={t("pricing.faq.q3")} a={t("pricing.faq.a3")} />
        </div>
        <div className="mt-8 surface p-4 flex items-center gap-3 text-sm text-ink-secondary">
          <ArrowRight className="w-4 h-4 text-accent shrink-0" />
          <span>
            {locale === "zh"
              ? "想看证据再决定？"
              : "Want to see proof first?"}{" "}
            <Link href="/proof" className="text-accent hover:underline">
              {locale === "zh" ? "查看 /proof 信任页" : "Check /proof"}
            </Link>
          </span>
        </div>
      </section>
    </div>
  );
}

// ---- Components ----------------------------------------------------------

function TierCard({
  tier,
  icon,
  accent,
  highlight,
  onClick,
  busy,
  locale,
}: {
  tier: Tier;
  icon: React.ReactNode;
  accent: boolean;
  highlight?: boolean;
  onClick: () => void;
  busy: boolean;
  locale: string;
}) {
  const { t } = useT();
  // Pull only the bullets relevant to this tier
  const bullets = FEATURE_MATRIX.filter((f) => f[tier] !== false).slice(0, 8);

  return (
    <div
      id={tier}
      className={cn(
        "surface p-6 flex flex-col relative",
        highlight && "border-accent/40 shadow-glow",
      )}
    >
      {highlight && (
        <span className="absolute -top-2.5 left-4 pill bg-accent-muted text-accent border border-accent/30 text-2xs">
          {locale === "zh" ? "推荐" : "Most popular"}
        </span>
      )}

      <div className="flex items-center gap-2 mb-1">
        <span className="text-ink-tertiary">{icon}</span>
        <h2 className="text-lg font-semibold">
          {t(`pricing.tier.${tier}` as `pricing.tier.${Tier}`)}
        </h2>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={cn("text-3xl font-semibold", accent && "text-accent")}>
          {t(`pricing.price.${tier}` as `pricing.price.${Tier}`)}
        </span>
        <span className="text-xs text-ink-tertiary">
          {t(`pricing.price.suffix.${tier}` as `pricing.price.suffix.${Tier}`)}
        </span>
      </div>

      <ul className="mt-6 space-y-2 flex-1">
        {bullets.map((row, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-ink-secondary">
            <Check className={cn(
              "w-4 h-4 shrink-0 mt-0.5",
              accent ? "text-accent" : "text-signal-buy",
            )} />
            <span>{locale === "zh" ? row.label_zh : row.label_en}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={onClick}
        disabled={busy}
        className={cn(
          "mt-6 w-full",
          accent ? "btn-primary" : "btn-secondary",
        )}
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            {t(`pricing.cta.${tier}` as `pricing.cta.${Tier}`)}
            {tier !== "free" && <ExternalLink className="w-3.5 h-3.5" />}
          </>
        )}
      </button>
    </div>
  );
}

function FeatureCell({
  v,
  accent,
}: {
  v: boolean | string;
  accent?: boolean;
}) {
  if (v === true) {
    return (
      <td className="px-4 py-3 text-center">
        <Check className={cn("w-4 h-4 inline-block", accent ? "text-accent" : "text-signal-buy")} />
      </td>
    );
  }
  if (v === false) {
    return (
      <td className="px-4 py-3 text-center">
        <Minus className="w-4 h-4 inline-block text-ink-muted" />
      </td>
    );
  }
  // string fragment
  return (
    <td className={cn(
      "px-4 py-3 text-center text-xs",
      accent ? "text-accent" : "text-ink-secondary",
    )}>
      {v}
    </td>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="surface p-4 group">
      <summary className="cursor-pointer flex items-center justify-between text-sm font-medium text-ink-primary">
        <span>{q}</span>
        <span className="text-ink-tertiary group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <p className="mt-3 text-sm text-ink-secondary leading-relaxed">{a}</p>
    </details>
  );
}
