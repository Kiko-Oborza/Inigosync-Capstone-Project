// IñigoSync — Landing page interactions
// Scroll-reveal for sections marked with .reveal, nav scroll-spy, and the
// Courts & Facilities grid rendered from the shared COURTS_INVENTORY.

document.addEventListener('DOMContentLoaded', () => {
    // Courts & Facilities grid — render from the shared inventory (courts-data.js).
    // Duckpin and ten-pin bowling are combined into a single "Bowling" card,
    // matching the design's 8-card layout (Basketball, Badminton, Lawn Tennis,
    // Pickleball, Bowling, Billiards, Table Tennis, Volleyball).
    const courtGrid = document.querySelector('[data-court-grid]');
    if (courtGrid && typeof COURTS_INVENTORY !== 'undefined') {
        const duckpin = COURTS_INVENTORY.find((c) => c.id === 'bowling-duckpin');
        const tenpin = COURTS_INVENTORY.find((c) => c.id === 'bowling-tenpin');
        const bowlingQty = (duckpin ? duckpin.quantity : 0) + (tenpin ? tenpin.quantity : 0);
        const bowlingNote = duckpin && tenpin
            ? `${duckpin.quantity} duckpin · ${tenpin.quantity} ten-pin`
            : 'Duckpin & ten-pin lanes';

        const cards = [];
        COURTS_INVENTORY.forEach((court) => {
            if (court.id === 'bowling-tenpin') return; // merged into the Bowling card below
            if (court.id === 'bowling-duckpin') {
                cards.push({ name: 'Bowling', quantity: bowlingQty, unit: 'lanes', note: bowlingNote });
                return;
            }
            cards.push({ name: court.name, quantity: court.quantity, unit: court.unit, note: court.description });
        });

        courtGrid.innerHTML = cards.map((c) => `
            <article class="court-card">
                <h3>${c.name}</h3>
                <p class="court-count"><span class="court-count-value">${c.quantity}</span><span class="court-count-unit">${c.unit}</span></p>
                <p class="court-note">${c.note}</p>
            </article>
        `).join('');
    }

    // ------------------------------------------------------------------
    // Theme toggle — includes/theme.js manages the data-theme attribute
    // and persistence; this just wires the navbar button to it and keeps
    // the sun/moon icon in sync.
    // ------------------------------------------------------------------
    const themeToggleBtn = document.querySelector('[data-theme-toggle]');
    function syncThemeToggleUI(theme) {
        if (!themeToggleBtn) return;
        const isLight = theme === 'light';
        themeToggleBtn.setAttribute('aria-pressed', String(isLight));
        themeToggleBtn.querySelectorAll('.sun-circle, .sun-line').forEach((el) => {
            el.style.display = isLight ? 'none' : '';
        });
        const moonPath = themeToggleBtn.querySelector('.moon-path');
        if (moonPath) moonPath.style.display = isLight ? '' : 'none';
    }
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            if (window.ThemeController) window.ThemeController.toggle();
        });
        document.addEventListener('themechange', (e) => syncThemeToggleUI(e.detail.theme));
        syncThemeToggleUI(document.documentElement.getAttribute('data-theme') || 'dark');
    }

    const revealEls = document.querySelectorAll('.reveal');

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
        revealEls.forEach((el) => el.classList.add('is-visible'));
        return;
    }

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.15 }
    );

    revealEls.forEach((el) => observer.observe(el));

    // The pill navbar's inline links and the off-canvas mobile menu both
    // render the same links (see Index.html), so there are two <a> elements
    // per href — match by href, not by node identity, so both stay in sync.
    const navLinks = document.querySelectorAll('nav ul li a[href^="#"]');
    const sectionMap = Array.from(navLinks).map((link) => {
        const href = link.getAttribute('href');
        const target = href === '#' ? document.querySelector('.hero') : document.querySelector(href);
        return target ? { link, target } : null;
    }).filter(Boolean);

    function setActiveLink(activeLink) {
        const activeHref = activeLink.getAttribute('href');
        navLinks.forEach((link) => {
            link.classList.toggle('active', link.getAttribute('href') === activeHref);
        });
    }

    function updateActiveLink() {
        const offset = window.innerHeight * 0.25;
        const activeEntry = sectionMap.reduce((best, entry) => {
            const rect = entry.target.getBoundingClientRect();
            const visible = rect.top <= offset && rect.bottom > offset;
            if (visible) {
                return { entry, top: Math.abs(rect.top) };
            }
            return best;
        }, null);

        if (activeEntry) {
            setActiveLink(activeEntry.entry.link);
        } else {
            const topLink = sectionMap[0]?.link;
            if (topLink) setActiveLink(topLink);
        }
    }

    sectionMap.forEach(({ target }) => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const matching = sectionMap.find((item) => item.target === entry.target);
                        if (matching) setActiveLink(matching.link);
                    }
                });
            },
            { threshold: 0.35 }
        );

        observer.observe(target);
    });

    navLinks.forEach((link) => {
        link.addEventListener('click', () => {
            setActiveLink(link);
        });
    });

    window.addEventListener('scroll', updateActiveLink);
    window.addEventListener('hashchange', updateActiveLink);
    updateActiveLink();

    // Close the off-canvas mobile menu whenever something inside it is
    // clicked (a nav link or the Log In / Sign Up button).
    const menuToggleCheckbox = document.getElementById('menu-toggle');
    const navMenu = document.querySelector('.nav-menu');
    if (menuToggleCheckbox && navMenu) {
        navMenu.querySelectorAll('a, button').forEach((el) => {
            el.addEventListener('click', () => {
                menuToggleCheckbox.checked = false;
            });
        });
    }
});
