import { useState, useMemo } from "react";
import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { loadShopScan } from "../scan-loader.server";
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Banner,
  Badge,
  Button,
  Box,
  Divider,
  Select,
  TextField,
  Collapsible,
  Tooltip,
} from "@shopify/polaris";
import { SEVERITY_TONE, SEVERITIES, scanIsUnlocked } from "../scan-utils";
import { applyFixUrl } from "../tae-fix-map";

export const loader = async ({ request }) => loadShopScan(request);

const EFFORT_TONE = {
  easy: "success",
  medium: "info",
  hard: "attention",
};

const SEVERITY_ORDER = { critical: 0, important: 1, minor: 2 };
const EFFORT_ORDER = { easy: 0, medium: 1, hard: 2 };

const SORT_OPTIONS = [
  { label: "Impact (high → low)", value: "impact_desc" },
  { label: "Severity (critical first)", value: "severity_desc" },
  { label: "Effort (easy first)", value: "effort_asc" },
];

const SEVERITY_FILTER_OPTIONS = [
  { label: "Any", value: "" },
  ...SEVERITIES.map((s) => ({
    label: s.charAt(0).toUpperCase() + s.slice(1),
    value: s,
  })),
];

export default function FixesPage() {
  const { scan, cacheHit, loadError, shop } = useLoaderData();

  if (loadError) {
    return (
      <Page title="Fixes">
        <Banner title="We couldn't load your fixes" tone="warning">
          <p>{loadError}</p>
        </Banner>
      </Page>
    );
  }

  const unlocked = scanIsUnlocked(scan);
  const fallbackFixes = Array.isArray(scan?.top_5_fixes) ? scan.top_5_fixes : [];
  const allFixes = unlocked && Array.isArray(scan?.fixes) ? scan.fixes : fallbackFixes;

  return (
    <Page
      title="Fixes"
      subtitle={
        unlocked
          ? `Every recommended fix for ${shop.replace(/\.myshopify\.com$/, "")} (${allFixes.length} total).`
          : `Top ${allFixes.length} highest-impact fixes for ${shop.replace(/\.myshopify\.com$/, "")}.`
      }
    >
      <BlockStack gap="400">
        {cacheHit && (
          <Text as="p" variant="bodySm" tone="subdued">
            Showing cached result. Click Rescan on the Home page for fresh data.
          </Text>
        )}
        {!unlocked && allFixes.length > 0 && (
          <Banner title="Showing top 5 fixes only" tone="info">
            <p>
              The Asva backend isn&rsquo;t configured to return the full
              fix catalog for this install yet. The top 5 are shown
              below; once <code>ASVA_APP_KEY</code> is configured, every
              recommended fix will appear here.
            </p>
          </Banner>
        )}
        <FixList fixes={allFixes} unlocked={unlocked} shop={shop} />
      </BlockStack>
    </Page>
  );
}

function FixList({ fixes, unlocked, shop }) {
  const [sort, setSort] = useState("impact_desc");
  const [severity, setSeverity] = useState("");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = fixes.filter((f) => {
      if (severity && f.severity !== severity) return false;
      if (needle) {
        const hay = `${f.title || ""} ${f.description || ""} ${f.check_id || ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    out = [...out].sort((a, b) => {
      if (sort === "severity_desc") {
        const va = SEVERITY_ORDER[a.severity] ?? 99;
        const vb = SEVERITY_ORDER[b.severity] ?? 99;
        if (va !== vb) return va - vb;
        return (b.impact_pts || 0) - (a.impact_pts || 0);
      }
      if (sort === "effort_asc") {
        const ea = EFFORT_ORDER[a.effort] ?? 99;
        const eb = EFFORT_ORDER[b.effort] ?? 99;
        if (ea !== eb) return ea - eb;
        return (b.impact_pts || 0) - (a.impact_pts || 0);
      }
      // impact_desc (default)
      return (b.impact_pts || 0) - (a.impact_pts || 0);
    });
    return out;
  }, [fixes, severity, q, sort]);

  if (fixes.length === 0) {
    return (
      <Card>
        <BlockStack gap="200" inlineAlign="center">
          <Text as="p" variant="bodyMd">
            No fixes returned. Your store may be in great shape — or the
            scan hasn&rsquo;t run yet.
          </Text>
        </BlockStack>
      </Card>
    );
  }

  return (
    <BlockStack gap="300">
      <Card>
        <InlineStack gap="300" wrap>
          <Box minWidth="240px">
            <TextField
              label="Search"
              labelHidden
              placeholder="Search fixes…"
              value={q}
              onChange={setQ}
              autoComplete="off"
              clearButton
              onClearButtonClick={() => setQ("")}
            />
          </Box>
          <Select
            label="Sort by"
            labelInline
            options={SORT_OPTIONS}
            value={sort}
            onChange={setSort}
          />
          <Select
            label="Severity"
            labelInline
            options={SEVERITY_FILTER_OPTIONS}
            value={severity}
            onChange={setSeverity}
          />
          <Box>
            <Text as="span" variant="bodySm" tone="subdued">
              {filtered.length} of {fixes.length}
            </Text>
          </Box>
        </InlineStack>
      </Card>

      {filtered.map((fix, i) => (
        <FixCard key={(fix.check_id || "") + i} fix={fix} unlocked={unlocked} index={i + 1} shop={shop} />
      ))}
    </BlockStack>
  );
}

function FixCard({ fix, unlocked, index, shop }) {
  const [open, setOpen] = useState(false);
  const sevTone = SEVERITY_TONE[fix.severity];
  const effortTone = EFFORT_TONE[fix.effort];
  const hasCode = Boolean(fix.code_snippet);
  const applyUrl = applyFixUrl(fix, shop);

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="start" wrap={false}>
          <BlockStack gap="100">
            <InlineStack gap="200" wrap>
              <Text as="span" variant="bodySm" tone="subdued">
                #{index}
              </Text>
              <Text as="h3" variant="headingSm">
                {fix.title || fix.check_id}
              </Text>
            </InlineStack>
            <InlineStack gap="200" wrap>
              {fix.severity && (
                <Badge tone={sevTone}>{fix.severity}</Badge>
              )}
              {typeof fix.impact_pts === "number" && (
                <Badge>{`+${fix.impact_pts} pts`}</Badge>
              )}
              {fix.effort && <Badge tone={effortTone}>{fix.effort}</Badge>}
              {fix.platform && fix.platform !== "custom" && (
                <Badge tone="info">{fix.platform}</Badge>
              )}
              {applyUrl && <Badge tone="success">1-click apply</Badge>}
            </InlineStack>
          </BlockStack>
          <Box>
            {applyUrl ? (
              <Tooltip content="Opens the theme editor with the Asva AI block ready to add. Click Save in the editor to publish.">
                <Button
                  variant="primary"
                  url={applyUrl}
                  external
                  accessibilityLabel={`Apply fix: ${fix.title}`}
                >
                  Apply fix
                </Button>
              </Tooltip>
            ) : (
              <Tooltip content="No 1-click app block for this fix yet. Follow the description / code snippet below to apply manually.">
                <Button
                  variant="primary"
                  disabled
                  accessibilityLabel="Manual fix — see description"
                >
                  Manual fix
                </Button>
              </Tooltip>
            )}
          </Box>
        </InlineStack>

        {fix.description && (
          <Text as="p" variant="bodyMd" tone="subdued">
            {fix.description}
          </Text>
        )}

        {(unlocked && (fix.code_snippet || fix.check_id)) && (
          <>
            <Divider />
            <InlineStack align="space-between">
              <Button
                variant="plain"
                onClick={() => setOpen((v) => !v)}
                ariaExpanded={open}
                ariaControls={`fix-${fix.check_id}-detail`}
              >
                {open ? "Hide details" : "Show details"}
              </Button>
              {fix.check_id && (
                <Text as="span" variant="bodySm" tone="subdued">
                  Check id: <code>{fix.check_id}</code>
                </Text>
              )}
            </InlineStack>
            <Collapsible
              open={open}
              id={`fix-${fix.check_id}-detail`}
              transition={{ duration: "150ms", timingFunction: "ease-in-out" }}
            >
              <Box paddingBlockStart="200">
                {hasCode ? (
                  <Box
                    background="bg-surface-secondary"
                    padding="300"
                    borderRadius="200"
                  >
                    <pre
                      style={{
                        margin: 0,
                        fontSize: "12px",
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {fix.code_snippet}
                    </pre>
                  </Box>
                ) : (
                  <Text as="p" variant="bodySm" tone="subdued">
                    No code snippet for this fix. Refer to the description
                    above or the Asva docs for implementation steps.
                  </Text>
                )}
              </Box>
            </Collapsible>
          </>
        )}
      </BlockStack>
    </Card>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
