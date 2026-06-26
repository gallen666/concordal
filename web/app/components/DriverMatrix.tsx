"use client";

/**
 * DriverMatrix — BofA-style segment × driver intensity heatmap.
 *
 * Modeled after BofA Exhibit 16 which cross-mapped semiconductor type
 * with role in data center. We generalize: rows = business segments /
 * product lines, cols = drivers (revenue, margin, AI leverage, etc.),
 * each cell carries a 0-5 intensity + short label.
 *
 * Intensity is encoded as Tailwind opacity on the accent color so
 * dominant drivers visually pop without needing custom CSS.
 *
 * Safe to mount empty: returns null when matrix is missing.
 */

import { Grid3x3 } from "lucide-react";
import { cn } from "../lib/cn";
import type { DriverMatrix as DriverMatrixType } from "../lib/api";

interface DriverMatrixProps {
  matrix: DriverMatrixType | null | undefined;
  locale?: "zh" | "en";
}

/** Map 0-5 intensity to a tailwind background class on the accent color. */
function intensityClass(value: number): string {
  const v = Math.max(0, Math.min(5, value));
  if (v >= 4.5) return "bg-accent/70 text-bg-base font-semibold";
  if (v >= 3.5) return "bg-accent/50 text-ink-primary font-semibold";
  if (v >= 2.5) return "bg-accent/30 text-ink-primary";
  if (v >= 1.5) return "bg-accent/15 text-ink-secondary";
  if (v >= 0.5) return "bg-accent/5 text-ink-tertiary";
  return "bg-bg-elev/30 text-ink-tertiary";
}

export function DriverMatrix({ matrix, locale = "en" }: DriverMatrixProps) {
  if (
    !matrix ||
    !Array.isArray(matrix.rows) ||
    !Array.isArray(matrix.cols) ||
    !Array.isArray(matrix.cells) ||
    matrix.rows.length === 0 ||
    matrix.cols.length === 0
  ) {
    return null;
  }

  // Defensive: only render rows whose cell-array matches col count.
  const safeRows = matrix.rows
    .map((row, i) => ({ name: row, cells: matrix.cells[i] }))
    .filter(
      (r) => Array.isArray(r.cells) && r.cells.length === matrix.cols.length,
    );

  if (safeRows.length === 0) return null;

  const titleZh = "驱动矩阵";
  const titleEn = "Driver Matrix";

  return (
    <div className="mb-4 rounded-md border border-border-subtle bg-bg-elev/30 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Grid3x3 className="w-3.5 h-3.5 text-ink-tertiary" />
        <div className="text-[10px] uppercase tracking-widest text-ink-tertiary font-mono">
          {locale === "zh" ? titleZh : titleEn}
        </div>
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-left text-[10px] uppercase tracking-wider text-ink-tertiary font-mono pb-2 pr-3 align-bottom min-w-[80px]">
                {locale === "zh" ? "分部 \\ 驱动" : "Segment \\ Driver"}
              </th>
              {matrix.cols.map((col, j) => (
                <th
                  key={j}
                  className="text-center text-[10px] uppercase tracking-wider text-ink-tertiary font-mono pb-2 px-1 align-bottom min-w-[80px]"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {safeRows.map((row, i) => (
              <tr key={i}>
                <td className="text-left text-xs font-semibold text-ink-primary py-1 pr-3 whitespace-nowrap">
                  {row.name}
                </td>
                {row.cells.map((cell, j) => (
                  <td key={j} className="p-0.5">
                    <div
                      className={cn(
                        "rounded px-2 py-2 text-center leading-tight",
                        intensityClass(cell.value),
                      )}
                      title={`${row.name} × ${matrix.cols[j]}: ${cell.value}/5`}
                    >
                      <div className="font-mono text-[10px] opacity-70">
                        {cell.value.toFixed(0)}
                      </div>
                      {cell.label && (
                        <div className="text-[11px] leading-tight mt-0.5">
                          {cell.label}
                        </div>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {matrix.caption && (
        <p className="mt-3 pt-3 border-t border-border-subtle text-xs text-ink-secondary leading-relaxed">
          {matrix.caption}
        </p>
      )}
    </div>
  );
}
