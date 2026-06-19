import { useEffect } from "react";
import { Link, Outlet, useLoaderData, useLocation, useNavigate, useRevalidator, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { provisionShop, ASVA_API_BASE } from "../asva-api.server";
import { fetchShopBasics } from "../lib/shopify-admin.server";

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

  // SHOP-CONVERGE 6g — instant ingest moved to app._index.jsx loader.
  // React Router 7 runs parent (app.jsx) + child (app._index.jsx) loaders
  // in PARALLEL; running ingestOnInstall here raced against the child's
  // audit-status fetch + signup-gate decision, and the child often won
  // (audit-status returned {found:false, signup_step:null} → gate skipped
  // → merchant landed on legacy dashboard). Stylera prod install 2026-06-18
  // reproduced this. Ingest now happens BEFORE the audit-status fetch
  // inside app._index.jsx, eliminating the race. ingestOnInstall is
  // idempotent so other shell routes hitting app.jsx without going through
  // app._index.jsx (e.g. /app/agentic-readiness) will pick it up the next
  // time the merchant visits /app.

  // SHOP-CONVERGE Phase 4 — read signup_step + gate flag so the NavMenu can
  // hide non-signup tabs while the merchant is still in the 3-step flow.
  // Flag default OFF so existing installs see the full nav as today.
  //
  // eslint-disable-next-line no-undef
  const gateFlag = (process.env.ASVA_SIGNUP_GATE_ENABLED ?? "false").toLowerCase();
  const gateEnabled = gateFlag === "true" || gateFlag === "1" || gateFlag === "on";
  let signupStep = "done";
  if (gateEnabled && session?.shop) {
    // eslint-disable-next-line no-undef
    const appKey2 = process.env.ASVA_APP_KEY || "";
    if (appKey2) {
      try {
        const r = await fetch(
          `${ASVA_API_BASE}/api/v5/shopify/audit-status?shop_domain=${encodeURIComponent(session.shop)}`,
          { headers: { "X-Asva-App-Key": appKey2 } },
        );
        if (r.ok) {
          const body = await r.json();
          if (body?.signup_step) signupStep = body.signup_step;
        }
      } catch (err) {
        console.error("[app loader] signup_step fetch failed:", err?.message || err);
      }
    }
  }

  // eslint-disable-next-line no-undef
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    asvaBrand,
    shopBasics,
    signupStep,
    gateEnabled,
  };
};

import "@shopify/polaris/build/esm/styles.css";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";

export default function App() {
  const { apiKey, signupStep, gateEnabled } = useLoaderData();
  const location = useLocation();
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  // SHOP-CONVERGE 6d — global signup-complete handler.
  //
  // Each /app/signup/<step> shell route hosts an iframe of the embedded
  // SPA. The SPA's internal react-router moves through brand→categories
  // →competitors inside the SAME iframe, so the parent shell URL stays on
  // whichever step the merchant landed on FIRST (usually /app/signup/brand
  // when the gate redirected them from /app). Earlier we only listened
  // for `asva-signup-complete` inside app.signup.competitors.jsx — that
  // missed the common path "land at brand, walk all 3 steps, finish from
  // brand's iframe". Symptom: post-signup the iframe rendered the brand
  // dashboard but the shell URL stayed at /app/signup/brand and the
  // NavMenu tabs (Dashboard / Agentic Readiness / Settings) stayed hidden
  // because `inSignupFlow` keyed off the path.
  //
  // Move the listener to the App component (parent of every signup shell
  // route) so the redirect fires regardless of which shell route the
  // shell is currently sitting on. Also revalidate the loader so
  // `signupStep` reflects the new 'done' state and the NavMenu re-renders
  // with the full tab row on the same tick.
  useEffect(() => {
    function onMessage(ev) {
      if (ev.origin !== window.location.origin) return;
      if (ev.data?.type !== "asva-embedded-signup-complete" && ev.data?.type !== "asva-signup-complete") return;
      // Already at /app — nothing to do.
      if (location.pathname === "/app") {
        revalidator.revalidate();
        return;
      }
      navigate("/app", { replace: true });
      // Force a re-fetch of the loader so signupStep flips to 'done' and
      // the NavMenu tabs reappear without a manual reload.
      setTimeout(() => revalidator.revalidate(), 50);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [navigate, revalidator, location.pathname]);

  // SHOP-CONVERGE Phase 4 — during the 3-step signup we hide the analytics
  // tabs from the NavMenu so the merchant isn't tempted to click into an
  // empty Dashboard / Agentic Readiness / Settings before they've finished
  // signup. The Shopify left sidebar still shows "Asva AI" so they can
  // re-open the app, but the inner tab row collapses to just the brand
  // link until signup_step='done'.
  //
  // Flag-gated: when ASVA_SIGNUP_GATE_ENABLED is off (default), full nav
  // shows for everyone. Also fallback-safe: if signupStep wasn't fetched
  // (eg. backend unreachable) we treat the merchant as past signup and
  // show the full nav rather than locking them out.
  const inSignupFlow =
    gateEnabled &&
    signupStep &&
    signupStep !== "done" &&
    location.pathname.startsWith("/app/signup");

  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisAppProvider i18n={enTranslations}>
        {/*
         * Phase 5.9c — switched from <s-app-nav><s-link href="..."> (Polaris
         * web components) to <NavMenu> + react-router <Link>. <s-link> with
         * href= forced a full Shopify Admin iframe handshake on every click,
         * causing 10–15s tab switches. NavMenu + Link routes client-side via
         * React Router → near-instant nav.
         *
         * Layout note: NavMenu's rel="home" link is the link Shopify Admin
         * uses for "click the app name" (e.g. clicking "Asva AI" in the
         * Shopify left sidebar) — its text label is NOT shown as a visible
         * nav tab. So we set rel="home" to "Asva AI" (the brand name) and
         * add an explicit "Dashboard" tab pointing at /app so the user always
         * has a visible Dashboard entry in the nav row.
         */}
        <NavMenu>
          <Link to="/app" rel="home">Asva AI</Link>
          {inSignupFlow ? null : (
            <>
              <Link to="/app">Dashboard</Link>
              <Link to="/app/agentic-readiness">Agentic Readiness</Link>
              <Link to="/app/settings">Settings</Link>
            </>
          )}
        </NavMenu>
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
