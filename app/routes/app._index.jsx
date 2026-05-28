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
import { authenticate } from "../shopify.server";
import { Page, Tabs, Badge } from "@shopify/polaris";
import { useCallback, useMemo } from "react";
import { HomeTab } from "../components/readiness/HomeTab";
import { ChecksTab } from "../components/readiness/ChecksTab";
import { CrossProtocolTab } from "../components/readiness/CrossProtocolTab";
import { CompetitiveTab } from "../components/readiness/CompetitiveTab";
import { CatalogTab } from "../components/readiness/CatalogTab";
import { FixesTab } from "../components/readiness/FixesTab";
import { PlaygroundTab } from "../components/readiness/PlaygroundTab";

// Catalog data is fetched lazily inside the parent loader when ?tab=catalog
// is set. We don't pay the GraphQL cost on Home / Checks / etc.
const CATALOG_PAGE_SIZE = 25;
const CATALOG_PRODUCTS_QUERY = `#graphql
  query CatalogProducts($first: Int!, $after: String, $before: String, $last: Int) {
    products(first: $first, after: $after, before: $before, last: $last, sortKey: TITLE) {
      edges {
        cursor
        node {
          id
          title
          handle
          status
          description
          descriptionHtml
          tags
          vendor
          productType
          options { id name }
          variantsCount { count }
          media(first: 3) {
            edges {
              node {
                ... on MediaImage { id alt image { url width height } }
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
    productsCount { count precision }
  }
`;

async function fetchCatalog(request) {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const after = url.searchParams.get("after");
  const before = url.searchParams.get("before");
  const variables = before
    ? { first: null, last: CATALOG_PAGE_SIZE, before, after: null }
    : { first: CATALOG_PAGE_SIZE, last: null, after, before: null };
  try {
    const response = await admin.graphql(CATALOG_PRODUCTS_QUERY, { variables });
    const json = await response.json();
    if (json.errors) {
      console.error("[app._index] catalog GraphQL errors:", JSON.stringify(json.errors));
      return {
        products: [],
        pageInfo: null,
        totalCount: 0,
        loadError: json.errors.map((e) => e.message).join("; "),
      };
    }
    const data = json.data;
    return {
      products: (data.products.edges || []).map((e) => e.node),
      pageInfo: data.products.pageInfo,
      totalCount: data.productsCount?.count ?? null,
      precision: data.productsCount?.precision ?? null,
      loadError: null,
    };
  } catch (err) {
    console.error("[app._index] catalog fetch failed:", err);
    return {
      products: [],
      pageInfo: null,
      totalCount: 0,
      loadError: err instanceof Error ? err.message : "Failed to load products.",
    };
  }
}

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

// loadShopScan calls authenticate.admin(request) internally, critical for the
// embedded-app auth flow on first install (see d43c155). The conditional
// Catalog fetch piggybacks on that authenticated request when ?tab=catalog
// is set, so other tabs don't pay the Admin GraphQL cost.
export const loader = async ({ request }) => {
  const scanData = await loadShopScan(request);
  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") || "home";
  let catalog = null;
  if (tab === "catalog") {
    catalog = await fetchCatalog(request);
  }
  return { ...scanData, catalog };
};

// Tab switching is purely a UI concern (?tab=X) — don't re-hit the loader on
// every tab click. We still revalidate on rescan transitions, pathname changes,
// and Catalog tab transitions (which need a fresh GraphQL fetch).
export function shouldRevalidate({ currentUrl, nextUrl, defaultShouldRevalidate }) {
  if (currentUrl.pathname !== nextUrl.pathname) return defaultShouldRevalidate;
  if (currentUrl.searchParams.get("rescan") !== nextUrl.searchParams.get("rescan")) {
    return true;
  }
  const curTab = currentUrl.searchParams.get("tab") || "home";
  const nextTab = nextUrl.searchParams.get("tab") || "home";
  // Catalog tab needs Admin GraphQL data. Revalidate whenever entering or
  // leaving Catalog, or when pagination params (after / before) change.
  if (nextTab === "catalog" || curTab === "catalog") {
    if (curTab !== nextTab) return true;
    if (
      currentUrl.searchParams.get("after") !== nextUrl.searchParams.get("after") ||
      currentUrl.searchParams.get("before") !== nextUrl.searchParams.get("before")
    ) {
      return true;
    }
  }
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
