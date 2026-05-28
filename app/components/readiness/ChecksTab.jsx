import { useState, useMemo } from "react";
import { useLoaderData } from "react-router";
import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  Banner,
  Badge,
  TextField,
  Select,
  IndexTable,
  EmptySearchResult,
  useIndexResourceState,
  Box,
  Divider,
} from "@shopify/polaris";
import {
  DIMENSIONS,
  STATUSES,
  SEVERITIES,
  STATUS_TONE,
  SEVERITY_TONE,
  STATUS_LABEL,
  classifyCheckByDim,
  filterChecks,
  sortChecksByImpact,
  scanIsUnlocked,
} from "../../scan-utils";

const SELECT_ANY = [{ label: "Any", value: "" }];

const STATUS_OPTIONS = [
  ...SELECT_ANY,
  ...STATUSES.map((s) => ({ label: STATUS_LABEL[s] || s, value: s })),
];

const DIMENSION_OPTIONS = [
  ...SELECT_ANY,
  ...DIMENSIONS.map((d) => ({ label: d, value: d })),
];

const SEVERITY_OPTIONS = [
  ...SELECT_ANY,
  ...SEVERITIES.map((s) => ({
    label: s.charAt(0).toUpperCase() + s.slice(1),
    value: s,
  })),
];

export function ChecksTab() {
  const { scan, cacheHit, loadError } = useLoaderData();

  if (loadError) {
    return (
      <Banner title="We couldn't load your checks" tone="warning">
        <p>{loadError}</p>
      </Banner>
    );
  }

  const unlocked = scanIsUnlocked(scan);
  const allChecks = Array.isArray(scan?.checks) ? scan.checks : [];

  if (!unlocked) {
    return (
      <Banner title="Full check list not available" tone="info">
        <p>
          The Asva backend isn&rsquo;t configured to return the full
          check list for this install yet. Once <code>ASVA_APP_KEY</code>{" "}
          is set on the Shopify app and the matching{" "}
          <code>ASVA_SHOPIFY_APP_KEY</code> is set on the backend, this
          page will show every check the audit ran (typically 60+
          checks across UCP / ACP / Infrastructure).
        </p>
        <p>
          Your <strong>top 5 fixes</strong> and overall score are still
          available on the Home tab in the meantime.
        </p>
      </Banner>
    );
  }

  return (
    <BlockStack gap="400">
      <Text as="p" variant="bodySm" tone="subdued">
        Every audit check that ran ({allChecks.length} total).
      </Text>
      {cacheHit && (
        <Text as="p" variant="bodySm" tone="subdued">
          Showing cached result. Click Rescan above for fresh data.
        </Text>
      )}
      <ChecksTable checks={allChecks} />
    </BlockStack>
  );
}

function ChecksTable({ checks }) {
  const [status, setStatus] = useState("");
  const [dimension, setDimension] = useState("");
  const [severity, setSeverity] = useState("");
  const [q, setQ] = useState("");

  const filtered = useMemo(
    () => sortChecksByImpact(filterChecks(checks, { status, dimension, severity, q })),
    [checks, status, dimension, severity, q],
  );

  const resourceName = { singular: "check", plural: "checks" };
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(filtered, {
      resourceIDResolver: (c) => c.id,
    });

  const emptyMarkup = (
    <EmptySearchResult
      title="No checks match these filters"
      description="Loosen a filter or clear the search box."
      withIllustration
    />
  );

  const rowMarkup = filtered.map((c, index) => {
    const dim = classifyCheckByDim(c);
    const statusTone = STATUS_TONE[c.status];
    const sevTone = SEVERITY_TONE[c.severity];
    return (
      <IndexTable.Row
        id={c.id}
        key={c.id + index}
        selected={selectedResources.includes(c.id)}
        position={index}
      >
        <IndexTable.Cell>
          <Text as="span" variant="bodyMd" fontWeight="medium">
            {c.title || c.id}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={statusTone}>{STATUS_LABEL[c.status] || c.status}</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={sevTone}>{c.severity || "—"}</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" variant="bodyMd">
            {dim}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" variant="bodySm" tone="subdued">
            {(c.points_earned ?? 0)} / {(c.points_max ?? 0)} pts
          </Text>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Card padding="0">
      <Box paddingInline="400" paddingBlockStart="400" paddingBlockEnd="300">
        <BlockStack gap="300">
          <InlineStack gap="300" wrap>
            <Box minWidth="240px">
              <TextField
                label="Search"
                labelHidden
                placeholder="Search checks…"
                value={q}
                onChange={setQ}
                autoComplete="off"
                clearButton
                onClearButtonClick={() => setQ("")}
              />
            </Box>
            <Select
              label="Status"
              labelInline
              options={STATUS_OPTIONS}
              value={status}
              onChange={setStatus}
            />
            <Select
              label="Dimension"
              labelInline
              options={DIMENSION_OPTIONS}
              value={dimension}
              onChange={setDimension}
            />
            <Select
              label="Severity"
              labelInline
              options={SEVERITY_OPTIONS}
              value={severity}
              onChange={setSeverity}
            />
          </InlineStack>
          <Text as="p" variant="bodySm" tone="subdued">
            Showing {filtered.length} of {checks.length} checks
          </Text>
        </BlockStack>
      </Box>
      <Divider />
      <IndexTable
        resourceName={resourceName}
        itemCount={filtered.length}
        selectedItemsCount={
          allResourcesSelected ? "All" : selectedResources.length
        }
        onSelectionChange={handleSelectionChange}
        selectable={false}
        emptyState={emptyMarkup}
        headings={[
          { title: "Check" },
          { title: "Status" },
          { title: "Severity" },
          { title: "Dimension" },
          { title: "Points" },
        ]}
      >
        {rowMarkup}
      </IndexTable>
    </Card>
  );
}

