import { getStore } from "@netlify/blobs";
import { hasValidSession, isAnalyticsConfigured, json } from "../lib/analytics-auth.mjs";

const DAY = 86_400_000;
const VALID_RANGES = new Set([7, 30, 90, 365]);

function increment(map, key) {
    const label = key || "Unknown";
    map.set(label, (map.get(label) || 0) + 1);
}

function ranked(map, limit = 8) {
    return [...map.entries()]
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
        .slice(0, limit);
}

function pageLabel(path) {
    if (path === "/" || path === "/index.html") return "Home";
    if (path === "/about.html") return "About";
    if (path === "/play.html") return "Play";
    return path
        .replace(/^\//, "")
        .replace(/\.html$/, "")
        .replace(/-/g, " ")
        .replace(/\b\w/g, (character) => character.toUpperCase());
}

function referrerLabel(referrer) {
    if (!referrer || referrer === "Direct") return "Direct";
    return referrer.split("/")[0].replace(/^www\./, "");
}

async function readEvents(store, cutoff) {
    const { blobs } = await store.list({ prefix: "events/" });
    const relevant = blobs
        .filter(({ key }) => {
            const match = key.match(/^events\/(\d{4}-\d{2}-\d{2})\//);
            return match && new Date(`${match[1]}T23:59:59.999Z`).getTime() >= cutoff;
        })
        .slice(-15_000);

    const events = [];
    for (let index = 0; index < relevant.length; index += 100) {
        const batch = relevant.slice(index, index + 100);
        const values = await Promise.allSettled(
            batch.map(({ key }) => store.get(key, { type: "json" }))
        );
        values.forEach((result) => {
            if (
                result.status === "fulfilled" &&
                result.value &&
                new Date(result.value.timestamp).getTime() >= cutoff
            ) {
                events.push(result.value);
            }
        });
    }
    return events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

export function aggregate(events, days) {
    const pageViews = events.filter((event) => event.event === "page_view");
    const visitorIds = new Set(pageViews.map((event) => event.visitorId));
    const sessionIds = new Set(pageViews.map((event) => event.sessionId));
    const downloads = events.filter((event) => event.event === "resume_download");
    const engaged = new Set(
        events.filter((event) => event.event === "engaged_30s").map((event) => event.sessionId)
    );

    const pages = new Map();
    const referrers = new Map();
    const countries = new Map();
    const devices = new Map();
    const browsers = new Map();
    const timelineMap = new Map();
    const visitors = new Map();

    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - days + 1);
    for (let index = 0; index < days; index += 1) {
        const date = new Date(start.getTime() + index * DAY).toISOString().slice(0, 10);
        timelineMap.set(date, { date, views: 0, visitors: new Set(), downloads: 0 });
    }

    events.forEach((event) => {
        const date = String(event.timestamp).slice(0, 10);
        const day = timelineMap.get(date);
        if (day) {
            if (event.event === "page_view") {
                day.views += 1;
                day.visitors.add(event.visitorId);
            }
            if (event.event === "resume_download") day.downloads += 1;
        }

        if (event.event === "page_view") {
            increment(pages, pageLabel(event.path));
            increment(referrers, referrerLabel(event.referrer));
            increment(countries, event.country);
            increment(devices, event.device);
            increment(browsers, event.browser);
        }

        const current = visitors.get(event.visitorId) || {
            visitorId: event.visitorId,
            firstSeen: event.timestamp,
            lastSeen: event.timestamp,
            sessions: new Set(),
            pages: new Set(),
            pageViews: 0,
            country: event.country || "Unknown",
            city: event.city || "",
            device: event.device || "Unknown",
            browser: event.browser || "Unknown",
            referrer: referrerLabel(event.referrer),
            resumeDownloaded: false,
            engaged: false
        };
        if (new Date(event.timestamp) < new Date(current.firstSeen)) current.firstSeen = event.timestamp;
        if (new Date(event.timestamp) > new Date(current.lastSeen)) current.lastSeen = event.timestamp;
        current.sessions.add(event.sessionId);
        if (event.event === "page_view") {
            current.pages.add(pageLabel(event.path));
            current.pageViews += 1;
        }
        if (event.event === "resume_download") current.resumeDownloaded = true;
        if (event.event === "engaged_30s") current.engaged = true;
        visitors.set(event.visitorId, current);
    });

    const recentVisitors = [...visitors.values()]
        .sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen))
        .slice(0, 80)
        .map((visitor) => ({
            ...visitor,
            visitorId: visitor.visitorId.slice(0, 8),
            sessions: visitor.sessions.size,
            pages: [...visitor.pages]
        }));

    return {
        generatedAt: new Date().toISOString(),
        range: days,
        metrics: {
            visitors: visitorIds.size,
            sessions: sessionIds.size,
            pageViews: pageViews.length,
            resumeDownloads: downloads.length,
            downloadRate: visitorIds.size
                ? Number(((new Set(downloads.map((event) => event.visitorId)).size / visitorIds.size) * 100).toFixed(1))
                : 0,
            engagedSessions: engaged.size
        },
        timeline: [...timelineMap.values()].map((day) => ({
            date: day.date,
            views: day.views,
            visitors: day.visitors.size,
            downloads: day.downloads
        })),
        topPages: ranked(pages),
        referrers: ranked(referrers),
        countries: ranked(countries),
        devices: ranked(devices, 4),
        browsers: ranked(browsers, 6),
        recentVisitors
    };
}

export default async function handler(request) {
    if (request.method !== "GET") {
        return json({ error: "Method not allowed." }, 405, { Allow: "GET" });
    }
    if (!isAnalyticsConfigured()) {
        return json({ error: "Analytics is not configured.", code: "NOT_CONFIGURED" }, 503);
    }
    if (!hasValidSession(request)) {
        return json({ error: "Authentication required.", code: "UNAUTHORIZED" }, 401);
    }

    const url = new URL(request.url);
    const requestedDays = Number(url.searchParams.get("days") || 30);
    const days = VALID_RANGES.has(requestedDays) ? requestedDays : 30;
    const cutoffDate = new Date();
    cutoffDate.setUTCHours(0, 0, 0, 0);
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - days + 1);

    try {
        const store = getStore("portfolio-analytics");
        const events = await readEvents(store, cutoffDate.getTime());
        return json(aggregate(events, days));
    } catch (error) {
        console.error("Analytics read failed", error);
        return json({ error: "Analytics data could not be loaded." }, 503);
    }
}

export const config = {
    path: "/api/analytics",
    rateLimit: {
        windowLimit: 60,
        windowSize: 60,
        aggregateBy: ["ip", "domain"]
    }
};
