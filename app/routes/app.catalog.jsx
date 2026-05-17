import { useState, useMemo } from "react";
import { useLoaderData, useNavigation, useSearchParams, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
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
  Pagination,
  Tooltip,
  ProgressBar,
  EmptyState,
} from "@shopify/polaris";
import {
  scoreProduct,
  SCORE_TONE,
  productIdFromGid,
} from "../product-score";

const PAGE_SIZE = 25;

const PRODUCTS_QUERY = `#graphql
  query CatalogProducts($first: Int!, $after: String, $before: String, $last: Int) {
    products(first: $first, after: $after, before: $before, last: $last, sortKey: TITLE) {
      edges {
        cursor
        node {
          id
          title
          handle
          status
          description
          descriptionHtml
          tags
          vendor
          productType
          options { id name }
          variantsCount { count }
          media(first: 3) {
            edges {
              node {
                ... on MediaImage { id alt image { url width height } }
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
    productsCount { count precision }
  }
`;

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const after = url.searchParams.get("after");
  const before = url.searchParams.get("before");

  // Either after (forward) or before (backward) — never both.
  const variables = before
    ? { first: null, last: PAGE_SIZE, before, after: null }
    : { first: PAGE_SIZE, last: null, after, before: null };

  try {
    const response = await admin.graphql(PRODUCTS_QUERY, { variables });
    const json = await response.json();
    if (json.errors) {
      console.error("[catalog loader] GraphQL errors:", JSON.stringify(json.errors));
      return {
        products: [],
        pageInfo: null,
        totalCount: 0,
        loadError: json.errors.map((e) => e.message).join("; "),
      };
    }
    const data = json.data;
    const products = (data.products.edges || []).map((e) => e.node);
    return {
      products,
      pageInfo: data.products.pageInfo,
      totalCount: data.productsCount?.count ?? null,
      precision: data.productsCount?.precision ?? null,
      loadError: null,
    };
  } catch (err) {
    console.error("[catalog loader] fetch failed:", err);
    return {
      products: [],
      pageInfo: null,
      totalCount: 0,
      loadError: err instanceof Error ? err.message : "Failed to load products.",
    };
  }
};

const SORT_OPTIONS = [
  { label: "Score (low → high)", value: "score_asc" },
  { label: "Score (high → low)", value: "score_desc" },
  { label: "Title (A → Z)", value: "title_asc" },
];

const FILTER_OPTIONS = [
  { label: "All products", value: "" },
  { label: "Missing description", value: "no_description" },
  { label: "Missing images", value: "no_images" },
  { label: "Score below 60", value: "low_score" },
  { label: "Draft / archived only", value: "non_active" },
];

export default function CatalogPage() {
  const { products, pageInfo, totalCount, precision, loadError } = useLoaderData();
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isLoading = navigation.state === "loading";

  if (loadError) {
    return (
      <Page title="Catalog">
        <Banner title="We couldn't load your products" tone="warning">
          <p>{loadError}</p>
        </Banner>
      </Page>
    );
  }

  return (
    <Page
      title="Catalog"
      subtitle={
        totalCount != null
          ? `Per-product agentic-readiness scoring${precision === "EXACT" ? "" : " (approx.)"} — ${totalCount} products total.`
          : "Per-product agentic-readiness scoring."
      }
    >
      <BlockStack gap="400">
        <Banner title="How scoring works" tone="info">
          <p>
            Each product gets a 0&ndash;100 score from <strong>title clarity</strong> (40 pts),
            <strong> description completeness</strong> (25 pts),
            <strong> metadata</strong> &mdash; tags / options / variants (20 pts), and
            <strong> images</strong> &mdash; count + alt text (15 pts).
            Click <em>Edit in admin</em> to open the Shopify editor and fix issues directly.
          </p>
        </Banner>

        <CatalogTable
          products={products}
          pageInfo={pageInfo}
          searchParams={searchParams}
          setSearchParams={setSearchParams}
          isLoading={isLoading}
        />
      </BlockStack>
    </Page>
  );
}

function CatalogTable({ products, pageInfo, searchParams, setSearchParams, isLoading }) {
  const [sort, setSort] = useState("score_asc");
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");

  // Score every product once, then filter + sort on the scored list.
  const scored = useMemo(
    () => products.map((p) => ({ product: p, score: scoreProduct(p) })),
    [products],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = scored.filter(({ product, score }) => {
      if (needle) {
        const hay = `${product.title || ""} ${product.vendor || ""} ${product.productType || ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (filter === "no_description") {
        const desc = (product.description || "").trim();
        if (desc.length >= 50) return false;
      } else if (filter === "no_images") {
        const imgCount = product.media?.edges?.length ?? 0;
        if (imgCount > 0) return false;
      } else if (filter === "low_score") {
        if (score.total >= 60) return false;
      } else if (filter === "non_active") {
        if (product.status === "ACTIVE") return false;
      }
      return true;
    });

    out = [...out].sort((a, b) => {
      if (sort === "score_desc") return b.score.total - a.score.total;
      if (sort === "title_asc") return (a.product.title || "").localeCompare(b.product.title || "");
      return a.score.total - b.score.total; // score_asc default
    });

    return out;
  }, [scored, filter, q, sort]);

  if (products.length === 0) {
    return (
      <Card>
        <EmptyState
          heading="No products yet"
          image=""
        >
          <p>
            Add your first product in Shopify admin and come back here for
            a readiness scorecard.
          </p>
        </EmptyState>
      </Card>
    );
  }

  return (
    <BlockStack gap="300">
      <Card>
        <InlineStack gap="300" wrap blockAlign="end">
          <Box minWidth="240px">
            <TextField
              label="Search"
              labelHidden
              placeholder="Search products…"
              value={q}
              onChange={setQ}
              autoComplete="off"
              clearButton
              onClearButtonClick={() => setQ("")}
            />
          </Box>
          <Select label="Sort" labelInline options={SORT_OPTIONS} value={sort} onChange={setSort} />
          <Select label="Filter" labelInline options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
          <Box>
            <Text as="span" variant="bodySm" tone="subdued">
              {filtered.length} of {products.length} shown
            </Text>
          </Box>
        </InlineStack>
      </Card>

      {filtered.map(({ product, score }) => (
        <ProductCard key={product.id} product={product} score={score} />
      ))}

      <Box paddingBlockStart="200">
        <InlineStack align="center">
          <Pagination
            hasPrevious={pageInfo?.hasPreviousPage}
            hasNext={pageInfo?.hasNextPage}
            onPrevious={() => {
              const next = new URLSearchParams(searchParams);
              next.set("before", pageInfo.startCursor);
              next.delete("after");
              setSearchParams(next);
            }}
            onNext={() => {
              const next = new URLSearchParams(searchParams);
              next.set("after", pageInfo.endCursor);
              next.delete("before");
              setSearchParams(next);
            }}
          />
          {isLoading && (
            <Box paddingInlineStart="200">
              <Text as="span" tone="subdued" variant="bodySm">Loading…</Text>
            </Box>
          )}
        </InlineStack>
      </Box>
    </BlockStack>
  );
}

function ProductCard({ product, score }) {
  const productId = productIdFromGid(product.id);
  const adminUrl = `shopify:admin/products/${productId}`;
  const tone = SCORE_TONE[score.grade];
  const firstImage = product.media?.edges?.[0]?.node?.image?.url;

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack gap="400" align="space-between" blockAlign="start" wrap={false}>
          <InlineStack gap="300" blockAlign="start" wrap={false}>
            {firstImage ? (
              <Box
                background="bg-surface-secondary"
                borderRadius="200"
                minWidth="64px"
                minHeight="64px"
              >
                <img
                  src={firstImage}
                  alt={product.title}
                  style={{
                    width: 64,
                    height: 64,
                    objectFit: "cover",
                    borderRadius: 8,
                    display: "block",
                  }}
                />
              </Box>
            ) : (
              <Box
                background="bg-surface-secondary"
                borderRadius="200"
                minWidth="64px"
                minHeight="64px"
                padding="200"
              >
                <Text as="span" variant="bodySm" tone="subdued">
                  No image
                </Text>
              </Box>
            )}
            <BlockStack gap="100">
              <Text as="h3" variant="headingSm">{product.title || "Untitled product"}</Text>
              <InlineStack gap="200" wrap>
                {product.vendor && (
                  <Text as="span" variant="bodySm" tone="subdued">{product.vendor}</Text>
                )}
                {product.productType && (
                  <Text as="span" variant="bodySm" tone="subdued">·  {product.productType}</Text>
                )}
                {product.status && product.status !== "ACTIVE" && (
                  <Badge tone="attention">{product.status.toLowerCase()}</Badge>
                )}
              </InlineStack>
            </BlockStack>
          </InlineStack>

          <BlockStack gap="100" inlineAlign="end">
            <InlineStack gap="200" blockAlign="center">
              <Text as="span" variant="headingLg">{score.total}</Text>
              <Text as="span" variant="bodySm" tone="subdued">/ 100</Text>
            </InlineStack>
            <Badge tone={tone}>{score.grade}</Badge>
          </BlockStack>
        </InlineStack>

        <Divider />

        <InlineStack gap="400" wrap>
          <BreakdownBar label="Title" value={score.breakdown.title} />
          <BreakdownBar label="Description" value={score.breakdown.description} />
          <BreakdownBar label="Metadata" value={score.breakdown.metadata} />
          <BreakdownBar label="Images" value={score.breakdown.images} />
        </InlineStack>

        <InlineStack align="end">
          <Tooltip content="Open this product in the Shopify admin editor.">
            <Button url={adminUrl} variant="primary">
              Edit in admin
            </Button>
          </Tooltip>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

function BreakdownBar({ label, value }) {
  const pct = Math.round(value.pct * 100);
  return (
    <Box minWidth="150px">
      <BlockStack gap="100">
        <InlineStack align="space-between">
          <Text as="span" variant="bodySm">{label}</Text>
          <Text as="span" variant="bodySm" tone="subdued">
            {value.points} / {value.weight}
          </Text>
        </InlineStack>
        <ProgressBar progress={pct} size="small" />
        <Text as="span" variant="bodySm" tone="subdued">{value.reason}</Text>
      </BlockStack>
    </Box>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
