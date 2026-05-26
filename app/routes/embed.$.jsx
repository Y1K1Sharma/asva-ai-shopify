/**
 * Reverse proxy for the Asvaai dashboard SPA (embedded build).
 *
 * Serves the dashboard SPA — built by asvaai-aeo-frontend-prod with base
 * `/embed/` (npm run build:embed) — FIRST-PARTY from this app's own origin at
 * `/embed/*`. The frontend sets `X-Frame-Options: DENY`, which would block the
 * dashboard from being framed; serving it through this proxy (a) makes it
 * same-origin with the embedded app (so the App Bridge -> SPA postMessage
 * handshake works) and (b) strips the frame-blocking headers.
 *
 * Resource route (loader only, no component) — returns the upstream bytes
 * verbatim with the frame headers removed.
 *
 * Upstream origin is configurable via ASVA_DASHBOARD_ORIGIN (defaults to the
 * staging frontend). API calls from inside the SPA go straight to the backend
 * (VITE_API_BASE_URL is baked into the embed build) — they do NOT pass through
 * this proxy.
 */

const DASHBOARD_ORIGIN =
  process.env.ASVA_DASHBOARD_ORIGIN ||
  "https://staging--asvaai-dashboard-prod.netlify.app";

export const loader = async ({ params, request }) => {
  const splat = params["*"] || "";
  const incoming = new URL(request.url);

  // SPA fallback, done here (not via Netlify redirects, which serve the WRONG
  // index for deep /embed/<route> paths). Real files (assets, favicon, anything
  // with an extension) are proxied as-is; every other path gets the embed
  // index.html so the client-side router can take over.
  const cleanPath = splat.split("?")[0];
  const isFile = splat.startsWith("assets/") || /\.[a-z0-9]+$/i.test(cleanPath);
  const upstreamPath = isFile ? `/embed/${splat}` : `/embed/index.html`;
  const target = `${DASHBOARD_ORIGIN}${upstreamPath}${incoming.search}`;

  let upstream;
  try {
    upstream = await fetch(target, {
      method: "GET",
      headers: {
        // Forward Accept so Netlify returns the right representation.
        Accept: request.headers.get("accept") || "*/*",
        "Accept-Encoding": "identity",
      },
      redirect: "follow",
    });
  } catch (err) {
    console.error("[embed proxy] upstream fetch failed:", target, err);
    return new Response("Dashboard temporarily unavailable", { status: 502 });
  }

  const headers = new Headers();
  // Copy through content-type + caching; DROP the upstream frame-blocking + transport headers.
  const ct = upstream.headers.get("content-type");
  if (ct) headers.set("Content-Type", ct);
  const cc = upstream.headers.get("cache-control");
  if (cc) headers.set("Cache-Control", cc);

  // Framing: this iframe is nested inside Shopify admin, so the ancestor chain
  // is [our app page (self)] -> [admin.shopify.com / <shop>.myshopify.com].
  // X-Frame-Options:SAMEORIGIN checks the TOP-LEVEL origin (admin.shopify.com),
  // NOT the immediate parent, so it FALSELY blocks our same-origin nested
  // iframe. CSP frame-ancestors is ancestor-chain-aware — use it and do NOT
  // emit X-Frame-Options (we never copy it from upstream; it's omitted here).
  headers.set(
    "Content-Security-Policy",
    "frame-ancestors 'self' https://admin.shopify.com https://*.myshopify.com",
  );

  const body = await upstream.arrayBuffer();
  return new Response(body, { status: upstream.status, headers });
};
