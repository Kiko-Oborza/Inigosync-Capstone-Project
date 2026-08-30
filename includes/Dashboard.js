// IñigoSync — Customer Dashboard controller
// Handles: sidebar/topbar panel switching, mobile sidebar toggle, profile
// dropdown, court "Book Now" hand-off into the Booking panel, time-slot and
// payment-option selection with a live summary recalculation, filter chips,
// calendar month label cycling, and password show/hide toggles.
//
// Court Information, Booking (including its court dropdown), My Bookings,
// Receipts, Profile, and Settings talk to the real Supabase database —
// Court Information and Booking's court options both read the same
// `court`/`sport` tables via window.InigoCourtsData (includes/courtsData.js;
// see docs/QA_AUDIT_REPORT.md P0#8). Everything else here (panel switching,
// hero carousel, filter chips, mini calendar) is UI-only, same as before.

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
    // Court Information + Booking Management — both read the same
    // `court`/`sport` tables via window.InigoCourtsData (includes/courtsData.js),
    // which mirrors the fetch-with-static-fallback pattern already proven in
    // includes/landingPage.js. This replaces the two DIFFERENT hardcoded
    // 5-court lists this page and the Booking select used to have — see
    // docs/QA_AUDIT_REPORT.md P0#8 ("three contradictory court lists").
    //
    // Booking Management's court/date/slot/payment selection still does a
    // live client-side summary recalculation; real per-slot availability and
    // double-booking prevention are a later phase (implementation_plan.md
    // Phase 4) — the booking table only stores a single start timestamp.
    // ------------------------------------------------------------------
    const courtGrid = document.querySelector('[data-dash-court-grid]');
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
    };

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
        const amount = hasKnownRate() ? (isFull ? bookingState.rate : bookingState.rate * 0.5) : null;

        if (summaryCourt) summaryCourt.textContent = bookingState.court || '—';
        if (summaryDate) summaryDate.textContent = formatDate(bookingState.date);
        if (summaryTime) summaryTime.textContent = bookingState.time || '— Select a slot —';
        if (summaryRate) summaryRate.textContent = hasKnownRate() ? `₱${bookingState.rate}${bookingState.rateUnit}` : 'Rate TBA';
        if (summaryPayment) summaryPayment.textContent = isFull ? 'Full Payment' : 'Downpayment (50%)';
        if (summaryTotal) summaryTotal.textContent = amount !== null ? `₱${amount.toFixed(2)}` : '—';

        if (bookSubmit) {
            const ready = Boolean(bookingState.time) && Boolean(bookingState.court);
            bookSubmit.disabled = !ready;
            bookSubmit.textContent = ready ? 'Request Booking' : 'Select a time slot to continue';
        }
    }

    if (bookSelect) {
        bookSelect.addEventListener('change', () => {
            const opt = bookSelect.selectedOptions[0];
            bookingState.court = bookSelect.value;
            bookingState.sport = (opt && opt.dataset.sport) || bookingState.court;
            bookingState.rate = (opt && opt.dataset.rate) ? Number(opt.dataset.rate) : null;
            bookingState.rateUnit = (opt && opt.dataset.rateUnit) || '/hr';
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
            //    through here via data-sport / data-dash-book-sport
            //    attributes (see populateBookSelect() and
            //    wireBookNowButtons() above — same pattern already used to
            //    carry rate/rateUnit), falling back to the court name if a
            //    court ever has no linked sport row. It is never sent as
            //    null.
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
            refreshMyBookings();
        });
    }

    updateSummary();

    // ------------------------------------------------------------------
    // "Book Now" (Court Information cards) — jumps to the Booking panel and
    // pre-fills the court + rate so the customer doesn't have to reselect
    // it. Re-wired every time renderCourtGrid() (re-)renders the grid,
    // since the cards don't exist yet at this point in the script — they're
    // rendered once window.InigoCourtsData.getCourts() resolves below. Same
    // re-wire-after-render idiom includes/owner_dashboard.js uses for its
    // dynamically rendered rows/cards.
    // ------------------------------------------------------------------
    function wireBookNowButtons(scope) {
        scope.querySelectorAll('[data-dash-book-court]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const court = btn.dataset.dashBookCourt;
                const rateRaw = btn.dataset.dashBookRate;
                const rate = rateRaw ? Number(rateRaw) : null;

                if (bookSelect) bookSelect.value = court;
                bookingState.court = court;
                // Setting bookSelect.value above does NOT fire its `change`
                // listener, so sport (like rate/rateUnit already did) has
                // to be carried by this button's own data attribute too —
                // see renderCourtCard()'s data-dash-book-sport below.
                bookingState.sport = btn.dataset.dashBookSport || court;
                bookingState.rate = (rate !== null && !Number.isNaN(rate)) ? rate : null;
                bookingState.rateUnit = btn.dataset.dashBookRateUnit || '/hr';

                slots.forEach((s) => s.classList.remove('is-selected'));
                bookingState.time = null;
                updateSummary();
                setActivePanel('booking');
            });
        });
    }

    // ------------------------------------------------------------------
    // Court data — Court Information's cards and the Booking Management
    // court <select> are rendered from the SAME fetch
    // (window.InigoCourtsData.getCourts(), memoized), so the two panels can
    // never disagree about which courts exist or what they cost. Every
    // interpolated field is escaped — a court named
    // `<img src=x onerror=alert(1)>` (staff/admin can write `court` rows,
    // see database/schema/002_content_tables.sql's RLS policies) must
    // render as literal text here, not run.
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

    function renderCourtCard(court) {
        const isAvailable = String(court.status || '').toLowerCase() === 'available';
        const statusClass = isAvailable ? 'confirmed' : 'cancelled';
        const monogram = window.InigoCourtsData ? window.InigoCourtsData.monogramFor(court.sportSlug, court.name) : '?';
        const media = court.imageUrl
            ? `<img src="${window.escapeHtml(court.imageUrl)}" alt="${window.escapeHtml(court.name)}" loading="lazy">`
            : `<span class="dash-court-monogram" aria-hidden="true">${window.escapeHtml(monogram)}</span>`;
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
        const bookBtn = isAvailable
            ? `<button type="button" class="dash-btn-primary" data-dash-book-court="${window.escapeHtml(court.name)}" data-dash-book-rate="${court.rate !== null ? window.escapeHtml(String(court.rate)) : ''}" data-dash-book-rate-unit="${window.escapeHtml(court.rateUnit)}" data-dash-book-sport="${window.escapeHtml(court.sportName || court.name)}">Book Now</button>`
            : '<button type="button" class="dash-btn-primary" disabled>Book Now</button>';

        return `
            <article class="dash-court-card">
                <div class="dash-court-media">
                    ${media}
                    <span class="dash-status ${statusClass}">${window.escapeHtml(court.status || 'Unavailable')}</span>
                </div>
                <div class="dash-court-body">
                    <h3>${window.escapeHtml(court.name)}</h3>
                    ${ratingHtml}
                    <div class="dash-court-rate">${rateHtml}</div>
                    <div class="dash-court-tags">${tagsHtml}</div>
                    <div class="dash-court-actions">
                        ${bookBtn}
                    </div>
                </div>
            </article>
        `;
    }

    function renderCourtGrid(courts) {
        if (!courtGrid) return;
        courtGrid.innerHTML = courts.length
            ? courts.map(renderCourtCard).join('')
            : '<p style="color: var(--color-ink-faint); padding: 8px 4px;">No courts available right now.</p>';
        wireBookNowButtons(courtGrid);
    }

    // Replaces the "Loading courts…" placeholder <option> with one real
    // option per court, then re-derives bookingState from whichever one
    // ends up selected (the first, by default) instead of the placeholder.
    function populateBookSelect(courts) {
        if (!bookSelect) return;
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
        updateSummary();
    }

    if (window.InigoCourtsData) {
        window.InigoCourtsData.getCourts().then((courts) => {
            renderCourtGrid(courts);
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
            const rate = getCourtRate(booking.courts);
            const amount = rate !== null ? `₱${rate.toFixed(2)}` : '—';
            const row = document.createElement('tr');
            // courts/status are DB content (courts is free text on the
            // booking row; status could in principle be a raw value if RLS
            // were ever bypassed) — escaped before touching innerHTML so
            // this renders as literal text in the customer's own session
            // instead of running, same as the staff/admin tables.
            const statusRaw = booking.status || '';
            const courtLabel = window.escapeHtml(booking.courts || '');
            const statusClass = window.escapeHtml(statusRaw);
            const statusLabel = window.escapeHtml(statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1));
            row.innerHTML = `
                <td class="dash-cell-main">${courtLabel}</td>
                <td>${formatBookingDate(booking.time_date)}</td>
                <td>${formatBookingTime(booking.time_date)}</td>
                <td>${amount}</td>
                <td><span class="dash-status ${statusClass}">${statusLabel}</span></td>
                <td>
                    <div class="dash-table-actions">
                        ${['pending', 'confirmed'].includes(booking.status)
                            ? `<button type="button" class="dash-mini-btn is-danger" data-dash-cancel-booking="${window.escapeHtml(booking.booking_id)}">Cancel</button>`
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
            // Digits-only on load too, matching the field's own [data-digits-only]
            // contract (increment 13). Both write paths (signup and this panel's
            // own Save below) already run contact_num through
            // window.validatePhMobile first, whose `normalized` is always the
            // spaceless local 09XXXXXXXXX form — so this is a defensive strip for
            // any value that got into the database another way, not a fix for
            // anything either write path produces today.
            if (inputs[2]) inputs[2].value = digitsOnly(profile.contact_num).slice(0, 11);
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
            const inputs = settingsPanel.querySelectorAll('.dash-settings-grid .dash-input');
            const full_name = inputs[0]?.value.trim();

            // PH mobile validation (spec: Account Settings must validate
            // updates to the registered mobile number). Normalized to the
            // local 09XXXXXXXXX form regardless of which accepted format
            // was typed, so contact_num is always stored one consistent way.
            const mobileCheck = window.validatePhMobile(inputs[2]?.value || '');
            if (!mobileCheck.valid) {
                window.InigoToast?.show(mobileCheck.message, true);
                return;
            }
            const contact_num = mobileCheck.normalized;

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
            if (!window.sb || !window.inigosyncProfile) return;
            const settingsPanel = document.querySelector('[data-dash-panel="settings"]');
            const passwordInputs = settingsPanel.querySelectorAll('.dash-form-group input[type="password"]');
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
                return;
            }

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

    // ------------------------------------------------------------------
    // Account Settings — Cancel buttons (previously unwired: clicking them
    // did nothing). Discards in-progress edits back to the last-saved
    // values instead of leaving a button that has no effect.
    // ------------------------------------------------------------------
    document.querySelectorAll('[data-dash-settings-cancel]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.dashSettingsCancel;
            if (mode === 'profile') {
                if (window.inigosyncProfile) renderProfile(window.inigosyncProfile);
            } else if (mode === 'password') {
                const settingsPanel = document.querySelector('[data-dash-panel="settings"]');
                settingsPanel?.querySelectorAll('.dash-form-group input[type="password"]').forEach((input) => {
                    input.value = '';
                });
            }
        });
    });
});