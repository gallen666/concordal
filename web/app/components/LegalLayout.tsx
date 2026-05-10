"use client";

/**
 * Shared chrome for legal pages — Terms, Privacy, Disclaimer.
 *
 * v1 boilerplate template. The point is to have something that renders
 * cleanly + dates itself + warns operator that real lawyer review is
 * required before commercial launch in regulated jurisdictions.
 */

import { AlertTriangle } from "lucide-react";
import { useT } from "../lib/i18n";

export function LegalLayout({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}) {
  const { t } = useT();
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold">{title}</h1>
        <p className="text-xs text-ink-tertiary mt-2 font-mono">
          {t("legal.lastUpdated")}: {lastUpdated}
        </p>
      </header>

      {/* Operator-facing warning, hidden in print/PDF — keeps us honest
          about this being a placeholder */}
      <div className="surface border-signal-warn/30 bg-signal-warn_soft/40 p-4 mb-8 flex gap-3 items-start text-sm print:hidden">
        <AlertTriangle className="w-4 h-4 text-signal-warn shrink-0 mt-0.5" />
        <div className="text-ink-secondary leading-relaxed">
          {t("legal.boilerplateNote")}
        </div>
      </div>

      <article className="prose-legal space-y-6">{children}</article>
    </div>
  );
}
