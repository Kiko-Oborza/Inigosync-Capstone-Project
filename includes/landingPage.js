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
//   3. The court viewer: one reusable modal, opened from the court cards,
//      that shows one unit's photo (or its honest placeholder) large plus a
//      labelled combobox listing every individual court / lane / table for
//      that sport — see resolveCourtUnits() for where those units come from,
//      because `public.court` is one row per SPORT, not per unit.
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

// `court.unit_images` — the OPTIONAL per-unit photo list added by
// database/schema/006_court_unit_images.sql, shaped
// [{"label": "Court 1", "image_url": "https://…"}, …].
//
// `public.court` is one row per SPORT, not per bookable unit: Badminton is a
// single row with quantity = 9 and exactly one image_url. This column is what
// lets the court viewer's combobox show a *different* photo for Court 1 vs
// Court 2 (resolveCourtUnits case 1 below).
//
// It is optional in the strongest sense: the column does not exist in the live
// database until the owner applies 006, and getCourts() asks for `select('*')`
// rather than naming columns, so `row.unit_images` is simply `undefined` until
// then. undefined, null, and a malformed value all normalize to [] here, and
// resolveCourtUnits() falls through to the sport's merged rows (Bowling) or to
// "Court N" derived from quantity — so the combobox already works today and
// upgrades in place the moment the owner fills this in.
function normalizeUnitImages(value, contextLabel) {
    if (value === null || value === undefined || value === '') return [];

    let parsed = value;
    // PostgREST returns jsonb already parsed. A string only turns up if the
    // JSON was stored by hand in a text column — parse it rather than
    // silently dropping the owner's data, but never assume it is valid.
    if (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        } catch (err) {
            console.warn('[IñigoSync] court "%s" has an unparseable unit_images value — ignoring it and deriving unit names instead.', contextLabel, err);
            return [];
        }
    }

    if (!Array.isArray(parsed)) {
        console.warn('[IñigoSync] court "%s" has a unit_images value that is not an array — ignoring it. Expected [{"label": "…", "image_url": "…"}].', contextLabel);
        return [];
    }

    return parsed
        .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
        .map((entry) => ({
            // Both fields are optional per entry: a blank label gets a derived
            // "Court N" in resolveCourtUnits, and a blank image_url renders the
            // same honest placeholder the rest of the page uses.
            label: (typeof entry.label === 'string' && entry.label.trim()) ? entry.label.trim() : null,
            imageUrl: (typeof entry.image_url === 'string' && entry.image_url.trim()) ? entry.image_url.trim() : null,
        }));
}

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
        // Same "column may not exist yet" story as `rating` — see
        // normalizeUnitImages and database/schema/006_court_unit_images.sql.
        unitImages: normalizeUnitImages(row.unit_images, row.slug || row.name),
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
        // Nor any photos: includes/courts-data.js keeps image_url null on
        // every row and carries no unit_images, so this is always []. Read
        // through the same normalizer anyway so both code paths produce the
        // identical court shape — the viewer must not care where a row
        // came from.
        unitImages: normalizeUnitImages(item.unit_images, item.id),
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
            // Every row that went into this card, in DB order. The merge used
            // to throw these away; the court viewer needs them so Bowling can
            // offer "Duckpin" and "Ten-Pin" as two real options with their own
            // image_urls (resolveCourtUnits case 2). Nothing above changed —
            // the grid card and the pricing row still read exactly the same
            // merged fields they did before.
            variants: group,
            // Concatenated so an owner who fills unit_images in on only ONE of
            // a merged sport's rows still lands in case 1. Each entry carries
            // its own owner-written label, so they stay distinguishable.
            unitImages: group.reduce((all, c) => all.concat(c.unitImages || []), []),
        };
    });
}

// ============================================================================
// Per-unit resolution — what the court viewer's combobox lists.
//
// `public.court` is one row per sport, so "which of the 9 badminton courts am
// I looking at?" is not a question the schema can answer on its own. The
// viewer builds its option list from the FIRST case below that applies
// (implementation_plan.md → Increment 2):
//
//   1. `unit_images` is a non-empty array → one option per entry, each with
//      its own label and its own image. Fully per-court. Needs the owner to
//      have applied database/schema/006_court_unit_images.sql AND filled the
//      column in.
//   2. the sport merged more than one DB row (Bowling: Duckpin + Ten-Pin) →
//      one option per row, using that row's own name and its own image_url.
//      Real today, no migration needed.
//   3. otherwise → derive `quantity` options from the unit noun
//      (Court 1..N / Lane N / Table N), all sharing the sport's single
//      image_url — which is NULL for every row right now, so today every
//      option shows the same honest placeholder.
//
// Cases 2 and 3 are why the combobox is useful *before* the migration lands,
// and each sport upgrades to real per-court photos the moment its
// `unit_images` is populated — with no code change.
// ============================================================================

// The singular noun for one bookable unit. `court.unit` is plural in the
// schema ('courts' | 'lanes' | 'tables' — database/schema/002_content_tables
// .sql) except Volleyball's seeded row, which is the singular 'court', so
// both spellings have to map.
const UNIT_NOUN = {
    court: 'Court',
    courts: 'Court',
    lane: 'Lane',
    lanes: 'Lane',
    table: 'Table',
    tables: 'Table',
};

function unitNoun(unit) {
    const key = String(unit || '').trim().toLowerCase();
    if (UNIT_NOUN[key]) return UNIT_NOUN[key];
    // `unit` is free text as far as the DB is concerned and admin Court
    // Listings can write it, so an unknown noun ("bays") is possible. Drop a
    // trailing 's' and title-case it rather than falling back to a generic
    // "Unit 1" that tells the customer nothing.
    const word = key.replace(/s$/, '');
    if (!word) return 'Unit';
    return word.charAt(0).toUpperCase() + word.slice(1);
}

// Returns { pickerLabel, units } where units is [{ label, imageUrl }, …].
// A sport that resolves to fewer than two units gets no combobox at all —
// a one-item <select> is a dead control, not a choice.
function resolveCourtUnits(court) {
    const noun = unitNoun(court.unit);

    const fromImages = Array.isArray(court.unitImages) ? court.unitImages : [];
    if (fromImages.length > 0) {
        return {
            pickerLabel: `Choose a ${noun.toLowerCase()}`,
            units: fromImages.map((entry, i) => ({
                label: entry.label || `${noun} ${i + 1}`,
                imageUrl: entry.imageUrl,
            })),
        };
    }

    const variants = Array.isArray(court.variants) ? court.variants : [];
    if (variants.length > 1) {
        return {
            // "Choose a lane" would be wrong here — the options are Duckpin
            // and Ten-Pin, which are kinds of lane, not individual lanes.
            pickerLabel: `Choose a ${noun.toLowerCase()} type`,
            units: variants.map((row) => ({
                label: variantLabel(row.name),
                imageUrl: row.imageUrl,
            })),
        };
    }

    const count = Math.max(0, Math.floor(Number(court.quantity) || 0));
    const units = [];
    for (let i = 1; i <= count; i++) {
        units.push({ label: `${noun} ${i}`, imageUrl: court.imageUrl });
    }
    // quantity 0 or missing: still show the sport's own photo, but with
    // nothing to pick between and no invented "Court 1" that doesn't exist.
    if (units.length === 0) {
        units.push({ label: null, imageUrl: court.imageUrl });
    }

    return { pickerLabel: `Choose a ${noun.toLowerCase()}`, units };
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
//   • shows ONE unit's photo large — or, when that unit has no image_url (or
//     the URL fails to load), the same honest .media-slot placeholder the grid
//     uses plus a matching status line;
//   • offers a labelled <select> listing every individual court / lane / table
//     for that sport (resolveCourtUnits above), hidden entirely when a sport
//     resolves to a single unit. Changing it swaps the photo and the unit
//     label in place — the dialog stays open;
//   • closes on Escape, on a backdrop click and on the close button;
//   • moves focus into the dialog on open and back to the invoking card on
//     close, and traps Tab in between;
//   • locks body scroll while open (body.court-viewer-lock).
//
// Every value it injects is either set with textContent or escaped with
// escapeHtml first (D3) — including the unit labels, which come straight out
// of `court.unit_images` and are therefore owner-written free text. No image
// path is hardcoded anywhere — the photos are whatever `court.image_url` /
// `court.unit_images[].image_url` hold, which the owner sets through admin
// Court Listings and the SQL editor respectively (OQ1).
// ============================================================================
function createCourtViewer() {
    const root = document.querySelector('[data-court-viewer]');
    if (!root) return null;

    const dialog = root.querySelector('[data-court-viewer-dialog]');
    const mediaEl = root.querySelector('[data-court-viewer-media]');
    const titleEl = root.querySelector('[data-court-viewer-title]');
    const countEl = root.querySelector('[data-court-viewer-count]');
    const unitEl = root.querySelector('[data-court-viewer-unit]');
    const pickerEl = root.querySelector('[data-court-viewer-units]');
    const pickerLabelEl = root.querySelector('[data-court-viewer-units-label]');
    const selectEl = root.querySelector('[data-court-viewer-select]');
    const noteEl = root.querySelector('[data-court-viewer-note]');
    const rateEl = root.querySelector('[data-court-viewer-rate]');
    const photoEl = root.querySelector('[data-court-viewer-photo-status]');
    const closeBtn = root.querySelector('[data-court-viewer-close]');
    const backdrop = root.querySelector('[data-court-viewer-backdrop]');

    if (!dialog || !mediaEl || !titleEl || !countEl || !unitEl || !pickerEl
        || !pickerLabelEl || !selectEl || !noteEl || !rateEl || !photoEl) {
        console.error('[IñigoSync] #courtViewer markup is incomplete — court cards cannot open. Check Pages/Index.html.');
        return null;
    }

    // Matches the CSS opacity transition on .court-viewer; the same 250ms
    // includes/auth.js uses for its overlay.
    const CLOSE_DELAY_MS = 250;
    const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const PHOTO_STATUS_HAVE = 'Photo provided by Iñigos Sports Center.';
    const PHOTO_STATUS_NONE = 'Photo coming soon — court photos are added by Iñigos through admin Court Listings.';
    const PHOTO_STATUS_BROKEN = 'This photo could not be loaded, so the placeholder is shown instead.';

    let lastFocused = null;
    let isOpen = false;
    let hideTimer = null;

    // Which sport is on screen, its resolved unit list, and a counter that
    // makes a late <img> error from a previously-selected unit a no-op
    // instead of letting it clobber whatever is showing now.
    let activeCourt = null;
    let units = [];
    let mediaToken = 0;

    // Paints the media panel for one unit. An <img> that fails to load — a
    // typo'd or dead unit_images URL, which the owner types by hand — is
    // swapped for the same .media-slot placeholder the grid uses, so this
    // never shows a broken-image icon.
    function paintMedia(unit) {
        const token = ++mediaToken;
        const monogram = monogramFor(activeCourt.sportSlug, activeCourt.name);
        const alt = unit.label ? `${activeCourt.name} — ${unit.label}` : activeCourt.name;

        // renderMediaSlot escapes both the alt text and the image URL.
        mediaEl.innerHTML = renderMediaSlot({ imageUrl: unit.imageUrl, alt, monogram });
        photoEl.textContent = unit.imageUrl ? PHOTO_STATUS_HAVE : PHOTO_STATUS_NONE;

        const img = mediaEl.querySelector('img');
        if (!img) return;

        img.addEventListener('error', () => {
            if (token !== mediaToken) return;
            mediaEl.innerHTML = renderMediaSlot({ imageUrl: null, alt, monogram });
            photoEl.textContent = PHOTO_STATUS_BROKEN;
            console.warn('[IñigoSync] Court photo failed to load for "%s" — showing the placeholder instead. Check court.image_url / court.unit_images.', alt);
        }, { once: true });
    }

    // Shows unit N. Called on open (always 0) and on every <select> change —
    // it deliberately does nothing else, so switching units never closes,
    // re-renders or re-focuses the dialog.
    function selectUnit(index) {
        if (!activeCourt || units.length === 0) return;

        const wanted = Number.isFinite(index) ? Math.floor(index) : 0;
        const unit = units[Math.min(Math.max(0, wanted), units.length - 1)];

        paintMedia(unit);

        // textContent, not innerHTML: the label can come straight from
        // court.unit_images, so it must never be able to become markup (D3).
        // It renders as the .eyebrow above the sport name — a caption for the
        // photo, not a second heading.
        unitEl.textContent = unit.label || '';
        // With a single unit there is no combobox to caption, and the title +
        // count already say everything a lone "Court 1" eyebrow would.
        unitEl.hidden = !unit.label || units.length < 2;
    }

    function open(court, invoker) {
        if (!court) return;

        lastFocused = invoker || document.activeElement;
        activeCourt = court;

        // Rebuilt from scratch on every open, so reopening for a different
        // sport can never show a stale option list or a stale selection.
        const resolved = resolveCourtUnits(court);
        units = resolved.units;
        const hasChoice = units.length > 1;

        pickerLabelEl.textContent = resolved.pickerLabel;
        selectEl.innerHTML = units
            .map((unit, i) => `<option value="${i}">${escapeHtml(unit.label || court.name)}</option>`)
            .join('');
        selectEl.selectedIndex = 0;
        pickerEl.hidden = !hasChoice;
        // The focus trap below matches `select:not([disabled])`, and
        // querySelectorAll knows nothing about [hidden] — leaving the select
        // enabled while hidden would put an unfocusable element in the trap's
        // list, and Tab would drop focus out of the dialog onto <body>.
        selectEl.disabled = !hasChoice;

        titleEl.textContent = court.name;
        countEl.innerHTML = `<span class="court-count-value">${escapeHtml(String(court.quantity))}</span><span class="court-count-unit">${escapeHtml(court.unit)}</span>`;

        // Paints the media, the photo-status line and the unit eyebrow.
        selectUnit(0);

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
        // Invalidate any in-flight image so a load error arriving during the
        // fade-out cannot repaint a dialog that is on its way out.
        mediaToken++;

        hideTimer = window.setTimeout(() => {
            root.hidden = true;
            // Drop the media so reopening never flashes the previous sport,
            // and a large photo isn't held decoded once it's off-screen. Same
            // for the option list — nothing stale is left for the next open.
            // open() clears this timer first, so a reopen inside the 250ms
            // fade can never be wiped by a late run of this callback.
            mediaEl.innerHTML = '';
            selectEl.innerHTML = '';
            selectEl.disabled = true;
            pickerEl.hidden = true;
            unitEl.hidden = true;
            unitEl.textContent = '';
            units = [];
            activeCourt = null;
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

    // Picking a different court/lane/table. `change` (not `input`) so a
    // keyboard user arrowing through the list on a platform that defers the
    // event gets one repaint, not one per key. The value is an index this
    // file wrote into the option itself — never user-supplied text.
    selectEl.addEventListener('change', () => {
        selectUnit(Number(selectEl.value));
    });

    document.addEventListener('keydown', (e) => {
        if (!isOpen) return;

        if (e.key === 'Escape') {
            e.preventDefault();
            close();
            return;
        }

        if (e.key !== 'Tab') return;

        // Focus trap. The dialog holds one or two focusable children — the
        // close button always, plus the unit combobox when the sport has more
        // than one unit — so without this Tab would walk straight out into the
        // page behind the backdrop. The combobox is `disabled` whenever it is
        // hidden, which is what keeps it out of this list (`:not([disabled])`)
        // rather than leaving an unfocusable element in the rotation.
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
