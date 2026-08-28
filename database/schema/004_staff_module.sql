-- ============================================================================
-- IñigoSync — Schema: staff module (Phase 3)
-- ============================================================================
-- Run this in the Supabase SQL editor (Project → SQL Editor). Run
-- database/schema/002_content_tables.sql FIRST if it has not already been
-- applied — the audit_log RLS policies below reuse the
-- public.inigosync_is_staff_or_admin() helper function that file creates.
-- (Per implementation_plan.md's Status table, 002 is already applied to the
-- live project as of Phase 2, so on that project this is already satisfied.)
--
-- Safe to re-run: every ALTER uses `add column if not exists`, the CREATE
-- TABLE uses `if not exists`, and policies are dropped-then-recreated.
--
-- Why this exists: docs/QA_AUDIT_REPORT.md's Staff Module findings
-- (Booking Overview STUB, Transaction Records/audit trail GONE, Court
-- Schedule STUB) and implementation_plan.md's Phase 3 all need a place to
-- persist things `booking` and `walk_in_booking` currently cannot:
--   * When a customer arrived and when they left a court.
--   * How long a booking actually runs for.
--   * A durable, staff/admin-only record of who did what, and when.
--
-- IMPORTANT — this file does NOT touch any existing RLS policy on
-- `booking` or `walk_in_booking`. Those two tables (along with `profiles`
-- and `payment`) were created directly in the live Supabase project before
-- this repo tracked schema files, and their current policies are not
-- visible to this migration (see implementation_plan.md's "Risk" note and
-- database/qa/001_introspect.sql). If a staff Confirm/Decline/Time-In/
-- Time-Out action in includes/staff_dashboard.js fails with "Could not
-- update this booking — it may no longer exist, or you may not have
-- permission" even though the booking clearly exists, the booking almost
-- certainly has no UPDATE policy that lets staff/admin write a row they
-- don't own. Run query 5 of database/qa/001_introspect.sql to check; if
-- missing, add a policy mirroring "court_staff_write" below, e.g.:
--   create policy "booking_staff_write" on public.booking
--       for update to authenticated
--       using (public.inigosync_is_staff_or_admin())
--       with check (public.inigosync_is_staff_or_admin());
-- That statement is deliberately NOT included in this file — writing it
-- blind, without seeing what (if anything) already exists on `booking`,
-- risks silently duplicating or conflicting with a real policy this
-- migration can't see.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- booking — arrival/completion timestamps + a duration.
-- ----------------------------------------------------------------------------
-- `booking.time_date` is a single START timestamp only (confirmed live —
-- see docs/QA_AUDIT_REPORT.md's "Booking schema" note). With no end time and
-- no duration anywhere, there is no way to:
--   (a) know when a session actually finishes for the Court Schedule grid,
--   (b) detect overlaps for double-booking prevention (Phase 4), or
--   (c) tell staff how long to hold a court for.
-- `duration_minutes` closes that gap. It's nullable (a booking made before
-- this migration, or one where staff genuinely don't know the length yet,
-- is legitimately "unknown" rather than a fabricated number) but defaults
-- to 60 for anything inserted after this runs, so new rows have a sensible
-- value without every insert path having to supply one. The frontend
-- (includes/staff_dashboard.js's Court Schedule) treats a NULL/missing
-- duration_minutes as 60 minutes for display purposes — see that file's
-- DEFAULT_DURATION_MINUTES constant, kept equal to this column's default on
-- purpose.
--
-- checked_in_at / checked_out_at back the staff dashboard's Time-In /
-- Time-Out actions. Both nullable: not-yet-arrived and still-in-progress
-- are real, common states, not missing data.
-- ----------------------------------------------------------------------------
alter table public.booking
    add column if not exists checked_in_at timestamptz null;

alter table public.booking
    add column if not exists checked_out_at timestamptz null;

alter table public.booking
    add column if not exists duration_minutes int null default 60
        constraint booking_duration_minutes_positive
        check (duration_minutes is null or duration_minutes > 0);

comment on column public.booking.checked_in_at is 'Set by staff Time-In action (includes/staff_dashboard.js). NULL = not yet arrived.';
comment on column public.booking.checked_out_at is 'Set by staff Time-Out action. NULL = not yet completed (or never arrived).';
comment on column public.booking.duration_minutes is 'Session length in minutes. time_date is only a start timestamp; this is what lets the app compute an end time. NULL = unknown/unconfirmed, treated as 60 by the frontend.';


-- ----------------------------------------------------------------------------
-- walk_in_booking — persist the customer's name and mobile number.
-- ----------------------------------------------------------------------------
-- Per the current insert in includes/staff_dashboard.js (pre-Phase-3), this
-- table has no column for either — the walk-in form collected them but
-- silently dropped them before this phase. Added here exactly as named in
-- implementation_plan.md's Phase 3 task list; nothing else about this
-- table's shape is touched (payment method/amount are still not persisted
-- anywhere — that's Phase 5 payment work, out of scope here).
-- ----------------------------------------------------------------------------
alter table public.walk_in_booking
    add column if not exists customer_name text null;

alter table public.walk_in_booking
    add column if not exists customer_mobile text null;

comment on column public.walk_in_booking.customer_name is 'Walk-in customer''s name, as typed by staff. Added Phase 3 — previously collected in the UI and dropped before saving.';
comment on column public.walk_in_booking.customer_mobile is 'Walk-in customer''s PH mobile number, normalized to local 09XXXXXXXXX form by window.validatePhMobile before saving. Added Phase 3.';


-- ============================================================================
-- audit_log — staff/admin action trail.
-- ============================================================================
-- Backs "Transaction Records" (docs/QA_AUDIT_REPORT.md: unconditionally
-- wiped to "No transactions yet"; `audit_log` confirmed 404 live) and the
-- spec's "audit trail that records timestamps, customer actions, and
-- booking status" requirement. A row is written by
-- includes/staff_dashboard.js on every booking-state change it makes
-- (confirm, decline, time-in, time-out) and on walk-in creation.
--
-- entity_id is `text`, not a foreign key — this table is intentionally
-- polymorphic (entity_type distinguishes 'booking' from 'walk_in_booking',
-- and possibly other entities later), and this repo does not have visibility
-- into booking's real primary-key column type to safely reference it
-- (booking_id — see the header note above). `details` carries a snapshot
-- (customer name, court, etc.) captured at write time instead, so a row
-- stays meaningful even if the referenced booking is later deleted.
-- ============================================================================
create table if not exists public.audit_log (
    id             uuid primary key default gen_random_uuid(),
    actor_id       uuid references public.profiles(id) on delete set null,
    actor_role     text,                               -- snapshot of profiles.role at write time
    action         text not null,                       -- e.g. 'booking_confirmed', 'booking_declined',
                                                          -- 'booking_timed_in', 'booking_timed_out', 'walkin_recorded'
    entity_type    text not null,                        -- 'booking' | 'walk_in_booking'
    entity_id      text,                                 -- the entity's id, as text (see note above); nullable
    details        jsonb,                                -- snapshot for display, e.g. {"customerName":"...","court":"..."}
    created_at     timestamptz not null default now()
);

comment on table public.audit_log is 'Staff/admin action trail — Transaction Records panel. Written by includes/staff_dashboard.js, never by customer-facing code.';

create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
create index if not exists audit_log_entity_idx on public.audit_log (entity_type, entity_id);

-- ---- RLS: staff/admin may SELECT and INSERT; customers may not read it ----
-- No UPDATE or DELETE policy is defined on purpose — an audit trail that can
-- be edited or removed after the fact isn't one. Table-level grants below
-- also omit update/delete, so even a future stray policy addition wouldn't
-- reopen it without an explicit GRANT too.
alter table public.audit_log enable row level security;

grant select, insert on public.audit_log to authenticated;

drop policy if exists "audit_log_staff_read" on public.audit_log;
create policy "audit_log_staff_read" on public.audit_log
    for select
    to authenticated
    using (public.inigosync_is_staff_or_admin());

drop policy if exists "audit_log_staff_insert" on public.audit_log;
create policy "audit_log_staff_insert" on public.audit_log
    for insert
    to authenticated
    with check (public.inigosync_is_staff_or_admin());


-- ============================================================================
-- Frontend behaviour before vs. after this file is applied
-- ============================================================================
-- BEFORE (current live state — every query below still works, nothing
-- throws, because includes/staff_dashboard.js always uses `select('*')`,
-- never names these columns explicitly):
--   * Confirm / Decline — fully functional now (only ever touch `status`,
--     which already exists).
--   * Time-In / Time-Out — the buttons render, but the UPDATE fails
--     (PostgREST can't find checked_in_at/checked_out_at) and the staff
--     member sees a clear "needs a database update" toast. Nothing is
--     silently faked as successful.
--   * Walk-in name/mobile — the insert is attempted with customer_name/
--     customer_mobile, fails the same way, and includes/staff_dashboard.js
--     retries WITHOUT those two fields so recording the walk-in itself
--     still succeeds (matching pre-Phase-3 behaviour); the toast tells
--     staff the contact info wasn't saved.
--   * Transaction Records — audit_log doesn't exist yet, so the panel shows
--     "Transaction records need a database update the admin hasn't applied
--     yet." instead of throwing or fabricating rows.
--   * Court Schedule / stat tiles — render from real `booking`/
--     `walk_in_booking` rows; anything that would need checked_in_at
--     defaults to "not checked in" (e.g. "In play right now" reads 0).
--
-- AFTER — all of the above become fully live: Time-In/Time-Out persist,
-- walk-in contact info saves in one pass, Transaction Records shows real
-- rows, and "In play right now" reflects actual check-in state.
-- ============================================================================
