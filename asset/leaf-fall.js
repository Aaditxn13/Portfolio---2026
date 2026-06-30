/* ----------------------------------------------------------------------------
 * leaf-fall.js — Sparse falling-leaf trickle on hover.
 *
 * Particle system layered as DOM `<img class="dappled-leaf">` siblings inside
 * `.hero-v2__dappled`. While the cursor sits in the right half of the strip,
 * a new leaf detaches every ~0.6 s (capped at MAX_LEAVES). Each leaf falls
 * with light gravity + horizontal drift + slow rotation, fades in/out, and
 * is recycled when it expires.
 *
 * Artwork lives in asset/leaves/ as pre-styled SVGs (semi-transparent black
 * with a built-in Gaussian blur), so we render them as plain <img> elements
 * — no masking, no tinting. Add or remove paths from LEAF_SVGS to vary
 * the rotation set.
 * ------------------------------------------------------------------------- */

(function () {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const wrapper = document.querySelector('.hero-v2__dappled');
    if (!wrapper) return;
    if (wrapper.dataset.leafFallMounted === 'true') return;
    wrapper.dataset.leafFallMounted = 'true';

    const reducedMotion = window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : { matches: false };

    // ── Tunables ──────────────────────────────────────────────────────────
    // Sparse, paced fall: at most two leaves on screen at once, with a real
    // beat between drops so each leaf reads on its own.
    const MAX_LEAVES   = 2;
    const SPAWN_EVERY  = 1.0;   // seconds between spawns while hovered
    const SPAWN_JITTER = 0.3;   // ± seconds randomization (range ~0.7–1.3 s)
    const GRAVITY      = 35;    // px / s² — gentle settling, not a freefall
    const WIND_DRIFT   = 8;     // px / s sideways at idle
    const LIFE_MIN     = 3.8;   // seconds
    const LIFE_MAX     = 5.2;
    const SIZE_MIN     = 50;    // px width; height auto from SVG aspect
    const SIZE_MAX     = 90;
    const FADE_IN      = 0.45;  // seconds — opacity 0 → peak
    const FADE_OUT_PCT = 0.30;  // last 30% of life fades out
    //   tree:    shadowOpacity 0.85 × canvas opacity 0.15      ≈ 0.13 visible
    //   leaves:  fill-opacity 0.38 × PEAK_ALPHA 0.3             ≈ 0.11 visible
    // Dark mode bumps the alpha to compensate for the low #282626 vs #0d0d0d
    // contrast (otherwise the leaves vanish into the background).
    const PEAK_ALPHA_LIGHT = 0.3;
    const PEAK_ALPHA_DARK  = 0.7;
    function getPeakAlpha() {
        return (document.body && document.body.classList.contains('night-mode'))
            ? PEAK_ALPHA_DARK
            : PEAK_ALPHA_LIGHT;
    }

    // SVGs are white silhouettes used as CSS masks — colour is owned by
    // style.css so light/dark themes can swap tints without touching assets.
    // `aspect` = native height / width, used to set the <div>'s height since
    // mask-image doesn't auto-size like <img>.
    const LEAF_VARIANTS = [
        { src: 'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@24d40bbbdc0ce2d228e56d62f9fcdf03f396c502/asset/leaves/leaf-1.svg', aspect: 88 / 72 },
        { src: 'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@24d40bbbdc0ce2d228e56d62f9fcdf03f396c502/asset/leaves/leaf-2.svg', aspect: 98 / 66 },
        { src: 'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@24d40bbbdc0ce2d228e56d62f9fcdf03f396c502/asset/leaves/leaf-3.svg', aspect: 71 / 66 },
        { src: 'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@24d40bbbdc0ce2d228e56d62f9fcdf03f396c502/asset/leaves/leaf-4.svg', aspect: 95 / 75 }
    ];

    // ── Hover state — same right-half check used by the (former) wind hover.
    // Window-level pointermove because the wrapper is pointer-events:none.
    let hovering = false;
    function isCursorInRightHalf(clientX, clientY) {
        const rect = wrapper.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const midX = rect.left + rect.width / 2;
        return (
            clientX >= midX &&
            clientX <= rect.right &&
            clientY >= rect.top &&
            clientY <= rect.bottom
        );
    }
    window.addEventListener('pointermove', (e) => {
        if (reducedMotion.matches) return;
        hovering = isCursorInRightHalf(e.clientX, e.clientY);
    }, { passive: true });
    document.addEventListener('mouseleave', () => { hovering = false; });

    // ── Particle pool ─────────────────────────────────────────────────────
    const leaves = [];

    function rand(min, max) { return min + Math.random() * (max - min); }

    // GLSL-style smoothstep, mirrored so the leaves' vertical alpha gradient
    // matches the tree shader's `smoothstep(1.2, 0.2, vUv.y)` exactly.
    function smoothstep(edge0, edge1, x) {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
    }

    function spawnLeaf() {
        const rect = wrapper.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;

        const el = document.createElement('div');
        el.className = 'dappled-leaf';
        const variant = LEAF_VARIANTS[Math.floor(Math.random() * LEAF_VARIANTS.length)];
        const sizeW = rand(SIZE_MIN, SIZE_MAX);
        const sizeH = sizeW * variant.aspect;
        el.style.setProperty('--leaf-mask', `url("${variant.src}")`);
        el.style.setProperty('--leaf-w', sizeW.toFixed(1) + 'px');
        el.style.setProperty('--leaf-h', sizeH.toFixed(1) + 'px');
        wrapper.appendChild(el);

        // Spawn biased to the right of the strip (where the tree silhouette
        // visually pools). Spread is wider than before so back-to-back leaves
        // don't appear to come from the exact same point — keeps things
        // sparse-feeling rather than clustered.
        const cx = w * 0.72;
        const cy = h * 0.5;
        const spreadX = Math.min(w * 0.16, 160);
        const spreadY = Math.min(h * 0.14, 90);

        const leaf = {
            el: el,
            x: cx + rand(-spreadX, spreadX),
            y: cy + rand(-spreadY, spreadY),
            vx: rand(-WIND_DRIFT, WIND_DRIFT),
            vy: rand(15, 28),                 // a small downward kick
            rot: rand(0, 360),
            rotSpd: rand(-50, 50),            // °/s
            age: 0,
            life: rand(LIFE_MIN, LIFE_MAX),
            // Each leaf has its own gentle horizontal sway frequency/phase.
            swayFreq: rand(0.6, 1.2),
            swayAmp:  rand(8, 18),
            swayPhase: rand(0, Math.PI * 2)
        };
        leaves.push(leaf);
    }

    function killLeaf(i) {
        const leaf = leaves[i];
        if (leaf && leaf.el && leaf.el.parentNode) {
            leaf.el.parentNode.removeChild(leaf.el);
        }
        leaves.splice(i, 1);
    }

    // ── Main loop ─────────────────────────────────────────────────────────
    let lastT = performance.now();
    let spawnAccumulator = 0;
    let nextSpawnIn = SPAWN_EVERY;
    let documentVisible = !document.hidden;
    let rafId = 0;

    function requestTick() {
        if (rafId || !documentVisible || reducedMotion.matches) return;
        lastT = performance.now();
        rafId = requestAnimationFrame(tick);
    }

    document.addEventListener('visibilitychange', () => {
        documentVisible = !document.hidden;
        if (documentVisible) {
            requestTick();
        }
    });

    function tick(nowMs) {
        rafId = 0;
        if (!documentVisible) return;
        if (reducedMotion.matches) {
            // Clear any lingering leaves (e.g. user toggled mid-shower).
            while (leaves.length) killLeaf(0);
            return;
        }

        const dt = Math.min((nowMs - lastT) / 1000, 0.05);  // clamp huge gaps
        lastT = nowMs;

        // Spawn cadence
        if (hovering && leaves.length < MAX_LEAVES) {
            spawnAccumulator += dt;
            if (spawnAccumulator >= nextSpawnIn) {
                spawnLeaf();
                spawnAccumulator = 0;
                nextSpawnIn = SPAWN_EVERY + rand(-SPAWN_JITTER, SPAWN_JITTER);
            }
        } else {
            // While idle, decay the accumulator so re-entering doesn't
            // immediately dump a queued leaf — there's a tiny prep beat.
            spawnAccumulator = Math.max(0, spawnAccumulator - dt * 0.5);
        }

        // Physics + render
        const rect = wrapper.getBoundingClientRect();
        const fallLimit = rect.height + 80;  // a little past the strip bottom

        for (let i = leaves.length - 1; i >= 0; i--) {
            const leaf = leaves[i];
            leaf.age += dt;

            // Horizontal: base drift + per-leaf sway (looks like air resistance)
            const sway = Math.sin(leaf.age * leaf.swayFreq + leaf.swayPhase) * leaf.swayAmp;
            leaf.vx += 0;  // (no continuous wind; sway carries it)
            leaf.x  += (leaf.vx + sway * dt * 4) * dt;

            // Vertical: gentle gravity
            leaf.vy += GRAVITY * dt;
            leaf.y  += leaf.vy * dt;

            // Spin
            leaf.rot += leaf.rotSpd * dt;

            // Opacity envelope (life cycle in/out)
            const fadeIn  = Math.min(1, leaf.age / FADE_IN);
            const tailStart = leaf.life * (1 - FADE_OUT_PCT);
            const fadeOut = leaf.age <= tailStart
                ? 1
                : Math.max(0, 1 - (leaf.age - tailStart) / (leaf.life - tailStart));

            // Vertical fade — 1:1 port of the tree shader's
            //   smoothstep(1.2, 0.2, vUv.y)
            // where vUv.y=1 is canvas top (weak) and vUv.y=0 is bottom (strong).
            // Leaves spawn at center (~0.78× peak) and brighten to 1× as they
            // descend, mirroring the tree's bottom-stronger lighting pool.
            const vUvY = 1 - (leaf.y / rect.height);
            const verticalFade = smoothstep(1.2, 0.2, vUvY);

            // High-frequency shimmer — same coefficients as the GLSL
            //   shadow *= 0.98 + 0.02 * sin(t * 2.4 + …)
            // so the leaves breathe on the same heartbeat as the shader.
            const shimmer = 0.98 + 0.02 * Math.sin(leaf.age * 2.4 + leaf.swayPhase);

            const alpha = Math.min(fadeIn, fadeOut) * getPeakAlpha() * verticalFade * shimmer;

            // Push to CSS vars in one set of writes per leaf
            const s = leaf.el.style;
            s.setProperty('--x', leaf.x.toFixed(1) + 'px');
            s.setProperty('--y', leaf.y.toFixed(1) + 'px');
            s.setProperty('--r', leaf.rot.toFixed(1) + 'deg');
            s.setProperty('--o', alpha.toFixed(3));

            if (leaf.age >= leaf.life || leaf.y > fallLimit) {
                killLeaf(i);
            }
        }

        if (hovering || leaves.length) {
            rafId = requestAnimationFrame(tick);
        }
    }

    window.addEventListener('pointermove', () => {
        if (hovering || leaves.length) requestTick();
    }, { passive: true });

    // If the user toggles reduce-motion mid-session, restart cleanly.
    if (typeof reducedMotion.addEventListener === 'function') {
        reducedMotion.addEventListener('change', () => {
            if (!reducedMotion.matches) {
                requestTick();
            } else if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = 0;
            }
        });
    }
})();
