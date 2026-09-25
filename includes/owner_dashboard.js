// IñigoSync — Owner Dashboard controller
// Staff Management, Account Settings, Court Listings, the Booking Overview
// stat tiles/Website performance/Booking status breakdown, Media Manager,
// and Feedbacks & Reviews all talk to the real Supabase database.
// (Booking trend chart setup lives in event/chart.js, loaded below.)
//
// Revision A1 (implementation_plan.md) brought this page up to the same
// standard as the customer dashboard: a real logo (A1), live Recent
// bookings + Booking status this month replacing two hardcoded fake cards
// (A3), an instant default-password Reset Password RPC + Activate for
// disabled staff (A4), a real Media Manager against `public.event` + a
// Storage bucket (A5), an Add/Edit court modal (A6), a real notifications
// dropdown (A7), a topbar/settings avatar that renders profiles.avatar_url
// (A8), and a Profile Photo card + editable email + a 2-step Change
// Password wizard in Account Settings (A9). See that section of
// implementation_plan.md for the full rationale; individual blocks below
// cite the specific decision letter they implement.
//
// Revision A2 (implementation_plan.md) followed up: the sidebar Log Out is
// gone (B1, dropdown keeps it), the dropdown gained a View Profile panel
// (B2), Add New Staff moved into a modal (B3), Payment Configuration was
// removed outright (B4), a responsive/consistency pass touched
// Style/owner_dashboard.css (B5), the Court modal gained a Cover + per-unit
// Photos section with a crop editor (B6, includes/imageTools.js's
// openCropEditor()), and courts are per-hour only (B7, no more Billing
// unit / "Per game").
//
// Revision A3 (implementation_plan.md) followed up again: Change Password's
// placeholders read as instructions, not fake passwords (C1); Staff
// Management/the "Active staff accounts" stat are staff-only, no more owner
// row (C2); Booking status this month drops Confirmed/Cancelled (C3);
// Recent bookings was replaced by a Website performance card of 6 honest,
// client-measurable checks (C4, refreshWebsitePerformance()); and a new
// Feedbacks & Reviews tab renders a Google-Play-style ratings summary +
// sortable/filterable list over the `feedback` table (C5).

// Revision A3, decision C4 — "Errors this session" counter for the Website
// performance card. Registered here, at the very top of this file (before
// the DOMContentLoaded listener below, and before every other <script> this
// file could theoretically outlive), so an error thrown at any point during
// this page's lifetime — including before DOMContentLoaded fires — is
// counted the first time refreshWebsitePerformance() reads
// inigosyncSessionErrorCount. Never reset for the life of this tab: "this
// session" means "since this page was loaded", not "since the last check".
let inigosyncSessionErrorCount = 0;
window.addEventListener('error', () => { inigosyncSessionErrorCount += 1; });
window.addEventListener('unhandledrejection', () => { inigosyncSessionErrorCount += 1; });

document.addEventListener('DOMContentLoaded', () => {
    // ------------------------------------------------------------------
    // Panel switching (sidebar + topbar/profile shortcuts)
    // ------------------------------------------------------------------
    const panels = document.querySelectorAll('[data-admin-panel]');
    const titleEl = document.querySelector('[data-admin-title]');
    const subtitleEl = document.querySelector('[data-admin-subtitle]');

    const panelMeta = {
        overview: { title: 'Booking Overview', subtitle: 'Reservation trends, staff activity, and business performance at a glance.' },
        // Revision A2 (implementation_plan.md, decision B4) — "…and
        // configure payment settings" dropped now that Payment
        // Configuration is gone (see this file's own removal note below).
        staff: { title: 'Staff Management', subtitle: 'Add, update, or remove staff accounts.' },
        courts: { title: 'Court Listings', subtitle: 'Add new courts, update details, or activate/deactivate existing ones.' },
        media: { title: 'Media Manager', subtitle: "Whatever you upload here shows up on the website's home featured slideshow — both the landing page and the customer dashboard." },
        // Revision A3 (implementation_plan.md, decision C5) — new tab, after
        // Media Manager in the sidebar.
        feedback: { title: 'Feedbacks & Reviews', subtitle: '' },
        settings: { title: 'Account Settings', subtitle: 'Update your personal details and manage your owner password.' },
        // Revision A2, decision B2 — not in .admin-nav, only reachable from
        // the profile dropdown's "View Profile"; setActivePanel() below
        // still works unmodified since it just looks this key up.
        profile: { title: 'Profile', subtitle: '' },
    };

    function setActivePanel(name) {
        panels.forEach((panel) => {
            panel.classList.toggle('is-active', panel.dataset.adminPanel === name);
        });

        document.querySelectorAll('[data-admin-nav]').forEach((btn) => {
            if (btn.closest('.admin-nav')) {
                btn.classList.toggle('is-active', btn.dataset.adminNav === name);
            }
        });

        const meta = panelMeta[name];
        if (meta && titleEl && subtitleEl) {
            titleEl.textContent = meta.title;
            subtitleEl.textContent = '';
            subtitleEl.hidden = true;
        }

        // Revision A3, decision C5 — Feedbacks & Reviews loads its data on
        // panel open rather than eagerly at startup (see loadFeedback's own
        // comment). loadFeedback is a hoisted function declaration defined
        // later in this file; calling it here is safe regardless of source
        // order, same reasoning already documented below for
        // closeAdminNotifMenu.

        closeMobileSidebar();
        closeProfileMenu();
        closeAdminNotifMenu();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    document.querySelectorAll('[data-admin-nav]').forEach((btn) => {
        btn.addEventListener('click', () => setActivePanel(btn.dataset.adminNav));
    });

    // ------------------------------------------------------------------
    // Mobile sidebar toggle
    // ------------------------------------------------------------------
    const mobileToggle = document.querySelector('[data-admin-mobile-toggle]');
    const scrim = document.querySelector('[data-admin-scrim]');

    function closeMobileSidebar() {
        document.body.classList.remove('admin-sidebar-open');
        if (mobileToggle) mobileToggle.setAttribute('aria-expanded', 'false');
    }

    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            const isOpen = document.body.classList.toggle('admin-sidebar-open');
            mobileToggle.setAttribute('aria-expanded', String(isOpen));
        });
    }
    if (scrim) scrim.addEventListener('click', closeMobileSidebar);

    // ------------------------------------------------------------------
    // Profile dropdown
    // ------------------------------------------------------------------
    const profile = document.querySelector('[data-admin-profile]');
    const profileTrigger = document.querySelector('[data-admin-profile-trigger]');

    function closeProfileMenu() {
        if (profile) profile.removeAttribute('data-open');
    }

    if (profileTrigger && profile) {
        profileTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            // closeAdminNotifMenu is a hoisted function declaration defined
            // further down this file (Notifications section) — safe to call
            // from here regardless of source order, same reasoning
            // includes/Dashboard.js documents for its own closeNotifMenu.
            closeAdminNotifMenu();
            if (profile.hasAttribute('data-open')) {
                profile.removeAttribute('data-open');
            } else {
                profile.setAttribute('data-open', '');
            }
        });

        document.addEventListener('click', (e) => {
            if (!profile.contains(e.target)) closeProfileMenu();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeProfileMenu();
        });
    }

    // Logout is wired in includes/authGuard.js (real Supabase sign-out).

    // ------------------------------------------------------------------
    // Theme toggle — includes/theme.js manages the data-theme attribute
    // and persistence; this just wires the topbar button to it and keeps
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
    // Live clock (topbar)
    // ------------------------------------------------------------------
    const clockEl = document.querySelector('[data-admin-clock]');
    function renderClock() {
        if (!clockEl) return;
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        clockEl.textContent = `${dateStr} · ${timeStr}`;
    }
    renderClock();
    window.setInterval(renderClock, 30000);

    // True when a Supabase/PostgREST error means "this column/table doesn't
    // exist" — used to turn a raw Postgres error into an honest, specific
    // "needs a database update" message instead of a generic one or (worse)
    // a silent fake success. Same detector as staff_dashboard.js's
    // isSchemaMismatchError — duplicated rather than shared, matching how
    // every other helper in this file is self-contained (no shared module
    // beyond escape.js/courtsData.js/appSettings.js/imageTools.js).
    function isSchemaMismatchError(error) {
        if (!error) return false;
        const code = error.code || '';
        const message = String(error.message || '').toLowerCase();
        return code === 'PGRST204' || code === 'PGRST205' || code === '42703' || code === '42P01' || code === '42883'
            || message.includes('could not find') || message.includes('does not exist')
            || message.includes('schema cache');
    }

    // Revision A1 security requirement (implementation_plan.md) — only
    // allow https:// URLs or the project's own relative paths into an
    // <img src>/image_url column; rejects javascript:/data:/vbscript: etc.
    // Applied both when SAVING a court/slide image URL and when RENDERING
    // one, so a bad value already in the database (however it got there)
    // never reaches an <img src> either. The avatar pipeline's data: URLs
    // are the one deliberate exception — those are generated internally by
    // includes/imageTools.js from a local file, never taken from a URL
    // <input>, and are never run through this check.
    function isSafeImageUrl(url) {
        const value = String(url || '').trim();
        if (!value) return false;
        if (/^https:\/\//i.test(value)) return true;
        if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false; // any other explicit scheme (javascript:, data:, ...)
        if (value.startsWith('//')) return false; // protocol-relative — resolves to whatever scheme the browser likes
        return true; // a relative project path, e.g. "../database/web/basketball.jpg"
    }

    // Shared by the Court modal's photo upload (Court Listings) and Media
    // Manager's slide photos (A5/A6) — both write into the SAME public
    // `media` Storage bucket created by database/schema/015_media_bucket.sql.
    function isMediaBucketMissingError(error) {
        if (!error) return false;
        const message = String(error.message || '').toLowerCase();
        const status = error.statusCode || error.status;
        return message.includes('bucket not found') || String(status) === '404';
    }

    async function uploadToMedia(path, blob) {
        if (!window.sb) throw new Error('Unable to reach the server right now. Please try again shortly.');
        const { error } = await window.sb.storage.from('media').upload(path, blob, {
            upsert: true,
            contentType: 'image/jpeg',
        });
        if (error) {
            if (isMediaBucketMissingError(error)) {
                throw new Error("Media storage isn't set up yet — run database/schema/015_media_bucket.sql");
            }
            throw new Error(error.message || 'Could not upload that image.');
        }
        const { data } = window.sb.storage.from('media').getPublicUrl(path);
        if (!data || !data.publicUrl) throw new Error('Upload succeeded, but no public URL was returned.');
        return data.publicUrl;
    }

    // Best-effort cleanup of a REPLACED/REMOVED photo's old object in the
    // `media` bucket — "best effort" because a stray orphaned object left
    // behind on failure is a harmless storage-quota nit, not something
    // worth surfacing to the admin as an error over. Silently no-ops for
    // any URL that isn't one of our own uploads (e.g. a pasted external
    // https:// URL, or a relative fallback path) — nothing to clean up.
    function removeUploadedMediaBestEffort(url) {
        if (!url || !window.sb) return;
        const marker = '/storage/v1/object/public/media/';
        const idx = url.indexOf(marker);
        if (idx === -1) return;
        const path = url.slice(idx + marker.length);
        if (!path) return;
        window.sb.storage.from('media').remove([path]).then(() => {}, () => {});
    }

    // Shared date/time formatter for Recent bookings + Notifications —
    // "Sep 14, 9:00 AM – 11:00 AM" when an end time is known, "Sep 14,
    // 9:00 AM" otherwise.
    function formatAdminDateTime(startIso, endIso) {
        const start = new Date(startIso);
        if (Number.isNaN(start.getTime())) return '—';
        const dateLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const startLabel = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        let timeLabel = startLabel;
        if (endIso) {
            const end = new Date(endIso);
            if (!Number.isNaN(end.getTime())) {
                timeLabel = `${startLabel} – ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
            }
        }
        return `${dateLabel}, ${timeLabel}`;
    }

    // Derived "Unattended" status — same 30-minute-grace rule
    // includes/Dashboard.js's displayStatusFor() uses (Revision 2, R4):
    // more than 30 minutes past time_date, no checked_in_at, and still
    // pending/confirmed. Duplicated rather than shared (this file has no
    // dependency on Dashboard.js and never loads it) — see
    // isSchemaMismatchError's own comment above for why every helper here
    // is self-contained.
    const ADMIN_UNATTENDED_GRACE_MINUTES = 30;
    function adminDisplayStatusFor(booking) {
        const rawStatus = String(booking.status || '').toLowerCase();
        if (rawStatus !== 'pending' && rawStatus !== 'confirmed') return rawStatus;
        if (booking.checked_in_at) return rawStatus;

        const start = new Date(booking.time_date);
        if (Number.isNaN(start.getTime())) return rawStatus;

        const graceDeadline = start.getTime() + ADMIN_UNATTENDED_GRACE_MINUTES * 60000;
        return Date.now() > graceDeadline ? 'unattended' : rawStatus;
    }

    // Shared by Recent bookings (customer_id → name) and Notifications
    // (customer_id → name) — no PostgREST embed, since a real FK from
    // booking.customer_id to profiles.id isn't confirmed in this
    // repo-invisible table (see database/schema/004_staff_module.sql's own
    // header note on `booking`).
    async function fetchProfileNamesByIds(ids) {
        const uniqueIds = Array.from(new Set((ids || []).filter(Boolean).map(String)));
        const map = new Map();
        if (!uniqueIds.length || !window.sb) return map;

        const { data, error } = await window.sb.from('profiles').select('id, full_name').in('id', uniqueIds);
        if (error) {
            console.error('[admin] failed to load customer names', error);
            return map;
        }
        (data || []).forEach((p) => map.set(String(p.id), p.full_name || 'Customer'));
        return map;
    }

    // ------------------------------------------------------------------
    // Booking Overview — 4 real stat tiles (previously hardcoded to
    // 102/14/8/4 with no data-* binding at all). Computed from the same
    // tables Staff Management, Court Listings, and staff_dashboard.js's own
    // stat tiles already read — no new tables needed (implementation_plan.md
    // E1). "—" (not "0") whenever a count is genuinely unknown — a query
    // error, window.sb missing, or the whole fetch rejecting — matching the
    // project's existing "Rate TBA"-style rule of never showing an invented
    // number.
    // ------------------------------------------------------------------
    function setAdminStat(key, value) {
        document.querySelectorAll(`[data-admin-stat="${key}"]`).forEach((el) => {
            el.textContent = String(value);
        });
    }

    const ADMIN_STAT_KEYS = ['bookings-month', 'bookings-today', 'sports-listed', 'active-staff'];
    function setAllAdminStatsUnknown() {
        ADMIN_STAT_KEYS.forEach((key) => setAdminStat(key, '—'));
    }

    function monthRange(date = new Date()) {
        const start = new Date(date.getFullYear(), date.getMonth(), 1);
        const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
        return { start, end };
    }

    function dayRange(date = new Date()) {
        const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        return { start, end };
    }

    async function refreshOverviewStats() {
        // window.sb missing leaves the tiles on Pages/owner_dashboard.html's
        // own markup default, which is "—" for exactly this reason (see
        // that file's comment on the admin-stat-grid).
        if (!window.sb) return;

        const { start: monthStart, end: monthEnd } = monthRange();
        const { start: dayStart, end: dayEnd } = dayRange();

        let monthRes, todayRes, staffRes, sports;
        try {
            [monthRes, todayRes, staffRes, sports] = await Promise.all([
                window.sb.from('booking').select('*', { count: 'exact', head: true })
                    .gte('time_date', monthStart.toISOString()).lt('time_date', monthEnd.toISOString()),
                window.sb.from('booking').select('*', { count: 'exact', head: true })
                    .gte('time_date', dayStart.toISOString()).lt('time_date', dayEnd.toISOString()),
                // Revision A3, decision C2 — staff ONLY now (.eq, not the old
                // .in('role', ['staff', 'admin'])): this tile shares the
                // data-admin-stat="active-staff" hook with the profile
                // panel's own "Active staff accounts" stat, and both are
                // meant to count the STAFF the owner manages, not the owner
                // counting themselves. Mirrors refreshStaffList()'s own
                // .eq('role', 'staff') below — same table, same filter,
                // same reasoning.
                //
                // "Not disabled" — NOT .eq('status', 'active'). staffStatusBadge()
                // below and the Deactivate button both treat "anything but
                // disabled" (including a NULL status, which no frontend code
                // here ever sets, and profiles' real column constraints are
                // unknown — see database/seed/001_seed_users.sql's "KNOWN
                // LIMITATION" note) as active/shown; .eq('status', 'active')
                // would only match seeded demo rows and disagree with the
                // staff table on the same screen. Plain .neq('status',
                // 'disabled') isn't enough on its own either: SQL's `<>`
                // never matches a NULL column (three-valued logic), so a
                // NULL-status row would still be silently dropped — the
                // .or() below adds it back explicitly.
                window.sb.from('profiles').select('*', { count: 'exact', head: true })
                    .eq('role', 'staff').or('status.neq.disabled,status.is.null'),
                window.InigoCourtsData ? window.InigoCourtsData.getSports() : Promise.resolve([]),
            ]);
        } catch (err) {
            // A rejected Promise.all (network failure, etc.) — as opposed to
            // an individual query resolving with a Postgres error, handled
            // below — means none of the four counts are known.
            console.error('[admin] failed to load the overview stats', err);
            setAllAdminStatsUnknown();
            return;
        }

        if (monthRes.error) console.error('[admin] failed to load the bookings-this-month stat', monthRes.error);
        if (todayRes.error) console.error('[admin] failed to load the bookings-today stat', todayRes.error);
        if (staffRes.error) console.error('[admin] failed to load the active-staff stat', staffRes.error);

        // getSports() falls back to a static SPORTS_FALLBACK array when the
        // real `sport` table can't be reached (includes/courtsData.js) —
        // isSportsFallback() reports that without changing getSports()'s own
        // return shape, which the court modal's sport dropdown below and
        // staff_dashboard.js's schedule tabs still expect to be a plain
        // array. A fallback count is a real number of *options*, not a real
        // count of listed sports, so it's shown as unknown too.
        const sportsIsFallback = Boolean(
            window.InigoCourtsData && window.InigoCourtsData.isSportsFallback && window.InigoCourtsData.isSportsFallback()
        );

        setAdminStat('bookings-month', monthRes.error ? '—' : (monthRes.count || 0));
        setAdminStat('bookings-today', todayRes.error ? '—' : (todayRes.count || 0));
        setAdminStat('sports-listed', sportsIsFallback ? '—' : (sports || []).length);
        setAdminStat('active-staff', staffRes.error ? '—' : (staffRes.count || 0));

        // Revision A1, decision A3 — the Booking status breakdown refreshes
        // alongside the 4 stat tiles, from this SAME entry point (also
        // triggered on 'inigosync:profile-ready' below), rather than a
        // second listener elsewhere. Revision A3, decision C4 — the old
        // Recent bookings table (which used to also refresh from here) is
        // gone; Website performance replaced it and runs on its own
        // schedule — see refreshWebsitePerformance()'s own comment for why
        // it isn't wired to this same entry point.
        refreshStatusBreakdown();
    }

    // ------------------------------------------------------------------
    // Overview — Booking status this month (Revision A1, decision A3).
    // Replaces the old hardcoded "Staff on shift" card: real counts,
    // rendered as the SAME label + count + proportional-bar rows
    // (.admin-progress-*) the old fake card used.
    //
    // Revision A3, decision C3 — trimmed to Pending/Completed/Unattended
    // only; Confirmed and Cancelled are dropped from this render order (and
    // from `counts` below, so nothing is even tallied for them any more —
    // "counts still fetched for nothing else" per the plan). The derived
    // Unattended rule itself (adminDisplayStatusFor()) is unchanged; bars
    // stay proportional to the max of these 3 shown counts.
    const ADMIN_STATUS_LABELS = { pending: 'Pending', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled', no_show: 'No-show' };
    let statusRange = 'month';

    function statusDateRange(range) {
        const now = new Date();
        if (range === 'week') {
            const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
            return { start, end: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) };
        }
        if (range === 'year') {
            return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear() + 1, 0, 1) };
        }
        return monthRange(now);
    }

    document.querySelectorAll('[data-admin-status-range]').forEach((button) => {
        button.addEventListener('click', () => {
            statusRange = button.dataset.adminStatusRange;
            document.querySelectorAll('[data-admin-status-range]').forEach((item) => {
                item.classList.toggle('is-active', item === button);
            });
            refreshStatusBreakdown();
        });
    });

    async function refreshStatusBreakdown() {
        const listRoot = document.querySelector('[data-admin-status-breakdown]');
        if (!listRoot || !window.sb) return;

        const { start, end } = statusDateRange(statusRange);

        const rows = [];
        for (let offset = 0; ; offset += 1000) {
            const { data, error } = await window.sb
                .from('booking')
                .select('status, time_date, auto_cancelled_at')
                .gte('time_date', start.toISOString())
                .lt('time_date', end.toISOString())
                .order('time_date', { ascending: true })
                .range(offset, offset + 999);
            if (error || !data) {
                console.error('[admin] failed to load the booking status breakdown', error);
                listRoot.innerHTML = '<p style="color: var(--color-ink-faint);">Could not load booking status.</p>';
                return;
            }
            rows.push(...data);
            if (data.length < 1000) break;
        }

        const counts = { pending: 0, confirmed: 0, completed: 0, cancelled: 0, no_show: 0 };
        rows.forEach((row) => {
            const key = row.auto_cancelled_at ? 'no_show' : row.status;
            if (Object.prototype.hasOwnProperty.call(counts, key)) counts[key] += 1;
        });

        const maxCount = Math.max(1, ...Object.values(counts));

        listRoot.innerHTML = Object.keys(ADMIN_STATUS_LABELS).map((key) => {
            const count = counts[key];
            const pct = Math.round((count / maxCount) * 100);
            return `
                <div class="admin-progress-item">
                    <div class="admin-progress-row">
                        <span>${ADMIN_STATUS_LABELS[key]}</span>
                        <span class="admin-progress-count">${count} booking${count === 1 ? '' : 's'}</span>
                    </div>
                    <div class="admin-progress-track"><div class="admin-progress-fill" style="width: ${pct}%;"></div></div>
                </div>
            `;
        }).join('');
    }

    // ------------------------------------------------------------------
    // Overview — Website performance (Revision A3, implementation_plan.md,
    // decision C4). Replaces the old Recent bookings card with 6 honest,
    // client-measurable health checks. Every check either returns a REAL
    // measured value or, if it genuinely can't run right now, an explicit
    // "—" value with a neutral "Unavailable" pill and a tooltip reason
    // (adminPerfUnavailableRow) — never a fabricated number. Each check
    // function is written to never reject (its own try/catch always
    // resolves to a row), so Promise.all below can't itself fail.
    // ------------------------------------------------------------------

    // Supabase's free tier includes 1 GB of Storage — this is a plain
    // display constant, not read from any API (Supabase doesn't expose a
    // "your plan's included storage" endpoint to the client), so it has to
    // be updated here by hand if the project's plan changes.
    const MEDIA_STORAGE_LIMIT_BYTES = 1024 ** 3;

    // Safety cap on checkAdminPerfMediaStorage()'s recursive descent into
    // Storage "folders" (list() entries with no `metadata`) — a media
    // library this deeply nested is not expected, and this bounds how many
    // list() round trips a single Run check can ever make.
    const ADMIN_PERF_MAX_STORAGE_FOLDERS = 20;
    const ADMIN_PERF_REFRESH_MS = 5 * 60 * 1000;

    function adminPerfUnavailableRow(label, reason) {
        return { label, value: '—', status: 'neutral', pillText: 'Unavailable', title: reason || 'This check could not run.' };
    }

    // Human-friendly byte size — "12.4 MB", "1 GB" (whole GB reads cleaner
    // than "1.0 GB" for the common case of a near-empty/near-fresh bucket
    // limit), "930 KB". Self-contained rather than reusing any customer/
    // staff-page helper, matching this file's existing convention (see
    // isSchemaMismatchError's own comment near the top of this file).
    function formatAdminPerfBytes(bytes) {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let value = Math.max(0, Number(bytes) || 0);
        let unitIndex = 0;
        while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex += 1;
        }
        const rounded = (unitIndex === 0 || value >= 100) ? Math.round(value) : Math.round(value * 10) / 10;
        return `${rounded} ${units[unitIndex]}`;
    }

    // (1) Website loading — Navigation Timing. loadEventEnd (and its domComplete
    // fallback) both read 0/undefined until the browser's own 'load' event
    // has actually finished dispatching, so this can legitimately be
    // "not ready yet" for a little while after DOMContentLoaded — handled
    // as an honest Unavailable row rather than a fabricated/negative
    // duration (see refreshWebsitePerformance's own initial-run comment
    // below for how the FIRST run avoids this case entirely).
    function getAdminPerfPageLoadMs() {
        const [nav] = performance.getEntriesByType('navigation');
        if (!nav) return null;
        const raw = nav.loadEventEnd > 0 ? (nav.loadEventEnd - nav.startTime) : (nav.domComplete > 0 ? (nav.domComplete - nav.startTime) : null);
        return (typeof raw === 'number' && raw > 0) ? raw : null;
    }

    function checkAdminPerfPageLoad() {
        const LABEL = 'Website loading';
        const ms = getAdminPerfPageLoadMs();
        if (ms === null) return adminPerfUnavailableRow(LABEL, 'The page is still finishing loading — try Run check again in a moment.');
        const status = ms < 2500 ? 'good' : ms < 5000 ? 'warn' : 'problem';
        const pillText = status === 'good' ? 'Good' : status === 'warn' ? 'Slow' : 'Problem';
        return { label: LABEL, value: `${(ms / 1000).toFixed(1)} s`, status, pillText };
    }

    // (2) Photo and media space — recursive, best-effort walk of the `media`
    // bucket. list() entries with a `metadata` object are files (summed by
    // metadata.size); entries with no `metadata` are "folders" and are
    // descended into, up to ADMIN_PERF_MAX_STORAGE_FOLDERS list() calls
    // total. Reuses isMediaBucketMissingError() (defined above, shared with
    // uploadToMedia()) so a not-yet-provisioned bucket reads as "Not set up"
    // rather than an error.
    async function checkAdminPerfMediaStorage() {
        const LABEL = 'Photo and media space';
        if (!window.sb) return adminPerfUnavailableRow(LABEL, 'Not connected to the server yet.');

        let totalBytes = 0;
        let foldersVisited = 0;
        let bucketMissing = false;
        let hardError = null;

        async function walk(prefix) {
            if (hardError || bucketMissing || foldersVisited >= ADMIN_PERF_MAX_STORAGE_FOLDERS) return;
            foldersVisited += 1;
            const { data, error } = await window.sb.storage.from('media').list(prefix, { limit: 1000 });
            if (error) {
                if (isMediaBucketMissingError(error)) bucketMissing = true;
                else hardError = error;
                return;
            }
            for (const entry of (data || [])) {
                if (hardError || bucketMissing) return;
                if (entry.metadata && typeof entry.metadata.size === 'number') {
                    totalBytes += entry.metadata.size;
                } else if (!entry.metadata) {
                    await walk(prefix ? `${prefix}/${entry.name}` : entry.name);
                }
            }
        }

        try {
            await walk('');
        } catch (err) {
            hardError = err;
        }

        if (bucketMissing) {
            return { label: LABEL, value: 'Not set up — run 015_media_bucket.sql', status: 'neutral', pillText: 'Not set up' };
        }
        if (hardError) {
            return adminPerfUnavailableRow(LABEL, hardError.message || 'Could not read Storage.');
        }

        const usedFraction = totalBytes / MEDIA_STORAGE_LIMIT_BYTES;
        const status = usedFraction >= 0.95 ? 'problem' : usedFraction >= 0.80 ? 'warn' : 'good';
        const pillText = status === 'good' ? 'Good' : status === 'warn' ? 'Warn' : 'Problem';
        return {
            label: LABEL,
            value: `${formatAdminPerfBytes(totalBytes)} of ${formatAdminPerfBytes(MEDIA_STORAGE_LIMIT_BYTES)}`,
            status,
            pillText,
            barPct: Math.max(0, Math.min(100, usedFraction * 100)),
        };
    }

    // (3) Saved bookings and customers — head counts. Purely informational (always
    // "Good" once at least one count loads) — this row exists to show real
    // scale, not to flag a problem, so it deliberately never contributes a
    // warn/problem status (see worstAdminPerfStatus's own comment).
    async function checkAdminPerfDatabaseRecords() {
        const LABEL = 'Saved bookings and customers';
        if (!window.sb) return adminPerfUnavailableRow(LABEL, 'Not connected to the server yet.');
        try {
            const [bookingsRes, customersRes] = await Promise.all([
                window.sb.from('booking').select('*', { count: 'exact', head: true }),
                window.sb.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
            ]);
            const bookings = bookingsRes.error ? null : (bookingsRes.count || 0);
            const customers = customersRes.error ? null : (customersRes.count || 0);

            if (bookings === null && customers === null) {
                return adminPerfUnavailableRow(LABEL, 'Could not reach the database.');
            }

            const value = [
                `${bookings === null ? '—' : bookings} booking${bookings === 1 ? '' : 's'}`,
                `${customers === null ? '—' : customers} customer${customers === 1 ? '' : 's'}`,
            ].join(' · ');
            return { label: LABEL, value, status: 'good', pillText: 'Good' };
        } catch (err) {
            return adminPerfUnavailableRow(LABEL, (err && err.message) || 'Could not reach the database.');
        }
    }

    // (4) Website issues this visit — show the count without technical detail.
    // inigosyncSessionErrorCount is a module-level
    // counter incremented by the window 'error'/'unhandledrejection'
    // listeners registered at the very top of this file (before this
    // DOMContentLoaded block even runs), so it also counts anything thrown
    // during this file's own startup.
    function checkAdminPerfSessionErrors() {
        const count = inigosyncSessionErrorCount;
        const status = count === 0 ? 'good' : count < 5 ? 'warn' : 'problem';
        const pillText = status === 'good' ? 'Good' : status === 'warn' ? 'Warn' : 'Problem';
        return { label: 'Website issues this visit', value: String(count), status, pillText };
    }

    // (5) Internet connection — keep the owner-facing state simple.
    function checkAdminPerfConnection() {
        const online = navigator.onLine;
        const value = online ? 'Connected' : 'Not connected';
        return { label: 'Internet connection', value, status: online ? 'good' : 'problem', pillText: online ? 'Good' : 'Check connection' };
    }

    const ADMIN_PERF_OVERALL_LABELS = { good: 'Good', warn: 'Slow', problem: 'Problem' };

    // Worst of the five — but a 'neutral' row (media storage's "Not set up",
    // or any check's own "Unavailable") never counts toward it: a bucket
    // the owner hasn't provisioned yet, or a check that simply couldn't run
    // this time, isn't a website PERFORMANCE problem, so neither should
    // drag the overall badge down. If every row is neutral (practically
    // unreachable — Connection/Errors this session/Page load are almost
    // always computable), default to Good rather than alarming the owner
    // over nothing measured.
    function worstAdminPerfStatus(rows) {
        const RANK = { good: 0, warn: 1, problem: 2 };
        let worst = null;
        rows.forEach((row) => {
            if (!row || row.status === 'neutral' || !(row.status in RANK)) return;
            const rank = RANK[row.status];
            if (worst === null || rank > worst) worst = rank;
        });
        if (worst === null) return 'good';
        return worst === 0 ? 'good' : worst === 1 ? 'warn' : 'problem';
    }

    function adminPerfPillHtml(row, extraClass) {
        const status = row.status || 'neutral';
        const text = row.pillText || 'Info';
        const cls = `admin-perf-pill${extraClass ? ` ${extraClass}` : ''} admin-perf-pill-${window.escapeHtml(status)}`;
        return `<span class="${cls}">${window.escapeHtml(text)}</span>`;
    }

    // Legend swatch — same "which of the 4 statuses" branch the chart slice
    // colors below use, just as a tiny CSS-colored dot (.admin-perf-dot-*,
    // Style/owner_dashboard.css) instead of a canvas fill.
    function adminPerfDotHtml(status) {
        return `<span class="admin-perf-dot admin-perf-dot-${window.escapeHtml(status || 'neutral')}" aria-hidden="true"></span>`;
    }

    function adminPerfRowHtml(row) {
        // Media storage's usage bar renders as a second, full-width line
        // under the label/value/pill row (see .admin-perf-bar's own comment
        // in Style/owner_dashboard.css) rather than squeezed into that row.
        const barHtml = (typeof row.barPct === 'number')
            ? `<div class="admin-progress-track admin-perf-bar"><div class="admin-progress-fill" style="width: ${row.barPct}%;"></div></div>`
            : '';
        return `
            <div class="admin-perf-item">
                <div class="admin-perf-item-row">
                    <span class="admin-perf-item-label">${adminPerfDotHtml(row.status)}${window.escapeHtml(row.label)}</span>
                    <span class="admin-perf-item-value">${window.escapeHtml(row.value)}</span>
                    ${adminPerfPillHtml(row)}
                </div>
                ${barHtml}
            </div>
        `;
    }

    // ------------------------------------------------------------------
    // Website performance — doughnut chart ("like a pie graph"). Chart.js
    // is loaded from the CDN in Pages/owner_dashboard.html's <head>, ahead
    // of this file, so window.Chart is already defined here unless that
    // CDN request itself failed (checked once below, mirroring how
    // event/chart.js guards the SAME global for the booking trend chart).
    // One instance, created once and updated in place on every refresh —
    // never destroyed/recreated — exactly like event/chart.js's
    // bookingChart/updateCharts() do for that other chart on this page.
    // ------------------------------------------------------------------
    let adminPerfChart = null;
    // The tooltip label callback below is defined once, at chart creation,
    // but needs each refresh's live values/pillText — it reads them off
    // this module-level array (kept in sync by renderAdminPerfChart())
    // rather than closing over a single refresh's now-stale `rows` param.
    let adminPerfLatestRows = [];

    function getAdminPerfThemeColors() {
        const style = getComputedStyle(document.documentElement);
        return {
            ink: style.getPropertyValue('--color-ink').trim(),
            line: style.getPropertyValue('--color-line').trim(),
            bgCard: style.getPropertyValue('--color-bg-card').trim(),
        };
    }

    // The 4 slice/dot colors — good/problem/neutral reuse the same design
    // tokens as .admin-perf-pill-good/-problem/-neutral; warn uses the
    // dedicated --color-perf-warn amber (see that variable's own comment in
    // Style/owner_dashboard.css for why it isn't --color-primary here).
    function adminPerfSliceColor(status) {
        const style = getComputedStyle(document.documentElement);
        if (status === 'good') return style.getPropertyValue('--color-court-green').trim();
        if (status === 'warn') return style.getPropertyValue('--color-perf-warn').trim();
        if (status === 'problem') return style.getPropertyValue('--color-alert').trim();
        return style.getPropertyValue('--color-ink-faint').trim(); // neutral / unavailable / anything else
    }

    // Re-applies current theme colors to the existing chart instance —
    // called after every refresh AND on 'themechange', same split
    // event/chart.js's updateCharts() does for the booking trend chart.
    function paintAdminPerfChart() {
        if (!adminPerfChart) return;
        const theme = getAdminPerfThemeColors();
        adminPerfChart.data.datasets[0].backgroundColor = adminPerfLatestRows.map((row) => adminPerfSliceColor(row.status));
        adminPerfChart.data.datasets[0].borderColor = theme.bgCard;
        adminPerfChart.options.plugins.tooltip.backgroundColor = theme.bgCard;
        adminPerfChart.options.plugins.tooltip.borderColor = theme.line;
        adminPerfChart.options.plugins.tooltip.titleColor = theme.ink;
        adminPerfChart.options.plugins.tooltip.bodyColor = theme.ink;
        adminPerfChart.update();
    }

    // Builds the doughnut the first time, then just updates its data/colors
    // in place on every subsequent call (see this section's own comment
    // above for why). window.Chart missing (CDN failed) or the canvas not
    // being in the DOM both no-op here — Style/owner_dashboard.css's
    // .admin-perf-no-chart (set once, below) hides the now-empty chart
    // column so the legend list alone fills the card.
    function renderAdminPerfChart(rows) {
        adminPerfLatestRows = rows;
        const canvas = document.querySelector('[data-admin-perf-chart]');
        if (!canvas || typeof window.Chart === 'undefined') return;

        if (!adminPerfChart) {
            const theme = getAdminPerfThemeColors();
            adminPerfChart = new Chart(canvas, {
                type: 'doughnut',
                data: {
                    labels: rows.map((row) => row.label),
                    datasets: [{
                        // Six EQUAL slices — status (color), not magnitude,
                        // is what this ring encodes; a real check value
                        // (e.g. milliseconds vs. a booking count) has no
                        // shared unit to size slices by anyway.
                        data: rows.map(() => 1),
                        backgroundColor: rows.map((row) => adminPerfSliceColor(row.status)),
                        borderColor: theme.bgCard,
                        borderWidth: 2,
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '68%',
                    animation: { duration: 400 },
                    plugins: {
                        legend: { display: false }, // the legend list beside it IS the legend
                        tooltip: {
                            backgroundColor: theme.bgCard,
                            borderColor: theme.line,
                            borderWidth: 1,
                            titleColor: theme.ink,
                            bodyColor: theme.ink,
                            padding: 10,
                            displayColors: false,
                            callbacks: {
                                title: () => '',
                                label: (ctx) => {
                                    const row = adminPerfLatestRows[ctx.dataIndex];
                                    if (!row) return '';
                                    return `${row.label}: ${row.value} · ${row.pillText || 'Info'}`;
                                },
                            },
                        },
                    },
                },
            });
            return;
        }

        adminPerfChart.data.labels = rows.map((row) => row.label);
        adminPerfChart.data.datasets[0].data = rows.map(() => 1);
        paintAdminPerfChart();
    }

    // Center-of-the-ring overlay — the overall word (never 'neutral', see
    // worstAdminPerfStatus()) plus the static "5 checks" already in the
    // markup. Pure CSS class swap, so it stays correct across theme changes
    // on its own (no JS re-render needed, unlike the canvas ring itself).
    function updateAdminPerfChartCenter(overall) {
        const statusEl = document.querySelector('[data-admin-perf-chart-status]');
        if (!statusEl) return;
        statusEl.textContent = ADMIN_PERF_OVERALL_LABELS[overall] || '—';
        statusEl.className = `admin-perf-chart-status admin-perf-chart-status-${overall}`;
    }

    let adminPerfIsRunning = false;

    async function refreshWebsitePerformance() {
        const listRoot = document.querySelector('[data-admin-perf-list]');
        if (!listRoot) return;
        if (adminPerfIsRunning) return; // ignore an overlapping Run check click / interval tick
        adminPerfIsRunning = true;

        const overallEl = document.querySelector('[data-admin-perf-overall]');
        const lastCheckedEl = document.querySelector('[data-admin-perf-last-checked]');
        const runBtn = document.querySelector('[data-admin-perf-run]');
        const runBtnOriginalLabel = runBtn ? runBtn.textContent : null;
        if (runBtn) {
            runBtn.disabled = true;
            runBtn.textContent = 'Checking…';
        }

        try {
            const rows = await Promise.all([
                checkAdminPerfPageLoad(),
                checkAdminPerfMediaStorage(),
                checkAdminPerfDatabaseRecords(),
                checkAdminPerfSessionErrors(),
                checkAdminPerfConnection(),
            ]);

            listRoot.innerHTML = rows.map(adminPerfRowHtml).join('');
            renderAdminPerfChart(rows);

            const overall = worstAdminPerfStatus(rows);
            if (overallEl) {
                overallEl.textContent = ADMIN_PERF_OVERALL_LABELS[overall];
                overallEl.className = `admin-perf-pill admin-perf-overall admin-perf-pill-${overall}`;
            }
            updateAdminPerfChartCenter(overall);
            if (lastCheckedEl) {
                const checkedAt = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                lastCheckedEl.textContent = `Last checked ${checkedAt}`;
            }
        } catch (err) {
            // Should be unreachable (every check* function catches its own
            // errors), but a card stuck on "Running checks…" forever would
            // be worse than an honest failure message.
            console.error('[admin] failed to run the website performance checks', err);
            listRoot.innerHTML = '<p style="color: var(--color-ink-faint);">Could not run the performance checks. Please try again.</p>';
        } finally {
            adminPerfIsRunning = false;
            if (runBtn) {
                runBtn.disabled = false;
                runBtn.textContent = runBtnOriginalLabel || 'Run check';
            }
        }
    }

    const adminPerfRunBtn = document.querySelector('[data-admin-perf-run]');
    if (adminPerfRunBtn) adminPerfRunBtn.addEventListener('click', refreshWebsitePerformance);

    // Chart.js availability is fixed for the life of the page (either the
    // <head> CDN <script> tag succeeded before this file ever ran, or it
    // didn't) — checked once, matching event/chart.js's own one-time
    // `typeof Chart === 'undefined'` guard for the booking trend chart.
    const adminPerfBodyEl = document.querySelector('[data-admin-perf-body]');
    if (adminPerfBodyEl && typeof window.Chart === 'undefined') {
        console.warn('[admin] Chart.js failed to load from the CDN — Website performance will show the legend list only.');
        adminPerfBodyEl.classList.add('admin-perf-no-chart');
    }

    // Re-color (not rebuild) the doughnut on theme changes — same approach
    // event/chart.js's updateCharts() takes for the booking trend chart.
    document.addEventListener('themechange', paintAdminPerfChart);

    document.addEventListener('inigosync:profile-ready', refreshWebsitePerformance);
    window.setInterval(refreshWebsitePerformance, ADMIN_PERF_REFRESH_MS);

    // First run deliberately keyed to the window 'load' event (deferred one
    // more tick via setTimeout) rather than called plainly here alongside
    // this file's other "on load" refreshers: Page load (check #2) reads
    // Navigation Timing fields that are only populated once 'load' finishes
    // DISPATCHING — reading them from directly inside a 'load' listener
    // itself can still observe 0 on some browsers, hence the setTimeout(…,
    // 0) to hop past that same event loop turn. Falls back to running
    // immediately if 'load' has, unusually, already fired by the time this
    // line runs (e.g. a very slow parse of everything before this script
    // tag) — DOMContentLoaded (which this whole block already runs inside
    // of) always fires before 'load', so that's the only case this guards.
    if (document.readyState === 'complete') {
        refreshWebsitePerformance();
    } else {
        window.addEventListener('load', () => window.setTimeout(refreshWebsitePerformance, 0), { once: true });
    }

    refreshOverviewStats();
    document.addEventListener('inigosync:profile-ready', refreshOverviewStats);

    // ------------------------------------------------------------------
    // Staff Management — Add New Staff modal (Revision A2, decision B3).
    // Same open/close idiom as the Court modal further down this file (S1's
    // mousedown+click backdrop-detection, Esc, focus-first-field,
    // reset-on-open) — ported rather than shared, matching how every other
    // modal-adjacent helper in this file is self-contained (see
    // isSchemaMismatchError's own comment above). The old inline
    // .admin-add-panel[data-admin-staff-form] card (shown/hidden via
    // .is-open) is gone; the "+ Add New Staff" trigger's hook was renamed
    // from data-admin-toggle-staff-form to data-admin-staff-add. Submit
    // logic (staffSubmitBtn below) is unchanged other than how it closes
    // the dialog on success.
    // ------------------------------------------------------------------
    const staffModal = document.querySelector('[data-admin-staff-modal]');
    const staffForm = document.querySelector('[data-admin-staff-form]');
    const staffAddBtns = document.querySelectorAll('[data-admin-staff-add]');

    function resetStaffForm() {
        if (!staffForm) return;
        const nameInput = staffForm.querySelector('[data-admin-staff-name]');
        const emailInput = staffForm.querySelector('[data-admin-staff-email]');
        if (nameInput) nameInput.value = '';
        if (emailInput) emailInput.value = '';
        const roleSelect = staffForm.querySelector('[data-admin-staff-role]');
        if (roleSelect) roleSelect.selectedIndex = 0;

        // Revision S3 (database/schema/018_staff_details.sql) — all five optional.
        const addressInput = staffForm.querySelector('[data-admin-staff-address]');
        const birthdateInput = staffForm.querySelector('[data-admin-staff-birthdate]');
        const genderSelect = staffForm.querySelector('[data-admin-staff-gender]');
        const emergencyNameInput = staffForm.querySelector('[data-admin-staff-emergency-name]');
        const emergencyNumberInput = staffForm.querySelector('[data-admin-staff-emergency-number]');
        if (addressInput) addressInput.value = '';
        if (birthdateInput) birthdateInput.value = '';
        if (genderSelect) genderSelect.selectedIndex = 0;
        if (emergencyNameInput) emergencyNameInput.value = '';
        if (emergencyNumberInput) emergencyNumberInput.value = '';
    }

    // Revision S3 — Birthdate can never be set in the future. Set once here
    // (rather than baked into the HTML's static max="…", which would
    // silently go stale) for both the Add New Staff modal's field and the
    // Edit/View staff modal's field further below.
    function todayDateInputValue() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const staffAddBirthdateInput = document.querySelector('[data-admin-staff-birthdate]');
    if (staffAddBirthdateInput) staffAddBirthdateInput.max = todayDateInputValue();

    const STAFF_MODAL_CLOSE_DELAY_MS = 250;
    let staffModalHideTimer = null;
    let staffModalIsOpen = false;
    let staffModalLastFocused = null;

    function openStaffModal() {
        if (!staffModal || !staffForm) return;
        staffModalLastFocused = document.activeElement;
        resetStaffForm();

        if (staffModalHideTimer) {
            window.clearTimeout(staffModalHideTimer);
            staffModalHideTimer = null;
        }
        staffModal.hidden = false;
        // Force a synchronous layout flush so the browser commits the
        // hidden->visible state before [data-open] flips opacity to 1 —
        // same trick the Court modal below uses.
        void staffModal.offsetWidth;
        staffModal.setAttribute('data-open', '');
        staffModalIsOpen = true;

        const firstField = staffForm.querySelector('input, select');
        if (firstField) firstField.focus();
    }

    function closeStaffModal() {
        if (!staffModalIsOpen || !staffModal) return;
        staffModalIsOpen = false;

        staffModal.removeAttribute('data-open');
        if (staffModalHideTimer) window.clearTimeout(staffModalHideTimer);
        staffModalHideTimer = window.setTimeout(() => {
            staffModal.hidden = true;
            staffModalHideTimer = null;
        }, STAFF_MODAL_CLOSE_DELAY_MS);

        if (staffModalLastFocused && typeof staffModalLastFocused.focus === 'function' && document.contains(staffModalLastFocused)) {
            staffModalLastFocused.focus();
        }
        staffModalLastFocused = null;
    }

    staffAddBtns.forEach((btn) => {
        btn.addEventListener('click', openStaffModal);
    });

    document.querySelectorAll('[data-admin-staff-modal-close]').forEach((btn) => {
        btn.addEventListener('click', closeStaffModal);
    });

    // S1 (Revision A1 fix, ported) — see the identical comment on the Court
    // modal's own backdrop listeners further down for why this needs both
    // mousedown and click on the overlay rather than a plain 'click'.
    let staffModalMouseDownOnBackdrop = false;
    if (staffModal) {
        staffModal.addEventListener('mousedown', (e) => {
            staffModalMouseDownOnBackdrop = e.target === staffModal;
        });
        staffModal.addEventListener('click', (e) => {
            if (e.target === staffModal && staffModalMouseDownOnBackdrop) closeStaffModal();
            staffModalMouseDownOnBackdrop = false;
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && staffModalIsOpen) closeStaffModal();
    });

    const staffTable = document.querySelector('[data-admin-staff-table]');
    const staffSubmitBtn = document.querySelector('[data-admin-staff-submit]');
    const staffSearch = document.querySelector('[data-admin-staff-search]');
    const staffStatusFilter = document.querySelector('[data-admin-staff-status-filter]');
    const staffPositionFilter = document.querySelector('[data-admin-staff-position-filter]');
    const staffPagination = document.querySelector('[data-admin-staff-pagination]');
    const staffPageInfo = document.querySelector('[data-admin-staff-page-info]');
    const staffPagePrev = document.querySelector('[data-admin-staff-page-prev]');
    const staffPageNext = document.querySelector('[data-admin-staff-page-next]');
    const STAFF_PAGE_SIZE = 10;
    let staffProfiles = [];
    let staffPage = 1;

    if (staffSubmitBtn) {
        staffSubmitBtn.addEventListener('click', async () => {
            const nameInput = document.querySelector('[data-admin-staff-name]');
            const emailInput = document.querySelector('[data-admin-staff-email]');
            const roleSelect = document.querySelector('[data-admin-staff-role]');
            const addressInput = document.querySelector('[data-admin-staff-address]');
            const birthdateInput = document.querySelector('[data-admin-staff-birthdate]');
            const genderSelect = document.querySelector('[data-admin-staff-gender]');
            const emergencyNameInput = document.querySelector('[data-admin-staff-emergency-name]');
            const emergencyNumberInput = document.querySelector('[data-admin-staff-emergency-number]');

            const name = nameInput ? nameInput.value.trim() : '';
            const email = emailInput ? emailInput.value.trim() : '';
            const position = roleSelect ? roleSelect.value : '';

            if (!name || !email) {
                if (!name && nameInput) nameInput.focus();
                else if (emailInput) emailInput.focus();
                return;
            }

            // Revision S3 — the emergency contact number is optional, but
            // validated the same way as everywhere else in this app
            // whenever a value IS entered; checked BEFORE the invite goes
            // out so a typo here never leaves the owner staring at an
            // already-sent invite with no way back to fix just this field.
            const emergencyNumberRaw = emergencyNumberInput ? emergencyNumberInput.value.trim() : '';
            let emergency_contact_number = '';
            if (emergencyNumberRaw) {
                if (!window.validatePhMobile) {
                    window.alert('Unable to validate the emergency contact number right now. Please try again shortly.');
                    return;
                }
                const check = window.validatePhMobile(emergencyNumberRaw);
                if (!check.valid) {
                    window.InigoToast?.show(`Emergency contact number: ${check.message}`, true);
                    emergencyNumberInput?.focus();
                    return;
                }
                emergency_contact_number = check.normalized;
            }

            if (!window.sb || !window.SUPABASE_URL) {
                window.alert('Unable to reach the server right now. Please try again shortly.');
                return;
            }

            staffSubmitBtn.disabled = true;
            staffSubmitBtn.textContent = 'Sending invite…';

            try {
                const { data: { session } } = await window.sb.auth.getSession();
                if (!session) throw new Error('Your session expired. Please log in again.');

                const res = await fetch(`${window.SUPABASE_URL}/functions/v1/invite-staff`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({ email, full_name: name, position, role: 'staff' })
                });

                const result = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(result.error || 'Could not send the invite.');
                }

                // Revision S3 (database/schema/018_staff_details.sql) —
                // invite-staff (the edge function above; source not in this
                // repo) only ever writes email/full_name/position/role. Its
                // response carries no id back, so these five extra fields
                // are saved in a SEPARATE update() matched by email right
                // after — never blocking, and never undoing, the invite
                // that already succeeded. Skipped entirely when the owner
                // left every one of them blank (nothing to write).
                const extraDetails = {
                    address: addressInput ? addressInput.value.trim() : '',
                    birthdate: (birthdateInput && birthdateInput.value) ? birthdateInput.value : null,
                    gender: genderSelect ? genderSelect.value : '',
                    emergency_contact_name: emergencyNameInput ? emergencyNameInput.value.trim() : '',
                    emergency_contact_number,
                };
                const hasExtraDetails = Object.values(extraDetails).some((v) => v);
                if (hasExtraDetails) {
                    const { data: updatedRows, error: detailsError } = await window.sb
                        .from('profiles')
                        .update(extraDetails)
                        .eq('email', email)
                        .select('id');

                    if (detailsError || !updatedRows || !updatedRows.length) {
                        window.InigoToast?.show("Invite sent — details couldn't be saved yet, edit the staff record to add them.", true);
                    }
                }

                refreshStaffList();
                resetStaffForm();
                closeStaffModal();
                recordOwnerActivity(`Staff account invited: ${name}`, 'staff');
            } catch (err) {
                window.alert(err.message || 'Could not send the invite. Please try again.');
            } finally {
                staffSubmitBtn.disabled = false;
                staffSubmitBtn.textContent = 'Send Invite';
            }
        });
    }

    // ------------------------------------------------------------------
    // Staff Management — Edit/View staff modal (Revision S3). Replaces the
    // old inline Edit, which toggled the Name/Position cells into <input>s
    // in place — there was no room in a table cell for five more fields
    // (database/schema/018_staff_details.sql). One dialog now serves BOTH
    // actions: data-admin-view-staff and data-admin-edit-staff (wired in
    // wireStaffRowActions() below) both call openStaffEditModal(profile,
    // mode) — 'view' disables every field, hides Save, and relabels Cancel
    // to Close, purely in JS, so there is exactly one form to keep in sync
    // rather than two near-identical dialogs. Same
    // .admin-modal-overlay/.admin-modal shell + open/close idiom (Esc/
    // backdrop mousedown+click/×, focus-first-field) as the Add New Staff
    // modal above.
    // ------------------------------------------------------------------
    const staffEditModal = document.querySelector('[data-admin-staff-edit-modal]');
    const staffEditDialog = document.querySelector('[data-admin-staff-edit-dialog]');
    const staffEditBirthdateInput = document.querySelector('[data-admin-staff-edit-birthdate]');
    if (staffEditBirthdateInput) staffEditBirthdateInput.max = todayDateInputValue();

    const STAFF_EDIT_MODAL_CLOSE_DELAY_MS = 250;
    let staffEditModalHideTimer = null;
    let staffEditModalIsOpen = false;
    let staffEditModalLastFocused = null;
    let staffEditModalProfileId = null;

    function fillStaffEditForm(profile) {
        if (!staffEditDialog) return;
        const set = (sel, val) => {
            const el = staffEditDialog.querySelector(sel);
            if (el) el.value = val;
        };
        set('[data-admin-staff-edit-name]', profile.full_name || '');
        set('[data-admin-staff-edit-position]', profile.position || '');
        set('[data-admin-staff-edit-mobile]', profile.contact_num || '');
        set('[data-admin-staff-edit-address]', profile.address || '');
        set('[data-admin-staff-edit-birthdate]', profile.birthdate || '');
        set('[data-admin-staff-edit-gender]', profile.gender || '');
        set('[data-admin-staff-edit-emergency-name]', profile.emergency_contact_name || '');
        set('[data-admin-staff-edit-emergency-number]', profile.emergency_contact_number || '');

        const metaEl = staffEditDialog.querySelector('[data-admin-staff-edit-meta]');
        if (metaEl) metaEl.textContent = formatAdminStaffEditMeta(profile);
    }

    function setStaffEditFieldsDisabled(disabled) {
        if (!staffEditDialog) return;
        staffEditDialog.querySelectorAll('input, select, textarea').forEach((el) => { el.disabled = disabled; });
    }

    function openStaffEditModal(profile, mode) {
        if (!staffEditModal || !staffEditDialog) return;
        staffEditModalLastFocused = document.activeElement;
        staffEditModalProfileId = profile.id;
        fillStaffEditForm(profile);
        setStaffEditFieldsDisabled(mode === 'view');

        const titleEl = staffEditDialog.querySelector('[data-admin-staff-edit-modal-title]');
        if (titleEl) titleEl.textContent = mode === 'view' ? 'Staff Details' : 'Edit Staff';
        const saveBtn = staffEditDialog.querySelector('[data-admin-staff-edit-submit]');
        if (saveBtn) saveBtn.hidden = mode === 'view';
        const cancelBtn = staffEditDialog.querySelector('.admin-btn-ghost[data-admin-staff-edit-modal-close]');
        if (cancelBtn) cancelBtn.textContent = mode === 'view' ? 'Close' : 'Cancel';

        if (staffEditModalHideTimer) {
            window.clearTimeout(staffEditModalHideTimer);
            staffEditModalHideTimer = null;
        }
        staffEditModal.hidden = false;
        // Force a synchronous layout flush so the browser commits the
        // hidden->visible state before [data-open] flips opacity to 1 —
        // same trick the Add New Staff modal above uses.
        void staffEditModal.offsetWidth;
        staffEditModal.setAttribute('data-open', '');
        staffEditModalIsOpen = true;

        const firstField = mode === 'view' ? cancelBtn : staffEditDialog.querySelector('input, select, textarea');
        if (firstField) firstField.focus();
    }

    function closeStaffEditModal() {
        if (!staffEditModalIsOpen || !staffEditModal) return;
        staffEditModalIsOpen = false;

        staffEditModal.removeAttribute('data-open');
        if (staffEditModalHideTimer) window.clearTimeout(staffEditModalHideTimer);
        staffEditModalHideTimer = window.setTimeout(() => {
            staffEditModal.hidden = true;
            staffEditModalHideTimer = null;
        }, STAFF_EDIT_MODAL_CLOSE_DELAY_MS);

        if (staffEditModalLastFocused && typeof staffEditModalLastFocused.focus === 'function' && document.contains(staffEditModalLastFocused)) {
            staffEditModalLastFocused.focus();
        }
        staffEditModalLastFocused = null;
        staffEditModalProfileId = null;
    }

    document.querySelectorAll('[data-admin-staff-edit-modal-close]').forEach((btn) => {
        btn.addEventListener('click', closeStaffEditModal);
    });

    // S1 (Revision A1 fix, ported) — see the identical comment on the Add
    // New Staff modal's own backdrop listeners above for why this needs
    // both mousedown and click on the overlay rather than a plain 'click'.
    let staffEditModalMouseDownOnBackdrop = false;
    if (staffEditModal) {
        staffEditModal.addEventListener('mousedown', (e) => {
            staffEditModalMouseDownOnBackdrop = e.target === staffEditModal;
        });
        staffEditModal.addEventListener('click', (e) => {
            if (e.target === staffEditModal && staffEditModalMouseDownOnBackdrop) closeStaffEditModal();
            staffEditModalMouseDownOnBackdrop = false;
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && staffEditModalIsOpen) closeStaffEditModal();
    });

    const staffEditSubmitBtn = document.querySelector('[data-admin-staff-edit-submit]');
    if (staffEditSubmitBtn) {
        staffEditSubmitBtn.addEventListener('click', async () => {
            if (!window.sb || !staffEditModalProfileId || !staffEditDialog) return;
            const get = (sel) => staffEditDialog.querySelector(sel)?.value.trim() || '';

            const full_name = get('[data-admin-staff-edit-name]');
            if (!full_name) {
                window.InigoToast?.show("Enter the staff member's full name.", true);
                return;
            }
            const position = get('[data-admin-staff-edit-position]');

            const mobileRaw = get('[data-admin-staff-edit-mobile]');
            let contact_num = '';
            if (mobileRaw) {
                const check = window.validatePhMobile ? window.validatePhMobile(mobileRaw) : { valid: false, message: 'Mobile validation is unavailable right now.' };
                if (!check.valid) {
                    window.InigoToast?.show(check.message, true);
                    return;
                }
                contact_num = check.normalized;
            }

            const emergencyNumberRaw = get('[data-admin-staff-edit-emergency-number]');
            let emergency_contact_number = '';
            if (emergencyNumberRaw) {
                const check = window.validatePhMobile ? window.validatePhMobile(emergencyNumberRaw) : { valid: false, message: 'Mobile validation is unavailable right now.' };
                if (!check.valid) {
                    window.InigoToast?.show(`Emergency contact number: ${check.message}`, true);
                    return;
                }
                emergency_contact_number = check.normalized;
            }

            const fullPatch = {
                full_name,
                position,
                contact_num,
                address: get('[data-admin-staff-edit-address]'),
                birthdate: staffEditDialog.querySelector('[data-admin-staff-edit-birthdate]')?.value || null,
                gender: staffEditDialog.querySelector('[data-admin-staff-edit-gender]')?.value || '',
                emergency_contact_name: get('[data-admin-staff-edit-emergency-name]'),
                emergency_contact_number,
            };

            staffEditSubmitBtn.disabled = true;
            let { error } = await window.sb.from('profiles').update(fullPatch).eq('id', staffEditModalProfileId);

            // Revision S3 — database/schema/018_staff_details.sql not
            // applied yet: retry with just the three columns the old
            // inline Edit already relied on, same schema-mismatch-retry
            // idiom as every other write in this file
            // (isSchemaMismatchError's own comment above).
            let usedReducedPayload = false;
            if (error && isSchemaMismatchError(error)) {
                ({ error } = await window.sb.from('profiles').update({ full_name, position, contact_num }).eq('id', staffEditModalProfileId));
                usedReducedPayload = true;
            }

            staffEditSubmitBtn.disabled = false;

            if (error) {
                window.InigoToast?.show(error.message || 'Could not save changes.', true);
                return;
            }

            closeStaffEditModal();
            refreshStaffList();
            recordOwnerActivity(`Staff account updated: ${full_name}`, 'staff');
            window.InigoToast?.show(usedReducedPayload
                ? 'Staff updated — address/birthdate/gender/emergency contact need a database update (see database/schema/018_staff_details.sql).'
                : 'Staff updated.');
        });
    }

    // Revision S3 — age is always DERIVED from birthdate, never stored,
    // duplicated from includes/staff_dashboard.js's own computeStaffAge()
    // rather than shared — see isSchemaMismatchError's own comment above
    // for why every helper in this file is self-contained.
    function computeAdminStaffAge(birthdateStr) {
        if (!birthdateStr) return null;
        const dob = new Date(`${birthdateStr}T00:00:00`);
        if (Number.isNaN(dob.getTime())) return null;
        const now = new Date();
        let age = now.getFullYear() - dob.getFullYear();
        const monthDiff = now.getMonth() - dob.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age -= 1;
        return age;
    }

    // "24 yrs · Male" under a staff row's name (renderStaffRow() below) —
    // either half missing simply drops out, never a dangling separator.
    function formatAdminStaffRowMeta(profile) {
        const age = computeAdminStaffAge(profile.birthdate);
        const parts = [];
        if (age !== null) parts.push(`${age} yrs`);
        if (profile.gender) parts.push(profile.gender);
        return parts.join(' · ');
    }

    // The Edit/View staff modal's hint line (fillStaffEditForm() above) —
    // Age (when known) + Member since + Status, none of which have their
    // own input in that form.
    function formatAdminStaffEditMeta(profile) {
        const age = computeAdminStaffAge(profile.birthdate);
        const memberSince = profile.created_at
            ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
            : '—';
        const statusLabels = { active: 'Active', disabled: 'Deactivated', pending: 'Invited' };
        const statusLabel = statusLabels[profile.status] || 'Active';
        const parts = [];
        if (age !== null) parts.push(`${age} yrs old`);
        parts.push(`Member since ${memberSince}`);
        parts.push(statusLabel);
        return parts.join(' · ');
    }

    // Maps profiles.status to the admin-status badge classes already styled
    // in Style/owner_dashboard.css (active/inactive/pending).
    function staffStatusBadge(status) {
        const map = {
            active: ['active', 'Active'],
            disabled: ['inactive', 'Deactivated'],
            pending: ['pending', 'Invited'],
        };
        const [cls, label] = map[status] || ['active', 'Active'];
        return `<span class="admin-status ${cls}">${label}</span>`;
    }

    function renderStaffRow(profile) {
        const row = document.createElement('tr');
        row.dataset.id = profile.id;
        // Revision S3 — the whole profile (address/birthdate/gender/
        // emergency contact included, whenever database/schema/
        // 018_staff_details.sql has been applied) rides along on the row
        // element itself so View/Edit (wireStaffRowActions() below) can
        // open the modal with every field already known, with no second
        // fetch — refreshStaffList() already has this same object in hand
        // from its own select('*').
        row.__staffProfile = profile;
        // full_name/email/position are set by whoever filled in the staff
        // invite/edit form (and, before Phase 2, an admin — but this same
        // rendering path is what a promoted/self-edited account would also
        // flow through), so they're escaped before touching innerHTML — a
        // name like `<img src=x onerror=alert(1)>` must render as literal
        // text in this admin session, not run. staffStatusBadge() only
        // returns markup built from a fixed internal map, not profile data,
        // so it's safe as-is.
        //
        // Revision A1, decision A4 — a disabled account additionally gets
        // an Activate button (mirrors the court cards' Activate/Deactivate
        // pair); an active/invited account keeps just Deactivate, unchanged.
        //
        // Revision S3 — data-admin-staff-name-cell moved onto an inner
        // <span> (was the whole <td>) so a second <span class="admin-staff-meta">
        // ("24 yrs · Male", Style/owner_dashboard.css) can sit under the name
        // without corrupting the name-only .textContent every confirm()
        // message below (Reset Password/Deactivate/Activate) reads from
        // that same hook.
        const metaLine = formatAdminStaffRowMeta(profile);
        row.innerHTML = `
            <td class="admin-cell-main">
                <span data-admin-staff-name-cell>${window.escapeHtml(profile.full_name) || '—'}</span>
                ${metaLine ? `<span class="admin-staff-meta">${window.escapeHtml(metaLine)}</span>` : ''}
            </td>
            <td data-admin-staff-email-cell>${window.escapeHtml(profile.email) || '—'}</td>
            <td data-admin-staff-position-cell>${window.escapeHtml(profile.position) || '—'}</td>
            <td data-admin-staff-status-cell>${staffStatusBadge(profile.status)}</td>
            <td>
                <div class="admin-table-actions">
                    <select class="admin-select admin-staff-action-select" data-admin-staff-action-select aria-label="Actions for ${window.escapeHtml(profile.full_name || 'staff member')}">
                        <option value="">Actions…</option><option value="view">View</option><option value="edit">Edit</option>
                        <option value="reset">Send password reset</option><option value="toggle">${profile.status === 'disabled' ? 'Activate' : 'Deactivate'}</option>
                    </select>
                    <button type="button" hidden data-admin-view-staff>View</button>
                    <button type="button" hidden data-admin-reset-password>Reset Password</button>
                    <button type="button" hidden data-admin-edit-staff>Edit</button>
                    ${profile.status === 'disabled'
                        ? '<button type="button" hidden data-admin-activate-staff>Activate</button>'
                        : '<button type="button" hidden data-admin-delete-staff>Deactivate</button>'}
                </div>
            </td>
        `;
        return row;
    }

    // Revision S3 — a stand-in profile object for View/Edit when a row has
    // no row.__staffProfile of its own (the static demo/fallback rows in
    // Pages/owner_dashboard.html, which predate that property — same S6
    // gap the old inline Edit already guarded against). Reads by CELL
    // POSITION (0 Name / 1 Email / 2 Position / 3 Status), not the
    // data-admin-staff-*-cell hooks, since the static rows never had those
    // either; address/birthdate/gender/emergency contact are left blank
    // rather than invented.
    function fallbackProfileFromRow(row) {
        const cells = row.cells || [];
        const nameCell = cells[0] || null;
        const nameText = nameCell
            ? (nameCell.querySelector('[data-admin-staff-name-cell]')?.textContent || nameCell.textContent || '')
            : '';
        return {
            id: row.dataset.id,
            full_name: nameText.trim(),
            email: (cells[1]?.textContent || '').trim(),
            position: (cells[2]?.textContent || '').trim(),
            status: row.querySelector('.admin-status.inactive') ? 'disabled' : 'active',
        };
    }

    // Revision A3, decision C2 — staff ONLY (.eq, not the old .in('role',
    // ['staff', 'admin'])): the owner/admin account managing this table
    // shouldn't also appear as a row inside it. Pages/owner_dashboard.html's
    // own static fallback rows dropped their "Rosalinda Driz" (owner) row to
    // match, so no owner row appears even before this fetch resolves.
    function renderStaffDirectory() {
        if (!staffTable) return;
        const tbody = staffTable.querySelector('tbody');
        const query = staffSearch?.value.trim().toLocaleLowerCase() || '';
        const selectedStatus = staffStatusFilter?.value || 'all';
        const selectedPosition = staffPositionFilter?.value || 'all';
        const filtered = staffProfiles.filter((profile) => {
            const searchable = [profile.full_name, profile.email, profile.position]
                .filter(Boolean).join(' ').toLocaleLowerCase();
            const normalizedStatus = ['active', 'pending', 'disabled'].includes(profile.status)
                ? profile.status
                : 'active';
            return (!query || searchable.includes(query))
                && (selectedStatus === 'all' || normalizedStatus === selectedStatus)
                && (selectedPosition === 'all' || (profile.position || '') === selectedPosition);
        });
        const pageCount = Math.max(1, Math.ceil(filtered.length / STAFF_PAGE_SIZE));
        staffPage = Math.min(Math.max(1, staffPage), pageCount);
        const start = (staffPage - 1) * STAFF_PAGE_SIZE;
        const visibleProfiles = filtered.slice(start, start + STAFF_PAGE_SIZE);

        tbody.innerHTML = '';
        visibleProfiles.forEach((profile) => {
            const row = renderStaffRow(profile);
            tbody.appendChild(row);
            wireStaffRowActions(row);
        });
        if (!staffProfiles.length) {
            tbody.innerHTML = '<tr><td colspan="5">No staff accounts yet.</td></tr>';
        } else if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="5">No staff accounts match these filters.</td></tr>';
        }

        if (staffPagination) {
            staffPagination.hidden = filtered.length <= STAFF_PAGE_SIZE;
            if (staffPageInfo) staffPageInfo.textContent = `Page ${staffPage} of ${pageCount} · ${filtered.length} staff`;
            if (staffPagePrev) staffPagePrev.disabled = staffPage <= 1;
            if (staffPageNext) staffPageNext.disabled = staffPage >= pageCount;
        }
    }

    function refreshStaffPositionOptions() {
        if (!staffPositionFilter) return;
        const previousValue = staffPositionFilter.value || 'all';
        const positions = [...new Set(staffProfiles.map((profile) => (profile.position || '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b));
        staffPositionFilter.innerHTML = '<option value="all">All positions</option>'
            + positions.map((position) => `<option value="${window.escapeHtml(position)}">${window.escapeHtml(position)}</option>`).join('');
        staffPositionFilter.value = positions.includes(previousValue) ? previousValue : 'all';
    }

    async function refreshStaffList() {
        if (!staffTable || !window.sb) return;
        const { data, error } = await window.sb
            .from('profiles')
            .select('*')
            .eq('role', 'staff')
            .order('created_at');

        if (error) {
            console.error('[admin] failed to load staff', error);
            staffProfiles = [];
            if (staffPagination) staffPagination.hidden = true;
            staffTable.querySelector('tbody').innerHTML = '<tr><td colspan="5">Could not load staff accounts. Please refresh the page.</td></tr>';
            return;
        }
        staffProfiles = data || [];
        refreshStaffPositionOptions();
        renderStaffDirectory();
    }

    function wireStaffRowActions(scope) {
        scope.querySelectorAll('[data-admin-staff-action-select]').forEach((select) => {
            select.addEventListener('change', () => {
                const target = {
                    view: '[data-admin-view-staff]',
                    edit: '[data-admin-edit-staff]',
                    reset: '[data-admin-reset-password]',
                    toggle: scope.querySelector('[data-admin-activate-staff]') ? '[data-admin-activate-staff]' : '[data-admin-delete-staff]',
                }[select.value];
                select.value = '';
                if (target) scope.querySelector(target)?.click();
            });
        });
        // Never set a shared default password. The staff member receives a
        // short-lived recovery link and chooses their own replacement.
        scope.querySelectorAll('[data-admin-reset-password]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const row = btn.closest('tr');
                if (!row || !window.sb) return;
                const name = row.querySelector('[data-admin-staff-name-cell]')?.textContent || 'this account';
                const email = row.__staffProfile?.email || row.cells[1]?.textContent?.trim();
                if (!email) {
                    window.InigoToast?.show('This staff account has no email address.', true);
                    return;
                }

                if (!window.confirm(`Email a password recovery link to ${name} at ${email}?`)) return;

                btn.disabled = true;
                const { error } = await window.sb.auth.resetPasswordForEmail(email, {
                    redirectTo: new URL('Index.html', window.location.href).href,
                });
                btn.disabled = false;

                if (error) {
                    window.InigoToast?.show(error.message || 'Could not send the recovery email.', true);
                    return;
                }

                window.InigoToast?.show(`Recovery email requested for ${name}. Ask them to check their inbox.`);
                recordOwnerActivity('Staff password recovery requested: ' + name, 'staff');
            });
        });

        // Revision S3 — View/Edit both open the same modal
        // (openStaffEditModal() above), read-only or editable. row.__staffProfile
        // (set by renderStaffRow() above) is the real profile object,
        // address/birthdate/gender/emergency contact included; the static
        // demo/fallback rows in Pages/owner_dashboard.html predate that
        // property (same S6 gap the old inline Edit already had to guard
        // against), so fallbackProfileFromRow() below rebuilds a minimal
        // stand-in from whatever the row's cells actually show.
        scope.querySelectorAll('[data-admin-view-staff]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const row = btn.closest('tr');
                if (!row) return;
                openStaffEditModal(row.__staffProfile || fallbackProfileFromRow(row), 'view');
            });
        });

        scope.querySelectorAll('[data-admin-edit-staff]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const row = btn.closest('tr');
                if (!row) return;
                openStaffEditModal(row.__staffProfile || fallbackProfileFromRow(row), 'edit');
            });
        });

        // Soft-delete: a real auth.users delete needs service-role/an edge
        // function, unavailable client-side, so this deactivates the profile
        // instead (authGuard.js already refuses disabled accounts at login).
        scope.querySelectorAll('[data-admin-delete-staff]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const row = btn.closest('tr');
                if (!row) return;
                const name = row.querySelector('[data-admin-staff-name-cell]')?.textContent;
                if (!window.confirm(`Deactivate ${name}'s account? They will no longer be able to log in.`)) return;

                btn.disabled = true;
                const { error } = await window.sb.from('profiles').update({ status: 'disabled' }).eq('id', row.dataset.id);
                btn.disabled = false;

                if (error) {
                    window.InigoToast?.show(error.message || 'Could not deactivate this account.', true);
                    return;
                }
                refreshStaffList();
                recordOwnerActivity(`Staff account deactivated: ${name}`, 'staff');
            });
        });

        // Revision A1, decision A4 — Activate restores a deactivated staff
        // account, mirroring the court cards' Activate/Deactivate pair.
        scope.querySelectorAll('[data-admin-activate-staff]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const row = btn.closest('tr');
                if (!row) return;
                const name = row.querySelector('[data-admin-staff-name-cell]')?.textContent || 'this account';
                if (!window.confirm(`Activate ${name}'s account? They will be able to log in again.`)) return;

                btn.disabled = true;
                const { error } = await window.sb.from('profiles').update({ status: 'active' }).eq('id', row.dataset.id);
                btn.disabled = false;

                if (error) {
                    window.InigoToast?.show(error.message || 'Could not activate this account.', true);
                    return;
                }
                window.InigoToast?.show(`${name} reactivated.`);
                refreshStaffList();
                recordOwnerActivity(`Staff account activated: ${name}`, 'staff');
            });
        });
    }

    // S6 (Revision A1 fix) — Pages/owner_dashboard.html ships a few static
    // demo <tr> rows in this table as its no-JS/pre-load baseline. Every
    // row refreshStaffList() itself renders gets wired via its own
    // wireStaffRowActions(row) call above, but those static rows never did
    // — their buttons were completely inert. Wiring the whole table once
    // here (before the first refreshStaffList() swaps them out) means the
    // fallback rows behave like rendered rows for however long they're on
    // screen (including if window.sb is unset and refreshStaffList()
    // never gets to replace them at all).
    if (staffTable) wireStaffRowActions(staffTable);
    refreshStaffList();
    document.addEventListener('inigosync:profile-ready', refreshStaffList);

    if (staffSearch && staffTable) {
        staffSearch.addEventListener('input', () => {
            staffPage = 1;
            renderStaffDirectory();
        });
    }
    [staffStatusFilter, staffPositionFilter].forEach((filter) => {
        filter?.addEventListener('change', () => {
            staffPage = 1;
            renderStaffDirectory();
        });
    });
    staffPagePrev?.addEventListener('click', () => {
        if (staffPage <= 1) return;
        staffPage -= 1;
        renderStaffDirectory();
    });
    staffPageNext?.addEventListener('click', () => {
        staffPage += 1;
        renderStaffDirectory();
    });

    // ------------------------------------------------------------------
    // Payment Configuration — REMOVED (Revision A2, implementation_plan.md,
    // decision B4). This used to be a card in Staff Management with two
    // .admin-switch toggles (GCash/Cash) and a downpayment-percentage
    // input, reading/writing the singleton `app_settings` row
    // (database/schema/007_app_settings.sql) through
    // window.InigoAppSettings (includes/appSettings.js). That table, its
    // documented defaults (GCash + Cash on, 50% downpayment), and every
    // other reader of it — the customer booking wizard, the staff walk-in
    // form — are completely untouched; only this admin editing UI is gone.
    // includes/appSettings.js is no longer even loaded on this page (see
    // Pages/owner_dashboard.html's script-tag comment) since nothing here
    // reads or writes it any more. Re-add a form here (or elsewhere) if the
    // owner wants to edit these again — the data layer already supports it.
    // ------------------------------------------------------------------

    // ------------------------------------------------------------------
    // Court Listings — real CRUD against the `court` table (Phase 2; see
    // docs/QA_AUDIT_REPORT.md's Court Listings STUB finding and P0#8,
    // "three contradictory court lists"). window.InigoCourtsData
    // (includes/courtsData.js) is the same fetch-with-static-fallback data
    // layer includes/Dashboard.js uses for the customer-facing Court
    // Information + Booking Management panels, so an admin's edit here is
    // visible everywhere else on next load instead of a fourth hand-copied
    // list drifting from the rest.
    //
    // Revision A1, decision A6 — Add/Edit now happen in a modal
    // ([data-admin-court-modal]) instead of an inline .admin-add-panel that
    // scrolled into view. courtForm below now resolves to the MODAL's
    // content element (it carries the same data-admin-court-form attribute
    // the old inline panel did), so every field selector and the
    // editingId-on-dataset trick are unchanged from before this revision.
    // ------------------------------------------------------------------
    const courtGrid = document.querySelector('[data-admin-court-grid]');
    const courtFormToggleBtns = document.querySelectorAll('[data-admin-toggle-court-form]');
    const courtForm = document.querySelector('[data-admin-court-form]');
    const courtSubmitBtn = document.querySelector('[data-admin-court-submit]');
    const courtModal = document.querySelector('[data-admin-court-modal]');
    const courtModalTitle = document.querySelector('[data-admin-court-modal-title]');

    // Last-fetched rows, kept so "Edit" can look up a court's full data
    // (rate, description, sport_id, ...) by id without a second round trip
    // — the rendered card markup alone doesn't carry all of it.
    let currentCourts = [];

    // ------------------------------------------------------------------
    // Court modal — Photos (Revision A2, decision B6). courtModalState is
    // the modal's own draft of what Save will write: a single Cover URL
    // (the same column the form always saved to, `image_url`) plus an
    // array of per-unit photos (`unit_images`, one entry per bookable unit
    // once Quantity > 1 — see database/schema/006_court_unit_images.sql).
    // Reset to blank on every resetCourtForm() (Add mode) and overwritten
    // from the real court on openCourtModal(court) (Edit mode).
    // ------------------------------------------------------------------
    let courtModalState = { coverUrl: null, unitImages: [], activeUploadSlot: null };

    // Same noun mapping as includes/courtsData.js's own (unexported)
    // unitNoun() — duplicated locally rather than importing it, matching
    // this file's existing convention of keeping every helper
    // self-contained (see isSchemaMismatchError's own comment above).
    // Used only to label the Photos section's live per-unit slots.
    const COURT_UNIT_NOUN = { court: 'Court', courts: 'Court', lane: 'Lane', lanes: 'Lane', table: 'Table', tables: 'Table' };
    function courtUnitNoun(unit) {
        const key = String(unit || '').trim().toLowerCase();
        if (COURT_UNIT_NOUN[key]) return COURT_UNIT_NOUN[key];
        const word = key.replace(/s$/, '');
        return word ? word.charAt(0).toUpperCase() + word.slice(1) : 'Unit';
    }

    // Re-derives the per-unit photo slots for the CURRENT Quantity/Unit
    // field values — called on modal open and again live whenever either
    // field changes. Sized to `quantity` exactly (growing pads new slots
    // with a derived label + no photo yet; shrinking drops the tail), and
    // keeps each already-set slot's photo/label by POSITION so adjusting
    // Quantity never orphans an upload already made in this session.
    // Returns [] outright for quantity <= 1 — a single-unit court has
    // nothing to pick between, so only the Cover slot applies (same rule
    // includes/courtsData.js's resolveCourtUnits() documents for the
    // customer-facing picker).
    function deriveCourtPhotoUnits(quantity, unitValue, existingUnitImages) {
        const count = Math.max(0, Math.floor(Number(quantity) || 0));
        if (count <= 1) return [];
        const noun = courtUnitNoun(unitValue);
        const source = Array.isArray(existingUnitImages) ? existingUnitImages : [];
        const units = [];
        for (let i = 0; i < count; i++) {
            const existing = source[i] || null;
            units.push({
                label: (existing && existing.label) ? existing.label : `${noun} ${i + 1}`,
                imageUrl: existing ? (existing.imageUrl || null) : null,
            });
        }
        return units;
    }

    // `unit_images` column shape is snake_case {label, image_url}
    // (database/schema/006_court_unit_images.sql); courtModalState.unitImages
    // stays in the camelCase {label, imageUrl} shape
    // includes/courtsData.js's normalizeUnitImages()/resolveCourtUnits()
    // already use, so this is the ONE place the two shapes are bridged, at
    // save time.
    function unitImagesToDbShape(unitImages) {
        return (unitImages || []).map((u) => ({ label: u.label || null, image_url: u.imageUrl || null }));
    }

    function applyCourtFilter() {
        const activeChip = document.querySelector('[data-admin-court-filter].is-active');
        const filter = activeChip ? activeChip.dataset.adminCourtFilter : 'all';
        const search = (document.querySelector('[data-admin-court-search]')?.value || '').trim().toLocaleLowerCase();
        document.querySelectorAll('[data-admin-court-status]').forEach((card) => {
            const matchesStatus = filter === 'all' || card.dataset.adminCourtStatus === filter;
            const matchesSearch = !search || card.textContent.toLocaleLowerCase().includes(search);
            const match = matchesStatus && matchesSearch;
            card.style.display = match ? '' : 'none';
        });
    }

    document.querySelector('[data-admin-court-search]')?.addEventListener('input', applyCourtFilter);

    document.querySelectorAll('[data-admin-court-filter]').forEach((chip) => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('[data-admin-court-filter]').forEach((c) => c.classList.remove('is-active'));
            chip.classList.add('is-active');
            applyCourtFilter();
        });
    });

    // Resets the modal's form back to "add a new court" — clears the
    // editingId marker Edit sets (see openCourtModal below), the heading,
    // the submit button label, and every field.
    function resetCourtForm() {
        if (!courtForm) return;
        delete courtForm.dataset.editingId;
        selectedCourtIdForUnits = null;
        if (unitCourtSelect) unitCourtSelect.value = '';
        if (unitLabelInput) unitLabelInput.value = '';
        if (courtModalTitle) courtModalTitle.textContent = 'Add Sport';
        if (courtSubmitBtn) courtSubmitBtn.textContent = 'Add Sport';
        const archiveSportBtn = courtForm.querySelector('[data-admin-court-archive]');
        if (archiveSportBtn) archiveSportBtn.hidden = true;

        courtForm.querySelectorAll('input[type="text"], input[type="number"], input[type="url"]').forEach((el) => { el.value = ''; });
        const quantityInput = courtForm.querySelector('[data-admin-court-quantity]');
        if (quantityInput) { quantityInput.value = '1'; quantityInput.readOnly = false; }
        ['[data-admin-court-unit]', '[data-admin-court-op-status]'].forEach((selector) => {
            const el = courtForm.querySelector(selector);
            if (el) el.selectedIndex = 0;
        });
        const unitManager = courtForm.querySelector('[data-admin-unit-manager]');
        if (unitManager) unitManager.hidden = true;
        const sportSelect = courtForm.querySelector('[data-admin-court-sport]');
        if (sportSelect && sportSelect.options.length) sportSelect.selectedIndex = 0;
        if (sportSelect?.closest('.admin-form-group')) sportSelect.closest('.admin-form-group').hidden = true;

        // Revision A2, decision B6 — a fresh Add starts with no cover and
        // no per-unit photos; openCourtModal() below overwrites this again
        // with the court's real values when editing.
        courtModalState = { coverUrl: null, unitImages: [], activeUploadSlot: null };
        renderCourtPhotoSlots();
    }

    // ------------------------------------------------------------------
    // Court modal — Photos rendering/wiring (Revision A2, decision B6).
    // ------------------------------------------------------------------
    function courtPhotoSlotThumbHtml(url, kind) {
        const safe = url && isSafeImageUrl(url) ? url : null;
        if (safe) return `<img src="${window.escapeHtml(safe)}" alt="" loading="lazy">`;
        if (kind === 'cover') {
            const editingCourt = currentCourts.find((court) => String(court.id) === String(courtForm?.dataset.editingId));
            const art = ['basketball', 'badminton', 'bowling', 'billiards', 'lawn-tennis', 'pickleball', 'table-tennis', 'volleyball'].indexOf(editingCourt?.sportSlug);
            if (art >= 0) return `<span class="admin-court-art admin-court-art-${art}" aria-label="Landing illustration; no cover photo uploaded"></span>`;
        }
        return '<span class="admin-photo-slot-empty">No photo yet</span>';
    }

    function courtPhotoSlotHtml(kind, index, label, url) {
        const hasPhoto = Boolean(url && isSafeImageUrl(url));
        return `
            <div class="admin-photo-slot" data-admin-photo-slot data-slot-kind="${kind}"${index === null ? '' : ` data-slot-index="${index}"`}>
                <div class="admin-photo-slot-thumb">${courtPhotoSlotThumbHtml(url, kind)}</div>
                <div class="admin-photo-slot-body">
                    <span class="admin-photo-slot-label">${window.escapeHtml(label)}${kind === 'cover' && !hasPhoto ? ' · Landing illustration only' : ''}</span>
                    <div class="admin-photo-slot-actions">
                        <button type="button" class="admin-btn-chip-secondary" data-admin-photo-upload>Upload</button>
                        ${hasPhoto ? '<button type="button" class="admin-btn-chip-danger" data-admin-photo-remove>Remove</button>' : ''}
                    </div>
                </div>
            </div>
        `;
    }

    function renderCourtPhotoSlots() {
        const grid = document.querySelector('[data-admin-court-photo-grid]');
        if (!grid) return;

        const slots = [courtPhotoSlotHtml('cover', null, 'Cover photo', courtModalState.coverUrl)];
        const visibleUnits = deriveCourtPhotoUnits(
            document.querySelector('[data-admin-court-quantity]')?.value,
            document.querySelector('[data-admin-court-unit]')?.value,
            courtModalState.unitImages
        );
        visibleUnits.forEach((unit, index) => {
            slots.push(courtPhotoSlotHtml('unit', index, unit.label, unit.imageUrl));
        });

        grid.innerHTML = slots.join('');
        wireCourtPhotoSlotActions(grid);
    }

    function wireCourtPhotoSlotActions(scope) {
        scope.querySelectorAll('[data-admin-photo-slot]').forEach((slotEl) => {
            const kind = slotEl.dataset.slotKind;
            const index = kind === 'unit' ? Number(slotEl.dataset.slotIndex) : null;

            const uploadBtn = slotEl.querySelector('[data-admin-photo-upload]');
            if (uploadBtn) {
                uploadBtn.addEventListener('click', () => {
                    courtModalState.activeUploadSlot = kind === 'cover' ? { kind: 'cover' } : { kind: 'unit', index };
                    if (courtPhotoFileInput) courtPhotoFileInput.click();
                });
            }

            const removeBtn = slotEl.querySelector('[data-admin-photo-remove]');
            if (removeBtn) {
                removeBtn.addEventListener('click', () => {
                    if (kind === 'cover') {
                        courtModalState.coverUrl = null;
                        const urlInput = document.querySelector('[data-admin-court-image-url]');
                        if (urlInput) urlInput.value = '';
                    } else {
                        const unit = courtModalState.unitImages[index];
                        if (unit) {
                            unit.imageUrl = null;
                        }
                    }
                    renderCourtPhotoSlots();
                });
            }
        });
    }

    // ------------------------------------------------------------------
    // Court modal open/close (Revision A1, decision A6) — same fade/focus
    // idiom as the customer dashboard's generic .dash-modal-overlay dialogs
    // (includes/Dashboard.js's openFeedbackModal()/closeFeedbackModal()):
    // a `hidden` round-trip timed to the CSS opacity transition, focus
    // moved into the dialog on open and restored to whatever triggered it
    // on close.
    // ------------------------------------------------------------------
    const COURT_MODAL_CLOSE_DELAY_MS = 250;
    let courtModalHideTimer = null;
    let courtModalIsOpen = false;
    let courtModalLastFocused = null;

    function openCourtModal(court) {
        if (!courtModal || !courtForm) return;
        courtModalLastFocused = document.activeElement;
        resetCourtForm();

        if (court) {
            const archiveSportBtn = courtForm.querySelector('[data-admin-court-archive]');
            if (archiveSportBtn) { archiveSportBtn.hidden = false; archiveSportBtn.textContent = court.isActive ? 'Archive Sport' : 'Restore Sport'; archiveSportBtn.classList.toggle('is-danger', court.isActive); }
            courtForm.dataset.editingId = court.id;
            if (courtModalTitle) courtModalTitle.textContent = `Edit — ${court.name}`;
            if (courtSubmitBtn) courtSubmitBtn.textContent = 'Save Changes';

            // .value assignment (never innerHTML) — a `"` or `<` in an
            // existing name/description can't break out of an attribute or
            // inject markup this way, same fix already applied to the
            // staff-edit inputs (docs/QA_AUDIT_REPORT.md P2#2).
            const setValue = (selector, value) => {
                const el = courtForm.querySelector(selector);
                if (el) el.value = value;
            };
            setValue('[data-admin-court-name]', court.name || '');
            setValue('[data-admin-court-sport]', court.sportId || '');
            const sportSelect = courtForm.querySelector('[data-admin-court-sport]');
            if (sportSelect?.closest('.admin-form-group')) sportSelect.closest('.admin-form-group').hidden = false;
            setValue('[data-admin-court-quantity]', court.quantity || 1);
            setValue('[data-admin-court-unit]', court.unit || 'courts');
            setValue('[data-admin-court-description]', court.description || '');
            setValue('[data-admin-court-op-status]', court.status || 'Available');
            setValue('[data-admin-court-image-url]', court.imageUrl || '');
            const quantityInput = courtForm.querySelector('[data-admin-court-quantity]');
            if (quantityInput) quantityInput.readOnly = true;
            const unitManager = courtForm.querySelector('[data-admin-unit-manager]');
            if (unitManager) unitManager.hidden = false;
            selectedCourtIdForUnits = String(court.id);
            if (unitCourtSelect) unitCourtSelect.value = String(court.id);
            if (unitLabelInput) unitLabelInput.value = nextCourtUnitLabel(court);
            loadPhysicalResourceSettings().then(() => {
                if (selectedCourtIdForUnits === String(court.id) && unitLabelInput) {
                    unitLabelInput.value = nextCourtUnitLabel(court);
                }
            });

            // Revision A2, decision B6 — Photos state/slots for Edit mode:
            // cover mirrors the URL field just set above; per-unit slots
            // are derived from the court's own quantity/unit + whatever
            // unit_images it already has (includes/courtsData.js's
            // normalizeCourt() already parses that column into the
            // {label, imageUrl} shape deriveCourtPhotoUnits expects).
            courtModalState.coverUrl = court.imageUrl || null;
            courtModalState.unitImages = deriveCourtPhotoUnits(court.quantity, court.unit, court.unitImages || []);
            renderCourtPhotoSlots();
        }

        if (courtModalHideTimer) {
            window.clearTimeout(courtModalHideTimer);
            courtModalHideTimer = null;
        }
        courtModal.hidden = false;
        // Force a synchronous layout flush so the browser commits the
        // hidden->visible state before [data-open] flips opacity to 1 —
        // same trick includes/Dashboard.js's modal dialogs use.
        void courtModal.offsetWidth;
        courtModal.setAttribute('data-open', '');
        courtModalIsOpen = true;

        const firstField = courtForm.querySelector('input, select');
        if (firstField) firstField.focus();
    }

    function closeCourtModal() {
        if (!courtModalIsOpen || !courtModal) return;
        courtModalIsOpen = false;

        courtModal.removeAttribute('data-open');
        if (courtModalHideTimer) window.clearTimeout(courtModalHideTimer);
        courtModalHideTimer = window.setTimeout(() => {
            courtModal.hidden = true;
            courtModalHideTimer = null;
        }, COURT_MODAL_CLOSE_DELAY_MS);

        if (courtModalLastFocused && typeof courtModalLastFocused.focus === 'function' && document.contains(courtModalLastFocused)) {
            courtModalLastFocused.focus();
        }
        courtModalLastFocused = null;
    }

    // "+ Add New Court" always opens the modal fresh (add mode) — the hook
    // is unchanged from before this revision even though what it does
    // (open a modal, not toggle an inline panel) has changed.
    courtFormToggleBtns.forEach((btn) => {
        btn.addEventListener('click', () => openCourtModal(null));
    });

    document.querySelectorAll('[data-admin-court-modal-close]').forEach((btn) => {
        btn.addEventListener('click', closeCourtModal);
    });

    // S1 (Revision A1 fix) — a plain 'click' listener on the overlay also
    // fires when a drag STARTS inside a field (e.g. selecting text in the
    // Description textarea, or a slow click that drifts) and ENDS on the
    // backdrop once the mouse is released there — the resulting click
    // event's target is the overlay even though the user never intended to
    // close the modal. Tracked via 'mousedown' on the overlay instead: only
    // treat it as a real backdrop click when BOTH the mousedown and the
    // click landed on the overlay element itself, not a descendant. (The
    // Staff modal above uses the identical pair of listeners under its own
    // staffModalMouseDownOnBackdrop name — apply the same pattern to any
    // future overlay-close modal added to this file.)
    let courtModalMouseDownOnBackdrop = false;
    if (courtModal) {
        courtModal.addEventListener('mousedown', (e) => {
            courtModalMouseDownOnBackdrop = e.target === courtModal;
        });
        courtModal.addEventListener('click', (e) => {
            if (e.target === courtModal && courtModalMouseDownOnBackdrop) closeCourtModal();
            courtModalMouseDownOnBackdrop = false;
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && courtModalIsOpen) closeCourtModal();
    });

    // Revision A2, decision B6 — Photos section live wiring: Quantity/Unit
    // changing re-derives the per-unit slots (growing/shrinking/relabeling,
    // keeping already-uploaded photos by position — see
    // deriveCourtPhotoUnits's own comment above); typing directly into the
    // "paste an https:// URL" fallback keeps courtModalState.coverUrl (the
    // single source of truth Save reads) in sync with whatever the admin
    // typed, exactly like an Upload does.
    const courtQuantityInput = document.querySelector('[data-admin-court-quantity]');
    const courtUnitSelect = document.querySelector('[data-admin-court-unit]');
    function handleCourtUnitFieldsChange() {
        const visibleUnits = deriveCourtPhotoUnits(
            courtQuantityInput ? courtQuantityInput.value : 0,
            courtUnitSelect ? courtUnitSelect.value : '',
            courtModalState.unitImages
        );
        // Keep hidden drafts while someone edits the number field. Typing "12"
        // passes through "1"; truncating here used to destroy Court 2's photo.
        if (visibleUnits.length > courtModalState.unitImages.length) {
            courtModalState.unitImages = visibleUnits;
        }
        renderCourtPhotoSlots();
    }
    if (courtQuantityInput) courtQuantityInput.addEventListener('input', handleCourtUnitFieldsChange);
    if (courtUnitSelect) courtUnitSelect.addEventListener('change', handleCourtUnitFieldsChange);

    const courtImageUrlInput = document.querySelector('[data-admin-court-image-url]');
    if (courtImageUrlInput) {
        courtImageUrlInput.addEventListener('input', () => {
            courtModalState.coverUrl = courtImageUrlInput.value.trim() || null;
            renderCourtPhotoSlots();
        });
    }

    // Escapes every interpolated field — a court name/description written
    // by any staff-or-admin session (RLS lets staff write `court` too, see
    // database/schema/002_content_tables.sql's "court_staff_write" policy)
    // must render as literal text here, not run.
    //
    // Revision A1, decision A6 — card redesign parity with the customer
    // dashboard's .dash-court-card: media block + status badge, name,
    // sport chip + "N units" chip + description tags (unchanged from
    // before this revision — this file already built that same tags
    // array), rate line, and a consistent Edit/Activate-Deactivate action
    // row (Deactivate now carries .is-danger, matching the court's own
    // "this is a consequential action" convention elsewhere on this page).
    function renderAdminCourtCard(court) {
        const isActive = court.isActive !== false;
        const statusCls = isActive ? 'active' : 'inactive';
        const statusLabel = isActive ? 'Active' : 'Archived';
        const monogram = window.InigoCourtsData ? window.InigoCourtsData.monogramFor(court.sportSlug, court.name) : '?';
        const safeImageUrl = court.imageUrl && isSafeImageUrl(court.imageUrl) ? court.imageUrl : null;
        const artworkIndex = ['basketball', 'badminton', 'bowling', 'billiards', 'lawn-tennis', 'pickleball', 'table-tennis', 'volleyball'].indexOf(court.sportSlug);
        const media = safeImageUrl
            ? `<img src="${window.escapeHtml(safeImageUrl)}" alt="${window.escapeHtml(court.name)}" loading="lazy">`
            : artworkIndex >= 0
                ? `<span class="admin-court-art admin-court-art-${artworkIndex}" role="img" aria-label="${window.escapeHtml(court.name)} illustration"></span>`
            : `<span class="admin-court-monogram" aria-hidden="true">${window.escapeHtml(monogram)}</span>`;
        // Published pricing is stored per unit. Use the same unit schedule
        // source as the customer picker instead of the legacy listing rate,
        // which may legitimately be null for courts with different prices.
        const rateHint = window.InigoCourtsData?.rateHint(court);
        const rateHtml = rateHint
            ? window.escapeHtml(rateHint)
            : '<span>Rate TBA</span>';
        // Revision A2, decision B6 — a small "N photos" chip whenever at
        // least one per-unit photo has actually been uploaded (not merely
        // a placeholder slot with no image yet); the cover itself already
        // renders above via `media`, same column as always.
        const uploadedUnitPhotoCount = Array.isArray(court.unitImages)
            ? court.unitImages.filter((u) => u.imageUrl).length
            : 0;
        const tags = [court.sportName, `${court.quantity} ${court.unit}`]
            .concat(uploadedUnitPhotoCount > 0 ? [`${uploadedUnitPhotoCount} photo${uploadedUnitPhotoCount === 1 ? '' : 's'}`] : [])
            .concat(String(court.description || '').split('·').map((s) => s.trim()).filter(Boolean))
            .filter(Boolean);
        const tagsHtml = tags.map((t) => `<span>${window.escapeHtml(t)}</span>`).join('');

        return `
            <article class="admin-court-card" data-admin-court-status="${statusCls}" data-court-id="${window.escapeHtml(court.id)}">
                <div class="admin-court-media">
                    ${media}
                    <span class="admin-status ${statusCls}">${window.escapeHtml(statusLabel)}</span>
                </div>
                <div class="admin-court-body">
                    <h3>${window.escapeHtml(court.name)}</h3>
                    <p class="admin-court-rate">${rateHtml}</p>
                    <div class="admin-court-tags">${tagsHtml}</div>
                    <div class="admin-court-actions">
                        <button type="button" class="admin-btn-secondary" data-admin-court-edit>Edit sport</button>
                    </div>
                </div>
            </article>
        `;
    }

    // Admin sees every court (including deactivated ones, so it can
    // reactivate them) — unlike the customer-facing fetches in
    // includes/Dashboard.js, which default to active-only.
    async function loadAndRenderCourts() {
        if (!courtGrid || !window.InigoCourtsData) return;
        window.InigoCourtsData.invalidateCourts();
        const courts = await window.InigoCourtsData.getCourts({ includeInactive: true });
        currentCourts = courts;
        courtGrid.innerHTML = courts.length
            ? courts.map(renderAdminCourtCard).join('')
            : '<p style="color: var(--color-ink-faint); padding: 8px 4px;">No courts yet — add one above.</p>';
        wireCourtCardActions(courtGrid);
        applyCourtFilter();
        // Revision A2, decision B2 — the Profile panel's "Courts listed"
        // quick stat reuses this exact count (InigoCourtsData.getCourts
        // with includeInactive:true, same call as just above).
        setAdminStat('courts-listed', courts.length);
    }

    if (courtSubmitBtn) {
        courtSubmitBtn.addEventListener('click', async () => {
            const nameInput = document.querySelector('[data-admin-court-name]');
            const sportSelect = document.querySelector('[data-admin-court-sport]');
            const quantityInput = document.querySelector('[data-admin-court-quantity]');
            const unitSelect = document.querySelector('[data-admin-court-unit]');
            const descriptionInput = document.querySelector('[data-admin-court-description]');
            const opStatusSelect = document.querySelector('[data-admin-court-op-status]');

            const name = nameInput ? nameInput.value.trim() : '';
            if (!name) {
                window.InigoToast?.show('Enter a court name.', true);
                nameInput?.focus();
                return;
            }

            if (!window.sb || !window.InigoCourtsData) {
                window.InigoToast?.show('Unable to reach the server right now. Please try again shortly.', true);
                return;
            }

            const sportId = sportSelect ? sportSelect.value : '';
            const editingId = courtForm.dataset.editingId;
            if (editingId && !sportId) {
                window.InigoToast?.show('Select a sport.', true);
                return;
            }

            let quantity = Number(quantityInput ? quantityInput.value : NaN);
            if (!Number.isFinite(quantity) || quantity < 1) quantity = 1;

            // Revision A1 security requirement — courtModalState.coverUrl
            // (kept in sync with the "paste a URL" fallback field AND every
            // Cover Upload — see handleCourtUnitFieldsChange's neighbouring
            // listener and wireCourtPhotoSlotActions above) is the ONE
            // remaining free-text path into an <img src>; reject anything
            // that isn't https:// or a relative project path before it
            // ever reaches the database (renderAdminCourtCard() also
            // re-checks this on render, as defense in depth).
            const coverUrl = courtModalState.coverUrl ? courtModalState.coverUrl.trim() : '';
            if (coverUrl && !isSafeImageUrl(coverUrl)) {
                window.InigoToast?.show('Image URL must start with https:// (or be left blank).', true);
                document.querySelector('[data-admin-court-image-url]')?.focus();
                return;
            }

            const payload = {
                name,
                sport_id: sportId,
                quantity,
                unit: unitSelect ? unitSelect.value : 'courts',
                description: (descriptionInput && descriptionInput.value.trim()) ? descriptionInput.value.trim() : null,
                status: editingId ? (currentCourts.find((court) => String(court.id) === String(editingId))?.status || 'Available') : 'Available',
                image_url: coverUrl || null,
                // Revision A2, decision B6 — per-unit photos, bridged to
                // the column's snake_case {label, image_url} shape.
                unit_images: unitImagesToDbShape(deriveCourtPhotoUnits(
                    quantity,
                    unitSelect ? unitSelect.value : 'courts',
                    courtModalState.unitImages
                )),
            };

            const originalCourt = editingId ? currentCourts.find((court) => String(court.id) === String(editingId)) : null;
            if (!window.confirm(editingId
                ? `Save changes to "${name}"?`
                : `Add "${name}" as a new court?`)) return;
            const originalLabel = courtSubmitBtn.textContent;
            courtSubmitBtn.disabled = true;
            courtSubmitBtn.textContent = editingId ? 'Saving…' : 'Adding…';

            // Revision A2, decision B6 — set when a save had to drop
            // unit_images and retry because the column doesn't exist yet
            // (pre-006 database), so the success toast below can say so
            // instead of silently pretending per-unit photos saved.
            let unitImagesSchemaMissing = false;

            let error;
            let createdListingId = null;
            if (editingId) {
                // .select() so `data` reflects the actually-updated row(s):
                // an UPDATE that RLS's USING clause filters out (a
                // logged-out or non-staff/admin session — see
                // database/schema/002_content_tables.sql's "court_staff_write"
                // policy) matches zero rows and comes back with NO `error`
                // at all, just an empty result — without checking the row
                // count that would silently report success on a write that
                // never happened. Edits never touch `slug` — renaming a
                // court can't collide with, or orphan, another row's slug.
                let { error: updateError, data: updateData } = await window.sb
                    .from('court').update(payload).eq('id', editingId).select();
                if (updateError && isSchemaMismatchError(updateError)) {
                    unitImagesSchemaMissing = true;
                    const { unit_images, ...payloadWithoutUnitImages } = payload;
                    ({ error: updateError, data: updateData } = await window.sb
                        .from('court').update(payloadWithoutUnitImages).eq('id', editingId).select());
                }
                error = updateError || ((!updateData || updateData.length === 0)
                    ? { message: 'Could not save changes — you may not have permission, or this court may no longer exist.' }
                    : null);
            } else {
                const unitCount = Math.floor(quantity);
                if (unitCount < 1 || unitCount > 50) {
                    window.InigoToast?.show('Enter between 1 and 50 units.', true);
                    courtSubmitBtn.disabled = false;
                    courtSubmitBtn.textContent = originalLabel;
                    return;
                }
                const { error: createError } = await window.sb.rpc('admin_create_sport_with_units', {
                    p_name: name,
                    p_slug: window.InigoCourtsData.slugify(name),
                    p_unit: payload.unit,
                    p_quantity: unitCount,
                    p_description: payload.description,
                    p_status: payload.status,
                    p_image_url: payload.image_url,
                    p_unit_images: payload.unit_images,
                });
                error = createError;
            }

            courtSubmitBtn.disabled = false;
            courtSubmitBtn.textContent = originalLabel;

            if (error) {
                // Covers both a genuine DB error and RLS rejecting a
                // non-admin/non-staff session — either way this is
                // surfaced via the page's toast pattern instead of alert().
                window.InigoToast?.show(error.message || 'Could not save this court. Please try again.', true);
                return;
            }

            // Remove superseded Storage objects only after the database save succeeds.
            // Cancelling the editor or a failed save must leave existing photos intact.
            if (originalCourt) {
                const previousUrls = [originalCourt.imageUrl, ...(originalCourt.unitImages || []).map((unit) => unit.imageUrl)].filter(Boolean);
                const retainedUrls = new Set([payload.image_url, ...(unitImagesSchemaMissing ? (originalCourt.unitImages || []).map((unit) => unit.imageUrl) : (payload.unit_images || []).map((unit) => unit.image_url))].filter(Boolean));
                previousUrls.filter((url) => !retainedUrls.has(url)).forEach(removeUploadedMediaBestEffort);
            }

            window.InigoToast?.show(
                unitImagesSchemaMissing && courtModalState.unitImages.length
                    ? `${editingId ? 'Court updated' : 'Court added'}, but per-unit photos need a database update (see database/schema/006_court_unit_images.sql).`
                    : (editingId ? 'Sport updated.' : 'Sport and units added.')
            );
            closeCourtModal();
            // Revision A2, decision B6 — invalidateCourts() happens inside
            // loadAndRenderCourts() itself (see its own comment above), so
            // the freshly-saved unit_images/image_url are what the
            // customer dashboard's unit picker sees on its own next load.
            loadAndRenderCourts();
            recordOwnerActivity(`${editingId ? 'Sport updated' : 'Sport added'}: ${name}`, 'courts');
        });
    }

    document.querySelector('[data-admin-court-archive]')?.addEventListener('click', async (event) => {
        const courtId = courtForm?.dataset.editingId;
        const court = currentCourts.find((item) => String(item.id) === String(courtId));
        const restore = court && court.isActive === false;
        if (!court || !window.sb || !window.confirm(`${restore ? 'Restore' : 'Archive'} ${court.name}? Past reservations will remain in the system.`)) return;
        const { data, error } = await window.sb.from('court').update({ is_active: restore }).eq('id', courtId).select('id');
        if (error || !data?.length) { window.InigoToast?.show(error?.message || `Could not ${restore ? 'restore' : 'archive'} this sport.`, true); return; }
        const otherActive = currentCourts.some((item) => String(item.id) !== String(courtId)
            && String(item.sportId) === String(court.sportId) && item.isActive);
        if (court.sportId && (restore || !otherActive)) {
            const { error: sportError } = await window.sb.from('sport').update({ is_active: restore }).eq('id', court.sportId);
            if (sportError) window.InigoToast?.show(`Listing changed, but its sport status needs attention: ${sportError.message}`, true);
        }
        window.InigoToast?.show(restore ? 'Sport restored.' : 'Sport archived. Existing reservations were preserved.');
        closeCourtModal();
        await loadAndRenderCourts();
    });

    function wireCourtCardActions(scope) {
        scope.querySelectorAll('[data-admin-court-edit]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const card = btn.closest('.admin-court-card');
                const id = card ? card.dataset.courtId : null;
                const court = currentCourts.find((c) => String(c.id) === String(id));
                if (!court) return;
                openCourtModal(court);
            });
        });

        scope.querySelectorAll('[data-admin-court-toggle-status]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const card = btn.closest('.admin-court-card');
                const id = card ? card.dataset.courtId : null;
                if (!id || !window.sb) return;

                const court = currentCourts.find((c) => String(c.id) === String(id));
                const currentlyActive = card.dataset.adminCourtStatus === 'active';
                const verb = currentlyActive ? 'deactivate' : 'activate';
                if (!window.confirm(`Are you sure you want to ${verb} "${court ? court.name : 'this court'}"?`)) return;

                btn.disabled = true;
                // Soft toggle only, same convention already used for staff
                // (profiles.status — see refreshStaffList above) rather
                // than deleting the row. `status` (Available/Maintenance —
                // day-to-day bookability) is left untouched; is_active only
                // controls whether the court is listed at all. .select() so
                // an RLS-filtered UPDATE (0 rows matched — see the Add/Edit
                // handler's note above) is caught explicitly instead of
                // silently reporting success on a write that never happened.
                const { error: toggleError, data: toggleData } = await window.sb
                    .from('court').update({ is_active: !currentlyActive }).eq('id', id).select();
                const error = toggleError || ((!toggleData || toggleData.length === 0)
                    ? { message: `Could not ${verb} this court — you may not have permission.` }
                    : null);
                btn.disabled = false;

                if (error) {
                    window.InigoToast?.show(error.message || `Could not ${verb} this court.`, true);
                    return;
                }
                window.InigoToast?.show(`Court ${currentlyActive ? 'deactivated' : 'activated'}.`);
                loadAndRenderCourts();
                recordOwnerActivity(`Court ${currentlyActive ? 'deactivated' : 'activated'}: ${court?.name || 'Court'}`, 'courts');
            });
        });
    }

    // Court modal's Photos section (Revision A2, decision B6) — ONE shared
    // hidden file input for every slot (Cover + each unit); which slot a
    // given upload targets is tracked in courtModalState.activeUploadSlot,
    // set by wireCourtPhotoSlotActions' Upload button handler right before
    // this input is .click()ed. Each upload goes through
    // includes/imageTools.js's openCropEditor() first (fixed 16:10 frame,
    // drag-to-pan, 1×–4× zoom) so every photo — cover or per-unit — is
    // consistently framed before it ever reaches uploadToMedia(). Uses the
    // court's real slug when editing, or derives one from whatever's
    // currently typed in the Name field when adding (courtsData.js's own
    // slugify(), same helper the Add/Edit save handler above uses for a
    // brand-new court's `slug` column).
    const courtPhotoFileInput = document.querySelector('[data-admin-court-photo-file]');

    function currentCourtSlugForUpload() {
        const editingId = courtForm ? courtForm.dataset.editingId : null;
        const editingCourt = editingId ? currentCourts.find((c) => String(c.id) === String(editingId)) : null;
        if (editingCourt && editingCourt.slug) return editingCourt.slug;
        const nameInput = document.querySelector('[data-admin-court-name]');
        return window.InigoCourtsData.slugify(nameInput ? nameInput.value : '');
    }

    if (courtPhotoFileInput) {
        courtPhotoFileInput.addEventListener('change', async () => {
            const file = courtPhotoFileInput.files && courtPhotoFileInput.files[0];
            courtPhotoFileInput.value = '';
            const slot = courtModalState.activeUploadSlot;
            courtModalState.activeUploadSlot = null;
            if (!file || !slot) return;

            if (!window.InigoImageTools || !window.sb) {
                window.InigoToast?.show('Unable to reach the server right now. Please try again shortly.', true);
                return;
            }

            let blob;
            try {
                blob = await window.InigoImageTools.openCropEditor(file, { aspect: 16 / 10, maxW: 1600, maxH: 1000, quality: 0.85 });
            } catch (err) {
                window.InigoToast?.show(err.message || 'Could not process that image.', true);
                return;
            }
            if (!blob) return; // user cancelled the crop dialog

            const slug = currentCourtSlugForUpload();
            const path = slot.kind === 'cover'
                ? `courts/${slug}/cover-${Date.now()}.jpg`
                : `courts/${slug}/unit-${slot.index + 1}-${Date.now()}.jpg`;

            try {
                const url = await uploadToMedia(path, blob);
                if (slot.kind === 'cover') {
                    courtModalState.coverUrl = url;
                    const urlInput = document.querySelector('[data-admin-court-image-url]');
                    if (urlInput) urlInput.value = url;
                } else {
                    const unit = courtModalState.unitImages[slot.index];
                    if (unit) {
                        unit.imageUrl = url;
                    }
                }
                renderCourtPhotoSlots();
                window.InigoToast?.show('Photo uploaded.');
            } catch (err) {
                window.InigoToast?.show(err.message || 'Could not upload that image.', true);
            }
        });
    }

    if (window.InigoCourtsData) {
        window.InigoCourtsData.getSports().then((sports) => {
            const sportSelect = document.querySelector('[data-admin-court-sport]');
            if (sportSelect) {
                sportSelect.innerHTML = sports.map((s) => `<option value="${window.escapeHtml(s.id)}">${window.escapeHtml(s.name)}</option>`).join('');
            }
        });
        loadAndRenderCourts();
    } else {
        // Should never happen — includes/courtsData.js must load before
        // this file (see the <script> order in Pages/owner_dashboard.html).
        console.error('[admin] window.InigoCourtsData is missing — check that includes/courtsData.js loads before includes/owner_dashboard.js.');
    }

    // Inventory and shared-availability data stay backed by the reservation
    // ledger, but are edited in context from the selected sport's dialog.
    const resourceRows = document.querySelector('[data-admin-resource-rows]');
    const unitAddForm = document.querySelector('[data-admin-unit-add]');
    const unitCourtSelect = document.querySelector('[data-admin-unit-court]');
    const unitLabelInput = document.querySelector('[data-admin-unit-label]');
    let selectedCourtIdForUnits = null;
    let adminInventoryUnits = [];
    let adminResources = [];
    const rateCutoffForm = document.querySelector('[data-admin-rate-cutoff-form]');
    const rateCutoffInput = document.querySelector('[data-admin-rate-cutoff]');
    const rateCutoffSave = document.querySelector('[data-admin-rate-cutoff-save]');
    const rateCutoffStatus = document.querySelector('[data-admin-rate-cutoff-status]');

    function showRateCutoffStatus(message, isError = false) {
        if (!rateCutoffStatus) return;
        rateCutoffStatus.textContent = message;
        rateCutoffStatus.classList.toggle('is-error', isError);
        rateCutoffStatus.classList.toggle('is-success', !isError && Boolean(message));
    }

    function adminWriteError(error, action) {
        if (error?.code === '42501') return `Admin access is required to ${action}.`;
        return `Could not ${action}: ${error?.message || 'database request failed'}`;
    }

    async function loadRateCutoff() {
        if (!window.sb || !rateCutoffInput) return;
        rateCutoffInput.disabled = true;
        if (rateCutoffSave) rateCutoffSave.disabled = true;
        showRateCutoffStatus('Loading cutoff…');
        let result;
        try {
            result = await window.sb.from('app_settings')
                .select('night_rate_starts_at').eq('id', true).maybeSingle();
        } catch (err) {
            showRateCutoffStatus(adminWriteError(err, 'load the day/night cutoff'), true);
            return;
        }
        const { data, error } = result;
        if (error || !data) {
            showRateCutoffStatus(error
                ? adminWriteError(error, 'load the day/night cutoff')
                : 'No app settings row was found. Check the database migration and admin access.', true);
            return;
        }
        rateCutoffInput.value = data.night_rate_starts_at
            ? String(data.night_rate_starts_at).slice(0, 5)
            : '';
        rateCutoffInput.disabled = false;
        if (rateCutoffSave) rateCutoffSave.disabled = false;
        showRateCutoffStatus(data.night_rate_starts_at
            ? `Current cutoff: ${rateCutoffInput.value} (Asia/Manila).`
            : 'No cutoff is configured. Different day and night rates cannot be quoted until one is saved.');
    }

    rateCutoffForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!window.sb || !rateCutoffInput) return;
        const value = rateCutoffInput.value || null;
        if (rateCutoffSave) { rateCutoffSave.disabled = true; rateCutoffSave.textContent = 'Saving…'; }
        rateCutoffInput.disabled = true;
        showRateCutoffStatus('Saving cutoff…');
        let result;
        try {
            result = await window.sb.from('app_settings').update({ night_rate_starts_at: value }).eq('id', true)
                .select('night_rate_starts_at').maybeSingle();
        } catch (err) {
            if (rateCutoffSave) { rateCutoffSave.disabled = false; rateCutoffSave.textContent = 'Save cutoff'; }
            rateCutoffInput.disabled = false;
            showRateCutoffStatus(adminWriteError(err, 'save the cutoff'), true);
            return;
        }
        const { data, error } = result;
        if (rateCutoffSave) { rateCutoffSave.disabled = false; rateCutoffSave.textContent = 'Save cutoff'; }
        rateCutoffInput.disabled = false;
        if (error || !data) {
            showRateCutoffStatus(error
                ? adminWriteError(error, 'save the cutoff')
                : 'No settings row was updated. Admin access may be required.', true);
            return;
        }
        rateCutoffInput.value = data.night_rate_starts_at ? String(data.night_rate_starts_at).slice(0, 5) : '';
        showRateCutoffStatus(data.night_rate_starts_at
            ? `Cutoff saved: ${rateCutoffInput.value} (Asia/Manila).`
            : 'Cutoff cleared. Different day and night rates cannot be quoted until one is saved.');
    });

    function describeResourceForUnit(resource, unit) {
        const otherUnits = adminInventoryUnits.filter((candidate) => String(candidate.id) !== String(unit.id)
            && (candidate.court_unit_resource_map || []).some((link) => link.resource_id === resource.id));
        const otherNames = otherUnits.map((candidate) => {
            const linkedCourt = Array.isArray(candidate.court) ? candidate.court[0] : candidate.court;
            return `${linkedCourt?.name || 'Court'} ${candidate.label}`;
        });
        return otherNames.length
            ? `Shares availability with ${otherNames.join(', ')}`
            : 'Dedicated space for this unit';
    }

    function renderResourceRows(units = adminInventoryUnits, resources = adminResources) {
        if (!resourceRows) return;
        if (!selectedCourtIdForUnits) {
            resourceRows.innerHTML = '<p class="admin-form-hint">Open a sport’s Edit view to manage its individual units.</p>';
            return;
        }
        const selectedUnits = units.filter((unit) => String(unit.court_id) === String(selectedCourtIdForUnits));
        if (!selectedUnits.length) {
            resourceRows.innerHTML = '<p class="admin-unit-empty">No individual units are configured yet. Add the first court, lane, or table above.</p>';
            return;
        }
        resourceRows.innerHTML = selectedUnits.map((unit) => {
            const mapped = new Set((unit.court_unit_resource_map || []).map((link) => link.resource_id));
            const court = Array.isArray(unit.court) ? unit.court[0] : unit.court;
            const unitDescription = `${court?.name || 'Court'} ${unit.label}`;
            const connectedResources = resources.filter((resource) => {
                if (mapped.has(resource.id)) return true;
                const alreadyOwnedByCapacityCourt = adminInventoryUnits.some((candidate) => String(candidate.id) !== String(unit.id)
                    && (candidate.court_unit_resource_map || []).length > 1
                    && (candidate.court_unit_resource_map || []).some((link) => link.resource_id === resource.id));
                if (alreadyOwnedByCapacityCourt) return false;
                return adminInventoryUnits.some((candidate) => String(candidate.id) !== String(unit.id)
                    && String(candidate.court_id) !== String(unit.court_id)
                    && (candidate.court_unit_resource_map || []).length === 1
                    && (candidate.court_unit_resource_map || []).some((link) => link.resource_id === resource.id));
            });
            const options = connectedResources.map((resource) => {
                const capacityOwner = adminInventoryUnits.find((candidate) => String(candidate.id) !== String(unit.id)
                    && (candidate.court_unit_resource_map || []).length > 1
                    && (candidate.court_unit_resource_map || []).some((link) => link.resource_id === resource.id));
                const managedElsewhere = mapped.has(resource.id) && Boolean(capacityOwner);
                const ownerCourt = Array.isArray(capacityOwner?.court) ? capacityOwner.court[0] : capacityOwner?.court;
                const label = managedElsewhere
                    ? `${describeResourceForUnit(resource, unit)} · managed from ${ownerCourt?.name || 'larger court'} ${capacityOwner.label}`
                    : describeResourceForUnit(resource, unit);
                return `<label class="admin-unit-share-option">
                    <input type="checkbox" data-resource-map="${window.escapeHtml(resource.id)}" aria-label="${window.escapeHtml(label)}" ${mapped.has(resource.id) ? 'checked' : ''} ${managedElsewhere ? 'disabled' : ''}>
                    <span>${window.escapeHtml(label)}</span>
                </label>`;
            }).join('');
            const peerCount = (unit.court_unit_resource_map || []).reduce((count, link) => {
                return count + adminInventoryUnits.filter((candidate) => String(candidate.id) !== String(unit.id)
                    && (candidate.court_unit_resource_map || []).some((candidateLink) => candidateLink.resource_id === link.resource_id)).length;
            }, 0);
            return `<article class="admin-unit-card" data-admin-resource-unit="${window.escapeHtml(unit.id)}">
                <header class="admin-unit-card-head">
                    <div><strong>${window.escapeHtml(unitDescription)}</strong><span>${unit.inventory_verified ? 'Inventory verified' : 'Needs verification'}</span></div>
                    <label class="admin-unit-bookable"><span>Unit status</span><select data-resource-status aria-label="Status for ${window.escapeHtml(unitDescription)}"><option value="available" ${(unit.availability_status || (unit.is_active ? 'available' : 'archived')) === 'available' ? 'selected' : ''}>Available</option><option value="maintenance" ${unit.availability_status === 'maintenance' ? 'selected' : ''}>Maintenance</option><option value="archived" ${unit.availability_status === 'archived' ? 'selected' : ''}>Archived</option></select></label>
                </header>
                <div class="admin-unit-price-grid">
                    <label class="admin-form-group"><span class="admin-form-label">Pricing tier</span><select class="admin-input admin-resource-tier" aria-label="Pricing tier for ${window.escapeHtml(unitDescription)}">
                    <option value="">Unassigned</option><option value="old" ${unit.pricing_tier === 'old' ? 'selected' : ''}>Old</option>
                    <option value="new" ${unit.pricing_tier === 'new' ? 'selected' : ''}>New</option><option value="standard" ${unit.pricing_tier === 'standard' ? 'selected' : ''}>Standard</option>
                    </select></label>
                    <label class="admin-form-group"><span class="admin-form-label">Day rate (₱)</span><input class="admin-input" type="number" min="0" step="0.01" inputmode="decimal" data-rate-day value="${unit.rate_day == null ? '' : window.escapeHtml(String(unit.rate_day))}" placeholder="Not set" aria-label="Day rate for ${window.escapeHtml(unitDescription)}"></label>
                    <label class="admin-form-group"><span class="admin-form-label">Night rate (₱)</span><input class="admin-input" type="number" min="0" step="0.01" inputmode="decimal" data-rate-night value="${unit.rate_night == null ? '' : window.escapeHtml(String(unit.rate_night))}" placeholder="Not set" aria-label="Night rate for ${window.escapeHtml(unitDescription)}"></label>
                    <label class="admin-form-group"><span class="admin-form-label">Bill by</span><select class="admin-input admin-resource-rate-basis" data-rate-unit aria-label="Rate basis for ${window.escapeHtml(unitDescription)}">
                    <option value="/hr" ${unit.rate_unit === '/hr' ? 'selected' : ''}>Per hour</option>
                    <option value="/set" ${unit.rate_unit === '/set' ? 'selected' : ''}>Per set</option>
                    </select></label>
                </div>
                <div class="admin-unit-save-row"><button type="button" class="admin-btn-chip-secondary admin-resource-rate-save" data-rate-save aria-label="Save rates for ${window.escapeHtml(unitDescription)}">Save rates</button><span class="admin-resource-rate-status" data-rate-status role="status" aria-live="polite"></span></div>
                <details class="admin-unit-sharing">
                    <summary>Availability connections <span>${peerCount ? `${peerCount} shared link${peerCount === 1 ? '' : 's'}` : 'No other courts linked'}</span></summary>
                    <p>Each choice is one shared booking space. For a larger court that covers several smaller courts, configure the larger court and select every smaller court it covers. The smaller courts then remain independently bookable.</p>
                    <div class="admin-unit-share-list">${options || '<span>No other spaces are available to connect.</span>'}</div>
                </details>
            </article>`;
        }).join('');

        resourceRows.querySelectorAll('[data-admin-resource-unit]').forEach((row) => {
            const unitId = row.dataset.adminResourceUnit;
            const unit = adminInventoryUnits.find((item) => item.id === unitId);
            const mapped = new Set((unit?.court_unit_resource_map || []).map((link) => link.resource_id));
            const disabledByDesign = new Set(Array.from(row.querySelectorAll('input,select')).filter((input) => input.disabled));
            const setBusy = (busy) => row.querySelectorAll('input,select').forEach((input) => {
                input.disabled = busy || disabledByDesign.has(input);
            });
            const rateSaveButton = row.querySelector('[data-rate-save]');
            const rateStatus = row.querySelector('[data-rate-status]');
            rateSaveButton?.addEventListener('click', async () => {
                const dayInput = row.querySelector('[data-rate-day]');
                const nightInput = row.querySelector('[data-rate-night]');
                const basisInput = row.querySelector('[data-rate-unit]');
                const amount = (input) => {
                    if (input.value.trim() === '') return null;
                    const parsed = Number(input.value);
                    return Number.isFinite(parsed) && parsed >= 0 ? parsed : NaN;
                };
                const rateDay = amount(dayInput);
                const rateNight = amount(nightInput);
                if (Number.isNaN(rateDay) || Number.isNaN(rateNight)) {
                    if (rateStatus) { rateStatus.textContent = 'Enter a non-negative amount or leave blank.'; rateStatus.classList.add('is-error'); }
                    return;
                }
                setBusy(true);
                rateSaveButton.disabled = true;
                rateSaveButton.textContent = 'Saving…';
                if (rateStatus) { rateStatus.textContent = 'Saving…'; rateStatus.classList.remove('is-error', 'is-success'); }
                let updateResult;
                try {
                    updateResult = await window.sb.from('court_unit_inventory').update({
                        rate_day: rateDay,
                        rate_night: rateNight,
                        rate_unit: basisInput.value,
                    }).eq('id', unitId).select('id,rate_day,rate_night,rate_unit').single();
                } catch (err) {
                    setBusy(false);
                    rateSaveButton.disabled = false;
                    rateSaveButton.textContent = 'Save rates';
                    if (rateStatus) { rateStatus.textContent = adminWriteError(err, 'save rates'); rateStatus.classList.add('is-error'); }
                    return;
                }
                const { data, error } = updateResult;
                setBusy(false);
                rateSaveButton.disabled = false;
                rateSaveButton.textContent = 'Save rates';
                if (error) {
                    const message = error.code === '23514'
                        ? 'Unsupported rate. Use a non-negative amount and a valid basis.'
                        : error.code === 'PGRST116'
                            ? 'No unit was updated. Check that this unit still exists and that you have admin access.'
                            : adminWriteError(error, 'save rates');
                    if (rateStatus) { rateStatus.textContent = message; rateStatus.classList.add('is-error'); }
                    console.error('[admin] could not save unit rates', error);
                    return;
                }
                if (!data) {
                    if (rateStatus) { rateStatus.textContent = 'No unit was updated. Check admin access and reload the table.'; rateStatus.classList.add('is-error'); }
                    return;
                }
                if (rateStatus) { rateStatus.textContent = 'Saved'; rateStatus.classList.remove('is-error'); rateStatus.classList.add('is-success'); }
                if (unit) Object.assign(unit, { rate_day: rateDay, rate_night: rateNight, rate_unit: basisInput.value });
                window.InigoCourtsData?.invalidateCourts();
                loadAndRenderCourts();
            });
            const save = async (promise, successMessage) => {
                setBusy(true);
                let result;
                try {
                    result = await promise;
                } catch (error) {
                    setBusy(false);
                    window.InigoToast?.show(adminWriteError(error, 'update court availability'), true);
                    await loadPhysicalResourceSettings();
                    return false;
                }
                const { data, error } = result;
                setBusy(false);
                if (error) {
                    window.InigoToast?.show(error.code === '23P01'
                        ? 'That change conflicts with an active reservation. It was not saved.'
                        : error.code === '23503'
                            ? 'This unit has an active booking. Wait for it to finish or expire before changing its status.'
                        : (error.message || 'Could not update court availability.'), true);
                    await loadPhysicalResourceSettings();
                    return false;
                }
                if (!data) {
                    window.InigoToast?.show('No change was saved. Check your admin access, then reload the court.', true);
                    await loadPhysicalResourceSettings();
                    return false;
                }
                if (successMessage) window.InigoToast?.show(successMessage);
                return true;
            };

            const tierSelect = row.querySelector('.admin-resource-tier');
            tierSelect?.addEventListener('change', async () => {
                if (await save(window.sb.from('court_unit_inventory').update({ pricing_tier: tierSelect.value || null }).eq('id', unitId).select('id').maybeSingle(), 'Pricing tier saved.')) {
                    await loadPhysicalResourceSettings();
                }
            });
            row.querySelector('[data-resource-status]')?.addEventListener('change', async (event) => {
                const select = event.currentTarget;
                const previous = unit?.availability_status || (unit?.is_active ? 'available' : 'archived');
                const nextStatus = select.value;
                if (nextStatus !== 'available' && !window.confirm(`${nextStatus === 'archived' ? 'Archive' : 'Set to maintenance'} for ${unit?.label || 'this court'}? Existing reservations remain saved.`)) {
                    select.value = previous;
                    return;
                }
                if (await save(window.sb.from('court_unit_inventory').update({ availability_status: nextStatus }).eq('id', unitId).select('id').maybeSingle(), 'Court availability updated.')) {
                    if (unit) { unit.availability_status = nextStatus; unit.is_active = nextStatus === 'available'; }
                    await loadPhysicalResourceSettings();
                    window.InigoCourtsData?.invalidateCourts();
                    await loadAndRenderCourts();
                } else {
                    select.value = previous;
                }
            });

            row.querySelectorAll('[data-resource-map]').forEach((input) => {
                input.addEventListener('change', async () => {
                    const resourceId = input.dataset.resourceMap;
                    if (!input.checked && mapped.size <= 1) {
                        input.checked = true;
                        window.InigoToast?.show('Keep at least one availability space linked to each court.', true);
                        return;
                    }
                    const request = input.checked
                        ? window.sb.from('court_unit_resource_map').upsert(
                            { court_unit_id: unitId, resource_id: resourceId },
                            { onConflict: 'court_unit_id,resource_id', ignoreDuplicates: true }).select('court_unit_id').maybeSingle()
                        : window.sb.from('court_unit_resource_map').delete()
                            .eq('court_unit_id', unitId).eq('resource_id', resourceId).select('court_unit_id').maybeSingle();
                    if (await save(request, 'Availability connection saved.')) {
                        await loadPhysicalResourceSettings();
                    } else {
                        input.checked = !input.checked;
                    }
                });
            });
        });
    }

    async function loadPhysicalResourceSettings() {
        if (!window.sb || !resourceRows) return;
        const [unitsRes, resourcesRes] = await Promise.all([
            window.sb.from('court_unit_inventory')
                .select('id,court_id,label,pricing_tier,rate_day,rate_night,rate_unit,is_active,availability_status,inventory_verified,court(id,name,unit),court_unit_resource_map(resource_id)')
                .order('court_id').order('label'),
            window.sb.from('physical_court_resource').select('id,name,is_active').order('name'),
        ]);
        if (unitsRes.error || resourcesRes.error) {
            resourceRows.innerHTML = '<p class="admin-unit-empty">Court settings could not be loaded. Refresh and check your admin access.</p>';
            console.error('[admin] could not load physical court settings', unitsRes.error || resourcesRes.error);
            return;
        }
        adminInventoryUnits = (unitsRes.data || []).sort((a, b) => {
            const courtOrder = String(a.court_id).localeCompare(String(b.court_id));
            if (courtOrder) return courtOrder;
            return String(a.label || '').localeCompare(String(b.label || ''), undefined, { numeric: true, sensitivity: 'base' });
        });
        adminResources = (resourcesRes.data || []).filter((resource) => resource.is_active);
        renderResourceRows();
    }

    function nextCourtUnitLabel(court) {
        const noun = String(court.unit || 'courts').replace(/s$/i, '');
        const titleNoun = noun.charAt(0).toUpperCase() + noun.slice(1);
        const used = new Set(adminInventoryUnits.filter((unit) => String(unit.court_id) === String(court.id))
            .map((unit) => String(unit.label || '').toLowerCase()));
        let index = 1;
        while (used.has(`${titleNoun} ${index}`.toLowerCase())) index += 1;
        return `${titleNoun} ${index}`;
    }

    async function createCourtUnitWithSpace(courtId, label) {
        const courtResult = await window.sb.from('court').select('id,name,quantity').eq('id', courtId).single();
        if (courtResult.error || !courtResult.data) return { error: courtResult.error || new Error('Sport listing not found.') };

        const unitResult = await window.sb.from('court_unit_inventory')
            .insert({ court_id: courtId, label, inventory_verified: true, is_active: true })
            .select('id').single();
        if (unitResult.error || !unitResult.data) return { error: unitResult.error || new Error('Could not create the court unit.') };

        const unitId = unitResult.data.id;
        const resourceResult = await window.sb.from('physical_court_resource')
            .insert({ name: `${courtResult.data.name} · ${label} · ${unitId}` }).select('id').single();
        if (resourceResult.error || !resourceResult.data) {
            await window.sb.from('court_unit_inventory').delete().eq('id', unitId);
            return { error: resourceResult.error || new Error('Could not initialize availability for this court.') };
        }

        const mapResult = await window.sb.from('court_unit_resource_map')
            .insert({ court_unit_id: unitId, resource_id: resourceResult.data.id });
        if (mapResult.error) {
            await window.sb.from('physical_court_resource').delete().eq('id', resourceResult.data.id);
            await window.sb.from('court_unit_inventory').delete().eq('id', unitId);
            return { error: mapResult.error };
        }

        const countResult = await window.sb.from('court_unit_inventory').select('id', { count: 'exact', head: true }).eq('court_id', courtId);
        const nextQuantity = countResult.count || Number(courtResult.data.quantity) + 1;
        const listingUpdate = await window.sb.from('court').update({ quantity: nextQuantity }).eq('id', courtId).select('id').maybeSingle();
        if (listingUpdate.error || !listingUpdate.data) {
            await window.sb.from('court_unit_resource_map').delete().eq('court_unit_id', unitId);
            await window.sb.from('physical_court_resource').delete().eq('id', resourceResult.data.id);
            await window.sb.from('court_unit_inventory').delete().eq('id', unitId);
            return { error: listingUpdate.error || new Error('Unit was added, but the sport listing count could not be refreshed. Reload the page.') };
        }
        return { data: { id: unitId, resourceId: resourceResult.data.id, quantity: nextQuantity } };
    }

    unitAddForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const courtId = unitCourtSelect?.value;
        const label = unitLabelInput?.value.trim();
        const submit = unitAddForm.querySelector('button[type="submit"]');
        if (!courtId || !label || !window.sb) return;
        if (adminInventoryUnits.some((unit) => String(unit.court_id) === String(courtId)
            && String(unit.label).toLocaleLowerCase() === label.toLocaleLowerCase())) {
            window.InigoToast?.show('A court with that label already exists in this sport.', true);
            unitLabelInput?.focus();
            return;
        }
        if (submit) { submit.disabled = true; submit.textContent = 'Adding…'; }
        const { data, error } = await createCourtUnitWithSpace(courtId, label);
        if (submit) { submit.disabled = false; submit.textContent = 'Add unit'; }
        if (error) {
            window.InigoToast?.show(error.message || 'Could not add this unit and set up its availability.', true);
            return;
        }
        await loadPhysicalResourceSettings();
        const court = currentCourts.find((item) => String(item.id) === String(courtId));
        if (court && data?.quantity) {
            court.quantity = data.quantity;
            const quantityInput = courtForm?.querySelector('[data-admin-court-quantity]');
            if (quantityInput) quantityInput.value = String(data.quantity);
            courtModalState.unitImages = deriveCourtPhotoUnits(data.quantity, court.unit, courtModalState.unitImages);
            renderCourtPhotoSlots();
            if (unitLabelInput) unitLabelInput.value = nextCourtUnitLabel(court);
        }
        window.InigoCourtsData?.invalidateCourts();
        await loadAndRenderCourts();
        window.InigoToast?.show('Court added and ready for bookings. Add its rate before accepting paid reservations.');
    });

    loadPhysicalResourceSettings();
    loadRateCutoff();
    document.addEventListener('inigosync:profile-ready', loadPhysicalResourceSettings);
    document.addEventListener('inigosync:profile-ready', loadRateCutoff);

    // ------------------------------------------------------------------
    // Media Manager — real slideshow against `public.event` (Revision A1,
    // decision A5). Lists every row (published or not) ordered by
    // display_order, so an admin can stage an unpublished slide before it
    // goes live. Uploads go to the same public `media` Storage bucket the
    // Court modal uses above, path `slides/<event id>-<ts>.jpg`. The old
    // "Court photos" card (a second, redundant path to the SAME
    // court.image_url the Court Listings modal already edits) is removed
    // outright rather than ported.
    // The landing page and customer dashboard load every published slide;
    // the owner can stage an unlimited number of drafts and publish them as needed.
    let currentSlides = [];

    function slideMediaMarkup(slide) {
        const safeUrl = slide.image_url && isSafeImageUrl(slide.image_url) ? slide.image_url : null;
        if (safeUrl) {
            return `<img src="${window.escapeHtml(safeUrl)}" alt="${window.escapeHtml(slide.title || '')}" loading="lazy">`;
        }
        return '<span class="admin-slide-photo-soon" aria-hidden="true">No photo yet</span>';
    }

    function renderSlideEditor(slide, index, total) {
        const media = slideMediaMarkup(slide);
        const isFirst = index === 0;
        const isLast = index === total - 1;
        const isOn = slide.is_published !== false;
        return `
            <div class="admin-slide-card" data-admin-slide data-slide-id="${window.escapeHtml(slide.id)}">
                <div class="admin-slide-thumb">
                    ${media}
                    <span class="admin-slide-badge">Slide ${index + 1}</span>
                </div>
                <div class="admin-slide-body">
                    <div class="admin-form-group">
                        <span class="admin-form-label">Title</span>
                        <input type="text" class="admin-input admin-slide-title" data-admin-slide-title value="${window.escapeHtml(slide.title || '')}">
                    </div>
                    <div class="admin-form-group">
                        <span class="admin-form-label">Caption</span>
                        <input type="text" class="admin-input admin-slide-caption" data-admin-slide-caption value="${window.escapeHtml(slide.meta || '')}">
                    </div>
                    <div class="admin-form-group">
                        <span class="admin-form-label">Tag <span class="admin-form-label-hint">(optional)</span></span>
                        <input type="text" class="admin-input" data-admin-slide-tag value="${window.escapeHtml(slide.tag || '')}">
                    </div>
                    <div class="admin-slide-publish-row">
                        <span>Published</span>
                        <button type="button" class="admin-switch${isOn ? ' is-on' : ''}" data-admin-slide-publish aria-label="Toggle published" aria-pressed="${isOn}"></button>
                    </div>
                    <div class="admin-slide-actions">
                        <button type="button" class="admin-btn-chip-primary" data-admin-slide-replace>Replace photo</button>
                    </div>
                    <div class="admin-slide-actions admin-slide-actions-row2">
                        <button type="button" class="admin-btn-chip-secondary" data-admin-slide-move-up${isFirst ? ' disabled' : ''}>↑ Move up</button>
                        <button type="button" class="admin-btn-chip-secondary" data-admin-slide-move-down${isLast ? ' disabled' : ''}>↓ Move down</button>
                        <button type="button" class="admin-btn-chip-danger" data-admin-slide-remove>Remove</button>
                    </div>
                    <input type="file" accept="image/jpeg,image/png,image/webp" class="admin-visually-hidden" data-admin-slide-file>
                </div>
            </div>
        `;
    }

    function renderSlideCard(slide, index) {
        return `<div class="admin-slide-card" data-slide-id="${window.escapeHtml(slide.id)}">
            <div class="admin-slide-thumb">${slideMediaMarkup(slide)}<span class="admin-slide-badge">Slide ${index + 1}</span></div>
            <div class="admin-slide-body">
                <strong>${window.escapeHtml(slide.title || 'Untitled slide')}</strong>
                <span class="admin-slide-caption">${slide.is_published === false ? 'Draft' : 'Published'}</span>
                <button type="button" class="admin-btn-chip-primary" data-admin-slide-edit="${window.escapeHtml(slide.id)}">Edit slide</button>
            </div>
        </div>`;
    }

    const slideModal = document.querySelector('[data-admin-slide-modal]');
    const slideEditorRoot = document.querySelector('[data-admin-slide-editor]');
    const slideDialog = document.querySelector('[data-admin-slide-dialog]');

    function closeSlideEditor() {
        if (!slideModal) return;
        slideModal.removeAttribute('data-open');
        slideModal.hidden = true;
    }

    function openSlideEditor(slideId) {
        const index = currentSlides.findIndex((slide) => String(slide.id) === String(slideId));
        if (index < 0 || !slideModal || !slideEditorRoot) return;
        slideEditorRoot.innerHTML = renderSlideEditor(currentSlides[index], index, currentSlides.length);
        slideModal.hidden = false;
        slideModal.setAttribute('data-open', '');
        wireSlideCardActions(slideEditorRoot);
        slideDialog?.focus();
    }

    slideModal?.querySelectorAll('[data-admin-slide-modal-close]').forEach((button) => button.addEventListener('click', closeSlideEditor));
    slideModal?.addEventListener('click', (event) => { if (event.target === slideModal) closeSlideEditor(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && slideModal && !slideModal.hidden) closeSlideEditor(); });

    function renderSlides() {
        const slidesGrid = document.querySelector('[data-admin-slides]');
        if (!slidesGrid) return;

        slidesGrid.innerHTML = currentSlides.length
            ? currentSlides.map((slide, i) => renderSlideCard(slide, i, currentSlides.length)).join('')
            : '<p style="color: var(--color-ink-faint); padding: 8px 4px;">No slides yet — add one above.</p>';
        slidesGrid.querySelectorAll('[data-admin-slide-edit]').forEach((button) => {
            button.addEventListener('click', () => openSlideEditor(button.dataset.adminSlideEdit));
        });

        const subEl = document.querySelector('[data-admin-slides-sub]');
        if (subEl) subEl.textContent = `${currentSlides.length} slide${currentSlides.length === 1 ? '' : 's'}`;
    }

    async function loadSlides() {
        const slidesGrid = document.querySelector('[data-admin-slides]');
        if (!slidesGrid || !window.sb) return;

        const { data, error } = await window.sb
            .from('event')
            .select('id, sport_id, tag, title, meta, event_date, image_url, display_order, is_published, created_at')
            .order('display_order', { ascending: true })
            .order('created_at', { ascending: true });

        if (error) {
            console.error('[admin] failed to load slides', error);
            slidesGrid.innerHTML = isSchemaMismatchError(error)
                ? '<p style="color: var(--color-ink-faint); padding: 8px 4px;">This needs a database update that hasn\'t been applied yet.</p>'
                : '<p style="color: var(--color-ink-faint); padding: 8px 4px;">Could not load slides. Please try again.</p>';
            return;
        }

        currentSlides = data || [];
        renderSlides();
    }

    function wireSlideCardActions(scope) {
        scope.querySelectorAll('[data-admin-slide]').forEach((card) => {
            const slideId = card.dataset.slideId;
            const slide = currentSlides.find((s) => String(s.id) === String(slideId));
            if (!slide || !window.sb) return;

            // Text fields save on blur (single-row update) — Title is
            // required (the `event.title` column is NOT NULL); an empty
            // Title reverts to the last-saved value instead of attempting
            // a write that would fail the NOT NULL constraint anyway.
            const titleInput = card.querySelector('[data-admin-slide-title]');
            if (titleInput) {
                titleInput.addEventListener('blur', async () => {
                    const value = titleInput.value.trim();
                    if (!value) {
                        window.InigoToast?.show('Title is required.', true);
                        titleInput.value = slide.title || '';
                        return;
                    }
                    if (value === (slide.title || '')) return;
                    const { error } = await window.sb.from('event').update({ title: value }).eq('id', slideId);
                    if (error) {
                        window.InigoToast?.show(error.message || 'Could not save the title.', true);
                        titleInput.value = slide.title || '';
                        return;
                    }
                    slide.title = value;
                    recordOwnerActivity(`Updated slideshow slide: ${value}`, 'media');
                });
            }

            const captionInput = card.querySelector('[data-admin-slide-caption]');
            if (captionInput) {
                captionInput.addEventListener('blur', async () => {
                    const value = captionInput.value.trim();
                    if (value === (slide.meta || '')) return;
                    const { error } = await window.sb.from('event').update({ meta: value || null }).eq('id', slideId);
                    if (error) {
                        window.InigoToast?.show(error.message || 'Could not save the caption.', true);
                        captionInput.value = slide.meta || '';
                        return;
                    }
                    slide.meta = value || null;
                    recordOwnerActivity(`Updated slideshow caption: ${slide.title || 'Slide'}`, 'media');
                });
            }

            const tagInput = card.querySelector('[data-admin-slide-tag]');
            if (tagInput) {
                tagInput.addEventListener('blur', async () => {
                    const value = tagInput.value.trim();
                    if (value === (slide.tag || '')) return;
                    const { error } = await window.sb.from('event').update({ tag: value || null }).eq('id', slideId);
                    if (error) {
                        window.InigoToast?.show(error.message || 'Could not save the tag.', true);
                        tagInput.value = slide.tag || '';
                        return;
                    }
                    slide.tag = value || null;
                    recordOwnerActivity(`Updated slideshow tag: ${slide.title || 'Slide'}`, 'media');
                });
            }

            const publishBtn = card.querySelector('[data-admin-slide-publish]');
            if (publishBtn) {
                publishBtn.addEventListener('click', async () => {
                    const next = !publishBtn.classList.contains('is-on');
                    publishBtn.disabled = true;
                    const { error } = await window.sb.from('event').update({ is_published: next }).eq('id', slideId);
                    publishBtn.disabled = false;
                    if (error) {
                        window.InigoToast?.show(error.message || 'Could not update the publish state.', true);
                        return;
                    }
                    slide.is_published = next;
                    publishBtn.classList.toggle('is-on', next);
                    publishBtn.setAttribute('aria-pressed', String(next));
                    window.InigoToast?.show(next ? 'Slide published.' : 'Slide unpublished.');
                    recordOwnerActivity(`${next ? 'Published' : 'Unpublished'} slideshow slide: ${slide.title || 'Slide'}`, 'media');
                });
            }

            const replaceBtn = card.querySelector('[data-admin-slide-replace]');
            const fileInput = card.querySelector('[data-admin-slide-file]');
            if (replaceBtn && fileInput) {
                replaceBtn.addEventListener('click', () => fileInput.click());
                fileInput.addEventListener('change', async () => {
                    const file = fileInput.files && fileInput.files[0];
                    fileInput.value = '';
                    if (!file || !window.InigoImageTools) return;

                    const originalLabel = replaceBtn.textContent;
                    replaceBtn.disabled = true;
                    replaceBtn.textContent = 'Uploading…';
                    try {
                        const blob = await window.InigoImageTools.downscaleImageToBlob(file, { maxW: 1600, maxH: 900, quality: 0.85 });
                        const path = `slides/${slideId}-${Date.now()}.jpg`;
                        const url = await uploadToMedia(path, blob);
                        const { error } = await window.sb.from('event').update({ image_url: url }).eq('id', slideId);
                        if (error) throw error;
                        const oldUrl = slide.image_url;
                        slide.image_url = url;
                        removeUploadedMediaBestEffort(oldUrl);
                        renderSlides();
                        window.InigoToast?.show('Photo updated.');
                        recordOwnerActivity(`Updated slideshow photo: ${slide.title || 'Slide'}`, 'media');
                    } catch (err) {
                        window.InigoToast?.show(err.message || 'Could not upload that image.', true);
                        replaceBtn.disabled = false;
                        replaceBtn.textContent = originalLabel;
                    }
                });
            }

            const removeBtn = card.querySelector('[data-admin-slide-remove]');
            if (removeBtn) {
                removeBtn.addEventListener('click', async () => {
                    if (!window.confirm('Remove this slide? This cannot be undone.')) return;
                    removeBtn.disabled = true;
                    const { error } = await window.sb.from('event').delete().eq('id', slideId);
                    removeBtn.disabled = false;
                    if (error) {
                        window.InigoToast?.show(error.message || 'Could not remove this slide.', true);
                        return;
                    }
                    removeUploadedMediaBestEffort(slide.image_url);
                    window.InigoToast?.show('Slide removed.');
                    recordOwnerActivity(`Removed slideshow slide: ${slide.title || 'Slide'}`, 'media');
                    closeSlideEditor();
                    loadSlides();
                });
            }

            const moveUpBtn = card.querySelector('[data-admin-slide-move-up]');
            if (moveUpBtn) moveUpBtn.addEventListener('click', () => moveSlide(slideId, -1));
            const moveDownBtn = card.querySelector('[data-admin-slide-move-down]');
            if (moveDownBtn) moveDownBtn.addEventListener('click', () => moveSlide(slideId, 1));
        });
    }

    // W3 (Revision A1 fix) — true when two-or-more slides in the
    // last-fetched array already share the same display_order (seen with
    // data that predates ordering being enforced, e.g. several rows all at
    // 0). Swapping two EQUAL values is a silent no-op: each row is written
    // back the exact value it already had, so Move up/down does nothing
    // and gives no error either.
    function hasDuplicateDisplayOrder(slides) {
        const seen = new Set();
        for (const slide of slides) {
            if (seen.has(slide.display_order)) return true;
            seen.add(slide.display_order);
        }
        return false;
    }

    // Swaps display_order with the slide immediately before/after it in the
    // last-fetched (already display_order-sorted) array, then reloads —
    // simpler and safer than renumbering the whole list, and immune to any
    // gaps already present in display_order.
    async function moveSlide(slideId, direction) {
        if (!window.sb) return;
        const index = currentSlides.findIndex((s) => String(s.id) === String(slideId));
        const targetIndex = index + direction;
        if (index === -1 || targetIndex < 0 || targetIndex >= currentSlides.length) return;

        let a = currentSlides[index];
        let b = currentSlides[targetIndex];

        // W3 (Revision A1 fix) — the pair being swapped shares a value, OR
        // a duplicate exists elsewhere in the list (left alone, that
        // duplicate would just relocate this same bug to a future move
        // instead of fixing it now). Renumber the WHOLE list to its
        // current, already display_order-sorted array positions first (one
        // `update` per row via Promise.all) so every value is unique, then
        // re-read the fresh values below before doing the actual swap.
        if (a.display_order === b.display_order || hasDuplicateDisplayOrder(currentSlides)) {
            const renumberResults = await Promise.all(currentSlides.map((slide, i) =>
                window.sb.from('event').update({ display_order: i + 1 }).eq('id', slide.id)
            ));
            const renumberFailure = renumberResults.find((r) => r.error);
            if (renumberFailure) {
                window.InigoToast?.show(renumberFailure.error.message || 'Could not reorder slides.', true);
                return;
            }
            currentSlides.forEach((slide, i) => { slide.display_order = i + 1; });
            a = currentSlides[index];
            b = currentSlides[targetIndex];
        }

        const [{ error: err1 }, { error: err2 }] = await Promise.all([
            window.sb.from('event').update({ display_order: b.display_order }).eq('id', a.id),
            window.sb.from('event').update({ display_order: a.display_order }).eq('id', b.id),
        ]);

        if (err1 || err2) {
            window.InigoToast?.show((err1 || err2).message || 'Could not reorder slides.', true);
            return;
        }
        closeSlideEditor();
        recordOwnerActivity(`Reordered slideshow slide: ${a.title || 'Slide'}`, 'media');
        loadSlides();
    }

    const addSlideBtn = document.querySelector('[data-admin-slide-add]');
    if (addSlideBtn) {
        addSlideBtn.addEventListener('click', async () => {
            if (!window.sb) return;

            const maxOrder = currentSlides.reduce((max, s) => Math.max(max, Number(s.display_order) || 0), 0);
            addSlideBtn.disabled = true;
            // W1 (Revision A1 fix) — event.is_published defaults to true at
            // the DB level, so a bare insert here went live on the public
            // landing page/customer dashboard the instant this button was
            // clicked, before the admin ever typed a title or picked a
            // photo. Explicit is_published: false keeps the placeholder
            // staged (renderSlideCard's Published toggle already reads
            // Off for any slide whose is_published is exactly false) until
            // the admin turns it on deliberately via that same toggle.
            const { data: created, error } = await window.sb.from('event')
                .insert({ title: 'New slide', display_order: maxOrder + 1, is_published: false })
                .select('id').single();
            addSlideBtn.disabled = false;

            if (error) {
                window.InigoToast?.show(
                    isSchemaMismatchError(error)
                        ? "This needs a database update that hasn't been applied yet."
                        : (error.message || 'Could not add a new slide.'),
                    true
                );
                return;
            }
            window.InigoToast?.show('Slide added as a draft.');
            recordOwnerActivity('Added a slideshow draft', 'media');
            await loadSlides();
            if (created?.id) openSlideEditor(created.id);
        });
    }

    loadSlides();

    // ------------------------------------------------------------------
    // Owner-only activity notifications: staff, court, slideshow, and profile changes.
    // ------------------------------------------------------------------
    const adminNotif = document.querySelector('[data-admin-notif]');
    const adminNotifTrigger = document.querySelector('[data-admin-notif-trigger]');
    const adminNotifList = document.querySelector('[data-admin-notif-list]');
    const adminNotifDot = document.querySelector('[data-admin-notif-dot]');
    const adminNotifMarkAll = document.querySelector('[data-admin-notif-mark-all]');
    const ADMIN_NOTIF_REFRESH_MS = 15000;

    function closeAdminNotifMenu() {
        if (adminNotif) adminNotif.removeAttribute('data-open');
        if (adminNotifTrigger) adminNotifTrigger.setAttribute('aria-expanded', 'false');
    }

    if (adminNotifTrigger && adminNotif) {
        adminNotifTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = adminNotif.hasAttribute('data-open');
            closeProfileMenu();
            if (isOpen) {
                closeAdminNotifMenu();
            } else {
                adminNotif.setAttribute('data-open', '');
                adminNotifTrigger.setAttribute('aria-expanded', 'true');
            }
        });

        document.addEventListener('click', (e) => {
            if (!adminNotif.contains(e.target)) closeAdminNotifMenu();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeAdminNotifMenu();
        });
    }

    async function recordOwnerActivity(title, targetSection) {
        const ownerId = window.inigosyncProfile?.id;
        if (!ownerId || !window.sb) return;
        const { error } = await window.sb.from('owner_activity').insert({
            owner_id: ownerId, title, target_section: targetSection,
        });
        if (error) {
            console.error('[admin] could not record owner activity', error);
            return;
        }
        refreshOwnerActivityNotifications();
    }

    async function refreshOwnerActivityNotifications() {
        if (!adminNotifList || !window.sb || !window.inigosyncProfile?.id) return;
        const { data, error } = await window.sb.from('owner_activity')
            .select('id,title,target_section,created_at,seen_at')
            .eq('owner_id', window.inigosyncProfile.id)
            .order('created_at', { ascending: false })
            .limit(30);
        if (error) {
            console.error('[admin] owner notifications unavailable', error);
            adminNotifList.innerHTML = '<p class="admin-notif-empty">Could not load notifications.</p>';
            return;
        }
        const items = data || [];
        adminNotifList.innerHTML = items.length
            ? items.map((item) => '<button type="button" class="admin-notif-item' + (item.seen_at ? ' is-seen' : '') + '" data-owner-activity-id="' + window.escapeHtml(item.id) + '" data-owner-activity-section="' + window.escapeHtml(item.target_section) + '"><span class="admin-notif-dot pending" aria-hidden="true"></span><span class="admin-notif-item-body"><strong>' + window.escapeHtml(item.title) + '</strong><span>' + window.escapeHtml(new Date(item.created_at).toLocaleString()) + (item.seen_at ? ' · Seen' : ' · New') + '</span></span></button>').join('')
            : '<p class="admin-notif-empty">No owner activity yet.</p>';
        const unread = items.filter((item) => !item.seen_at);
        if (adminNotifDot) adminNotifDot.hidden = unread.length === 0;
        if (adminNotifMarkAll) adminNotifMarkAll.disabled = unread.length === 0;
    }

    adminNotifList?.addEventListener('click', async (event) => {
        const item = event.target.closest('[data-owner-activity-id]');
        if (!item || !window.sb) return;
        const { error } = await window.sb.from('owner_activity')
            .update({ seen_at: new Date().toISOString() })
            .eq('id', item.dataset.ownerActivityId)
            .eq('owner_id', window.inigosyncProfile.id);
        if (error) {
            window.InigoToast?.show('Could not mark this notification as seen.', true);
            return;
        }
        closeAdminNotifMenu();
        setActivePanel(item.dataset.ownerActivitySection);
        refreshOwnerActivityNotifications();
    });

    adminNotifMarkAll?.addEventListener('click', async () => {
        if (!window.sb || !window.inigosyncProfile?.id) return;
        adminNotifMarkAll.disabled = true;
        const { error } = await window.sb.from('owner_activity')
            .update({ seen_at: new Date().toISOString() })
            .eq('owner_id', window.inigosyncProfile.id)
            .is('seen_at', null);
        if (error) window.InigoToast?.show('Could not mark notifications as seen.', true);
        refreshOwnerActivityNotifications();
    });

    refreshOwnerActivityNotifications();
    document.addEventListener('inigosync:profile-ready', refreshOwnerActivityNotifications);
    window.setInterval(refreshOwnerActivityNotifications, ADMIN_NOTIF_REFRESH_MS);

    // ------------------------------------------------------------------
    // Account Settings — password visibility toggles
    // ------------------------------------------------------------------
    document.querySelectorAll('[data-admin-toggle-password]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const input = btn.previousElementSibling;
            if (!input) return;
            const isHidden = input.type === 'password';
            input.type = isHidden ? 'text' : 'password';
            btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
        });
    });

    // ------------------------------------------------------------------
    // Account Settings — avatar upload/remove (Revision A1, decision A9).
    // Same pipeline as the customer dashboard's Profile Photo card
    // (Pages/user_dashboard.html, includes/Dashboard.js), via the shared
    // includes/imageTools.js: a 256×256 center-cropped JPEG data URL
    // written straight into profiles.avatar_url — no Storage bucket needed
    // for avatars (only Media Manager/Court photos use Storage).
    // ------------------------------------------------------------------
    const AVATAR_MAX_RAW_BYTES = 5 * 1024 * 1024;
    const AVATAR_OUTPUT_SIZE = 256;
    const AVATAR_JPEG_QUALITY = 0.82;

    const adminAvatarFileInput = document.querySelector('[data-admin-avatar-file]');
    const adminAvatarUploadBtn = document.querySelector('[data-admin-avatar-upload-trigger]');
    const adminAvatarRemoveBtn = document.querySelector('[data-admin-avatar-remove]');
    const adminAvatarSaveBtn = document.querySelector('[data-admin-avatar-save]');
    const adminAvatarModal = document.querySelector('[data-admin-avatar-modal]');
    let stagedAvatarUrl;

    document.querySelector('[data-admin-profile-edit]')?.addEventListener('click', () => {
        paintOwnerDetails(window.inigosyncProfile || {});
        const modal = document.querySelector('[data-admin-settings-profile-modal]');
        if (modal) modal.hidden = false;
        refreshLinkedGoogleEmails();
    });
    document.querySelector('[data-admin-avatar-edit]')?.addEventListener('click', () => {
        stagedAvatarUrl = window.inigosyncProfile?.avatar_url || null;
        renderAdminProfile(window.inigosyncProfile || {});
        if (adminAvatarRemoveBtn) adminAvatarRemoveBtn.hidden = !stagedAvatarUrl;
        if (adminAvatarModal) adminAvatarModal.hidden = false;
    });
    document.querySelectorAll('[data-admin-settings-cancel="profile"], [data-admin-avatar-cancel]').forEach((button) => {
        button.addEventListener('click', () => {
            const modal = button.closest('.admin-modal-overlay');
            if (modal) modal.hidden = true;
            if (button.hasAttribute('data-admin-avatar-cancel')) renderAdminProfile(window.inigosyncProfile || {});
        });
    });

    async function saveAdminAvatarUrl(avatarUrl) {
        if (!window.sb || !window.inigosyncProfile) {
            window.InigoToast?.show('Unable to reach the server right now. Please try again shortly.', true);
            return false;
        }
        const { error } = await window.sb.from('profiles').update({ avatar_url: avatarUrl }).eq('id', window.inigosyncProfile.id);
        if (error) {
            console.error('[admin] avatar_url update failed', error);
            window.InigoToast?.show(error.message || 'Could not save your photo. Please try again.', true);
            return false;
        }
        window.inigosyncProfile.avatar_url = avatarUrl;
        renderAdminProfile(window.inigosyncProfile);
        recordOwnerActivity(avatarUrl ? 'Owner profile photo updated' : 'Owner profile photo removed', 'settings');
        return true;
    }

    if (adminAvatarUploadBtn && adminAvatarFileInput) {
        adminAvatarUploadBtn.addEventListener('click', () => adminAvatarFileInput.click());
    }

    if (adminAvatarFileInput) {
        adminAvatarFileInput.addEventListener('change', async () => {
            const file = adminAvatarFileInput.files && adminAvatarFileInput.files[0];
            adminAvatarFileInput.value = '';
            if (!file) return;

            if (!file.type || !file.type.startsWith('image/')) {
                window.InigoToast?.show('Please choose an image file.', true);
                return;
            }
            if (file.size > AVATAR_MAX_RAW_BYTES) {
                window.InigoToast?.show('That image is too large — please choose one under 5 MB.', true);
                return;
            }
            if (!window.InigoImageTools) return;

            const originalLabel = adminAvatarUploadBtn.textContent;
            adminAvatarUploadBtn.disabled = true;
            adminAvatarUploadBtn.textContent = 'Uploading…';

            try {
                const dataUrl = await window.InigoImageTools.downscaleImageToDataUrl(file, { size: AVATAR_OUTPUT_SIZE, quality: AVATAR_JPEG_QUALITY });
                stagedAvatarUrl = dataUrl;
                const preview = document.querySelector('.admin-avatar-upload-preview');
                if (preview) preview.innerHTML = `<img class="admin-avatar-img" src="${window.escapeHtml(dataUrl)}" alt="Profile photo preview">`;
                if (adminAvatarRemoveBtn) adminAvatarRemoveBtn.hidden = false;
            } catch (err) {
                console.error('[admin] avatar downscale failed', err);
                window.InigoToast?.show('Could not process that image. Please try a different file.', true);
            } finally {
                adminAvatarUploadBtn.disabled = false;
                adminAvatarUploadBtn.textContent = originalLabel;
            }
        });
    }

    adminAvatarRemoveBtn?.addEventListener('click', () => {
        stagedAvatarUrl = null;
        const preview = document.querySelector('.admin-avatar-upload-preview');
        if (preview) preview.textContent = (window.inigosyncProfile?.full_name || 'Owner').split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
        adminAvatarRemoveBtn.hidden = true;
    });
    adminAvatarSaveBtn?.addEventListener('click', async () => {
        adminAvatarSaveBtn.disabled = true;
        const ok = await saveAdminAvatarUrl(stagedAvatarUrl);
        adminAvatarSaveBtn.disabled = false;
        if (ok) {
            if (adminAvatarModal) adminAvatarModal.hidden = true;
            window.InigoToast?.show(stagedAvatarUrl ? 'Profile photo updated.' : 'Profile photo removed.');
        }
    });

    // Owner Profile — prefill from the real signed-in profile. Revision A1,
    // decision A8 — the ONE place that paints every .admin-avatar (topbar,
    // Settings' profile card, Settings' own upload preview): an <img> when
    // avatar_url is set, initials otherwise (unchanged default look/
    // behaviour). Decision A9 — Personal Information's name/email inputs
    // are addressed by their own data-admin-settings-* hooks now, rather
    // than positional NodeList indexing (fragile after the old "Username"
    // placeholder field was removed).
    // S2 (Revision A1 fix) — small "pending confirmation" hint painted next
    // to the email field, created once here (lazily, on first call) rather
    // than in Pages/owner_dashboard.html — this fix pass is scoped to this
    // file. Reuses the already-styled .admin-form-hint class instead of a
    // new one this pass has no matching CSS change for.
    // `options.skipEmailRepaint` — S2 (Revision A1 fix). A successful
    // sb.auth.updateUser({ email }) does NOT change window.inigosyncProfile
    // (see the Personal Information save handler below — profiles.email
    // only follows a CONFIRMED change), so the default repaint below used
    // to immediately overwrite whatever the admin just typed back to the
    // old address, as if the save had silently failed. The one call right
    // after that specific save passes skipEmailRepaint: true to leave the
    // typed value in place and show the pending-confirmation hint instead;
    // every other call site (initial load, Cancel, a real profile change)
    // omits it, so those still correctly repaint/revert the field.
    function renderAdminProfile(profile) {
        const initials = (profile.full_name || profile.email || '?')
            .split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

        const avatarUrl = profile.avatar_url || null;
        document.querySelectorAll('.admin-avatar').forEach((el) => {
            if (avatarUrl) {
                el.innerHTML = `<img class="admin-avatar-img" src="${window.escapeHtml(avatarUrl)}" alt="Profile photo">`;
            } else {
                el.textContent = initials;
            }
        });
        if (adminAvatarRemoveBtn) adminAvatarRemoveBtn.hidden = !avatarUrl;

        document.querySelectorAll('[data-admin-profile-name]').forEach((el) => { el.textContent = profile.full_name || 'Owner'; });

        const cardInfo = document.querySelector('[data-admin-panel="settings"] .admin-profile-card-info h3');
        if (cardInfo) cardInfo.textContent = profile.full_name || 'Owner';

        const nameInput = document.querySelector('[data-admin-settings-name]');
        const emailInput = document.querySelector('[data-admin-settings-email]');
        if (nameInput) nameInput.value = profile.full_name || '';
        if (emailInput) emailInput.textContent = profile.email || '—';
        const fullNameEl = document.querySelector('[data-admin-profile-full-name]');
        if (fullNameEl) fullNameEl.textContent = profile.full_name || '—';

        // Revision A2, decision B2 — the Profile panel's Email/Mobile
        // definition-list rows. authGuard.js's own profiles select already
        // includes contact_num (unlike created_at — see
        // loadAdminProfileMemberSince() below for that one), so no extra
        // fetch is needed for either of these two.
        const profileEmailEl = document.querySelector('[data-admin-profile-email]');
        if (profileEmailEl) profileEmailEl.textContent = profile.email || '—';
        const profileMobileEl = document.querySelector('[data-admin-profile-mobile]');
        if (profileMobileEl) profileMobileEl.textContent = profile.contact_num || '—';
        const birthdateEl = document.querySelector('[data-admin-profile-birthdate]');
        if (birthdateEl) birthdateEl.textContent = profile.birthdate || '—';
    }

    function paintOwnerDetails(profile) {
        const fields = [
            ['[data-admin-settings-mobile]', profile.contact_num || ''],
            ['[data-admin-settings-address]', profile.address || ''],
            ['[data-admin-settings-birthdate]', profile.birthdate || ''],
            ['[data-admin-settings-gender]', profile.gender || ''],
        ];
        fields.forEach(([selector, value]) => {
            const field = document.querySelector(selector);
            if (field) field.value = value;
        });
        const values = [
            ['[data-admin-profile-address]', profile.address || '—'],
            ['[data-admin-profile-age]', computeAdminStaffAge(profile.birthdate) === null ? '—' : `${computeAdminStaffAge(profile.birthdate)} years old`],
            ['[data-admin-profile-gender]', profile.gender || '—'],
            ['[data-admin-profile-birthdate]', profile.birthdate || '—'],
        ];
        values.forEach(([selector, value]) => {
            const target = document.querySelector(selector);
            if (target) target.textContent = value;
        });
    }

    document.addEventListener('inigosync:profile-ready', (e) => renderAdminProfile(e.detail));
    if (window.inigosyncProfile) renderAdminProfile(window.inigosyncProfile);

    // ------------------------------------------------------------------
    // Profile panel — "Member since" (Revision A2, decision B2).
    // authGuard.js selects a fixed column list from `profiles` that does
    // NOT include created_at (see its own header comment), so this is a
    // small, separate, tolerate-failure fetch — same "—" not-loaded-yet
    // convention as every other placeholder on this page, never a fake
    // date.
    // ------------------------------------------------------------------
    function formatAdminMemberSince(createdAt) {
        const d = new Date(createdAt);
        if (!createdAt || Number.isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    let ownerDetailsLoaded = false;
    async function loadAdminProfileMemberSince() {
        const el = document.querySelector('[data-admin-profile-member-since]');
        if (!el || !window.sb || !window.inigosyncProfile) return;
        const { data, error } = await window.sb
            .from('profiles')
            .select('created_at, contact_num, address, birthdate, gender')
            .eq('id', window.inigosyncProfile.id)
            .single();
        el.textContent = (!error && data) ? formatAdminMemberSince(data.created_at) : '—';
        if (!error && data) {
            Object.assign(window.inigosyncProfile, data);
            ownerDetailsLoaded = true;
            paintOwnerDetails(window.inigosyncProfile);
            renderAdminProfile(window.inigosyncProfile);
        }
    }

    document.addEventListener('inigosync:profile-ready', loadAdminProfileMemberSince);
    if (window.inigosyncProfile) loadAdminProfileMemberSince();

    // ------------------------------------------------------------------
    // Account Settings — Personal Information save (Revision A1, decision
    // A9). Full name saves straight to profiles.full_name, unchanged. Email
    // is NEW: sb.auth.updateUser({ email }) sends a confirmation link to
    // the new address — profiles.email is deliberately NOT written here;
    // it only follows once Supabase actually confirms the change (see the
    // onAuthStateChange/session-sync block below), so the app never shows
    // an email as "saved" before it truly is.
    // ------------------------------------------------------------------
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const adminProfileSaveBtn = document.querySelector('[data-admin-settings-save="profile"]');
    if (adminProfileSaveBtn) {
        adminProfileSaveBtn.addEventListener('click', async () => {
            if (!window.sb || !window.inigosyncProfile) return;

            const nameInput = document.querySelector('[data-admin-settings-name]');
            const mobileInput = document.querySelector('[data-admin-settings-mobile]');
            const addressInput = document.querySelector('[data-admin-settings-address]');
            const birthdateInput = document.querySelector('[data-admin-settings-birthdate]');
            const genderInput = document.querySelector('[data-admin-settings-gender]');
            const newName = nameInput ? nameInput.value.trim() : '';
            const mobileRaw = mobileInput ? mobileInput.value.trim() : '';
            const address = addressInput ? addressInput.value.trim() : '';
            const birthdate = birthdateInput?.value || null;
            const gender = genderInput?.value || '';

            if (!ownerDetailsLoaded) {
                window.InigoToast?.show('Account details are still loading. Please try again.', true);
                return;
            }
            const mobileCheck = mobileRaw && window.validatePhMobile
                ? window.validatePhMobile(mobileRaw)
                : { valid: !mobileRaw, normalized: '' };
            if (!mobileCheck.valid) {
                window.InigoToast?.show(mobileCheck.message || 'Enter a valid mobile number.', true);
                mobileInput?.focus();
                return;
            }
            const contact_num = mobileRaw ? mobileCheck.normalized : '';
            if (birthdate && birthdate > todayDateInputValue()) {
                window.InigoToast?.show('Date of birth cannot be in the future.', true);
                birthdateInput?.focus();
                return;
            }

            if (!newName) {
                window.InigoToast?.show('Enter your full name.', true);
                nameInput?.focus();
                return;
            }
            const nameChanged = newName !== (window.inigosyncProfile.full_name || '');
            const detailsChanged = contact_num !== (window.inigosyncProfile.contact_num || '')
                || address !== (window.inigosyncProfile.address || '')
                || birthdate !== (window.inigosyncProfile.birthdate || null)
                || gender !== (window.inigosyncProfile.gender || '');
            if (!nameChanged && !detailsChanged) {
                window.InigoToast?.show('Nothing to save.');
                return;
            }

            adminProfileSaveBtn.disabled = true;
            try {
                if (nameChanged || detailsChanged) {
                    const { error } = await window.sb.from('profiles').update({
                        full_name: newName, contact_num, address, birthdate, gender,
                    }).eq('id', window.inigosyncProfile.id);
                    if (error) throw error;
                    Object.assign(window.inigosyncProfile, { full_name: newName, contact_num, address, birthdate, gender });
                }

                renderAdminProfile(window.inigosyncProfile);
                paintOwnerDetails(window.inigosyncProfile);
                recordOwnerActivity('Owner profile updated', 'settings');
                window.InigoToast?.show('Profile updated.');
                document.querySelector('[data-admin-settings-profile-modal]')?.setAttribute('hidden', '');
            } catch (err) {
                window.InigoToast?.show(err.message || 'Could not save your changes.', true);
            } finally {
                adminProfileSaveBtn.disabled = false;
            }
        });
    }

    // ------------------------------------------------------------------
    async function refreshLinkedGoogleEmails() {
        const root = document.querySelector('[data-admin-linked-google-emails]');
        if (!root || !window.sb || !window.inigosyncProfile) return;
        const { data, error } = await window.sb.auth.getUser();
        if (error || !data?.user) {
            root.textContent = 'Could not load linked Google accounts.';
            return;
        }
        const emails = (data.user.identities || [])
            .filter((identity) => identity.provider === 'google')
            .map((identity) => identity.identity_data?.email)
            .filter(Boolean);
        root.innerHTML = emails.length
            ? emails.map((email) => `<p class="admin-form-hint">✓ ${window.escapeHtml(email)} · Google verified</p>`).join('')
            : '<p class="admin-form-hint">No additional Google account linked yet.</p>';
    }

    document.querySelector('[data-admin-link-google]')?.addEventListener('click', async (event) => {
        if (!window.sb || !window.inigosyncProfile) return;
        const button = event.currentTarget;
        button.disabled = true;
        const { error } = await window.sb.auth.linkIdentity({
            provider: 'google',
            options: { redirectTo: new URL('owner_dashboard.html', window.location.href).href },
        });
        if (error) {
            button.disabled = false;
            window.InigoToast?.show(error.message || 'Could not start Google account verification.', true);
        }
    });
    document.addEventListener('inigosync:profile-ready', refreshLinkedGoogleEmails);
    if (window.inigosyncProfile) refreshLinkedGoogleEmails();

    // Email confirmation → profiles.email sync (Revision A1, decision A9).
    // profiles.email only ever follows the AUTH session's confirmed email,
    // never the other way around. Checked two ways so this is correct
    // regardless of load-order races between this file and
    // includes/authGuard.js's own async profile fetch:
    //   1. On every 'inigosync:profile-ready' (i.e. once window.inigosyncProfile
    //      is guaranteed set) — re-reads the CURRENT session and syncs if
    //      it's already ahead of profiles.email (covers "on load", including
    //      a confirmation clicked in a previous visit).
    //   2. Live, via onAuthStateChange — covers a confirmation link clicked
    //      DURING this session (Supabase's auth client broadcasts session
    //      changes across tabs in the same browser).
    // ------------------------------------------------------------------
    function syncConfirmedAdminEmail(sessionEmail) {
        if (!sessionEmail || !window.sb || !window.inigosyncProfile) return;
        if (sessionEmail === window.inigosyncProfile.email) return;

        window.sb.from('profiles').update({ email: sessionEmail }).eq('id', window.inigosyncProfile.id).then(({ error }) => {
            if (error) {
                console.error('[admin] failed to sync confirmed email to profiles', error);
                return;
            }
            window.inigosyncProfile.email = sessionEmail;
            renderAdminProfile(window.inigosyncProfile);
        });
    }

    document.addEventListener('inigosync:profile-ready', () => {
        window.sb?.auth.getSession().then(({ data }) => syncConfirmedAdminEmail(data?.session?.user?.email));
    });

    if (window.sb) {
        window.sb.auth.onAuthStateChange((event, session) => {
            if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
                syncConfirmedAdminEmail(session?.user?.email);
            }
        });
    }

    // ------------------------------------------------------------------
    // Change Password — 2-step wizard (Revision A1, decision A9), ported
    // from the customer dashboard's own (includes/Dashboard.js) under
    // data-admin-pw-* names. Step 1 collects only the current password
    // (Next disabled until non-empty); Step 2 collects the new password
    // twice, with a minimum length + match check this file adds on top of
    // the customer version (Supabase's own server-side minimum still
    // applies regardless). Re-verifies the current password via
    // signInWithPassword() before calling updateUser() — unchanged
    // reasoning from the single-form version this replaces.
    // ------------------------------------------------------------------
    const ADMIN_PW_MIN_LENGTH = 8;
    const pwStepPanels = document.querySelectorAll('[data-admin-pw-step]');
    const pwStepIndicators = document.querySelectorAll('[data-admin-pw-step-indicator]');
    const pwBackBtn = document.querySelector('[data-admin-pw-back]');
    const pwNextBtn = document.querySelector('[data-admin-pw-next]');
    const adminPasswordSaveBtn = document.querySelector('[data-admin-settings-save="password"]');
    const pwCurrentInput = document.querySelector('[data-admin-pw-current]');
    const pwNewInput = document.querySelector('[data-admin-pw-new]');
    const pwConfirmInput = document.querySelector('[data-admin-pw-confirm]');

    let adminPwWizardStep = 1;

    function renderAdminPwWizard() {
        pwStepPanels.forEach((panel) => {
            panel.classList.toggle('is-active', Number(panel.dataset.adminPwStep) === adminPwWizardStep);
        });
        pwStepIndicators.forEach((el) => {
            const n = Number(el.dataset.adminPwStepIndicator);
            el.classList.toggle('is-current', n === adminPwWizardStep);
            el.classList.toggle('is-done', n < adminPwWizardStep);
            el.setAttribute('aria-current', n === adminPwWizardStep ? 'step' : 'false');
        });

        if (pwBackBtn) pwBackBtn.hidden = adminPwWizardStep !== 2;
        if (adminPasswordSaveBtn) adminPasswordSaveBtn.hidden = adminPwWizardStep !== 2;
        if (pwNextBtn) {
            pwNextBtn.hidden = adminPwWizardStep !== 1;
            pwNextBtn.disabled = !(pwCurrentInput && pwCurrentInput.value !== '');
        }
    }

    function goToAdminPwStep(step) {
        adminPwWizardStep = step === 2 ? 2 : 1;
        renderAdminPwWizard();
    }

    function resetAdminPwWizard() {
        [pwCurrentInput, pwNewInput, pwConfirmInput].forEach((input) => { if (input) input.value = ''; });
        goToAdminPwStep(1);
    }

    if (pwCurrentInput) pwCurrentInput.addEventListener('input', renderAdminPwWizard);
    if (pwNextBtn) {
        pwNextBtn.addEventListener('click', () => {
            if (pwNextBtn.disabled) return;
            goToAdminPwStep(2);
        });
    }
    if (pwBackBtn) pwBackBtn.addEventListener('click', () => goToAdminPwStep(1));

    // Establishes the correct initial hidden/disabled state for the nav
    // buttons (matching the `disabled`/`hidden` attributes already baked
    // into the markup as a no-JS baseline) and paints the step-1 indicator.
    renderAdminPwWizard();

    if (adminPasswordSaveBtn) {
        adminPasswordSaveBtn.addEventListener('click', async () => {
            if (!window.sb || !window.inigosyncProfile) return;
            const currentPassword = pwCurrentInput?.value;
            const newPassword = pwNewInput?.value;
            const confirmPassword = pwConfirmInput?.value;

            if (!currentPassword) {
                window.InigoToast?.show('Enter your current password.', true);
                goToAdminPwStep(1);
                return;
            }
            if (!newPassword || newPassword.length < ADMIN_PW_MIN_LENGTH) {
                window.InigoToast?.show(`New password must be at least ${ADMIN_PW_MIN_LENGTH} characters.`, true);
                return;
            }
            if (newPassword !== confirmPassword) {
                window.InigoToast?.show('Passwords do not match.', true);
                return;
            }

            adminPasswordSaveBtn.disabled = true;

            // S3 (Revision A1 fix) — re-verify against the AUTH session's
            // OWN current email first, falling back to profiles.email only
            // if no session email is available. profiles.email can lag a
            // just-confirmed email change (see syncConfirmedAdminEmail
            // above, and S2's own note on this same lag) or simply be
            // stale from before this session loaded; signInWithPassword()
            // against a stale address would fail with "Current password is
            // incorrect" even when the password typed is exactly right.
            const { data: pwSessionData } = await window.sb.auth.getSession();
            const verifyEmail = pwSessionData?.session?.user?.email || window.inigosyncProfile.email;

            // "Current password" re-verified via signInWithPassword() before
            // anything changes — Supabase has no separate "verify password"
            // call, and this confirms the person at the keyboard actually
            // knows it before the password is changed.
            const { error: verifyError } = await window.sb.auth.signInWithPassword({
                email: verifyEmail,
                password: currentPassword,
            });

            if (verifyError) {
                adminPasswordSaveBtn.disabled = false;
                window.InigoToast?.show('Current password is incorrect.', true);
                goToAdminPwStep(1);
                return;
            }

            const { error } = await window.sb.auth.updateUser({ password: newPassword });
            adminPasswordSaveBtn.disabled = false;

            if (error) {
                window.InigoToast?.show(error.message || 'Could not update your password.', true);
                return;
            }

            resetAdminPwWizard();
            window.InigoToast?.show('Password updated.');
            recordOwnerActivity('Owner password updated', 'settings');
        });
    }

    // ------------------------------------------------------------------
    // Account Settings — Cancel buttons. Profile discards in-progress edits
    // back to the last-saved values; Password resets the wizard to step 1
    // and clears every field (Revision A1, decision A9 — this button was
    // kept from the pre-wizard markup rather than dropped, since the
    // customer dashboard's own wizard has no exact equivalent to port).
    // ------------------------------------------------------------------
    document.querySelectorAll('[data-admin-settings-cancel]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.adminSettingsCancel;
            if (mode === 'profile') {
                if (window.inigosyncProfile) {
                    renderAdminProfile(window.inigosyncProfile);
                    paintOwnerDetails(window.inigosyncProfile);
                }
            } else if (mode === 'password') {
                resetAdminPwWizard();
            }
        });
    });

    // Owner review inbox reads only the privacy-safe view. Rating filters
    // and paging are server-side so every published booking review is
    // reachable without loading the entire table into the browser.
    const reviewList = document.querySelector('[data-admin-review-list]');
    const reviewSummary = document.querySelector('[data-admin-review-summary]');
    const reviewPager = document.querySelector('[data-admin-review-pagination]');
    let reviewRatingFilter = 'all';
    let reviewPage = 0;
    const REVIEW_PAGE_SIZE = 10;
    async function loadOwnerReviews() {
        if (!reviewList || !window.sb) return;
        reviewList.setAttribute('aria-busy', 'true');
        let query = window.sb.from('public_booking_reviews').select('id,display_name,rating,comment,created_at', { count: 'exact' })
            .order('created_at', { ascending: false }).range(reviewPage * REVIEW_PAGE_SIZE, (reviewPage + 1) * REVIEW_PAGE_SIZE - 1);
        if (reviewRatingFilter !== 'all') query = query.eq('rating', Number(reviewRatingFilter));
        const { data, count, error } = await query;
        reviewList.setAttribute('aria-busy', 'false');
        if (error) {
            reviewList.innerHTML = '<p class="admin-form-hint">Reviews could not be loaded. Check your owner access and try again.</p>';
            if (reviewSummary) reviewSummary.textContent = 'Review list unavailable';
            console.error('[admin] owner reviews query failed', error);
            return;
        }
        const total = count || 0;
        if (reviewSummary) reviewSummary.textContent = `${total} customer review${total === 1 ? '' : 's'}${reviewRatingFilter === 'all' ? '' : ` rated ${reviewRatingFilter} star${reviewRatingFilter === '1' ? '' : 's'}`}`;
        reviewList.innerHTML = data?.length ? data.map((review) => `<article class="admin-review-item"><div class="admin-review-item-head"><strong>${window.escapeHtml(review.display_name || 'Customer')}</strong><span aria-label="${Number(review.rating)} out of 5 stars">${'★'.repeat(Number(review.rating))}${'☆'.repeat(5 - Number(review.rating))}</span></div><p>${window.escapeHtml(review.comment || 'No written comment.')}</p><time datetime="${window.escapeHtml(review.created_at)}">${window.escapeHtml(new Date(review.created_at).toLocaleDateString())}</time></article>`).join('') : '<p class="admin-form-hint">No reviews for this rating yet.</p>';
        const pages = Math.max(1, Math.ceil(total / REVIEW_PAGE_SIZE));
        if (reviewPager) reviewPager.hidden = total <= REVIEW_PAGE_SIZE;
        const info = document.querySelector('[data-admin-review-page-info]');
        const prev = document.querySelector('[data-admin-review-prev]');
        const next = document.querySelector('[data-admin-review-next]');
        if (info) info.textContent = `Page ${reviewPage + 1} of ${pages}`;
        if (prev) prev.disabled = reviewPage <= 0;
        if (next) next.disabled = reviewPage + 1 >= pages;
    }
    document.querySelectorAll('[data-admin-review-rating]').forEach((button) => button.addEventListener('click', () => {
        reviewRatingFilter = button.dataset.adminReviewRating || 'all'; reviewPage = 0;
        document.querySelectorAll('[data-admin-review-rating]').forEach((item) => { item.classList.toggle('is-active', item === button); item.setAttribute('aria-pressed', String(item === button)); });
        loadOwnerReviews();
    }));
    document.querySelector('[data-admin-review-prev]')?.addEventListener('click', () => { if (reviewPage > 0) { reviewPage -= 1; loadOwnerReviews(); } });
    document.querySelector('[data-admin-review-next]')?.addEventListener('click', () => { reviewPage += 1; loadOwnerReviews(); });
    document.addEventListener('inigosync:profile-ready', loadOwnerReviews);
    if (window.inigosyncProfile) loadOwnerReviews();
});
