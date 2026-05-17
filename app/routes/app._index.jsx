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
  const gated = detectStorefrontGated(scan);

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

        {gated && (
          <Banner title="Your storefront is currently password-protected" tone="warning">
            <p>
              The audit can&rsquo;t reach your live storefront — it&rsquo;s being redirected
              to your password gate page. Until the store is publicly accessible, this score
              reflects what AI agents see <em>at the gate</em>, not the real readiness of
              your store.
            </p>
            <p>
              If this is a development store, password protection is enforced and can&rsquo;t
              be turned off until you upgrade to a paid plan. Test the Apply Fix flow on
              <strong> Theme Settings → App embeds</strong> (the embeds are working — only the
              audit is blocked) and your score will populate correctly once the store goes
              public.
            </p>
          </Banner>
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

// Detect "the storefront is gated" state from the scan response.
//
// Symptoms when password-protection (or a Cloudflare WAF, or a 401
// origin) blocks the audit:
//
//   - bot-live-probe-non-200 fails — bot UA got a non-200 from the
//     storefront homepage
//   - bot-robots-txt-exists either warns with detail "http_403" or
//     fails outright — robots.txt couldn't be fetched
//   - platform_detected falls back to "Custom / Headless" because
//     the audit can't find Shopify markers in the (gated) HTML
//
// Any one of these is a strong signal, but we require two for low
// false-positive risk — e.g. genuinely-headless stores legitimately
// return "Custom / Headless" without being gated.
function detectStorefrontGated(scan) {
  if (!scan) return false;
  const checks = Array.isArray(scan.checks) ? scan.checks : [];
  const findCheck = (id) => checks.find((c) => c?.id === id);
  const liveProbe = findCheck("bot-live-probe-non-200");
  const robotsCheck = findCheck("bot-robots-txt-exists");
  const probeBad = liveProbe && (liveProbe.status === "fail" || liveProbe.status === "warn");
  const robotsBad =
    robotsCheck &&
    (robotsCheck.status === "fail" ||
      (robotsCheck.status === "warn" &&
        typeof robotsCheck.detail === "string" &&
        robotsCheck.detail.includes("403")));
  const platformUnknown =
    !scan.platform_detected ||
    scan.platform_detected === "Custom / Headless" ||
    scan.platform_detected === "—";
  // Two-signal requirement: bot/robots fetch is failing AND platform
  // detection bailed out. That rules out a real headless commerce
  // store that simply lacks Shopify markers.
  return Boolean((probeBad || robotsBad) && platformUnknown);
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
