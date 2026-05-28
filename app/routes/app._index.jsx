/**
 * Agentic Readiness — the app's home (Phase v2.1.A, revised).
 *
 * This IS the /app route (no redirect, no separate child route). The previous
 * attempt at "v2.1.A take 1" replaced this loader with a bare throw redirect(),
 * which skipped Shopify's authenticate.admin() call (loadShopScan calls it
 * internally) and broke the install flow on fresh stores. Reverted in d43c155.
 *
 * Take 2 keeps the loader EXACTLY as it was (loadShopScan(request)) so the
 * auth chain is untouched. The only change vs the original is the render
 * function — we wrap the existing Home content in Polaris Tabs and add 6
 * additional tabs for All Checks, Cross-Protocol, Competitive, Catalog, Fixes,
 * and Playground. Tabs 2-7 are placeholder cards in this phase; they link to
 * the existing /app/checks etc. routes (which stay live as a safety net).
 *
 * Tab state lives in ?tab=X. Because every tab reads from this loader's
 * useLoaderData(), a single revalidate() on Rescan refreshes scan state for
 * every tab simultaneously - structurally fixing the Competitive "Run your
 * own scan first" bug Yash hit (will be visible once CompetitiveTab is fully
 * ported in v2.1.E).
 */
import { useLoaderData, useNavigation, useRevalidator, useRouteError, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { loadShopScan } from "../scan-loader.server";
import { Page, Tabs, Badge } from "@shopify/polaris";
import { useCallback, useMemo } from "react";
import { HomeTab } from "../components/readiness/HomeTab";
import { ChecksTab } from "../components/readiness/ChecksTab";
import { CrossProtocolTab } from "../components/readiness/CrossProtocolTab";
import { CompetitiveTab } from "../components/readiness/CompetitiveTab";
import { CatalogTab } from "../components/readiness/CatalogTab";
import { FixesTab } from "../components/readiness/FixesTab";
import { PlaygroundTab } from "../components/readiness/PlaygroundTab";

const TAB_DEFS = [
  { id: "home", content: "Home", panelID: "tab-home" },
  { id: "checks", content: "All Checks", panelID: "tab-checks" },
  { id: "cross-protocol", content: "Cross-Protocol", panelID: "tab-cross-protocol" },
  { id: "competitive", content: "Competitive", panelID: "tab-competitive" },
  { id: "catalog", content: "Catalog", panelID: "tab-catalog" },
  { id: "fixes", content: "Fixes", panelID: "tab-fixes" },
  { id: "playground", content: "Playground", panelID: "tab-playground" },
];

const GRADE_TONE = {
  Excellent: "success",
  "Very Good": "info",
  Good: "info",
  Poor: "attention",
  "Very Poor": "critical",
};

// IMPORTANT: loader stays UNCHANGED from the pre-v2.1 version. loadShopScan
// calls authenticate.admin(request) internally, which is critical for the
// embedded-app auth flow on first install. Do not replace this with a bare
// throw redirect(...) - it breaks fresh installs (see d43c155 revert).
export const loader = async ({ request }) => loadShopScan(request);

// Tab switching is purely a UI concern (?tab=X) — don't re-hit loadShopScan on
// every tab click. We still revalidate when ?rescan=1 is set (the Rescan flow)
// or when the pathname changes. This makes tab clicks feel instant; previously
// every tab change paid for a fresh loader + backend round-trip.
export function shouldRevalidate({ currentUrl, nextUrl, defaultShouldRevalidate }) {
  if (currentUrl.pathname !== nextUrl.pathname) return defaultShouldRevalidate;
  // Force revalidation whenever rescan=1 appears (or disappears) — the rescan
  // mechanism toggles the flag, and we want the loader to re-run for both
  // edges of that toggle so cached state reflects the freshly-completed scan.
  if (currentUrl.searchParams.get("rescan") !== nextUrl.searchParams.get("rescan")) {
    return true;
  }
  // If everything except ?tab changed, fall through to defaults.
  const curOther = new URLSearchParams([...currentUrl.searchParams].filter(([k]) => k !== "tab"));
  const nextOther = new URLSearchParams([...nextUrl.searchParams].filter(([k]) => k !== "tab"));
  if (curOther.toString() === nextOther.toString()) return false;
  return defaultShouldRevalidate;
}

export default function AgenticReadinessHome() {
  const { shop, scan } = useLoaderData();
  const navigation = useNavigation();
  const { revalidate } = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();
  const isLoading = navigation.state === "loading";

  const shopName = (shop || "").replace(/\.myshopify\.com$/, "");
  const grade = scan?.grade;
  const gradeTone = grade ? GRADE_TONE[grade] || "info" : null;

  const activeTabId = searchParams.get("tab") || "home";
  const selectedIndex = Math.max(
    0,
    TAB_DEFS.findIndex((t) => t.id === activeTabId),
  );

  const handleTabChange = useCallback(
    (idx) => {
      const next = new URLSearchParams(searchParams);
      next.set("tab", TAB_DEFS[idx].id);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  // Rescan: toggle ?rescan=1 + revalidate. ONE revalidation refreshes the
  // shared loader data for every tab simultaneously.
  const handleRescan = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.set("rescan", "1");
    setSearchParams(next, { replace: true });
    revalidate();
    setTimeout(() => {
      const cleared = new URLSearchParams(searchParams);
      cleared.delete("rescan");
      setSearchParams(cleared, { replace: true });
    }, 100);
  }, [searchParams, setSearchParams, revalidate]);

  const activeTabBody = useMemo(() => {
    switch (activeTabId) {
      case "home":
        return <HomeTab />;
      case "checks":
        return <ChecksTab />;
      case "cross-protocol":
        return <CrossProtocolTab />;
      case "competitive":
        return <CompetitiveTab />;
      case "catalog":
        return <CatalogTab />;
      case "fixes":
        return <FixesTab />;
      case "playground":
        return <PlaygroundTab />;
      default:
        return <HomeTab />;
    }
  }, [activeTabId]);

  return (
    <Page
      title="Agentic Readiness"
      titleMetadata={grade ? <Badge tone={gradeTone}>{grade}</Badge> : null}
      subtitle={shopName ? `Connected to ${shopName}` : undefined}
      primaryAction={{
        content: isLoading ? "Rescanning…" : "Rescan",
        onAction: handleRescan,
        loading: isLoading,
      }}
    >
      <Tabs
        tabs={TAB_DEFS}
        selected={selectedIndex}
        onSelect={handleTabChange}
        fitted={false}
      />
      <div style={{ paddingTop: "var(--p-space-400)" }}>{activeTabBody}</div>
    </Page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
