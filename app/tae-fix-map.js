/**
 * Maps backend check IDs to Theme App Extension block handles. When a
 * fix maps to a block, the "Apply fix" button in /app/fixes deep-links
 * the merchant into the theme editor with that block pre-selected via
 * the `activateAppId=<uid>/<block>` query param.
 *
 * Per Shopify docs, `activateAppId` requires the extension's UID (not
 * its handle). UID is stable across deploys once Shopify CLI generates
 * it on first deploy — it's stored in extensions/asva-tae/shopify.extension.toml.
 *
 * If a fix is NOT in this map, the Apply button stays disabled and the
 * tooltip says "Manual fix — see description". Adding more blocks
 * is purely a TAE work item: ship the block, then add a mapping here.
 */

// UID from extensions/asva-tae/shopify.extension.toml. Updated when
// the TAE is re-created (rare). If the deep-link stops surfacing the
// block, verify this matches the live `uid` in the toml.
export const TAE_EXTENSION_UID = "481f0e81-a8fa-e1ba-936c-c5839f1dcf13881b2d0d";

// Per-block configuration: type (section vs embed) + the surface it
// targets. The URL contract Shopify expects differs by type:
//   section : ?template=<template>&activateAppId=<uid>/<handle>
//   embed   : ?context=apps&activateAppId=<uid>/<handle>
// Sending an embed link with ?template= or a section link with
// ?context=apps lands the merchant in the wrong panel.
const BLOCK_CONFIG = {
  "product-jsonld":      { type: "section", template: "product" },
  "organization-jsonld": { type: "section", template: "index" },
  "ucp-manifest-hint":   { type: "embed" },
  "bot-allowlist":       { type: "embed" },
};

export function blockTypeFor(blockHandle) {
  return BLOCK_CONFIG[blockHandle]?.type || null;
}

/**
 * Mapping from backend check IDs (the keys in scan.checks[].id) and fix
 * check_ids (the keys in scan.fixes[].check_id) to the TAE block that
 * fixes them.
 *
 * v1 coverage notes (be honest about what this can and can't do):
 *   - JSON-LD fixes  →  product-jsonld / organization-jsonld  (handled)
 *   - Bot-readiness  →  bot-allowlist                          (handled)
 *   - UCP manifest writes → require Asset API + Protected Scope
 *     Exemption (not granted to v1 Public-distribution apps).
 *     ucp-manifest-hint is a discovery anchor only; merchant still
 *     hosts the manifest themselves.
 *   - Server-config fixes (HTTPS, HSTS, sitemap.xml, CORS) are either
 *     Shopify-platform-controlled (false positives) or require server
 *     access we don't have.
 *   - Product-data fixes (descriptions, images, variants) are merchant
 *     content decisions; we link to the product editor via the Catalog
 *     page instead.
 */
const CHECK_TO_BLOCK = {
  // Product JSON-LD — every product-schema-related check
  "discovery-product-schema": "product-jsonld",
  "ai-google-merchant-product-schema": "product-jsonld",
  "product-structured-data": "product-jsonld",

  // Organization JSON-LD on homepage — both Organization-flavored and
  // generic Schema.org-on-homepage checks share the same block.
  "discovery-organization-schema": "organization-jsonld",
  "discovery-schema-org-jsonld": "organization-jsonld",
  "schema-org-json-ld": "organization-jsonld",
  "ai-organization-schema": "organization-jsonld",

  // UCP manifest discovery hint — adds <link rel="ucp-manifest">.
  // Does NOT host the manifest itself (Asset API gate).
  "discovery-ucp-manifest-link": "ucp-manifest-hint",
  "manifest-discoverable": "ucp-manifest-hint",

  // Bot allow-list — every AI-platform-readiness check + per-bot ones.
  "ai-perplexity-readiness": "bot-allowlist",
  "ai-claude-readiness": "bot-allowlist",
  "ai-gpt-readiness": "bot-allowlist",
  "ai-gemini-readiness": "bot-allowlist",
  "ai-apple-intelligence-readiness": "bot-allowlist",
  "gptbot-allowed": "bot-allowlist",
  "oai-searchbot-allowed": "bot-allowlist",
  "chatgpt-user-allowed": "bot-allowlist",
  "perplexity-allowed": "bot-allowlist",
  "claudebot-allowed": "bot-allowlist",
  "google-extended-allowed": "bot-allowlist",
  "applebot-extended-allowed": "bot-allowlist",
};

export function blockForCheckId(checkId) {
  return CHECK_TO_BLOCK[checkId] || null;
}

/**
 * Build a Shopify theme-editor deep-link URL for a given TAE block on
 * a given shop.
 *
 * Three things matter here, learned the hard way:
 *
 *   1. Use the unified admin host (`admin.shopify.com/store/<handle>`)
 *      directly, NOT the legacy `<shop>.myshopify.com/admin/...` URL
 *      that has to redirect. The redirect path drops query params
 *      inconsistently and can land on a blank editor frame.
 *
 *   2. `context=apps` is required to open the editor with the
 *      Apps tab focused. Without it the merchant lands on the
 *      template view and has to hunt for the block.
 *
 *   3. `activateAppId=<extension-uid>/<block-handle>` is the
 *      documented deep-link param. Shopify's admin sometimes
 *      honors it (block ready to add) and sometimes doesn't (just
 *      lands on the Apps tab). Either way the merchant is one
 *      click from adding the block.
 *
 * Returns null if no shop or block handle is supplied.
 */
export function themeEditorUrlForBlock(shop, blockHandle) {
  if (!shop || !blockHandle) return null;
  const config = BLOCK_CONFIG[blockHandle];
  if (!config) return null;
  const shopHandle = shop.replace(/\.myshopify\.com$/, "");
  const activate = `${TAE_EXTENSION_UID}/${blockHandle}`;
  const params = new URLSearchParams();
  if (config.type === "embed") {
    // App embeds live in the Theme Settings → App embeds panel.
    params.set("context", "apps");
  } else {
    // Sections live inside template editing — point the editor at the
    // template the block targets so the "Add section" picker is in scope.
    params.set("template", config.template || "index");
  }
  params.set("activateAppId", activate);
  return `https://admin.shopify.com/store/${shopHandle}/themes/current/editor?${params.toString()}`;
}

/**
 * Convenience: take a fix object and return either the deep-link URL
 * or null. Caller decides whether to render the button as enabled.
 */
export function applyFixUrl(fix, shop) {
  if (!fix?.check_id) return null;
  const block = blockForCheckId(fix.check_id);
  if (!block) return null;
  return themeEditorUrlForBlock(shop, block);
}
