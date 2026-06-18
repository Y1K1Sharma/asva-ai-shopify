/**
 * SHOP-CONVERGE Phase 4 — Step 1 (Brand) iframe wrapper.
 *
 * Hosts the main FE's BrandSetupScreen inside the embedded Shopify app.
 * The iframe target is the same /embed/ reverse proxy the Dashboard uses,
 * so the SPA loads same-origin and the postMessage handshake works.
 *
 * Query params:
 *   ?embedded=shopify  — flag the SPA reads via isEmbedded() to switch its
 *                        signup screens into prefill mode.
 *   &theme=light       — match Shopify Admin's light shell (the SPA's
 *                        signup pages default to dark for the web flow).
 *
 * Auth handshake: same as the Dashboard route — on receiving
 * `asva-embedded-ready` we postMessage the shop-scoped JWT into the
 * iframe so apiFetch calls authenticate properly.
 *
 * After the merchant submits the form, the SPA navigates the iframe (via
 * its internal react-router) to /signup/categories, and Phase 1 has
 * already advanced shopify_merchants.signup_step to 'competitors' on the
 * /signup/ecommerce/confirm save. The merchant's next /app load (or our
 * post-step-3 postMessage in app.signup.competitors.jsx) routes them
 * onward.
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
    console.error("[app.signup.brand] provision failed:", err?.message || err);
  }

  return { asvaBrand, apiBase: ASVA_API_BASE };
};

export default function SignupBrand() {
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
        src="/embed/signup/brand?embedded=shopify&theme=light"
        title="Brand setup — Asva AI"
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
