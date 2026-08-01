import {
    createSessionCookie,
    isAnalyticsConfigured,
    json,
    passwordMatches
} from "../lib/analytics-auth.mjs";

export default async function handler(request) {
    if (request.method === "GET") {
        return json({ configured: isAnalyticsConfigured() });
    }

    if (request.method !== "POST") {
        return json({ error: "Method not allowed." }, 405, { Allow: "GET, POST" });
    }

    if (!isAnalyticsConfigured()) {
        return json({
            error: "Analytics is not configured. Set ANALYTICS_PASSWORD in Netlify."
        }, 503);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: "Enter your dashboard password." }, 400);
    }

    if (!passwordMatches(body?.password)) {
        return json({ error: "That password is not correct." }, 401);
    }

    return json(
        { authenticated: true },
        200,
        { "Set-Cookie": createSessionCookie(request) }
    );
}

export const config = {
    path: "/api/analytics/auth",
    rateLimit: {
        windowLimit: 10,
        windowSize: 60,
        aggregateBy: ["ip", "domain"]
    }
};
