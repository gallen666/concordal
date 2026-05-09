"use client";

import { ShieldAlert } from "lucide-react";
import { useT } from "../lib/i18n";

export default function Disclaimer() {
  const { t } = useT();
  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-signal-warn_soft text-signal-warn flex items-center justify-center">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <h1 className="text-2xl font-semibold">{t("disclaimer.heading")}</h1>
      </div>

      <div className="space-y-5 text-ink-secondary leading-relaxed">
        <p>{t("disclaimer.body1")}</p>
        <p>{t("disclaimer.body2")}</p>
        <p>{t("disclaimer.body3")}</p>
      </div>
    </div>
  );
}
