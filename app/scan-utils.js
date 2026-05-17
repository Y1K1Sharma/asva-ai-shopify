/**
 * Pure helpers for transforming the scan-public response into UI-ready
 * shapes. No I/O, no React — safe to import on client or server.
 *
 * Categories returned by the backend audit pipeline (lib/validator/...)
 * land in one of three readiness dimensions plus the Cross-Protocol
 * bucket. This mapping mirrors the dimension rollups the backend
 * computes for the Home page.
 */

/**
 * True when a scan response includes the full unlocked-tier payload
 * (checks + fixes arrays). Use this to decide whether All Checks /
 * Fixes pages can render real data or must show the "configure
 * ASVA_APP_KEY" placeholder.
 */
export function scanIsUnlocked(scan) {
  return Boolean(
    scan &&
      scan.unlocked === true &&
      Array.isArray(scan.checks) &&
      Array.isArray(scan.fixes),
  );
}

export const DIMENSION_UCP = "UCP";
export const DIMENSION_ACP = "ACP";
export const DIMENSION_INFRA = "Infrastructure";
export const DIMENSION_CROSS = "Cross-Protocol";

const CATEGORY_TO_DIMENSION = {
  transport: DIMENSION_INFRA,
  security: DIMENSION_INFRA,
  bots: DIMENSION_INFRA,
  structural: DIMENSION_UCP,
  capabilities: DIMENSION_UCP,
  payments: DIMENSION_UCP,
  keys: DIMENSION_UCP,
  acp: DIMENSION_ACP,
  cross_protocol: DIMENSION_CROSS,
};

export const DIMENSIONS = [
  DIMENSION_UCP,
  DIMENSION_ACP,
  DIMENSION_INFRA,
  DIMENSION_CROSS,
];

export const STATUSES = ["pass", "fail", "warn", "info", "skip"];

export const SEVERITIES = ["critical", "important", "minor"];

export function classifyCheckByDim(check) {
  return CATEGORY_TO_DIMENSION[check?.category] || "Other";
}

export const STATUS_TONE = {
  pass: "success",
  fail: "critical",
  warn: "attention",
  info: "info",
  skip: undefined,
};

export const SEVERITY_TONE = {
  critical: "critical",
  important: "attention",
  minor: "info",
};

export const STATUS_LABEL = {
  pass: "Pass",
  fail: "Fail",
  warn: "Warn",
  info: "Info",
  skip: "Skip",
};

/**
 * Apply status + dimension + severity + free-text filters to a check list.
 * Each filter is independent; empty/null filters are no-ops.
 */
export function filterChecks(checks, { status, dimension, severity, q } = {}) {
  if (!Array.isArray(checks)) return [];
  const needle = (q || "").trim().toLowerCase();
  return checks.filter((c) => {
    if (status && c.status !== status) return false;
    if (dimension && classifyCheckByDim(c) !== dimension) return false;
    if (severity && c.severity !== severity) return false;
    if (needle) {
      const hay = `${c.id || ""} ${c.title || ""} ${c.detail || ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

/**
 * Sort checks by:
 *   1. fail before warn before info before skip before pass
 *   2. critical before important before minor
 *   3. title alphabetical
 *
 * Surfaces the highest-signal rows first when the user lands without
 * any filters.
 */
const STATUS_ORDER = { fail: 0, warn: 1, info: 2, skip: 3, pass: 4 };
const SEVERITY_ORDER = { critical: 0, important: 1, minor: 2 };

export function sortChecksByImpact(checks) {
  return [...(checks || [])].sort((a, b) => {
    const sa = STATUS_ORDER[a.status] ?? 99;
    const sb = STATUS_ORDER[b.status] ?? 99;
    if (sa !== sb) return sa - sb;
    const va = SEVERITY_ORDER[a.severity] ?? 99;
    const vb = SEVERITY_ORDER[b.severity] ?? 99;
    if (va !== vb) return va - vb;
    return (a.title || "").localeCompare(b.title || "");
  });
}
