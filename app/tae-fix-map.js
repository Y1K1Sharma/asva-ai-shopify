/**
 * Maps backend check IDs to Theme App Extension block handles. When a
 * fix maps to a block, the "Apply fix" button in /app/fixes deep-links
 * the merchant into the theme editor with that block pre-selected.
 *
 * Backed by the TAE handle declared in extensions/asva-tae/shopify.extension.toml
 * (handle = "asva-ai-tae"). Block handles match the filenames under
 * extensions/asva-tae/blocks/* without the .liquid extension.
 *
 * If a fix is NOT in this map, the Apply button stays disabled and the
 * tooltip says "Manual fix — see description". Adding more blocks
 * is purely a TAE work item: ship the block, then add a mapping here.
 */

export const TAE_APP_HANDLE = "asva-ai-tae";

// Block targets (where the editor surface drops the block).
// Used to pick the right `template=` query param when deep-linking.
const TEMPLATE_BY_BLOCK = {
  "product-jsonld": "product",
  "organization-jsonld": "index",
  "ucp-manifest-hint": "index",
  "bot-allowlist": "index",
};

/**
 * Mapping from backend check IDs (the keys in scan.checks[].id) and fix
 * check_ids (the keys in scan.fixes[].check_id) to the TAE block that
 * fixes them.
 *
 * Curated from the public_scan check catalog. Add more as we ship more
 * blocks.
 */
const CHECK_TO_BLOCK = {
  // Product JSON-LD
  "discovery-product-schema": "product-jsonld",
  "ai-google-merchant-product-schema": "product-jsonld",
  "product-structured-data": "product-jsonld",

  // Organization JSON-LD on homepage
  "discovery-organization-schema": "organization-jsonld",
  "schema-org-json-ld": "organization-jsonld",
  "ai-organization-schema": "organization-jsonld",

  // UCP manifest hint (discovery anchor — does not write the manifest itself)
  "discovery-ucp-manifest-link": "ucp-manifest-hint",
  "manifest-discoverable": "ucp-manifest-hint",

  // Bot allow-list
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
 * a given shop. Opens the editor with the block's section/template
 * pre-loaded, and (when supported by the host) auto-activates the
 * "Add app block" sheet for asva-ai-tae/{block}.
 *
 * URL format follows the documented theme-editor query-string contract.
 */
export function themeEditorUrlForBlock(shop, blockHandle) {
  if (!shop || !blockHandle) return null;
  const template = TEMPLATE_BY_BLOCK[blockHandle] || "index";
  const handle = `${TAE_APP_HANDLE}/${blockHandle}`;
  const params = new URLSearchParams({
    template,
    activateAppId: handle,
  });
  return `https://${shop}/admin/themes/current/editor?${params.toString()}`;
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
