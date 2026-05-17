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

const jsonHeaders = { "Content-Type": "application/json" };

/**
 * Run a full agentic-readiness scan against a public storefront.
 *
 * Uses the `/api/v5/scan-public` endpoint (no auth required). The backend
 * rate-limits by IP — fine for low-volume Shopify-app installs since each
 * merchant triggers at most one fresh scan per 24h (we cache after that).
 *
 * @param {string} shopDomain - The merchant's myshopify.com domain (or any
 *   public storefront URL). Backend strips https:// and trailing slashes.
 * @returns {Promise<object>} The full scan response (score, grade, dimensions,
 *   rollups, counters, issue_summary, top_5_fixes, manifest_verified, etc.)
 * @throws {Error} on HTTP failure with the backend's `detail` message.
 */
export async function scanShopifyShop(shopDomain) {
  const url = `${ASVA_API_BASE}/api/v5/scan-public`;
  const res = await fetch(url, {
    method: "POST",
    headers: jsonHeaders,
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
