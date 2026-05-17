import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { loadShopScan } from "../scan-loader.server";
import { scanIsUnlocked } from "../scan-utils";
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Banner,
  Badge,
  Box,
  Divider,
  Collapsible,
  Button,
} from "@shopify/polaris";
import { useState } from "react";

export const loader = async ({ request }) => loadShopScan(request);

export default function PlaygroundPage() {
  const { scan, cacheHit, loadError } = useLoaderData();

  if (loadError) {
    return (
      <Page title="Manifest playground">
        <Banner title="We couldn't load your manifest" tone="warning">
          <p>{loadError}</p>
        </Banner>
      </Page>
    );
  }

  const unlocked = scanIsUnlocked(scan);
  const manifest = scan?.parsed_manifest;

  if (!unlocked) {
    return (
      <Page
        title="Manifest playground"
        subtitle="Inspect the parsed UCP/ACP manifest the audit fetched."
      >
        <Banner title="Manifest data not available" tone="info">
          <p>
            Configure <code>ASVA_APP_KEY</code> to unlock the parsed
            manifest from the audit. This page will then show every
            section — services, capabilities, payment handlers, bot
            access — pretty-printed for inspection.
          </p>
        </Banner>
      </Page>
    );
  }

  if (!manifest || (typeof manifest === "object" && Object.keys(manifest).length === 0)) {
    return (
      <Page title="Manifest playground" subtitle="Inspect the parsed UCP/ACP manifest the audit fetched.">
        <Banner title="No manifest detected" tone="warning">
          <p>
            The audit didn&rsquo;t find a UCP manifest at
            <code> /.well-known/ucp</code> on your storefront. Once your
            store serves a manifest, this page will display every
            section the audit parsed.
          </p>
          <p>
            See the <strong>Fixes</strong> page for &ldquo;Set up
            /.well-known/ucp manifest&rdquo; — that&rsquo;s the prerequisite
            for everything here.
          </p>
        </Banner>
      </Page>
    );
  }

  const ucp = manifest.ucp || manifest;
  const sections = [
    { key: "version", label: "Version", value: ucp.version },
    { key: "services", label: "Services", value: ucp.services },
    { key: "capabilities", label: "Capabilities", value: ucp.capabilities },
    { key: "payment_handlers", label: "Payment handlers", value: ucp.payment_handlers },
    { key: "bot_access", label: "Bot access", value: ucp.bot_access },
  ];

  return (
    <Page
      title="Manifest playground"
      subtitle="Every section of your parsed UCP manifest."
    >
      <BlockStack gap="400">
        {cacheHit && (
          <Text as="p" variant="bodySm" tone="subdued">
            Showing cached result. Click Rescan on the Home page for fresh data.
          </Text>
        )}

        <Card>
          <BlockStack gap="200">
            <InlineStack gap="200" blockAlign="center">
              <Text as="h2" variant="headingSm">Top-level summary</Text>
              {ucp.version && <Badge tone="info">{ucp.version}</Badge>}
            </InlineStack>
            <Text as="p" variant="bodySm" tone="subdued">
              Services: {countOrZero(ucp.services)}.
              Capabilities declared: {countOrZero(ucp.capabilities)}.
              Payment handlers: {countOrZero(ucp.payment_handlers)}.
            </Text>
          </BlockStack>
        </Card>

        {sections.map((s) => (
          <SectionCard key={s.key} label={s.label} value={s.value} />
        ))}

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingSm">Raw manifest (all sections)</Text>
            <Box background="bg-surface-secondary" padding="300" borderRadius="200">
              <pre style={prePresetStyle}>{JSON.stringify(manifest, null, 2)}</pre>
            </Box>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

const prePresetStyle = {
  margin: 0,
  fontSize: "12px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

function countOrZero(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return 0;
}

function SectionCard({ label, value }) {
  const [open, setOpen] = useState(false);
  const isEmpty =
    value == null ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === "object" && Object.keys(value).length === 0);

  return (
    <Card>
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Text as="h3" variant="headingSm">{label}</Text>
            {isEmpty ? (
              <Badge tone="critical">Empty</Badge>
            ) : (
              <Badge tone="success">{Array.isArray(value) ? value.length : (typeof value === "object" ? Object.keys(value).length : 1)} item(s)</Badge>
            )}
          </InlineStack>
          {!isEmpty && (
            <Button variant="plain" onClick={() => setOpen((v) => !v)} ariaExpanded={open}>
              {open ? "Hide JSON" : "Show JSON"}
            </Button>
          )}
        </InlineStack>
        {!isEmpty && (
          <Collapsible
            open={open}
            id={`section-${label}`}
            transition={{ duration: "150ms", timingFunction: "ease-in-out" }}
          >
            <Box background="bg-surface-secondary" padding="300" borderRadius="200">
              <pre style={prePresetStyle}>{JSON.stringify(value, null, 2)}</pre>
            </Box>
          </Collapsible>
        )}
      </BlockStack>
    </Card>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
export function ErrorBoundary() { return boundary.error(useRouteError()); }
