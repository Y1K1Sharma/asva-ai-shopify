/**
 * All Checks tab placeholder (Phase v2.1.A). Full Polaris port: v2.1.B.
 */
import { Card, BlockStack, Text, Button } from "@shopify/polaris";

export function ChecksTab() {
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">All Checks</Text>
        <Text as="p" tone="subdued">
          The full filterable check table (100 checks across UCP / ACP / Infrastructure)
          is being ported into this tab. Open the existing page for now.
        </Text>
        <div>
          <Button url="/app/checks">Open All Checks page</Button>
        </div>
      </BlockStack>
    </Card>
  );
}
