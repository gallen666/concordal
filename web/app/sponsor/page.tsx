"use client";

/**
 * /sponsor — aggregated income-channel page.
 *
 * Every channel is gated by an env var (`NEXT_PUBLIC_BMC_HANDLE`,
 * `NEXT_PUBLIC_KOFI_HANDLE`, `NEXT_PUBLIC_AIFADIAN_HANDLE`,
 * `NEXT_PUBLIC_GITHUB_SPONSORS_HANDLE`, `NEXT_PUBLIC_AFFILIATE_*`).
 *
 * When a handle isn't set the card renders as a greyed-out placeholder
 * with a "not configured yet" tooltip — operator can add their handle
 * to Vercel env and the channel goes live without redeploying anything
 * but the frontend.
 *
 * Why this is the highest-ROI page on the site for the operator:
 *   - Zero setup cost on every channel below (all have free signup)
 *   - Zero ops once configured (Buy Me Coffee / Sponsors / 爱发电 pay
 *     direct to the operator's bank or wallet, no platform middle layer)
 *   - Affiliate links return $50-$200 per signed-up broker account,
 *     recurring on Binance from trading fees
 */

import Link from "next/link";
import {
  Briefcase,
  Coffee,
  Github,
  Heart,
  PiggyBank,
  Sparkles,
} from "lucide-react";
import { useT } from "../lib/i18n";
import { cn } from "../lib/cn";

const BMC = process.env.NEXT_PUBLIC_BMC_HANDLE;                  // buymeacoffee.com/<handle>
const KOFI = process.env.NEXT_PUBLIC_KOFI_HANDLE;                 // ko-fi.com/<handle>
const AIFADIAN = process.env.NEXT_PUBLIC_AIFADIAN_HANDLE;         // afdian.com/a/<handle>
const GH_SPONSORS = process.env.NEXT_PUBLIC_GITHUB_SPONSORS_HANDLE; // github.com/sponsors/<handle>
const PATREON = process.env.NEXT_PUBLIC_PATREON_HANDLE;           // patreon.com/<handle>

// Affiliate ref codes. Default values are placeholders — operator
// replaces with their real ref code after each broker partner signup.
const IBKR_REF = process.env.NEXT_PUBLIC_IBKR_REF || "tradingagents";
const ALPACA_REF = process.env.NEXT_PUBLIC_ALPACA_REF || "tradingagents";
const BINANCE_REF = process.env.NEXT_PUBLIC_BINANCE_REF || "tradingagents";
const FUTU_REF = process.env.NEXT_PUBLIC_FUTU_REF || "tradingagents";
const TIGER_REF = process.env.NEXT_PUBLIC_TIGER_REF || "tradingagents";

interface Channel {
  name: string;
  url: string | null;
  icon: React.ReactNode;
  blurb: string;
  payoff?: string;
}

export default function SponsorPage() {
  const { t } = useT();

  const oneTime: Channel[] = [
    {
      name: "Buy Me a Coffee",
      url: BMC ? `https://buymeacoffee.com/${BMC}` : null,
      icon: <Coffee className="w-5 h-5" />,
      blurb: "One-click $5 / $10 / $20 tip with credit card.",
    },
    {
      name: "Ko-fi",
      url: KOFI ? `https://ko-fi.com/${KOFI}` : null,
      icon: <Heart className="w-5 h-5" />,
      blurb: "Same as Buy Me Coffee, popular in EU/UK. No platform fee.",
    },
    {
      name: "爱发电",
      url: AIFADIAN ? `https://afdian.com/a/${AIFADIAN}` : null,
      icon: <PiggyBank className="w-5 h-5" />,
      blurb: "中国用户首选 — 支持微信 + 支付宝，平台抽 4%。",
    },
  ];

  const recurring: Channel[] = [
    {
      name: "GitHub Sponsors",
      url: GH_SPONSORS ? `https://github.com/sponsors/${GH_SPONSORS}` : null,
      icon: <Github className="w-5 h-5" />,
      blurb: "Monthly recurring, GitHub eats the fees. Tax-friendly.",
    },
    {
      name: "Patreon",
      url: PATREON ? `https://www.patreon.com/${PATREON}` : null,
      icon: <Heart className="w-5 h-5" />,
      blurb: "Tiered monthly subscriptions with perks.",
    },
  ];

  const affiliates: Channel[] = [
    {
      name: "Interactive Brokers",
      url: `https://www.interactivebrokers.com/?aff=${IBKR_REF}`,
      icon: <Briefcase className="w-5 h-5" />,
      blurb: "Best for US equity + global. ~$200 per funded account.",
      payoff: "~$200 / signup",
    },
    {
      name: "Alpaca",
      url: `https://alpaca.markets/?ref=${ALPACA_REF}`,
      icon: <Briefcase className="w-5 h-5" />,
      blurb: "Commission-free US equity + crypto. Recurring trading-fee share.",
      payoff: "recurring",
    },
    {
      name: "Binance",
      url: `https://www.binance.com/en/register?ref=${BINANCE_REF}`,
      icon: <Briefcase className="w-5 h-5" />,
      blurb: "Crypto. 20-40% rebate on every trading fee. Highest-recurring.",
      payoff: "20-40% of fees",
    },
    {
      name: "富途 Futu",
      url: `https://www.futunn.com/?ref=${FUTU_REF}`,
      icon: <Briefcase className="w-5 h-5" />,
      blurb: "A股 + 港美股，国内最受欢迎。",
      payoff: "~¥200 / signup",
    },
    {
      name: "老虎 Tiger",
      url: `https://www.tigerbrokers.com/?ref=${TIGER_REF}`,
      icon: <Briefcase className="w-5 h-5" />,
      blurb: "国际券商，A股 + 美股 + 期权。",
      payoff: "~¥150 / signup",
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <header className="mb-10 max-w-2xl">
        <span className="label-cap">{t("sponsor.label")}</span>
        <h1 className="text-3xl font-semibold mt-1 leading-tight">{t("sponsor.heading")}</h1>
        <p className="text-sm text-ink-secondary mt-3 leading-relaxed">
          {t("sponsor.subheading")}
        </p>
      </header>

      <ChannelSection title={t("sponsor.oneTime.title")} channels={oneTime} />
      <ChannelSection title={t("sponsor.recurring.title")} channels={recurring} />
      <ChannelSection
        title={t("sponsor.affiliate.title")}
        channels={affiliates}
        blurb={t("sponsor.affiliate.body")}
        accent
      />

      <div className="mt-12 surface p-5 text-sm text-ink-tertiary">
        <p>
          The platform itself stays free — no signup-wall, no credit card. These
          channels just help us pay the LLM bill so we can keep it that way.{" "}
          <Link href="/proof" className="text-accent hover:underline">
            See proof
          </Link>{" "}
          ·{" "}
          <Link href="/pricing" className="text-accent hover:underline">
            See pricing
          </Link>
        </p>
      </div>
    </div>
  );
}

function ChannelSection({
  title,
  channels,
  blurb,
  accent,
}: {
  title: string;
  channels: Channel[];
  blurb?: string;
  accent?: boolean;
}) {
  const { t } = useT();
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      {blurb && (
        <p className="text-sm text-ink-secondary leading-relaxed mb-4">{blurb}</p>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        {channels.map((c) => {
          const enabled = !!c.url;
          if (!enabled) {
            return (
              <div
                key={c.name}
                className="surface p-4 opacity-50 cursor-not-allowed"
                title={t("sponsor.notConfigured")}
              >
                <div className="flex items-center gap-2 mb-2 text-ink-tertiary">
                  {c.icon}
                  <span className="font-semibold">{c.name}</span>
                </div>
                <p className="text-xs text-ink-tertiary">{c.blurb}</p>
                <p className="text-2xs text-ink-muted mt-2">
                  {t("sponsor.notConfigured")}
                </p>
              </div>
            );
          }
          return (
            <a
              key={c.name}
              href={c.url!}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className={cn(
                "surface p-4 transition-colors hover:bg-bg-hover/40 block",
                accent && "hover:border-accent/30",
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={accent ? "text-accent" : "text-ink-secondary"}>
                    {c.icon}
                  </span>
                  <span className="font-semibold">{c.name}</span>
                </div>
                {c.payoff && (
                  <span className="text-2xs text-accent font-mono">{c.payoff}</span>
                )}
              </div>
              <p className="text-xs text-ink-secondary leading-relaxed">{c.blurb}</p>
            </a>
          );
        })}
      </div>
    </section>
  );
}
