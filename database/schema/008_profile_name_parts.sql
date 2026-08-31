-- ============================================================================
-- IñigoSync — Schema: profile name parts (First / Middle / Surname)
-- ============================================================================
-- Run this in the Supabase SQL editor (Project → SQL Editor) any time — its
-- order relative to every other file in database/schema/ doesn't matter,
-- since this only adds columns to the EXISTING `profiles` table. `profiles`
-- has no schema file of its own in this repo (implementation_plan.md's
-- "Context and current state" — a standing, documented risk); its confirmed
-- columns are only the ones the app already reads/writes: id, role,
-- full_name, email, status, contact_num, position, avatar_url. Safe to
-- re-run: every ADD COLUMN below uses `if not exists`.
--
-- Why this exists: §9 of InigoSync_Dashboard_Feedback_v6.md splits Account
-- Settings' single "Full name" box into three — First Name, Middle Name,
-- Surname (implementation_plan.md decision D3). `profiles.full_name` is NOT
-- renamed, dropped, or migrated away here — it stays exactly as it is,
-- because the owner and staff dashboards (includes/owner_dashboard.js,
-- includes/staff_dashboard.js) and the signup flow
-- (includes/auth.js's composeFullName()) still read/write it as ONE column.
-- This migration only ADDS three more columns alongside it; Account
-- Settings' Save button (includes/Dashboard.js) writes both from now on —
-- the three parts AND a re-composed full_name ("First Middle Last", collapsed
-- whitespace, same composition includes/auth.js's signup form already uses)
-- — so full_name never goes stale relative to the three boxes, and every
-- other screen that only knows about full_name keeps working unchanged.
--
-- ----------------------------------------------------------------------------
-- GRACEFUL DEGRADATION — this environment has no Supabase admin access, so
-- this file is written but NOT applied yet. Before the owner runs it:
--
--   * LOAD (Account Settings opening) — includes/Dashboard.js queries
--     `first_name, middle_name, last_name` in its OWN small request,
--     deliberately never added to includes/authGuard.js's shared
--     login-gate `profiles` select (every dashboard — customer, staff,
--     admin — reuses that one query to decide whether a session is even
--     allowed in; asking it for columns that don't exist yet would fail the
--     WHOLE select with Postgres 42703 and sign every user out until this
--     migration runs). On that same 42703 from its own scoped request, this
--     panel instead PARSES full_name (first token -> First Name, last token
--     -> Surname, remaining tokens -> Middle Name) so the three boxes are
--     populated correctly from the very first load, migrated or not — see
--     parseFullName()/populateSettingsNameFields() in includes/Dashboard.js.
--
--   * SAVE — Account Settings tries to update first_name/middle_name/
--     last_name + full_name/contact_num in one call; on the same 42703 it
--     retries with just full_name/contact_num (the columns that predate
--     this phase) — the same "retry without the missing column" idiom this
--     file's own fetchOverviewWalkins() already uses for
--     walk_in_booking.duration_minutes. Name/mobile edits keep saving
--     either way; only the three new columns stay unpersisted (and the
--     three boxes keep resolving via the full_name parse above) until this
--     migration is applied.
--
-- AFTER this file runs: both paths above pick up the real columns with no
-- further code change — the retry simply stops being needed, since the
-- first (full) update succeeds every time, and a customer who has never
-- re-saved through the new form still sees correct boxes via the same
-- full_name-parsing fallback until they do.
-- ============================================================================

alter table public.profiles
    add column if not exists first_name  text,
    add column if not exists middle_name text,
    add column if not exists last_name   text;

comment on column public.profiles.first_name is 'Given name — one of the three boxes Account Settings now collects (§9 of InigoSync_Dashboard_Feedback_v6.md), alongside middle_name/last_name. NULL until the customer saves through the new Account Settings form at least once; includes/Dashboard.js falls back to parsing full_name until then. Kept in sync with full_name on every save — see this file''s header comment.';
comment on column public.profiles.middle_name is 'Middle name — optional (many Filipino users legitimately have none, same treatment includes/auth.js''s signup form already gives it). NULL means "not provided", never treated as an error state.';
comment on column public.profiles.last_name is 'Surname — the third of the three Account Settings name boxes. Same NULL-until-first-save behaviour as first_name above.';

-- ----------------------------------------------------------------------------
-- Row Level Security — deliberately UNCHANGED here.
-- ----------------------------------------------------------------------------
-- `profiles` isn't tracked by a schema file in this repo, so its existing
-- policies predate this repo's schema tracking and aren't visible to it —
-- the same documented caveat implementation_plan.md's Context section
-- already carries for `booking`/`walk_in_booking` (see
-- database/schema/004_staff_module.sql's own header note). This migration
-- does not attempt to touch policies it cannot see or recreate blind.
--
-- Row-level security in Postgres is evaluated per ROW, not per column, and
-- this project has no column-level GRANT/REVOKE anywhere restricting
-- specific `profiles` columns — whatever policy already lets a signed-in
-- customer read/update their OWN profiles row (full_name/contact_num
-- already prove this works today, in both this dashboard's Account Settings
-- and the owner/staff dashboards' own profile editors) covers these three
-- new columns on that same row automatically, with nothing further to add.
-- ============================================================================
