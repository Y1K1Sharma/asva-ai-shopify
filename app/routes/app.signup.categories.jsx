/**
 * SHOP-CONVERGE Phase 4 — Step 2 (Categories) iframe wrapper.
 *
 * Same shape as app.signup.brand.jsx (see that file for the rationale).
 * Different only in the iframe `src` so the SPA boots into the categories
 * screen instead of brand.
 */
import { useEffect, useRef } from "react";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { ASVA_API_BASE, provisionShop } from "../asva-api.server";
import { fetchShopBasics } from "../lib/shopify-admin.server";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);

  let shopBasics = null;
  if (session?.shop) {
    shopBasics = await fetchShopBasics(admin);
  }

  let asvaBrand = null;
  try {
    if (session?.shop) {
      const p = await provisionShop(session.shop, {
        shopName: shopBasics?.cleanBrandName || shopBasics?.shopName || session.shop.split(".")[0],
        storefrontDomain: shopBasics?.primaryDomain || undefined,
        shopOwnerEmail: shopBasics?.contactEmail || undefined,
        shopOwnerName: shopBasics?.shopOwnerName || undefined,
        currencyCode: shopBasics?.currencyCode || undefined,
        countryCode: shopBasics?.countryCode || undefined,
      });
      asvaBrand = {
        brandId: p.brand_id,
        token: p.token,
        brandDomain: p.domain,
        brandName: p.brand_name,
        shopOwnerEmail: (shopBasics?.contactEmail || "").trim().toLowerCase() || "",
        shopOwnerName: (shopBasics?.shopOwnerName || "").trim() || "",
      };
    }
  } catch (err) {
    console.error("[app.signup.categories] provision failed:", err?.message || err);
  }

  return { asvaBrand, apiBase: ASVA_API_BASE };
};

export default function SignupCategories() {
  const { asvaBrand } = useLoaderData();
  const iframeRef = useRef(null);

  useEffect(() => {
    if (!asvaBrand) return;
    function postAuth(token) {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      win.postMessage(
        {
          type: "asva-embedded-auth",
          token,
          brandId: asvaBrand.brandId,
          brandName: asvaBrand.brandName,
          brandDomain: asvaBrand.brandDomain,
          shopOwnerEmail: asvaBrand.shopOwnerEmail,
          shopOwnerName: asvaBrand.shopOwnerName,
        },
        window.location.origin,
      );
    }
    function onMessage(ev) {
      if (ev.origin !== window.location.origin) return;
      const type = ev.data?.type;
      if (type === "asva-embedded-ready") postAuth(asvaBrand.token);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [asvaBrand]);

  if (!asvaBrand) {
    return (
      <div style={{ padding: 24 }}>
        <p>
          We couldn&apos;t reach the analytics backend. Reopen the app from
          your Shopify admin in a moment.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <iframe
        ref={iframeRef}
        src="/embed/signup/categories?embedded=shopify&theme=light"
        title="Catalogue — Asva AI"
        onLoad={() => {
          const win = iframeRef.current?.contentWindow;
          if (win && asvaBrand) {
            win.postMessage(
              {
                type: "asva-embedded-auth",
                token: asvaBrand.token,
                brandId: asvaBrand.brandId,
                brandName: asvaBrand.brandName,
                brandDomain: asvaBrand.brandDomain,
                shopOwnerEmail: asvaBrand.shopOwnerEmail || "",
                shopOwnerName: asvaBrand.shopOwnerName || "",
              },
              window.location.origin,
            );
          }
        }}
        style={{ width: "100%", flex: 1, border: "none", display: "block" }}
      />
    </div>
  );
}
