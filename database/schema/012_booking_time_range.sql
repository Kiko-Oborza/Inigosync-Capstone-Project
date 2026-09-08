-- ============================================================================
-- IñigoSync — Schema: multi-hour booking + database-level overlap prevention
-- (Part 3, implementation_plan.md "Multi-hour booking with availability
-- checking")
-- ============================================================================
-- Run this in the Supabase SQL editor (Project → SQL Editor). `booking` has
-- no tracked CREATE TABLE in this repo — it was created directly in the live
-- Supabase project before this repo tracked schema files (see
-- database/schema/004_staff_module.sql's header note) — so, like that file,
-- this is ALTER-only against the existing table.
--
-- ----------------------------------------------------------------------------
-- READ THIS FIRST — the EXCLUDE constraint below WILL FAIL TO CREATE if any
-- overlapping 'pending'/'confirmed' rows already exist for the same
-- courts+court_unit today (a brand-new EXCLUDE constraint is validated
-- against every existing row, same as a UNIQUE constraint would be). Before
-- running this file, run query 10 of database/qa/001_introspect.sql (this
-- same change fixes that query's column names — it previously referenced
-- booking_date/start_time/end_time/id, none of which exist) and resolve any
-- rows it returns (e.g. cancel/reschedule one side) first. If `booking` is
-- empty or has no genuinely overlapping live rows today (the expected case
-- for this project pre-launch), this is a non-issue and the ADD CONSTRAINT
-- below will simply succeed.
-- ----------------------------------------------------------------------------
--
-- Safe to re-run in full: every ALTER uses `add column if not exists`, both
-- named constraints are dropped-then-recreated, the trigger function is
-- `create or replace`, and the trigger itself is dropped-then-recreated.
-- Running this file twice in a row is a no-op the second time (backfill
-- UPDATEs only touch rows still needing it, i.e. none, the second time).
--
-- Why this exists: docs/QA_AUDIT_REPORT.md's own note on the booking schema
-- ("only a start timestamp, no end-time or duration... no time range to test
-- overlaps against") and the paper's core "prevents double booking"
-- objective. `booking.time_date` is a single START timestamp only; there is
-- no way to know when a session ends, so there is nothing to test two
-- bookings' ranges against for a conflict. This file adds that end, plus a
-- real database-level guarantee that two overlapping 'pending'/'confirmed'
-- bookings can never both exist — not just an app-level check, which a race
-- between two customers submitting at the same instant could still slip
-- past (D4, implementation_plan.md: "app-level check PLUS a DB EXCLUDE
-- constraint").
-- ============================================================================


-- ----------------------------------------------------------------------------
-- end_at — a PLAIN, STORED column. NOT generated, and NOT indexed as a bare
-- expression over time_date. This is deliberate and is the single most
-- likely way this migration fails if "simplified":
--
--   `timestamptz + interval` is a STABLE function in Postgres, not IMMUTABLE
--   — its result can depend on the session's TimeZone setting (interval
--   arithmetic has to account for DST/zone rules). Postgres REQUIRES every
--   function used in a generated column, or in a plain (non-generated-
--   column) index expression, to be IMMUTABLE. `end_at timestamptz
--   generated always as (time_date + make_interval(mins =>
--   duration_minutes)) stored`, or an index built directly on the raw
--   expression `time_date + make_interval(mins => duration_minutes)`, both
--   get rejected by Postgres with "functions in index expression must be
--   marked IMMUTABLE" / the generated-column equivalent.
--
--   The fix is exactly what's below: compute the STABLE addition ONCE, at
--   write time (the one-time backfill UPDATE for existing rows, and the
--   trigger for every future insert/update), and store the plain result.
--   From then on, the EXCLUDE constraint's index is built over
--   `tstzrange(time_date, end_at, '[)')` — a function of two ALREADY-
--   MATERIALIZED timestamptz values, which is IMMUTABLE (it just packages
--   two existing points into a range; no timezone-sensitive arithmetic
--   happens at index-build or lookup time). Do not "simplify" this back to
--   a generated column or a bare expression index — it will not create.
-- ----------------------------------------------------------------------------
alter table public.booking
    add column if not exists end_at timestamptz null;

-- Backfill every existing row (customer bookings made before this migration
-- all have duration_minutes = 60 or null, per database/schema/
-- 004_staff_module.sql's default — coalesce covers the null case the exact
-- same way that column's own frontend readers already do).
update public.booking
set end_at = time_date + make_interval(mins => coalesce(duration_minutes, 60))
where end_at is null;

alter table public.booking
    alter column end_at set not null;

alter table public.booking
    drop constraint if exists booking_end_at_after_start;
alter table public.booking
    add constraint booking_end_at_after_start check (end_at > time_date);

comment on column public.booking.end_at is 'Real end of the booked range (Part 3). Plain stored column, NOT generated — see this file''s header comment on why a generated column or a bare time_date+interval index expression is rejected by Postgres (STABLE, not IMMUTABLE). Backfilled from time_date + duration_minutes for every pre-Part-3 row. Kept in sync with duration_minutes by the booking_fill_end_at trigger below for any insert/update path that only supplies one of the two.';


-- ----------------------------------------------------------------------------
-- duration_minutes — was nullable (database/schema/004_staff_module.sql);
-- now backfilled and required, since every insert path going forward
-- (includes/Dashboard.js's booking wizard) always knows a real duration.
-- ----------------------------------------------------------------------------
update public.booking
set duration_minutes = 60
where duration_minutes is null;

alter table public.booking
    alter column duration_minutes set default 60;
alter table public.booking
    alter column duration_minutes set not null;


-- ----------------------------------------------------------------------------
-- court_unit — the specific Court/Lane/Table label a booking occupies
-- (Part 3, D3). Nullable: every row made before this migration has no unit
-- recorded, and neither does a court with only one indistinguishable unit
-- (see includes/courtsData.js's resolveCourtUnits()). NULL is not "unknown"
-- in the same sense as end_at above — it's a legitimate "nothing to
-- disambiguate" or "predates this feature" state, which is exactly why the
-- EXCLUDE constraint below groups it with coalesce(court_unit, '') instead
-- of a NOT NULL column: two NULL-unit bookings on the same court MUST still
-- be checked for overlap against each other (they behave as one sport-wide
-- unit), which plain SQL equality (NULL = NULL is never true) would
-- otherwise silently fail to do.
-- ----------------------------------------------------------------------------
alter table public.booking
    add column if not exists court_unit text null;

comment on column public.booking.court_unit is 'Specific Court/Lane/Table label booked (Part 3, D3 — implementation_plan.md), e.g. "Court 1", "Duckpin". NULL for a pre-Part-3 row or a court with nothing to disambiguate — see booking_no_overlap below for how NULL is grouped for overlap purposes. Enables PER-UNIT availability: booking one Basketball court must not block a different Basketball court.';


-- ----------------------------------------------------------------------------
-- booking_no_overlap — the real database-level double-booking guarantee
-- (D4, implementation_plan.md). btree_gist lets a plain-equality column
-- (text) participate in a multi-column GiST EXCLUDE constraint alongside a
-- native GiST type (tstzrange) — without it, Postgres has no GiST operator
-- class for `=` on text/int/etc.
--
-- The '[)' bound on tstzrange is deliberate: a booking ending at 12:00 must
-- NOT collide with one starting at 12:00 (closed start, open end — the same
-- half-open convention this project's own overlap math, `a.start < b.end &&
-- b.start < a.end`, already uses in includes/Dashboard.js and
-- includes/staff_dashboard.js).
--
-- WHERE restricts this to still-open bookings only — a 'cancelled' or
-- 'completed' row never blocks a new one, matching every existing overlap
-- check in this codebase (they all skip cancelled bookings the same way).
-- `court_unit` note: coalesce(court_unit, '') — see that column's own
-- comment above for why NULL can't be compared with plain `=`.
--
-- LOOPHOLE THIS DOES NOT CLOSE: `courts` is free text, and this constraint
-- matches on that exact string. includes/Dashboard.js's booking wizard is
-- the ONLY writer of booking.courts in the whole project (confirmed by
-- grepping every `.from('booking')` call site) and always sends the
-- canonical `court.name` verbatim — so THIS constraint can't be bypassed by
-- a differently-formatted name from that flow. It also does not, and
-- cannot, protect `walk_in_booking` — that is a SEPARATE table, one EXCLUDE
-- constraint can't span two tables, and covering it would need its own
-- cross-table trigger. includes/staff_dashboard.js's walk-in flow inserts
-- into `walk_in_booking`, never `public.booking`, so it neither threatens
-- nor benefits from this constraint — a customer's booking_no_overlap
-- protection simply does not see a walk-in's time slot at all. This is a
-- known, accepted gap (implementation_plan.md's Non-goals) — a walk-in and
-- a customer booking CAN still collide on the same court/time; only
-- customer-vs-customer overlaps are prevented by this file.
-- ----------------------------------------------------------------------------
create extension if not exists btree_gist;

alter table public.booking
    drop constraint if exists booking_no_overlap;
alter table public.booking
    add constraint booking_no_overlap
    exclude using gist (
        courts with =,
        coalesce(court_unit, '') with =,
        tstzrange(time_date, end_at, '[)') with &&
    ) where (status in ('pending', 'confirmed'));

comment on constraint booking_no_overlap on public.booking is 'Part 3/D4 — rejects an INSERT/UPDATE that would make two pending/confirmed bookings overlap on the same courts+court_unit. Fails with Postgres error code 23P01 (exclusion_violation) — see includes/Dashboard.js''s bookSubmit handler for the friendly customer-facing message on that code. Does NOT cover walk_in_booking (separate table, out of scope — see this file''s header).';


-- ----------------------------------------------------------------------------
-- booking_fill_end_at — BEFORE INSERT OR UPDATE trigger. Keeps end_at (and a
-- null-safe duration_minutes) filled in for any insert/update path that
-- doesn't explicitly supply end_at itself — e.g. a direct SQL insert made
-- while testing, or any future writer against this table that hasn't been
-- taught about end_at yet. includes/Dashboard.js's booking wizard always
-- sends both end_at and duration_minutes already consistent with each
-- other, so this trigger is a no-op safety net for that path, not something
-- it depends on.
-- ----------------------------------------------------------------------------
create or replace function public.booking_fill_end_at()
returns trigger
language plpgsql
as $$
begin
    -- Guards against an explicit `duration_minutes: null` in the payload —
    -- a NOT NULL column's DEFAULT only applies when a column is OMITTED
    -- entirely, never when NULL is sent explicitly (the exact class of bug
    -- includes/Dashboard.js's own booking-insert comment warns about for
    -- `payment_id`/`booking_id`/`created_at`).
    if new.duration_minutes is null then
        new.duration_minutes := 60;
    end if;

    if new.end_at is null then
        new.end_at := new.time_date + make_interval(mins => new.duration_minutes);
    end if;

    return new;
end;
$$;

drop trigger if exists booking_fill_end_at_trigger on public.booking;
create trigger booking_fill_end_at_trigger
    before insert or update on public.booking
    for each row
    execute function public.booking_fill_end_at();

comment on function public.booking_fill_end_at() is 'Part 3 — fills booking.end_at from time_date + duration_minutes whenever a writer omits end_at, so any insert/update path that only knows the pre-Part-3 columns keeps working. includes/Dashboard.js''s booking wizard always supplies end_at itself; this is the safety net for every OTHER path, not that one.';


-- ============================================================================
-- Frontend behaviour before vs. after this file is applied
-- ============================================================================
-- BEFORE (current live state, this migration NOT applied): includes/
-- Dashboard.js's booking insert already tries to send end_at/duration_minutes/
-- court_unit (Part 3's app-side change ships together with this file in the
-- same commit) — PostgREST rejects unknown columns, so that insert fails with
-- a schema-mismatch-shaped error rather than silently dropping the new
-- fields. Until this file is applied, DO NOT expect the customer Booking
-- panel's "Request Booking" to succeed. Every OTHER query in this project
-- that reads `booking` uses `select('*')` (or Step 2's own fetchDayBookings(),
-- which explicitly retries without the new columns on a schema-mismatch
-- error), so nothing else breaks — the read side degrades gracefully to
-- "assume 60-minute bookings, ignore units" exactly as it did before Part 3.
--
-- AFTER: the booking insert succeeds with a real end_at/duration_minutes/
-- court_unit; the Overview peek widget, Step 2's slot grid, and the staff
-- Court Schedule all correctly span a multi-hour booking; and a genuinely
-- overlapping insert (same courts + court_unit + time range, both
-- pending/confirmed) is rejected by Postgres itself with code 23P01,
-- regardless of what the client-side check saw.
-- ============================================================================
