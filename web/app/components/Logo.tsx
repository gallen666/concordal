import { cn } from "../lib/cn";

/**
 * Bloomberg-grade logo mark.
 *
 * Square gradient tile (amber → cyan) with a monogram "TA" inside,
 * paired with the full word-mark in a tight tracking-tighter weight.
 * The square shape is intentional — it echoes a Bloomberg/terminal
 * tile motif rather than the friendly pill UI of consumer apps.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg
        width="26"
        height="26"
        viewBox="0 0 26 26"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="logo-tile" x1="0" y1="0" x2="26" y2="26" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FF7A00" />
            <stop offset="0.7" stopColor="#FFB000" />
            <stop offset="1" stopColor="#5BC0EB" />
          </linearGradient>
        </defs>
        {/* Square tile w/ subtle inner inset */}
        <rect x="1" y="1" width="24" height="24" rx="3" fill="url(#logo-tile)" />
        <rect x="2" y="2" width="22" height="22" rx="2.5" fill="none" stroke="rgba(0,0,0,0.20)" strokeWidth="0.5" />
        {/* Monogram "TA" — small caps, tight */}
        <text
          x="13"
          y="17.5"
          textAnchor="middle"
          fontFamily="'JetBrains Mono', monospace"
          fontSize="11"
          fontWeight="700"
          fill="#0A0E13"
          letterSpacing="-0.5"
        >
          TA
        </text>
      </svg>
      <div className="flex flex-col leading-none">
        <span className="font-semibold tracking-tighter text-ink-primary text-[15px]">
          TradingAgents
        </span>
        <span className="text-[9px] tracking-kicker uppercase text-ink-tertiary mt-0.5 font-mono">
          Decision Terminal
        </span>
      </div>
    </div>
  );
}
