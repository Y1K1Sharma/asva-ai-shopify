/**
 * Playground tab placeholder (Phase v2.1.A). Full port: v2.1.B.
 */
import { Card, BlockStack, Text, Button } from "@shopify/polaris";

export function PlaygroundTab() {
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">Manifest playground</Text>
        <Text as="p" tone="subdued">
          Inspect the parsed UCP/ACP manifest the audit fetched. Port in progress.
        </Text>
        <div>
          <Button url="/app/playground">Open Playground page</Button>
        </div>
      </BlockStack>
    </Card>
  );
}
