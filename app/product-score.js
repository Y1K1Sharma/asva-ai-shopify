/**
 * Per-product agentic-readiness scoring. Pure functions, no I/O.
 *
 * Mirrors the breakdown the public scanner uses for product-level
 * checks — title clarity + description completeness + metadata + images.
 * Score is a 0-100 integer; component scores are 0-1 normalized then
 * weighted.
 *
 * Weights (sum to 100):
 *   title         40   — agents lead with title for retrieval + ranking
 *   description   25   — long-form context is the main signal for relevance
 *   metadata      20   — variants/tags/options enable structured filtering
 *   images        15   — at least one image with alt text is table stakes
 *
 * "Why these weights": agents that route shoppers to a product start with
 * the title (so it has to read cleanly), then use the description for
 * intent matching, then use metadata for variant pickers, and finally
 * fall back to images for confidence. Title + description = 65% of
 * outcome.
 */

const W_TITLE = 40;
const W_DESCRIPTION = 25;
const W_METADATA = 20;
const W_IMAGES = 15;

function scoreTitle(title) {
  if (!title || typeof title !== "string") return { pct: 0, reason: "Missing title" };
  const t = title.trim();
  const len = t.length;
  if (len === 0) return { pct: 0, reason: "Empty title" };
  if (len < 10) return { pct: 0.3, reason: "Title too short (<10 chars)" };
  if (len > 120) return { pct: 0.6, reason: "Title too long (>120 chars)" };
  // SEO-spam heuristic: ALL CAPS or 4+ pipe/dash separators
  if (t === t.toUpperCase() && len > 20) {
    return { pct: 0.4, reason: "Title is ALL CAPS" };
  }
  const sepCount = (t.match(/[|\-—–]/g) || []).length;
  if (sepCount >= 4) {
    return { pct: 0.5, reason: "Title looks SEO-padded" };
  }
  return { pct: 1, reason: "Clear, scannable title" };
}

function scoreDescription(html, plain) {
  // Prefer plain text length if available; fall back to stripping HTML.
  let text = "";
  if (plain && typeof plain === "string") {
    text = plain.trim();
  } else if (html && typeof html === "string") {
    text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  const len = text.length;
  if (len === 0) return { pct: 0, reason: "No description" };
  if (len < 50) return { pct: 0.2, reason: "Description too short (<50 chars)" };
  if (len < 200) return { pct: 0.6, reason: "Description short (<200 chars)" };
  if (len < 500) return { pct: 0.85, reason: "Decent description" };
  return { pct: 1, reason: "Rich description" };
}

function scoreMetadata(node) {
  // node.options + node.tags + node.variants (count + price coverage)
  let score = 0;
  const reasons = [];

  const tagCount = Array.isArray(node?.tags) ? node.tags.length : 0;
  if (tagCount >= 3) score += 0.4;
  else if (tagCount >= 1) score += 0.2;
  else reasons.push("No tags");

  const options = node?.options || [];
  if (options.length > 0) score += 0.3;
  else reasons.push("No options");

  const variantCount = node?.variantsCount?.count ?? 0;
  const hasMultipleVariants = variantCount > 1;
  if (hasMultipleVariants) score += 0.3;
  else if (variantCount === 1) score += 0.15;
  else reasons.push("No variants");

  score = Math.min(1, score);
  const reason = reasons.length === 0 ? "Tags + variants + options present" : reasons.join(", ");
  return { pct: score, reason };
}

function scoreImages(node) {
  const count = node?.media?.edges?.length ?? node?.imagesCount?.count ?? 0;
  if (count === 0) return { pct: 0, reason: "No images" };

  // Check first image for alt text (proxy for accessibility / agent metadata)
  let hasAltText = false;
  const firstMedia = node?.media?.edges?.[0]?.node;
  if (firstMedia?.alt && firstMedia.alt.trim().length > 0) {
    hasAltText = true;
  }

  if (count === 1 && !hasAltText) {
    return { pct: 0.4, reason: "1 image, no alt text" };
  }
  if (count === 1 && hasAltText) {
    return { pct: 0.7, reason: "1 image with alt text" };
  }
  if (count >= 2 && !hasAltText) {
    return { pct: 0.7, reason: `${count} images, no alt text on lead` };
  }
  return { pct: 1, reason: `${count} images, lead has alt text` };
}

export function scoreProduct(node) {
  const title = scoreTitle(node?.title);
  const description = scoreDescription(node?.descriptionHtml, node?.description);
  const metadata = scoreMetadata(node);
  const images = scoreImages(node);

  const total = Math.round(
    title.pct * W_TITLE +
    description.pct * W_DESCRIPTION +
    metadata.pct * W_METADATA +
    images.pct * W_IMAGES,
  );

  return {
    total,
    grade: gradeFromScore(total),
    breakdown: {
      title: { ...title, weight: W_TITLE, points: Math.round(title.pct * W_TITLE) },
      description: { ...description, weight: W_DESCRIPTION, points: Math.round(description.pct * W_DESCRIPTION) },
      metadata: { ...metadata, weight: W_METADATA, points: Math.round(metadata.pct * W_METADATA) },
      images: { ...images, weight: W_IMAGES, points: Math.round(images.pct * W_IMAGES) },
    },
  };
}

export function gradeFromScore(score) {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Fair";
  if (score >= 40) return "Poor";
  return "Very Poor";
}

export const SCORE_TONE = {
  Excellent: "success",
  Good: "info",
  Fair: "attention",
  Poor: "warning",
  "Very Poor": "critical",
};

/**
 * Extract numeric id from gid://shopify/Product/12345 for building admin URLs.
 */
export function productIdFromGid(gid) {
  if (!gid) return "";
  const m = gid.match(/Product\/(\d+)/);
  return m ? m[1] : "";
}
