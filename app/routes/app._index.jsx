/**
 * App entry — redirects to the consolidated Agentic Readiness page (Phase v2.1).
 *
 * The merchant lands on /app/agentic-readiness?tab=home by default. The 7
 * separate readiness pages have been consolidated into tabs on that page.
 * Old route files (app.checks.jsx, app.fixes.jsx, etc.) still exist as
 * working fallbacks while the per-tab Polaris ports land in v2.1.B-E; see
 * plans/Shopify-Polaris-Rebuild-Plan-v2.1.md.
 */
import { redirect } from "react-router";

export const loader = () => {
  throw redirect("/app/agentic-readiness?tab=home");
};
