(function () {
    'use strict';

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
