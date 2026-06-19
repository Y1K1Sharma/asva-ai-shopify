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
import { ASVA_API_BASE, ingestOnInstall, provisionShop } from "../asva-api.server";
import { fetchShopBasics, fetchShopSnapshot } from "../lib/shopify-admin.server";
import { ScanningProgress } from "../components/ScanningProgress";

export const loader = async ({ request }) => {
  // Authenticate FIRST. Throwing redirect before authenticate.admin() runs
  // bounces the request out of the embedded-session handshake — Shopify then
  // falls through to /auth/login which the public marketing _index renders.
  // Hit during Phase-3 rollback testing when ASVA_DEFAULT_TAB_DASHBOARD=false
  // bypassed auth and produced the "Install Asva AI" marketing page inside
  // admin.shopify.com instead of redirecting to /app/agentic-readiness.
  const { session, admin } = await authenticate.admin(request);

  // Phase 3 flag: when off, /app falls back to the legacy landing tab.
  // eslint-disable-next-line no-undef
  const flag = (process.env.ASVA_DEFAULT_TAB_DASHBOARD ?? "true").toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off") {
    // PRESERVE Shopify's embedded query params (?shop=, ?host=, ?embedded=)
    // on the redirect. Without them the next route loses session context and
    // authenticate.admin() bounces to /auth/login, which our public _index
    // route then renders as the "Install Asva AI" marketing page inside
    // admin.shopify.com. Hit by Yash during Phase-3 rollback verify.
    const url = new URL(request.url);
    throw redirect("/app/agentic-readiness" + url.search);
  }
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
        // Pass the real shop owner email through to the embedded SPA so the
        // sidebar shows "stylera-sub@aurumfms.com" instead of the legacy
        // hardcoded "shopify@embedded.asvaai" placeholder. Falls back to
        // empty string when Shopify Admin didn't return a contactEmail.
        shopOwnerEmail: (shopBasics?.contactEmail || "").trim().toLowerCase() || "",
        shopOwnerName: (shopBasics?.shopOwnerName || "").trim() || "",
      };
    }
  } catch (err) {
    console.error("[app._index] dashboard provision failed:", err?.message || err);
  }

  // SHOP-CONVERGE 6g — instant ingest MUST complete BEFORE the audit-status
  // fetch below, otherwise the signup-gate decision below runs against a
  // pre-ingest snapshot where shopify_merchants/shopify_audit_jobs don't
  // exist yet, audit-status returns {found:false, signup_step:null}, and
  // the gate skips → merchant lands on the legacy dashboard.
  //
  // Previously this lived in app.jsx (the parent route). Router 7 runs
  // parent + child loaders in PARALLEL, so the parent's ingest call raced
  // against this loader's audit-status fetch and lost in prod (Stylera
  // install 2026-06-18 / Jun 19 fix).
  //
  // ingestOnInstall is idempotent (reuses existing first_audit_job_id), so
  // calling it from the child loader is safe even if a future change adds
  // it back to the parent.
  if (session?.shop && asvaBrand) {
    try {
      const snapshot = await fetchShopSnapshot(admin);
      if (snapshot) {
        const result = await ingestOnInstall(session.shop, snapshot);
        if (result?.ingested) {
          console.log(
            `[app._index] instant ingest OK for ${session.shop}: ${result.products_count} products, ${result.catalog_rows_written} catalog rows, audit_job=${result.audit_job_id}`,
          );
        }
      }
    } catch (err) {
      console.error(
        "[app._index] instant ingest failed (non-fatal):",
        err?.message || err,
      );
    }
  }

  // SHOP-PERFECT Phase 5 — initial audit-status snapshot so the first paint
  // shows the right banner instead of blanking for 10s. Best-effort; the
  // client component re-polls every 10s via /app/audit-status anyway.
  let initialAuditStatus = null;
  // eslint-disable-next-line no-undef
  const appKey = process.env.ASVA_APP_KEY || "";
  if (session?.shop && appKey) {
    try {
      const r = await fetch(
        `${ASVA_API_BASE}/api/v5/shopify/audit-status?shop_domain=${encodeURIComponent(session.shop)}`,
        { headers: { "X-Asva-App-Key": appKey } },
      );
      if (r.ok) initialAuditStatus = await r.json();
    } catch (err) {
      console.error("[app._index] audit-status fetch failed:", err?.message || err);
    }
  }

  // SHOP-CONVERGE Phase 4 + 6e — when the signup gate flag is on, route
  // the merchant to /app/signup/* if they haven't completed the 3-step
  // signup yet. Flag default OFF so existing installs land on Dashboard.
  //
  // 6e UX rewrite: we no longer route to /app/signup/preparing while the
  // prefill worker is mid-flight. Step 1 (Brand) needs only data we
  // ALREADY have from Shopify Admin at provision time (brand_name,
  // primary domain, country_code) — there's nothing to wait for. So we
  // land the merchant directly on /app/signup/brand and the SPA fills
  // those fields from the embedded auth payload synchronously. The
  // classifier + competitor LLM keep running in the background; Step 2
  // and Step 3 poll the prefill endpoint and fill in when ready. Worst
  // case (LLM never returns) the merchant fills categories/competitors
  // manually — same UX as the web flow with no auto-detect.
  //
  // eslint-disable-next-line no-undef
  const rawGateFlag = process.env.ASVA_SIGNUP_GATE_ENABLED ?? "false";
  const gateFlag = String(rawGateFlag).trim().toLowerCase();
  const gateEnabled = gateFlag === "true" || gateFlag === "1" || gateFlag === "on";
  // SHOP-CONVERGE 6f — diagnostic logging while we root-cause why the gate
  // didn't fire on Stylera prod install despite ASVA_SIGNUP_GATE_ENABLED=true
  // and BE returning signup_step='brand'. Logs every loader run so we can
  // see the exact state at decision time in Railway HTTP logs.
  // eslint-disable-next-line no-console
  console.log("[shop-converge gate]", JSON.stringify({
    shop: session?.shop,
    rawGateFlag: String(rawGateFlag),
    gateFlag,
    gateEnabled,
    appKeyLen: appKey?.length || 0,
    hasAuditStatus: !!initialAuditStatus,
    auditFound: initialAuditStatus?.found,
    signup_step: initialAuditStatus?.signup_step ?? null,
    signup_prefill_ready_at: initialAuditStatus?.signup_prefill_ready_at ?? null,
  }));
  if (gateEnabled && initialAuditStatus) {
    const step = initialAuditStatus.signup_step;
    if (step && step !== "done") {
      const url = new URL(request.url);
      // eslint-disable-next-line no-console
      console.log("[shop-converge gate] REDIRECTING to /app/signup/" + step);
      if (step === "competitors") {
        throw redirect("/app/signup/competitors" + url.search);
      }
      if (step === "categories") {
        throw redirect("/app/signup/categories" + url.search);
      }
      // step === 'brand' (or unknown sane default)
      throw redirect("/app/signup/brand" + url.search);
    }
  }

  return { asvaBrand, initialAuditStatus };
};

export default function DashboardHome() {
  const { asvaBrand, initialAuditStatus } = useLoaderData();
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
          shopOwnerEmail: asvaBrand.shopOwnerEmail,
          shopOwnerName: asvaBrand.shopOwnerName,
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
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div style={{ padding: "12px 16px 0" }}>
        <ScanningProgress initialStatus={initialAuditStatus} />
      </div>
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
                shopOwnerEmail: asvaBrand.shopOwnerEmail || "",
                shopOwnerName: asvaBrand.shopOwnerName || "",
              },
              window.location.origin,
            );
          }
        }}
        style={{
          width: "100%",
          flex: 1,
          border: "none",
          display: "block",
        }}
      />
    </div>
  );
}
