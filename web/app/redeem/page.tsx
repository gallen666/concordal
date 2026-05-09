"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, KeyRound } from "lucide-react";
import { api, auth } from "../lib/api";
import { Logo } from "../components/Logo";
import { useT } from "../lib/i18n";

export default function RedeemPage() {
  const router = useRouter();
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.redeem({ email, invite_code: code });
      auth.setToken(res.token);
      router.push("/watchlist");
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-[calc(100vh-3.5rem-4rem)] flex items-center justify-center px-6 py-12">
      <div className="absolute inset-0 grid-bg pointer-events-none" />
      <div className="relative w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex w-12 h-12 rounded-xl bg-accent-muted text-accent items-center justify-center mb-4">
            <KeyRound className="w-5 h-5" />
          </div>
          <h1 className="text-2xl font-semibold">{t("redeem.title")}</h1>
          <p className="text-sm text-ink-secondary mt-1">
            {t("redeem.subtitle")}
          </p>
        </div>

        <form
          onSubmit={submit}
          className="surface-elev p-6 space-y-4"
        >
          <div className="space-y-1.5">
            <label className="label-cap" htmlFor="email">
              {t("redeem.email")}
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@firm.com"
              disabled={loading}
              className="input w-full"
            />
          </div>

          <div className="space-y-1.5">
            <label className="label-cap" htmlFor="code">
              {t("redeem.inviteCode")}
            </label>
            <input
              id="code"
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("redeem.codePlaceholder")}
              disabled={loading}
              className="input w-full font-mono"
            />
          </div>

          {error && (
            <div className="text-sm text-signal-sell bg-signal-sell_soft border border-signal-sell/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email || !code}
            className="btn-primary w-full"
          >
            {loading ? t("redeem.submitting") : t("redeem.submit")}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>

        <p className="text-center text-xs text-ink-tertiary mt-6">
          {t("redeem.noCode")}{" "}
          <Link href="/" className="text-accent hover:underline">
            {t("redeem.joinWaitlist")}
          </Link>
        </p>
      </div>
    </div>
  );
}
