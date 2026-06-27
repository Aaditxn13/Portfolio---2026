(function () {
    'use strict';

    // --- Asset hosting --------------------------------------------------
    // Assets live on the gh-pages branch of Aaditxn13/Portfolio---2026 and
    // are served by two CDNs in parallel:
    //
    //   * jsDelivr (pinned to the exact gh-pages commit) for small/medium
    //     assets (images, svgs, audio, fonts). jsDelivr returns an immutable
    //     1-year cache on commit-hash URLs, so once a visitor loads an asset
    //     once it is effectively free forever.
    //
    //   * GitHub Pages for video files (mp4/webm/mov), because GH Pages is
    //     fronted by Fastly anycast and delivers large media faster than
    //     jsDelivr for cold/uncached requests.
    //
    // The ASSETS_PINNED_COMMIT below is auto-bumped by
    // scripts/sync-assets-to-gh-pages.sh after each push. Do not edit by
    // hand. Override either base by setting window.ASSET_BASE_URL or
    // window.VIDEO_BASE_URL before this script loads.

    var ASSETS_PINNED_COMMIT = 'd2f6b942877dab0806fa2bd743ef0e69a5c721ef'; // AUTO-BUMPED
    var GH_REPO = 'Aaditxn13/Portfolio---2026';

    if (!window.ASSET_BASE_URL) {
        window.ASSET_BASE_URL =
            'https://cdn.jsdelivr.net/gh/' + GH_REPO + '@' + ASSETS_PINNED_COMMIT + '/';
    }
    if (!window.VIDEO_BASE_URL) {
        window.VIDEO_BASE_URL = 'https://aaditxn13.github.io/Portfolio---2026/';
    }
    window.ASSET_VIDEO_EXTENSIONS = window.ASSET_VIDEO_EXTENSIONS || ['mp4', 'webm', 'mov', 'm4v'];

    // Pick the right CDN for a given asset path based on its extension.
    // Exposed globally so resolvers in other scripts (site-prefetch.js,
    // case-study-editor.js, script.js) share the same logic.
    window.resolveAssetUrl = function (src) {
        if (typeof src !== 'string' || !src) return src;
        var stripped = src.replace(/^\//, '');
        if (!/^asset\//.test(stripped)) return src;
        var queryIdx = stripped.indexOf('?');
        var pathOnly = queryIdx === -1 ? stripped : stripped.slice(0, queryIdx);
        var match = /\.([a-z0-9]+)$/i.exec(pathOnly);
        var ext = match ? match[1].toLowerCase() : '';
        var base = window.ASSET_VIDEO_EXTENSIONS.indexOf(ext) !== -1
            ? window.VIDEO_BASE_URL
            : window.ASSET_BASE_URL;
        return base + stripped;
    };

    try {
        var raw = sessionStorage.getItem('cs-fade');
        if (raw) {
            var data = JSON.parse(raw);
            if (data && Date.now() - data.ts <= 4000) {
                sessionStorage.removeItem('cs-fade');
                document.documentElement.classList.add('cs-incoming');
                var theme = localStorage.getItem('portfolio-theme');
                document.documentElement.style.backgroundColor =
                    theme === 'dark' ? '#0d0d0d' : '#fcfbf9';
            }
        }
    } catch (_) { /* private mode */ }

    function forcePageReveal() {
        var root = document.documentElement;
        var body = document.body;
        if (!body) return;

        var loader = document.getElementById('portfolio-loader');
        var loaderStuck = loader && !loader.classList.contains('portfolio-loader--done');
        var incomingStuck = root.classList.contains('cs-incoming');

        if (!loaderStuck && !incomingStuck) return;

        root.classList.remove('cs-incoming');
        root.style.backgroundColor = '';
        body.classList.remove('portfolio-loader-active');

        if (loader && loaderStuck) {
            loader.classList.add('portfolio-loader--done');
            loader.setAttribute('aria-hidden', 'true');
            loader.setAttribute('aria-busy', 'false');
            window.setTimeout(function () {
                if (loader.parentNode) loader.parentNode.removeChild(loader);
            }, 500);
        }

        Array.prototype.forEach.call(body.children, function (el) {
            if (el.id === 'portfolio-loader') return;
            el.style.opacity = '';
            el.style.visibility = '';
        });

        try {
            window.dispatchEvent(new CustomEvent('portfolio:failsafe-reveal'));
        } catch (_) { /* old browsers */ }
    }

    window.__portfolioForceReveal = forcePageReveal;

    function scheduleFailsafe() {
        window.setTimeout(forcePageReveal, 2500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scheduleFailsafe, { once: true });
    } else {
        scheduleFailsafe();
    }
})();
