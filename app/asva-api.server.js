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

/**
 * Link an installed Shopify shop to its Asvaai parent_brand and get a
 * short-lived shop-scoped JWT for the embedded dashboard.
 *
 * Calls POST /api/v5/shopify/provision (authed by the X-Asva-App-Key shared
 * secret). The backend create-or-claims the brand (race-safe), records the
 * install, and returns { brand_id, token, expires_in, ... }. The embedded
 * dashboard SPA (Phase B) uses `token` to read this brand's geo_vis data via
 * the same backend endpoints the web app uses.
 *
 * Requires ASVA_APP_KEY to be set — without it the backend rejects with 401,
 * so callers MUST treat a thrown error as non-fatal (the scanner pages work
 * regardless of provisioning).
 *
 * @param {string} shopDomain   - the *.myshopify.com domain (install key)
 * @param {object} [opts]
 * @param {string} [opts.storefrontDomain] - public storefront/custom domain for the brand
 * @param {string} [opts.shopName]         - display name of the shop
 * @returns {Promise<object>} { brand_id, brand_name, domain, shop_domain, claimed_existing, token, expires_in }
 * @throws {Error} on HTTP failure (e.g. ASVA_APP_KEY unset -> 401).
 */
export async function provisionShop(shopDomain, opts = {}) {
  if (!ASVA_APP_KEY) {
    throw new Error("ASVA_APP_KEY not configured — Shopify bridge disabled");
  }
  const url = `${ASVA_API_BASE}/api/v5/shopify/provision`;
  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({
      shop_domain: shopDomain,
      domain: opts.storefrontDomain || undefined,
      shop_name: opts.shopName || undefined,
    }),
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

