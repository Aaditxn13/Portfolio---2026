(function () {
    const CDN_PATH = '/.netlify/images';
    const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|avif)(?:[?#].*)?$/i;
    const SKIP_EXTENSIONS = /\.(gif|svg|mp4|mov|m4v|webm|json|mp3|wav|ogg|ttf|woff2?)(?:[?#].*)?$/i;
    const WIDTHS = [240, 320, 480, 640, 768, 960, 1080, 1200, 1440, 1600, 1920];
    const DEFAULT_QUALITY = 75;
    const HERO_QUALITY = 78;
    const LAZY_ROOT_MARGIN = '280px 0px';

    const isLocalPreview = () => {
        const { protocol, hostname } = window.location;
        return protocol === 'file:' || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    };

    const isKnownNonNetlifyHost = () => {
        const hostname = window.location.hostname.toLowerCase();
        return hostname === 'github.com' || hostname.endsWith('.github.io');
    };

    const enabled = !isLocalPreview() && !isKnownNonNetlifyHost();

    const unwrapCssUrl = (value) => {
        if (!value) return '';
        return value.trim().replace(/^url\((['"]?)(.*)\1\)$/i, '$2').trim();
    };

    const isEligibleImage = (src) => {
        const value = unwrapCssUrl(src);
        if (!value || value.startsWith('#') || value.startsWith('data:') || value.startsWith('blob:')) {
            return false;
        }

        if (value.includes(CDN_PATH) || SKIP_EXTENSIONS.test(value)) {
            return false;
        }

        try {
            const url = new URL(value, window.location.href);
            return url.origin === window.location.origin && IMAGE_EXTENSIONS.test(url.pathname);
        } catch (error) {
            return false;
        }
    };

    const pathWithQuery = (src) => {
        const url = new URL(unwrapCssUrl(src), window.location.href);
        return `${url.pathname}${url.search}`;
    };

    const encodeSourcePath = (value) => encodeURI(value)
        .replace(/\?/g, '%3F')
        .replace(/&/g, '%26')
        .replace(/#/g, '%23');

    const nearestWidth = (requestedWidth) => {
        const scaledWidth = Math.ceil(Number(requestedWidth) || 960);
        return WIDTHS.find((width) => width >= scaledWidth) || WIDTHS[WIDTHS.length - 1];
    };

    const inferContext = (element) => {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) {
            return { maxWidth: 960, quality: DEFAULT_QUALITY, eager: false };
        }

        if (element.matches?.('.cs-page-hero img, .pajelly-cs-hero-img img, [data-netlify-priority="high"]')) {
            return { maxWidth: 1200, quality: HERO_QUALITY, eager: true };
        }

        if (element.closest?.('.work-card .card-content, .card-content')) {
            return { maxWidth: 720, quality: DEFAULT_QUALITY, eager: false };
        }

        if (element.closest?.('.cs-editor-media-slot, .cs-block--image, .cs-block--horizontal, .cs-bento, .cs-media-grid')) {
            return { maxWidth: 1080, quality: DEFAULT_QUALITY, eager: false };
        }

        if (element.closest?.('.footer-grass-scene, .about-more__poster, .ticker-image-wrapper')) {
            return { maxWidth: 960, quality: 72, eager: false };
        }

        if (element.closest?.('.beyond-illustration, [data-site-header]')) {
            return { maxWidth: 480, quality: 72, eager: false };
        }

        const attrWidth = Number(element.getAttribute?.('data-netlify-width'));
        if (attrWidth > 0) {
            return { maxWidth: attrWidth, quality: DEFAULT_QUALITY, eager: false };
        }

        const rectWidth = element.getBoundingClientRect?.().width || 0;
        const layoutWidth = rectWidth > 4
            ? Math.ceil(rectWidth * Math.min(window.devicePixelRatio || 1, 2))
            : 960;

        return {
            maxWidth: Math.min(layoutWidth, 1200),
            quality: DEFAULT_QUALITY,
            eager: element.getAttribute?.('loading') !== 'lazy'
                && element.getAttribute?.('fetchpriority') === 'high'
        };
    };

    const netlifyImageUrl = (src, options = {}) => {
        if (!enabled || !isEligibleImage(src)) return src;

        const element = options.element || null;
        const context = inferContext(element);
        const params = [`url=${encodeSourcePath(pathWithQuery(src))}`];

        if (options.width !== false) {
            const requested = options.width || options.maxWidth || context.maxWidth;
            const measured = element?.getBoundingClientRect?.().width;
            const layoutWidth = measured && measured > 4
                ? Math.ceil(measured * Math.min(window.devicePixelRatio || 1, 2))
                : requested;
            params.push(`w=${nearestWidth(Math.min(layoutWidth, requested || context.maxWidth))}`);
        }

        params.push(`q=${options.quality || context.quality || DEFAULT_QUALITY}`);
        return `${CDN_PATH}?${params.join('&')}`;
    };

    window.netlifyImageUrl = netlifyImageUrl;

    let isApplying = false;
    let lazyObserver = null;
    const pendingLazy = new Set();

    const markDone = (node) => {
        if (node && node.dataset) node.dataset.netlifyImageCdn = 'done';
    };

    const rewriteSrcset = (img, context) => {
        const srcset = img.getAttribute('srcset');
        if (!srcset || img.dataset.netlifyCdnOriginalSrcset) return;

        const rewritten = srcset.split(',').map((entry) => {
            const [url, ...descriptor] = entry.trim().split(/\s+/);
            if (!isEligibleImage(url)) return entry.trim();
            return [netlifyImageUrl(url, { element: img, maxWidth: context.maxWidth }), ...descriptor].join(' ');
        }).join(', ');

        if (rewritten !== srcset) {
            img.dataset.netlifyCdnOriginalSrcset = srcset;
            img.setAttribute('srcset', rewritten);
        }
    };

    const applyImageSrc = (img, original, context) => {
        const cdnSrc = netlifyImageUrl(original, { element: img, maxWidth: context.maxWidth, quality: context.quality });
        if (cdnSrc === original) {
            markDone(img);
            return;
        }

        if (!img.dataset.netlifyCdnOriginalSrc) {
            img.dataset.netlifyCdnOriginalSrc = original;
        }

        if (img.getAttribute('src') === cdnSrc) {
            markDone(img);
            rewriteSrcset(img, context);
            return;
        }

        img.addEventListener('error', restoreOriginalImage, { once: true });
        img.setAttribute('src', cdnSrc);
        markDone(img);

        if (!img.hasAttribute('loading')) {
            img.setAttribute('loading', context.eager ? 'eager' : 'lazy');
        }
        if (!img.hasAttribute('decoding')) img.setAttribute('decoding', 'async');
        if (context.eager && !img.hasAttribute('fetchpriority')) {
            img.setAttribute('fetchpriority', 'high');
        }

        rewriteSrcset(img, context);
    };

    const rewriteImage = (img, options = {}) => {
        if (img.dataset.netlifyCdnFailed === 'true' || img.dataset.netlifyImageCdn === 'skip') return;
        if (img.dataset.netlifyImageCdn === 'done') return;

        const original = img.dataset.netlifyCdnOriginalSrc || img.getAttribute('src');
        if (!original || !isEligibleImage(original)) return;

        const context = inferContext(img);
        if (options.defer && !context.eager) {
            pendingLazy.add(img);
            lazyObserver?.observe(img);
            return;
        }

        applyImageSrc(img, original, context);
    };

    const restoreOriginalImage = (event) => {
        const img = event.currentTarget;
        const original = img.dataset.netlifyCdnOriginalSrc;
        if (!original || img.getAttribute('src') === original) return;

        img.dataset.netlifyCdnFailed = 'true';
        if (img.dataset.netlifyCdnOriginalSrcset) {
            img.setAttribute('srcset', img.dataset.netlifyCdnOriginalSrcset);
        } else {
            img.removeAttribute('srcset');
        }
        img.setAttribute('src', original);
    };

    const rewritePoster = (video) => {
        if (video.dataset.netlifyCdnFailed === 'true' || video.dataset.netlifyImageCdn === 'skip') return;
        if (video.dataset.netlifyImageCdn === 'done') return;

        const currentPoster = video.getAttribute('poster');
        const original = video.dataset.netlifyCdnOriginalPoster || currentPoster;
        if (!original || !isEligibleImage(original)) return;

        const context = inferContext(video);
        const cdnPoster = netlifyImageUrl(original, { element: video, maxWidth: context.maxWidth, quality: context.quality });
        if (cdnPoster === original) return;

        if (!video.dataset.netlifyCdnOriginalPoster) {
            video.dataset.netlifyCdnOriginalPoster = original;
        }

        if (currentPoster === cdnPoster) {
            markDone(video);
            return;
        }

        video.setAttribute('poster', cdnPoster);
        markDone(video);
    };

    const rewriteInlineBackground = (element, options = {}) => {
        if (element.dataset.netlifyCdnFailed === 'true' || element.dataset.netlifyImageCdn === 'skip') return;
        if (element.dataset.netlifyImageCdn === 'done') return;

        const style = element.getAttribute('style');
        if (!style || !style.includes('url(')) return;

        const context = inferContext(element);
        const rewritten = style.replace(/url\((['"]?)(.*?)\1\)/g, (match, quote, url) => {
            if (!isEligibleImage(url)) return match;
            const cdnUrl = netlifyImageUrl(url, { element, maxWidth: context.maxWidth, quality: context.quality });
            return cdnUrl === url ? match : `url("${cdnUrl}")`;
        });

        if (rewritten !== style) {
            element.dataset.netlifyCdnOriginalStyle = style;
            element.setAttribute('style', rewritten);
            markDone(element);
        }
    };

    const shouldDeferNode = (node) => {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
        if (node.matches?.('.cs-page-hero img, [data-netlify-priority="high"]')) return false;
        if (node.closest?.('.cs-page-hero, .work-card')) return false;
        if (node.getAttribute?.('loading') === 'eager' || node.getAttribute?.('fetchpriority') === 'high') return false;
        return true;
    };

    const rewriteNode = (root = document, options = {}) => {
        if (!enabled || isApplying) return;

        isApplying = true;
        try {
            const elementRoot = root.nodeType === Node.ELEMENT_NODE ? root : document;
            const defer = options.defer !== false;

            if (elementRoot.matches?.('img')) {
                rewriteImage(elementRoot, { defer: defer && shouldDeferNode(elementRoot) });
            }
            if (elementRoot.matches?.('video[poster]')) rewritePoster(elementRoot);
            if (elementRoot.matches?.('[style*="url("]')) {
                rewriteInlineBackground(elementRoot, { defer: defer && shouldDeferNode(elementRoot) });
            }

            elementRoot.querySelectorAll?.('img').forEach((img) => {
                rewriteImage(img, { defer: defer && shouldDeferNode(img) });
            });
            elementRoot.querySelectorAll?.('video[poster]').forEach(rewritePoster);
            elementRoot.querySelectorAll?.('[style*="url("]').forEach((element) => {
                rewriteInlineBackground(element, { defer: defer && shouldDeferNode(element) });
            });
        } finally {
            isApplying = false;
        }
    };

    const ensureLazyObserver = () => {
        if (lazyObserver || typeof IntersectionObserver !== 'function') return;

        lazyObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                const target = entry.target;
                lazyObserver.unobserve(target);
                pendingLazy.delete(target);

                if (target.matches('img')) {
                    const original = target.dataset.netlifyCdnOriginalSrc || target.getAttribute('src');
                    if (original && isEligibleImage(original)) {
                        applyImageSrc(target, original, inferContext(target));
                    }
                    return;
                }

                if (target.matches('[style*="url("]')) {
                    rewriteInlineBackground(target, { defer: false });
                }
            });
        }, { rootMargin: LAZY_ROOT_MARGIN, threshold: 0.01 });

        pendingLazy.forEach((node) => lazyObserver.observe(node));
    };

    if (enabled) {
        requestAnimationFrame(() => {
            rewriteNode(document, { defer: true });
            ensureLazyObserver();
        });

        window.addEventListener('load', () => {
            rewriteNode(document, { defer: true });
            ensureLazyObserver();
        }, { once: true });

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => rewriteNode(node, { defer: true }));
                    ensureLazyObserver();
                    return;
                }

                if (mutation.type === 'attributes') {
                    const target = mutation.target;
                    if (target.dataset?.netlifyImageCdn === 'done') return;
                    rewriteNode(target, { defer: shouldDeferNode(target) });
                    ensureLazyObserver();
                }
            });
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'srcset', 'poster', 'style']
        });
    }
})();
