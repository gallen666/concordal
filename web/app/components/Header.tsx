"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogOut, Beaker, Sparkles, Languages } from "lucide-react";
import { auth, api, type CurrentUser } from "../lib/api";
import { Logo } from "./Logo";
import { cn } from "../lib/cn";
import { useT } from "../lib/i18n";

export default function Header() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const { t, locale, toggle } = useT();

  useEffect(() => {
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
      <div className="max-w-6xl mx-auto h-14 flex items-center justify-between px-6">
        <Link href="/" className="flex items-center">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {loaded && user ? (
            <>
              <NavLink href="/watchlist">{t("header.watchlist")}</NavLink>
              <NavLink href="/decision">{t("header.newDecision")}</NavLink>
              <NavLink href="/backtest">{t("header.backtest")}</NavLink>
              <ModeBadge real={user.real_llm} />
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
              <LangToggle
                label={toggleLabel}
                title={toggleTitle}
                onClick={toggle}
              />
              <Link href="/redeem" className="btn-secondary text-xs">
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
