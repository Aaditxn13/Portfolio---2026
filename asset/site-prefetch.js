/* ----------------------------------------------------------------------------
 * site-prefetch.js — Warm cache for case studies and other pages after home load.
 *
 * Runs only on the homepage (save-data / 2g skipped). After idle:
 *   1. Shared case-study JSON + editor script
 *   2. Hero / above-fold media parsed from each JSON
 *   3. HTML documents (project pages, play, about)
 *
 * Hover on a work card calls warmRoute() for that destination immediately.
 * ------------------------------------------------------------------------- */

(function () {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const ROUTES = {
        'project-1.html': { json: 'content/case-study-zapp-account.json' },
        'project-2.html': { json: 'content/case-study-growth-experiments.json' },
        'project-4.html': { json: 'content/case-study-now-and-me.json' },
        'play.html': {
            assets: [
                'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@24d40bbbdc0ce2d228e56d62f9fcdf03f396c502/asset/play-tab-assets/play_tut.png',
                'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@24d40bbbdc0ce2d228e56d62f9fcdf03f396c502/asset/play-tab-assets/play_Frame272.png',
                'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@24d40bbbdc0ce2d228e56d62f9fcdf03f396c502/asset/play-tab-assets/play_Turnip.png',
                'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@24d40bbbdc0ce2d228e56d62f9fcdf03f396c502/asset/play-tab-assets/play_36DaysofType.png',
                'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@24d40bbbdc0ce2d228e56d62f9fcdf03f396c502/asset/play-tab-assets/play_gradienttexture.jpg',
                'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@24d40bbbdc0ce2d228e56d62f9fcdf03f396c502/asset/play-tab-assets/play_Zakir.png',
                'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@24d40bbbdc0ce2d228e56d62f9fcdf03f396c502/asset/play-tab-assets/play_pixie.png',
                'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@24d40bbbdc0ce2d228e56d62f9fcdf03f396c502/asset/play-tab-assets/play_sero.png',
                'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@24d40bbbdc0ce2d228e56d62f9fcdf03f396c502/asset/play-tab-assets/play_Miracle_sticker.png',
                'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@24d40bbbdc0ce2d228e56d62f9fcdf03f396c502/asset/play-tab-assets/play_Iterate_sticker.png',
                'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@24d40bbbdc0ce2d228e56d62f9fcdf03f396c502/asset/play-tab-assets/play_Bored MAC_sticker.png',
                'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@24d40bbbdc0ce2d228e56d62f9fcdf03f396c502/asset/play-tab-assets/play_star_sticker.png',
                'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@24d40bbbdc0ce2d228e56d62f9fcdf03f396c502/asset/play-tab-assets/lemon.png'
            ]
        },
        'about.html': {
            assets: [
                'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@24d40bbbdc0ce2d228e56d62f9fcdf03f396c502/asset/me.avif',
                'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@24d40bbbdc0ce2d228e56d62f9fcdf03f396c502/asset/company-icons/zeta.png',
                'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@24d40bbbdc0ce2d228e56d62f9fcdf03f396c502/asset/about-more/travel.png'
            ]
        }
    };

    const SHARED = [
        'content/case-study-asset-manifest.json',
        'case-study-editor.js?v=inline-links-4'
    ];
    const HOME_WORK_MEDIA = [
        'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@24d40bbbdc0ce2d228e56d62f9fcdf03f396c502/asset/home-project-cards/grassland.jpg',
        'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@24d40bbbdc0ce2d228e56d62f9fcdf03f396c502/asset/home-project-cards/water.webp',
        'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@24d40bbbdc0ce2d228e56d62f9fcdf03f396c502/asset/home-project-cards/project-3-night-meadow-background.jpg',
        'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@24d40bbbdc0ce2d228e56d62f9fcdf03f396c502/asset/home-project-cards/project-4-green-background.jpg'
    ];
    const HOME_BEYOND_MEDIA = [
        'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@24d40bbbdc0ce2d228e56d62f9fcdf03f396c502/asset/beyond-pixels-icons/beyond-illustration-camera.png?v=beyond-illustrations-1',
        'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@24d40bbbdc0ce2d228e56d62f9fcdf03f396c502/asset/beyond-pixels-icons/beyond-illustration-film-roll.png?v=beyond-illustrations-1',
        'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@24d40bbbdc0ce2d228e56d62f9fcdf03f396c502/asset/beyond-pixels-icons/beyond-illustration-flower.png?v=beyond-illustrations-1',
        'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@24d40bbbdc0ce2d228e56d62f9fcdf03f396c502/asset/beyond-pixels-icons/beyond-illustration-notebook.png?v=beyond-illustrations-1'
    ];

    const OTHER_PAGES = ['play.html', 'about.html'];
    const CASE_PAGES = ['project-1.html', 'project-2.html', 'project-4.html'];
    const ALL_TABS = ['about.html', 'play.html', 'project-1.html', 'project-2.html', 'project-4.html'];
    const MANIFEST_PATH = 'content/case-study-asset-manifest.json';

    const prefetched = new Set();
    const queue = [];
    let draining = false;
    let manifestCache = null;

    function isHomePage() {
        const header = document.querySelector('[data-site-header][data-page="home"]');
        if (header) return true;
        const path = window.location.pathname || '';
        return path === '/' || path.endsWith('/index.html') || path.endsWith('/');
    }

    function shouldPrefetch() {
        if (!isHomePage()) return false;
        const conn = navigator.connection;
        if (conn && conn.saveData) return false;
        if (conn && /(^|-)2g$/.test(conn.effectiveType || '')) return false;
        return true;
    }

    function normalizeRoute(href) {
        if (!href) return '';
        try {
            const url = new URL(href, window.location.href);
            return url.pathname.split('/').pop() || '';
        } catch (_) {
            return String(href).replace(/^\//, '');
        }
    }

    function enqueue(task) {
        queue.push(task);
        if (!draining) drainQueue();
    }

    function delay(ms) {
        return new Promise((resolve) => window.setTimeout(resolve, ms));
    }

    async function drainQueue() {
        draining = true;
        while (queue.length) {
            const task = queue.shift();
            try {
                await task();
            } catch (_) { /* best-effort */ }
            await delay(120);
        }
        draining = false;
    }

    function linkPrefetch(href, as) {
        const key = `link:${href}`;
        if (!href || prefetched.has(key)) return;
        prefetched.add(key);
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = href;
        if (as) link.as = as;
        document.head.appendChild(link);
    }

    async function warmFetch(url) {
        const key = `fetch:${url}`;
        if (!url || prefetched.has(key)) return null;
        prefetched.add(key);
        try {
            const response = await fetch(url, { credentials: 'same-origin' });
            if (!response.ok) return null;
            if (url.endsWith('.json')) return response.json();
            return response;
        } catch (_) {
            prefetched.delete(key);
            return null;
        }
    }

    function resolveMediaSrc(src, manifest) {
        if (!src || typeof src !== 'string') return '';
        if (src.startsWith('cs-asset:')) return manifest?.[src] || '';
        if (typeof window !== 'undefined' && typeof window.resolveAssetUrl === 'function') {
            const resolved = window.resolveAssetUrl(src);
            if (resolved && resolved !== src) return resolved;
        }
        if (src.startsWith('/')) return src.replace(/^\//, '');
        return src;
    }

    function collectDocMediaPaths(doc, manifest, limit = 6) {
        const paths = [];
        const seen = new Set();

        function add(src) {
            const path = resolveMediaSrc(src, manifest);
            if (!path || seen.has(path)) return;
            seen.add(path);
            paths.push(path);
        }

        if (doc?.hero?.src) add(doc.hero.src);

        function visitBlock(block) {
            if (!block || paths.length >= limit) return;
            if (block.src) add(block.src);
            if (block.media) visitBlock(block.media);
            if (Array.isArray(block.items)) block.items.forEach(visitBlock);
            if (Array.isArray(block.columns)) {
                block.columns.forEach((col) => (col.blocks || []).forEach(visitBlock));
            }
        }

        (doc?.sections || []).some((section) => {
            (section.blocks || []).some((block) => {
                visitBlock(block);
                return paths.length >= limit;
            });
            return paths.length >= limit;
        });

        return paths;
    }

    function prefetchMediaPath(path) {
        if (!path) return;
        const as = /\.(mp4|webm|mov)(\?|$)/i.test(path) ? 'video' : 'image';
        linkPrefetch(path, as);
    }

    function warmImage(path) {
        const key = `img:${path}`;
        if (!path || prefetched.has(key)) return Promise.resolve();
        prefetched.add(key);
        return new Promise((resolve) => {
            const img = new Image();
            img.decoding = 'async';
            img.onload = img.onerror = () => resolve();
            img.src = path;
        });
    }

    function warmVideo(path) {
        const key = `video:${path}`;
        if (!path || prefetched.has(key)) return Promise.resolve();
        prefetched.add(key);
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.preload = 'auto';
            video.muted = true;
            video.playsInline = true;
            const done = () => resolve();
            video.onloadeddata = done;
            video.onerror = done;
            video.src = path;
            try { video.load(); } catch (_) { resolve(); }
        });
    }

    function warmMedia(path) {
        if (!path) return Promise.resolve();
        if (/\.(mp4|webm|mov)(\?|$)/i.test(path)) return warmVideo(path);
        return warmImage(path);
    }

    async function warmHomeWorkSection() {
        for (const path of HOME_WORK_MEDIA) {
            prefetchMediaPath(path);
            await warmMedia(path);
        }
    }

    async function warmHomeBeyondSection() {
        for (const path of HOME_BEYOND_MEDIA) {
            prefetchMediaPath(path);
            await warmMedia(path);
        }
    }

    async function ensureManifest() {
        if (manifestCache) return manifestCache;
        manifestCache = await warmFetch(MANIFEST_PATH);
        if (!manifestCache || typeof manifestCache !== 'object') manifestCache = {};
        return manifestCache;
    }

    async function warmCaseStudy(pageName, { priority = false } = {}) {
        const route = ROUTES[pageName];
        if (!route?.json) return;

        const run = async () => {
            const manifest = await ensureManifest();
            const doc = await warmFetch(route.json);
            if (doc) {
                const mediaPaths = collectDocMediaPaths(doc, manifest, priority ? 8 : 4);
                for (const path of mediaPaths) {
                    prefetchMediaPath(path);
                    await warmMedia(path);
                }
            }
            linkPrefetch(pageName, 'document');
        };

        if (priority) await run();
        else enqueue(run);
    }

    function warmRoute(href, { priority = false } = {}) {
        if (!shouldPrefetch() && !priority) return;
        const pageName = normalizeRoute(href);
        if (!pageName) return;

        const run = async () => {
            if (ROUTES[pageName]?.json) {
                await warmCaseStudy(pageName, { priority: true });
                return;
            }
            linkPrefetch(pageName, 'document');
            const assets = ROUTES[pageName]?.assets || [];
            assets.forEach((path) => prefetchMediaPath(path));
        };

        if (priority) {
            run();
            return;
        }
        enqueue(run);
    }

    function warmShared() {
        enqueue(async () => {
            await warmFetch(SHARED[0]);
            linkPrefetch(SHARED[1], 'script');
        });
    }

    function warmAllCaseStudies() {
        CASE_PAGES.forEach((page) => warmCaseStudy(page));
    }

    function warmOtherPages() {
        OTHER_PAGES.forEach((page) => {
            enqueue(async () => {
                linkPrefetch(page, 'document');
                const assets = ROUTES[page]?.assets || [];
                for (const path of assets) {
                    prefetchMediaPath(path);
                    await warmMedia(path);
                }
            });
        });
    }

    function warmAllTabDocuments() {
        ALL_TABS.forEach((page) => {
            enqueue(async () => {
                linkPrefetch(page, 'document');
                await warmFetch(page);
            });
        });
    }

    function warmSecondFoldCaseStudies() {
        CASE_PAGES.forEach((page) => {
            enqueue(() => warmCaseStudy(page, { priority: false }));
        });
    }

    function warmHeroDestinations() {
        enqueue(() => warmRoute('about.html', { priority: true }));
        enqueue(() => warmRoute('play.html', { priority: true }));
        CASE_PAGES.forEach((page) => {
            enqueue(() => warmRoute(page, { priority: true }));
        });
    }

    function boot() {
        if (!shouldPrefetch()) return;
        enqueue(() => warmHomeWorkSection());
        enqueue(() => warmHomeBeyondSection());
        warmAllTabDocuments();
        warmShared();
        warmHeroDestinations();
        warmSecondFoldCaseStudies();
        warmOtherPages();
    }

    function scheduleBoot() {
        if (!shouldPrefetch()) return;
        const run = () => boot();
        if (document.readyState === 'complete') {
            window.setTimeout(run, 180);
            return;
        }
        window.addEventListener('load', () => {
            window.setTimeout(run, 180);
        }, { once: true });
    }

    window.SitePrefetch = {
        boot,
        scheduleBoot,
        warmRoute,
        warmCaseStudy,
        linkPrefetch
    };

    scheduleBoot();
})();
