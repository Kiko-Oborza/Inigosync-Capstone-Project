# Auth placeholder fix · Courts+Pricing merge · Multi-hour booking

## Context

Three user-reported issues on IñigoSync, in increasing order of depth:

1. **Auth password looks pre-typed.** The login and admin-login password fields
   use the literal glyph string `••••••••` as their `placeholder`
   ([Index.html:402](Pages/Index.html:402), [Index.html:697](Pages/Index.html:697)).
   An empty field therefore renders bullets and reads as "a password is already
   typed here." There is **no hardcoded value** anywhere — verified: no
   `value=` on any password input, and no `.value =` assignment to a password
   field in [auth.js](includes/auth.js) (its only 5 `.value =` hits are the
   mobile-number digit filter and the OTP boxes). Two real secondary causes:
   the modal never calls `form.reset()` on open/close/tab-switch
   ([auth.js:578-612](includes/auth.js:578)), so a typed password survives
   reopening; and `autocomplete="current-password"` invites browser autofill
   whose usual tint is deliberately suppressed by
   [Auth.css:804-813](Style/Auth.css:804).

2. **Courts and Pricing are two sections that should be one.** They already
   share a single memoized `getCourts()` fetch, and the court modal *already*
   has a working rate line (`data-court-viewer-rate`,
   [landingPage.js:776-785](includes/landingPage.js:776)). So this is mostly a
   consolidation, not a build. It also restores the thesis spec's own wording,
   which names a single **"Facilities & Pricing"** feature
   ([SPEC_scope_and_limitations.md](docs/SPEC_scope_and_limitations.md)).

3. **Booking is single-hour only, with zero conflict checking.** Step 2 is a
   static grid of 12 hardcoded `<button data-dash-slot>` elements
   ([user_dashboard.html:526-539](Pages/user_dashboard.html:526)) — three are
   permanently `disabled` as pure mockup, and the grid is never regenerated per
   court or date. Selection is single-select
   ([Dashboard.js:880-887](includes/Dashboard.js:880)), and the insert
   ([Dashboard.js:965-971](includes/Dashboard.js:965)) sends only a single
   `time_date` start timestamp with **no availability query beforehand and no
   DB constraint behind it**. The QA audit already flags this as a P1 defect
   against the paper's core "prevents double booking" objective.

Intended outcome: an honest empty password field, one combined Courts &
Pricing section with prices in the court modal, and a booking flow where a
customer picks a real range (8 AM–12 PM) that is validated against existing
bookings both in the UI and at the database level.

## Decisions I made for you (override any of these)

`AskUserQuestion` is disabled in this session, so these are my calls:

- **D1 — Password:** text placeholder + `form.reset()` on modal open, and
  *restore* a visible autofill tint rather than fighting the browser. Autofill
  stays functional (it's good UX and the field is genuinely empty until the
  browser fills it). If you want the browser blocked from ever filling it,
  say so — that's a small follow-up, not a redesign.
- **D2 — Merge:** delete `#pricing` entirely, move its detail into the court
  modal, **and** keep the rate on each grid card so prices stay scannable.
- **D3 — Availability scope:** **per unit.** Persist the Court 1 / Lane 2
  choice the wizard already collects but currently throws away. Per-sport
  blocking would wrongly make one Basketball booking block all 3 basketball
  courts — visibly wrong in a demo.
- **D4 — Enforcement:** app-level check **plus** a DB `EXCLUDE` constraint, so
  a race between two simultaneous users cannot produce an overlap. Walk-in
  bookings are a *separate table* and are **out of scope** (see Non-goals).

## Approach

### Part 1 — Auth password field

Small, self-contained, no dependencies on Parts 2–3.

- Replace the `••••••••` placeholders with real text (`Enter your password`)
  at [Index.html:402](Pages/Index.html:402) and
  [Index.html:697](Pages/Index.html:697). Leave the Sign Up / Reset fields
  alone — they already use descriptive text and `new-password`.
- In `openModal()` ([auth.js:578](includes/auth.js:578)), reset the panel's
  form before focusing the first field. Must call `syncPasswordRules()`
  afterwards, because `form.reset()` fires no `input` event and the signup
  password checklist is driven by that event — this exact pairing already
  exists at [auth.js:1652](includes/auth.js:1652), reuse the pattern.
- In [Auth.css:804-813](Style/Auth.css:804), keep the `-webkit-autofill`
  repaint (it exists to fix a real prior "Log In boxes are a different colour"
  bug) but add a distinguishing cue — a left accent border or subtle tint — so
  an autofilled field is no longer byte-identical to an empty one.

Note for the implementer: the `Remember me` checkbox at
[Index.html:411](Pages/Index.html:411) is completely unwired (nothing reads
`remember` anywhere). It is **not** the cause. Leave it alone.

### Part 2 — Merge Courts + Pricing

- **Delete** `<section id="pricing">` ([Index.html:132-162](Pages/Index.html:132)),
  `renderPricingRow()` ([landingPage.js:593-614](includes/landingPage.js:593)),
  and its `[data-pricing-list]` wiring
  ([landingPage.js:942-955](includes/landingPage.js:942)).
- **Nav:** remove both `<a href="#pricing">` items
  ([Index.html:52](Pages/Index.html:52), [Index.html:90](Pages/Index.html:90))
  and relabel the Courts link "Courts & Pricing". Leaving them would create
  dead links — the scroll-spy filters missing targets out silently
  ([landingPage.js:1040-1099](includes/landingPage.js:1040)), so nothing
  throws, but clicks would go nowhere.
- **Courts section copy:** fold the pricing explainer (rates are owner-managed,
  currently TBA) into the section intro at
  [Index.html:119-129](Pages/Index.html:119) and update the heading/eyebrow to
  cover both.
- **Modal price block:** expand `[data-court-viewer-rate]`
  ([Index.html:329](Pages/Index.html:329)) into a small block showing
  **What you book** (`quantity` + `unit`) and **Rate**, populated in `open()`
  at [landingPage.js:776-785](includes/landingPage.js:776). Port the nicer
  pill styling from `.pricing-rate-value.is-tba`
  ([LandingPage.css:1367-1378](Style/LandingPage.css:1367)) onto
  `.court-viewer-rate.is-tba` before deleting the `.pricing*` block
  ([LandingPage.css:1295-1397](Style/LandingPage.css:1295) plus its responsive
  overrides around lines 1667-1682, 1878-1881, 1912-1913).

Reuse, do not rewrite: `getCourts()` is memoized
([landingPage.js:483-502](includes/landingPage.js:483)); `mergeCourtsBySport()`
([landingPage.js:236-281](includes/landingPage.js:236)) already folds Bowling's
two rows into one card while preserving `court.variants` for the modal's unit
picker. Every court's `rate` is `NULL` in the seed, so **"Rate TBA" is the
correct live output** — do not invent numbers to make it look finished.

### Part 3 — Multi-hour booking with availability checking

**3a. Single source of truth for operating hours.** Three hardcoded, mutually
inconsistent hour lists exist today: the Step-2 HTML (8 AM–8 PM, *skips noon*),
`OVERVIEW_SLOT_HOURS` ([Dashboard.js:1151](includes/Dashboard.js:1151),
includes noon), and `SCHEDULE_SLOTS` ([staff_dashboard.js:813](includes/staff_dashboard.js:813),
2-hour columns). Add `includes/businessHours.js` exporting `OPEN_HOUR = 8` /
`CLOSE_HOUR = 21` plus a label formatter, and point all three at it. Load it
before the consumers in each page's `<script>` block.

**3b. Schema migration — `database/schema/012_booking_time_range.sql`.**
The `booking` table has no `CREATE TABLE` in this repo (it predates schema
tracking; see [004_staff_module.sql:22-27](database/schema/004_staff_module.sql:22)),
so this is `ALTER`-only, following the `add column if not exists` style already
used there.

- Add `end_at timestamptz` — a **plain column, not generated**. `timestamptz +
  interval` is STABLE, not IMMUTABLE, so a generated column or a bare
  expression index over `time_date + make_interval(...)` will be rejected by
  Postgres. Backfill: `end_at = time_date + make_interval(mins =>
  coalesce(duration_minutes, 60))`, then `set not null` + `check (end_at >
  time_date)`.
- Backfill `duration_minutes` nulls to 60 and give it `not null default 60`.
- Add `court_unit text null` (D3) — the label the wizard already shows, e.g.
  `Court 1`, `Duckpin`.
- `create extension if not exists btree_gist;` then:
  ```sql
  alter table public.booking
    add constraint booking_no_overlap
    exclude using gist (
      courts with =,
      coalesce(court_unit, '') with =,
      tstzrange(time_date, end_at, '[)') with &&
    ) where (status in ('pending', 'confirmed'));
  ```
  `'[)')` is deliberate: a booking ending at 12:00 must not collide with one
  starting at 12:00.
- Add a `before insert or update` trigger filling `end_at` from
  `duration_minutes` when null, so any legacy/other insert path keeps working.
- The migration must be **idempotent and re-runnable** (drop constraint if
  exists before adding), matching the defensive style of
  [010_booking_unattended_status.sql](database/schema/010_booking_unattended_status.sql).

**3c. Step 2 UI — data-driven range picker.** Replace the 12 static buttons at
[user_dashboard.html:526-539](Pages/user_dashboard.html:526) with an empty
`<div class="dash-slot-grid" data-dash-slot-grid>` rendered by JS.

- New `renderSlotGrid()` in [Dashboard.js](includes/Dashboard.js) runs whenever
  court **or** date changes. For each hour in `[OPEN_HOUR, CLOSE_HOUR)` it
  emits a button marked available / booked / past.
- New `fetchDayBookings(courtName, dateStr)` queries `booking` for that court
  and that calendar day where `status in ('pending','confirmed')`, returning
  `{ court_unit, time_date, end_at }`. An hour is blocked for the currently
  selected unit if any returned row overlaps it. **Reuse the existing overlap
  math** — `overviewBookingWindow()` / `overviewWindowsOverlap()`
  ([Dashboard.js:1214-1223](includes/Dashboard.js:1214)) already implement
  `a.start < b.end && b.start < a.end`; generalise those (currently hardcoded
  to *today*) rather than writing a third copy.
- **Range selection:** first click sets start, second click sets end. Clicking
  the start again, or clicking before it, resets to a new start. Hours between
  start and end render as `.is-in-range`. A range may not span a booked hour —
  selecting past one clamps the selection and explains why.
- Store `bookingState.startHour` / `endHour` instead of the single
  `bookingState.time` string. `slotTo24h()`
  ([Dashboard.js:904](includes/Dashboard.js:904)) becomes unnecessary for
  submission but the label formatter is still useful.
- Also fix the date input at [user_dashboard.html:521](Pages/user_dashboard.html:521):
  it has a hardcoded `value="2026-07-14"` and no `min`. Default it to today and
  set `min` to today so past dates can't be picked.

**3d. Summary, pricing, and insert.**
- `updateSummary()` ([Dashboard.js:828-859](includes/Dashboard.js:828))
  currently computes `rate × (pct or 1)` with **no hours multiplier**. It must
  become `rate × hours × (pct or 1)`, and the Time row must read a range
  ("8:00 AM – 12:00 PM · 4 hrs").
- The insert ([Dashboard.js:965-971](includes/Dashboard.js:965)) gains
  `end_at`, `duration_minutes`, and `court_unit`. Preserve every existing
  payload rule documented in the comment block above it — `sports` is NOT NULL
  and must be the real sport not a copy of `courts`; `status` starts
  `'pending'`; `payment_id` / `booking_id` / `created_at` stay **omitted**, not
  null.
- Re-check availability immediately before insert, and handle Postgres
  **`23P01`** (exclusion violation) as a friendly "that slot was just taken —
  please pick another time" alongside the existing `23502` / `23514` handling.

**3e. Downstream displays.** Bookings are now ranges, so:
- `formatBookingTime()` ([Dashboard.js:1642-1645](includes/Dashboard.js:1642))
  → render `start – end`; My Bookings row at
  [Dashboard.js:1783](includes/Dashboard.js:1783) follows.
- Staff Booking Overview's Time column
  ([staff_dashboard.js:254-256](includes/staff_dashboard.js:254)) → same.
- Staff Court Schedule ([staff_dashboard.js:840-875](includes/staff_dashboard.js:840))
  and the Overview peek widget already do duration-aware overlap and should
  start spanning correctly for free — **verify**, don't assume.

## Files to change

| File | Intent |
|---|---|
| [Pages/Index.html](Pages/Index.html) | Password placeholders (402, 697); delete `#pricing` (132-162); nav links (52, 90); courts copy + modal price block |
| [includes/auth.js](includes/auth.js) | `form.reset()` + `syncPasswordRules()` in `openModal()` |
| [Style/Auth.css](Style/Auth.css) | Distinguishable autofill state (804-813) |
| [includes/landingPage.js](includes/landingPage.js) | Delete `renderPricingRow()` + wiring; enrich modal `open()` price block |
| [Style/LandingPage.css](Style/LandingPage.css) | Port `.pricing-rate-value` pill onto `.court-viewer-rate`; delete dead `.pricing*` rules |
| `database/schema/012_booking_time_range.sql` | **New.** `end_at`, `court_unit`, `duration_minutes` NOT NULL, `EXCLUDE` constraint, trigger |
| `includes/businessHours.js` | **New.** Shared `OPEN_HOUR` / `CLOSE_HOUR` + label helper |
| [Pages/user_dashboard.html](Pages/user_dashboard.html) | Empty slot grid container; date `min`/default; summary rows |
| [includes/Dashboard.js](includes/Dashboard.js) | `renderSlotGrid`, `fetchDayBookings`, range state, hours-aware total, insert payload, range display |
| [Style/Dashboard.css](Style/Dashboard.css) | `.dash-slot` range states (`.is-in-range`, `.is-range-start/end`, `.is-past`) |
| [includes/staff_dashboard.js](includes/staff_dashboard.js) | Range in Time column; shared hours constant |

## Constraints and non-goals

- **Rates are `NULL` in the live DB.** "Rate TBA" is correct output everywhere.
  Never invent a price to make a screen look complete.
- **Do not alter the auth security flow** — OTP gate, single-session, trusted-device
  markers in [auth.js](includes/auth.js) are untouched by Part 1.
- **`walk_in_booking` overlap is out of scope.** A single-table `EXCLUDE`
  cannot span two tables; covering it needs a trigger. Customer bookings will
  not see walk-in conflicts. **Call this out in the final report** rather than
  quietly leaving it.
- **Do not "fix" the unwired Remember-me checkbox** as part of this.
- No payment integration, no `payment` row creation — unchanged.
- Vanilla JS only. No build step, no framework, no new dependencies.
- Preserve the codebase's heavy explanatory comment style — it is deliberate
  and documents live-DB facts that are not recoverable from the repo.

## Success criteria

1. Opening Log In shows an **empty** password field with readable placeholder
   text, not bullets. Typing a password, closing, and reopening the modal shows
   an empty field again.
2. Browser-autofilled fields are visually distinguishable from empty ones.
3. `#pricing` no longer exists; no dead `#pricing` nav link remains; every
   price previously on the pricing sheet is reachable from the court modal.
4. Court modal shows "What you book" + Rate (or the TBA pill) for all 8 sports,
   including both Bowling variants via the unit picker.
5. Step 2 slot grid is generated from real data and re-renders when court or
   date changes; the three fake `disabled` slots are gone.
6. A customer can select 8 AM → 12 PM and submit **one** booking whose
   `time_date` = 08:00, `end_at` = 12:00, `duration_minutes` = 240.
7. If a booking exists 10–11 AM on that court+unit, the 10 AM cell renders
   booked and an 8 AM–12 PM range is refused with a clear message.
8. Total = `rate × hours` (× downpayment pct when selected), not `rate × 1`.
9. A direct SQL insert of an overlapping row is rejected by the DB with
   `23P01` — the guarantee does not depend on the client.
10. My Bookings and the staff Booking Overview show `start – end`; the staff
    Court Schedule spans a multi-hour booking across its columns.

## Verification

Serve the site (do **not** use Bash for this — use the `static-server` config
in [.claude/launch.json](.claude/launch.json), port 8532):

```bash
python -m http.server 8532
```

- **Part 1:** open `/Pages/Index.html`, click Log In. Inspect the password
  input — `value` must be `""`. Type, close, reopen: still `""`. Repeat on the
  Admin Log In panel.
- **Part 2:** confirm no `#pricing` section and no dead nav link; open several
  court modals and check the price block, including Bowling's Duckpin/Ten-Pin
  variants. Check the ≤900px breakpoint, since the deleted `.pricing` rules had
  their own responsive overrides.
- **Part 3, migration:** apply `012_booking_time_range.sql` against Supabase.
  Before adding the `EXCLUDE` constraint, run query 10 of
  [database/qa/001_introspect.sql](database/qa/001_introspect.sql) — **its
  column names are wrong** (it assumes `booking_date`/`start_time`/`end_time`,
  which do not exist; the real columns are `time_date` + the new `end_at`), so
  fix it to match and use it to find pre-existing overlaps. **The constraint
  will fail to create if any conflicting rows already exist** — resolve those
  first, and report what was found.
- **Part 3, happy path:** sign in as a customer, book 8 AM–12 PM, confirm one
  row with the expected `time_date` / `end_at` / `duration_minutes` /
  `court_unit`, and a total of `rate × 4`.
- **Part 3, conflict path:** with that booking live, reload Step 2 — hours 8–12
  render as booked for that unit and **remain free for a different unit**.
  Attempt an overlapping range and confirm the refusal message.
- **Part 3, race path:** run two overlapping inserts directly in the Supabase
  SQL editor; the second must fail with `23P01`.
- Console must be clean throughout — no errors from removed `[data-pricing-list]`
  or removed static slot buttons.

## Open questions and risks

- **`booking` has no tracked `CREATE TABLE`.** All live-schema knowledge comes
  from [docs/QA_AUDIT_REPORT.md](docs/QA_AUDIT_REPORT.md) (built from HTTP
  probes on 2026-08-27) plus working app code. **Introspect the live table
  before writing the migration** — do not trust the audit blindly.
- **RLS policies on `booking` are invisible to this repo.** If the customer
  role cannot `select` other users' bookings, `fetchDayBookings()` returns an
  empty set and the grid will cheerfully show everything as available. **This
  is the single most likely way this feature silently fails.** Verify read
  access early; if it's blocked, an availability RPC (`security definer`,
  returning only busy time ranges and no customer identities) is the fix — flag
  it rather than leaking booking owners to every signed-in user.
- Pre-existing overlapping rows may block the `EXCLUDE` constraint (see above).
- `booking.courts` is free text. The `EXCLUDE` constraint matches on that
  string, so any inconsistency in how a court name is written creates a
  loophole. Confirm the wizard is the only writer and that it always uses the
  canonical `court.name`.
- D3 (per-unit) means bookings made *before* this change have `court_unit =
  NULL`; `coalesce(court_unit,'')` groups them together, so legacy rows behave
  as sport-wide blocks. Acceptable, but worth stating in the report.

---

## As-built notes (2026-09-08)

Implemented in two parallel lanes. Deviations from the plan above, all accepted:

- **`openModal()` resets ALL auth panels, not just the active one.** Triggers always
  open to `login`, and tab switches go through `setActivePanel()` which never reaches
  `openModal()` — so resetting only the active panel would leave a stale Sign Up
  password and a stale rules checklist behind.
- **`[data-court-viewer-count]` was removed entirely**, not kept alongside the new
  "What you book" row — the two showed identical `quantity + unit`.
- **Court modal price rows are stacked (label above value)**, not side-by-side: the
  TBA rate is a full sentence and fought the label for horizontal space.
- **Courts section kept `--surface-page`** (not Pricing's old `--surface-band`) so the
  Courts → About handoff stays seamless now that the band between them is gone.
- **A single clicked hour is a complete booking** — no forced second click. Requiring
  two clicks to book one hour would regress the existing UX.
- **`SCHEDULE_SLOTS` went from 6 columns to 7** on the staff Court Schedule, now
  derived from `hoursRange(2)`. The old hardcoded list silently omitted the 8 PM
  column; this is a coverage fix, not a cosmetic change.
- **Step 1's unit selection is now persisted** (`bookingState.unit` → `court_unit`).
  It was preview-only before; per-unit availability requires it.
- **`Pages/staff_dashboard.html` was edited** (one `<script>` tag) despite not being
  in the lane's file list — `staff_dashboard.js` would otherwise reference
  `window.InigoBusinessHours` before it exists.

### Deployment gate

`012_booking_time_range.sql` is **not applied**. Until it is, the customer booking
insert fails: it sends `end_at` / `duration_minutes` / `court_unit`, and PostgREST
rejects unknown columns. Read paths degrade gracefully (`fetchDayBookings()` retries
without the new columns on a schema-mismatch error).

### Still unresolved

- **RLS on `booking` is unverified.** If a customer cannot `SELECT` other customers'
  bookings, the Step 2 grid shows false availability and the `23P01` handler becomes
  the only real guard. Fix if confirmed: a `security definer` RPC returning busy
  ranges only, never customer identities.
- **Walk-in collisions remain possible** — `walk_in_booking` is a separate table and
  one `EXCLUDE` constraint cannot span two. Customer-vs-customer is prevented;
  customer-vs-walk-in is not.
