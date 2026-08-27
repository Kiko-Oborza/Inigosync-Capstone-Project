// IñigoSync — Hero Showcase Carousel
// Auto-rotating carousel with 5-second interval, crossfade transitions,
// keyboard/swipe navigation, and pause-on-hover/focus. Drives the full-bleed
// hero background photo (or image slot, if the event has no photo yet) plus
// its bottom-left caption on the landing page.
//
// Slides are now built from window.InigoContent.getEvents() — the SAME
// event data (and the same Supabase-first/static-fallback path) that feeds
// the Featured Events grid in includes/landingPage.js — instead of the
// hardcoded <img>/<div> markup Index.html used to ship. This requires
// includes/landingPage.js to run first so window.InigoContent exists; see
// the <script> order in Pages/Index.html.
//
// Slides are grouped by index via [data-home-slide="N"] — more than one
// element can share the same index (a media layer AND a caption block) and
// they'll crossfade together, so markup isn't limited to one element per
// slide.

document.addEventListener('DOMContentLoaded', () => {
    const showcaseEl = document.querySelector('[data-home-showcase]');
    if (!showcaseEl) return;

    const mediaContainer = showcaseEl.querySelector('[data-home-media]');
    const copyContainer = showcaseEl.querySelector('[data-home-copy-stack]');
    const dotsContainer = showcaseEl.querySelector('[data-home-dots]');
    if (!mediaContainer || !copyContainer || !dotsContainer) return;

    const content = window.InigoContent;
    if (!content) {
        console.error('[IñigoSync] home-showcase.js needs window.InigoContent — make sure includes/landingPage.js loads before includes/home-showcase.js in Pages/Index.html.');
        return;
    }

    // More than this and the 5s-per-slide carousel takes too long to cycle
    // back around, and the dot row starts to crowd on narrow screens.
    const MAX_HERO_SLIDES = 5;

    content.getEvents()
        .then((events) => {
            const slides = events.slice(0, MAX_HERO_SLIDES);
            if (slides.length === 0) return;
            renderSlides(slides);
            initCarousel();
        })
        .catch((err) => {
            console.error('[IñigoSync] Could not load events for the hero carousel.', err);
        });

    function renderSlides(events) {
        const { escapeHtml, monogramFor, formatEventMeta } = content;

        mediaContainer.innerHTML = events.map((ev, i) => {
            const activeClass = i === 0 ? ' is-active' : '';
            if (ev.imageUrl) {
                const safeAlt = escapeHtml(ev.title);
                return `<img src="${escapeHtml(ev.imageUrl)}" alt="${safeAlt}" class="hero-media-img${activeClass}" data-home-slide="${i}" loading="${i === 0 ? 'eager' : 'lazy'}">`;
            }
            const monogram = escapeHtml(monogramFor(ev.sportSlug, ev.title));
            const safeAlt = escapeHtml(ev.title);
            return `<div class="hero-media-slot${activeClass}" data-home-slide="${i}" role="img" aria-label="${safeAlt}"><span class="hero-media-slot-monogram" aria-hidden="true">${monogram}</span></div>`;
        }).join('');

        copyContainer.innerHTML = events.map((ev, i) => {
            const activeClass = i === 0 ? ' is-active' : '';
            const metaText = formatEventMeta(ev);
            return `
                <div class="hero-copy${activeClass}" data-home-slide="${i}">
                    <span class="hero-tag">${escapeHtml(ev.tag || 'Featured')}</span>
                    <h2 class="hero-title">${escapeHtml(ev.title)}</h2>
                    <p class="hero-meta">${escapeHtml(metaText)}</p>
                </div>
            `;
        }).join('');

        dotsContainer.innerHTML = events.map((_, i) => {
            const activeClass = i === 0 ? ' is-active' : '';
            return `<button class="hero-dot${activeClass}" data-home-slide-dot="${i}" aria-label="Slide ${i + 1}" aria-current="${i === 0 ? 'true' : 'false'}"></button>`;
        }).join('');
    }

    function initCarousel() {
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

        console.log('[IñigoSync] hero showcase carousel loaded — driven by window.InigoContent.getEvents() (Supabase `event` table, static fallback on failure/empty).');
    }
});
