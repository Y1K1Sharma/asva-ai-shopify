/**
 * Legacy /app/checks route - redirect stub (Phase v2.1.F).
 *
 * The All Checks UI now lives as a tab on the consolidated Agentic Readiness
 * page (app._index.jsx). Anything that still links to /app/checks (old App
 * Store nav, bookmarks, external docs) lands on the right tab.
 *
 * authenticate.admin runs first so fresh installs that hit this URL during
 * the OAuth handshake don't race the parent's auth (see d43c155 revert).
 */
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  throw redirect("/app?tab=checks");
};
