// Edge-runtime proxy for the Gemini Generative Language API.
//
// Why: our Render backend lives in Singapore, where Google geo-blocks
// Gemini calls ("FAILED_PRECONDITION: User location is not supported").
// Vercel edge functions run on US POPs by default, which Google accepts.
//
// The path after /api/gemini-proxy/ is forwarded verbatim, so the
// upstream URL becomes:
//   https://generativelanguage.googleapis.com/<...path>?<query>
//
// API key is supplied by the caller (backend) as either ?key=... or
// the x-goog-api-key header. We do NOT inject our own.

export const runtime = "edge";
export const preferredRegion = ["iad1", "sfo1", "pdx1"]; // US east/west
export const dynamic = "force-dynamic";

const UPSTREAM = "https://generativelanguage.googleapis.com";

function buildTargetUrl(path: string[], reqUrl: string): string {
  // path may already contain colon-segments (e.g. "models/gemini-2.5-pro:generateContent")
  const joined = path.map(encodeURIComponent).join("/")
    // colons must stay literal for Google's REST routes
    .replace(/%3A/gi, ":");

  // Vercel/Next.js catch-all routes inject the matched slug as a `path`
  // query parameter on req.url. Google rejects it ("Cannot bind query
  // parameter `path`"), so strip it. Also drop the framework's `nxtP`
  // internals if present.
  const incoming = new URL(reqUrl).searchParams;
  const out = new URLSearchParams();
  for (const [k, v] of incoming.entries()) {
    if (k === "path" || k.startsWith("nxtP") || k.startsWith("nxtI")) continue;
    out.append(k, v);
  }
  const search = out.toString();
  return `${UPSTREAM}/${joined}${search ? "?" + search : ""}`;
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
  // Permissive CORS — backend calls are server-to-server but this also
  // makes the proxy debuggable from a browser.
  out.set("access-control-allow-origin", "*");
  return out;
}

async function proxy(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const { path } = await ctx.params;
  if (!path || path.length === 0) {
    return new Response("missing path", { status: 400 });
  }
  const target = buildTargetUrl(path, req.url);

  const headers = pruneRequestHeaders(req.headers);
  // Some clients set this; others don't — we don't care, just forward.
  if (!headers.has("content-type") && req.method !== "GET" && req.method !== "HEAD") {
    headers.set("content-type", "application/json");
  }

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    // Read body as ArrayBuffer to avoid streaming-related edge-runtime quirks.
    init.body = await req.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "proxy_fetch_failed",
        message: (err as Error).message,
        target,
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

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const PATCH = proxy;

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "access-control-allow-headers": "*",
      "access-control-max-age": "86400",
    },
  });
}
