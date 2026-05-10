"use client";

/**
 * /login — magic-link sign-in (passwordless email auth).
 *
 * Flow:
 *   1. User enters email → POST /v1/auth/magic-link/send
 *   2. Backend mints a 15-min token + emails them a link (via Resend, or
 *      prints to server log if RESEND_API_KEY isn't set)
 *   3. User clicks the link → /auth/verify?token=xxx → JWT issued
 *
 * The response shape never reveals whether the email exists, so we
 * always show the same "check your inbox" success view regardless.
 */

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { useT } from "../lib/i18n";

export default function LoginPage() {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ devLink?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.magicLinkSend({ email });
      setSent({ devLink: r.dev_link_shown_in_logs });
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="max-w-md mx-auto px-6 py-16 text-center space-y-5">
        <div className="inline-flex w-12 h-12 rounded-xl bg-accent-muted text-accent items-center justify-center">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-semibold">{t("login.sent.title")}</h1>
        <p className="text-sm text-ink-secondary max-w-sm mx-auto leading-relaxed">
          {t("login.sent.body").replace("{email}", email)}
        </p>
        {sent.devLink && (
          <p className="text-xs text-ink-tertiary surface p-3 max-w-sm mx-auto leading-relaxed">
            {t("login.devLink")}
          </p>
        )}
        <button
          onClick={() => {
            setSent(null);
            setEmail("");
          }}
          className="btn-ghost text-sm"
        >
          {t("login.tryAgain")}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <header className="text-center mb-8">
        <span className="label-cap">{t("login.label")}</span>
        <h1 className="text-2xl font-semibold mt-1">{t("login.heading")}</h1>
        <p className="text-sm text-ink-secondary mt-2 leading-relaxed">
          {t("login.subheading")}
        </p>
      </header>

      <form onSubmit={submit} className="space-y-3">
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-tertiary" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("login.emailPlaceholder")}
            required
            disabled={busy}
            className="input w-full pl-10"
            autoComplete="email"
            autoFocus
          />
        </div>
        <button
          type="submit"
          disabled={busy || !email}
          className={cn("btn-primary w-full")}
        >
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("login.sending")}
            </>
          ) : (
            t("login.submit")
          )}
        </button>
        {error && (
          <div className="surface border-signal-sell/30 p-3 text-xs text-signal-sell">
            {error}
          </div>
        )}
      </form>

      <p className="text-xs text-ink-tertiary text-center mt-6">
        <Link href="/redeem" className="hover:text-ink-secondary">
          {t("login.alreadyHaveInvite")}
        </Link>
      </p>
    </div>
  );
}
