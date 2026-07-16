document.addEventListener('DOMContentLoaded', () => {
    // ------------------------------------------------------------------
    // Panel switching (sidebar + topbar shortcuts)
    // ------------------------------------------------------------------
    const panels = document.querySelectorAll('[data-staff-panel]');
    const titleEl = document.querySelector('[data-staff-title]');
    const subtitleEl = document.querySelector('[data-staff-subtitle]');

    const panelMeta = {
        overview: { title: 'Booking Overview', subtitle: "Today's reservations and walk-ins at a glance." },
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
    }

    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            document.body.classList.toggle('staff-sidebar-open');
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

    // ------------------------------------------------------------------
    // Logout — placeholder only, no session handling yet.
    // ------------------------------------------------------------------
    document.querySelectorAll('[data-staff-logout]').forEach((btn) => {
        btn.addEventListener('click', () => {
            // TODO: call the real logout endpoint and redirect to the
            // landing page once the backend session handling is wired up.
            console.log('[staff] logout requested (placeholder)');
        });
    });

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
    // Booking Overview — filter chips, search, confirm/cancel/time-in
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

    wireFilterableTable('overview');
    wireFilterableTable('transactions');

    const pendingBadge = document.querySelector('[data-staff-pending-badge]');
    function updatePendingBadge() {
        const overviewTable = document.querySelector('[data-staff-table="overview"]');
        if (!overviewTable || !pendingBadge) return;
        const count = overviewTable.querySelectorAll('tbody tr[data-status="pending"]').length;
        pendingBadge.textContent = count;
        pendingBadge.style.display = count > 0 ? 'inline-block' : 'none';
    }
    updatePendingBadge();

    document.querySelectorAll('[data-staff-confirm]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const row = btn.closest('tr');
            if (!row) return;
            // TODO: PATCH /api/bookings/:id { status: 'confirmed' } once the
            // backend is ready — this only updates the UI for now.
            row.dataset.status = 'confirmed';
            const statusBadge = row.querySelector('.staff-status');
            if (statusBadge) {
                statusBadge.textContent = 'Confirmed';
                statusBadge.className = 'staff-status confirmed';
            }
            const actions = row.querySelector('.staff-table-actions');
            if (actions) {
                actions.innerHTML = '<button type="button" class="staff-mini-btn" data-staff-timein>Time-In</button>';
                actions.querySelector('[data-staff-timein]').addEventListener('click', handleTimeIn);
            }
            console.log('[staff] booking confirmed (placeholder)');
            updatePendingBadge();
        });
    });

    document.querySelectorAll('[data-staff-cancel]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const row = btn.closest('tr');
            if (!row) return;
            // TODO: PATCH /api/bookings/:id { status: 'cancelled' } once the
            // backend is ready.
            row.dataset.status = 'cancelled';
            const statusBadge = row.querySelector('.staff-status');
            if (statusBadge) {
                statusBadge.textContent = 'Cancelled';
                statusBadge.className = 'staff-status cancelled';
            }
            const actions = row.querySelector('.staff-table-actions');
            if (actions) actions.innerHTML = '';
            console.log('[staff] booking cancelled (placeholder)');
            updatePendingBadge();
        });
    });

    function handleTimeIn(e) {
        const row = e.target.closest('tr');
        if (!row) return;
        // TODO: PATCH /api/bookings/:id { checked_in_at: now } once the
        // backend is ready — this also clears the 30-minute grace period.
        const statusBadge = row.querySelector('.staff-status');
        if (statusBadge) {
            statusBadge.textContent = 'Completed';
            statusBadge.className = 'staff-status completed';
        }
        e.target.remove();
        console.log('[staff] customer timed in (placeholder)');
    }

    document.querySelectorAll('[data-staff-timein]').forEach((btn) => {
        btn.addEventListener('click', handleTimeIn);
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
        walkinSubmit.addEventListener('click', () => {
            if (!walkinState.name) {
                if (walkinName) walkinName.focus();
                return;
            }
            // TODO: POST /api/walkins once the backend (PHP/MySQL) is ready.
            // This should create the booking record, the payment record, and
            // return a receipt number to display/print.
            console.log('[staff] walk-in booking recorded (placeholder)', walkinState);

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
    // Court Schedule — sport tab filtering
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
});
