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
import { ASVA_API_BASE } from "../asva-api.server";

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

  // Try the snapshot directly + capture the raw GraphQL response, including
  // errors. This bypasses fetchShopSnapshot's null-swallowing wrapper so we
  // can see WHY Shopify rejected the query.
  const SNAPSHOT_QUERY = `#graphql
    query AsvaShopSnapshotDiag {
      shop {
        name
        primaryDomain { host url }
        currencyCode
      }
      products(first: 20, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id title handle productType vendor totalInventory
            featuredImage { url altText }
            priceRangeV2 { minVariantPrice { amount currencyCode } }
          }
        }
      }
      collections(first: 10, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id title handle productsCount { count }
          }
        }
      }
    }
  `;

  let snapshotResult = null;
  try {
    const res = await admin.graphql(SNAPSHOT_QUERY);
    const json = await res.json();
    diag.snapshot_attempt = {
      raw_status: res.status,
      data_keys: json?.data ? Object.keys(json.data) : null,
      errors: json?.errors || null,
      products_returned: (json?.data?.products?.edges || []).length,
      collections_returned: (json?.data?.collections?.edges || []).length,
    };
    if (json?.data && !json?.errors) {
      snapshotResult = json.data;
      diag.snapshot_attempt.ok = true;
    } else {
      diag.snapshot_attempt.ok = false;
      diag.snapshot_attempt.reason = "GraphQL errors or no data";
    }
  } catch (err) {
    diag.snapshot_attempt = {
      ok: false,
      reason: `admin.graphql threw: ${err?.message || err}`,
      stack: err?.stack?.split("\n").slice(0, 5).join(" | "),
    };
  }

  // Direct backend call — bypasses asva-api.server.ingestOnInstall's
  // null-swallow so we can see the exact HTTP status + body.
  if (snapshotResult && session?.shop) {
    const url = `${ASVA_API_BASE}/api/v5/shopify/ingest-on-install`;
    diag.ingest_attempt = { target_url: url };
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Asva-App-Key": env.ASVA_APP_KEY || "",
        },
        body: JSON.stringify({
          shop_domain: session.shop,
          snapshot: snapshotResult,
        }),
      });
      diag.ingest_attempt.http_status = res.status;
      diag.ingest_attempt.http_ok = res.ok;
      let body = null;
      try {
        body = await res.json();
      } catch {
        body = await res.text().catch(() => null);
      }
      diag.ingest_attempt.body = body;
      diag.ingest_attempt.ok = res.ok && body?.ingested === true;
    } catch (err) {
      diag.ingest_attempt.ok = false;
      diag.ingest_attempt.threw = `${err?.message || err}`;
    }
  }

  return Response.json(diag);
};
