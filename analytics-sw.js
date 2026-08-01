"use strict";

var CACHE_NAME = "portfolio-pulse-shell-v2";
var APP_SHELL = [
    "/analytics",
    "/analytics.html",
    "/analytics.css?v=analytics-pwa-2",
    "/analytics-dashboard.js?v=analytics-pwa-2",
    "/analytics.webmanifest",
    "/asset/pwa/icon-192.png",
    "/asset/pwa/icon-512.png",
    "/asset/pwa/apple-touch-icon.png"
];

self.addEventListener("install", function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function (cache) { return cache.addAll(APP_SHELL); })
            .then(function () { return self.skipWaiting(); })
    );
});

self.addEventListener("activate", function (event) {
    event.waitUntil(
        caches.keys()
            .then(function (keys) {
                return Promise.all(keys.map(function (key) {
                    if (key !== CACHE_NAME && key.indexOf("portfolio-pulse-shell-") === 0) {
                        return caches.delete(key);
                    }
                    return undefined;
                }));
            })
            .then(function () { return self.clients.claim(); })
    );
});

self.addEventListener("fetch", function (event) {
    var request = event.request;
    if (request.method !== "GET") return;

    var url = new URL(request.url);
    if (url.origin !== self.location.origin || url.pathname.indexOf("/api/") === 0) {
        return;
    }

    var isAnalyticsNavigation =
        request.mode === "navigate" &&
        (url.pathname === "/analytics" || url.pathname === "/analytics.html");
    var isAppAsset = APP_SHELL.some(function (asset) {
        var assetUrl = new URL(asset, self.location.origin);
        return assetUrl.pathname === url.pathname;
    });

    if (isAnalyticsNavigation) {
        event.respondWith(
            fetch(request).catch(function () {
                return caches.match("/analytics.html");
            })
        );
        return;
    }

    if (isAppAsset) {
        event.respondWith(
            caches.match(request, { ignoreSearch: true }).then(function (cached) {
                if (cached) return cached;
                return fetch(request).then(function (response) {
                    if (!response || !response.ok) return response;
                    var copy = response.clone();
                    caches.open(CACHE_NAME).then(function (cache) {
                        cache.put(request, copy);
                    });
                    return response;
                });
            })
        );
    }
});
