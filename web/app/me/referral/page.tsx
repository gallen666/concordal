"use client";

/**
 * /me/referral — the user's invite link + stats.
 *
 * The viral loop: a logged-in user shares /login?ref=<their-code>; new
 * sign-ups via that link stack a 7-day +5/day bonus on BOTH the inviter
 * and the invitee. This costs us essentially nothing (a few cents of
 * extra LLM calls per invitee per day) and turns existing users into
 * a free acquisition channel.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Copy,
  Gift,
  Loader2,
  Share2,
  Users,
} from "lucide-react";
import { api, auth } from "../../lib/api";
import { cn } from "../../lib/cn";
import { useT } from "../../lib/i18n";

export default function ReferralPage() {
  const { t } = useT();
  const [data, setData] = useState<{
    code: string;
    invitees_count: number;
    bonus_active: boolean;
    bonus_decisions_per_day: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.isLoggedIn() && typeof window !== "undefined") {
      window.location.href = "/login";
      return;
    }
    api
      .referralStatus()
      .then((r) =>
        setData({
          code: r.code,
          invitees_count: r.invitees_count,
          bonus_active: r.bonus_active,
          bonus_decisions_per_day: r.bonus_decisions_per_day,
        }),
      )
      .catch((e: Error) => setError(e.message));
  }, []);

  const inviteLink =
    data && typeof window !== "undefined"
      ? `${window.location.origin}/login?ref=${data.code}`
      : "";

  async function copy() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="surface p-4 border-signal-sell/30 text-signal-sell text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center text-ink-tertiary">
        <Loader2 className="w-6 h-6 animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12 space-y-8">
      <header>
        <span className="label-cap">{t("referral.label")}</span>
        <h1 className="text-2xl font-semibold mt-1 leading-tight">
          {t("referral.heading")}
        </h1>
        <p className="text-sm text-ink-secondary mt-2 leading-relaxed">
          {t("referral.subheading")}
        </p>
      </header>

      <section className="surface-elev p-6 space-y-4">
        <div>
          <div className="label-cap mb-2">{t("referral.yourLink")}</div>
          <div className="flex items-stretch gap-2">
            <code className="flex-1 px-3 py-2.5 bg-bg-base border border-border-subtle rounded-md font-mono text-xs break-all">
              {inviteLink}
            </code>
            <button onClick={copy} className="btn-secondary text-sm whitespace-nowrap">
              {copied ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-accent" />
                  {t("referral.copied")}
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  {t("referral.copy")}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Native share API on mobile, fallback to copy on desktop */}
        <button
          onClick={async () => {
            if (navigator.share) {
              try {
                await navigator.share({
                  title: "TradingAgents",
                  text: "Multi-agent AI for stock + crypto decisions. Free to try:",
                  url: inviteLink,
                });
              } catch {
                /* user cancelled */
              }
            } else {
              copy();
            }
          }}
          className="btn-primary w-full"
        >
          <Share2 className="w-4 h-4" />
          Share
        </button>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Stat
          icon={<Users className="w-4 h-4 text-accent" />}
          label={t("referral.stats.invitees")}
          value={String(data.invitees_count)}
        />
        <Stat
          icon={<Gift className="w-4 h-4 text-accent" />}
          label={t("referral.stats.bonusActive")}
          value={
            data.bonus_active
              ? t("referral.stats.bonusYes").replace(
                  "{n}",
                  String(data.bonus_decisions_per_day),
                )
              : t("referral.stats.bonusNo")
          }
          accent={data.bonus_active}
        />
      </section>

      <div className="text-xs text-ink-tertiary">
        <Link href="/sponsor" className="hover:text-ink-secondary">
          Other ways to support →
        </Link>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="surface p-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="label-cap">{label}</span>
      </div>
      <div
        className={cn(
          "text-base font-semibold mt-0.5",
          accent && "text-accent",
        )}
      >
        {value}
      </div>
    </div>
  );
}
