/**
 * Cross-Protocol tab placeholder (Phase v2.1.A). Full port: v2.1.B.
 */
import { Card, BlockStack, Text, Button } from "@shopify/polaris";

export function CrossProtocolTab() {
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">Cross-Protocol</Text>
        <Text as="p" tone="subdued">
          Interoperability score + gap matrix + migration roadmap. Port in progress.
        </Text>
        <div>
          <Button url="/app/cross-protocol">Open Cross-Protocol page</Button>
        </div>
      </BlockStack>
    </Card>
  );
}
