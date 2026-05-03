"use client";

/** A decorative SVG of seven agent dots orbiting a center, gradient-tinted.
 * Used in the landing hero to evoke "seven agents debating". */
import { useEffect, useState } from "react";

const ROLES = [
  { label: "Fundamentals", color: "#56d364" },
  { label: "Sentiment", color: "#5fa8e8" },
  { label: "News", color: "#d4a72c" },
  { label: "Technical", color: "#a371f7" },
  { label: "Bull/Bear", color: "#f78166" },
  { label: "Risk", color: "#f85149" },
  { label: "Manager", color: "#3fb950" },
];

export function AgentOrbit() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setActive((a) => (a + 1) % ROLES.length), 1400);
    return () => clearInterval(id);
  }, []);

  const cx = 200;
  const cy = 200;
  const r = 130;

  return (
    <div className="relative w-[400px] h-[400px] max-w-full mx-auto">
      <svg
        viewBox="0 0 400 400"
        className="w-full h-full"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="orbit-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(86,211,100,0.35)" />
            <stop offset="60%" stopColor="rgba(86,211,100,0.05)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <linearGradient id="ring" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
          </linearGradient>
        </defs>

        {/* central glow */}
        <circle cx={cx} cy={cy} r={140} fill="url(#orbit-glow)" />

        {/* ring */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="url(#ring)"
          strokeWidth={1}
          strokeDasharray="2 4"
        />

        {/* connecting lines from center to active */}
        {ROLES.map((role, i) => {
          const angle = (i / ROLES.length) * Math.PI * 2 - Math.PI / 2;
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;
          const isActive = i === active;
          return (
            <line
              key={`l-${i}`}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke={isActive ? role.color : "rgba(255,255,255,0.05)"}
              strokeWidth={isActive ? 1.2 : 0.5}
              opacity={isActive ? 0.6 : 0.5}
              style={{ transition: "all 0.5s ease" }}
            />
          );
        })}

        {/* central node */}
        <g>
          <circle cx={cx} cy={cy} r={26} fill="#0d1014" stroke="#272d36" />
          <text
            x={cx}
            y={cy + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#9aa6b8"
            fontSize="10"
            fontFamily="JetBrains Mono, monospace"
          >
            DEBATE
          </text>
        </g>

        {/* agent dots */}
        {ROLES.map((role, i) => {
          const angle = (i / ROLES.length) * Math.PI * 2 - Math.PI / 2;
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;
          const isActive = i === active;
          return (
            <g key={`a-${i}`}>
              <circle
                cx={x}
                cy={y}
                r={isActive ? 12 : 8}
                fill={role.color}
                opacity={isActive ? 1 : 0.5}
                style={{ transition: "all 0.5s ease" }}
              />
              <circle
                cx={x}
                cy={y}
                r={isActive ? 22 : 0}
                fill={role.color}
                opacity={0.15}
                style={{ transition: "all 0.5s ease" }}
              />
              <text
                x={x}
                y={y + 28}
                textAnchor="middle"
                fill={isActive ? role.color : "#5b6470"}
                fontSize="11"
                fontFamily="Inter, sans-serif"
                style={{ transition: "all 0.5s ease" }}
              >
                {role.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
