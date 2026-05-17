import crypto from "crypto";
import db from "../db.server";

export const action = async ({ request }) => {
    if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
    }

    const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
    const body = await request.text();

    if (!hmacHeader) {
        return new Response("Missing HMAC header", { status: 401 });
    }

    const generatedHash = crypto
        // eslint-disable-next-line no-undef
        .createHmac("sha256", process.env.SHOPIFY_API_SECRET || "")
        .update(body, "utf8")
        .digest("base64");

    if (generatedHash !== hmacHeader) {
        return new Response("Unauthorized", { status: 401 });
    }

    let shopDomain = null;
    try {
        const payload = JSON.parse(body);
        shopDomain = payload.shop_domain || null;
        console.log("Received shop/redact for shop:", shopDomain);
    } catch (e) {
        console.error("Failed to parse JSON body:", e);
    }

    // GDPR: wipe any data we still hold for this shop. We only store
    // session + cached scan response — both are removed here.
    if (shopDomain) {
        await db.session.deleteMany({ where: { shop: shopDomain } }).catch(() => {});
        await db.scan.deleteMany({ where: { shop: shopDomain } }).catch(() => {});
    }

    return new Response("OK", { status: 200 });
};
