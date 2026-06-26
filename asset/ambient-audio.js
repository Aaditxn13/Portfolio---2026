/* ----------------------------------------------------------------------------
 * ambient-audio.js — Subtle, looping leaves-rustling ambience.
 *
 * Strategy (because browsers block UNMUTED autoplay):
 *   1. The <audio> element has `muted autoplay loop` in HTML, so the
 *      browser starts the loop the moment the page loads — silently.
 *   2. On the first user interaction (pointer/click/scroll/key/touch),
 *      we flip `audio.muted = false`. The user perceives this as "audio
 *      starts when I do anything on the page", but the loop has been
 *      running since load — there's no playback restart, no gap.
 *
 * Notes:
 *   - We do NOT pause on hover-leave or any other UI event. Once unmuted,
 *     the loop runs continuously until the tab is hidden (visibilitychange).
 *   - Volume is set in JS so it's the single source of truth.
 *   - Calling .play() inside the gesture handler too as a defensive measure
 *     in case the autoplay attempt was rejected entirely on a strict
 *     browser (e.g. Safari with Low Power Mode + custom Media settings).
 * ------------------------------------------------------------------------- */

(function () {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const audio = document.getElementById('ambient-leaves');
    if (!audio) return;

    const AMBIENT_VOLUME = 1.0;

    // Set volume up front. Muted state is independent of volume in HTML5
    // audio: when we unmute, this volume kicks in immediately.
    audio.volume = AMBIENT_VOLUME;

    let unmuted = false;
    const GESTURES = ['pointerdown', 'click', 'keydown', 'scroll', 'touchstart'];

    function onFirstGesture() {
        if (unmuted) return;
        // Make sure we're actually playing first — covers the rare case
        // where even muted autoplay was blocked (some Safari setups).
        if (audio.paused) {
            const p = audio.play();
            if (p && typeof p.catch === 'function') p.catch(() => {});
        }
        audio.muted = false;
        audio.volume = AMBIENT_VOLUME;
        unmuted = true;
        // Drop listeners — done.
        GESTURES.forEach((ev) => {
            window.removeEventListener(ev, onFirstGesture, { capture: true });
        });
    }

    // Attach with `capture: true` so we hear the gesture before any other
    // handler can stop propagation. Passive so we never block scroll.
    GESTURES.forEach((ev) => {
        window.addEventListener(ev, onFirstGesture, {
            capture: true,
            passive: true
        });
    });

    // Pause when the tab is hidden, resume when it comes back.
    let pausedByVisibility = false;
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            if (!audio.paused) {
                audio.pause();
                pausedByVisibility = true;
            }
        } else if (pausedByVisibility) {
            pausedByVisibility = false;
            const p = audio.play();
            if (p && typeof p.catch === 'function') p.catch(() => {});
        }
    });
})();
