import { randomUUID } from "node:crypto";
import { getStore } from "@netlify/blobs";

const ALLOWED_EVENTS = new Set([
    "page_view",
    "resume_open",
    "resume_download",
    "project_open",
    "outbound_click",
    "contact_click",
    "engaged_30s",
    "scroll_depth"
]);

const BOT_PATTERN = /bot|crawler|spider|headless|preview|facebookexternalhit|slurp/i;

function cleanText(value, maxLength = 180) {
    if (typeof value !== "string") return "";
    return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maxLength);
}

function cleanPath(value) {
    const path = cleanText(value, 220);
    if (!path.startsWith("/") || path.startsWith("//")) return "/";
    return path.split("?")[0].split("#")[0] || "/";
}

function cleanId(value) {
    const id = cleanText(value, 80);
    return /^[a-zA-Z0-9_-]{8,80}$/.test(id) ? id : "";
}

function classifyDevice(userAgent) {
    if (/ipad|tablet|kindle/i.test(userAgent)) return "Tablet";
    if (/mobile|iphone|android/i.test(userAgent)) return "Mobile";
    return "Desktop";
}

function classifyBrowser(userAgent) {
    if (/edg\//i.test(userAgent)) return "Edge";
    if (/firefox\//i.test(userAgent)) return "Firefox";
    if (/chrome\//i.test(userAgent) && !/edg\//i.test(userAgent)) return "Chrome";
    if (/safari\//i.test(userAgent) && !/chrome\//i.test(userAgent)) return "Safari";
    return "Other";
}

function safeReferrer(value) {
    const referrer = cleanText(value, 320);
    if (!referrer) return "Direct";
    try {
        const url = new URL(referrer);
        return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`.slice(0, 180);
    } catch {
        return "Direct";
    }
}

export default async function handler(request, context) {
    if (request.method !== "POST") {
        return new Response(null, {
            status: 405,
            headers: { Allow: "POST", "Cache-Control": "no-store" }
        });
    }

    const userAgent = cleanText(request.headers.get("user-agent") || "", 320);
    if (!userAgent || BOT_PATTERN.test(userAgent)) {
        return new Response(null, { status: 204 });
    }

    let payload;
    try {
        const raw = await request.text();
        if (raw.length > 12_000) throw new Error("Payload too large");
        payload = JSON.parse(raw);
    } catch {
        return Response.json({ error: "Invalid event." }, { status: 400 });
    }

    const eventName = cleanText(payload?.event, 40);
    const visitorId = cleanId(payload?.visitorId);
    const sessionId = cleanId(payload?.sessionId);
    if (!ALLOWED_EVENTS.has(eventName) || !visitorId || !sessionId) {
        return Response.json({ error: "Invalid event." }, { status: 400 });
    }

    const now = new Date();
    const event = {
        id: randomUUID(),
        event: eventName,
        timestamp: now.toISOString(),
        visitorId,
        sessionId,
        path: cleanPath(payload?.path),
        title: cleanText(payload?.title, 140),
        referrer: safeReferrer(payload?.referrer),
        target: cleanText(payload?.target, 220),
        value: Number.isFinite(Number(payload?.value))
            ? Math.max(0, Math.min(100, Number(payload.value)))
            : null,
        device: classifyDevice(userAgent),
        browser: classifyBrowser(userAgent),
        country: cleanText(context?.geo?.country?.name || "Unknown", 80),
        countryCode: cleanText(context?.geo?.country?.code || "", 4),
        city: cleanText(context?.geo?.city || "", 80)
    };

    const store = getStore("portfolio-analytics");
    const date = event.timestamp.slice(0, 10);
    const key = `events/${date}/${event.timestamp.replace(/[:.]/g, "-")}-${event.id}.json`;

    try {
        await store.setJSON(key, event, {
            metadata: {
                event: event.event,
                timestamp: event.timestamp
            }
        });
    } catch (error) {
        console.error("Analytics write failed", error);
        return Response.json({ error: "Event could not be stored." }, { status: 503 });
    }

    return new Response(null, {
        status: 204,
        headers: {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff"
        }
    });
}

export const config = {
    path: "/api/analytics/track",
    rateLimit: {
        windowLimit: 40,
        windowSize: 60,
        aggregateBy: ["ip", "domain"]
    }
};
