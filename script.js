/*
// =============================================
// Sunlit Light System (sunlit.place style)
// Generates window-blind shadow bars via JS
// =============================================

const shuttersEl = document.getElementById('shutters');
const sunlitContainer = document.getElementById('sunlit-container');
const nightOverlay = document.getElementById('night-overlay');

let isNight = false;
let screenWidth = window.innerWidth;
let screenHeight = window.innerHeight;
let shutterElements = []; // Store references to shutter divs

// Calculate shutter count
function getShutterCount() {
    return Math.ceil(screenHeight / 36);
}

// Create the initial shutter DOM elements
function createShutters() {
    if (!shuttersEl) return;
    shuttersEl.innerHTML = '';
    shutterElements = [];

    const count = getShutterCount();
    for (let i = 0; i < count; i++) {
        const div = document.createElement('div');
        div.className = 'shutter';
        shuttersEl.appendChild(div);
        shutterElements.push(div);
    }

    // Apply initial positions (no transition on first paint)
    updateShutterPositions(false);
}

// Update positions/sizes of existing shutter elements
// If `animate` is true, CSS transitions will handle the animation
function updateShutterPositions(animate = true) {
    const shutterHeight = screenWidth < 600 ? 42 : 56;
    const shutterGap = screenWidth < 600 ? 16 : 8;
    const totalHeight = shutterHeight + shutterGap;
    const stagger = 0.01 * screenWidth;

    const multiplier = isNight ? 1.15 : 1;
    const height = isNight ? 20 : shutterHeight;
    const count = shutterElements.length;

    // Stagger delay per bar (cascading blind roll effect)
    const delayPerBar = 0.015; // 15ms between each bar

    shutterElements.forEach((div, i) => {
        const top = i * totalHeight * multiplier - 300;
        const left = stagger * i;

        if (animate) {
            // Apply staggered delay — bars cascade from top to bottom
            div.style.transitionDelay = `${i * delayPerBar}s`;
        } else {
            // Instant reposition on resize — no transitions
            div.style.transition = 'none';
            div.style.transitionDelay = '0s';
        }

        div.style.top = `${top}px`;
        div.style.left = `-${left}px`;
        div.style.height = `${height}px`;
    });

    // Re-enable transitions after instant reposition
    if (!animate) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                shutterElements.forEach(div => {
                    div.style.transition = '';
                    div.style.transitionDelay = '0s';
                });
            });
        });
    }
}

// Initialize shutters on load
createShutters();
*/

// --- Shared Header ---
const headerMount = document.querySelector('[data-site-header]');

if (headerMount) {
    const currentPage = headerMount.getAttribute('data-page') || '';
    const isActive = page => currentPage === page ? ' is-active' : '';

    headerMount.innerHTML = `
        <header class="navbar">
            <nav class="container">
                <div class="nav-links left">
                    <a href="index.html#work" class="nav-item${isActive('home')}">work</a>
                    <a href="play.html" class="nav-item${isActive('play')}">play</a>
                </div>

                <a href="index.html" class="logo-circle" aria-label="Go to homepage">
                    <img src="asset/Logo.svg" alt="AS Logo" class="logo-img">
                </a>

                <div class="nav-links right">
                    <a href="about.html" class="nav-item${isActive('about')}">about me</a>
                    <a href="resume.html" class="nav-item${isActive('resume')}">resume</a>
                </div>

                <div class="mobile-menu-btn" id="mobile-menu-btn" aria-label="Open menu">
                    <span></span>
                    <span></span>
                </div>
            </nav>

            <div class="mobile-nav-overlay" id="mobile-nav-overlay">
                <a href="index.html" class="nav-item">home</a>
                <a href="play.html" class="nav-item">play</a>
                <a href="about.html" class="nav-item">about me</a>
                <a href="resume.html" class="nav-item">resume</a>
                <a href="contact.html" class="nav-item">contact</a>
            </div>
        </header>
    `;
}

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

// Create dynamic custom cursor label
const cursorLabel = document.createElement('div');
cursorLabel.id = 'custom-cursor-label';
document.body.appendChild(cursorLabel);

let cursorTimeout;

workCards.forEach(card => {
    card.addEventListener('click', () => {
        const link = card.getAttribute('data-link');
        if (link) {
            window.location.href = link;
        }
    });

    // Custom Cursor tracking & GSAP Hover Enter
    card.addEventListener('mouseenter', (e) => {
        clearTimeout(cursorTimeout);
        const title = card.getAttribute('data-title');
        const desc = card.getAttribute('data-desc');
        // Structure as a clean one-liner with muted description
        cursorLabel.innerHTML = `<strong>${title}</strong> &nbsp;—&nbsp; <span style="opacity: 0.7;">${desc}</span>`;
        cursorLabel.style.opacity = '1';

        // GSAP Initialization
        gsap.to(card, {
            scale: 1.02,
            duration: 0.4,
            ease: 'power2.out',
            boxShadow: '0 20px 40px rgba(0,0,0,0.12)'
        });
    });

    card.addEventListener('mouseleave', () => {
        cursorTimeout = setTimeout(() => {
            cursorLabel.style.opacity = '0';
        }, 50); // Small 50ms buffer to ensure smooth crossover between adjacent cards

        // GSAP Reset
        gsap.to(card, {
            rotationX: 0,
            rotationY: 0,
            scale: 1,
            duration: 0.8,
            ease: 'elastic.out(1, 0.5)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
        });
    });

    card.addEventListener('mousemove', (e) => {
        // Offset slightly above and to the right of the actual cursor pointer
        cursorLabel.style.left = `${e.clientX + 15}px`;
        cursorLabel.style.top = `${e.clientY - 15}px`;

        // GSAP Parallax 3D Math
        const rect = card.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const mouseX = e.clientX - centerX;
        const mouseY = e.clientY - centerY;

        // Calculate tilt
        const tiltX = (mouseY / (rect.height / 2)) * -3;
        const tiltY = (mouseX / (rect.width / 2)) * 3;

        gsap.to(card, {
            rotationX: tiltX,
            rotationY: tiltY,
            duration: 0.4,
            ease: 'none',
            transformPerspective: 1200
        });
    });
});

// --- Mobile Menu Interaction ---
const mobileBtn = document.getElementById('mobile-menu-btn');
const mobileNav = document.getElementById('mobile-nav-overlay');
if (mobileBtn && mobileNav) {
    mobileBtn.addEventListener('click', () => {
        mobileBtn.classList.toggle('active');
        mobileNav.classList.toggle('active');

        // Transform hamburger to X
        const spans = mobileBtn.querySelectorAll('span');
        if (mobileBtn.classList.contains('active')) {
            spans[0].style.transform = 'translateY(8px) rotate(45deg)';
            spans[1].style.transform = 'translateY(-8px) rotate(-45deg)';
        } else {
            spans[0].style.transform = 'none';
            spans[1].style.transform = 'none';
        }
    });
}

// --- 3D Museum Stage Gallery (Beyond the Pixels) ---
const topContainer = document.getElementById("content-top");
const centerContainer = document.getElementById("content-center");
const bottomContainer = document.getElementById("content-bottom");

if (topContainer && centerContainer && bottomContainer) {
    const containers = [topContainer, centerContainer, bottomContainer];

    // Populate images (Double set for seamless infinite loop as per snippet)
    const images = [
        "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?auto=format&fit=crop&q=80&w=800",
        "https://images.unsplash.com/photo-1549490349-8643362247b5?auto=format&fit=crop&q=80&w=800",
        "https://images.unsplash.com/photo-1605721911519-3dfeb3be25e7?auto=format&fit=crop&q=80&w=800",
        "https://images.unsplash.com/photo-1536924940846-227afb31e2a5?auto=format&fit=crop&q=80&w=800",
        "https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&q=80&w=800",
        "https://images.unsplash.com/photo-1578301978693-85fa9c0320b9?auto=format&fit=crop&q=80&w=800",
        "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&q=80&w=800"
    ];

    containers.forEach(container => {
        container.innerHTML = '';
        [...images, ...images, ...images].forEach(src => {
            const div = document.createElement('div');
            div.className = 'ticker-image-wrapper';
            div.innerHTML = `<img src="${src}" alt="">`;
            container.appendChild(div);
        });
    });

    const foldsContent = [topContainer, centerContainer, bottomContainer];

    let yPos = 0;
    const scrollSpeed = 0.8;

    const tick = () => {
        yPos -= scrollSpeed;
        const resetThreshold = foldsContent[1].scrollHeight / 3;

        if (Math.abs(yPos) >= resetThreshold) {
            yPos = 0;
        }

        foldsContent.forEach((content) => {
            content.style.transform = `translateY(${yPos}px)`;
        });

        requestAnimationFrame(tick);
    };

    // Delay start to let images load for accurate scrollHeight
    setTimeout(tick, 500);

    // Mouse Interaction (Still using GSAP for smoothness on rotation)
    const museumStage = document.querySelector('.museum-stage');
    if (museumStage && window.gsap) {
        document.addEventListener('mousemove', (e) => {
            const xPct = (e.clientX / window.innerWidth - 0.5) * 2;
            const yPct = (e.clientY / window.innerHeight - 0.5) * 2;

            window.gsap.to('#stage-wrapper', {
                rotationY: xPct * 20,
                rotationX: -yPct * 10,
                duration: 1.5,
                ease: "power2.out"
            });
        });
    }
}

// --- Camera Interaction ---
const heroCamera = document.getElementById('hero-camera');
if (heroCamera) {
    heroCamera.addEventListener('click', () => {
        heroCamera.classList.toggle('flash-active');
    });
}

// --- Headphones Interaction ---
const heroHeadphones = document.getElementById('hero-headphones');
const heroAudio = document.getElementById('hero-audio');
let isMusicPlaying = false;

function toggleMusic() {
    if (!heroAudio) return;

    if (isMusicPlaying) {
        heroAudio.pause();
        if (heroHeadphones) heroHeadphones.classList.remove('playing');
    } else {
        heroAudio.play().catch(error => {
            console.log("Audio play failed:", error);
        });
        if (heroHeadphones) heroHeadphones.classList.add('playing');
    }
    isMusicPlaying = !isMusicPlaying;
}

if (heroHeadphones) {
    heroHeadphones.addEventListener('click', toggleMusic);
}
