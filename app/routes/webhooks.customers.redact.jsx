import crypto from "crypto";

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

    try {
        const payload = JSON.parse(body);
        console.log("Received customers/redact for shop:", payload.shop_domain);
    } catch (e) {
        console.error("Failed to parse JSON body:", e);
    }

    // Return exactly 200 for successful receipt
    return new Response("OK", { status: 200 });
};
