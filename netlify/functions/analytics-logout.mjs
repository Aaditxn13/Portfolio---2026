import { clearSessionCookie, json } from "../lib/analytics-auth.mjs";

export default async function handler(request) {
    if (request.method !== "POST") {
        return json({ error: "Method not allowed." }, 405, { Allow: "POST" });
    }

    return json(
        { authenticated: false },
        200,
        { "Set-Cookie": clearSessionCookie(request) }
    );
}

export const config = {
    path: "/api/analytics/logout"
};
