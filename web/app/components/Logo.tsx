import { cn } from "../lib/cn";

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg
        width="22"
        height="22"
        viewBox="0 0 22 22"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="logo-grad" x1="0" y1="0" x2="22" y2="22" gradientUnits="userSpaceOnUse">
            <stop stopColor="#56d364" />
            <stop offset="1" stopColor="#5fa8e8" />
          </linearGradient>
        </defs>
        {/* Seven dots in a heptagon, like seven agents */}
        {Array.from({ length: 7 }).map((_, i) => {
          const angle = (i / 7) * Math.PI * 2 - Math.PI / 2;
          const r = 7.5;
          const cx = 11 + Math.cos(angle) * r;
          const cy = 11 + Math.sin(angle) * r;
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={1.6}
              fill="url(#logo-grad)"
              opacity={0.5 + (i / 7) * 0.5}
            />
          );
        })}
        <circle cx="11" cy="11" r="2.2" fill="url(#logo-grad)" />
      </svg>
      <span className="font-semibold tracking-tight text-ink-primary">
        TradingAgents
      </span>
    </div>
  );
}
