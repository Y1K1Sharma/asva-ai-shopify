import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import { ingestOnInstall, provisionShop } from "../asva-api.server";
import { fetchShopBasics, fetchShopSnapshot } from "../lib/shopify-admin.server";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);

  // SHOP-PERFECT Phase 2 — resolve the shop's REAL identity (primary custom
  // domain, owner email, currency, country) via Admin GraphQL. Gated by
  // ASVA_USE_PRIMARY_DOMAIN (default ON). Falls back to null on flag-off or
  // graphql failure so the legacy code path still ships.
  let shopBasics = null;
  if (session?.shop) {
    shopBasics = await fetchShopBasics(admin);
  }

  // Link this shop to its Asvaai brand + mint a shop-scoped token for the
  // embedded dashboard (Phase B consumes `asvaBrand`). NON-FATAL: provisioning
  // needs ASVA_APP_KEY + a healthy backend; if either is missing the scanner
  // pages must still render, so we swallow any error and return null.
  //
  // Phase 2 enrichment: forward the real shop-owner email + primary domain so
  // the backend stores them on shopify_merchants. Absent fields (when the
  // flag is off OR Admin GraphQL failed) preserve the pre-Phase-2 payload.
  let asvaBrand = null;
  try {
    if (session?.shop) {
      const p = await provisionShop(session.shop, {
        // Prefer the CLEAN brand name derived from the primary domain
        // (e.g. "stylera.co" -> "Stylera") over Shopify's shop.name field
        // which often includes " (Dev Test)" / " Store" noise on dev stores.
        shopName: shopBasics?.cleanBrandName || shopBasics?.shopName || session.shop.split(".")[0],
        storefrontDomain: shopBasics?.primaryDomain || undefined,
        shopOwnerEmail: shopBasics?.contactEmail || undefined,
        shopOwnerName: shopBasics?.shopOwnerName || undefined,
        currencyCode: shopBasics?.currencyCode || undefined,
        countryCode: shopBasics?.countryCode || undefined,
      });
      asvaBrand = {
        brandId: p.brand_id,
        brandName: p.brand_name,
        token: p.token,
        expiresIn: p.expires_in,
        domain: p.domain,
      };
    }
  } catch (err) {
    console.error(
      "[app loader] shopify provision failed (non-fatal):",
      err?.message || err,
    );
  }

  // SHOP-PERFECT Phase 4 — instant ingest.
  //
  // When ASVA_INSTANT_INGEST=true the backend gets a fresh Admin snapshot
  // (~150 API points) and seeds parent_brand.industry/keywords/top_pages +
  // merchant_catalog_entries + queues the first-audit job. Gating lives
  // inside fetchShopSnapshot — returns null when the flag is off so this
  // chain is a no-op cost-free no-op in the default state.
  //
  // AWAITED (not fire-and-forget) so the promise actually completes inside
  // the request lifecycle. The initial fire-and-forget pattern silently
  // dropped under React Router 7's server runtime — the loader returned, the
  // response was sent, and the dangling promise never ran. Cost is ~200-400ms
  // extra on the FIRST app load when the flag is on; subsequent loads hit
  // the backend dedup path and return fast. Errors are swallowed so a bad
  // backend response can't block dashboard render.
  if (session?.shop && asvaBrand) {
    try {
      const snapshot = await fetchShopSnapshot(admin);
      if (snapshot) {
        const result = await ingestOnInstall(session.shop, snapshot);
        if (result?.ingested) {
          console.log(
            `[app loader] instant ingest OK for ${session.shop}: ${result.products_count} products, ${result.catalog_rows_written} catalog rows, audit_job=${result.audit_job_id}`,
          );
        }
      }
    } catch (err) {
      console.error(
        "[app loader] instant ingest failed (non-fatal):",
        err?.message || err,
      );
    }
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "", asvaBrand, shopBasics };
};

import "@shopify/polaris/build/esm/styles.css";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisAppProvider i18n={enTranslations}>
        <s-app-nav>
          <s-link href="/app">Dashboard</s-link>
          <s-link href="/app/agentic-readiness">Agentic Readiness</s-link>
          <s-link href="/app/settings">Settings</s-link>
        </s-app-nav>
        <Outlet />
      </PolarisAppProvider>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
