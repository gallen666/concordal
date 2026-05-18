import { cn } from "../lib/cn";

/**
 * Editorial Dialectic logo.
 *
 * Two opposed semicircles (bull jade left, bear brick right) with a gold
 * vertical bar running through them — the bar is the manager who
 * synthesises both sides into one trade. Squared-off shape feels like
 * a publisher's colophon, not a tech-bro mark.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        fill="none"
        aria-hidden="true"
      >
        {/* Left half — bull (muted jade) */}
        <path d="M14 4 A10 10 0 0 0 14 24 Z" fill="#5A8A6F" />
        {/* Right half — bear (muted brick) */}
        <path d="M14 4 A10 10 0 0 1 14 24 Z" fill="#A0524A" />
        {/* Gold vertical bar — the manager */}
        <rect x="13" y="3" width="2" height="22" fill="#C9A961" />
        {/* outer ring to give it polish */}
        <circle cx="14" cy="14" r="10" fill="none" stroke="rgba(237,230,216,0.15)" strokeWidth="0.5" />
      </svg>
      <div className="flex flex-col leading-none">
        <div className="flex items-baseline gap-2">
          <span className="font-display font-medium tracking-tight text-ink-primary text-[17px]">
            TradingAgents
          </span>
          {/* v47: Chinese double-name "协奏" (Concord) per brand strategy.
              Symbolises 7 agents in harmony — and harmony with regulators,
              clients, markets. Sits at smaller weight beside the wordmark. */}
          <span className="hidden sm:inline font-display text-[13px] text-gold tracking-wide leading-none">
            协奏
          </span>
        </div>
        <span className="text-[9px] tracking-kicker uppercase text-ink-tertiary mt-1 font-mono">
          The Decision Dialectic · Concord
        </span>
      </div>
    </div>
  );
}
