// IñigoSync — Hero Showcase Carousel
// Auto-rotating carousel with 5-second interval, crossfade transitions,
// keyboard/swipe navigation, and pause-on-hover/focus. Drives the full-bleed
// hero background photo + its bottom-left caption on the landing page.
//
// Slides are grouped by index via [data-home-slide="N"] — more than one
// element can share the same index (e.g. a background image AND a caption
// block) and they'll crossfade together, so markup isn't limited to one
// element per slide.
//
// TODO: replace static array with GET /api/events.php (PHP/MySQL)

document.addEventListener('DOMContentLoaded', () => {
    const showcaseEl = document.querySelector('[data-home-showcase]');
    if (!showcaseEl) return;

    const slides = showcaseEl.querySelectorAll('[data-home-slide]');
    const dots = showcaseEl.querySelectorAll('[data-home-slide-dot]');
    const prevBtn = showcaseEl.querySelector('[data-home-slide-prev]');
    const nextBtn = showcaseEl.querySelector('[data-home-slide-next]');

    if (slides.length === 0) return;

    const slideCount = Array.from(slides).reduce(
        (max, s) => Math.max(max, Number(s.dataset.homeSlide) + 1),
        0
    );

    let currentIndex = 0;
    let autoplayTimer = null;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function updateSlide(newIndex, skipTimer = false) {
        // Wrap around
        if (newIndex >= slideCount) newIndex = 0;
        if (newIndex < 0) newIndex = slideCount - 1;

        slides.forEach((s) => {
            const isActive = Number(s.dataset.homeSlide) === newIndex;
            s.classList.toggle('is-active', isActive);
        });
        dots.forEach((d) => {
            const isActive = Number(d.dataset.homeSlideDot) === newIndex;
            d.classList.toggle('is-active', isActive);
            d.setAttribute('aria-current', isActive ? 'true' : 'false');
        });

        currentIndex = newIndex;

        // Restart autoplay timer
        if (!skipTimer) {
            clearAutoplay();
            startAutoplay();
        }
    }

    function startAutoplay() {
        if (prefersReducedMotion) return;

        autoplayTimer = setInterval(() => {
            updateSlide(currentIndex + 1, false);
        }, 5000);
    }

    function clearAutoplay() {
        if (autoplayTimer) {
            clearInterval(autoplayTimer);
            autoplayTimer = null;
        }
    }

    // Navigation handlers
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            updateSlide(currentIndex - 1);
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            updateSlide(currentIndex + 1);
        });
    }

    // Dot navigation
    dots.forEach((dot) => {
        dot.addEventListener('click', () => {
            updateSlide(Number(dot.dataset.homeSlideDot));
        });
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (!showcaseEl.contains(document.activeElement)) return;

        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            updateSlide(currentIndex - 1);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            updateSlide(currentIndex + 1);
        }
    });

    // Pause on hover
    showcaseEl.addEventListener('mouseenter', () => {
        clearAutoplay();
    });

    showcaseEl.addEventListener('mouseleave', () => {
        startAutoplay();
    });

    // Pause on focus
    showcaseEl.addEventListener('focusin', () => {
        clearAutoplay();
    });

    showcaseEl.addEventListener('focusout', () => {
        // Check if focus moved outside the showcase
        setTimeout(() => {
            if (!showcaseEl.contains(document.activeElement)) {
                startAutoplay();
            }
        }, 0);
    });

    // Touch swipe support
    let touchStartX = 0;
    let touchEndX = 0;

    showcaseEl.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    });

    showcaseEl.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    });

    function handleSwipe() {
        const diffX = touchStartX - touchEndX;
        const threshold = 50;

        if (Math.abs(diffX) > threshold) {
            if (diffX > 0) {
                // Swiped left, go to next slide
                updateSlide(currentIndex + 1);
            } else {
                // Swiped right, go to previous slide
                updateSlide(currentIndex - 1);
            }
        }
    }

    // Start autoplay
    startAutoplay();

    console.log('[IñigoSync] hero showcase carousel loaded from static array (demo mode). TODO: wire to /api/events.php');
});
