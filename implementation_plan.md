# Customer Page Redesign — InigoSync_Dashboard_Feedback_v6

## Goal

Implement all 9 sections of `InigoSync_Dashboard_Feedback_v6.md` on the
Customer page (`Pages/user_dashboard.html` + `includes/Dashboard.js` +
`Style/Dashboard.css`), including the two Supabase schema additions the
feedback implies. The through-line of the document is **accessibility for
older, non-tech-savvy users**: fewer things on screen at once, guided
step-by-step flows, bigger obvious buttons, and clearer visual grouping.

## Context and current state

Verified by direct read today. PR #1 (sortable court + slot-peek widget,
site footer) is merged into this branch's history and is the starting point.

**Nav (`Pages/user_dashboard.html:44-99`)** — currently 7 links: Dashboard,
Courts, Book a Court, My Bookings, Receipts, *divider*, Profile, Account
Settings, plus **Log Out** in `.dash-sidebar-foot`. The target list is 5.
Critically, **Log Out already exists in the topbar avatar dropdown**
(`:156-159`, `data-dash-logout`, wired by `includes/authGuard.js`), so
removing it from the sidebar loses no functionality.

**Courts** — exists twice today: the standalone `data-dash-panel="courts"`
card grid (`:311-333`, `renderCourtCard()` in `includes/Dashboard.js:548`)
and the new Overview peek widget (PR #1). §4 of the feedback puts Courts
*inside* the Dashboard content area, so these two collapse into one.

**A large, directly reusable asset**: the landing page already solves §4's
combo-box + per-court-imagery requirement. `database/schema/006_court_unit_images.sql`
adds `court.unit_images` (a `jsonb` array of `{label, image_url}`, one entry
per individual court/lane/table), and `includes/landingPage.js`'s
`resolveCourtUnits()` (`:336`) + court-viewer dialog (`Pages/Index.html:301-330`)
already render a per-sport `<select>` of "Court 1…Court 9" with a photo that
swaps per selection, degrading to a "Photo coming soon" placeholder when a
unit has no image. **§4 and §5's "dynamic court preview" are the same
mechanism**, so both reuse `resolveCourtUnits()`'s logic rather than
inventing a second one.

**Notifications** (`:132-135`) — a bell icon with a static red dot and **no
click handler and no data source at all**. No `notification` table exists in
`database/schema/`.

**Feedback** — does not exist anywhere. No table, no UI.

**My Bookings** (`:440-541`) — has the 5 status filter chips §6 asks to
delete. The chips are cosmetic-only today (`includes/Dashboard.js:204-212`
just toggles `.is-active` with a `TODO: filter … once real data exists`), so
removing them deletes no working behavior. Rows are real
(`refreshMyBookings()`).

**Receipts** (`:546-560`) — honestly empty (`includes/Dashboard.js:1103-1108`
renders "No receipts yet"). No download anything.

**Account Settings** (`:626-707`) — one "Full name" box; a Change Password
card showing **all three password fields at once**. §9's mobile-number
requirement (**digits only, letters/symbols blocked**) is *already fully
implemented* — `[data-digits-only]` with keystroke+paste filtering
(`includes/Dashboard.js:1217`), `inputmode="numeric"`, `maxlength="11"`,
plus `window.validatePhMobile` on save. **No work needed for that bullet**;
it will be verified, not rebuilt.

**`profiles` has no schema file in this repo** and its real columns are
unconfirmed (a standing, documented risk). Everything today reads/writes
`full_name` — including the **owner and staff dashboards**
(`includes/owner_dashboard.js` updates `{ full_name, position }`). This
constrains §9's name-splitting decision (see D3).

## Approach and architectural decisions

**D1 — Nav trimmed to 5; Courts and Profile stop being *nav items*, not
features.** Sidebar becomes exactly Dashboard / Book a Court / My Bookings /
Receipt / Account Settings, and Log Out leaves the sidebar (still in the
avatar dropdown). The **Courts panel is deleted outright**, its rich card
grid moving into the Dashboard panel per §4. The **Profile panel is kept but
delisted** — still reachable via the dropdown's existing "View Profile", so
the nav matches the spec without destroying a working screen. `panelMeta`
and the `courts` panel's `data-dash-nav="courts"` deep-links (the Overview
"View all courts" button from PR #1, and `renderCourtCard`'s hand-off) are
repointed accordingly.

**D2 — One court component, three requirements.** The Dashboard's Courts
section is rebuilt as sport-grouped sections (§4 "visual segregation"): a
heading per sport, then that sport's court cards. Each card gets (a) a
`<select>` of its individual units built by a **shared `resolveCourtUnits()`
port** from `landingPage.js`, (b) an image that swaps to the selected unit's
`image_url` — falling back to the sport image, then to the existing
"Photo coming soon" placeholder — and (c) the **existing peek-slots strip,
kept as-is** per §4's "Pixlot Integration" bullet. To avoid a third copy of
this logic, the port lands in **`includes/courtsData.js`** (already the
shared court data layer loaded by every dashboard) as
`window.InigoCourtsData.resolveCourtUnits(court)`, and `landingPage.js` is
left untouched this pass to avoid regressing the shipped landing page.

**D3 — Name split without breaking the other two dashboards.** New migration
adds `first_name` / `middle_name` / `last_name` to `profiles`. Because owner
and staff dashboards still read `full_name`, Save writes **both**: the three
parts *and* a composed `full_name` ("First Middle Last", collapsed
whitespace), keeping `full_name` the compatibility field. Load prefers the
three columns and falls back to **parsing `full_name`** (first token → first,
last token → surname, remainder → middle) when they're absent — so the three
boxes are populated correctly *before* the migration is applied, and the page
never hard-depends on it. Same fetch-with-fallback shape used throughout.

**D4 — Password change becomes a 2-step wizard** (§9): Step 1 current
password + **Next** (disabled until non-empty); Step 2 new + confirm, with
**Go Back** and **Save Password**. The existing, genuinely-secure save logic
is preserved unchanged — it re-verifies via
`sb.auth.signInWithPassword()` before `updateUser()`
(`includes/Dashboard.js:1320-1324`); only the presentation is re-staged.

**D5 — Book a Court becomes a 3-step wizard** (§5) reusing the existing
`bookingState` + `updateSummary()` + insert logic rather than rewriting it.
Step 1 Sport → Court (+ the D2 unit `<select>` and dynamic preview image),
Step 2 Date → Time slot, Step 3 Confirm (payment option, summary, submit).
A progress indicator, one step visible at a time, **Back**/**Next** with
Next gated on that step's required field. PR #1's peek-slot hand-off
(`jumpToBookingFromPeekSlot`) is updated to land the user on **Step 3** with
everything pre-filled, since it already supplies court + date + time.

**D6 — Notifications derive from the customer's own real bookings; no
`notification` table.** The bell opens a dropdown (same click-outside/Escape
pattern as the existing `[data-dash-profile]` menu) listing at most **10**
items built from `booking` rows the page already fetches — upcoming
reservations, plus cancelled/completed status alerts — newest first, with an
empty state. **Rationale:** a `notification` table would need a writer
(trigger or backend) to ever contain anything; nothing in this project writes
one today, so it would ship guaranteed-empty. Deriving from bookings makes
the dropdown genuinely useful immediately, needs no schema, and avoids adding
a trigger to `booking`, whose RLS this repo cannot see
(`database/schema/004_staff_module.sql:22-41`). The unread dot only shows
when there is ≥1 item.

**D7 — Feedback: new table + two entry points.** New `feedback` migration
(id, profile_id → profiles, rating smallint 1-5 nullable, message text not
null, created_at) with RLS: a customer may INSERT their own row and SELECT
only their own; staff/admin may SELECT all, reusing the existing
`public.inigosync_is_staff_or_admin()` helper from `002_content_tables.sql`.
UI: one shared modal, opened from a **sidebar card** ("How are we doing? Let
us know!" + "Give Feedback") on desktop/tablet, and from a **prominent
button inside the mobile nav** — one modal, two triggers, per §2. Fails
honestly with a toast if the table isn't migrated yet.

**D8 — Receipt PNG via `html2canvas` from CDN.** Matches the project's
no-build-step, `<script src>` convention (same as the supabase-js CDN tag).
Each receipt card gets a **Download** button that rasterizes that card to
PNG via `canvas.toBlob()` + an `<a download>` click, which works on desktop,
Android and iOS Safari. The panel keeps its honest empty state until real
receipts exist; the card is built to render from a real booking/payment row
so it lights up automatically once payments land.

**D9 — Compact footer, changed in one place.** `.site-footer` and `.footer-*`
live in `Style/LandingPage.css:1495-1621` and are **shared by the landing
page and the dashboard**, so reducing padding/font/logo/map sizes and
collapsing the 3 cards into a tighter row there satisfies §8's "global
application" for both pages at once, with **zero content removed** (§8
explicitly keeps all links). Nothing is duplicated into `Dashboard.css`.

## Files to change

- `Pages/user_dashboard.html` — nav trim; feedback card+button; notification
  dropdown markup; Courts moved into Dashboard panel & standalone panel
  deleted; booking wizard steps; My Bookings chips removed; receipt card +
  Download; Account Settings name fields + password wizard.
- `includes/Dashboard.js` — panel/nav wiring, court grouping + unit select +
  dynamic image, wizard state machine, notifications, feedback submit,
  receipt PNG, settings name load/save, password wizard.
- `includes/courtsData.js` — add shared `resolveCourtUnits()`.
- `Style/Dashboard.css` — sport group headers, wizard steps/stepper,
  notification & feedback UI, receipt card.
- `Style/LandingPage.css` — compact footer only.
- `database/schema/008_profile_name_parts.sql` — **new**.
- `database/schema/009_feedback.sql` — **new**.

## Constraints and non-goals

- **Do not touch** `Pages/staff_dashboard.html`, `Pages/owner_dashboard.html`,
  `includes/staff_dashboard.js`, `includes/owner_dashboard.js`, or
  `includes/landingPage.js`. `full_name` must keep working for them (D3).
- Do not delete the peek-slots feature (§4 explicitly keeps it).
- Do not remove any footer content — §8 is layout/sizing only.
- Keep `window.escapeHtml` on every interpolated value; keep the
  fetch-with-fallback / honest-empty-state conventions already used
  throughout. Never fabricate a receipt, notification, or availability.
- Migrations are **written as files, not applied** — this environment has no
  Supabase admin access. Every feature must degrade honestly until the owner
  runs them (D3 falls back to parsing `full_name`; D7 shows a toast).
- No build step; CDN `<script>` tags only.

## Success criteria

1. Sidebar shows exactly Dashboard, Book a Court, My Bookings, Receipt,
   Account Settings — no Logout, no Courts, no Profile — and logout still
   works from the avatar dropdown.
2. Feedback is reachable on mobile (button in nav) and desktop (sidebar
   card); submitting inserts a `feedback` row, or toasts honestly if the
   table is missing.
3. Bell opens a dropdown of ≤10 real alerts, closes on outside-click/Escape,
   and never navigates away.
4. Dashboard Courts are visually grouped per sport, each card has a working
   unit combo box whose selection swaps the displayed photo, and peek-slots
   still works.
5. Book a Court shows **one step at a time** with Back/Next, a court preview
   image that updates on selection, and still creates the same valid
   `booking` row; peek-slot hand-off lands on the confirm step pre-filled.
6. My Bookings has no status filter chips; the table is otherwise unchanged.
7. A receipt card downloads as a **.PNG** on desktop and mobile.
8. Footer is visibly shorter on both the dashboard and the landing page with
   all original links/content intact.
9. Account Settings has First/Middle/Surname boxes that round-trip correctly
   (incl. before migration, via `full_name` parsing) and keep `full_name` in
   sync; mobile still blocks non-digits; password change is a 2-step wizard
   that still re-verifies the current password before updating.
10. No console errors; `node --check includes/Dashboard.js` passes.

## Verification steps

1. `node --check` on every edited JS file.
2. Grep that no dead references remain to the removed Courts panel/chips.
3. Serve locally (`py -m http.server`) and click through as a customer:
   each nav item, feedback both breakpoints (resize to mobile), bell
   dropdown, court unit select + image swap, full 3-step booking, receipt
   download producing a real PNG, and the password wizard.
4. Confirm the landing page's footer still renders correctly after the
   shared-CSS change, and that the staff/owner dashboards are untouched.

## Open questions and risks

- **"Pixlot Integration" (§4) is read as "peek slot"** — the feature shipped
  in PR #1, which the user explicitly praised ("I like the court viewing
  feature that are capable also to peek if there is available slots").
  Treated as "keep it unchanged". Flagged for confirmation.
- **§6 removes status *filters*, not the Status column.** "Retain the current
  overall visual display" is read as keeping the column, since Cancelled /
  Completed remain real states even with PayMongo automation. Flagged.
- **PayMongo is referenced (§6) but not integrated** in this repo. This pass
  does not add payment processing; the receipt is built to populate from real
  payment rows once that exists.
- Two migrations require the owner to run them in the Supabase SQL editor.
  Until then: name parts fall back to parsing `full_name`, and feedback
  submission toasts an honest error.
