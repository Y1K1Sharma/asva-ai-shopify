import { useLoaderData, useNavigation, useRevalidator, useRouteError, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { loadShopScan } from "../scan-loader.server";
import { usePendingApply } from "../use-pending-apply";
import { useOnboarding } from "../use-onboarding";
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
  const { pendingApply, clear: clearPending } = usePendingApply();
  const { showOnboarding, dismiss: dismissOnboarding } = useOnboarding();
  // Deep-link to the embedded admin's Theme Settings → App embeds panel.
  // Built from the merchant's shop handle so it lands on the right store.
  const shopHandle = shop.replace(/\.myshopify\.com$/, "");
  const appEmbedsUrl = `https://admin.shopify.com/store/${shopHandle}/themes/current/editor?context=apps`;

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
        {showOnboarding && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Welcome to Asva AI — 3 steps to enable agent-readiness on your store
              </Text>
              <Text as="p" variant="bodyMd">
                Asva AI ships with Theme App Extension embeds that emit
                Schema.org structured data and AI bot signals from your
                storefront. Turn them on in your theme to start passing the
                most-impactful checks below.
              </Text>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd">
                  <strong>1.</strong> Open your theme editor → <strong>Theme Settings</strong> → <strong>App embeds</strong>.
                </Text>
                <Text as="p" variant="bodyMd">
                  <strong>2.</strong> Toggle <strong>Org JSON-LD (Asva AI)</strong> and{" "}
                  <strong>Product JSON-LD (Asva AI)</strong> ON. Click <strong>Save</strong> in the theme editor.
                </Text>
                <Text as="p" variant="bodyMd">
                  <strong>3.</strong> Return here and click <strong>Rescan</strong>. Your score updates ~30 seconds later
                  to reflect the new signals on your homepage and product pages.
                </Text>
              </BlockStack>
              <InlineStack gap="200">
                <Button
                  url={appEmbedsUrl}
                  external
                  variant="primary"
                >
                  Open App embeds in theme editor
                </Button>
                <Button onClick={dismissOnboarding} variant="plain">
                  Got it, dismiss
                </Button>
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">
                You can re-open these instructions anytime from the Settings page.
              </Text>
            </BlockStack>
          </Card>
        )}

        {pendingApply && (
          <Banner
            title="Did you save a theme change?"
            tone="success"
            action={{
              content: isLoading ? "Rescanning…" : "Rescan now",
              onAction: () => {
                clearPending();
                handleRescan();
              },
              loading: isLoading,
            }}
            secondaryAction={{ content: "Not yet", onAction: clearPending }}
          >
            <p>
              Looks like you came back from the theme editor. If you toggled an
              Asva AI embed on and clicked <strong>Save</strong>, run a fresh
              scan now to update your score.
            </p>
          </Banner>
        )}

        {cacheHit && (
          <Text as="p" variant="bodySm" tone="subdued">
            Showing cached result. Click Rescan for fresh data.
          </Text>
        )}

        {gated && (
          <Banner
            title="Audit couldn't detect your structured data"
            tone="warning"
            action={{
              content: "View your storefront source",
              url: `https://${shop}`,
              external: true,
            }}
          >
            <p>
              The audit fetched your storefront but didn&rsquo;t find the Schema.org
              JSON-LD on the homepage. Three reasons this usually happens:
            </p>
            <p>
              <strong>1. Your store is password-protected</strong> — common on Shopify
              development-plan stores where the gate is structurally enforced. Public
              visitors get redirected to <code>/password</code>.
            </p>
            <p>
              <strong>2. A WAF or bot-protection layer (Cloudflare, etc.)</strong> is
              blocking the audit&rsquo;s user-agent.
            </p>
            <p>
              <strong>3. You haven&rsquo;t enabled the Asva AI embeds yet.</strong> Open
              your theme editor → Theme Settings → App embeds → toggle on{" "}
              <strong>Org JSON-LD (Asva AI)</strong> and <strong>Product JSON-LD (Asva AI)</strong>,
              then click Save and Rescan.
            </p>
            <p>
              <strong>To verify the embeds are working:</strong> open your storefront
              homepage source (right-click → View page source → Ctrl+F → search
              &ldquo;application/ld+json&rdquo;). If the script is in the HTML, the
              embeds are working — the audit just can&rsquo;t see them due to the gate.
              Your score will populate correctly once your store is publicly accessible.
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

// Detect when the audit likely cannot read the merchant's storefront.
//
// Three distinct failure modes share a common signature: the audit's
// homepage fetch comes back without the structured-data the embeds
// emit. We surface a single banner that covers all three because the
// merchant's remediation is the same — check that the store is
// publicly reachable.
//
//   1. Dev-plan password gate — Shopify redirects public bots to
//      /password. Returns 200 OK with a Shopify-themed gate page (no
//      JSON-LD, no manifest). Platform may still detect as "Shopify"
//      because the gate page has Shopify markers.
//
//   2. Cloudflare/WAF block — Bot UA gets 403, 429, or non-200.
//      bot-live-probe-non-200 or bot-robots-txt-exists trips.
//
//   3. Genuinely empty/headless — Platform falls back to
//      "Custom / Headless" and homepage has no JSON-LD.
//
// Rather than try to distinguish these, we trigger whenever the
// JSON-LD detection fails. The banner copy then guides the merchant
// through the most likely cause and provides a self-verification link.
function detectStorefrontGated(scan) {
  if (!scan) return false;
  const checks = Array.isArray(scan.checks) ? scan.checks : [];
  const findCheck = (id) => checks.find((c) => c?.id === id);
  const schemaCheck = findCheck("discovery-schema-org-jsonld");
  const orgCheck = findCheck("discovery-organization-schema");
  // Either Schema.org JSON-LD or Organization-JSON-LD detection
  // failing is our trigger. If the merchant has enabled the Asva
  // embeds these checks should pass; when they don't, something is
  // blocking the audit from reading the storefront HTML.
  return Boolean(
    (schemaCheck && schemaCheck.status === "fail") ||
      (orgCheck && orgCheck.status === "fail"),
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
