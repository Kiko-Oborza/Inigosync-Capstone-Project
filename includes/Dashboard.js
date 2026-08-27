// IñigoSync — Customer Dashboard controller
// Handles: sidebar/topbar panel switching, mobile sidebar toggle, profile
// dropdown, court "Book Now" hand-off into the Booking panel, time-slot and
// payment-option selection with a live summary recalculation, filter chips,
// calendar month label cycling, and password show/hide toggles.
//
// Booking, My Bookings, Receipts, Profile, and Settings talk to the real
// Supabase database. Everything else here (panel switching, hero carousel,
// filter chips, mini calendar) is UI-only, same as before.

document.addEventListener('DOMContentLoaded', () => {
    const panels = document.querySelectorAll('[data-dash-panel]');
    const navButtons = document.querySelectorAll('[data-dash-nav]');
    const titleEl = document.querySelector('[data-dash-title]');
    const subtitleEl = document.querySelector('[data-dash-subtitle]');

    const panelMeta = {
        overview: { title: 'Dashboard', subtitle: "Welcome back, here's what's happening with your bookings." },
        courts: { title: 'Courts', subtitle: 'Check rates, features, and real-time availability before you book.' },
        booking: { title: 'Book a Court', subtitle: 'Select a court, date, and time slot to reserve your schedule.' },
        bookings: { title: 'My Bookings', subtitle: "Track the status of every reservation you've made." },
        receipts: { title: 'Receipts', subtitle: 'Payment records and invoices for your completed bookings.' },
        profile: { title: 'My Profile', subtitle: 'Your personal details and booking history at a glance.' },
        settings: { title: 'Account Settings', subtitle: 'Update your personal details and manage your password.' },
    };

    function setActivePanel(name) {
        panels.forEach((panel) => {
            panel.classList.toggle('is-active', panel.dataset.dashPanel === name);
        });

        document.querySelectorAll('[data-dash-nav]').forEach((btn) => {
            // Only sidebar links get the highlighted state (topbar/profile
            // menu shortcuts to the same panel shouldn't visually toggle).
            if (btn.closest('.dash-nav')) {
                btn.classList.toggle('is-active', btn.dataset.dashNav === name);
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

    navButtons.forEach((btn) => {
        btn.addEventListener('click', () => setActivePanel(btn.dataset.dashNav));
    });

    // ------------------------------------------------------------------
    // Mobile sidebar toggle
    // ------------------------------------------------------------------
    const mobileToggle = document.querySelector('[data-dash-mobile-toggle]');
    const scrim = document.querySelector('[data-dash-scrim]');

    function closeMobileSidebar() {
        document.body.classList.remove('dash-sidebar-open');
    }

    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            document.body.classList.toggle('dash-sidebar-open');
        });
    }
    if (scrim) {
        scrim.addEventListener('click', closeMobileSidebar);
    }

    // ------------------------------------------------------------------
    // Overview — featured hero banner (auto-rotating, same interval /
    // crossfade / pause-on-hover / reduced-motion pattern as the landing
    // page's includes/home-showcase.js carousel, reimplemented here since
    // this markup is scoped to the dashboard).
    // ------------------------------------------------------------------
    const heroEl = document.querySelector('[data-dash-hero]');

    if (heroEl) {
        const heroSlides = heroEl.querySelectorAll('[data-dash-hero-slide]');
        const heroDots = heroEl.querySelectorAll('[data-dash-hero-dot]');
        const heroPrefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        let heroIndex = 0;
        let heroTimer = null;

        function updateHeroSlide(newIndex, skipTimer = false) {
            if (newIndex >= heroSlides.length) newIndex = 0;
            if (newIndex < 0) newIndex = heroSlides.length - 1;

            heroSlides.forEach((s) => s.classList.remove('is-active'));
            heroDots.forEach((d) => {
                d.classList.remove('is-active');
                d.setAttribute('aria-current', 'false');
            });

            heroSlides[newIndex].classList.add('is-active');
            heroDots[newIndex].classList.add('is-active');
            heroDots[newIndex].setAttribute('aria-current', 'true');

            heroIndex = newIndex;

            if (!skipTimer) {
                clearHeroAutoplay();
                startHeroAutoplay();
            }
        }

        function startHeroAutoplay() {
            if (heroPrefersReducedMotion) return;
            heroTimer = setInterval(() => {
                updateHeroSlide(heroIndex + 1, true);
            }, 5000);
        }

        function clearHeroAutoplay() {
            if (heroTimer) {
                clearInterval(heroTimer);
                heroTimer = null;
            }
        }

        heroDots.forEach((dot, index) => {
            dot.addEventListener('click', () => updateHeroSlide(index));
        });

        heroEl.addEventListener('mouseenter', clearHeroAutoplay);
        heroEl.addEventListener('mouseleave', startHeroAutoplay);
        heroEl.addEventListener('focusin', clearHeroAutoplay);
        heroEl.addEventListener('focusout', () => {
            setTimeout(() => {
                if (!heroEl.contains(document.activeElement)) startHeroAutoplay();
            }, 0);
        });

        startHeroAutoplay();
    }

    // ------------------------------------------------------------------
    // Profile dropdown
    // ------------------------------------------------------------------
    const profile = document.querySelector('[data-dash-profile]');
    const profileTrigger = document.querySelector('[data-dash-profile-trigger]');

    function closeProfileMenu() {
        if (profile) profile.removeAttribute('data-open');
    }

    if (profileTrigger && profile) {
        profileTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = profile.hasAttribute('data-open');
            if (isOpen) {
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
    // Filter chips (Courts / My Bookings panels) — visual state only.
    // ------------------------------------------------------------------
    document.querySelectorAll('.dash-filter-row').forEach((row) => {
        row.querySelectorAll('[data-dash-chip]').forEach((chip) => {
            chip.addEventListener('click', () => {
                row.querySelectorAll('[data-dash-chip]').forEach((c) => c.classList.remove('is-active'));
                chip.classList.add('is-active');
                // TODO: filter the court/booking list once real data exists.
            });
        });
    });

    // ------------------------------------------------------------------
    // Mini calendar — month label cycling only (no real date logic yet).
    // ------------------------------------------------------------------
    const calLabel = document.querySelector('[data-dash-cal-label]');
    const calPrev = document.querySelector('[data-dash-cal-prev]');
    const calNext = document.querySelector('[data-dash-cal-next]');
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    let calMonthIndex = 6; // July

    function renderCalLabel() {
        if (calLabel) calLabel.textContent = `${months[calMonthIndex]} 2026`;
    }

    if (calPrev) calPrev.addEventListener('click', () => {
        calMonthIndex = (calMonthIndex + 11) % 12;
        renderCalLabel();
    });
    if (calNext) calNext.addEventListener('click', () => {
        calMonthIndex = (calMonthIndex + 1) % 12;
        renderCalLabel();
    });

    document.querySelectorAll('.dash-cal-day').forEach((day) => {
        day.addEventListener('click', () => {
            if (day.classList.contains('is-muted')) return;
            document.querySelectorAll('.dash-cal-day').forEach((d) => d.classList.remove('is-selected'));
            day.classList.add('is-selected');
        });
    });

    // ------------------------------------------------------------------
    // Booking Management — court/date/slot/payment selection with a live
    // summary recalculation. Everything here is client-side UI state;
    // actual availability + pricing will come from the backend later.
    // ------------------------------------------------------------------
    const bookSelect = document.querySelector('[data-dash-book-select]');
    const bookDate = document.querySelector('[data-dash-book-date]');
    const slots = document.querySelectorAll('[data-dash-slot]');
    const paymentOptions = document.querySelectorAll('[data-dash-payment-option]');
    const bookSubmit = document.querySelector('[data-dash-book-submit]');

    const summaryCourt = document.querySelector('[data-dash-summary-court]');
    const summaryDate = document.querySelector('[data-dash-summary-date]');
    const summaryTime = document.querySelector('[data-dash-summary-time]');
    const summaryRate = document.querySelector('[data-dash-summary-rate]');
    const summaryPayment = document.querySelector('[data-dash-summary-payment]');
    const summaryTotal = document.querySelector('[data-dash-summary-total]');

    let bookingState = {
        court: bookSelect ? bookSelect.value : 'Basketball',
        rate: bookSelect ? Number(bookSelect.selectedOptions[0].dataset.rate) : 300,
        date: bookDate ? bookDate.value : '',
        time: null,
        paymentType: 'downpayment',
    };

    function formatDate(value) {
        if (!value) return '—';
        const d = new Date(`${value}T00:00:00`);
        if (Number.isNaN(d.getTime())) return value;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function updateSummary() {
        const isFull = bookingState.paymentType === 'full';
        const amount = isFull ? bookingState.rate : bookingState.rate * 0.5;

        if (summaryCourt) summaryCourt.textContent = bookingState.court;
        if (summaryDate) summaryDate.textContent = formatDate(bookingState.date);
        if (summaryTime) summaryTime.textContent = bookingState.time || '— Select a slot —';
        if (summaryRate) summaryRate.textContent = `₱${bookingState.rate} / hr`;
        if (summaryPayment) summaryPayment.textContent = isFull ? 'Full Payment' : 'Downpayment (50%)';
        if (summaryTotal) summaryTotal.textContent = `₱${amount.toFixed(2)}`;

        if (bookSubmit) {
            const ready = Boolean(bookingState.time);
            bookSubmit.disabled = !ready;
            bookSubmit.textContent = ready ? 'Request Booking' : 'Select a time slot to continue';
        }
    }

    if (bookSelect) {
        bookSelect.addEventListener('change', () => {
            bookingState.court = bookSelect.value;
            bookingState.rate = Number(bookSelect.selectedOptions[0].dataset.rate);
            updateSummary();
        });
    }

    if (bookDate) {
        bookDate.addEventListener('change', () => {
            bookingState.date = bookDate.value;
            updateSummary();
        });
    }

    slots.forEach((slot) => {
        slot.addEventListener('click', () => {
            slots.forEach((s) => s.classList.remove('is-selected'));
            slot.classList.add('is-selected');
            bookingState.time = slot.textContent.trim();
            updateSummary();
        });
    });

    paymentOptions.forEach((option) => {
        option.addEventListener('click', () => {
            paymentOptions.forEach((o) => o.classList.remove('is-selected'));
            option.classList.add('is-selected');
            const radio = option.querySelector('input[type="radio"]');
            if (radio) {
                radio.checked = true;
                bookingState.paymentType = radio.dataset.dashPayment;
            }
            updateSummary();
        });
    });

    // "8:00 AM" / "6:00 PM" -> 24h "08:00" / "18:00", for building the
    // booking's time_date timestamp (each slot is a single 1-hour start time).
    function slotTo24h(label) {
        const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(label || '');
        if (!match) return null;
        let [, h, m, period] = match;
        h = Number(h) % 12;
        if (period.toUpperCase() === 'PM') h += 12;
        return `${String(h).padStart(2, '0')}:${m}`;
    }

    if (bookSubmit) {
        bookSubmit.addEventListener('click', async () => {
            if (bookSubmit.disabled) return;
            if (!window.sb || !window.inigosyncProfile) {
                window.InigoToast?.show('Unable to reach the server right now. Please try again shortly.', true);
                return;
            }

            const time24 = slotTo24h(bookingState.time);
            if (!bookingState.date || !time24) {
                window.InigoToast?.show('Please select a date and time slot.', true);
                return;
            }

            const originalLabel = bookSubmit.textContent;
            bookSubmit.disabled = true;
            bookSubmit.textContent = 'Submitting…';

            // `courts` is what refreshMyBookings() below actually reads back
            // (rate lookup via courtRates[booking.courts], and the table's
            // main cell), so it gets the customer's selection. `sports` used
            // to be a copy-paste duplicate of the same value — nothing in
            // this dashboard reads it, and this simplified single-select
            // booking flow doesn't collect a sport category separately from
            // the court, so it's left unset here instead of writing a second
            // copy of the same string under a misleading column.
            const { error } = await window.sb.from('booking').insert({
                customer_id: window.inigosyncProfile.id,
                sports: null,
                courts: bookingState.court,
                time_date: new Date(`${bookingState.date}T${time24}:00`).toISOString(),
                status: 'pending',
                payment_id: null,
            });

            if (error) {
                window.InigoToast?.show(error.message || 'Could not submit your booking. Please try again.', true);
                bookSubmit.disabled = false;
                bookSubmit.textContent = originalLabel;
                return;
            }

            window.InigoToast?.show('Booking request submitted — we\'ll confirm it shortly.');
            slots.forEach((s) => s.classList.remove('is-selected'));
            bookingState.time = null;
            updateSummary();
            refreshMyBookings();
        });
    }

    updateSummary();

    // "Book Now" on a court card jumps to the Booking panel and pre-fills
    // the court + rate so the customer doesn't have to reselect it.
    document.querySelectorAll('[data-dash-book-court]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const court = btn.dataset.dashBookCourt;
            const rate = Number(btn.dataset.dashBookRate);

            if (bookSelect) {
                bookSelect.value = court;
                bookingState.court = court;
                bookingState.rate = rate || bookingState.rate;
            }

            slots.forEach((s) => s.classList.remove('is-selected'));
            bookingState.time = null;
            updateSummary();
            setActivePanel('booking');
        });
    });

    // ------------------------------------------------------------------
    // My Bookings — real data, fetched once the signed-in profile is ready
    // (authGuard.js dispatches this after its own session+profile check).
    // ------------------------------------------------------------------
    const bookingsTableBody = document.querySelector('[data-dash-panel="bookings"] tbody');

    // Same rate lookup already used by the booking form's <select> — reused
    // here only to show a known amount; no cost is persisted anywhere since
    // no payment record exists yet.
    const courtRates = {};
    if (bookSelect) {
        Array.from(bookSelect.options).forEach((opt) => {
            courtRates[opt.value] = Number(opt.dataset.rate) || null;
        });
    }

    function formatBookingDate(iso) {
        const d = new Date(iso);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function formatBookingTime(iso) {
        const d = new Date(iso);
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }

    async function refreshMyBookings() {
        if (!bookingsTableBody || !window.sb || !window.inigosyncProfile) return;

        const { data, error } = await window.sb
            .from('booking')
            .select('*')
            .eq('customer_id', window.inigosyncProfile.id)
            .order('time_date', { ascending: false });

        if (error) {
            console.error('[dashboard] failed to load bookings', error);
            return;
        }

        bookingsTableBody.innerHTML = '';

        if (!data || data.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="6" style="text-align:center; color: var(--color-ink-faint);">No bookings yet — book a court to see it here.</td>';
            bookingsTableBody.appendChild(row);
            return;
        }

        data.forEach((booking) => {
            const rate = courtRates[booking.courts];
            const amount = rate ? `₱${rate.toFixed(2)}` : '—';
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="dash-cell-main">${booking.courts}</td>
                <td>${formatBookingDate(booking.time_date)}</td>
                <td>${formatBookingTime(booking.time_date)}</td>
                <td>${amount}</td>
                <td><span class="dash-status ${booking.status}">${booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}</span></td>
                <td>
                    <div class="dash-table-actions">
                        ${['pending', 'confirmed'].includes(booking.status)
                            ? `<button type="button" class="dash-mini-btn is-danger" data-dash-cancel-booking="${booking.booking_id}">Cancel</button>`
                            : ''}
                    </div>
                </td>
            `;
            bookingsTableBody.appendChild(row);
        });

        bookingsTableBody.querySelectorAll('[data-dash-cancel-booking]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                if (!window.confirm('Cancel this booking?')) return;
                btn.disabled = true;
                const { error: cancelError } = await window.sb
                    .from('booking')
                    .update({ status: 'cancelled' })
                    .eq('booking_id', btn.dataset.dashCancelBooking);
                if (cancelError) {
                    window.InigoToast?.show(cancelError.message || 'Could not cancel this booking.', true);
                    btn.disabled = false;
                    return;
                }
                refreshMyBookings();
            });
        });
    }

    // ------------------------------------------------------------------
    // Receipts — no payment records exist yet this pass, so this is an
    // honest empty state rather than fake data.
    // ------------------------------------------------------------------
    const receiptsGrid = document.querySelector('.dash-receipt-grid');
    if (receiptsGrid) {
        receiptsGrid.innerHTML = '<p style="color: var(--color-ink-faint); padding: 24px 4px;">No receipts yet — receipts will appear here once online payments are available.</p>';
    }

    // ------------------------------------------------------------------
    // Profile + Settings — prefill from the real signed-in profile, and
    // wire the two Settings save buttons (Personal Info vs Change Password
    // — distinguished by data-dash-settings-save="profile"/"password" in
    // the markup) to real Supabase calls.
    // ------------------------------------------------------------------
    function renderProfile(profile) {
        const initials = (profile.full_name || profile.email || '?')
            .split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

        document.querySelectorAll('.dash-avatar').forEach((el) => { el.textContent = initials; });
        document.querySelectorAll('[data-dash-profile-name]').forEach((el) => { el.textContent = profile.full_name || 'Customer'; });

        const profileCardInfo = document.querySelector('[data-dash-panel="profile"] .dash-profile-card-info h3');
        if (profileCardInfo) profileCardInfo.textContent = profile.full_name || 'Customer';

        const metaItems = document.querySelectorAll('[data-dash-panel="profile"] .dash-profile-meta-item');
        if (metaItems[0]) metaItems[0].querySelector('span:last-child').textContent = profile.email || '—';
        if (metaItems[1]) metaItems[1].querySelector('span:last-child').textContent = profile.contact_num || '—';

        const settingsPanel = document.querySelector('[data-dash-panel="settings"]');
        if (settingsPanel) {
            const inputs = settingsPanel.querySelectorAll('.dash-settings-grid .dash-input');
            if (inputs[0]) inputs[0].value = profile.full_name || '';
            if (inputs[1]) inputs[1].value = profile.email || '';
            if (inputs[2]) inputs[2].value = profile.contact_num || '';
        }
    }

    document.addEventListener('inigosync:profile-ready', (e) => {
        renderProfile(e.detail);
        refreshMyBookings();
    });
    if (window.inigosyncProfile) {
        renderProfile(window.inigosyncProfile);
        refreshMyBookings();
    }

    // ------------------------------------------------------------------
    // Account Settings — password visibility toggles (same pattern as
    // the auth modal) and a placeholder save handler.
    // ------------------------------------------------------------------
    document.querySelectorAll('[data-dash-toggle-password]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const input = btn.previousElementSibling;
            if (!input) return;
            const isHidden = input.type === 'password';
            input.type = isHidden ? 'text' : 'password';
            btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
        });
    });

    const profileSaveBtn = document.querySelector('[data-dash-settings-save="profile"]');
    if (profileSaveBtn) {
        profileSaveBtn.addEventListener('click', async () => {
            if (!window.sb || !window.inigosyncProfile) return;
            const settingsPanel = document.querySelector('[data-dash-panel="settings"]');
            const inputs = settingsPanel.querySelectorAll('.dash-settings-grid .dash-input');
            const full_name = inputs[0]?.value.trim();
            const contact_num = inputs[2]?.value.trim();

            profileSaveBtn.disabled = true;
            const { error } = await window.sb
                .from('profiles')
                .update({ full_name, contact_num })
                .eq('id', window.inigosyncProfile.id);
            profileSaveBtn.disabled = false;

            if (error) {
                window.InigoToast?.show(error.message || 'Could not save your changes.', true);
                return;
            }

            window.inigosyncProfile.full_name = full_name;
            window.inigosyncProfile.contact_num = contact_num;
            renderProfile(window.inigosyncProfile);
            window.InigoToast?.show('Profile updated.');
        });
    }

    const passwordSaveBtn = document.querySelector('[data-dash-settings-save="password"]');
    if (passwordSaveBtn) {
        passwordSaveBtn.addEventListener('click', async () => {
            if (!window.sb) return;
            const settingsPanel = document.querySelector('[data-dash-panel="settings"]');
            const passwordInputs = settingsPanel.querySelectorAll('.dash-form-group input[type="password"]');
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

            passwordSaveBtn.disabled = true;
            const { error } = await window.sb.auth.updateUser({ password: newPassword });
            passwordSaveBtn.disabled = false;

            if (error) {
                window.InigoToast?.show(error.message || 'Could not update your password.', true);
                return;
            }

            passwordInputs.forEach((input) => { input.value = ''; });
            window.InigoToast?.show('Password updated.');
        });
    }
});