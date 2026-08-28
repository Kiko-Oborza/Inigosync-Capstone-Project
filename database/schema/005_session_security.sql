-- ============================================================================
-- IñigoSync — Schema: session security (Phase 6)
-- ============================================================================
-- Run this in the Supabase SQL editor (Project → SQL Editor) any time after
-- database/schema/002_content_tables.sql — order relative to 003/004 and the
-- seed files in database/seed/ doesn't matter. Safe to re-run: the CREATE
-- TABLE uses `if not exists` and policies are dropped-then-recreated.
--
-- Why this exists: docs/QA_AUDIT_REPORT.md's Security Module row "Single
-- Session — GONE — Zero matches repo-wide for device/session/revoke" and
-- implementation_plan.md's Phase 6 / decision D6. The spec (Users Module →
-- Security Module → "Single Session") requires that logging in on a second
-- device immediately end the session on the first one.
--
-- What this backs: ONE row per user, holding the token of that user's
-- current (most recently logged-in) browser session. includes/auth.js
-- writes a fresh random token here on every successful login
-- (registerActiveSession()); includes/authGuard.js, while a dashboard tab
-- is open, periodically compares its own locally-remembered token against
-- the row here and signs itself out if they no longer match — i.e. some
-- other device logged in since and became the new "one active session".
--
-- IMPORTANT — this table never stores a Supabase JWT / access token, and
-- never grants access to anything by itself. `session_token` is a random,
-- opaque, client-generated id (crypto.randomUUID()) whose only job is
-- equality comparison ("is this still the same login event") — RLS below
-- still requires auth.uid() = user_id for every operation on this table
-- regardless of what any session_token value is, so even a guessed/leaked
-- token grants no access to anyone else's row.
--
-- GRACEFUL DEGRADATION — this file is written for a system that must keep
-- working perfectly before it's ever run. If this table does not exist yet,
-- every read/write includes/auth.js and includes/authGuard.js attempt
-- against it fails (PostgREST 404 / "relation does not exist"); both files
-- catch that and silently no-op — single-session enforcement is simply
-- off, and login/dashboards behave exactly as they did before this file
-- existed. See the "Frontend behaviour before vs. after" note at the
-- bottom, and docs/OWNER_ACTION_LIST.md item A3.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- active_session — one row per user; upserted (not inserted) on every login.
-- ----------------------------------------------------------------------------
create table if not exists public.active_session (
    user_id        uuid primary key references public.profiles(id) on delete cascade,
    session_token  text not null,                      -- random id for THIS browser/tab-set — never a JWT
    device_label   text,                                -- optional, coarse e.g. truncated navigator.userAgent
    created_at     timestamptz not null default now(),  -- when this session_token was issued (a fresh login)
    last_seen_at   timestamptz not null default now()   -- last time the owning device checked in
);

comment on table public.active_session is 'Single-session enforcement (Security Module spec). One row per user holding the current login''s opaque session token. Never stores a Supabase JWT. See includes/auth.js registerActiveSession() and includes/authGuard.js checkSessionSupersession().';
comment on column public.active_session.session_token is 'Opaque, random, client-generated (crypto.randomUUID()) id for one browser''s login. Not a secret/capability — RLS still scopes every row to its own user_id regardless of this value.';
comment on column public.active_session.device_label is 'Optional coarse device hint (e.g. a truncated User-Agent string) for future "signed in on X" messaging. Not used for any access decision.';

-- ============================================================================
-- Row Level Security — every user may read/write ONLY their own row.
-- ============================================================================
-- Unlike database/schema/002_content_tables.sql's public-read / staff-write
-- split (which needs the SECURITY DEFINER public.inigosync_is_staff_or_admin()
-- helper to avoid a policy on `profiles` recursively querying `profiles`),
-- every operation here — SELECT, INSERT, UPDATE, DELETE — shares the exact
-- same condition, and `active_session` is not the table being protected
-- from its own lookup, so a single `for all` policy is enough; no helper
-- function needed. There is no anon/public access at all: only an
-- authenticated user, and only to their own row.
alter table public.active_session enable row level security;

grant select, insert, update, delete on public.active_session to authenticated;

drop policy if exists "active_session_own_row" on public.active_session;
create policy "active_session_own_row" on public.active_session
    for all
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);


-- ============================================================================
-- Frontend behaviour before vs. after this file is applied
-- ============================================================================
-- BEFORE (current live state — nothing throws, nothing blocks login):
--   * includes/auth.js's registerActiveSession() attempts an upsert on every
--     successful login, gets back a PostgREST "relation does not exist"
--     error, catches it, and returns without storing a local session token.
--     Login completes and redirects to the dashboard exactly as before this
--     phase existed.
--   * includes/authGuard.js's checkSessionSupersession() finds no locally
--     stored session token for the signed-in user (because it was never
--     written — see above) and returns immediately without querying the
--     table at all. No periodic check, no focus check, nothing.
--   * Net effect: two browsers can stay logged into the same account at
--     once, same as pre-Phase-6. Nothing about login or the three
--     dashboards changes or breaks.
--
-- AFTER — every successful login (customer, admin/staff panel, or Google)
-- upserts this user's row with a fresh token and remembers it locally; each
-- dashboard tab periodically (and on tab focus) compares its remembered
-- token against this table, and signs itself out the moment they no longer
-- match — i.e. the moment the same account logs in anywhere else.
-- ============================================================================
