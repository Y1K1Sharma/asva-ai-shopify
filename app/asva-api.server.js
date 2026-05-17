/**
 * Asva backend API client (server-only).
 *
 * Wraps the asvaai-aeo-backend-prod scanner endpoints. Used by the
 * Shopify-app loader to fetch a shop's readiness scan and cache it in
 * Prisma for 24 hours.
 *
 * Base URL is read from ASVA_API_URL env var with a sensible production
 * default. Override per-environment as needed.
 *
 * NOTE: this file ends in .server.js so React Router / Vite never bundles
 * it into the browser bundle.
 */

const DEFAULT_BASE_URL =
  "https://asvaai-aeo-backend-prod-production.up.railway.app";

export const ASVA_API_BASE =
  process.env.ASVA_API_URL || DEFAULT_BASE_URL;

/**
 * Shared secret that unlocks the FULL scan-public payload (checks[],
 * fixes[], cross_protocol). Backend constant-time compares this against
 * its ASVA_SHOPIFY_APP_KEY env var. When unset on either side, callers
 * silently fall back to the sanitized free-tier response — the app
 * still renders the Home dashboard fine, but the All Checks / Fixes /
 * Cross-Protocol pages will show a "Backend not configured" notice
 * instead of real data. This makes ASVA_APP_KEY a deploy concern, not
 * a code concern.
 */
const ASVA_APP_KEY = process.env.ASVA_APP_KEY || "";

function buildHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (ASVA_APP_KEY) {
    headers["X-Asva-App-Key"] = ASVA_APP_KEY;
  }
  return headers;
}

/**
 * Run a full agentic-readiness scan against a public storefront.
 *
 * Uses the `/api/v5/scan-public` endpoint. When ASVA_APP_KEY is set,
 * the X-Asva-App-Key header is sent and the backend returns the FULL
 * unlocked-tier payload (checks, fixes, cross_protocol). Without the
 * key, the response is the sanitized free-tier shape — score, grade,
 * counters, rollups, top-5 fixes only.
 *
 * @param {string} shopDomain - The merchant's myshopify.com domain (or any
 *   public storefront URL). Backend strips https:// and trailing slashes.
 * @returns {Promise<object>} The scan response. Shape depends on whether
 *   ASVA_APP_KEY is configured — see scanIsUnlocked() helper.
 * @throws {Error} on HTTP failure with the backend's `detail` message.
 */
export async function scanShopifyShop(shopDomain) {
  const url = `${ASVA_API_BASE}/api/v5/scan-public`;
  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ domain: shopDomain }),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* ignore parse error */
    }
    throw new Error(detail);
  }
  return res.json();
}

