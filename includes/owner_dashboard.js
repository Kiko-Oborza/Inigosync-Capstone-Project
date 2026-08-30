// IñigoSync — Owner Dashboard controller
// Staff Management, Account Settings, Court Listings, the Booking Overview
// stat tiles, and Payment Configuration all talk to the real Supabase
// database. Media Manager's upload controls are honestly disabled (no
// Supabase Storage bucket exists — see that section's comment below); court
// photos are still fully editable via Court Listings' image_url field.
// (Booking trend chart setup lives in event/chart.js, loaded below.)

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
        media: { title: 'Media Manager', subtitle: "Whatever you upload here is what the website shows — home featured photos and each court's photo." },
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
    // beyond escape.js/courtsData.js/appSettings.js).
    function isSchemaMismatchError(error) {
        if (!error) return false;
        const code = error.code || '';
        const message = String(error.message || '').toLowerCase();
        return code === 'PGRST204' || code === 'PGRST205' || code === '42703' || code === '42P01'
            || message.includes('could not find') || message.includes('does not exist')
            || message.includes('schema cache');
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
        // return shape, which the court-form sport dropdown below and
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
        row.innerHTML = `
            <td class="admin-cell-main" data-admin-staff-name-cell>${window.escapeHtml(profile.full_name) || '—'}</td>
            <td data-admin-staff-email-cell>${window.escapeHtml(profile.email) || '—'}</td>
            <td data-admin-staff-position-cell>${window.escapeHtml(profile.position) || '—'}</td>
            <td data-admin-staff-status-cell>${staffStatusBadge(profile.status)}</td>
            <td>
                <div class="admin-table-actions">
                    <button type="button" class="admin-mini-btn" data-admin-reset-password>Reset Password</button>
                    <button type="button" class="admin-mini-btn" data-admin-edit-staff>Edit</button>
                    ${profile.status !== 'disabled' ? '<button type="button" class="admin-mini-btn is-danger" data-admin-delete-staff>Deactivate</button>' : ''}
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
        scope.querySelectorAll('[data-admin-reset-password]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const row = btn.closest('tr');
                const email = row?.querySelector('[data-admin-staff-email-cell]')?.textContent;
                if (!email || !window.sb) return;

                btn.disabled = true;
                const { error } = await window.sb.auth.resetPasswordForEmail(email);
                btn.disabled = false;

                window.InigoToast?.show(
                    error ? (error.message || 'Could not send the reset email.') : `Password reset email sent to ${email}.`,
                    Boolean(error)
                );
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
    }

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
    // ------------------------------------------------------------------
    const courtGrid = document.querySelector('[data-admin-court-grid]');
    const courtFormToggleBtns = document.querySelectorAll('[data-admin-toggle-court-form]');
    const courtForm = document.querySelector('[data-admin-court-form]');
    const courtSubmitBtn = document.querySelector('[data-admin-court-submit]');

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

    // Resets the Add/Edit form back to "add a new court" — clears the
    // editingId marker Edit sets (see openCourtFormForEdit below), the
    // heading, the submit button label, and every field.
    function resetCourtForm() {
        if (!courtForm) return;
        delete courtForm.dataset.editingId;
        const heading = courtForm.querySelector('.admin-card-head h3');
        if (heading) heading.textContent = 'New Court';
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

    courtFormToggleBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            if (!courtForm) return;
            const opening = !courtForm.classList.contains('is-open');
            courtForm.classList.toggle('is-open');
            // Whenever the form ends up closed (Cancel, or re-clicking
            // "+ Add New Court" while it was already open) — or opens fresh
            // via "+ Add New Court" while NOT mid-edit — reset it to
            // add-mode. Edit mode is entered explicitly by
            // wireCourtCardActions' Edit handler below, which opens the
            // form itself and runs independently of this shared toggle.
            if (!opening || !courtForm.dataset.editingId) resetCourtForm();
        });
    });

    // Escapes every interpolated field — a court name/description written
    // by any staff-or-admin session (RLS lets staff write `court` too, see
    // database/schema/002_content_tables.sql's "court_staff_write" policy)
    // must render as literal text here, not run.
    function renderAdminCourtCard(court) {
        const isActive = court.isActive !== false;
        const statusCls = isActive ? 'active' : 'inactive';
        const statusLabel = isActive ? 'Active' : 'Deactivated';
        const monogram = window.InigoCourtsData ? window.InigoCourtsData.monogramFor(court.sportSlug, court.name) : '?';
        const media = court.imageUrl
            ? `<img src="${window.escapeHtml(court.imageUrl)}" alt="${window.escapeHtml(court.name)}" loading="lazy">`
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
                        <button type="button" class="admin-btn-secondary" data-admin-court-toggle-status>${isActive ? 'Deactivate' : 'Activate'}</button>
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

    function openCourtFormForEdit(court) {
        if (!courtForm) return;
        courtForm.dataset.editingId = court.id;
        const heading = courtForm.querySelector('.admin-card-head h3');
        if (heading) heading.textContent = `Edit — ${court.name}`;
        if (courtSubmitBtn) courtSubmitBtn.textContent = 'Save Changes';

        // .value assignment (never innerHTML) — a `"` or `<` in an existing
        // name/description can't break out of an attribute or inject
        // markup this way, same fix already applied to the staff-edit
        // inputs (docs/QA_AUDIT_REPORT.md P2#2).
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

        courtForm.classList.add('is-open');
        courtForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

            const payload = {
                name,
                sport_id: sportId,
                quantity,
                unit: unitSelect ? unitSelect.value : 'courts',
                description: (descriptionInput && descriptionInput.value.trim()) ? descriptionInput.value.trim() : null,
                rate,
                rate_unit: rateUnitSelect ? rateUnitSelect.value : '/hr',
                status: opStatusSelect ? opStatusSelect.value : 'Available',
                image_url: (imageUrlInput && imageUrlInput.value.trim()) ? imageUrlInput.value.trim() : null,
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
            resetCourtForm();
            courtForm.classList.remove('is-open');
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
                openCourtFormForEdit(court);
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
    // Account Settings — password visibility toggles + save placeholders
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

    // Owner Profile — prefill from the real signed-in profile. The
    // "Username" field has no backing column (profiles has no username) —
    // it's now `disabled` in the markup and relabeled "not available yet"
    // rather than a typeable field whose value silently never saves.
    function renderAdminProfile(profile) {
        const initials = (profile.full_name || profile.email || '?')
            .split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

        document.querySelectorAll('.admin-avatar').forEach((el) => { el.textContent = initials; });
        document.querySelectorAll('[data-admin-profile-name]').forEach((el) => { el.textContent = profile.full_name || 'Owner'; });

        const cardInfo = document.querySelector('[data-admin-panel="settings"] .admin-profile-card-info h3');
        if (cardInfo) cardInfo.textContent = profile.full_name || 'Owner';

        const settingsPanel = document.querySelector('[data-admin-panel="settings"]');
        if (settingsPanel) {
            const inputs = settingsPanel.querySelectorAll('.admin-settings-grid .admin-input');
            if (inputs[0]) inputs[0].value = profile.full_name || '';
            if (inputs[2]) inputs[2].value = profile.email || '';
        }
    }

    document.addEventListener('inigosync:profile-ready', (e) => renderAdminProfile(e.detail));
    if (window.inigosyncProfile) renderAdminProfile(window.inigosyncProfile);

    const adminProfileSaveBtn = document.querySelector('[data-admin-settings-save="profile"]');
    if (adminProfileSaveBtn) {
        adminProfileSaveBtn.addEventListener('click', async () => {
            if (!window.sb || !window.inigosyncProfile) return;
            const settingsPanel = document.querySelector('[data-admin-panel="settings"]');
            const inputs = settingsPanel.querySelectorAll('.admin-settings-grid .admin-input');
            const full_name = inputs[0]?.value.trim();

            adminProfileSaveBtn.disabled = true;
            const { error } = await window.sb.from('profiles').update({ full_name }).eq('id', window.inigosyncProfile.id);
            adminProfileSaveBtn.disabled = false;

            if (error) {
                window.InigoToast?.show(error.message || 'Could not save your changes.', true);
                return;
            }

            window.inigosyncProfile.full_name = full_name;
            renderAdminProfile(window.inigosyncProfile);
            window.InigoToast?.show('Profile updated.');
        });
    }

    const adminPasswordSaveBtn = document.querySelector('[data-admin-settings-save="password"]');
    if (adminPasswordSaveBtn) {
        adminPasswordSaveBtn.addEventListener('click', async () => {
            if (!window.sb || !window.inigosyncProfile) return;
            const settingsPanel = document.querySelector('[data-admin-panel="settings"]');
            const passwordInputs = settingsPanel.querySelectorAll('.admin-form-group input[type="password"]');
            const currentPassword = passwordInputs[0]?.value;
            const newPassword = passwordInputs[1]?.value;
            const confirmPassword = passwordInputs[2]?.value;

            if (!currentPassword) {
                window.InigoToast?.show('Enter your current password.', true);
                return;
            }
            if (!newPassword) {
                window.InigoToast?.show('Enter a new password.', true);
                return;
            }
            if (newPassword !== confirmPassword) {
                window.InigoToast?.show('Passwords do not match.', true);
                return;
            }

            adminPasswordSaveBtn.disabled = true;

            // "Current password" used to be collected and never checked —
            // any hijacked or left-open owner/staff session could silently
            // take over the account via updateUser(). Re-authenticating
            // with it first (Supabase has no separate "verify password"
            // call) confirms the person at the keyboard actually knows it
            // before the password is changed.
            const { error: verifyError } = await window.sb.auth.signInWithPassword({
                email: window.inigosyncProfile.email,
                password: currentPassword,
            });

            if (verifyError) {
                adminPasswordSaveBtn.disabled = false;
                window.InigoToast?.show('Current password is incorrect.', true);
                return;
            }

            const { error } = await window.sb.auth.updateUser({ password: newPassword });
            adminPasswordSaveBtn.disabled = false;

            if (error) {
                window.InigoToast?.show(error.message || 'Could not update your password.', true);
                return;
            }

            passwordInputs.forEach((input) => { input.value = ''; });
            window.InigoToast?.show('Password updated.');
        });
    }

    // ------------------------------------------------------------------
    // Account Settings — Cancel buttons (previously unwired: clicking them
    // did nothing). Discards in-progress edits back to the last-saved
    // values instead of leaving a button that has no effect.
    // ------------------------------------------------------------------
    document.querySelectorAll('[data-admin-settings-cancel]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.adminSettingsCancel;
            if (mode === 'profile') {
                if (window.inigosyncProfile) renderAdminProfile(window.inigosyncProfile);
            } else if (mode === 'password') {
                const settingsPanel = document.querySelector('[data-admin-panel="settings"]');
                settingsPanel?.querySelectorAll('.admin-form-group input[type="password"]').forEach((input) => {
                    input.value = '';
                });
            }
        });
    });

    // ------------------------------------------------------------------
    // Media Manager — upload is intentionally NOT wired here. Real file
    // upload needs a Supabase Storage bucket + RLS policies — new
    // owner-provisioned infrastructure that's out of scope this pass
    // (implementation_plan.md E4). The old handlers (client-side preview
    // only, via URL.createObjectURL; nothing was ever uploaded or
    // persisted) have been removed rather than left dead behind disabled
    // controls — every Replace/Remove/Add control in
    // Pages/owner_dashboard.html's Media Manager panel is now a real
    // `disabled` form control with an explanatory note next to it, so
    // nothing there still looks interactive while silently doing nothing.
    // Court photos remain fully editable today via Court Listings → Edit →
    // Image URL, which writes straight to `court.image_url` (see the Court
    // Listings section above).
    // ------------------------------------------------------------------
});
