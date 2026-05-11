"use client";

import { useT } from "../lib/i18n";

export default function Footer() {
  const { t, locale } = useT();
  const disclaimer =
    locale === "zh"
      ? "仅为决策支持工具。不构成投资建议。市场充满不确定性。"
      : "Decision-support tool only. Not investment advice. Markets are unpredictable.";
  const disclaimerLink = t("landing.disclaimerLink");
  const beta = locale === "zh" ? "v0.1.0 · 封闭测试" : "v0.1.0 · Closed beta";

  return (
    <footer className="mt-auto border-t border-border-subtle py-6 px-6">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-ink-tertiary">
        <div className="flex items-center gap-2">
          <span>⚠️</span>
          <span>{disclaimer}</span>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <a href="/terms" className="hover:text-ink-secondary">
            {t("footer.terms")}
          </a>
          <a href="/privacy" className="hover:text-ink-secondary">
            {t("footer.privacy")}
          </a>
          <a href="/disclaimer" className="hover:text-ink-secondary">
            {t("footer.disclaimer")}
          </a>
          <a href="/blog" className="hover:text-ink-secondary">
            Blog
          </a>
          <a
            href="https://github.com/gallen666/trading-agents-platform"
            className="hover:text-ink-secondary"
          >
            GitHub
          </a>
          <span className="opacity-50">{beta}</span>
        </div>
      </div>
    </footer>
  );
}
