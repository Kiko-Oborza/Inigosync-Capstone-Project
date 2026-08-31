-- ============================================================================
-- IñigoSync — Schema: allow 'unattended' in booking.status (Revision 2, R4)
-- ============================================================================
-- Run this in the Supabase SQL editor (Project → SQL Editor) any time — order
-- relative to every other file in this directory doesn't matter, since this
-- only touches a CHECK constraint on the existing `booking` table.
--
-- THIS MIGRATION IS OPTIONAL. Do not apply it as part of routine setup.
--
--   (a) OPTIONAL — nothing in this codebase requires it. The customer
--       dashboard (includes/Dashboard.js's displayStatusFor(), used by both
--       My Bookings and Receipts) computes "Unattended" client-side, at
--       render time, from data that already exists (time_date,
--       checked_in_at, status) — it NEVER writes the word 'unattended'
--       anywhere. This migration exists only for the day the owner wants
--       staff/automation (e.g. a Supabase cron job, or a manual staff action)
--       to persist that status for real, instead of it only ever being a
--       display-time computation.
--   (b) The UI works IDENTICALLY before and after this is applied. Whether or
--       not this migration has run, a booking more than 30 minutes past its
--       start time with no checked_in_at and a status still 'pending' or
--       'confirmed' displays as "Unattended" in My Bookings and on its
--       receipt, right now, today — see displayStatusFor() in
--       includes/Dashboard.js. Applying this migration does not change what
--       any customer sees; it only widens what a FUTURE staff/automation
--       writer is allowed to store in the `status` column itself.
--   (c) DO NOT APPLY THIS BLINDLY. database/schema/004_staff_module.sql
--       (see its header comment, lines 22-41) already documents that this
--       repo cannot see `booking`'s real constraints, RLS policies, or
--       triggers — that table was created directly in the live Supabase
--       project before this repo tracked schema files. This file follows the
--       same caution: rather than assuming a specific constraint name and
--       trying to `drop constraint <guessed name>` (which would ERROR if the
--       guess is wrong, and could silently no-op or collide if it's a
--       coincidental match to something unrelated), the DO block below
--       *discovers* whatever CHECK constraint currently governs
--       booking.status by introspecting pg_constraint/pg_attribute — the
--       same catalog tables database/qa/001_introspect.sql's query 4 already
--       uses read-only to report constraints back to a human — and drops
--       ONLY that constraint, ONLY if one is actually found, before adding
--       the replacement below. If `booking.status` has no CHECK constraint
--       at all when this runs, the DO block simply finds nothing to drop and
--       this file just adds the new one.
--
-- Confirmed live today (docs/QA_AUDIT_REPORT.md, "status value probe"): a
-- CHECK constraint on booking.status currently accepts exactly 'pending',
-- 'confirmed', 'cancelled', 'completed' and rejects anything else with
-- Postgres error code 23514 (see the big comment above the booking INSERT in
-- includes/Dashboard.js, and its own 23514 branch). This migration widens
-- that same set to also accept 'unattended' — nothing else about the column
-- changes: it stays nullable-or-not exactly as it already is, no default
-- changes, no other constraint is touched.
--
-- Safe to re-run: the DO block drops whichever status CHECK constraint it
-- finds (if any) every time, then the ALTER TABLE below re-adds the exact
-- same named constraint — running this file twice in a row is a no-op the
-- second time, not an error.
-- ============================================================================

do $$
declare
    r record;
begin
    -- Find every CHECK constraint on public.booking whose key column set
    -- includes `status` (there should be exactly one, per the QA probe
    -- above) and drop it by its REAL name, whatever that name actually is —
    -- never assumed. If booking.status has no CHECK constraint at all (e.g.
    -- it was already dropped by a previous run of this same file, or never
    -- existed under a different project setup), this loop simply does
    -- nothing and the ADD CONSTRAINT below still runs safely.
    for r in
        select con.conname
        from pg_constraint con
        join pg_class rel        on rel.oid = con.conrelid
        join pg_namespace nsp    on nsp.oid = rel.relnamespace
        join pg_attribute att    on att.attrelid = rel.oid and att.attnum = any(con.conkey)
        where nsp.nspname = 'public'
          and rel.relname = 'booking'
          and con.contype = 'c'          -- 'c' = CHECK (see database/qa/001_introspect.sql query 4)
          and att.attname = 'status'
    loop
        execute format('alter table public.booking drop constraint %I', r.conname);
    end loop;
end
$$;

-- Re-added under a fixed, predictable name (Postgres' own default naming
-- convention for an inline column CHECK — the live constraint this DO block
-- just dropped is almost certainly already named exactly this) so a second
-- run of this file finds and replaces its OWN constraint cleanly instead of
-- piling up duplicates.
alter table public.booking
    add constraint booking_status_check
    check (status in ('pending', 'confirmed', 'cancelled', 'completed', 'unattended'));

comment on constraint booking_status_check on public.booking is
    'Allowed booking.status values. Extended by database/schema/010_booking_unattended_status.sql (optional — see that file''s header) to also permit ''unattended'' for a future staff/automation writer. The customer dashboard NEVER writes ''unattended'' itself — it only ever derives that status for display (includes/Dashboard.js''s displayStatusFor()), which works identically whether or not this migration has been applied.';


-- ============================================================================
-- Frontend behaviour before vs. after this file is applied
-- ============================================================================
-- BEFORE (current live state, this migration NOT applied): My Bookings and
-- Receipts already display "Unattended" for a qualifying booking — that is
-- pure client-side computation and needs nothing from this file. The
-- `status` COLUMN in the database still only ever contains 'pending',
-- 'confirmed', 'cancelled', or 'completed' for that same row; any code that
-- tried to write literal 'unattended' to it would fail with Postgres 23514,
-- exactly as it does today for any other value outside that set.
--
-- AFTER: the exact same client-side display is unchanged (displayStatusFor()
-- does not read this constraint, so it has nothing to react to). What
-- becomes newly possible is that a future staff action or scheduled job
-- COULD run `update booking set status = 'unattended' where ...` and have it
-- succeed instead of being rejected — this file does not add any such
-- writer itself, only the room for one to exist later.
-- ============================================================================
