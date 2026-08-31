# Customer Dashboard Overview — replace Calendar/Live Availability with a sortable Court + Slot Peek widget, add site footer

## Goal

On the Customer dashboard ([Pages/user_dashboard.html](Pages/user_dashboard.html))
Overview panel, remove the static "Calendar" and "Live availability" cards and
replace them with one real, data-backed widget: a court list sortable by
**sport type** that lets the customer peek today's available/booked time
slots for any court without leaving the Overview tab, and jump straight into
the Booking panel from an open slot. Additionally, add the same site footer
already used on the landing page to the bottom of the dashboard shell, so it
appears on every dashboard tab. This is a data-wiring + new-feature pass on
the Overview panel only — the separate "Courts" nav panel (full court grid)
is untouched.

## Context and current state

Verified by direct read of the live files today (2026-08-31):

- [Pages/user_dashboard.html:277-357](Pages/user_dashboard.html:277) — the
  Overview panel's right-hand column of `.dash-grid-2` holds two cards: a
  "Calendar" (`.dash-cal*`, a fully static July-2026 month grid with
  hardcoded `has-booking` dots) and a "Live availability" list
  (`.dash-avail-list`, 4 hardcoded rows: "Basketball — Available 2–3 PM",
  "Badminton 1 — Booked until 4 PM", etc.). Neither reads real data.
- [includes/Dashboard.js:214-242](includes/Dashboard.js:214) — the only JS
  behind those two cards: month-label cycling (`calPrev`/`calNext`) and a
  click-to-highlight day, both UI-only, no data. No JS touches
  `.dash-avail-*` at all — it's inert markup.
- `.dash-cal*` and `.dash-avail-*` classes ([Style/Dashboard.css:585-731](Style/Dashboard.css:585))
  are used **only** on this one Overview panel (confirmed by grep across
  `Pages/*.html`, `includes/*.js`, `Style/*.css`) — safe to remove/repurpose
  without touching any other page.
- The real "court viewing feature" the user likes is the **Courts nav panel**
  ([Pages/user_dashboard.html:364-386](Pages/user_dashboard.html:364)),
  rendered by `renderCourtGrid()`/`renderCourtCard()` in
  [includes/Dashboard.js:548-601](includes/Dashboard.js:548) from
  `window.InigoCourtsData.getCourts()` — real `court`/`sport` table data
  (name, sport, rate, status, rating), no fabricated fields. This plan reuses
  that same data source; it does not add a second court list.
- There is **no real per-slot availability anywhere yet**. The Booking
  panel's time-slot grid (`[data-dash-slot]`,
  [Pages/user_dashboard.html:420-433](Pages/user_dashboard.html:420)) is
  static placeholder markup — some slots hardcoded `is-unavailable` — not
  derived from the `booking` table (confirmed by reading
  [includes/Dashboard.js:352-359](includes/Dashboard.js:352), which just
  wires clicks, and the comment at
  [includes/Dashboard.js:252-255](includes/Dashboard.js:252) stating "real
  per-slot availability... [is] a later phase").
- A real, working precedent for computing per-slot occupancy from the actual
  `booking` + `walk_in_booking` tables already exists: the Staff dashboard's
  Court Schedule grid,
  [includes/staff_dashboard.js:809-950](includes/staff_dashboard.js:809). It
  queries both tables for a date range, builds fixed hourly/2-hourly slot
  windows, and marks a slot occupied if `[booking.start, booking.start +
  duration_minutes)` overlaps the slot window (`windowsOverlap`,
  `bookingWindow`, `slotWindow`). This plan's slot-peek reuses that exact
  overlap algorithm, adapted to hourly granularity (to match the Booking
  panel's own hourly slot list) and scoped to "today" only (same scope the
  Staff Court Schedule already uses — no new calendar/date-picker UI is
  introduced, consistent with the user's request to remove calendar UI, not
  add a different one).
- **Known, standing, documented risk** (already called out by the project
  itself, not new to this plan): `booking` and `walk_in_booking`'s RLS
  policies were **not created by this repo's migrations** — they were set up
  directly in the live Supabase project before schema tracking started, and
  are "not visible to this migration" (see
  [database/schema/004_staff_module.sql:22-27](database/schema/004_staff_module.sql:22)).
  It is not confirmed whether the `customer` role can SELECT booking rows
  belonging to *other* customers. Staff's Court Schedule works today only
  because staff apparently has (or the table has) broad-enough SELECT access
  for that role — that says nothing about the `customer` role.
  **Mitigation built into this plan** (see Approach, item 3): the peek query
  selects only the minimal columns needed (`courts, time_date,
  duration_minutes, status`) — never another customer's name/contact — and
  the UI fails safe: if the query errors or the result looks suspiciously
  empty in a way the code can detect as an error (not just "nothing booked
  today"), the widget shows an honest "Live slot status unavailable right
  now" note instead of ever asserting a slot is open when it might not be.
  This is a UI feature addition, not a schema change — no RLS policy is
  modified by this task.

## Approach and architectural decisions

1. **Markup**: In [Pages/user_dashboard.html](Pages/user_dashboard.html),
   delete the "Calendar" card
   ([Pages/user_dashboard.html:278-332](Pages/user_dashboard.html:278)) and
   the "Live availability" card
   ([Pages/user_dashboard.html:334-356](Pages/user_dashboard.html:334)).
   Replace both with a single new `.dash-card` in the same column slot,
   titled "Courts" (or "Court availability"), containing:
   - A card head with the title and a `<select class="dash-select"
     data-dash-overview-sort>` sort control (small width) — options: **Sport
     (A–Z)** (default — groups courts by their real `sportName`, courts
     within the same sport secondarily ordered by name, e.g. "Bowling —
     Duckpin" before "Bowling — Ten-Pin"), **Available first**, and **Price:
     Low to High**. Per the user's correction, sorting is centered on
     **sport type**, not plain court name — there is no separate "Name
     (A–Z)" option.
   - A compact court list (`[data-dash-overview-court-list]`), one row per
     court (reusing/repurposing the existing `.dash-avail-row` /
     `.dash-avail-name` / `.dot` classes, which are otherwise dead after the
     Live-availability card is removed — no new CSS needed for the row
     shell). Each row shows: status dot (available/unavailable, from the
     court's real `status`), court name + sport, rate (or "Rate TBA"), and a
     "Peek slots" toggle.
   - Toggling a row expands an inline strip of small pills — one per hourly
     slot, 8 AM–8 PM — styled as a compact variant of the existing
     `.dash-slot` class (new `.dash-slot-mini` modifier for smaller
     padding/font, sharing the same open/booked/selected color logic). Open
     slots are clickable.
   - Clicking an **open** slot pill jumps to the Booking panel with that
     court + today's date + that time slot pre-filled (same hand-off pattern
     `wireBookNowButtons()` already uses for "Book Now"), so the peek is
     genuinely "for easy access," not just a read-only preview.
   - A small footer link ("View all courts") reusing `.dash-link-btn`,
     `data-dash-nav="courts"`, matching the "Upcoming reservations" card's
     existing "View all" pattern.
   - A11y: the sort `<select>` gets a visually-hidden `<label>`; peek toggle
     buttons get `aria-expanded`.

2. **Delete dead JS**: remove the calendar month-cycling block in
   [includes/Dashboard.js:214-242](includes/Dashboard.js:214) (`calLabel`,
   `calPrev`, `calNext`, `months`, `calMonthIndex`, `renderCalLabel`, the
   `.dash-cal-day` click wiring) — nothing else in the file references these
   variables.

3. **New JS module** in `includes/Dashboard.js`, placed after the existing
   Court Information / Booking Management block (so it can reuse
   `window.InigoCourtsData.getCourts()`, `bookingState`, `setActivePanel`,
   `updateSummary`, `slots`, and `wireBookNowButtons`'s hand-off pattern
   already defined above it):
   - `todayRange()` — same 2-line helper as
     [includes/staff_dashboard.js:143-148](includes/staff_dashboard.js:143).
   - `OVERVIEW_SLOT_HOURS = [8,9,10,11,12,13,14,15,16,17,18,19,20]` (hourly,
     8 AM–8 PM inclusive of the 8 PM start), independent of the Booking
     panel's static markup's slightly irregular hour list.
   - `refreshOverviewCourtWidget()`:
     - `Promise.all([window.InigoCourtsData.getCourts(), sb.from('booking').select('courts, time_date, duration_minutes, status').gte(...).lt(...), sb.from('walk_in_booking').select('courts, time_date, duration_minutes').gte(...).lt(...)])`.
     - On either query erroring, set a `bookingDataOk = false` flag; slot
       peeks render with the fail-safe "Live slot status unavailable" note
       instead of pills, per the risk mitigation above. Court rows (name,
       rate, status dot) still render either way — only the *peek* is
       gated, since court status/rate is unrelated to the RLS risk.
     - Sort the court array per current `sortMode` state (`sport` default —
       `court.sportName.localeCompare(...)` then `court.name.localeCompare(...)`
       as tiebreaker, `available`, `price`) before rendering rows.
     - Render rows + wire: sort-select `change`, row/toggle `click`
       (expand/collapse + lazy-render that court's slot strip from the
       already-fetched booking/walk-in arrays — no extra query per toggle),
       and open-pill `click` → set `bookingState` fields + `setActivePanel('booking')` + `updateSummary()`.
   - Called once at load and again on `document.addEventListener('inigosync:profile-ready', refreshOverviewCourtWidget)`, matching the existing re-fetch-on-profile-ready idiom used elsewhere in this file and in `staff_dashboard.js`.
   - Every interpolated string (`court.name`, `court.sportName`, etc.) goes
     through the existing global `window.escapeHtml`, matching every other
     render function in this file.

4. **CSS**: in [Style/Dashboard.css](Style/Dashboard.css), delete the
   `.dash-cal*` block (lines 585–682, confirmed unused anywhere else). Keep
   `.dash-avail-list/-row/-name/-time` and `.dot.available/.booked` (now
   repurposed for the court list rows). Add: `.dash-slot-mini` (compact pill
   modifier), a small strip container class for the expanded peek row, and
   minimal styling for the sort `<select>` sitting in a `.dash-card-head`
   (flex already supports an extra inline control there — verified against
   [Style/Dashboard.css:549-554](Style/Dashboard.css:549)).

5. **Dashboard footer, reused verbatim from the landing page**: add a
   `<footer class="site-footer">` at the bottom of the dashboard shell,
   copying the exact markup/content of
   [Pages/Index.html:227-276](Pages/Index.html:227) (brand block, "Visit
   us"/"Contact"/"Follow" cards, embedded map) into
   [Pages/user_dashboard.html](Pages/user_dashboard.html) — same real
   contact details/socials/map, not a placeholder. No new CSS is needed: the
   `.site-footer`/`.footer-*`/`.section-inner` classes already live in
   [Style/LandingPage.css:1495-1621](Style/LandingPage.css:1495), and
   `user_dashboard.html` already `<link>`s `LandingPage.css`
   ([Pages/user_dashboard.html:24](Pages/user_dashboard.html:24)).
   Placement: as a sibling **after** `</main class="dash-content">`, still
   inside `.dash-main` (so it sits below whichever panel is active and is
   never itself hidden by the `.dash-panel`/`.is-active` toggle — it should
   render on every tab, the same way a site footer always renders regardless
   of which page section you're viewing). `.dash-shell`'s sidebar is
   `position: sticky; height: 100vh` inside a two-column CSS grid
   ([Style/Dashboard.css:11-28](Style/Dashboard.css:11)), not `position:
   fixed`, so appending a full-width block after `.dash-content` extends the
   grid row height and scrolls naturally with the page — confirmed no layout
   change needed for this to work.

## Constraints and non-goals

- Do not touch the "Courts" nav panel (`data-dash-panel="courts"`) or its
  existing `renderCourtGrid`/`renderCourtCard` — this task only replaces the
  Overview panel's Calendar + Live availability cards.
- Do not touch the Staff or Owner dashboards.
- Do not add or modify any RLS policy, migration, or schema file. If the
  Coder finds during verification that the customer role's `booking` SELECT
  is actually restricted to own rows (making the peek silently show
  everything as open), the correct fix is the fail-safe/honest-degradation
  behavior described above — **not** a schema change, and not fabricating
  slot data.
- No new date picker / calendar UI is introduced — the peek is scoped to
  "today," consistent with removing calendar UI per the user's request and
  with the existing Staff Court Schedule precedent.
- Keep using `window.escapeHtml` on every interpolated value; keep the
  fetch-with-fallback / graceful-degradation conventions already used
  throughout this file (`window.InigoCourtsData`, `window.InigoAppSettings`).
- No unrelated refactors of Dashboard.js.

## Success criteria

- Loading the Customer dashboard's Overview panel shows no "Calendar" card
  and no "Live availability" card anywhere in the DOM.
- In their place is one card listing real courts (from `window.InigoCourtsData`),
  sortable by **Sport (A–Z)**, **Available first**, and **Price (Low to
  High)** via a working `<select>` — sport is the primary/default sort, not
  plain court name.
- Clicking a court row's peek toggle reveals today's hourly slots for that
  specific court, correctly marked open/booked using real `booking` +
  `walk_in_booking` rows and the same overlap logic as the Staff Court
  Schedule (a slot the Staff Court Schedule shows booked for a given
  court/hour today must also show booked here for the same court/hour).
- Clicking an open slot pill switches to the Book a Court panel with that
  court, today's date, and that time slot already selected/highlighted, and
  the Booking Summary reflects it immediately.
- If the booking/walk-in query fails, the widget still shows the court list
  (name/rate/status) but shows an honest unavailable-data note instead of
  fabricated slot pills — never shows a slot as open when the data couldn't
  be verified.
- No references to `dash-cal`/`dash-avail-*`(old inert usage)/`calMonthIndex`
  etc. remain as dead code; `.dash-cal*` CSS is removed.
- No console errors on load; existing Overview features (hero carousel,
  Upcoming reservations card, quick actions) still work unchanged.
- A site footer (brand, Visit us / Contact / Follow, embedded map — same
  content as the landing page's) renders at the bottom of the dashboard on
  every tab, styled identically to [Pages/Index.html](Pages/Index.html)'s
  footer, with no layout breakage in the sidebar/topbar/panels above it.

## Verification steps

1. Static review: grep confirms no leftover `dash-cal-*` selectors/handlers
   and no leftover hardcoded "Basketball — Available 2–3 PM" style strings.
2. Run the app (open `Pages/user_dashboard.html` via the project's normal
   local flow) logged in as a customer test account; visually confirm the
   new card renders in place of Calendar/Live availability, sorting changes
   row order live, peeking a court shows a plausible slot strip, and clicking
   an open slot navigates to Booking with fields pre-filled.
3. Cross-check at least one court/hour against the Staff dashboard's Court
   Schedule for the same day to confirm open/booked agreement.
4. Confirm the Courts nav panel and Booking panel are visually/functionally
   unchanged.
5. Confirm the footer renders correctly on at least two different nav tabs
   (e.g. Overview and My Bookings) and that its links (`tel:`, `mailto:`,
   Facebook, embedded map) match the landing page's exactly, and that it
   doesn't overlap or get clipped by the sticky sidebar/topbar.

## Open questions and risks

- **RLS on `booking`/`walk_in_booking` for the `customer` role is unverified**
  (documented pre-existing risk, not introduced by this task — see Context).
  The Coder should note in its handoff whether the peek query succeeded with
  plausible data during manual testing, or hit the fail-safe path, so this
  can be tracked as a follow-up if the fail-safe path is what's actually
  happening in production.
- Slot granularity: this plan uses hourly slots (8 AM–8 PM) for the peek,
  independent of the Booking panel's own static slot list (which currently
  skips 12 PM and is not real data either). If the Booking panel's slots are
  made real in a future phase, both should be reconciled to the same slot
  source — out of scope here.
