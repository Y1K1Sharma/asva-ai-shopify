import { authenticate } from "../shopify.server";
import db from "../db.server";

// Best-effort scopes sync — always return 200 so Shopify doesn't retry 19x
// on transient DB issues. The session.scope field is informational; if it
// drifts briefly that's tolerable.
export const action = async ({ request }) => {
  let payload, session, topic, shop;
  try {
    const verified = await authenticate.webhook(request);
    payload = verified.payload;
    session = verified.session;
    topic = verified.topic;
    shop = verified.shop;
  } catch (err) {
    console.error("[webhook app/scopes_update] auth failed:", err);
    return new Response("Unauthorized", { status: 401 });
  }

  console.log(`Received ${topic} webhook for ${shop}`);
  const current = payload?.current;

  if (session && current) {
    await db.session
      .update({ where: { id: session.id }, data: { scope: current.toString() } })
      .catch((err) => {
        console.error("[webhook app/scopes_update] update failed:", err);
      });
  }

  return new Response("OK", { status: 200 });
};
