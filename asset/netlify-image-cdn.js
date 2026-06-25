(function () {
    const CDN_PATH = '/.netlify/images';
    const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|avif|gif)(?:[?#].*)?$/i;
    const SKIP_EXTENSIONS = /\.(svg|mp4|mov|m4v|webm|json|mp3|wav|ogg|ttf|woff2?)(?:[?#].*)?$/i;
    const WIDTHS = [240, 320, 480, 640, 768, 960, 1200, 1440, 1600, 1920, 2400];
    const DEFAULT_QUALITY = 82;
    const backgroundProbes = new Set();

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

    const nearestWidth = (element, requestedWidth) => {
        const rawWidth = Number(requestedWidth) || element?.getBoundingClientRect?.().width || element?.naturalWidth || 1200;
        const scaledWidth = Math.ceil(rawWidth * Math.min(window.devicePixelRatio || 1, 2));
        return WIDTHS.find((width) => width >= scaledWidth) || WIDTHS[WIDTHS.length - 1];
    };

    const netlifyImageUrl = (src, options = {}) => {
        if (!enabled || !isEligibleImage(src)) return src;

        const params = [`url=${encodeSourcePath(pathWithQuery(src))}`];

        if (options.width !== false) {
            params.push(`w=${nearestWidth(options.element, options.width)}`);
        }

        params.push(`q=${options.quality || DEFAULT_QUALITY}`);
        return `${CDN_PATH}?${params.join('&')}`;
    };

    window.netlifyImageUrl = netlifyImageUrl;

    const rewriteSrcset = (img) => {
        const srcset = img.getAttribute('srcset');
        if (!srcset || img.dataset.netlifyCdnOriginalSrcset) return;

        const rewritten = srcset.split(',').map((entry) => {
            const [url, ...descriptor] = entry.trim().split(/\s+/);
            if (!isEligibleImage(url)) return entry.trim();
            return [netlifyImageUrl(url, { element: img }), ...descriptor].join(' ');
        }).join(', ');

        if (rewritten !== srcset) {
            img.dataset.netlifyCdnOriginalSrcset = srcset;
            img.setAttribute('srcset', rewritten);
        }
    };

    const rewriteImage = (img) => {
        if (img.dataset.netlifyCdnFailed === 'true' || img.dataset.netlifyImageCdn === 'skip') return;

        const original = img.dataset.netlifyCdnOriginalSrc || img.getAttribute('src');
        if (!original || !isEligibleImage(original)) return;

        const cdnSrc = netlifyImageUrl(original, { element: img });
        if (cdnSrc === original) return;

        img.dataset.netlifyCdnOriginalSrc = original;
        img.addEventListener('error', restoreOriginalImage, { once: true });
        img.setAttribute('src', cdnSrc);

        if (!img.hasAttribute('loading')) img.setAttribute('loading', 'lazy');
        if (!img.hasAttribute('decoding')) img.setAttribute('decoding', 'async');

        rewriteSrcset(img);
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

        const original = video.dataset.netlifyCdnOriginalPoster || video.getAttribute('poster');
        if (!original || !isEligibleImage(original)) return;

        const cdnPoster = netlifyImageUrl(original, { element: video });
        if (cdnPoster === original) return;

        video.dataset.netlifyCdnOriginalPoster = original;
        video.setAttribute('poster', cdnPoster);
    };

    const rewriteInlineBackground = (element) => {
        if (element.dataset.netlifyCdnFailed === 'true' || element.dataset.netlifyImageCdn === 'skip') return;

        const style = element.getAttribute('style');
        if (!style || !style.includes('url(')) return;

        const cdnUrls = [];
        const rewritten = style.replace(/url\((['"]?)(.*?)\1\)/g, (match, quote, url) => {
            if (!isEligibleImage(url)) return match;
            const cdnUrl = netlifyImageUrl(url, { element });
            if (cdnUrl === url) return match;
            cdnUrls.push(cdnUrl);
            return `url("${cdnUrl}")`;
        });

        if (rewritten !== style) {
            element.dataset.netlifyCdnOriginalStyle = style;
            element.setAttribute('style', rewritten);
            cdnUrls.forEach((cdnUrl) => {
                const probe = new Image();
                backgroundProbes.add(probe);
                probe.onload = () => backgroundProbes.delete(probe);
                probe.onerror = () => {
                    backgroundProbes.delete(probe);
                    if (element.dataset.netlifyCdnOriginalStyle) {
                        element.dataset.netlifyCdnFailed = 'true';
                        element.setAttribute('style', element.dataset.netlifyCdnOriginalStyle);
                    }
                };
                probe.src = cdnUrl;
            });
        }
    };

    const rewriteNode = (root = document) => {
        if (!enabled) return;

        const elementRoot = root.nodeType === Node.ELEMENT_NODE ? root : document;
        if (elementRoot.matches?.('img')) rewriteImage(elementRoot);
        if (elementRoot.matches?.('video[poster]')) rewritePoster(elementRoot);
        if (elementRoot.matches?.('[style*="url("]')) rewriteInlineBackground(elementRoot);

        elementRoot.querySelectorAll?.('img').forEach(rewriteImage);
        elementRoot.querySelectorAll?.('video[poster]').forEach(rewritePoster);
        elementRoot.querySelectorAll?.('[style*="url("]').forEach(rewriteInlineBackground);
    };

    if (enabled) {
        requestAnimationFrame(() => rewriteNode(document));
        window.addEventListener('load', () => rewriteNode(document), { once: true });

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => rewriteNode(node));
                    return;
                }

                if (mutation.type === 'attributes') {
                    rewriteNode(mutation.target);
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
