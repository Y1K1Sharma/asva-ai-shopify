/**
 * Legacy /app/competitive route - redirect stub (Phase v2.1.F).
 * Now a tab on the consolidated Agentic Readiness page. Preserves the
 * ?competitor= query so deep-links like /app/competitive?competitor=allbirds.com
 * still land on a pre-populated scan.
 */
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const target = new URLSearchParams({ tab: "competitive" });
  const competitor = url.searchParams.get("competitor");
  if (competitor) target.set("competitor", competitor);
  throw redirect(`/app?${target.toString()}`);
};
