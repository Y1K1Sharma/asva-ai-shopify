import { useState } from "react";
import { useLoaderData, useSearchParams, useNavigation, useRouteError, Form } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { scanShopifyShop } from "../asva-api.server";
import db from "../db.server";
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
  ProgressBar,
  TextField,
  Button,
  Spinner,
  Layout,
} from "@shopify/polaris";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const GRADE_TONE = {
  Excellent: "success",
  "Very Good": "info",
  Good: "info",
  Poor: "attention",
  "Very Poor": "critical",
};

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const competitorRaw = (url.searchParams.get("competitor") || "").trim();

  // Always load self-scan from cache (we don't want to wait for a fresh
  // scan of the merchant's own store on this page — Home owns that).
  let selfScan = null;
  try {
    const cached = await db.scan.findUnique({ where: { shop: session.shop } });
    if (cached && Date.now() - cached.createdAt.getTime() < CACHE_TTL_MS) {
      selfScan = JSON.parse(cached.scanResponseJson);
    }
  } catch (err) {
    console.error("[competitive] self-scan cache read failed:", err);
  }

  // Normalize competitor domain — strip protocol + trailing slash.
  let competitor = competitorRaw
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");

  // Defensive validation: must look like a domain, no spaces, no path.
  if (competitor && !/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(competitor)) {
    return {
      shop: session.shop,
      selfScan,
      competitor: competitorRaw,
      competitorScan: null,
      loadError: "Please enter a valid domain (e.g. allbirds.com).",
    };
  }

  // Strip optional path component.
  competitor = competitor.split("/")[0];

  let competitorScan = null;
  let loadError = null;
  if (competitor) {
    try {
      competitorScan = await scanShopifyShop(competitor);
    } catch (err) {
      console.error("[competitive] competitor scan failed:", err);
      loadError =
        err instanceof Error
          ? `Couldn't scan ${competitor}: ${err.message}`
          : `Couldn't scan ${competitor}.`;
    }
  }

  return {
    shop: session.shop,
    selfScan,
    competitor,
    competitorScan,
    loadError,
  };
};

export default function CompetitivePage() {
  const { shop, selfScan, competitor, competitorScan, loadError } = useLoaderData();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const isLoading = navigation.state === "loading";
  const shopName = shop.replace(/\.myshopify\.com$/, "");
  const [input, setInput] = useState(competitor || "");

  return (
    <Page
      title="Competitive"
      subtitle="Compare your store against any public storefront."
    >
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="p" variant="bodyMd">
              Enter a competitor&rsquo;s public domain (no <code>https://</code>) and
              we&rsquo;ll run the same agentic-readiness audit, then surface where you
              lead or trail.
            </Text>
            <Form method="get">
              <InlineStack gap="200" wrap>
                <Box minWidth="280px">
                  <TextField
                    label="Competitor domain"
                    labelHidden
                    name="competitor"
                    placeholder="allbirds.com"
                    value={input}
                    onChange={setInput}
                    autoComplete="off"
                  />
                </Box>
                <Button submit variant="primary" loading={isLoading}>
                  Scan competitor
                </Button>
                {competitor && (
                  <Button url="/app/competitive" variant="plain">
                    Clear
                  </Button>
                )}
              </InlineStack>
            </Form>
          </BlockStack>
        </Card>

        {loadError && (
          <Banner title="Couldn't run the comparison" tone="warning">
            <p>{loadError}</p>
          </Banner>
        )}

        {!selfScan && !competitorScan && !loadError && (
          <Banner title="Run your own scan first" tone="info">
            <p>
              We need a recent scan of your store before we can compare.
              Go to <strong>Home</strong> and click Rescan, then come back
              here.
            </p>
          </Banner>
        )}

        {isLoading && competitor && (
          <Card>
            <InlineStack gap="200" align="center">
              <Spinner accessibilityLabel="Scanning competitor" />
              <Text as="p">Scanning {competitor}…</Text>
            </InlineStack>
          </Card>
        )}

        {selfScan && competitorScan && !isLoading && (
          <Comparison
            self={{ name: shopName, scan: selfScan }}
            competitor={{ name: competitor, scan: competitorScan }}
          />
        )}
      </BlockStack>
    </Page>
  );
}

function Comparison({ self, competitor }) {
  return (
    <BlockStack gap="400">
      <Layout>
        <Layout.Section variant="oneHalf">
          <ScoreCard label="You" name={self.name} scan={self.scan} />
        </Layout.Section>
        <Layout.Section variant="oneHalf">
          <ScoreCard label="Competitor" name={competitor.name} scan={competitor.scan} />
        </Layout.Section>
      </Layout>

      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingSm">Readiness by area</Text>
          <Divider />
          <RollupCompare label="UCP Compliance" id="ucp" self={self.scan} competitor={competitor.scan} />
          <RollupCompare label="ACP Readiness" id="acp" self={self.scan} competitor={competitor.scan} />
          <RollupCompare label="Infrastructure" id="infra" self={self.scan} competitor={competitor.scan} />
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingSm">Issues breakdown</Text>
          <Divider />
          <IssueRow label="Critical" selfVal={self.scan.issue_summary?.critical} competitorVal={competitor.scan.issue_summary?.critical} />
          <IssueRow label="High" selfVal={self.scan.issue_summary?.high} competitorVal={competitor.scan.issue_summary?.high} />
          <IssueRow label="Medium" selfVal={self.scan.issue_summary?.medium} competitorVal={competitor.scan.issue_summary?.medium} />
          <IssueRow label="Low" selfVal={self.scan.issue_summary?.low} competitorVal={competitor.scan.issue_summary?.low} />
          <Divider />
          <IssueRow label="Total issues" selfVal={self.scan.issue_summary?.total} competitorVal={competitor.scan.issue_summary?.total} bold />
        </BlockStack>
      </Card>
    </BlockStack>
  );
}

function ScoreCard({ label, name, scan }) {
  const score = typeof scan?.score === "number" ? Math.round(scan.score) : null;
  const grade = scan?.grade ?? "—";
  return (
    <Card>
      <BlockStack gap="200">
        <InlineStack gap="200" blockAlign="baseline">
          <Text as="h2" variant="headingSm" tone="subdued">{label}</Text>
          <Text as="p" variant="bodyMd" tone="subdued">·  {name}</Text>
        </InlineStack>
        <InlineStack gap="200" blockAlign="baseline">
          <Text as="p" variant="heading2xl">{score ?? "—"}</Text>
          <Text as="p" variant="bodyMd" tone="subdued">/ 100</Text>
          <Badge tone={GRADE_TONE[grade] || "info"}>{grade}</Badge>
        </InlineStack>
        <InlineStack gap="300" wrap>
          <Text as="span" variant="bodySm" tone="subdued">
            Manifest: {scan?.manifest_verified ? "✓ verified" : "✗ none"}
          </Text>
          <Text as="span" variant="bodySm" tone="subdued">
            Platform: {scan?.platform_detected || "—"}
          </Text>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

function findRollup(scan, id) {
  return (scan?.rollups || []).find((r) => r.id === id);
}

function RollupCompare({ label, id, self, competitor }) {
  const a = findRollup(self, id)?.pct ?? 0;
  const b = findRollup(competitor, id)?.pct ?? 0;
  const delta = a - b;
  return (
    <BlockStack gap="100">
      <InlineStack align="space-between">
        <Text as="span" variant="bodyMd" fontWeight="medium">{label}</Text>
        <DeltaBadge delta={delta} />
      </InlineStack>
      <InlineStack gap="200" blockAlign="center">
        <Box minWidth="60px">
          <Text as="span" variant="bodySm" tone="subdued">You</Text>
        </Box>
        <Box minWidth="40px">
          <Text as="span" variant="bodySm">{a}%</Text>
        </Box>
        <Box minWidth="200px">
          <ProgressBar progress={a} size="small" />
        </Box>
      </InlineStack>
      <InlineStack gap="200" blockAlign="center">
        <Box minWidth="60px">
          <Text as="span" variant="bodySm" tone="subdued">Them</Text>
        </Box>
        <Box minWidth="40px">
          <Text as="span" variant="bodySm">{b}%</Text>
        </Box>
        <Box minWidth="200px">
          <ProgressBar progress={b} size="small" />
        </Box>
      </InlineStack>
    </BlockStack>
  );
}

function IssueRow({ label, selfVal, competitorVal, bold = false }) {
  const a = selfVal ?? 0;
  const b = competitorVal ?? 0;
  const delta = b - a; // fewer issues is better, so positive delta = we lead
  return (
    <InlineStack align="space-between">
      <Text as="span" variant="bodyMd" fontWeight={bold ? "semibold" : "regular"}>{label}</Text>
      <InlineStack gap="400">
        <Text as="span" variant="bodyMd" tone="subdued">You: {a}</Text>
        <Text as="span" variant="bodyMd" tone="subdued">Them: {b}</Text>
        <DeltaBadge delta={delta} positiveLabel="lead" negativeLabel="trail" zeroLabel="tied" />
      </InlineStack>
    </InlineStack>
  );
}

function DeltaBadge({ delta, positiveLabel, negativeLabel, zeroLabel }) {
  if (delta === 0) {
    return <Badge>{zeroLabel || "Tied"}</Badge>;
  }
  if (delta > 0) {
    return <Badge tone="success">{positiveLabel ? `${positiveLabel} by ${delta}` : `+${delta}`}</Badge>;
  }
  return <Badge tone="critical">{negativeLabel ? `${negativeLabel} by ${Math.abs(delta)}` : `${delta}`}</Badge>;
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
export function ErrorBoundary() { return boundary.error(useRouteError()); }
