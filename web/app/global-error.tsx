"use client";

/**
 * Last-resort error boundary (Next.js App Router special file).
 *
 * This catches errors thrown by the ROOT layout itself — Header, footer, the
 * i18n provider, font loading, etc. When it fires, the root layout is gone,
 * so this component must render its own <html>/<body> and CANNOT rely on the
 * global stylesheet or any React context (useT, theme, etc.). Everything is
 * inline-styled and self-contained.
 *
 * In practice app/error.tsx handles 99% of crashes (page-level render
 * errors). This file only shows if the chrome around the page breaks.
 */

import { useEffect } from "react";
import { reportClientError } from "./lib/safe";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[global error boundary]", error);
    reportClientError(error, "global");
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          background: "#0a0a0b",
          color: "#e8e8ea",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 460, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 12px" }}>
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: "#9a9aa0",
              margin: "0 0 24px",
            }}
          >
            The app hit an unexpected error and couldn&apos;t recover the page
            chrome. Reloading usually fixes it.
          </p>
          {error?.digest && (
            <p
              style={{
                fontSize: 11,
                fontFamily: "ui-monospace, monospace",
                color: "#6a6a70",
                margin: "0 0 16px",
              }}
            >
              ref: {error.digest}
            </p>
          )}
          <button
            onClick={() => reset()}
            style={{
              appearance: "none",
              border: "1px solid #3a3a40",
              background: "#1a1a1d",
              color: "#e8e8ea",
              borderRadius: 8,
              padding: "10px 20px",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
