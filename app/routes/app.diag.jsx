/**
 * Phase 4 diagnostic route — /app/diag
 *
 * Returns JSON describing the live state of the Phase 4 ingest path so we
 * can pin down why the DB writes aren't landing. Temporary: remove once
 * Phase 4 is verified end-to-end.
 *
 *   - Which env flag values the running container actually sees
 *   - Which backend URL the app is pointing at
 *   - The raw result of fetchShopSnapshot (or the reason it returned null)
 *   - The raw result of ingestOnInstall (or the reason it failed)
 *
 * Authenticated via authenticate.admin so only the merchant can hit it.
 */
import { authenticate } from "../shopify.server";
import { ingestOnInstall } from "../asva-api.server";
import { fetchShopSnapshot } from "../lib/shopify-admin.server";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  const env = process.env;
  const flagRaw = env.ASVA_INSTANT_INGEST;
  const flag = (flagRaw ?? "false").toLowerCase();
  const flagOn = flag === "true" || flag === "1" || flag === "on";

  const diag = {
    timestamp: new Date().toISOString(),
    shop_domain: session?.shop || null,
    env_seen_by_container: {
      ASVA_INSTANT_INGEST: flagRaw ?? "(unset)",
      ASVA_INSTANT_INGEST_resolved: flagOn ? "ON" : "OFF",
      ASVA_DEFAULT_TAB_DASHBOARD: env.ASVA_DEFAULT_TAB_DASHBOARD ?? "(unset)",
      ASVA_USE_PRIMARY_DOMAIN: env.ASVA_USE_PRIMARY_DOMAIN ?? "(unset)",
      ASVA_API_URL: env.ASVA_API_URL ?? "(unset — using default)",
      ASVA_APP_KEY_is_set: Boolean(env.ASVA_APP_KEY),
      ASVA_APP_KEY_length: env.ASVA_APP_KEY ? env.ASVA_APP_KEY.length : 0,
      SHOPIFY_APP_URL: env.SHOPIFY_APP_URL ?? "(unset)",
      NODE_ENV: env.NODE_ENV ?? "(unset)",
    },
    snapshot_attempt: null,
    ingest_attempt: null,
    notes: [],
  };

  if (!flagOn) {
    diag.notes.push(
      "ASVA_INSTANT_INGEST not on — flip to 'true' on Railway and redeploy, then revisit /app/diag.",
    );
    return Response.json(diag);
  }

  // Try the snapshot directly (no gate — bypass the helper's flag check for diagnostic).
  let snapshotResult = null;
  try {
    snapshotResult = await fetchShopSnapshot(admin);
    if (!snapshotResult) {
      diag.snapshot_attempt = {
        ok: false,
        reason:
          "fetchShopSnapshot returned null — could be admin client invalid, GraphQL error, or flag turned off mid-call.",
      };
    } else {
      const shop = snapshotResult.shop || {};
      const products = (snapshotResult.products?.edges || []).length;
      const collections = (snapshotResult.collections?.edges || []).length;
      diag.snapshot_attempt = {
        ok: true,
        shop_name: shop.name || null,
        primary_domain: shop.primaryDomain?.host || null,
        products_count: products,
        collections_count: collections,
      };
    }
  } catch (err) {
    diag.snapshot_attempt = {
      ok: false,
      reason: `fetchShopSnapshot threw: ${err?.message || err}`,
    };
  }

  if (snapshotResult && session?.shop) {
    try {
      const ingestResult = await ingestOnInstall(session.shop, snapshotResult);
      if (ingestResult === null) {
        diag.ingest_attempt = {
          ok: false,
          reason:
            "ingestOnInstall returned null — backend rejected the call. Check ASVA_APP_KEY matches, and that the staging backend has Phase 1 endpoints.",
        };
      } else if (ingestResult?.ingested) {
        diag.ingest_attempt = {
          ok: true,
          brand_id: ingestResult.brand_id,
          brand_name: ingestResult.brand_name,
          primary_domain: ingestResult.primary_domain,
          products_count: ingestResult.products_count,
          catalog_rows_written: ingestResult.catalog_rows_written,
          audit_job_id: ingestResult.audit_job_id,
        };
      } else {
        diag.ingest_attempt = {
          ok: false,
          reason: "Unexpected backend shape",
          raw: ingestResult,
        };
      }
    } catch (err) {
      diag.ingest_attempt = {
        ok: false,
        reason: `ingestOnInstall threw: ${err?.message || err}`,
      };
    }
  }

  return Response.json(diag);
};
