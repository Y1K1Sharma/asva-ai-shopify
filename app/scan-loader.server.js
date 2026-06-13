import { authenticate } from "./shopify.server";
import { scanShopifyShop } from "./asva-api.server";
import { fetchShopBasics } from "./lib/shopify-admin.server";
import db from "./db.server";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Shared scan loader used by every admin page (Home / Checks / Fixes).
 *
 * Returns `{ shop, shopBasics, scan, cacheHit, loadError }` — never throws.
 * Pages branch on `loadError` for the warning banner and `scan` for the
 * happy-path render. Forces a fresh scan when `?rescan=1` is on the
 * request URL.
 *
 * Cache: 24h TTL keyed by shop. A fresh scan upserts the row so the
 * next page navigation within the TTL is served from Prisma without
 * a backend round-trip.
 *
 * SHOP-PERFECT Phase 2 — `shopBasics` carries the shop's primary custom
 * domain + owner email. Resolved via Admin GraphQL on every call (one extra
 * ~50pt query, well under Shopify's 1000pt/min budget). Used to render
 * "Connected to <primary domain>" in tab subtitles.
 */
export async function loadShopScan(request) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const forceRescan = url.searchParams.get("rescan") === "1";

  // Fetch in parallel with the scan path below — no extra wall-clock if
  // the cache hits, and only a single Admin GraphQL hop on cache miss.
  const shopBasicsPromise = fetchShopBasics(admin);

  let scan = null;
  let cacheHit = false;
  let loadError = null;

  try {
    if (!forceRescan) {
      const cached = await db.scan.findUnique({ where: { shop } });
      if (cached && Date.now() - cached.createdAt.getTime() < CACHE_TTL_MS) {
        scan = JSON.parse(cached.scanResponseJson);
        cacheHit = true;
      }
    }

    if (!scan) {
      const fresh = await scanShopifyShop(shop);
      scan = fresh;
      const score =
        typeof fresh.score === "number" ? Math.round(fresh.score) : null;
      const grade = fresh.grade ?? null;
      await db.scan.upsert({
        where: { shop },
        update: { score, grade, scanResponseJson: JSON.stringify(fresh) },
        create: { shop, score, grade, scanResponseJson: JSON.stringify(fresh) },
      });
    }
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load scan.";
    console.error("[scan-loader] failure:", err);
  }

  const shopBasics = await shopBasicsPromise;
  return { shop, shopBasics, scan, cacheHit, loadError };
}
