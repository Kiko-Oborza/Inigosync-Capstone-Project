// IñigoSync — Customer Dashboard controller
// Handles: sidebar/topbar panel switching, mobile sidebar toggle, profile
// dropdown, court "Book Now" hand-off into the Booking panel, time-slot and
// payment-option selection with a live summary recalculation, filter chips,
// calendar month label cycling, and password show/hide toggles.
//
// UI/design only — nothing here talks to a backend yet. Anywhere a real
// submit would happen is logged with console.log and a TODO, the same
// pattern used in includes/auth.js.

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

    // ------------------------------------------------------------------
    // Logout — placeholder only, no session handling yet.
    // ------------------------------------------------------------------
    document.querySelectorAll('[data-dash-logout]').forEach((btn) => {
        btn.addEventListener('click', () => {
            // TODO: call the real logout endpoint and redirect to the
            // landing page once the backend session handling is wired up.
            console.log('[dashboard] logout requested (placeholder)');
        });
    });

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
            bookSubmit.textContent = ready ? 'Proceed to Payment' : 'Select a time slot to continue';
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

    if (bookSubmit) {
        bookSubmit.addEventListener('click', () => {
            if (bookSubmit.disabled) return;
            // TODO: send bookingState to the real booking endpoint once the
            // backend (PHP/MySQL) is wired up, then move to a payment step.
            console.log('[dashboard] booking submitted (placeholder)', bookingState);
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

    document.querySelectorAll('[data-dash-settings-save]').forEach((btn) => {
        btn.addEventListener('click', () => {
            // TODO: wire up to the real "update profile" / "change password"
            // endpoints once the backend is ready.
            console.log('[dashboard] settings save requested (placeholder)');
        });
    });
});