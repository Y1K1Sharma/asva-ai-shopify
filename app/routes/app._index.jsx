import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Banner,
} from "@shopify/polaris";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

export default function Home() {
  const { shop } = useLoaderData();
  const shopName = shop.replace(/\.myshopify\.com$/, "");

  return (
    <Page title="Asva AI">
      <BlockStack gap="500">
        <Banner title="Welcome to Asva AI" tone="info">
          <p>
            Connected to <strong>{shopName}</strong>. The full agentic
            readiness scan and one-click fix workflow will appear here as
            development phases land.
          </p>
        </Banner>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingSm">
                  Setup status
                </Text>
                <Text as="p">
                  D1 — Foundation: complete. The dashboard, all-checks view,
                  fixes, catalog scoring, competitive comparison, cross-protocol
                  analysis, and manifest playground are next in the build plan.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
