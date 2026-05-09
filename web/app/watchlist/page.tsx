"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Plus, Sparkles, TrendingUp } from "lucide-react";
import { auth } from "../lib/api";
import { cn } from "../lib/cn";
import { useT } from "../lib/i18n";

interface Item {
  ticker: string;
  market: string;
  note?: string;
}

const BASE = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

function authedFetch(path: string, init?: RequestInit) {
  const tok = auth.getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string>) || {}),
  };
  if (tok) headers["Authorization"] = `Bearer ${tok}`;
  return fetch(`${BASE}${path}`, { ...init, headers });
}

export default function WatchlistPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const { t } = useT();

  async function load() {
    setLoading(true);
    const r = await authedFetch("/v1/watchlist");
    if (r.ok) setItems(await r.json());
    setLoading(false);
  }

  useEffect(() => {
    if (!auth.isLoggedIn() && typeof window !== "undefined") {
      window.location.href = "/redeem";
      return;
    }
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!ticker) return;
    const t = ticker.toUpperCase().trim();
    // Auto-detect market from ticker shape: 6-digit numeric → A-share,
    // else US equity. Mirrors the API's _auto_route_market() so the saved
    // entry can be re-run without hitting the "wrong-market" error path.
    const market = /^\d{6}$/.test(t) ? "a_share" : "us_equity";
    await authedFetch("/v1/watchlist/items", {
      method: "POST",
      body: JSON.stringify({ ticker: t, market }),
    });
    setTicker("");
    load();
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <span className="label-cap">{t("watchlist.label")}</span>
          <h1 className="text-2xl font-semibold mt-1">{t("watchlist.heading")}</h1>
          <p className="text-sm text-ink-secondary mt-1">
            {t("watchlist.subheading")}
          </p>
        </div>
      </div>

      <form onSubmit={add} className="surface-elev p-3 mb-6 flex gap-2">
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder={t("watchlist.addPlaceholder")}
          className="input flex-1 font-mono uppercase tracking-wider"
        />
        <button type="submit" disabled={!ticker} className="btn-primary">
          <Plus className="w-4 h-4" /> {t("watchlist.add")}
        </button>
      </form>

      {loading && items.length === 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="surface p-5 h-32 animate-pulse bg-bg-hover/30"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((item, i) => (
            <TickerCard key={i} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function TickerCard({ item }: { item: Item }) {
  return (
    <Link
      href={`/decision?ticker=${item.ticker}`}
      className="surface p-5 hover:border-border hover:bg-bg-hover/40 transition-all group block"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="font-mono text-lg font-semibold tracking-wider">
            {item.ticker}
          </div>
          <div className="text-2xs label-cap mt-0.5">{item.market}</div>
        </div>
        <span className="pill bg-bg-subtle text-ink-tertiary border border-border-subtle group-hover:text-accent group-hover:border-accent/30 transition-colors">
          <Sparkles className="w-3 h-3" />
          Run
        </span>
      </div>
      {item.note && (
        <div className="text-xs text-ink-secondary line-clamp-2">
          {item.note}
        </div>
      )}
    </Link>
  );
}

function EmptyState() {
  const { t } = useT();
  return (
    <div className="surface p-10 text-center">
      <div className="inline-flex w-12 h-12 rounded-xl bg-accent-muted text-accent items-center justify-center mb-4">
        <Eye className="w-5 h-5" />
      </div>
      <h3 className="font-semibold mb-1">{t("watchlist.empty")}</h3>
      <p className="text-sm text-ink-secondary max-w-sm mx-auto">
        {t("watchlist.emptyHint")}
      </p>
      <Link
        href="/decision"
        className="btn-secondary mt-4 inline-flex"
      >
        <TrendingUp className="w-4 h-4" />
        {t("watchlist.runOneOff")}
      </Link>
    </div>
  );
}
