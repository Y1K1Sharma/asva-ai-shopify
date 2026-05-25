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
  const target = `${DASHBOARD_ORIGIN}/embed/${splat}${incoming.search}`;

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
  // Copy through content-type + caching; DROP frame-blocking + transport headers.
  const ct = upstream.headers.get("content-type");
  if (ct) headers.set("Content-Type", ct);
  const cc = upstream.headers.get("cache-control");
  if (cc) headers.set("Cache-Control", cc);
  // Explicitly allow this app to frame its own proxied content.
  headers.set("X-Frame-Options", "SAMEORIGIN");

  const body = await upstream.arrayBuffer();
  return new Response(body, { status: upstream.status, headers });
};
