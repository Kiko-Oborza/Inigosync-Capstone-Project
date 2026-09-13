-- ============================================================================
-- IñigoSync — Schema: walk-in check-in columns + staff Time-In policy
-- (Revision S1, implementation_plan.md, decisions S1/S3/S5/S6 + Security)
-- ============================================================================
-- Run this in the Supabase SQL editor (Project → SQL Editor) any time after
-- database/schema/004_staff_module.sql (that file's audit_log RLS reuses
-- public.inigosync_is_staff_or_admin(), the same helper this file's own
-- policies use — see 002_content_tables.sql, where it's first defined) and
-- 012_booking_time_range.sql (this file's `booking` policy targets the same
-- one which that migration extends with end_at/court_unit). Safe to re-run:
-- every ALTER uses `add column if not exists`, the backfill UPDATE only
-- touches rows still needing it, and both policies are dropped-then-
-- recreated.
--
-- Why this exists: Revision S1 rebuilds the staff Walk-In wizard (S3),
-- receipt (S4), Court Schedule (S5), and Transaction Records (S6) around a
-- `walk_in_booking` row that carries a specific court/unit, a real end
-- time, and a recorded payment method — none of which it stores today
-- (database/schema/004_staff_module.sql only ever added customer_name/
-- customer_mobile to it). It also makes Booking Overview's Time-In action
-- (S1) the ONLY write staff ever make to `booking`/`walk_in_booking` from
-- here on — see this file's Security section below for why that write
-- needs its own policy.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- walk_in_booking — court_unit, end_at, payment_method, checked_in_at.
-- ----------------------------------------------------------------------------
-- court_unit/end_at mirror `booking`'s own Part 3 columns (database/schema/
-- 012_booking_time_range.sql) — same nullable-for-a-pre-migration-row
-- story, same "a walk-in with no unit blocks every unit of that court"
-- reasoning documented in includes/staff_dashboard.js's isWalkinHourBooked().
-- payment_method is free text ("Cash" | "Online payment" today — see the
-- walk-in wizard's Step 4) rather than a CHECK-constrained enum: this
-- table's real constraints are not visible to this repo (no tracked schema
-- definition — same story as `booking`, see 004_staff_module.sql's header note),
-- so a permissive `text` column is the only safe choice here. checked_in_at
-- is the walk-in equivalent of booking.checked_in_at (004_staff_module.sql)
-- — set by the same staff Time-In action, read by the same client-derived
-- status rule (includes/staff_dashboard.js's staffDerivedStatus()). There is
-- deliberately NO checked_out_at added here: Revision S1's "Completed"
-- status is DERIVED (checked in AND now >= end_at), never written — see
-- that function's own header comment for why a written auto-time-out would
-- need server-side automation this repo cannot safely add blind.
-- ----------------------------------------------------------------------------
-- duration_minutes — the live walk_in_booking turned out NOT to have this column
-- (the SQL editor reported `column "duration_minutes" does not exist` on
-- the first run of this file, confirming what includes/Dashboard.js's
-- fetchOverviewWalkins() retry path had only suspected). Added here so the
-- backfill below and the staff Walk-In wizard's insert (which sends
-- duration_minutes = hours * 60) both work. Default 60 keeps every
-- pre-existing row honest as a one-hour walk-in, the same assumption the
-- frontend already made for rows without it.
alter table public.walk_in_booking
    add column if not exists duration_minutes integer null default 60;

comment on column public.walk_in_booking.duration_minutes is 'Length of the walk-in in minutes (Revision S1). Added by 016 — the live walk_in_booking never had it. NULL/absent is read as 60 everywhere in the frontend; the staff Walk-In wizard always writes hours * 60.';

alter table public.walk_in_booking
    add column if not exists court_unit text null;

alter table public.walk_in_booking
    add column if not exists end_at timestamptz null;

alter table public.walk_in_booking
    add column if not exists payment_method text null;

alter table public.walk_in_booking
    add column if not exists checked_in_at timestamptz null;

comment on column public.walk_in_booking.court_unit is 'Specific Court, Lane or Table-number label this walk-in occupies (Revision S1, mirrors booking.court_unit — database/schema/012_booking_time_range.sql). NULL = blocks every unit of that court (see includes/staff_dashboard.js''s isWalkinHourBooked()) — a pre-migration row, or one where staff/the UI genuinely couldn''t disambiguate.';
comment on column public.walk_in_booking.end_at is 'Real end of the walk-in''s time range (Revision S1). Backfilled below from time_date + duration_minutes for every pre-existing row; the staff Walk-In wizard (includes/staff_dashboard.js) always supplies it going forward.';
comment on column public.walk_in_booking.payment_method is 'How the walk-in paid — "Cash" or "Online payment" today (Revision S1, decision S3''s Step 4). Free text, not a CHECK-constrained enum: walk_in_booking has no tracked schema-definition file in this repo (see 004_staff_module.sql''s header note), so this migration cannot see or safely narrow its real constraints.';
comment on column public.walk_in_booking.checked_in_at is 'Set by staff Time-In action (includes/staff_dashboard.js, Revision S1 decision S1) — same role as booking.checked_in_at (004_staff_module.sql). NULL = not yet checked in. There is no matching checked_out_at: "Completed" is DERIVED (checked in AND now >= end_at), never written — see staffDerivedStatus() in includes/staff_dashboard.js.';

-- Backfill every existing row so end_at is never null for a walk-in that
-- predates this migration — same coalesce(duration_minutes, 60) fallback
-- database/schema/012_booking_time_range.sql's own backfill uses for
-- `booking`, since a walk-in without a recorded duration is exactly as
-- "assume 60 minutes for display" as a pre-Part-3 booking is.
update public.walk_in_booking
set end_at = time_date + make_interval(mins => coalesce(duration_minutes, 60))
where end_at is null;


-- ============================================================================
-- Security (implementation_plan.md, Revision S1 "Security" section) —
-- staff Time-In needs an UPDATE policy on `booking` it may not have.
-- ============================================================================
-- `booking` has no tracked schema-definition file in this repo — it was created
-- directly in the live Supabase project before this repo tracked schema
-- files (see database/schema/004_staff_module.sql's header note, which
-- flags this exact gap and deliberately stops short of writing a blind
-- policy). Revision S1 replaces every other staff write to `booking`
-- (Confirm/Decline/Time-Out) with exactly ONE: setting checked_in_at via
-- Time-In (includes/staff_dashboard.js's timeInBooking()). If no existing
-- policy already lets staff/admin UPDATE a booking they don't own, that
-- write fails with Postgres code 42501 — the app's own error handling
-- recognizes this (isSchemaMismatchError()/the explicit `42501` check in
-- timeInBooking()/timeInWalkin()) and shows "Ask the owner to run 004 and
-- 016." instead of silently doing nothing.
--
-- `for update ... with check` (not `for all`) — this policy grants nothing
-- beyond UPDATE; it cannot be used to INSERT or DELETE a booking, and a
-- customer's own booking-management RLS (whatever it is — also not visible
-- to this repo) is completely untouched, since this is an ADDITIONAL
-- permissive policy, not a replacement.
-- ============================================================================
drop policy if exists "booking_staff_checkin" on public.booking;
create policy "booking_staff_checkin" on public.booking
    for update
    to authenticated
    using (public.inigosync_is_staff_or_admin())
    with check (public.inigosync_is_staff_or_admin());

comment on policy "booking_staff_checkin" on public.booking is 'Revision S1 — lets staff/admin UPDATE any booking row (in practice, only ever to set checked_in_at from the staff Time-In button (includes/staff_dashboard.js)). Added because booking has no tracked schema-definition file in this repo (see 004_staff_module.sql''s header note) and its real pre-existing policies are not visible here — this is an ADDITIONAL permissive policy, not a replacement for whatever already governs customer access to their own bookings.';

-- ----------------------------------------------------------------------------
-- walk_in_booking — same gap, same fix. database/schema/004_staff_module.sql
-- only ever ALTERed this table's columns; it never touched RLS (confirmed by
-- re-reading that file in full before writing this one, per this file's own
-- header note) — meaning whatever lets staff INSERT a walk-in today says
-- nothing about whether staff can UPDATE one (i.e. Time-In for a walk-in).
-- Added unconditionally rather than "only if missing" for the same reason
-- as above: this repo cannot see this table's real policies either way, so
-- there is nothing to conditionally skip — `drop policy if exists` already
-- makes this safe to run whether or not an equivalent policy exists.
-- ----------------------------------------------------------------------------
drop policy if exists "walkin_staff_checkin" on public.walk_in_booking;
create policy "walkin_staff_checkin" on public.walk_in_booking
    for update
    to authenticated
    using (public.inigosync_is_staff_or_admin())
    with check (public.inigosync_is_staff_or_admin());

comment on policy "walkin_staff_checkin" on public.walk_in_booking is 'Revision S1 — lets staff/admin UPDATE any walk_in_booking row (in practice, only ever to set checked_in_at from the staff Time-In button (includes/staff_dashboard.js)). walk_in_booking has no tracked schema-definition file in this repo and 004_staff_module.sql never touched its RLS — this is an ADDITIONAL permissive policy alongside whatever already lets staff INSERT a walk-in.';


-- ============================================================================
-- Frontend behaviour before vs. after this file is applied
-- ============================================================================
-- BEFORE (current live state — every query below still works, nothing
-- throws, because includes/staff_dashboard.js reads both tables with
-- select('*'), never naming these columns explicitly):
--   * Walk-In wizard — Save still records the walk-in, but the schema-
--     mismatch retry drops court_unit/end_at/payment_method, so per-unit
--     availability degrades to sport-wide and the receipt/Transaction
--     Records show no payment method for that row.
--   * Time-In (for a booking OR a walk-in) — if no equivalent policy already
--     exists, the update is rejected with Postgres 42501 and the staff
--     member sees "Ask the owner to run 004 and 016." instead of a silent
--     no-op or a raw error.
--   * Court Schedule / Transaction Records — a booked/walk-in cell still
--     renders correctly from time_date + duration_minutes; only per-unit
--     precision and "Timed in"/derived "In play"/"Completed" for walk-ins
--     are affected until checked_in_at exists.
--
-- AFTER — all of the above become fully live: the walk-in wizard saves a
-- specific court/unit + real end time + payment method in one pass, staff
-- Time-In persists for both bookings and walk-ins, and Court Schedule/
-- Transaction Records reflect true per-unit occupancy and check-in state.
-- ============================================================================
