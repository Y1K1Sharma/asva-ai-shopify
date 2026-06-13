/**
 * SHOP-PERFECT Phase 3 — legacy bookmark redirect.
 *
 * Phase 3 moved the embedded Dashboard host onto /app (see app._index.jsx)
 * so opening Asva AI from Shopify admin lands directly on the metrics
 * dashboard. /app/dashboard now permanently redirects to /app for any
 * bookmark, hand-off link, or embedded-SPA navigation that still targets
 * the old URL.
 *
 * The token-refresh resource route at /app/dashboard/token
 * (app.dashboard.token.jsx) is UNAFFECTED — file-based routing in React
 * Router 7 matches it directly, bypassing this loader.
 */
import { redirect } from "react-router";

export const loader = async () => {
  throw redirect("/app", 301);
};
