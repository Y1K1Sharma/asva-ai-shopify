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
// Asks for the shop + most-recently-updated products and collections in one
// or two round trips. Themes are intentionally NOT included — they'd require
// an extra read_themes scope that we don't ship today. Pagination is capped
// at PRODUCTS_MAX_PAGES * PRODUCTS_PAGE_SIZE so a 5,000-SKU catalog doesn't
// blow the 1000pt/min budget (each products(first:N) page costs ~N*2 pts).
const PRODUCTS_PAGE_SIZE = 100;
const PRODUCTS_MAX_PAGES = 5; // ceiling: 500 products / install. Stylera has ~400.

const SHOP_HEADER_FRAGMENT = `#graphql
  shop {
    name
    primaryDomain { host url }
    currencyCode
    contactEmail
    shopOwnerName
    billingAddress { country countryCodeV2 }
  }
  collections(first: 25, sortKey: UPDATED_AT, reverse: true) {
    edges {
      node {
        id
        title
        handle
        productsCount { count }
      }
    }
  }
`;

const PRODUCTS_PAGE_QUERY = `#graphql
  query AsvaProductsPage($cursor: String) {
    products(first: ${PRODUCTS_PAGE_SIZE}, after: $cursor, sortKey: UPDATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
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
  }
`;

const SHOP_HEADER_QUERY = `#graphql
  query AsvaShopHeader {
    ${SHOP_HEADER_FRAGMENT}
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
 * Returns a shape compatible with lib/shopify_ingest.parse_shop_snapshot() —
 * data.shop / data.collections / data.products (with .edges[].node entries).
 *
 * @param {object} admin
 * @returns {Promise<null | object>}
 */
export async function fetchShopSnapshot(admin) {
  // eslint-disable-next-line no-undef
  const flag = (process.env.ASVA_INSTANT_INGEST ?? "false").toLowerCase();
  if (flag !== "true" && flag !== "1" && flag !== "on") return null;
  if (!admin || typeof admin.graphql !== "function") return null;

  try {
    // 1. Shop header + collections (small, single call).
    const headerRes = await admin.graphql(SHOP_HEADER_QUERY);
    const headerJson = await headerRes.json();
    if (headerJson.errors) {
      console.error("[shopify-admin] fetchShopSnapshot header errors:", JSON.stringify(headerJson.errors));
      return null;
    }
    const headerData = headerJson?.data || {};

    // 2. Paginate products until hasNextPage=false OR we hit the page ceiling.
    const productEdges = [];
    let cursor = null;
    let pages = 0;
    while (pages < PRODUCTS_MAX_PAGES) {
      const r = await admin.graphql(PRODUCTS_PAGE_QUERY, { variables: { cursor } });
      const j = await r.json();
      if (j.errors) {
        console.error(
          "[shopify-admin] fetchShopSnapshot products page %d errors:",
          pages, JSON.stringify(j.errors),
        );
        break;
      }
      const page = j?.data?.products;
      if (!page) break;
      for (const edge of page.edges || []) productEdges.push(edge);
      pages += 1;
      if (!page.pageInfo?.hasNextPage) break;
      cursor = page.pageInfo?.endCursor || null;
      if (!cursor) break;
    }

    return {
      ...headerData,
      products: { edges: productEdges },
    };
  } catch (err) {
    console.error("[shopify-admin] fetchShopSnapshot threw (non-fatal):", err?.message || err);
    return null;
  }
}
