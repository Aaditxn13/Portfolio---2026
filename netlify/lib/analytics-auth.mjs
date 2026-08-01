import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "as_analytics_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24;

function getSecret() {
    return process.env.ANALYTICS_SECRET || process.env.ANALYTICS_PASSWORD || "";
}

function sign(value) {
    return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

function safeEqual(left, right) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function isAnalyticsConfigured() {
    return Boolean(process.env.ANALYTICS_PASSWORD && getSecret());
}

export function passwordMatches(candidate) {
    if (!isAnalyticsConfigured() || typeof candidate !== "string") return false;
    const expected = createHmac("sha256", getSecret())
        .update(process.env.ANALYTICS_PASSWORD)
        .digest("hex");
    const received = createHmac("sha256", getSecret()).update(candidate).digest("hex");
    return safeEqual(expected, received);
}

export function createSessionCookie(request) {
    const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
    const value = `${expiresAt}.${sign(String(expiresAt))}`;
    const isLocal = request && ["localhost", "127.0.0.1"].includes(new URL(request.url).hostname);
    const secure = isLocal ? "" : "; Secure";
    return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=${SESSION_DURATION_SECONDS}`;
}

export function clearSessionCookie(request) {
    const isLocal = request && ["localhost", "127.0.0.1"].includes(new URL(request.url).hostname);
    const secure = isLocal ? "" : "; Secure";
    return `${SESSION_COOKIE}=; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=0`;
}

export function hasValidSession(request) {
    if (!isAnalyticsConfigured()) return false;
    const cookieHeader = request.headers.get("cookie") || "";
    const cookies = Object.fromEntries(
        cookieHeader
            .split(";")
            .map((entry) => entry.trim().split("="))
            .filter(([key, value]) => key && value)
    );
    const session = cookies[SESSION_COOKIE];
    if (!session) return false;

    const [expiresAt, signature] = session.split(".");
    if (!expiresAt || !signature || Number(expiresAt) <= Math.floor(Date.now() / 1000)) {
        return false;
    }
    return safeEqual(sign(expiresAt), signature);
}

export function json(data, status = 200, extraHeaders = {}) {
    return Response.json(data, {
        status,
        headers: {
            "Cache-Control": "no-store",
            "Content-Type": "application/json; charset=utf-8",
            "X-Content-Type-Options": "nosniff",
            ...extraHeaders
        }
    });
}
