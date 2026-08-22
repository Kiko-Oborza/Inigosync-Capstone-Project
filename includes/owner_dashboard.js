// IñigoSync — Owner Dashboard controller
// Staff Management and Account Settings talk to the real Supabase database.
// Court Listings, Payment Configuration, and Media Manager are still
// UI/design only — those TODOs are unchanged. (Booking trend chart setup
// lives in event/chart.js, loaded below.)

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
        row.innerHTML = `
            <td class="admin-cell-main" data-admin-staff-name-cell>${profile.full_name || '—'}</td>
            <td data-admin-staff-email-cell>${profile.email || '—'}</td>
            <td data-admin-staff-position-cell>${profile.position || '—'}</td>
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
                    nameCell.innerHTML = `<input type="text" class="admin-input" value="${currentName}">`;
                    positionCell.innerHTML = `<input type="text" class="admin-input" value="${currentPosition}">`;
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

    // Owner Profile — prefill from the real signed-in profile. The
    // "Username" field has no backing column (profiles has no username),
    // so it stays display-only and is never persisted.
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
            if (!window.sb) return;
            const settingsPanel = document.querySelector('[data-admin-panel="settings"]');
            const passwordInputs = settingsPanel.querySelectorAll('.admin-form-group input[type="password"]');
            const newPassword = passwordInputs[1]?.value;
            const confirmPassword = passwordInputs[2]?.value;

            if (!newPassword) {
                window.InigoToast?.show('Enter a new password.', true);
                return;
            }
            if (newPassword !== confirmPassword) {
                window.InigoToast?.show('Passwords do not match.', true);
                return;
            }

            adminPasswordSaveBtn.disabled = true;
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
    // Media Manager — home featured slideshow (replace/remove/add) and
    // per-sport court photos. Client-side preview only, via
    // URL.createObjectURL; nothing is uploaded or persisted.
    // TODO: wire to a real backend upload endpoint (multipart POST) once
    // the backend (PHP/MySQL) is ready — see includes/courts-data.js for
    // the matching TODO on the read side of this data.
    // ------------------------------------------------------------------
    document.querySelectorAll('[data-admin-slide]').forEach((card) => {
        const replaceBtn = card.querySelector('[data-admin-slide-replace]');
        const removeBtn = card.querySelector('[data-admin-slide-remove]');
        const fileInput = card.querySelector('[data-admin-slide-file]');
        const img = card.querySelector('[data-admin-slide-img]');

        if (replaceBtn && fileInput) {
            replaceBtn.addEventListener('click', () => fileInput.click());
        }

        if (fileInput && img) {
            fileInput.addEventListener('change', () => {
                const file = fileInput.files && fileInput.files[0];
                if (!file) return;
                img.src = URL.createObjectURL(file);
                // TODO: POST /api/admin/media/slides/:id once the backend is ready.
                console.log('[admin] slide photo replaced (preview only, placeholder)', file.name);
            });
        }

        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                // TODO: DELETE /api/admin/media/slides/:id once the backend is ready.
                console.log('[admin] slide removed (placeholder)');
                card.remove();
            });
        }
    });

    const slideDropzone = document.querySelector('[data-admin-slide-dropzone]');
    if (slideDropzone) {
        const addFileInput = slideDropzone.querySelector('[data-admin-slide-add-file]');

        slideDropzone.addEventListener('click', () => {
            if (addFileInput) addFileInput.click();
        });

        slideDropzone.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (addFileInput) addFileInput.click();
            }
        });

        ['dragenter', 'dragover'].forEach((evt) => {
            slideDropzone.addEventListener(evt, (e) => {
                e.preventDefault();
                slideDropzone.classList.add('is-dragover');
            });
        });

        ['dragleave', 'drop'].forEach((evt) => {
            slideDropzone.addEventListener(evt, (e) => {
                e.preventDefault();
                slideDropzone.classList.remove('is-dragover');
            });
        });

        slideDropzone.addEventListener('drop', (e) => {
            const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (!file) return;
            // TODO: POST /api/admin/media/slides once the backend is ready —
            // this demo only logs the dropped file, it doesn't add a new
            // slide card (that needs a slot-limit + real upload flow).
            console.log('[admin] new slide dropped (placeholder)', file.name);
        });

        if (addFileInput) {
            addFileInput.addEventListener('change', () => {
                const file = addFileInput.files && addFileInput.files[0];
                if (!file) return;
                console.log('[admin] new slide selected (placeholder)', file.name);
            });
        }
    }

    document.querySelectorAll('[data-admin-mediacourt]').forEach((card) => {
        const replaceBtn = card.querySelector('[data-admin-mediacourt-replace]');
        const fileInput = card.querySelector('[data-admin-mediacourt-file]');
        const img = card.querySelector('[data-admin-mediacourt-img]');
        const caption = card.querySelector('.admin-mediacourt-body p');

        if (replaceBtn && fileInput) {
            replaceBtn.addEventListener('click', () => fileInput.click());
        }

        if (fileInput && img) {
            fileInput.addEventListener('change', () => {
                const file = fileInput.files && fileInput.files[0];
                if (!file) return;
                img.src = URL.createObjectURL(file);
                if (caption) {
                    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    caption.textContent = `updated ${today}`;
                }
                // TODO: POST /api/admin/media/courts/:sport once the backend is ready.
                console.log('[admin] court photo replaced (preview only, placeholder)', file.name);
            });
        }
    });
});
