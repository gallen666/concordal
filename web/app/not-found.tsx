"use client";

/**
 * Custom 404 — turn the "you hit a dead URL" moment into another
 * conversion opportunity. Every visitor who lands here is a fully-
 * intentioned bounce candidate; we route them to /decision instead.
 */

import Link from "next/link";
import { ArrowRight, Home, Map } from "lucide-react";
import { useT } from "./lib/i18n";

export default function NotFound() {
  const { locale } = useT();
  return (
    <div className="max-w-2xl mx-auto px-6 py-20 text-center space-y-6">
      <div className="text-6xl font-mono font-semibold text-ink-tertiary">404</div>
      <h1 className="text-2xl font-semibold">
        {locale === "zh" ? "页面不在这" : "Nothing here"}
      </h1>
      <p className="text-sm text-ink-secondary max-w-md mx-auto leading-relaxed">
        {locale === "zh"
          ? "这个 URL 没对应的页面。可能是链接过时了，或者你输错了。下面这几个地方更有用："
          : "That URL doesn't lead anywhere. Maybe a link went stale, or maybe a typo. Try one of these instead:"}
      </p>
      <div className="flex items-center justify-center gap-3 flex-wrap pt-4">
        <Link href="/" className="btn-secondary text-sm">
          <Home className="w-4 h-4" />
          {locale === "zh" ? "首页" : "Home"}
        </Link>
        <Link href="/decision" className="btn-primary text-sm">
          {locale === "zh" ? "做一次决策（免费）" : "Run a decision (free)"}
          <ArrowRight className="w-4 h-4" />
        </Link>
        <Link href="/ecosystem" className="btn-ghost text-sm">
          <Map className="w-4 h-4" />
          {locale === "zh" ? "看生态" : "Ecosystem"}
        </Link>
      </div>
    </div>
  );
}
