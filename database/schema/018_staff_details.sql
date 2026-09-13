-- ============================================================================
-- IñigoSync — Schema: staff personal details
-- (Revision S3 — address, birthdate, gender, emergency contact)
-- ============================================================================
-- Paste this whole file into the Supabase SQL editor (Project → SQL Editor)
-- any time — its order relative to every other file in database/schema/
-- doesn't matter, since this only adds columns to the existing profiles row
-- set. profiles has no schema file of its own in this repo (a standing,
-- documented risk — see implementation_plan.md's "Context and current
-- state" and 008_profile_name_parts.sql's own header note); its confirmed
-- columns are only the ones the app already reads/writes: id, role,
-- full_name, email, status, contact_num, position, avatar_url, first_name,
-- middle_name, last_name, phone_verified, created_at. Safe to re-run: every
-- add column below uses "if not exists".
--
-- Why this exists (Revision S3) — Staff Management and each staff
-- account's own Account Settings / View Profile both need five extra
-- personal fields profiles never carried before: a home address, a
-- birthdate, a gender, and an emergency contact's name plus number. Age is
-- never one of these five — every screen computes it from birthdate at
-- render time (see includes/staff_dashboard.js's formatStaffAge() and
-- includes/owner_dashboard.js's computeAdminStaffAge()), so a shown age can
-- never drift out of date the way a separately stored figure would the
-- moment a birthday passes. Every one of these five is optional; a staff
-- member who never fills them in is exactly as valid an account as one who
-- has.
--
-- ----------------------------------------------------------------------------
-- GRACEFUL DEGRADATION — same idiom every prior profiles-column migration
-- in this folder already uses (008/011/013). includes/authGuard.js's
-- shared login-gate select never asks for these five columns (a missing
-- column there would fail EVERY sign-in with Postgres error 42703 until
-- this file is applied); the staff and owner dashboards each fetch them in
-- a request scoped to just the panel that needs them, tolerating
-- 42703/PGRST204 as "not applied yet" — an empty field plus a small hint
-- naming this file, never a broken dashboard. Every save path retries
-- without these five fields upon that exact failure, so full_name/
-- contact_num/position keep saving exactly as they always have.
-- ============================================================================

alter table public.profiles
    add column if not exists address text null,
    add column if not exists birthdate date null,
    add column if not exists gender text null,
    add column if not exists emergency_contact_name text null,
    add column if not exists emergency_contact_number text null;

comment on column public.profiles.address is 'Free-text home address (Revision S3) — optional, shown in Staff Management and a staff member''s own View Profile. No sub-fields: a Philippine address rarely splits cleanly into a fixed street/city/province shape, so this stays one flexible box.';

comment on column public.profiles.birthdate is 'Date of birth (Revision S3). Age is never stored anywhere — every screen computes it from this value at render time. NULL until a staff member, or the owner inviting or editing them, fills it in.';

comment on column public.profiles.gender is 'Free text, deliberately with no CHECK constraint (Revision S3) — the UI (Account Settings, the owner''s Add/Edit staff forms) already limits the offered choices to Male, Female, or Prefer not to say, so a constraint here would only duplicate a rule already enforced one layer up, for a column no other reader depends upon. NULL means not provided, never an invented default.';

comment on column public.profiles.emergency_contact_name is 'Who to reach if a staff member has an emergency during a shift (Revision S3). Optional free text, paired with emergency_contact_number below.';

comment on column public.profiles.emergency_contact_number is 'Phone number for emergency_contact_name above (Revision S3). Validated client-side (validatePhMobile, includes/phoneValidation.js) whenever a value is entered — the same rule profiles.contact_num itself already gets; empty is allowed.';

-- ----------------------------------------------------------------------------
-- Row Level Security — deliberately unchanged.
-- ----------------------------------------------------------------------------
-- Same reasoning as 008_profile_name_parts.sql, 011_profile_avatar.sql, and
-- 013_profile_phone_verified.sql already give, in full: whatever already
-- lets a signed-in staff member read and update their OWN profiles row
-- (full_name/contact_num prove this works today), and whatever already
-- lets an active admin update A STAFF row (Staff Management's existing
-- Edit action proves that too), covers these five new columns for that
-- same row automatically — row-level security in Postgres is evaluated per
-- row, not per column, and this project has no column-level grant or
-- revoke anywhere. Nothing here needs a new or changed policy.
-- ============================================================================
