// Landing-only navigation and optional decorative motion.
document.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('.landing-night > .site-nav');
    if (!header) return;
    const trigger = header.querySelector('[data-landing-menu]');
    const drawer = header.querySelector('#landing-mobile-menu');
    const checkbox = header.querySelector('#menu-toggle');
    const backdrop = header.querySelector('.landing-menu-backdrop');
    const mobile = matchMedia('(max-width: 768px)');
    let open = false;
    const inertBefore = new Map();

    function setOpen(value, restoreFocus = true) {
        open = value && mobile.matches;
        checkbox.checked = open;
        trigger.setAttribute('aria-expanded', String(open));
        trigger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        drawer.inert = !open;
        backdrop.hidden = !open;
        document.body.classList.toggle('landing-menu-open', open);
        if (open) {
            document.querySelectorAll('body > main, body > footer').forEach(el => {
                if (!inertBefore.has(el)) inertBefore.set(el, el.inert);
                el.inert = true;
            });
            drawer.querySelector('.drawer-close').focus();
        } else {
            inertBefore.forEach((wasInert, el) => { el.inert = wasInert; });
            inertBefore.clear();
            if (restoreFocus) trigger.focus();
        }
    }
    trigger.addEventListener('click', () => setOpen(!open));
    header.querySelectorAll('[data-menu-dismiss]').forEach(el => el.addEventListener('click', () => setOpen(false)));
    drawer.querySelectorAll('a, [data-auth-open]').forEach(el => el.addEventListener('click', () => setOpen(false, false)));
    document.addEventListener('keydown', event => {
        if (!open) return;
        if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
        if (event.key !== 'Tab') return;
        const list = [...header.querySelectorAll('a[href],button:not([disabled])')].filter(el => el.tabIndex >= 0 && el.getClientRects().length && !el.closest('[inert]'));
        const first = list[0], last = list.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    mobile.addEventListener('change', () => setOpen(false, false));
    document.querySelectorAll('[data-copyright-year]').forEach(el => { el.textContent = String(new Date().getFullYear()); });

    // Core interaction is independent of GSAP and remains usable if it fails.
    if (!window.gsap || !window.ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia();
    media.add({ desktop: '(min-width: 769px)', mobile: '(max-width: 768px)', reduced: '(prefers-reduced-motion: reduce)' }, context => {
        if (context.conditions.reduced) return;
        const hero = document.querySelector('.hero');
        if (!hero) return;
        const compact = context.conditions.mobile;
        gsap.to(hero.querySelector('.hero-media'), {
            yPercent: compact ? 4 : 8, scale: 1.03, ease: 'none',
            scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: compact ? .35 : .65, invalidateOnRefresh: true }
        });
    });
    media.add('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)', () => {
        const grid = document.querySelector('[data-court-grid]');
        const move = event => {
            const card = event.target.closest('.court-card');
            if (!card) return;
            const rect = card.getBoundingClientRect();
            gsap.to(card, { rotationX: -(event.clientY - rect.top - rect.height / 2) / rect.height * 5, rotationY: (event.clientX - rect.left - rect.width / 2) / rect.width * 5, y: -4, duration: .35, overwrite: 'auto', transformPerspective: 900 });
        };
        const leave = event => {
            const card = event.target.closest('.court-card');
            if (card && !card.contains(event.relatedTarget)) gsap.to(card, {rotationX:0,rotationY:0,y:0,duration:.5,overwrite:'auto'});
        };
        grid.addEventListener('pointermove', move);
        grid.addEventListener('pointerout', leave);
        return () => {
            grid.removeEventListener('pointermove', move); grid.removeEventListener('pointerout', leave);
            gsap.killTweensOf(grid.querySelectorAll('.court-card'));
            gsap.set(grid.querySelectorAll('.court-card'), {clearProps:'transform'});
        };
    });
});
