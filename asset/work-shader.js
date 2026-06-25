/* ----------------------------------------------------------------------------
 * work-shader.js — Staggered-glass shader that REPLACES the work-wall cards.
 *
 * Renders a transparent <canvas> behind #work-wall (z-index 0) and paints one
 * shader plane per .work-card. Each plane samples the card's PNG (read from the
 * inline `style="background-image: url(...)"`) and applies an 8-column
 * staggered-glass distortion driven by simplex noise + mouse velocity, masked
 * to the cards' 4px border-radius via an SDF.
 *
 * Once the first texture finishes loading, `body.webgl-cards` is toggled on so
 * the original .card-content PNG and the .work-card__meta text are hidden —
 * the cards become transparent windows showing only the shader behind them.
 *
 * If WebGL or Three.js is unavailable, or prefers-reduced-motion is set, we
 * bail and the cards render as plain PNGs (with full text labels).
 * ------------------------------------------------------------------------- */

(function () {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
    }

    const cardVertexShader = /* glsl */ `
        varying vec2 vUv;
        varying vec2 vScreenSpaceUv;

        void main() {
            vUv = uv;
            vec4 modelViewPosition = modelViewMatrix * vec4(position, 1.0);
            vec4 projectedPosition = projectionMatrix * modelViewPosition;
            vScreenSpaceUv = (projectedPosition.xy / projectedPosition.w) * 0.5 + 0.5;
            gl_Position = projectedPosition;
        }
    `;

    const cardFragmentShader = /* glsl */ `
        uniform sampler2D uImage;
        uniform vec2 uMouse;
        uniform vec2 uVelocity;
        uniform float uTime;
        uniform float uAspectRatio;
        uniform vec2 uSizePx;
        uniform float uCornerRadius;

        varying vec2 vUv;
        varying vec2 vScreenSpaceUv;

        vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
        vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
        float snoise(vec3 v){
            const vec2  C = vec2(1.0/6.0, 1.0/3.0);
            const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
            vec3 i  = floor(v + dot(v, C.yyy));
            vec3 x0 = v - i + dot(i, C.xxx);
            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min(g.xyz, l.zxy);
            vec3 i2 = max(g.xyz, l.zxy);
            vec3 x1 = x0 - i1 + 1.0 * C.xxx;
            vec3 x2 = x0 - i2 + 2.0 * C.xxx;
            vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
            i = mod(i, 289.0);
            vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
            float n_ = 1.0/7.0;
            vec3 ns = n_ * D.wyz - D.xzx;
            vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_);
            vec4 x = x_ * ns.x + ns.yyyy;
            vec4 y = y_ * ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);
            vec4 b0 = vec4(x.xy, y.xy);
            vec4 b1 = vec4(x.zw, y.zw);
            vec4 s0 = floor(b0)*2.0 + 1.0;
            vec4 s1 = floor(b1)*2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));
            vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
            vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
            vec3 p0 = vec3(a0.xy, h.x);
            vec3 p1 = vec3(a0.zw, h.y);
            vec3 p2 = vec3(a1.xy, h.z);
            vec3 p3 = vec3(a1.zw, h.w);
            vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
            p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
            vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
            m = m * m;
            return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }

        // Rounded-rect SDF so the overlay's alpha mask matches the card's CSS radius.
        float sdRoundedBox(vec2 p, vec2 b, float r) {
            vec2 q = abs(p) - b + r;
            return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
        }

        void main() {
            vec2 uv = vUv;

            // 1. Sharp 8-column staggered glass — quantize X into broad bands,
            //    each column refracted independently by simplex noise.
            float columns = 8.0;
            float colIndex = floor(uv.x * columns) / columns;
            float blockNoise = snoise(vec3(colIndex * 15.0, 0.0, uTime * 0.05));
            vec2 displacement = vec2(blockNoise * 0.045, blockNoise * 0.055);

            // 2. Liquid mouse drag — push pixels in the cursor direction with
            //    aspect-corrected falloff over the canvas.
            vec2 aspectScreenUv = vec2(vScreenSpaceUv.x * uAspectRatio, vScreenSpaceUv.y);
            vec2 aspectMouse    = vec2(uMouse.x * uAspectRatio, uMouse.y);
            float dist = distance(aspectScreenUv, aspectMouse);
            float mouseInfluence = smoothstep(0.12, 0.0, dist);
            vec2 liquidPush = uVelocity * 25.0 * mouseInfluence;
            displacement -= liquidPush;
            displacement = mix(displacement, -liquidPush, mouseInfluence * 0.7);

            vec2 finalUv = uv + displacement;

            vec3 color = texture2D(uImage, finalUv).rgb;

            // 3. Soft inner rim — lift edges 5% toward white to read as glass.
            float borderX = smoothstep(0.0, 0.015, vUv.x) * smoothstep(1.0, 0.985, vUv.x);
            float borderY = smoothstep(0.0, 0.015, vUv.y) * smoothstep(1.0, 0.985, vUv.y);
            float border  = 1.0 - (borderX * borderY);
            color = mix(color, vec3(1.0), border * 0.05);

            // 4. Rounded-corner alpha mask centered on boundary (no halo).
            //    Inside the rounded box coverage = 1.0, fading to 0.0 at corners.
            vec2 px = (vUv - 0.5) * uSizePx;
            vec2 halfBox = uSizePx * 0.5;
            float d = sdRoundedBox(px, halfBox, uCornerRadius);
            float coverage = 1.0 - smoothstep(-0.5, 0.5, d);

            // 5. Premultiplied output at full strength — the shader IS the card,
            //    not an overlay, so we paint at coverage alpha (1.0 inside).
            gl_FragColor = vec4(color * coverage, coverage);
        }
    `;

    function init() {
        if (typeof THREE === 'undefined') return;

        const container = document.getElementById('work-wall');
        if (!container) return;

        const canvas = container.querySelector('.work-shader-canvas');
        if (!canvas) return;

        const cards = Array.from(container.querySelectorAll('.work-card'));
        if (!cards.length) return;

        let renderer;
        try {
            renderer = new THREE.WebGLRenderer({
                canvas,
                antialias: true,
                alpha: true,
                premultipliedAlpha: true
            });
        } catch (err) {
            console.warn('[work-shader] WebGL renderer unavailable, falling back to PNG cards.', err);
            return;
        }

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        renderer.setPixelRatio(dpr);
        renderer.setClearColor(0x000000, 0);

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
        camera.position.z = 1;

        const planeGeometry = new THREE.PlaneGeometry(1, 1);
        const textureLoader = new THREE.TextureLoader();

        const mouse = new THREE.Vector2(0.5, 0.5);
        const targetMouse = new THREE.Vector2(0.5, 0.5);
        const velocity = new THREE.Vector2(0, 0);
        const targetVelocity = new THREE.Vector2(0, 0);

        const cardData = [];
        let firstTextureReady = false;

        cards.forEach((cardEl) => {
            const contentEl = cardEl.querySelector('.card-content');
            if (!contentEl) return;

            const bg = contentEl.style.backgroundImage || '';
            const lazyBg = contentEl.getAttribute('data-lazy-bg') || '';
            const match = bg.match(/url\((['"]?)(.*?)\1\)/);
            const url = (match && match[2]) || lazyBg;
            if (!url) return;

            const texture = textureLoader.load(
                url,
                () => {
                    if (!firstTextureReady) {
                        firstTextureReady = true;
                        // Toggle the .webgl-cards body class so CSS hides the
                        // original PNG and meta text — the shader takes over.
                        document.body.classList.add('webgl-cards');
                    }
                },
                undefined,
                (err) => {
                    console.warn('[work-shader] texture load failed:', url, err);
                }
            );
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;

            const material = new THREE.ShaderMaterial({
                vertexShader: cardVertexShader,
                fragmentShader: cardFragmentShader,
                uniforms: {
                    uImage:        { value: texture },
                    uMouse:        { value: mouse },
                    uVelocity:     { value: velocity },
                    uTime:         { value: 0 },
                    uAspectRatio:  { value: 1 },
                    uSizePx:       { value: new THREE.Vector2(100, 100) },
                    uCornerRadius: { value: 8 }
                },
                transparent: true,
                depthTest: false,
                depthWrite: false
            });

            const mesh = new THREE.Mesh(planeGeometry, material);
            scene.add(mesh);

            cardData.push({ card: cardEl, mesh, material, texture });
        });

        if (!cardData.length) {
            renderer.dispose();
            return;
        }

        let canvasW = 0;
        let canvasH = 0;
        let layoutDirty = true;

        function resize() {
            const rect = container.getBoundingClientRect();
            const w = Math.max(1, Math.round(rect.width));
            const h = Math.max(1, Math.round(rect.height));
            if (w === canvasW && h === canvasH) return;
            canvasW = w;
            canvasH = h;

            renderer.setSize(w, h, false);

            // Pixel-space ortho centered on (0, 0); canvas top-left = (-W/2, +H/2).
            camera.left = -w / 2;
            camera.right = w / 2;
            camera.top = h / 2;
            camera.bottom = -h / 2;
            camera.updateProjectionMatrix();

            const aspect = w / h;
            cardData.forEach((d) => {
                d.material.uniforms.uAspectRatio.value = aspect;
            });
            layoutDirty = true;
        }

        function layoutMeshes() {
            const containerRect = container.getBoundingClientRect();
            cardData.forEach((d) => {
                const r = d.card.getBoundingClientRect();
                if (!r.width || !r.height) return;
                // DOM origin top-left → Three world center-origin Y-up.
                const cx = (r.left - containerRect.left) + r.width / 2 - canvasW / 2;
                const cy = -((r.top - containerRect.top) + r.height / 2 - canvasH / 2);
                d.mesh.position.set(cx, cy, 0);
                d.mesh.scale.set(r.width, r.height, 1);
                d.material.uniforms.uSizePx.value.set(r.width, r.height);
            });
        }

        function onPointerMove(e) {
            if (!inView) return;
            const rect = container.getBoundingClientRect();
            const nx = (e.clientX - rect.left) / Math.max(1, rect.width);
            const ny = 1 - (e.clientY - rect.top) / Math.max(1, rect.height);
            targetVelocity.x = nx - targetMouse.x;
            targetVelocity.y = ny - targetMouse.y;
            targetMouse.x = nx;
            targetMouse.y = ny;
        }
        window.addEventListener('pointermove', onPointerMove, { passive: true });

        if (typeof ResizeObserver !== 'undefined') {
            const ro = new ResizeObserver(() => {
                resize();
                layoutDirty = true;
            });
            ro.observe(container);
            cards.forEach(card => ro.observe(card));
        }
        window.addEventListener('resize', () => {
            resize();
            layoutDirty = true;
        }, { passive: true });
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => { layoutDirty = true; }).catch(() => {});
        }
        resize();

        let inView = true;
        let rafId = 0;
        if ('IntersectionObserver' in window) {
            const io = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    inView = entry.isIntersecting;
                    if (inView && !rafId) {
                        rafId = requestAnimationFrame(animate);
                    }
                });
            }, { rootMargin: '200px 0px' });
            io.observe(container);
        }

        function animate(timeMs) {
            rafId = 0;
            if (!inView) return;

            mouse.lerp(targetMouse, 0.1);
            velocity.lerp(targetVelocity, 0.08);
            targetVelocity.multiplyScalar(0.5);

            const t = timeMs * 0.001;
            cardData.forEach((d) => {
                d.material.uniforms.uTime.value = t;
            });

            if (layoutDirty) {
                layoutMeshes();
                layoutDirty = false;
            }
            renderer.render(scene, camera);
            rafId = requestAnimationFrame(animate);
        }
        rafId = requestAnimationFrame(animate);
    }

    function loadThreeJs() {
        if (window.PortfolioLazyLoad?.loadThreeJs) {
            return window.PortfolioLazyLoad.loadThreeJs();
        }
        if (typeof THREE !== 'undefined') return Promise.resolve();
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
            script.async = true;
            script.onload = () => resolve();
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    function startWhenVisible() {
        const container = document.getElementById('work-wall');
        if (!container) return;

        const boot = () => {
            container.querySelectorAll('.card-content[data-lazy-bg]').forEach((el) => {
                window.PortfolioLazyLoad?.applyLazyBg(el);
            });

            loadThreeJs()
                .then(() => {
                    if (typeof THREE === 'undefined') return;
                    init();
                })
                .catch(() => { /* keep PNG cards */ });
        };

        if (typeof IntersectionObserver !== 'function') {
            boot();
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            observer.disconnect();
            boot();
        }, { rootMargin: '240px 0px', threshold: 0.01 });

        observer.observe(container);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startWhenVisible, { once: true });
    } else {
        startWhenVisible();
    }
})();
