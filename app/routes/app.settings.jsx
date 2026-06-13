import { useLoaderData, useNavigate, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { scanIsUnlocked } from "../scan-utils";
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
  Button,
  List,
} from "@shopify/polaris";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Look up cache freshness without forcing a scan.
  let cacheMeta = null;
  try {
    const cached = await db.scan.findUnique({ where: { shop } });
    if (cached) {
      cacheMeta = {
        score: cached.score,
        grade: cached.grade,
        createdAt: cached.createdAt.toISOString(),
        updatedAt: cached.updatedAt.toISOString(),
      };
    }
  } catch (err) {
    console.error("[settings] cache read failed:", err);
  }

  // Surface whether the shared-secret bypass is configured. We can't
  // safely call out to the backend here because it would block the
  // settings page render; instead we read the scan JSON if present
  // and check for the `unlocked` flag.
  let backendUnlocked = false;
  try {
    const cached = await db.scan.findUnique({ where: { shop } });
    if (cached) {
      const parsed = JSON.parse(cached.scanResponseJson);
      backendUnlocked = scanIsUnlocked(parsed);
    }
  } catch {
    /* ignore */
  }

  return {
    shop,
    cacheMeta,
    backendUnlocked,
    appConfigured: Boolean(process.env.ASVA_APP_KEY),
  };
};

export default function SettingsPage() {
  const { shop, cacheMeta, backendUnlocked, appConfigured } = useLoaderData();
  const navigate = useNavigate();
  const shopName = shop.replace(/\.myshopify\.com$/, "");
  // Reopen the dismissed first-run onboarding card by clearing the
  // localStorage flag and bouncing back to Agentic Readiness Home where the
  // card renders. (Phase 3 moved /app to the Dashboard iframe; the onboarding
  // card stays on the Agentic Readiness page.)
  const reopenOnboarding = () => {
    try {
      localStorage.removeItem("asva-onboarding-dismissed");
    } catch {
      /* ignore */
    }
    navigate("/app/agentic-readiness?tab=home");
  };

  return (
    <Page title="Settings" subtitle="Diagnostics, configuration status, and support.">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingSm">Installation</Text>
            <Divider />
            <InlineStack align="space-between">
              <Text as="span" variant="bodyMd">Connected store</Text>
              <Text as="span" variant="bodyMd" tone="subdued">{shopName}.myshopify.com</Text>
            </InlineStack>
            <InlineStack align="space-between">
              <Text as="span" variant="bodyMd">App distribution</Text>
              <Badge tone="info">Public</Badge>
            </InlineStack>
            <InlineStack align="space-between">
              <Text as="span" variant="bodyMd">Plan</Text>
              <Badge tone="success">Free forever</Badge>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingSm">Backend connection</Text>
            <Divider />
            <InlineStack align="space-between">
              <Text as="span" variant="bodyMd">Audit API</Text>
              <Badge tone="success">Connected</Badge>
            </InlineStack>
            <InlineStack align="space-between">
              <Text as="span" variant="bodyMd">Full audit access (checks + fixes)</Text>
              <Badge tone={appConfigured && backendUnlocked ? "success" : "attention"}>
                {appConfigured && backendUnlocked ? "Unlocked" : "Free tier"}
              </Badge>
            </InlineStack>
            {!appConfigured && (
              <Box paddingBlockStart="200">
                <Banner title="Top 5 fixes only" tone="info">
                  <p>
                    Set the <code>ASVA_APP_KEY</code> environment variable to
                    receive the full check + fix payload. Without it the
                    Home page still works, but All Checks / Fixes / Cross-Protocol
                    show only top 5 / placeholder content.
                  </p>
                </Banner>
              </Box>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingSm">Scan cache</Text>
            <Divider />
            {cacheMeta ? (
              <>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodyMd">Last scan</Text>
                  <Text as="span" variant="bodyMd" tone="subdued">
                    {new Date(cacheMeta.updatedAt).toLocaleString()}
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodyMd">Cached score</Text>
                  <InlineStack gap="200">
                    <Text as="span" variant="bodyMd" tone="subdued">{cacheMeta.score ?? "—"} / 100</Text>
                    {cacheMeta.grade && <Badge>{cacheMeta.grade}</Badge>}
                  </InlineStack>
                </InlineStack>
                <Box paddingBlockStart="200">
                  <Button
                    variant="primary"
                    onClick={() => navigate("/app/agentic-readiness?rescan=1")}
                  >
                    Force fresh scan
                  </Button>
                </Box>
              </>
            ) : (
              <Text as="p" variant="bodyMd" tone="subdued">
                No scan has run yet. Visit the Home page to trigger one.
              </Text>
            )}
            <Text as="p" variant="bodySm" tone="subdued">
              Scans are cached for 24 hours to keep your store fast. Use Force
              fresh scan to bypass the cache.
            </Text>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingSm">Getting started</Text>
            <Divider />
            <Text as="p" variant="bodyMd">
              Reopen the welcome guide that walks you through enabling the
              Asva AI theme embeds (Org JSON-LD, Product JSON-LD, Bot
              allow-list, UCP discovery hint).
            </Text>
            <Box paddingBlockStart="100">
              <Button onClick={reopenOnboarding}>
                Show the welcome guide
              </Button>
            </Box>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingSm">Webhook diagnostics</Text>
            <Divider />
            <Text as="p" variant="bodyMd">
              Webhook deliveries are visible in your Shopify Partner Dashboard
              under <strong>App home → Monitoring → Webhooks</strong>. Asva AI
              subscribes to:
            </Text>
            <List type="bullet">
              <List.Item>
                <code>app/uninstalled</code> &mdash; cleanup on uninstall (clears session + cached scan)
              </List.Item>
              <List.Item>
                <code>app/scopes_update</code> &mdash; sync new scopes
              </List.Item>
              <List.Item>
                <code>customers/data_request</code>, <code>customers/redact</code>, <code>shop/redact</code> &mdash; GDPR compliance
              </List.Item>
            </List>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingSm">Support</Text>
            <Divider />
            <Text as="p" variant="bodyMd">
              Questions, bug reports, or feature requests:
            </Text>
            <List type="bullet">
              <List.Item>
                Email: <a href="mailto:support@asvaai.com">support@asvaai.com</a>
              </List.Item>
              <List.Item>
                Company: <a href="https://www.asvaai.com" target="_blank" rel="noopener noreferrer">asvaai.com</a>
              </List.Item>
              <List.Item>
                Public scanner: <a href="https://www.asvaai.com/agentic-readiness" target="_blank" rel="noopener noreferrer">asvaai.com/agentic-readiness</a>
              </List.Item>
            </List>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingSm">About</Text>
            <Divider />
            <Text as="p" variant="bodyMd">
              <strong>Asva AI</strong> audits your storefront against the UCP
              (Universal Commerce Protocol) and ACP (Agentic Commerce
              Protocol) standards used by AI shopping agents like ChatGPT,
              Perplexity, and Claude. Your score reflects how well agents
              can discover, browse, and purchase from your store.
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
export function ErrorBoundary() { return boundary.error(useRouteError()); }
