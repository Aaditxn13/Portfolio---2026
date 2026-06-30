/* ----------------------------------------------------------------------------
 * lazy-load.js — Site-wide lazy loading for backgrounds, images, and scripts.
 *
 * - [data-lazy-bg]     → background-image when near viewport
 * - img[data-src]      → src swap when near viewport
 * - Hero shaders load after idle (THREE + dappled-light + leaf-fall)
 * ------------------------------------------------------------------------- */

(function () {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const ROOT_MARGIN = '320px 0px';
    const THRESHOLD = 0.01;
    const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
    const CURRENT_PAGE_WARM_LIMIT = 14;
    const CURRENT_PAGE_WARM_CONCURRENCY = 3;

    function escapeCssUrl(url) {
        return String(url).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    function applyLazyBg(el) {
        const url = el.getAttribute('data-lazy-bg');
        if (!url || el.dataset.lazyLoaded === 'true') return;
        const resolved = resolveLazySrc(url);
        el.style.backgroundImage = `url('${escapeCssUrl(resolved)}')`;
        el.dataset.lazyLoaded = 'true';
        el.dispatchEvent(new CustomEvent('lazy-bg-loaded', {
            bubbles: true,
            detail: { url: resolved }
        }));
    }

    function resolveLazySrc(src) {
        if (typeof window.resolveAssetUrl === 'function') {
            return window.resolveAssetUrl(src);
        }
        return src;
    }

    function applyLazyImg(el) {
        const src = el.getAttribute('data-src');
        if (!src || el.dataset.lazyLoaded === 'true') return;
        el.src = resolveLazySrc(src);
        el.removeAttribute('data-src');
        el.dataset.lazyLoaded = 'true';
    }

    function shouldWarmCurrentPage() {
        const conn = navigator.connection;
        if (conn && conn.saveData) return false;
        if (conn && /(^|-)2g$/.test(conn.effectiveType || '')) return false;
        return true;
    }

    function isNearViewport(el, extra = 320) {
        if (!el || typeof el.getBoundingClientRect !== 'function') return false;
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight || document.documentElement.clientHeight || 0;
        return rect.top < vh + extra && rect.bottom > -extra;
    }

    function collectCurrentPageWarmTargets(limit = CURRENT_PAGE_WARM_LIMIT) {
        const targets = [];
        const seen = new Set();

        function push(type, el, src) {
            if (!src || seen.has(src)) return;
            if (isNearViewport(el)) return;
            seen.add(src);
            targets.push({ type, el, src });
        }

        document.querySelectorAll('[data-lazy-bg]:not([data-lazy-loaded])').forEach((el) => {
            push('bg', el, el.getAttribute('data-lazy-bg'));
        });

        document.querySelectorAll('img[data-src]:not([data-lazy-loaded])').forEach((el) => {
            push('img', el, resolveLazySrc(el.getAttribute('data-src')));
        });

        return targets.slice(0, limit);
    }

    function warmImageSrc(src) {
        return new Promise((resolve) => {
            const img = new Image();
            img.decoding = 'async';
            img.onload = img.onerror = () => resolve();
            img.src = src;
        });
    }

    async function drainWarmQueue(items, concurrency = CURRENT_PAGE_WARM_CONCURRENCY) {
        if (!items.length) return;
        let index = 0;
        async function worker() {
            while (index < items.length) {
                const current = items[index++];
                await warmImageSrc(current.src);
            }
        }
        await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    }

    function warmCurrentPageDeferredAssets() {
        if (!shouldWarmCurrentPage()) return;
        const items = collectCurrentPageWarmTargets();
        if (!items.length) return;
        drainWarmQueue(items).catch(() => { /* best effort */ });
    }

    function observeTarget(el, io) {
        if (!el || el.dataset.lazyLoaded === 'true') return;
        if (!io) {
            if (el.hasAttribute('data-lazy-bg')) applyLazyBg(el);
            else if (el.hasAttribute('data-src')) applyLazyImg(el);
            return;
        }
        io.observe(el);
    }

    const io = typeof IntersectionObserver === 'function'
        ? new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                const el = entry.target;
                if (el.hasAttribute('data-lazy-bg')) applyLazyBg(el);
                else if (el.hasAttribute('data-src')) applyLazyImg(el);
                io.unobserve(el);
            });
        }, { rootMargin: ROOT_MARGIN, threshold: THRESHOLD })
        : null;

    function scan(root) {
        const scope = root && root.querySelectorAll ? root : document;
        scope.querySelectorAll('[data-lazy-bg]:not([data-lazy-loaded])').forEach((el) => observeTarget(el, io));
        scope.querySelectorAll('img[data-src]:not([data-lazy-loaded])').forEach((el) => observeTarget(el, io));
    }

    let threePromise = null;

    function loadThreeJs() {
        if (typeof THREE !== 'undefined') return Promise.resolve();
        if (threePromise) return threePromise;
        threePromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = THREE_URL;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => {
                threePromise = null;
                reject(new Error('THREE failed to load'));
            };
            document.head.appendChild(script);
        });
        return threePromise;
    }

    const loadedScripts = new Set();

    function loadScript(src) {
        if (!src || loadedScripts.has(src)) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.defer = true;
            script.onload = () => {
                loadedScripts.add(src);
                resolve();
            };
            script.onerror = () => reject(new Error(`Script failed: ${src}`));
            document.body.appendChild(script);
        });
    }

    let heroBootStarted = false;

    function bootHeroEffects() {
        if (heroBootStarted || !document.getElementById('hero-dappled-canvas')) return Promise.resolve();
        heroBootStarted = true;
        return loadThreeJs()
            .then(() => Promise.all([
                loadScript('asset/dappled-light-shader.js?v=first-load-2'),
                loadScript('asset/leaf-fall.js')
            ]))
            .catch(() => { /* hero effects are decorative */ });
    }

    function scheduleHeroEffects() {
        if (!document.getElementById('hero-dappled-canvas')) return;

        const run = () => { bootHeroEffects(); };

        if (typeof IntersectionObserver === 'function') {
            const canvas = document.getElementById('hero-dappled-canvas');
            const heroIo = new IntersectionObserver((entries) => {
                if (!entries.some((entry) => entry.isIntersecting)) return;
                heroIo.disconnect();
                run();
            }, { rootMargin: '0px', threshold: 0 });
            heroIo.observe(canvas);
        }

        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(run, { timeout: 900 });
        } else {
            window.setTimeout(run, 500);
        }
    }

    function onReady() {
        scan(document);
        scheduleHeroEffects();
        const warm = () => scheduleIdleTask(() => warmCurrentPageDeferredAssets(), 1800);
        if (document.readyState === 'complete') {
            warm();
        } else {
            window.addEventListener('load', warm, { once: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onReady, { once: true });
    } else {
        onReady();
    }

    if (typeof MutationObserver === 'function') {
        const mo = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType !== 1) return;
                    if (node.matches?.('[data-lazy-bg],[data-src]')) observeTarget(node, io);
                    if (node.querySelectorAll) scan(node);
                });
            });
        });
        mo.observe(document.documentElement, { childList: true, subtree: true });
    }

    window.PortfolioLazyLoad = {
        applyLazyBg,
        applyLazyImg,
        observe: (el) => observeTarget(el, io),
        scan,
        loadThreeJs,
        bootHeroEffects
    };
})();
