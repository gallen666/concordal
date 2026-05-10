"use client";

/**
 * PostHog browser snippet — vanilla integration, no SDK dependency.
 *
 * We use a tiny inline script that only fires when NEXT_PUBLIC_POSTHOG_KEY
 * is set. The free PostHog Cloud tier (1M events/month) covers everything
 * we need: page views, click events, custom events (decision_run /
 * upgrade_click / share_click).
 *
 * Why no `posthog-js` package: it's ~80KB gzipped and we don't need
 * autocapture features. The 30-line snippet below covers our funnel
 * without the bundle bloat.
 *
 * To enable: set NEXT_PUBLIC_POSTHOG_KEY in Vercel env (free tier at
 * posthog.com/signup). Stays gracefully no-op if unset.
 */

import { useEffect } from "react";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

declare global {
  interface Window {
    posthog?: {
      capture: (event: string, props?: Record<string, unknown>) => void;
      identify: (id: string) => void;
      reset: () => void;
    };
  }
}

export default function Analytics() {
  useEffect(() => {
    if (!KEY) return;
    if (typeof window === "undefined") return;
    if (window.posthog) return;  // already loaded

    // Minimal PostHog snippet (lazy-loads the full lib once).
    const script = document.createElement("script");
    script.async = true;
    script.src = `${HOST}/static/array.js`;
    script.onload = () => {
      // @ts-expect-error — PostHog injects itself onto window
      window.posthog?.init?.(KEY, {
        api_host: HOST,
        person_profiles: "identified_only",
        capture_pageview: true,
        capture_pageleave: true,
        // Privacy: anonymise IP, no recording, no fingerprinting.
        ip: false,
        disable_session_recording: true,
      });
    };
    document.head.appendChild(script);
    return () => {
      // Don't unload — PostHog wants to stay across route changes.
    };
  }, []);
  return null;
}

/** Helper to track custom events from anywhere in the app. Safe to call
 *  even when PostHog isn't loaded — it'll silently no-op. */
export function track(event: string, props?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  window.posthog?.capture?.(event, props);
}
