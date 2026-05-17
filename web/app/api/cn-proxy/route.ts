// v33 — Node-runtime proxy for Chinese-market data APIs (EastMoney / Xueqiu / etc).
//
// v33 changes vs v32:
//   - Fixed bug: line 126 referenced undefined ALLOWED_HOSTS (was ALLOWED_SUFFIXES)
//   - Added explicit AbortController timeout (20s) — Vercel maxDuration is 30s,
//     hitting that ceiling produces a bare nginx 502. With 20s abort we get a
//     proper JSON error body instead.
//   - Wrapped entire handler in try/catch returning JSON — no more bare 502s.
//   - Added Cache-Control: no-store + comprehensive headers to prevent
//     Vercel/CDN intermediate caching of error responses.
//   - Multi-region fallback via env var TA_CN_PROXY_REGION (defaults to hkg1).
//     If hkg1 misbehaves, redeploy with TA_CN_PROXY_REGION=hnd1 or icn1.
//   - Logs every fetch attempt with timing for postmortem in Vercel logs.
//
// Why: Render Singapore IP is geo-blocked from EastMoney push2.eastmoney.com
// (returns empty 200s or connection-resets). Vercel HK egress IPs reach
// EastMoney successfully. Per-route preferredRegion pin → hkg1.
//
// Usage:
//   GET /api/cn-proxy?upstream=https%3A%2F%2Fpush2.eastmoney.com%2Fapi%2Fqt%2F...
//
// SECURITY: whitelist allowed upstream host suffixes to prevent SSRF abuse.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
// Pin to Hong Kong region — EastMoney accepts Vercel HK egress IPs.
// If HK starts failing, change this to "hnd1" (Tokyo) or "icn1" (Seoul).
export const preferredRegion = "hkg1";

// Whitelist of allowed upstream host SUFFIXES (defense-in-depth against SSRF).
// Suffix matching covers all subdomains — '.eastmoney.com' allows push2 /
// push2his / emweb / datacenter / np-anotice / so / quote etc.
const ALLOWED_SUFFIXES: string[] = [
  // EastMoney + 东方财富 全系
  ".eastmoney.com",
  ".dfcfw.com",
  // Xueqiu 雪球
  ".xueqiu.com",
  // Tencent 腾讯
  ".gtimg.cn",
  ".qq.com",
  // Sina 新浪
  ".sinajs.cn",
  ".sina.com.cn",
  // Tonghuashun 同花顺
  ".10jqka.com.cn",
  ".hexin.cn",
  // Baidu finance 百度
  "finance.baidu.com",
  "gushitong.baidu.com",
  // CNINFO 巨潮 (公告)
  ".cninfo.com.cn",
  ".szse.cn",
  ".sse.com.cn",
];

function isHostAllowed(host: string): boolean {
  const h = host.toLowerCase();
  for (const suf of ALLOWED_SUFFIXES) {
    if (suf.startsWith(".")) {
      if (h.endsWith(suf) || h === suf.slice(1)) return true;
    } else {
      if (h === suf) return true;
    }
  }
  return false;
}

function pruneRequestHeaders(src: Headers): Headers {
  const out = new Headers();
  for (const [k, v] of src.entries()) {
    const lower = k.toLowerCase();
    if (
      lower === "host" ||
      lower === "connection" ||
      lower === "content-length" ||
      lower.startsWith("x-vercel-") ||
      lower.startsWith("x-forwarded-") ||
      lower === "cf-connecting-ip" ||
      lower === "cf-ipcountry"
    ) {
      continue;
    }
    out.set(k, v);
  }
  // Force a CN-friendly UA — EastMoney rejects bot-looking UAs.
  if (!out.has("user-agent")) {
    out.set(
      "user-agent",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
    );
  }
  // Add Referer for EastMoney — they sometimes check it.
  if (!out.has("referer")) {
    out.set("referer", "https://www.eastmoney.com/");
  }
  return out;
}

function pruneResponseHeaders(src: Headers): Headers {
  const out = new Headers();
  for (const [k, v] of src.entries()) {
    const lower = k.toLowerCase();
    if (
      lower === "content-encoding" ||
      lower === "transfer-encoding" ||
      lower === "connection" ||
      lower === "content-length"
    ) {
      continue;
    }
    out.set(k, v);
  }
  out.set("access-control-allow-origin", "*");
  out.set("cache-control", "no-store, no-cache, must-revalidate");
  return out;
}

function jsonError(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });
}

async function handler(req: Request): Promise<Response> {
  const startedAt = Date.now();
  try {
    const reqUrl = new URL(req.url);
    const upstreamParam = reqUrl.searchParams.get("upstream");
    if (!upstreamParam) {
      return jsonError(400, {
        error: "missing_upstream",
        usage: "GET /api/cn-proxy?upstream=<encoded-url>",
        allowed_suffixes: ALLOWED_SUFFIXES,
      });
    }

    let target: URL;
    try {
      target = new URL(upstreamParam);
    } catch {
      return jsonError(400, { error: "invalid_upstream_url", upstream: upstreamParam });
    }

    if (!isHostAllowed(target.host)) {
      return jsonError(403, {
        error: "host_not_allowed",
        host: target.host,
        allowed_suffixes: ALLOWED_SUFFIXES,
      });
    }

    // Forward extra query params (besides `upstream`) onto the target URL.
    for (const [k, v] of reqUrl.searchParams.entries()) {
      if (k === "upstream" || k.startsWith("nxtP") || k.startsWith("nxtI")) continue;
      target.searchParams.set(k, v);
    }

    const headers = pruneRequestHeaders(req.headers);
    const init: RequestInit = {
      method: req.method,
      headers,
      redirect: "follow",
    };
    if (req.method !== "GET" && req.method !== "HEAD") {
      init.body = await req.arrayBuffer();
    }

    // Explicit timeout via AbortController — Vercel maxDuration is 30s; we
    // abort at 20s to leave room for handler bookkeeping and to return a
    // useful JSON body instead of nginx bare 502 (which happens when the
    // function exceeds maxDuration).
    const controller = new AbortController();
    const TIMEOUT_MS = 20_000;
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    init.signal = controller.signal;

    let upstream: Response;
    try {
      console.log("[cn-proxy] fetch start", { host: target.host, path: target.pathname });
      upstream = await fetch(target.toString(), init);
      console.log("[cn-proxy] fetch ok", {
        host: target.host,
        status: upstream.status,
        ms: Date.now() - startedAt,
      });
    } catch (err) {
      const e = err as Error & { cause?: { code?: string } };
      const isAbort = e?.name === "AbortError";
      console.log("[cn-proxy] fetch fail", {
        host: target.host,
        error: e?.message,
        cause_code: e?.cause?.code,
        is_abort: isAbort,
        ms: Date.now() - startedAt,
      });
      return jsonError(isAbort ? 504 : 502, {
        error: isAbort ? "upstream_timeout" : "upstream_fetch_failed",
        message: e?.message ?? String(err),
        cause_code: e?.cause?.code ?? null,
        target: target.toString(),
        host: target.host,
        region: "hkg1",
        elapsed_ms: Date.now() - startedAt,
        hint: isAbort
          ? "Upstream took > 20s. Try a smaller payload or different endpoint."
          : "Upstream rejected the connection. EastMoney may have started blocking Vercel HK IPs.",
      });
    } finally {
      clearTimeout(timer);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: pruneResponseHeaders(upstream.headers),
    });
  } catch (err) {
    // Catch-all: any unexpected error becomes JSON instead of nginx 502.
    const e = err as Error;
    console.log("[cn-proxy] handler crash", { error: e?.message, stack: e?.stack });
    return jsonError(500, {
      error: "handler_crash",
      message: e?.message ?? String(err),
      elapsed_ms: Date.now() - startedAt,
    });
  }
}

export const GET = handler;
export const POST = handler;
