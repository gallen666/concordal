"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogOut, Beaker, Sparkles } from "lucide-react";
import { auth, api, type CurrentUser } from "../lib/api";
import { Logo } from "./Logo";
import { cn } from "../lib/cn";

export default function Header() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loaded, setLoaded] = useState(false);

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

  return (
    <header className="sticky top-0 z-30 border-b border-border-subtle bg-bg-base/70 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto h-14 flex items-center justify-between px-6">
        <Link href="/" className="flex items-center">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {loaded && user ? (
            <>
              <NavLink href="/watchlist">Watchlist</NavLink>
              <NavLink href="/decision">New decision</NavLink>
              <NavLink href="/backtest">Backtest</NavLink>
              <ModeBadge real={user.real_llm} />
              <span className="hidden sm:inline-flex text-xs text-ink-tertiary px-2">
                {user.id}
              </span>
              <button
                onClick={logout}
                className="btn-ghost text-xs px-2 py-1"
                aria-label="Logout"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </>
          ) : loaded ? (
            <Link href="/redeem" className="btn-secondary text-xs">
              Redeem invite
            </Link>
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

function ModeBadge({ real }: { real: boolean }) {
  return (
    <span
      className={cn(
        "pill ml-2",
        real
          ? "bg-signal-buy_soft text-signal-buy"
          : "bg-signal-warn_soft text-signal-warn"
      )}
      title={real ? "Real LLM enabled" : "Mock mode"}
    >
      {real ? (
        <Sparkles className="w-3 h-3" />
      ) : (
        <Beaker className="w-3 h-3" />
      )}
      {real ? "REAL" : "MOCK"}
    </span>
  );
}
