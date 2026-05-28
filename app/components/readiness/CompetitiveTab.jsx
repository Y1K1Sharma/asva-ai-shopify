import { useState } from "react";
import { useLoaderData, useSearchParams, useNavigation, Form } from "react-router";
import {
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
import { STATUS_TONE, STATUS_LABEL } from "../../scan-utils";

// Side-by-side check comparison list — curated to span UCP / ACP /
// Infrastructure and to surface the checks merchants most often need
// to see their lead/trail on. Includes the JSON-LD checks our embeds
// pass so the comparison makes the value of installing Asva obvious.
const KEY_CHECKS = [
  { id: "discovery-schema-org-jsonld",        label: "Schema.org JSON-LD on homepage" },
  { id: "discovery-organization-schema",      label: "Organization / WebSite JSON-LD" },
  { id: "ai-google-merchant-product-schema",  label: "Product JSON-LD (Google Merchant)" },
  { id: "ai-perplexity-readiness",            label: "Perplexity readiness signals" },
  { id: "ai-claude-readiness",                label: "Claude readiness signals" },
  { id: "manifest-exists",                    label: "UCP manifest at /.well-known/ucp" },
  { id: "acp-checkout-cap-declared",          label: "ACP checkout capability" },
  { id: "acp-https-enforced",                 label: "HTTPS enforced on storefront" },
  { id: "security-hsts",                      label: "HSTS header (max-age ≥ 1 year)" },
  { id: "bot-robots-txt-exists",              label: "robots.txt accessible to bots" },
  { id: "discovery-sitemap-exists",           label: "sitemap.xml present" },
  { id: "manifest-cors",                      label: "Manifest CORS headers" },
];

const GRADE_TONE = {
  Excellent: "success",
  "Very Good": "info",
  Good: "info",
  Poor: "attention",
  "Very Poor": "critical",
};

export function CompetitiveTab() {
  // selfScan now comes from the parent loader's loadShopScan (NOT from a
  // separate Prisma read like the legacy /app/competitive route). This is
  // the scan-state bug fix: when Rescan runs from any tab, parent's
  // revalidation refreshes scan for ALL tabs simultaneously, so the
  // "Run your own scan first" condition can't get stuck.
  const { shop, scan: selfScan, competitor: competitorData } =
    useLoaderData();
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();
  // Only show competitor-scan spinner when there's a competitor and the
  // navigation is heading to a URL that includes one — avoids flashing the
  // spinner during unrelated tab/loader refreshes.
  const isScanningCompetitor =
    navigation.state === "loading" &&
    (navigation.location?.search?.includes("competitor=") ?? false);
  const shopName = shop.replace(/\.myshopify\.com$/, "");
  const competitorDomain = competitorData?.domain || "";
  const competitorScan = competitorData?.scan || null;
  const loadError = competitorData?.error || null;
  const [input, setInput] = useState(competitorDomain);

  const handleClear = () => {
    setInput("");
    // Keep us on the Competitive tab; just drop the competitor param.
    const next = new URLSearchParams();
    next.set("tab", "competitive");
    setSearchParams(next);
  };

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="300">
          <Text as="p" variant="bodyMd">
            Enter a competitor&rsquo;s public domain (no <code>https://</code>) and
            we&rsquo;ll run the same agentic-readiness audit, then surface where you
            lead or trail.
          </Text>
          <Form method="get">
            {/*
              Form submits as GET, replacing ALL search params. The hidden
              tab input ensures we stay on Competitive after submit (without
              it, the URL becomes ?competitor=X and we'd bounce to Home).
            */}
            <input type="hidden" name="tab" value="competitive" />
            <InlineStack gap="200" wrap>
              <Box minWidth="280px">
                <TextField
                  label="Competitor domain"
                  labelHidden
                  name="competitor"
                  placeholder="brand.com"
                  value={input}
                  onChange={setInput}
                  autoComplete="off"
                />
              </Box>
              <Button submit variant="primary" loading={isScanningCompetitor}>
                Scan competitor
              </Button>
              {competitorDomain && (
                <Button variant="plain" onClick={handleClear}>
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

      {/*
        The "Run your own scan first" prompt is no longer needed in the
        consolidated page - parent's loadShopScan ALWAYS provides scan, so
        the merchant never lands on Competitive without selfScan available.
        Keep a defensive fallback for the edge case where the backend
        scan failed at the parent loader level.
      */}
      {!selfScan && !competitorScan && !loadError && (
        <Banner title="No store scan available" tone="warning">
          <p>
            We couldn&rsquo;t load a scan for your store. Click <strong>Rescan</strong> above and try again.
          </p>
        </Banner>
      )}

      {isScanningCompetitor && competitorDomain && (
        <Card>
          <InlineStack gap="200" align="center">
            <Spinner accessibilityLabel="Scanning competitor" />
            <Text as="p">Scanning {competitorDomain}…</Text>
          </InlineStack>
        </Card>
      )}

      {selfScan && competitorScan && !isScanningCompetitor && (
        <Comparison
          self={{ name: shopName, scan: selfScan }}
          competitor={{ name: competitorDomain, scan: competitorScan }}
        />
      )}
    </BlockStack>
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

      <KeyChecksCompare self={self.scan} competitor={competitor.scan} />
    </BlockStack>
  );
}

function KeyChecksCompare({ self, competitor }) {
  const selfChecks = Array.isArray(self?.checks) ? self.checks : [];
  const compChecks = Array.isArray(competitor?.checks) ? competitor.checks : [];

  // Skip the whole card if neither scan returned individual checks (free
  // tier sanitized response). For unlocked Shopify-app callers both will
  // be present.
  if (selfChecks.length === 0 && compChecks.length === 0) return null;

  const findStatus = (checks, id) => checks.find((c) => c?.id === id)?.status ?? null;

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingSm">Key checks — side-by-side</Text>
        <Text as="p" variant="bodySm" tone="subdued">
          The most-impactful agentic-readiness signals. Green = pass, red = fail, yellow = warn, blue = info.
        </Text>
        <Divider />
        {KEY_CHECKS.map((item) => {
          const selfStatus = findStatus(selfChecks, item.id);
          const compStatus = findStatus(compChecks, item.id);
          return (
            <InlineStack key={item.id} align="space-between" blockAlign="center" wrap={false}>
              <Box>
                <Text as="span" variant="bodyMd">
                  {item.label}
                </Text>
              </Box>
              <InlineStack gap="200" blockAlign="center">
                <Box minWidth="80px">
                  <InlineStack gap="100" blockAlign="center">
                    <Text as="span" variant="bodySm" tone="subdued">You</Text>
                    <StatusBadge status={selfStatus} />
                  </InlineStack>
                </Box>
                <Box minWidth="80px">
                  <InlineStack gap="100" blockAlign="center">
                    <Text as="span" variant="bodySm" tone="subdued">Them</Text>
                    <StatusBadge status={compStatus} />
                  </InlineStack>
                </Box>
              </InlineStack>
            </InlineStack>
          );
        })}
      </BlockStack>
    </Card>
  );
}

function StatusBadge({ status }) {
  if (!status) return <Badge>—</Badge>;
  const tone = STATUS_TONE[status];
  const label = STATUS_LABEL[status] || status;
  return <Badge tone={tone}>{label}</Badge>;
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

