// IñigoSync — Owner Dashboard controller
// UI/design only — nothing here talks to a backend yet. Anywhere a real
// submit would happen is logged with console.log and a TODO, matching the
// pattern used in includes/auth.js and includes/staff_dashboard.js.
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
    }

    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            document.body.classList.toggle('admin-sidebar-open');
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

    // ------------------------------------------------------------------
    // Logout — placeholder only, no session handling yet.
    // ------------------------------------------------------------------
    document.querySelectorAll('[data-admin-logout]').forEach((btn) => {
        btn.addEventListener('click', () => {
            // TODO: call the real logout endpoint and redirect to the
            // landing page once the backend session handling is wired up.
            console.log('[admin] logout requested (placeholder)');
        });
    });

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
        staffSubmitBtn.addEventListener('click', () => {
            const nameInput = document.querySelector('[data-admin-staff-name]');
            const emailInput = document.querySelector('[data-admin-staff-email]');
            const roleSelect = document.querySelector('[data-admin-staff-role]');

            const name = nameInput ? nameInput.value.trim() : '';
            const email = emailInput ? emailInput.value.trim() : '';
            const role = roleSelect ? roleSelect.value : '';

            if (!name || !email) {
                if (!name && nameInput) nameInput.focus();
                else if (emailInput) emailInput.focus();
                return;
            }

            // TODO: POST /api/admin/staff once the backend (PHP/MySQL) is
            // ready — this only appends a row to the table for now.
            console.log('[admin] staff account created (placeholder)', { name, email, role });

            if (staffTable) {
                const tbody = staffTable.querySelector('tbody');
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td class="admin-cell-main">${name}</td>
                    <td>${email}</td>
                    <td>${role}</td>
                    <td><span class="admin-status active">Active</span></td>
                    <td>
                        <div class="admin-table-actions">
                            <button type="button" class="admin-mini-btn" data-admin-reset-password>Reset Password</button>
                            <button type="button" class="admin-mini-btn" data-admin-edit-staff>Edit</button>
                            <button type="button" class="admin-mini-btn is-danger" data-admin-delete-staff>Delete</button>
                        </div>
                    </td>
                `;
                tbody.appendChild(row);
                wireStaffRowActions(row);
            }

            if (nameInput) nameInput.value = '';
            if (emailInput) emailInput.value = '';
            if (staffForm) staffForm.classList.remove('is-open');
        });
    }

    function wireStaffRowActions(scope) {
        scope.querySelectorAll('[data-admin-reset-password]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const row = btn.closest('tr');
                const name = row ? row.querySelector('.admin-cell-main').textContent : '';
                // TODO: POST /api/admin/staff/:id/reset-password once the
                // backend is ready — this should email/display a temp password.
                console.log(`[admin] password reset requested for ${name} (placeholder)`);
            });
        });

        scope.querySelectorAll('[data-admin-edit-staff]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const row = btn.closest('tr');
                const name = row ? row.querySelector('.admin-cell-main').textContent : '';
                // TODO: open a real edit form pre-filled with this staff
                // member's data once the backend is ready.
                console.log(`[admin] edit staff requested for ${name} (placeholder)`);
            });
        });

        scope.querySelectorAll('[data-admin-delete-staff]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const row = btn.closest('tr');
                if (!row) return;
                const name = row.querySelector('.admin-cell-main').textContent;
                if (!window.confirm(`Remove ${name}'s staff account?`)) return;
                // TODO: DELETE /api/admin/staff/:id once the backend is ready.
                console.log(`[admin] staff account deleted (placeholder): ${name}`);
                row.remove();
            });
        });
    }

    if (staffTable) wireStaffRowActions(staffTable);

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
    // Payment Configuration — toggle switches + save
    // ------------------------------------------------------------------
    document.querySelectorAll('[data-admin-payment-toggle]').forEach((toggle) => {
        toggle.addEventListener('click', () => {
            toggle.classList.toggle('is-on');
        });
    });

    const paymentSaveBtn = document.querySelector('[data-admin-payment-save]');
    if (paymentSaveBtn) {
        paymentSaveBtn.addEventListener('click', () => {
            const gcashOn = document.querySelectorAll('[data-admin-payment-toggle]')[0]?.classList.contains('is-on');
            const cashOn = document.querySelectorAll('[data-admin-payment-toggle]')[1]?.classList.contains('is-on');
            const downpaymentPct = document.querySelector('[data-admin-downpayment-pct]')?.value;
            // TODO: PATCH /api/admin/payment-settings once the backend is ready.
            console.log('[admin] payment settings saved (placeholder)', { gcashOn, cashOn, downpaymentPct });
        });
    }

    // ------------------------------------------------------------------
    // Court Listings — filter chips, toggle add-court form, add court,
    // edit / activate-deactivate
    // ------------------------------------------------------------------
    document.querySelectorAll('[data-admin-court-filter]').forEach((chip) => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('[data-admin-court-filter]').forEach((c) => c.classList.remove('is-active'));
            chip.classList.add('is-active');
            const filter = chip.dataset.adminCourtFilter;
            document.querySelectorAll('[data-admin-court-status]').forEach((card) => {
                const match = filter === 'all' || card.dataset.adminCourtStatus === filter;
                card.style.display = match ? '' : 'none';
            });
        });
    });

    const courtFormToggleBtns = document.querySelectorAll('[data-admin-toggle-court-form]');
    const courtForm = document.querySelector('[data-admin-court-form]');

    courtFormToggleBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            if (courtForm) courtForm.classList.toggle('is-open');
        });
    });

    const courtGrid = document.querySelector('[data-admin-court-grid]');
    const courtSubmitBtn = document.querySelector('[data-admin-court-submit]');

    if (courtSubmitBtn) {
        courtSubmitBtn.addEventListener('click', () => {
            const nameInput = document.querySelector('[data-admin-court-name]');
            const sportSelect = document.querySelector('[data-admin-court-sport]');
            const rateInput = document.querySelector('[data-admin-court-rate]');
            const unitSelect = document.querySelector('[data-admin-court-unit]');

            const name = nameInput ? nameInput.value.trim() : '';
            const rate = rateInput ? rateInput.value : '0';

            if (!name) {
                if (nameInput) nameInput.focus();
                return;
            }

            // TODO: POST /api/admin/courts (multipart, for the image) once
            // the backend is ready — this only appends a card for now.
            console.log('[admin] court created (placeholder)', {
                name, sport: sportSelect?.value, rate, unit: unitSelect?.value,
            });

            if (courtGrid) {
                const card = document.createElement('article');
                card.className = 'admin-court-card';
                card.dataset.adminCourtStatus = 'active';
                card.innerHTML = `
                    <div class="admin-court-media">
                        <svg viewBox="0 0 48 48" fill="none"><rect x="8" y="14" width="32" height="20" rx="2" stroke="currentColor" stroke-width="2.5"/></svg>
                        <span class="admin-status active">Active</span>
                    </div>
                    <div class="admin-court-body">
                        <h3>${name}</h3>
                        <p class="admin-court-rate">₱${rate} <span>/ ${unitSelect ? unitSelect.value : 'hour'}</span></p>
                        <div class="admin-court-tags"><span>${sportSelect ? sportSelect.value : ''}</span></div>
                        <div class="admin-court-actions">
                            <button type="button" class="admin-btn-secondary" data-admin-court-edit>Edit</button>
                            <button type="button" class="admin-btn-secondary" data-admin-court-toggle-status>Deactivate</button>
                        </div>
                    </div>
                `;
                courtGrid.appendChild(card);
                wireCourtCardActions(card);
            }

            if (nameInput) nameInput.value = '';
            if (rateInput) rateInput.value = '';
            if (courtForm) courtForm.classList.remove('is-open');
        });
    }

    function wireCourtCardActions(scope) {
        scope.querySelectorAll('[data-admin-court-edit]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const card = btn.closest('.admin-court-card');
                const title = card ? card.querySelector('h3').textContent : '';
                // TODO: open a real edit form (name, rate, image) pre-filled
                // with this court's data once the backend is ready.
                console.log(`[admin] edit court requested for ${title} (placeholder)`);
            });
        });

        scope.querySelectorAll('[data-admin-court-toggle-status]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const card = btn.closest('.admin-court-card');
                if (!card) return;
                const isActive = card.dataset.adminCourtStatus === 'active';
                const nextStatus = isActive ? 'inactive' : 'active';
                card.dataset.adminCourtStatus = nextStatus;

                const badge = card.querySelector('.admin-court-media .admin-status');
                if (badge) {
                    badge.textContent = nextStatus === 'active' ? 'Active' : 'Deactivated';
                    badge.className = `admin-status ${nextStatus === 'active' ? 'active' : 'inactive'}`;
                }
                btn.textContent = nextStatus === 'active' ? 'Deactivate' : 'Activate';

                // TODO: PATCH /api/admin/courts/:id { is_active } once the
                // backend is ready.
                console.log(`[admin] court status toggled to ${nextStatus} (placeholder)`);
            });
        });
    }

    if (courtGrid) wireCourtCardActions(courtGrid);

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

    document.querySelectorAll('[data-admin-settings-save]').forEach((btn) => {
        btn.addEventListener('click', () => {
            // TODO: wire up to the real "update profile" / "change password"
            // endpoints once the backend is ready.
            console.log('[admin] settings save requested (placeholder)');
        });
    });
});
