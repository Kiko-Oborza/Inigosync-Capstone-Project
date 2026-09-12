// IñigoSync — Owner Dashboard controller
// Staff Management, Account Settings, Court Listings, the Booking Overview
// stat tiles/Recent bookings/Booking status breakdown, Media Manager, and
// Payment Configuration all talk to the real Supabase database.
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

document.addEventListener('DOMContentLoaded', () => {
    // ------------------------------------------------------------------
    // Panel switching (sidebar + topbar/profile shortcuts)
    // ------------------------------------------------------------------
    const panels = document.querySelectorAll('[data-admin-panel]');
    const titleEl = document.querySelector('[data-admin-title]');
    const subtitleEl = document.querySelector('[data-admin-subtitle]');

    const panelMeta = {
        overview: { title: 'Booking Overview', subtitle: 'Reservation trends, staff activity, and business performance at a glance.' },
        staff: { title: 'Staff Management', subtitle: 'Add, update, or remove staff accounts and configure payment settings.' },
        courts: { title: 'Court Listings', subtitle: 'Add new courts, update details, or activate/deactivate existing ones.' },
        media: { title: 'Media Manager', subtitle: "Whatever you upload here shows up on the website's home featured slideshow — both the landing page and the customer dashboard." },
        settings: { title: 'Account Settings', subtitle: 'Update your personal details and manage your owner password.' },
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
            subtitleEl.textContent = meta.subtitle;
        }

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
                    .in('role', ['staff', 'admin']).or('status.neq.disabled,status.is.null'),
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

        // Revision A1, decision A3 — both new Overview widgets refresh
        // alongside the 4 stat tiles, from this SAME entry point (also
        // triggered on 'inigosync:profile-ready' below), rather than a
        // second listener elsewhere.
        refreshRecentBookings();
        refreshStatusBreakdown();
    }

    // ------------------------------------------------------------------
    // Overview — Recent bookings (Revision A1, decision A3). Replaces the
    // old hardcoded "Busiest courts this week" card: the real latest 8
    // `booking` rows, newest first, with the customer's name (a SEPARATE
    // `profiles` query by the collected customer_ids — no PostgREST embed,
    // see fetchProfileNamesByIds's own comment) and the SAME derived
    // "Unattended" status the customer dashboard shows.
    // ------------------------------------------------------------------
    async function refreshRecentBookings() {
        const tableRoot = document.querySelector('[data-admin-recent-bookings]');
        if (!tableRoot || !window.sb) return;
        const tbody = tableRoot.querySelector('tbody');
        if (!tbody) return;

        let { data, error } = await window.sb
            .from('booking')
            .select('booking_id, customer_id, courts, time_date, end_at, status, checked_in_at')
            .order('created_at', { ascending: false })
            .limit(8);

        if (error && isSchemaMismatchError(error)) {
            // Pre-004/012 database — checked_in_at/end_at don't exist yet.
            // Graceful degradation: still show the 4 columns the table
            // asks for, just without the Unattended nuance or a time range.
            ({ data, error } = await window.sb
                .from('booking')
                .select('booking_id, customer_id, courts, time_date, status')
                .order('time_date', { ascending: false })
                .limit(8));
        }

        if (error) {
            console.error('[admin] failed to load recent bookings', error);
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--color-ink-faint);">Could not load recent bookings.</td></tr>';
            return;
        }

        const rows = data || [];
        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--color-ink-faint);">No bookings yet.</td></tr>';
            return;
        }

        const nameMap = await fetchProfileNamesByIds(rows.map((r) => r.customer_id));

        // Every interpolated value here is either customer-entered (name,
        // court) or derived from a fixed internal map (status) — escaped
        // before touching innerHTML, same rule as every other table in
        // this file.
        tbody.innerHTML = rows.map((row) => {
            const name = window.escapeHtml(nameMap.get(String(row.customer_id)) || '—');
            const court = window.escapeHtml(row.courts || '—');
            const when = window.escapeHtml(formatAdminDateTime(row.time_date, row.end_at));
            const displayStatus = adminDisplayStatusFor(row) || 'pending';
            const statusLabel = window.escapeHtml(displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1));
            return `
                <tr>
                    <td class="admin-cell-main">${name}</td>
                    <td>${court}</td>
                    <td>${when}</td>
                    <td><span class="admin-status ${window.escapeHtml(displayStatus)}">${statusLabel}</span></td>
                </tr>
            `;
        }).join('');
    }

    // ------------------------------------------------------------------
    // Overview — Booking status this month (Revision A1, decision A3).
    // Replaces the old hardcoded "Staff on shift" card: real counts of
    // pending/confirmed/completed/cancelled/unattended for the current
    // calendar month, rendered as the SAME label + count + proportional-bar
    // rows (.admin-progress-*) the old fake card used.
    // ------------------------------------------------------------------
    const ADMIN_STATUS_LABELS = { pending: 'Pending', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled', unattended: 'Unattended' };

    async function refreshStatusBreakdown() {
        const listRoot = document.querySelector('[data-admin-status-breakdown]');
        if (!listRoot || !window.sb) return;

        const { start: monthStart, end: monthEnd } = monthRange();

        let { data, error } = await window.sb
            .from('booking')
            .select('status, time_date, checked_in_at')
            .gte('time_date', monthStart.toISOString())
            .lt('time_date', monthEnd.toISOString());

        if (error && isSchemaMismatchError(error)) {
            ({ data, error } = await window.sb
                .from('booking')
                .select('status, time_date')
                .gte('time_date', monthStart.toISOString())
                .lt('time_date', monthEnd.toISOString()));
        }

        if (error) {
            console.error('[admin] failed to load the booking status breakdown', error);
            listRoot.innerHTML = '<p style="color: var(--color-ink-faint);">Could not load booking status this month.</p>';
            return;
        }

        const counts = { pending: 0, confirmed: 0, completed: 0, cancelled: 0, unattended: 0 };
        (data || []).forEach((row) => {
            const key = adminDisplayStatusFor(row);
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

    refreshOverviewStats();
    document.addEventListener('inigosync:profile-ready', refreshOverviewStats);

    // ------------------------------------------------------------------
    // Staff Management — toggle add-staff form, create/reset/edit/delete
    // ------------------------------------------------------------------
    const staffFormToggleBtns = document.querySelectorAll('[data-admin-toggle-staff-form]');
    const staffForm = document.querySelector('[data-admin-staff-form]');

    staffFormToggleBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            if (staffForm) staffForm.classList.toggle('is-open');
        });
    });

    const staffTable = document.querySelector('[data-admin-staff-table]');
    const staffSubmitBtn = document.querySelector('[data-admin-staff-submit]');

    if (staffSubmitBtn) {
        staffSubmitBtn.addEventListener('click', async () => {
            const nameInput = document.querySelector('[data-admin-staff-name]');
            const emailInput = document.querySelector('[data-admin-staff-email]');
            const roleSelect = document.querySelector('[data-admin-staff-role]');

            const name = nameInput ? nameInput.value.trim() : '';
            const email = emailInput ? emailInput.value.trim() : '';
            const position = roleSelect ? roleSelect.value : '';

            if (!name || !email) {
                if (!name && nameInput) nameInput.focus();
                else if (emailInput) emailInput.focus();
                return;
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

                refreshStaffList();

                if (nameInput) nameInput.value = '';
                if (emailInput) emailInput.value = '';
                if (staffForm) staffForm.classList.remove('is-open');
            } catch (err) {
                window.alert(err.message || 'Could not send the invite. Please try again.');
            } finally {
                staffSubmitBtn.disabled = false;
                staffSubmitBtn.textContent = 'Send Invite';
            }
        });
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
        row.innerHTML = `
            <td class="admin-cell-main" data-admin-staff-name-cell>${window.escapeHtml(profile.full_name) || '—'}</td>
            <td data-admin-staff-email-cell>${window.escapeHtml(profile.email) || '—'}</td>
            <td data-admin-staff-position-cell>${window.escapeHtml(profile.position) || '—'}</td>
            <td data-admin-staff-status-cell>${staffStatusBadge(profile.status)}</td>
            <td>
                <div class="admin-table-actions">
                    <button type="button" class="admin-mini-btn" data-admin-reset-password>Reset Password</button>
                    <button type="button" class="admin-mini-btn" data-admin-edit-staff>Edit</button>
                    ${profile.status === 'disabled'
                        ? '<button type="button" class="admin-mini-btn" data-admin-activate-staff>Activate</button>'
                        : '<button type="button" class="admin-mini-btn is-danger" data-admin-delete-staff>Deactivate</button>'}
                </div>
            </td>
        `;
        return row;
    }

    async function refreshStaffList() {
        if (!staffTable || !window.sb) return;
        const { data, error } = await window.sb
            .from('profiles')
            .select('*')
            .in('role', ['staff', 'admin'])
            .order('created_at');

        if (error) {
            console.error('[admin] failed to load staff', error);
            return;
        }

        const tbody = staffTable.querySelector('tbody');
        tbody.innerHTML = '';
        (data || []).forEach((profile) => {
            const row = renderStaffRow(profile);
            tbody.appendChild(row);
            wireStaffRowActions(row);
        });
    }

    function wireStaffRowActions(scope) {
        // Revision A1, decision A4 — Reset Password now calls the
        // SECURITY DEFINER RPC (database/schema/014_admin_reset_staff_password.sql)
        // instead of emailing a reset link. confirm() first (this is
        // immediate and irreversible from the target's point of view — their
        // current password stops working the instant this runs), then a
        // toast naming the account and the default password so the admin
        // can pass it along right away.
        scope.querySelectorAll('[data-admin-reset-password]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const row = btn.closest('tr');
                if (!row || !window.sb) return;
                const name = row.querySelector('[data-admin-staff-name-cell]')?.textContent || 'this account';

                if (!window.confirm(`Reset ${name}'s password to the default (12345678)? They will need to change it after logging in.`)) return;

                btn.disabled = true;
                const { error } = await window.sb.rpc('admin_reset_staff_password', { target_id: row.dataset.id });
                btn.disabled = false;

                if (error) {
                    window.InigoToast?.show(
                        isSchemaMismatchError(error)
                            ? "This needs a database update that hasn't been applied yet (see database/schema/014_admin_reset_staff_password.sql)."
                            : (error.message || 'Could not reset this password.'),
                        true
                    );
                    return;
                }

                window.InigoToast?.show(`Password reset to the default (12345678). Ask ${name} to change it after logging in.`);
            });
        });

        // Edit toggles the Name/Role cells into inputs; clicking again
        // (now "Save") commits the change — no separate edit modal exists.
        scope.querySelectorAll('[data-admin-edit-staff]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const row = btn.closest('tr');
                if (!row) return;
                const nameCell = row.querySelector('[data-admin-staff-name-cell]');
                const positionCell = row.querySelector('[data-admin-staff-position-cell]');
                // S6 (Revision A1 fix) — the static demo/fallback rows in
                // Pages/owner_dashboard.html predate these two data-*
                // hooks (only renderStaffRow() above adds them); now that
                // this whole table gets wired at startup, bail out instead
                // of crashing on nameCell/positionCell.textContent below.
                if (!nameCell || !positionCell) return;

                if (btn.dataset.editing !== 'true') {
                    const currentName = nameCell.textContent.trim();
                    const currentPosition = positionCell.textContent.trim() === '—' ? '' : positionCell.textContent.trim();
                    // Build the <input> with no value attribute, then set
                    // .value as a DOM property instead of concatenating the
                    // name/position into the markup string — a `"` in
                    // currentName would otherwise close the attribute early
                    // and let the rest of the name inject new markup.
                    nameCell.innerHTML = '<input type="text" class="admin-input">';
                    positionCell.innerHTML = '<input type="text" class="admin-input">';
                    nameCell.querySelector('input').value = currentName;
                    positionCell.querySelector('input').value = currentPosition;
                    btn.textContent = 'Save';
                    btn.dataset.editing = 'true';
                    return;
                }

                const full_name = nameCell.querySelector('input').value.trim();
                const position = positionCell.querySelector('input').value.trim();

                btn.disabled = true;
                const { error } = await window.sb.from('profiles').update({ full_name, position }).eq('id', row.dataset.id);
                btn.disabled = false;

                if (error) {
                    window.InigoToast?.show(error.message || 'Could not save changes.', true);
                    return;
                }

                nameCell.textContent = full_name;
                positionCell.textContent = position || '—';
                btn.textContent = 'Edit';
                btn.dataset.editing = 'false';
                window.InigoToast?.show('Staff updated.');
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

    const staffSearch = document.querySelector('[data-admin-staff-search]');
    if (staffSearch && staffTable) {
        staffSearch.addEventListener('input', () => {
            const query = staffSearch.value.trim().toLowerCase();
            staffTable.querySelectorAll('tbody tr').forEach((row) => {
                row.style.display = row.textContent.toLowerCase().includes(query) ? '' : 'none';
            });
        });
    }

    // ------------------------------------------------------------------
    // Payment Configuration — toggle switches + real load/save against
    // `app_settings` (database/schema/007_app_settings.sql, E2). Loaded
    // through window.InigoAppSettings (includes/appSettings.js) — the same
    // fetch-with-fallback data layer includes/Dashboard.js and
    // includes/staff_dashboard.js read — so this form starts on whatever
    // every other dashboard currently sees: the real saved row, or the
    // identical hardcoded fallback if the migration hasn't been applied yet.
    // ------------------------------------------------------------------
    const paymentToggles = document.querySelectorAll('[data-admin-payment-toggle]');
    const downpaymentPctInput = document.querySelector('[data-admin-downpayment-pct]');

    paymentToggles.forEach((toggle) => {
        toggle.addEventListener('click', () => {
            toggle.classList.toggle('is-on');
        });
    });

    function applyPaymentSettingsToForm(settings) {
        if (paymentToggles[0]) paymentToggles[0].classList.toggle('is-on', settings.gcashEnabled);
        if (paymentToggles[1]) paymentToggles[1].classList.toggle('is-on', settings.cashEnabled);
        if (downpaymentPctInput) downpaymentPctInput.value = settings.downpaymentPct;
    }

    if (window.InigoAppSettings) {
        window.InigoAppSettings.getSettings().then(applyPaymentSettingsToForm);
    }

    const paymentSaveBtn = document.querySelector('[data-admin-payment-save]');
    if (paymentSaveBtn) {
        paymentSaveBtn.addEventListener('click', async () => {
            const gcashOn = paymentToggles[0] ? paymentToggles[0].classList.contains('is-on') : true;
            const cashOn = paymentToggles[1] ? paymentToggles[1].classList.contains('is-on') : true;
            const pct = Number(downpaymentPctInput ? downpaymentPctInput.value : NaN);

            if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
                window.InigoToast?.show('Downpayment percentage must be a number between 0 and 100.', true);
                downpaymentPctInput?.focus();
                return;
            }

            if (!window.sb) {
                window.InigoToast?.show('Unable to reach the server right now. Please try again shortly.', true);
                return;
            }

            const originalLabel = paymentSaveBtn.textContent;
            paymentSaveBtn.disabled = true;
            paymentSaveBtn.textContent = 'Saving…';

            // Single-row upsert — `id` is always `true` (see
            // database/schema/007_app_settings.sql's singleton-row design),
            // so one call handles both "first ever save" (insert) and every
            // save after that (update); no read-then-branch needed.
            const { error } = await window.sb.from('app_settings').upsert({
                id: true,
                gcash_enabled: gcashOn,
                cash_enabled: cashOn,
                downpayment_pct: pct,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });

            paymentSaveBtn.disabled = false;
            paymentSaveBtn.textContent = originalLabel;

            if (error) {
                // Most likely cause pre-migration: `app_settings` doesn't
                // exist yet. Either way this is a real, specific failure —
                // never a fake "Payment settings saved." toast over a save
                // that didn't happen (implementation_plan.md success
                // criterion #2).
                window.InigoToast?.show(
                    isSchemaMismatchError(error)
                        ? "This needs a database update that hasn't been applied yet (see database/schema/007_app_settings.sql)."
                        : (error.message || 'Could not save payment settings. Please try again.'),
                    true
                );
                return;
            }

            window.InigoAppSettings?.invalidateSettings();
            window.InigoToast?.show('Payment settings saved.');
        });
    }

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

    function applyCourtFilter() {
        const activeChip = document.querySelector('[data-admin-court-filter].is-active');
        const filter = activeChip ? activeChip.dataset.adminCourtFilter : 'all';
        document.querySelectorAll('[data-admin-court-status]').forEach((card) => {
            const match = filter === 'all' || card.dataset.adminCourtStatus === filter;
            card.style.display = match ? '' : 'none';
        });
    }

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
        if (courtModalTitle) courtModalTitle.textContent = 'New Court';
        if (courtSubmitBtn) courtSubmitBtn.textContent = 'Add Court';

        courtForm.querySelectorAll('input[type="text"], input[type="number"], input[type="url"]').forEach((el) => { el.value = ''; });
        const quantityInput = courtForm.querySelector('[data-admin-court-quantity]');
        if (quantityInput) quantityInput.value = '1';
        ['[data-admin-court-unit]', '[data-admin-court-rate-unit]', '[data-admin-court-op-status]'].forEach((selector) => {
            const el = courtForm.querySelector(selector);
            if (el) el.selectedIndex = 0;
        });
        const sportSelect = courtForm.querySelector('[data-admin-court-sport]');
        if (sportSelect && sportSelect.options.length) sportSelect.selectedIndex = 0;
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
            setValue('[data-admin-court-quantity]', court.quantity || 1);
            setValue('[data-admin-court-unit]', court.unit || 'courts');
            setValue('[data-admin-court-rate]', court.rate !== null ? court.rate : '');
            setValue('[data-admin-court-rate-unit]', court.rateUnit || '/hr');
            setValue('[data-admin-court-description]', court.description || '');
            setValue('[data-admin-court-op-status]', court.status || 'Available');
            setValue('[data-admin-court-image-url]', court.imageUrl || '');
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
    // click landed on the overlay element itself, not a descendant.
    // (This is the only overlay-close modal in this file at the moment —
    // apply the same pair of listeners to any future one.)
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
        const statusLabel = isActive ? 'Active' : 'Deactivated';
        const monogram = window.InigoCourtsData ? window.InigoCourtsData.monogramFor(court.sportSlug, court.name) : '?';
        const safeImageUrl = court.imageUrl && isSafeImageUrl(court.imageUrl) ? court.imageUrl : null;
        const media = safeImageUrl
            ? `<img src="${window.escapeHtml(safeImageUrl)}" alt="${window.escapeHtml(court.name)}" loading="lazy">`
            : `<span class="admin-court-monogram" aria-hidden="true">${window.escapeHtml(monogram)}</span>`;
        // Rate rendering: ₱<rate><rate_unit> when non-null, an honest "Rate
        // TBA" placeholder when null — every court's rate is NULL in the
        // live DB right now (see database/seed/002_seed_content.sql). Never
        // invented.
        const rateHtml = court.rate !== null
            ? `₱${window.escapeHtml(String(court.rate))} <span>${window.escapeHtml(court.rateUnit)}</span>`
            : '<span>Rate TBA</span>';
        const tags = [court.sportName, `${court.quantity} ${court.unit}`]
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
                        <button type="button" class="admin-btn-secondary" data-admin-court-edit>Edit</button>
                        <button type="button" class="admin-btn-secondary${isActive ? ' is-danger' : ''}" data-admin-court-toggle-status>${isActive ? 'Deactivate' : 'Activate'}</button>
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
    }

    if (courtSubmitBtn) {
        courtSubmitBtn.addEventListener('click', async () => {
            const nameInput = document.querySelector('[data-admin-court-name]');
            const sportSelect = document.querySelector('[data-admin-court-sport]');
            const quantityInput = document.querySelector('[data-admin-court-quantity]');
            const unitSelect = document.querySelector('[data-admin-court-unit]');
            const rateInput = document.querySelector('[data-admin-court-rate]');
            const rateUnitSelect = document.querySelector('[data-admin-court-rate-unit]');
            const descriptionInput = document.querySelector('[data-admin-court-description]');
            const opStatusSelect = document.querySelector('[data-admin-court-op-status]');
            const imageUrlInput = document.querySelector('[data-admin-court-image-url]');

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
            if (!sportId) {
                window.InigoToast?.show('Select a sport.', true);
                return;
            }

            let quantity = Number(quantityInput ? quantityInput.value : NaN);
            if (!Number.isFinite(quantity) || quantity < 1) quantity = 1;

            // Rate is the one field allowed to stay blank — every court's
            // rate is NULL in the live DB until Ms. Driz confirms prices
            // (database/seed/002_seed_content.sql). Blank here always means
            // "send NULL", including on Edit (so a rate can be cleared back
            // to TBA), not "leave whatever was there before".
            const rateRaw = rateInput ? rateInput.value.trim() : '';
            if (rateRaw !== '' && (!Number.isFinite(Number(rateRaw)) || Number(rateRaw) < 0)) {
                window.InigoToast?.show('Rate must be a positive number, or leave it blank until confirmed.', true);
                return;
            }
            const rate = rateRaw === '' ? null : Number(rateRaw);

            // Revision A1 security requirement — the URL input is the ONE
            // remaining free-text path into an <img src>; reject anything
            // that isn't https:// or a relative project path before it
            // ever reaches the database (renderAdminCourtCard() also
            // re-checks this on render, as defense in depth).
            const imageUrlRaw = imageUrlInput ? imageUrlInput.value.trim() : '';
            if (imageUrlRaw && !isSafeImageUrl(imageUrlRaw)) {
                window.InigoToast?.show('Image URL must start with https:// (or be left blank).', true);
                imageUrlInput?.focus();
                return;
            }

            const payload = {
                name,
                sport_id: sportId,
                quantity,
                unit: unitSelect ? unitSelect.value : 'courts',
                description: (descriptionInput && descriptionInput.value.trim()) ? descriptionInput.value.trim() : null,
                rate,
                rate_unit: rateUnitSelect ? rateUnitSelect.value : '/hr',
                status: opStatusSelect ? opStatusSelect.value : 'Available',
                image_url: imageUrlRaw || null,
            };

            const editingId = courtForm.dataset.editingId;
            const originalLabel = courtSubmitBtn.textContent;
            courtSubmitBtn.disabled = true;
            courtSubmitBtn.textContent = editingId ? 'Saving…' : 'Adding…';

            let error;
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
                const { error: updateError, data: updateData } = await window.sb
                    .from('court').update(payload).eq('id', editingId).select();
                error = updateError || ((!updateData || updateData.length === 0)
                    ? { message: 'Could not save changes — you may not have permission, or this court may no longer exist.' }
                    : null);
            } else {
                const maxOrder = currentCourts.reduce((max, c) => Math.max(max, c.displayOrder || 0), 0);
                let slug = window.InigoCourtsData.slugify(name);
                ({ error } = await window.sb.from('court').insert({ ...payload, slug, display_order: maxOrder + 1 }));
                if (error && error.code === '23505') {
                    // Slug collision (unique constraint) — retried once with
                    // a short unique suffix rather than failing outright.
                    slug = `${slug}-${Date.now().toString(36)}`;
                    ({ error } = await window.sb.from('court').insert({ ...payload, slug, display_order: maxOrder + 1 }));
                }
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

            window.InigoToast?.show(editingId ? 'Court updated.' : 'Court added.');
            closeCourtModal();
            loadAndRenderCourts();
        });
    }

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
            });
        });
    }

    // Court modal's Photo field — Upload (to the `media` bucket, path
    // `courts/<slug>-<ts>.jpg`) alongside the existing URL input. Uses the
    // court's real slug when editing, or derives one from whatever's
    // currently typed in the Name field when adding (courtsData.js's own
    // slugify(), same helper the Add/Edit save handler above would use for
    // a brand-new court's `slug` column).
    const courtImageFileInput = document.querySelector('[data-admin-court-image-file]');
    const courtImageUploadBtn = document.querySelector('[data-admin-court-image-upload-trigger]');

    if (courtImageUploadBtn && courtImageFileInput) {
        courtImageUploadBtn.addEventListener('click', () => courtImageFileInput.click());
    }

    if (courtImageFileInput) {
        courtImageFileInput.addEventListener('change', async () => {
            const file = courtImageFileInput.files && courtImageFileInput.files[0];
            courtImageFileInput.value = '';
            if (!file) return;

            if (!window.InigoImageTools || !window.sb) {
                window.InigoToast?.show('Unable to reach the server right now. Please try again shortly.', true);
                return;
            }

            const imageUrlInput = document.querySelector('[data-admin-court-image-url]');
            const originalLabel = courtImageUploadBtn.textContent;
            courtImageUploadBtn.disabled = true;
            courtImageUploadBtn.textContent = 'Uploading…';

            try {
                const blob = await window.InigoImageTools.downscaleImageToBlob(file, { maxW: 1600, maxH: 900, quality: 0.85 });
                const nameInput = document.querySelector('[data-admin-court-name]');
                const editingId = courtForm ? courtForm.dataset.editingId : null;
                const editingCourt = editingId ? currentCourts.find((c) => String(c.id) === String(editingId)) : null;
                const slugSource = (editingCourt && editingCourt.slug) || window.InigoCourtsData.slugify(nameInput ? nameInput.value : '');
                const path = `courts/${slugSource}-${Date.now()}.jpg`;
                const url = await uploadToMedia(path, blob);
                if (imageUrlInput) imageUrlInput.value = url;
                window.InigoToast?.show('Photo uploaded.');
            } catch (err) {
                window.InigoToast?.show(err.message || 'Could not upload that image.', true);
            } finally {
                courtImageUploadBtn.disabled = false;
                courtImageUploadBtn.textContent = originalLabel;
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

    // ------------------------------------------------------------------
    // Media Manager — real slideshow against `public.event` (Revision A1,
    // decision A5). Lists every row (published or not) ordered by
    // display_order, so an admin can stage an unpublished slide before it
    // goes live. Uploads go to the same public `media` Storage bucket the
    // Court modal uses above, path `slides/<event id>-<ts>.jpg`. The old
    // "Court photos" card (a second, redundant path to the SAME
    // court.image_url the Court Listings modal already edits) is removed
    // outright rather than ported.
    // ------------------------------------------------------------------
    // W2 (Revision A1 fix) — this used to be 6, but both places that
    // actually render the hero slideshow cap themselves at 5:
    // includes/Dashboard.js's HERO_MAX_SLIDES (.limit(HERO_MAX_SLIDES) on
    // its `event` query) and includes/home-showcase.js's MAX_HERO_SLIDES
    // (.slice(0, MAX_HERO_SLIDES)). A 6th staged/published slide was
    // accepted here but silently never shown anywhere, so the cap below
    // now matches both consumers instead of promising a slot that doesn't
    // exist.
    const MAX_SLIDES = 5;
    let currentSlides = [];

    function slideMediaMarkup(slide) {
        const safeUrl = slide.image_url && isSafeImageUrl(slide.image_url) ? slide.image_url : null;
        if (safeUrl) {
            return `<img src="${window.escapeHtml(safeUrl)}" alt="${window.escapeHtml(slide.title || '')}" loading="lazy">`;
        }
        return '<span class="admin-slide-photo-soon" aria-hidden="true">No photo yet</span>';
    }

    function renderSlideCard(slide, index, total) {
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

    function renderSlides() {
        const slidesGrid = document.querySelector('[data-admin-slides]');
        if (!slidesGrid) return;

        slidesGrid.innerHTML = currentSlides.length
            ? currentSlides.map((slide, i) => renderSlideCard(slide, i, currentSlides.length)).join('')
            : '<p style="color: var(--color-ink-faint); padding: 8px 4px;">No slides yet — add one below.</p>';
        wireSlideCardActions(slidesGrid);

        const subEl = document.querySelector('[data-admin-slides-sub]');
        if (subEl) subEl.textContent = `${currentSlides.length} of ${MAX_SLIDES} slots used. Recommended 1600×900 — larger photos are resized automatically.`;

        const addBtn = document.querySelector('[data-admin-slide-add]');
        if (addBtn) addBtn.disabled = currentSlides.length >= MAX_SLIDES;
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
        loadSlides();
    }

    const addSlideBtn = document.querySelector('[data-admin-slide-add]');
    if (addSlideBtn) {
        addSlideBtn.addEventListener('click', async () => {
            if (!window.sb || currentSlides.length >= MAX_SLIDES) return;

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
            const { error } = await window.sb.from('event').insert({ title: 'New slide', display_order: maxOrder + 1, is_published: false });
            addSlideBtn.disabled = currentSlides.length >= MAX_SLIDES;

            if (error) {
                window.InigoToast?.show(
                    isSchemaMismatchError(error)
                        ? "This needs a database update that hasn't been applied yet."
                        : (error.message || 'Could not add a new slide.'),
                    true
                );
                return;
            }
            window.InigoToast?.show('Slide added — edit its title and photo below.');
            loadSlides();
        });
    }

    loadSlides();

    // ------------------------------------------------------------------
    // Notifications (Revision A1, decision A7) — ported from the customer
    // dashboard's [data-dash-notif*] dropdown (includes/Dashboard.js) under
    // admin-* names. Items are the latest 10 PENDING bookings + latest 5
    // feedback rows, merged and sorted newest-first. Unread dot = the
    // newest item is newer than localStorage's last-seen marker; opening
    // the menu updates that marker and hides the dot. Clicking a booking
    // item jumps to Overview (Recent bookings); feedback items are
    // informational only (no Feedback panel exists yet to jump to).
    // ------------------------------------------------------------------
    const adminNotif = document.querySelector('[data-admin-notif]');
    const adminNotifTrigger = document.querySelector('[data-admin-notif-trigger]');
    const adminNotifList = document.querySelector('[data-admin-notif-list]');
    const adminNotifDot = document.querySelector('[data-admin-notif-dot]');
    const ADMIN_NOTIF_SEEN_KEY = 'inigosync-admin-notif-seen';
    const ADMIN_NOTIF_REFRESH_MS = 60000;

    function closeAdminNotifMenu() {
        if (adminNotif) adminNotif.removeAttribute('data-open');
        if (adminNotifTrigger) adminNotifTrigger.setAttribute('aria-expanded', 'false');
    }

    let adminNotifLatestAt = null;

    function markAdminNotifSeen() {
        if (!adminNotifLatestAt) return;
        try { localStorage.setItem(ADMIN_NOTIF_SEEN_KEY, adminNotifLatestAt); } catch (_) { /* best-effort only */ }
        if (adminNotifDot) adminNotifDot.hidden = true;
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
                markAdminNotifSeen();
            }
        });

        document.addEventListener('click', (e) => {
            if (!adminNotif.contains(e.target)) closeAdminNotifMenu();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeAdminNotifMenu();
        });
    }

    // "★★★★☆" style rating string — 5 chars total, filled stars first.
    function adminStarString(rating) {
        const r = Math.max(0, Math.min(5, Number(rating) || 0));
        return '★'.repeat(r) + '☆'.repeat(5 - r);
    }

    function renderAdminNotificationItem(item) {
        const dotClass = item.type === 'feedback' ? 'feedback' : 'pending';
        const body = `
            <span class="admin-notif-dot ${dotClass}"></span>
            <span class="admin-notif-item-body">
                <strong>${window.escapeHtml(item.title)}</strong>
                <span>${window.escapeHtml(item.body)}</span>
            </span>
        `;
        if (item.type === 'booking') {
            return `<button type="button" class="admin-notif-item" data-admin-notif-booking="${window.escapeHtml(String(item.bookingId))}">${body}</button>`;
        }
        return `<div class="admin-notif-item">${body}</div>`;
    }

    async function refreshAdminNotifications() {
        if (!adminNotifList || !window.sb) return;

        let bookingRows = [];
        let feedbackRows = [];
        // W4 (Revision A1 fix) — set when the booking half of this fetch
        // still errors after the schema-mismatch retry below, so it can be
        // surfaced explicitly further down instead of just quietly
        // rendering feedback-only (or empty) notifications.
        let bookingLoadFailed = false;

        try {
            let [bookingRes, feedbackRes] = await Promise.all([
                window.sb.from('booking')
                    .select('booking_id, customer_id, courts, time_date, end_at, created_at')
                    .eq('status', 'pending')
                    .order('created_at', { ascending: false })
                    .limit(10),
                window.sb.from('feedback')
                    .select('id, profile_id, rating, message, created_at')
                    .order('created_at', { ascending: false })
                    .limit(5),
            ]);

            if (bookingRes.error && isSchemaMismatchError(bookingRes.error)) {
                // Mirrors refreshRecentBookings()'s own retry above —
                // pre-012 database, end_at doesn't exist yet.
                bookingRes = await window.sb.from('booking')
                    .select('booking_id, customer_id, courts, time_date, created_at')
                    .eq('status', 'pending')
                    .order('created_at', { ascending: false })
                    .limit(10);
            }

            if (!bookingRes.error) {
                bookingRows = bookingRes.data || [];
            } else {
                console.error('[admin] failed to load pending-booking notifications', bookingRes.error);
                bookingLoadFailed = true;
            }
            if (!feedbackRes.error) feedbackRows = feedbackRes.data || [];
            if (feedbackRes.error && !isSchemaMismatchError(feedbackRes.error)) console.error('[admin] failed to load feedback notifications', feedbackRes.error);
        } catch (err) {
            console.error('[admin] failed to load notifications', err);
            adminNotifList.innerHTML = '<p class="admin-notif-empty">Could not load notifications.</p>';
            return;
        }

        const nameMap = await fetchProfileNamesByIds([
            ...bookingRows.map((b) => b.customer_id),
            ...feedbackRows.map((f) => f.profile_id),
        ]);

        const bookingItems = bookingRows.map((b) => ({
            type: 'booking',
            bookingId: b.booking_id,
            createdAt: b.created_at || b.time_date,
            title: `${nameMap.get(String(b.customer_id)) || 'A customer'} booked ${b.courts || 'a court'}`,
            body: formatAdminDateTime(b.time_date, b.end_at),
        }));

        const MAX_FEEDBACK_EXCERPT = 80;
        const feedbackItems = feedbackRows.map((f) => {
            const name = nameMap.get(String(f.profile_id)) || 'A customer';
            const message = String(f.message || '');
            const excerpt = message.length > MAX_FEEDBACK_EXCERPT ? `${message.slice(0, MAX_FEEDBACK_EXCERPT).trimEnd()}…` : message;
            return {
                type: 'feedback',
                createdAt: f.created_at,
                title: f.rating ? `${adminStarString(f.rating)} ${name}` : `${name} left feedback`,
                body: excerpt || '(no message)',
            };
        });

        const items = [...bookingItems, ...feedbackItems].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // W4 (Revision A1 fix) — a still-failing booking-alerts load no
        // longer disappears silently: it gets its own line in the list,
        // shown alongside whatever feedback items (if any) DID load, rather
        // than only ever showing either the full list or "No notifications
        // yet."
        const bookingErrorHtml = bookingLoadFailed ? '<p class="admin-notif-empty">Couldn\'t load booking alerts.</p>' : '';
        adminNotifList.innerHTML = items.length || bookingLoadFailed
            ? `${bookingErrorHtml}${items.map(renderAdminNotificationItem).join('')}`
            : '<p class="admin-notif-empty">No notifications yet.</p>';

        adminNotifLatestAt = items.length ? items[0].createdAt : null;

        let lastSeen = null;
        try { lastSeen = localStorage.getItem(ADMIN_NOTIF_SEEN_KEY); } catch (_) { /* ignore */ }

        const hasUnread = Boolean(adminNotifLatestAt) && (!lastSeen || new Date(adminNotifLatestAt) > new Date(lastSeen));
        if (adminNotifDot) adminNotifDot.hidden = !hasUnread;
    }

    if (adminNotifList) {
        adminNotifList.addEventListener('click', (e) => {
            const item = e.target.closest('[data-admin-notif-booking]');
            if (!item) return;
            closeAdminNotifMenu();
            setActivePanel('overview');
        });
    }

    refreshAdminNotifications();
    document.addEventListener('inigosync:profile-ready', refreshAdminNotifications);
    window.setInterval(refreshAdminNotifications, ADMIN_NOTIF_REFRESH_MS);

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
                const ok = await saveAdminAvatarUrl(dataUrl);
                if (ok) window.InigoToast?.show('Profile photo updated.');
            } catch (err) {
                console.error('[admin] avatar downscale failed', err);
                window.InigoToast?.show('Could not process that image. Please try a different file.', true);
            } finally {
                adminAvatarUploadBtn.disabled = false;
                adminAvatarUploadBtn.textContent = originalLabel;
            }
        });
    }

    if (adminAvatarRemoveBtn) {
        adminAvatarRemoveBtn.addEventListener('click', async () => {
            adminAvatarRemoveBtn.disabled = true;
            const ok = await saveAdminAvatarUrl(null);
            adminAvatarRemoveBtn.disabled = false;
            if (ok) window.InigoToast?.show('Profile photo removed.');
        });
    }

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
    function getAdminEmailPendingHint(emailInput) {
        let hint = document.querySelector('[data-admin-settings-email-pending]');
        if (!hint && emailInput) {
            hint = document.createElement('p');
            hint.className = 'admin-form-hint';
            hint.setAttribute('data-admin-settings-email-pending', '');
            hint.textContent = 'Pending confirmation — check your inbox.';
            hint.hidden = true;
            emailInput.insertAdjacentElement('afterend', hint);
        }
        return hint;
    }

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
    function renderAdminProfile(profile, options) {
        const skipEmailRepaint = Boolean(options && options.skipEmailRepaint);
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
        if (emailInput) {
            if (!skipEmailRepaint) emailInput.value = profile.email || '';
            const hint = getAdminEmailPendingHint(emailInput);
            if (hint) hint.hidden = !skipEmailRepaint;
        }
    }

    document.addEventListener('inigosync:profile-ready', (e) => renderAdminProfile(e.detail));
    if (window.inigosyncProfile) renderAdminProfile(window.inigosyncProfile);

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
            const emailInput = document.querySelector('[data-admin-settings-email]');
            const newName = nameInput ? nameInput.value.trim() : '';
            const newEmail = emailInput ? emailInput.value.trim() : '';

            if (!newName) {
                window.InigoToast?.show('Enter your full name.', true);
                nameInput?.focus();
                return;
            }
            if (!EMAIL_RE.test(newEmail)) {
                window.InigoToast?.show('Enter a valid email address.', true);
                emailInput?.focus();
                return;
            }

            const nameChanged = newName !== (window.inigosyncProfile.full_name || '');
            const emailChanged = newEmail !== (window.inigosyncProfile.email || '');
            if (!nameChanged && !emailChanged) {
                window.InigoToast?.show('Nothing to save.');
                return;
            }

            adminProfileSaveBtn.disabled = true;
            try {
                if (nameChanged) {
                    const { error } = await window.sb.from('profiles').update({ full_name: newName }).eq('id', window.inigosyncProfile.id);
                    if (error) throw error;
                    window.inigosyncProfile.full_name = newName;
                }

                if (emailChanged) {
                    const { error } = await window.sb.auth.updateUser({ email: newEmail });
                    if (error) throw error;
                }

                // S2 (Revision A1 fix) — skip the email repaint on THIS
                // specific call only, when a new address was just
                // submitted: window.inigosyncProfile.email is still the
                // OLD (confirmed) address at this point (see this
                // function's own comment above), so a normal repaint would
                // silently swap the input back to it, looking exactly like
                // the save had failed.
                renderAdminProfile(window.inigosyncProfile, { skipEmailRepaint: emailChanged });
                window.InigoToast?.show(
                    emailChanged
                        ? `Confirmation link sent to ${newEmail} (check the old inbox too) — the change applies after you click it.`
                        : 'Profile updated.'
                );
            } catch (err) {
                window.InigoToast?.show(err.message || 'Could not save your changes.', true);
            } finally {
                adminProfileSaveBtn.disabled = false;
            }
        });
    }

    // ------------------------------------------------------------------
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
                if (window.inigosyncProfile) renderAdminProfile(window.inigosyncProfile);
            } else if (mode === 'password') {
                resetAdminPwWizard();
            }
        });
    });
});
