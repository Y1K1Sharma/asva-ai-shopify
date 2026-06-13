/**
 * Legacy /app/cross-protocol route - redirect stub (Phase v2.1.F).
 * Now a tab on the consolidated Agentic Readiness page.
 */
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  throw redirect("/app/agentic-readiness?tab=cross-protocol");
};
