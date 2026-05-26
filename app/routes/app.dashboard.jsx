/**
 * Embedded full dashboard (Phase B.3).
 *
 * Renders the Asvaai dashboard SPA inside an iframe that points at THIS app's
 * own /embed/ reverse proxy (same-origin). On mount, the SPA posts
 * `asva-embedded-ready`; this host replies with `asva-embedded-auth` carrying
 * the shop-scoped JWT minted by the backend (POST /shopify/provision). The SPA
 * then reads the shop's brand data via the same backend endpoints the web app
 * uses. On `asva-embedded-refresh` (401), the host fetches a fresh token from
 * the /app/dashboard/token resource route and re-posts.
 *
 * Token is delivered ONLY via postMessage (never in the iframe URL).
 */
import { useEffect, useRef, useState } from "react";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { provisionShop } from "../asva-api.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  let asvaBrand = null;
  try {
    if (session?.shop) {
      const p = await provisionShop(session.shop, {
        shopName: session.shop.split(".")[0],
      });
      asvaBrand = {
        brandId: p.brand_id,
        token: p.token,
        brandDomain: p.domain,
        brandName: p.brand_name,
      };
    }
  } catch (err) {
    console.error("[app.dashboard] provision failed:", err?.message || err);
  }
  return { asvaBrand };
};

export default function Dashboard() {
  const { asvaBrand } = useLoaderData();
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
      // The proxied SPA is same-origin, so only trust same-origin messages.
      if (ev.origin !== window.location.origin) return;
      const type = ev.data?.type;
      if (type === "asva-embedded-ready") {
        postAuth(asvaBrand.token);
      } else if (type === "asva-embedded-refresh") {
        try {
          const res = await fetch("/app/dashboard/token");
          if (res.ok) {
            const fresh = await res.json();
            if (fresh?.token) postAuth(fresh.token);
          }
        } catch (err) {
          console.error("[app.dashboard] token refresh failed:", err);
        }
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [asvaBrand]);

  if (!asvaBrand) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <h2>Setting up your Asva AI dashboard…</h2>
        <p>
          We couldn&apos;t reach the analytics backend just now. Reopen the app
          from your Shopify admin in a moment. Your AI Readiness scanner is
          still available from the app menu.
        </p>
      </div>
    );
  }

  // Load the iframe straight at the shop's brand dashboard (/embed/<slug>) so
  // it skips the company-picker. Slug matches the SPA's toCompanySlug().
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
      style={{
        width: "100%",
        height: "100vh",
        border: "none",
        display: "block",
      }}
    />
  );
}
