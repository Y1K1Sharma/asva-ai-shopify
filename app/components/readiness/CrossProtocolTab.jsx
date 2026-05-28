import { useLoaderData } from "react-router";
import { scanIsUnlocked } from "../../scan-utils";
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
  IndexTable,
} from "@shopify/polaris";

const STATUS_TONE = {
  strong: "success",
  partial: "info",
  weak: "attention",
  absent: "critical",
};

const OVERLAP_STATUS_TONE = {
  ok: "success",
  warn: "attention",
  mismatch: "critical",
};

const EFFORT_TONE = {
  easy: "success",
  medium: "info",
  hard: "attention",
};

export function CrossProtocolTab() {
  const { scan, cacheHit, loadError } = useLoaderData();

  if (loadError) {
    return (
      <Banner title="We couldn't load cross-protocol data" tone="warning">
        <p>{loadError}</p>
      </Banner>
    );
  }

  const unlocked = scanIsUnlocked(scan);
  const cp = scan?.cross_protocol;

  if (!unlocked || !cp) {
    return (
      <Banner title="Cross-protocol data not available" tone="info">
        <p>
          The Asva backend needs <code>ASVA_APP_KEY</code> configured to
          return cross-protocol coherence data. Once it&rsquo;s set,
          this tab will show your interop score, gap matrix between
          UCP and ACP signals, and a migration roadmap.
        </p>
      </Banner>
    );
  }

  const score = typeof cp.interoperability_score === "number"
    ? Math.round(cp.interoperability_score)
    : null;

  return (
    <BlockStack gap="400">
      {cp.summary && (
        <Text as="p" variant="bodySm" tone="subdued">{cp.summary}</Text>
      )}
      {cacheHit && (
        <Text as="p" variant="bodySm" tone="subdued">
          Showing cached result. Click Rescan above for fresh data.
        </Text>
      )}

        <Card>
          <InlineStack gap="600" wrap blockAlign="center">
            <BlockStack gap="100">
              <Text as="h2" variant="headingSm" tone="subdued">Interoperability score</Text>
              <InlineStack gap="200" blockAlign="baseline">
                <Text as="p" variant="heading2xl">{score ?? "—"}</Text>
                <Text as="p" variant="bodyMd" tone="subdued">/ 100</Text>
              </InlineStack>
            </BlockStack>
            <Box minWidth="200px">
              <BlockStack gap="100">
                <Text as="span" variant="bodySm" tone="subdued">UCP overall</Text>
                <Badge tone={STATUS_TONE[cp.ucp_overall] || "info"}>{cp.ucp_overall || "—"}</Badge>
              </BlockStack>
            </Box>
            <Box minWidth="200px">
              <BlockStack gap="100">
                <Text as="span" variant="bodySm" tone="subdued">ACP overall</Text>
                <Badge tone={STATUS_TONE[cp.acp_overall] || "info"}>{cp.acp_overall || "—"}</Badge>
              </BlockStack>
            </Box>
          </InlineStack>
        </Card>

        {Array.isArray(cp.interop_subscores) ? null : (
          cp.interop_subscores && (
            <SubscoresCard subscores={cp.interop_subscores} />
          )
        )}

        {Array.isArray(cp.gap_matrix) && cp.gap_matrix.length > 0 && (
          <GapMatrixCard matrix={cp.gap_matrix} />
        )}

        {Array.isArray(cp.protocol_overlap) && cp.protocol_overlap.length > 0 && (
          <ProtocolOverlapCard rows={cp.protocol_overlap} />
        )}

      {Array.isArray(cp.migration_roadmap) && cp.migration_roadmap.length > 0 && (
        <RoadmapCard steps={cp.migration_roadmap} />
      )}
    </BlockStack>
  );
}

function SubscoresCard({ subscores }) {
  const rows = [
    { label: "Both protocols active", key: "both_protocols_active", max: 25 },
    { label: "Protocol balance", key: "protocol_balance", max: 25 },
    { label: "Product data consistency", key: "product_data_consistency", max: 20 },
    { label: "Checkout compatibility", key: "checkout_compatibility", max: 20 },
    { label: "Security alignment", key: "security_alignment", max: 10 },
  ];
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingSm">Interop breakdown</Text>
        <Divider />
        {rows.map((r) => {
          const value = subscores[r.key] ?? 0;
          const pct = Math.round((value / r.max) * 100);
          return (
            <BlockStack key={r.key} gap="100">
              <InlineStack align="space-between">
                <Text as="span" variant="bodySm">{r.label}</Text>
                <Text as="span" variant="bodySm" tone="subdued">{value} / {r.max} pts</Text>
              </InlineStack>
              <ProgressBar progress={pct} size="small" />
            </BlockStack>
          );
        })}
      </BlockStack>
    </Card>
  );
}

function GapMatrixCard({ matrix }) {
  const resourceName = { singular: "area", plural: "areas" };
  const rowMarkup = matrix.map((r, i) => (
    <IndexTable.Row id={r.area + i} key={r.area + i} position={i}>
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd" fontWeight="medium">{r.area}</Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={STATUS_TONE[r.ucp_status] || "info"}>{r.ucp_status}</Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={STATUS_TONE[r.acp_status] || "info"}>{r.acp_status}</Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodySm" tone="subdued">{r.note}</Text>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));
  return (
    <Card padding="0">
      <Box paddingInline="400" paddingBlockStart="400" paddingBlockEnd="200">
        <Text as="h2" variant="headingSm">Gap matrix</Text>
        <Box paddingBlockStart="100">
          <Text as="p" variant="bodySm" tone="subdued">
            How well each area is covered by UCP vs ACP signals.
          </Text>
        </Box>
      </Box>
      <IndexTable
        resourceName={resourceName}
        itemCount={matrix.length}
        selectable={false}
        headings={[
          { title: "Area" },
          { title: "UCP" },
          { title: "ACP" },
          { title: "Note" },
        ]}
      >
        {rowMarkup}
      </IndexTable>
    </Card>
  );
}

function ProtocolOverlapCard({ rows }) {
  return (
    <Card padding="0">
      <Box paddingInline="400" paddingBlockStart="400" paddingBlockEnd="200">
        <Text as="h2" variant="headingSm">Protocol overlap</Text>
        <Box paddingBlockStart="100">
          <Text as="p" variant="bodySm" tone="subdued">
            Whether UCP and ACP signals tell the same story for each area.
          </Text>
        </Box>
      </Box>
      <IndexTable
        resourceName={{ singular: "row", plural: "rows" }}
        itemCount={rows.length}
        selectable={false}
        headings={[
          { title: "Area" },
          { title: "UCP signal" },
          { title: "ACP signal" },
          { title: "Status" },
          { title: "Note" },
        ]}
      >
        {rows.map((r, i) => (
          <IndexTable.Row id={r.area + i} key={r.area + i} position={i}>
            <IndexTable.Cell>
              <Text as="span" variant="bodyMd" fontWeight="medium">{r.area}</Text>
            </IndexTable.Cell>
            <IndexTable.Cell>
              <Text as="span" variant="bodySm">{r.ucp_signal}</Text>
            </IndexTable.Cell>
            <IndexTable.Cell>
              <Text as="span" variant="bodySm">{r.acp_signal}</Text>
            </IndexTable.Cell>
            <IndexTable.Cell>
              <Badge tone={OVERLAP_STATUS_TONE[r.status] || "info"}>{r.status}</Badge>
            </IndexTable.Cell>
            <IndexTable.Cell>
              <Text as="span" variant="bodySm" tone="subdued">{r.note}</Text>
            </IndexTable.Cell>
          </IndexTable.Row>
        ))}
      </IndexTable>
    </Card>
  );
}

function RoadmapCard({ steps }) {
  const sorted = [...steps].sort((a, b) => (a.order || 0) - (b.order || 0));
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingSm">Migration roadmap</Text>
        <Text as="p" variant="bodySm" tone="subdued">
          Ordered list of fixes that close the biggest gaps first.
        </Text>
        <Divider />
        <BlockStack gap="300">
          {sorted.map((s, i) => (
            <Box key={(s.title || "") + i}>
              <BlockStack gap="100">
                <InlineStack gap="200" wrap blockAlign="center">
                  <Text as="span" variant="bodySm" tone="subdued">Step {i + 1}</Text>
                  <Text as="span" variant="bodyMd" fontWeight="semibold">{s.title}</Text>
                  {s.effort && <Badge tone={EFFORT_TONE[s.effort] || "info"}>{s.effort}</Badge>}
                  {typeof s.impact_pts === "number" && <Badge>{`+${s.impact_pts} pts`}</Badge>}
                  {s.status === "done" && <Badge tone="success">done</Badge>}
                </InlineStack>
                {s.rationale && (
                  <Text as="p" variant="bodySm" tone="subdued">{s.rationale}</Text>
                )}
              </BlockStack>
              {i < sorted.length - 1 && <Box paddingBlockStart="200"><Divider /></Box>}
            </Box>
          ))}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}

