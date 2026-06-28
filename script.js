const THEME_STORAGE_KEY = 'portfolio-theme';

function applyStoredTheme() {
    try {
        if (localStorage.getItem(THEME_STORAGE_KEY) === 'dark') {
            document.body.classList.add('night-mode');
        } else {
            document.body.classList.remove('night-mode');
        }
    } catch (_) {
        /* ignore private mode / blocked storage */
    }
}

applyStoredTheme();

const FOOTER_GRASS_IFRAME_SRCS = {
    light: 'https://aaditxn13.github.io/Portfolio---2026/asset/grass-footer-app/dist/index.html',
    dark: 'https://aaditxn13.github.io/Portfolio---2026/asset/grass-footer-dark-app/dist/index.html'
};

function getCurrentThemeName() {
    return document.body.classList.contains('night-mode') ? 'dark' : 'light';
}

let portfolioReady = false;
const portfolioReadyQueue = [];

function signalPortfolioReady() {
    if (portfolioReady) return;
    portfolioReady = true;
    window.dispatchEvent(new CustomEvent('portfolio:ready'));
    while (portfolioReadyQueue.length) {
        const fn = portfolioReadyQueue.shift();
        try { fn(); } catch (_) { /* non-critical */ }
    }
}

function onPortfolioReady(fn) {
    if (portfolioReady) fn();
    else portfolioReadyQueue.push(fn);
}

let gsapPromise = null;

function loadGsap() {
    if (typeof window.gsap !== 'undefined') return Promise.resolve(window.gsap);
    if (gsapPromise) return gsapPromise;
    gsapPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.7/gsap.min.js';
        script.async = true;
        script.onload = () => resolve(window.gsap);
        script.onerror = () => {
            gsapPromise = null;
            reject(new Error('GSAP failed to load'));
        };
        document.head.appendChild(script);
    });
    return gsapPromise;
}

function scheduleIdleTask(fn, timeout = 1500) {
    if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(fn, { timeout });
    } else {
        window.setTimeout(fn, Math.min(timeout, 800));
    }
}

function isLocalDevHost() {
    const { hostname, protocol } = window.location;
    return protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1');
}

function scheduleDeferredSiteScripts() {
    scheduleSitePrefetch();

    if (!document.getElementById('ambient-leaves')) return;

    const loadAmbient = () => {
        if (document.querySelector('script[data-ambient-audio]')) return;
        const script = document.createElement('script');
        script.src = 'asset/ambient-audio.js';
        script.defer = true;
        script.dataset.ambientAudio = 'true';
        document.body.appendChild(script);
    };

    if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(loadAmbient, { timeout: 4000 });
    } else {
        window.setTimeout(loadAmbient, 2000);
    }
}

window.addEventListener('portfolio:failsafe-reveal', function () {
    scheduleDeferredSiteScripts();
    signalPortfolioReady();
}, { once: true });

function scheduleSitePrefetch() {
    const isHome = document.querySelector('[data-site-header][data-page="home"]');
    if (!isHome) return;

    const loadPrefetch = () => {
        if (document.querySelector('script[data-site-prefetch]')) return;
        const script = document.createElement('script');
        script.src = 'asset/site-prefetch.js?v=cdn-debug-1';
        script.defer = true;
        script.dataset.sitePrefetch = 'true';
        document.body.appendChild(script);
    };

    if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(loadPrefetch, { timeout: 2500 });
    } else {
        window.setTimeout(loadPrefetch, 1200);
    }
}

function prefetchRouteOnIntent(href) {
    if (!href) return;
    if (window.SitePrefetch?.warmRoute) {
        window.SitePrefetch.warmRoute(href, { priority: true });
        return;
    }
    const page = href.replace(/^\//, '');
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'document';
    link.href = page;
    document.head.appendChild(link);
}

function bindNavRoutePrefetch() {
    if (!document.querySelector('[data-site-header][data-page="home"]')) return;
    document.querySelectorAll('.nav-item[href$=".html"]').forEach((anchor) => {
        const href = anchor.getAttribute('href');
        if (!href || href.includes('contact')) return;
        anchor.addEventListener('mouseenter', () => prefetchRouteOnIntent(href), { passive: true });
        anchor.addEventListener('focus', () => prefetchRouteOnIntent(href), { passive: true });
    });
}

function ensureFooterGrassBaseLoaded(theme = getCurrentThemeName()) {
    const selector = theme === 'dark'
        ? '.footer-grass-scene__base--dark'
        : '.footer-grass-scene__base--light';
    document.querySelectorAll(selector).forEach((img) => {
        window.PortfolioLazyLoad?.applyLazyImg(img);
    });
}

(function initPortfolioLoader() {
    const el = document.getElementById('portfolio-loader');
    if (!el || !document.body) return;

    const LOADER_SEEN_KEY = 'portfolio-loader-seen';

    function skipLoaderInstantly() {
        el.classList.add('portfolio-loader--done');
        document.body.classList.remove('portfolio-loader-active');
        el.setAttribute('aria-hidden', 'true');
        el.setAttribute('aria-busy', 'false');
        if (el.parentNode) el.parentNode.removeChild(el);
        scheduleDeferredSiteScripts();
    }

    try {
        if (sessionStorage.getItem(LOADER_SEEN_KEY) === '1') {
            skipLoaderInstantly();
            return;
        }
    } catch (_) { /* private mode */ }

    const prefersReducedMotion =
        window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const orbitEl = el.querySelector('.portfolio-loader__orbit');

    /** One continuous ∞ chase; hue cycle still reads from nth-child CSS.
     * DOM holds extra squares; animation only renders a short comet that grows in. */
    const TRAIL_PIXEL_COUNT = 22;
    /** How many pastel squares form the visible “snake” (rest stay hidden). */
    const MAX_COMET_SEGMENTS = 10;
    /** Param-gap between neighbouring squares on the ∞ (controls comet arc length). */
    const COMET_PARAM_STEP = 0.098;
    /** First fraction of each loop: reveal 1→MAX_COMET so the trail builds in order. */
    const LOOP_TRAIL_BUILD_FRACTION = 0.28;
    /** Last fraction: shorten tail → 1 leader so the cycle restarts cleanly. */
    const LOOP_TRAIL_TAPER_FRACTION = 0.12;
    /** τ = π places the leader on the left lobe; rising τ advances along the curve. */
    const PATH_START_ANGLE = Math.PI;

    function ensureTrailPixels(root) {
        if (!root) return [];
        while (root.querySelectorAll('.portfolio-loader__pixel').length < TRAIL_PIXEL_COUNT) {
            const span = document.createElement('span');
            span.className = 'portfolio-loader__pixel';
            span.setAttribute('aria-hidden', 'true');
            root.appendChild(span);
        }
        return Array.from(root.querySelectorAll('.portfolio-loader__pixel')).slice(0, TRAIL_PIXEL_COUNT);
    }

    const pixels = ensureTrailPixels(orbitEl);

    document.body.classList.add('portfolio-loader-active');

    function gridCellPx() {
        const rootStyle = getComputedStyle(document.documentElement);
        const u = parseFloat(rootStyle.getPropertyValue('--grid-unit')) || 30;
        const s = parseFloat(rootStyle.getPropertyValue('--grid-scale')) || 1;
        return u * s;
    }

    function infinityXY(tau, cx, cy, amplitude) {
        const sin = Math.sin(tau);
        const cos = Math.cos(tau);
        const denom = 1 + sin * sin;
        const scaleFactor = Math.SQRT2 * amplitude / denom;
        return {
            x: cx + scaleFactor * cos,
            y: cy + scaleFactor * sin * cos
        };
    }

    function pixelHalf(px) {
        const wPx = px.offsetWidth
            || parseFloat(getComputedStyle(px).width)
            || 0;
        if (wPx > 4) return wPx * 0.5;
        return gridCellPx() * 0.85;
    }

    function wrapAngle(a) {
        const TPI = Math.PI * 2;
        let x = a % TPI;
        if (x < 0) x += TPI;
        return x;
    }

    function trailOpacity(idx, activeBehindHead) {
        if (activeBehindHead <= 1) return 1;
        return 1 - (0.52 * idx) / (activeBehindHead - 1);
    }

    let rafId = 0;
    let animationGen = 0;

    function fontsReadyPromise() {
        if (document.fonts && document.fonts.ready) {
            return Promise.race([
                document.fonts.ready.then(() => {}).catch(() => {}),
                new Promise(resolve => window.setTimeout(resolve, 150))
            ]);
        }
        return Promise.resolve();
    }

    function windowLoadPromise() {
        if (document.readyState === 'complete') return Promise.resolve();
        return new Promise(resolve =>
            window.addEventListener('load', () => resolve(), { once: true })
        );
    }

    function domReadyPromise() {
        if (document.readyState !== 'loading') return Promise.resolve();
        return new Promise(resolve =>
            document.addEventListener('DOMContentLoaded', () => resolve(), { once: true })
        );
    }

    function imgReady(img) {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise(resolve => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
        });
    }

    function iframeReady(fr) {
        if (!fr.getAttribute('src')) return Promise.resolve();
        return new Promise(resolve => {
            let done = false;
            function once() {
                if (done) return;
                done = true;
                resolve();
            }
            fr.addEventListener('load', once, { once: true });
            window.setTimeout(once, 15000);
            try {
                if (fr.contentDocument && fr.contentDocument.readyState === 'complete') once();
            } catch (_) { /* cross-origin iframe */ }
        });
    }

    function mediaElmReady(media) {
        if (media.readyState >= 3) return Promise.resolve();
        const hasSrc = !!(media.getAttribute && media.getAttribute('src'));
        const hasSource = media.querySelector && media.querySelector('source[src]');
        if (!hasSrc && !hasSource) return Promise.resolve();
        return new Promise(resolve => {
            media.addEventListener('canplaythrough', resolve, { once: true });
            media.addEventListener('loadeddata', resolve, { once: true });
            media.addEventListener('error', resolve, { once: true });
            window.setTimeout(resolve, 12000);
        });
    }

    function shouldBlockLoader(el) {
        if (!el) return false;
        if (el.getAttribute && el.getAttribute('data-loader-skip') === 'true') return false;
        if (el.getAttribute && el.getAttribute('loading') === 'lazy') return false;
        return true;
    }

    function gatherAssetWaits() {
        return Promise.all([
            domReadyPromise(),
            fontsReadyPromise()
        ]);
    }

    function idleFrame() {
        return new Promise(resolve => {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
    }

    function startInfinityLoop() {
        if (!orbitEl || pixels.length === 0) return;

        const TPI = Math.PI * 2;

        if (prefersReducedMotion) {
            const w = orbitEl.clientWidth || 400;
            const h = orbitEl.clientHeight || 260;
            const cx = w / 2;
            const cy = h / 2;
            const amplitude = Math.min(w, h) * 0.36;
            pixels.forEach((px, idx) => {
                if (idx >= MAX_COMET_SEGMENTS) {
                    px.style.opacity = '0';
                    px.style.visibility = 'hidden';
                    return;
                }
                const tau = wrapAngle(PATH_START_ANGLE + idx * COMET_PARAM_STEP);
                const p = infinityXY(tau, cx, cy, amplitude);
                const halfPx = pixelHalf(px);
                px.style.visibility = 'visible';
                px.style.transform =
                    `translate3d(${p.x - halfPx}px, ${p.y - halfPx}px, 0)`;
                px.style.opacity =
                    String(trailOpacity(idx, MAX_COMET_SEGMENTS).toFixed(3));
            });
            return;
        }

        animationGen += 1;
        const ticket = animationGen;
        const msPerLoop = 12400;

        function tick(now) {
            if (ticket !== animationGen || !orbitEl.isConnected) return;

            const w = orbitEl.clientWidth || 400;
            const h = orbitEl.clientHeight || 260;
            const cx = w / 2;
            const cy = h / 2;
            const amplitude = Math.min(w, h) * 0.36;
            const halfPx =
                pixels.length > 0 ? pixelHalf(pixels[0]) : gridCellPx() * 0.85;

            const loopFrac = ((now % msPerLoop) / msPerLoop);
            let activeSegments;
            if (loopFrac < LOOP_TRAIL_BUILD_FRACTION) {
                const g = loopFrac / LOOP_TRAIL_BUILD_FRACTION;
                activeSegments =
                    Math.max(
                        1,
                        Math.min(
                            MAX_COMET_SEGMENTS,
                            Math.ceil(1 + (MAX_COMET_SEGMENTS - 1) * g)
                        )
                    );
            } else if (loopFrac > 1 - LOOP_TRAIL_TAPER_FRACTION) {
                const u =
                    (1 - loopFrac) / LOOP_TRAIL_TAPER_FRACTION;
                activeSegments = Math.max(
                    1,
                    Math.ceil(MAX_COMET_SEGMENTS * u)
                );
            } else {
                activeSegments = MAX_COMET_SEGMENTS;
            }

            /** Leader angle: begins on the left; increases so motion reads along the ∞. */
            const base =
                PATH_START_ANGLE + loopFrac * TPI;

            pixels.forEach((px, idx) => {
                if (idx >= MAX_COMET_SEGMENTS) {
                    px.style.opacity = '0';
                    px.style.visibility = 'hidden';
                    return;
                }
                if (idx >= activeSegments) {
                    px.style.opacity = '0';
                    px.style.visibility = 'hidden';
                    return;
                }
                px.style.visibility = 'visible';
                const tau = wrapAngle(base - idx * COMET_PARAM_STEP);
                const p = infinityXY(tau, cx, cy, amplitude);
                px.style.transform =
                    `translate3d(${p.x - halfPx}px, ${p.y - halfPx}px, 0)`;
                px.style.opacity =
                    String(trailOpacity(idx, activeSegments).toFixed(3));
            });

            rafId = window.requestAnimationFrame(tick);
        }

        rafId = window.requestAnimationFrame(tick);
    }

    /** @returns {void} */
    function finishLoading() {
        try {
            sessionStorage.setItem(LOADER_SEEN_KEY, '1');
        } catch (_) { /* ignore */ }

        el.classList.add('portfolio-loader--done');
        document.body.classList.remove('portfolio-loader-active');
        el.setAttribute('aria-busy', 'false');
        el.setAttribute('aria-valuetext', 'Ready');
        el.setAttribute('aria-hidden', 'true');
        animationGen += 100;
        if (rafId) cancelAnimationFrame(rafId);

        scheduleDeferredSiteScripts();
        signalPortfolioReady();

        function removeLoader() {
            el.removeEventListener('transitionend', onTe);
            if (el.parentNode) el.parentNode.removeChild(el);
        }

        function onTe(ev) {
            if (ev.propertyName === 'opacity') removeLoader();
        }

        el.addEventListener('transitionend', onTe);
        window.setTimeout(removeLoader, 500);
    }

    let finished = false;
    /** @type {ReturnType<typeof setTimeout>} */
    let watchdogHandle;

    function dismissOnce() {
        if (finished) return;
        finished = true;
        window.clearTimeout(watchdogHandle);
        idleFrame().then(finishLoading);
    }

    watchdogHandle = window.setTimeout(() => dismissOnce(), 400);

    startInfinityLoop();

    Promise.all([
        domReadyPromise(),
        idleFrame()
    ])
        .then(() => dismissOnce())
        .catch(() => dismissOnce());
})();

function syncThemeToggle(btn) {
    if (!btn) return;
    const on = document.body.classList.contains('night-mode');
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
    btn.setAttribute('aria-label', on ? 'Switch to light mode' : 'Switch to dark mode');
}

function bindThemeToggle() {
    const buttons = Array.from(document.querySelectorAll('[data-theme-toggle]'));
    if (!buttons.length) return;
    buttons.forEach(syncThemeToggle);
    const toggleTheme = () => {
        document.body.classList.toggle('night-mode');
        const on = document.body.classList.contains('night-mode');
        try {
            localStorage.setItem(THEME_STORAGE_KEY, on ? 'dark' : 'light');
        } catch (_) {}
        buttons.forEach(syncThemeToggle);
        window.dispatchEvent(new CustomEvent('portfolio-theme-change', {
            detail: { theme: on ? 'dark' : 'light' }
        }));
    };
    buttons.forEach((btn) => {
        btn.addEventListener('click', toggleTheme);
        btn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleTheme();
            }
        });
    });
}

// --- Shared Header ---
const headerMount = document.querySelector('[data-site-header]');

if (headerMount) {
    const currentPage = headerMount.getAttribute('data-page') || '';
    const isActive = page => currentPage === page ? ' is-active' : '';
    const resumeUrl = 'https://drive.google.com/file/d/1e9EJH8wygKwAtqdljxzznRefkSE4_Ee4/view?usp=drive_link';

    headerMount.innerHTML = `
        <header class="navbar">
            <div class="navbar__pill">
                <a href="index.html" class="navbar__logo" aria-label="Go to homepage">
                    <img src="https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@3511488fddbacb1b5e3ff3949f3b374deec9bff0/asset/Logo.svg" alt="AS Logo" class="logo-img">
                </a>

                <nav class="nav-tray">
                    <a href="index.html#work" class="nav-item${isActive('home')}">work</a>
                    <a href="play.html" class="nav-item${isActive('play')}">play</a>
                    <a href="about.html" class="nav-item${isActive('about')}">about me</a>
                    <a href="${resumeUrl}" class="nav-item${isActive('resume')}" target="_blank" rel="noopener noreferrer">resume</a>
                    <button type="button" class="theme-toggle" id="theme-toggle" data-theme-toggle role="switch" aria-checked="false" aria-label="Switch to dark mode">
                        <span class="theme-toggle__icon theme-toggle__icon--sun" aria-hidden="true">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <path d="M12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12zM11 1.5a1 1 0 1 1 2 0v2a1 1 0 1 1-2 0v-2zm0 19a1 1 0 1 1 2 0v2a1 1 0 1 1-2 0v-2zM1.5 11a1 1 0 1 1 0 2h-2a1 1 0 1 1 0-2h2zm21 0a1 1 0 1 1 0 2h-2a1 1 0 1 1 0-2h2zM4.22 4.22a1 1 0 0 1 1.42 0l1.41 1.41a1 1 0 1 1-1.41 1.42L4.22 5.64a1 1 0 0 1 0-1.42zm13.73 13.73a1 1 0 0 1 1.42 0l1.41 1.41a1 1 0 0 1-1.41 1.42l-1.42-1.41a1 1 0 0 1 0-1.42zM4.22 19.78a1 1 0 0 1 0-1.41l1.42-1.42a1 1 0 1 1 1.41 1.42l-1.41 1.41a1 1 0 0 1-1.42 0zm13.73-13.73a1 1 0 0 1 0-1.42l1.41-1.41a1 1 0 0 1 1.42 1.41l-1.42 1.42a1 1 0 0 1-1.41 0z"/>
                            </svg>
                        </span>
                        <span class="theme-toggle__icon theme-toggle__icon--moon" aria-hidden="true">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                            </svg>
                        </span>
                    </button>
                </nav>

                <div class="mobile-menu-btn" id="mobile-menu-btn" aria-label="Open menu">
                    <span></span>
                    <span></span>
                </div>
            </div>

            <div class="mobile-nav-overlay" id="mobile-nav-overlay">
                <div class="mobile-nav-overlay__header">
                    <button type="button" class="theme-toggle mobile-nav-overlay__theme-toggle" data-theme-toggle role="switch" aria-checked="false" aria-label="Switch to dark mode">
                        <span class="theme-toggle__icon theme-toggle__icon--sun" aria-hidden="true">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <path d="M12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12zM11 1.5a1 1 0 1 1 2 0v2a1 1 0 1 1-2 0v-2zm0 19a1 1 0 1 1 2 0v2a1 1 0 1 1-2 0v-2zM1.5 11a1 1 0 1 1 0 2h-2a1 1 0 1 1 0-2h2zm21 0a1 1 0 1 1 0 2h-2a1 1 0 1 1 0-2h2zM4.22 4.22a1 1 0 0 1 1.42 0l1.41 1.41a1 1 0 1 1-1.41 1.42L4.22 5.64a1 1 0 0 1 0-1.42zm13.73 13.73a1 1 0 0 1 1.42 0l1.41 1.41a1 1 0 0 1-1.41 1.42l-1.42-1.41a1 1 0 0 1 0-1.42zM4.22 19.78a1 1 0 0 1 0-1.41l1.42-1.42a1 1 0 1 1 1.41 1.42l-1.41 1.41a1 1 0 0 1-1.42 0zm13.73-13.73a1 1 0 0 1 0-1.42l1.41-1.41a1 1 0 0 1 1.42 1.41l-1.42 1.42a1 1 0 0 1-1.41 0z"/>
                            </svg>
                        </span>
                        <span class="theme-toggle__icon theme-toggle__icon--moon" aria-hidden="true">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                            </svg>
                        </span>
                    </button>
                    <button type="button" class="mobile-nav-overlay__close" id="mobile-nav-close" aria-label="Close menu">
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                            <path d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>
                <a href="index.html" class="nav-item">home</a>
                <a href="play.html" class="nav-item">play</a>
                <a href="about.html" class="nav-item">about me</a>
                <a href="${resumeUrl}" class="nav-item" target="_blank" rel="noopener noreferrer">resume</a>
                <a href="contact.html" class="nav-item">contact</a>
            </div>
        </header>
    `;
    bindThemeToggle();
    bindNavRoutePrefetch();
}

const footerMounts = document.querySelectorAll('[data-site-footer]');
const footerIframeSrc = FOOTER_GRASS_IFRAME_SRCS[getCurrentThemeName()];

footerMounts.forEach(mount => {
    mount.innerHTML = `
        <footer class="site-footer">
            <div class="container">
                <section class="footer-cta-shell" aria-labelledby="footer-heading">
                    <div class="footer-sticker-stack" aria-hidden="true">
                        <!-- SVG Drop Shadow Overlay -->
                        <div class="sticker-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" width="499" height="498" viewBox="0 0 499 498" fill="none">
                              <g filter="url(#filter0_f_1192_10582)">
                                <path d="M70 301.905L224.53 70L428.409 427.65L172.976 427.649L70 301.905Z" fill="#595959" fill-opacity="0.15"/>
                              </g>
                              <defs>
                                <filter id="filter0_f_1192_10582" x="0" y="0" width="498.409" height="497.65" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                                  <feFlood flood-opacity="0" result="BackgroundImageFix"/>
                                  <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
                                  <feGaussianBlur stdDeviation="35" result="effect1_foregroundBlur_1192_10582"/>
                                </filter>
                              </defs>
                            </svg>
                        </div>
                        <img data-src="https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@3511488fddbacb1b5e3ff3949f3b374deec9bff0/asset/sticky-note.png" alt="Sticky Note" class="sticker-image" width="307" height="307" decoding="async" fetchpriority="low">
                    </div>

                    <h2 class="footer-cta-title" id="footer-heading">amaze amaze amaze?<br>let’s catchup soon</h2>
                    <p class="footer-cta-subtitle">Drop me a ‘Hi’ and I’ll get back</p>
                </section>

                <div class="footer-meta">
                    <div class="footer-meta-socials">
                        <a href="https://www.linkedin.com/in/adityasad/" class="footer-meta-social" aria-label="LinkedIn (opens in a new tab)" target="_blank" rel="noopener noreferrer">
                            <img src="https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@3511488fddbacb1b5e3ff3949f3b374deec9bff0/asset/social-linkedin.svg" alt="" width="32" height="32">
                        </a>
                        <a href="https://www.instagram.com/aaadit.yaa/" class="footer-meta-social" aria-label="Instagram (opens in a new tab)" target="_blank" rel="noopener noreferrer">
                            <img src="https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@3511488fddbacb1b5e3ff3949f3b374deec9bff0/asset/social-instagram.svg" alt="" width="32" height="32">
                        </a>
                        <a href="https://x.com/aaadit_s" class="footer-meta-social" aria-label="X (opens in a new tab)" target="_blank" rel="noopener noreferrer">
                            <img src="https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@3511488fddbacb1b5e3ff3949f3b374deec9bff0/asset/social-x.svg" alt="" width="32" height="32">
                        </a>
                    </div>
                </div>

                <figure class="footer-grass-scene" aria-hidden="true" data-footer-grass-scene>
                    <img
                        class="footer-grass-scene__base footer-grass-scene__base--light"
                        data-src="https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@3511488fddbacb1b5e3ff3949f3b374deec9bff0/asset/grass-footer.jpg"
                        alt=""
                        width="1440"
                        height="400"
                        decoding="async"
                        fetchpriority="low"
                        data-loader-skip="true"
                    >
                    <img
                        class="footer-grass-scene__base footer-grass-scene__base--dark"
                        data-src="https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@3511488fddbacb1b5e3ff3949f3b374deec9bff0/asset/grass-footer-dark.png"
                        alt=""
                        width="1440"
                        height="400"
                        decoding="async"
                        fetchpriority="low"
                        data-loader-skip="true"
                    >
                    <iframe
                        class="footer-grass-scene__overlay"
                        data-footer-overlay
                        data-loader-skip="true"
                        data-src-light="${FOOTER_GRASS_IFRAME_SRCS.light}"
                        data-src-dark="${FOOTER_GRASS_IFRAME_SRCS.dark}"
                        data-current-theme="${getCurrentThemeName()}"
                        data-src="${footerIframeSrc}"
                        title="Animated grass and robot"
                        scrolling="no"
                        tabindex="-1"
                    ></iframe>
                    <p class="footer-meta-copy">
                        Made with procrastination, overthinking and Claude over the weekends <span aria-hidden="true">🌈</span>
                    </p>
                </figure>

            </div>
        </footer>
    `;
    window.PortfolioLazyLoad?.scan(mount);
});

(function initFooterGrassSceneMotion() {
    const scenes = Array.from(document.querySelectorAll('[data-footer-grass-scene]'));
    if (!scenes.length) return;

    const reducedMotion = window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : { matches: false };

    if (reducedMotion.matches) {
        return;
    }

    const prefersFinePointer = window.matchMedia
        ? window.matchMedia('(pointer: fine)')
        : { matches: true };

    function getSceneIframe(scene) {
        return scene.querySelector('[data-footer-overlay]');
    }

    function isSceneEngaged(scene) {
        return scene.dataset.footerVisible === 'true' || scene.dataset.footerPointerInside === 'true';
    }

    function getSceneActiveState(scene) {
        return isSceneEngaged(scene) && document.visibilityState === 'visible';
    }

    function getFooterIframeSrc(iframe, theme) {
        return theme === 'dark'
            ? (iframe.dataset.srcDark || iframe.dataset.src)
            : (iframe.dataset.srcLight || iframe.dataset.src);
    }

    function postSceneState(scene) {
        const iframe = getSceneIframe(scene);
        if (!iframe?.contentWindow) return;
        iframe.contentWindow.postMessage({
            type: 'footer-scene-state',
            active: getSceneActiveState(scene)
        }, window.location.origin);
    }

    function syncSceneState(scene) {
        postSceneState(scene);
        requestAnimationFrame(() => postSceneState(scene));
    }

    function ensureFooterIframeLoaded(scene) {
        const iframe = getSceneIframe(scene);
        if (!iframe) return;
        const theme = scene.dataset.footerTheme || getCurrentThemeName();
        const nextSrc = getFooterIframeSrc(iframe, theme);
        if (!nextSrc) return;

        const currentSrc = iframe.getAttribute('src');
        if (!currentSrc) {
            iframe.dataset.currentTheme = theme;
            iframe.setAttribute('src', nextSrc);
            return;
        }

        if (iframe.dataset.currentTheme !== theme && currentSrc !== nextSrc) {
            iframe.dataset.currentTheme = theme;
            iframe.setAttribute('src', nextSrc);
        }
    }

    function syncSceneTheme(scene, nextTheme = getCurrentThemeName()) {
        scene.dataset.footerTheme = nextTheme;
        if (!isSceneEngaged(scene)) return;
        ensureFooterIframeLoaded(scene);
        syncSceneState(scene);
    }

    function postPointer(scene, x, y) {
        const iframe = getSceneIframe(scene);
        if (!iframe?.contentWindow || !getSceneActiveState(scene)) return;
        iframe.contentWindow.postMessage({
            type: 'footer-pointer',
            x,
            y
        }, window.location.origin);
    }

    function postPointerLeave(scene) {
        const iframe = getSceneIframe(scene);
        if (!iframe) return;
        iframe.contentWindow?.postMessage({ type: 'footer-pointer-leave' }, window.location.origin);
    }

    const visibilityObserver = typeof IntersectionObserver === 'function'
        ? new IntersectionObserver(entries => {
            entries.forEach(entry => {
                const scene = entry.target;
                scene.dataset.footerVisible = entry.isIntersecting ? 'true' : 'false';
                if (entry.isIntersecting) {
                    ensureFooterIframeLoaded(scene);
                    ensureFooterGrassBaseLoaded(scene.dataset.footerTheme || getCurrentThemeName());
                    scene.querySelectorAll('img[data-src]:not(.footer-grass-scene__base)').forEach((img) => {
                        window.PortfolioLazyLoad?.applyLazyImg(img);
                    });
                }
                if (!entry.isIntersecting && scene.dataset.footerPointerInside !== 'true') {
                    postPointerLeave(scene);
                }
                syncSceneState(scene);
            });
        }, { threshold: 0.08, rootMargin: '160px 0px' })
        : null;

    scenes.forEach(scene => {
        let rafId = 0;
        let targetX = 0;
        let targetY = 0;
        let currentX = 0;
        let currentY = 0;
        let lastSentX = Number.NaN;
        let lastSentY = Number.NaN;

        const iframe = getSceneIframe(scene);
        scene.dataset.footerVisible = visibilityObserver ? 'false' : 'true';
        scene.dataset.footerPointerInside = 'false';
        scene.dataset.footerTheme = getCurrentThemeName();
        if (!visibilityObserver) {
            ensureFooterIframeLoaded(scene);
            syncSceneState(scene);
        }
        iframe?.addEventListener('load', () => {
            syncSceneState(scene);
            postPointer(scene, currentX, currentY);
        });
        visibilityObserver?.observe(scene);

        scene.addEventListener('pointerenter', () => {
            scene.dataset.footerPointerInside = 'true';
            ensureFooterIframeLoaded(scene);
            syncSceneState(scene);
        }, { passive: true });

        const paint = () => {
            rafId = 0;
            currentX += (targetX - currentX) * 0.12;
            currentY += (targetY - currentY) * 0.12;
            if (Math.abs(lastSentX - currentX) > 0.002 || Math.abs(lastSentY - currentY) > 0.002) {
                lastSentX = currentX;
                lastSentY = currentY;
                postPointer(scene, currentX, currentY);
            }
            if (Math.abs(targetX - currentX) > 0.002 || Math.abs(targetY - currentY) > 0.002) {
                rafId = requestAnimationFrame(paint);
            }
        };

        const requestPaint = () => {
            if (!rafId) rafId = requestAnimationFrame(paint);
        };

        scene.addEventListener('pointermove', (event) => {
            if (!prefersFinePointer.matches || document.visibilityState !== 'visible') return;
            scene.dataset.footerPointerInside = 'true';
            const rect = scene.getBoundingClientRect();
            targetX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            targetY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
            requestPaint();
        }, { passive: true });

        scene.addEventListener('pointerleave', () => {
            scene.dataset.footerPointerInside = 'false';
            targetX = 0;
            targetY = 0;
            postPointerLeave(scene);
            syncSceneState(scene);
            requestPaint();
        }, { passive: true });
    });

    document.addEventListener('visibilitychange', () => {
        scenes.forEach(scene => {
            if (document.visibilityState !== 'visible') postPointerLeave(scene);
            syncSceneState(scene);
        });
    });

    window.addEventListener('portfolio-theme-change', (event) => {
        const nextTheme = event.detail?.theme === 'dark' ? 'dark' : 'light';
        ensureFooterGrassBaseLoaded(nextTheme);
        scenes.forEach(scene => syncSceneTheme(scene, nextTheme));
    });
})();


/*
// --- Layout Toggle Logic ---
const btnWall = document.getElementById('btn-wall');
const btnGrid = document.getElementById('btn-grid');
const workContainer = document.getElementById('work-wall');

btnGrid.addEventListener('click', () => {
    btnGrid.classList.add('active');
    btnWall.classList.remove('active');
    workContainer.classList.add('organised-view');
});

btnWall.addEventListener('click', () => {
    btnWall.classList.add('active');
    btnGrid.classList.remove('active');
    workContainer.classList.remove('organised-view');
});
*/

// --- Project Modal Logic ---
const projectModal = document.getElementById('project-modal');
const modalBackdrop = document.getElementById('modal-backdrop');
const modalClose = document.getElementById('modal-close');
const workCards = document.querySelectorAll('.work-card');
const homeWorkCards = document.querySelectorAll('#work-wall .work-card');
const HOME_CARD_EDITOR_KEY = 'portfolio-home-card-editor:v4';
const HOME_CARDS_CONFIG_PATH = 'content/home-project-cards.json';
const HOME_CARD_SYNC_SERVER_URL = `http://localhost:${window.CASE_STUDY_SYNC_PORT || 4567}`;
const HOME_CARD_SYNC_DEBOUNCE_MS = 2000;
const HOME_CARD_FALLBACK_TRANSFORMS = {
    'card-1': { x: -7.203125, y: 22.7890625, scale: 1.15, rotate: 0 },
    'card-2': { x: -0.35546875, y: 63.1953125, scale: 1, rotate: 0 },
    'card-3': { x: 0, y: 0, scale: 1, rotate: 0 },
    'card-4': { x: 0, y: -19.7265625, scale: 2.13, rotate: 0 }
};
const HOME_CARD_BACKGROUND_PATHS = new Set([
    'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@3511488fddbacb1b5e3ff3949f3b374deec9bff0/asset/home-project-cards/grassland.png',
    'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@3511488fddbacb1b5e3ff3949f3b374deec9bff0/asset/home-project-cards/water.png',
    'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@3511488fddbacb1b5e3ff3949f3b374deec9bff0/asset/home-project-cards/project-3-night-meadow-background.jpg',
    'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@3511488fddbacb1b5e3ff3949f3b374deec9bff0/asset/home-project-cards/project-4-green-background.jpg'
]);
const HOME_CARD_SHADER_BACKGROUNDS = {
    'card-1': 'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@3511488fddbacb1b5e3ff3949f3b374deec9bff0/asset/home-project-cards/grassland.png',
    'card-2': 'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@3511488fddbacb1b5e3ff3949f3b374deec9bff0/asset/home-project-cards/water.png',
    'card-3': 'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@3511488fddbacb1b5e3ff3949f3b374deec9bff0/asset/home-project-cards/project-3-night-meadow-background.jpg',
    'card-4': 'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@3511488fddbacb1b5e3ff3949f3b374deec9bff0/asset/home-project-cards/project-4-green-background.jpg'
};
let homeCardBundledDefaults = {};
let homeCardEditorState = {};
let homeCardEditorMeta = { dirty: false, localUpdatedAt: 0, repoVersion: 0 };
let homeCardSyncServerReady = null;
let homeCardSyncTimer = null;
let homeCardSyncInFlight = null;
let homeCardSyncStatusEl = null;

function getHomeCardKey(card, index = 0) {
    return Array.from(card.classList).find(className => /^card-\d+$/.test(className)) || `card-${index + 1}`;
}

function isHomeCardLocalDev() {
    const { hostname, protocol } = window.location;
    return protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1');
}

function ensureHomeCardShaderBackgrounds() {
    homeWorkCards.forEach((card, index) => {
        const key = getHomeCardKey(card, index);
        const content = card.querySelector('.card-content');
        const expected = HOME_CARD_SHADER_BACKGROUNDS[key];
        if (!content || !expected) return;
        content.setAttribute('data-lazy-bg', expected);
        content.dataset.homeCardDefaultImage = expected;
        window.PortfolioLazyLoad?.observe(content);
    });
}

function isHomeCardBackgroundPath(src) {
    return typeof src === 'string' && HOME_CARD_BACKGROUND_PATHS.has(src);
}

function hasHomeCardOverlay(cardState) {
    return !!(cardState?.src && !isHomeCardBackgroundPath(cardState.src));
}

function sanitizeHomeCardOverlayState(state) {
    if (!state || typeof state !== 'object') return null;
    const transforms = HOME_CARD_FALLBACK_TRANSFORMS;
    const key = state.__cardKey;
    const fallback = key ? transforms[key] : null;
    const cleaned = {
        src: hasHomeCardOverlay(state) ? state.src : '',
        x: Number(state.x) || fallback?.x || 0,
        y: Number(state.y) || fallback?.y || 0,
        scale: Number(state.scale) || fallback?.scale || 1,
        rotate: Number(state.rotate) || 0
    };
    return cleaned;
}

function getHomeCardDefault(key) {
    const state = homeCardEditorState[key] || homeCardBundledDefaults[key];
    if (!state) return { ...HOME_CARD_FALLBACK_TRANSFORMS[key], src: '' };
    return sanitizeHomeCardOverlayState({ ...state, __cardKey: key });
}

function flashHomeCardSyncStatus(message) {
    if (!homeCardSyncStatusEl) return;
    homeCardSyncStatusEl.textContent = message;
    homeCardSyncStatusEl.dataset.state = 'saved';
    window.clearTimeout(flashHomeCardSyncStatus._timer);
    flashHomeCardSyncStatus._timer = window.setTimeout(() => {
        if (homeCardSyncStatusEl) {
            homeCardSyncStatusEl.textContent = '';
            homeCardSyncStatusEl.dataset.state = 'idle';
        }
    }, 1800);
}

async function isHomeCardSyncServerAvailable() {
    if (!isHomeCardLocalDev()) return false;
    if (homeCardSyncServerReady != null) return homeCardSyncServerReady;
    try {
        const response = await fetch(`${HOME_CARD_SYNC_SERVER_URL}/health`, { cache: 'no-store' });
        homeCardSyncServerReady = response.ok;
    } catch (error) {
        homeCardSyncServerReady = false;
    }
    return homeCardSyncServerReady;
}

function readHomeCardEditorState() {
    try {
        const keys = [
            HOME_CARD_EDITOR_KEY,
            'portfolio-home-card-editor:v3',
            'portfolio-home-card-editor:v2',
            'portfolio-home-card-editor:v1'
        ];
        let raw = null;
        for (const key of keys) {
            raw = window.localStorage.getItem(key);
            if (raw) break;
        }
        if (!raw) return { cards: {}, meta: {} };

        const parsed = JSON.parse(raw);
        if (parsed && parsed.cards && typeof parsed.cards === 'object') {
            return {
                cards: parsed.cards,
                meta: parsed.__editor || {}
            };
        }

        const cards = {};
        Object.entries(parsed || {}).forEach(([key, value]) => {
            if (/^card-\d+$/.test(key) && value && typeof value === 'object') {
                cards[key] = value;
            }
        });
        return { cards, meta: {} };
    } catch (error) {
        console.warn('Unable to read homepage card editor state', error);
        return { cards: {}, meta: {} };
    }
}

function saveHomeCardEditorState(state, meta = homeCardEditorMeta, options = {}) {
    try {
        const payload = {
            __editor: {
                dirty: meta.dirty !== false,
                localUpdatedAt: meta.localUpdatedAt || Date.now(),
                repoVersion: Number(meta.repoVersion) || 0
            },
            cards: state
        };
        window.localStorage.setItem(HOME_CARD_EDITOR_KEY, JSON.stringify(payload));
        if (options.scheduleSync !== false && meta.dirty !== false) {
            scheduleHomeCardRepoSync();
        }
        return true;
    } catch (error) {
        console.warn('Unable to save homepage card editor state', error);
        return false;
    }
}

function normalizeHomeCardEditorState(state) {
    const nextState = { ...(state || {}) };
    let changed = false;
    Object.keys(HOME_CARD_FALLBACK_TRANSFORMS).forEach((key) => {
        const current = nextState[key];
        const sanitized = sanitizeHomeCardOverlayState({ ...(current || {}), __cardKey: key });
        if (!current) {
            nextState[key] = sanitized;
            changed = true;
            return;
        }
        if (JSON.stringify(current) !== JSON.stringify(sanitized)) {
            nextState[key] = sanitized;
            changed = true;
        }
    });
    if (changed) saveHomeCardEditorState(nextState, homeCardEditorMeta, { scheduleSync: false });
    return nextState;
}

function withAssetBaseUrl(src) {
    if (typeof src !== 'string') return src;
    if (typeof window.resolveAssetUrl === 'function') {
        return window.resolveAssetUrl(src);
    }
    return src;
}

async function loadHomeCardBundledConfig() {
    try {
        const cacheMode = isLocalDevHost() ? 'no-store' : 'default';
        const response = await fetch(HOME_CARDS_CONFIG_PATH, { cache: cacheMode });
        if (!response.ok) return null;
        const parsed = await response.json();
        if (!parsed?.cards || typeof parsed.cards !== 'object') return null;
        Object.values(parsed.cards).forEach((card) => {
            if (card && typeof card === 'object') {
                if (card.src) card.src = withAssetBaseUrl(card.src);
                if (card.backgroundSrc) card.backgroundSrc = withAssetBaseUrl(card.backgroundSrc);
            }
        });
        return parsed;
    } catch (error) {
        return null;
    }
}

function choosePreferredHomeCardState(storedCards, storedMeta, bundledConfig) {
    const bundledCards = bundledConfig?.cards || {};
    const bundledVersion = Number(bundledConfig?.__editor?.repoVersion) || 0;
    const storedVersion = Number(storedMeta?.repoVersion) || 0;

    if (!Object.keys(storedCards || {}).length) return { cards: bundledCards, meta: bundledConfig?.__editor || {} };
    if (storedMeta?.dirty && storedVersion >= bundledVersion) {
        return { cards: storedCards, meta: storedMeta };
    }
    if (bundledVersion > storedVersion) {
        return { cards: bundledCards, meta: bundledConfig?.__editor || {} };
    }
    return { cards: storedCards, meta: storedMeta };
}

async function initHomeCardEditorState() {
    const bundledConfig = await loadHomeCardBundledConfig();
    if (bundledConfig?.cards) {
        const sanitizedCards = {};
        Object.entries(bundledConfig.cards).forEach(([key, value]) => {
            sanitizedCards[key] = sanitizeHomeCardOverlayState({ ...value, __cardKey: key });
        });
        homeCardBundledDefaults = sanitizedCards;
    }

    const stored = readHomeCardEditorState();
    const preferred = choosePreferredHomeCardState(stored.cards, stored.meta, bundledConfig);
    const preferredCards = {};
    Object.entries(preferred.cards || {}).forEach(([key, value]) => {
        preferredCards[key] = sanitizeHomeCardOverlayState({ ...value, __cardKey: key });
    });
    homeCardEditorState = normalizeHomeCardEditorState(preferredCards);
    homeCardEditorMeta = {
        dirty: false,
        localUpdatedAt: Date.now(),
        repoVersion: Number(preferred.meta?.repoVersion) || 0
    };
    saveHomeCardEditorState(homeCardEditorState, homeCardEditorMeta, { scheduleSync: false });
}

function collectHomeCardsSyncPayload() {
    const cards = {};
    const keys = new Set([
        ...Object.keys(HOME_CARD_FALLBACK_TRANSFORMS),
        ...Object.keys(homeCardBundledDefaults),
        ...Object.keys(homeCardEditorState)
    ]);

    keys.forEach((key) => {
        const state = sanitizeHomeCardOverlayState({
            ...(homeCardEditorState[key] || homeCardBundledDefaults[key] || {}),
            __cardKey: key
        });
        if (!hasHomeCardOverlay(state)) return;

        const payload = {
            src: state.src,
            x: state.x,
            y: state.y,
            scale: state.scale,
            rotate: state.rotate
        };
        if (typeof state.src === 'string' && state.src.startsWith('data:image/')) {
            const match = /^data:([^;]+);base64,(.+)$/i.exec(state.src);
            if (match) {
                payload.mimeType = match[1];
                payload.imageData = match[2];
            }
        }
        cards[key] = payload;
    });

    return cards;
}

async function syncHomeCardsToRepo(options = {}) {
    if (!isHomeCardLocalDev()) return false;
    if (!(await isHomeCardSyncServerAvailable())) {
        if (options.showStatus) flashHomeCardSyncStatus('Run npm run case-study:sync');
        return false;
    }
    if (homeCardSyncInFlight) return homeCardSyncInFlight;

    homeCardSyncInFlight = (async () => {
        try {
            const response = await fetch(`${HOME_CARD_SYNC_SERVER_URL}/sync/home-cards`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cards: collectHomeCardsSyncPayload() })
            });
            const result = await response.json();
            if (!response.ok || !result.ok) {
                throw new Error(result.error || 'Home card sync failed');
            }

            homeCardBundledDefaults = { ...homeCardBundledDefaults, ...(result.cards || {}) };
            homeCardEditorState = normalizeHomeCardEditorState({
                ...homeCardEditorState,
                ...(result.cards || {})
            });
            homeCardEditorMeta = {
                dirty: false,
                localUpdatedAt: Date.now(),
                repoVersion: result.repoVersion
            };
            saveHomeCardEditorState(homeCardEditorState, homeCardEditorMeta, { scheduleSync: false });
            applyAllHomeCardOverlays();

            if (options.showStatus !== false) {
                const parts = ['Synced cards'];
                if (result.assetsWritten) parts.push(`${result.assetsWritten} assets`);
                flashHomeCardSyncStatus(parts.join(' · '));
            }
            return true;
        } catch (error) {
            if (options.showStatus !== false) flashHomeCardSyncStatus('Card sync failed');
            console.warn('Home card repo sync failed', error);
            return false;
        } finally {
            homeCardSyncInFlight = null;
        }
    })();

    return homeCardSyncInFlight;
}

function scheduleHomeCardRepoSync() {
    if (!isHomeCardLocalDev() || !homeCardEditorActive) return;
    if (homeCardSyncTimer) window.clearTimeout(homeCardSyncTimer);
    homeCardSyncTimer = window.setTimeout(() => {
        syncHomeCardsToRepo({ showStatus: true });
    }, HOME_CARD_SYNC_DEBOUNCE_MS);
}

let homeCardEditorActive = false;
let activeHomeCardEditorCard = null;

function applyHomeCardOverlay(card, cardState) {
    const content = card.querySelector('.card-content');
    if (!content) return;
    if (!content.dataset.homeCardDefaultImage) {
        content.dataset.homeCardDefaultImage = content.style.backgroundImage || '';
    }
    content.style.backgroundImage = content.dataset.homeCardDefaultImage;

    let image = card.querySelector(':scope > .home-card-overlay-image');
    if (!hasHomeCardOverlay(cardState)) {
        card.classList.remove('work-card--has-overlay');
        if (image) image.remove();
        return;
    }

    if (!image) {
        image = document.createElement('img');
        image.className = 'home-card-overlay-image home-card-edit-image';
        image.alt = '';
        image.decoding = 'async';
        image.draggable = false;
        card.appendChild(image);
    }

    image.src = cardState.src;
    image.style.setProperty('--home-card-img-x', `${Number(cardState.x) || 0}px`);
    image.style.setProperty('--home-card-img-y', `${Number(cardState.y) || 0}px`);
    image.style.setProperty('--home-card-img-scale', `${Number(cardState.scale) || 1}`);
    image.style.setProperty('--home-card-img-rotate', `${Number(cardState.rotate) || 0}deg`);
    card.classList.add('work-card--has-overlay');
}

function applyAllHomeCardOverlays() {
    if (!homeWorkCards.length) return;
    homeWorkCards.forEach((card, index) => {
        const key = getHomeCardKey(card, index);
        applyHomeCardOverlay(card, getHomeCardDefault(key));
    });
}

function clearHomeCardOverlay(card) {
    const key = card.dataset.homeCardKey;
    if (key) {
        const fallback = HOME_CARD_FALLBACK_TRANSFORMS[key] || { x: 0, y: 0, scale: 1, rotate: 0 };
        applyHomeCardOverlay(card, { ...fallback, src: '' });
        return;
    }
    applyHomeCardOverlay(card, null);
}

function applyHomeCardImageState(card, cardState) {
    applyHomeCardOverlay(card, cardState);
}

function updateHomeCardEditorControls(card, cardState) {
    const panel = card.querySelector('.home-card-editor-panel');
    if (!panel) return;
    const scaleInput = panel.querySelector('[data-home-card-scale]');
    const rotateInput = panel.querySelector('[data-home-card-rotate]');
    const rotateNumberInput = panel.querySelector('[data-home-card-rotate-number]');
    const xInput = panel.querySelector('[data-home-card-x]');
    const yInput = panel.querySelector('[data-home-card-y]');
    if (scaleInput) scaleInput.value = String(Number(cardState?.scale) || 1);
    if (rotateInput) rotateInput.value = String(Number(cardState?.rotate) || 0);
    if (rotateNumberInput) rotateNumberInput.value = String(Math.round(Number(cardState?.rotate) || 0));
    if (xInput) xInput.value = String(Math.round(Number(cardState?.x) || 0));
    if (yInput) yInput.value = String(Math.round(Number(cardState?.y) || 0));
}

function persistHomeCardState(card, nextState) {
    const key = card.dataset.homeCardKey;
    if (!key) return;
    const cleanedState = sanitizeHomeCardOverlayState({
        ...nextState,
        __cardKey: key
    });
    homeCardEditorState[key] = cleanedState;
    applyHomeCardImageState(card, cleanedState);
    updateHomeCardEditorControls(card, cleanedState);
    homeCardEditorMeta = {
        ...homeCardEditorMeta,
        dirty: true,
        localUpdatedAt: Date.now()
    };
    saveHomeCardEditorState(homeCardEditorState, homeCardEditorMeta);
}

function setActiveHomeCardEditorCard(card) {
    if (!card) return;
    homeWorkCards.forEach(workCard => {
        workCard.classList.toggle('is-home-card-editor-selected', workCard === card);
    });
    activeHomeCardEditorCard = card;
}

function setHomeCardImageFromFile(card, file, scale = 1) {
    if (!card || !file || !file.type?.startsWith('image/')) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
        persistHomeCardState(card, {
            src: String(reader.result || ''),
            x: 0,
            y: 0,
            scale: Number(scale) || 1,
            rotate: 0
        });
        setActiveHomeCardEditorCard(card);
    });
    reader.readAsDataURL(file);
}

function getClipboardImageFile(event) {
    const files = Array.from(event.clipboardData?.files || []);
    const file = files.find(item => item.type?.startsWith('image/'));
    if (file) return file;

    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find(item => item.type?.startsWith('image/'));
    return imageItem?.getAsFile() || null;
}

async function pasteHomeCardImageFromClipboard(card, scale = 1) {
    if (!navigator.clipboard?.read) return false;
    const clipboardItems = await navigator.clipboard.read();
    for (const item of clipboardItems) {
        const imageType = item.types.find(type => type.startsWith('image/'));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        const file = new File([blob], `home-card-image.${imageType.split('/')[1] || 'png'}`, { type: imageType });
        setHomeCardImageFromFile(card, file, scale);
        return true;
    }
    return false;
}

function setupHomeCardEditor() {
    if (!homeWorkCards.length) return;

    const workWall = document.getElementById('work-wall');
    const projectsHeader = document.querySelector('.projects-header');
    const editorActions = document.createElement('div');
    editorActions.className = 'home-card-editor-actions';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'home-card-editor-toggle';
    toggle.textContent = 'Edit project cards';
    toggle.setAttribute('aria-pressed', 'false');

    const syncButton = document.createElement('button');
    syncButton.type = 'button';
    syncButton.className = 'home-card-editor-sync';
    syncButton.textContent = 'Sync cards to repo';
    syncButton.title = 'Save overlay images and layout to the repo (backgrounds stay unchanged)';

    homeCardSyncStatusEl = document.createElement('span');
    homeCardSyncStatusEl.className = 'home-card-editor-sync__status';
    homeCardSyncStatusEl.dataset.state = 'idle';

    editorActions.appendChild(toggle);
    editorActions.appendChild(syncButton);
    editorActions.appendChild(homeCardSyncStatusEl);
    (projectsHeader || workWall).appendChild(editorActions);

    syncButton.addEventListener('click', () => {
        syncHomeCardsToRepo({ showStatus: true });
    });

    isHomeCardSyncServerAvailable().then((ready) => {
        if (ready) flashHomeCardSyncStatus('Repo sync on');
    });

    const setEditorActive = (active) => {
        homeCardEditorActive = active;
        document.body.classList.toggle('home-card-editor-active', active);
        toggle.classList.toggle('is-active', active);
        toggle.setAttribute('aria-pressed', active ? 'true' : 'false');
        toggle.textContent = active ? 'Done editing cards' : 'Edit project cards';
        if (active) {
            document.body.classList.remove('webgl-cards');
            hideCursorTooltip(0);
            cursorDot.classList.remove('cursor-dot--hover');
        } else {
            applyAllHomeCardOverlays();
            if (document.querySelector('#work-wall .work-shader-canvas')) {
                document.body.classList.add('webgl-cards');
            }
        }
    };

    toggle.addEventListener('click', () => {
        const nextActive = !homeCardEditorActive;
        setEditorActive(nextActive);
        if (nextActive) {
            homeWorkCards.forEach((workCard, workIndex) => {
                const cardKey = getHomeCardKey(workCard, workIndex);
                applyHomeCardOverlay(workCard, getHomeCardDefault(cardKey));
            });
        }
    });

    homeWorkCards.forEach((card, index) => {
        const key = getHomeCardKey(card, index);
        const existingState = getHomeCardDefault(key);
        card.dataset.homeCardKey = key;

        const panel = document.createElement('div');
        panel.className = 'home-card-editor-panel';
        panel.innerHTML = `
            <div class="home-card-editor-panel__row">
                <span class="home-card-editor-panel__title">${escapeHTML(card.getAttribute('data-title') || `Project ${index + 1}`)}</span>
                <button type="button" data-home-card-pick>Upload</button>
                <button type="button" data-home-card-paste>Paste</button>
                <button type="button" data-home-card-center>Center</button>
                <button type="button" data-home-card-reset>Reset</button>
            </div>
            <label class="home-card-editor-panel__control">
                <span>Scale</span>
                <input type="range" min="0.6" max="2.4" step="0.01" value="${Number(existingState?.scale) || 1}" data-home-card-scale>
            </label>
            <label class="home-card-editor-panel__control">
                <span>Rotate</span>
                <input type="range" min="-180" max="180" step="1" value="${Number(existingState?.rotate) || 0}" data-home-card-rotate>
                <input type="number" min="-180" max="180" step="1" value="${Math.round(Number(existingState?.rotate) || 0)}" data-home-card-rotate-number>
            </label>
            <div class="home-card-editor-panel__coords">
                <label><span>X</span><input type="number" step="1" value="${Math.round(Number(existingState?.x) || 0)}" data-home-card-x></label>
                <label><span>Y</span><input type="number" step="1" value="${Math.round(Number(existingState?.y) || 0)}" data-home-card-y></label>
            </div>
            <input type="file" accept="image/*" data-home-card-file hidden>
        `;
        card.appendChild(panel);

        const fileInput = panel.querySelector('[data-home-card-file]');
        const pickButton = panel.querySelector('[data-home-card-pick]');
        const pasteButton = panel.querySelector('[data-home-card-paste]');
        const centerButton = panel.querySelector('[data-home-card-center]');
        const resetButton = panel.querySelector('[data-home-card-reset]');
        const scaleInput = panel.querySelector('[data-home-card-scale]');
        const rotateInput = panel.querySelector('[data-home-card-rotate]');
        const rotateNumberInput = panel.querySelector('[data-home-card-rotate-number]');
        const xInput = panel.querySelector('[data-home-card-x]');
        const yInput = panel.querySelector('[data-home-card-y]');

        panel.addEventListener('pointerdown', event => event.stopPropagation());
        panel.addEventListener('click', event => event.stopPropagation());

        pickButton?.addEventListener('click', () => {
            setActiveHomeCardEditorCard(card);
            fileInput?.click();
        });
        fileInput?.addEventListener('change', () => {
            const file = fileInput.files?.[0];
            setHomeCardImageFromFile(card, file, Number(scaleInput?.value) || 1);
            fileInput.value = '';
        });
        pasteButton?.addEventListener('click', async () => {
            setActiveHomeCardEditorCard(card);
            try {
                await pasteHomeCardImageFromClipboard(card, Number(scaleInput?.value) || 1);
            } catch (error) {
                console.warn('Unable to paste homepage card image', error);
            }
        });

        resetButton?.addEventListener('click', () => {
            const fallback = homeCardBundledDefaults[key] || { ...HOME_CARD_FALLBACK_TRANSFORMS[key], src: '' };
            if (fallback) {
                persistHomeCardState(card, { ...fallback, src: '' });
            } else {
                delete homeCardEditorState[key];
                homeCardEditorMeta = { ...homeCardEditorMeta, dirty: true, localUpdatedAt: Date.now() };
                saveHomeCardEditorState(homeCardEditorState, homeCardEditorMeta);
                clearHomeCardOverlay(card);
                updateHomeCardEditorControls(card, { x: 0, y: 0, scale: 1, rotate: 0 });
            }
        });

        centerButton?.addEventListener('click', () => {
            const current = homeCardEditorState[key];
            if (!hasHomeCardOverlay(current)) return;
            persistHomeCardState(card, {
                ...current,
                x: 0,
                y: 0
            });
        });

        const updateFromInputs = () => {
            const current = homeCardEditorState[key];
            if (!hasHomeCardOverlay(current)) return;
            const rotate = Number(rotateInput?.value ?? rotateNumberInput?.value) || 0;
            persistHomeCardState(card, {
                src: current.src,
                x: Number(xInput?.value) || 0,
                y: Number(yInput?.value) || 0,
                scale: Number(scaleInput?.value) || 1,
                rotate
            });
        };

        scaleInput?.addEventListener('input', updateFromInputs);
        rotateInput?.addEventListener('input', () => {
            if (rotateNumberInput) rotateNumberInput.value = rotateInput.value;
            updateFromInputs();
        });
        rotateNumberInput?.addEventListener('input', () => {
            if (rotateInput) rotateInput.value = rotateNumberInput.value;
            updateFromInputs();
        });
        xInput?.addEventListener('input', updateFromInputs);
        yInput?.addEventListener('input', updateFromInputs);

        let dragStart = null;
        card.addEventListener('pointerdown', (event) => {
            if (!homeCardEditorActive || event.button !== 0) return;
            setActiveHomeCardEditorCard(card);
            const current = homeCardEditorState[key];
            if (!hasHomeCardOverlay(current)) return;
            event.preventDefault();
            event.stopPropagation();
            card.setPointerCapture?.(event.pointerId);
            dragStart = {
                pointerId: event.pointerId,
                clientX: event.clientX,
                clientY: event.clientY,
                x: Number(current.x) || 0,
                y: Number(current.y) || 0
            };
            card.classList.add('is-home-card-dragging');
        });

        card.addEventListener('pointermove', (event) => {
            if (!dragStart || dragStart.pointerId !== event.pointerId) return;
            const current = homeCardEditorState[key];
            if (!hasHomeCardOverlay(current)) return;
            persistHomeCardState(card, {
                ...current,
                x: dragStart.x + event.clientX - dragStart.clientX,
                y: dragStart.y + event.clientY - dragStart.clientY
            });
        });

        const stopDrag = (event) => {
            if (!dragStart || dragStart.pointerId !== event.pointerId) return;
            dragStart = null;
            card.classList.remove('is-home-card-dragging');
        };
        card.addEventListener('pointerup', stopDrag);
        card.addEventListener('pointercancel', stopDrag);
    });

    workWall?.addEventListener('click', (event) => {
        if (!homeCardEditorActive) return;
        event.preventDefault();
        event.stopPropagation();
    }, true);

    document.addEventListener('paste', (event) => {
        if (!homeCardEditorActive) return;
        const file = getClipboardImageFile(event);
        if (!file) return;
        const targetCard = activeHomeCardEditorCard || homeWorkCards[0];
        const targetScale = targetCard?.querySelector('[data-home-card-scale]')?.value || 1;
        event.preventDefault();
        setHomeCardImageFromFile(targetCard, file, targetScale);
    });
}

// Create dynamic custom cursor label for the homepage project cards.
const cursorLabel = document.createElement('div');
cursorLabel.id = 'custom-cursor-label';
cursorLabel.setAttribute('aria-hidden', 'true');
document.body.appendChild(cursorLabel);

// Orange cursor dot
const cursorDot = document.createElement('div');
cursorDot.classList.add('cursor-dot');
document.body.appendChild(cursorDot);

let dotX = 0, dotY = 0;
let labelX = 0, labelY = 0;
let cursorRaf = 0;

function requestCursorPaint() {
    if (cursorRaf) return;
    cursorRaf = requestAnimationFrame(() => {
        cursorRaf = 0;
        cursorDot.style.left = dotX + 'px';
        cursorDot.style.top = dotY + 'px';
        if (cursorLabel.style.opacity !== '0') {
            cursorLabel.style.left = labelX + 'px';
            cursorLabel.style.top = labelY + 'px';
        }
    });
}

document.addEventListener('mousemove', (e) => {
    dotX = e.clientX;
    dotY = e.clientY;
    labelX = e.clientX;
    labelY = e.clientY;
    requestCursorPaint();
});

document.querySelectorAll('a, button, [role="button"], input, textarea, select, .work-card').forEach(el => {
    el.addEventListener('mouseenter', () => cursorDot.classList.add('cursor-dot--hover'));
    el.addEventListener('mouseleave', () => cursorDot.classList.remove('cursor-dot--hover'));
});

document.querySelectorAll('.hero-v2__tag').forEach(el => {
    el.addEventListener('mouseenter', () => {
        cursorDot.classList.add('cursor-dot--hover', 'cursor-dot--blue');
    });
    el.addEventListener('mouseleave', () => {
        cursorDot.classList.remove('cursor-dot--hover', 'cursor-dot--blue');
    });
});

let cursorTimeout;
let cursorExpandTimeout;
let cursorDescTimeout;
let activeTooltipCard = null;

function escapeHTML(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function setCursorTooltipContent(card) {
    const title = card.getAttribute('data-title');
    const desc = card.getAttribute('data-desc');
    if (!title) return false;
    cursorLabel.classList.remove('has-description');
    cursorLabel.innerHTML = `
        <span class="cursor-label__title">${escapeHTML(title)}</span>
        ${desc ? `<span class="cursor-label__desc">${escapeHTML(desc)}</span>` : ''}
    `;
    return true;
}

function collapseCursorTooltip() {
    clearTimeout(cursorExpandTimeout);
    clearTimeout(cursorDescTimeout);
    cursorLabel.classList.remove('is-expanded', 'has-description');
    cursorLabel.classList.add('is-collapsing');
}

function hideCursorTooltip(delay = 120) {
    collapseCursorTooltip();
    cursorTimeout = setTimeout(() => {
        cursorLabel.classList.remove('is-collapsing', 'is-expanded', 'has-description');
        cursorLabel.style.opacity = '0';
        activeTooltipCard = null;
    }, delay);
}

function expandCursorTooltip(card) {
    clearTimeout(cursorTimeout);
    clearTimeout(cursorExpandTimeout);
    const isSwitchingCards = activeTooltipCard && activeTooltipCard !== card;
    activeTooltipCard = card;
    collapseCursorTooltip();

    cursorExpandTimeout = setTimeout(() => {
        if (activeTooltipCard !== card || !setCursorTooltipContent(card)) return;
        cursorLabel.style.opacity = '';
        cursorLabel.classList.remove('is-collapsing');
        cursorLabel.classList.add('is-expanded');
        cursorDescTimeout = setTimeout(() => {
            const stillOnCard = activeTooltipCard === card;
            const hasDesc = Boolean(card.getAttribute('data-desc'));
            if (stillOnCard && hasDesc && cursorLabel.classList.contains('is-expanded')) {
                cursorLabel.classList.add('has-description');
            }
        }, 720);
    }, isSwitchingCards ? 80 : 140);
}

async function initHomeCardEditor() {
    const stored = readHomeCardEditorState();
    homeCardEditorState = normalizeHomeCardEditorState(stored.cards);
    homeCardEditorMeta = {
        dirty: false,
        localUpdatedAt: Date.now(),
        repoVersion: Number(stored.meta?.repoVersion) || 0
    };

    ensureHomeCardShaderBackgrounds();
    applyAllHomeCardOverlays();

    await initHomeCardEditorState();
    ensureHomeCardShaderBackgrounds();
    applyAllHomeCardOverlays();
}

onPortfolioReady(() => {
    scheduleIdleTask(() => initHomeCardEditor(), 1200);
});

workCards.forEach(card => {
    const link = card.getAttribute('data-link');

    const navigateToCardLink = () => {
        if (homeCardEditorActive && card.closest('#work-wall')) return;
        if (!link) return;
        cursorLabel.style.opacity = '0';
        if (typeof cursorDot !== 'undefined' && cursorDot) {
            cursorDot.style.opacity = '0';
        }
        if (typeof window.startPageFadeNavigation === 'function') {
            window.startPageFadeNavigation(link);
            return;
        }
        window.location.href = link;
    };

    card.addEventListener('click', () => {
        navigateToCardLink();
    });

    card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            if (homeCardEditorActive && card.closest('#work-wall')) return;
            e.preventDefault();
            navigateToCardLink();
        }
    });

    card.addEventListener('mouseenter', () => {
        expandCursorTooltip(card);
        prefetchRouteOnIntent(link);
    });
    card.addEventListener('mouseleave', () => hideCursorTooltip());
});

/* ==========================================================================
   PAGE TRANSITIONS — full-page fade
   --------------------------------------------------------------------------
   Every navigation between the homepage and a case study (and back) is a
   simple body-opacity cross-fade that bridges across the page swap by:
     1. Fading body to 0 over the current theme's bg colour (light/dark),
     2. Setting window.location.href,
     3. The destination page's <head> already added .cs-incoming to <html>
        (because it found a sessionStorage flag) so its body stays opacity 0
        through first paint,
     4. This script removes .cs-incoming and tweens body back to 1.

   Why no morphing card / overlay / sharedelement: cross-document morphs
   require either the View Transitions API (snapshot-bound, jittery) or a
   second cloned overlay on the destination (heavy, brittle on layout
   shifts). A simple themed fade is cheap, looks polished, and works the
   same on every browser.
   ========================================================================== */
(function setupPageFadeTransitions() {
    const FADE_KEY = 'cs-fade';
    const reduceMotion = window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let caseStudyRevealObserver = null;

    function bodyFadeElems() {
        return Array.from(document.body.children).filter(
            node =>
                node.nodeType === Node.ELEMENT_NODE
                && node.id !== 'portfolio-loader'
        );
    }

    function forcePageVisible() {
        document.documentElement.classList.remove('cs-incoming');
        document.documentElement.style.backgroundColor = '';
        const elems = bodyFadeElems();
        if (typeof gsap !== 'undefined') {
            gsap.set(elems, { autoAlpha: 1, clearProps: 'opacity,visibility' });
        } else {
            elems.forEach((el) => {
                el.style.opacity = '';
                el.style.visibility = '';
            });
        }
    }

    function safeScrollToHash(hash) {
        if (!hash || hash.length <= 1) return;
        let target = null;
        try { target = document.getElementById(decodeURIComponent(hash.slice(1))); }
        catch (_) { target = document.getElementById(hash.slice(1)); }
        if (!target || typeof target.scrollIntoView !== 'function') return;
        try {
            target.scrollIntoView({ block: 'start', behavior: 'auto' });
        } catch (_) {
            target.scrollIntoView();
        }
    }

    function isCaseStudyPage() {
        return !!(document.body && document.body.classList.contains('cs-page'));
    }

    function caseStudyRevealDisabled() {
        return !isCaseStudyPage()
            || reduceMotion
            || document.documentElement.dataset.csMode === 'edit';
    }

    function caseStudyRevealTargets() {
        return Array.from(document.querySelectorAll([
            '.cs-back',
            '.cs-page-header',
            '.cs-page-hero',
            '.cs-content > .cs-body-layout > .cs-index',
            '.cs-content > .cs-body-layout > .cs-body-layout__content > .cs-section > *',
            '.cs-content > .cs-section > *',
            '.cs-content > .cs-cta-row'
        ].join(','))).filter((node) => {
            if (!(node instanceof HTMLElement)) return false;
            if (node.classList.contains('cs-inserter')) return false;
            if (node.closest('.cs-editor-toolbar')) return false;
            if (node.closest('.cs-inserter')) return false;
            return true;
        });
    }

    function clearCaseStudyReveal() {
        if (caseStudyRevealObserver) {
            caseStudyRevealObserver.disconnect();
            caseStudyRevealObserver = null;
        }
        document.documentElement.dataset.csReveal = 'off';
        if (document.body) document.body.classList.remove('cs-reveal-active');
        caseStudyRevealTargets().forEach((node) => {
            node.classList.remove('cs-reveal-item', 'cs-reveal-item--visible');
            node.style.removeProperty('--cs-reveal-delay');
            delete node.dataset.csRevealState;
        });
    }

    function revealCaseStudyBatch(nodes, baseDelay, stepDelay) {
        if (!nodes.length) return;
        nodes.forEach((node, index) => {
            if (!(node instanceof HTMLElement)) return;
            if (node.dataset.csRevealState === 'visible') return;
            node.dataset.csRevealState = 'queued';
            node.classList.remove('cs-reveal-item--visible');
            node.style.setProperty('--cs-reveal-delay', `${Math.max(0, Math.round(baseDelay + (index * stepDelay)))}ms`);
            node.getBoundingClientRect();
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    node.dataset.csRevealState = 'visible';
                    node.classList.add('cs-reveal-item--visible');
                });
            });
        });
    }

    function isRevealInView(node) {
        const rect = node.getBoundingClientRect();
        const probe = window.innerHeight * 0.9;
        return rect.bottom > 0 && rect.top < probe;
    }

    function refreshCaseStudyReveal(options = {}) {
        if (!isCaseStudyPage()) return;

        if (caseStudyRevealDisabled()) {
            clearCaseStudyReveal();
            return;
        }

        document.documentElement.dataset.csReveal = 'on';
        document.body.classList.add('cs-reveal-active');

        const allTargets = caseStudyRevealTargets();
        const pendingNow = [];

        if (!caseStudyRevealObserver && typeof IntersectionObserver === 'function') {
            caseStudyRevealObserver = new IntersectionObserver((entries) => {
                const visible = entries
                    .filter((entry) => entry.isIntersecting && entry.target instanceof HTMLElement)
                    .map((entry) => entry.target)
                    .filter((node) => node.dataset.csRevealState !== 'visible')
                    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

                if (!visible.length) return;

                revealCaseStudyBatch(visible, 60, 80);
                visible.forEach((node) => {
                    if (caseStudyRevealObserver) caseStudyRevealObserver.unobserve(node);
                });
            }, {
                rootMargin: '0px 0px -10% 0px',
                threshold: 0.18
            });
        }

        allTargets.forEach((node) => {
            if (node.dataset.csRevealState === 'visible') return;
            if (!node.classList.contains('cs-reveal-item')) {
                node.classList.add('cs-reveal-item');
            }
            if (isRevealInView(node)) {
                pendingNow.push(node);
                return;
            }
            if (caseStudyRevealObserver) {
                caseStudyRevealObserver.observe(node);
            } else {
                node.dataset.csRevealState = 'visible';
                node.classList.add('cs-reveal-item--visible');
            }
        });

        pendingNow.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
        revealCaseStudyBatch(
            pendingNow,
            options.initial ? 160 : 60,
            options.initial ? 95 : 80
        );
        if (caseStudyRevealObserver) {
            pendingNow.forEach((node) => caseStudyRevealObserver.unobserve(node));
        }
    }

    window.refreshCaseStudyReveal = refreshCaseStudyReveal;

    function navigateWithFade(link) {
        if (!link) return;

        const go = () => {
            if (typeof gsap === 'undefined') {
                window.location.href = link;
                return;
            }

            try {
                sessionStorage.setItem(FADE_KEY, JSON.stringify({ ts: Date.now() }));
            } catch (_) { /* storage unavailable, fade still works */ }

            const dur = reduceMotion ? 0.001 : 0.32;
            gsap.to(document.body, {
                autoAlpha: 0,
                duration: dur,
                ease: 'power2.in',
                onComplete: () => { window.location.href = link; }
            });
        };

        loadGsap().then(go).catch(() => { window.location.href = link; });
    }

    // Public entry the card click handler calls.
    window.startPageFadeNavigation = navigateWithFade;

    // Wire the case-study back / close links to the same fade. The
    // anchors still have real hrefs so middle-click / right-click /
    // browser-back keep working normally.
    //
    // When the user originated from the homepage's work section, going
    // back should drop them right back there — never the homepage hero.
    // We force a #work fragment onto the URL if it isn't already there.
    document.addEventListener('click', (e) => {
        const back = e.target.closest && e.target.closest('.cs-back, .nav-close');
        if (!back) return;
        const rawHref = back.getAttribute('href');
        if (!rawHref || rawHref.startsWith('#')) return; // pure in-page anchor
        e.preventDefault();
        const href = rawHref.includes('#')
            ? rawHref
            : rawHref.replace(/\/$/, '') + '#work';
        navigateWithFade(href);
    });

    // Wait until images have loaded AND fonts are ready before fading
    // the page in, so the user doesn't see layout shift / font swap
    // mid-fade. Safety timeout prevents stalling on slow assets.
    function whenPageReady(callback) {
        let done = false;
        const finish = () => { if (!done) { done = true; callback(); } };

        const onLoadAndFonts = () => {
            if (document.fonts && document.fonts.ready
                && typeof document.fonts.ready.then === 'function') {
                document.fonts.ready.then(finish, finish);
            } else {
                finish();
            }
        };

        if (document.readyState === 'complete') {
            onLoadAndFonts();
        } else {
            window.addEventListener('load', onLoadAndFonts, { once: true });
        }

        // Don't wait longer than 700ms even if a stray asset is slow.
        setTimeout(finish, 700);
    }

    // Incoming fade-in. The early head script in each HTML file added
    // .cs-incoming to <html> (which hides every body sibling except
    // #portfolio-loader via CSS) when it found a
    // pending fade in sessionStorage. We just reverse it.
    function runIncomingFadeIn() {
        const incoming = document.documentElement.classList.contains('cs-incoming');
        if (!incoming) return;
        const isCaseStudy = isCaseStudyPage();

        const play = () => {
            if (isCaseStudy) {
                const veil = document.createElement('div');
                veil.className = 'cs-case-entry-veil';
                document.body.appendChild(veil);
                document.documentElement.classList.remove('cs-incoming');
                refreshCaseStudyReveal({ initial: true });

                requestAnimationFrame(() => {
                    safeScrollToHash(window.location.hash);

                    if (typeof gsap === 'undefined') {
                        veil.style.transition = reduceMotion ? 'none' : 'opacity 980ms cubic-bezier(0.22, 1, 0.36, 1)';
                        veil.style.opacity = '0';
                        window.setTimeout(() => {
                            veil.remove();
                            document.documentElement.style.backgroundColor = '';
                        }, reduceMotion ? 0 : 1040);
                        return;
                    }

                    gsap.fromTo(veil,
                        { autoAlpha: 1 },
                        {
                            autoAlpha: 0,
                            duration: reduceMotion ? 0.001 : 0.96,
                            ease: 'power2.out',
                            onComplete: () => {
                                veil.remove();
                                document.documentElement.style.backgroundColor = '';
                            }
                        });
                });
                return;
            }

            if (typeof gsap === 'undefined') {
                document.documentElement.classList.remove('cs-incoming');
                document.documentElement.style.backgroundColor = '';
                return;
            }

            gsap.set(bodyFadeElems(), { autoAlpha: 0 });
            document.documentElement.classList.remove('cs-incoming');

            whenPageReady(() => {
                safeScrollToHash(window.location.hash);

                gsap.to(bodyFadeElems(), {
                    autoAlpha: 1,
                    duration: reduceMotion ? 0.001 : 0.45,
                    ease: 'power2.out',
                    onComplete: () => {
                        document.documentElement.style.backgroundColor = '';
                    }
                });
            });
        };

        loadGsap().then(play).catch(forcePageVisible);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runIncomingFadeIn);
    } else {
        runIncomingFadeIn();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (isCaseStudyPage()) {
                window.setTimeout(() => refreshCaseStudyReveal({ initial: true }), 60);
            }
        }, { once: true });
    } else if (isCaseStudyPage()) {
        window.setTimeout(() => refreshCaseStudyReveal({ initial: true }), 60);
    }

    // Safety: if fade-in stalls, force the page visible (Chrome can throw on
    // invalid scrollIntoView options, leaving GSAP autoAlpha at 0).
    setTimeout(forcePageVisible, 1500);

    // bfcache restore: clear any stale fade flag and force the page back
    // to fully visible (otherwise users hitting browser back into a
    // restored page would see it stuck at opacity 0).
    window.addEventListener('pageshow', (ev) => {
        if (!ev.persisted) return;
        try { sessionStorage.removeItem(FADE_KEY); } catch (_) {}
        forcePageVisible();
    });
})();

/**
 * Play page — scroll-driven mascot eye tracking.
 *
 * The mascot is a viewport-pinned layer. Because the Play page is built
 * around scrolling through content, the pupils follow the page's scroll
 * progress instead of the cursor: they start looking up at the top of the
 * page and gradually look down as the visitor scrolls. A subtle sideways
 * sway is layered on top so the gaze feels alive rather than mechanical.
 */
(function initPlayMascotEyes() {
    const mascot = document.querySelector('[data-play-mascot]');
    if (!mascot) return;

    const eyeGroups = Array.from(mascot.querySelectorAll('[data-mascot-eye]'));
    const reducedMotion = window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : { matches: false };
    if (!eyeGroups.length || reducedMotion.matches) return;

    const MAX_X = 2.2;
    const MAX_Y_UP = 2.4;
    const MAX_Y_DOWN = 2;
    // Sensitivity multipliers — boosting these >1 makes the pupils reach
    // their full deflection well before the user has panned the canvas to
    // the very edge, so the eyes feel responsive to small scrolls.
    const SENSITIVITY_X = 3;
    const SENSITIVITY_Y = 3;
    let rafId = 0;
    let progressX = 0;
    let progressY = 0;

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function updateEyes() {
        rafId = 0;
        // progressY: -1 at the top of the canvas, +1 at the bottom → eyes
        // look up at the start and gradually look down as the user pans down.
        // Multiply by sensitivity then re-clamp so small pans drive big eye
        // motion (saturating quickly at the natural -1..+1 bounds).
        const dy = clamp(progressY * SENSITIVITY_Y, -1, 1);
        const dx = clamp(progressX * SENSITIVITY_X, -1, 1);
        const yRange = dy < 0 ? MAX_Y_UP : MAX_Y_DOWN;

        eyeGroups.forEach((eye) => {
            const pupil = eye.querySelector('[data-mascot-pupil]');
            if (!pupil) return;
            pupil.style.transform = `translate(${dx * MAX_X}px, ${dy * yRange}px)`;
        });
    }

    function requestEyeUpdate() {
        if (!rafId) rafId = requestAnimationFrame(updateEyes);
    }

    // Primary signal: Play canvas pan (wheel / touch / trackpad scrolling
    // the canvas does NOT change window.scrollY because the canvas intercepts
    // wheel events). The canvas broadcasts its normalized pan progress via
    // a custom event after every applyPan().
    const canvas = document.querySelector('[data-play-canvas]');
    if (canvas) {
        canvas.addEventListener('playcanvas:pan', (e) => {
            const detail = e.detail || {};
            if (typeof detail.progressX === 'number') progressX = detail.progressX;
            if (typeof detail.progressY === 'number') progressY = detail.progressY;
            requestEyeUpdate();
        });
    }

    // Fallback: regular document scroll, in case the page ever grows beyond
    // a single viewport. Maps document scroll 0..1 onto progressY -1..+1.
    window.addEventListener('scroll', () => {
        const doc = document.documentElement;
        const max = (doc.scrollHeight || document.body.scrollHeight) - window.innerHeight;
        if (max <= 0) return;
        const t = (window.scrollY || window.pageYOffset || 0) / max;
        progressY = clamp(t * 2 - 1, -1, 1);
        requestEyeUpdate();
    }, { passive: true });

    window.addEventListener('resize', requestEyeUpdate, { passive: true });
    requestEyeUpdate();
})();

// --- Mobile Menu Interaction ---
const mobileBtn = document.getElementById('mobile-menu-btn');
const mobileNav = document.getElementById('mobile-nav-overlay');
const mobileCloseBtn = document.getElementById('mobile-nav-close');
if (mobileBtn && mobileNav) {
    const setMobileMenuState = (open) => {
        mobileBtn.classList.toggle('active', open);
        mobileNav.classList.toggle('active', open);
        document.body.classList.toggle('mobile-nav-open', open);
        mobileBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        mobileBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };

    mobileBtn.addEventListener('click', () => {
        const open = !mobileBtn.classList.contains('active');
        setMobileMenuState(open);
    });

    mobileCloseBtn?.addEventListener('click', () => {
        setMobileMenuState(false);
    });

    mobileNav.querySelectorAll('.nav-item').forEach((link) => {
        link.addEventListener('click', () => {
            setMobileMenuState(false);
        });
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && mobileNav.classList.contains('active')) {
            setMobileMenuState(false);
        }
    });
}

// --- 3D Museum Stage Gallery (Beyond the Pixels) ---
function initBeyondPixelsGallery() {
    const topContainer = document.getElementById("content-top");
    const centerContainer = document.getElementById("content-center");
    const bottomContainer = document.getElementById("content-bottom");
    if (!topContainer || !centerContainer || !bottomContainer) return;
    const containers = [topContainer, centerContainer, bottomContainer];

    // One canonical image set. We render two consecutive copies so the fold
    // stage can wrap after one full set without a visible jump.
    const images = [
        "https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@3511488fddbacb1b5e3ff3949f3b374deec9bff0/asset/gallery-beyond-pixels/gallery-web-01.jpg",
        "https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@3511488fddbacb1b5e3ff3949f3b374deec9bff0/asset/gallery-beyond-pixels/gallery-web-02.jpg",
        "https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@3511488fddbacb1b5e3ff3949f3b374deec9bff0/asset/gallery-beyond-pixels/gallery-web-03.jpg",
        "https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@3511488fddbacb1b5e3ff3949f3b374deec9bff0/asset/gallery-beyond-pixels/gallery-web-04.jpg",
        "https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@3511488fddbacb1b5e3ff3949f3b374deec9bff0/asset/gallery-beyond-pixels/gallery-web-05.jpg",
        "https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@3511488fddbacb1b5e3ff3949f3b374deec9bff0/asset/gallery-beyond-pixels/gallery-web-06.jpg",
        "https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@3511488fddbacb1b5e3ff3949f3b374deec9bff0/asset/gallery-beyond-pixels/gallery-web-07.jpg"
    ];
    const loopImages = [...images, ...images];

    containers.forEach(container => {
        container.innerHTML = '';
        loopImages.forEach(src => {
            const div = document.createElement('div');
            div.className = 'ticker-image-wrapper';
            div.innerHTML = `<img data-src="${src}" alt="" decoding="async" fetchpriority="low">`;
            container.appendChild(div);
        });
    });

    window.PortfolioLazyLoad?.scan(topContainer.parentElement || document);

    const foldsContent = [topContainer, centerContainer, bottomContainer];

    let yPos = 0;
    const scrollSpeed = 1.05;
    let tickerInView = true;
    let tickerRaf = 0;

    const getItemSpan = () => {
        const firstItem = foldsContent[1].firstElementChild;
        if (!firstItem) return 0;

        const contentStyles = window.getComputedStyle(foldsContent[1]);
        const gap = parseFloat(contentStyles.rowGap || contentStyles.gap || '0');

        return firstItem.getBoundingClientRect().height + gap;
    };

    const getLoopSpan = () => {
        const itemSpan = getItemSpan();
        if (!itemSpan) return 0;

        return itemSpan * images.length;
    };

    const wrapLoop = () => {
        const loopSpan = getLoopSpan();
        if (!loopSpan) return;

        while (yPos <= -loopSpan) {
            yPos += loopSpan;
        }
    };

    const tick = () => {
        tickerRaf = 0;
        if (!tickerInView) return;

        yPos -= scrollSpeed;
        wrapLoop();

        foldsContent.forEach((content) => {
            content.style.transform = `translate3d(0, ${yPos}px, 0)`;
        });

        tickerRaf = requestAnimationFrame(tick);
    };

    if ('IntersectionObserver' in window) {
        const stage = document.querySelector('.beyond-pixels-stage');
        if (stage) {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    tickerInView = entry.isIntersecting;
                    if (tickerInView && !tickerRaf) {
                        tickerRaf = requestAnimationFrame(tick);
                    }
                });
            }, { rootMargin: '160px 0px' });
            observer.observe(stage);
        }
    }

    window.addEventListener('resize', () => {
        wrapLoop();
        foldsContent.forEach((content) => {
            content.style.transform = `translate3d(0, ${yPos}px, 0)`;
        });
    });

    // Delay start so layout has settled before we start measuring item height.
    setTimeout(() => {
        if (!tickerRaf && tickerInView) tickerRaf = requestAnimationFrame(tick);
    }, 500);
}

onPortfolioReady(() => {
    scheduleIdleTask(initBeyondPixelsGallery, 2000);
});

// --- Camera Interaction ---
const heroCamera = document.getElementById('hero-camera');
if (heroCamera) {
    const toggleFlash = () => heroCamera.classList.toggle('flash-active');
    heroCamera.addEventListener('click', toggleFlash);
    heroCamera.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleFlash();
        }
    });
}

/**
 * About page — “More of me”: when a <video> has a <source> (or src), play on hover.
 * Add a source element inside .about-more__video to enable hover playback.
 */
(function initAboutMoreHoverVideo() {
    const root = document.querySelector('.about-more');
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    root.querySelectorAll('.about-more__card--hover-video .about-more__media--hover-video .about-more__video').forEach((video) => {
        const hasSource =
            (video.currentSrc && video.currentSrc.length > 0) ||
            (video.getAttribute('src') && video.getAttribute('src').trim().length > 0) ||
            (video.querySelector('source') && video.querySelector('source').getAttribute('src') && video.querySelector('source').getAttribute('src').trim().length > 0);

        if (!hasSource) return;

        const card = video.closest('.about-more__card--hover-video');
        if (!card) return;
        card.classList.add('has-hover-video');

        const play = () => {
            video.play().catch(() => {});
        };
        const stop = () => {
            video.pause();
            try {
                video.currentTime = 0;
            } catch (_) {
                /* nothing */
            }
        };

        card.addEventListener('mouseenter', play);
        card.addEventListener('mouseleave', stop);
    });
})();

/**
 * Home hero: mask-reveal-up (per-line), aligned with animate-text spec
 * assets/specs/mask-reveal-up.json + site_reference runtime scaling
 */
function initHeroHeadlineMaskReveal() {
    if (typeof gsap === 'undefined') return;
    const lines = document.querySelectorAll('.hero-v2__headline-line');
    if (!lines.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const yTravel = 30 * 0.58; /* y_travel_multiplier */
    const duration = (760 * 0.72) / 1000; /* enter.duration_ms * speed_multiplier */
    const stagger = (90 * 0.72) / 1000; /* enter.stagger_ms * speed_multiplier */
    const delay = 0.14; /* page paint / nav */
    const ease = 'expo.out'; /* close to cubic-bezier(0.22, 1, 0.36, 1) */

    gsap.set(lines, { opacity: 0, y: yTravel, filter: 'blur(6px)' });
    gsap.to(lines, {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        duration,
        delay,
        stagger,
        ease,
        clearProps: 'filter',
    });
}

/**
 * Home hero: hover-to-pop on .hero-v2__pixel squares.
 * Emits a small burst of colored mini-pixels from the hovered square
 * and nudges the square itself. Driven by GSAP.
 */
function initHeroPixelPop() {
    if (typeof gsap === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    const frame = document.querySelector('.hero-v2__frame');
    const squares = Array.from(document.querySelectorAll('.hero-v2__pixel'));
    if (!frame || !squares.length) return;

    const colors = ['#FF6B00', '#f97a4f', '#f9a5f6', '#96dc91', '#72C5F9'];
    const rand = gsap.utils.random;

    // Cooldown per square so a quick sweep still produces a burst but doesn't spam
    const cooldownMs = 260;

    function popSquare(sq) {
        const now = performance.now();
        const last = parseFloat(sq.dataset.lastPop || '0');
        if (now - last < cooldownMs) return;
        sq.dataset.lastPop = String(now);

        gsap.fromTo(
            sq,
            { scale: 1, y: 0 },
            {
                scale: 1.22,
                y: -4,
                duration: 0.18,
                ease: 'power3.out',
                yoyo: true,
                repeat: 1,
                transformOrigin: '50% 50%',
                overwrite: 'auto',
            }
        );

        const rect = sq.getBoundingClientRect();
        const frameRect = frame.getBoundingClientRect();
        const scaleX = rect.width ? rect.width / sq.offsetWidth : 1;
        const scaleY = rect.height ? rect.height / sq.offsetHeight : 1;
        const cx = (rect.left - frameRect.left) / scaleX + sq.offsetWidth / 2;
        const cy = (rect.top - frameRect.top) / scaleY + sq.offsetHeight / 2;

        const count = Math.round(rand(4, 7));
        for (let i = 0; i < count; i++) {
            const px = document.createElement('span');
            px.className = 'hero-v2__pixel-burst';
            const size = rand(6, 10);
            px.style.width = size + 'px';
            px.style.height = size + 'px';
            px.style.left = cx - size / 2 + 'px';
            px.style.top = cy - size / 2 + 'px';
            px.style.backgroundColor = colors[Math.floor(rand(0, colors.length - 0.0001))];
            frame.appendChild(px);

            const angle = rand(0, Math.PI * 2);
            const dist = rand(28, 58);
            gsap.fromTo(
                px,
                { scale: 0, opacity: 1, rotate: 0 },
                {
                    x: Math.cos(angle) * dist,
                    y: Math.sin(angle) * dist,
                    rotate: rand(-40, 40),
                    scale: rand(0.9, 1.1),
                    opacity: 0,
                    duration: rand(0.55, 0.85),
                    ease: 'power3.out',
                    onComplete: () => px.remove(),
                }
            );
        }
    }

    squares.forEach((sq) => {
        sq.addEventListener('mouseenter', () => popSquare(sq));
        sq.addEventListener('pointerenter', () => popSquare(sq));
    });

    // Proximity fallback: if pointer glides close to a pixel inside the frame,
    // still trigger its pop. Useful when tiny scaled squares are easy to skim past.
    const proximityPx = 14;
    frame.addEventListener('pointermove', (e) => {
        const fr = frame.getBoundingClientRect();
        const scale = fr.width / frame.offsetWidth || 1;
        const x = (e.clientX - fr.left) / scale;
        const y = (e.clientY - fr.top) / scale;

        for (let i = 0; i < squares.length; i++) {
            const sq = squares[i];
            const left = sq.offsetLeft;
            const top = sq.offsetTop;
            const right = left + sq.offsetWidth;
            const bottom = top + sq.offsetHeight;
            const dx = x < left ? left - x : x > right ? x - right : 0;
            const dy = y < top ? top - y : y > bottom ? y - bottom : 0;
            if (dx * dx + dy * dy <= proximityPx * proximityPx) {
                popSquare(sq);
            }
        }
    });
}

function scheduleDeferredHeroEffects() {
    if (!document.querySelector('.hero-v2__headline-line')) return;
    onPortfolioReady(() => {
        scheduleIdleTask(() => {
            loadGsap()
                .then(() => {
                    initHeroHeadlineMaskReveal();
                    initHeroPixelPop();
                })
                .catch(() => { /* hero text still readable without motion */ });
        }, 800);
    });
}

scheduleDeferredHeroEffects();

(function finalizePortfolioBoot() {
    const loader = document.getElementById('portfolio-loader');
    const loaderDone = !loader
        || loader.classList.contains('portfolio-loader--done')
        || !document.body.classList.contains('portfolio-loader-active');
    if (!portfolioReady && loaderDone) {
        scheduleDeferredSiteScripts();
        signalPortfolioReady();
    }
})();


/* ----------------------------------------------------------------------------
 * Play page — Infinite Scroll Canvas + Stickers
 *
 * Mounts on /play.html. Wires up:
 *   • Canvas scroll: wheel / trackpad / touch scroll updates a virtual pan.
 *     .play-world translates with that pan while .play-grid shifts its
 *     background-position from the same pan values, so the grid stays aligned
 *     to world coordinates. The pan is clamped to the outermost card bounds
 *     plus generous edge padding, so the canvas has intentional endpoints.
 *   • Card layout: each .play-card reads data-x/y/w/h/rot in world coords
 *     and gets left/top/width/height/--rot applied at mount.
 *   • Sticker drag: each [data-play-sticker] handles its own pointerdown so
 *     it moves independently of the canvas pan. Positions persist via
 *     localStorage (key: play-sticker-positions, JSON map of
 *     data-sticker-id → {x, y}) so reload preserves the user arrangement.
 *   • Initial pan centres the world's content cluster (~1500, 1000) in the
 *     viewport, then clamps into the finite canvas bounds.
 *
 * No-ops on every other page (the [data-play-canvas] hook isn't there).
 * ------------------------------------------------------------------------- */
(function initPlayCanvas() {
    const canvas = document.querySelector('[data-play-canvas]');
    const world = document.querySelector('[data-play-world]');
    const overlay = document.querySelector('.play-overlay');
    // Grid is a sibling of .play-world that paints the dots + mesh background.
    // It pans in lockstep with the world so the grid stays anchored to world
    // coordinates. Optional — page still works if the element is absent.
    const grid = document.querySelector('[data-play-grid]');
    if (!canvas || !world) return;

    const STORAGE_KEY = 'play-sticker-positions';
    const LAYOUT_STORAGE_KEY = 'play-layout-editor-v1';
    const INITIAL_WORLD_CENTER_X = 1500;
    const INITIAL_WORLD_CENTER_Y = 1000;
    const MIN_EDGE_PADDING = 260;
    const MAX_EDGE_PADDING = 520;
    const EDGE_PADDING_RATIO = 0.45;
    const TOUCH_TAP_THRESHOLD = 14;
    const DETAIL_DEFAULT_TITLE = 'Play study';
    const DETAIL_DEFAULT_DESCRIPTION = 'A visual experiment from my playground exploring motion, framing, and storytelling.';
    const DETAIL_OPEN_TOOLTIP = 'Tap outside to close';

    /* Set left / top / width / height / --rot / z-index from data-* attrs.
       Used for both cards and stickers so the HTML stays declarative.
       data-z is optional — when set it overrides the default DOM-order
       stacking, letting overlapping cards layer intentionally. */
    function applyWorldPlacement(el) {
        const x = parseFloat(el.dataset.x || '0');
        const y = parseFloat(el.dataset.y || '0');
        const w = parseFloat(el.dataset.w || '0');
        const h = parseFloat(el.dataset.h || '0');
        const rot = parseFloat(el.dataset.rot || '0');
        const z = parseFloat(el.dataset.z || '');
        if (!Number.isNaN(x)) el.style.left = x + 'px';
        if (!Number.isNaN(y)) el.style.top = y + 'px';
        if (!Number.isNaN(w) && w > 0) el.style.width = w + 'px';
        if (!Number.isNaN(h) && h > 0) el.style.height = h + 'px';
        if (!Number.isNaN(rot)) el.style.setProperty('--rot', rot + 'deg');
        if (!Number.isNaN(z)) el.style.zIndex = String(z);
    }

    function readPlacement(el, fallbackZ = 1) {
        const x = parseFloat(el.dataset.x || el.style.left || '0') || 0;
        const y = parseFloat(el.dataset.y || el.style.top || '0') || 0;
        const w = parseFloat(el.dataset.w || el.style.width || String(el.offsetWidth || 0)) || 0;
        const h = parseFloat(el.dataset.h || el.style.height || String(el.offsetHeight || 0)) || 0;
        const rot = parseFloat(el.dataset.rot || '0') || 0;
        const zRaw = parseFloat(el.dataset.z || el.style.zIndex || '');
        const z = Number.isNaN(zRaw) ? fallbackZ : zRaw;
        return { x, y, w, h, rot, z };
    }

    function writePlacement(el, placement) {
        const next = {
            ...readPlacement(el),
            ...placement
        };
        const round = value => Math.round(Number(value) * 10) / 10;
        el.dataset.x = String(round(next.x));
        el.dataset.y = String(round(next.y));
        if (next.w > 0) el.dataset.w = String(round(next.w));
        if (next.h > 0) el.dataset.h = String(round(next.h));
        el.dataset.rot = String(round(next.rot));
        el.dataset.z = String(Math.round(Number(next.z) || 0));
        applyWorldPlacement(el);
    }

    /* localStorage helpers for sticker persistence */
    function readSavedStickerPositions() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (e) { return {}; }
    }
    function readSavedLayout() {
        try {
            const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            return parsed && parsed.items ? parsed.items : {};
        } catch (e) { return {}; }
    }
    function saveStickerPosition(id, x, y) {
        try {
            const all = readSavedStickerPositions();
            all[id] = { x, y };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
        } catch (e) {}
        savePlayLayout();
    }

    // ── Card placements ──────────────────────────────────────────────
    const cards = Array.from(canvas.querySelectorAll('.play-card'));
    const stickers = Array.from(canvas.querySelectorAll('[data-play-sticker]'));
    const layoutItems = [...cards, ...stickers];

    function layoutItemId(el, index = layoutItems.indexOf(el)) {
        if (!el.dataset.playLayoutId) {
            el.dataset.playLayoutId = el.dataset.stickerId || `play-item-${index + 1}`;
        }
        return el.dataset.playLayoutId;
    }

    layoutItems.forEach((el, index) => layoutItemId(el, index));
    const defaultLayout = new Map(layoutItems.map((el, index) => [
        layoutItemId(el, index),
        readPlacement(el, el.matches('[data-play-sticker]') ? 100 + index : index + 1)
    ]));

    function collectPlayLayout() {
        const items = {};
        layoutItems.forEach((el, index) => {
            const id = layoutItemId(el, index);
            const placement = readPlacement(el, defaultLayout.get(id)?.z || index + 1);
            items[id] = {
                type: el.matches('[data-play-sticker]') ? 'sticker' : 'card',
                x: Math.round(placement.x * 10) / 10,
                y: Math.round(placement.y * 10) / 10,
                w: Math.round(placement.w * 10) / 10,
                h: Math.round(placement.h * 10) / 10,
                rot: Math.round(placement.rot * 10) / 10,
                z: Math.round(placement.z)
            };
        });
        return {
            version: 1,
            updatedAt: new Date().toISOString(),
            items
        };
    }

    function savePlayLayout() {
        try {
            localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(collectPlayLayout()));
        } catch (e) {}
    }

    function applySavedLayout() {
        const saved = readSavedLayout();
        layoutItems.forEach((el, index) => {
            const id = layoutItemId(el, index);
            if (!saved[id]) return;
            writePlacement(el, saved[id]);
        });
    }

    cards.forEach(applyWorldPlacement);
    stickers.forEach(applyWorldPlacement);

    const detail = canvas.querySelector('[data-play-detail]');
    const detailBackdrop = canvas.querySelector('[data-play-detail-close]');
    const detailShell = canvas.querySelector('[data-play-detail-shell]');
    const detailMedia = canvas.querySelector('[data-play-detail-media]');
    const detailTitle = canvas.querySelector('[data-play-detail-title]');
    const detailDescription = canvas.querySelector('[data-play-detail-description]');
    const detailStats = canvas.querySelector('[data-play-detail-stats]');
    const mascot = canvas.querySelector('[data-play-mascot]');
    const mascotTooltip = mascot?.querySelector('.play-mascot__tooltip');
    const defaultMascotTooltip = mascotTooltip?.textContent || '';
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    let detailActiveCard = null;
    let detailAnimating = false;
    let touchScrollMoved = false;
    let touchScrollResetTimer = 0;

    function syncDetailTooltip(message) {
        if (!mascotTooltip) return;
        mascotTooltip.textContent = message;
    }

    function buildDetailMediaClone(card) {
        const sourceMedia = card.querySelector('.play-card__media');
        if (!sourceMedia) return document.createElement('div');
        window.PortfolioLazyLoad?.applyLazyBg(sourceMedia);
        const clone = sourceMedia.cloneNode(true);
        const video = clone.querySelector('video');
        if (video) {
            video.muted = true;
            video.autoplay = true;
            video.loop = true;
            video.playsInline = true;
            const maybePlay = video.play?.();
            if (maybePlay?.catch) maybePlay.catch(() => {});
        }
        return clone;
    }

    function populateDetail(card) {
        const width = parseFloat(card.dataset.w || '') || card.offsetWidth || 320;
        const height = parseFloat(card.dataset.h || '') || card.offsetHeight || 420;
        const title = card.dataset.playTitle || DETAIL_DEFAULT_TITLE;
        const description = card.dataset.playDescription || DETAIL_DEFAULT_DESCRIPTION;
        const stats = [
            { value: card.dataset.playHeart, icon: 'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@3511488fddbacb1b5e3ff3949f3b374deec9bff0/asset/play-tab-assets/play_gradinettexture_heart.png', label: 'Likes' },
            { value: card.dataset.playUser, icon: 'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@3511488fddbacb1b5e3ff3949f3b374deec9bff0/asset/play-tab-assets/play_gradinettexture_user.png', label: 'Users reached' }
        ].filter((stat) => stat.value);

        detailTitle.textContent = title;
        detailDescription.textContent = description;
        detailShell.style.setProperty('--detail-aspect', `${Math.max(width, 1)} / ${Math.max(height, 1)}`);
        detailMedia.replaceChildren(buildDetailMediaClone(card));

        if (detailStats) {
            detailStats.replaceChildren(...stats.map((stat) => {
                const item = document.createElement('div');
                item.className = 'play-detail__stat';

                const icon = document.createElement('img');
                icon.src = stat.icon;
                icon.alt = '';

                const value = document.createElement('span');
                value.textContent = stat.value;
                value.setAttribute('aria-label', `${stat.value} ${stat.label}`);

                item.append(icon, value);
                return item;
            }));
            detailStats.hidden = stats.length === 0;
        }
    }

    function clearDetail() {
        detailMedia.replaceChildren();
        detailTitle.textContent = '';
        detailDescription.textContent = '';
        detailStats?.replaceChildren();
        if (detailStats) detailStats.hidden = true;
    }

    function createMorphGhost(card, rect, mode = 'card') {
        const ghost = document.createElement('div');
        ghost.className = 'play-detail-ghost';
        if (card.classList.contains('play-card--transparent')) {
            ghost.classList.add('play-detail-ghost--transparent');
        }
        ghost.style.left = `${rect.left}px`;
        ghost.style.top = `${rect.top}px`;
        ghost.style.width = `${rect.width}px`;
        ghost.style.height = `${rect.height}px`;
        ghost.appendChild(
            mode === 'detail'
                ? buildDetailMediaClone(card)
                : buildDetailMediaClone(card)
        );
        return ghost;
    }

    function waitForNextFrame() {
        return new Promise((resolve) => {
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                resolve();
            };
            requestAnimationFrame(finish);
            window.setTimeout(finish, 34);
        });
    }

    async function animateGhost(ghost, fromRect, toRect, fromRotation, toRotation, duration) {
        if (prefersReducedMotion.matches || duration <= 0) {
            ghost.style.left = `${toRect.left}px`;
            ghost.style.top = `${toRect.top}px`;
            ghost.style.width = `${toRect.width}px`;
            ghost.style.height = `${toRect.height}px`;
            ghost.style.transform = `rotate(${toRotation}deg)`;
            ghost.style.borderRadius = '18px';
            return;
        }

        let animation = null;
        try {
            animation = ghost.animate([
                {
                    left: `${fromRect.left}px`,
                    top: `${fromRect.top}px`,
                    width: `${fromRect.width}px`,
                    height: `${fromRect.height}px`,
                    borderRadius: '12px',
                    transform: `rotate(${fromRotation}deg)`
                },
                {
                    left: `${toRect.left}px`,
                    top: `${toRect.top}px`,
                    width: `${toRect.width}px`,
                    height: `${toRect.height}px`,
                    borderRadius: '18px',
                    transform: `rotate(${toRotation}deg)`
                }
            ], {
                duration,
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                fill: 'forwards'
            });
        } catch (_) {}

        let fallbackTimer = 0;
        if (animation?.finished) {
            try {
                await Promise.race([
                    animation.finished,
                    new Promise((resolve) => {
                        fallbackTimer = window.setTimeout(resolve, duration + 96);
                    })
                ]);
            } catch (_) {}
        } else {
            await new Promise((resolve) => {
                fallbackTimer = window.setTimeout(resolve, duration + 96);
            });
        }

        window.clearTimeout(fallbackTimer);
        ghost.style.left = `${toRect.left}px`;
        ghost.style.top = `${toRect.top}px`;
        ghost.style.width = `${toRect.width}px`;
        ghost.style.height = `${toRect.height}px`;
        ghost.style.transform = `rotate(${toRotation}deg)`;
        ghost.style.borderRadius = '18px';
    }

    async function openPlayCardDetail(card) {
        if (!detail || !detailBackdrop || !detailShell || !detailMedia) return;
        if (detailAnimating || detailActiveCard) return;

        detailAnimating = true;
        detailActiveCard = card;
        let ghost = null;

        try {
            populateDetail(card);
            detail.hidden = false;
            detail.setAttribute('aria-hidden', 'false');
            detail.classList.add('is-active', 'is-morphing');
            canvas.classList.add('is-detail-open');
            card.classList.add('is-source-hidden');
            syncDetailTooltip(DETAIL_OPEN_TOOLTIP);

            await waitForNextFrame();

            const fromRect = card.getBoundingClientRect();
            const toRect = detailShell.getBoundingClientRect();
            const fromRotation = parseFloat(card.dataset.rot || '0');
            ghost = createMorphGhost(card, fromRect);
            document.body.appendChild(ghost);

            await animateGhost(ghost, fromRect, toRect, fromRotation, 0, 460);
        } finally {
            detail.classList.remove('is-morphing');
            await waitForNextFrame();
            ghost?.remove();
            detailAnimating = false;
        }
    }

    async function closePlayCardDetail({ restoreFocus = true } = {}) {
        if (!detail || !detailActiveCard || detailAnimating) return;

        const card = detailActiveCard;
        detailAnimating = true;
        detail.classList.add('is-morphing');
        let ghost = null;

        try {
            const fromRect = detailShell.getBoundingClientRect();
            const toRect = card.getBoundingClientRect();
            const toRotation = parseFloat(card.dataset.rot || '0');
            ghost = createMorphGhost(card, fromRect, 'detail');
            document.body.appendChild(ghost);

            detail.classList.remove('is-active');
            syncDetailTooltip(defaultMascotTooltip);

            await animateGhost(ghost, fromRect, toRect, 0, toRotation, 380);
        } finally {
            ghost?.remove();
            card.classList.remove('is-source-hidden');
            detail.hidden = true;
            detail.setAttribute('aria-hidden', 'true');
            detail.classList.remove('is-morphing');
            canvas.classList.remove('is-detail-open');
            clearDetail();

            detailActiveCard = null;
            detailAnimating = false;

            if (restoreFocus) {
                card.focus?.({ preventScroll: true });
            }
        }
    }

    cards.forEach((card, index) => {
        const title = card.dataset.playTitle || `${DETAIL_DEFAULT_TITLE} ${index + 1}`;
        let cardTouchStart = null;
        let cardTouchMoved = false;

        card.classList.add('is-clickable');
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-haspopup', 'dialog');
        card.setAttribute('aria-label', title);

        card.addEventListener('pointerdown', (e) => {
            if (e.pointerType !== 'touch') return;
            cardTouchStart = { x: e.clientX, y: e.clientY };
            cardTouchMoved = false;
        });

        card.addEventListener('pointermove', (e) => {
            if (!cardTouchStart || e.pointerType !== 'touch') return;
            if (Math.hypot(e.clientX - cardTouchStart.x, e.clientY - cardTouchStart.y) > TOUCH_TAP_THRESHOLD) {
                cardTouchMoved = true;
            }
        });

        const resetCardTouch = () => {
            cardTouchStart = null;
            if (cardTouchMoved) {
                window.setTimeout(() => {
                    cardTouchMoved = false;
                }, 0);
                return;
            }
            cardTouchMoved = false;
        };

        card.addEventListener('pointerup', resetCardTouch);
        card.addEventListener('pointercancel', resetCardTouch);

        card.addEventListener('click', () => {
            if (canvas.classList.contains('is-editing-layout')) return;
            if (detailAnimating || detailActiveCard) return;
            if (touchScrollMoved || cardTouchMoved) return;
            openPlayCardDetail(card);
        });

        card.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            if (canvas.classList.contains('is-editing-layout')) return;
            e.preventDefault();
            if (detailAnimating || detailActiveCard) return;
            openPlayCardDetail(card);
        });
    });

    const requestDetailClose = (e) => {
        e?.preventDefault?.();
        closePlayCardDetail();
    };

    detailBackdrop?.addEventListener('pointerdown', requestDetailClose);
    detailBackdrop?.addEventListener('click', requestDetailClose);

    const shouldCloseFromOverlayTarget = (target) => {
        if (!(target instanceof Element)) return false;
        return !target.closest('.play-detail__stage');
    };

    detail?.addEventListener('pointerdown', (e) => {
        if (shouldCloseFromOverlayTarget(e.target)) {
            requestDetailClose(e);
        }
    });

    detail?.addEventListener('click', (e) => {
        if (shouldCloseFromOverlayTarget(e.target)) {
            requestDetailClose(e);
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closePlayCardDetail({ restoreFocus: false });
        }
    });

    // ── Sticker placements (initial defaults, then layered saves) ────
    const savedStickers = readSavedStickerPositions();
    stickers.forEach((el) => {
        const id = el.dataset.stickerId;
        if (id && savedStickers[id]) {
            writePlacement(el, savedStickers[id]);
        }
    });
    applySavedLayout();

    // ── Canvas scroll pan ─────────────────────────────────────────────
    let panX = 0;
    let panY = 0;
    let contentBounds = getContentBounds();

    function positiveModulo(value, size) {
        return ((value % size) + size) % size;
    }

    function normalizeWheelDelta(e) {
        let dx = e.deltaX;
        let dy = e.deltaY;
        if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
            dx *= 16;
            dy *= 16;
        } else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
            dx *= canvas.clientWidth;
            dy *= canvas.clientHeight;
        }
        if (e.shiftKey && Math.abs(dx) < 1) {
            dx = dy;
            dy = 0;
        }
        return { dx, dy };
    }

    function readGridMetrics() {
        if (!grid) return { dotStep: 30, lineStep: 90 };
        const styles = window.getComputedStyle(grid);
        const firstSize = styles.backgroundSize.split(',')[0] || '';
        const dotStep = parseFloat(firstSize) || 30;
        return {
            dotStep,
            lineStep: dotStep * 3
        };
    }

    function getEdgePadding() {
        const shorterSide = Math.min(canvas.clientWidth, canvas.clientHeight);
        return Math.max(
            MIN_EDGE_PADDING,
            Math.min(MAX_EDGE_PADDING, shorterSide * EDGE_PADDING_RATIO)
        );
    }

    function getContentBounds() {
        if (!cards.length) {
            return {
                minX: INITIAL_WORLD_CENTER_X,
                minY: INITIAL_WORLD_CENTER_Y,
                maxX: INITIAL_WORLD_CENTER_X,
                maxY: INITIAL_WORLD_CENTER_Y
            };
        }
        return cards.reduce((bounds, card) => {
            const x = parseFloat(card.style.left) || 0;
            const y = parseFloat(card.style.top) || 0;
            const w = parseFloat(card.style.width) || card.offsetWidth || 0;
            const h = parseFloat(card.style.height) || card.offsetHeight || 0;
            return {
                minX: Math.min(bounds.minX, x),
                minY: Math.min(bounds.minY, y),
                maxX: Math.max(bounds.maxX, x + w),
                maxY: Math.max(bounds.maxY, y + h)
            };
        }, {
            minX: Infinity,
            minY: Infinity,
            maxX: -Infinity,
            maxY: -Infinity
        });
    }

    function clampAxis(value, viewportSize, minContent, maxContent) {
        const edgePadding = getEdgePadding();
        const minPan = viewportSize - maxContent - edgePadding;
        const maxPan = edgePadding - minContent;
        if (minPan > maxPan) return (minPan + maxPan) / 2;
        return Math.max(minPan, Math.min(maxPan, value));
    }

    function clampPan() {
        panX = clampAxis(panX, canvas.clientWidth, contentBounds.minX, contentBounds.maxX);
        panY = clampAxis(panY, canvas.clientHeight, contentBounds.minY, contentBounds.maxY);
    }

    function applyPan() {
        clampPan();
        // Round to integer device-independent pixels so the GPU translates the
        // world by whole pixels. The grid also uses these rounded values to
        // shift background-position, keeping 1px mesh lines crisp.
        const tx = Math.round(panX);
        const ty = Math.round(panY);
        const tf = `translate3d(${tx}px, ${ty}px, 0)`;
        world.style.transform = tf;
        if (overlay) {
            const basePanX = canvas.clientWidth / 2 - INITIAL_WORLD_CENTER_X;
            const basePanY = canvas.clientHeight / 2 - INITIAL_WORLD_CENTER_Y;
            const overlayOffsetX = Math.round((panX - basePanX) * 0.22);
            const overlayOffsetY = Math.round((panY - basePanY) * 0.22);
            overlay.style.setProperty('--play-overlay-offset-x', `${overlayOffsetX}px`);
            overlay.style.setProperty('--play-overlay-offset-y', `${overlayOffsetY}px`);
        }
        if (grid) {
            const { dotStep, lineStep } = readGridMetrics();
            const dotX = positiveModulo(tx, dotStep);
            const dotY = positiveModulo(ty, dotStep);
            const lineOffset = dotStep / 2;
            const lineX = positiveModulo(tx + lineOffset, lineStep);
            const lineY = positiveModulo(ty + lineOffset, lineStep);
            grid.style.backgroundPosition = `${dotX}px ${dotY}px, ${lineX}px ${lineY}px`;
        }
        // Broadcast normalized pan progress so other modules (e.g. the bottom
        // mascot's eyes) can react to the user navigating the canvas. Both
        // axes are mapped to roughly -1..+1 around the centred starting pan,
        // saturating at the clamp limits.
        const vw = canvas.clientWidth;
        const vh = canvas.clientHeight;
        const edgePadding = getEdgePadding();
        const minPanX = vw - contentBounds.maxX - edgePadding;
        const maxPanX = edgePadding - contentBounds.minX;
        const minPanY = vh - contentBounds.maxY - edgePadding;
        const maxPanY = edgePadding - contentBounds.minY;
        const normalize = (value, lo, hi) => {
            if (hi <= lo) return 0;
            const t = (value - lo) / (hi - lo);
            // Map 0..1 → -1..+1 so the centred pan reads as 0.
            return Math.max(-1, Math.min(1, t * 2 - 1));
        };
        canvas.dispatchEvent(new CustomEvent('playcanvas:pan', {
            detail: {
                panX, panY,
                // Negate so "scrolled toward right/bottom of world" → +1.
                progressX: -normalize(panX, minPanX, maxPanX),
                progressY: -normalize(panY, minPanY, maxPanY)
            }
        }));
    }

    function centerInitialPan() {
        const vw = canvas.clientWidth;
        const vh = canvas.clientHeight;
        // Content cluster centre (rough centroid of card positions in HTML).
        panX = vw / 2 - INITIAL_WORLD_CENTER_X;
        panY = vh / 2 - INITIAL_WORLD_CENTER_Y;
        applyPan();
    }

    centerInitialPan();
    window.addEventListener('resize', () => {
        contentBounds = getContentBounds();
        applyPan();
        if (detailActiveCard && !detailAnimating) {
            closePlayCardDetail({ restoreFocus: false });
        }
    });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (detailActiveCard || detailAnimating) return;
        const { dx, dy } = normalizeWheelDelta(e);
        // Natural scroll: scrolling down/right moves the world up/left,
        // revealing content further down/right in world coordinates.
        panX -= dx;
        panY -= dy;
        applyPan();
    }, { passive: false });

    let touchScrollActive = false;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartPanX = 0;
    let touchStartPanY = 0;

    canvas.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'touch') return;
        if (detailActiveCard || detailAnimating) return;
        if (e.target.closest('[data-play-sticker]')) return;
        window.clearTimeout(touchScrollResetTimer);
        touchScrollMoved = false;
        touchScrollActive = true;
        touchStartX = e.clientX;
        touchStartY = e.clientY;
        touchStartPanX = panX;
        touchStartPanY = panY;
        try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!touchScrollActive || e.pointerType !== 'touch') return;
        e.preventDefault();
        if (Math.hypot(e.clientX - touchStartX, e.clientY - touchStartY) > TOUCH_TAP_THRESHOLD) {
            touchScrollMoved = true;
        }
        panX = touchStartPanX + (e.clientX - touchStartX);
        panY = touchStartPanY + (e.clientY - touchStartY);
        applyPan();
    });

    function endTouchScroll(e) {
        if (!touchScrollActive || e.pointerType !== 'touch') return;
        touchScrollActive = false;
        try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
        if (touchScrollMoved) {
            window.clearTimeout(touchScrollResetTimer);
            touchScrollResetTimer = window.setTimeout(() => {
                touchScrollMoved = false;
            }, 0);
        }
    }
    canvas.addEventListener('pointerup', endTouchScroll);
    canvas.addEventListener('pointercancel', endTouchScroll);

    // ── Stickers (each manages its own drag) ─────────────────────────
    canvas.querySelectorAll('[data-play-sticker]').forEach((sticker) => {
        let dragActive = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let dragStartLeft = 0;
        let dragStartTop = 0;

        sticker.addEventListener('pointerdown', (e) => {
            if (canvas.classList.contains('is-editing-layout')) return;
            if (detailActiveCard || detailAnimating) return;
            e.stopPropagation(); // sticker touch should drag the sticker, not scroll the canvas
            dragActive = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            dragStartLeft = parseFloat(sticker.style.left) || 0;
            dragStartTop = parseFloat(sticker.style.top) || 0;
            sticker.classList.add('is-dragging');
            try { sticker.setPointerCapture(e.pointerId); } catch (_) {}
        });

        sticker.addEventListener('pointermove', (e) => {
            if (!dragActive) return;
            // World scale is 1:1 (only translation), so pointer delta in
            // screen px maps directly to world-coord delta on the sticker.
            writePlacement(sticker, {
                x: dragStartLeft + e.clientX - dragStartX,
                y: dragStartTop + e.clientY - dragStartY
            });
        });

        const endDrag = (e) => {
            if (!dragActive) return;
            dragActive = false;
            sticker.classList.remove('is-dragging');
            try { sticker.releasePointerCapture(e.pointerId); } catch (_) {}
            const id = sticker.dataset.stickerId;
            if (id) {
                saveStickerPosition(
                    id,
                    parseFloat(sticker.style.left) || 0,
                    parseFloat(sticker.style.top) || 0
                );
            }
        };
        sticker.addEventListener('pointerup', endDrag);
        sticker.addEventListener('pointercancel', endDrag);
    });

    // ── Layout editor (cards + stickers) ─────────────────────────────
    const editor = canvas.querySelector('[data-play-editor]');
    const editorToggle = editor?.querySelector('[data-play-editor-toggle]');
    const editorPanel = editor?.querySelector('[data-play-editor-panel]');
    const editorCurrent = editor?.querySelector('[data-play-editor-current]');
    const editorStatus = editor?.querySelector('[data-play-editor-status]');
    const editorInputs = editor
        ? Array.from(editor.querySelectorAll('[data-play-editor-input]')).reduce((map, input) => {
            map[input.dataset.playEditorInput] = input;
            return map;
        }, {})
        : {};
    const editorActions = editor
        ? Array.from(editor.querySelectorAll('[data-play-editor-action]'))
        : [];
    const editorSelection = canvas.querySelector('[data-play-editor-selection]');
    const editorRotateHandle = canvas.querySelector('[data-play-editor-rotate-handle]');

    let layoutEditing = false;
    let selectedLayoutEl = null;
    let editorStatusTimer = 0;

    function getLayoutItemName(el) {
        if (!el) return 'No selection';
        return el.dataset.playTitle
            || el.dataset.stickerId
            || el.dataset.playLayoutId
            || 'Selected item';
    }

    function setEditorStatus(message) {
        if (!editorStatus) return;
        window.clearTimeout(editorStatusTimer);
        editorStatus.textContent = message;
    }

    function markEditorDirty() {
        setEditorStatus('Unsaved');
    }

    function markEditorSaved(message = 'Saved') {
        setEditorStatus(message);
        window.clearTimeout(editorStatusTimer);
        editorStatusTimer = window.setTimeout(() => {
            if (layoutEditing) setEditorStatus('Saved');
        }, 1400);
    }

    function syncEditorInputs() {
        const placement = selectedLayoutEl ? readPlacement(selectedLayoutEl) : null;
        Object.entries(editorInputs).forEach(([key, input]) => {
            input.disabled = !placement;
            input.value = placement ? String(Math.round((placement[key] || 0) * 10) / 10) : '';
        });
        if (editorCurrent) {
            editorCurrent.textContent = getLayoutItemName(selectedLayoutEl);
        }
    }

    function updateEditorSelectionFrame() {
        if (!editorSelection || !layoutEditing || !selectedLayoutEl) {
            if (editorSelection) editorSelection.hidden = true;
            return;
        }

        const placement = readPlacement(selectedLayoutEl);
        const width = placement.w || selectedLayoutEl.offsetWidth || 1;
        const height = placement.h || selectedLayoutEl.offsetHeight || 1;
        editorSelection.hidden = false;
        editorSelection.style.left = `${placement.x + panX}px`;
        editorSelection.style.top = `${placement.y + panY}px`;
        editorSelection.style.width = `${width}px`;
        editorSelection.style.height = `${height}px`;
        editorSelection.style.transform = `rotate(${placement.rot || 0}deg)`;
    }

    function syncEditorAfterPlacementChange() {
        contentBounds = getContentBounds();
        applyPan();
        syncEditorInputs();
        updateEditorSelectionFrame();
    }

    function updateEditorPlacement(el, placement, { commit = false } = {}) {
        if (!el) return;
        writePlacement(el, placement);
        syncEditorAfterPlacementChange();
        markEditorDirty();
        if (commit) {
            savePlayLayout();
            markEditorSaved();
        }
    }

    function clearEditorSelection() {
        if (selectedLayoutEl) selectedLayoutEl.classList.remove('is-layout-selected');
        selectedLayoutEl = null;
        syncEditorInputs();
        updateEditorSelectionFrame();
    }

    function selectLayoutItem(el) {
        if (!el || !layoutItems.includes(el)) return;
        if (selectedLayoutEl && selectedLayoutEl !== el) {
            selectedLayoutEl.classList.remove('is-layout-selected');
        }
        selectedLayoutEl = el;
        selectedLayoutEl.classList.add('is-layout-selected');
        syncEditorInputs();
        updateEditorSelectionFrame();
    }

    function setLayoutEditing(nextEditing) {
        layoutEditing = Boolean(nextEditing);
        canvas.classList.toggle('is-editing-layout', layoutEditing);
        editorToggle?.setAttribute('aria-pressed', String(layoutEditing));
        if (editorToggle) editorToggle.textContent = layoutEditing ? 'Done editing' : 'Edit layout';
        if (editorPanel) editorPanel.hidden = !layoutEditing;

        if (layoutEditing) {
            if (detailActiveCard) closePlayCardDetail({ restoreFocus: false });
            setEditorStatus('Saved');
        } else {
            clearEditorSelection();
            setEditorStatus('Saved');
        }
        updateEditorSelectionFrame();
    }

    function commitEditorLayout(message = 'Saved') {
        savePlayLayout();
        markEditorSaved(message);
    }

    function resetEditorLayout() {
        try {
            localStorage.removeItem(LAYOUT_STORAGE_KEY);
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) {}

        layoutItems.forEach((el, index) => {
            const id = layoutItemId(el, index);
            const placement = defaultLayout.get(id);
            if (placement) writePlacement(el, placement);
        });

        syncEditorAfterPlacementChange();
        markEditorSaved('Reset');
    }

    async function copyEditorLayout() {
        const text = JSON.stringify(collectPlayLayout(), null, 2);
        try {
            await navigator.clipboard.writeText(text);
            markEditorSaved('Copied');
        } catch (e) {
            const fallback = document.createElement('textarea');
            fallback.value = text;
            fallback.setAttribute('readonly', '');
            fallback.style.position = 'fixed';
            fallback.style.left = '-999px';
            document.body.appendChild(fallback);
            fallback.select();
            try {
                document.execCommand('copy');
                markEditorSaved('Copied');
            } catch (_) {
                markEditorSaved('Copy failed');
            }
            fallback.remove();
        }
    }

    function beginEditorMoveDrag(el, e) {
        if (!layoutEditing || detailActiveCard || detailAnimating) return;
        if (e.button !== 0 && e.pointerType !== 'touch') return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();

        selectLayoutItem(el);
        const start = readPlacement(el);
        const startClientX = e.clientX;
        const startClientY = e.clientY;
        const pointerId = e.pointerId;

        el.classList.add('is-layout-dragging');
        try { el.setPointerCapture(pointerId); } catch (_) {}

        const onMove = (moveEvent) => {
            if (moveEvent.pointerId !== pointerId) return;
            moveEvent.preventDefault();
            updateEditorPlacement(el, {
                x: start.x + moveEvent.clientX - startClientX,
                y: start.y + moveEvent.clientY - startClientY
            });
        };

        const onEnd = (endEvent) => {
            if (endEvent.pointerId !== pointerId) return;
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onEnd);
            window.removeEventListener('pointercancel', onEnd);
            el.classList.remove('is-layout-dragging');
            try { el.releasePointerCapture(pointerId); } catch (_) {}
            commitEditorLayout();
        };

        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onEnd);
        window.addEventListener('pointercancel', onEnd);
    }

    function beginEditorRotateDrag(e) {
        if (!layoutEditing || !selectedLayoutEl) return;
        if (e.button !== 0 && e.pointerType !== 'touch') return;

        e.preventDefault();
        e.stopPropagation();

        const placement = readPlacement(selectedLayoutEl);
        const width = placement.w || selectedLayoutEl.offsetWidth || 1;
        const height = placement.h || selectedLayoutEl.offsetHeight || 1;
        const centerX = placement.x + panX + width / 2;
        const centerY = placement.y + panY + height / 2;
        const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
        const startRotation = placement.rot || 0;
        const pointerId = e.pointerId;

        const onMove = (moveEvent) => {
            if (moveEvent.pointerId !== pointerId) return;
            moveEvent.preventDefault();
            const angle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX);
            const delta = (angle - startAngle) * 180 / Math.PI;
            updateEditorPlacement(selectedLayoutEl, {
                rot: startRotation + delta
            });
        };

        const onEnd = (endEvent) => {
            if (endEvent.pointerId !== pointerId) return;
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onEnd);
            window.removeEventListener('pointercancel', onEnd);
            commitEditorLayout();
        };

        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onEnd);
        window.addEventListener('pointercancel', onEnd);
    }

    layoutItems.forEach((item) => {
        item.addEventListener('pointerdown', (e) => {
            if (!layoutEditing) return;
            beginEditorMoveDrag(item, e);
        }, true);
    });

    editorToggle?.addEventListener('click', (e) => {
        e.preventDefault();
        setLayoutEditing(!layoutEditing);
    });

    Object.entries(editorInputs).forEach(([key, input]) => {
        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
        });
        input.addEventListener('change', () => {
            if (!selectedLayoutEl) return;
            const value = parseFloat(input.value);
            if (Number.isNaN(value)) {
                syncEditorInputs();
                return;
            }
            updateEditorPlacement(selectedLayoutEl, { [key]: value }, { commit: true });
        });
    });

    editorActions.forEach((button) => {
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            const action = button.dataset.playEditorAction;

            if (action === 'save') {
                commitEditorLayout();
                return;
            }
            if (action === 'copy') {
                await copyEditorLayout();
                return;
            }
            if (action === 'reset') {
                resetEditorLayout();
                return;
            }
            if (!selectedLayoutEl) {
                markEditorSaved('Select an item');
                return;
            }

            const placement = readPlacement(selectedLayoutEl);
            const zValues = layoutItems.map((el, index) => readPlacement(el, index + 1).z);
            const minZ = Math.min(...zValues);
            const maxZ = Math.max(...zValues);

            if (action === 'rotate-left') {
                updateEditorPlacement(selectedLayoutEl, { rot: placement.rot - 5 }, { commit: true });
            } else if (action === 'rotate-right') {
                updateEditorPlacement(selectedLayoutEl, { rot: placement.rot + 5 }, { commit: true });
            } else if (action === 'send-back') {
                updateEditorPlacement(selectedLayoutEl, { z: minZ - 1 }, { commit: true });
            } else if (action === 'bring-front') {
                updateEditorPlacement(selectedLayoutEl, { z: maxZ + 1 }, { commit: true });
            }
        });
    });

    editorRotateHandle?.addEventListener('pointerdown', beginEditorRotateDrag);

    canvas.addEventListener('playcanvas:pan', updateEditorSelectionFrame);
    window.addEventListener('resize', updateEditorSelectionFrame);
    window.addEventListener('keydown', (e) => {
        if (!layoutEditing) return;
        const target = e.target;
        if (target instanceof Element && target.closest('input, textarea, select')) return;

        if (e.key === 'Escape') {
            e.preventDefault();
            setLayoutEditing(false);
            return;
        }
        if (!selectedLayoutEl) return;

        const placement = readPlacement(selectedLayoutEl);
        const step = e.shiftKey ? 10 : 1;
        let nextPlacement = null;

        if (e.key === 'ArrowLeft') nextPlacement = { x: placement.x - step };
        if (e.key === 'ArrowRight') nextPlacement = { x: placement.x + step };
        if (e.key === 'ArrowUp') nextPlacement = { y: placement.y - step };
        if (e.key === 'ArrowDown') nextPlacement = { y: placement.y + step };
        if (e.key === '[') nextPlacement = { rot: placement.rot - step };
        if (e.key === ']') nextPlacement = { rot: placement.rot + step };
        if (e.key === 'PageDown') nextPlacement = { z: placement.z - 1 };
        if (e.key === 'PageUp') nextPlacement = { z: placement.z + 1 };

        if (!nextPlacement) return;
        e.preventDefault();
        updateEditorPlacement(selectedLayoutEl, nextPlacement, { commit: true });
    });

    syncEditorInputs();
    updateEditorSelectionFrame();
})();
