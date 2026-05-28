/**
 * Catalog tab placeholder (Phase v2.1.A). Full port: v2.1.D.
 */
import { Card, BlockStack, Text, Button } from "@shopify/polaris";

export function CatalogTab() {
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">Catalog</Text>
        <Text as="p" tone="subdued">
          Per-product readiness scoring (title clarity / description / metadata / images)
          with Edit-in-admin per row. Pulls live from Shopify Admin GraphQL. Port in progress.
        </Text>
        <div>
          <Button url="/app/catalog">Open Catalog page</Button>
        </div>
      </BlockStack>
    </Card>
  );
}
