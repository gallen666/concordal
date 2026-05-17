// Node-runtime proxy for Chinese-market data APIs (EastMoney / Xueqiu / etc).
//
// Why: our Render backend lives in Singapore, where EastMoney's push2.eastmoney.com
// returns empty 200s (geo-blocked) and stock.xueqiu.com returns empty 200s.
// Verified via /v1/datasource/health: xueqiu/* and eastmoney/* all fail.
//
// Same playbook as gemini-proxy: route the call through Vercel so the
// outbound IP is no longer the blocked Render Singapore range. Vercel's
// default Node region (iad1, US-East) would still be blocked by EastMoney.
// We need an Asia-Pacific egress.
//
// HOW Vercel region selection works:
// - Edge runtime: routed to POP nearest CALLER → for Singapore caller
//   this lands in sin1, which is the same geo-block we're escaping.
// - Node runtime: runs in fixed region. We pin it to `hkg1` (Hong Kong)
//   via vercel.json. HK egress IPs are reachable from EastMoney.
//
// Usage:
//   GET /api/cn-proxy?upstream=https%3A%2F%2Fpush2.eastmoney.com%2Fapi%2Fqt%2F...
//
// SECURITY: we whitelist allowed upstream hosts to prevent SSRF abuse.
// Only Chinese market data hosts are allowed.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
// Pin to Hong Kong region — EastMoney/Xueqiu block our Render Singapore IP
// range but accept Vercel HK egress (verified by users' browsers reaching
// these domains directly from HK). This is per-Next.js-route region pin —
// other routes (like gemini-proxy) keep their own default (US-East).
export const preferredRegion = "hkg1";

// Whitelist of allowed upstream hosts (defense-in-depth against SSRF).
const ALLOWED_HOSTS = new Set<string>([
  // EastMoney
  "push2.eastmoney.com",
  "push2his.eastmoney.com",
  "emweb.eastmoney.com",
  "emweb.securities.eastmoney.com",
  "datacenter.eastmoney.com",
  "datacenter-web.eastmoney.com",
  "guba.eastmoney.com",
  // Xueqiu
  "stock.xueqiu.com",
  "xueqiu.com",
  // Tencent
  "qt.gtimg.cn",
  "web.ifzq.gtimg.cn",
  "stockapp.finance.qq.com",
  // Sina
  "hq.sinajs.cn",
  "money.finance.sina.com.cn",
  "finance.sina.com.cn",
  // Tonghuashun
  "stock.10jqka.com.cn",
  "d.10jqka.com.cn",
  // Baidu finance
  "finance.baidu.com",
  "gushitong.baidu.com",
]);


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
  // Force a CN-friendly UA — EastMoney sometimes rejects bot-looking UAs.
  if (!out.has("user-agent")) {
    out.set("user-agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15");
  }
  return out;
}

function pruneResponseHeaders(src: Headers): Headers {
  const out = new Headers();
  for (const [k, v] of src.entries()) {
    const lower = k.toLowerCase();
    if (
      lower === "content-encoding" || // already decoded by fetch
      lower === "transfer-encoding" ||
      lower === "connection" ||
      lower === "content-length"
    ) {
      continue;
    }
    out.set(k, v);
  }
  // Permissive CORS — server-to-server callers don't need it, but it makes
  // the proxy debuggable from a browser.
  out.set("access-control-allow-origin", "*");
  return out;
}

async function handler(req: Request): Promise<Response> {
  const reqUrl = new URL(req.url);
  const upstreamParam = reqUrl.searchParams.get("upstream");
  if (!upstreamParam) {
    return new Response(
      JSON.stringify({
        error: "missing upstream",
        usage: "GET /api/cn-proxy?upstream=<encoded-url>",
        allowed_hosts: Array.from(ALLOWED_HOSTS),
      }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  let target: URL;
  try {
    target = new URL(upstreamParam);
  } catch {
    return new Response(
      JSON.stringify({ error: "invalid upstream url" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  if (!ALLOWED_HOSTS.has(target.host)) {
    return new Response(
      JSON.stringify({
        error: "host not allowed",
        host: target.host,
        allowed_hosts: Array.from(ALLOWED_HOSTS),
      }),
      { status: 403, headers: { "content-type": "application/json" } }
    );
  }

  // Forward any extra query params from our proxy URL (besides `upstream`)
  // as additional query on the target URL. Skips Next.js internals.
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

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), init);
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "proxy_fetch_failed",
        message: (err as Error).message,
        target: target.toString(),
      }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: pruneResponseHeaders(upstream.headers),
  });
}

export const GET = handler;
export const POST = handler;
