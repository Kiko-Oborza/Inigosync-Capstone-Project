document.addEventListener('DOMContentLoaded', () => {
    // ------------------------------------------------------------------
    // Panel switching (sidebar + topbar shortcuts)
    // ------------------------------------------------------------------
    const panels = document.querySelectorAll('[data-staff-panel]');
    const titleEl = document.querySelector('[data-staff-title]');
    const subtitleEl = document.querySelector('[data-staff-subtitle]');

    const panelMeta = {
        overview: { title: 'Booking Overview', subtitle: "Today's court activity across the app." },
        walkin: { title: 'Walk-In Management', subtitle: 'Record walk-in customers and process on-the-spot payment.' },
        schedule: { title: 'Court Schedule', subtitle: 'Calendar view of every court to spot open slots at a glance.' },
        transactions: { title: 'Transaction Records', subtitle: 'Searchable audit trail of every payment processed.' },
        profile: { title: 'Staff Profile', subtitle: 'Your basic account information as recorded by the sports center.' },
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
    // Shared helpers — date range, schema-mismatch detection, stat tiles,
    // audit logging. Used across the Booking Overview, Walk-In, Court
    // Schedule, and Transaction Records sections below.
    // ------------------------------------------------------------------

    // "Today" in the browser's local timezone — the only timestamp field
    // every relevant table is guaranteed to have (time_date) is filtered
    // against this everywhere "today" is needed, rather than a created_at
    // column that may not exist (see database/schema/004_staff_module.sql's
    // header note on what is/isn't known about these tables' real shape).
    function todayRange() {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        return { start, end };
    }

    function formatIsoTime12h(iso) {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }

    // True when a Supabase/PostgREST error means "this column/table doesn't
    // exist" — i.e. database/schema/004_staff_module.sql hasn't been
    // applied yet — as opposed to a real error (RLS rejection, network
    // issue, etc.). Used to turn a raw Postgres error into an honest,
    // specific message instead of either crashing or silently pretending
    // to succeed.
    function isSchemaMismatchError(error) {
        if (!error) return false;
        const code = error.code || '';
        const message = String(error.message || '').toLowerCase();
        return code === 'PGRST204' || code === 'PGRST205' || code === '42703' || code === '42P01'
            || message.includes('could not find') || message.includes('does not exist')
            || message.includes('schema cache');
    }

    // Every element sharing a data-staff-stat key gets the same value — the
    // "walkins-today" key intentionally backs both the Booking Overview
    // stat card AND the Staff Profile "Walk-ins recorded today" tile, so
    // one fetch (refreshWalkinsPanel) updates both without extra plumbing.
    function setStat(key, value) {
        document.querySelectorAll(`[data-staff-stat="${key}"]`).forEach((el) => {
            el.textContent = String(value);
        });
    }

    // Best-effort write to audit_log (database/schema/004_staff_module.sql).
    // Never blocks or fails the booking/walk-in mutation that already
    // succeeded by the time this is called — if audit_log doesn't exist yet
    // (pre-migration) or RLS rejects the insert, this only logs a console
    // warning, never a user-facing error. Refreshes the Transaction Records
    // panel afterward so a freshly-logged action shows up without staff
    // having to manually switch tabs and back.
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
            return;
        }
        refreshTransactions();
    }

    // ------------------------------------------------------------------
    // Booking Overview — real bookings, real Confirm / Decline / Time-In /
    // Time-Out actions, driven by each row's status (+ checked_in_at once
    // database/schema/004_staff_module.sql is applied). Replaces the old
    // behaviour where refreshBookingOverview() deleted the only rows with
    // working action buttons (the static demo <tr>s) and rendered every
    // real row's Actions cell empty (docs/QA_AUDIT_REPORT.md P0#3).
    // ------------------------------------------------------------------
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
                const matchesFilter = activeFilter === 'all' ||
                    row.dataset.status === activeFilter ||
                    row.dataset.method === activeFilter;
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

    const overviewTableBody = document.querySelector('[data-staff-table="overview"] tbody');

    function formatOverviewDate(iso) {
        return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }

    // Bookings today (by time_date) drive all 4 overview stat cards plus
    // the 2 real Staff Profile tiles — computed client-side from the same
    // dataset refreshBookingOverview() already fetched, instead of extra
    // round trips. "In play right now" and "still to come" both key off
    // checked_in_at, which is undefined on every row until
    // database/schema/004_staff_module.sql is applied — undefined is
    // falsy, so pre-migration this honestly reads "0 in play" / counts
    // every pending+confirmed booking as "still to come" (see that file's
    // "before vs after" note).
    function renderOverviewStats(allBookings) {
        const { start, end } = todayRange();
        const startMs = start.getTime();
        const endMs = end.getTime();
        const todayBookings = (allBookings || []).filter((b) => {
            const t = new Date(b.time_date).getTime();
            return t >= startMs && t < endMs;
        });

        const inPlayNow = todayBookings.filter((b) => b.checked_in_at && !b.checked_out_at).length;
        const stillToCome = todayBookings.filter((b) => {
            const status = String(b.status || '').toLowerCase();
            return (status === 'pending' || status === 'confirmed') && !b.checked_in_at;
        }).length;
        const confirmedToday = todayBookings.filter((b) => {
            const status = String(b.status || '').toLowerCase();
            return status === 'confirmed' || status === 'completed';
        }).length;

        setStat('bookings-today', todayBookings.length);
        setStat('inplay-now', inPlayNow);
        setStat('still-to-come', stillToCome);
        setStat('confirmed-today', confirmedToday);
    }

    // Actions appropriate to a booking's real state:
    //   pending              -> Confirm, Decline
    //   confirmed, not timed in -> Time-In
    //   confirmed, timed in     -> Time-Out
    //   completed / cancelled   -> nothing left to do
    // No interpolated data here — button labels are fixed strings — so
    // this markup needs no escaping.
    function bookingActionsHtml(booking) {
        const status = String(booking.status || '').toLowerCase();
        if (status === 'pending') {
            return `<div class="staff-table-actions">
                <button type="button" class="staff-mini-btn is-primary" data-staff-action="confirm">Confirm</button>
                <button type="button" class="staff-mini-btn is-danger" data-staff-action="decline">Decline</button>
            </div>`;
        }
        if (status === 'confirmed') {
            if (booking.checked_in_at) {
                return `<div class="staff-table-actions"><button type="button" class="staff-mini-btn is-primary" data-staff-action="timeout">Time-Out</button></div>`;
            }
            return `<div class="staff-table-actions"><button type="button" class="staff-mini-btn" data-staff-action="timein">Time-In</button></div>`;
        }
        return '';
    }

    async function refreshBookingOverview() {
        if (!overviewTableBody || !window.sb) return;

        const { data, error } = await window.sb
            .from('booking')
            .select('*, profiles(full_name, contact_num)')
            .order('time_date', { ascending: true });

        if (error) {
            console.error('[staff] failed to load bookings', error);
            overviewTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--color-ink-faint);">Could not load bookings right now.</td></tr>';
            return;
        }

        renderOverviewStats(data || []);
        overviewTableBody.innerHTML = '';

        if (!data || data.length === 0) {
            overviewTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--color-ink-faint);">No bookings yet.</td></tr>';
            wireFilterableTable('overview');
            return;
        }

        data.forEach((booking) => {
            // Every value below can be customer-controlled (full_name,
            // contact_num) or DB content an admin/staff can edit (courts,
            // status) — escaped before it touches innerHTML so a name like
            // `<img src=x onerror=alert(1)>` renders as literal text
            // instead of running in this staff session.
            const statusRaw = booking.status || '';
            const customerNameRaw = booking.profiles?.full_name || 'Customer';
            const customerName = window.escapeHtml(customerNameRaw);
            const customerContact = window.escapeHtml(booking.profiles?.contact_num || '');
            const courtLabel = window.escapeHtml(booking.courts || '');
            const statusClass = window.escapeHtml(statusRaw);
            const statusLabel = window.escapeHtml(statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1));
            const row = document.createElement('tr');
            row.dataset.status = statusRaw;
            row.dataset.bookingId = booking.booking_id;
            // Raw (unescaped) — these are internal JS values read back for
            // the audit-log payload, not written into innerHTML directly.
            // They only get escaped at the point something is rendered.
            row.dataset.customerName = customerNameRaw;
            row.dataset.court = booking.courts || '';
            row.innerHTML = `
                <td class="staff-cell-main">${customerName}${customerContact ? `<span class="staff-cell-sub">${customerContact}</span>` : ''}</td>
                <td>${courtLabel}</td>
                <td>${formatOverviewDate(booking.time_date)}</td>
                <td class="staff-cell-ref">#${window.escapeHtml(booking.booking_id)}</td>
                <td><span class="staff-status ${statusClass}">${statusLabel}</span></td>
                <td>${bookingActionsHtml(booking)}</td>
            `;
            overviewTableBody.appendChild(row);
        });

        wireFilterableTable('overview');
    }

    // Status-only update (Confirm/Decline) — `status` already exists on
    // `booking`, so this works identically before and after
    // database/schema/004_staff_module.sql. Chains .select() and treats
    // "0 rows matched" as an error, per the Phase 2 pattern in
    // includes/owner_dashboard.js: an RLS-filtered UPDATE returns no
    // `error` at all, just an empty result, so a write that never happened
    // would otherwise silently look like success.
    async function updateBookingStatus(bookingId, patch, auditAction, successMessage, customerName, courtLabel) {
        const { data, error } = await window.sb.from('booking').update(patch).eq('booking_id', bookingId).select();
        if (error) return { error: error.message || 'Could not update this booking.' };
        if (!data || data.length === 0) {
            return { error: 'Could not update this booking — it may no longer exist, or you may not have permission.' };
        }
        writeAuditLog(auditAction, 'booking', bookingId, { customerName, court: courtLabel });
        return { message: successMessage };
    }

    // Time-In/Time-Out — writes checked_in_at/checked_out_at, which only
    // exist once database/schema/004_staff_module.sql has been applied.
    // Same .select()-and-count-check as updateBookingStatus, plus a
    // schema-mismatch check so a pre-migration attempt gets a clear,
    // specific message instead of a raw Postgres error — and, critically,
    // never fakes success: if the columns don't exist, nothing is
    // persisted and the booking's state is left exactly as it was.
    async function updateBookingCheckpoint(bookingId, patch, auditAction, successMessage, customerName, courtLabel) {
        const { data, error } = await window.sb.from('booking').update(patch).eq('booking_id', bookingId).select();
        if (error) {
            if (isSchemaMismatchError(error)) {
                return { error: "This needs a database update that hasn't been applied yet (see database/schema/004_staff_module.sql)." };
            }
            return { error: error.message || 'Could not update this booking.' };
        }
        if (!data || data.length === 0) {
            return { error: 'Could not update this booking — it may no longer exist, or you may not have permission.' };
        }
        writeAuditLog(auditAction, 'booking', bookingId, { customerName, court: courtLabel });
        return { message: successMessage };
    }

    // Event delegation on the table BODY (not per-row buttons) — rows are
    // fully replaced on every refresh, so listeners bound directly to a
    // button would not survive a re-render. This is exactly the bug
    // described in docs/QA_AUDIT_REPORT.md P0#3 (Confirm/Time-In only ever
    // worked on the static demo rows); binding once here on a container
    // that itself is never replaced fixes it for good.
    async function handleOverviewAction(e) {
        const btn = e.target.closest('[data-staff-action]');
        if (!btn || btn.disabled) return;
        const row = btn.closest('tr');
        if (!row) return;
        const bookingId = row.dataset.bookingId;
        if (!bookingId || !window.sb) return;

        const action = btn.dataset.staffAction;
        if (action === 'decline' && !window.confirm('Decline this booking request?')) return;

        const customerName = row.dataset.customerName || 'Customer';
        const courtLabel = row.dataset.court || '';

        btn.disabled = true;
        let result;
        if (action === 'confirm') {
            result = await updateBookingStatus(bookingId, { status: 'confirmed' }, 'booking_confirmed', 'Booking confirmed.', customerName, courtLabel);
        } else if (action === 'decline') {
            result = await updateBookingStatus(bookingId, { status: 'cancelled' }, 'booking_declined', 'Booking declined.', customerName, courtLabel);
        } else if (action === 'timein') {
            result = await updateBookingCheckpoint(bookingId, { checked_in_at: new Date().toISOString() }, 'booking_timed_in', 'Customer timed in.', customerName, courtLabel);
        } else if (action === 'timeout') {
            result = await updateBookingCheckpoint(bookingId, { checked_out_at: new Date().toISOString(), status: 'completed' }, 'booking_timed_out', 'Customer timed out.', customerName, courtLabel);
        } else {
            btn.disabled = false;
            return;
        }
        btn.disabled = false;

        if (result.error) {
            window.InigoToast?.show(result.error, true);
            return;
        }
        window.InigoToast?.show(result.message);
        refreshBookingOverview();
        refreshCourtSchedule();
    }

    if (overviewTableBody) {
        overviewTableBody.addEventListener('click', handleOverviewAction);
    }

    refreshBookingOverview();
    document.addEventListener('inigosync:profile-ready', refreshBookingOverview);

    // ------------------------------------------------------------------
    // Walk-In Management — live summary + record submission. Now persists
    // the customer's name/mobile (database/schema/004_staff_module.sql)
    // and reads courts from window.InigoCourtsData instead of a hardcoded,
    // independently-drifting 5-option list with invented rates — the same
    // "one source of truth for courts" fix Phase 2 applied to the customer
    // and admin dashboards (implementation_plan.md D2), needed here too so
    // a walk-in's court name actually matches a real court and shows up
    // correctly in the Court Schedule grid below.
    // ------------------------------------------------------------------
    const walkinCourt = document.querySelector('[data-staff-walkin-court]');
    const walkinDuration = document.querySelector('[data-staff-walkin-duration]');
    const walkinTime = document.querySelector('[data-staff-walkin-time]');
    const walkinName = document.querySelector('[data-staff-walkin-name]');
    const walkinMobile = document.querySelector('[data-staff-walkin-mobile]');
    const walkinPaymentOptions = document.querySelectorAll('[data-staff-payment-option]');
    const walkinSubmit = document.querySelector('[data-staff-walkin-submit]');
    const recentList = document.querySelector('[data-staff-recent-walkins]');

    const summaryName = document.querySelector('[data-staff-walkin-summary-name]');
    const summaryCourt = document.querySelector('[data-staff-walkin-summary-court]');
    const summaryTime = document.querySelector('[data-staff-walkin-summary-time]');
    const summaryDuration = document.querySelector('[data-staff-walkin-summary-duration]');
    const summaryPayment = document.querySelector('[data-staff-walkin-summary-payment]');
    const summaryTotal = document.querySelector('[data-staff-walkin-summary-total]');

    let walkinState = {
        name: '',
        court: '',
        rate: null,
        unit: 'hour',
        duration: walkinDuration ? Number(walkinDuration.value) : 1,
        time: walkinTime ? walkinTime.value : '14:00',
        payment: 'cash',
    };

    function formatTime12h(value) {
        if (!value) return '—';
        const [h, m] = value.split(':').map(Number);
        const period = h >= 12 ? 'PM' : 'AM';
        const hour12 = ((h + 11) % 12) + 1;
        return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
    }

    function updateWalkinSummary() {
        const amount = walkinState.rate !== null ? walkinState.rate * walkinState.duration : null;
        const unitLabel = walkinState.unit === 'game' ? 'game(s)' : 'hour(s)';

        if (summaryName) summaryName.textContent = walkinState.name || '—';
        if (summaryCourt) summaryCourt.textContent = walkinState.court || '—';
        if (summaryTime) summaryTime.textContent = formatTime12h(walkinState.time);
        if (summaryDuration) summaryDuration.textContent = `${walkinState.duration} ${unitLabel}`;
        if (summaryPayment) summaryPayment.textContent = walkinState.payment === 'cash' ? 'Cash' : 'GCash';
        if (summaryTotal) summaryTotal.textContent = amount !== null ? `₱${amount.toFixed(2)}` : 'Rate TBA';
    }

    // Replaces the "Loading courts…" placeholder <option> with one real
    // option per active court (rate omitted honestly as "Rate TBA" when
    // NULL — every court's rate is NULL in the live DB right now, see
    // database/seed/002_seed_content.sql), then re-derives walkinState from
    // whichever ends up selected. Mirrors includes/Dashboard.js's
    // populateBookSelect() exactly, so a court named the same way here as
    // it is on the customer dashboard.
    function populateWalkinCourtSelect(courts) {
        if (!walkinCourt) return;
        walkinCourt.innerHTML = courts.map((court) => {
            const rateAttr = court.rate !== null ? window.escapeHtml(String(court.rate)) : '';
            const unitAttr = court.rateUnit === '/game' ? 'game' : 'hour';
            const label = court.rate !== null
                ? `${court.name} — ₱${court.rate}${court.rateUnit}`
                : `${court.name} — Rate TBA`;
            return `<option value="${window.escapeHtml(court.name)}" data-rate="${rateAttr}" data-unit="${unitAttr}">${window.escapeHtml(label)}</option>`;
        }).join('');

        const firstOpt = walkinCourt.selectedOptions[0];
        walkinState.court = walkinCourt.value;
        walkinState.rate = (firstOpt && firstOpt.dataset.rate) ? Number(firstOpt.dataset.rate) : null;
        walkinState.unit = (firstOpt && firstOpt.dataset.unit) || 'hour';
        updateWalkinSummary();
    }

    if (walkinName) {
        walkinName.addEventListener('input', () => {
            walkinState.name = walkinName.value.trim();
            updateWalkinSummary();
        });
    }

    if (walkinCourt) {
        walkinCourt.addEventListener('change', () => {
            const opt = walkinCourt.selectedOptions[0];
            walkinState.court = walkinCourt.value;
            walkinState.rate = (opt && opt.dataset.rate) ? Number(opt.dataset.rate) : null;
            walkinState.unit = (opt && opt.dataset.unit) || 'hour';
            updateWalkinSummary();
        });
    }

    if (walkinDuration) {
        walkinDuration.addEventListener('change', () => {
            walkinState.duration = Number(walkinDuration.value);
            updateWalkinSummary();
        });
    }

    if (walkinTime) {
        walkinTime.addEventListener('change', () => {
            walkinState.time = walkinTime.value;
            updateWalkinSummary();
        });
    }

    walkinPaymentOptions.forEach((option) => {
        option.addEventListener('click', () => {
            walkinPaymentOptions.forEach((o) => o.classList.remove('is-selected'));
            option.classList.add('is-selected');
            const radio = option.querySelector('input[type="radio"]');
            if (radio) {
                radio.checked = true;
                walkinState.payment = radio.dataset.staffPayment;
            }
            updateWalkinSummary();
        });
    });

    // One real walk-in row — used both for "just submitted" and for
    // rendering today's real history from walk_in_booking. w.customer_name
    // is undefined pre-migration (select('*') just omits an unknown
    // column) and falls back honestly instead of showing "undefined".
    // Payment method/amount are never shown here because neither is ever
    // persisted (payment is Phase 5 scope) — showing one would be
    // fabricated data.
    function renderWalkinRow(w) {
        const name = window.escapeHtml(w.customer_name || 'Walk-in customer');
        const court = window.escapeHtml(w.courts || w.sports || '—');
        const timeLabel = window.escapeHtml(formatIsoTime12h(w.time_date));
        const row = document.createElement('div');
        row.className = 'staff-recent-row';
        row.innerHTML = `
            <div class="staff-recent-icon">
                <svg viewBox="0 0 24 24" fill="none"><circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="2.5" transform="scale(0.4)"/></svg>
            </div>
            <div class="staff-recent-info">
                <h4>${name} — ${court}</h4>
                <p>${timeLabel}</p>
            </div>
            <span class="staff-status walkin">Walk-in</span>
        `;
        return row;
    }

    // Fetches today's real walk_in_booking rows once — used to (a) set the
    // "Walk-ins today" stat (both the overview card and the Staff Profile
    // tile share this data-staff-stat key) and (b) rebuild the "Recent
    // walk-ins" list from real data instead of the two hardcoded demo
    // entries this phase removes from Pages/staff_dashboard.html.
    async function refreshWalkinsPanel() {
        if (!window.sb) return [];
        const { start, end } = todayRange();
        const { data, error } = await window.sb
            .from('walk_in_booking')
            .select('*')
            .gte('time_date', start.toISOString())
            .lt('time_date', end.toISOString())
            .order('time_date', { ascending: false });

        if (error) {
            console.error("[staff] failed to load today's walk-ins", error);
            return [];
        }

        const walkins = data || [];
        setStat('walkins-today', walkins.length);

        if (recentList) {
            recentList.querySelectorAll('.staff-recent-row, [data-staff-recent-empty]').forEach((el) => el.remove());
            if (walkins.length === 0) {
                const empty = document.createElement('p');
                empty.dataset.staffRecentEmpty = '';
                empty.style.cssText = 'color: var(--color-ink-faint); font-size: 0.82rem; margin: 0;';
                empty.textContent = 'No walk-ins recorded yet today.';
                recentList.appendChild(empty);
            } else {
                walkins.forEach((w) => recentList.appendChild(renderWalkinRow(w)));
            }
        }

        return walkins;
    }

    if (walkinSubmit) {
        walkinSubmit.addEventListener('click', async () => {
            const name = walkinName ? walkinName.value.trim() : '';
            if (!name) {
                window.InigoToast?.show("Enter the customer's name.", true);
                if (walkinName) walkinName.focus();
                return;
            }

            // Mobile is optional here (unlike a customer account's own
            // contact_num) — a walk-in isn't creating an account, and
            // blocking a quick on-the-spot record because someone declined
            // to give a number would fight the point of this panel. If a
            // value IS entered, though, it goes through the same PH-format
            // check as everywhere else in the app.
            const mobileRaw = walkinMobile ? walkinMobile.value.trim() : '';
            let customerMobile = null;
            if (mobileRaw) {
                const mobileCheck = window.validatePhMobile(mobileRaw);
                if (!mobileCheck.valid) {
                    window.InigoToast?.show(mobileCheck.message, true);
                    walkinMobile?.focus();
                    return;
                }
                customerMobile = mobileCheck.normalized;
            }

            if (!window.sb || !window.inigosyncProfile) {
                window.InigoToast?.show('Unable to reach the server right now. Please try again shortly.', true);
                return;
            }
            if (!walkinState.court) {
                window.InigoToast?.show('Select a court.', true);
                return;
            }

            const today = new Date().toISOString().slice(0, 10);
            const basePayload = {
                staff_id: window.inigosyncProfile.id,
                sports: walkinState.court,
                courts: walkinState.court,
                time_date: new Date(`${today}T${walkinState.time}:00`).toISOString(),
                status: 'pending',
                payment_id: null,
            };

            walkinSubmit.disabled = true;

            // customer_name/customer_mobile only exist once
            // database/schema/004_staff_module.sql is applied — try
            // including them first, and fall back to the pre-migration
            // insert shape (so recording the walk-in itself still works,
            // exactly as it did before this phase) if that's specifically
            // what fails.
            let { error } = await window.sb.from('walk_in_booking').insert({
                ...basePayload,
                customer_name: name,
                customer_mobile: customerMobile,
            });
            let contactSaved = !error;

            if (error && isSchemaMismatchError(error)) {
                ({ error } = await window.sb.from('walk_in_booking').insert(basePayload));
                contactSaved = false;
            }

            walkinSubmit.disabled = false;

            if (error) {
                window.InigoToast?.show(error.message || 'Could not record this walk-in.', true);
                return;
            }

            window.InigoToast?.show(contactSaved
                ? 'Walk-in recorded.'
                : "Walk-in recorded — name/mobile need a database update to be saved (see database/schema/004_staff_module.sql).");

            writeAuditLog('walkin_recorded', 'walk_in_booking', null, { customerName: name, court: walkinState.court });

            // Reset the form for the next walk-in.
            if (walkinName) walkinName.value = '';
            if (walkinMobile) walkinMobile.value = '';
            walkinState.name = '';
            updateWalkinSummary();

            refreshWalkinsPanel();
            refreshCourtSchedule();
        });
    }

    if (window.InigoCourtsData) {
        window.InigoCourtsData.getCourts().then(populateWalkinCourtSelect);
    } else {
        // Should never happen — includes/courtsData.js must load before
        // this file (see the <script> order in Pages/staff_dashboard.html).
        console.error('[staff] window.InigoCourtsData is missing — check that includes/courtsData.js loads before includes/staff_dashboard.js.');
    }

    updateWalkinSummary();
    refreshWalkinsPanel();
    document.addEventListener('inigosync:profile-ready', refreshWalkinsPanel);

    // ------------------------------------------------------------------
    // Court Schedule — rendered from real courts (window.InigoCourtsData)
    // as columns and real `booking` + `walk_in_booking` rows (today only)
    // as cells, replacing the fully static demo grid. Each cell represents
    // a fixed 2-hour window (matching the original demo's row granularity,
    // and the sports center's assumed 8 AM–8 PM operating hours — nothing
    // in this system tracks real operating hours, so this is the grid's
    // display bound, not a claim about any individual's schedule). A
    // booking "occupies" every slot its [start, start+duration) window
    // overlaps, so a booking that runs long visibly spans more than one
    // cell instead of only ever marking its starting slot.
    // ------------------------------------------------------------------
    const scheduleGrid = document.querySelector('[data-staff-schedule-grid]');
    const scheduleDateEl = document.querySelector('[data-staff-schedule-date]');
    const scheduleSportTabs = document.querySelector('[data-staff-sport-tabs]');

    const SCHEDULE_SLOTS = [8, 10, 12, 14, 16, 18]; // 2-hour windows, 8 AM through 8 PM
    const SCHEDULE_SLOT_MS = 2 * 60 * 60 * 1000;
    // Kept equal to database/schema/004_staff_module.sql's
    // booking.duration_minutes DEFAULT — see that file's header comment.
    const DEFAULT_DURATION_MINUTES = 60;

    let scheduleActiveSport = 'all';

    function formatHourLabel(hour) {
        const period = hour >= 12 ? 'PM' : 'AM';
        const hour12 = ((hour + 11) % 12) + 1;
        return `${hour12} ${period}`;
    }

    function formatScheduleDate(d) {
        return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }

    function slotWindow(hour, dateBase) {
        const start = new Date(dateBase);
        start.setHours(hour, 0, 0, 0);
        return { start, end: new Date(start.getTime() + SCHEDULE_SLOT_MS) };
    }

    // duration_minutes is undefined on every row until
    // database/schema/004_staff_module.sql is applied — falls back to
    // DEFAULT_DURATION_MINUTES, never invents a longer/shorter guess.
    function bookingWindow(row) {
        const start = new Date(row.time_date);
        const minutesRaw = Number(row.duration_minutes);
        const minutes = Number.isFinite(minutesRaw) && minutesRaw > 0 ? minutesRaw : DEFAULT_DURATION_MINUTES;
        return { start, end: new Date(start.getTime() + minutes * 60000) };
    }

    function windowsOverlap(a, b) {
        return a.start < b.end && b.start < a.end;
    }

    function scheduleCellContent(court, slotHour, todayBookings, todayWalkins, dateBase) {
        const slot = slotWindow(slotHour, dateBase);

        const match = todayBookings.find((b) => {
            if (String(b.status || '').toLowerCase() === 'cancelled') return false;
            if (String(b.courts || '') !== court.name) return false;
            return windowsOverlap(bookingWindow(b), slot);
        });
        if (match) {
            return { cls: 'is-booked', text: match.profiles?.full_name || 'Booked' };
        }

        const walkinMatch = todayWalkins.find((w) => {
            if (String(w.courts || '') !== court.name) return false;
            return windowsOverlap(bookingWindow(w), slot);
        });
        if (walkinMatch) {
            // customer_name only exists once
            // database/schema/004_staff_module.sql has been applied —
            // undefined gracefully falls back to a generic label.
            return { cls: 'is-walkin', text: walkinMatch.customer_name || 'Walk-in' };
        }

        return { cls: 'is-available', text: 'Open' };
    }

    function applyScheduleSportFilter() {
        document.querySelectorAll('.staff-schedule-cell').forEach((cell) => {
            const match = scheduleActiveSport === 'all' || cell.dataset.sport === scheduleActiveSport;
            cell.style.opacity = match ? '1' : '0.25';
        });
    }

    // Rebuilds the sport-tab chips from real sports (window.InigoCourtsData
    // .getSports()) instead of the hardcoded 5-of-8 list the static markup
    // had. Re-wires click handlers each call since innerHTML replacement
    // destroys any previous listeners — same re-wire-after-render idiom
    // includes/owner_dashboard.js uses for its dynamically rendered rows.
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
                applyScheduleSportFilter();
            });
        });
    }

    async function refreshCourtSchedule() {
        if (!scheduleGrid || !window.sb || !window.InigoCourtsData) return;

        const { start, end } = todayRange();
        if (scheduleDateEl) scheduleDateEl.textContent = `Today · ${formatScheduleDate(start)}`;

        const [courts, bookingsRes, walkinsRes] = await Promise.all([
            window.InigoCourtsData.getCourts(),
            window.sb.from('booking')
                .select('*, profiles(full_name)')
                .gte('time_date', start.toISOString())
                .lt('time_date', end.toISOString()),
            window.sb.from('walk_in_booking')
                .select('*')
                .gte('time_date', start.toISOString())
                .lt('time_date', end.toISOString()),
        ]);

        if (bookingsRes.error) console.error("[staff] failed to load today's bookings for the schedule", bookingsRes.error);
        if (walkinsRes.error) console.error("[staff] failed to load today's walk-ins for the schedule", walkinsRes.error);
        const todayBookings = bookingsRes.error ? [] : (bookingsRes.data || []);
        const todayWalkins = walkinsRes.error ? [] : (walkinsRes.data || []);

        // Dynamic column count — a court added/removed in admin Court
        // Listings (includes/owner_dashboard.js) is reflected here on next
        // load instead of the old fixed 6-court static markup drifting out
        // of sync. See Style/staff_dashboard.css's --staff-schedule-cols
        // custom property for why this is a property, not a full inline
        // grid-template-columns (keeps the responsive breakpoints working).
        scheduleGrid.style.setProperty('--staff-schedule-cols', String(Math.max(courts.length, 1)));

        let html = '<div></div>' + courts.map((c) => `<div class="staff-schedule-head">${window.escapeHtml(c.name)}</div>`).join('');

        SCHEDULE_SLOTS.forEach((hour) => {
            html += `<div class="staff-schedule-time">${window.escapeHtml(formatHourLabel(hour))}</div>`;
            courts.forEach((court) => {
                const { cls, text } = scheduleCellContent(court, hour, todayBookings, todayWalkins, start);
                html += `<div class="staff-schedule-cell ${cls}" data-sport="${window.escapeHtml(court.sportSlug || '')}">${window.escapeHtml(text)}</div>`;
            });
        });

        scheduleGrid.innerHTML = html;
        applyScheduleSportFilter();
    }

    renderScheduleSportTabs();
    refreshCourtSchedule();
    document.addEventListener('inigosync:profile-ready', refreshCourtSchedule);

    // ------------------------------------------------------------------
    // Transaction Records — real audit trail from `audit_log`
    // (database/schema/004_staff_module.sql), replacing the unconditional
    // "No transactions yet." wipe. A row exists for every Confirm/Decline/
    // Time-In/Time-Out/walk-in action (see writeAuditLog above). No
    // amount/payment-method columns — neither is ever persisted anywhere
    // in this phase, so showing one would be fabricated data.
    // ------------------------------------------------------------------
    const transactionsTableBody = document.querySelector('[data-staff-table="transactions"] tbody');

    const AUDIT_ACTION_LABELS = {
        booking_confirmed: 'Booking confirmed',
        booking_declined: 'Booking declined',
        booking_timed_in: 'Timed in',
        booking_timed_out: 'Timed out',
        walkin_recorded: 'Walk-in recorded',
    };

    function auditActionLabel(action) {
        return AUDIT_ACTION_LABELS[action] || (action ? String(action).replace(/_/g, ' ') : 'Action');
    }

    async function refreshTransactions() {
        if (!transactionsTableBody || !window.sb) return;

        const { data, error } = await window.sb
            .from('audit_log')
            .select('*, profiles(full_name)')
            .order('created_at', { ascending: false })
            .limit(200);

        if (error) {
            // audit_log doesn't exist until
            // database/schema/004_staff_module.sql is applied (a schema
            // cache / relation-not-found error) — or RLS rejects a
            // non-staff session. Either way, an honest explanation instead
            // of a silent crash or fabricated rows.
            transactionsTableBody.innerHTML = "<tr><td colspan=\"4\" style=\"text-align:center; color: var(--color-ink-faint);\">Transaction records need a database update the admin hasn't applied yet.</td></tr>";
            wireFilterableTable('transactions');
            return;
        }

        if (!data || data.length === 0) {
            transactionsTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--color-ink-faint);">No transactions yet.</td></tr>';
            wireFilterableTable('transactions');
            return;
        }

        transactionsTableBody.innerHTML = '';
        data.forEach((entry) => {
            const details = entry.details || {};
            // details.* is a staff-typed/customer-controlled snapshot
            // (customer name, court) captured at write time; actor name is
            // whatever the acting staff/admin has set as their own profile
            // name — both escaped before touching innerHTML, same rule as
            // every other interpolation in this file.
            const actionLabel = window.escapeHtml(auditActionLabel(entry.action));
            const actionClass = window.escapeHtml(entry.action || '');
            const refLabel = window.escapeHtml(details.customerName || entry.entity_type || '—');
            const courtLabel = window.escapeHtml(details.court || '—');
            const actorLabel = window.escapeHtml(entry.profiles?.full_name || entry.actor_role || 'Staff');
            const row = document.createElement('tr');
            row.dataset.status = entry.action || '';
            row.innerHTML = `
                <td>${window.escapeHtml(formatOverviewDate(entry.created_at))} · ${window.escapeHtml(new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}</td>
                <td class="staff-cell-main">${refLabel}<span class="staff-cell-sub">${courtLabel}</span></td>
                <td><span class="staff-status ${actionClass}">${actionLabel}</span></td>
                <td>${actorLabel}</td>
            `;
            transactionsTableBody.appendChild(row);
        });

        wireFilterableTable('transactions');
    }

    refreshTransactions();
    document.addEventListener('inigosync:profile-ready', refreshTransactions);

    // ------------------------------------------------------------------
    // Staff Profile — prefill from the real signed-in profile and wire the
    // Save button to a real update. The "Bookings confirmed today" /
    // "Walk-ins recorded today" tiles are populated by setStat() above
    // (renderOverviewStats / refreshWalkinsPanel), not here — this
    // function only ever touches name/email/contact via .textContent,
    // never innerHTML, so it needs no escaping.
    // ------------------------------------------------------------------
    function renderStaffProfile(profile) {
        const initials = (profile.full_name || profile.email || '?')
            .split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

        document.querySelectorAll('.staff-avatar').forEach((el) => { el.textContent = initials; });
        document.querySelectorAll('[data-staff-profile-name]').forEach((el) => { el.textContent = profile.full_name || 'Staff'; });

        const cardInfo = document.querySelector('[data-staff-panel="profile"] .staff-profile-card-info h3');
        if (cardInfo) cardInfo.textContent = profile.full_name || 'Staff';

        const metaItems = document.querySelectorAll('[data-staff-panel="profile"] .staff-profile-meta-item');
        if (metaItems[0]) metaItems[0].querySelector('span:last-child').textContent = profile.email || '—';
        if (metaItems[1]) metaItems[1].querySelector('span:last-child').textContent = profile.contact_num || '—';

        const nameInput = document.querySelector('[data-staff-profile-name-input]');
        const contactInput = document.querySelector('[data-staff-profile-contact-input]');
        if (nameInput) nameInput.value = profile.full_name || '';
        if (contactInput) contactInput.value = profile.contact_num || '';
    }

    document.addEventListener('inigosync:profile-ready', (e) => renderStaffProfile(e.detail));
    if (window.inigosyncProfile) renderStaffProfile(window.inigosyncProfile);

    const staffProfileSaveBtn = document.querySelector('[data-staff-profile-save]');
    if (staffProfileSaveBtn) {
        staffProfileSaveBtn.addEventListener('click', async () => {
            if (!window.sb || !window.inigosyncProfile) return;
            const nameInput = document.querySelector('[data-staff-profile-name-input]');
            const contactInput = document.querySelector('[data-staff-profile-contact-input]');
            const full_name = nameInput?.value.trim();
            const contact_num = contactInput?.value.trim();

            staffProfileSaveBtn.disabled = true;
            const { error } = await window.sb
                .from('profiles')
                .update({ full_name, contact_num })
                .eq('id', window.inigosyncProfile.id);
            staffProfileSaveBtn.disabled = false;

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
});
