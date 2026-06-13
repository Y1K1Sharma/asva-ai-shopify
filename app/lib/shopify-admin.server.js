/**
 * Shopify Admin GraphQL helpers for the embedded app.
 *
 * server-only (file ends in .server.js so the browser bundle never sees it).
 *
 * fetchShopBasics(admin) returns the minimal "real shop identity" we need to:
 *   - render "Connected to <primary domain>" instead of the *.myshopify.com handle
 *   - hand the real shop-owner email to the backend so app.asvaai.com forgot-
 *     password can bridge a Shopify install to a normal Asvaai web login
 *   - capture currency + country for region-aware audits later
 *
 * The query is intentionally small (~50 Admin API points) so calling it on
 * every navigation is safe within Shopify's 1000pt/min per-shop budget.
 *
 * Gated by Railway env ASVA_USE_PRIMARY_DOMAIN (default ON). When OFF the
 * helper resolves to null and the caller falls back to legacy
 * `shop.replace(/\.myshopify\.com$/, "")` rendering — see plan v2.2 §3 Phase 2.
 */

const SHOP_BASICS_QUERY = `#graphql
  query AsvaShopBasics {
    shop {
      name
      primaryDomain { host url }
      currencyCode
      contactEmail
      shopOwnerName
      billingAddress { country countryCodeV2 }
    }
  }
`;

/**
 * Resolve real shop identity via Admin GraphQL. Returns null when the
 * primary-domain feature flag is off OR the GraphQL call fails — both are
 * non-fatal: the caller renders the legacy *.myshopify.com label and we
 * still ship provision/scan with the old payload shape.
 *
 * @param {object} admin - the authenticated Admin client from `authenticate.admin(request)`
 * @returns {Promise<null | {
 *   shopName: string | null,
 *   primaryDomain: string | null,
 *   primaryUrl: string | null,
 *   currencyCode: string | null,
 *   contactEmail: string | null,
 *   shopOwnerName: string | null,
 *   countryCode: string | null,
 * }>}
 */
export async function fetchShopBasics(admin) {
  // eslint-disable-next-line no-undef
  const flag = (process.env.ASVA_USE_PRIMARY_DOMAIN ?? "true").toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off") return null;
  if (!admin || typeof admin.graphql !== "function") return null;

  try {
    const res = await admin.graphql(SHOP_BASICS_QUERY);
    const json = await res.json();
    if (json.errors) {
      console.error("[shopify-admin] fetchShopBasics graphql errors:", JSON.stringify(json.errors));
      return null;
    }
    const shop = json?.data?.shop || {};
    const primary = shop.primaryDomain || {};
    const billing = shop.billingAddress || {};

    return {
      shopName: (shop.name || "").trim() || null,
      primaryDomain: ((primary.host || "").trim().toLowerCase()) || null,
      primaryUrl: (primary.url || "").trim() || null,
      currencyCode: (shop.currencyCode || "").trim() || null,
      contactEmail: ((shop.contactEmail || "").trim().toLowerCase()) || null,
      shopOwnerName: (shop.shopOwnerName || "").trim() || null,
      countryCode: ((billing.countryCodeV2 || billing.country || "").trim().toUpperCase()) || null,
    };
  } catch (err) {
    console.error("[shopify-admin] fetchShopBasics threw (non-fatal):", err?.message || err);
    return null;
  }
}
