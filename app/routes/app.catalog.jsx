/**
 * Legacy /app/catalog route - redirect stub (Phase v2.1.F).
 * Now a tab on the consolidated Agentic Readiness page. Preserves ?after=
 * and ?before= so cursor-pagination bookmarks still work.
 *
 * Phase 5.9f — target /app/agentic-readiness?tab=catalog (NOT /app?tab=catalog).
 * /app is the Dashboard which ignores ?tab=; only the consolidated readiness
 * page reads it. The wrong target made the Catalog button land on the
 * Dashboard's readiness-handoff card instead of the Catalog tab.
 */
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const target = new URLSearchParams({ tab: "catalog" });
  const after = url.searchParams.get("after");
  const before = url.searchParams.get("before");
  if (after) target.set("after", after);
  if (before) target.set("before", before);
  throw redirect(`/app/agentic-readiness?${target.toString()}`);
};
