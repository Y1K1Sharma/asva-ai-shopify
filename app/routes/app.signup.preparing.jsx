/**
 * SHOP-CONVERGE Phase 4 — pre-prefill spinner.
 *
 * Shown to the merchant for the 5-30s window between the install /provision
 * (which inserts shopify_merchants with signup_step='brand' + spawns the
 * prefill worker) and signup_prefill_ready_at being set on the row.
 *
 * Polls /app/audit-status every 3s. When the backend reports a state that
 * means "forms are ready", navigates to /app/signup/<step>. If the merchant
 * is somehow already past signup (signup_step='done'), bounces to /app.
 *
 * Gated behind ASVA_SIGNUP_GATE_ENABLED. When the flag is off (default),
 * /app never redirects here and this page is unreachable from the nav.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Spinner,
  Text,
  ProgressBar,
} from "@shopify/polaris";

const POLL_INTERVAL_MS = 3000;

export default function SignupPreparing() {
  const navigate = useNavigate();
  const [statusText, setStatusText] = useState(
    "Reading your store details…",
  );
  const [progressPct, setProgressPct] = useState(15);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch(`/app/audit-status?ts=${Date.now()}`, {
          method: "GET",
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        if (!res.ok || cancelled) return;
        const body = await res.json();
        const step = body?.signup_step;
        const ready = body?.signup_prefill_ready_at;

        // Already past signup — back to Dashboard. Defensive: should never
        // happen because /app would have routed us straight there.
        if (step === "done") {
          navigate("/app", { replace: true });
          return;
        }

        // Prefill computed → route to the right step.
        if (ready) {
          setProgressPct(95);
          setStatusText("All set — opening setup…");
          const target =
            step === "competitors"
              ? "/app/signup/competitors"
              : step === "categories"
                ? "/app/signup/categories"
                : "/app/signup/brand";
          // Tiny delay so the merchant actually sees "All set" before nav.
          setTimeout(() => {
            if (!cancelled) navigate(target, { replace: true });
          }, 400);
          return;
        }

        // Still computing. Bump the visible progress so the UI feels alive
        // even though we can't know the worker's exact %-done.
        setProgressPct((prev) => Math.min(85, prev + 5));
        setStatusText(
          progressPct < 35
            ? "Classifying your products…"
            : progressPct < 65
              ? "Finding similar brands you compete with…"
              : "Almost ready…",
        );
      } catch {
        // swallow; next tick retries
      }
    }

    void tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // progressPct intentionally read once; we don't want a re-create loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  return (
    <Page>
      <Card>
        <BlockStack gap="400" align="center">
          <InlineStack gap="300" blockAlign="center">
            <Spinner size="large" accessibilityLabel="Setting up your audit" />
            <Text as="h2" variant="headingLg">
              Setting up your AI-visibility audit
            </Text>
          </InlineStack>
          <Text as="p" tone="subdued">
            We&apos;re analysing your store catalog so your three signup steps
            arrive pre-filled. This usually takes 30–60 seconds.
          </Text>
          <ProgressBar progress={progressPct} size="small" tone="primary" />
          <Text as="p" tone="subdued" variant="bodySm">
            {statusText}
          </Text>
        </BlockStack>
      </Card>
    </Page>
  );
}
