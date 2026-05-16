"use client";

/**
 * Header — IA v3, first-principles re-organisation.
 *
 * WHY THIS REWRITE:
 *
 *   v2 surfaced 9 flat items in the primary nav. Power users could find
 *   /chain, /etf, /hk-markets etc in the drawer, but new users couldn't
 *   — they saw a wall of options with no hierarchy.
 *
 *   v3 groups every page under 4 mega-menu categories that mirror the
 *   4 things a retail user actually came here to do:
 *
 *     决策 (Decide)   — the 7-agent debate, the product's core moat
 *     市场 (Market)   — browse what's interesting today
 *     研究 (Research) — power-user tools (chain, backtest, ecosystem)
 *     业绩 (Proof)    — track-record, evidence, trace
 *
 *   Plus:
 *     • Prominent ticker-symbol search (most-frequent user action,
 *       previously absent from the header entirely)
 *     • User menu on the right (history / watchlist / referral)
 *     • Hover-opened dropdowns desktop, accordion drawer on mobile
 *     • Active state on the currently-selected category
 *
 * Each link in the megamenu carries a `desc` so users scanning the
 * menu understand what each page is FOR, not just its name.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LogOut, Languages, Menu, X, AlertTriangle, ChevronDown, Search,
  Sparkles, GitBranch, Activity, BookOpen, History, Star, MessageSquare,
  TrendingUp, Flame, BarChart3, Building2, Network, Calendar, Users,
  Trophy, ShieldCheck, Microscope, Code, FileText, Gift, DollarSign,
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

interface NavItem {
  href: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  badge?: string;
}

interface NavGroup {
  key: string;
  label: string;
  // Sub-sections within a group, each with a heading and items.
  // For groups with no sub-sections, use a single section with heading: "".
  sections: { heading: string; items: NavItem[] }[];
}

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

// ---------------------------------------------------------------------------
// IA groups — single source of truth.
// ---------------------------------------------------------------------------

function buildGroups(isZh: boolean): NavGroup[] {
  const lbl = (zh: string, en: string) => (isZh ? zh : en);
  return [
    {
      key: "decide",
      label: lbl("决策", "Decide"),
      sections: [{
        heading: lbl("AI 投研", "AI research"),
        items: [
          {
            href: "/decision",
            label: lbl("7-agent 辩论", "7-agent debate"),
            desc: lbl(
              "多空 / 风险 / 经理四轮投研，最终 BUY/SELL/HOLD",
              "Bull vs bear + risk + manager — 7 agents, final BUY/SELL/HOLD",
            ),
            icon: <Sparkles className="w-4 h-4" />,
            badge: lbl("核心", "Core"),
          },
          {
            href: "/ask",
            label: lbl("AI 问答", "Ask AI"),
            desc: lbl(
              "自然语言投研问答 — 同花顺问财 clone，suggested ticker 一键转辩论",
              "Natural-language Q&A — suggested tickers one click from debate",
            ),
            icon: <MessageSquare className="w-4 h-4" />,
          },
          {
            href: "/me/history",
            label: lbl("我的历史决策", "My decisions"),
            desc: lbl(
              "看过去运行过的决策 + 实际涨跌对比",
              "Past decisions + realised forward return",
            ),
            icon: <History className="w-4 h-4" />,
          },
          {
            href: "/watchlist",
            label: lbl("自选股", "Watchlist"),
            desc: lbl(
              "关注列表 — 每日 AI 早评自动跑",
              "Watched tickers — daily AI brief auto-runs",
            ),
            icon: <Star className="w-4 h-4" />,
          },
        ],
      }],
    },
    {
      key: "market",
      label: lbl("市场", "Markets"),
      sections: [
        {
          heading: lbl("A 股", "A-shares"),
          items: [
            {
              href: "/hot/zt-pool",
              label: lbl("涨停股池", "Limit-up pool"),
              desc: lbl(
                "今日涨停 · 炸板 · 强势 · 跌停 四档实时",
                "Today's limit-up / failed / strong / limit-down",
              ),
              icon: <Flame className="w-4 h-4" />,
            },
            {
              href: "/cn-markets/fund-flow",
              label: lbl("资金流向", "Fund flow"),
              desc: lbl(
                "主力 / 超大单 / 大单 / 中单 / 小单 五级流向 + 板块",
                "Main / xlarge / large / mid / small order flow",
              ),
              icon: <TrendingUp className="w-4 h-4" />,
            },
            {
              href: "/cn-markets/sectors",
              label: lbl("板块行情", "Sectors"),
              desc: lbl(
                "申万行业 + 概念板块 — 热力图 + 涨跌排行",
                "Industry + concept boards — heatmap + ranking",
              ),
              icon: <BarChart3 className="w-4 h-4" />,
            },
            {
              href: "/cn-markets/block-trade",
              label: lbl("大宗交易", "Block trades"),
              desc: lbl(
                "机构席位大单成交记录",
                "Institutional block-trade records",
              ),
              icon: <Building2 className="w-4 h-4" />,
            },
            {
              href: "/hot",
              label: lbl("人气热搜", "Hot tickers"),
              desc: lbl(
                "百度热搜 + 雪球关注度排行",
                "Baidu trending + Xueqiu attention ranking",
              ),
              icon: <Flame className="w-4 h-4" />,
            },
          ],
        },
        {
          heading: lbl("其他市场", "Other markets"),
          items: [
            {
              href: "/hk-markets",
              label: lbl("港股行情", "HK markets"),
              desc: lbl(
                "南向资金 · 港股通成分股 · 涨跌排行",
                "Southbound flow · HK-Connect constituents · ranking",
              ),
              icon: <Building2 className="w-4 h-4" />,
            },
            {
              href: "/etf",
              label: lbl("ETF / 基金", "ETF / funds"),
              desc: lbl(
                "ETF 实时报价 + 开放式基金净值",
                "ETF spot + open-ended fund NAV",
              ),
              icon: <BarChart3 className="w-4 h-4" />,
            },
            {
              href: "/calendar",
              label: lbl("财经日历", "Calendar"),
              desc: lbl(
                "宏观数据 / 财报 / 央行决议 / IPO 时间表",
                "Macro releases / earnings / central-bank / IPO timeline",
              ),
              icon: <Calendar className="w-4 h-4" />,
            },
          ],
        },
      ],
    },
    {
      key: "research",
      label: lbl("研究", "Research"),
      sections: [
        {
          heading: lbl("工具", "Tools"),
          items: [
            {
              href: "/chain",
              label: lbl("数据脊柱 · live chain", "Data spine · live chain"),
              desc: lbl(
                "FRED → Qlib → Backtrader → Lean — 一个 ticker 跑完整 6 步链路",
                "FRED → Qlib → Backtrader → Lean — 6 steps end-to-end",
              ),
              icon: <GitBranch className="w-4 h-4" />,
            },
            {
              href: "/backtest",
              label: lbl("回测引擎", "Backtest engine"),
              desc: lbl(
                "单票回测 + 双引擎交叉验证 (Backtrader vs in-house)",
                "Single-ticker backtest + dual-engine cross-validation",
              ),
              icon: <Microscope className="w-4 h-4" />,
            },
          ],
        },
        {
          heading: lbl("视野", "Lens"),
          items: [
            {
              href: "/blog",
              label: lbl("AI 早评 · Blog", "AI daily · Blog"),
              desc: lbl(
                "每日大盘综述 + SEO 长文",
                "Daily market brief + long-form posts",
              ),
              icon: <FileText className="w-4 h-4" />,
            },
            {
              href: "/ecosystem",
              label: lbl("生态地图", "Ecosystem"),
              desc: lbl(
                "12 个集成项目 + DataBus 实时状态 (akshare / yfinance / FRED ...)",
                "12 integrated projects + live DataBus telemetry",
              ),
              icon: <Network className="w-4 h-4" />,
            },
            {
              href: "/how-it-works",
              label: lbl("工作原理", "How it works"),
              desc: lbl(
                "7 agent 流水线设计 / 数据脊柱架构图",
                "7-agent pipeline + data-spine architecture",
              ),
              icon: <BookOpen className="w-4 h-4" />,
            },
          ],
        },
      ],
    },
    {
      key: "proof",
      label: lbl("业绩", "Proof"),
      sections: [{
        heading: lbl("证据", "Evidence"),
        items: [
          {
            href: "/research",
            label: lbl("学术论文 · 方法论", "Research paper · methodology"),
            desc: lbl(
              "角色分离定理 · 10 个 Need 类型 · 78 周回测 · 完整 PDF",
              "Role-separation theorem · 10 Need types · 78-week study · full PDF",
            ),
            icon: <BookOpen className="w-4 h-4" />,
            badge: lbl("新", "New"),
          },
          {
            href: "/track-record",
            label: lbl("回测战绩", "Track record"),
            desc: lbl(
              "20 × 78 周历史回测 — sharpe / max DD / hit rate",
              "20 × 78 week historical backtest — sharpe / max DD / hit rate",
            ),
            icon: <Trophy className="w-4 h-4" />,
          },
          {
            href: "/proof",
            label: lbl("信任证据", "Trust evidence"),
            desc: lbl(
              "12 集成 / 25 测试 / 无 lookahead 全部摆出",
              "12 integrations / 25 tests / zero lookahead, listed",
            ),
            icon: <ShieldCheck className="w-4 h-4" />,
          },
          {
            href: "/developers",
            label: lbl("开发者 API", "Developers API"),
            desc: lbl(
              "REST endpoints + OpenAPI spec + API key",
              "REST endpoints + OpenAPI spec + API key",
            ),
            icon: <Code className="w-4 h-4" />,
          },
          {
            href: "/pricing",
            label: lbl("订阅升级", "Pricing"),
            desc: lbl(
              "Free / Pro / Team — 解锁配额 + 优先级队列",
              "Free / Pro / Team — quota + priority queue",
            ),
            icon: <DollarSign className="w-4 h-4" />,
          },
        ],
      }],
    },
  ];
}

// ---------------------------------------------------------------------------
// Ticker resolver — accept "600519", "AAPL", "茅台", "BTC/USDT", route to
// /decision (or /stock for A-share since one-stop comprehensive view is
// stronger there). Empty input is a no-op.
// ---------------------------------------------------------------------------

function resolveTickerRoute(raw: string): string | null {
  const q = raw.trim().toUpperCase();
  if (!q) return null;
  // 6-digit A-share — route to /stock for the one-stop comprehensive page
  if (/^\d{6}$/.test(q)) return `/stock/${q}`;
  // Crypto pair (BTC/USDT, ETH-USDC) — /decision
  if (/[/-]/.test(q) && /[A-Z]{2,}/.test(q)) {
    return `/decision?ticker=${encodeURIComponent(q)}`;
  }
  // Uppercase US ticker
  if (/^[A-Z]{1,5}$/.test(q)) return `/decision?ticker=${q}`;
  // Chinese name search — route to /ask (we don't have name → ticker
  // resolution wired yet, so AskAI is the best surface)
  return `/ask?q=${encodeURIComponent(raw.trim())}`;
}

// ---------------------------------------------------------------------------
// Header component.
// ---------------------------------------------------------------------------

export default function Header() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const { t, locale, toggle } = useT();
  const pathname = usePathname();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);

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

  // Cmd-K / Ctrl-K focuses the ticker search globally.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      // Esc closes any open dropdown
      if (e.key === "Escape") setOpenGroup(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Click outside closes the open dropdown.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as Element;
      if (!target.closest?.("[data-megamenu]")) setOpenGroup(null);
    }
    if (openGroup) document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [openGroup]);

  function logout() {
    auth.clearToken();
    window.location.href = "/";
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const route = resolveTickerRoute(searchInput);
    if (route) {
      setSearchInput("");
      setSearchFocused(false);
      router.push(route);
    }
  }

  const isZh = locale === "zh";
  const groups = buildGroups(isZh);
  const toggleLabel = locale === "en" ? "中" : "EN";
  const toggleTitle = locale === "en" ? "切换到中文" : "Switch to English";

  // Which group's first-section is the active page in?
  const activeGroupKey = groups.find((g) =>
    g.sections.some((s) => s.items.some((it) =>
      pathname === it.href || pathname.startsWith(it.href + "/"),
    )),
  )?.key;

  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-bg-base/85 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto h-14 flex items-center px-4 sm:px-6 gap-3">
        <Link href="/" className="flex items-center shrink-0">
          <Logo />
        </Link>

        {/* Desktop: group nav + ticker search */}
        <nav
          className="hidden md:flex items-center gap-1 ml-3 text-sm flex-1"
          data-megamenu
        >
          {loaded && groups.map((g) => (
            <GroupTrigger
              key={g.key}
              group={g}
              active={activeGroupKey === g.key}
              open={openGroup === g.key}
              onToggle={() =>
                setOpenGroup((o) => (o === g.key ? null : g.key))
              }
              onClose={() => setOpenGroup(null)}
            />
          ))}

          {/* Inline ticker search */}
          <form
            onSubmit={submitSearch}
            className="ml-2 flex-1 max-w-md relative"
          >
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded border transition-colors",
              searchFocused
                ? "border-accent bg-bg-hover"
                : "border-border-subtle bg-bg-base/50 hover:border-border",
            )}>
              <Search className="w-3.5 h-3.5 text-ink-tertiary shrink-0" />
              <input
                ref={searchRef}
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                placeholder={isZh
                  ? "搜代码：600519 / AAPL / BTC/USDT"
                  : "Ticker: 600519 / AAPL / BTC/USDT"}
                className="bg-transparent outline-none text-sm flex-1 placeholder:text-ink-tertiary font-mono"
              />
              <kbd className="hidden lg:inline-flex items-center text-2xs text-ink-tertiary font-mono px-1.5 py-0.5 rounded border border-border-subtle">
                ⌘K
              </kbd>
            </div>
            {searchFocused && searchInput.trim() && (
              <SearchPreview
                query={searchInput}
                isZh={isZh}
              />
            )}
          </form>
        </nav>

        {/* Mobile spacer */}
        <div className="flex-1 md:hidden" />

        {/* Right cluster */}
        <div className="flex items-center gap-2 shrink-0">
          {admin && health && health.warnings.length > 0 && (
            <DegradedBadge warnings={health.warnings} />
          )}
          <LangToggle label={toggleLabel} title={toggleTitle} onClick={toggle} />

          {loaded && !user && (
            <Link
              href="/login"
              className="btn-primary hidden sm:inline-flex text-xs py-1.5"
            >
              {isZh ? "登录" : "Sign in"}
            </Link>
          )}
          {loaded && user && (
            <UserMenu user={user} isZh={isZh} onLogout={logout} />
          )}

          {/* Hamburger — mobile only */}
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
        <MobileDrawer
          onClose={() => setMenuOpen(false)}
          groups={groups}
          user={user}
          isZh={isZh}
          onLogout={logout}
        />
      )}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Sub-components.
// ---------------------------------------------------------------------------

function GroupTrigger({
  group, active, open, onToggle, onClose,
}: {
  group: NavGroup;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={cn(
          "flex items-center gap-1 px-3 py-1.5 rounded transition-colors",
          active
            ? "text-ink-primary bg-bg-hover"
            : "text-ink-secondary hover:text-ink-primary hover:bg-bg-hover",
        )}
      >
        <span className="font-medium">{group.label}</span>
        <ChevronDown className={cn(
          "w-3 h-3 transition-transform",
          open && "rotate-180",
        )} />
      </button>
      {open && (
        <MegaMenuPanel group={group} onClose={onClose} />
      )}
    </div>
  );
}

function MegaMenuPanel({
  group, onClose,
}: { group: NavGroup; onClose: () => void }) {
  const multiSection = group.sections.length > 1;
  return (
    <div
      data-megamenu
      className={cn(
        "absolute left-0 mt-2 surface-elev shadow-2xl rounded-lg border border-border-subtle",
        "z-50 overflow-hidden",
        multiSection ? "w-[640px]" : "w-[360px]",
      )}
    >
      <div className={cn(
        "p-4",
        multiSection && "grid grid-cols-2 gap-x-6",
      )}>
        {group.sections.map((section) => (
          <div key={section.heading} className="min-w-0">
            {section.heading && (
              <div className="label-cap text-2xs mb-2 px-2">
                {section.heading}
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className="flex items-start gap-3 px-2 py-2 rounded hover:bg-bg-hover group transition-colors"
                >
                  <span className="text-accent mt-0.5 shrink-0">
                    {item.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-ink-primary group-hover:text-accent">
                        {item.label}
                      </span>
                      {item.badge && (
                        <span className="text-2xs px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <div className="text-2xs text-ink-tertiary leading-snug mt-0.5">
                      {item.desc}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SearchPreview({ query, isZh }: { query: string; isZh: boolean }) {
  const route = resolveTickerRoute(query);
  if (!route) return null;
  const q = query.trim().toUpperCase();
  // Tell the user where they'll go on Enter.
  let hint: React.ReactNode;
  if (route.startsWith("/stock/")) {
    hint = (
      <>
        <span className="text-ink-tertiary">{isZh ? "跳转到" : "Open"}</span>{" "}
        <code className="text-accent">/stock/{q}</code>{" "}
        <span className="text-ink-tertiary">{isZh ? "(A 股一站式综合页)" : "(A-share comprehensive page)"}</span>
      </>
    );
  } else if (route.startsWith("/decision?")) {
    hint = (
      <>
        <span className="text-ink-tertiary">{isZh ? "跳转到" : "Open"}</span>{" "}
        <code className="text-accent">/decision?ticker={q}</code>{" "}
        <span className="text-ink-tertiary">{isZh ? "(运行 7-agent 辩论)" : "(run 7-agent debate)"}</span>
      </>
    );
  } else {
    hint = (
      <>
        <span className="text-ink-tertiary">{isZh ? "跳转到" : "Open"}</span>{" "}
        <code className="text-accent">/ask</code>{" "}
        <span className="text-ink-tertiary">{isZh ? "(AI 自然语言搜索)" : "(natural-language search)"}</span>
      </>
    );
  }
  return (
    <div className="absolute left-0 right-0 mt-2 surface-elev shadow-xl rounded-lg border border-border-subtle p-3 text-xs z-50">
      <div className="flex items-center gap-2">
        <span className="text-accent">↵</span>
        {hint}
      </div>
    </div>
  );
}

function UserMenu({
  user, isZh, onLogout,
}: { user: CurrentUser; isZh: boolean; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as Element;
      if (!target.closest?.("[data-usermenu]")) setOpen(false);
    }
    if (open) document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  const items = [
    { href: "/me/history",  label: isZh ? "我的历史决策" : "My decisions",  icon: <History className="w-3.5 h-3.5" /> },
    { href: "/watchlist",   label: isZh ? "自选股"        : "Watchlist",     icon: <Star className="w-3.5 h-3.5" /> },
    { href: "/me/referral", label: isZh ? "邀请赚配额"     : "Referral",       icon: <Gift className="w-3.5 h-3.5" /> },
    { href: "/sponsor",     label: isZh ? "赞助 / 支持"   : "Sponsor",        icon: <DollarSign className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="relative" data-usermenu>
      <button
        onClick={() => setOpen((o) => !o)}
        className="hidden sm:flex items-center gap-1.5 btn-ghost text-xs px-2 py-1"
      >
        <Users className="w-3.5 h-3.5" />
        <span className="hidden lg:inline font-mono truncate max-w-[10ch]">
          {user.id}
        </span>
        <ChevronDown className={cn(
          "w-3 h-3 transition-transform",
          open && "rotate-180",
        )} />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 surface-elev shadow-xl rounded-lg border border-border-subtle p-1 z-50">
          <div className="px-3 py-2 text-2xs text-ink-tertiary font-mono border-b border-border-subtle truncate">
            {user.id}
          </div>
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded hover:bg-bg-hover text-sm text-ink-primary"
            >
              {it.icon}
              {it.label}
            </Link>
          ))}
          <button
            onClick={() => { setOpen(false); onLogout(); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-bg-hover text-sm text-ink-secondary"
          >
            <LogOut className="w-3.5 h-3.5" />
            {isZh ? "登出" : "Logout"}
          </button>
        </div>
      )}
    </div>
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

function MobileDrawer({
  onClose, groups, user, isZh, onLogout,
}: {
  onClose: () => void;
  groups: NavGroup[];
  user: CurrentUser | null;
  isZh: boolean;
  onLogout: () => void;
}) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = resolveTickerRoute(searchInput);
    if (r) { onClose(); router.push(r); }
  }
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[88vw] max-w-sm bg-bg-elevated border-l border-border-subtle md:hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border-subtle">
          <Logo />
          <button className="btn-ghost p-1.5" onClick={onClose} aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mobile ticker search */}
        <form onSubmit={submit} className="p-4 border-b border-border-subtle">
          <div className="flex items-center gap-2 px-3 py-2 rounded border border-border-subtle bg-bg-base/50">
            <Search className="w-4 h-4 text-ink-tertiary shrink-0" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={isZh ? "搜代码 600519 / AAPL" : "Ticker 600519 / AAPL"}
              className="bg-transparent outline-none text-sm flex-1 font-mono placeholder:text-ink-tertiary"
              autoFocus
            />
          </div>
        </form>

        <nav className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
          {groups.map((g) => (
            <div key={g.key} className="flex flex-col">
              <div className="label-cap px-3 py-1.5 mt-2">{g.label}</div>
              {g.sections.map((s) => (
                <div key={s.heading} className="flex flex-col">
                  {s.heading && (
                    <div className="text-2xs text-ink-tertiary px-3 py-1">
                      {s.heading}
                    </div>
                  )}
                  {s.items.map((it) => (
                    <Link
                      key={it.href}
                      href={it.href}
                      onClick={onClose}
                      className="flex items-center gap-3 px-3 py-2 rounded hover:bg-bg-hover transition-colors"
                    >
                      <span className="text-accent shrink-0">{it.icon}</span>
                      <span className="text-sm text-ink-primary">{it.label}</span>
                      {it.badge && (
                        <span className="text-2xs px-1.5 py-0.5 rounded bg-accent/10 text-accent ml-auto">
                          {it.badge}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-border-subtle space-y-2">
          {user ? (
            <>
              <div className="text-xs text-ink-tertiary font-mono px-2 truncate">{user.id}</div>
              <Link
                href="/me/history"
                className="btn-secondary w-full text-sm"
                onClick={onClose}
              >
                <History className="w-4 h-4" />
                {isZh ? "我的历史决策" : "My decisions"}
              </Link>
              <button onClick={() => { onClose(); onLogout(); }} className="btn-ghost w-full text-sm">
                <LogOut className="w-4 h-4" />
                {isZh ? "登出" : "Logout"}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-primary w-full text-sm" onClick={onClose}>
                {isZh ? "登录" : "Sign in"}
              </Link>
              <Link href="/redeem" className="btn-secondary w-full text-sm" onClick={onClose}>
                {isZh ? "兑换邀请码" : "Redeem invite"}
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  );
}
