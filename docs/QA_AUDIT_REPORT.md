# IñigoSync — QA Audit Report

**Date:** 2026-08-27
**Audited against:** `docs/SPEC_scope_and_limitations.md` (extracted from
*Inigosync_Introduction, scope and limitations.docx*)
**Method:** live HTTPS probing of the Supabase backend (`xrlwtnwamboucihsamrr`)
plus a full static audit of all 12,528 lines of application source.

> **Testing caveat, stated up front.** The browser/preview tooling described in
> this environment was not actually available in this session, so **no part of
> this system has been clicked through in a browser.** Backend findings marked
> *live-verified* were confirmed with real HTTP requests. Everything else is
> source-level evidence with `file:line` citations. Items that depend on
> database internals the anon key cannot see are marked **UNVERIFIED** and must
> be confirmed by running `database/qa/001_introspect.sql`.

---

## 1. Verdict

The system reads as far more complete than it is. The landing page and the
authentication layer are genuinely built and genuinely wired to Supabase. Almost
everything behind the login is **presentation without a backend** — hardcoded
`<article>` cards, `console.log` handlers, and stat tiles frozen at demo values.

Counting the scope document's own module list: **8 of 31 requirements are
implemented, 12 are partial, and 11 are missing outright.** Of the four stated
Objectives, one (Payment Automation) has no code at all.

The single most serious finding is not a missing feature — it is that
**the deployed UI makes claims the system cannot back up**, e.g. the staff
dashboard tells the operator that bookings "arrive already paid through
PayMongo" when no payment code exists anywhere in the repository.

---

## 2. Live backend findings (verified by HTTP)

| Probe | Result | Meaning |
|---|---|---|
| `sport`, `court`, `event`, `testimonial` | 200, seeded | Content tables are real and populated |
| `profiles`, `booking`, `payment`, `walk_in_booking` | 200, `[]` to anon | Exist; empty or RLS-hidden |
| `notification` | **404** | No table → web/Gmail reminders cannot work |
| `audit_log` | **404** | No table → Staff "audit trail" cannot work |
| `reviews`, `staff` | 404 | Correctly absent (superseded by `testimonial` / `profiles`) |
| Anonymous `INSERT` into `court` | **401 / `42501`** | **RLS genuinely enforced.** A real pass. |
| `GET /auth/v1/settings` | `google:true`, `email:true`, `mailer_autoconfirm:false`, `phone:false` | Google OAuth live; email confirmation required; no SMS provider |
| Password login, 3 `.test` demo accounts | `invalid_credentials` | The `.test` seed accounts do not exist; `003_update_user_emails.sql` was applied instead |

### Authenticated per-role testing — now performed (2026-08-27, owner approved)

Logged into the live project as all three real accounts (password `12345678`).

| Test | Result | Verdict |
|---|---|---|
| Customer login | 200, token issued | OK |
| Customer reads `profiles` | Sees **only their own row** | RLS read scope correct |
| Admin reads `profiles` | Sees **all three rows** | RLS read scope correct |
| **Customer PATCHes own `role` → `admin`** | **400 `P0001: role cannot be changed directly`; role unchanged** | **Privilege escalation BLOCKED at DB level** |

This closes audit item **P2#5** (the potential customer→admin escalation): a
Postgres trigger rejects any direct change to `profiles.role`. The client-side
role gate is backed by real server-side enforcement. **Confirmed non-issue.**

### End-to-end booking flow test (2026-08-28) — TWO NEW P0 BUGS FOUND

Created a real booking as the customer, actioned it as staff, then deleted it.
`booking` is back to 0 rows. This test found defects that **no amount of code
reading would have caught**, because they live in DB constraints not tracked in
this repo:

| Test | Result |
|---|---|
| Customer INSERT with `sports: null` — *exactly what the app sends today* | **HTTP 400 `23502`: null value in column "sports" violates not-null constraint** |
| Customer INSERT with `sports` populated | 201 — `booking_id` is an **integer** (4), and a `created_at` column exists |
| Staff SELECT `booking` + embedded `profiles(full_name, contact_num)` | 200 — the Phase 3 query works |
| **Staff UPDATE `booking` (confirm)** | **200 — staff DO have an UPDATE policy.** Phase 3's flagged unknown is resolved |
| Staff DELETE | 204 |
| `status` value probe | **A `CHECK` constraint exists.** Accepted: `pending`, `confirmed`, `cancelled`, `completed`. **Rejected (`23514`): `declined`, `no_show`** |

**NEW P0 — customer booking is currently 100% broken.**
`includes/Dashboard.js` inserts `sports: null`, but `booking.sports` is
`NOT NULL`. **Every customer booking attempt fails with HTTP 400.** This was
introduced when the earlier `sports`/`courts` duplicate-value bug was "fixed" by
setting `sports` to null instead of removing the key. The user sees only the
generic "Could not submit your booking" toast. Must be fixed before any demo.

**FIXED AND RUNTIME-VERIFIED (2026-08-28).** `includes/Dashboard.js` now resolves
`sports` from the selected court's real related sport (`court.sportName` via
`window.InigoCourtsData`), carried through `data-sport` on each `<option>` and
`data-dash-book-sport` on each Book Now button, with a court-name fallback so it
can never be null. `payment_id` is no longer sent at all — explicitly sending
`null` overrides a column default, which is the same bug class.

Verified by inserting the **exact payload the fixed code produces** against the
live database → **HTTP 201**. The test deliberately used `Bowling — Duckpin`,
where the court name and the real sport (`Bowling`) genuinely differ, proving the
sport is resolved rather than duplicated from the court name. `payment_id` came
back `null` without being sent, confirming the column is nullable/defaulted. Test
row deleted; `booking` is back to 0 rows.

**NEW P1 — `booking.status` is CHECK-constrained.** Any future code writing
`declined`, `no_show`, `expired`, or similar will fail with `23514`. Phase 3 was
checked against this and is compatible (it writes only `confirmed` / `cancelled`
/ `completed`). The Phase 4 auto-cancellation work **must** use `cancelled`.

**Booking schema, read from the insert path (`includes/Dashboard.js:366`):**
columns are `customer_id`, `sports`, `courts` (free-text court name), `time_date`
(a **single timestamp**, no end-time or duration), `status`, `payment_id`.
Implication for the "avoids double booking" objective: with only a start
timestamp and no duration, there is **no time range to test overlaps against** —
a DB-side exclusion constraint isn't currently possible without a schema change.
Tracked as a Phase 4 schema task.

---

## 3. Requirement coverage

Legend — **OK** implemented · **PART** partial · **STUB** UI exists, no backend · **GONE** missing

### Objectives

| # | Objective | Status | Evidence |
|---|---|---|---|
| 1 | Online Booking System | PART | `includes/Dashboard.js:340` writes real bookings; but "monitor schedules" is static markup (`Pages/user_dashboard.html:515`) |
| 2 | Admin Management System | PART | Staff CRUD real (`includes/owner_dashboard.js:152`); court management never touches the DB (`:399`) |
| 3 | Payment Automation | **GONE** | No gateway code anywhere; `payment_id: null` on every insert (`includes/Dashboard.js:366`) |
| 4 | Security System | PART | Real auth, but no login OTP, no single session, no session expiry, and stored XSS in all three dashboards |

### Landing Page Module

| Requirement | Status | Evidence |
|---|---|---|
| Home interface | OK | `Pages/Index.html:32` |
| Facilities & Pricing — rate, **rating**, type | PART | `includes/landingPage.js:371` renders type only; no rate, and `court` has no rating column (`database/schema/002_content_tables.sql:47`) |
| Business Overview | OK | `Pages/Index.html:146` |
| Login/Sign-in interface | OK | `Pages/Index.html:258` + `includes/auth.js` |

### Users Module

| Requirement | Status | Evidence |
|---|---|---|
| Login / registration incl. Google | OK | `includes/auth.js:249`, `:508` |
| Login as admin | OK | `includes/auth.js:326`; wrong-role credentials are signed back out (`:34`) |
| Terms & Conditions (5 mandated topics) | **GONE** | `Pages/Index.html:341` — required checkbox links to `href="#"`; none of the 5 topics exist anywhere in the repo |

### Security Module

| Requirement | Status | Evidence |
|---|---|---|
| Email OTP **on login** | **GONE** | `includes/auth.js:249` — login goes straight to `signInWithPassword`. OTP exists only after *sign-up* (`:260`), i.e. email verification, not login 2FA |
| Single Session | **GONE** | Zero matches repo-wide for device/session/revoke |
| Session Expiration (idle logout) | **GONE** | No idle timer anywhere; Supabase auto-refresh keeps sessions alive indefinitely |

### Customer Module

| Requirement | Status | Evidence |
|---|---|---|
| Dashboard Overview | STUB | `Pages/user_dashboard.html:171`; JS only cycles the month label (`includes/Dashboard.js:211`) |
| Court Information | STUB | 5 hardcoded cards, fake availability (`Pages/user_dashboard.html:364`); never reads `court` |
| Booking Management | PART | Summary math real (`includes/Dashboard.js:246`); court/rate/slot options hardcoded (`Pages/user_dashboard.html:500`) |
| Receipt / Invoice | **GONE** | Hardcoded "No receipts yet" (`includes/Dashboard.js:504`) |
| Account Settings | PART | Saves work (`:561`), but current password never checked (`:589`), no mobile validation, Email field editable yet silently discarded |
| User Profile | PART | Name/email/mobile real (`:515`); the 4 stat tiles frozen at `12/9/1/"July 2026"` (`Pages/user_dashboard.html:819`) |
| Automatic Cancellation (30-min grace) | **GONE** | Notice text only (`Pages/user_dashboard.html:552`); no cron, no edge function, no timer |

### Staff Module

| Requirement | Status | Evidence |
|---|---|---|
| Booking Overview | STUB | Fetch/search/filter real, but the Actions cell renders empty `<td></td>` for every real row (`includes/staff_dashboard.js:225`) — **staff cannot confirm or time-in a real booking** |
| Walk-In Management | PART | Sport+schedule persist (`:384`); customer name/mobile are UI-only; no payment, no receipt |
| Court Schedule | STUB | Static grid; only tab opacity is wired (`:450`) |
| Transaction Records / audit trail | **GONE** | Unconditionally wiped to "No transactions yet" (`:173`); `audit_log` 404s |
| Staff Profile | PART | Name/contact real (`:479`); 4 stat tiles hardcoded; **no password-change UI for staff at all** |

### Admin Module

| Requirement | Status | Evidence |
|---|---|---|
| Booking Overview — charts | **OK** | `event/chart.js:59` genuinely aggregates real `booking` rows |
| Booking Overview — active accounts + stat tiles | STUB | 100% static (`Pages/owner_dashboard.html:164`, `:256`) |
| Staff Management | PART | Add/Edit/Reset-password real; "Delete" only soft-disables (`:321`); Payment Configuration is `console.log` only (`:354`) |
| Account Settings | PART | Name+password real (`:524`); "Username" has no backing column and is never saved |
| Court Listings | **STUB** | `window.sb.from('court')` never appears in the file. Add/Edit/Activate are `console.log` on a hardcoded DOM list (`:399`–`:483`) |

### Required but not in the paper

| Requirement | Status | Evidence |
|---|---|---|
| Web + Gmail notification, once in the 5h→0h window | **GONE** | `notification` table 404s; zero matches for resend/sendgrid/smtp; only a decorative bell with a static dot |
| Live loading phase on payment | **GONE** | `window.InigoLoading` is used only by `auth.js`/`authGuard.js`; the booking submit never calls it |

---

## 4. Defects by severity

### P0 — blocks a defense demo

1. **No payment step exists.** The payment selector computes a total, then inserts
   with `payment_id: null`. Nothing charges or confirms. `includes/Dashboard.js:340`
2. **The UI states a false integration.** Staff dashboard subtitle: *"bookings
   arrive already paid through PayMongo."* No PayMongo code exists.
   `Pages/staff_dashboard.html:102`
3. **Staff cannot action a real booking.** Confirm/Time-In buttons are bound only
   to static demo rows that the loader deletes. `includes/staff_dashboard.js:206`, `:225`
4. **Admin court edits never persist.** Reload reverts to the 5 hardcoded cards.
   `includes/owner_dashboard.js:399`
5. **Terms & Conditions is a dead link** on a `required` checkbox.
   `Pages/Index.html:341`
6. **Login OTP absent** despite being a named scope item. `includes/auth.js:249`
7. **Single Session absent.** Two browsers, one account, both stay logged in.
8. **Three contradictory court lists.** Landing reads 9 real sports from Supabase;
   customer dashboard hardcodes a different 5; admin hardcodes yet another 5 with
   different names and rates. Navigating between them shows visibly conflicting data.

### P1 — spec requirement missing

Hourly rate and rating never rendered on court cards · customer Dashboard Overview
static · Court Information disconnected from `court` · no receipt generation ·
no automatic cancellation · walk-in loses customer name/mobile and issues no
receipt · staff Court Schedule static · no transaction records or audit trail ·
admin stat tiles hardcoded · payment configuration not persisted · no session
expiration · no booking notifications (web or Gmail) · **no double-booking
prevention** — the insert path performs no conflict check and no DB constraint is
confirmed to exist (**UNVERIFIED — must test before defense**, this is a named
objective).

### P2 — security

1. **Stored XSS reaching staff and admin sessions.** Customer-controlled
   `full_name` / `contact_num` / `courts` are rendered raw via `innerHTML`:
   `includes/staff_dashboard.js:219`, `includes/owner_dashboard.js:220`,
   `includes/Dashboard.js:461`. An `escapeHtml()` helper already exists and is used
   correctly in `includes/landingPage.js:30` — it was simply never applied to the
   three dashboard controllers.
2. **Attribute injection** — `value="${currentName}"` built from unescaped text.
   `includes/owner_dashboard.js:291`
3. **"Current password" is decorative.** Never read or verified before
   `auth.updateUser({password})`. Any hijacked session silently takes over the
   account. `includes/Dashboard.js:589`, `includes/owner_dashboard.js:547`
4. **No mobile-number validation**, though the spec explicitly requires it.
5. **UNVERIFIED — potential privilege escalation.** A customer can `UPDATE` their
   own `profiles` row (`includes/Dashboard.js:571`). If no RLS policy or trigger
   protects the `role` column, a crafted PATCH with the public anon key promotes
   customer → admin. **Test this before the defense** — query 5 and 7 of
   `database/qa/001_introspect.sql`.
6. `owner_dashboard.js:180` calls an edge function `invite-staff` whose source is
   not in this repo — cannot confirm what it does or that it is deployed.

### P3 — polish

Dead "Forgot password?" link · dead Details/View/Download buttons · frozen profile
and staff stat tiles · admin "Username" field with no backing column · no favicon ·
orphaned assets · Media Manager previews via `createObjectURL` and never uploads.

---

## 5. Confirmed non-issues

- **No secret leakage.** `Config/supabaseClient.js` holds only the publishable key.
  `003_update_user_emails.sql` contains a real password but is correctly gitignored
  and was never committed (`git log --all` on the path returns nothing).
- **RLS is real** on the content tables — proven by a rejected anonymous insert.
- **No contradiction of the paper's Limitations.** Nothing multi-branch, nothing
  offline-capable. Consistent with the stated single-branch, network-dependent design.
- **The admin booking-trends chart is genuine**, not mock data. `event/chart.js:59`
- **The landing page's data layer is solid** — escapes all interpolation and has a
  working static fallback when Supabase is unreachable.

---

## 6. Open questions for the project owner

1. **PayMongo.** A live e-wallet charge needs a merchant account and a secret key
   that cannot live in browser code — it requires a Supabase Edge Function. Is
   there a PayMongo account, or should this be built as a sandbox/test-mode flow?
2. **Gmail notifications.** Requires a mail provider (Resend was previously
   discussed) plus a scheduler. Is there a Resend account and a verified domain?
3. **Login OTP.** The paper says OTP on *every* login. That is a real UX cost.
   Confirm this is wanted as written, or scope it to first-login-per-device.
4. **Authenticated testing.** The sandbox blocked password logins to the live
   project. Approve it, or accept that role-based behaviour stays untested.
