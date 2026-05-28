import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import { provisionShop } from "../asva-api.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  // Link this shop to its Asvaai brand + mint a shop-scoped token for the
  // embedded dashboard (Phase B consumes `asvaBrand`). NON-FATAL: provisioning
  // needs ASVA_APP_KEY + a healthy backend; if either is missing the scanner
  // pages must still render, so we swallow any error and return null.
  let asvaBrand = null;
  try {
    if (session?.shop) {
      const p = await provisionShop(session.shop, {
        shopName: session.shop.split(".")[0],
      });
      asvaBrand = {
        brandId: p.brand_id,
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

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "", asvaBrand };
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
          <s-link href="/app/agentic-readiness">Agentic Readiness</s-link>
          <s-link href="/app/dashboard">Dashboard</s-link>
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
