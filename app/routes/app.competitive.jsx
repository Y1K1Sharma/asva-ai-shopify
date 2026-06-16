/**
 * Legacy /app/competitive route - redirect stub (Phase v2.1.F).
 * Now a tab on the consolidated Agentic Readiness page. Preserves the
 * ?competitor= query so deep-links like /app/competitive?competitor=allbirds.com
 * still land on a pre-populated scan.
 *
 * Phase 5.9f — target /app/agentic-readiness?tab=competitive (NOT /app?tab=competitive).
 * /app is the Dashboard and ignores ?tab=; only the consolidated readiness page
 * reads it. Wrong target made the Competitive button land on the Dashboard's
 * readiness-handoff card instead of the Competitive tab.
 */
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const target = new URLSearchParams({ tab: "competitive" });
  const competitor = url.searchParams.get("competitor");
  if (competitor) target.set("competitor", competitor);
  throw redirect(`/app/agentic-readiness?${target.toString()}`);
};
