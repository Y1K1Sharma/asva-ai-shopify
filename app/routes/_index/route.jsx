import { redirect } from "react-router";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  // Phase 5.9b — Shopify Admin's embedded-app proxy sometimes drops the
  // `shop` query param but always preserves `host` and `embedded`. The old
  // check only redirected when `shop` was present, so iframe loads of
  // /apps/asva-ai-2 (root) without `shop` fell through to the public
  // marketing page until Yash hit reload. Redirect on ANY embedded signal.
  const url = new URL(request.url);
  const isEmbedded =
    url.searchParams.has("shop") ||
    url.searchParams.has("host") ||
    url.searchParams.has("embedded") ||
    url.searchParams.has("hmac") ||
    url.searchParams.has("session");
  if (isEmbedded) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return {};
};

export default function App() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.logo} aria-hidden="true">A</span>
        <span className={styles.brand}>Asva AI</span>
      </header>

      <main className={styles.main}>
        <span className={styles.eyebrow}>Shopify App · Agentic Commerce Readiness</span>
        <h1 className={styles.heading}>
          Audit your Shopify store for AI shopping readiness.
        </h1>
        <p className={styles.text}>
          Asva AI runs a deep audit across UCP, ACP, runtime, and AI-platform
          signals — then surfaces specific fixes you can apply directly from
          your Shopify admin.
        </p>

        <div className={styles.ctaCard}>
          <h2 className={styles.ctaHeading}>Install Asva AI on your Shopify store</h2>
          <p className={styles.ctaSubhead}>
            Install securely from the Shopify App Store. One click, no
            developer required.
          </p>
          <a
            className={styles.ctaButton}
            href="https://apps.shopify.com/asva-ai"
            target="_blank"
            rel="noreferrer"
          >
            View on the Shopify App Store
          </a>
          <p className={styles.ctaHint}>
            Already installed? Open the app from your Shopify admin under{" "}
            <strong>Apps → Asva AI</strong>.
          </p>
        </div>

        <ul className={styles.featureGrid}>
          <li className={styles.featureItem}>
            <span className={styles.featureNum}>01</span>
            <h3 className={styles.featureTitle}>Full readiness audit</h3>
            <p className={styles.featureBody}>
              Audits your storefront against UCP manifest, ACP capabilities,
              runtime endpoints, and AI-platform signals — ChatGPT, Perplexity,
              Claude, Gemini, Google, Apple. Pass/warn/fail report with severity
              and impact for every issue.
            </p>
          </li>
          <li className={styles.featureItem}>
            <span className={styles.featureNum}>02</span>
            <h3 className={styles.featureTitle}>Theme-embed fixes</h3>
            <p className={styles.featureBody}>
              Apply Fix opens Theme Settings → App embeds with the right
              Asva AI block highlighted. Toggle on, click Save, and your
              storefront emits Schema.org JSON-LD, manifest discovery
              hints, and an AI bot allow-list. No theme code edits.
            </p>
          </li>
          <li className={styles.featureItem}>
            <span className={styles.featureNum}>03</span>
            <h3 className={styles.featureTitle}>Catalog + competitive view</h3>
            <p className={styles.featureBody}>
              Per-product scoring for your entire catalog. Side-by-side
              comparison with any other store. Cross-protocol coherence
              analysis and live manifest playground.
            </p>
          </li>
        </ul>
      </main>

      <footer className={styles.footer}>
        Asva AI · made for Shopify merchants ·{" "}
        <a className={styles.footerLink} href="mailto:support@asvaai.com">
          support@asvaai.com
        </a>{" "}
        ·{" "}
        <a className={styles.footerLink} href="https://www.asvaai.com" target="_blank" rel="noreferrer">
          asvaai.com
        </a>
      </footer>
    </div>
  );
}
