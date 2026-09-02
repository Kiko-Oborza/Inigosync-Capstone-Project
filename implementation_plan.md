# Customer Page — Revision 2 (post-feedback-v6 corrections)

## Goal

Five corrections to the customer page after reviewing the v6 redesign:
sport-based sorting on the Dashboard courts section, **re-scoping that
section to marketing rather than booking**, removing cancellation from My
Bookings and replacing it with the real no-cancellation / no-refund /
auto-"Unattended" policy, making Receipts show a downloadable receipt for
every booking made, and a **responsive audit/fix pass across the whole
page**.

## Context and current state

Verified by direct read today against commit `8ac0bb9`.

- **Courts sort** (`Pages/user_dashboard.html:379-382`) — the dropdown
  currently offers only `Available first` and `Price: Low to High`. The
  earlier `Sport (A–Z)` option was dropped in Phase 1 on the reasoning that
  per-sport grouping made it redundant. The user has now explicitly asked
  for sorting **by sports**, so that reasoning is overruled.
- **Courts still contains booking affordances**, which is the core of this
  revision: `wireBookNowButtons()` (`includes/Dashboard.js:953`) renders a
  **"Book Now"** button on every court card, and `jumpToBookingFromPeekSlot()`
  (`:1066`) makes every open peek-slot pill a click-to-book control that
  jumps into the Book a Court wizard at Step 3. The user's instruction is
  that this section is **marketing/showcase only** — booking has its own
  designated panel.
- **My Bookings has Cancel buttons** in two places: the static demo rows
  (`Pages/user_dashboard.html:626,639,652`) and, more importantly, the live
  renderer (`includes/Dashboard.js:1708`, `data-dash-cancel-booking`).
- **Two stale policy notices** state a cancellation policy that contradicts
  the real rule: `Pages/user_dashboard.html:542` (booking wizard) and `:600`
  (My Bookings) both say bookings "are cancelled" and are "non-refundable".
- **`booking.status` cannot store `'unattended'` today.** A documented CHECK
  constraint permits only `'pending' | 'confirmed' | 'cancelled' |
  'completed'` — violating it fails with Postgres code `23514` (see the
  detailed comment block at `includes/Dashboard.js:~859` and its `23514`
  error branch). `database/schema/004_staff_module.sql` also adds
  `checked_in_at`, which is exactly the "did they show up?" signal needed
  here.
- **Receipts is hardcoded to an empty state** — `RECEIPT_EMPTY_HTML`
  (`includes/Dashboard.js:1754`) always renders "No receipts yet"; the
  html2canvas → `toBlob()` → `<a download>` PNG path
  (`downloadReceiptAsPng()`, `:1808`) already exists and works but currently
  has nothing to act on.
- **Responsive coverage is thin**: only 5 `@media` blocks in
  `Style/Dashboard.css` (420 / 620 / 640 / 860 / 1080px), and the newest
  UI from the v6 pass (booking wizard steps, receipt cards, court cards with
  unit combo boxes, notification/feedback popovers, the wide
  `.dash-table`) was largely added without matching breakpoints.

## Approach and architectural decisions

**R1 — Courts section becomes marketing-only.** Remove **"Book Now"**
(`wireBookNowButtons()` and its `data-dash-book-court` markup) and remove the
**click-to-book hand-off** from peek slots (`jumpToBookingFromPeekSlot()`).
**Peek slots is retained as a read-only availability display** — it shows
open/booked hours but no longer navigates anywhere. Rationale: the user
praised this feature specifically and §4 of the v6 spec said keep it; showing
"here's how free our courts are" is showcase information, whereas *acting* on
a slot is booking, which now belongs solely to the Book a Court panel. The
booking wizard's own Step-1 court picker is unaffected. **Flagged for
confirmation** — if the user wants peek gone entirely, it is a small
follow-up deletion.

**R2 — Sort by sport, restored as the primary control.** The dropdown regains
a sport-based option as its **default**, ordering the per-sport groups
alphabetically, with `Available first` and `Price: Low to High` retained as
alternatives that sort courts *within* each sport group (grouping always
stays on, so the two concerns compose rather than conflict).

**R3 — No cancellation anywhere.** Delete the Cancel buttons from both the
static rows and the live renderer, plus the `data-dash-cancel-booking`
handler. Rewrite both policy notices to the real rule: **no cancellation, no
refunds/cashback, and arriving more than 30 minutes after the start time
automatically marks the booking Unattended.**

**R4 — "Unattended" is derived for display, not written to the database.**
A booking renders as **Unattended** when: `now > time_date + 30 minutes`,
`checked_in_at` is null, and status is still `pending`/`confirmed`. This is
computed client-side at render time in both My Bookings and the receipt.
Rationale: the CHECK constraint above would reject the value (code `23514`),
and nothing in this project runs a scheduled job, so a written status would
require a DB trigger/cron this repo cannot verify or safely add — the
`booking` table's RLS and triggers are explicitly not visible to this repo
(`database/schema/004_staff_module.sql:22-41`). Deriving it means the rule is
visibly enforced immediately, with zero migration risk and no fabricated
data. A migration `database/schema/010_booking_unattended_status.sql` is
**written but not required**, extending the CHECK to permit `'unattended'`
for whenever the owner wants staff/automation to persist it; the UI works
identically before and after it is applied. Existing `'cancelled'` rows are
still displayed correctly (historical data), we simply never create new ones.

**R5 — A receipt for every booking.** `renderReceipts()` builds one receipt
card per booking from the customer's real `booking` rows (the same data
`refreshMyBookings()` already fetches — reuse it, no second query). Each card
shows reference/booking id, court, sport, date, time, derived status, rate
and amount **where genuinely known** — falling back to the existing "Rate
TBA" honesty convention rather than inventing peso figures, since
`court.rate` is null for every row in the live DB and no `payment` rows exist
yet. Each card keeps its own **Download** button wired to the existing
`downloadReceiptAsPng()`. The empty state persists only when the customer
truly has no bookings.

**R6 — Responsive pass.** Audit every panel at ~1280 / 1024 / 768 / 480 /
360px and fix what breaks, prioritising the v6-era UI that never got
breakpoints: booking wizard steps + stepper, receipt cards, court cards and
their unit combo boxes, the notification and feedback popovers (must not
overflow the viewport on small screens), the modal, and the wide
`.dash-table` in My Bookings (horizontal scroll or a stacked card layout on
narrow screens). Fixes go in `Style/Dashboard.css` using the **existing
breakpoints** where possible rather than introducing a competing scale.

## Files to change

- `Pages/user_dashboard.html` — remove Book Now / Cancel markup, rewrite both
  policy notices, sort dropdown options, receipt container.
- `includes/Dashboard.js` — drop `wireBookNowButtons()` + peek hand-off, sport
  sort, drop cancel handler, derived Unattended status, real receipt
  rendering.
- `Style/Dashboard.css` — responsive fixes (primary), plus any styling the
  above needs.
- `database/schema/010_booking_unattended_status.sql` — **new, optional.**

## Constraints and non-goals

- **Do NOT touch** `Pages/staff_dashboard.html`, `Pages/owner_dashboard.html`,
  `includes/staff_dashboard.js`, `includes/owner_dashboard.js`,
  `includes/landingPage.js`, `Style/LandingPage.css`.
- The `booking` INSERT payload must remain byte-identical; the booking wizard,
  notifications, feedback modal, nav, and Account Settings are **not** in
  scope beyond responsive fixes.
- Never fabricate a rate, amount, or receipt. Keep "Rate TBA" / honest empty
  states.
- `window.escapeHtml` on every interpolated value.
- No build step; no new dependencies beyond the html2canvas CDN already
  present.

## Success criteria

1. Dashboard courts sort **by sport** by default; the other two options still
   work within groups.
2. **No "Book Now" button and no click-to-book** anywhere in the Dashboard
   courts section; peek slots still displays availability read-only.
3. My Bookings has **no Cancel control**, and both notices state the real
   no-cancellation / no-refund / 30-minute-Unattended policy.
4. A booking >30 min past start with no check-in displays as **Unattended**
   in My Bookings and on its receipt; no new `'cancelled'` rows are ever
   written; no `23514` errors.
5. **Every booking produces a receipt** in Receipts, each downloadable as a
   real `.png`; empty state only when there are genuinely no bookings.
6. No horizontal overflow or clipped/unusable controls at 1280 / 1024 / 768 /
   480 / 360px on any panel; popovers and modals stay within the viewport.
7. `node --check` passes; no console errors; Phase 1/2 features intact.

## Verification steps

1. `node --check includes/Dashboard.js`.
2. Grep for dead `data-dash-book-court`, `data-dash-cancel-booking`, and
   "non-refundable"/"are cancelled" strings.
3. Confirm the `booking` INSERT payload is unchanged (`git diff`).
4. Serve locally and check each panel at the five widths above.

## Open questions and risks

- **Peek slots kept as read-only** (R1) rather than deleted, since the user
  praised it and the v6 spec said keep it — but it *was* the main
  booking-adjacent feature in a section now designated marketing-only.
  Flagged; trivial to remove if unwanted.
- **"Unattended" is display-derived, not stored** (R4). Staff/owner
  dashboards read `status` directly from the DB and will therefore still show
  such bookings as `pending`/`confirmed` until the optional migration plus a
  writer exist. Flagged as a known, deliberate limitation.
- Receipt amounts stay "Rate TBA" until real rates/payments exist — the
  receipt is structurally complete but financially blank by design, not by
  oversight.

# Customer Page — Revision 3 (courts redesign + larger booking preview)

## Goal

Two focused UI/layout corrections to the customer page, both requested
directly by the user: redesign the Dashboard Overview panel's Courts section
so it stops wasting horizontal space, and make the Book a Court wizard's
Step-1 court preview substantially larger and the step's clear visual focus.
Plain HTML/CSS/JS, no build step, no new dependencies.

## Context and current state

Verified by direct read against the working tree after Revision 2.

- **`.dash-court-grid`** (`Style/Dashboard.css`) was a fixed
  `grid-template-columns: repeat(3, 1fr)`. The Overview panel's Courts
  section groups cards per sport (`.dash-court-groups` → one
  `.dash-court-group-title` + one `.dash-court-grid` per sport — see
  Revision 2's R2). The real data (`includes/courtsData.js`'s fallback,
  mirroring the live `court`/`sport` tables) is 9 courts across 8 sports —
  only Bowling has 2 rows (Duckpin + Ten-Pin); every other sport has exactly
  1. A fixed 3-column grid therefore rendered 7 of 8 groups as a single card
  in a 3-column row, leaving two-thirds of that row permanently empty — the
  "too much empty space on the right side" the user reported.
- **`.dash-court-media-lg`** (`Pages/user_dashboard.html`'s Book a Court Step
  1, styled in `Style/Dashboard.css`) — the standalone, larger court preview
  — was only 220px tall (170px under the old 640px breakpoint), stacked
  directly below the Court `<select>` in one column. The user asked for it
  to be "more larger."

## Approach and architectural decisions

**Change 1 — `.dash-court-grid` becomes a fluid, wrapped flex row instead of
a fixed grid**, so a sport's cards always fill the row's full width instead
of leaving empty tracks. A wrapped flex row was chosen over CSS Grid's own
`repeat(auto-fit, minmax(...))` specifically because auto-fit only collapses
a column that is empty across the WHOLE grid — an uneven last row (e.g. a
future 3-card group landing where only 2 columns fit) would still leave a
hole in that row. Flex-wrap instead redistributes each row's own leftover
space across whatever cards actually landed in it, so there is never a dead
track regardless of card count or viewport width.

A card that is the ONLY card under its sport heading (true for 7 of the 8
real sports today) additionally gets a LANDSCAPE layout — photo on the left
spanning the card's full height, name/rating/rate/tags/unit-picker/peek
toggle in a normal-width column on the right — rather than simply stretching
the existing portrait card to the full row width, which would just be a
very short, very wide banner with a tiny fixed-height photo on top (a
"stretched portrait card"). Bowling's 2-card group is deliberately excluded
from the landscape treatment: at the narrower end of the width range this
still has to support, a card sharing its row with a sibling doesn't have
enough width left for a landscape split's body column (the per-unit
`<select>` plus the "Show availability" toggle) without wrapping or
clipping. Two cards evenly filling the row (the same flex-basis that makes
the fluid grid work) already reads as "full width, deliberate" without
rotating. The landscape treatment (and the fluid grid's own per-card
flex-basis) is turned off below the existing 640px breakpoint, where every
card — solo or not — reverts to one full-width portrait column, matching
pre-Revision-3 mobile behavior exactly.

Peek slots (Revision 2, R1) are unaffected — still a read-only, non-
interactive `<span>` strip inside whichever card renders it, landscape or
portrait.

**Change 2 — `.dash-court-media-lg` is substantially taller (400px, 240px
under 640px) AND, on screens wider than 640px, sits beside the Court/unit
`<select>`s instead of stacked below them** (`.dash-book-step1-layout`, a new
CSS-grid wrapper with named `grid-template-areas`, dominant preview column
sized `1.6fr` against the fields column's `1fr`). The markup's DOM order
stays `[fields, preview]` — the Court `<select>`, the thing a customer
interacts with first, always reads/tab-orders before the preview — only the
WIDE-screen visual order is flipped (preview left/dominant) via
`grid-template-areas`, not `order` integers, so the wide-vs-narrow swap is a
single readable area map. Below 640px this collapses to one column in
natural DOM order (Court picker above preview), which is also the more
usable order on a narrow phone. Picking a specific unit remains preview-only
(unchanged from Revision 2/Phase 2) — it never changes what gets submitted.

## Files changed

- `Style/Dashboard.css` — `.dash-court-grid`/`.dash-court-card` fluid
  flex-wrap conversion, the new solo-card landscape rules, `.dash-court-
  media-lg`'s height/overflow, the new `.dash-book-step1-layout` +
  `.dash-book-step1-fields`/`.dash-book-step1-preview` rules, the matching
  640px/1080px breakpoint updates, and a corrected/extended responsive audit
  note (a stale Revision 2 R6 claim about `.dash-court-grid`'s old 1080px
  2-column rule was corrected in place).
- `Pages/user_dashboard.html` — Book a Court Step 1 restructured into the
  `.dash-book-step1-layout` wrapper (`.dash-book-step1-fields` +
  `.dash-book-step1-preview`); no `data-dash-*` attributes, ids, or their
  values changed, so every `includes/Dashboard.js` selector for this step
  still resolves to the same elements.
- `includes/Dashboard.js` — **not touched**. Both changes are pure
  markup/CSS; the `booking` INSERT payload, `sb.from('booking').insert({...})`
  and everything around it, is therefore byte-identical to before this
  revision (verified via `git diff` showing zero changes to this file).

## Constraints and non-goals

Same as Revision 2's constraints section — `Pages/staff_dashboard.html`,
`Pages/owner_dashboard.html`, `includes/staff_dashboard.js`,
`includes/owner_dashboard.js`, `includes/landingPage.js`,
`Style/LandingPage.css` untouched; the booking wizard's submitted payload,
notifications, feedback modal, nav, My Bookings' no-cancellation policy,
derived Unattended status, and per-booking receipts all unaffected; peek
slots stay non-interactive; `window.escapeHtml` unaffected since no
rendering JS changed; no fabricated data; no unrelated refactors.

## Success criteria

1. A sport with exactly one court (7 of the 8 real sports) fills its grid
   row's full width via a deliberate landscape layout, not a stretched
   portrait card or empty grid tracks.
2. Bowling's 2-card group also fills its row's full width, evenly split.
3. No horizontal overflow or clipped/unreachable controls at 1280/1024/
   768/480/360px for either the Courts section or the Book a Court Step-1
   preview (verified with a headless-browser scrollWidth check at all 5
   widths, plus screenshots).
4. Book a Court Step 1's preview is visibly the dominant element of the
   step, substantially larger than before, side-by-side with the court/unit
   pickers on screens wider than 640px.
5. The `booking` INSERT payload is unchanged (`includes/Dashboard.js` has
   zero diff).

## Verification steps

1. CSS brace balance / HTML tag balance (both confirmed programmatically).
2. `git diff --stat -- includes/Dashboard.js` returns empty.
3. Headless-browser (CDP) pass at 1280/1024/768/480/360px: `document.
   documentElement.scrollWidth <= clientWidth` on both the Overview and
   Booking panels, plus screenshots of the 1-card and 2-card (Bowling)
   court groups and the Step-1 preview at each width.
4. Console/exception check while exercising court/unit `<select>` changes,
   the peek-availability toggle, and the sort `<select>`, confirming no new
   errors.

---

# Customer Page — Revision 4 (mobile feedback placement, fixed drawer, clickable notifications, profile photo)

## Goal

Four changes to the customer dashboard (`Pages/user_dashboard.html`): (1) show
the Feedback card inside the side menu on mobile exactly as on desktop, (2) make
the mobile sidebar drawer truly fixed so it does not move when the page scrolls,
(3) make each notification clickable so it opens that booking's receipt, and
(4) add a profile-image upload to Account Settings that persists to the database,
keeping the existing initials avatar as the no-image default.

## Context and current state

- `.dash-feedback-card` (sidebar, `Pages/user_dashboard.html` ~line 106) is
  `display: none` below 860px; `.dash-feedback-btn-mobile` (topbar, ~line 139)
  takes over instead. Both open the same modal via `[data-dash-feedback-open]`.
- `.dash-sidebar` is `position: fixed` below 860px (`Style/Dashboard.css`
  ~line 2200) — but `.dash-shell` carries `.inigo-reveal`, and
  `Style/Loading.css` sets `transform: translateY(0)` on it. A transform on an
  ancestor makes it the containing block for `position: fixed` descendants, so
  the drawer and the scrim are positioned relative to `.dash-shell` (the whole
  page) rather than the viewport, and they scroll away with the page. That is
  the reported "menu bar moves when I scroll" bug. The `translateY(0)` is a
  visual no-op — nothing anywhere sets a non-zero translate on `.inigo-reveal`.
- Notifications (`includes/Dashboard.js`, `renderNotifications()` ~line 325) are
  derived from the customer's own `booking` rows (no `notification` table — D6).
  Items render as non-interactive `<div class="dash-notif-item">`.
- Receipts (`renderReceiptCard()` ~line 1808) render one card per booking, keyed
  by `booking.booking_id` (`normalizeReceipt()`), but the card's
  `data-dash-receipt-card` attribute carries no value, so there is nothing to
  target a specific receipt by.
- `profiles.avatar_url` already exists and is already selected by
  `includes/authGuard.js` (line 87) — it is simply never read or written by the
  UI. `renderProfile()` sets `.dash-avatar` `textContent` to initials.
- No Supabase Storage bucket exists anywhere in this project (see
  `includes/owner_dashboard.js` ~line 1035 and the two notes in
  `Pages/owner_dashboard.html`), and provisioning one is out of this repo's
  tracked scope.

## Approach and architectural decisions

R4-1 — Feedback lives in the sidebar at every width. Delete the
`@media (max-width: 860px)` rule that hides `.dash-feedback-card`, and remove
the `.dash-feedback-btn-mobile` markup + all of its CSS (base rule, the 860px
`display: inline-flex`, and the 640px icon-only overrides). One entry point, one
location, identical on mobile and desktop — which is what was asked, and it also
de-crowds a mobile topbar that already holds hamburger + title + theme + bell +
avatar. The sidebar gains `overflow-y: auto` so the card is always reachable on
short viewports.

R4-2 — Fix the drawer by removing the transform containing block. In
`Style/Loading.css`, drop `transform` from the `.inigo-reveal` transition and
drop `transform: translateY(0)` from the resolved state. Because that translate
is a no-op, this changes nothing visually on any dashboard but restores
viewport-relative `position: fixed` for the drawer and scrim. Also add
`body.dash-sidebar-open { overflow: hidden; }` so the page behind the open
drawer does not scroll. Applies to owner/staff dashboards too (same class) —
strictly a fix there as well, no behavioural change.

R4-3 — Clickable notifications open that booking's receipt. Carry
`booking.booking_id` through `renderNotifications()`; render each item as a
`<button class="dash-notif-item" data-dash-notif-booking="ID">` instead of a
`<div>`. Give receipt cards their id: `data-dash-receipt-card="${idAttr}"`
(`wireReceiptDownloads()`'s `closest('[data-dash-receipt-card]')` is unaffected).
Clicking a notification: close the dropdown, `setActivePanel('receipts')`, then
`scrollIntoView()` the matching card and flash a temporary `.is-highlighted`
outline. If the card is not found (receipts still loading), fall back to just
opening the Receipts panel — never a dead click, never a fabricated target.
Existing `.dash-notif-item` CSS gains button resets (background/border/width/
text-align/cursor) plus hover and `:focus-visible` states.

R4-4 — Profile photo stored as a data URL in `profiles.avatar_url`.
New "Profile Photo" card at the top of the Account Settings panel: live preview
(the existing `.dash-avatar` when empty, an `<img>` when set), an "Upload Photo"
button driving a hidden `<input type="file" accept="image/*">`, and a "Remove
Photo" button shown only when an image exists. On pick: validate type + a 5 MB
raw ceiling, then downscale through a `<canvas>` to a 256x256 center-cropped
JPEG (quality 0.82, roughly 20-50 KB) and store that data URL in
`profiles.avatar_url` via the same self-`update()` path the Personal Information
save already uses. `renderProfile()` becomes the single place that paints every
`.dash-avatar`: `avatar_url` present renders `<img class="dash-avatar-img">`,
absent renders today's initials, unchanged.

Decision needing confirmation: data URL in the existing `avatar_url` column
vs. a real Supabase Storage bucket. Storage is the "proper" answer but needs
new provisioned infrastructure (bucket + `storage.objects` RLS policies) that
this repo has explicitly kept out of scope everywhere else, and the column
already exists and is already fetched. The downscale keeps rows small. If the
bucket is preferred instead, that changes R4-4's write path only, not its UI.

## Files to change (with intent)

- `Style/Loading.css` — remove the no-op `transform` from `.inigo-reveal` (R4-2).
- `Style/Dashboard.css` — un-hide the sidebar feedback card at <=860px, delete
  `.dash-feedback-btn-mobile` rules, sidebar `overflow-y`, body scroll lock,
  `.dash-notif-item` button/hover/focus states, `.dash-receipt-card.is-highlighted`,
  `.dash-avatar-img` + Profile Photo card styles (R4-1/2/3/4).
- `Pages/user_dashboard.html` — remove the mobile topbar feedback button; add the
  Profile Photo card to the Account Settings panel (R4-1, R4-4).
- `includes/Dashboard.js` — notification ids + click-to-receipt, receipt card id
  attribute, avatar rendering, upload/downscale/save/remove wiring (R4-3, R4-4).
- `database/schema/011_profile_avatar.sql` — documentation-only migration: assert
  `avatar_url` exists (`add column if not exists`) and comment it to record that
  it now holds a downscaled data URL (R4-4).

## Constraints and non-goals

- Do not change the default (initials) avatar in any way — it stays exactly as-is
  whenever no image is set.
- No new Supabase Storage bucket, no new RLS policies, no `notification` table.
- No fabricated data: notifications stay derived from real `booking` rows.
- Owner and staff dashboards are not otherwise touched (the `.inigo-reveal` fix
  is shared and benign).
- Keep the existing plain `<script src>` architecture — no bundler, no new deps.
- Preserve the file's heavy explanatory-comment convention.

## Success criteria

1. At <=860px the Feedback card appears in the sidebar drawer, in the same place
   and form as desktop; no Feedback button remains in the topbar.
2. At <=860px, opening the drawer and scrolling the page leaves the drawer and
   scrim visually fixed to the viewport; the background does not scroll.
3. Clicking any notification opens the Receipts panel and scrolls to and
   highlights that booking's receipt card; the dropdown closes.
4. Account Settings can upload a profile image; it appears in the topbar avatar,
   the Profile panel avatar, and the settings preview; it survives a reload
   (round-trips from `profiles.avatar_url`); Remove Photo restores the initials.
5. No console errors; desktop layout at >=1080px is unchanged.

## Verification steps

1. CSS brace balance and HTML tag balance checked programmatically.
2. Headless-browser pass at 1280 / 860 / 640 / 360px: drawer fixed-position check
   (`getBoundingClientRect().top === 0` after scrolling), feedback card visible in
   the drawer, no topbar feedback button, no horizontal overflow.
3. Notification click: assert active panel is `receipts` and the highlighted
   card's id matches the clicked notification's booking id.
4. Upload a small test image, confirm the `profiles` row's `avatar_url` is
   written, reload, confirm the image renders; then Remove and confirm initials.
5. Console/exception check across all four flows.

## Open questions and risks

- The storage decision above — the one item that needs the user's call.
- Data URLs make the `profiles` row larger; the 256x256 JPEG cap keeps this at
  tens of KB, but many users with photos will grow `authGuard`'s profile fetch
  slightly.
- Removing `transform` from `.inigo-reveal` touches all three dashboards; risk is
  low (no-op value) but is worth a visual smoke test of the reveal animation.
