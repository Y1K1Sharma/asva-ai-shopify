/**
 * Fixes tab placeholder (Phase v2.1.A). Full port: v2.1.C.
 */
import { Card, BlockStack, Text, Button } from "@shopify/polaris";

export function FixesTab() {
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">Fixes</Text>
        <Text as="p" tone="subdued">
          Every recommended fix with one-click Apply Fix (Theme App Extension)
          for schema/JSON-LD/manifest issues. Port in progress.
        </Text>
        <div>
          <Button url="/app/fixes">Open Fixes page</Button>
        </div>
      </BlockStack>
    </Card>
  );
}
