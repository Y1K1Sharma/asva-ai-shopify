/**
 * Resource route — polled by the embedded Dashboard host's
 * ScanningProgress banner. Proxies the staging backend's
 * /api/v5/shopify/audit-status with the X-Asva-App-Key shared secret
 * server-side so the client never sees it.
 *
 * Returns the same JSON shape the backend returns (see
 * AuditStatusResponse in api/shopify_ingest.py). Falls back to a
 * synthetic { found: false } on any error so the FE poll degrades
 * gracefully instead of throwing.
 */
import { authenticate } from "../shopify.server";
import { ASVA_API_BASE } from "../asva-api.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session?.shop;
  if (!shop) {
    return Response.json({ found: false, shop_domain: null }, { status: 200 });
  }

  // eslint-disable-next-line no-undef
  const appKey = process.env.ASVA_APP_KEY || "";
  if (!appKey) {
    return Response.json(
      { found: false, shop_domain: shop, note: "ASVA_APP_KEY not configured" },
      { status: 200 },
    );
  }

  const target =
    `${ASVA_API_BASE}/api/v5/shopify/audit-status` +
    `?shop_domain=${encodeURIComponent(shop)}`;

  try {
    const res = await fetch(target, {
      method: "GET",
      headers: { "X-Asva-App-Key": appKey },
    });
    if (!res.ok) {
      return Response.json(
        { found: false, shop_domain: shop, upstream_status: res.status },
        { status: 200 },
      );
    }
    const body = await res.json();
    return Response.json(body, { status: 200 });
  } catch (err) {
    return Response.json(
      { found: false, shop_domain: shop, err: err?.message || String(err) },
      { status: 200 },
    );
  }
};
