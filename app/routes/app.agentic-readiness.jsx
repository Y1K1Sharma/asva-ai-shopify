/**
 * Agentic Readiness — consolidated Polaris page (Phase v2.1).
 *
 * Replaces 7 separate native pages (Home, All Checks, Cross-Protocol,
 * Competitive, Catalog, Fixes, Playground) with a single Polaris page that
 * has 7 tabs. The cofounder flagged that today's iframe-SPA Dashboard creates
 * a "two navigation bars" gap inside Shopify admin; consolidating into a
 * native Polaris page with internal tabs removes that gap.
 *
 * Architectural choices (locked in plans/Shopify-Polaris-Rebuild-Plan-v2.1.md):
 *   1. Shared loader. ONE loadShopScan(request) call. Every tab reads the
 *      same {scan, cacheHit, loadError} via useLoaderData(). This auto-fixes
 *      the Competitive scan-state bug: revalidate() now refreshes every tab
 *      simultaneously instead of just the active route.
 *   2. Tab state in URL (?tab=X). React Router 7 loader re-runs on tab change
 *      so the URL is shareable / deep-linkable.
 *   3. Rescan button lives in the page header (Polaris primaryAction) — always
 *      visible regardless of active tab.
 *   4. v2.1.A ships HomeTab fully ported; the other 6 tabs render as
 *      placeholder cards that link to the existing route. v2.1.B–E port each
 *      remaining tab one by one.
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

export const loader = async ({ request }) => loadShopScan(request);

export default function AgenticReadinessPage() {
  const { shop, scan } = useLoaderData();
  const navigation = useNavigation();
  const { revalidate } = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();
  const isLoading = navigation.state === "loading";

  const shopName = (shop || "").replace(/\.myshopify\.com$/, "");
  const grade = scan?.grade;
  const gradeTone = grade ? GRADE_TONE[grade] || "info" : null;

  // Active tab from URL ?tab=X; default to Home.
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

  // Rescan: toggle ?rescan=1 + revalidate parent loader. Because every tab
  // reads from this loader, a single revalidation refreshes ALL of them at
  // once (the Competitive "Run your own scan first" bug is structurally gone).
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
