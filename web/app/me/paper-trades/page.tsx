"use client";

/**
 * /me/paper-trades — Alpaca paper-trading dashboard.
 *
 * Shows the linked Alpaca paper account's cash, equity, open positions, and
 * recent orders. Sign-in required. If the operator hasn't set
 * ALPACA_API_KEY/SECRET on Render the endpoints return 503 and we display
 * a setup checklist instead.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, ExternalLink, ShieldAlert } from "lucide-react";
import { auth } from "../../lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API || "http://localhost:8000";

interface Account {
  cash: number; equity: number; buying_power: number;
  portfolio_value: number; status: string; currency: string;
}
interface Position {
  symbol: string; qty: number; avg_entry_price: number;
  market_value: number; unrealized_pl: number; unrealized_plpc: number;
}
interface Order {
  id: string; symbol: string; side: string; qty: number;
  filled_qty: number; filled_avg_price: number | null;
  status: string; submitted_at: string;
}

export default function PaperTradesPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.isLoggedIn()) { setLoading(false); return; }
    const opts: RequestInit = {
      headers: { Authorization: `Bearer ${auth.getToken()}` },
    };
    Promise.all([
      fetch(`${API_BASE}/v1/alpaca/paper/account`, opts).then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch(`${API_BASE}/v1/alpaca/paper/positions`, opts).then((r) => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API_BASE}/v1/alpaca/paper/orders?limit=20`, opts).then((r) => r.ok ? r.json() : []).catch(() => []),
    ]).then(([a, p, o]) => {
      if (!a) setError("503");
      setAccount(a as Account);
      setPositions((p as Position[]) || []);
      setOrders((o as Order[]) || []);
    }).finally(() => setLoading(false));
  }, []);

  if (!auth.isLoggedIn()) return <NotLoggedIn />;
  if (loading) return <LoadingState />;
  if (error === "503" || !account) return <SetupChecklist />;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <header className="mb-8">
        <div className="kicker mb-3"><Activity className="w-3.5 h-3.5" /> Paper trading</div>
        <h1 className="display text-3xl md:text-4xl text-ink-primary tracking-tighter">
          Watch every AI call fill in a real sandbox.
        </h1>
        <p className="text-ink-secondary mt-3 max-w-2xl">
          Connected to your Alpaca paper account. Fills are simulated against real market prices.
          Never real money — verified by the endpoint base URL ending in <code className="text-gold">paper-api</code>.
        </p>
      </header>

      <div className="grid md:grid-cols-4 gap-4 mb-10">
        <KpiCard label="Equity"        value={fmtUsd(account.equity)} />
        <KpiCard label="Cash"          value={fmtUsd(account.cash)} />
        <KpiCard label="Buying Power"  value={fmtUsd(account.buying_power)} />
        <KpiCard label="Status"        value={account.status.toUpperCase()} mono />
      </div>

      <section className="mb-10">
        <h2 className="display text-2xl mb-4 text-ink-primary">Positions</h2>
        {positions.length === 0 ? (
          <p className="text-ink-tertiary text-sm font-mono">No open positions.</p>
        ) : (
          <div className="surface-elev overflow-hidden">
            <table className="w-full text-sm tabular">
              <thead>
                <tr className="border-b border-border bg-bg-subtle text-ink-tertiary text-left">
                  <th className="px-4 py-3 label-cap">Symbol</th>
                  <th className="px-4 py-3 label-cap">Qty</th>
                  <th className="px-4 py-3 label-cap">Avg cost</th>
                  <th className="px-4 py-3 label-cap">Market value</th>
                  <th className="px-4 py-3 label-cap text-right">Unrealised P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.symbol} className="border-b border-border-subtle last:border-b-0">
                    <td className="px-4 py-3 font-mono">{p.symbol}</td>
                    <td className="px-4 py-3 font-mono tabular-nums">{p.qty}</td>
                    <td className="px-4 py-3 font-mono tabular-nums">{fmtUsd(p.avg_entry_price)}</td>
                    <td className="px-4 py-3 font-mono tabular-nums">{fmtUsd(p.market_value)}</td>
                    <td className={`px-4 py-3 font-mono tabular-nums text-right ${p.unrealized_pl >= 0 ? "text-signal-buy" : "text-signal-sell"}`}>
                      {p.unrealized_pl >= 0 ? "+" : ""}{fmtUsd(p.unrealized_pl)}
                      <span className="text-2xs text-ink-tertiary ml-2">({(p.unrealized_plpc * 100).toFixed(2)}%)</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="display text-2xl mb-4 text-ink-primary">Recent orders</h2>
        {orders.length === 0 ? (
          <p className="text-ink-tertiary text-sm font-mono">No orders yet.</p>
        ) : (
          <ul className="space-y-2">
            {orders.map((o) => (
              <li key={o.id} className="surface-elev px-4 py-3 flex items-center justify-between font-mono text-sm">
                <span className="flex items-center gap-3">
                  <span className={o.side === "buy" ? "text-signal-buy" : "text-signal-sell"}>
                    {o.side.toUpperCase()}
                  </span>
                  <span className="text-ink-primary">{o.symbol}</span>
                  <span className="text-ink-tertiary tabular-nums">{o.qty}</span>
                  {o.filled_avg_price && (
                    <span className="text-ink-secondary tabular-nums">@ {fmtUsd(o.filled_avg_price)}</span>
                  )}
                </span>
                <span className="text-2xs text-ink-tertiary uppercase tracking-wider">{o.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function fmtUsd(v: number): string {
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function KpiCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="surface-elev p-4">
      <div className="label-cap mb-2">{label}</div>
      <div className={`text-2xl text-ink-primary ${mono ? "font-mono" : "font-display"} tabular-nums`}>{value}</div>
    </div>
  );
}

function NotLoggedIn() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-20 text-center">
      <h1 className="display text-3xl text-ink-primary tracking-tighter mb-4">Sign in to view paper trades</h1>
      <Link href="/login" className="btn-primary mt-4">Sign in <ArrowRight className="w-4 h-4" /></Link>
    </div>
  );
}
function LoadingState() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-20 text-center text-ink-tertiary font-mono uppercase tracking-kicker">
      loading…
    </div>
  );
}
function SetupChecklist() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="surface-elev p-8 space-y-5">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-6 h-6 text-signal-warn" />
          <h1 className="display text-2xl text-ink-primary">Paper trading not yet configured</h1>
        </div>
        <p className="text-ink-secondary leading-relaxed text-sm">
          The Alpaca paper-trading bridge ships ready-to-go but needs paper API keys on the server.
          Three steps:
        </p>
        <ol className="space-y-3 text-sm">
          <li className="flex gap-3"><span className="font-mono text-gold">01</span>
            <span>Sign up at <a className="text-gold underline" href="https://alpaca.markets" target="_blank" rel="noopener noreferrer">alpaca.markets</a>. Free.</span>
          </li>
          <li className="flex gap-3"><span className="font-mono text-gold">02</span>
            <span>Generate paper API keys in dashboard → Paper Trading → API Keys. <strong>Never use live keys.</strong></span>
          </li>
          <li className="flex gap-3"><span className="font-mono text-gold">03</span>
            <span>On Render → Environment, set <code className="text-gold">ALPACA_API_KEY</code> and <code className="text-gold">ALPACA_API_SECRET</code>. Redeploy.</span>
          </li>
        </ol>
        <a href="https://alpaca.markets/learn/paper-trading-api/" target="_blank" rel="noopener noreferrer"
           className="btn-secondary text-sm">
          Alpaca docs <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}
