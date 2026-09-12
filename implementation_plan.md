# Owner (Admin) Dashboard — Revision A1 + system-wide typography

## Context

The owner dashboard (`Pages/owner_dashboard.html` 880 lines, `includes/owner_dashboard.js` 1050 lines,
`Style/owner_dashboard.css` 791 lines; panels `overview | staff | courts | media | settings`) lags behind the
customer dashboard that was just reworked (Revision 5). The user wants it brought to the same standard, plus a
single typography system applied to every page of the product.

Findings from direct reads (2026-09-12):

- **Brand**: sidebar shows a text monogram `IS` (`.admin-logo-dot`) instead of the real logo the customer page
  uses (`assets/Logo/WebLogo.png` in `.dash-sidebar-brand`).
- **Fonts**: all five pages load the same Google Fonts link (Oswald / Inter / Space Mono) and each CSS file
  redefines `--font-display/--font-body/--font-mono` itself. Space Mono is sprinkled over UI labels (stats,
  table meta, chips, captions) and there are ~300 ad-hoc `font-size` declarations across the six CSS files.
- **Topbar**: bell button exists but is dead (no dropdown, no data); profile dropdown exists
  (`[data-admin-profile]` → Account Settings / Log Out) but the avatar is initials-only (`.admin-avatar`).
- **Overview**: stat cards + Chart.js trend (`event/chart.js`) are live; **"Busiest courts this week"** and
  **"Staff on shift"** are hardcoded fake data.
- **Court Listings**: add/edit share one inline `.admin-add-panel` form that scrolls into view
  (`openCourtFormForEdit()` → `scrollIntoView`). No modal exists anywhere on the admin page. Card visuals differ
  from the customer's court cards.
- **Media Manager**: "Home featured slideshow" and "Court photos" are static, disabled placeholders (no Storage
  bucket). The landing-page hero already reads slides from `public.event`
  (`title, meta, tag, image_url, display_order, is_published`, `002_content_tables.sql`) via
  `includes/home-showcase.js` / `window.InigoContent.getEvents()`; the customer dashboard hero is 3 static
  `<article data-dash-hero-slide>`.
- **Staff**: list live; "Reset Password" = `resetPasswordForEmail` (email link); "Deactivate" sets
  `profiles.status='disabled'`; **no Activate** action; row edit is inline.
- **Settings**: name saves `profiles.full_name`; email input present but **never saved**; no avatar upload;
  password change is a single 3-field form.
- Reusable from the customer page (`includes/Dashboard.js`): `downscaleImageToAvatarDataUrl()` +
  `saveAvatarUrl()` + avatar rendering (256×256 JPEG data URL in `profiles.avatar_url`), the 2-step password
  wizard (`signInWithPassword` re-auth → `auth.updateUser({password})`), the notifications dropdown
  (`[data-dash-notif*]`, `renderNotifications()`), the `.dash-modal-overlay`/`.dash-modal` shell, `InigoToast`.

## Decisions (user confirmed 1,3–9 "all good"; #2 delegated: "you choose", apply to the whole system)

| # | Decision |
|---|----------|
| A1 | **Logo**: replace `.admin-logo-dot` "IS" with `<img src="../assets/Logo/WebLogo.png">` + wordmark, same markup/sizing as `.dash-sidebar-brand`. Do the same on the staff sidebar if it also uses a text monogram. |
| A2 | **Typography (system-wide)**: new shared `Style/typography.css`, linked FIRST on every page (`Index`, `terms`, `user_dashboard`, `staff_dashboard`, `owner_dashboard`). Fonts: **Sora** (display/headings, 600–700) + **Inter** (body/UI, 400–600) with `font-variant-numeric: tabular-nums` for numbers; **Space Mono removed** (`--font-mono` is kept as an alias of Inter so nothing breaks, then usages are cleaned up). One Google Fonts link (`Sora:wght@500;600;700&Inter:wght@400;500;600;700`) replaces the old one on all five pages. Type scale as CSS variables: `--fs-xs .75rem, --fs-sm .8125rem, --fs-md .875rem, --fs-base 1rem, --fs-lg 1.125rem, --fs-xl 1.375rem, --fs-2xl 1.75rem, --fs-3xl 2.25rem, --fs-hero clamp(2.25rem,5vw,3.5rem)`; line-heights `--lh-tight 1.15, --lh-snug 1.3, --lh-normal 1.55`; letter-spacing for uppercase eyebrows `.08em`. Each CSS file's `--font-*` definitions are deleted (inherit from typography.css) and every `font-size:` is mapped to the nearest scale token; heading elements (`h1–h4`, `.admin-stat-value`, `.dash-*-title`…) use `--font-display`. Result: one place defines fonts, sizes, and weights for the whole product. |
| A3 | **Overview replacements**: "Busiest courts this week" → **Recent bookings** (latest 8 `booking` rows joined to `profiles.full_name`, columns Customer / Court / Date & time / Status with the same status-badge classes; "View all" not needed). "Staff on shift" → **Booking status this month** (counts of pending / confirmed / completed / cancelled + client-derived unattended, as a compact bar list). Both live, refreshed with `refreshOverviewStats()`. |
| A4 | **Staff → Reset Password**: sets the password to **`12345678`** via a new SECURITY DEFINER RPC `public.admin_reset_staff_password(target_id uuid)` (migration `014_admin_reset_staff_password.sql`): verifies `auth.uid()` is an `admin` profile, target is `staff`/`admin`, then `update auth.users set encrypted_password = crypt('12345678', gen_salt('bf')), updated_at = now()`; requires `pgcrypto`. Button asks `confirm()` first, then toasts "Password reset to the default. Ask <name> to change it after logging in." Keep the email-link path out (replaced). Add **Activate** button for `disabled` staff (`profiles.status='active'`), mirroring the court cards' Activate/Deactivate pair. Staff row edit stays inline (unchanged). |
| A5 | **Media Manager**: remove the "Court photos" card entirely (markup + CSS + JS stubs). Make the slideshow real against `public.event`: list published+unpublished slides ordered by `display_order`; per slide: photo (replace via upload), Title (`title`), Caption (`meta`), Tag (`tag`, optional), Published toggle (`is_published`), Move up/down (`display_order`), Remove (delete row); "Add slide" (max 6). Uploads go to a new **public Storage bucket `media`** created by migration `015_media_bucket.sql` (`insert into storage.buckets … on conflict do nothing` + RLS policies: public read, admin insert/update/delete on `bucket_id='media'`); client uses `sb.storage.from('media').upload(path, file, {upsert:true})` then `getPublicUrl()` → `event.image_url`. Images are downscaled client-side to max 1600×900 JPEG before upload (reuse the canvas approach of `downscaleImageToAvatarDataUrl`, generalised as `downscaleImageToBlob(file, maxW, maxH, quality)` in a new shared `includes/imageTools.js`). If the bucket is missing (error 404/“Bucket not found”), toast "Media storage isn't set up yet — run 015_media_bucket.sql". The customer dashboard hero (`[data-dash-hero]`) is rewired to render from `InigoContent.getEvents()`-equivalent data (add a small `includes/contentEvents.js` used by both dashboards, or reuse `includes/landingPage.js`'s `InigoContent` if it can load standalone — coder to decide after reading it) so owner edits show on the landing page AND the customer dashboard. |
| A6 | **Court Listings**: Add/Edit move into a **modal** (`.admin-modal-overlay`/`.admin-modal`, port of the customer `.dash-modal` shell), opened from "+ Add New Court" and each card's Edit; Esc/backdrop/Cancel close; Save keeps the existing insert/update logic (`courtSubmitBtn` handler) and refreshes the grid. The modal's Image field offers **Upload** (to the `media` bucket, path `courts/<id>-<ts>.jpg`) **or URL**. Card redesign to match the customer's court cards: image/monogram media block with status badge, name, sport chip, `N units` chip, rate line ("Rate TBA" when null), description tags, and a consistent action row (Edit = secondary, Activate/Deactivate = ghost/danger). Filter chips unchanged. |
| A7 | **Notifications (owner)**: port the customer bell/dropdown (`[data-admin-notif*]`): items = new bookings (`status='pending'`, latest 10, "Juan booked Badminton · Sep 14, 9–11 AM") and new feedback (latest 5, "★★★★☆ — message excerpt"). Unread dot = any item newer than `localStorage['inigosync-admin-notif-seen']`; opening the menu marks seen. Clicking a booking item goes to Overview (Recent bookings). Refresh every 60 s and on `inigosync:profile-ready`. |
| A8 | **Topbar profile**: `.admin-avatar` renders `profiles.avatar_url` (img) when set, initials otherwise — one `renderAdminProfile()` paints every avatar (topbar + settings card). Dropdown unchanged. |
| A9 | **Account Settings**: (1) **Profile photo card** — Upload / Remove, same pipeline as the customer page (`downscaleImageToAvatarDataUrl` → `profiles.avatar_url`; move that helper into `includes/imageTools.js` and have Dashboard.js use it too, no behaviour change). (2) **Full name + email editable**: name → `profiles.update({full_name})`; email → `sb.auth.updateUser({ email })` then toast "Confirmation link sent to <new email> — the change applies after you click it." On load and on `onAuthStateChange('USER_UPDATED')`, if `session.user.email !== profile.email`, sync `profiles.email` and repaint. (3) **Change Password = 2-step wizard** identical to the customer's (Step 1 current password → `signInWithPassword` re-auth; Step 2 new + confirm with show/hide → `auth.updateUser({password})`), with `data-admin-pw-*` hooks. |

## Files to change

### New
- `Style/typography.css` — fonts, scale, weights, base element rules (A2).
- `includes/imageTools.js` — `downscaleImageToDataUrl(file, {size, quality})` (avatar) + `downscaleImageToBlob(file, {maxW, maxH, quality})` (media). Loaded by user + owner dashboards before their main script.
- `database/schema/014_admin_reset_staff_password.sql` (A4), `database/schema/015_media_bucket.sql` (A5).
- `docs/OWNER_ACTION_LIST.md` items: run 014 + 015; note the default password policy.

### `Pages/owner_dashboard.html`
- Sidebar brand → logo image (A1). Fonts link swap + `typography.css` link (A2).
- Topbar: bell → `[data-admin-notif]` dropdown markup (A7); avatar container accepts `<img>` (A8).
- Overview: replace the two fake cards with `[data-admin-recent-bookings]` table and `[data-admin-status-breakdown]` list (A3).
- Courts: remove inline `.admin-add-panel` form; add `[data-admin-court-modal]` (A6).
- Media: delete Court photos card; slideshow card becomes `[data-admin-slides]` container + "Add slide" (A5).
- Staff: rows gain Activate (rendered by JS); Reset copy updated (A4).
- Settings: Profile photo card, editable email, 2-step password wizard (A9).
- Script order: `imageTools.js` before `owner_dashboard.js`.

### `includes/owner_dashboard.js`
- `renderAdminProfile()` (avatar img/initials, name, email fields); avatar upload/remove handlers; email change + sync; password wizard state machine (port from `Dashboard.js`, `data-admin-pw-*`).
- `refreshOverviewStats()` → also `refreshRecentBookings()` and `refreshStatusBreakdown()`.
- Court modal open/close/populate/save; card renderer redesign; image upload helper `uploadToMedia(path, blob)`.
- Slides: `loadSlides()`, `renderSlides()`, handlers for replace/add/remove/reorder/publish/title/caption (debounced save on blur).
- Staff: `admin_reset_staff_password` RPC call; Activate handler.
- Notifications: `refreshAdminNotifications()`, `renderAdminNotifications()`, menu toggle, seen marker.

### `Style/owner_dashboard.css`
- Remove `--font-*` block; map sizes to tokens; kill mono usages (A2). New: `.admin-brand img`, `.admin-notif*`, `.admin-modal*`, `.admin-court-card` redesign, `.admin-slide*`, `.admin-recent-table`, `.admin-status-breakdown`, `.admin-avatar img`, `.admin-pw-step*`, `.admin-input[readonly]`.

### Other pages (A2 only — no functional change)
- `Pages/Index.html`, `Pages/terms.html`, `Pages/user_dashboard.html`, `Pages/staff_dashboard.html`: fonts link swap + `typography.css` link.
- `Style/LandingPage.css`, `Style/Auth.css`, `Style/Dashboard.css`, `Style/staff_dashboard.css`, `Style/Loading.css`: drop local `--font-*` definitions; map `font-size` values to tokens; replace `--font-mono` usages with body font + `tabular-nums` where it was used for numbers.
- `Pages/user_dashboard.html` + `includes/Dashboard.js`: hero slides rendered from `event` rows (A5); avatar helper moved to `imageTools.js` (A9) — behaviour unchanged.
- `Pages/staff_dashboard.html`: logo image if it also uses a text monogram (A1).

## Constraints and non-goals
- No build step; plain scripts on `window`; keep `data-admin-*` hooks and `admin-*` CSS prefix; hoisted function declarations; explain-why comments citing "Revision A1 / A-number".
- Do not change booking logic, business hours, staff dashboard behaviour, or the customer Revision 5 features (only their fonts/sizes and the hero data source).
- Staff creation/invite flow unchanged. No auth.users deletion. No service-role key in the browser — the only privileged operation is the SECURITY DEFINER RPC (A4), which itself checks the caller is an admin.
- Typography pass must not change layout structure — only font family/size/weight/line-height tokens. Visual regressions are checked page by page.

## Success criteria
1. Sidebar shows the logo image on owner (and staff, if applicable) pages.
2. Every page loads only Sora + Inter; no `Space Mono` request in the network tab; all `font-size` values in the six CSS files come from typography tokens (grep shows no raw `font-size: <number>` outside `typography.css`, except intentional `clamp` hero sizes); headings visibly use Sora, body Inter; no layout breakage on mobile/desktop for Index, login, customer, staff, owner.
3. Overview shows live Recent bookings and Booking status this month; fake cards gone.
4. Reset Password sets the target's password to `12345678` (login test with that password succeeds afterwards); non-admin callers get a Postgres exception; Activate restores a deactivated staff.
5. Media Manager: adding/replacing/reordering/publishing/removing a slide persists to `event`, uploads land in the `media` bucket, and the landing-page hero AND the customer dashboard hero show the change; Court photos card is gone.
6. Court Add/Edit happen in a modal with Esc/backdrop close; save/insert/update still work; cards look consistent with the customer's.
7. Owner bell shows pending bookings + feedback with an unread dot; opening clears it.
8. Settings: photo upload/remove works and shows in the topbar; name saves; email change sends a confirmation and `profiles.email` follows after confirmation; password wizard works with wrong-current-password rejection.

## Verification
- `node --check` on all touched JS; brace-balance on all CSS.
- Serve with `python -m http.server 8532`; open all five pages; check console/network (fonts requested: Sora, Inter only).
- Owner login: walk every panel per criteria 3–8; run 014/015 first in Supabase (owner action).
- Reviewer pass on: RPC SQL (privilege check), storage policies, modal/upload code, typography diff (spot-check each page).


## Post-implementation notes (2026-09-12)

Implemented in two sequential coder lanes (features, then typography), reviewed, findings fixed.

- **A2 typography**: `Style/typography.css` now owns fonts (Sora + Inter), the `--fs-*` scale, weights and line-heights; the six page stylesheets only reference tokens. Space Mono removed. `Style/Auth.css` `.auth-field-row` min column raised 86→96px because Sora labels are wider (verified in Playwright at 320–768px). Landing `.cta-button` now inherits 1rem (was UA 13.33px) — matches its sibling link.
- **A4 hardening**: the reset RPC also deletes the target's `auth.refresh_tokens` and `active_session` row, so a reset ends every open session of that staff account (defence in depth; refresh-token delete is wrapped so a privilege error can't block the reset). `inigosync_is_active_admin()` is revoked from `public`/`anon`.
- **A5**: Media Manager cap is 5 slides (both heroes render max 5); a newly added slide starts **unpublished**; reorder renumbers duplicates first. Public `event_public_read` policy (from 002) still exposes unpublished rows to SELECT — the heroes filter client-side; acceptable for marketing copy, noted.
- **A7**: notifications retry without `end_at` on a pre-012 database and show "Couldn't load booking alerts" instead of failing silently.
- **A9**: email change keeps the typed address in the input with a "pending confirmation" hint; password re-auth uses the session's email.
- Static demo staff rows are now wired (fallback only).

**Not verified live** (no signed-in session available to the agents): RPC + login with the default password, storage upload + both heroes, notifications data, email confirmation round-trip, and the dashboards' rendering with the new fonts (landing + terms pages were screenshotted at 360/1280 and are clean). Owner must run `014` then `015` first (docs/OWNER_ACTION_LIST.md).

## Risks
- The RPC touches `auth.users` — must be SECURITY DEFINER owned by `postgres` and revoke `execute` from `anon`; grant to `authenticated`. Document that any admin can reset any staff password to a known default (intended by the user; staff should change it on first login).
- Storage bucket creation via SQL works on hosted Supabase (`storage.buckets` insert) but policies must be created on `storage.objects`; if the project restricts this, fallback is creating the bucket in the dashboard UI (documented in OWNER_ACTION_LIST).
- Email change with "Secure email change" enabled sends links to both addresses; the toast text covers "check both inboxes".
- Typography pass is wide (six CSS files); mis-mapped sizes are the most likely regression → reviewer spot-checks every page at 360px and 1280px widths.


---

# Earlier revisions (kept for the code comments that cite them)

# Customer Dashboard — Revision 5 (8 AM–8 PM hours, From/To booking picker, receipt redesign, locked profile + mobile OTP, dashboard-only footer)

## Context

The customer (user) dashboard at `Pages/user_dashboard.html` + `includes/Dashboard.js` + `Style/Dashboard.css`
already has: a per-court "Show availability" peek strip on the Overview tab (today only, start-time labels,
per-court-row granularity), a Book-a-Court wizard whose Step 2 renders hourly slot buttons and supports a
contiguous start→end range (first click = start, second click = end), a Receipts tab rendering one
`.dash-receipt-card` per booking with PNG download, an Account Settings tab where names + mobile are editable
(email already `disabled`), and a `<footer class="site-footer">` that renders on every tab.

The user wants the customer account to:

1. **Dashboard (Overview) availability** — show real hourly slots as ranges (8–9 AM, 9–10 AM, … 7–8 PM),
   and let the customer pick a **date** so the strip reflects that day's availability, not only today.
2. **Booking Step 2** — no clickable slots; a **From / To time-range picker** (whole hours, 8 AM → 8 PM)
   whose options shrink to what is still free on the chosen date. Any number of consecutive hours.
3. **Receipt** — keep exactly the same information, change the visual design.
4. **Account Settings** — personal info (first/middle/last name) **not editable**; email **not editable**;
   mobile number changes require **OTP verification** (like the email OTP at signup).
5. **Footer** — visible only on the Dashboard (Overview) tab.

Single shared hours source: `includes/businessHours.js` (`OPEN_HOUR = 8`, `CLOSE_HOUR = 21` today).

## Decisions (confirmed with the user on 2026-09-12)

| # | Decision | Final |
|---|----------|-------|
| D1 | Operating hours | `CLOSE_HOUR` 21 → **20**. Bookable window is **8:00 AM – 8:00 PM**. Slots = 8–9, 9–10, … 7–8 PM (**12 slots**). A customer may book **any contiguous run of whole hours** inside that window (1 hr up to all 12) — no fixed 2-hour blocks, no half-hours. Affects Overview, Step 2, and the staff Court Schedule (`hoursRange(2)` → 6 columns ending 6–8 PM) automatically. |
| D2 | Slot label format | Range on every slot button/pill: `8:00 AM – 9:00 AM` (new helper `formatHourRangeLabel(hour)` in `businessHours.js`). Peek strip uses a short form `8–9 AM` to fit. |
| D3 | Step 2 time selection | **No slot grid. Step 2 becomes a From/To time-range picker** (user corrected this on the second pass: "there should be no slots to click"). Two `<select>`s: **From** (options 8:00 AM … 7:00 PM) and **To** (options 9:00 AM … 8:00 PM). Options are **reduced by that date's availability**: a From hour is offered only if it is free (not booked for the chosen court+unit, not past when the date is today); after From is chosen, To offers only hours from `From+1` up to the next booked hour (or 8 PM), so the range is always contiguous and free. Changing From re-derives To (and clears it if no longer valid). A helper line under the pickers lists the free windows for the day, e.g. "Open on this date: 8 AM – 10 AM, 11 AM – 8 PM", or "Fully booked on this date". Result maps to `bookingState.startHour` = From, `bookingState.endHour` = To − 1 (existing inclusive convention) → single `booking` row with `end_at`/`duration_minutes`; `bookingHoursSelected()`, `updateSummary()`, the insert payload, and the DB EXCLUDE constraint are unchanged. |
| D4 | Overview ⇄ Step 2 consistency | User's example: book 8–9 AM → Overview strip AND Step 2 both show 8–9 taken and 9 AM–8 PM still open, for that date/unit. Peek strip becomes **per selected unit** (uses the existing `[data-overview-unit-select]`) and uses the **same occupancy helper** Step 2 uses (`overviewBookingWindow` + `overviewWindowsOverlap` + unit match), so the two can never disagree. Fetch includes `court_unit, end_at` with the same schema-mismatch retry Step 2 uses. After a successful booking, both the Overview widget and Step 2 grid are refreshed. |
| D5 | Overview date | One `<input type="date" data-dash-overview-date>` above the courts grid (min = today, default today). Changing it re-fetches bookings + walk-ins for that day and re-renders. Past hours on today are shown as `is-past`. |
| D6 | Mobile OTP | **Implement the real SMS OTP code path now; no paid SMS provider yet** (user: "code-only for now, but apply it"). Flow: `sb.auth.updateUser({ phone: '+63…' })` sends the code; `sb.auth.verifyOtp({ phone, token, type: 'phone_change' })` confirms. On success write `profiles.contact_num` (local `09…` form) + new `profiles.phone_verified = true`. **Zero-cost demo path for the thesis defense:** Supabase Auth → Phone provider supports *Test phone numbers with fixed OTPs* (`auth.sms.test_otp`) — no SMS is sent and no Twilio account is charged; the exact same code path runs. Documented as a new `docs/OWNER_ACTION_LIST.md` item (enable Phone provider, add test numbers now, add a real SMS provider later). Until the provider is enabled, the UI shows a friendly "SMS verification isn't set up yet" toast — **no fake client-side code generation**. |
| D7 | Receipt look | "Store receipt / ticket stub" style: brand header (IñigoSync + "Official booking receipt"), monospace receipt no., dashed perforation dividers, itemised body (**Rate/hr × hours = Amount**, when rate is known; otherwise "Rate TBA"), a prominent TOTAL row, status badge, date/time, thank-you footer, download button. Same underlying fields (Court, Receipt #, Status, Sport, Date, Time, Amount) — no new data. **Priority (user): the downloaded PNG must look identical to the on-screen card** — so the design must use only html2canvas-safe CSS (no `backdrop-filter`, no external images/fonts beyond what already renders, no `mix-blend-mode`), and the coder must verify by opening the PNG side-by-side. A payment-option / downpayment line is NOT included because `booking` does not store the chosen payment option (out of scope; noted under risks). |
| D8 | Footer visibility | `setActivePanel()` sets `document.querySelector('.site-footer').hidden = name !== 'overview'`. |
| D9 | Footer content (recommended, user asked for a suggestion) | Replace the landing-page footer clone with a **slim dashboard footer** built for a signed-in customer: (1) brand + one-line tagline; (2) **Quick links** — Book a Court, My Bookings, Receipts, Account Settings (each a `data-dash-nav` button, so they use the existing tab switcher); (3) **Need help?** — phone, email, address, and **Operating hours: 8:00 AM – 8:00 PM daily** read from `InigoBusinessHours` so it can never drift; (4) **Policies** — Terms (`Pages/terms.html`) and the no-cancellation / unattended policy line; (5) copyright line. **Drop the Google Maps `<iframe>`** on the dashboard (it is the single heaviest element on the page and already has to be special-cased out of html2canvas; a "Get directions" link to Google Maps replaces it). Keep the social links as icons. Uses new `dash-footer-*` classes in `Dashboard.css`; the landing page footer in `Index.html` is untouched. |

## Files to change

### `includes/businessHours.js`
- `CLOSE_HOUR = 20`; update header comments (they currently justify 21).
- Add `formatHourRangeLabel(hour)` → `"8:00 AM – 9:00 AM"` and `formatHourRangeLabelShort(hour)` → `"8–9 AM"` (period shown once when both sides share it, e.g. `11 AM–12 PM`). Export on `window.InigoBusinessHours`.

### `Pages/user_dashboard.html`
- Overview courts header (`~:387-401`): add a date field `<input type="date" class="dash-input" data-dash-overview-date>` with label "Availability for" next to the sort select.
- Step 2 (`~:516-547`): **remove** `<div class="dash-slot-grid" data-dash-slot-grid>`; add two form groups — `<select class="dash-select" data-dash-book-from>` ("From") and `<select class="dash-select" data-dash-book-to>` ("To") — and a status line `<p class="dash-form-hint" data-dash-book-open-windows>` for the "Open on this date: …" text. Helper text: "Choose a start and end time (8:00 AM – 8:00 PM, whole hours)".
- Settings Personal Information card (`~:905-955`):
  - First/middle/last name inputs → `readonly` (keep values populated by `renderProfile()`), label hint "Personal information can't be changed here".
  - Email stays `disabled`; label → "Email address · cannot be changed".
  - Mobile: input + adjacent `Verify` button (`data-dash-mobile-verify`) + a verified badge span (`data-dash-mobile-verified`). Remove the profile "Save Changes"/"Cancel" pair (nothing left to save except via OTP).
- Add a Mobile OTP dialog reusing the generic `.dash-modal-overlay`/`.dash-modal` shell: 6 code boxes (`data-dash-otp-box`), "Resend code" with cooldown, Cancel/Confirm (`data-dash-mobile-otp-*`).
- Footer (D9): replace `<footer class="site-footer">…</footer>` (`~:1040-1089`) with the slim `<footer class="dash-footer">` described in D9 (Quick links use `data-dash-nav="booking|bookings|receipts|settings"`; hours text filled by JS from `InigoBusinessHours`). Keep the surrounding comment explaining it lives outside `[data-dash-panel]`.

### `includes/Dashboard.js`
- **Overview** (`OVERVIEW_SLOT_HOURS`, `renderOverviewSlotPill`, `isOverviewCourtHourOccupied`, `refreshOverviewCourtWidget`):
  - New `overviewDate` state (default today) driven by `[data-dash-overview-date]`; replace `todayRange()` usage with a day range built from `overviewDate`.
  - Booking query: `select('courts, court_unit, time_date, end_at, duration_minutes, status')` with schema-mismatch retry that drops `court_unit, end_at`.
  - `isOverviewCourtHourOccupied(court, hour, unitLabel)` — match `court_unit` against the card's selected unit (null/'' both sides treated as same unit, identical to `isSlotHourBooked`).
  - Pill label → `formatHourRangeLabelShort(hour)`; add `is-past` for elapsed hours when the chosen date is today. Unit select change re-renders that card's strip.
- **Step 2** (replace `paintSlotGrid`, `onSlotClick`, `extendSelectionTo`, `renderSlotGrid`):
  - Keep `fetchDayBookings()` and `isSlotHourBooked(hour)` (per-unit occupancy) as the single source of truth.
  - New `computeFreeWindows()` → array of `{ startHour, endHourExclusive }` runs of free, non-past hours for the selected court/unit/date.
  - New `renderTimePickers()`: fills `[data-dash-book-from]` with every free hour (`formatHourLabel`), fills `[data-dash-book-to]` from `From+1` to the end of the run containing From, writes the "Open on this date" line, and disables both selects with a message when the day has no free hour. Called by `resetSlotSelectionAndRender()` (rename to `resetTimeSelectionAndRender()`), i.e. on court/unit/date change and before submit (race guard re-fetch stays).
  - `change` handlers: From → set `bookingState.startHour`, rebuild To, clear `endHour`; To → set `bookingState.endHour = to − 1`; both call `updateSummary()` and `updateWizardButtons()`.
  - `bookStepIsReady()` for step 2 now requires **both** From and To.
  - Keep `bookingState.startHour/endHour`, `bookingHoursSelected()`, `updateSummary()`, `bookingTimeRangeLabel()`, and the insert payload unchanged.
- **Receipts** (`renderReceiptCard`): new markup per D7 using new `dash-receipt-*` sub-classes; `downloadReceiptAsPng` unchanged (still captures `.dash-receipt-card`).
- **Settings**:
  - Remove the profile-save handler's name/mobile writes (or guard it out) — names/email are read-only.
  - New mobile verification flow: validate with `window.validatePhMobile`, convert to E.164 `+63XXXXXXXXXX`, `updateUser({ phone })`, open OTP modal, `verifyOtp({ phone, token, type: 'phone_change' })`, then `profiles.update({ contact_num, phone_verified: true })` (schema-mismatch retry drops `phone_verified`). Toast success; `renderProfile()` shows the verified badge when `phone_verified` is true.
  - Map Supabase errors: SMS provider not configured / "Unsupported phone provider" → friendly toast; invalid/expired token → inline error in modal.
- **Footer**: D8 one-liner in `setActivePanel()` (target `.dash-footer`); fill `[data-dash-footer-hours]` from `InigoBusinessHours.formatHourLabel(OPEN_HOUR)` / `(CLOSE_HOUR)`; `downloadReceiptAsPng`'s iframe `ignoreElements` guard can stay (harmless).
- **After a successful booking insert**: call `refreshOverviewCourtWidget()` in addition to the existing My Bookings/notification refresh so the Overview strip immediately shows the new booking (D4).

### `Style/Dashboard.css`
- Step 2: remove `.dash-slot-grid` / `.dash-slot` selection-state rules that are no longer used (`.is-selected`, `.is-range-*`, `.is-in-range`); keep `.dash-slot-mini`, `.is-unavailable`, `.is-past` for the Overview strip and size `.dash-slot-mini` for `8–9 AM` labels. Add a two-column `.dash-time-range` layout for the From/To selects (1 column ≤ 620px) and `.dash-form-hint` for the open-windows line.
- Overview header layout for the new date field.
- Receipt redesign styles (D7) — `.dash-receipt-card` retains its class; add `.dash-receipt-brand`, `.dash-receipt-divider` (dashed), `.dash-receipt-total`, `.dash-receipt-meta`. Must still render correctly through html2canvas (avoid `backdrop-filter`, external images).
- Read-only input style (`.dash-input[readonly]`), mobile verify row, verified badge, OTP box styles (port the sizing of `.auth-otp-box` from `Style/Auth.css` under a `dash-otp-box` name).
- New `.dash-footer*` styles (D9): compact 3–4 column grid, collapses to 1 column ≤ 640px, matches the dashboard's card/line tokens rather than the landing page's.

### `includes/staff_dashboard.js` / `includes/owner_dashboard.js`
- No code change expected; verify the schedule grid still renders sanely with `CLOSE_HOUR = 20` (6 two-hour columns). Update any comment that hard-codes "9 PM".

### `database/schema/013_profile_phone_verified.sql` (new)
- `alter table public.profiles add column if not exists phone_verified boolean not null default false;` + comment. Idempotent, same style as `011_profile_avatar.sql`.

### `docs/OWNER_ACTION_LIST.md`
- New item: enable Phone provider + SMS provider in Supabase Auth, run `013_profile_phone_verified.sql`.

### `implementation_plan.md` (project root)
- Prepend a "Revision 5" section mirroring this plan (project convention: it's the running log every code comment cites).

## Constraints and non-goals
- No build step; plain `<script>` files attaching to `window`. Keep `data-dash-*` hooks, `dash-*` CSS prefix, hoisted function declarations.
- Do not change the `booking` insert payload shape or the `booking_no_overlap` semantics.
- Do not touch owner/staff dashboards beyond verifying they still work with the new `CLOSE_HOUR`.
- No fake OTP success path. No email-change flow.
- Non-contiguous slot selection (e.g. 8–9 AM and 2–3 PM in one booking) is out of scope (would require multiple booking rows/receipts).
- The static "Upcoming reservations" card on Overview is untouched (pre-existing fake data; separate task).

## Success criteria
1. Overview: date picker present; strip shows 12 pills labeled `8–9 AM … 7–8 PM`; changing date or unit updates booked/open state; today's elapsed hours look past.
2. Step 2: no slot buttons; From/To selects offer only free hours per D3 (e.g. with 10–11 AM booked, From = 8 AM ⇒ To offers 9 AM and 10 AM only); "Open on this date" line matches the Overview strip for the same date/unit; Next is disabled until both are chosen; summary shows correct range/hours/total; booking insert produces one row with correct `time_date`/`end_at`/`duration_minutes`.
3. Receipts: every field previously shown is still shown; new design; PNG download still works and the download button is not baked into the image.
4. Settings: names/email cannot be edited; mobile change goes through OTP; `contact_num` updates only after successful `verifyOtp`; verified badge shown when `phone_verified` true; unconfigured SMS provider yields a clear error, not a crash.
5. Footer visible on Overview only; hidden on every other tab and on deep links (notification → receipts).
6. Staff Court Schedule still renders (6 columns, last 6–8 PM). No console errors on customer dashboard load.

## Verification
- Start `static-server` from `.claude/launch.json` (python http.server :8532) and open `Pages/user_dashboard.html` in the in-app browser; sign in as a customer.
- Walk each tab: Overview (date change, unit change, expand strip), Book a Court (multi-click flows, past date guard, summary), Receipts (visual + download), Settings (readonly fields, Verify → modal), footer visibility on each tab.
- Check console/network for errors; confirm the booking `select` retries gracefully if `012` isn't applied.
- Reviewer pass on the diff (booking selection logic and OTP flow are regression-prone).

## Resolved questions (user answers, 2026-09-12)
1. Hours → 8 AM – 8 PM, last slot 7–8 PM, any contiguous number of hours. ✔
2. Step 2 → **no clickable slots**; From/To time pickers whose options shrink to the free hours on the chosen date (user's second correction). Still one contiguous range, one booking. ✔
3. Mobile OTP → real code path now, no paid provider yet; demo via Supabase test-OTP numbers. ✔
4. Receipt → store-receipt/ticket style; downloaded PNG must equal on-screen card. ✔
5. Footer → user asked for a recommendation; D9 is the recommendation (slim dashboard footer, no map iframe).

## Risks
- `phone_change` OTP requires the Supabase **Phone** provider to be enabled; with it disabled `updateUser({ phone })` errors — handled with a friendly toast, but the feature can't be exercised until the owner flips it on (owner action item).
- Receipt cannot show payment option / downpayment because `booking` doesn't store it; adding that is a separate schema + wizard change.
- Changing `CLOSE_HOUR` alters the staff schedule's column count; verify nothing in `staff_dashboard.js` hard-codes 7 columns.
- Existing bookings that end at 9 PM (made under the old hours) will render past the new grid; they're rare/none pre-launch, and My Bookings/Receipts still show them correctly from `end_at`.

## Execution notes
- Copy this plan into the project's `implementation_plan.md` as "Revision 5" before delegating (project convention).
- Single `coder` lane (all changes share `Dashboard.js` / `Dashboard.css`), then a `reviewer` pass on slot-selection logic and the OTP flow.


## Post-implementation notes (2026-09-12)

Implemented by the coder, reviewed independently, review findings fixed. Deviations from the plan above:

- **D4 tightened**: Step 2 now also counts staff walk-ins (`fetchDayWalkins()` → `slotGridWalkins`, court-wide since walk-ins have no unit) and the Overview strip counts only `pending`/`confirmed` bookings — both views now use the same inputs, so the "Open on this date" line and the Overview pills agree.
- **D6 hardened**: `updateUser({ phone })` only opens the OTP modal when `data.user.new_phone === e164` (a pending change). If Supabase's "Enable phone confirmations" is OFF, no code is sent and the UI says so instead of dead-ending. Pending OTP state is cleared on every modal close.
- `refreshOverviewCourtWidget()` got a request-sequence guard (`overviewRequestSeq`) so fast date changes can't paint stale data.
- Receipt: hours fall back to `duration_minutes` when `end_at` is absent; rate line uses the court's real `rateUnit` instead of a hard-coded "/hr".
- Footer starts visible in markup (Overview is the default panel and `setActivePanel()` only runs on navigation).
- `updateWizardButtons()` was not added — `updateSummary()` → `renderBookWizard()` already re-gates Next.

**Not verified live** (no signed-in session available to the agents): the receipt PNG side-by-side check, the OTP round trip, and "no console errors on load". Owner must run `database/schema/013_profile_phone_verified.sql` and enable Phone provider + confirmations + test-OTP numbers (docs/OWNER_ACTION_LIST.md E5) before mobile verification can be exercised.


---



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

## Post-implementation notes (Revision 4 as shipped)

- `.dash-notif-item-body` became a `<span>` rather than a `<div>`, since the
  notification item itself is now a `<button>` and `<div>` is not valid content
  inside one. `display: flex` makes it render identically either way.
- `.inigo-reveal` in `Style/Loading.css` is the only shared file touched; the
  reveal fade was smoke-tested on the owner and staff dashboards and still
  toggles opacity 0 -> 1 correctly, with no transform reintroduced.
- Not verified live (no signed-in Supabase session available in the sandbox):
  the `profiles.avatar_url` write round-trip against the real database, and the
  notification -> receipt jump against real booking rows. Both were exercised
  through the real code paths with a stubbed `window.sb` query chain, but need
  a signed-in browser pass to be considered confirmed.
