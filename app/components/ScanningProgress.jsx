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
// Phase 5.10d — bumped 90s → 30 min. The earlier 90s window caused the
// banner to disappear mid-audit when a merchant tab-switched back into
// the iframe and the SSR loader's snapshot read happened to be old —
// the success Banner would never re-paint with the latest count and the
// running banner would freeze on the last polled state. Aligns with the
// upper bound of a slow first-audit (~10 min) plus a comfort buffer.
const SUCCESS_AUTO_HIDE_SEC = 30 * 60;

function _isTerminal(s) {
  return s && s.found && TERMINAL_STATES.has(s.status);
}

export function ScanningProgress({ initialStatus }) {
  const [status, setStatus] = useState(initialStatus || null);
  const timerRef = useRef(null);
  const mountedRef = useRef(true);
  // Track which audit_job_id the merchant has explicitly dismissed. Survives
  // re-renders within this mount; sessionStorage persists across navigation.
  const dismissedRef = useRef(
    (() => {
      try {
        return sessionStorage.getItem("asva.audit.dismissed") || null;
      } catch {
        return null;
      }
    })(),
  );

  const poll = useCallback(async () => {
    try {
      // Phase 5.10d — cache-bust every poll so a CDN or Shopify embedded
      // proxy can't serve a stale 304. The endpoint reads live counts
      // from prompts_responses each call; we want every tick to actually
      // round-trip, not get short-circuited by a conditional GET. The
      // no-store header is belt-and-braces against the browser HTTP cache.
      const res = await fetch(`/app/audit-status?ts=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
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
    // Phase 5.10d — ALWAYS fire one fresh poll on mount, even if the SSR
    // snapshot reports terminal. The loader's snapshot can be minutes old
    // by the time the SPA paints (the snapshot was fetched at navigation
    // start; tab-switch back hits the cached SSR HTML). One immediate
    // round-trip rules out a stale "running" or stale "completed" frozen
    // count. Subsequent polling is gated by _isTerminal in the next
    // useEffect, so this doesn't cause runaway requests.
    void poll();
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

  // SHOP-CONVERGE Phase 5 — between "merchant finished 3-step signup" and
  // "admin triggered Cloro runs in /admin/queues", the audit_job sits in
  // 'queued' with no prompts in flight. Show a distinct "queued for review"
  // banner so the merchant knows scanning hasn't started yet (and won't,
  // until Yash promotes/approves/triggers in the admin queue).
  //
  // Inference rule:
  //   signup_completed_at is set         (merchant finished step 3)
  //   AND audit status is queued / null  (Cloro not running yet)
  //   AND no prompts have landed yet     (prompt_count_total == 0)
  // The moment Yash triggers Cloro, prompts get queued and the next poll
  // tick flips into the standard "Scanning AI visibility…" running state.
  if (
    status.signup_completed_at &&
    (s === "queued" || s === "unknown" || !s) &&
    Number(status.prompt_count_total || 0) === 0
  ) {
    return (
      <Banner tone="info" title="Your AI-visibility audit is queued">
        <Text as="p">
          Our team reviews each brand setup before scanning starts. We&apos;ll
          email you the moment your first results are ready — typically within
          24 hours of install.
        </Text>
      </Banner>
    );
  }

  if (s === "completed") {
    // Auto-hide the success banner once we're past completed_at by N minutes,
    // and surface a dismiss X via Polaris Banner.onDismiss so merchants can
    // close it earlier. Once dismissed, sessionStorage remembers per audit
    // job id so the banner doesn't pop back up on a tab swap.
    if (dismissedRef.current === status.audit_job_id) return null;
    const completedAt = status.completed_at ? Date.parse(status.completed_at) : 0;
    const ageSec = completedAt ? (Date.now() - completedAt) / 1000 : 0;
    if (ageSec > SUCCESS_AUTO_HIDE_SEC) return null;
    return (
      <Banner
        tone="success"
        title="First audit scan submitted"
        onDismiss={() => {
          dismissedRef.current = status.audit_job_id || true;
          try {
            if (status.audit_job_id) {
              sessionStorage.setItem(
                "asva.audit.dismissed",
                status.audit_job_id,
              );
            }
          } catch {
            /* private mode */
          }
          // Force re-render by bumping status reference shallowly.
          setStatus({ ...status, __dismissed: true });
        }}
      >
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
