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

// Faster than the original 10s — the curated multi-platform path can finish
// the whole audit in under a minute, so a 10s tick risked the banner never
// catching any non-terminal state.
const POLL_INTERVAL_MS = 4_000;
// Terminal states — once we hit one of these we stop polling.
const TERMINAL_STATES = new Set(["completed", "failed", "cancelled"]);

function _isTerminal(s) {
  return s && s.found && TERMINAL_STATES.has(s.status);
}

export function ScanningProgress({ initialStatus }) {
  const [status, setStatus] = useState(initialStatus || null);
  const timerRef = useRef(null);
  const mountedRef = useRef(true);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/app/audit-status", { method: "GET" });
      if (res.ok && mountedRef.current) {
        const body = await res.json();
        setStatus(body);
      }
    } catch {
      /* swallow — the next tick will retry */
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    // Always do an immediate poll on mount unless we already have a
    // terminal snapshot — the SSR loader's initialStatus may have raced
    // ingest_on_install and returned `found: false` before the audit job
    // existed, OR the audit may have completed in seconds. Either way,
    // we want one immediate sample THEN an interval until terminal.
    if (!_isTerminal(status)) {
      void poll();
    }
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Keep polling whenever we don't yet have a terminal state. Covers:
    //   - status null      (SSR loader failed, server hasn't replied yet)
    //   - found false      (audit_job not created yet — install just happened)
    //   - status queued    (job created, daemon thread hasn't picked it up)
    //   - status running   (daemon thread working: generating_topics / scanning)
    if (_isTerminal(status)) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [status, poll]);

  // Pre-audit waiting state — no audit_job yet OR loader hasn't returned.
  // Show a placeholder banner so the merchant isn't left wondering whether
  // anything is happening at all.
  if (!status || !status.found) {
    return (
      <Banner tone="info" title="Setting up your first AI-visibility scan…">
        <Text as="p">
          Hang tight — we're spinning up your audit. This usually takes 1–2 minutes.
        </Text>
      </Banner>
    );
  }

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
        ? "We couldn't auto-generate topics for your store on the first pass. Open the dashboard, run topic generation manually, and we'll re-fire the audit."
        : reason === "auto_topic_gen_disabled"
        ? "First audits are paused while topic auto-generation is being rolled out. Open the dashboard to start one manually."
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
  const isGeneratingTopics = platformsPending.includes("generating_topics");

  const headline = isGeneratingTopics
    ? "Generating your visibility topics…"
    : "Scanning AI visibility…";

  const platformLabel = platformsDone.length
    ? platformsDone.length === 1
      ? platformsDone[0]
      : `${platformsDone.length} AI platforms`
    : "AI platforms";

  const body = isGeneratingTopics
    ? "We're picking the right topics + prompts to test your brand against. This takes 1–2 minutes; the audit fires automatically when it's done."
    : total > 0
    ? `Submitting ${total} prompts across ${platformLabel}. ${done}/${total} done.`
    : "Setting up your first AI-visibility scan…";

  return (
    <Banner tone="info" title={headline}>
      <BlockStack gap="200">
        <Text as="p">{body}</Text>
        <ProgressBar progress={pct} size="small" tone="primary" />
        {!isGeneratingTopics && (platformsDone.length || platformsPending.length) ? (
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
