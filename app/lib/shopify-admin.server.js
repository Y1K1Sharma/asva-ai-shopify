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
 * Derive a CLEAN brand name from the shop's primary custom domain when one
 * is available. "stylera.co" -> "Stylera", "house-of-zelena.com" -> "House Of
 * Zelena". This is what the Asva dashboard / visibility metrics display, so
 * we deliberately strip Shopify's shop.name suffixes like " (Dev Test)" /
 * " - Development" / " Store" that Shopify auto-appends on dev stores.
 *
 * Falls back to the raw shopName when primaryDomain looks like a *.myshopify
 * fallback (no real custom domain configured).
 */
export function deriveBrandName(primaryDomain, shopName) {
  const raw = (shopName || "").trim();
  const domain = (primaryDomain || "").trim().toLowerCase();

  // PRIMARY: Shopify's shop.name with dev-store noise stripped. This preserves
  // the brand's chosen casing (e.g. "House of Zelena" keeps lowercase "of").
  const stripped = stripShopNameNoise(raw);
  if (stripped && stripped.length >= 2) return stripped;

  // FALLBACK: derive from primary domain when shop.name is empty or pure noise.
  if (!domain || domain.endsWith(".myshopify.com") || domain.endsWith(".shopifypreview.com")) {
    return stripped || raw || null;
  }
  const host = domain.replace(/^www\./, "");
  const label = host.split(".")[0] || host;
  const parts = label.split(/[-_.]/).filter(Boolean);
  if (!parts.length) return stripped || host;
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

function stripShopNameNoise(name) {
  if (!name) return name;
  return name
    // Trailing parenthesised tag: (Dev) / (Dev Test) / (Test) / (Staging) / (Demo) / (Sandbox)
    .replace(/\s*\((dev|development|test|staging|demo|sandbox)(?:[\s_-]+test)?\)\s*$/i, "")
    // Hyphen-suffixed tag: " - Dev" / " - Staging" / etc
    .replace(/\s*-\s*(dev|development|test|staging|demo|sandbox)\s*$/i, "")
    // Generic " Store" suffix
    .replace(/\s+Store\s*$/i, "")
    .trim();
}

/**
 * Resolve real shop identity via Admin GraphQL. Returns null when the
 * primary-domain feature flag is off OR the GraphQL call fails — both are
 * non-fatal: the caller renders the legacy *.myshopify.com label and we
 * still ship provision/scan with the old payload shape.
 *
 * @param {object} admin - the authenticated Admin client from `authenticate.admin(request)`
 * @returns {Promise<null | {
 *   shopName: string | null,
 *   cleanBrandName: string | null,
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

    const shopName = (shop.name || "").trim() || null;
    const primaryDomain = ((primary.host || "").trim().toLowerCase()) || null;

    return {
      shopName,
      cleanBrandName: deriveBrandName(primaryDomain, shopName),
      primaryDomain,
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

// SHOP-PERFECT Phase 4 — full snapshot query for on-install ingest.
//
// Asks for the shop + top 20 best-selling products + 10 most-recently-updated
// collections in one round trip. Themes are intentionally NOT included — they'd
// require an extra read_themes scope that we don't ship today, and the
// dashboard doesn't render theme info yet (deferred to a later phase). The
// query budget stays under ~150 Admin API points which is well within the
// 1000pt/min per-shop ceiling.
const SHOP_SNAPSHOT_QUERY = `#graphql
  query AsvaShopSnapshot {
    shop {
      name
      primaryDomain { host url }
      currencyCode
      contactEmail
      shopOwnerName
      billingAddress { country countryCodeV2 }
    }
    products(first: 20, sortKey: UPDATED_AT, reverse: true) {
      edges {
        node {
          id
          title
          handle
          productType
          vendor
          totalInventory
          featuredImage { url altText }
          priceRangeV2 { minVariantPrice { amount currencyCode } }
        }
      }
    }
    collections(first: 10, sortKey: UPDATED_AT, reverse: true) {
      edges {
        node {
          id
          title
          handle
          productsCount { count }
        }
      }
    }
  }
`;

/**
 * Fetch the full Shopify shop snapshot used by /api/v5/shopify/ingest-on-install.
 *
 * Gated by Railway env ASVA_INSTANT_INGEST (default OFF). When OFF, returns
 * null so callers skip the ingest call entirely — keeps the Cloro budget safe
 * until Phase 5's full audit pipeline ships. Resolves to null on any GraphQL
 * failure so a single bad response can't block the loader.
 *
 * @param {object} admin
 * @returns {Promise<null | object>} raw GraphQL response body (data.shop / data.products / data.collections)
 */
export async function fetchShopSnapshot(admin) {
  // eslint-disable-next-line no-undef
  const flag = (process.env.ASVA_INSTANT_INGEST ?? "false").toLowerCase();
  if (flag !== "true" && flag !== "1" && flag !== "on") return null;
  if (!admin || typeof admin.graphql !== "function") return null;

  try {
    const res = await admin.graphql(SHOP_SNAPSHOT_QUERY);
    const json = await res.json();
    if (json.errors) {
      console.error("[shopify-admin] fetchShopSnapshot graphql errors:", JSON.stringify(json.errors));
      return null;
    }
    // Hand the data block directly to the backend — the Python parser in
    // lib/shopify_ingest.parse_shop_snapshot() expects exactly this shape.
    return json?.data || null;
  } catch (err) {
    console.error("[shopify-admin] fetchShopSnapshot threw (non-fatal):", err?.message || err);
    return null;
  }
}
