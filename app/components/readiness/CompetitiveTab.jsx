/**
 * Competitive tab placeholder (Phase v2.1.A). Full port: v2.1.E.
 *
 * When fully ported, this will read scan state from the parent loader's
 * useLoaderData() so the "Run your own scan first" bug is structurally
 * impossible (parent's revalidate() refreshes scan state for every tab).
 */
import { Card, BlockStack, Text, Button } from "@shopify/polaris";

export function CompetitiveTab() {
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">Competitive</Text>
        <Text as="p" tone="subdued">
          Compare your store against any public storefront. Full Polaris port in progress.
        </Text>
        <div>
          <Button url="/app/competitive">Open Competitive page</Button>
        </div>
      </BlockStack>
    </Card>
  );
}
