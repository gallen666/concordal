"use client";

/**
 * Header — editorial-grade, mobile-friendly.
 *
 * Changes vs prior:
 *   - Mobile (<md): hamburger drawer instead of 1-char-wide column collapse.
 *   - Hidden WARNINGS badge for non-admin visitors (use ?admin=1 query or
 *     localStorage flag to surface it). The backend /v1/health endpoint still
 *     exposes them — operators check there.
 *   - Cleaner condensed nav: less items at top level, ":" grouped sub-items.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  LogOut, Languages, Menu, X, AlertTriangle, Sparkles, Beaker,
} from "lucide-react";
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

// Admins surface the WARNINGS badge by visiting /?admin=1 or setting
// localStorage.ta_admin = "1". Default visitors never see it.
function isAdminView(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("admin") === "1") {
      window.localStorage.setItem("ta_admin", "1");
      return true;
    }
    return window.localStorage.getItem("ta_admin") === "1";
  } catch {
    return false;
  }
}

export default function Header() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [admin, setAdmin] = useState(false);
  const { t, locale, toggle } = useT();

  useEffect(() => {
    setAdmin(isAdminView());
    fetch(`${API_BASE}/v1/health`)
      .then((r) => r.json())
      .then((h: HealthSnapshot) => setHealth(h))
      .catch(() => undefined);

    if (!auth.isLoggedIn()) {
      setLoaded(true);
      return;
    }
    api.me()
      .then(setUser)
      .catch(() => auth.clearToken())
      .finally(() => setLoaded(true));
  }, []);

  function logout() {
    auth.clearToken();
    window.location.href = "/";
  }

  const toggleLabel = locale === "en" ? "中" : "EN";
  const toggleTitle = locale === "en" ? "切换到中文" : "Switch to English";

  // Primary nav for logged-in / logged-out users.
  // For zh users, surface the A-share-centric pages (人气榜 / 北向龙虎 /
  // 涨停 板块) that were previously orphaned in the footer — that's where
  // a Chinese retail user expects to start their morning routine.
  const isZh = locale === "zh";
  const primaryLinks = user
    ? (isZh
        ? [
            { href: "/decision",        label: t("header.newDecision") },
            { href: "/cn-markets",      label: "A 股市场" },
            { href: "/hot",             label: "人气榜" },
            { href: "/me/history",      label: t("header.myHistory") || "我的决策" },
            { href: "/watchlist",       label: t("header.watchlist") },
            { href: "/track-record",    label: t("header.trackRecord") },
            { href: "/backtest",        label: "回测" },
            { href: "/blog",            label: "Blog" },
          ]
        : [
            { href: "/decision",        label: t("header.newDecision") },
            { href: "/me/history",      label: t("header.myHistory") || "我的决策" },
            { href: "/watchlist",       label: t("header.watchlist") },
            { href: "/track-record",    label: t("header.trackRecord") },
            { href: "/backtest",        label: "Backtest" },
            { href: "/chain",           label: "Spine" },
            { href: "/blog",            label: "Blog" },
          ])
    : (isZh
        ? [
            { href: "/decision?ticker=600519", label: "试一下" },
            { href: "/how-it-works",            label: t("header.howItWorks") },
            { href: "/track-record",            label: t("header.trackRecord") },
            { href: "/hot",                     label: "人气榜" },
            { href: "/blog",                    label: "Blog" },
            { href: "/pricing",                 label: t("header.pricing") },
          ]
        : [
            { href: "/decision?ticker=AAPL",    label: "Try it" },
            { href: "/how-it-works",            label: t("header.howItWorks") },
            { href: "/track-record",            label: t("header.trackRecord") },
            { href: "/blog",                    label: "Blog" },
            { href: "/pricing",                 label: t("header.pricing") },
          ]);

  // Secondary links live in the drawer only.
  const drawerSecondary = user
    ? (isZh
        ? [
            { href: "/me/referral",  label: t("header.referral") || "邀请赚配额" },
            { href: "/chain",        label: "数据脊柱" },
            { href: "/ecosystem",    label: t("header.ecosystem") },
            { href: "/integrations", label: t("header.integrations") },
            { href: "/proof",        label: t("header.proof") },
            { href: "/developers",   label: t("header.developers") },
            { href: "/pricing",      label: t("header.pricing") },
            { href: "/sponsor",      label: t("header.sponsor") },
            { href: "/how-it-works", label: t("header.howItWorks") },
          ]
        : [
            { href: "/me/referral",  label: t("header.referral") || "Referral" },
            { href: "/hot",          label: "Hot tickers" },
            { href: "/cn-markets",   label: "A-shares" },
            { href: "/ecosystem",    label: t("header.ecosystem") },
            { href: "/integrations", label: t("header.integrations") },
            { href: "/proof",        label: t("header.proof") },
            { href: "/developers",   label: t("header.developers") },
            { href: "/pricing",      label: t("header.pricing") },
            { href: "/sponsor",      label: t("header.sponsor") },
            { href: "/how-it-works", label: t("header.howItWorks") },
          ])
    : (isZh
        ? [
            { href: "/cn-markets",  label: "A 股市场" },
            { href: "/ecosystem",   label: t("header.ecosystem") },
            { href: "/proof",       label: t("header.proof") },
            { href: "/developers",  label: t("header.developers") },
            { href: "/sponsor",     label: t("header.sponsor") },
          ]
        : [
            { href: "/hot",         label: "Hot tickers" },
            { href: "/cn-markets",  label: "A-shares" },
            { href: "/ecosystem",   label: t("header.ecosystem") },
            { href: "/proof",       label: t("header.proof") },
            { href: "/developers",  label: t("header.developers") },
            { href: "/sponsor",     label: t("header.sponsor") },
          ]);

  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-bg-base/85 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto h-14 flex items-center px-4 sm:px-6 gap-3">
        <Link href="/" className="flex items-center shrink-0">
          <Logo />
        </Link>

        {/* Desktop nav — hidden below md, hamburger takes over there */}
        <nav className="hidden md:flex items-center gap-1 ml-4 text-sm flex-1">
          {loaded && primaryLinks.map((l) => (
            <NavLink key={l.href} href={l.href}>{l.label}</NavLink>
          ))}
        </nav>

        {/* Spacer */}
        <div className="flex-1 md:hidden" />

        {/* Right cluster */}
        <div className="flex items-center gap-2 shrink-0">
          {loaded && user && (
            <span className="hidden lg:inline-flex text-xs text-ink-tertiary px-2 font-mono truncate max-w-[14ch]">
              {user.id}
            </span>
          )}
          {admin && health && health.warnings.length > 0 && (
            <DegradedBadge warnings={health.warnings} />
          )}
          <LangToggle label={toggleLabel} title={toggleTitle} onClick={toggle} />

          {loaded && !user && (
            <Link href="/login" className="btn-primary hidden sm:inline-flex text-xs py-1.5">
              {locale === "zh" ? "登录" : "Sign in"}
            </Link>
          )}
          {loaded && user && (
            <button
              onClick={logout}
              className="btn-ghost hidden sm:inline-flex text-xs px-2 py-1"
              aria-label={t("header.logout")}
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Hamburger — always visible on mobile */}
          <button
            className="md:hidden btn-ghost p-1.5"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <Drawer
          onClose={() => setMenuOpen(false)}
          links={[...primaryLinks, ...drawerSecondary]}
          user={user}
          locale={locale}
          onLogout={logout}
        />
      )}
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="whitespace-nowrap px-3 py-1.5 rounded text-ink-secondary hover:text-ink-primary hover:bg-bg-hover transition-colors"
    >
      {children}
    </Link>
  );
}

function LangToggle({
  label, title, onClick,
}: { label: string; title: string; onClick: () => void; }) {
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
  const tip = warnings.join("\n• ");
  return (
    <span
      className="pill bg-signal-warn_soft text-signal-warn cursor-help hidden md:inline-flex"
      title={`Backend warnings:\n• ${tip}`}
    >
      <AlertTriangle className="w-3 h-3" />
      {warnings.length}
    </span>
  );
}

function Drawer({
  onClose, links, user, locale, onLogout,
}: {
  onClose: () => void;
  links: { href: string; label: string }[];
  user: CurrentUser | null;
  locale: string;
  onLogout: () => void;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[80vw] max-w-sm bg-bg-elevated border-l border-border-subtle md:hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border-subtle">
          <Logo />
          <button className="btn-ghost p-1.5" onClick={onClose} aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 flex flex-col gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="px-3 py-2.5 rounded text-ink-primary hover:bg-bg-hover transition-colors text-sm"
              onClick={onClose}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-border-subtle space-y-2">
          {user ? (
            <>
              <div className="text-xs text-ink-tertiary font-mono px-2 truncate">{user.id}</div>
              <button onClick={onLogout} className="btn-secondary w-full text-sm">
                <LogOut className="w-4 h-4" />
                {locale === "zh" ? "登出" : "Logout"}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-primary w-full text-sm" onClick={onClose}>
                {locale === "zh" ? "登录" : "Sign in"}
              </Link>
              <Link href="/redeem" className="btn-secondary w-full text-sm" onClick={onClose}>
                {locale === "zh" ? "兑换邀请码" : "Redeem invite"}
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  );
}
