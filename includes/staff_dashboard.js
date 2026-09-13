document.addEventListener('DOMContentLoaded', () => {
    // ------------------------------------------------------------------
    // Panel switching (sidebar + topbar shortcuts)
    // ------------------------------------------------------------------
    const panels = document.querySelectorAll('[data-staff-panel]');
    const titleEl = document.querySelector('[data-staff-title]');
    const subtitleEl = document.querySelector('[data-staff-subtitle]');

    const panelMeta = {
        overview: { title: 'Booking Overview', subtitle: "Today's and upcoming court activity across the app." },
        walkin: { title: 'Walk-In Management', subtitle: 'Record a walk-in customer and print or download their receipt.' },
        schedule: { title: 'Court Schedule', subtitle: 'Hour-by-hour availability per court/unit.' },
        transactions: { title: 'Transaction Records', subtitle: 'Every booking and walk-in for the selected date range, with time-in/out.' },
        // Revision S1 (implementation_plan.md, decision S7) — not in
        // .staff-nav, only reachable from the topbar dropdown's "View
        // Profile"; setActivePanel() below still works unmodified since it
        // just looks this key up.
        profile: { title: 'My Profile', subtitle: 'Your account, at a glance.' },
        settings: { title: 'Account Settings', subtitle: 'Update your personal details and manage your staff account password.' },
    };

    function setActivePanel(name) {
        panels.forEach((panel) => {
            panel.classList.toggle('is-active', panel.dataset.staffPanel === name);
        });

        document.querySelectorAll('[data-staff-nav]').forEach((btn) => {
            if (btn.closest('.staff-nav')) {
                btn.classList.toggle('is-active', btn.dataset.staffNav === name);
            }
        });

        const meta = panelMeta[name];
        if (meta && titleEl && subtitleEl) {
            titleEl.textContent = meta.title;
            subtitleEl.textContent = meta.subtitle;
        }

        closeMobileSidebar();
        closeProfileMenu();
        // closeStaffNotifMenu is a hoisted function declaration defined
        // further down this file (Notifications section, Revision S1,
        // decision S8) — safe to call from here regardless of source order,
        // same reasoning includes/owner_dashboard.js documents for its own
        // closeAdminNotifMenu.
        closeStaffNotifMenu();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    document.querySelectorAll('[data-staff-nav]').forEach((btn) => {
        btn.addEventListener('click', () => setActivePanel(btn.dataset.staffNav));
    });

    // ------------------------------------------------------------------
    // Mobile sidebar toggle
    // ------------------------------------------------------------------
    const mobileToggle = document.querySelector('[data-staff-mobile-toggle]');
    const scrim = document.querySelector('[data-staff-scrim]');

    function closeMobileSidebar() {
        document.body.classList.remove('staff-sidebar-open');
        if (mobileToggle) mobileToggle.setAttribute('aria-expanded', 'false');
    }

    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            const isOpen = document.body.classList.toggle('staff-sidebar-open');
            mobileToggle.setAttribute('aria-expanded', String(isOpen));
        });
    }
    if (scrim) scrim.addEventListener('click', closeMobileSidebar);

    // ------------------------------------------------------------------
    // Profile dropdown
    // ------------------------------------------------------------------
    const profile = document.querySelector('[data-staff-profile]');
    const profileTrigger = document.querySelector('[data-staff-profile-trigger]');

    function closeProfileMenu() {
        if (profile) profile.removeAttribute('data-open');
    }

    if (profileTrigger && profile) {
        profileTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            closeStaffNotifMenu();
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

    // Logout is wired in includes/authGuard.js (real Supabase sign-out) via
    // document.querySelectorAll('[data-staff-logout]') — Revision S1,
    // decision S7 removed the sidebar's own Log Out button, leaving only
    // the topbar dropdown's; that querySelectorAll binding needs no change.

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
    const clockEl = document.querySelector('[data-staff-clock]');
    function renderClock() {
        if (!clockEl) return;
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        clockEl.textContent = `${dateStr} · ${timeStr}`;
    }
    renderClock();
    window.setInterval(renderClock, 30000);

    // ------------------------------------------------------------------
    // Shared helpers — date ranges, schema-mismatch detection, stat tiles,
    // profile-name lookups, occupancy windows, and the S1 derived-status
    // rule. Used across Booking Overview, Walk-In, Court Schedule,
    // Transaction Records, and Notifications below.
    // ------------------------------------------------------------------

    // "Today" in the browser's local timezone — the only timestamp field
    // every relevant table is guaranteed to have (time_date) is filtered
    // against this everywhere "today" is needed.
    function todayRange() {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        return { start, end };
    }

    function todayDateInputValue() {
        const { start } = todayRange();
        const y = start.getFullYear();
        const m = String(start.getMonth() + 1).padStart(2, '0');
        const d = String(start.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function formatIsoTime12h(iso) {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }

    // True when a Supabase/PostgREST error means "this column/table doesn't
    // exist" — i.e. database/schema/004_staff_module.sql or 016_walkin_
    // checkin.sql hasn't been applied yet — as opposed to a real error (RLS
    // rejection, network issue, etc.).
    function isSchemaMismatchError(error) {
        if (!error) return false;
        const code = error.code || '';
        const message = String(error.message || '').toLowerCase();
        return code === 'PGRST204' || code === 'PGRST205' || code === '42703' || code === '42P01'
            || message.includes('could not find') || message.includes('does not exist')
            || message.includes('schema cache');
    }

    // Every element sharing a data-staff-stat key gets the same value.
    function setStat(key, value) {
        document.querySelectorAll(`[data-staff-stat="${key}"]`).forEach((el) => {
            el.textContent = String(value);
        });
    }

    // Best-effort write to audit_log (database/schema/004_staff_module.sql).
    // Revision S1, decision S6 — Transaction Records no longer READS this
    // table (it reads real booking/walk_in_booking rows instead), but the
    // write helper stays: a durable trail of "who timed in whom, and when"
    // is still useful even though the staff-facing UI no longer surfaces it
    // directly. Never blocks or fails the mutation that already succeeded
    // by the time this is called.
    async function writeAuditLog(action, entityType, entityId, details) {
        if (!window.sb || !window.inigosyncProfile) return;
        const { error } = await window.sb.from('audit_log').insert({
            actor_id: window.inigosyncProfile.id,
            actor_role: window.inigosyncProfile.role || null,
            action,
            entity_type: entityType,
            entity_id: (entityId === undefined || entityId === null) ? null : String(entityId),
            details: details || null,
        });
        if (error) {
            console.warn('[staff] audit_log write skipped —', error.message || error);
        }
    }

    // Shared by Overview/Schedule/Transactions/Notifications (customer_id ->
    // name) — no PostgREST embed, since a real FK from booking.customer_id
    // to profiles.id isn't confirmed in this repo-invisible table (see
    // database/schema/004_staff_module.sql's header note). Ported from
    // includes/owner_dashboard.js's fetchProfileNamesByIds().
    async function fetchProfileNamesByIds(ids) {
        const uniqueIds = Array.from(new Set((ids || []).filter(Boolean).map(String)));
        const map = new Map();
        if (!uniqueIds.length || !window.sb) return map;

        const { data, error } = await window.sb.from('profiles').select('id, full_name').in('id', uniqueIds);
        if (error) {
            console.error('[staff] failed to load customer names', error);
            return map;
        }
        (data || []).forEach((p) => map.set(String(p.id), p.full_name || 'Customer'));
        return map;
    }

    // [start, end) for one business hour on a given date base — shared by
    // the Court Schedule grid and the walk-in wizard's Step 3 occupancy
    // check.
    function hourWindow(hour, dateBase) {
        const start = new Date(dateBase);
        start.setHours(hour, 0, 0, 0);
        return { start, end: new Date(start.getTime() + 60 * 60 * 1000) };
    }

    function windowsOverlap(a, b) {
        return a.start < b.end && b.start < a.end;
    }

    // Kept equal to database/schema/004_staff_module.sql's
    // booking.duration_minutes DEFAULT.
    const DEFAULT_DURATION_MINUTES = 60;

    // [start, end] for a `booking` OR `walk_in_booking` row — both share
    // this time_date + optional end_at/duration_minutes shape once
    // database/schema/012_booking_time_range.sql and
    // 016_walkin_checkin.sql are applied. Falls back to
    // DEFAULT_DURATION_MINUTES, never invents a longer/shorter guess.
    function rowWindow(row) {
        const start = new Date(row.time_date);
        if (row.end_at) {
            const end = new Date(row.end_at);
            if (!Number.isNaN(end.getTime())) return { start, end };
        }
        const minutesRaw = Number(row.duration_minutes);
        const minutes = Number.isFinite(minutesRaw) && minutesRaw > 0 ? minutesRaw : DEFAULT_DURATION_MINUTES;
        return { start, end: new Date(start.getTime() + minutes * 60000) };
    }

    // ------------------------------------------------------------------
    // Revision S1, decision S1 — status is DERIVED, never written (besides
    // checked_in_at itself):
    //   Booked      - not checked in, still within the 30-minute grace
    //                 window of time_date (covers both "hasn't started yet"
    //                 and "just started, hasn't been walked over to yet").
    //   In play     - checked in, now < end (rowWindow's end).
    //   Completed   - checked in, now >= end — this IS the "auto time-out"
    //                 decision S1 calls for; checked_out_at is never
    //                 written, the completed state is computed fresh on
    //                 every render.
    //   Unattended  - not checked in, now > time_date + 30 minutes.
    // A row whose real `status` is already 'cancelled' or 'completed'
    // passes straight through — those are real, already-settled facts this
    // never overrides.
    // ------------------------------------------------------------------
    const UNATTENDED_GRACE_MINUTES = 30;

    function staffDerivedStatus(row) {
        const raw = String(row.status || '').toLowerCase();
        if (raw === 'cancelled') return 'cancelled';
        if (raw === 'completed') return 'completed';

        if (row.checked_in_at) {
            const { end } = rowWindow(row);
            return Date.now() >= end.getTime() ? 'completed' : 'inplay';
        }

        const start = new Date(row.time_date);
        if (Number.isNaN(start.getTime())) return 'booked';
        const graceDeadline = start.getTime() + UNATTENDED_GRACE_MINUTES * 60000;
        return Date.now() > graceDeadline ? 'unattended' : 'booked';
    }

    const STAFF_STATUS_LABELS = { booked: 'Booked', inplay: 'In play', completed: 'Completed', unattended: 'Unattended', cancelled: 'Cancelled' };
    function staffStatusLabel(status) {
        return STAFF_STATUS_LABELS[status] || (status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown');
    }

    // Time-In is offered only for a row that hasn't been checked in yet
    // (Booked or Unattended — both mean exactly that), and only once we're
    // within TIME_IN_LEAD_MINUTES of the booked start (so staff can't time
    // someone in hours ahead of their slot).
    const TIME_IN_LEAD_MINUTES = 15;
    function staffCanTimeIn(row, status) {
        if (status !== 'booked' && status !== 'unattended') return false;
        if (row.checked_in_at) return false;
        const startMs = new Date(row.time_date).getTime();
        if (Number.isNaN(startMs)) return false;
        return Date.now() >= startMs - TIME_IN_LEAD_MINUTES * 60000;
    }

    // `walk_in_booking` has no tracked CREATE TABLE in this repo (same
    // "created directly in the live Supabase project before this repo
    // tracked schema files" story as `booking` — see database/schema/
    // 004_staff_module.sql's header note), so its primary-key column name
    // is not confirmed. select('*') always returns whichever real columns
    // exist, so the first of these candidates actually present on a given
    // row IS the real PK column — both its name (for .eq()) and its value.
    const WALKIN_ID_CANDIDATES = ['id', 'walkin_id', 'walk_in_id', 'walk_in_booking_id'];
    function walkinIdField(row) {
        for (let i = 0; i < WALKIN_ID_CANDIDATES.length; i++) {
            const key = WALKIN_ID_CANDIDATES[i];
            if (row && row[key] !== undefined && row[key] !== null) return key;
        }
        return null;
    }

    // Merges `booking` + `walk_in_booking` rows into one normalized shape
    // both Booking Overview and Transaction Records render from — every
    // field staffDerivedStatus()/rowWindow() need (status, checked_in_at,
    // time_date, end_at, duration_minutes) plus display fields (courts,
    // unit, payment, sourceType, customerId/customerName, raw). Shared here
    // (Revision S1) so the two panels can never disagree about what a
    // "booking" or "walk-in" row looks like.
    function mergeBookingRows(bookingRows, walkinRows) {
        const merged = [];
        (bookingRows || []).forEach((b) => merged.push({
            sourceType: 'booking',
            raw: b,
            customerId: b.customer_id || null,
            customerName: null,
            courts: b.courts || b.sports || '',
            unit: b.court_unit || '',
            time_date: b.time_date,
            end_at: b.end_at || null,
            duration_minutes: b.duration_minutes,
            checked_in_at: b.checked_in_at || null,
            status: b.status,
            payment: 'Online',
        }));
        (walkinRows || []).forEach((w) => merged.push({
            sourceType: 'walkin',
            raw: w,
            customerId: null,
            customerName: w.customer_name || 'Walk-in customer',
            courts: w.courts || w.sports || '',
            unit: w.court_unit || '',
            time_date: w.time_date,
            end_at: w.end_at || null,
            duration_minutes: w.duration_minutes,
            checked_in_at: w.checked_in_at || null,
            status: w.status,
            payment: w.payment_method || '—',
        }));
        return merged;
    }

    if (!window.InigoCourtsData) {
        // Should never happen — includes/courtsData.js must load before
        // this file (see the <script> order in Pages/staff_dashboard.html).
        console.error('[staff] window.InigoCourtsData is missing — check that includes/courtsData.js loads before includes/staff_dashboard.js.');
    }
    if (!window.InigoBusinessHours) {
        // Should never happen — includes/businessHours.js must load before
        // this file (see the <script> order in Pages/staff_dashboard.html).
        console.error('[staff] window.InigoBusinessHours is missing — check that includes/businessHours.js loads before includes/staff_dashboard.js.');
    }

    // Re-wires a table's filter chips + search box against its CURRENT
    // <tbody> rows. Called after every render (rows are always fully
    // replaced, not patched) — the chips/search input themselves are never
    // replaced, so this idiom is safe to re-run every time, same pattern
    // this file has always used.
    function wireFilterableTable(scopeName) {
        const group = document.querySelector(`[data-staff-filter-group="${scopeName}"]`);
        const searchInput = document.querySelector(`[data-staff-search="${scopeName}"]`);
        const table = document.querySelector(`[data-staff-table="${scopeName}"]`);
        if (!table) return;
        const rows = Array.from(table.querySelectorAll('tbody tr'));

        let activeFilter = 'all';
        let query = '';

        function applyFilters() {
            rows.forEach((row) => {
                const matchesFilter = activeFilter === 'all' || row.dataset.status === activeFilter;
                const matchesQuery = !query || row.textContent.toLowerCase().includes(query);
                row.style.display = (matchesFilter && matchesQuery) ? '' : 'none';
            });
        }

        if (group) {
            group.querySelectorAll('[data-staff-chip]').forEach((chip) => {
                chip.addEventListener('click', () => {
                    group.querySelectorAll('[data-staff-chip]').forEach((c) => c.classList.remove('is-active'));
                    chip.classList.add('is-active');
                    activeFilter = chip.dataset.staffFilter;
                    applyFilters();
                });
            });
        }

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                query = searchInput.value.trim().toLowerCase();
                applyFilters();
            });
        }
    }

    // ------------------------------------------------------------------
    // Booking Overview — Revision S1, decision S1. Today's + upcoming
    // bookings (pending/confirmed/completed) merged with today's walk-ins
    // into one list, newest-start-first. Confirm/Decline/Time-Out are gone
    // entirely; the only action is Time-In, and status is always derived
    // (staffDerivedStatus() above), never read straight off `status`.
    // ------------------------------------------------------------------
    const overviewTableBody = document.querySelector('[data-staff-table="overview"] tbody');
    let overviewRows = [];

    // Fetches with select('*') rather than an explicit column list — this
    // table's exact shape (whether database/schema/004_staff_module.sql's
    // checked_in_at, 012_booking_time_range.sql's end_at/court_unit, or
    // this revision's own 016_walkin_checkin.sql columns exist yet) is
    // never guaranteed, and select('*') simply returns whatever DOES exist
    // instead of erroring on a column that doesn't — no schema-mismatch
    // retry needed on the read side at all.
    async function fetchOverviewBookings() {
        if (!window.sb) return { ok: false, rows: [] };
        const { start } = todayRange();
        const { data, error } = await window.sb
            .from('booking')
            .select('*')
            .in('status', ['pending', 'confirmed', 'completed'])
            .gte('time_date', start.toISOString())
            .order('time_date', { ascending: true });
        if (error) {
            console.error('[staff] failed to load bookings', error);
            return { ok: false, rows: [] };
        }
        return { ok: true, rows: data || [] };
    }

    async function fetchTodayWalkins() {
        if (!window.sb) return { ok: false, rows: [] };
        const { start, end } = todayRange();
        const { data, error } = await window.sb
            .from('walk_in_booking')
            .select('*')
            .gte('time_date', start.toISOString())
            .lt('time_date', end.toISOString())
            .order('time_date', { ascending: true });
        if (error) {
            console.error("[staff] failed to load today's walk-ins", error);
            return { ok: false, rows: [] };
        }
        return { ok: true, rows: data || [] };
    }

    // "3:00 PM – 5:00 PM" for today's rows; "Sep 18, 3:00 PM – 5:00 PM" for
    // a future row — Overview now spans "today + upcoming" (S1), not just
    // today, so a row on a different day needs its date spelled out.
    function formatOverviewTimeCell(row) {
        const { start, end } = rowWindow(row);
        const timeLabel = `${formatIsoTime12h(row.time_date)} – ${formatIsoTime12h(end.toISOString())}`;
        if (start.toDateString() === new Date().toDateString()) return timeLabel;
        const dateLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `${dateLabel}, ${timeLabel}`;
    }

    function renderOverviewStats(rows) {
        const { start, end } = todayRange();
        const startMs = start.getTime();
        const endMs = end.getTime();
        const todayRows = rows.filter((r) => {
            const t = new Date(r.time_date).getTime();
            return t >= startMs && t < endMs;
        });

        const bookingsToday = todayRows.filter((r) => r.sourceType === 'booking').length;
        const walkinsToday = todayRows.filter((r) => r.sourceType === 'walkin').length;
        const inPlayNow = todayRows.filter((r) => staffDerivedStatus(r) === 'inplay').length;
        const stillToCome = todayRows.filter((r) => staffDerivedStatus(r) === 'booked').length;

        setStat('bookings-today', bookingsToday);
        setStat('walkins-today', walkinsToday);
        setStat('inplay-now', inPlayNow);
        setStat('still-to-come', stillToCome);
    }

    function staffActionCellHtml(row, status) {
        if (!staffCanTimeIn(row, status)) return '';
        return '<button type="button" class="staff-mini-btn is-primary" data-staff-action="timein">Time-In</button>';
    }

    // Every value below can be customer-controlled (customer name, a
    // walk-in's typed name) or DB content staff/admin can edit (courts) —
    // escaped before it touches innerHTML.
    function renderOverviewRow(row) {
        const status = staffDerivedStatus(row);
        const fallbackName = row.sourceType === 'walkin' ? 'Walk-in customer' : 'Customer';
        const customerName = window.escapeHtml(row.customerName || fallbackName);
        const courtLabel = window.escapeHtml(row.courts || '—');
        const unitLabel = row.unit ? window.escapeHtml(row.unit) : '';
        const sourceLabel = row.sourceType === 'walkin' ? 'Walk-in' : 'Online';
        const sourceClass = row.sourceType === 'walkin' ? 'walkin' : 'online';
        const paymentLabel = window.escapeHtml(row.payment || '—');
        const statusLabel = window.escapeHtml(staffStatusLabel(status));

        const tr = document.createElement('tr');
        tr.dataset.status = status;
        tr.innerHTML = `
            <td class="staff-cell-main">${customerName}</td>
            <td>${courtLabel}${unitLabel ? `<span class="staff-cell-sub">${unitLabel}</span>` : ''}</td>
            <td>${window.escapeHtml(formatOverviewTimeCell(row))}</td>
            <td><span class="staff-status ${sourceClass}">${sourceLabel}</span></td>
            <td>${paymentLabel}</td>
            <td><span class="staff-status ${window.escapeHtml(status)}">${statusLabel}</span></td>
            <td>${staffActionCellHtml(row, status)}</td>
        `;
        return tr;
    }

    async function refreshBookingOverview() {
        if (!overviewTableBody || !window.sb) return;

        const [bookingsRes, walkinsRes] = await Promise.all([fetchOverviewBookings(), fetchTodayWalkins()]);
        if (!bookingsRes.ok) {
            overviewTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--color-ink-faint);">Could not load bookings right now.</td></tr>';
            return;
        }

        const merged = mergeBookingRows(bookingsRes.rows, walkinsRes.ok ? walkinsRes.rows : []);
        merged.sort((a, b) => new Date(a.time_date) - new Date(b.time_date));

        const nameMap = await fetchProfileNamesByIds(merged.filter((r) => r.sourceType === 'booking').map((r) => r.customerId));
        merged.forEach((r) => {
            if (r.sourceType === 'booking') r.customerName = nameMap.get(String(r.customerId)) || 'Customer';
        });

        overviewRows = merged;
        renderOverviewStats(merged);

        overviewTableBody.innerHTML = '';
        if (merged.length === 0) {
            overviewTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--color-ink-faint);">No bookings yet.</td></tr>';
            wireFilterableTable('overview');
            return;
        }

        merged.forEach((row, i) => {
            const tr = renderOverviewRow(row);
            tr.dataset.rowIndex = String(i);
            overviewTableBody.appendChild(tr);
        });

        wireFilterableTable('overview');
    }

    async function timeInBooking(bookingId) {
        const { data, error } = await window.sb.from('booking').update({ checked_in_at: new Date().toISOString() }).eq('booking_id', bookingId).select();
        if (error) {
            if (isSchemaMismatchError(error) || error.code === '42501') return { error: 'Ask the owner to run 004 and 016.' };
            return { error: error.message || 'Could not time this booking in.' };
        }
        if (!data || data.length === 0) return { error: 'Ask the owner to run 004 and 016.' };
        return { ok: true };
    }

    async function timeInWalkin(idField, idValue) {
        const { data, error } = await window.sb.from('walk_in_booking').update({ checked_in_at: new Date().toISOString() }).eq(idField, idValue).select();
        if (error) {
            if (isSchemaMismatchError(error) || error.code === '42501') return { error: 'Ask the owner to run 004 and 016.' };
            return { error: error.message || 'Could not time this walk-in in.' };
        }
        if (!data || data.length === 0) return { error: 'Ask the owner to run 004 and 016.' };
        return { ok: true };
    }

    // Event delegation on the table BODY (not per-row buttons) — rows are
    // fully replaced on every refresh, so listeners bound directly to a
    // button would not survive a re-render.
    async function handleOverviewAction(e) {
        const btn = e.target.closest('[data-staff-action="timein"]');
        if (!btn || btn.disabled) return;
        const tr = btn.closest('tr');
        if (!tr) return;
        const row = overviewRows[Number(tr.dataset.rowIndex)];
        if (!row || !window.sb) return;

        const originalLabel = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Timing in…';

        let result;
        if (row.sourceType === 'booking') {
            result = await timeInBooking(row.raw.booking_id);
        } else {
            const idField = walkinIdField(row.raw);
            result = idField ? await timeInWalkin(idField, row.raw[idField]) : { error: "Can't identify this walk-in record." };
        }

        if (result.error) {
            btn.disabled = false;
            btn.textContent = originalLabel;
            window.InigoToast?.show(result.error, true);
            return;
        }

        writeAuditLog(
            'booking_timed_in',
            row.sourceType === 'booking' ? 'booking' : 'walk_in_booking',
            row.sourceType === 'booking' ? row.raw.booking_id : null,
            { customerName: row.customerName, court: row.courts }
        );
        window.InigoToast?.show('Customer timed in.');
        refreshBookingOverview();
        refreshCourtSchedule();
        refreshTransactions();
    }

    if (overviewTableBody) overviewTableBody.addEventListener('click', handleOverviewAction);

    refreshBookingOverview();
    document.addEventListener('inigosync:profile-ready', refreshBookingOverview);

    // ------------------------------------------------------------------
    // Walk-In Management — Revision S1, decisions S3/S4. Replaces the old
    // single-page form (duration 1/2/3h + start time + GCash/Cash) with a
    // 5-step wizard: ① Customer -> ② Sport & court -> ③ Time (today only,
    // From/To limited to free hours) -> ④ Payment -> ⑤ Review & save. On
    // success the wizard is swapped for a receipt card (Download PNG /
    // Print / New walk-in).
    // ------------------------------------------------------------------
    const walkinWizardWrap = document.querySelector('[data-staff-walkin-wizard-wrap]');
    const walkinReceiptWrap = document.querySelector('[data-staff-walkin-receipt-wrap]');
    const walkinReceiptEl = document.querySelector('[data-staff-walkin-receipt]');

    const walkinStepPanels = document.querySelectorAll('[data-staff-walkin-step]');
    const walkinStepIndicators = document.querySelectorAll('[data-staff-walkin-step-indicator]');
    const walkinBackBtn = document.querySelector('[data-staff-walkin-back]');
    const walkinNextBtn = document.querySelector('[data-staff-walkin-next]');
    const walkinSaveBtn = document.querySelector('[data-staff-walkin-save]');

    const walkinNameInput = document.querySelector('[data-staff-walkin-name]');
    const walkinMobileInput = document.querySelector('[data-staff-walkin-mobile]');
    const walkinSportChips = document.querySelector('[data-staff-walkin-sport-chips]');
    const walkinUnitWrap = document.querySelector('[data-staff-walkin-unit-wrap]');
    const walkinUnitLabel = document.querySelector('[data-staff-walkin-unit-label]');
    const walkinUnitSelect = document.querySelector('[data-staff-walkin-unit-select]');
    const walkinFromSelect = document.querySelector('[data-staff-walkin-from]');
    const walkinToSelect = document.querySelector('[data-staff-walkin-to]');
    const walkinOpenWindowsEl = document.querySelector('[data-staff-walkin-open-windows]');
    const walkinPaymentOptionEls = document.querySelectorAll('[data-staff-walkin-step="4"] [data-staff-payment-option]');

    const walkinSummaryName = document.querySelector('[data-staff-walkin-summary-name]');
    const walkinSummaryMobile = document.querySelector('[data-staff-walkin-summary-mobile]');
    const walkinSummaryCourt = document.querySelector('[data-staff-walkin-summary-court]');
    const walkinSummaryTime = document.querySelector('[data-staff-walkin-summary-time]');
    const walkinSummaryRateLabel = document.querySelector('[data-staff-walkin-summary-rate-label]');
    const walkinSummaryRate = document.querySelector('[data-staff-walkin-summary-rate]');
    const walkinSummaryPayment = document.querySelector('[data-staff-walkin-summary-payment]');
    const walkinSummaryTotal = document.querySelector('[data-staff-walkin-summary-total]');

    const WALKIN_STEP_COUNT = 5;
    let walkinWizardStep = 1;

    let walkinState = {
        name: '',
        mobile: '',
        mobileError: false,
        courts: [],
        court: null,
        unit: null,
        startHour: null,
        endHour: null,
        payment: 'cash',
    };

    // { ok, rows } — today's bookings/walk-ins for the CURRENTLY selected
    // court, refreshed by refreshWalkinTimePickers() below. Same shape as
    // includes/Dashboard.js's slotGridBookings/slotGridWalkins.
    let walkinBookings = { ok: true, rows: [] };
    let walkinWalkins = { ok: true, rows: [] };
    let walkinRequestSeq = 0;

    function walkinStepIsReady(step) {
        if (step === 1) return Boolean(walkinState.name) && !walkinState.mobileError;
        if (step === 2) {
            if (!walkinState.court || !window.InigoCourtsData) return false;
            const { units } = window.InigoCourtsData.resolveCourtUnits(walkinState.court);
            return units.length > 1 ? Boolean(walkinState.unit) : true;
        }
        if (step === 3) return walkinState.startHour !== null && walkinState.endHour !== null;
        if (step === 4) return Boolean(walkinState.payment);
        return true;
    }

    function renderWalkinWizard() {
        walkinStepPanels.forEach((panel) => {
            panel.classList.toggle('is-active', Number(panel.dataset.staffWalkinStep) === walkinWizardStep);
        });
        walkinStepIndicators.forEach((el) => {
            const n = Number(el.dataset.staffWalkinStepIndicator);
            el.classList.toggle('is-current', n === walkinWizardStep);
            el.classList.toggle('is-done', n < walkinWizardStep);
            el.setAttribute('aria-current', n === walkinWizardStep ? 'step' : 'false');
        });
        if (walkinBackBtn) walkinBackBtn.hidden = walkinWizardStep === 1;
        if (walkinNextBtn) {
            walkinNextBtn.hidden = walkinWizardStep === WALKIN_STEP_COUNT;
            walkinNextBtn.disabled = !walkinStepIsReady(walkinWizardStep);
        }
        if (walkinWizardStep === WALKIN_STEP_COUNT) updateWalkinSummary();
    }

    function goToWalkinStep(step) {
        walkinWizardStep = Math.min(Math.max(1, step), WALKIN_STEP_COUNT);
        renderWalkinWizard();
    }

    if (walkinNextBtn) {
        walkinNextBtn.addEventListener('click', () => {
            if (walkinNextBtn.disabled) return;
            goToWalkinStep(walkinWizardStep + 1);
        });
    }
    if (walkinBackBtn) walkinBackBtn.addEventListener('click', () => goToWalkinStep(walkinWizardStep - 1));

    // ---- Step 1 — Customer ----
    if (walkinNameInput) {
        walkinNameInput.addEventListener('input', () => {
            walkinState.name = walkinNameInput.value.trim();
            renderWalkinWizard();
        });
    }
    if (walkinMobileInput) {
        walkinMobileInput.addEventListener('input', () => {
            const raw = walkinMobileInput.value.trim();
            if (!raw) {
                walkinState.mobile = '';
                walkinState.mobileError = false;
            } else {
                const check = window.validatePhMobile(raw);
                walkinState.mobile = check.valid ? check.normalized : '';
                walkinState.mobileError = !check.valid;
            }
            renderWalkinWizard();
        });
    }

    // ---- Step 2 — Sport & court/unit ----
    function renderWalkinSportChips() {
        if (!walkinSportChips) return;
        walkinSportChips.innerHTML = walkinState.courts.map((court) => {
            const active = walkinState.court && String(walkinState.court.id) === String(court.id);
            return `<button type="button" class="staff-chip${active ? ' is-active' : ''}" data-staff-chip data-staff-walkin-sport="${window.escapeHtml(String(court.id))}">${window.escapeHtml(court.name)}</button>`;
        }).join('');

        walkinSportChips.querySelectorAll('[data-staff-walkin-sport]').forEach((chip) => {
            chip.addEventListener('click', () => {
                const court = walkinState.courts.find((c) => String(c.id) === chip.dataset.staffWalkinSport);
                if (court) selectWalkinCourt(court);
            });
        });
    }

    function selectWalkinCourt(court) {
        walkinState.court = court;
        const { pickerLabel, units } = window.InigoCourtsData.resolveCourtUnits(court);

        if (units.length > 1) {
            if (walkinUnitWrap) walkinUnitWrap.hidden = false;
            if (walkinUnitLabel) walkinUnitLabel.textContent = pickerLabel;
            if (walkinUnitSelect) {
                walkinUnitSelect.innerHTML = units.map((u, i) => {
                    const label = u.label || `Unit ${i + 1}`;
                    return `<option value="${window.escapeHtml(label)}">${window.escapeHtml(label)}</option>`;
                }).join('');
                walkinState.unit = units[0].label || 'Unit 1';
                walkinUnitSelect.value = walkinState.unit;
            }
        } else {
            if (walkinUnitWrap) walkinUnitWrap.hidden = true;
            walkinState.unit = (units[0] && units[0].label) || null;
        }

        renderWalkinSportChips();
        resetWalkinTimeSelectionAndRefresh();
        renderWalkinWizard();
    }

    if (walkinUnitSelect) {
        walkinUnitSelect.addEventListener('change', () => {
            walkinState.unit = walkinUnitSelect.value || null;
            resetWalkinTimeSelectionAndRefresh();
            renderWalkinWizard();
        });
    }

    async function loadWalkinCourts() {
        if (!window.InigoCourtsData) return;
        const courts = await window.InigoCourtsData.getCourts();
        walkinState.courts = courts;
        renderWalkinSportChips();
    }
    loadWalkinCourts();

    // ---- Step 3 — Time (today only) ----
    // Ported from includes/Dashboard.js's fetchDayBookings()/
    // computeFreeWindows()/renderTimePickers() (Revision 5, D3) — same
    // From/To picker shape, minus a date parameter (a walk-in is always
    // today, per S3).
    async function fetchWalkinBookingsForCourt(courtName) {
        if (!window.sb || !courtName) return { ok: false, rows: [] };
        const { start, end } = todayRange();
        let res = await window.sb
            .from('booking')
            .select('court_unit, time_date, end_at, duration_minutes')
            .eq('courts', courtName)
            .in('status', ['pending', 'confirmed'])
            .gte('time_date', start.toISOString())
            .lt('time_date', end.toISOString());
        if (res.error && isSchemaMismatchError(res.error)) {
            res = await window.sb
                .from('booking')
                .select('time_date, duration_minutes')
                .eq('courts', courtName)
                .in('status', ['pending', 'confirmed'])
                .gte('time_date', start.toISOString())
                .lt('time_date', end.toISOString());
        }
        if (res.error) {
            console.error('[staff] failed to load bookings for the walk-in time pickers', res.error);
            return { ok: false, rows: [] };
        }
        return { ok: true, rows: res.data || [] };
    }

    async function fetchWalkinWalkinsForCourt(courtName) {
        if (!window.sb || !courtName) return { ok: false, rows: [] };
        const { start, end } = todayRange();
        const { data, error } = await window.sb
            .from('walk_in_booking')
            .select('*')
            .eq('courts', courtName)
            .gte('time_date', start.toISOString())
            .lt('time_date', end.toISOString());
        if (error) {
            console.error('[staff] failed to load walk-ins for the walk-in time pickers', error);
            return { ok: false, rows: [] };
        }
        return { ok: true, rows: data || [] };
    }

    function isWalkinHourPast(hour) {
        const { start } = todayRange();
        return hourWindow(hour, start).start.getTime() < Date.now();
    }

    // Bookings match the same "same unit, or both no-unit" rule
    // includes/Dashboard.js's isSlotHourBooked() uses. Walk-ins differ per
    // decision S3: a walk-in with NO recorded unit blocks every unit of
    // that court (it can't be narrowed down — safer to over-block than
    // risk a double-booking); a walk-in WITH a unit only blocks that unit.
    function isWalkinHourBooked(hour) {
        const { start } = todayRange();
        const slot = hourWindow(hour, start);
        const currentUnit = walkinState.unit || '';

        if (walkinBookings.ok) {
            const bookingMatch = walkinBookings.rows.some((row) => {
                if ((row.court_unit || '') !== currentUnit) return false;
                return windowsOverlap(rowWindow(row), slot);
            });
            if (bookingMatch) return true;
        }

        if (walkinWalkins.ok) {
            return walkinWalkins.rows.some((row) => {
                const rowUnit = row.court_unit || '';
                if (!rowUnit) return windowsOverlap(rowWindow(row), slot);
                return rowUnit === currentUnit && windowsOverlap(rowWindow(row), slot);
            });
        }
        return false;
    }

    function walkinSlotStatus(hour) {
        if (isWalkinHourPast(hour)) return 'past';
        if (isWalkinHourBooked(hour)) return 'booked';
        return 'available';
    }

    function computeWalkinFreeWindows() {
        if (!window.InigoBusinessHours) return [];
        const hours = window.InigoBusinessHours.hoursRange();
        const windows = [];
        let runStart = null;
        hours.forEach((hour) => {
            if (walkinSlotStatus(hour) === 'available') {
                if (runStart === null) runStart = hour;
            } else if (runStart !== null) {
                windows.push({ startHour: runStart, endHourExclusive: hour });
                runStart = null;
            }
        });
        if (runStart !== null) windows.push({ startHour: runStart, endHourExclusive: window.InigoBusinessHours.CLOSE_HOUR });
        return windows;
    }

    function renderWalkinTimePickers() {
        if (!walkinFromSelect || !walkinToSelect || !window.InigoBusinessHours) return;

        if (!walkinState.court) {
            walkinFromSelect.innerHTML = '<option value="">Select a sport first</option>';
            walkinToSelect.innerHTML = '<option value="">Select a sport first</option>';
            walkinFromSelect.disabled = true;
            walkinToSelect.disabled = true;
            if (walkinOpenWindowsEl) walkinOpenWindowsEl.textContent = 'Select a sport first.';
            renderWalkinWizard();
            return;
        }

        if (!walkinBookings.ok || !walkinWalkins.ok) {
            walkinFromSelect.innerHTML = '<option value="">Unavailable</option>';
            walkinToSelect.innerHTML = '<option value="">Unavailable</option>';
            walkinFromSelect.disabled = true;
            walkinToSelect.disabled = true;
            if (walkinOpenWindowsEl) walkinOpenWindowsEl.textContent = 'Could not check live availability right now — please try again.';
            renderWalkinWizard();
            return;
        }

        const fmt = window.InigoBusinessHours.formatHourLabel;
        const windows = computeWalkinFreeWindows();

        if (windows.length === 0) {
            walkinFromSelect.innerHTML = '<option value="">No times available</option>';
            walkinToSelect.innerHTML = '<option value="">No times available</option>';
            walkinFromSelect.disabled = true;
            walkinToSelect.disabled = true;
            walkinState.startHour = null;
            walkinState.endHour = null;
            if (walkinOpenWindowsEl) {
                const noneBooked = window.InigoBusinessHours.hoursRange().every((h) => walkinSlotStatus(h) !== 'booked');
                walkinOpenWindowsEl.textContent = noneBooked ? 'No more times available today.' : 'Fully booked today.';
            }
            renderWalkinWizard();
            return;
        }

        const freeHours = [];
        windows.forEach((w) => { for (let h = w.startHour; h < w.endHourExclusive; h++) freeHours.push(h); });
        if (walkinState.startHour !== null && !freeHours.includes(walkinState.startHour)) {
            walkinState.startHour = null;
            walkinState.endHour = null;
        }

        walkinFromSelect.disabled = false;
        const fromPlaceholder = `<option value=""${walkinState.startHour === null ? ' selected' : ''} disabled>Select a start time</option>`;
        const fromOptions = freeHours.map((h) => `<option value="${h}"${h === walkinState.startHour ? ' selected' : ''}>${window.escapeHtml(fmt(h))}</option>`).join('');
        walkinFromSelect.innerHTML = fromPlaceholder + fromOptions;

        if (walkinState.startHour === null) {
            walkinToSelect.innerHTML = '<option value="" selected disabled>Select a start time first</option>';
            walkinToSelect.disabled = true;
        } else {
            const run = windows.find((w) => walkinState.startHour >= w.startHour && walkinState.startHour < w.endHourExclusive);
            const runEndExclusive = run ? run.endHourExclusive : walkinState.startHour + 1;
            const toPlaceholder = `<option value=""${walkinState.endHour === null ? ' selected' : ''} disabled>Select an end time</option>`;
            const toOptions = [];
            for (let endExclusive = walkinState.startHour + 1; endExclusive <= runEndExclusive; endExclusive++) {
                const endHourValue = endExclusive - 1;
                toOptions.push(`<option value="${endHourValue}"${endHourValue === walkinState.endHour ? ' selected' : ''}>${window.escapeHtml(fmt(endExclusive))}</option>`);
            }
            walkinToSelect.innerHTML = toPlaceholder + toOptions.join('');
            walkinToSelect.disabled = false;
        }

        if (walkinOpenWindowsEl) {
            const windowLabels = windows.map((w) => `${fmt(w.startHour)} – ${fmt(w.endHourExclusive)}`).join(', ');
            walkinOpenWindowsEl.textContent = `Open today: ${windowLabels}`;
        }
        renderWalkinWizard();
    }

    if (walkinFromSelect) {
        walkinFromSelect.addEventListener('change', () => {
            const value = walkinFromSelect.value;
            walkinState.startHour = value === '' ? null : Number(value);
            walkinState.endHour = null;
            renderWalkinTimePickers();
            updateWalkinSummary();
        });
    }
    if (walkinToSelect) {
        walkinToSelect.addEventListener('change', () => {
            const value = walkinToSelect.value;
            walkinState.endHour = value === '' ? null : Number(value);
            renderWalkinWizard();
            updateWalkinSummary();
        });
    }

    async function refreshWalkinTimePickers() {
        if (!walkinFromSelect || !walkinToSelect) return;
        if (!walkinState.court) { renderWalkinTimePickers(); return; }

        const mySeq = ++walkinRequestSeq;
        walkinFromSelect.innerHTML = '<option value="">Checking availability…</option>';
        walkinToSelect.innerHTML = '<option value="">Checking availability…</option>';
        walkinFromSelect.disabled = true;
        walkinToSelect.disabled = true;
        if (walkinOpenWindowsEl) walkinOpenWindowsEl.textContent = 'Checking availability…';

        const [bookingsRes, walkinsRes] = await Promise.all([
            fetchWalkinBookingsForCourt(walkinState.court.name),
            fetchWalkinWalkinsForCourt(walkinState.court.name),
        ]);
        if (mySeq !== walkinRequestSeq) return; // a newer refresh already owns the pickers
        walkinBookings = bookingsRes;
        walkinWalkins = walkinsRes;
        renderWalkinTimePickers();
    }

    function resetWalkinTimeSelectionAndRefresh() {
        walkinState.startHour = null;
        walkinState.endHour = null;
        refreshWalkinTimePickers();
    }

    // ---- Step 4 — Payment ----
    walkinPaymentOptionEls.forEach((option) => {
        option.addEventListener('click', () => {
            const radio = option.querySelector('input[type="radio"]');
            if (!radio) return;
            walkinPaymentOptionEls.forEach((o) => o.classList.remove('is-selected'));
            option.classList.add('is-selected');
            radio.checked = true;
            walkinState.payment = radio.dataset.staffPayment;
            updateWalkinSummary();
        });
    });

    // ---- Step 5 — Review & save ----
    function walkinHoursSelected() {
        if (walkinState.startHour === null) return 0;
        const effectiveEnd = walkinState.endHour !== null ? walkinState.endHour : walkinState.startHour;
        return effectiveEnd - walkinState.startHour + 1;
    }

    function walkinTimeRangeLabel() {
        const hours = walkinHoursSelected();
        if (hours === 0 || !window.InigoBusinessHours) return null;
        const effectiveEnd = walkinState.endHour !== null ? walkinState.endHour : walkinState.startHour;
        const fmt = window.InigoBusinessHours.formatHourLabel;
        return `${fmt(walkinState.startHour)} – ${fmt(effectiveEnd + 1)} · ${hours} hr${hours === 1 ? '' : 's'}`;
    }

    function updateWalkinSummary() {
        const hours = walkinHoursSelected();
        const court = walkinState.court;
        const hasRate = Boolean(court && court.rate !== null && court.rate !== undefined);
        const amount = hasRate && hours > 0 ? court.rate * hours : null;

        if (walkinSummaryName) walkinSummaryName.textContent = walkinState.name || '—';
        if (walkinSummaryMobile) walkinSummaryMobile.textContent = walkinState.mobile || 'Not provided';
        if (walkinSummaryCourt) {
            const unitPart = walkinState.unit ? ` · ${walkinState.unit}` : '';
            walkinSummaryCourt.textContent = court ? `${court.name}${unitPart}` : '—';
        }
        if (walkinSummaryTime) walkinSummaryTime.textContent = walkinTimeRangeLabel() || '— Select a time —';
        if (walkinSummaryRateLabel) walkinSummaryRateLabel.textContent = hasRate ? `₱${court.rate}${court.rateUnit || '/hr'} × ${hours} hr${hours === 1 ? '' : 's'}` : 'Rate';
        if (walkinSummaryRate) walkinSummaryRate.textContent = hasRate ? `₱${court.rate}${court.rateUnit || '/hr'}` : 'Rate TBA';
        if (walkinSummaryPayment) walkinSummaryPayment.textContent = walkinState.payment === 'online' ? 'Online payment' : 'Cash';
        if (walkinSummaryTotal) walkinSummaryTotal.textContent = amount !== null ? `₱${amount.toFixed(2)}` : 'Rate TBA';
    }

    // ---- Receipt (S4) — same store-receipt/ticket look as the customer
    // dashboard's .dash-receipt-card (includes/Dashboard.js's
    // renderReceiptCard()/downloadReceiptAsPng()), ported under
    // staff-receipt-* names. ----
    function formatWalkinDateLabel(iso) {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function renderStaffReceipt(receipt) {
        if (!walkinReceiptEl) return;
        const hasRate = receipt.rate !== null && receipt.rate !== undefined;
        const amount = hasRate ? receipt.rate * receipt.hours : null;
        const rateLineLabel = hasRate
            ? `₱${Number(receipt.rate).toFixed(2)}${receipt.rateUnit || '/hr'} × ${receipt.hours} hr${receipt.hours === 1 ? '' : 's'}`
            : 'Amount';
        const rateLineAmount = hasRate ? `₱${amount.toFixed(2)}` : 'Rate TBA';
        const totalAmount = hasRate ? `₱${amount.toFixed(2)}` : '—';
        const idAttr = window.escapeHtml(String(receipt.id));
        const courtLabel = receipt.unit ? `${receipt.courtName} · ${receipt.unit}` : receipt.courtName;

        walkinReceiptEl.innerHTML = `
            <div class="staff-receipt-card" data-staff-receipt-card>
                <div class="staff-receipt-brand">
                    <span class="staff-receipt-brand-name">IñigoSync</span>
                    <span class="staff-receipt-brand-tag">Walk-in receipt</span>
                </div>
                <p class="staff-receipt-no">Walk-in receipt #${idAttr}</p>

                <div class="staff-receipt-divider"></div>

                <div class="staff-receipt-top">
                    <h4>${window.escapeHtml(courtLabel)}</h4>
                </div>

                <div class="staff-receipt-meta">
                    <div class="staff-summary-row"><span>Customer</span><strong>${window.escapeHtml(receipt.customerName)}</strong></div>
                    ${receipt.customerMobile ? `<div class="staff-summary-row"><span>Mobile</span><strong>${window.escapeHtml(receipt.customerMobile)}</strong></div>` : ''}
                    <div class="staff-summary-row"><span>Date</span><strong>${window.escapeHtml(formatWalkinDateLabel(receipt.startIso))}</strong></div>
                    <div class="staff-summary-row"><span>Time</span><strong>${window.escapeHtml(formatIsoTime12h(receipt.startIso))} – ${window.escapeHtml(formatIsoTime12h(receipt.endIso))}</strong></div>
                </div>

                <div class="staff-receipt-divider"></div>

                <div class="staff-receipt-meta">
                    <div class="staff-summary-row"><span>${window.escapeHtml(rateLineLabel)}</span><strong>${window.escapeHtml(rateLineAmount)}</strong></div>
                    <div class="staff-summary-row"><span>Payment method</span><strong>${window.escapeHtml(receipt.paymentLabel)}</strong></div>
                </div>

                <div class="staff-receipt-total">
                    <span>Total</span>
                    <span>${window.escapeHtml(totalAmount)}</span>
                </div>

                <div class="staff-receipt-divider"></div>

                <p class="staff-receipt-thanks">Thank you for visiting Iñigos Sports Center!</p>

                <div class="staff-receipt-actions">
                    <button type="button" class="staff-btn-primary" data-staff-receipt-download="${idAttr}">Download PNG</button>
                    <button type="button" class="staff-btn-ghost" data-staff-receipt-print>Print</button>
                    <button type="button" class="staff-btn-ghost" data-staff-walkin-reset>New walk-in</button>
                </div>
            </div>
        `;
    }

    function canvasToBlobAsyncStaff(canvas) {
        return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    }

    // Same canvas.toBlob() + programmatic <a download> approach as
    // includes/Dashboard.js's downloadReceiptAsPng() — reliable across
    // device types, unlike piping canvas.toDataURL() straight into a link.
    async function downloadStaffReceiptAsPng(card, filenameId) {
        if (!window.html2canvas) {
            window.InigoToast?.show("Download isn't available right now — please refresh and try again.", true);
            return false;
        }
        card.classList.add('is-capturing');
        try {
            const canvas = await window.html2canvas(card, {
                backgroundColor: null,
                scale: Math.min(window.devicePixelRatio || 1, 2) || 1,
                useCORS: true,
            });
            const blob = await canvasToBlobAsyncStaff(canvas);
            if (!blob) throw new Error('canvas.toBlob returned no data');

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `inigosync-walkin-receipt-${filenameId}.png`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 4000);
            return true;
        } catch (err) {
            console.error('[staff] receipt PNG download failed', err);
            window.InigoToast?.show('Could not generate the receipt image. Please try again.', true);
            return false;
        } finally {
            card.classList.remove('is-capturing');
        }
    }

    function resetWalkinWizard() {
        const courts = walkinState.courts;
        walkinState = { name: '', mobile: '', mobileError: false, courts, court: null, unit: null, startHour: null, endHour: null, payment: 'cash' };
        if (walkinNameInput) walkinNameInput.value = '';
        if (walkinMobileInput) walkinMobileInput.value = '';
        if (walkinUnitWrap) walkinUnitWrap.hidden = true;
        renderWalkinSportChips();
        walkinBookings = { ok: true, rows: [] };
        walkinWalkins = { ok: true, rows: [] };
        renderWalkinTimePickers();
        walkinPaymentOptionEls.forEach((option) => {
            const radio = option.querySelector('input[type="radio"]');
            const isCash = Boolean(radio && radio.dataset.staffPayment === 'cash');
            option.classList.toggle('is-selected', isCash);
            if (radio) radio.checked = isCash;
        });
        updateWalkinSummary();
        goToWalkinStep(1);
    }

    if (walkinSaveBtn) {
        walkinSaveBtn.addEventListener('click', async () => {
            if (!window.sb || !window.inigosyncProfile) {
                window.InigoToast?.show('Unable to reach the server right now. Please try again shortly.', true);
                return;
            }
            if (!walkinState.name) { window.InigoToast?.show("Enter the customer's name.", true); goToWalkinStep(1); return; }
            if (!walkinState.court) { window.InigoToast?.show('Select a sport/court.', true); goToWalkinStep(2); return; }
            if (walkinState.startHour === null || walkinState.endHour === null) { window.InigoToast?.show('Select a start and end time.', true); goToWalkinStep(3); return; }

            // Re-check availability immediately before inserting (same
            // "re-fetch right before submit" guard as includes/Dashboard.js's
            // bookSubmit) — walk_in_booking has no database-level EXCLUDE
            // constraint of its own (database/schema/012_booking_time_range.sql's
            // own header note on why it doesn't cover this table), so this
            // app-level recheck is the only guard a walk-in gets.
            const [recheckBookings, recheckWalkins] = await Promise.all([
                fetchWalkinBookingsForCourt(walkinState.court.name),
                fetchWalkinWalkinsForCourt(walkinState.court.name),
            ]);
            if (recheckBookings.ok) walkinBookings = recheckBookings;
            if (recheckWalkins.ok) walkinWalkins = recheckWalkins;
            let conflict = false;
            if (walkinBookings.ok && walkinWalkins.ok) {
                for (let h = walkinState.startHour; h <= walkinState.endHour; h++) {
                    if (isWalkinHourBooked(h)) { conflict = true; break; }
                }
            }
            if (conflict) {
                window.InigoToast?.show('That time was just taken — please pick another time.', true);
                walkinState.startHour = null;
                walkinState.endHour = null;
                renderWalkinTimePickers();
                updateWalkinSummary();
                goToWalkinStep(3);
                return;
            }

            const hours = walkinState.endHour - walkinState.startHour + 1;
            const todayStr = todayDateInputValue();
            const startIso = new Date(`${todayStr}T${String(walkinState.startHour).padStart(2, '0')}:00:00`).toISOString();
            const endIso = new Date(`${todayStr}T${String(walkinState.endHour + 1).padStart(2, '0')}:00:00`).toISOString();
            const paymentLabel = walkinState.payment === 'online' ? 'Online payment' : 'Cash';

            const fullPayload = {
                staff_id: window.inigosyncProfile.id,
                sports: walkinState.court.sportName || walkinState.court.name,
                courts: walkinState.court.name,
                court_unit: walkinState.unit || null,
                customer_name: walkinState.name,
                customer_mobile: walkinState.mobile || null,
                time_date: startIso,
                end_at: endIso,
                duration_minutes: hours * 60,
                payment_method: paymentLabel,
                status: 'pending',
                payment_id: null,
            };

            walkinSaveBtn.disabled = true;
            walkinSaveBtn.textContent = 'Saving…';

            // court_unit/end_at/payment_method only exist once
            // database/schema/016_walkin_checkin.sql is applied — try
            // including them first, and fall back to the pre-migration
            // insert shape (customer_name/customer_mobile/duration_minutes
            // already exist per 004_staff_module.sql) if that's specifically
            // what fails, same "never fake success" schema-mismatch retry
            // idiom this file has always used for walk-in inserts.
            let { data, error } = await window.sb.from('walk_in_booking').insert(fullPayload).select();
            let usedReducedPayload = false;
            if (error && isSchemaMismatchError(error)) {
                const reducedPayload = {
                    staff_id: fullPayload.staff_id,
                    sports: fullPayload.sports,
                    courts: fullPayload.courts,
                    customer_name: fullPayload.customer_name,
                    customer_mobile: fullPayload.customer_mobile,
                    time_date: fullPayload.time_date,
                    duration_minutes: fullPayload.duration_minutes,
                    status: fullPayload.status,
                    payment_id: fullPayload.payment_id,
                };
                ({ data, error } = await window.sb.from('walk_in_booking').insert(reducedPayload).select());
                usedReducedPayload = true;
            }

            walkinSaveBtn.disabled = false;
            walkinSaveBtn.textContent = 'Save Walk-In';

            if (error) {
                window.InigoToast?.show(error.message || 'Could not record this walk-in.', true);
                return;
            }

            const savedRow = (data && data[0]) || null;
            const idField = savedRow ? walkinIdField(savedRow) : null;
            const receiptId = (savedRow && idField) ? savedRow[idField] : Date.now();

            writeAuditLog('walkin_recorded', 'walk_in_booking', idField ? String(savedRow[idField]) : null, { customerName: walkinState.name, court: walkinState.court.name });

            window.InigoToast?.show(usedReducedPayload
                ? 'Walk-in recorded — court/unit, end time, and payment method need a database update to be saved (see database/schema/016_walkin_checkin.sql).'
                : 'Walk-in recorded.');

            renderStaffReceipt({
                id: receiptId,
                customerName: walkinState.name,
                customerMobile: walkinState.mobile || null,
                courtName: walkinState.court.name,
                unit: walkinState.unit,
                startIso,
                endIso,
                hours,
                rate: (walkinState.court.rate !== null && walkinState.court.rate !== undefined) ? walkinState.court.rate : null,
                rateUnit: walkinState.court.rateUnit || '/hr',
                paymentLabel,
            });

            if (walkinWizardWrap) walkinWizardWrap.hidden = true;
            if (walkinReceiptWrap) walkinReceiptWrap.hidden = false;

            refreshBookingOverview();
            refreshCourtSchedule();
            refreshTransactions();
            refreshStaffNotifications();
        });
    }

    // Event delegation — the receipt markup is fully replaced on every
    // save, so this binds once on the never-replaced wrapper instead of on
    // the buttons themselves.
    if (walkinReceiptWrap) {
        walkinReceiptWrap.addEventListener('click', async (e) => {
            const downloadBtn = e.target.closest('[data-staff-receipt-download]');
            const printBtn = e.target.closest('[data-staff-receipt-print]');
            const resetBtn = e.target.closest('[data-staff-walkin-reset]');

            if (downloadBtn) {
                const card = downloadBtn.closest('.staff-receipt-card');
                if (!card) return;
                const original = downloadBtn.textContent;
                downloadBtn.disabled = true;
                downloadBtn.textContent = 'Preparing…';
                const ok = await downloadStaffReceiptAsPng(card, downloadBtn.dataset.staffReceiptDownload || 'receipt');
                downloadBtn.disabled = false;
                downloadBtn.textContent = original;
                if (ok) window.InigoToast?.show('Receipt downloaded.');
                return;
            }
            if (printBtn) {
                window.print();
                return;
            }
            if (resetBtn) {
                if (walkinWizardWrap) walkinWizardWrap.hidden = false;
                if (walkinReceiptWrap) walkinReceiptWrap.hidden = true;
                resetWalkinWizard();
            }
        });
    }

    renderWalkinWizard();
    updateWalkinSummary();
    renderWalkinTimePickers();

    // ------------------------------------------------------------------
    // Court Schedule — Revision S1, decision S5. Per-unit hourly
    // availability grid for a chosen date (default/min today), replacing
    // the old fixed 2-hour/all-courts-as-columns CSS grid. One row per
    // UNIT of the selected sport (resolveCourtUnits()); "All Courts" lists
    // every unit of every sport, each row prefixed with its court name.
    // ------------------------------------------------------------------
    const scheduleDateInput = document.querySelector('[data-staff-schedule-date]');
    const scheduleSportTabs = document.querySelector('[data-staff-sport-tabs]');
    const scheduleTable = document.querySelector('[data-staff-schedule-grid]');

    let scheduleActiveSport = 'all';
    let scheduleDate = todayDateInputValue();
    let scheduleCourtsCache = [];
    let scheduleBookingsCache = [];
    let scheduleWalkinsCache = [];
    let scheduleNameMap = new Map();

    if (scheduleDateInput) {
        scheduleDateInput.min = todayDateInputValue();
        scheduleDateInput.value = scheduleDate;
        scheduleDateInput.addEventListener('change', () => {
            const minStr = todayDateInputValue();
            if (scheduleDateInput.value < minStr) {
                scheduleDateInput.value = minStr;
                window.InigoToast?.show("You can't view a date in the past — showing today instead.", true);
            }
            scheduleDate = scheduleDateInput.value;
            refreshCourtSchedule();
        });
    }

    // Groups active court rows by sport, then flattens each court's units
    // (resolveCourtUnits()) into one row per unit. A row is prefixed with
    // its court's own name whenever more than one court row shares a sport
    // (Bowling's Duckpin/Ten-Pin) or the view is "All Courts" — otherwise
    // (the common case: one court per sport) the unit label alone is
    // enough context.
    function scheduleRowsForSport(sportSlug, courts) {
        if (!window.InigoCourtsData) return [];
        const matching = sportSlug === 'all' ? courts : courts.filter((c) => c.sportSlug === sportSlug);

        const bySport = new Map();
        matching.forEach((c) => {
            const key = c.sportSlug || c.sportName || c.name;
            if (!bySport.has(key)) bySport.set(key, []);
            bySport.get(key).push(c);
        });

        const rows = [];
        matching.forEach((court) => {
            const key = court.sportSlug || court.sportName || court.name;
            const siblingCount = bySport.get(key).length;
            const { units } = window.InigoCourtsData.resolveCourtUnits(court);
            units.forEach((unit, i) => {
                const unitValue = unit.label || '';
                const displayUnit = unit.label || court.name;
                const rowLabel = (sportSlug === 'all' || siblingCount > 1) ? `${court.name} — ${displayUnit}` : displayUnit;
                rows.push({ court, unitValue, rowLabel, key: `${court.id}:${i}` });
            });
        });
        return rows;
    }

    function scheduleTooltipFor(row, sourceLabel, nameOverride) {
        const name = nameOverride || scheduleNameMap.get(String(row.customer_id)) || 'Customer';
        const { start, end } = rowWindow(row);
        const startLabel = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const endLabel = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        return `${name} (${sourceLabel}) ${startLabel}–${endLabel}`;
    }

    // Past takes priority over booked (same precedence
    // includes/Dashboard.js's own slotHourStatus() uses for the Overview
    // peek strip) — an elapsed hour reads as past regardless of whether it
    // was ever booked.
    function scheduleCellInfo(row, hour, dateBase, bookings, walkins) {
        const slot = hourWindow(hour, dateBase);
        if (scheduleDate === todayDateInputValue() && slot.start.getTime() < Date.now()) {
            return { cls: 'is-past', title: '' };
        }

        const bookingMatch = bookings.find((b) => {
            const status = String(b.status || '').toLowerCase();
            if (status !== 'pending' && status !== 'confirmed') return false;
            if (String(b.courts || '') !== row.court.name) return false;
            if ((b.court_unit || '') !== row.unitValue) return false;
            return windowsOverlap(rowWindow(b), slot);
        });
        if (bookingMatch) return { cls: 'is-booked', title: scheduleTooltipFor(bookingMatch, 'Online') };

        const walkinMatch = walkins.find((w) => {
            if (String(w.courts || '') !== row.court.name) return false;
            const rowUnit = w.court_unit || '';
            if (rowUnit && rowUnit !== row.unitValue) return false;
            return windowsOverlap(rowWindow(w), slot);
        });
        if (walkinMatch) return { cls: 'is-booked', title: scheduleTooltipFor(walkinMatch, 'Walk-in', walkinMatch.customer_name || 'Walk-in customer') };

        return { cls: 'is-open', title: '' };
    }

    function renderCourtSchedule(courts, bookings, walkins) {
        if (!scheduleTable || !window.InigoCourtsData || !window.InigoBusinessHours) return;
        const hours = window.InigoBusinessHours.hoursRange();
        const dateBase = new Date(`${scheduleDate}T00:00:00`);
        const rows = scheduleRowsForSport(scheduleActiveSport, courts);

        const thead = scheduleTable.querySelector('thead');
        const tbody = scheduleTable.querySelector('tbody');
        if (!thead || !tbody) return;

        thead.innerHTML = `<tr><th>Court / Unit</th>${hours.map((h) => `<th>${window.escapeHtml(window.InigoBusinessHours.formatHourRangeLabelShort(h))}</th>`).join('')}<th>Open hours</th></tr>`;

        if (rows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${hours.length + 2}" style="text-align:center; color: var(--color-ink-faint);">No courts to show.</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map((row) => {
            let openCount = 0;
            const cells = hours.map((hour) => {
                const info = scheduleCellInfo(row, hour, dateBase, bookings, walkins);
                if (info.cls === 'is-open') openCount += 1;
                const titleAttr = info.title ? ` title="${window.escapeHtml(info.title)}"` : '';
                const label = info.cls === 'is-booked' ? 'Booked' : (info.cls === 'is-past' ? '—' : 'Open');
                return `<td class="staff-schedule-cell ${info.cls}"${titleAttr}>${label}</td>`;
            }).join('');
            return `<tr><td>${window.escapeHtml(row.rowLabel)}</td>${cells}<td class="staff-schedule-trailer">${openCount} open hour${openCount === 1 ? '' : 's'}</td></tr>`;
        }).join('');
    }

    async function renderScheduleSportTabs() {
        if (!scheduleSportTabs || !window.InigoCourtsData) return;
        const sports = await window.InigoCourtsData.getSports();
        const chips = ['<button type="button" class="staff-chip is-active" data-staff-chip data-staff-sport="all">All Courts</button>']
            .concat(sports.map((s) => `<button type="button" class="staff-chip" data-staff-chip data-staff-sport="${window.escapeHtml(s.slug)}">${window.escapeHtml(s.name)}</button>`));
        scheduleSportTabs.innerHTML = chips.join('');
        scheduleActiveSport = 'all';

        scheduleSportTabs.querySelectorAll('[data-staff-chip]').forEach((chip) => {
            chip.addEventListener('click', () => {
                scheduleSportTabs.querySelectorAll('[data-staff-chip]').forEach((c) => c.classList.remove('is-active'));
                chip.classList.add('is-active');
                scheduleActiveSport = chip.dataset.staffSport;
                renderCourtSchedule(scheduleCourtsCache, scheduleBookingsCache, scheduleWalkinsCache);
            });
        });
    }

    async function refreshCourtSchedule() {
        if (!scheduleTable || !window.sb || !window.InigoCourtsData) return;

        const dateBase = new Date(`${scheduleDate}T00:00:00`);
        const dayEnd = new Date(dateBase.getTime() + 24 * 60 * 60 * 1000);

        const [courts, bookingsRes, walkinsRes] = await Promise.all([
            window.InigoCourtsData.getCourts(),
            window.sb.from('booking').select('*').gte('time_date', dateBase.toISOString()).lt('time_date', dayEnd.toISOString()),
            window.sb.from('walk_in_booking').select('*').gte('time_date', dateBase.toISOString()).lt('time_date', dayEnd.toISOString()),
        ]);

        if (bookingsRes.error) console.error('[staff] failed to load bookings for the schedule', bookingsRes.error);
        if (walkinsRes.error) console.error('[staff] failed to load walk-ins for the schedule', walkinsRes.error);
        const bookings = bookingsRes.error ? [] : (bookingsRes.data || []);
        const walkins = walkinsRes.error ? [] : (walkinsRes.data || []);

        scheduleNameMap = await fetchProfileNamesByIds(bookings.map((b) => b.customer_id));

        scheduleCourtsCache = courts;
        scheduleBookingsCache = bookings;
        scheduleWalkinsCache = walkins;
        renderCourtSchedule(courts, bookings, walkins);
    }

    renderScheduleSportTabs();
    refreshCourtSchedule();
    document.addEventListener('inigosync:profile-ready', refreshCourtSchedule);

    // ------------------------------------------------------------------
    // Transaction Records — Revision S1, decision S6. A time-in log:
    // bookings + walk-ins for a chosen date range (default today..today),
    // union, newest first, with Timed in/Timed out columns. `audit_log` is
    // no longer read here (see writeAuditLog() above — kept only as a
    // best-effort write helper); every value below comes straight from the
    // real booking/walk_in_booking rows via the same staffDerivedStatus()/
    // mergeBookingRows() Booking Overview uses, so the two panels can never
    // disagree about a row's status.
    // ------------------------------------------------------------------
    const transactionsTableBody = document.querySelector('[data-staff-table="transactions"] tbody');
    const txFromInput = document.querySelector('[data-staff-tx-from]');
    const txToInput = document.querySelector('[data-staff-tx-to]');

    if (txFromInput) txFromInput.value = todayDateInputValue();
    if (txToInput) txToInput.value = todayDateInputValue();
    if (txFromInput) txFromInput.addEventListener('change', refreshTransactions);
    if (txToInput) txToInput.addEventListener('change', refreshTransactions);

    async function refreshTransactions() {
        if (!transactionsTableBody || !window.sb) return;

        const fromStr = (txFromInput && txFromInput.value) || todayDateInputValue();
        const toStr = (txToInput && txToInput.value) || todayDateInputValue();
        const rangeStart = new Date(`${fromStr}T00:00:00`);
        const rangeEndExclusive = new Date(new Date(`${toStr}T00:00:00`).getTime() + 24 * 60 * 60 * 1000);

        const [bookingsRes, walkinsRes] = await Promise.all([
            window.sb.from('booking').select('*').gte('time_date', rangeStart.toISOString()).lt('time_date', rangeEndExclusive.toISOString()),
            window.sb.from('walk_in_booking').select('*').gte('time_date', rangeStart.toISOString()).lt('time_date', rangeEndExclusive.toISOString()),
        ]);

        if (bookingsRes.error && walkinsRes.error) {
            console.error('[staff] failed to load transaction records', bookingsRes.error, walkinsRes.error);
            transactionsTableBody.innerHTML = '<tr><td colspan="9" style="text-align:center; color: var(--color-ink-faint);">Could not load transaction records right now.</td></tr>';
            return;
        }
        if (bookingsRes.error) console.error('[staff] failed to load bookings for transactions', bookingsRes.error);
        if (walkinsRes.error) console.error('[staff] failed to load walk-ins for transactions', walkinsRes.error);

        const bookings = bookingsRes.error ? [] : (bookingsRes.data || []);
        const walkins = walkinsRes.error ? [] : (walkinsRes.data || []);
        const merged = mergeBookingRows(bookings, walkins);
        merged.sort((a, b) => new Date(b.time_date) - new Date(a.time_date)); // newest first (S6) — Overview sorts ascending instead

        const nameMap = await fetchProfileNamesByIds(merged.filter((r) => r.sourceType === 'booking').map((r) => r.customerId));
        merged.forEach((r) => {
            if (r.sourceType === 'booking') r.customerName = nameMap.get(String(r.customerId)) || 'Customer';
        });

        transactionsTableBody.innerHTML = '';
        if (merged.length === 0) {
            transactionsTableBody.innerHTML = '<tr><td colspan="9" style="text-align:center; color: var(--color-ink-faint);">No transactions in this date range.</td></tr>';
            wireFilterableTable('transactions');
            return;
        }

        merged.forEach((row) => {
            const status = staffDerivedStatus(row);
            const { end } = rowWindow(row);
            const timedIn = row.checked_in_at ? formatIsoTime12h(row.checked_in_at) : '—';
            // "Timed out" is DERIVED (S6) — the end-of-booking time once the
            // session is Completed (checked in AND now >= end); never a
            // real checked_out_at write (S1's "auto time-out" rule).
            const timedOut = status === 'completed' ? formatIsoTime12h(end.toISOString()) : '—';
            const fallbackName = row.sourceType === 'walkin' ? 'Walk-in customer' : 'Customer';

            const tr = document.createElement('tr');
            tr.dataset.status = row.sourceType; // source filter chips (all/online/walkin) key off this
            tr.innerHTML = `
                <td>${window.escapeHtml(new Date(row.time_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}</td>
                <td class="staff-cell-main">${window.escapeHtml(row.customerName || fallbackName)}</td>
                <td>${window.escapeHtml(row.courts || '—')}${row.unit ? `<span class="staff-cell-sub">${window.escapeHtml(row.unit)}</span>` : ''}</td>
                <td>${window.escapeHtml(formatIsoTime12h(row.time_date))} – ${window.escapeHtml(formatIsoTime12h(end.toISOString()))}</td>
                <td><span class="staff-status ${row.sourceType === 'walkin' ? 'walkin' : 'online'}">${row.sourceType === 'walkin' ? 'Walk-in' : 'Online'}</span></td>
                <td>${window.escapeHtml(row.payment || '—')}</td>
                <td>${window.escapeHtml(timedIn)}</td>
                <td>${window.escapeHtml(timedOut)}</td>
                <td><span class="staff-status ${window.escapeHtml(status)}">${window.escapeHtml(staffStatusLabel(status))}</span></td>
            `;
            transactionsTableBody.appendChild(tr);
        });

        wireFilterableTable('transactions');
    }

    refreshTransactions();
    document.addEventListener('inigosync:profile-ready', refreshTransactions);

    // ------------------------------------------------------------------
    // Notifications — Revision S1, decision S8. Ported from the owner
    // dashboard's bell (includes/owner_dashboard.js's [data-admin-notif*])
    // under staff-* names: items = bookings starting in the next 60
    // minutes, bookings created today, and today's walk-ins; unread dot vs
    // localStorage; click -> Overview; refresh on load, on
    // 'inigosync:profile-ready', and every 60 s; closes on outside
    // click/Esc (and when the profile dropdown opens, and vice versa —
    // see closeProfileMenu()/setActivePanel() above).
    // ------------------------------------------------------------------
    const staffNotif = document.querySelector('[data-staff-notif]');
    const staffNotifTrigger = document.querySelector('[data-staff-notif-trigger]');
    const staffNotifList = document.querySelector('[data-staff-notif-list]');
    const staffNotifDot = document.querySelector('[data-staff-notif-dot]');
    const STAFF_NOTIF_SEEN_KEY = 'inigosync-staff-notif-seen';
    const STAFF_NOTIF_REFRESH_MS = 60000;
    const STAFF_NOTIF_SOON_MINUTES = 60;

    function closeStaffNotifMenu() {
        if (staffNotif) staffNotif.removeAttribute('data-open');
        if (staffNotifTrigger) staffNotifTrigger.setAttribute('aria-expanded', 'false');
    }

    let staffNotifLatestAt = null;

    function markStaffNotifSeen() {
        if (!staffNotifLatestAt) return;
        try { localStorage.setItem(STAFF_NOTIF_SEEN_KEY, staffNotifLatestAt); } catch (_) { /* best-effort only */ }
        if (staffNotifDot) staffNotifDot.hidden = true;
    }

    if (staffNotifTrigger && staffNotif) {
        staffNotifTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = staffNotif.hasAttribute('data-open');
            closeProfileMenu();
            if (isOpen) {
                closeStaffNotifMenu();
            } else {
                staffNotif.setAttribute('data-open', '');
                staffNotifTrigger.setAttribute('aria-expanded', 'true');
                markStaffNotifSeen();
            }
        });

        document.addEventListener('click', (e) => {
            if (!staffNotif.contains(e.target)) closeStaffNotifMenu();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeStaffNotifMenu();
        });
    }

    function renderStaffNotificationItem(item) {
        return `<button type="button" class="staff-notif-item" data-staff-notif-item>
            <span class="staff-notif-dot ${item.dotClass}"></span>
            <span class="staff-notif-item-body">
                <strong>${window.escapeHtml(item.title)}</strong>
                <span>${window.escapeHtml(item.body)}</span>
            </span>
        </button>`;
    }

    async function refreshStaffNotifications() {
        if (!staffNotifList || !window.sb) return;

        let soonRows = [];
        let newTodayRows = [];
        let walkinRows = [];
        let loadFailed = false;

        try {
            const { start: todayStart } = todayRange();
            const nowIso = new Date().toISOString();
            const soonIso = new Date(Date.now() + STAFF_NOTIF_SOON_MINUTES * 60000).toISOString();

            const [soonRes, newTodayRes, walkinRes] = await Promise.all([
                window.sb.from('booking').select('*')
                    .in('status', ['pending', 'confirmed'])
                    .gte('time_date', nowIso).lte('time_date', soonIso)
                    .order('time_date', { ascending: true }).limit(10),
                window.sb.from('booking').select('*')
                    .gte('created_at', todayStart.toISOString())
                    .order('created_at', { ascending: false }).limit(10),
                fetchTodayWalkins(),
            ]);

            if (!soonRes.error) soonRows = soonRes.data || [];
            else { console.error('[staff] failed to load starting-soon notifications', soonRes.error); loadFailed = true; }

            if (!newTodayRes.error) newTodayRows = newTodayRes.data || [];
            else { console.error('[staff] failed to load new-booking notifications', newTodayRes.error); loadFailed = true; }

            walkinRows = walkinRes.ok ? walkinRes.rows : [];
        } catch (err) {
            console.error('[staff] failed to load notifications', err);
            staffNotifList.innerHTML = '<p class="staff-notif-empty">Could not load notifications.</p>';
            return;
        }

        const nameMap = await fetchProfileNamesByIds([
            ...soonRows.map((b) => b.customer_id),
            ...newTodayRows.map((b) => b.customer_id),
        ]);

        const soonItems = soonRows.map((b) => ({
            dotClass: 'soon',
            createdAt: b.time_date,
            title: `${nameMap.get(String(b.customer_id)) || 'A customer'} starts soon`,
            body: `${b.courts || 'A court'}${b.court_unit ? ` · ${b.court_unit}` : ''} · ${formatIsoTime12h(b.time_date)}`,
        }));
        const newTodayItems = newTodayRows.map((b) => ({
            dotClass: 'booking',
            createdAt: b.created_at || b.time_date,
            title: `${nameMap.get(String(b.customer_id)) || 'A customer'} booked ${b.courts || 'a court'}`,
            body: `Today · ${formatIsoTime12h(b.time_date)}`,
        }));
        const walkinItems = walkinRows.map((w) => ({
            dotClass: 'walkin',
            createdAt: w.time_date,
            title: `${w.customer_name || 'A walk-in customer'} — walk-in`,
            body: `${w.courts || w.sports || 'A court'} · ${formatIsoTime12h(w.time_date)}`,
        }));

        const items = [...soonItems, ...newTodayItems, ...walkinItems]
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 15);

        staffNotifList.innerHTML = items.length || loadFailed
            ? `${loadFailed ? '<p class="staff-notif-empty">Couldn\'t load some notifications.</p>' : ''}${items.map(renderStaffNotificationItem).join('')}`
            : '<p class="staff-notif-empty">No notifications yet.</p>';

        staffNotifLatestAt = items.length ? items[0].createdAt : null;

        let lastSeen = null;
        try { lastSeen = localStorage.getItem(STAFF_NOTIF_SEEN_KEY); } catch (_) { /* ignore */ }
        const hasUnread = Boolean(staffNotifLatestAt) && (!lastSeen || new Date(staffNotifLatestAt) > new Date(lastSeen));
        if (staffNotifDot) staffNotifDot.hidden = !hasUnread;
    }

    if (staffNotifList) {
        staffNotifList.addEventListener('click', (e) => {
            if (e.target.closest('[data-staff-notif-item]')) {
                closeStaffNotifMenu();
                setActivePanel('overview');
            }
        });
    }

    refreshStaffNotifications();
    document.addEventListener('inigosync:profile-ready', refreshStaffNotifications);
    window.setInterval(refreshStaffNotifications, STAFF_NOTIF_REFRESH_MS);

    // ------------------------------------------------------------------
    // Profile panel — Revision S1, decision S7. Opened only from the
    // topbar dropdown's "View Profile" (data-staff-panel="profile" lives
    // outside .staff-nav, so setActivePanel() never highlights anything in
    // the sidebar for it). Paints every .staff-avatar (topbar + profile
    // hero), same img-vs-initials idiom as
    // includes/owner_dashboard.js's renderAdminProfile(). Name/contact
    // editing lives in Account Settings' Personal Information card below.
    // ------------------------------------------------------------------
    function renderStaffProfile(profile) {
        const initials = (profile.full_name || profile.email || '?')
            .split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
        const avatarUrl = profile.avatar_url || null;

        document.querySelectorAll('.staff-avatar').forEach((el) => {
            if (avatarUrl) {
                el.innerHTML = `<img class="staff-avatar-img" src="${window.escapeHtml(avatarUrl)}" alt="Profile photo">`;
            } else {
                el.textContent = initials;
            }
        });

        document.querySelectorAll('[data-staff-profile-name]').forEach((el) => { el.textContent = profile.full_name || 'Staff'; });

        const positionEl = document.querySelector('[data-staff-profile-position]');
        if (positionEl) positionEl.textContent = profile.position || '—';
        const emailEl = document.querySelector('[data-staff-profile-email]');
        if (emailEl) emailEl.textContent = profile.email || '—';
        const mobileEl = document.querySelector('[data-staff-profile-mobile]');
        if (mobileEl) mobileEl.textContent = profile.contact_num || '—';

        const nameInput = document.querySelector('[data-staff-settings-name]');
        const mobileInput = document.querySelector('[data-staff-settings-mobile]');
        if (nameInput) nameInput.value = profile.full_name || '';
        if (mobileInput) mobileInput.value = profile.contact_num || '';
    }

    document.addEventListener('inigosync:profile-ready', (e) => renderStaffProfile(e.detail));
    if (window.inigosyncProfile) renderStaffProfile(window.inigosyncProfile);

    // "Member since" — authGuard.js's shared profiles select (see that
    // file's own column list) does not include created_at, so this is a
    // small, separate, tolerate-failure fetch — "—" not-loaded-yet
    // convention, never a fake date.
    function formatStaffMemberSince(createdAt) {
        const d = new Date(createdAt);
        if (!createdAt || Number.isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    async function loadStaffProfileMemberSince() {
        const el = document.querySelector('[data-staff-profile-member-since]');
        if (!el || !window.sb || !window.inigosyncProfile) return;
        const { data, error } = await window.sb.from('profiles').select('created_at').eq('id', window.inigosyncProfile.id).single();
        el.textContent = (!error && data) ? formatStaffMemberSince(data.created_at) : '—';
    }

    document.addEventListener('inigosync:profile-ready', loadStaffProfileMemberSince);
    if (window.inigosyncProfile) loadStaffProfileMemberSince();

    // ------------------------------------------------------------------
    // Account Settings — Personal Information (Revision S1, decision S7 —
    // moved in from the old Staff Profile tab) + a 2-step Change Password
    // wizard (decision S9), ported from includes/owner_dashboard.js's
    // data-admin-pw-* under data-staff-pw-* names.
    // ------------------------------------------------------------------
    const staffSettingsSaveProfileBtn = document.querySelector('[data-staff-settings-save="profile"]');
    if (staffSettingsSaveProfileBtn) {
        staffSettingsSaveProfileBtn.addEventListener('click', async () => {
            if (!window.sb || !window.inigosyncProfile) return;
            const nameInput = document.querySelector('[data-staff-settings-name]');
            const mobileInput = document.querySelector('[data-staff-settings-mobile]');
            const full_name = nameInput ? nameInput.value.trim() : '';
            const mobileRaw = mobileInput ? mobileInput.value.trim() : '';

            if (!full_name) {
                window.InigoToast?.show('Enter your full name.', true);
                nameInput?.focus();
                return;
            }

            // Mobile is optional (a staff account's contact_num can be
            // blank) but validated the same way as everywhere else in this
            // app whenever a value IS entered.
            let contact_num = '';
            if (mobileRaw) {
                const check = window.validatePhMobile(mobileRaw);
                if (!check.valid) {
                    window.InigoToast?.show(check.message, true);
                    mobileInput?.focus();
                    return;
                }
                contact_num = check.normalized;
            }

            staffSettingsSaveProfileBtn.disabled = true;
            const { error } = await window.sb.from('profiles').update({ full_name, contact_num }).eq('id', window.inigosyncProfile.id);
            staffSettingsSaveProfileBtn.disabled = false;

            if (error) {
                window.InigoToast?.show(error.message || 'Could not save your changes.', true);
                return;
            }

            window.inigosyncProfile.full_name = full_name;
            window.inigosyncProfile.contact_num = contact_num;
            renderStaffProfile(window.inigosyncProfile);
            window.InigoToast?.show('Profile updated.');
        });
    }

    document.querySelectorAll('[data-staff-settings-cancel="profile"]').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (window.inigosyncProfile) renderStaffProfile(window.inigosyncProfile);
        });
    });

    // ---- Password visibility toggles ----
    document.querySelectorAll('[data-staff-toggle-password]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const input = btn.previousElementSibling;
            if (!input) return;
            const isHidden = input.type === 'password';
            input.type = isHidden ? 'text' : 'password';
            btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
        });
    });

    // ---- Change Password — 2-step wizard (decision S9) ----
    const STAFF_PW_MIN_LENGTH = 8;
    const pwStepPanels = document.querySelectorAll('[data-staff-pw-step]');
    const pwStepIndicators = document.querySelectorAll('[data-staff-pw-step-indicator]');
    const pwBackBtn = document.querySelector('[data-staff-pw-back]');
    const pwNextBtn = document.querySelector('[data-staff-pw-next]');
    const staffPasswordSaveBtn = document.querySelector('[data-staff-settings-save="password"]');
    const pwCurrentInput = document.querySelector('[data-staff-pw-current]');
    const pwNewInput = document.querySelector('[data-staff-pw-new]');
    const pwConfirmInput = document.querySelector('[data-staff-pw-confirm]');

    let staffPwWizardStep = 1;

    function renderStaffPwWizard() {
        pwStepPanels.forEach((panel) => {
            panel.classList.toggle('is-active', Number(panel.dataset.staffPwStep) === staffPwWizardStep);
        });
        pwStepIndicators.forEach((el) => {
            const n = Number(el.dataset.staffPwStepIndicator);
            el.classList.toggle('is-current', n === staffPwWizardStep);
            el.classList.toggle('is-done', n < staffPwWizardStep);
            el.setAttribute('aria-current', n === staffPwWizardStep ? 'step' : 'false');
        });
        if (pwBackBtn) pwBackBtn.hidden = staffPwWizardStep !== 2;
        if (staffPasswordSaveBtn) staffPasswordSaveBtn.hidden = staffPwWizardStep !== 2;
        if (pwNextBtn) {
            pwNextBtn.hidden = staffPwWizardStep !== 1;
            pwNextBtn.disabled = !(pwCurrentInput && pwCurrentInput.value !== '');
        }
    }

    function goToStaffPwStep(step) {
        staffPwWizardStep = step === 2 ? 2 : 1;
        renderStaffPwWizard();
    }

    function resetStaffPwWizard() {
        [pwCurrentInput, pwNewInput, pwConfirmInput].forEach((input) => { if (input) input.value = ''; });
        goToStaffPwStep(1);
    }

    if (pwCurrentInput) pwCurrentInput.addEventListener('input', renderStaffPwWizard);
    if (pwNextBtn) {
        pwNextBtn.addEventListener('click', () => {
            if (pwNextBtn.disabled) return;
            goToStaffPwStep(2);
        });
    }
    if (pwBackBtn) pwBackBtn.addEventListener('click', () => goToStaffPwStep(1));

    // Establishes the correct initial hidden/disabled state for the nav
    // buttons and paints the step-1 indicator.
    renderStaffPwWizard();

    if (staffPasswordSaveBtn) {
        staffPasswordSaveBtn.addEventListener('click', async () => {
            if (!window.sb || !window.inigosyncProfile) return;
            const currentPassword = pwCurrentInput?.value;
            const newPassword = pwNewInput?.value;
            const confirmPassword = pwConfirmInput?.value;

            if (!currentPassword) {
                window.InigoToast?.show('Enter your current password.', true);
                goToStaffPwStep(1);
                return;
            }
            if (!newPassword || newPassword.length < STAFF_PW_MIN_LENGTH) {
                window.InigoToast?.show(`New password must be at least ${STAFF_PW_MIN_LENGTH} characters.`, true);
                return;
            }
            if (newPassword !== confirmPassword) {
                window.InigoToast?.show('Passwords do not match.', true);
                return;
            }

            staffPasswordSaveBtn.disabled = true;

            // Re-verify against the AUTH session's OWN current email first,
            // falling back to profiles.email only if no session email is
            // available (same S3-fix reasoning as
            // includes/owner_dashboard.js's password wizard).
            const { data: pwSessionData } = await window.sb.auth.getSession();
            const verifyEmail = pwSessionData?.session?.user?.email || window.inigosyncProfile.email;

            const { error: verifyError } = await window.sb.auth.signInWithPassword({ email: verifyEmail, password: currentPassword });
            if (verifyError) {
                staffPasswordSaveBtn.disabled = false;
                window.InigoToast?.show('Current password is incorrect.', true);
                goToStaffPwStep(1);
                return;
            }

            const { error } = await window.sb.auth.updateUser({ password: newPassword });
            staffPasswordSaveBtn.disabled = false;

            if (error) {
                window.InigoToast?.show(error.message || 'Could not update your password.', true);
                return;
            }

            resetStaffPwWizard();
            window.InigoToast?.show('Password updated.');
        });
    }

    document.querySelectorAll('[data-staff-settings-cancel="password"]').forEach((btn) => {
        btn.addEventListener('click', () => resetStaffPwWizard());
    });
});
