/**
 * ScanningProgress — Polaris Banner that polls /app/audit-status every 10s
 * and renders the current state of the first-audit job. Sits above the
 * Dashboard iframe so the merchant knows real visibility scores are landing
 * over the next 5-10 minutes, not "the dashboard is broken".
 *
 * States:
 *   queued / running  -> info banner with progress bar
 *   completed         -> success banner ("First audit done — refresh dashboard")
 *   failed            -> warning banner with reason from backend.error.reason
 *   cancelled (stub)  -> no banner (flag off)
 *
 * Stops polling once status leaves running/queued. Caller can pass an
 * `initialStatus` prop (from the route loader) so the first paint isn't
 * a 10-second blank.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Banner, ProgressBar, BlockStack, Text, InlineStack } from "@shopify/polaris";

const POLL_INTERVAL_MS = 10_000;
const POLLING_STATES = new Set(["queued", "running"]);

export function ScanningProgress({ initialStatus }) {
  const [status, setStatus] = useState(initialStatus || null);
  const timerRef = useRef(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/app/audit-status", { method: "GET" });
      if (res.ok) {
        const body = await res.json();
        setStatus(body);
      }
    } catch {
      /* swallow — the next tick will retry */
    }
  }, []);

  useEffect(() => {
    if (!status || !POLLING_STATES.has(status.status)) return;
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(timerRef.current);
  }, [status, poll]);

  if (!status || !status.found) return null;

  const s = status.status || "unknown";

  if (s === "cancelled") {
    // Stub state when ASVA_BACKGROUND_AUDIT is off. Don't surface to merchant.
    return null;
  }

  if (s === "failed") {
    const reason = status?.error?.reason || "unknown_error";
    const note = status?.error?.note || "";
    const friendly =
      reason === "topics_required"
        ? "We don't have topics configured for this brand yet — visibility scoring needs them to know what to scan for. Open the dashboard and run topic generation, then we'll re-fire automatically."
        : note || `Audit failed: ${reason}`;
    return (
      <Banner tone="warning" title="First audit needs a nudge">
        <Text as="p">{friendly}</Text>
      </Banner>
    );
  }

  if (s === "completed") {
    return (
      <Banner tone="success" title="First audit scan submitted">
        <Text as="p">
          Real visibility data is landing now — refresh the dashboard in 1–3 minutes
          to see the first scores fill in.
        </Text>
      </Banner>
    );
  }

  // queued / running
  const total = Math.max(0, Number(status.prompt_count_total) || 0);
  const done = Math.max(0, Number(status.prompt_count_done) || 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : Number(status.progress_pct || 0);
  const platformsDone = Array.isArray(status.platforms_done) ? status.platforms_done : [];
  const platformsPending = Array.isArray(status.platforms_pending) ? status.platforms_pending : [];

  return (
    <Banner tone="info" title="Scanning AI visibility…">
      <BlockStack gap="200">
        <Text as="p">
          {total > 0
            ? `Submitting ${total} prompts across AI platforms. ${done}/${total} done.`
            : "Setting up your first AI-visibility scan…"}
        </Text>
        <ProgressBar progress={pct} size="small" tone="primary" />
        {(platformsDone.length || platformsPending.length) ? (
          <InlineStack gap="200">
            {platformsDone.map((p) => (
              <Text as="span" key={`d-${p}`} tone="success" variant="bodySm">
                ✓ {p}
              </Text>
            ))}
            {platformsPending.map((p) => (
              <Text as="span" key={`p-${p}`} tone="subdued" variant="bodySm">
                … {p}
              </Text>
            ))}
          </InlineStack>
        ) : null}
      </BlockStack>
    </Banner>
  );
}
