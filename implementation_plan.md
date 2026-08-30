# Close out the three dashboards — Customer, Staff, Owner/Admin

## Goal

The landing page and auth layer are done and genuinely wired to Supabase. This
task closes the remaining real gaps in the three post-login pages —
`Pages/user_dashboard.html` (Customer), `Pages/staff_dashboard.html` (Staff),
`Pages/owner_dashboard.html` (Owner/Admin) — so that every visible number,
button, and settings field on those pages is either backed by real data or
honestly labeled as not-yet-available. No new visual redesign: the elevation
tokens shipped in the Landing Page Redesign already alias into
`Dashboard.css`/`Auth.css`, so this is a data-wiring and truthfulness pass,
verified visually, not a restyle.

## Context and current state

Re-verified against the live repo today (2026-08-31, clean tree at `2a79115`)
by reading the actual source, not by trusting prior status tables — the
archived plan's phase-status table (Phase 2/3 "done, verified") is correct
where it says the **court CRUD** and **staff booking/walk-in/schedule** paths
are real, but a separate, more recent investigation (superseded plan, now at
[docs/plans/archive/2026-08-31-loop-and-agent-redesign-plan-superseded.md](docs/plans/archive/2026-08-31-loop-and-agent-redesign-plan-superseded.md))
found — and I confirmed by direct read — that the **owner dashboard** still
has real gaps the earlier phases never touched:

**Confirmed still broken:**
- [Pages/owner_dashboard.html:169-190](Pages/owner_dashboard.html:169) — 4
  overview stat tiles hardcoded to `102`/`14`/`8`/`4`, no `data-*` binding.
- [includes/owner_dashboard.js:385](includes/owner_dashboard.js:385) — Payment
  Configuration save is `console.log('[admin] payment settings saved
  (placeholder)', …)`. Never persisted anywhere.
- [includes/owner_dashboard.js:877-957](includes/owner_dashboard.js:877) — 5
  more `console.log(… placeholder)` handlers, all in Media Manager (slide
  replace/remove/add, court-photo replace). These preview via
  `createObjectURL` and never upload.
- [includes/Dashboard.js:757-759](includes/Dashboard.js:757) only rewrites
  `metaItems[0]` (email) and `[1]` (mobile) in the customer Profile panel;
  `[Pages/user_dashboard.html:641-654](Pages/user_dashboard.html:641)`'s
  "Member since / Total bookings / Completed / Cancelled" tiles stay frozen at
  their markup literals (`July 2026` / `12` / `9` / `1`) forever.
- `Pages/staff_dashboard.html` has **no Account Settings panel and no
  password-change UI at all** — confirmed by grep, zero matches for a
  `settings`/`password` panel. Customer and Owner both have one with
  current-password re-verification (Phase 1, D1); Staff was never given one.
- The 50% downpayment split is hardcoded independently in
  [includes/Dashboard.js:304](includes/Dashboard.js:304) and the walk-in
  payment options are hardcoded independently in `staff_dashboard.js` —
  exactly the kind of duplicated-constant defect Phase 2 fixed for court data,
  just not extended to payment settings, which is exactly what the dead
  Payment Configuration panel was supposed to drive.

**Confirmed already correct (verified by direct read, not assumed):**
- Court Listings CRUD is real (`owner_dashboard.js:623-689`, writes to
  `court`), including a plain `image_url` text field on the edit form
  (`:543`, `:603`) — so court photos are **already settable without file
  upload**, which changes the Media Manager decision below.
- The staff attribute-injection bug (P2#2) is fixed — `owner_dashboard.js:304`
  now sets `.value` as a DOM property, not string-interpolated markup.
- `escapeHtml(` is in active use: 11 call sites in `owner_dashboard.js`, and
  it's applied at the two walk-in/schedule render sites in
  `staff_dashboard.js` I checked directly.
- Staff module is genuinely wired end-to-end: booking Actions cell renders
  real Confirm/Time-In/Time-Out per row (`staff_dashboard.js:298-306`), the 4
  overview stat tiles are `data-staff-stat`-bound and computed
  (`staff_dashboard.html:166-187`), walk-ins persist `customer_name` +
  `customer_mobile` to `walk_in_booking` (`:708-716`) with an audit-log write
  (`:731`), and the Court Schedule grid renders from real `booking` +
  `walk_in_booking` rows (`:867-907`). **Staff needs no functional rework** —
  only the settings-panel gap above and a verification pass.
- `courts-data.js` / `courtsData.js` are **not** duplicate sources of truth —
  they're a documented static-fallback array + a fetch-wrapper, the same
  fetch-with-fallback pattern used by the landing page (confirmed by the
  in-file comments at `user_dashboard.html:766-767`,
  `owner_dashboard.html:827-828`). No action needed here; the superseded
  plan's "four independent court lists" framing was overbroad on this point.

## Approach and architectural decisions

**E1 — Real numbers over fake numbers, using data already in flight where
possible.** The customer profile stats and staff/admin stat tiles compute from
data these pages already fetch (the customer's own bookings, the admin's
bookings/staff/sport queries) — no new tables required for stats.

**E2 — `app_settings`: one small table, admin-writable, becomes the single
source of truth for payment configuration.** New table:
`gcash_enabled boolean`, `cash_enabled boolean`, `downpayment_pct numeric`,
single row. Owner dashboard's Payment Configuration panel writes to it (real
persistence, replacing the placeholder). Customer booking (`Dashboard.js`)
and staff walk-in (`staff_dashboard.js`) both read it for their payment
options and downpayment split, with the current hardcoded values
(50%, GCash+Cash both on) as the static fallback if the table doesn't exist
yet or is empty — same fetch-with-fallback shape as courts. This finally
gives the Payment Configuration panel a real purpose instead of being a
form that saves nowhere.

**E3 — "Member since" comes from the auth session, not a new column.** No
schema file for `profiles` exists in this repo and its real columns are
unconfirmed (a standing risk noted in the archived plan). Rather than guess
at a `profiles.created_at` column that may not exist, use
`window.sb.auth.getSession()`'s `session.user.created_at`, which Supabase
Auth always provides. Zero schema risk.

**E4 — Media Manager gets the honest fix, not the expensive one.** Building
real file upload needs a Supabase Storage bucket + RLS policies — new
owner-provisioned infrastructure — for a job the edit form already does via
a plain `image_url` URL field. Per the project's established truthfulness
principle (D1 in the archived plan), the fix is to stop the upload widgets
from *looking* interactive when they silently do nothing: disable the
drag-drop/file-input controls, replace the click handlers with a short
explanatory state ("Paste a photo URL in Court Listings → Edit instead"),
and remove the `console.log` placeholders. This is a UI-truthfulness fix, not
new infrastructure — building real upload is left as a future task if the
owner later wants direct upload over URL-pasting.

**E5 — Staff Account Settings mirrors the existing pattern exactly.** Copy the
already-correct shape from `Dashboard.js`/`owner_dashboard.js`: re-authenticate
with the current password before calling `auth.updateUser({password})` (Phase
1, D1 — already fixed there, must not be skipped here).

**E6 — Small truthfulness cleanups on the admin side**, cheap and
low-risk: relabel staff-list "Delete" to "Deactivate" (matches the actual
soft-disable behavior already implemented); remove or clearly stub the
"Username" field in Account Settings since it has no backing column and is
silently discarded today.

## Files to change

- `Pages/owner_dashboard.html` — `data-*` bind the 4 overview stat tiles;
  disable/relabel Media Manager upload controls; relabel staff "Delete" →
  "Deactivate"; remove/stub the dead "Username" field.
- `includes/owner_dashboard.js` — compute real stat-tile values; wire Payment
  Configuration to `app_settings` (replacing the placeholder at `:385`);
  replace the 5 Media Manager placeholders per E4.
- `Pages/user_dashboard.html` — no structural change expected beyond
  `data-*` hooks if needed for the profile meta items.
- `includes/Dashboard.js` — wire the 4 remaining profile meta items (Member
  since via E3, Total/Completed/Cancelled from the customer's own bookings);
  read downpayment % / enabled methods from `app_settings` with the current
  hardcoded values as fallback.
- `Pages/staff_dashboard.html` — new Account Settings panel/nav entry
  (password change), matching the existing admin/customer settings panel
  markup shape.
- `includes/staff_dashboard.js` — wire the new settings panel (E5); read
  payment options from `app_settings` with fallback.
- `database/schema/007_app_settings.sql` — new, idempotent
  (`create table if not exists`), single-row `app_settings` with RLS: admin
  read/write, authenticated (customer/staff) read-only. Coder writes this file
  but **does not and cannot execute it** — ships for the owner to run.
- `docs/OWNER_ACTION_LIST.md` — add item A5 for the new migration, in the
  same style as A1–A4.

## Constraints and non-goals

- No visual redesign. Reuse existing `Dashboard.css`/`Auth.css` classes and
  the elevation tokens already aliased in from the Landing Page Redesign;
  this task is data-wiring plus truthfulness fixes, not new CSS.
- No PayMongo / real payment processing — still blocked on the owner per
  `docs/OWNER_ACTION_LIST.md` item C. `app_settings` only configures *which
  manual payment options are offered and at what split*, not any live charge.
- No automatic cancellation / `pg_cron` work — still Phase 4, still blocked
  on the owner's extension-availability answer (item B).
- No Supabase Storage / real file upload for Media Manager (E4) — out of
  scope by design, not an oversight; flagged as a future task if wanted.
- No receipt/invoice generation — genuinely blocked on Payment Automation
  having no code at all; the current honest "No receipts yet" stays as-is.
- Keep the fetch-with-fallback pattern for `app_settings`, exactly like courts:
  the app must work identically before and after the SQL migration is applied.
- Every new `innerHTML` interpolation of user- or DB-sourced text must use
  `window.escapeHtml` — no exceptions, this project has already paid for two
  stored-XSS bugs found by not doing this consistently.
- Do not touch the already-working staff booking/walk-in/schedule code paths
  beyond adding the settings panel and the `app_settings` payment-options read.
- Cannot execute SQL — `007_app_settings.sql` ships as a file only.

## Success criteria

1. Owner dashboard's 4 overview stat tiles show real, live-computed numbers
   (verify by comparing against actual row counts for bookings/sports/staff),
   not `102`/`14`/`8`/`4`.
2. Saving Payment Configuration in the admin panel actually persists (reload
   the page, values survive) — verified once `007_app_settings.sql` is applied;
   before it's applied, the save fails gracefully with a clear message, it
   does not silently no-op behind a fake success toast.
3. Customer Profile panel's Member since / Total bookings / Completed /
   Cancelled all reflect real values for a logged-in test account, not
   `July 2026`/`12`/`9`/`1`.
4. Staff has a working Account Settings panel: wrong current password is
   rejected with a clear error; correct current password + new password
   succeeds and the new password logs in afterward.
5. No `console.log(… placeholder)` remains in `includes/owner_dashboard.js`.
6. Media Manager's upload controls no longer look interactive while doing
   nothing — they're disabled with an explanation, not silently broken.
7. `grep -rn "console.log.*placeholder" includes/` returns nothing.
8. `node --check` passes on every edited `.js` file.
9. No new unescaped `innerHTML` interpolation of DB-sourced text introduced
   anywhere in this diff.
10. `007_app_settings.sql` is idempotent (safe to run twice) and RLS-scoped
    (anonymous cannot write; only admin can write; customer/staff can read).

## Verification steps

- Manual browser walkthrough (preview tooling) of all three dashboards,
  logged in as each role, light and dark theme: stat tiles, Payment
  Configuration save/reload, customer profile stats, staff settings
  password-change happy path and wrong-current-password path.
- `grep -rn "console.log" includes/owner_dashboard.js` to confirm the
  placeholder handlers are gone.
- `node --check` on every changed `.js` file.
- Read `007_app_settings.sql` for `IF NOT EXISTS`/idempotency and for an RLS
  policy that blocks anonymous writes (do not run it — no DB access here).
- Given this touches a new RLS-bearing table and a real auth flow
  (staff password change with re-authentication), route the resulting diff
  through the `reviewer` subagent before calling this done — focus areas:
  RLS correctness on `app_settings`, `escapeHtml` coverage on every new
  interpolation, and that the password re-auth flow matches the existing
  Dashboard.js/owner_dashboard.js pattern exactly (no shortcut that skips
  verifying the current password).

## Open questions and risks

- **Customer Dashboard Overview calendar** (the month-cycling widget with
  hardcoded "has-booking" dots on specific day numbers) is a known separate
  gap (QA audit: "Dashboard Overview STUB"). It's real but larger in scope
  (needs date-range logic against real bookings) and is **not** included in
  this task's success criteria — noted here rather than silently dropped.
  Pick it up as a fast follow if there's time after the above lands.
- **`profiles` schema is still unconfirmed** (no schema file in-repo). E3
  sidesteps this for "Member since" by using the auth session instead of a
  profiles column, so this task doesn't depend on the open question — but
  it remains a standing risk for any *future* task that does need a real
  `profiles` column.
- **Owner must actually run `007_app_settings.sql`** before Payment
  Configuration persistence and the payment-options read are live; until
  then, both sides fall back to today's hardcoded values by design (E2).
