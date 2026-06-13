/**
 * SHOP-PERFECT Phase 3 — Dashboard is now the default landing tab.
 *
 * Lifts the iframe Dashboard host from app.dashboard.jsx so opening Asva AI
 * from the Shopify admin lands users on the metrics dashboard immediately,
 * not on the Agentic Readiness scanner (which is still available at
 * /app/agentic-readiness via the nav).
 *
 * Reversible by flipping Railway env ASVA_DEFAULT_TAB_DASHBOARD=false on the
 * asva-ai-shopify project — that swap turns /app into a redirect to
 * /app/agentic-readiness, restoring the pre-Phase-3 landing behaviour without
 * a redeploy.
 *
 * The legacy bookmark /app/dashboard is a 301 to /app (see app.dashboard.jsx)
 * so existing links keep working. /app/dashboard/token (resource route in
 * app.dashboard.token.jsx) is unchanged — the iframe still refreshes its
 * shop-scoped JWT from there.
 */
import { useEffect, useRef, useState } from "react";
import { redirect, useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { provisionShop } from "../asva-api.server";
import { fetchShopBasics } from "../lib/shopify-admin.server";

export const loader = async ({ request }) => {
  // Phase 3 flag: when off, /app falls back to the legacy landing tab.
  // eslint-disable-next-line no-undef
  const flag = (process.env.ASVA_DEFAULT_TAB_DASHBOARD ?? "true").toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off") {
    throw redirect("/app/agentic-readiness");
  }

  const { session, admin } = await authenticate.admin(request);
  // SHOP-PERFECT Phase 2: resolve real shop identity for provision payload.
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
      };
    }
  } catch (err) {
    console.error("[app._index] dashboard provision failed:", err?.message || err);
  }
  return { asvaBrand };
};

export default function DashboardHome() {
  const { asvaBrand } = useLoaderData();
  const navigate = useNavigate();
  const iframeRef = useRef(null);
  const [failed, setFailed] = useState(false);

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
        },
        window.location.origin,
      );
    }

    async function onMessage(ev) {
      if (ev.origin !== window.location.origin) return;
      const type = ev.data?.type;
      if (type === "asva-embedded-ready") {
        postAuth(asvaBrand.token);
      } else if (type === "asva-embedded-navigate") {
        const to = ev.data?.to;
        if (typeof to === "string" && to.startsWith("/app")) navigate(to);
      } else if (type === "asva-embedded-refresh") {
        try {
          const res = await fetch("/app/dashboard/token");
          if (res.ok) {
            const fresh = await res.json();
            if (fresh?.token) postAuth(fresh.token);
          }
        } catch (err) {
          console.error("[app._index] dashboard token refresh failed:", err);
        }
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [asvaBrand, navigate]);

  if (!asvaBrand) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <h2>Setting up your Asva AI dashboard…</h2>
        <p>
          We couldn&apos;t reach the analytics backend just now. Reopen the app
          from your Shopify admin in a moment. The Agentic Readiness scanner
          is still available from the app menu.
        </p>
      </div>
    );
  }

  const slug = (asvaBrand.brandName || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  const embedSrc = slug ? `/embed/${slug}` : "/embed/";

  return (
    <iframe
      ref={iframeRef}
      src={embedSrc}
      title="Asva AI Dashboard"
      onError={() => setFailed(true)}
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
            },
            window.location.origin,
          );
        }
      }}
      style={{
        width: "100%",
        height: "100vh",
        border: "none",
        display: "block",
      }}
    />
  );
}
