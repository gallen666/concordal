"use client";

/**
 * safe.tsx — the single source of truth for defending React renders
 * against untrusted LLM output.
 *
 * THE LESSON (v62–v64): a TypeScript annotation like `x as string[]` is a
 * COMPILE-TIME no-op. At runtime, if the LLM emits a string where the schema
 * promised an array, `x.map(...)` throws "x.map is not a function", the
 * exception bubbles up, and — with no error boundary — React unmounts the
 * entire tree. The user sees a blank white "This page couldn't load".
 *
 * We patched 48 individual call-sites across /equity-research, /research,
 * /decision and /report. This module turns those one-off patches into a
 * reusable contract:
 *
 *   - arr()  / strs() / num() / text()   coerce untrusted values safely
 *   - <SafeBoundary>                       isolates a render so one bad
 *                                          panel can't take down siblings
 *
 * Treat every value that originated from an LLM (anything under `parsed`,
 * `result`, agent output, etc.) as untrusted — the same way you'd treat
 * raw user input — and pass it through these helpers before iterating or
 * formatting it.
 */

import { Component, type ReactNode } from "react";

// ── Value coercion ────────────────────────────────────────────────────────

/**
 * Return v as an array, or [] if it isn't one. TS casts don't survive to
 * runtime; this does. Use everywhere you'd `.map()` over LLM data:
 *   arr(parsed.key_takeaways).map(...)
 *
 * Two overloads:
 *  1. When the input is ALREADY typed as an array (e.g. a strongly-typed
 *     `ReportData` field like `DupontRow[]`), the element type is preserved,
 *     so `arr(rows).map((r) => r.name)` keeps full type-safety.
 *  2. When the input is genuinely `unknown` (e.g. `parsed.foo` off an LLM
 *     envelope), it returns `unknown[]` — callers narrow with their own casts.
 * Both paths return [] at runtime for any non-array, which is the whole point.
 */
export function arr<T>(v: readonly T[] | null | undefined): T[];
export function arr<T = unknown>(v: unknown): T[];
export function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/**
 * Coerce to a string[] for bullet-list rendering. An array becomes a
 * stringified array (objects JSON-encoded); a bare non-empty string becomes
 * a single-item list (the common "LLM emitted a paragraph not an array"
 * case); anything else becomes []. Never throws.
 */
export function strs(v: unknown): string[] {
  if (Array.isArray(v)) {
    return (v as unknown[])
      .filter((x) => x != null)
      .map((x) => (typeof x === "string" ? x : JSON.stringify(x)));
  }
  if (typeof v === "string" && v.trim()) return [v];
  return [];
}

/** Number or null — never NaN, never a string masquerading as a number. */
export function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

/**
 * Render any unknown value as safe display text. Primitives are stringified;
 * objects/arrays are JSON-encoded (so React never throws "Objects are not
 * valid as a React child"); null/undefined become the fallback.
 */
export function text(v: unknown, fallback = "—"): string {
  if (v == null) return fallback;
  if (typeof v === "string") return v || fallback;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : fallback;
  if (typeof v === "boolean") return v ? "true" : "false";
  try {
    return JSON.stringify(v);
  } catch {
    return fallback;
  }
}

// ── Component-level error boundary ─────────────────────────────────────────

interface SafeBoundaryProps {
  children: ReactNode;
  /** Optional fallback UI. If omitted, a compact inline notice is shown. */
  fallback?: ReactNode;
  /** Optional label to identify which section failed (shown + logged). */
  label?: string;
  /** Optional callback for telemetry (wired to Sentry in tech-item #3). */
  onError?: (error: Error) => void;
}

interface SafeBoundaryState {
  failed: boolean;
}

/**
 * Wrap any subtree that renders LLM-derived data. If that subtree throws
 * during render, only this boundary's fallback shows — the rest of the page
 * keeps working. This is the panel-level complement to the route-level
 * app/error.tsx: error.tsx catches a whole-page crash; SafeBoundary contains
 * the blast radius to a single section.
 */
export class SafeBoundary extends Component<SafeBoundaryProps, SafeBoundaryState> {
  constructor(props: SafeBoundaryProps) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(): SafeBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    // Keep a console trail for local debugging; tech-item #3 (Sentry) will
    // forward this to remote error reporting.
    // eslint-disable-next-line no-console
    console.error(`[SafeBoundary${this.props.label ? ` · ${this.props.label}` : ""}]`, error);
    this.props.onError?.(error);
  }

  render() {
    if (this.state.failed) {
      if (this.props.fallback !== undefined) return this.props.fallback;
      return (
        <div className="surface border border-signal-warn/40 bg-signal-warn_soft/20 p-4 text-sm text-ink-secondary">
          <span className="label-cap text-signal-warn">
            {this.props.label ? `${this.props.label} · ` : ""}渲染失败 / render failed
          </span>
          <p className="mt-1 text-xs text-ink-tertiary">
            这一区块的数据格式异常，已跳过以保护页面其余部分。This section's data was
            malformed and was skipped to keep the rest of the page working.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
