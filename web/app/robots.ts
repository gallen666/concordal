import type { MetadataRoute } from "next";

/**
 * /robots.txt — tells crawlers what they can and can't index.
 *
 * Allow everything by default; explicitly disallow:
 *   - /me/* (private user history)
 *   - /d/* (shared decisions — these are by-link only, not for crawl)
 *   - /redeem (auth flow, no crawl value)
 *   - any /api/* if Next.js were proxying (we don't, but defensive)
 */

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.concordal.hk";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/me/", "/d/", "/redeem", "/api/"],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
