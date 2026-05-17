import { useLoaderData, useNavigation, useRevalidator, useRouteError, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { loadShopScan } from "../scan-loader.server";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Banner,
  InlineStack,
  Box,
  Badge,
  Button,
  ProgressBar,
  Divider,
  Spinner,
} from "@shopify/polaris";

const GRADE_TONE = {
  Excellent: "success",
  "Very Good": "info",
  Good: "info",
  Poor: "attention",
  "Very Poor": "critical",
};

export const loader = async ({ request }) => loadShopScan(request);

export default function Home() {
  const { shop, scan, cacheHit, loadError } = useLoaderData();
  const navigation = useNavigation();
  const { revalidate } = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();
  const isLoading = navigation.state === "loading";
  const shopName = shop.replace(/\.myshopify\.com$/, "");

  const handleRescan = () => {
    // Toggle the rescan flag to invalidate cache, then revalidate the route.
    const next = new URLSearchParams(searchParams);
    next.set("rescan", "1");
    setSearchParams(next, { replace: true });
    revalidate();
    // Strip the flag after revalidation completes so subsequent navigation
    // doesn't keep forcing rescans.
    setTimeout(() => {
      const cleared = new URLSearchParams(searchParams);
      cleared.delete("rescan");
      setSearchParams(cleared, { replace: true });
    }, 100);
  };

  if (loadError) {
    return (
      <Page title="Asva AI">
        <BlockStack gap="500">
          <Banner title="We couldn't scan your store" tone="warning">
            <p>
              {loadError} — please click Rescan in a moment, or contact{" "}
              <a href="mailto:support@asvaai.com">support@asvaai.com</a> if the
              issue persists.
            </p>
          </Banner>
          <Button onClick={handleRescan} loading={isLoading} variant="primary">
            Try again
          </Button>
        </BlockStack>
      </Page>
    );
  }

  if (!scan) {
    return (
      <Page title="Asva AI">
        <BlockStack gap="500" inlineAlign="center">
          <Spinner accessibilityLabel="Scanning your store" />
          <Text as="p">Scanning your store for AI readiness…</Text>
        </BlockStack>
      </Page>
    );
  }

  const score =
    typeof scan.score === "number" ? Math.round(scan.score) : null;
  const grade = scan.grade ?? "—";
  const gradeTone = GRADE_TONE[grade] || "info";
  const counters = scan.counters ?? {
    passed: 0,
    warn: 0,
    failed: 0,
    info: 0,
  };
  const rollups = Array.isArray(scan.rollups) ? scan.rollups : [];
  const issues = scan.issue_summary ?? {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    total: 0,
  };
  const topFixes = Array.isArray(scan.top_5_fixes) ? scan.top_5_fixes : [];

  return (
    <Page
      title="Asva AI"
      titleMetadata={<Badge tone={gradeTone}>{grade}</Badge>}
      subtitle={`Connected to ${shopName}`}
      primaryAction={{
        content: isLoading ? "Rescanning…" : "Rescan",
        onAction: handleRescan,
        loading: isLoading,
      }}
    >
      <BlockStack gap="500">
        {cacheHit && (
          <Text as="p" variant="bodySm" tone="subdued">
            Showing cached result. Click Rescan for fresh data.
          </Text>
        )}

        {/* Score / counters / manifest row */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingSm" tone="subdued">
                  Overall score
                </Text>
                <InlineStack gap="200" blockAlign="baseline">
                  <Text as="p" variant="heading2xl">
                    {score ?? "—"}
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    / 100
                  </Text>
                </InlineStack>
                <Text as="p" variant="bodyMd">
                  {grade}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingSm" tone="subdued">
                  Check results
                </Text>
                <InlineStack gap="400" wrap>
                  <Counter label="Passed" value={counters.passed} tone="success" />
                  <Counter label="Warn" value={counters.warn} tone="attention" />
                  <Counter label="Failed" value={counters.failed} tone="critical" />
                  <Counter label="Info" value={counters.info} tone="info" />
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingSm" tone="subdued">
                  Manifest
                </Text>
                <Text as="p" variant="bodyMd">
                  {scan.manifest_verified ? "✓ Verified" : "✗ Not detected"}
                </Text>
                {scan.ucp_version && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    UCP {scan.ucp_version}
                  </Text>
                )}
                <Text as="p" variant="bodySm" tone="subdued">
                  Platform: {scan.platform_detected || "—"}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Rollups */}
        {rollups.length > 0 && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm" tone="subdued">
                Readiness by area
              </Text>
              {rollups.map((r) => (
                <RollupBar key={r.id} label={r.label} pct={r.pct} />
              ))}
            </BlockStack>
          </Card>
        )}

        {/* Issues summary */}
        <Card>
          <InlineStack gap="400" wrap>
            <Text as="span" variant="bodyMd" tone="subdued">
              Issues found:
            </Text>
            <Text as="span" variant="bodyMd">
              <strong style={{ color: "#bf0711" }}>{issues.critical}</strong> critical
            </Text>
            <Text as="span" variant="bodyMd">
              <strong style={{ color: "#b98900" }}>{issues.high}</strong> high
            </Text>
            <Text as="span" variant="bodyMd">
              <strong style={{ color: "#0066cc" }}>{issues.medium}</strong> medium
            </Text>
            <Text as="span" variant="bodyMd" tone="subdued">
              <strong>{issues.low}</strong> low
            </Text>
            <Text as="span" variant="bodyMd" tone="subdued">
              {issues.total} total
            </Text>
          </InlineStack>
        </Card>

        {/* Top fixes preview */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingSm">
                Top fixes
              </Text>
              <Text as="span" variant="bodySm" tone="subdued">
                {topFixes.length} {topFixes.length === 1 ? "fix" : "fixes"}
              </Text>
            </InlineStack>
            <Divider />
            <BlockStack gap="200">
              {topFixes.length === 0 && (
                <Text as="p" variant="bodyMd" tone="subdued">
                  No fixes returned. Your store may be in great shape.
                </Text>
              )}
              {topFixes.map((fix, i) => (
                <FixRow key={fix.check_id + i} fix={fix} index={i + 1} />
              ))}
            </BlockStack>
          </BlockStack>
        </Card>

        <Box paddingBlockStart="200">
          <Text as="p" variant="bodySm" tone="subdued">
            Full audit views (all checks, fixes detail, catalog, competitive,
            cross-protocol, manifest playground) ship in the next development
            phase. Scoring data and rescan flow are live now.
          </Text>
        </Box>
      </BlockStack>
    </Page>
  );
}

function Counter({ label, value, tone }) {
  return (
    <BlockStack gap="100">
      <Text as="p" variant="headingMd" tone={tone === "info" ? undefined : tone}>
        {value}
      </Text>
      <Text as="p" variant="bodySm" tone="subdued">
        {label}
      </Text>
    </BlockStack>
  );
}

function RollupBar({ label, pct }) {
  const safePct = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <BlockStack gap="100">
      <InlineStack align="space-between">
        <Text as="span" variant="bodySm">
          {label}
        </Text>
        <Text as="span" variant="bodySm" tone="subdued">
          {safePct}%
        </Text>
      </InlineStack>
      <ProgressBar progress={safePct} size="small" />
    </BlockStack>
  );
}

function FixRow({ fix, index }) {
  const severityTone =
    fix.severity === "critical"
      ? "critical"
      : fix.severity === "important"
        ? "attention"
        : "info";
  return (
    <InlineStack gap="300" blockAlign="start" wrap={false}>
      <Box minWidth="24px">
        <Text as="span" variant="bodyMd" tone="subdued">
          {index}.
        </Text>
      </Box>
      <BlockStack gap="100">
        <InlineStack gap="200" wrap>
          <Text as="span" variant="bodyMd" fontWeight="semibold">
            {fix.title}
          </Text>
          {fix.severity && <Badge tone={severityTone}>{fix.severity}</Badge>}
          {typeof fix.impact_pts === "number" && (
            <Badge>{`+${fix.impact_pts} pts`}</Badge>
          )}
          {fix.effort && <Badge tone="info">{fix.effort}</Badge>}
        </InlineStack>
        {fix.description && (
          <Text as="p" variant="bodySm" tone="subdued">
            {fix.description}
          </Text>
        )}
      </BlockStack>
    </InlineStack>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

// Route-level guard so any uncaught throw in the loader or component
// renders Shopify's friendly error card via boundary.error rather than
// the generic "Application Error" page (which Shopify reviewers auto-fail).
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
