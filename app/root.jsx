import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData } from "react-router";

// Document-level loader exposes SHOPIFY_API_KEY so root can render the
// App Bridge 4 script + meta tag in <head>. App Bridge must be loaded
// before any embedded admin React tree mounts — without it, calls like
// useAppBridge() silently no-op and the admin frame loses session
// context. The framework's AppProvider relies on these tags existing.
//
// SHOPIFY_API_KEY is the public client_id, not a secret — safe to
// expose to the browser.
export const loader = () => {
  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        {apiKey ? (
          <>
            <meta name="shopify-api-key" content={apiKey} />
            <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
          </>
        ) : null}
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
