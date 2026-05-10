"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogOut, Beaker, Sparkles, Languages, AlertTriangle } from "lucide-react";
import { auth, api, type CurrentUser } from "../lib/api";
import { Logo } from "./Logo";
import { cn } from "../lib/cn";
import { useT } from "../lib/i18n";

const API_BASE = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

interface HealthSnapshot {
  status: "ok" | "degraded";
  mode: string;
  warnings: string[];
}

export default function Header() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const { t, locale, toggle } = useT();

  useEffect(() => {
    // Always pull /v1/health (public) so mode + degraded warnings are
    // visible to logged-out visitors too — they shouldn't have to log in
    // to discover that the backend is in mock mode.
    fetch(`${API_BASE}/v1/health`)
      .then((r) => r.json())
      .then((h: HealthSnapshot) => setHealth(h))
      .catch(() => undefined);

    if (!auth.isLoggedIn()) {
      setLoaded(true);
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => auth.clearToken())
      .finally(() => setLoaded(true));
  }, []);

  function logout() {
    auth.clearToken();
    window.location.href = "/";
  }

  // Show the *opposite* language as the toggle label so the button reads
  // like "click here to switch to <other language>".
  const toggleLabel = locale === "en" ? "中文" : "EN";
  const toggleTitle = locale === "en" ? "切换到中文" : "Switch to English";

  return (
    <header className="sticky top-0 z-30 border-b border-border-subtle bg-bg-base/70 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto h-14 flex items-center justify-between px-4 sm:px-6 gap-2">
        <Link href="/" className="flex items-center shrink-0">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 text-sm overflow-x-auto no-scrollbar">
          {loaded && user ? (
            <>
              <NavLink href="/decision">{t("header.newDecision")}</NavLink>
              <NavLink href="/hot">{t("header.hot")}</NavLink>
              <NavLink href="/me/history">{t("header.myHistory")}</NavLink>
              <NavLink href="/watchlist">{t("header.watchlist")}</NavLink>
              <NavLink href="/track-record">{t("header.trackRecord")}</NavLink>
              <NavLink href="/how-it-works">{t("header.howItWorks")}</NavLink>
              <NavLink href="/ecosystem">{t("header.ecosystem")}</NavLink>
              <NavLink href="/integrations">{t("header.integrations")}</NavLink>
              <NavLink href="/proof">{t("header.proof")}</NavLink>
              <NavLink href="/developers">{t("header.developers")}</NavLink>
              <NavLink href="/pricing">{t("header.pricing")}</NavLink>
              <ModeBadge real={user.real_llm} />
              {health && health.warnings.length > 0 && (
                <DegradedBadge warnings={health.warnings} />
              )}
              <span className="hidden sm:inline-flex text-xs text-ink-tertiary px-2">
                {user.id}
              </span>
              <LangToggle
                label={toggleLabel}
                title={toggleTitle}
                onClick={toggle}
              />
              <button
                onClick={logout}
                className="btn-ghost text-xs px-2 py-1"
                aria-label={t("header.logout")}
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </>
          ) : loaded ? (
            <>
              <NavLink href="/how-it-works">{t("header.howItWorks")}</NavLink>
              <NavLink href="/track-record">{t("header.trackRecord")}</NavLink>
              <NavLink href="/ecosystem">{t("header.ecosystem")}</NavLink>
              <NavLink href="/integrations">{t("header.integrations")}</NavLink>
              <NavLink href="/proof">{t("header.proof")}</NavLink>
              <NavLink href="/pricing">{t("header.pricing")}</NavLink>
              {/* Mode badge removed for logged-out visitors — every user
                  now hits the real LLM pipeline, so the mock/real
                  distinction adds noise without adding signal. We
                  still surface DegradedBadge when env keys are missing
                  (e.g. mock-fallback risk), so honesty isn't lost. */}
              {health && health.warnings.length > 0 && (
                <DegradedBadge warnings={health.warnings} />
              )}
              <LangToggle
                label={toggleLabel}
                title={toggleTitle}
                onClick={toggle}
              />
              <Link href="/login" className="btn-primary text-xs">
                {t("header.signIn")}
              </Link>
              <Link href="/redeem" className="btn-ghost text-xs">
                {t("header.redeemInvite")}
              </Link>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-md text-ink-secondary hover:text-ink-primary hover:bg-bg-hover transition-colors"
    >
      {children}
    </Link>
  );
}

function LangToggle({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="btn-ghost text-xs px-2 py-1 flex items-center gap-1"
    >
      <Languages className="w-3.5 h-3.5" />
      <span className="font-medium">{label}</span>
    </button>
  );
}

function DegradedBadge({ warnings }: { warnings: string[] }) {
  // Tooltip lists every warning the backend reported (env vars not set,
  // optional packages missing, etc.) — gives the user a one-glance view
  // of which features are silently disabled.
  const tip = warnings.join("\n• ");
  return (
    <span
      className="pill ml-1 bg-signal-warn_soft text-signal-warn cursor-help"
      title={`Backend warnings:\n• ${tip}`}
    >
      <AlertTriangle className="w-3 h-3" />
      {warnings.length} warning{warnings.length === 1 ? "" : "s"}
    </span>
  );
}

function ModeBadge({ real }: { real: boolean }) {
  const { t, locale } = useT();
  return (
    <span
      className={cn(
        "pill ml-2",
        real
          ? "bg-signal-buy_soft text-signal-buy"
          : "bg-signal-warn_soft text-signal-warn"
      )}
      title={
        real ? t("header.realTitle") : t("header.mockTitle")
      }
      // re-render on locale change
      key={locale}
    >
      {real ? (
        <Sparkles className="w-3 h-3" />
      ) : (
        <Beaker className="w-3 h-3" />
      )}
      {real ? t("header.real") : t("header.mock")}
    </span>
  );
}
