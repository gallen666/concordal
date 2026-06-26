"use client";

/**
 * PhaseTimeline — BofA-style staged catalyst roadmap.
 *
 * Modeled after BofA Global Research's "Watts to Tokens" (25 May 2026)
 * 4-phase 800 VDC evolution chart. Each phase has a window, an event
 * (the trigger), named beneficiaries, and a delay-risk. Renders as a
 * horizontal timeline with connector lines — far more honest than a
 * single 12-month price target for multi-year theses.
 *
 * Safe to mount empty: returns null when phases is missing/empty.
 */

import { CalendarDays, AlertTriangle } from "lucide-react";
import { cn } from "../lib/cn";
import type { Phase } from "../lib/api";

interface PhaseTimelineProps {
  phases: Phase[];
  locale?: "zh" | "en";
}

export function PhaseTimeline({ phases, locale = "en" }: PhaseTimelineProps) {
  if (!Array.isArray(phases) || phases.length === 0) return null;

  const titleZh = "阶段化路线图";
  const titleEn = "Phased Roadmap";
  const beneficiariesLabel = locale === "zh" ? "受益方" : "Beneficiaries";
  const riskLabel = locale === "zh" ? "延迟风险" : "Delay Risk";

  return (
    <div className="mb-4 rounded-md border border-border-subtle bg-bg-elev/30 p-4">
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays className="w-3.5 h-3.5 text-ink-tertiary" />
        <div className="text-[10px] uppercase tracking-widest text-ink-tertiary font-mono">
          {locale === "zh" ? titleZh : titleEn}
        </div>
      </div>

      <div className="relative">
        {/* Horizontal connector line behind the dots */}
        <div className="absolute top-3 left-3 right-3 h-px bg-border-subtle" />

        <div
          className={cn(
            "relative grid gap-3 sm:gap-4",
            phases.length === 2 && "grid-cols-1 sm:grid-cols-2",
            phases.length === 3 && "grid-cols-1 sm:grid-cols-3",
            phases.length === 4 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
            phases.length >= 5 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
          )}
        >
          {phases.map((phase, i) => (
            <div key={i} className="relative">
              {/* Phase dot anchored on the connector line */}
              <div className="flex items-center gap-2 mb-2">
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono font-semibold shrink-0 z-10",
                    "bg-bg-card border-2",
                    i === 0
                      ? "border-accent text-accent"
                      : "border-border-subtle text-ink-tertiary",
                  )}
                >
                  {i + 1}
                </div>
                <div className="font-mono text-xs font-semibold text-ink-secondary">
                  {phase.window}
                </div>
              </div>

              <div className="ml-1">
                <div className="text-sm text-ink-primary leading-snug mb-2 font-medium">
                  {phase.event}
                </div>

                {Array.isArray(phase.beneficiaries) && phase.beneficiaries.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {phase.beneficiaries.map((b, j) => (
                      <span
                        key={j}
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-accent/10 text-accent border border-accent/20"
                        title={beneficiariesLabel}
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                )}

                {phase.risk && (
                  <div className="flex items-start gap-1 text-[11px] text-ink-tertiary leading-snug">
                    <AlertTriangle className="w-3 h-3 text-signal-warn shrink-0 mt-0.5" />
                    <span>
                      <span className="font-mono text-[9px] uppercase tracking-wide mr-1">
                        {riskLabel}:
                      </span>
                      {phase.risk}
                    </span>
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
