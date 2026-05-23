"use client";

/**
 * Route-level error boundary (Next.js App Router special file).
 *
 * Next.js automatically wraps every page in this boundary. When a Client
 * Component throws during render — exactly what happened in the v62
 * /equity-research crash, where the LLM returned key_takeaways as a string
 * and `.map()` blew up — this catches it and renders a friendly fallback
 * with a Retry button INSTEAD of the browser's blank white "This page
 * couldn't load" screen.
 *
 * The root layout (Header, footer, i18n provider) stays mounted, so this
 * fallback can use useT and the user keeps their navigation. global-error.tsx
 * is the deeper fallback for when the layout itself throws.
 */

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { useT } from "./lib/i18n";
import { reportClientError } from "./lib/safe";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { locale } = useT();

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[route error boundary]", error);
    // Tech-item #3: forward to backend → Sentry so production crashes page us
    // automatically (this is the boundary that would have caught v62's
    // earnings-analysis white-screen).
    reportClientError(error, "route");
  }, [error]);

  const zh = locale === "zh";

  return (
    <div className="max-w-2xl mx-auto px-6 py-20 text-center space-y-6">
      <AlertTriangle className="w-12 h-12 text-signal-warn mx-auto" />
      <h1 className="text-2xl font-semibold">
        {zh ? "这个页面出错了" : "Something went wrong on this page"}
      </h1>
      <p className="text-sm text-ink-secondary max-w-md mx-auto leading-relaxed">
        {zh
          ? "页面在渲染时遇到了一个意外的数据格式问题。这通常是临时的——重试一次往往就好。如果反复出现，请告诉我们。"
          : "The page hit an unexpected data shape while rendering. This is usually transient — a retry often fixes it. If it keeps happening, let us know."}
      </p>
      {error?.digest && (
        <p className="text-2xs font-mono text-ink-tertiary">
          ref: {error.digest}
        </p>
      )}
      <div className="flex items-center justify-center gap-3 flex-wrap pt-4">
        <button onClick={() => reset()} className="btn-primary text-sm">
          <RotateCcw className="w-4 h-4" />
          {zh ? "重试" : "Try again"}
        </button>
        <Link href="/" className="btn-secondary text-sm">
          <Home className="w-4 h-4" />
          {zh ? "回首页" : "Home"}
        </Link>
      </div>
    </div>
  );
}
