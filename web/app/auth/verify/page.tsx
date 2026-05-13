"use client";

/**
 * /auth/verify?token=xxx — magic-link callback.
 *
 * Calls POST /v1/auth/magic-link/verify with the token from the URL,
 * stores the resulting JWT in localStorage, and redirects to /decision.
 *
 * Failure modes (expired link, already used, malformed) all surface
 * as a single "this link doesn't work" view with a "send a new one"
 * action — we never tell the user WHY it failed (avoids fingerprinting
 * attacks on the token store).
 */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { api, auth } from "../../lib/api";
import { useT } from "../../lib/i18n";

type State = "verifying" | "ok" | "fail";

export default function VerifyPage() {
  return (
    <Suspense fallback={<VerifyFallback />}>
      <VerifyContent />
    </Suspense>
  );
}

function VerifyFallback() {
  const { t } = useT();

  return (
    <div className="max-w-md mx-auto px-6 py-20 text-center space-y-5">
      <Loader2 className="w-10 h-10 animate-spin text-ink-tertiary mx-auto" />
      <h1 className="text-lg font-semibold">{t("verify.verifying")}</h1>
    </div>
  );
}

function VerifyContent() {
  const { t } = useT();
  const params = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>("verifying");

  useEffect(() => {
    if (!token) {
      setState("fail");
      return;
    }
    api
      .magicLinkVerify({ token })
      .then(async (r) => {
        auth.setToken(r.token);
        // If a referral code was stashed on /login?ref=XXX, claim it now
        // — both inviter and invitee get +5 decisions/day for 7 days.
        // Fire-and-forget so a failure here doesn't break sign-in.
        const pendingRef = localStorage.getItem("ta_pending_ref");
        if (pendingRef) {
          localStorage.removeItem("ta_pending_ref");
          try {
            await api.referralClaim({ code: pendingRef });
          } catch {
            // ignore — referral is best-effort
          }
        }
        setState("ok");
        setTimeout(() => {
          window.location.href = "/decision";
        }, 900);
      })
      .catch(() => setState("fail"));
  }, [token]);

  return (
    <div className="max-w-md mx-auto px-6 py-20 text-center space-y-5">
      {state === "verifying" && (
        <>
          <Loader2 className="w-10 h-10 animate-spin text-ink-tertiary mx-auto" />
          <h1 className="text-lg font-semibold">{t("verify.verifying")}</h1>
        </>
      )}
      {state === "ok" && (
        <>
          <div className="inline-flex w-12 h-12 rounded-xl bg-accent-muted text-accent items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-semibold">{t("verify.success")}</h1>
          <p className="text-sm text-ink-secondary">{t("verify.successBody")}</p>
        </>
      )}
      {state === "fail" && (
        <>
          <div className="inline-flex w-12 h-12 rounded-xl bg-signal-warn_soft text-signal-warn items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-semibold">{t("verify.failed.title")}</h1>
          <p className="text-sm text-ink-secondary max-w-sm mx-auto leading-relaxed">
            {t("verify.failed.body")}
          </p>
          <Link href="/login" className="btn-primary inline-flex">
            {t("verify.requestNew")}
          </Link>
        </>
      )}
    </div>
  );
}
