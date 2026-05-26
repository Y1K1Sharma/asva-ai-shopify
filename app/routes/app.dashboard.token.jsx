/**
 * Fresh shop-scoped token for the embedded dashboard (Phase B.3).
 *
 * Resource route: the dashboard iframe host (app.dashboard.jsx) fetches this on
 * `asva-embedded-refresh` (i.e. when the SPA hit a 401 because its token
 * expired) to get a new token via /shopify/provision. Authenticated as the
 * Shopify admin so only the installed merchant can mint a token for its shop.
 */
import { authenticate } from "../shopify.server";
import { provisionShop } from "../asva-api.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  if (!session?.shop) {
    return Response.json({ error: "no_shop" }, { status: 401 });
  }
  try {
    const p = await provisionShop(session.shop, {
      shopName: session.shop.split(".")[0],
    });
    return Response.json({
      token: p.token,
      brandId: p.brand_id,
      brandDomain: p.domain,
    });
  } catch (err) {
    console.error("[app.dashboard.token] provision failed:", err?.message || err);
    return Response.json({ error: "provision_failed" }, { status: 502 });
  }
};
