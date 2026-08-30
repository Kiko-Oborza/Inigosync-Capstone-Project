// IñigoSync — Shared court/sport data layer for the customer + admin
// dashboards (Court Information, Booking Management, admin Court Listings).
//
// This is Phase 2's fix for docs/QA_AUDIT_REPORT.md P0#8: three contradictory
// hardcoded court lists (landing, customer dashboard, admin dashboard) that
// disagreed with each other. All three now read the same `court`/`sport`
// tables — the landing page already did this correctly (see
// includes/landingPage.js's getCourts()); this file gives the two dashboard
// controllers (includes/Dashboard.js, includes/owner_dashboard.js) the exact
// same fetch-with-static-fallback pattern landingPage.js proved, instead of
// each hand-rolling its own copy that could drift the same way the old
// hardcoded arrays did.
//
// Deliberately NOT reusing includes/landingPage.js's internal getCourts()
// directly: that file is only <script>-included on Pages/Index.html, and
// pulling the whole file into the dashboards would double-wire the theme
// toggle, nav scroll-spy, and hero-carousel code it also contains — querying
// elements that don't exist there is harmless, but re-registering the
// `[data-theme-toggle]` click listener a second time is not (the toggle
// would fire twice per click and appear to do nothing). This file owns only
// the data layer, never any page-specific rendering/wiring.
//
// One deliberate difference from landingPage.js's getCourts(): rows are
// returned UNMERGED. The landing page merges Bowling's Duckpin/Ten-Pin rows
// into one marketing-overview card (mergeCourtsBySport); the dashboards need
// every row addressable on its own — the customer picks a specific bookable
// unit (Duckpin vs Ten-Pin have different rates and rate units), and the
// admin edits one specific row's id. Merging here would make "Edit" ambiguous
// about which underlying row it's touching.
//
// This project ships plain <script src> tags (no build step, no ES
// modules), so this attaches to window, same as includes/escape.js. Load
// this after Config/supabaseClient.js and includes/courts-data.js, and
// before includes/Dashboard.js / includes/owner_dashboard.js.
//
// See database/schema/002_content_tables.sql for the `court`/`sport` shape,
// database/schema/003_court_rating.sql for the optional `rating` column this
// also reads (renders only once the owner has run that migration AND a
// court actually has a rating — both are true today), and
// database/seed/002_seed_content.sql for the real 9-row data the fallback
// below mirrors.
(function () {
    const FETCH_TIMEOUT_MS = 6000;

    // Same 2-letter marks includes/landingPage.js uses, so a court renders
    // identically whether the customer sees it there or in their dashboard.
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

    // Sport display names, keyed by slug. Used for (a) the FALLBACK court
    // rows below (COURTS_INVENTORY doesn't carry a separate sport name —
    // "Bowling — Duckpin" is the *court* name, not the sport's), and (b) the
    // admin "Sport type" dropdown's own fallback if the live `sport` table
    // can't be reached. Whenever the DB is reachable, the real sportName
    // always comes from the join/select instead of this map.
    const SPORT_NAMES = {
        'basketball': 'Basketball',
        'badminton': 'Badminton',
        'lawn-tennis': 'Lawn Tennis',
        'pickleball': 'Pickleball',
        'bowling': 'Bowling',
        'billiards': 'Billiards',
        'table-tennis': 'Table Tennis',
        'volleyball': 'Volleyball',
    };

    function monogramFor(sportSlug, name) {
        if (sportSlug && SPORT_MONOGRAM[sportSlug]) return SPORT_MONOGRAM[sportSlug];
        const words = String(name || '?').split('—')[0].trim().split(/\s+/).filter(Boolean);
        if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
        return (words[0] || '?').slice(0, 2).toUpperCase();
    }

    // URL-safe slug for a NEW court's `slug` column (text, not null,
    // unique). Only used on insert — editing an existing court never
    // touches its slug (see includes/owner_dashboard.js), so a rename can't
    // collide with another row's slug or orphan anything that keyed off it.
    function slugify(name) {
        const base = String(name || '')
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        return base || `court-${Date.now()}`;
    }

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
    // signal callers use to fall back to static content instead of
    // rendering a blank grid/dropdown.
    async function safeSelect(runQuery) {
        if (!window.sb) return null;
        try {
            const { data, error } = await withTimeout(runQuery(), FETCH_TIMEOUT_MS);
            if (error) {
                console.warn('[IñigoSync] court/sport query failed — using fallback content instead.', error.message || error);
                return null;
            }
            return (Array.isArray(data) && data.length > 0) ? data : null;
        } catch (err) {
            console.warn('[IñigoSync] court/sport query threw — using fallback content instead.', err);
            return null;
        }
    }

    // ------------------------------------------------------------------
    // Fallback courts — reuses includes/courts-data.js's COURTS_INVENTORY
    // (the SAME 9 rows database/seed/002_seed_content.sql inserts) when
    // that file is loaded on the page, so there is exactly ONE
    // hand-maintained fallback array in the whole project, not a second copy
    // that could silently drift back to the old contradictory 5-item lists
    // this phase removed (docs/QA_AUDIT_REPORT.md P0#8). INLINE_FALLBACK is
    // only a safety net for a page that forgets to include courts-data.js —
    // kept in sync with the same 9 rows by hand, same as COURTS_INVENTORY
    // itself already is.
    // ------------------------------------------------------------------
    const INLINE_FALLBACK = [
        { id: 'basketball', name: 'Basketball', quantity: 2, unit: 'courts', description: 'Full court · Indoor · Scoreboard', rate: null, rateUnit: '/hr', status: 'Available', image_url: null },
        { id: 'badminton', name: 'Badminton', quantity: 9, unit: 'courts', description: 'Indoor · Rackets for rent', rate: null, rateUnit: '/hr', status: 'Available', image_url: null },
        { id: 'lawn-tennis', name: 'Lawn Tennis', quantity: 3, unit: 'courts', description: 'Outdoor · Professional grade', rate: null, rateUnit: '/hr', status: 'Available', image_url: null },
        { id: 'pickleball', name: 'Pickleball', quantity: 2, unit: 'courts', description: 'Indoor · Recently added', rate: null, rateUnit: '/hr', status: 'Available', image_url: null },
        { id: 'bowling-duckpin', name: 'Bowling — Duckpin', quantity: 8, unit: 'lanes', description: 'Duckpin bowling · Shoes included', rate: null, rateUnit: '/game', status: 'Available', image_url: null },
        { id: 'bowling-tenpin', name: 'Bowling — Ten-Pin', quantity: 12, unit: 'lanes', description: 'Ten-pin bowling · Shoes included', rate: null, rateUnit: '/game', status: 'Available', image_url: null },
        { id: 'billiards', name: 'Billiards', quantity: 2, unit: 'tables', description: 'Professional pool tables · Cue service available', rate: null, rateUnit: '/hr', status: 'Available', image_url: null },
        { id: 'table-tennis', name: 'Table Tennis', quantity: 2, unit: 'tables', description: 'Tournament-grade tables · Paddles for rent', rate: null, rateUnit: '/hr', status: 'Available', image_url: null },
        { id: 'volleyball', name: 'Volleyball', quantity: 1, unit: 'court', description: 'Full court · Indoor · Net included', rate: null, rateUnit: '/hr', status: 'Available', image_url: null },
    ];

    function fallbackCourts() {
        const source = (typeof COURTS_INVENTORY !== 'undefined') ? COURTS_INVENTORY : INLINE_FALLBACK;
        return source.map((item, index) => {
            // Duckpin/ten-pin ids carry a suffix so they land under the one
            // 'bowling' sport group — same trick includes/landingPage.js's
            // normalizeCourtFromFallback uses.
            const sportSlug = String(item.id).replace(/-duckpin$|-tenpin$/, '');
            return {
                id: `fallback-${item.id}`,
                sportId: null,
                sportSlug,
                sportName: SPORT_NAMES[sportSlug] || sportSlug,
                slug: item.id,
                name: item.name || '',
                quantity: Number(item.quantity) || 0,
                unit: item.unit || 'courts',
                description: item.description || '',
                rate: (item.rate === '—' || item.rate === null || item.rate === undefined) ? null : Number(item.rate),
                rateUnit: item.rateUnit || '/hr',
                status: item.status || 'Available',
                imageUrl: item.image_url || null,
                displayOrder: index + 1,
                isActive: true,
                // No fallback ever invents a rating — see
                // database/schema/003_court_rating.sql's note on this.
                rating: null,
            };
        });
    }

    const SPORTS_FALLBACK = Object.keys(SPORT_NAMES).map((slug, index) => ({
        id: `fallback-${slug}`,
        slug,
        name: SPORT_NAMES[slug],
        display_order: index + 1,
    }));

    // ------------------------------------------------------------------
    // Normalize — same idea as landingPage.js's normalizeCourtFromDb, but
    // keeps `id`/`sportId` (the admin needs a real row id to target an
    // update) and reads `rating`, which doesn't exist on `court` until the
    // owner runs database/schema/003_court_rating.sql. Selecting `*` (see
    // runCourtsQuery below) rather than naming columns means that migration
    // needs zero changes here — an unknown `rating` column is simply
    // `undefined` on every row until it exists, same as `null`.
    // ------------------------------------------------------------------
    function normalizeCourt(row) {
        return {
            id: row.id,
            sportId: row.sport_id || (row.sport && row.sport.id) || null,
            sportSlug: (row.sport && row.sport.slug) || null,
            sportName: (row.sport && row.sport.name) || '',
            slug: row.slug || '',
            name: row.name || '',
            quantity: Number(row.quantity) || 0,
            unit: row.unit || 'courts',
            description: row.description || '',
            rate: (row.rate === null || row.rate === undefined) ? null : Number(row.rate),
            rateUnit: row.rate_unit || '/hr',
            status: row.status || 'Available',
            imageUrl: row.image_url || null,
            displayOrder: Number(row.display_order) || 0,
            isActive: row.is_active !== false,
            rating: (row.rating === null || row.rating === undefined) ? null : Number(row.rating),
        };
    }

    function runCourtsQuery(includeInactive) {
        let query = window.sb.from('court').select('*, sport(id, slug, name)').order('display_order');
        if (!includeInactive) query = query.eq('is_active', true);
        return query;
    }

    // Memoized per includeInactive so Court Information + Booking
    // Management (both active-only) share one network request, same as
    // landingPage.js memoizing courtsPromise — but re-fetchable (`force`)
    // so an admin's Add/Edit/Activate immediately reflects instead of
    // showing stale data until the next full page load.
    const courtsCache = { active: null, all: null };

    function getCourts({ includeInactive = false, force = false } = {}) {
        const key = includeInactive ? 'all' : 'active';
        if (force) courtsCache[key] = null;
        if (!courtsCache[key]) {
            courtsCache[key] = safeSelect(() => runCourtsQuery(includeInactive))
                .then((rows) => (rows ? rows.map(normalizeCourt) : fallbackCourts()));
        }
        return courtsCache[key];
    }

    function invalidateCourts() {
        courtsCache.active = null;
        courtsCache.all = null;
    }

    let sportsPromise = null;
    // Set inside getSports()'s own .then(), before the value it resolves to
    // reaches any caller's .then()/await — see isSportsFallback() below.
    let sportsWasFallback = false;
    function getSports({ force = false } = {}) {
        if (force) sportsPromise = null;
        if (!sportsPromise) {
            sportsPromise = safeSelect(() => window.sb.from('sport').select('*').eq('is_active', true).order('display_order'))
                .then((rows) => {
                    sportsWasFallback = !rows;
                    return rows || SPORTS_FALLBACK;
                });
        }
        return sportsPromise;
    }

    // Lets a caller tell "getSports() resolved with the real `sport` table"
    // apart from "getSports() fell back to the static SPORTS_FALLBACK"
    // without changing getSports()'s own return shape (still a plain
    // array) — every existing caller (the admin Court Listings sport
    // dropdown, staff_dashboard.js's schedule sport tabs) reads it that way
    // and neither needs to know which case it got. Only meaningful after
    // the getSports() promise the caller cares about has resolved; reflects
    // whichever fetch actually ran, since getSports() memoizes.
    function isSportsFallback() {
        return sportsWasFallback;
    }

    window.InigoCourtsData = {
        getCourts,
        invalidateCourts,
        getSports,
        isSportsFallback,
        monogramFor,
        slugify,
    };
})();
