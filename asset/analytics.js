(function portfolioAnalytics() {
    "use strict";

    if (
        window.location.protocol === "file:" ||
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1" ||
        navigator.doNotTrack === "1" ||
        navigator.globalPrivacyControl === true
    ) {
        return;
    }

    var VISITOR_KEY = "as_analytics_visitor";
    var SESSION_KEY = "as_analytics_session";
    var ENDPOINT = "/api/analytics/track";
    var sentEvents = new Set();

    function randomId(prefix) {
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
            return prefix + "_" + window.crypto.randomUUID().replace(/-/g, "");
        }
        return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 14);
    }

    function storedId(storage, key, prefix) {
        try {
            var existing = storage.getItem(key);
            if (existing) return existing;
            var created = randomId(prefix);
            storage.setItem(key, created);
            return created;
        } catch (_) {
            return randomId(prefix);
        }
    }

    var visitorId = storedId(window.localStorage, VISITOR_KEY, "v");
    var sessionId = storedId(window.sessionStorage, SESSION_KEY, "s");

    function currentReferrer() {
        if (!document.referrer) return "";
        try {
            var url = new URL(document.referrer);
            if (url.hostname === window.location.hostname) return "";
            return url.origin + url.pathname;
        } catch (_) {
            return "";
        }
    }

    function send(event, details, onceKey) {
        if (onceKey && sentEvents.has(onceKey)) return;
        if (onceKey) sentEvents.add(onceKey);

        var payload = JSON.stringify(Object.assign({
            event: event,
            visitorId: visitorId,
            sessionId: sessionId,
            path: window.location.pathname,
            title: document.title,
            referrer: currentReferrer()
        }, details || {}));

        if (navigator.sendBeacon) {
            var blob = new Blob([payload], { type: "application/json" });
            if (navigator.sendBeacon(ENDPOINT, blob)) return;
        }

        fetch(ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: true,
            credentials: "same-origin"
        }).catch(function () {
            /* Analytics must never interrupt the portfolio experience. */
        });
    }

    send("page_view", null, "page_view");

    document.addEventListener("click", function (event) {
        var anchor = event.target.closest("a");
        var projectCard = event.target.closest("[data-link]");

        if (projectCard && !anchor) {
            send("project_open", {
                target: projectCard.getAttribute("data-link") || projectCard.getAttribute("data-title") || ""
            });
            return;
        }

        if (!anchor) return;
        var href = anchor.getAttribute("href") || "";
        var label = (anchor.getAttribute("aria-label") || anchor.textContent || "").trim();

        if (anchor.hasAttribute("data-resume-trigger")) {
            send("resume_open", { target: href });
            return;
        }
        if (anchor.hasAttribute("download") || /Aditya_Sadhukhan_Resume\.pdf/i.test(href)) {
            send("resume_download", { target: href });
            return;
        }
        if (/mailto:|contact/i.test(href + " " + label)) {
            send("contact_click", { target: href });
            return;
        }

        try {
            var target = new URL(anchor.href, window.location.href);
            if (target.origin !== window.location.origin && /^https?:$/.test(target.protocol)) {
                send("outbound_click", { target: target.hostname });
            }
        } catch (_) {
            /* Ignore malformed links. */
        }
    }, { passive: true });

    window.setTimeout(function () {
        if (document.visibilityState === "visible") {
            send("engaged_30s", null, "engaged_30s");
        }
    }, 30_000);

    var depthSent = { 50: false, 90: false };
    function recordScrollDepth() {
        var scrollable = document.documentElement.scrollHeight - window.innerHeight;
        if (scrollable <= 0) return;
        var depth = Math.round((window.scrollY / scrollable) * 100);
        [50, 90].forEach(function (threshold) {
            if (depth >= threshold && !depthSent[threshold]) {
                depthSent[threshold] = true;
                send("scroll_depth", { value: threshold }, "scroll_" + threshold);
            }
        });
        if (depthSent[50] && depthSent[90]) {
            window.removeEventListener("scroll", recordScrollDepth);
        }
    }
    window.addEventListener("scroll", recordScrollDepth, { passive: true });
})();
