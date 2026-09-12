-- ============================================================================
-- IñigoSync — Schema: profile phone verification flag
-- ============================================================================
-- Run this in the Supabase SQL editor (Project → SQL Editor) any time — its
-- order relative to every other file in database/schema/ doesn't matter,
-- since this only adds one column to the EXISTING `profiles` table. Same
-- standing/documented-risk note as database/schema/008_profile_name_parts.sql
-- and 011_profile_avatar.sql: `profiles` has no schema file of its own in
-- this repo, so its RLS policies predate this repo's schema tracking and
-- aren't visible to it (see those files' own header notes).
--
-- Why this exists: Revision 5, D6 (implementation_plan.md) adds a real SMS
-- OTP flow to the customer dashboard's Account Settings — changing the
-- mobile number now requires confirming a 6-digit code sent via Supabase
-- Auth's Phone provider (`sb.auth.updateUser({ phone })` to send it,
-- `sb.auth.verifyOtp({ phone, token, type: 'phone_change' })` to confirm —
-- see includes/Dashboard.js's mobile-verification wiring) before
-- `profiles.contact_num` is updated. This column is the durable record of
-- "the number currently in contact_num has been proven via that flow" —
-- distinct from contact_num's own presence, since a number can be typed
-- (or migrated from before this feature existed) without ever having been
-- verified. `phone_verified` is written back to `false` implicitly by
-- simply never being set again once the customer changes contact_num
-- through any OTHER path than a successful verifyOtp() — the mobile
-- verification flow is the ONLY writer of `true` (see the "no fake
-- verification path" constraint in implementation_plan.md's "Revision 5"
-- section) — a stale `true` next to a DIFFERENT, never-reverified number
-- cannot occur because contact_num and phone_verified are always written
-- together, in the same update(), by that one code path.
--
-- `add column if not exists` + a `false` default means every pre-existing
-- row (every customer who signed up before this migration, whose mobile
-- number was never run through OTP) reads as UNVERIFIED — the honest
-- default, not an invented "already verified". includes/Dashboard.js's
-- renderProfile() tolerates this column being entirely absent (i.e. before
-- this migration is applied at all): it fetches phone_verified in a
-- request scoped to Account Settings only (same reasoning as
-- fetchProfileNameParts() for first_name/middle_name/last_name — see
-- 008_profile_name_parts.sql's own header note on why this is NOT added to
-- includes/authGuard.js's shared login-gate `profiles` select), so a
-- missing column degrades to "verified badge simply never shows", never a
-- broken login for every customer.
-- ============================================================================

alter table public.profiles
    add column if not exists phone_verified boolean not null default false;

comment on column public.profiles.phone_verified is 'True only once the CURRENT profiles.contact_num was confirmed via Supabase Auth SMS OTP (sb.auth.verifyOtp({ phone, token, type: ''phone_change'' })) from the customer dashboard''s Account Settings — see includes/Dashboard.js. Defaults to false for every existing row (an unverified number is the honest starting state, never invented as true). Written to true ONLY by that one verification flow, always in the same update() call that also (re)writes contact_num, so this can never point at a different, unverified number than the one on file.';

-- ----------------------------------------------------------------------------
-- Row Level Security — deliberately UNCHANGED here.
-- ----------------------------------------------------------------------------
-- Same reasoning as database/schema/008_profile_name_parts.sql's and
-- 011_profile_avatar.sql's own header notes: whatever policy already lets a
-- signed-in customer read/update their OWN profiles row (contact_num itself
-- already proves this works today) covers phone_verified on that same row
-- automatically — a boolean column carries no row-level access implications
-- of its own. This migration does not attempt to touch policies it cannot
-- see or recreate blind.
-- ============================================================================
