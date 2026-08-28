// IñigoSync — Landing page interactions
//
// Responsibilities:
//   1. A small shared data module (window.InigoContent) that fetches
//      courts / events / testimonials from Supabase and falls back to a
//      static array if the fetch fails, errors, times out, or comes back
//      empty — so the landing page never renders a blank section. This
//      module is defined at the top level (not inside DOMContentLoaded) so
//      includes/home-showcase.js — which loads *after* this file — can use
//      it too, keeping courts/events to ONE source of truth instead of the
//      three drifting hardcoded copies this page used to have.
//   2. Rendering the Courts & Facilities grid, the Pricing rate sheet and
//      the Feedback & Reviews grid from that shared data, with every piece
//      of untrusted text escaped before it touches innerHTML. Courts and
//      Pricing both read the SAME memoized getCourts() promise — one fetch,
//      one list, never a second hardcoded price sheet (D2).
//   3. The court viewer: one reusable modal that shows a single sport's
//      photo (or its honest placeholder) large, opened from the court cards.
//   4. Scroll-reveal for `.reveal` sections, nav scroll-spy, the mobile
//      menu, and the theme-toggle button wiring.
//
// The standalone Featured Events section was removed in the landing-page
// redesign; getEvents() below stays because includes/home-showcase.js still
// drives the hero carousel and its captions from it.
//
// See database/schema/002_content_tables.sql for the `court` / `event` /
// `testimonial` table shapes this reads, and includes/courts-data.js for
// the COURTS_INVENTORY fallback array.

// ============================================================================
// Escaping — the ONE place untrusted text is allowed to become HTML.
// ============================================================================
// Every court/event/testimonial field below can come from Supabase, which
// staff/admin accounts can write to (see the RLS policies in
// database/schema/002_content_tables.sql). A court named
// `<img onerror=alert(1)>` must render as literal text, not run — so every
// interpolated value that reaches innerHTML goes through this first.
//
// The implementation now lives in the shared includes/escape.js (loaded
// before this file — see the <script> order in Pages/Index.html) so the
// dashboard controllers can reuse the exact same function instead of a
// second copy that could drift. This is just a local alias for brevity.
const escapeHtml = window.escapeHtml;

// ============================================================================
// Image slots — no photos exist in the DB yet. `image_url` is nullable on
// both `court` and `event`; null renders this placeholder (a pattern + a
// sport monogram) instead of a broken <img>. Setting image_url later swaps
// in a real <img> with no markup changes needed anywhere else.
// ============================================================================
const SPORT_MONOGRAM = {
    'basketball': 'BB',
    'badminton': 'BD',
    'lawn-tennis': 'LT',
    'pickleball': 'PB',
    'bowling': 'BW',
    'billiards': 'BL',
    'table-tennis': 'TT',
    'volleyball': 'VB',
};

function monogramFor(sportSlug, name) {
    if (sportSlug && SPORT_MONOGRAM[sportSlug]) return SPORT_MONOGRAM[sportSlug];
    const words = String(name || '?').split('—')[0].trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return (words[0] || '?').slice(0, 2).toUpperCase();
}

// Shared by both the court cards and the event cards — hero slides use their
// own full-bleed variant (see includes/home-showcase.js) since they need to
// stack under the hero-scrim rather than sit inside a rounded card.
function renderMediaSlot({ imageUrl, alt, monogram }) {
    const safeAlt = escapeHtml(alt || '');
    if (imageUrl) {
        return `<div class="media-slot has-image"><img src="${escapeHtml(imageUrl)}" alt="${safeAlt}" loading="lazy"></div>`;
    }
    return `<div class="media-slot is-placeholder" role="img" aria-label="${safeAlt}"><span class="media-slot-monogram" aria-hidden="true">${escapeHtml(monogram)}</span></div>`;
}

// ============================================================================
// Date helpers
// ============================================================================
function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

// `event.event_date` comes back from Supabase as a plain "YYYY-MM-DD"
// string. Appending a local T00:00:00 (rather than parsing the bare date
// string, which JS treats as UTC midnight) avoids it displaying as the
// previous day in timezones behind UTC.
function parseDbDate(value) {
    if (!value) return null;
    const d = new Date(`${value}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
}

function formatEventDate(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Composes the single display line for an event's schedule (used by both
// the hero caption and the Featured Events card) so the two never have a
// chance to format the same event differently.
function formatEventMeta(ev) {
    return [formatEventDate(ev.eventDate), ev.meta].filter(Boolean).join(' · ');
}

function pickRandom(list, count) {
    const pool = list.slice();
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
}

// ============================================================================
// Courts — normalize DB rows and the COURTS_INVENTORY fallback into one
// shape, then merge rows that share a sport (Bowling's Duckpin + Ten-Pin
// rows) into a single card. This replaces the old id==='bowling-duckpin'
// special-casing with a generic rule, so a third bowling variant (or any
// other multi-row sport) merges correctly without another code change —
// bug 2's "three drifting sources" becomes one normalize+merge path used
// for both the DB rows and the offline fallback.
// ============================================================================
function normalizeCourtFromDb(row) {
    return {
        // The embedded sport(slug) is the real grouping key. If that embed
        // is ever missing for some reason, fall back to the court's own
        // slug with the duckpin/ten-pin suffix stripped — same trick
        // normalizeCourtFromFallback uses — so the merge below still finds
        // Bowling's two rows instead of silently splitting them apart.
        sportSlug: (row.sport && row.sport.slug) || String(row.slug || '').replace(/-duckpin$|-tenpin$/, '') || 'general',
        name: row.name || '',
        quantity: Number(row.quantity) || 0,
        unit: row.unit || 'courts',
        note: row.description || '',
        rate: (row.rate === null || row.rate === undefined) ? null : Number(row.rate),
        rateUnit: row.rate_unit || '/hr',
        imageUrl: row.image_url || null,
        // `rating` doesn't exist on `court` until the owner runs
        // database/schema/003_court_rating.sql — undefined and null both
        // mean "no rating yet", never rendered as a fake one (see
        // renderCourtCard below).
        rating: (row.rating === null || row.rating === undefined) ? null : Number(row.rating),
    };
}

function normalizeCourtFromFallback(item) {
    return {
        // Fallback ids double as sport slugs; duckpin/ten-pin just carry a
        // suffix so they land in the same group as each other.
        sportSlug: String(item.id).replace(/-duckpin$|-tenpin$/, ''),
        name: item.name || '',
        quantity: Number(item.quantity) || 0,
        unit: item.unit || 'courts',
        note: item.description || '',
        rate: (item.rate === '—' || item.rate === null || item.rate === undefined) ? null : Number(item.rate),
        rateUnit: item.rateUnit || '/hr',
        imageUrl: item.image_url || null,
        // COURTS_INVENTORY never carries a rating — the offline fallback
        // never invents one either.
        rating: null,
    };
}

function variantLabel(name) {
    const parts = String(name).split('—');
    return parts.length > 1 ? parts[1].trim() : name;
}

function mergeCourtsBySport(items) {
    const order = [];
    const groups = new Map();

    items.forEach((item) => {
        const key = item.sportSlug;
        if (!groups.has(key)) {
            groups.set(key, []);
            order.push(key);
        }
        groups.get(key).push(item);
    });

    return order.map((key) => {
        const group = groups.get(key);
        if (group.length === 1) return group[0];

        const totalQuantity = group.reduce((sum, c) => sum + c.quantity, 0);
        const note = group.map((c) => `${c.quantity} ${variantLabel(c.name).toLowerCase()}`).join(' · ');
        const baseName = group[0].name.split('—')[0].trim() || group[0].name;
        const withImage = group.find((c) => c.imageUrl);

        return {
            sportSlug: key,
            name: baseName,
            quantity: totalQuantity,
            unit: group[0].unit,
            note,
            rate: group.every((c) => c.rate === null) ? null : group[0].rate,
            rateUnit: group[0].rateUnit,
            imageUrl: withImage ? withImage.imageUrl : null,
            rating: group.every((c) => c.rating === null || c.rating === undefined) ? null : group[0].rating,
        };
    });
}

// ============================================================================
// Events — fallback list kept in sync by hand with
// database/seed/002_seed_content.sql. daysFromNow mirrors that file's
// `current_date + N` so the demo looks "current" instead of showing a
// hardcoded past date, exactly like the SQL comment describes.
// ============================================================================
const EVENTS_FALLBACK = [
    { sportSlug: 'basketball', tag: 'Tournament', title: 'Bocohan Summer Basketball League — Finals', meta: 'Court 1 · Elimination round', daysFromNow: 2, imageUrl: '../database/web/basketball.jpg' },
    { sportSlug: null, tag: 'This weekend', title: 'Weekend Open Play', meta: 'Sat & Sun · 8:00 AM – 10:00 PM · all courts', daysFromNow: 3, imageUrl: '../database/web/announcement.jpg' },
    { sportSlug: 'badminton', tag: 'New courts', title: 'Badminton Courts Now Open', meta: '9 courts total · book any slot online', daysFromNow: null, imageUrl: '../database/web/badminton.jpg' },
    { sportSlug: 'bowling', tag: 'Lanes', title: 'Duckpin & Ten-Pin Night', meta: '20 lanes total · Mon–Thu', daysFromNow: null, imageUrl: '../database/web/bowling.jpg' },
    { sportSlug: 'volleyball', tag: 'Open gym', title: 'Volleyball Open Gym', meta: 'Every Friday · 6:00 PM – 9:00 PM', daysFromNow: null, imageUrl: '../database/web/volleyball.jpg' },
];

function normalizeEventFromDb(row) {
    return {
        sportSlug: (row.sport && row.sport.slug) || null,
        tag: row.tag || '',
        title: row.title || '',
        meta: row.meta || '',
        eventDate: parseDbDate(row.event_date),
        imageUrl: row.image_url || null,
    };
}

function normalizeEventFromFallback(item) {
    return {
        sportSlug: item.sportSlug || null,
        tag: item.tag || '',
        title: item.title || '',
        meta: item.meta || '',
        eventDate: (item.daysFromNow === null || item.daysFromNow === undefined) ? null : addDays(new Date(), item.daysFromNow),
        imageUrl: item.imageUrl || null,
    };
}

// ============================================================================
// Testimonials — fallback list kept in sync by hand with
// database/seed/002_seed_content.sql's placeholder rows. See
// implementation_plan.md (D3) for why this is labeled testimonials and not
// presented as a live Google Reviews feed.
// ============================================================================
const TESTIMONIALS_FALLBACK = [
    { author_name: 'Placeholder Customer A', rating: 5, quote: "[PLACEHOLDER] Great courts and easy to book — swap in a real quote once it's approved.", source_label: 'Placeholder — awaiting a real quote' },
    { author_name: 'Placeholder Customer B', rating: 5, quote: '[PLACEHOLDER] Friendly staff and the place is always clean.', source_label: 'Placeholder — awaiting a real quote' },
    { author_name: 'Placeholder Customer C', rating: 4, quote: '[PLACEHOLDER] Good variety of sports under one roof.', source_label: 'Placeholder — awaiting a real quote' },
    { author_name: 'Placeholder Customer D', rating: 5, quote: '[PLACEHOLDER] Booking online saved us so much back-and-forth.', source_label: 'Placeholder — awaiting a real quote' },
    { author_name: 'Placeholder Customer E', rating: 4, quote: '[PLACEHOLDER] Lanes were in great shape for our bowling night.', source_label: 'Placeholder — awaiting a real quote' },
    { author_name: 'Placeholder Customer F', rating: 5, quote: '[PLACEHOLDER] Been coming here for years, never disappoints.', source_label: 'Placeholder — awaiting a real quote' },
];

function normalizeTestimonialFromDb(row) {
    return {
        authorName: row.author_name || 'A guest',
        rating: row.rating,
        quote: row.quote || '',
        sourceLabel: row.source_label || null,
    };
}

function normalizeTestimonialFromFallback(item) {
    return {
        authorName: item.author_name,
        rating: item.rating,
        quote: item.quote,
        sourceLabel: item.source_label || null,
    };
}

// ============================================================================
// Fetch layer — Supabase first, static fallback on any error, timeout, or
// empty result. Each getter memoizes its promise so courts/events/
// testimonials are only ever fetched once per page load, no matter how many
// renderers (this file's own sections, plus home-showcase.js's hero) ask
// for them.
// ============================================================================
const FETCH_TIMEOUT_MS = 6000;

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((resolve) => {
            setTimeout(() => resolve({ data: null, error: new Error(`Supabase request timed out after ${ms}ms`) }), ms);
        }),
    ]);
}

// Resolves to the raw row array on success, or null if Supabase is
// unreachable, errors, times out, or the table is empty — null is the
// signal callers use to fall back to static content instead of rendering
// a blank section.
async function safeSelect(runQuery) {
    if (!window.sb) return null;
    try {
        const { data, error } = await withTimeout(runQuery(), FETCH_TIMEOUT_MS);
        if (error) {
            console.warn('[IñigoSync] Supabase query failed — using fallback content instead.', error.message || error);
            return null;
        }
        return (Array.isArray(data) && data.length > 0) ? data : null;
    } catch (err) {
        console.warn('[IñigoSync] Supabase query threw — using fallback content instead.', err);
        return null;
    }
}

let courtsPromise = null;
let eventsPromise = null;
let testimonialsPromise = null;

function getCourts() {
    if (!courtsPromise) {
        courtsPromise = safeSelect(() => window.sb
            .from('court')
            .select('*, sport(slug, name)')
            .eq('is_active', true)
            .order('display_order')
        ).then((rows) => {
            const normalized = rows
                ? rows.map(normalizeCourtFromDb)
                : (typeof COURTS_INVENTORY !== 'undefined' ? COURTS_INVENTORY.map(normalizeCourtFromFallback) : []);
            return mergeCourtsBySport(normalized);
        });
    }
    return courtsPromise;
}

function getEvents() {
    if (!eventsPromise) {
        eventsPromise = safeSelect(() => window.sb
            .from('event')
            .select('*, sport(slug, name)')
            .eq('is_published', true)
            .order('display_order')
        ).then((rows) => (rows ? rows.map(normalizeEventFromDb) : EVENTS_FALLBACK.map(normalizeEventFromFallback)));
    }
    return eventsPromise;
}

function getTestimonials() {
    if (!testimonialsPromise) {
        testimonialsPromise = safeSelect(() => window.sb
            .from('testimonial')
            .select('*')
            .eq('is_published', true)
        ).then((rows) => {
            const pool = rows ? rows.map(normalizeTestimonialFromDb) : TESTIMONIALS_FALLBACK.map(normalizeTestimonialFromFallback);
            return pickRandom(pool, 3);
        });
    }
    return testimonialsPromise;
}

// Exposed for includes/home-showcase.js, which loads after this file (see
// the <script> order in Pages/Index.html) and needs getEvents() + the same
// escaping/monogram helpers to drive the hero from the same event data
// instead of its own separate hardcoded slides.
window.InigoContent = {
    escapeHtml,
    monogramFor,
    formatEventDate,
    formatEventMeta,
    getCourts,
    getEvents,
    getTestimonials,
};

// ============================================================================
// Card renderers
// ============================================================================
function renderCourtCard(court) {
    const monogram = monogramFor(court.sportSlug, court.name);

    // Rate: ₱<rate><rate_unit> when non-null, an honest "Rate TBA"
    // placeholder when null — every court's rate is NULL in the live DB
    // right now (database/seed/002_seed_content.sql leaves it unconfirmed
    // on purpose). Never invented; this starts showing real numbers the
    // moment the owner sets them via the admin Court Listings CRUD.
    const rateHtml = court.rate !== null
        ? `<p class="court-rate">₱${escapeHtml(String(court.rate))}<span>${escapeHtml(court.rateUnit)}</span></p>`
        : `<p class="court-rate is-tba">Rate TBA</p>`;

    // Rating: `court.rating` only exists once the owner runs
    // database/schema/003_court_rating.sql, and only renders when a court
    // actually has one — omitted entirely otherwise, never a fake number.
    const ratingHtml = (court.rating !== null && court.rating !== undefined)
        ? `<p class="court-rating"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.9 6.9L22 9.6l-5.4 4.9L18 22l-6-3.6L6 22l1.4-7.5L2 9.6l7.1-.7z"/></svg>${escapeHtml(court.rating.toFixed(1))}<span>/ 5</span></p>`
        : '';

    // A real <button>, not an <article> with a click handler: that buys
    // keyboard activation (Enter/Space), focus order and the correct
    // screen-reader role for free, with no tabindex or role patching.
    // data-court-id carries the sport slug, which mergeCourtsBySport
    // guarantees is unique across the rendered list.
    return `
        <button type="button" class="court-card" data-court-id="${escapeHtml(court.sportSlug)}" aria-haspopup="dialog">
            ${renderMediaSlot({ imageUrl: court.imageUrl, alt: court.name, monogram })}
            <div class="court-card-body">
                <h3>${escapeHtml(court.name)}</h3>
                ${ratingHtml}
                <p class="court-count"><span class="court-count-value">${escapeHtml(String(court.quantity))}</span><span class="court-count-unit">${escapeHtml(court.unit)}</span></p>
                ${rateHtml}
                <p class="court-note">${escapeHtml(court.note)}</p>
                <span class="court-card-open">View
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </span>
            </div>
        </button>
    `;
}

// One row of the Pricing rate sheet. Same normalized court object the grid
// renders — there is deliberately no second court/price list anywhere (D2).
// `rate` is NULL for every court until the owner enters rates through admin
// Court Listings, so today every row renders the "Rate TBA" chip. Never a
// placeholder number.
function renderPricingRow(court) {
    const rateHtml = court.rate !== null
        ? `<span class="pricing-rate-value">₱${escapeHtml(String(court.rate))}${escapeHtml(court.rateUnit)}</span>`
        : `<span class="pricing-rate-value is-tba">Rate TBA</span>`;

    return `
        <li class="pricing-row">
            <div class="pricing-sport">
                <h3>${escapeHtml(court.name)}</h3>
                <p class="pricing-note">${escapeHtml(court.note)}</p>
            </div>
            <p class="pricing-unit">
                <span class="pricing-cell-label">What you book</span>
                <span class="pricing-unit-value">${escapeHtml(String(court.quantity))} ${escapeHtml(court.unit)}</span>
            </p>
            <p class="pricing-rate">
                <span class="pricing-cell-label">Rate</span>
                ${rateHtml}
            </p>
        </li>
    `;
}

function renderTestimonialCard(t) {
    const stars = Math.min(5, Math.max(0, Math.round(Number(t.rating)) || 0));
    const starGlyphs = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    return `
        <article class="testimonial-card">
            <p class="testimonial-quote">“${escapeHtml(t.quote)}”</p>
            <div class="testimonial-meta">
                <span class="testimonial-stars" aria-label="${stars} out of 5 stars">${starGlyphs}</span>
                <span class="testimonial-author">${escapeHtml(t.authorName)}</span>
                ${t.sourceLabel ? `<span class="testimonial-source">${escapeHtml(t.sourceLabel)}</span>` : ''}
            </div>
        </article>
    `;
}

// ============================================================================
// Court viewer — ONE reusable modal for every court card.
//
// Court cards are real <button>s (see renderCourtCard), so activation by
// mouse, Enter and Space all arrive here as a plain click. The dialog:
//   • shows the sport's photo large — or, while `image_url` is NULL, the same
//     honest .media-slot placeholder the grid uses plus "Photo coming soon";
//   • closes on Escape, on a backdrop click and on the close button;
//   • moves focus into the dialog on open and back to the invoking card on
//     close, and traps Tab in between;
//   • locks body scroll while open (body.court-viewer-lock).
//
// Every value it injects is either set with textContent or escaped with
// escapeHtml first (D3). No image path is hardcoded anywhere — the photo is
// whatever `court.image_url` holds, which the owner sets through admin Court
// Listings (OQ1).
// ============================================================================
function createCourtViewer() {
    const root = document.querySelector('[data-court-viewer]');
    if (!root) return null;

    const dialog = root.querySelector('[data-court-viewer-dialog]');
    const mediaEl = root.querySelector('[data-court-viewer-media]');
    const titleEl = root.querySelector('[data-court-viewer-title]');
    const countEl = root.querySelector('[data-court-viewer-count]');
    const noteEl = root.querySelector('[data-court-viewer-note]');
    const rateEl = root.querySelector('[data-court-viewer-rate]');
    const photoEl = root.querySelector('[data-court-viewer-photo-status]');
    const closeBtn = root.querySelector('[data-court-viewer-close]');
    const backdrop = root.querySelector('[data-court-viewer-backdrop]');

    if (!dialog || !mediaEl || !titleEl || !countEl || !noteEl || !rateEl || !photoEl) {
        console.error('[IñigoSync] #courtViewer markup is incomplete — court cards cannot open. Check Pages/Index.html.');
        return null;
    }

    // Matches the CSS opacity transition on .court-viewer; the same 250ms
    // includes/auth.js uses for its overlay.
    const CLOSE_DELAY_MS = 250;
    const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    let lastFocused = null;
    let isOpen = false;
    let hideTimer = null;

    function open(court, invoker) {
        if (!court) return;

        lastFocused = invoker || document.activeElement;

        const monogram = monogramFor(court.sportSlug, court.name);
        // renderMediaSlot escapes the alt text and the image URL itself.
        mediaEl.innerHTML = renderMediaSlot({ imageUrl: court.imageUrl, alt: court.name, monogram });

        titleEl.textContent = court.name;
        countEl.innerHTML = `<span class="court-count-value">${escapeHtml(String(court.quantity))}</span><span class="court-count-unit">${escapeHtml(court.unit)}</span>`;

        noteEl.textContent = court.note || '';
        noteEl.hidden = !court.note;

        // Same rule as the grid card and the pricing row: a real number when
        // the owner has set one, an honest TBA otherwise. Never invented.
        if (court.rate !== null && court.rate !== undefined) {
            rateEl.className = 'court-viewer-rate';
            rateEl.textContent = `₱${court.rate}${court.rateUnit}`;
        } else {
            rateEl.className = 'court-viewer-rate is-tba';
            rateEl.textContent = 'Rate TBA — rates are still being confirmed with the front desk.';
        }

        photoEl.textContent = court.imageUrl
            ? 'Photo provided by Iñigos Sports Center.'
            : 'Photo coming soon — court photos are added by Iñigos through admin Court Listings.';

        if (hideTimer) {
            window.clearTimeout(hideTimer);
            hideTimer = null;
        }

        root.hidden = false;
        document.body.classList.add('court-viewer-lock');
        // Force a synchronous layout flush so the browser commits the
        // opacity:0 / display:flex state *before* [data-open] flips opacity
        // to 1. Batching both into one style recalc would skip the fade
        // entirely; requestAnimationFrame is not a reliable barrier here
        // because rAF callbacks run before the next style recalc, not after
        // the current one.
        void root.offsetWidth;
        root.setAttribute('data-open', '');
        isOpen = true;
        // The dialog carries tabindex="-1" and aria-labelledby, so focusing it
        // announces the sport name before anything else.
        dialog.focus();
    }

    function close() {
        if (!isOpen) return;
        isOpen = false;

        root.removeAttribute('data-open');
        document.body.classList.remove('court-viewer-lock');

        hideTimer = window.setTimeout(() => {
            root.hidden = true;
            // Drop the media so reopening never flashes the previous sport,
            // and a large photo isn't held decoded once it's off-screen.
            mediaEl.innerHTML = '';
            hideTimer = null;
        }, CLOSE_DELAY_MS);

        // Return focus to the card that opened this, if it's still in the DOM
        // (the grid re-renders only once per load, so it normally is).
        if (lastFocused && typeof lastFocused.focus === 'function' && document.contains(lastFocused)) {
            lastFocused.focus();
        }
        lastFocused = null;
    }

    if (closeBtn) closeBtn.addEventListener('click', close);
    if (backdrop) backdrop.addEventListener('click', close);
    // Belt and braces: a click on the dialog's own padding/margin area.
    root.addEventListener('click', (e) => {
        if (e.target === root) close();
    });

    document.addEventListener('keydown', (e) => {
        if (!isOpen) return;

        if (e.key === 'Escape') {
            e.preventDefault();
            close();
            return;
        }

        if (e.key !== 'Tab') return;

        // Focus trap. The dialog normally holds exactly one focusable child
        // (the close button), so without this Tab would walk straight out
        // into the page behind the backdrop.
        const focusables = Array.from(dialog.querySelectorAll(FOCUSABLE));
        if (focusables.length === 0) {
            e.preventDefault();
            dialog.focus();
            return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;

        if (e.shiftKey && (active === first || active === dialog || !dialog.contains(active))) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
            e.preventDefault();
            first.focus();
        }
    });

    return { open, close };
}

document.addEventListener('DOMContentLoaded', () => {
    const courtViewer = createCourtViewer();

    // Courts & Facilities grid — Supabase's `court` table first, falling
    // back to COURTS_INVENTORY (includes/courts-data.js) if that fetch
    // fails or is empty, which is what will actually happen until the
    // owner runs database/schema + database/seed in the Supabase SQL editor.
    //
    // Keyed by sport slug so a card click can find its court object without
    // re-reading the DOM. mergeCourtsBySport guarantees the slug is unique
    // across the rendered list.
    const courtGrid = document.querySelector('[data-court-grid]');
    const courtsBySlug = new Map();

    if (courtGrid) {
        getCourts().then((courts) => {
            courtsBySlug.clear();
            courts.forEach((court) => courtsBySlug.set(court.sportSlug, court));

            courtGrid.innerHTML = courts.length
                ? courts.map(renderCourtCard).join('')
                : '<p class="court-grid-empty">Court information is being set up. Please check back shortly, or ask at the front desk.</p>';
        }).catch((err) => {
            console.error('[IñigoSync] Could not render the courts grid.', err);
        });

        // Delegated, so it works no matter when the cards finish rendering.
        // The cards are real <button>s, so Enter and Space arrive here as
        // clicks too — no separate keydown handling needed.
        courtGrid.addEventListener('click', (e) => {
            const card = e.target && e.target.closest ? e.target.closest('.court-card') : null;
            if (!card || !courtGrid.contains(card)) return;

            const court = courtsBySlug.get(card.dataset.courtId);
            if (!court) {
                console.warn('[IñigoSync] No court matched data-court-id="%s" — the viewer was not opened.', card.dataset.courtId);
                return;
            }
            if (!courtViewer) return;
            courtViewer.open(court, card);
        });
    }

    // Pricing rate sheet — the SAME memoized getCourts() promise the grid
    // above uses. Calling it twice does not fetch twice (see the memoized
    // courtsPromise), and there is deliberately no second court/price list
    // anywhere in the codebase (D2 in implementation_plan.md).
    const pricingList = document.querySelector('[data-pricing-list]');
    if (pricingList) {
        getCourts().then((courts) => {
            pricingList.innerHTML = courts.length
                ? courts.map(renderPricingRow).join('')
                : '<li class="pricing-empty">Rates are being set up. Please check back shortly, or ask at the front desk.</li>';
        }).catch((err) => {
            console.error('[IñigoSync] Could not render the pricing list.', err);
        });
    }

    // Feedback & Reviews — exactly 3 testimonials, chosen at random on
    // every load (D3: testimonials shared with us, never a live review feed).
    const testimonialGrid = document.querySelector('[data-testimonial-grid]');
    if (testimonialGrid) {
        getTestimonials().then((testimonials) => {
            testimonialGrid.innerHTML = testimonials.map(renderTestimonialCard).join('');
        }).catch((err) => {
            console.error('[IñigoSync] Could not render testimonials.', err);
        });
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

    // ------------------------------------------------------------------
    // Scroll-reveal for .reveal sections.
    //
    // Bug fix: this used to `return` here under reduced-motion (or when
    // IntersectionObserver isn't supported), which silently skipped every
    // bit of nav scroll-spy and mobile-menu wiring below it — reduced-
    // motion users got a broken navbar. Motion preference now only decides
    // *how* .reveal sections become visible; it no longer gates anything
    // else in this handler.
    // ------------------------------------------------------------------
    const revealEls = document.querySelectorAll('.reveal');
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
        revealEls.forEach((el) => el.classList.add('is-visible'));
    } else {
        const revealObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                        revealObserver.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.15 }
        );

        revealEls.forEach((el) => revealObserver.observe(el));
    }

    // ------------------------------------------------------------------
    // Nav scroll-spy — always wired, regardless of motion preference or
    // IntersectionObserver support (see the bug-fix note above).
    //
    // The pill navbar's inline links and the off-canvas mobile menu both
    // render the same links (see Index.html), so there are two <a> elements
    // per href — match by href, not by node identity, so both stay in sync.
    //
    // The nav is Home / Courts / Pricing / About, and each of those resolves
    // to a real section: the hero now carries id="home", so `#home` maps
    // through the normal document.querySelector path. The `href === '#'`
    // branch below is kept as a fallback for any nav that still ships a bare
    // '#' Home link — it is no longer used by Pages/Index.html.
    // Pages/terms.html's nav links out to Index.html rather than to an
    // in-page anchor, so its sectionMap is empty and this whole block
    // no-ops there, exactly as before.
    // ------------------------------------------------------------------
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

    if ('IntersectionObserver' in window) {
        sectionMap.forEach(({ target }) => {
            const sectionObserver = new IntersectionObserver(
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

            sectionObserver.observe(target);
        });
    }

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
