# IñigoSync — QA Remediation Plan

> Supersedes the previous landing-page plan, which is complete and archived in
> git history. Driven by `docs/QA_AUDIT_REPORT.md` (2026-08-27).

## Goal

Close the gap between what the thesis paper promises
(`docs/SPEC_scope_and_limitations.md`) and what the system actually does — in
priority order, so that at every stopping point the project is more defensible
than it was before.

## Context and current state

8 of 31 scope requirements are implemented, 12 partial, 11 missing. One of the
four stated Objectives (Payment Automation) has no code at all. The landing page
and auth layer are genuinely wired to Supabase; almost everything behind the
login is presentation over hardcoded arrays.

Live-verified: RLS is enforced on content tables; Google OAuth is enabled; the
`notification` and `audit_log` tables do not exist; the `.test` demo accounts do
not exist (the real-email variant was applied instead).

## Approach and architectural decisions

**D1 — Fix truthfulness before features.** Any UI text claiming a capability the
system lacks gets removed or corrected first. A panelist reading "already paid
through PayMongo" on a system with no payment code is a worse outcome than a
missing feature honestly labelled. Cheap, and it de-risks the demo immediately.

**D2 — One source of truth for courts: the `court` table.** The customer
dashboard and admin Court Listings currently hardcode two different court lists
that both contradict the landing page. Both get rewired to read `court`/`sport`
from Supabase, reusing the fetch-with-static-fallback pattern already proven in
`includes/landingPage.js`. Admin Court Listings becomes real CRUD against that
same table, so an admin edit is visible on the landing page on next load.

**D3 — Reuse `escapeHtml`, do not reinvent it.** The helper in
`includes/landingPage.js:30` is correct and already handles all five characters.
It moves to a shared file and gets applied to every `innerHTML` interpolation in
the three dashboard controllers. No templating library, no framework.

**D4 — Anything time-triggered must be server-side.** Automatic cancellation
(30-min grace) and the 5h→0h booking reminder cannot run in browser JS — that
only executes while somebody has the tab open, and the spec requires them to
fire regardless. These need `pg_cron` + a Postgres function, or a scheduled Edge
Function. Because there is no service_role key in this environment, these ship as
**SQL files the owner applies manually**, not as code the Coder can deploy.

**D5 — Double-booking prevention belongs in the database, not the client.** A
client-side conflict check loses to two simultaneous requests. The fix is a
Postgres exclusion constraint (`btree_gist` over court + time range), which makes
the guarantee unbreakable regardless of what the frontend does. Client-side
checking is added on top only for a friendly error message.

**D6 — Session Expiration is frontend; Single Session needs the database.**
Idle auto-logout is a plain activity-listener + timer, done entirely in
`includes/authGuard.js`. Single Session requires knowing that a *newer* session
exists elsewhere, which means a server-side record — an `active_session` table
with the current session ID per user, checked on focus/interval.

**D7 — Payment and email are gated on owner-supplied accounts.** PayMongo needs
a merchant account and a secret key that must live in an Edge Function, never in
the repo. Gmail delivery needs a mail provider and verified domain. Both are
blocked on the owner; the plan builds everything up to the integration boundary
and stops there.

**D8 — UI changes stay within the existing design language.** Oswald/Inter,
dark-first theming, pill navbar. Changes are made where the audit found real
defects (frozen stat tiles, dead buttons, false claims), not as a rebrand.

## Phases

Phase 1 is unambiguous and has no trade-offs. Phases 2+ need owner decisions.

### Phase 1 — Security and truthfulness *(no owner input needed)*

| Item | Files |
|---|---|
| Extract `escapeHtml` to a shared helper; apply to every dashboard `innerHTML` | `includes/` (new shared file), `staff_dashboard.js`, `owner_dashboard.js`, `Dashboard.js`, `landingPage.js` |
| Fix attribute injection in the staff-edit modal | `owner_dashboard.js:291` |
| Verify "Current password" via re-authentication before `updateUser` | `Dashboard.js:589`, `owner_dashboard.js:547` |
| Remove the false PayMongo claim and any other unbacked UI copy | `Pages/staff_dashboard.html:102` |
| PH mobile-number validation on signup and settings | `Pages/Index.html:328`, `Dashboard.js:567` |
| Make the Email settings field read-only (it is silently discarded today) | `Dashboard.js`, `Pages/user_dashboard.html` |
| Write the Terms & Conditions page covering all 5 mandated topics; wire the checkbox link | new `Pages/terms.html`, `Pages/Index.html:341` |
| Fix dead links: "Forgot password?", Details/View/Download | `Pages/Index.html:300`, `Dashboard.js` |

### Phase 2 — One source of truth for courts

Rewire the customer dashboard's Court Information and Booking Management option
lists to read `court`/`sport` from Supabase. Convert admin Court Listings from
`console.log` placeholders into real CRUD. Render hourly rate on landing cards
and add a `rating` column so Facilities & Pricing matches the spec.

### Phase 3 — Make the staff module operable

Render Confirm / Time-In / Time-Out actions on *real* booking rows. Persist
walk-in customer name and mobile. Add the `audit_log` table and write to it on
every booking state change, then render Transaction Records from it. Drive the
Court Schedule grid from real bookings.

### Phase 4 — Booking integrity and lifecycle *(SQL, owner-applied)*

Exclusion constraint against double booking. `pg_cron` job for the 30-minute
grace-period auto-cancel that reopens the slot. `notification` table plus the
5h→0h reminder job. RLS hardening on `profiles.role` if introspection shows it
is writable.

### Phase 5 — Payment *(blocked on owner)*

PayMongo Edge Function, real receipt/invoice generation, and the live loading
phase on payment matching the login overlay.

### Phase 6 — Session security

Idle session expiration. `active_session` table and single-session enforcement.
Login OTP, if confirmed as wanted on every login.

## Status

| Phase | State | Commit |
|---|---|---|
| 1 — Security & truthfulness | **Done, verified** | `953d431` |
| 2 — One source of truth for courts | **Done, verified** | `23f3d9c` |
| 3 — Staff module operable | **Done, verified** | working tree |
| 4 — Booking integrity & lifecycle | Blocked on `pg_cron` check | — |
| 5 — Payment (PayMongo **test mode**) | Blocked on owner account | — |
| 6 — Session security (OTP = **first-login-per-device**) | **Done, verified** | working tree |

### Owner decisions recorded (2026-08-28)
- **PayMongo:** demo/test mode only, no real money. Secret key lives in a
  Supabase Edge Function, never the repo.
- **Email:** no domain owned. Recommendation: **Resend** via its shared
  `onboarding@resend.dev` sender (free, no domain). Brevo is the fallback if
  Gmail deliverability matters. Build provider-agnostic.
- **OTP:** scoped to **first login per device**, not every login.
- **Live auth testing:** approved and performed — see the audit report's
  "Authenticated per-role testing" section.

### Live verification performed against the real backend
- Privilege escalation (customer → admin) is **blocked by a DB trigger**
  (`P0001: role cannot be changed directly`). Audit P2#5 closed.
- RLS read scoping on `profiles` is correct per role.
- An authenticated **admin can write to `court`** (PATCH 200), so the Phase 2
  admin CRUD works at runtime.
- The Phase 2 embedded query `court?select=*,sport(id,slug,name)` returns
  **HTTP 200 with all 9 courts** — the join and ordering are valid.
- Every `court` query uses `select('*')`, never an explicit `rating` column, so
  the code runs correctly **both before and after** `003_court_rating.sql`.

## Constraints and non-goals

- No build step, no framework, no npm. Node is not installed on this machine.
- Never commit a `service_role` key, a PayMongo secret, or any mail provider key.
- Anything requiring elevated DB access ships as a reviewed `.sql` file for the
  owner to run — the Coder cannot and must not execute it.
- Do not invent court prices. Rates come from the `court` table or stay blank
  with the existing `TODO: confirm with Ms. Driz` note.
- The paper's Limitations stand: single branch, network-dependent. Do not build
  multi-branch support or offline mode.

## Success criteria

**Phase 1**
1. A user registered as `<img src=x onerror=alert(1)>` renders as literal text in
   the staff table, the admin staff list, and the customer's own bookings.
2. A `"` in a staff member's name no longer breaks the edit modal's markup.
3. Changing a password fails with a clear error when the current password is wrong.
4. No UI string claims a capability the code does not have.
5. `09171234567` is accepted; `abc` and `123` are rejected, on both signup and settings.
6. The T&C link opens a page containing all five mandated sections.
7. Every visible button either does something or is removed.

**Later phases** — restated at the start of each phase, once its owner decisions
are settled.

## Verification steps

Browser tooling was unavailable this session, so verification is:
- `grep` proof that no unescaped interpolation of user data remains.
- Backend behaviour re-probed with `curl` where the anon key permits.
- `database/qa/001_introspect.sql` results, once the owner runs them.
- **Anything visual remains unverified** and must be checked by the owner, or by
  me in a session where the browser tools actually load.

## Open questions and risks

- **Q1 — PayMongo account?** Blocks Phase 5 entirely.
- **Q2 — Mail provider + verified domain?** Blocks Gmail reminders in Phase 4.
- **Q3 — OTP on every login, as the paper states, or first-login-per-device?**
- **Q4 — May I authenticate against the live project?** The sandbox blocked it;
  without it, role redirects and per-role RLS stay untested.
- **Risk.** No schema file exists in-repo for `profiles`, `booking`, `payment`,
  or `walk_in_booking`. Their real column names and constraints are inferred from
  application code. Phase 2+ SQL may need adjustment once introspection lands.
- **Risk.** The `invite-staff` Edge Function is called but its source is not in
  the repo. If it was never deployed, admin "Add staff" is already broken.
