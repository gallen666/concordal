"use client";

/**
 * MoatRadar — BofA-style 5-criterion radar chart for moat/quality scoring.
 *
 * Modeled after BofA Global Research's 5 criteria for identifying analog
 * semi winners (portfolio breadth / high-voltage capability / architecture
 * flexibility / multi-device support / ecosystem partnerships). We let the
 * manager pick 5 axes appropriate to the specific ticker.
 *
 * Renders Recharts RadarChart on the left + criterion notes on the right.
 * Safe to mount empty: returns null when criteria array is empty.
 */

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import { Shield } from "lucide-react";
import type { CriterionScore } from "../lib/api";

interface MoatRadarProps {
  criteria: CriterionScore[];
  locale?: "zh" | "en";
}

export function MoatRadar({ criteria, locale = "en" }: MoatRadarProps) {
  if (!Array.isArray(criteria) || criteria.length === 0) return null;

  // Recharts needs ≥ 3 axes for a meaningful radar; below that fall back
  // to a simple bar list rather than render a degenerate triangle.
  const useRadar = criteria.length >= 3;

  const data = criteria.map((c) => ({
    name: c.name,
    score: Math.max(1, Math.min(5, c.score)),
    fullMark: 5,
  }));

  const titleZh = "护城河评分";
  const titleEn = "Moat Scorecard";

  return (
    <div className="mb-4 rounded-md border border-border-subtle bg-bg-elev/30 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-3.5 h-3.5 text-ink-tertiary" />
        <div className="text-[10px] uppercase tracking-widest text-ink-tertiary font-mono">
          {locale === "zh" ? titleZh : titleEn}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
        {/* Radar / Bar */}
        <div className="h-[260px] w-full">
          {useRadar ? (
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
                <PolarGrid
                  stroke="rgba(160,160,160,0.25)"
                  strokeDasharray="2 3"
                />
                <PolarAngleAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 5]}
                  tick={{ fontSize: 9, fill: "#9ca3af" }}
                  axisLine={false}
                />
                <Radar
                  name="Score"
                  dataKey="score"
                  stroke="#f97316"
                  fill="#f97316"
                  fillOpacity={0.35}
                />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="space-y-3 py-4">
              {data.map((d, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-ink-secondary">{d.name}</span>
                    <span className="font-mono text-xs text-ink-tertiary">
                      {d.score.toFixed(1)}/5
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-bg-elev rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent"
                      style={{ width: `${(d.score / 5) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notes column */}
        <div className="space-y-2 text-sm">
          {criteria.map((c, i) => (
            <div
              key={i}
              className="flex items-start gap-2 leading-snug border-b border-border-subtle/40 pb-2 last:border-b-0 last:pb-0"
            >
              <span className="inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-mono font-semibold shrink-0 bg-accent/10 text-accent border border-accent/20">
                {Math.max(1, Math.min(5, c.score)).toFixed(0)}
              </span>
              <div>
                <div className="text-ink-primary font-medium">{c.name}</div>
                {c.note && (
                  <div className="text-xs text-ink-tertiary leading-relaxed mt-0.5">
                    {c.note}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
