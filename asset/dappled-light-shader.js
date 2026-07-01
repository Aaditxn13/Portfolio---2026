/* ----------------------------------------------------------------------------
 * dappled-light-shader.js — Decorative top-right shader on the homepage hero.
 *
 * Vanilla port of the dappled-light Three.js demo: paints a cream
 * (#EFEFEA) base with a soft, slowly swaying tree shadow projected from
 * https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@376fae850dc5ae7d0453a2ddb96c2097a6296bd6/asset/dappled-tree.png. Mounts on #hero-dappled-canvas inside
 * .hero-v2__frame; no-ops if THREE or the canvas isn't present.
 *
 * Reuses the THREE UMD global already loaded by index.html (no new
 * dependency). Sizes from the canvas's own client rect (not the window),
 * so u_resolution stays correct for the bounded ~280x600 strip.
 * ------------------------------------------------------------------------- */

(function () {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (typeof THREE === 'undefined') return;

    const canvas = document.getElementById('hero-dappled-canvas');
    if (!canvas) return;
    if (canvas.dataset.dappledShaderMounted === 'true') return;
    canvas.dataset.dappledShaderMounted = 'true';

    const reducedMotion = window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : { matches: false };

    // Pass-through vertex shader — UVs only, NDC clip already in 0..1.
    const vertexShader = /* glsl */ `
        varying vec2 vUv;

        void main() {
            vUv = uv;
            gl_Position = vec4(position, 1.0);
        }
    `;

    // Fragment shader — copied verbatim from the source demo.
    const fragmentShader = /* glsl */ `
        varying vec2 vUv;

        uniform float u_time;
        uniform vec2 u_resolution;
        uniform sampler2D u_treeTex;
        uniform float u_maskMode;
        // Theme-driven shadow tint. Light mode: warm grey (#403E39).
        // Dark mode:  near-black warm grey (#282626). Updated from JS.
        uniform vec3 u_shadowTint;
        // Dark-mode backlit moon. JS sets u_isDark to 1.0 when body has the
        // night-mode class; the rest of these drive the procedural light
        // source + ray cone behind the tree silhouette.
        uniform float u_isDark;
        uniform vec2  u_lightPos;     // UV-space position of the light source
        uniform vec2  u_lightDir;     // direction the rays travel from source
        uniform vec3  u_lightColor;   // moonlight tint (warm cream by default)

        float random(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        mat2 rotation2d(float angle) {
            float s = sin(angle);
            float c = cos(angle);
            return mat2(c, -s, s, c);
        }

        float sampleShadowMask(vec2 uv) {
            vec4 sampleColor = texture2D(u_treeTex, clamp(uv, 0.0, 1.0));
            float alphaShape = smoothstep(0.015, 0.11, sampleColor.a);
            float luminanceMask = 1.0 - dot(sampleColor.rgb, vec3(0.299, 0.587, 0.114));
            float luminanceShape = smoothstep(0.22, 0.82, luminanceMask);
            float rawMask = mix(luminanceShape, alphaShape, step(0.5, u_maskMode));
            return smoothstep(0.18, 0.86, rawMask);
        }

        float sampleBlurShadow(vec2 uv) {
            float sum = 0.0;
            float weight = 0.0;

            vec2 radiusA = vec2(12.0 / u_resolution.x, 12.0 / u_resolution.y);
            vec2 radiusB = vec2(26.0 / u_resolution.x, 26.0 / u_resolution.y);
            vec2 radiusC = vec2(42.0 / u_resolution.x, 42.0 / u_resolution.y);

            sum += sampleShadowMask(uv) * 0.14;
            weight += 0.14;

            sum += sampleShadowMask(uv + vec2( radiusA.x, 0.0)) * 0.10;
            sum += sampleShadowMask(uv + vec2(-radiusA.x, 0.0)) * 0.10;
            sum += sampleShadowMask(uv + vec2(0.0,  radiusA.y)) * 0.10;
            sum += sampleShadowMask(uv + vec2(0.0, -radiusA.y)) * 0.10;
            weight += 0.40;

            sum += sampleShadowMask(uv + radiusA) * 0.07;
            sum += sampleShadowMask(uv - radiusA) * 0.07;
            sum += sampleShadowMask(uv + vec2( radiusA.x, -radiusA.y)) * 0.07;
            sum += sampleShadowMask(uv + vec2(-radiusA.x,  radiusA.y)) * 0.07;
            weight += 0.28;

            sum += sampleShadowMask(uv + vec2( radiusB.x, 0.0)) * 0.03;
            sum += sampleShadowMask(uv + vec2(-radiusB.x, 0.0)) * 0.03;
            sum += sampleShadowMask(uv + vec2(0.0,  radiusB.y)) * 0.03;
            sum += sampleShadowMask(uv + vec2(0.0, -radiusB.y)) * 0.03;
            weight += 0.12;

            sum += sampleShadowMask(uv + radiusB) * 0.02;
            sum += sampleShadowMask(uv - radiusB) * 0.02;
            sum += sampleShadowMask(uv + vec2( radiusB.x, -radiusB.y)) * 0.02;
            sum += sampleShadowMask(uv + vec2(-radiusB.x,  radiusB.y)) * 0.02;
            weight += 0.08;

            sum += sampleShadowMask(uv + vec2( radiusC.x, 0.0)) * 0.012;
            sum += sampleShadowMask(uv + vec2(-radiusC.x, 0.0)) * 0.012;
            sum += sampleShadowMask(uv + vec2(0.0,  radiusC.y)) * 0.012;
            sum += sampleShadowMask(uv + vec2(0.0, -radiusC.y)) * 0.012;
            weight += 0.048;

            sum += sampleShadowMask(uv + radiusC) * 0.008;
            sum += sampleShadowMask(uv - radiusC) * 0.008;
            sum += sampleShadowMask(uv + vec2( radiusC.x, -radiusC.y)) * 0.008;
            sum += sampleShadowMask(uv + vec2(-radiusC.x,  radiusC.y)) * 0.008;
            weight += 0.032;

            return sum / weight;
        }

        void main() {
            float t = u_time * 0.82;
            vec2 lightDir = vec2(0.3, -0.8);
            vec2 anchor = vec2(0.5, 0.32);
            vec2 sway = vec2(
                sin(t) * 0.012 + sin(t * 0.53) * 0.006,
                cos(t * 0.8) * 0.004
            );
            float twist = sin(t * 0.72) * 0.028;

            vec2 projLocal = vUv - anchor;
            projLocal.x *= -1.0;

            // Lower scale = tree texture covers a SMALLER UV range, so the
            // tree silhouette renders larger inside the canvas. The
            // smoothstep-based edgeFade below catches anything that now
            // reaches close to the canvas walls.
            vec2 projUv = projLocal * 1.0;
            projUv = rotation2d(twist) * projUv;
            projUv += anchor + lightDir * 0.18 + sway;

            float shadowCore = sampleShadowMask(projUv);
            float shadowBlur = sampleBlurShadow(projUv);
            float shadow = mix(shadowCore, shadowBlur, 0.44);

            // Top-to-bottom fade so the shadow lands stronger near the bottom
            // of the strip (where it would naturally pool on the ground).
            float fade = smoothstep(1.2, 0.2, vUv.y);
            float shadowOpacity = 0.85;  // bumped from 0.55 for a clearer mark
            shadow *= fade * shadowOpacity;

            // Subtle high-frequency flicker on the shadow density to keep it
            // alive (preserves the pre-transparent shimmer).
            shadow *= 0.98 + 0.02 * sin(t * 2.4 + vUv.x * 6.0 + vUv.y * 4.0);

            // Output as premultiplied alpha (vec4(rgb*a, a)) — paired with the
            // CustomBlending ONE / ONE_MINUS_SRC_ALPHA on the material. Solid
            // shadow tint stays the same color; only the alpha channel gates
            // visibility, so off-shadow pixels are fully transparent and the
            // hero shows through unchanged.
            vec3 shadowTint = u_shadowTint;

            // Tiny grain on the alpha so the shadow edges don't feel digital.
            float grainField = random(gl_FragCoord.xy * 0.85 + u_time * 32.0);
            float grain = (grainField - 0.5) * 0.02;
            float alpha = clamp(shadow + grain * shadow, 0.0, 1.0);

            // Soft edge feather — fade alpha to 0 within the outermost ~12%
            // of the canvas on every side so any residual shadow that
            // happens to project to the boundary doesn't hard-cut off.
            float edgeFade =
                smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x) *
                smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
            alpha *= edgeFade;

            // Backlit moon contribution (dark mode only). Computed for every
            // pixel and then masked by darkMask, so we never branch on a
            // uniform inside the fragment shader (some Mac/iOS WebGL drivers
            // mis-optimize uniform if-statements; step+mix is rock-solid).
            // In light mode darkMask is 0, lightField collapses to 0, and the
            // final composite reduces byte-identical to the original
            // vec4(shadowTint * alpha, alpha) output.
            float darkMask = step(0.5, u_isDark);

            vec2  toPixel     = vUv - u_lightPos;
            float dist        = length(toPixel);
            // Epsilon guard against normalize(0) producing NaN at the exact
            // light-source pixel.
            vec2  toPixelNorm = toPixel / max(dist, 1e-4);
            vec2  lightDirN   = normalize(u_lightDir);
            float alignment   = max(dot(toPixelNorm, lightDirN), 0.0);

            // 1. Diffuse glow — softer, wider halo around the source so the
            //    origin doesn't read as a sharp bright dot. Falloff dropped
            //    from 3.2 → 1.6 (twice as wide) and weight from 0.55 → 0.28
            //    so it blends into the ambient field instead of punching it.
            float glow  = exp(-dist * 1.6);
            // 2. Volumetric ray cone aimed in u_lightDir — softer, wider
            //    cone so the beam reads as ambient shafts instead of a tight
            //    spotlight. Power dropped from 12 → 3.5 (much broader cone)
            //    and dist falloff slowed (0.55 → 0.40) so it spreads further
            //    before fading. Weight trimmed too so it stays subtle.
            float ray   = pow(alignment, 3.5) * exp(-dist * 0.40);

            // 3. Atmospheric haze + 4. slow breath.
            float haze   = 0.93 + 0.07 * random(vUv * 480.0 + vec2(u_time * 0.6));
            ray         *= haze;
            float breath = 0.93 + 0.07 * sin(t * 0.4);

            float lightField = clamp((glow * 0.28 + ray * 0.55) * breath, 0.0, 1.0);
            // 5. Tree occlusion — silhouette effect against the bright field.
            lightField *= (1.0 - shadow * 0.94);
            // Edge feather so the moon doesn't hard-cut at canvas walls.
            lightField *= edgeFade;
            // Light mode: zero out the entire moon contribution.
            lightField *= darkMask;

            // Composite: mix shadow tint toward moon color where lit, lift
            // alpha so the light field is visible even where there's no
            // shadow. In light mode (darkMask=0) this collapses back to the
            // original (shadowTint * alpha, alpha) output exactly.
            vec3  finalRgb   = mix(shadowTint, u_lightColor, lightField);
            float finalAlpha = max(alpha, lightField * 0.9);
            gl_FragColor = vec4(finalRgb * finalAlpha, finalAlpha);
        }
    `;

    let renderer;
    try {
        // alpha: true       → canvas reports its alpha to the page compositor.
        // premultipliedAlpha (default true) + premultiplied GLSL output gives
        // the cleanest, most browser-portable transparent canvas. The output
        // line in the fragment shader uses `vec4(rgb * a, a)` to match.
        renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
            alpha: true
        });
    } catch (err) {
        // WebGL unavailable — leave the canvas blank (page bg shows through).
        return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Transparent clear so anything behind the canvas (the hero) shows through.
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Theme tints kept here as the source of truth so the leaf system can
    // import the same hex values via CSS without drifting out of sync.
    //   Light: #403E39 → (0.251, 0.243, 0.224)
    //   Dark:  #000000 → (0.000, 0.000, 0.000)  pitch-black silhouette,
    //          relies on the moon backlight for separation from the page bg.
    const TINT_LIGHT = new THREE.Vector3(0.251, 0.243, 0.224);
    const TINT_DARK  = new THREE.Vector3(0.000, 0.000, 0.000);

    const uniforms = {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(1, 1) },
        u_treeTex: { value: null },
        u_maskMode: { value: 1.0 },
        u_shadowTint: { value: TINT_LIGHT.clone() },
        // Backlit-moon uniforms (only active when u_isDark == 1.0).
        // Tunables — push closer to the corner with (0.92, 0.88), pull
        // central with (0.7, 0.65). u_lightDir is normalized in-shader.
        u_isDark:     { value: 0 },
        u_lightPos:   { value: new THREE.Vector2(0.82, 0.78) },
        u_lightDir:   { value: new THREE.Vector2(-0.55, -0.85) },
        u_lightColor: { value: new THREE.Vector3(0.92, 0.88, 0.78) }
    };

    function applyTint() {
        const dark = document.body && document.body.classList.contains('night-mode');
        uniforms.u_shadowTint.value.copy(dark ? TINT_DARK : TINT_LIGHT);
        uniforms.u_isDark.value = dark ? 1.0 : 0.0;
    }
    // Initial set + observe so theme toggles apply live without a reload.
    applyTint();
    if (typeof MutationObserver !== 'undefined' && document.body) {
        const themeMo = new MutationObserver(applyTint);
        themeMo.observe(document.body, {
            attributes: true,
            attributeFilter: ['class']
        });
    }

    const material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        transparent: true,
        depthWrite: false,
        // Canonical premultiplied-alpha blending. Without this the default
        // (SRC_ALPHA, ONE_MINUS_SRC_ALPHA) doubles up with the renderer's
        // premultiplied output and the shadow ends up almost invisible.
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        blendEquationAlpha: THREE.AddEquation,
        blendSrcAlpha: THREE.OneFactor,
        blendDstAlpha: THREE.OneMinusSrcAlphaFactor
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    function sizeFromCanvas() {
        const w = Math.max(1, canvas.clientWidth | 0);
        const h = Math.max(1, canvas.clientHeight | 0);
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        renderer.setPixelRatio(dpr);
        renderer.setSize(w, h, false);
        // u_resolution is in physical pixels so the GLSL blur radii (12, 26,
        // 42 px) stay consistent regardless of CSS scale or DPR.
        uniforms.u_resolution.value.set(w * dpr, h * dpr);
    }

    sizeFromCanvas();

    // Load the tree mask. Until it lands, the canvas stays fully transparent
    // (the shader's alpha output evaluates to 0 against a null sampler).
    const loader = new THREE.TextureLoader();
    loader.load(
        'https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@376fae850dc5ae7d0453a2ddb96c2097a6296bd6/asset/dappled-tree.png',
        (tex) => {
            tex.wrapS = THREE.ClampToEdgeWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            uniforms.u_treeTex.value = tex;
            canvas.closest('.hero-v2__dappled')?.classList.add('is-shader-ready');
            console.info('[dappled-light] texture ready');
        },
        undefined,
        (err) => {
            console.warn('[dappled-light] failed to load https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@376fae850dc5ae7d0453a2ddb96c2097a6296bd6/asset/dappled-tree.png', err);
        }
    );

    // Resize handling: window resize for viewport changes, ResizeObserver to
    // catch the hero's --grid-scale transform recalcs that move the canvas
    // around without a window resize event.
    window.addEventListener('resize', sizeFromCanvas);
    if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(sizeFromCanvas);
        ro.observe(canvas);
    }

    // Pause when the tab is hidden or the strip is off-screen so we don't
    // burn GPU time after the hero has scrolled away.
    let documentVisible = !document.hidden;
    let canvasVisible = true;
    const clock = new THREE.Clock();
    let rafId = null;

    function requestLoop() {
        if (rafId !== null || !documentVisible || !canvasVisible) return;
        clock.start();
        rafId = requestAnimationFrame(tick);
    }

    document.addEventListener('visibilitychange', () => {
        documentVisible = !document.hidden;
        requestLoop();
    });

    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                canvasVisible = entry.isIntersecting;
                requestLoop();
            });
        }, { rootMargin: '160px 0px' });
        io.observe(canvas);
    }

    function tick() {
        if (!documentVisible || !canvasVisible) {
            rafId = null;
            return;
        }
        // Reduced motion: render once with a static time so the dappled
        // pattern still appears, then stop the loop.
        if (reducedMotion.matches) {
            uniforms.u_time.value = 1.5;
            renderer.render(scene, camera);
            rafId = null;
            return;
        }
        uniforms.u_time.value = clock.getElapsedTime();
        renderer.render(scene, camera);
        rafId = requestAnimationFrame(tick);
    }

    requestLoop();

    // If the user toggles reduce-motion mid-session, restart the loop so
    // we render the static frame (or resume the live loop, if turned off).
    if (typeof reducedMotion.addEventListener === 'function') {
        reducedMotion.addEventListener('change', () => {
            requestLoop();
        });
    }
})();
