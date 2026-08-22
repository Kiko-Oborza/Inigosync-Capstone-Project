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
    // Booking Overview — filter chips, search, time-in/time-out/details
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

    // Transaction Records — no payment records exist yet this pass (see
    // Walk-In submit below), so this is an honest empty state rather than
    // fake data.
    const transactionsTableBody = document.querySelector('[data-staff-table="transactions"] tbody');
    if (transactionsTableBody) {
        transactionsTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--color-ink-faint);">No transactions yet.</td></tr>';
    }
    wireFilterableTable('transactions');

    // Real Booking Overview — replaces the static demo rows once the
    // signed-in staff profile is ready. Time-In / Time-Out / Details stay
    // out of scope this pass (no dedicated "checked-in" state exists yet),
    // so real rows render with no action buttons rather than wiring
    // buttons to something undecided.
    const overviewTableBody = document.querySelector('[data-staff-table="overview"] tbody');

    function formatOverviewDate(iso) {
        return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }

    async function refreshBookingOverview() {
        if (!overviewTableBody || !window.sb) return;

        const { data, error } = await window.sb
            .from('booking')
            .select('*, profiles(full_name, contact_num)')
            .order('time_date', { ascending: true });

        if (error) {
            console.error('[staff] failed to load bookings', error);
            return;
        }

        overviewTableBody.innerHTML = '';

        if (!data || data.length === 0) {
            overviewTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--color-ink-faint);">No bookings yet.</td></tr>';
            wireFilterableTable('overview');
            return;
        }

        data.forEach((booking) => {
            const customerName = booking.profiles?.full_name || 'Customer';
            const customerContact = booking.profiles?.contact_num || '';
            const row = document.createElement('tr');
            row.dataset.status = booking.status;
            row.innerHTML = `
                <td class="staff-cell-main">${customerName}${customerContact ? `<span class="staff-cell-sub">${customerContact}</span>` : ''}</td>
                <td>${booking.courts}</td>
                <td>${formatOverviewDate(booking.time_date)}</td>
                <td class="staff-cell-ref">#${booking.booking_id}</td>
                <td><span class="staff-status ${booking.status}">${booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}</span></td>
                <td></td>
            `;
            overviewTableBody.appendChild(row);
        });

        wireFilterableTable('overview');
    }

    refreshBookingOverview();
    document.addEventListener('inigosync:profile-ready', refreshBookingOverview);

    function handleTimeIn(e) {
        const row = e.target.closest('tr');
        if (!row) return;
        // TODO: PATCH /api/bookings/:id { checked_in_at: now } once the
        // backend is ready.
        row.dataset.status = 'inplay';
        const statusBadge = row.querySelector('.staff-status');
        if (statusBadge) {
            statusBadge.textContent = 'In play';
            statusBadge.className = 'staff-status inplay';
        }
        const actions = row.querySelector('.staff-table-actions');
        if (actions) {
            actions.innerHTML = '<button type="button" class="staff-mini-btn" data-staff-timeout>Time-Out</button>';
            actions.querySelector('[data-staff-timeout]').addEventListener('click', handleTimeOut);
        }
        console.log('[staff] customer timed in (placeholder)');
    }

    function handleTimeOut(e) {
        const row = e.target.closest('tr');
        if (!row) return;
        // TODO: PATCH /api/bookings/:id { checked_out_at: now } once the
        // backend is ready.
        row.dataset.status = 'done';
        const statusBadge = row.querySelector('.staff-status');
        if (statusBadge) {
            statusBadge.textContent = 'Done';
            statusBadge.className = 'staff-status done';
        }
        const actions = row.querySelector('.staff-table-actions');
        if (actions) {
            actions.innerHTML = '<button type="button" class="staff-mini-btn" data-staff-details>Details</button>';
            actions.querySelector('[data-staff-details]').addEventListener('click', handleDetails);
        }
        console.log('[staff] customer timed out (placeholder)');
    }

    function handleDetails(e) {
        const row = e.target.closest('tr');
        if (!row) return;
        // TODO: open a booking details view/modal once the backend is ready.
        console.log('[staff] view booking details (placeholder)', row.querySelector('.staff-cell-main')?.textContent);
    }

    document.querySelectorAll('[data-staff-timein]').forEach((btn) => {
        btn.addEventListener('click', handleTimeIn);
    });
    document.querySelectorAll('[data-staff-timeout]').forEach((btn) => {
        btn.addEventListener('click', handleTimeOut);
    });
    document.querySelectorAll('[data-staff-details]').forEach((btn) => {
        btn.addEventListener('click', handleDetails);
    });

    // ------------------------------------------------------------------
    // Walk-In Management — live summary + record submission
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
        court: walkinCourt ? walkinCourt.value : 'Basketball',
        rate: walkinCourt ? Number(walkinCourt.selectedOptions[0].dataset.rate) : 300,
        unit: walkinCourt ? walkinCourt.selectedOptions[0].dataset.unit : 'hour',
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
        const amount = walkinState.rate * walkinState.duration;
        const unitLabel = walkinState.unit === 'game' ? 'game(s)' : 'hour(s)';

        if (summaryName) summaryName.textContent = walkinState.name || '—';
        if (summaryCourt) summaryCourt.textContent = walkinState.court;
        if (summaryTime) summaryTime.textContent = formatTime12h(walkinState.time);
        if (summaryDuration) summaryDuration.textContent = `${walkinState.duration} ${unitLabel}`;
        if (summaryPayment) summaryPayment.textContent = walkinState.payment === 'cash' ? 'Cash' : 'GCash';
        if (summaryTotal) summaryTotal.textContent = `₱${amount.toFixed(2)}`;
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
            walkinState.rate = Number(opt.dataset.rate);
            walkinState.unit = opt.dataset.unit;
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

    if (walkinSubmit) {
        walkinSubmit.addEventListener('click', async () => {
            if (!walkinState.name) {
                if (walkinName) walkinName.focus();
                return;
            }
            if (!window.sb || !window.inigosyncProfile) {
                window.InigoToast?.show('Unable to reach the server right now. Please try again shortly.', true);
                return;
            }

            // Note: walk_in_booking has no column for the customer's name/
            // mobile — those stay UI-only (shown in the recent-walkins list
            // below for the staff's own reference this shift) until the
            // table gains one. Payment isn't recorded here either — that
            // waits for real PayMongo, per this pass's scope.
            const today = new Date().toISOString().slice(0, 10);
            walkinSubmit.disabled = true;
            const { error } = await window.sb.from('walk_in_booking').insert({
                staff_id: window.inigosyncProfile.id,
                sports: walkinState.court,
                courts: walkinState.court,
                time_date: new Date(`${today}T${walkinState.time}:00`).toISOString(),
                status: 'pending',
                payment_id: null,
            });
            walkinSubmit.disabled = false;

            if (error) {
                window.InigoToast?.show(error.message || 'Could not record this walk-in.', true);
                return;
            }
            window.InigoToast?.show('Walk-in recorded.');

            if (recentList) {
                const row = document.createElement('div');
                row.className = 'staff-recent-row';
                const amount = (walkinState.rate * walkinState.duration).toFixed(2);
                row.innerHTML = `
                    <div class="staff-recent-icon">
                        <svg viewBox="0 0 24 24" fill="none"><circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="2.5" transform="scale(0.4)"/></svg>
                    </div>
                    <div class="staff-recent-info">
                        <h4>${walkinState.name} — ${walkinState.court}</h4>
                        <p>${formatTime12h(walkinState.time)} · ₱${amount} · ${walkinState.payment === 'cash' ? 'Cash' : 'GCash'}</p>
                    </div>
                    <span class="staff-status walkin">Walk-in</span>
                `;
                const label = recentList.querySelector('.staff-form-label');
                if (label && label.nextSibling) {
                    recentList.insertBefore(row, label.nextSibling);
                } else {
                    recentList.appendChild(row);
                }
            }

            // Reset the form for the next walk-in.
            if (walkinName) walkinName.value = '';
            if (walkinMobile) walkinMobile.value = '';
            walkinState.name = '';
            updateWalkinSummary();
        });
    }

    updateWalkinSummary();

    // ------------------------------------------------------------------
    // Court Schedule — sport tab filtering. The grid itself stays on static
    // demo data this pass: each cell is a fixed time-row x court-column
    // slot, but there's no per-court-instance identity in the schema (courts
    // are just a free-text tag on a booking) to map real rows onto it
    // honestly. Followup once court identity is decided.
    // ------------------------------------------------------------------
    const sportTabs = document.querySelector('[data-staff-sport-tabs]');
    const scheduleCells = document.querySelectorAll('.staff-schedule-cell');

    if (sportTabs) {
        sportTabs.querySelectorAll('[data-staff-chip]').forEach((chip) => {
            chip.addEventListener('click', () => {
                sportTabs.querySelectorAll('[data-staff-chip]').forEach((c) => c.classList.remove('is-active'));
                chip.classList.add('is-active');
                const sport = chip.dataset.staffSport;

                scheduleCells.forEach((cell) => {
                    const match = sport === 'all' || cell.dataset.sport === sport;
                    cell.style.opacity = match ? '1' : '0.25';
                });
            });
        });
    }

    // ------------------------------------------------------------------
    // Staff Profile — prefill from the real signed-in profile and wire the
    // Save button to a real update.
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
