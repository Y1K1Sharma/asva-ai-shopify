import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

// Loader still calls login(request) so that any Shopify-initiated visit
// (with a valid `shop` param) is auto-redirected to the OAuth grant URL.
// Only when no shop param is present do we fall through to the rendered UI.
export const loader = async ({ request }) => {
  const errors = loginErrorMessage(await login(request));
  return { errors };
};

export default function Auth() {
  // We deliberately do NOT render a shop-domain input here.
  // Shopify App Store §2.3.1 says the app must not request the manual
  // entry of a myshopify.com URL during the installation or
  // configuration flow. Installs must originate from a Shopify-owned
  // surface (App Store or Partner Dashboard). Direct visits to
  // /auth/login without a `shop` param land here — we show an App Store
  // CTA instead of the legacy template form.
  useLoaderData();

  return (
    <AppProvider embedded={false}>
      <s-page>
        <s-section heading="Install Asva AI">
          <s-paragraph>
            Asva can only be installed from a Shopify-owned surface — the
            Shopify App Store or your Partner Dashboard test-install flow.
          </s-paragraph>
          <s-paragraph>
            If you&apos;re a merchant looking to install the app, visit the
            Shopify App Store listing below.
          </s-paragraph>
          <s-paragraph>
            If you&apos;ve already installed Asva, open it from your Shopify
            admin under <strong>Apps → Asva AI</strong>.
          </s-paragraph>
          <s-button
            href="https://apps.shopify.com/asva-ai"
            target="_blank"
            variant="primary"
          >
            View on the Shopify App Store
          </s-button>
        </s-section>
      </s-page>
    </AppProvider>
  );
}
