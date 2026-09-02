// IñigoSync — Customer Dashboard controller
// Handles: sidebar/topbar panel switching, mobile sidebar toggle, profile
// dropdown, the notifications dropdown, the feedback modal, the Overview
// panel's sport-grouped, sport-sorted court cards (marketing/showcase only —
// each with a per-unit combo box + swappable photo, plus the read-only
// real-time slot-peek widget from PR #1), the 3-step Book a Court wizard
// (with its dynamic court preview image), time-slot and payment-option
// selection with a live summary recalculation, My Bookings (no
// cancellation), the Receipts panel's per-booking cards + PNG download,
// Account Settings' name-part fields, and the 2-step Change Password
// wizard.
//
// This file implements Phase 1 (§1 nav, §2 feedback, §3 notifications, §4
// dashboard courts — implementation_plan.md decisions D1/D2/D6/D7), Phase 2
// (§5 booking wizard, §6 my-bookings chip removal, §7 receipts, §9 account
// settings — decisions D3/D4/D5/D8) of the redesign in
// InigoSync_Dashboard_Feedback_v6.md, AND "Revision 2" (implementation_plan.md,
// decisions R1-R6 — post-feedback-v6 corrections):
//   R1 — the Overview Courts section is re-scoped to marketing/showcase
//        only: no "Book Now" button, no click-to-book hand-off from peek
//        slots. Peek slots stays as a READ-ONLY availability display (the
//        user explicitly praised it) — see renderOverviewSlotPill() and the
//        Overview Courts widget's header comment further below.
//   R2 — the courts sort <select> defaults to grouping-by-sport
//        (overviewSortMode), with "Available first"/"Price: Low to High"
//        retained as alternatives that sort *within* each sport group.
//   R3 — My Bookings drops cancellation entirely (no Cancel control
//        anywhere) in favor of the real no-cancellation/no-refund/
//        30-minute-"Unattended" policy stated in
//        Pages/user_dashboard.html's two policy notices.
//   R4 — "Unattended" is DERIVED for display only, never written to the
//        database — see displayStatusFor() further below for the full
//        reasoning (booking.status's CHECK constraint, the 23514 error
//        branch on the booking INSERT below, and why this can't safely be
//        persisted from this repo).
//   R5 — Receipts renders one real card per booking (every booking, not
//        just ones with a payment_id) instead of a hardcoded empty state —
//        see renderReceipts() further below.
//
// Booking (including its court dropdown), the Overview panel's court
// widget, My Bookings, Receipts, Profile, and Settings talk to the real
// Supabase database — Booking's court options and the Overview widget's
// cards both read the same `court`/`sport` tables via window.InigoCourtsData
// (includes/courtsData.js; see docs/QA_AUDIT_REPORT.md P0#8). The
// per-unit combo box + photo swap on each Overview court card AND the
// Booking wizard's Step 1 preview are both built from
// window.InigoCourtsData.resolveCourtUnits(), ported from
// includes/landingPage.js into includes/courtsData.js (implementation_plan.md
// D2) so that file stays untouched. Notifications are derived from the
// customer's own `booking` rows (no `notification` table — D6). Feedback
// writes to the new `feedback` table (database/schema/009_feedback.sql),
// failing honestly with a toast if that migration hasn't been applied yet.
// Receipts (Revision 2, R5) render one card per booking, reusing
// refreshMyBookings()'s own fetch rather than a second query — rate/amount
// shows "Rate TBA" whenever a court's rate is unknown (every court today),
// exactly like the rest of this page's honesty convention; no payment
// table/method exists anywhere in this project yet. Account Settings' three
// name boxes read/write profiles.first_name/middle_name/last_name
// (database/schema/008_profile_name_parts.sql) while keeping full_name — the
// column the owner/staff dashboards still read — in sync (D3). Everything
// else here (panel switching, hero carousel) is UI-only, same as before.

document.addEventListener('DOMContentLoaded', () => {
    const panels = document.querySelectorAll('[data-dash-panel]');
    const navButtons = document.querySelectorAll('[data-dash-nav]');
    const titleEl = document.querySelector('[data-dash-title]');
    const subtitleEl = document.querySelector('[data-dash-subtitle]');

    const panelMeta = {
        overview: { title: 'Dashboard', subtitle: "Welcome back, here's what's happening with your bookings." },
        // 'courts' removed (§1/D1) — the standalone Courts panel is gone;
        // its content now lives inside 'overview' (§4/D2), which already has
        // its own entry above.
        booking: { title: 'Book a Court', subtitle: 'Follow the 3 simple steps below to reserve your schedule.' },
        bookings: { title: 'My Bookings', subtitle: "Track the status of every reservation you've made." },
        receipts: { title: 'Receipts', subtitle: 'Payment records and invoices for your completed bookings.' },
        profile: { title: 'My Profile', subtitle: 'Your personal details and booking history at a glance.' },
        settings: { title: 'Account Settings', subtitle: 'Update your personal details and manage your password.' },
    };

    function setActivePanel(name) {
        panels.forEach((panel) => {
            panel.classList.toggle('is-active', panel.dataset.dashPanel === name);
        });

        // Every navigation into the Booking panel (sidebar link, hero "Book
        // this slot", the Overview card's quick action, etc.) starts the
        // §5/D5 wizard fresh at Step 1 — a guided flow that silently resumed
        // wherever a PREVIOUS visit left off would be confusing, not guided.
        // Revision 2's R1 (implementation_plan.md) removed the two hand-offs
        // that used to need a different landing step (the Overview court
        // cards' "Book Now" button, and peek slots' click-to-book jump to
        // Step 3): the Overview Courts section is marketing/showcase only
        // now, so nothing outside this wizard pre-fills a court/date/time
        // anymore — every entry point always starts here, at Step 1.
        if (name === 'booking') goToBookStep(1);

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
        closeNotifMenu();
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
            // Keeps this dropdown and the notifications one (below) from
            // fighting each other — opening either closes the other.
            // closeNotifMenu is a hoisted function declaration defined
            // further down this file, so this reference is safe: it only
            // ever runs later, on click, by which point the whole script has
            // finished executing.
            closeNotifMenu();
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
    // Notifications dropdown (§3, D6 — implementation_plan.md). Same
    // toggle/outside-click/Escape idiom as the profile dropdown above, but
    // this one never navigates: clicking the bell just opens a popup
    // listing the signed-in customer's own real `booking` rows — upcoming
    // reservations plus cancelled/completed status alerts — newest first,
    // capped at 10 (§3's limit). Populated by renderNotifications() below,
    // called from refreshMyBookings() once that fetch resolves (reusing its
    // data — no second query against `booking`). No `notification` table
    // exists on purpose: nothing in this project would ever write to one,
    // so it would ship guaranteed-empty (D6) — this is derived data
    // instead, same "no fabricated data" rule as the rest of this file.
    // ------------------------------------------------------------------
    const notif = document.querySelector('[data-dash-notif]');
    const notifTrigger = document.querySelector('[data-dash-notif-trigger]');
    const notifList = document.querySelector('[data-dash-notif-list]');
    const notifDot = document.querySelector('[data-dash-notif-dot]');
    const NOTIF_LIMIT = 10;

    function closeNotifMenu() {
        if (notif) notif.removeAttribute('data-open');
        if (notifTrigger) notifTrigger.setAttribute('aria-expanded', 'false');
    }

    if (notifTrigger && notif) {
        notifTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = notif.hasAttribute('data-open');
            // Same "don't fight the other dropdown" rule as above, in the
            // other direction.
            closeProfileMenu();
            if (isOpen) {
                closeNotifMenu();
            } else {
                notif.setAttribute('data-open', '');
                notifTrigger.setAttribute('aria-expanded', 'true');
            }
        });

        document.addEventListener('click', (e) => {
            if (!notif.contains(e.target)) closeNotifMenu();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeNotifMenu();
        });
    }

    // Bounded to NOTIF_LIMIT (§3's "maximum of 10") and rendered in
    // whatever order `bookings` already arrives in — refreshMyBookings()
    // below fetches with `.order('time_date', { ascending: false })`, so
    // this is already "newest first" without a second sort here. Every
    // booking row becomes exactly one notification describing its CURRENT
    // status; there's no change-log to read from (booking has no
    // updated_at this repo can see), so "cancelled/completed status
    // alerts" means "a booking that IS cancelled/completed", not "just
    // changed to" — an honest, available-today interpretation rather than
    // an invented one.
    const NOTIF_STATUS_TITLES = {
        pending: 'Booking requested',
        confirmed: 'Booking confirmed',
        completed: 'Booking completed',
        cancelled: 'Booking cancelled',
    };

    // R4-3 (implementation_plan.md, "Revision 4") — each item is a real
    // <button>, not the inert <div> it used to be, carrying the booking's
    // own booking_id in data-dash-notif-booking so a click can find and jump
    // to that exact booking's receipt card (data-dash-receipt-card, keyed by
    // the SAME id — see renderReceiptCard() further below). The inner
    // .dash-notif-item-body wrapper is a <span>, not a <div>, so this stays
    // valid phrasing content inside a <button> — display:flex below (see
    // Style/Dashboard.css) lays it out identically to the old <div> either
    // way, so nothing about how this actually looks changes.
    function renderNotificationItem(item) {
        const bookingIdAttr = window.escapeHtml(String(item.bookingId));
        return `
            <button type="button" class="dash-notif-item" data-dash-notif-booking="${bookingIdAttr}">
                <span class="dash-notif-dot ${window.escapeHtml(item.statusClass)}"></span>
                <span class="dash-notif-item-body">
                    <strong>${window.escapeHtml(item.title)}</strong>
                    <span>${window.escapeHtml(item.body)}</span>
                </span>
            </button>
        `;
    }

    function renderNotifications(bookings) {
        if (!notifList) return;

        const items = (bookings || []).slice(0, NOTIF_LIMIT).map((booking) => {
            const status = String(booking.status || 'pending');
            const court = booking.courts || 'Court';
            const when = `${formatBookingDate(booking.time_date)} · ${formatBookingTime(booking.time_date)}`;
            return {
                bookingId: booking.booking_id,
                title: NOTIF_STATUS_TITLES[status] || 'Booking update',
                body: `${court} — ${when}`,
                statusClass: status,
            };
        });

        notifList.innerHTML = items.length
            ? items.map(renderNotificationItem).join('')
            : '<p class="dash-notif-empty">No notifications yet.</p>';

        // "The existing static red .dash-badge-dot should only show when
        // there's ≥1 notification" (§3) — starts `hidden` in the markup, so
        // it never flashes on before we actually know the count.
        if (notifDot) notifDot.hidden = items.length === 0;
    }

    // R4-3 (implementation_plan.md, "Revision 4") — clicking a notification
    // closes the dropdown, opens Receipts, and scrolls to/briefly highlights
    // the matching receipt card. Delegated on notifList itself rather than
    // wired per-item: renderNotifications() above replaces notifList's whole
    // innerHTML on every refresh (a new booking, a status change, etc.), so a
    // per-button listener would need re-wiring after every render — the same
    // pattern wireReceiptDownloads()/wireOverviewCourtList() use further
    // below for their own dynamically rendered scopes. Listening on the one
    // container that is never itself replaced avoids that entirely, and only
    // needs to be attached once, here, at setup time.
    const NOTIF_RECEIPT_SCROLL_DELAY_MS = 60;
    const NOTIF_RECEIPT_HIGHLIGHT_MS = 2000;

    if (notifList) {
        notifList.addEventListener('click', (e) => {
            const item = e.target.closest('[data-dash-notif-booking]');
            if (!item) return;

            const bookingId = item.dataset.dashNotifBooking;
            closeNotifMenu();
            // setActivePanel() (declared at the very top of this file) is a
            // hoisted function declaration — safe to call from here
            // regardless of source order, same reasoning this file already
            // documents for closeNotifMenu's own forward reference above.
            setActivePanel('receipts');

            // setActivePanel() itself just ran window.scrollTo({top:0, ...})
            // as part of every panel switch — deferred by a beat so THIS
            // scroll (to the actual receipt) is the one the page settles on,
            // instead of racing it back to the top of the page.
            window.setTimeout(() => {
                // Matched by reading each card's dataset directly (not by
                // interpolating bookingId into a CSS attribute-selector
                // string) — same reasoning wireReceiptDownloads() already
                // reads btn.dataset.dashReceiptDownload directly rather than
                // building a selector out of it.
                const card = Array.from(document.querySelectorAll('[data-dash-receipt-card]'))
                    .find((el) => el.dataset.dashReceiptCard === bookingId);
                // Receipts hasn't rendered this card yet (e.g. still
                // loading) — the panel is already open regardless, so this
                // is never a dead click; there's just nothing to scroll to
                // or highlight on top of it.
                if (!card) return;

                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card.classList.add('is-highlighted');
                window.setTimeout(() => card.classList.remove('is-highlighted'), NOTIF_RECEIPT_HIGHLIGHT_MS);
            }, NOTIF_RECEIPT_SCROLL_DELAY_MS);
        });
    }

    // ------------------------------------------------------------------
    // Feedback modal (§2, D7 — implementation_plan.md). ONE modal, TWO
    // triggers already in the markup: the sidebar card's "Give Feedback"
    // button (desktop/tablet) and the topbar's standalone Feedback button
    // (mobile) — both carry [data-dash-feedback-open] and open this same
    // dialog. Open/close borrows the court viewer's fade-out timing
    // (includes/landingPage.js's createCourtViewer — 250ms) rather than the
    // simpler [data-open] dropdowns above, since this is a full dialog that
    // needs a `hidden` round-trip, not just an opacity toggle anchored to a
    // trigger.
    // ------------------------------------------------------------------
    const feedbackOverlay = document.querySelector('[data-dash-feedback-overlay]');
    const feedbackDialog = document.querySelector('[data-dash-feedback-dialog]');
    const feedbackMessageEl = document.querySelector('[data-dash-feedback-message]');
    const feedbackSubmitBtn = document.querySelector('[data-dash-feedback-submit]');
    const feedbackStars = Array.from(document.querySelectorAll('[data-dash-feedback-star]'));

    const FEEDBACK_CLOSE_DELAY_MS = 250;
    let feedbackHideTimer = null;
    let feedbackLastFocused = null;
    let feedbackIsOpen = false;
    // Optional (§2: "optional 1-5 rating") — stays null until a star is
    // clicked, and clicking the already-selected star again clears it back
    // to null, so a customer who changes their mind can un-rate.
    let feedbackRating = null;

    function paintFeedbackStars(value) {
        feedbackStars.forEach((btn) => {
            const starValue = Number(btn.dataset.dashFeedbackStar);
            const isSelected = value !== null && starValue <= value;
            btn.classList.toggle('is-selected', isSelected);
            btn.setAttribute('aria-pressed', String(value !== null && starValue === value));
        });
    }

    feedbackStars.forEach((btn) => {
        btn.addEventListener('click', () => {
            const value = Number(btn.dataset.dashFeedbackStar);
            feedbackRating = (feedbackRating === value) ? null : value;
            paintFeedbackStars(feedbackRating);
        });
    });

    function openFeedbackModal(invoker) {
        if (!feedbackOverlay || !feedbackDialog) return;
        feedbackLastFocused = invoker || document.activeElement;
        closeProfileMenu();
        closeNotifMenu();

        if (feedbackHideTimer) {
            window.clearTimeout(feedbackHideTimer);
            feedbackHideTimer = null;
        }

        feedbackOverlay.hidden = false;
        // Force a synchronous layout flush so the browser commits the
        // hidden->visible state before [data-open] flips opacity to 1 —
        // same trick includes/landingPage.js's court viewer uses (see its
        // open()), otherwise the browser can batch both into one style
        // recalc and skip the fade entirely.
        void feedbackOverlay.offsetWidth;
        feedbackOverlay.setAttribute('data-open', '');
        feedbackIsOpen = true;
        feedbackDialog.focus();
    }

    function closeFeedbackModal() {
        if (!feedbackIsOpen) return;
        feedbackIsOpen = false;

        feedbackOverlay.removeAttribute('data-open');
        if (feedbackHideTimer) window.clearTimeout(feedbackHideTimer);
        feedbackHideTimer = window.setTimeout(() => {
            feedbackOverlay.hidden = true;
            feedbackHideTimer = null;
        }, FEEDBACK_CLOSE_DELAY_MS);

        if (feedbackLastFocused && typeof feedbackLastFocused.focus === 'function' && document.contains(feedbackLastFocused)) {
            feedbackLastFocused.focus();
        }
        feedbackLastFocused = null;
    }

    document.querySelectorAll('[data-dash-feedback-open]').forEach((btn) => {
        btn.addEventListener('click', () => openFeedbackModal(btn));
    });

    document.querySelectorAll('[data-dash-feedback-close]').forEach((btn) => {
        btn.addEventListener('click', closeFeedbackModal);
    });

    if (feedbackOverlay) {
        // Backdrop click only — a click that starts and ends on the overlay
        // itself (not one that starts inside the dialog and merely
        // bubbles), same `e.target === root` guard as the court viewer.
        feedbackOverlay.addEventListener('click', (e) => {
            if (e.target === feedbackOverlay) closeFeedbackModal();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && feedbackIsOpen) closeFeedbackModal();
    });

    if (feedbackSubmitBtn) {
        feedbackSubmitBtn.addEventListener('click', async () => {
            const message = (feedbackMessageEl?.value || '').trim();
            if (!message) {
                window.InigoToast?.show('Please enter a message before submitting.', true);
                feedbackMessageEl?.focus();
                return;
            }
            if (!window.sb || !window.inigosyncProfile) {
                window.InigoToast?.show('Unable to reach the server right now. Please try again shortly.', true);
                return;
            }

            const originalLabel = feedbackSubmitBtn.textContent;
            feedbackSubmitBtn.disabled = true;
            feedbackSubmitBtn.textContent = 'Submitting…';

            const { error } = await window.sb.from('feedback').insert({
                profile_id: window.inigosyncProfile.id,
                rating: feedbackRating,
                message,
            });

            feedbackSubmitBtn.disabled = false;
            feedbackSubmitBtn.textContent = originalLabel;

            if (error) {
                console.error('[dashboard] feedback insert failed', error);
                // This environment cannot apply database/schema/009_feedback.sql
                // (no Supabase admin access) — isOverviewSchemaMismatch()
                // (defined further below; despite its name it's a generic
                // Postgres "relation/column doesn't exist" classifier, same
                // idiom as includes/staff_dashboard.js's own
                // isSchemaMismatchError()) turns that specific failure into
                // a clear, actionable message instead of a raw Postgres
                // error or a fake success toast.
                const friendlyMessage = isOverviewSchemaMismatch(error)
                    ? "Feedback isn't set up yet — this needs a database update. Please try again later."
                    : (error.message || 'Could not submit your feedback. Please try again.');
                window.InigoToast?.show(friendlyMessage, true);
                return;
            }

            window.InigoToast?.show('Thanks for your feedback!');
            if (feedbackMessageEl) feedbackMessageEl.value = '';
            feedbackRating = null;
            paintFeedbackStars(null);
            closeFeedbackModal();
        });
    }

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

    // Filter chips ("All/Pending/Confirmed/Completed/Cancelled") that used
    // to sit above the My Bookings table are removed outright per §6 of the
    // feedback doc — they were cosmetic-only (this used to just toggle
    // .is-active with a TODO), so no working behavior is lost. The Status
    // column and the rest of the table stay unchanged. .dash-filter-row/
    // .dash-chip/[data-dash-chip] aren't used anywhere else on this page
    // (grepped — only Pages/user_dashboard.html's now-removed markup and
    // Style/Dashboard.css's now-removed rules referenced them), so there is
    // nothing left here to wire.

    // ------------------------------------------------------------------
    // Booking Management (§5, D5) — a 3-step wizard (Select Sport & Court ->
    // Choose Date & Time -> Confirm), one step visible at a time. Reads the
    // same `court`/`sport` tables via window.InigoCourtsData
    // (includes/courtsData.js), which mirrors the fetch-with-static-fallback
    // pattern already proven in includes/landingPage.js. This replaces the
    // hardcoded court list the Booking select used to have — see
    // docs/QA_AUDIT_REPORT.md P0#8 ("three contradictory court lists"). The
    // OTHER two sources P0#8 mentions (the old standalone Courts panel and
    // the Overview widget) are now one and the same — see the Overview
    // Courts section further below (§4/D2).
    //
    // IMPORTANT — the wizard changes ONLY presentation. bookingState, its
    // court/date/slot/payment selection, updateSummary()'s live
    // recalculation, and the sb.from('booking').insert({...}) payload
    // further below are all unchanged from before this phase; real per-slot
    // availability and double-booking prevention remain a later phase
    // (implementation_plan.md Phase 4) — the booking table only stores a
    // single start timestamp.
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

    // Wizard chrome (§5, D5) — step panels, the step indicator, and the
    // Back/Next nav row. See renderBookWizard()/goToBookStep() below for the
    // state machine; kept as plain DOM lookups here, same shape as every
    // other *Select/*Date/etc. const on this page.
    const bookStepPanels = document.querySelectorAll('[data-dash-book-step]');
    const bookStepIndicators = document.querySelectorAll('[data-dash-book-step-indicator]');
    const bookBackBtn = document.querySelector('[data-dash-book-back]');
    const bookNextBtn = document.querySelector('[data-dash-book-next]');
    const BOOK_STEP_COUNT = bookStepPanels.length || 3;

    // Step 1's dynamic court preview (§5 "Dynamic Court Preview", D5) — the
    // same img-vs-"Photo coming soon" placeholder mechanism the Overview
    // panel's court cards use (courtPhotoMarkup()/resolveCourtUnits(),
    // §4/D2), reused here rather than reimplemented. See paintBookPreview()
    // below.
    const bookPreviewMedia = document.querySelector('[data-dash-book-preview-media]');
    const bookUnitWrap = document.querySelector('[data-dash-book-unit-wrap]');
    const bookUnitLabel = document.querySelector('[data-dash-book-unit-label]');
    const bookUnitSelect = document.querySelector('[data-dash-book-unit-select]');

    // court/rate start empty/null — the real <select> options (and their
    // data-rate) only exist once window.InigoCourtsData.getCourts() resolves
    // below (populateBookSelect). Every court's rate is NULL in the live DB
    // today (the owner hasn't confirmed prices yet — see
    // database/seed/002_seed_content.sql), so "unknown rate" has to be a
    // first-class state here, not an assumed 300. `sport` is the selected
    // court's REAL related sport (e.g. "Bowling" for the "Bowling —
    // Duckpin" court, not a copy of the court name) — booking.sports is
    // NOT NULL, so this must never still be empty by the time a booking is
    // submitted; see the insert below.
    let bookingState = {
        court: '',
        sport: '',
        rate: null,
        rateUnit: '/hr',
        date: bookDate ? bookDate.value : '',
        time: null,
        paymentType: 'downpayment',
        // Overwritten once window.InigoAppSettings.getSettings() resolves
        // below — 50 is the same fallback that module itself uses when
        // `app_settings` doesn't exist yet, so this default is never
        // visibly wrong, just possibly stale for a moment on first load.
        downpaymentPct: window.InigoAppSettings ? window.InigoAppSettings.DEFAULT_SETTINGS.downpaymentPct : 50,
    };

    const downpaymentDesc = document.querySelector('[data-dash-payment-desc="downpayment"]');

    // ------------------------------------------------------------------
    // Step 1 dynamic court preview (§5, D5) — bookCourtsCache holds the same
    // normalized court objects populateBookSelect() below receives from
    // window.InigoCourtsData.getCourts() (quantity/unit/unitImages included,
    // unlike the <select>'s own <option data-*> attributes, which only carry
    // rate/rateUnit/sport), so a court can be looked up by name whenever the
    // preview needs to repaint. bookSelectedUnitIndex resets to 0 every time
    // the COURT changes (a new court's units always start at its first one);
    // there's only ever one active preview on this panel, unlike the
    // Overview cards' per-court overviewSelectedUnitIndex map.
    // ------------------------------------------------------------------
    let bookCourtsCache = [];
    let bookSelectedUnitIndex = 0;

    function findBookCourt(name) {
        return bookCourtsCache.find((c) => c.name === name) || null;
    }

    // Repaints the preview image + unit combo box for `court` (or a neutral
    // "select a court" placeholder when none is known yet — e.g. before
    // window.InigoCourtsData.getCourts() resolves). Reuses
    // courtPhotoMarkup()/window.InigoCourtsData.resolveCourtUnits() exactly
    // as renderOverviewCourtCard() does further below (§4/D2) rather than a
    // second implementation — see that function's own header comment for
    // why "no photo yet" always renders the honest "Photo coming soon"
    // placeholder instead of a broken <img> or an invented URL.
    function paintBookPreview(court, unitIndexOverride) {
        if (!bookPreviewMedia) return;

        if (!court) {
            bookPreviewMedia.innerHTML = '<span class="dash-court-monogram" aria-hidden="true">?<small class="dash-court-photo-soon">Select a court to preview it</small></span>';
            if (bookUnitWrap) bookUnitWrap.hidden = true;
            if (bookUnitSelect) bookUnitSelect.innerHTML = '';
            return;
        }

        const resolved = window.InigoCourtsData
            ? window.InigoCourtsData.resolveCourtUnits(court)
            : { pickerLabel: '', units: [{ label: null, imageUrl: court.imageUrl }] };
        const units = resolved.units.length ? resolved.units : [{ label: null, imageUrl: court.imageUrl }];
        const hasChoice = units.length > 1;

        const index = Math.min(Math.max(0, unitIndexOverride !== undefined ? unitIndexOverride : bookSelectedUnitIndex), units.length - 1);
        bookSelectedUnitIndex = index;
        const unit = units[index];

        const monogram = window.InigoCourtsData ? window.InigoCourtsData.monogramFor(court.sportSlug, court.name) : '?';
        const alt = unit.label ? `${court.name} — ${unit.label}` : court.name;
        bookPreviewMedia.innerHTML = courtPhotoMarkup(unit, monogram, alt);

        // Same broken-photo-URL fallback as paintOverviewCourtMedia() below
        // — a typo'd unit_images URL degrades to the placeholder instead of
        // a broken-image icon.
        const img = bookPreviewMedia.querySelector('img[data-overview-court-photo]');
        if (img) {
            img.addEventListener('error', () => {
                img.remove();
                bookPreviewMedia.insertAdjacentHTML('afterbegin', courtPhotoMarkup({ imageUrl: null }, monogram, alt));
            }, { once: true });
        }

        if (bookUnitWrap) bookUnitWrap.hidden = !hasChoice;
        if (bookUnitLabel) bookUnitLabel.textContent = resolved.pickerLabel || 'Choose a unit';
        if (bookUnitSelect) {
            bookUnitSelect.innerHTML = units.map((u, i) => `<option value="${i}"${i === index ? ' selected' : ''}>${window.escapeHtml(u.label || `${court.name} ${i + 1}`)}</option>`).join('');
        }
    }

    // Looks up bookingState.court's full record and repaints the preview
    // from scratch (unit reset to its first one) — the one call site every
    // "the selected court just changed" path below uses, so the preview can
    // never fall out of sync with bookingState.
    function syncBookPreviewFromState() {
        bookSelectedUnitIndex = 0;
        paintBookPreview(findBookCourt(bookingState.court), 0);
    }

    if (bookUnitSelect) {
        bookUnitSelect.addEventListener('change', () => {
            const court = findBookCourt(bookingState.court);
            if (!court) return;
            // Unit choice is preview-only (see this section's header
            // comment on the Booking panel markup) — it repaints the photo
            // and nothing else; bookingState/the eventual insert payload
            // never learn which unit was previewed.
            paintBookPreview(court, Number(bookUnitSelect.value) || 0);
        });
    }

    // ------------------------------------------------------------------
    // Wizard step machine (§5, D5) — one step visible at a time, a step
    // indicator, and Back/Next with Next gated on that step's required
    // field ("step 1 needs a court, step 2 needs a date+slot" per the spec).
    // Step 3 has no Next of its own — its own "Request Booking" button
    // (bookSubmit, wired further below) is the wizard's final action.
    // ------------------------------------------------------------------
    let bookWizardStep = 1;

    function bookStepIsReady(step) {
        if (step === 1) return Boolean(bookingState.court);
        if (step === 2) return Boolean(bookingState.date) && Boolean(bookingState.time);
        return true;
    }

    function renderBookWizard() {
        bookStepPanels.forEach((panel) => {
            panel.classList.toggle('is-active', Number(panel.dataset.dashBookStep) === bookWizardStep);
        });
        bookStepIndicators.forEach((el) => {
            const n = Number(el.dataset.dashBookStepIndicator);
            el.classList.toggle('is-current', n === bookWizardStep);
            el.classList.toggle('is-done', n < bookWizardStep);
            el.setAttribute('aria-current', n === bookWizardStep ? 'step' : 'false');
        });

        if (bookBackBtn) bookBackBtn.hidden = bookWizardStep === 1;
        if (bookNextBtn) {
            bookNextBtn.hidden = bookWizardStep === BOOK_STEP_COUNT;
            bookNextBtn.disabled = !bookStepIsReady(bookWizardStep);
        }
    }

    function goToBookStep(step) {
        bookWizardStep = Math.min(Math.max(1, step), BOOK_STEP_COUNT);
        renderBookWizard();
    }

    if (bookNextBtn) {
        bookNextBtn.addEventListener('click', () => {
            if (bookNextBtn.disabled) return;
            goToBookStep(bookWizardStep + 1);
        });
    }
    if (bookBackBtn) {
        bookBackBtn.addEventListener('click', () => goToBookStep(bookWizardStep - 1));
    }

    function formatDate(value) {
        if (!value) return '—';
        const d = new Date(`${value}T00:00:00`);
        if (Number.isNaN(d.getTime())) return value;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function hasKnownRate() {
        return typeof bookingState.rate === 'number' && !Number.isNaN(bookingState.rate);
    }

    function updateSummary() {
        const isFull = bookingState.paymentType === 'full';
        const pct = bookingState.downpaymentPct;
        const amount = hasKnownRate() ? (isFull ? bookingState.rate : bookingState.rate * (pct / 100)) : null;

        if (summaryCourt) summaryCourt.textContent = bookingState.court || '—';
        if (summaryDate) summaryDate.textContent = formatDate(bookingState.date);
        if (summaryTime) summaryTime.textContent = bookingState.time || '— Select a slot —';
        if (summaryRate) summaryRate.textContent = hasKnownRate() ? `₱${bookingState.rate}${bookingState.rateUnit}` : 'Rate TBA';
        if (summaryPayment) summaryPayment.textContent = isFull ? 'Full Payment' : `Downpayment (${pct}%)`;
        if (summaryTotal) summaryTotal.textContent = amount !== null ? `₱${amount.toFixed(2)}` : '—';
        // Downpayment option's own description line ("Pay N% now, balance
        // on-site.") — kept in sync with the same real downpayment_pct
        // rather than left at its hardcoded "50%" (implementation_plan.md
        // E2, the same duplicated-hardcoded-50% defect Payment
        // Configuration was built to fix).
        if (downpaymentDesc) downpaymentDesc.textContent = `Pay ${pct}% now, balance on-site.`;

        if (bookSubmit) {
            const ready = Boolean(bookingState.time) && Boolean(bookingState.court);
            bookSubmit.disabled = !ready;
            bookSubmit.textContent = ready ? 'Request Booking' : 'Select a time slot to continue';
        }

        // Re-gates the wizard's Next button and refreshes the step
        // indicator every time ANY piece of bookingState changes (court,
        // date, or time) — updateSummary() already runs after every one of
        // those changes below, so this is the single hook the whole wizard
        // needs (§5, D5). renderBookWizard() only re-applies whichever step
        // is already current; it never changes which step is showing.
        renderBookWizard();
    }

    if (bookSelect) {
        bookSelect.addEventListener('change', () => {
            const opt = bookSelect.selectedOptions[0];
            bookingState.court = bookSelect.value;
            bookingState.sport = (opt && opt.dataset.sport) || bookingState.court;
            bookingState.rate = (opt && opt.dataset.rate) ? Number(opt.dataset.rate) : null;
            bookingState.rateUnit = (opt && opt.dataset.rateUnit) || '/hr';
            syncBookPreviewFromState();
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

            // Column facts verified against the LIVE database — read this
            // before touching the payload below, so this bug doesn't come
            // back:
            //  - booking.sports is NOT NULL (text). It must be the court's
            //    REAL related sport, not always a copy of `courts` — e.g.
            //    the "Bowling — Duckpin" court's sport is "Bowling".
            //    bookingState.sport is resolved from
            //    window.InigoCourtsData's court.sportName and carried
            //    through here via the Booking wizard's own <select>'s
            //    data-sport attribute (see populateBookSelect() above —
            //    same pattern already used to carry rate/rateUnit), falling
            //    back to the court name if a court ever has no linked sport
            //    row. It is never sent as null.
            //  - booking.status has a CHECK constraint: only 'pending',
            //    'confirmed', 'cancelled', or 'completed' are accepted;
            //    anything else (e.g. 'declined'/'no_show'/'expired') fails
            //    with Postgres code 23514. A brand-new booking always
            //    starts 'pending'.
            //  - `courts` is what the rest of this dashboard actually
            //    reads back (getCourtRate(booking.courts), and the My
            //    Bookings table's main cell), so it still carries the
            //    customer's exact court selection.
            //  - customer_id attributes the booking to the signed-in
            //    profile; time_date is the single required start
            //    timestamp this simplified booking flow stores.
            //  - payment_id, booking_id, and created_at are deliberately
            //    OMITTED here rather than sent as null: no payment record
            //    exists yet for a brand-new booking (see the Receipts
            //    panel below), booking_id is an autoincrement PK the DB
            //    assigns, and created_at has a DB default. Explicitly
            //    sending null for any of these would override that
            //    default/PK instead of letting the DB fill it in — the
            //    same class of bug as the `sports: null` 400 this comment
            //    replaces.
            const { error } = await window.sb.from('booking').insert({
                customer_id: window.inigosyncProfile.id,
                sports: bookingState.sport || bookingState.court,
                courts: bookingState.court,
                time_date: new Date(`${bookingState.date}T${time24}:00`).toISOString(),
                status: 'pending',
            });

            if (error) {
                // Always log the full error (code/message/details) for
                // diagnosis — that's how a NOT NULL (23502) or CHECK
                // (23514) violation actually gets tracked down during a
                // demo. The toast below stays friendly and never dumps the
                // raw Postgres code/column names on the customer.
                console.error('[dashboard] booking insert failed', error);

                let friendlyMessage = 'Could not submit your booking. Please try again.';
                if (error.code === '23502') {
                    friendlyMessage = 'Your booking is missing required information. Please reselect the court and try again.';
                } else if (error.code === '23514') {
                    friendlyMessage = 'We couldn\'t process your booking. Please try again or contact staff for help.';
                } else if (error.message) {
                    friendlyMessage = error.message;
                }

                window.InigoToast?.show(friendlyMessage, true);
                bookSubmit.disabled = false;
                bookSubmit.textContent = originalLabel;
                return;
            }

            window.InigoToast?.show('Booking request submitted — we\'ll confirm it shortly.');
            slots.forEach((s) => s.classList.remove('is-selected'));
            bookingState.time = null;
            updateSummary();
            // Back to Step 1 so a customer who wants to book a second court
            // right away starts the guided flow fresh instead of sitting on
            // a Confirm step that just fired.
            goToBookStep(1);
            refreshMyBookings();
        });
    }

    // Neutral "select a court" placeholder until
    // window.InigoCourtsData.getCourts() resolves (populateBookSelect()
    // below) — same "loading" honesty as the <select>'s own "Loading
    // courts…" option.
    paintBookPreview(null);
    updateSummary();

    // Real downpayment percentage (E2, implementation_plan.md) — read once
    // from `app_settings` via window.InigoAppSettings (includes/appSettings.js),
    // falling back to the same 50% bookingState.downpaymentPct already
    // started at if that table/row doesn't exist yet. GCash/Cash on/off
    // (the other two app_settings columns) have no UI surface on this
    // booking form — it only ever offered Downpayment vs Full Payment, never
    // a GCash/Cash method choice — so only the percentage is wired here.
    if (window.InigoAppSettings) {
        window.InigoAppSettings.getSettings().then((settings) => {
            bookingState.downpaymentPct = settings.downpaymentPct;
            updateSummary();
        });
    }

    // ------------------------------------------------------------------
    // Court data — the Overview Courts cards (further below, §4/D2) and the
    // Booking Management court <select> are rendered from the SAME fetch
    // (window.InigoCourtsData.getCourts(), memoized), so the two can never
    // disagree about which courts exist or what they cost. courtTags() is
    // shared by both this file's populateBookSelect() (indirectly, via the
    // rate it reads) and the Overview cards' own renderOverviewCourtCard()
    // below. Every interpolated field on this page is escaped — a court
    // named `<img src=x onerror=alert(1)>` (staff/admin can write `court`
    // rows, see database/schema/002_content_tables.sql's RLS policies) must
    // render as literal text, not run.
    // ------------------------------------------------------------------
    function courtTags(court) {
        const tags = [];
        if (court.sportName) tags.push(court.sportName);
        tags.push(`${court.quantity} ${court.unit}`);
        String(court.description || '').split('·').forEach((part) => {
            const trimmed = part.trim();
            if (trimmed) tags.push(trimmed);
        });
        return tags;
    }

    // Replaces the "Loading courts…" placeholder <option> with one real
    // option per court, then re-derives bookingState from whichever one
    // ends up selected (the first, by default) instead of the placeholder.
    function populateBookSelect(courts) {
        if (!bookSelect) return;
        // Cached for findBookCourt() (§5, D5) — the <option>s built below
        // only carry rate/rateUnit/sport, not the full normalized court
        // object (quantity/unit/unitImages) the Step 1 preview needs.
        bookCourtsCache = courts;
        bookSelect.innerHTML = courts.map((court) => {
            const rateAttr = court.rate !== null ? window.escapeHtml(String(court.rate)) : '';
            const label = court.rate !== null
                ? `${court.name} — ₱${court.rate}${court.rateUnit}`
                : `${court.name} — Rate TBA`;
            // data-sport carries the court's REAL related sport (e.g.
            // "Bowling" for the "Bowling — Duckpin" court, not a copy of
            // the court name) through to bookingState/the insert in the
            // bookSubmit handler below — same idea as data-rate /
            // data-rate-unit. booking.sports is NOT NULL, so this falls
            // back to the court's own name only if a court somehow has no
            // linked sport row; it is never left empty.
            const sportAttr = window.escapeHtml(court.sportName || court.name);
            return `<option value="${window.escapeHtml(court.name)}" data-rate="${rateAttr}" data-rate-unit="${window.escapeHtml(court.rateUnit)}" data-sport="${sportAttr}">${window.escapeHtml(label)}</option>`;
        }).join('');

        const firstOpt = bookSelect.selectedOptions[0];
        bookingState.court = bookSelect.value;
        bookingState.sport = (firstOpt && firstOpt.dataset.sport) || bookingState.court;
        bookingState.rate = (firstOpt && firstOpt.dataset.rate) ? Number(firstOpt.dataset.rate) : null;
        bookingState.rateUnit = (firstOpt && firstOpt.dataset.rateUnit) || '/hr';
        syncBookPreviewFromState();
        updateSummary();
    }

    if (window.InigoCourtsData) {
        window.InigoCourtsData.getCourts().then((courts) => {
            populateBookSelect(courts);
        }).catch((err) => {
            console.error('[dashboard] could not load courts', err);
        });
    } else {
        // Should never happen — includes/courtsData.js must load before
        // this file (see the <script> order in Pages/user_dashboard.html).
        console.error('[dashboard] window.InigoCourtsData is missing — check that includes/courtsData.js loads before includes/Dashboard.js.');
    }

    // ------------------------------------------------------------------
    // Overview — Courts widget (replaces the old, fully-static "Calendar"
    // and "Live availability" cards). MARKETING/SHOWCASE ONLY as of
    // Revision 2's R1 (implementation_plan.md) — booking has its own
    // designated panel (Book a Court); this widget only shows the courts
    // off. Lists the real courts (window.InigoCourtsData, the same source
    // as Booking above) grouped by sport (§4's "visual segregation" — a
    // heading per sport, that sport's court card(s) beneath it), grouping
    // that stays on regardless of sort mode. The sort <select> defaults to
    // ordering those sport groups alphabetically (R2); "Available first"
    // and "Price: Low to High" remain selectable alternatives that instead
    // order courts *within* each group — see sortOverviewCourts() above.
    // The widget also lets the customer "peek" a court's real hourly
    // open/booked slots for TODAY, read-only, without leaving the Overview
    // tab. The open/booked computation reuses the exact overlap algorithm
    // the Staff dashboard's Court Schedule already proved
    // (includes/staff_dashboard.js's bookingWindow/windowsOverlap/
    // todayRange), adapted to hourly granularity (matching this page's own
    // Booking-panel slot labels) instead of that file's 2-hour columns.
    // Peek slots used to hand off a click into the Booking panel
    // (jumpToBookingFromPeekSlot()) — R1 removed that entirely: an open
    // slot pill is now purely informational (renderOverviewSlotPill()
    // above), not a control.
    //
    // §4/D2 additionally gives each card a per-unit combo box
    // (window.InigoCourtsData.resolveCourtUnits()) whose selection swaps the
    // card's displayed photo — see renderOverviewCourtCard(),
    // paintOverviewCourtMedia() and the [data-overview-unit-select] wiring
    // in wireOverviewCourtList() below. This REPLACES the old standalone
    // Courts dash-panel (deleted) and the compact avail-row list PR #1 put
    // here; the peek-slot DISPLAY mechanism itself (toggle, hourly pills)
    // is preserved from PR #1 — the user explicitly praised it — only its
    // container changed (a one-line row to this richer card) and, per R1,
    // its former click-to-book hand-off is gone.
    //
    // RLS risk (implementation_plan.md's Context/"Open questions" —
    // documented, pre-existing, not introduced here): `booking` and
    // `walk_in_booking`'s row-level security policies predate this repo's
    // schema tracking and are not visible to it (see
    // database/schema/004_staff_module.sql's header note), so it is
    // unconfirmed whether the `customer` role can read every row of either
    // table or only its own. This widget therefore (a) selects only the
    // minimal columns needed to compute open/booked — never a customer's
    // name/contact, unlike the staff version's `profiles` join — and (b)
    // fails safe: if either query errors, every court's peek shows an
    // honest "unavailable" note instead of ever claiming a slot is open
    // when that couldn't be verified. Court rows themselves (name/rate/
    // status dot) still render either way, since those come from
    // window.InigoCourtsData independently of the booking queries below.
    // ------------------------------------------------------------------
    const overviewCourtList = document.querySelector('[data-dash-overview-court-list]');
    const overviewSortSelect = document.querySelector('[data-dash-overview-sort]');

    const OVERVIEW_SLOT_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]; // hourly, 8 AM–8 PM
    // Kept equal to database/schema/004_staff_module.sql's
    // booking.duration_minutes DEFAULT, same reasoning as
    // includes/staff_dashboard.js's own DEFAULT_DURATION_MINUTES.
    const OVERVIEW_DEFAULT_DURATION_MINUTES = 60;

    // Default sort mode (Revision 2, R2 — implementation_plan.md): groups
    // the per-sport headings alphabetically, matching the sort <select>'s
    // own default option (Pages/user_dashboard.html, value="sport",
    // selected). "Available first" and "Price: Low to High" remain
    // selectable alternatives that instead sort courts *within* each sport
    // group — grouping by sport (groupOverviewCourtsBySport() below) stays
    // always-on no matter which mode is chosen, so the two concerns compose
    // instead of conflicting. (Phase 1 had dropped this option, reasoning
    // that always-on grouping made it a no-op duplicate of the default
    // order; the user later asked for it back explicitly, overruling that
    // call — see implementation_plan.md's Context section.)
    let overviewSortMode = 'sport';
    let overviewCourts = [];
    let overviewBookings = [];
    let overviewWalkins = [];
    let overviewDataOk = true;
    let overviewDateBase = null;
    // Court ids (always compared as strings — see courtId below) currently
    // expanded — a Set so re-rendering after a sort change or a toggle
    // click preserves whichever peeks were already open instead of
    // collapsing everything.
    const overviewExpandedCourts = new Set();
    // Court id -> selected unit <select> index (§4/D2). Same reasoning as
    // overviewExpandedCourts above: renderOverviewCourtList() re-renders
    // every card from scratch on any peek toggle or sort change, so without
    // this a customer's "Court 5" pick on one card would silently reset to
    // "Court 1" the moment they toggled Peek slots on a DIFFERENT card.
    const overviewSelectedUnitIndex = new Map();

    // "Today" in the browser's local timezone — same 2-line pattern as
    // includes/staff_dashboard.js's todayRange().
    function todayRange() {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        return { start, end };
    }

    // "8:00 AM" / "6:00 PM" — matches the Booking panel's own [data-dash-slot]
    // label format exactly (not includes/staff_dashboard.js's shorter
    // "8 AM"), because a clicked pill's label is carried straight into
    // bookingState.time and parsed by this file's own slotTo24h() above.
    function formatOverviewHourLabel(hour) {
        const period = hour >= 12 ? 'PM' : 'AM';
        const hour12 = ((hour + 11) % 12) + 1;
        return `${hour12}:00 ${period}`;
    }

    function overviewSlotWindow(hour) {
        const start = new Date(overviewDateBase);
        start.setHours(hour, 0, 0, 0);
        return { start, end: new Date(start.getTime() + 60 * 60 * 1000) };
    }

    // Same shape as includes/staff_dashboard.js's bookingWindow() — a
    // missing/invalid duration_minutes falls back to
    // OVERVIEW_DEFAULT_DURATION_MINUTES, never a fabricated guess.
    function overviewBookingWindow(row) {
        const start = new Date(row.time_date);
        const minutesRaw = Number(row.duration_minutes);
        const minutes = Number.isFinite(minutesRaw) && minutesRaw > 0 ? minutesRaw : OVERVIEW_DEFAULT_DURATION_MINUTES;
        return { start, end: new Date(start.getTime() + minutes * 60000) };
    }

    function overviewWindowsOverlap(a, b) {
        return a.start < b.end && b.start < a.end;
    }

    // A court's hour is occupied if a non-cancelled booking OR a walk-in
    // today overlaps that hour's [start, start+1h) window — identical
    // semantics to includes/staff_dashboard.js's scheduleCellContent(),
    // just without that function's staff-only customer-name lookup.
    function isOverviewCourtHourOccupied(court, hour) {
        const slot = overviewSlotWindow(hour);

        const bookingMatch = overviewBookings.some((b) => {
            if (String(b.status || '').toLowerCase() === 'cancelled') return false;
            if (String(b.courts || '') !== court.name) return false;
            return overviewWindowsOverlap(overviewBookingWindow(b), slot);
        });
        if (bookingMatch) return true;

        return overviewWalkins.some((w) => {
            if (String(w.courts || '') !== court.name) return false;
            return overviewWindowsOverlap(overviewBookingWindow(w), slot);
        });
    }

    // True when a Supabase/PostgREST error means "this column/table doesn't
    // exist" — same check includes/staff_dashboard.js's own
    // isSchemaMismatchError() uses. Duplicated locally (this project ships
    // plain <script> files with no shared module system — see
    // includes/courtsData.js's own header note on why todayRange()-style
    // helpers are copied per file rather than imported).
    function isOverviewSchemaMismatch(error) {
        if (!error) return false;
        const code = error.code || '';
        const message = String(error.message || '').toLowerCase();
        return code === 'PGRST204' || code === 'PGRST205' || code === '42703' || code === '42P01'
            || message.includes('could not find') || message.includes('does not exist')
            || message.includes('schema cache');
    }

    // walk_in_booking.duration_minutes is NOT confirmed to exist —
    // database/schema/004_staff_module.sql only adds duration_minutes to
    // `booking`; no migration in this repo adds it to walk_in_booking, and
    // no other code reads/writes it there (includes/staff_dashboard.js's own
    // Court Schedule selects '*' for walk-ins, which tolerates either case).
    // Try the precise column list first — if that specific column is what's
    // missing, retry without it rather than treating an ordinary schema
    // mismatch the same as the RLS risk this widget otherwise guards
    // against; overviewBookingWindow() above already treats a missing
    // duration_minutes as 60 minutes, so the retry changes nothing about how
    // a walk-in's window is computed.
    async function fetchOverviewWalkins(start, end) {
        let res = await window.sb.from('walk_in_booking')
            .select('courts, time_date, duration_minutes')
            .gte('time_date', start.toISOString())
            .lt('time_date', end.toISOString());
        if (res.error && isOverviewSchemaMismatch(res.error)) {
            res = await window.sb.from('walk_in_booking')
                .select('courts, time_date')
                .gte('time_date', start.toISOString())
                .lt('time_date', end.toISOString());
        }
        return res;
    }

    function sortOverviewCourts(courts, mode) {
        const copy = courts.slice(); // never mutate window.InigoCourtsData's memoized array
        if (mode === 'available') {
            copy.sort((a, b) => {
                const aAvail = String(a.status || '').toLowerCase() === 'available';
                const bAvail = String(b.status || '').toLowerCase() === 'available';
                if (aAvail !== bAvail) return aAvail ? -1 : 1;
                return (a.sportName || '').localeCompare(b.sportName || '') || (a.name || '').localeCompare(b.name || '');
            });
        } else if (mode === 'price') {
            copy.sort((a, b) => {
                const aNull = a.rate === null || a.rate === undefined;
                const bNull = b.rate === null || b.rate === undefined;
                if (aNull && bNull) return (a.name || '').localeCompare(b.name || '');
                if (aNull !== bNull) return aNull ? 1 : -1; // unknown rate always sorts last, never treated as 0
                return a.rate - b.rate;
            });
        } else {
            // 'sport' — the DEFAULT mode as of Revision 2's R2 (see
            // overviewSortMode's declaration above); also the safe fallback
            // for any unrecognized mode value. Grouping by sport
            // (groupOverviewCourtsBySport() below) is always-on regardless
            // of mode, so this sort only decides GROUP order; 'available'/
            // 'price' above remain selectable alternatives that instead
            // order courts *within* each group. Courts within the same
            // sport are secondarily ordered by name (e.g. "Bowling —
            // Duckpin" before "Bowling — Ten-Pin").
            copy.sort((a, b) => (a.sportName || '').localeCompare(b.sportName || '') || (a.name || '').localeCompare(b.name || ''));
        }
        return copy;
    }

    // Groups an already-sorted court list into { sportName, courts }
    // buckets, one per real sportSlug, preserving each group's first-seen
    // order in `courts` (so the "available"/"price" sort modes still
    // determine which SPORT heading appears first, not just which card
    // does) — §4's "visual segregation": a heading per sport, that sport's
    // card(s) beneath it, never one flat grid.
    function groupOverviewCourtsBySport(courts) {
        const order = [];
        const groups = new Map();
        courts.forEach((court) => {
            const key = court.sportSlug || court.sportName || court.name;
            if (!groups.has(key)) {
                groups.set(key, { sportName: court.sportName || court.name || 'Other', courts: [] });
                order.push(key);
            }
            groups.get(key).courts.push(court);
        });
        return order.map((key) => groups.get(key));
    }

    // Revision 2, R1 (implementation_plan.md) — these pills are a READ-ONLY
    // availability display only now: the Overview Courts section is
    // marketing/showcase, and booking has its own designated panel (the
    // Book a Court wizard's own Step-1 court picker, unaffected by this
    // change). Both open and booked pills render as plain, non-interactive
    // <span>s — not <button>s — since there is nothing left to click, and a
    // <button> would wrongly suggest there is; Style/Dashboard.css also
    // neutralizes the shared .dash-slot class's pointer cursor/hover
    // affordance specifically inside .dash-overview-peek-strip, so these
    // don't visually invite a click they no longer respond to (the Booking
    // panel's own [data-dash-slot] buttons in Step 2 keep their normal
    // interactive styling — this is scoped to the peek strip only). Every
    // interpolated value is escaped, same as renderOverviewCourtCard()
    // below — court/sport names are admin-authored content that can
    // contain HTML.
    function renderOverviewSlotPill(court, hour) {
        const label = formatOverviewHourLabel(hour);
        const occupied = isOverviewCourtHourOccupied(court, hour);
        const unavailableClass = occupied ? ' is-unavailable' : '';
        return `<span class="dash-slot dash-slot-mini${unavailableClass}">${window.escapeHtml(label)}</span>`;
    }

    function renderOverviewPeekContent(court) {
        if (!overviewDataOk) {
            return '<p style="color: var(--color-ink-faint); font-size: 0.78rem; margin: 0; padding: 4px 0;">Live slot status unavailable right now.</p>';
        }
        return OVERVIEW_SLOT_HOURS.map((hour) => renderOverviewSlotPill(court, hour)).join('');
    }

    // One unit's photo (or the honest placeholder) as an HTML string — the
    // ONE place that decides img-vs-placeholder for an Overview court card,
    // used both by renderOverviewCourtCard()'s initial markup and by
    // paintOverviewCourtMedia()'s later DOM patch on unit-select change, so
    // the two can never render a unit's photo differently. Mirrors
    // includes/landingPage.js's renderMediaSlot()/paintMedia() shape (court
    // viewer), adapted to this file's existing .dash-court-media/
    // .dash-court-monogram markup instead of that file's .media-slot.
    function courtPhotoMarkup(unit, monogram, alt) {
        if (unit.imageUrl) {
            return `<img src="${window.escapeHtml(unit.imageUrl)}" alt="${window.escapeHtml(alt)}" loading="lazy" data-overview-court-photo>`;
        }
        // Honest placeholder — the monogram square this dashboard already
        // used (renderCourtCard, now folded into this function), PLUS an
        // explicit "Photo coming soon" caption matching
        // includes/landingPage.js's court viewer wording, so the empty
        // state reads the same everywhere a customer sees it. Never a
        // broken-image icon, never an invented URL.
        return `<span class="dash-court-monogram" aria-hidden="true" data-overview-court-photo>${window.escapeHtml(monogram)}<small class="dash-court-photo-soon">Photo coming soon</small></span>`;
    }

    // Swaps the photo/monogram inside one card's .dash-court-media in place
    // — called on [data-overview-unit-select] `change` (see
    // wireOverviewCourtList() below). Leaves the status badge (a sibling
    // element, appended after the photo) untouched. A unit photo that fails
    // to load (a typo'd unit_images URL, hand-entered by the owner) falls
    // back to the same placeholder rather than a broken-image icon — same
    // idea as includes/landingPage.js's court viewer paintMedia().
    function paintOverviewCourtMedia(mediaEl, court, unit) {
        if (!mediaEl) return;
        const monogram = window.InigoCourtsData ? window.InigoCourtsData.monogramFor(court.sportSlug, court.name) : '?';
        const alt = unit.label ? `${court.name} — ${unit.label}` : court.name;

        const existingPhoto = mediaEl.querySelector('[data-overview-court-photo]');
        if (existingPhoto) existingPhoto.remove();
        mediaEl.insertAdjacentHTML('afterbegin', courtPhotoMarkup(unit, monogram, alt));

        const img = mediaEl.querySelector('img[data-overview-court-photo]');
        if (img) {
            img.addEventListener('error', () => {
                img.remove();
                mediaEl.insertAdjacentHTML('afterbegin', courtPhotoMarkup({ imageUrl: null }, monogram, alt));
                console.warn('[dashboard] court photo failed to load for "%s" — showing the placeholder instead.', alt);
            }, { once: true });
        }
    }

    // One sport-grouped Courts card — marketing/showcase only as of
    // Revision 2's R1 (implementation_plan.md). Combines what the old,
    // deleted standalone Courts panel's renderCourtCard() drew (photo,
    // status badge, name, rating, rate, tags) with the per-unit combo box
    // (window.InigoCourtsData.resolveCourtUnits(), §4's "Combo Box
    // Integration"/"Imagery") and the read-only peek-slots toggle + strip
    // PR #1 shipped (§4's "Pixlot Integration", kept per R1 but with its
    // click-to-book hand-off removed — see renderOverviewSlotPill() above).
    // There is no "Book Now" button here any more (R1) — booking is
    // entirely the Book a Court panel's job now; this card only shows off
    // the court.
    function renderOverviewCourtCard(court) {
        const isAvailable = String(court.status || '').toLowerCase() === 'available';
        const statusClass = isAvailable ? 'confirmed' : 'cancelled';
        const courtId = String(court.id);
        const courtIdAttr = window.escapeHtml(courtId);
        const isExpanded = overviewExpandedCourts.has(courtId);

        // Unit resolution (§4/D2) — see window.InigoCourtsData.resolveCourtUnits()
        // in includes/courtsData.js for the 2 fallback cases (unit_images,
        // then derive Court/Lane/Table N from quantity+unit). Always at
        // least one unit; a lone unit means no combo box (nothing to
        // choose between).
        const resolved = window.InigoCourtsData
            ? window.InigoCourtsData.resolveCourtUnits(court)
            : { pickerLabel: '', units: [{ label: null, imageUrl: court.imageUrl }] };
        const units = resolved.units.length ? resolved.units : [{ label: null, imageUrl: court.imageUrl }];
        const hasUnitChoice = units.length > 1;
        const savedIndex = overviewSelectedUnitIndex.has(courtId) ? overviewSelectedUnitIndex.get(courtId) : 0;
        const selectedIndex = Math.min(Math.max(0, savedIndex), units.length - 1);
        const selectedUnit = units[selectedIndex];

        const monogram = window.InigoCourtsData ? window.InigoCourtsData.monogramFor(court.sportSlug, court.name) : '?';
        const initialAlt = selectedUnit.label ? `${court.name} — ${selectedUnit.label}` : court.name;
        const media = courtPhotoMarkup(selectedUnit, monogram, initialAlt);

        // Rate rendering: ₱<rate><rate_unit> when non-null, an honest "Rate
        // TBA" placeholder when null (every court's rate is NULL in the
        // live DB right now — see database/seed/002_seed_content.sql).
        // Never invented.
        const rateHtml = court.rate !== null
            ? `₱${window.escapeHtml(String(court.rate))}<span>${window.escapeHtml(court.rateUnit)}</span>`
            : '<span>Rate TBA</span>';
        // Rating: `court.rating` only exists once the owner runs
        // database/schema/003_court_rating.sql, and only renders when a
        // court actually has one — no invented ratings.
        const ratingHtml = (court.rating !== null && court.rating !== undefined)
            ? `<div class="dash-court-rating">
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.9 6.9L22 9.6l-5.4 4.9L18 22l-6-3.6L6 22l1.4-7.5L2 9.6l7.1-.7z"/></svg>
                    ${window.escapeHtml(court.rating.toFixed(1))}<span>/ 5</span>
               </div>`
            : '';
        const tagsHtml = courtTags(court).map((t) => `<span>${window.escapeHtml(t)}</span>`).join('');

        const unitPickerHtml = hasUnitChoice ? `
            <div class="dash-form-group dash-court-unit-picker">
                <span class="dash-form-label">${window.escapeHtml(resolved.pickerLabel || 'Choose a unit')}</span>
                <select class="dash-select" data-overview-unit-select data-overview-court-id="${courtIdAttr}">
                    ${units.map((u, i) => `<option value="${i}"${i === selectedIndex ? ' selected' : ''}>${window.escapeHtml(u.label || `${court.name} ${i + 1}`)}</option>`).join('')}
                </select>
            </div>
        ` : '';

        return `
            <article class="dash-court-card">
                <div class="dash-court-media" data-overview-court-media>
                    ${media}
                    <span class="dash-status ${statusClass}">${window.escapeHtml(court.status || 'Unavailable')}</span>
                </div>
                <div class="dash-court-body">
                    <h3>${window.escapeHtml(court.name)}</h3>
                    ${ratingHtml}
                    <div class="dash-court-rate">${rateHtml}</div>
                    <div class="dash-court-tags">${tagsHtml}</div>
                    ${unitPickerHtml}
                    <div class="dash-court-peek">
                        <button type="button" class="dash-mini-btn" data-overview-peek-toggle data-overview-court-id="${courtIdAttr}" aria-expanded="${isExpanded ? 'true' : 'false'}">${isExpanded ? 'Hide availability' : 'Show availability'}</button>
                    </div>
                    <div class="dash-overview-peek-strip${isExpanded ? ' is-active' : ''}">${isExpanded ? renderOverviewPeekContent(court) : ''}</div>
                </div>
            </article>
        `;
    }

    // Re-wired after every renderOverviewCourtList() call, same
    // re-wire-after-render idiom wireReceiptDownloads() below also uses for
    // its own dynamically-rendered scope. [data-overview-peek-toggle]
    // wiring is unchanged from PR #1 (§4's "Pixlot Integration") — it only
    // shows/hides the read-only strip, nothing else. There is no
    // [data-overview-peek-slot] click wiring any more: Revision 2's R1
    // (implementation_plan.md) removed the peek-slot click-to-book hand-off
    // (jumpToBookingFromPeekSlot(), deleted) — renderOverviewSlotPill()
    // above now renders plain, non-interactive <span>s with nothing to wire
    // a click to. [data-overview-unit-select] is unchanged (§4/D2 — the
    // per-unit combo box's image swap).
    function wireOverviewCourtList() {
        if (!overviewCourtList) return;

        overviewCourtList.querySelectorAll('[data-overview-peek-toggle]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const courtId = btn.dataset.overviewCourtId;
                if (!courtId) return;
                if (overviewExpandedCourts.has(courtId)) {
                    overviewExpandedCourts.delete(courtId);
                } else {
                    overviewExpandedCourts.add(courtId);
                }
                renderOverviewCourtList();
            });
        });

        // Combo box selection swaps that card's photo in place (§4
        // "Imagery") — does NOT re-render the list, so it neither disturbs
        // any other card's peek strip nor loses its own; the chosen index
        // is stashed in overviewSelectedUnitIndex so it also survives the
        // NEXT full re-render (a peek toggle or sort change elsewhere).
        overviewCourtList.querySelectorAll('[data-overview-unit-select]').forEach((select) => {
            select.addEventListener('change', () => {
                const courtId = select.dataset.overviewCourtId;
                const court = overviewCourts.find((c) => String(c.id) === courtId);
                if (!court || !window.InigoCourtsData) return;

                const resolved = window.InigoCourtsData.resolveCourtUnits(court);
                const units = resolved.units.length ? resolved.units : [{ label: null, imageUrl: court.imageUrl }];
                const index = Math.min(Math.max(0, Number(select.value) || 0), units.length - 1);
                overviewSelectedUnitIndex.set(courtId, index);

                const card = select.closest('.dash-court-card');
                const mediaEl = card ? card.querySelector('[data-overview-court-media]') : null;
                paintOverviewCourtMedia(mediaEl, court, units[index]);
            });
        });
    }

    // Sort-select changes only re-render (sorting already-fetched data), not
    // re-fetch — implementation_plan.md's explicit instruction, since
    // nothing about the underlying court/booking data changes with sort
    // order. Grouped by sport (§4's "visual segregation") AFTER sorting, so
    // the chosen sort mode still decides which sport heading comes first —
    // see groupOverviewCourtsBySport() above.
    function renderOverviewCourtList() {
        if (!overviewCourtList) return;
        if (!overviewCourts.length) {
            overviewCourtList.innerHTML = '<p style="color: var(--color-ink-faint); padding: 8px 4px;">No courts available right now.</p>';
            return;
        }
        const sorted = sortOverviewCourts(overviewCourts, overviewSortMode);
        const groups = groupOverviewCourtsBySport(sorted);
        overviewCourtList.innerHTML = groups.map((group) => `
            <div class="dash-court-group">
                <h4 class="dash-court-group-title">${window.escapeHtml(group.sportName)}</h4>
                <div class="dash-court-grid">${group.courts.map(renderOverviewCourtCard).join('')}</div>
            </div>
        `).join('');
        wireOverviewCourtList();
    }

    if (overviewSortSelect) {
        overviewSortSelect.addEventListener('change', () => {
            overviewSortMode = overviewSortSelect.value;
            renderOverviewCourtList();
        });
    }

    async function refreshOverviewCourtWidget() {
        if (!overviewCourtList || !window.InigoCourtsData) return;

        const { start, end } = todayRange();
        overviewDateBase = start;

        const courtsPromise = window.InigoCourtsData.getCourts();
        const bookingPromise = window.sb
            ? window.sb.from('booking')
                .select('courts, time_date, duration_minutes, status')
                .gte('time_date', start.toISOString())
                .lt('time_date', end.toISOString())
            : Promise.resolve({ data: null, error: new Error('Supabase client unavailable') });
        const walkinPromise = window.sb
            ? fetchOverviewWalkins(start, end)
            : Promise.resolve({ data: null, error: new Error('Supabase client unavailable') });

        const [courts, bookingRes, walkinRes] = await Promise.all([courtsPromise, bookingPromise, walkinPromise]);

        overviewCourts = courts || [];

        if (bookingRes.error) console.error("[dashboard] failed to load today's bookings for the court peek", bookingRes.error);
        if (walkinRes.error) console.error("[dashboard] failed to load today's walk-ins for the court peek", walkinRes.error);

        // Fail-safe, not fabrication (see this block's header comment on the
        // RLS risk): if EITHER query errors, every court's peek renders the
        // honest "unavailable" note instead of pills. Court rows themselves
        // still render regardless, since overviewCourts came from
        // window.InigoCourtsData independently of these two queries.
        overviewDataOk = !bookingRes.error && !walkinRes.error;
        overviewBookings = overviewDataOk ? (bookingRes.data || []) : [];
        overviewWalkins = overviewDataOk ? (walkinRes.data || []) : [];

        renderOverviewCourtList();
    }

    refreshOverviewCourtWidget();
    document.addEventListener('inigosync:profile-ready', refreshOverviewCourtWidget);

    // ------------------------------------------------------------------
    // My Bookings — real data, fetched once the signed-in profile is ready
    // (authGuard.js dispatches this after its own session+profile check).
    // ------------------------------------------------------------------
    const bookingsTableBody = document.querySelector('[data-dash-panel="bookings"] tbody');

    // Same rate lookup already used by the booking form's <select> — read
    // live from its current <option data-rate> on every call rather than a
    // one-time snapshot, since those options are now populated
    // asynchronously by populateBookSelect() above (a snapshot taken here at
    // DOMContentLoaded would always find the select still empty). Only used
    // to show a known amount; no cost is persisted anywhere since no
    // payment record exists yet.
    function getCourtRate(courtName) {
        if (!bookSelect) return null;
        const opt = Array.from(bookSelect.options).find((o) => o.value === courtName);
        if (!opt || !opt.dataset.rate) return null;
        const rate = Number(opt.dataset.rate);
        return Number.isNaN(rate) ? null : rate;
    }

    function formatBookingDate(iso) {
        const d = new Date(iso);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function formatBookingTime(iso) {
        const d = new Date(iso);
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }

    // ------------------------------------------------------------------
    // Derived "Unattended" status (Revision 2, R4 — implementation_plan.md).
    // A booking DISPLAYS as Unattended once ALL of: it is more than 30
    // minutes past its start time (booking.time_date), nobody checked it in
    // (booking.checked_in_at is null/absent —
    // database/schema/004_staff_module.sql), and its stored status is still
    // 'pending' or 'confirmed' (a booking already 'completed' or 'cancelled'
    // keeps that real, later-stage status — Unattended never overrides one).
    //
    // This is NEVER written back to the database. booking.status has a CHECK
    // constraint that only accepts 'pending' | 'confirmed' | 'cancelled' |
    // 'completed' — see the big comment above the booking INSERT further up
    // this file and its own 23514 error branch. Writing 'unattended' there
    // would fail the exact same way. Nothing in this project runs a
    // scheduled job either (no cron this repo can see, and no visibility
    // into `booking`'s real triggers/RLS — database/schema/
    // 004_staff_module.sql's header note), so a WRITTEN status would need
    // server-side automation this repo cannot safely add blind. Deriving it
    // here instead means the rule is visibly enforced the moment it becomes
    // true, with zero migration risk and nothing fabricated — and it can
    // never drift out of sync between panels, since both My Bookings
    // (refreshMyBookings() below) and Receipts (normalizeReceipt() further
    // below) call this SAME function rather than reading booking.status
    // directly.
    //
    // database/schema/010_booking_unattended_status.sql (optional, NOT
    // applied — no Supabase admin access here) extends that CHECK
    // constraint so a later staff/automation feature COULD persist
    // 'unattended' for real; this function behaves identically whether or
    // not that migration has been run. Existing historical 'cancelled' rows
    // still display exactly as stored — this function only ever touches a
    // still-open pending/confirmed booking.
    // ------------------------------------------------------------------
    const UNATTENDED_GRACE_MINUTES = 30;

    function displayStatusFor(booking) {
        const rawStatus = String(booking.status || '').toLowerCase();
        // Only a still-open booking can ever be "missed" — one that's
        // already cancelled/completed keeps that real status.
        if (rawStatus !== 'pending' && rawStatus !== 'confirmed') return rawStatus;
        // Staff already timed this customer in — they showed up, however
        // late; not Unattended.
        if (booking.checked_in_at) return rawStatus;

        const start = new Date(booking.time_date);
        if (Number.isNaN(start.getTime())) return rawStatus; // defensive — time_date is required, never seen live

        const graceDeadline = start.getTime() + UNATTENDED_GRACE_MINUTES * 60000;
        return Date.now() > graceDeadline ? 'unattended' : rawStatus;
    }

    // Profile panel's Total bookings / Completed / Cancelled tiles
    // ([3]/[4]/[5] of .dash-profile-meta-item — Member since is [2],
    // handled separately in renderProfile() via the auth session).
    // Computed from the exact same booking rows refreshMyBookings() already
    // fetches for the My Bookings table below, rather than a second query.
    // booking.status is CHECK-constrained to pending/confirmed/cancelled/
    // completed (confirmed live against the database), so those are the
    // only values ever seen here.
    function renderProfileBookingStats(bookings) {
        const metaItems = document.querySelectorAll('[data-dash-panel="profile"] .dash-profile-meta-item');
        const total = bookings.length;
        const completed = bookings.filter((b) => b.status === 'completed').length;
        const cancelled = bookings.filter((b) => b.status === 'cancelled').length;
        if (metaItems[3]) metaItems[3].querySelector('span:last-child').textContent = String(total);
        if (metaItems[4]) metaItems[4].querySelector('span:last-child').textContent = String(completed);
        if (metaItems[5]) metaItems[5].querySelector('span:last-child').textContent = String(cancelled);
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
            // Receipts (R5, Revision 2) reuses this exact fetch rather than
            // a second query — see renderReceipts()'s own header comment
            // below — so a failure here means Receipts can't render either.
            // Same fail-safe-not-fabrication convention this file already
            // uses elsewhere (e.g. the Overview peek widget): show the
            // honest empty state, never a stale or fabricated list.
            if (receiptsGrid) receiptsGrid.innerHTML = RECEIPT_EMPTY_HTML;
            return;
        }

        renderProfileBookingStats(data || []);
        // Notifications (§3, D6) — reuses this exact fetch rather than a
        // second query against `booking`; see renderNotifications()'s own
        // header comment near the notifications dropdown wiring above.
        renderNotifications(data || []);
        // Receipts (§7/D8, Revision 2's R5) — same reuse, no second query;
        // see renderReceipts()'s own header comment below.
        renderReceipts(data || []);

        bookingsTableBody.innerHTML = '';

        if (!data || data.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="6" style="text-align:center; color: var(--color-ink-faint);">No bookings yet — book a court to see it here.</td>';
            bookingsTableBody.appendChild(row);
            return;
        }

        data.forEach((booking) => {
            const rate = getCourtRate(booking.courts);
            const amount = rate !== null ? `₱${rate.toFixed(2)}` : '—';
            const row = document.createElement('tr');
            // courts is DB content (free text on the booking row) — escaped
            // before touching innerHTML so this renders as literal text in
            // the customer's own session instead of running, same as the
            // staff/admin tables. Status shown is the DERIVED one
            // (displayStatusFor(), R4/Revision 2) — never booking.status
            // directly — so a booking more than 30 minutes past its start
            // with no check-in reads "Unattended" here without ever writing
            // that value to the database.
            const displayStatus = displayStatusFor(booking);
            const courtLabel = window.escapeHtml(booking.courts || '');
            const statusClass = window.escapeHtml(displayStatus);
            const statusLabel = window.escapeHtml(displayStatus ? displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1) : '—');
            // R3/Revision 2 — no Cancel control anywhere (see the policy
            // notices in Pages/user_dashboard.html): the real rule is no
            // cancellation, no refunds/cashback, and 30+ minutes late
            // automatically shows as Unattended above. This cell used to
            // hold ONLY a conditional Cancel button (nothing for
            // completed/cancelled rows) — a Receipt shortcut takes its
            // place instead of leaving the Actions column permanently
            // blank, matching what the static demo rows above it already
            // show in this same column.
            row.innerHTML = `
                <td class="dash-cell-main">${courtLabel}</td>
                <td>${formatBookingDate(booking.time_date)}</td>
                <td>${formatBookingTime(booking.time_date)}</td>
                <td>${amount}</td>
                <td><span class="dash-status ${statusClass}">${statusLabel}</span></td>
                <td>
                    <div class="dash-table-actions">
                        <button type="button" class="dash-mini-btn" data-dash-nav="receipts">Receipt</button>
                    </div>
                </td>
            `;
            bookingsTableBody.appendChild(row);
        });

        // Dynamically-created [data-dash-nav] buttons don't inherit the
        // page's one-time navButtons.forEach() binding at the very top of
        // this file (that querySelectorAll ran once, before these rows
        // existed) — wired explicitly here instead, same re-wire-after-
        // render idiom this file already uses elsewhere for its own
        // dynamically rendered scopes (wireOverviewCourtList() above,
        // wireReceiptDownloads() below).
        bookingsTableBody.querySelectorAll('[data-dash-nav="receipts"]').forEach((btn) => {
            btn.addEventListener('click', () => setActivePanel('receipts'));
        });
    }

    // ------------------------------------------------------------------
    // Receipts (Revision 2, R5 — implementation_plan.md). Renders one
    // .dash-receipt-card per booking from the customer's own real `booking`
    // rows — EVERY booking, not just ones that carry a payment_id (the old
    // Phase 2 behavior, §7/D8, under which this panel could only ever show
    // its hardcoded "No receipts yet" state, since nothing in this project
    // sets payment_id yet — no PayMongo/e-wallet integration). The ask for
    // this revision is explicit: every booking made should show a receipt
    // here. renderReceipts() below is called from refreshMyBookings() with
    // the SAME data that fetch already retrieved — no second query against
    // `booking` (R5's explicit instruction).
    //
    // Amount is shown only where genuinely known: getCourtRate() returns
    // null for every court today (court.rate is NULL in the live DB — see
    // database/seed/002_seed_content.sql), so a card honestly reads
    // "Rate TBA" rather than inventing a peso figure — same convention the
    // booking wizard's own summary and My Bookings' Amount column already
    // use. There is also no `payment` table anywhere in this project, so a
    // receipt card has no payment method/reference to show.
    //
    // Status shown is the DERIVED one (displayStatusFor(), R4 above) — never
    // booking.status directly — so a receipt for a booking more than 30
    // minutes past its start with no check-in reads "Unattended" here too,
    // exactly matching what My Bookings shows for that same booking; the two
    // panels can never disagree, since both call the one shared function.
    //
    // Each card's Download button rasterizes THAT card (not the whole page)
    // to a PNG via html2canvas (CDN <script> in Pages/user_dashboard.html)
    // and canvas.toBlob() + a programmatic <a download> click — the one
    // path that also works on iOS Safari and Android, unlike an <a href>
    // pointed at a data: URL for a large image. This mechanism is unchanged
    // from Phase 2 — only the empty-forever data source above it changed.
    // ------------------------------------------------------------------
    const receiptsGrid = document.querySelector('.dash-receipt-grid');
    const RECEIPT_EMPTY_HTML = '<p style="color: var(--color-ink-faint); padding: 24px 4px;">No receipts yet — book a court to see your receipt here.</p>';

    if (receiptsGrid) {
        receiptsGrid.innerHTML = '<p style="color: var(--color-ink-faint); padding: 24px 4px;">Loading your receipts…</p>';
    }

    // booking row -> the small, honest subset of fields a receipt card can
    // actually show today: nothing here is invented. `sport` is
    // booking.sports (the court's REAL related sport, e.g. "Bowling" for a
    // "Bowling — Duckpin" booking — see the big booking-insert comment
    // further up this file), `rate` comes from the same getCourtRate()
    // lookup (with the same "Rate TBA" honesty) My Bookings already uses
    // above, and `status` is the DERIVED display status (R4), not the raw
    // stored one.
    function normalizeReceipt(booking) {
        return {
            id: booking.booking_id,
            court: booking.courts || 'Booking',
            sport: booking.sports || '',
            when: booking.time_date,
            status: displayStatusFor(booking),
            rate: getCourtRate(booking.courts),
        };
    }

    // Kept deliberately simple/non-exotic (flexbox, solid backgrounds, no
    // gradients/backdrop-filter/transforms) so html2canvas — which does not
    // reliably support every modern CSS feature — captures it correctly and
    // completely; see downloadReceiptAsPng() below.
    function renderReceiptCard(receipt) {
        const amount = receipt.rate !== null ? `₱${receipt.rate.toFixed(2)}` : 'Rate TBA';
        const statusClass = window.escapeHtml(receipt.status);
        const statusLabel = window.escapeHtml(receipt.status ? receipt.status.charAt(0).toUpperCase() + receipt.status.slice(1) : '—');
        const idAttr = window.escapeHtml(String(receipt.id));
        // R4-3 (implementation_plan.md, "Revision 4") — carries the same
        // booking_id a notification's data-dash-notif-booking carries (see
        // renderNotificationItem() above), so a notification click can find
        // THIS exact card via document.querySelectorAll('[data-dash-receipt-card]')
        // + a dataset match. wireReceiptDownloads()'s own
        // closest('[data-dash-receipt-card]') below is a presence selector
        // (matches regardless of the attribute's value), so giving it a real
        // value here doesn't affect that at all.
        return `
            <div class="dash-receipt-card" data-dash-receipt-card="${idAttr}">
                <div class="dash-receipt-top">
                    <div>
                        <h4>${window.escapeHtml(receipt.court)}</h4>
                        <p>Receipt #${idAttr}</p>
                    </div>
                    <span class="dash-status ${statusClass}">${statusLabel}</span>
                </div>
                <div class="dash-receipt-rows">
                    <div class="dash-summary-row"><span>Sport</span><strong>${window.escapeHtml(receipt.sport || '—')}</strong></div>
                    <div class="dash-summary-row"><span>Date</span><strong>${window.escapeHtml(formatBookingDate(receipt.when))}</strong></div>
                    <div class="dash-summary-row"><span>Time</span><strong>${window.escapeHtml(formatBookingTime(receipt.when))}</strong></div>
                    <div class="dash-summary-row"><span>Amount</span><strong>${window.escapeHtml(amount)}</strong></div>
                </div>
                <div class="dash-receipt-actions">
                    <button type="button" class="dash-btn-primary" data-dash-receipt-download="${idAttr}">Download as PNG</button>
                </div>
            </div>
        `;
    }

    // Promisifies HTMLCanvasElement.toBlob (callback-only in every browser)
    // so downloadReceiptAsPng() below can simply await it.
    function canvasToBlobAsync(canvas) {
        return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    }

    // Rasterizes `card` (a .dash-receipt-card) to a PNG and triggers a
    // download — canvas.toBlob() + a programmatic <a download> click, which
    // (unlike canvas.toDataURL() piped straight into an <a href>) works
    // reliably on iOS Safari and Android per §7's "works seamlessly across
    // all device types". Returns true/false so the caller can toast
    // accordingly without duplicating the try/catch.
    async function downloadReceiptAsPng(card, filenameId) {
        if (!window.html2canvas) {
            window.InigoToast?.show("Download isn't available right now — please refresh and try again.", true);
            return false;
        }

        // Hides the Download button itself for the duration of the capture
        // (see .dash-receipt-card.is-capturing in Style/Dashboard.css) so
        // the button doesn't bake itself into its own screenshot.
        card.classList.add('is-capturing');
        try {
            const canvas = await window.html2canvas(card, {
                backgroundColor: null,
                scale: Math.min(window.devicePixelRatio || 1, 2) || 1,
                useCORS: true,
                // html2canvas clones the WHOLE document (not just `card`) to
                // resolve inherited styles correctly, so the footer's
                // cross-origin Google Maps <iframe> gets walked on every
                // single receipt download even though it never appears in
                // the output — verified locally this turns a ~70ms capture
                // into 1300ms+. Skipping every <iframe> (there is only ever
                // the one, but this isn't hardcoded to that fact) keeps the
                // download fast without touching anything the receipt card
                // itself renders.
                ignoreElements: (el) => el.tagName === 'IFRAME',
            });
            const blob = await canvasToBlobAsync(canvas);
            if (!blob) throw new Error('canvas.toBlob returned no data');

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `inigosync-receipt-${filenameId}.png`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            // Revoked on a short delay rather than immediately — some
            // browsers cancel an in-flight download if its object URL is
            // revoked before the download has finished reading it.
            window.setTimeout(() => URL.revokeObjectURL(url), 4000);
            return true;
        } catch (err) {
            console.error('[dashboard] receipt PNG download failed', err);
            window.InigoToast?.show('Could not generate the receipt image. Please try again.', true);
            return false;
        } finally {
            card.classList.remove('is-capturing');
        }
    }

    // Re-wired after every renderReceipts() render, same re-wire-after-
    // render idiom wireOverviewCourtList() above already uses for its own
    // dynamically rendered scope.
    function wireReceiptDownloads() {
        if (!receiptsGrid) return;
        receiptsGrid.querySelectorAll('[data-dash-receipt-download]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const card = btn.closest('[data-dash-receipt-card]');
                if (!card) return;
                const originalLabel = btn.textContent;
                btn.disabled = true;
                btn.textContent = 'Preparing…';
                const ok = await downloadReceiptAsPng(card, btn.dataset.dashReceiptDownload || 'receipt');
                btn.disabled = false;
                btn.textContent = originalLabel;
                if (ok) window.InigoToast?.show('Receipt downloaded.');
            });
        });
    }

    // Renders every booking's receipt card at once — called from
    // refreshMyBookings() with the data it already fetched (R5's explicit
    // "no redundant query" instruction), not a fetcher of its own. Genuinely
    // empty only when the customer has zero bookings at all; a fetch error
    // is handled by the caller (refreshMyBookings() falls back to
    // RECEIPT_EMPTY_HTML itself when its shared query fails, same fail-safe
    // convention Phase 2's refreshReceipts() used to use on its own error
    // branch).
    function renderReceipts(bookings) {
        if (!receiptsGrid) return;

        if (!bookings || bookings.length === 0) {
            receiptsGrid.innerHTML = RECEIPT_EMPTY_HTML;
            return;
        }

        receiptsGrid.innerHTML = bookings.map(normalizeReceipt).map(renderReceiptCard).join('');
        wireReceiptDownloads();
    }

    // ------------------------------------------------------------------
    // Profile + Settings — prefill from the real signed-in profile, and
    // wire the two Settings save buttons (Personal Info vs Change Password
    // — distinguished by data-dash-settings-save="profile"/"password" in
    // the markup) to real Supabase calls.
    // ------------------------------------------------------------------

    // Shared by the Mobile number field's load-time display (below) and its
    // [data-digits-only] input/paste wiring further down (increment 13) — a
    // function declaration (hoisted), not a const arrow, so it is safe to
    // reference from renderProfile() regardless of source order; this file
    // otherwise declares everything inline at the point of use (no top-level
    // `let` a later call could run into before its declaration executes, the
    // way includes/auth.js once did), and a hoisted function keeps that same
    // guarantee for this one shared helper.
    function digitsOnly(raw) {
        return String(raw || '').replace(/[^0-9]/g, '');
    }

    // Same hoisted-function-declaration reasoning as digitsOnly above —
    // safe to call from renderProfile() regardless of source order.
    // "July 2026" (the old hardcoded value) is coincidentally this
    // function's exact output format, so a real date renders identically
    // to how the placeholder used to look.
    function formatMemberSince(iso) {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    // ------------------------------------------------------------------
    // Account Settings — name parts (§9, D3). profiles.first_name/
    // middle_name/last_name (database/schema/008_profile_name_parts.sql)
    // are additive columns alongside full_name, which stays the
    // compatibility field the owner/staff dashboards still read/write
    // (includes/owner_dashboard.js, includes/staff_dashboard.js) — so every
    // save here writes BOTH, and every load prefers the three columns but
    // falls back to parsing full_name when they're absent/undefined (before
    // the migration runs, or for any row that predates it).
    // ------------------------------------------------------------------

    // Inverse of composeFullName() below — first token -> first name, last
    // token -> surname, remaining tokens -> middle name. Matches the exact
    // rule implementation_plan.md's D3 specifies, so a full_name this form
    // itself composed always round-trips back to the same three boxes.
    function parseFullName(fullName) {
        const tokens = String(fullName || '').trim().split(/\s+/).filter(Boolean);
        if (tokens.length === 0) return { first: '', middle: '', last: '' };
        if (tokens.length === 1) return { first: tokens[0], middle: '', last: '' };
        return {
            first: tokens[0],
            middle: tokens.slice(1, -1).join(' '),
            last: tokens[tokens.length - 1],
        };
    }

    // Same "First Middle Last" composition includes/auth.js's signup form
    // already uses (its own composeFullName()) — duplicated here rather
    // than shared, since this project ships plain <script src> files with
    // no module system (see includes/courtsData.js's own header note on why
    // small helpers are copied per file instead of imported) and
    // includes/auth.js isn't loaded on this page. filter(Boolean) makes
    // Middle name optional without leaving a double space behind.
    function composeFullName(first, middle, last) {
        return [first, middle, last]
            .map((part) => String(part || '').trim().replace(/\s+/g, ' '))
            .filter(Boolean)
            .join(' ');
    }

    function fillNameInputs(parts) {
        const settingsPanel = document.querySelector('[data-dash-panel="settings"]');
        if (!settingsPanel) return;
        const firstInput = settingsPanel.querySelector('[data-dash-settings-firstname]');
        const middleInput = settingsPanel.querySelector('[data-dash-settings-middlename]');
        const lastInput = settingsPanel.querySelector('[data-dash-settings-lastname]');
        if (firstInput) firstInput.value = parts.first || '';
        if (middleInput) middleInput.value = parts.middle || '';
        if (lastInput) lastInput.value = parts.last || '';
    }

    // Loads first_name/middle_name/last_name in a request of their own —
    // deliberately NOT added to includes/authGuard.js's shared `profiles`
    // select, which every dashboard (customer/staff/admin) reuses as its own
    // login gate: asking THAT query for columns that don't exist yet would
    // fail the whole select with Postgres 42703 and sign every user out
    // until database/schema/008_profile_name_parts.sql is applied. Scoping
    // the request to just this panel means a schema mismatch only ever
    // affects these three boxes, same isOverviewSchemaMismatch() classifier
    // this file already uses for the Overview peek widget and feedback
    // submit — defined further below, but a hoisted function declaration
    // like every other helper on this page, so it's safe to call here.
    async function fetchProfileNameParts(profileId) {
        if (!window.sb || !profileId) return null;
        const { data, error } = await window.sb
            .from('profiles')
            .select('first_name, middle_name, last_name')
            .eq('id', profileId)
            .maybeSingle();
        if (error) {
            if (!isOverviewSchemaMismatch(error)) {
                console.error('[dashboard] failed to load profile name parts', error);
            }
            return null;
        }
        return data;
    }

    // Fills the three boxes from full_name immediately (so they're never
    // blank while the request below is in flight), then upgrades to the
    // real columns if/when that resolves with real values — the same
    // "show something honest now, refine when the real data arrives"
    // pattern as this function's own "Member since" above. If the columns
    // don't exist yet, or exist but are still NULL (nobody has saved
    // through this form yet), the full_name-derived fill is simply left in
    // place.
    function populateSettingsNameFields(profile) {
        fillNameInputs(parseFullName(profile.full_name));

        fetchProfileNameParts(profile.id).then((parts) => {
            const hasColumnData = parts && (String(parts.first_name || '').trim() || String(parts.last_name || '').trim());
            if (!hasColumnData) return;
            fillNameInputs({
                first: parts.first_name || '',
                middle: parts.middle_name || '',
                last: parts.last_name || '',
            });
        });
    }

    // ------------------------------------------------------------------
    // Account Settings — Profile Photo (R4-4, implementation_plan.md
    // "Revision 4"). profiles.avatar_url already existed and was already
    // selected by includes/authGuard.js's login-gate query — nothing on any
    // dashboard read or wrote it until now. No Supabase Storage bucket
    // exists anywhere in this project (see the two notes in
    // Pages/owner_dashboard.html) and provisioning one is out of this
    // repo's tracked scope, so the picked photo never leaves the browser as
    // a file upload: it is downscaled through a <canvas> into a small,
    // fixed-size (256x256, center-cropped) JPEG data URL and written
    // straight into that existing text column via the SAME self-
    // update().eq('id', window.inigosyncProfile.id) path Personal
    // Information's Save uses below. Unlike that save, avatar_url is
    // already confirmed to exist (authGuard.js selects it today, live), so
    // there is no schema-mismatch column-fallback retry needed here — a
    // failure here is a real error, not a "hasn't been migrated yet" one.
    // ------------------------------------------------------------------
    const AVATAR_MAX_RAW_BYTES = 5 * 1024 * 1024; // 5 MB raw file ceiling, checked before downscaling
    const AVATAR_OUTPUT_SIZE = 256;               // px, square — the final stored image
    const AVATAR_JPEG_QUALITY = 0.82;             // ~20-50KB per image at 256x256

    const avatarFileInput = document.querySelector('[data-dash-avatar-file]');
    const avatarUploadBtn = document.querySelector('[data-dash-avatar-upload-trigger]');
    const avatarRemoveBtn = document.querySelector('[data-dash-avatar-remove]');

    // Center-crops `file` (already validated as an image under the size
    // ceiling by the `change` handler below) into an AVATAR_OUTPUT_SIZE
    // square and resolves a JPEG data URL. The crop SOURCE square is the
    // smaller of the image's own width/height, centered, so a portrait or
    // landscape photo both crop to their visual center instead of being
    // squashed to fit — the "CENTER-CROPPED" half of the spec, not just the
    // "256x256" half.
    function downscaleImageToAvatarDataUrl(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const objectUrl = URL.createObjectURL(file);

            img.onload = () => {
                URL.revokeObjectURL(objectUrl);
                try {
                    const size = AVATAR_OUTPUT_SIZE;
                    const canvas = document.createElement('canvas');
                    canvas.width = size;
                    canvas.height = size;
                    const ctx = canvas.getContext('2d');

                    const cropSize = Math.min(img.naturalWidth, img.naturalHeight);
                    const sx = (img.naturalWidth - cropSize) / 2;
                    const sy = (img.naturalHeight - cropSize) / 2;
                    ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, size, size);

                    resolve(canvas.toDataURL('image/jpeg', AVATAR_JPEG_QUALITY));
                } catch (err) {
                    reject(err);
                }
            };
            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error('Could not read the selected image.'));
            };
            img.src = objectUrl;
        });
    }

    // Shared by the upload flow below AND Remove Photo — `avatarUrl` is
    // either a fresh data URL or null (Remove Photo writes null, exactly
    // like every other "not set" value on this profile). On success, keeps
    // window.inigosyncProfile and every .dash-avatar on the page (topbar,
    // Profile panel, this card's own live preview — all painted by the one
    // renderProfile() below) in sync via the same re-render call Personal
    // Information's own Save uses after ITS update succeeds.
    async function saveAvatarUrl(avatarUrl) {
        if (!window.sb || !window.inigosyncProfile) {
            window.InigoToast?.show('Unable to reach the server right now. Please try again shortly.', true);
            return false;
        }

        const { error } = await window.sb
            .from('profiles')
            .update({ avatar_url: avatarUrl })
            .eq('id', window.inigosyncProfile.id);

        if (error) {
            console.error('[dashboard] avatar_url update failed', error);
            window.InigoToast?.show(error.message || 'Could not save your photo. Please try again.', true);
            return false;
        }

        window.inigosyncProfile.avatar_url = avatarUrl;
        renderProfile(window.inigosyncProfile);
        return true;
    }

    // "Upload Photo" is a styled button, not the (unstyleable) native file
    // input itself — clicking it just forwards to the real, hidden picker,
    // same indirection Pages/user_dashboard.html's own comment on that
    // input describes.
    if (avatarUploadBtn && avatarFileInput) {
        avatarUploadBtn.addEventListener('click', () => avatarFileInput.click());
    }

    if (avatarFileInput) {
        avatarFileInput.addEventListener('change', async () => {
            const file = avatarFileInput.files && avatarFileInput.files[0];
            // Reset immediately (not only on success) so picking the SAME
            // file again right after a validation error still fires a fresh
            // `change` event — a browser will not re-fire `change` for an
            // unchanged file list otherwise.
            avatarFileInput.value = '';
            if (!file) return;

            if (!file.type || !file.type.startsWith('image/')) {
                window.InigoToast?.show('Please choose an image file.', true);
                return;
            }
            if (file.size > AVATAR_MAX_RAW_BYTES) {
                window.InigoToast?.show('That image is too large — please choose one under 5 MB.', true);
                return;
            }

            const originalLabel = avatarUploadBtn ? avatarUploadBtn.textContent : '';
            if (avatarUploadBtn) {
                avatarUploadBtn.disabled = true;
                avatarUploadBtn.textContent = 'Uploading…';
            }

            try {
                const dataUrl = await downscaleImageToAvatarDataUrl(file);
                const ok = await saveAvatarUrl(dataUrl);
                if (ok) window.InigoToast?.show('Profile photo updated.');
            } catch (err) {
                console.error('[dashboard] avatar downscale failed', err);
                window.InigoToast?.show('Could not process that image. Please try a different file.', true);
            } finally {
                if (avatarUploadBtn) {
                    avatarUploadBtn.disabled = false;
                    avatarUploadBtn.textContent = originalLabel;
                }
            }
        });
    }

    if (avatarRemoveBtn) {
        avatarRemoveBtn.addEventListener('click', async () => {
            avatarRemoveBtn.disabled = true;
            const ok = await saveAvatarUrl(null);
            avatarRemoveBtn.disabled = false;
            if (ok) window.InigoToast?.show('Profile photo removed.');
        });
    }

    function renderProfile(profile) {
        const initials = (profile.full_name || profile.email || '?')
            .split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

        // R4-4 (implementation_plan.md, "Revision 4") — the ONE place that
        // paints every .dash-avatar on this page (topbar, Profile panel,
        // Account Settings' own preview above). avatar_url unset takes the
        // EXACT SAME textContent-initials path this always used — the
        // default avatar's look/behaviour is unchanged. avatar_url set
        // swaps in an <img class="dash-avatar-img"> instead (see that
        // class in Style/Dashboard.css); escapeHtml on the data URL is the
        // same "everything interpolated into innerHTML is escaped" rule
        // this file applies everywhere else, even though a data URL this
        // code itself generated never actually contains &<>"'.
        const avatarUrl = profile.avatar_url || null;
        document.querySelectorAll('.dash-avatar').forEach((el) => {
            if (avatarUrl) {
                el.innerHTML = `<img class="dash-avatar-img" src="${window.escapeHtml(avatarUrl)}" alt="Profile photo">`;
            } else {
                el.textContent = initials;
            }
        });
        // Remove Photo only makes sense once there IS a photo.
        if (avatarRemoveBtn) avatarRemoveBtn.hidden = !avatarUrl;

        document.querySelectorAll('[data-dash-profile-name]').forEach((el) => { el.textContent = profile.full_name || 'Customer'; });

        const profileCardInfo = document.querySelector('[data-dash-panel="profile"] .dash-profile-card-info h3');
        if (profileCardInfo) profileCardInfo.textContent = profile.full_name || 'Customer';

        const metaItems = document.querySelectorAll('[data-dash-panel="profile"] .dash-profile-meta-item');
        if (metaItems[0]) metaItems[0].querySelector('span:last-child').textContent = profile.email || '—';
        if (metaItems[1]) metaItems[1].querySelector('span:last-child').textContent = profile.contact_num || '—';

        // Member since ([2]) — from the AUTH session's created_at, not a
        // `profiles` column. There is no schema file for `profiles` in this
        // repo and a created_at column there is unconfirmed
        // (implementation_plan.md E3/"Open questions"), but Supabase Auth
        // always provides session.user.created_at, so this has zero schema
        // risk. Async and fire-and-forget — renderProfile()'s callers never
        // await it, same as the rest of this function's side effects.
        if (metaItems[2] && window.sb) {
            window.sb.auth.getSession().then(({ data }) => {
                const createdAt = data && data.session && data.session.user ? data.session.user.created_at : null;
                metaItems[2].querySelector('span:last-child').textContent = createdAt ? formatMemberSince(createdAt) : '—';
            });
        }

        const settingsPanel = document.querySelector('[data-dash-panel="settings"]');
        if (settingsPanel) {
            const emailInput = settingsPanel.querySelector('[data-dash-settings-email]');
            const mobileInput = settingsPanel.querySelector('[data-dash-settings-mobile]');
            if (emailInput) emailInput.value = profile.email || '';
            // Digits-only on load too, matching the field's own [data-digits-only]
            // contract (increment 13). Both write paths (signup and this panel's
            // own Save below) already run contact_num through
            // window.validatePhMobile first, whose `normalized` is always the
            // spaceless local 09XXXXXXXXX form — so this is a defensive strip for
            // any value that got into the database another way, not a fix for
            // anything either write path produces today.
            if (mobileInput) mobileInput.value = digitsOnly(profile.contact_num).slice(0, 11);

            // First/Middle/Surname (§9, D3) — see populateSettingsNameFields()
            // above for the full_name-parsing fallback.
            populateSettingsNameFields(profile);
        }
    }

    // refreshMyBookings() renders Receipts itself now (renderReceipts(),
    // R5/Revision 2 above) — no separate refreshReceipts() call needed
    // here, since it would otherwise re-fetch the same `booking` rows a
    // second time.
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

    // Mobile number — digits only, capped at 11 (increment 13). Identical
    // pattern to includes/auth.js's [data-digits-only] wiring for signup's
    // mobile field (see its comment there for the full reasoning): maxlength
    // alone would truncate a paste BEFORE anything can filter it, landing the
    // wrong digits, so the paste handler preempts it and strips first. Wired
    // once here at setup time rather than inside renderProfile() — that
    // function can run more than once (on 'inigosync:profile-ready' AND
    // immediately if window.inigosyncProfile already exists), and attaching
    // this twice would double-apply the paste handler's manual splice.
    document.querySelectorAll('[data-dash-panel="settings"] .dash-settings-grid .dash-input[data-digits-only]').forEach((field) => {
        const maxDigits = field.maxLength > 0 ? field.maxLength : 11;

        field.addEventListener('input', () => {
            const filtered = digitsOnly(field.value).slice(0, maxDigits);
            // Written back only when it actually differs: assigning .value
            // drops the caret to the end of the box, and every accepted
            // keystroke would otherwise pay that for nothing.
            if (filtered !== field.value) field.value = filtered;
        });

        field.addEventListener('paste', (e) => {
            const clipboard = e.clipboardData || window.clipboardData;
            // No clipboard data to read (older Safari): let the browser
            // paste and leave it to the input handler above, which still
            // filters whatever lands.
            if (!clipboard) return;
            e.preventDefault();

            const pasted = digitsOnly(clipboard.getData('text'));
            // Respects the caret and any selection, so a paste into the
            // middle of a half-typed number behaves like a normal paste.
            const start = field.selectionStart ?? field.value.length;
            const end = field.selectionEnd ?? field.value.length;
            const next = (field.value.slice(0, start) + pasted + field.value.slice(end)).slice(0, maxDigits);
            field.value = next;
            const caret = Math.min(start + pasted.length, next.length);
            field.setSelectionRange(caret, caret);

            // Assigning .value fires nothing, so a paste has to announce
            // itself with its own input event (nothing here currently
            // listens for it, unlike signup's per-field error clearing, but
            // this keeps the two implementations identical rather than
            // dropping a line signup's copy relies on).
            field.dispatchEvent(new Event('input', { bubbles: true }));
        });
    });

    const profileSaveBtn = document.querySelector('[data-dash-settings-save="profile"]');
    if (profileSaveBtn) {
        profileSaveBtn.addEventListener('click', async () => {
            if (!window.sb || !window.inigosyncProfile) return;
            const settingsPanel = document.querySelector('[data-dash-panel="settings"]');
            const firstInput = settingsPanel.querySelector('[data-dash-settings-firstname]');
            const middleInput = settingsPanel.querySelector('[data-dash-settings-middlename]');
            const lastInput = settingsPanel.querySelector('[data-dash-settings-lastname]');
            const mobileInput = settingsPanel.querySelector('[data-dash-settings-mobile]');

            const first_name = (firstInput?.value || '').trim();
            const middle_name = (middleInput?.value || '').trim();
            const last_name = (lastInput?.value || '').trim();

            // Surname/First name required, Middle name optional — same split
            // includes/auth.js's signup form already enforces (many
            // Filipino users legitimately have no middle name).
            if (!first_name) {
                window.InigoToast?.show('Enter your first name.', true);
                firstInput?.focus();
                return;
            }
            if (!last_name) {
                window.InigoToast?.show('Enter your surname.', true);
                lastInput?.focus();
                return;
            }

            // D3 — keeps full_name (the compatibility field
            // includes/owner_dashboard.js and includes/staff_dashboard.js
            // still read/write) in sync with the three boxes, using the same
            // composition includes/auth.js's signup form already uses.
            const full_name = composeFullName(first_name, middle_name, last_name);

            // PH mobile validation (spec: Account Settings must validate
            // updates to the registered mobile number). Normalized to the
            // local 09XXXXXXXXX form regardless of which accepted format
            // was typed, so contact_num is always stored one consistent way.
            const mobileCheck = window.validatePhMobile(mobileInput?.value || '');
            if (!mobileCheck.valid) {
                window.InigoToast?.show(mobileCheck.message, true);
                return;
            }
            const contact_num = mobileCheck.normalized;

            profileSaveBtn.disabled = true;

            // Try the full column set first (D3); if database/schema/
            // 008_profile_name_parts.sql hasn't been applied yet, retry with
            // just the columns that predate this phase so full_name/
            // contact_num still save — the same "retry without the missing
            // column" idiom this file's fetchOverviewWalkins() already uses
            // for walk_in_booking.duration_minutes. middle_name is sent as
            // null (not '') when blank, matching the column's own "NULL
            // means not provided" contract (database/schema/
            // 008_profile_name_parts.sql).
            let { error } = await window.sb
                .from('profiles')
                .update({ full_name, first_name, middle_name: middle_name || null, last_name, contact_num })
                .eq('id', window.inigosyncProfile.id);

            if (error && isOverviewSchemaMismatch(error)) {
                ({ error } = await window.sb
                    .from('profiles')
                    .update({ full_name, contact_num })
                    .eq('id', window.inigosyncProfile.id));
            }

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

    // ------------------------------------------------------------------
    // Change Password — 2-step wizard (§9, D4). Step 1 collects only the
    // current password, with Next disabled until it's non-empty; Step 2
    // collects the new password + confirmation, with Go Back / Save
    // Password. This block only re-stages the PRESENTATION — the actual
    // save handler below still re-verifies the current password via
    // sb.auth.signInWithPassword() before calling updateUser(), unchanged.
    // ------------------------------------------------------------------
    const pwStepPanels = document.querySelectorAll('[data-dash-pw-step]');
    const pwStepIndicators = document.querySelectorAll('[data-dash-pw-step-indicator]');
    const pwBackBtn = document.querySelector('[data-dash-pw-back]');
    const pwNextBtn = document.querySelector('[data-dash-pw-next]');
    const passwordSaveBtn = document.querySelector('[data-dash-settings-save="password"]');
    const pwCurrentInput = document.querySelector('[data-dash-pw-current]');
    const pwNewInput = document.querySelector('[data-dash-pw-new]');
    const pwConfirmInput = document.querySelector('[data-dash-pw-confirm]');

    let pwWizardStep = 1;

    function renderPwWizard() {
        pwStepPanels.forEach((panel) => {
            panel.classList.toggle('is-active', Number(panel.dataset.dashPwStep) === pwWizardStep);
        });
        pwStepIndicators.forEach((el) => {
            const n = Number(el.dataset.dashPwStepIndicator);
            el.classList.toggle('is-current', n === pwWizardStep);
            el.classList.toggle('is-done', n < pwWizardStep);
            el.setAttribute('aria-current', n === pwWizardStep ? 'step' : 'false');
        });

        if (pwBackBtn) pwBackBtn.hidden = pwWizardStep !== 2;
        if (passwordSaveBtn) passwordSaveBtn.hidden = pwWizardStep !== 2;
        if (pwNextBtn) {
            pwNextBtn.hidden = pwWizardStep !== 1;
            pwNextBtn.disabled = !(pwCurrentInput && pwCurrentInput.value !== '');
        }
    }

    function goToPwStep(step) {
        pwWizardStep = step === 2 ? 2 : 1;
        renderPwWizard();
    }

    if (pwCurrentInput) {
        pwCurrentInput.addEventListener('input', renderPwWizard);
    }
    if (pwNextBtn) {
        pwNextBtn.addEventListener('click', () => {
            if (pwNextBtn.disabled) return;
            goToPwStep(2);
        });
    }
    if (pwBackBtn) {
        pwBackBtn.addEventListener('click', () => goToPwStep(1));
    }

    // Establishes the correct initial hidden/disabled state for the nav
    // buttons (matching the `disabled`/`hidden` attributes already baked
    // into the markup as a no-JS baseline) and paints the step-1 indicator.
    renderPwWizard();

    if (passwordSaveBtn) {
        passwordSaveBtn.addEventListener('click', async () => {
            if (!window.sb || !window.inigosyncProfile) return;
            const currentPassword = pwCurrentInput?.value;
            const newPassword = pwNewInput?.value;
            const confirmPassword = pwConfirmInput?.value;

            if (!currentPassword) {
                window.InigoToast?.show('Enter your current password.', true);
                goToPwStep(1);
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

            passwordSaveBtn.disabled = true;

            // "Current password" used to be collected and never checked —
            // any hijacked or left-open session could silently take over
            // the account via updateUser(). Re-authenticating with it first
            // (Supabase has no separate "verify password" call) confirms
            // the person at the keyboard actually knows it before the
            // password is changed.
            const { error: verifyError } = await window.sb.auth.signInWithPassword({
                email: window.inigosyncProfile.email,
                password: currentPassword,
            });

            if (verifyError) {
                passwordSaveBtn.disabled = false;
                window.InigoToast?.show('Current password is incorrect.', true);
                goToPwStep(1);
                return;
            }

            const { error } = await window.sb.auth.updateUser({ password: newPassword });
            passwordSaveBtn.disabled = false;

            if (error) {
                window.InigoToast?.show(error.message || 'Could not update your password.', true);
                return;
            }

            [pwCurrentInput, pwNewInput, pwConfirmInput].forEach((input) => { if (input) input.value = ''; });
            goToPwStep(1);
            window.InigoToast?.show('Password updated.');
        });
    }

    // ------------------------------------------------------------------
    // Account Settings — Personal Information's Cancel button. Discards
    // in-progress edits back to the last-saved values instead of leaving a
    // button that has no effect. Change Password no longer has a Cancel
    // button of its own (§9, D4's 2-step wizard only specifies Next / Go
    // Back / Save Password), so this only ever matches "profile" now.
    // ------------------------------------------------------------------
    document.querySelectorAll('[data-dash-settings-cancel]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.dashSettingsCancel;
            if (mode === 'profile' && window.inigosyncProfile) {
                renderProfile(window.inigosyncProfile);
            }
        });
    });
});