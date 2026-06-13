import { useState, useMemo, useCallback } from "react";
import { useLoaderData, useNavigate } from "react-router";
import {
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
import { SEVERITY_TONE, SEVERITIES, scanIsUnlocked } from "../../scan-utils";
import { applyFixUrl, blockForCheckId, blockTypeFor } from "../../tae-fix-map";
import { usePendingApply, markPendingApply } from "../../use-pending-apply";

// Client-side "recently applied" tracker so the Apply Fix button gives visible
// feedback the moment the merchant clicks it, even though the backend can't
// verify the change until the next Rescan completes (and even then, only on
// publicly-accessible stores — see the password-gate banner below).
//
// We record check_id -> timestamp in localStorage and decay entries after
// APPLIED_TTL_MS. When the next Rescan removes the fix from the list (because
// the check now passes), the entry just naturally falls out of view; when it
// times out without verification, we go back to the "Apply fix" CTA.
const APPLIED_KEY = "asva_recently_applied_fixes";
const APPLIED_TTL_MS = 30 * 60 * 1000; // 30 minutes

function readAppliedMap() {
  try {
    const raw = localStorage.getItem(APPLIED_KEY);
    if (!raw) return {};
    const map = JSON.parse(raw);
    const now = Date.now();
    const fresh = {};
    for (const [id, ts] of Object.entries(map)) {
      if (typeof ts === "number" && now - ts < APPLIED_TTL_MS) fresh[id] = ts;
    }
    return fresh;
  } catch {
    return {};
  }
}

function writeAppliedCheck(checkId) {
  if (!checkId) return;
  try {
    const map = readAppliedMap();
    map[checkId] = Date.now();
    localStorage.setItem(APPLIED_KEY, JSON.stringify(map));
  } catch { /* sandboxed / no localStorage */ }
}

// Reuse the same gate detection as Home: the schema/org checks failing usually
// means the storefront is password-gated, behind a WAF, or the embeds aren't
// enabled yet. Used to show a clarifying banner in the Fixes tab so merchants
// on dev-plan stores understand why their score isn't moving after Apply Fix.
function detectStorefrontGated(scan) {
  if (!scan) return false;
  const checks = Array.isArray(scan.checks) ? scan.checks : [];
  const find = (id) => checks.find((c) => c?.id === id);
  const schema = find("discovery-schema-org-jsonld");
  const org = find("discovery-organization-schema");
  return Boolean(
    (schema && schema.status === "fail") || (org && org.status === "fail"),
  );
}

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

export function FixesTab() {
  const { scan, cacheHit, loadError, shop } = useLoaderData();
  const navigate = useNavigate();
  const { pendingApply, clear: clearPending } = usePendingApply();

  // Stay on the Fixes tab after rescan instead of bouncing back to Home,
  // so the merchant can immediately see the updated fix list.
  const handleRescanNow = () => {
    clearPending();
    navigate("/app/agentic-readiness?tab=fixes&rescan=1");
  };

  if (loadError) {
    return (
      <Banner title="We couldn't load your fixes" tone="warning">
        <p>{loadError}</p>
      </Banner>
    );
  }

  const unlocked = scanIsUnlocked(scan);
  const fallbackFixes = Array.isArray(scan?.top_5_fixes) ? scan.top_5_fixes : [];
  const allFixes = unlocked && Array.isArray(scan?.fixes) ? scan.fixes : fallbackFixes;
  const shopName = shop.replace(/\.myshopify\.com$/, "");
  const gated = detectStorefrontGated(scan);
  const hasThemeEmbedFixes = allFixes.some((f) => Boolean(applyFixUrl(f, shop)));

  return (
    <BlockStack gap="400">
      <Text as="p" variant="bodySm" tone="subdued">
        {unlocked
          ? `Every recommended fix for ${shopName} (${allFixes.length} total).`
          : `Top ${allFixes.length} highest-impact fixes for ${shopName}.`}
      </Text>
        {pendingApply && (
          <Banner
            title="Did you save a theme change?"
            tone="success"
            action={{ content: "Rescan now", onAction: handleRescanNow }}
            secondaryAction={{ content: "Not yet", onAction: clearPending }}
          >
            <p>
              Looks like you came back from the theme editor. If you toggled an
              Asva AI embed on and clicked <strong>Save</strong>, run a fresh
              scan to update your score. Takes ~30 seconds.
            </p>
          </Banner>
        )}
      {cacheHit && (
        <Text as="p" variant="bodySm" tone="subdued">
          Showing cached result. Click Rescan above for fresh data.
        </Text>
      )}
      {gated && hasThemeEmbedFixes && (
        <Banner title="Applied fixes can't be verified yet — your storefront is gated" tone="warning">
          <p>
            Our audit fetches your storefront like a public bot. Because{" "}
            <strong>{shopName}</strong> is currently password-protected (or behind
            a WAF), it gets redirected to <code>/password</code> and can&rsquo;t
            see the Schema.org JSON-LD your Asva AI embeds emit on the real
            storefront. Apply Fix still works and your embeds are active —{" "}
            <strong>the score will populate as soon as your store is publicly accessible</strong>.
          </p>
          <p>
            To test verification on this store now: <strong>Online Store →
            Preferences → Password protection</strong> → turn it off temporarily,
            then Rescan.
          </p>
        </Banner>
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
        {unlocked && (
          <Banner title="How Apply fix works" tone="info">
            <p>
              Fixes tagged <strong>Theme embed available</strong> are applied via Shopify&rsquo;s
              App embeds panel. Click <strong>Apply fix</strong> → a new tab opens at Theme
              Settings → App embeds → toggle on the Asva AI embed named in the tooltip → click
              <strong> Save</strong> in the editor → return to Asva AI and click <strong>Rescan</strong>{" "}
              above. Your score updates after the rescan completes (~30 seconds).
            </p>
            <p>
              Fixes tagged <strong>Manual fix</strong> need server-side changes (HTTPS, HSTS,
              CORS headers, UCP manifest hosting) that the app can&rsquo;t apply from inside
              Shopify. Use the description and code snippet below each fix as your reference.
            </p>
          </Banner>
        )}
      <FixList fixes={allFixes} unlocked={unlocked} shop={shop} />
    </BlockStack>
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
  const [appliedAt, setAppliedAt] = useState(
    () => readAppliedMap()[fix.check_id] || null,
  );
  const sevTone = SEVERITY_TONE[fix.severity];
  const effortTone = EFFORT_TONE[fix.effort];
  const hasCode = Boolean(fix.code_snippet);
  const applyUrl = applyFixUrl(fix, shop);
  const block = blockForCheckId(fix.check_id);
  const blockType = blockTypeFor(block);
  const handleApplyClick = useCallback(() => {
    markPendingApply();
    writeAppliedCheck(fix.check_id);
    setAppliedAt(Date.now());
  }, [fix.check_id]);
  // Block-specific instruction. Each tooltip names the exact embed
  // the merchant has to toggle on so they don't pick the wrong one.
  // Every block is now an embed; the App embeds panel is one click
  // away. Score only moves after Save (in editor) + Rescan (in app).
  const BLOCK_INSTRUCTIONS = {
    "product-jsonld":
      "Opens Theme Settings → App embeds. Toggle on 'Product JSON-LD (Asva AI)' → click Save in the editor → come back to Asva AI and click Rescan on the Home page.",
    "organization-jsonld":
      "Opens Theme Settings → App embeds. Toggle on 'Org JSON-LD (Asva AI)' → click Save in the editor → come back to Asva AI and click Rescan on the Home page.",
    "bot-allowlist":
      "Opens Theme Settings → App embeds. Toggle on 'Bot allow-list (Asva AI)' → click Save → come back and Rescan.",
    "ucp-manifest-hint":
      "Opens Theme Settings → App embeds. Toggle on 'UCP discovery (Asva AI)' → paste your manifest URL → click Save → come back and Rescan.",
  };
  const applyTooltip =
    BLOCK_INSTRUCTIONS[block] ||
    "Opens Theme Settings → App embeds. Toggle on the Asva AI embed, click Save, then come back and Rescan.";

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="start" wrap={false}>
          <BlockStack gap="100">
            {/*
              Render #N + title inside ONE Text element so there is no flex
              gap between them - just a single regular space. Using a nested
              Text as="span" with smaller variant + subdued tone gives us the
              visual distinction without any layout spacing.
            */}
            <Text as="h3" variant="headingSm">
              <Text as="span" variant="bodySm" tone="subdued">#{index}</Text>
              {" "}
              {fix.title || fix.check_id}
            </Text>
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
              {applyUrl && !appliedAt && <Badge tone="success">Theme embed available</Badge>}
            </InlineStack>
          </BlockStack>
          <Box>
            {appliedAt ? (
              // Merchant clicked Apply Fix recently. Backend hasn't yet
              // verified the change (next Rescan will). Show acknowledgement +
              // a "Re-apply" escape hatch in case the embed wasn't actually
              // toggled on.
              <BlockStack gap="100" inlineAlign="end">
                <Badge tone="success">Applied · verifying</Badge>
                {applyUrl && (
                  <Button
                    variant="plain"
                    url={applyUrl}
                    external
                    onClick={handleApplyClick}
                    accessibilityLabel={`Re-apply fix: ${fix.title}`}
                  >
                    Re-apply
                  </Button>
                )}
              </BlockStack>
            ) : applyUrl ? (
              <Tooltip content={applyTooltip}>
                <Button
                  variant="primary"
                  url={applyUrl}
                  external
                  onClick={handleApplyClick}
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

