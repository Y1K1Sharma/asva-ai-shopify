import { authenticate } from "../shopify.server";
import db from "../db.server";

// Webhook handler MUST return 200 OR Shopify counts it as a failure and
// retries up to 19 times. We treat cleanup as best-effort — log any Prisma
// errors but never propagate them out. The webhook is auth'd by HMAC via
// the framework, so even if cleanup fails the security boundary stands.
export const action = async ({ request }) => {
  let shop;
  let topic;
  let session;

  try {
    const verified = await authenticate.webhook(request);
    shop = verified.shop;
    topic = verified.topic;
    session = verified.session;
  } catch (err) {
    // HMAC verification failed — return 401 (framework handles this normally,
    // but be explicit so the deploy can't 500 if the framework throws).
    console.error("[webhook app/uninstalled] auth failed:", err);
    return new Response("Unauthorized", { status: 401 });
  }

  console.log(`Received ${topic} webhook for ${shop}`);

  // Best-effort cleanup — never throw out of the action.
  if (session) {
    await db.session.deleteMany({ where: { shop } }).catch((err) => {
      console.error("[webhook app/uninstalled] session cleanup failed:", err);
    });
  }
  await db.scan.deleteMany({ where: { shop } }).catch((err) => {
    console.error("[webhook app/uninstalled] scan cleanup failed:", err);
  });

  return new Response("OK", { status: 200 });
};
