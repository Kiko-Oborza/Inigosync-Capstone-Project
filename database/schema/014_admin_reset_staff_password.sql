-- ============================================================================
-- IñigoSync — Schema: admin staff-password reset RPC (Revision A1, decision A4)
-- ============================================================================
-- Run this in the Supabase SQL editor (Project → SQL Editor). Order relative
-- to every other file in database/schema/ doesn't matter — this only adds a
-- new extension (if missing) and a new function. Safe to re-run: the
-- extension uses `if not exists`, and the function is `create or replace`.
--
-- Why this exists: the owner dashboard's Staff Management → Reset Password
-- action used to call sb.auth.resetPasswordForEmail(email), which only
-- EMAILS a reset link — it never actually changes anything by itself, and
-- depends on the Reset Password email template + SMTP being configured
-- (docs/OWNER_ACTION_LIST.md items E3/E2). The user asked for a simpler,
-- always-available action instead: reset the target account's password to a
-- known default (`12345678`) immediately, so staff can log back in right
-- away and are expected to change it themselves afterwards.
--
-- SECURITY — this function touches auth.users directly, which the anon/
-- publishable key can NEVER do on its own (no direct table access, and RLS
-- on auth.users is not something this project's frontend key can bypass).
-- The ONLY reason this is safe to expose to `authenticated` at all is that
-- the function is SECURITY DEFINER (runs with the privileges of whoever
-- owns it, typically `postgres`) AND re-derives every permission check
-- itself, from auth.uid(), INSIDE the function body — it never trusts
-- anything the caller merely claims. Concretely:
--   1. auth.uid() must be non-null (a real authenticated session).
--   2. That uid's OWN profiles row must have role = 'admin' AND
--      status = 'active' — a disabled or non-admin caller is rejected with
--      a Postgres exception, not a silent no-op.
--   3. The TARGET id must belong to an existing profiles row whose role is
--      'staff' or 'admin' (never a customer), and must not be the caller's
--      own id (self-service password changes already exist via Account
--      Settings' Change Password wizard — this RPC is for resetting SOMEONE
--      ELSE's forgotten/locked-out password, not a shortcut around your own).
-- `revoke ... from public, anon` + `grant execute ... to authenticated`
-- below mean an anonymous/unauthenticated caller cannot invoke this at all
-- (auth.uid() would be null anyway, but the grant is removed as
-- belt-and-braces — see this repo's other SECURITY DEFINER function,
-- public.inigosync_is_staff_or_admin() in 002_content_tables.sql, for the
-- same pattern applied to a read-only check).
--
-- `set search_path = public, auth, extensions` pins the function's name
-- resolution (the standard Postgres/Supabase hardening for SECURITY DEFINER
-- functions — an unpinned search_path lets a caller with schema-create
-- rights shadow an unqualified function/table name and hijack execution).
-- `extensions.crypt`/`extensions.gen_salt` are ALSO fully schema-qualified
-- in the body itself, so this works even if a project's pgcrypto happens to
-- live somewhere other than the first search_path entry.
-- ============================================================================

-- Supabase projects almost always already have pgcrypto installed (under
-- the `extensions` schema) — `if not exists` makes this a no-op there. Only
-- a from-scratch Postgres instance without it would actually create it here
-- (landing in whatever the session's default schema is), which is why the
-- function body below addresses it by its fully-qualified `extensions.*`
-- names rather than relying on search_path alone.
create extension if not exists pgcrypto;

create or replace function public.admin_reset_staff_password(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
    target_role   text;
    target_status text;
begin
    -- 1. Must be a real, currently-authenticated session.
    if auth.uid() is null then
        raise exception 'You must be signed in to do this.';
    end if;

    -- 2. Caller must be an ACTIVE admin — re-checked here every call, never
    -- trusted from anything the client passed in (the client sends nothing
    -- about itself at all; target_id is the only argument).
    if not exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and role = 'admin'
          and status = 'active'
    ) then
        raise exception 'Only an active admin can reset a staff password.';
    end if;

    -- Self-target guard — resetting your OWN password already has a real,
    -- verified path (Account Settings' Change Password wizard, which
    -- re-authenticates with the CURRENT password first). This RPC is for
    -- resetting someone else's.
    if target_id = auth.uid() then
        raise exception 'You cannot reset your own password with this action — use Change Password in Account Settings instead.';
    end if;

    select role, status into target_role, target_status
    from public.profiles
    where id = target_id;

    if target_role is null then
        raise exception 'That account could not be found.';
    end if;

    if target_role not in ('staff', 'admin') then
        raise exception 'That account is not a staff or admin account.';
    end if;

    update auth.users
    set encrypted_password = extensions.crypt('12345678', extensions.gen_salt('bf')),
        updated_at = now()
    where id = target_id;

    -- Hardening (post-A4 review): a password reset must also END every
    -- session that account currently holds, otherwise whoever is signed in
    -- as that staff member right now (possibly not the staff member) keeps
    -- a valid refresh token until it naturally expires. Revoking the
    -- refresh tokens forces a fresh login with the new default password;
    -- clearing active_session (database/schema/005_session_security.sql)
    -- makes includes/authGuard.js's single-session check fail-closed on
    -- the very next request from any still-open tab.
    -- Nested block: if this project's `postgres` role ever lacks DELETE on
    -- auth.refresh_tokens, the password reset above must still succeed —
    -- the session revocation is defence in depth, not the primary action.
    begin
        delete from auth.refresh_tokens where user_id = target_id::text;
    exception when insufficient_privilege then
        raise notice 'admin_reset_staff_password: could not revoke refresh tokens (insufficient privilege) — password was still reset.';
    end;
    delete from public.active_session where user_id = target_id;
end;
$$;

comment on function public.admin_reset_staff_password(uuid) is 'Revision A1, decision A4 (implementation_plan.md) — resets a staff/admin account''s password to the fixed default "12345678". SECURITY DEFINER: verifies (inside the function, never trusting the caller) that auth.uid() is an active admin, that target_id is a staff/admin account, and that target_id is not the caller''s own id, before touching auth.users. Called from includes/owner_dashboard.js via sb.rpc(''admin_reset_staff_password'', { target_id }) — Staff Management''s Reset Password button. Intended default-password policy: staff are expected to change it via their own Account Settings immediately after logging back in; the owner dashboard''s confirm()/toast make this explicit at the point of use.';

-- Revoked from public/anon (belt-and-braces — an anonymous caller has no
-- auth.uid() anyway, so the function would already raise) and granted only
-- to authenticated, matching the SECURITY DEFINER convention already used
-- by public.inigosync_is_staff_or_admin() (002_content_tables.sql).
revoke all on function public.admin_reset_staff_password(uuid) from public, anon;
grant execute on function public.admin_reset_staff_password(uuid) to authenticated;

-- ============================================================================
-- Frontend behaviour before vs. after this file is applied
-- ============================================================================
-- BEFORE (current live state, this migration NOT applied): includes/
-- owner_dashboard.js's Reset Password button calls
-- sb.rpc('admin_reset_staff_password', ...), which fails with Postgres error
-- code 42883 ("function does not exist") — recognized by this file's own
-- isSchemaMismatchError() the same way every other not-yet-migrated feature
-- on this page is, and surfaced as an honest "needs a database update"
-- toast rather than a silent failure or a fake success message.
--
-- AFTER: an active admin clicking Reset Password on a staff/admin row sets
-- that account's password to "12345678" immediately (no email round trip);
-- a non-admin or disabled caller gets a clear Postgres exception instead of
-- silently doing nothing; resetting your own row, or a customer's, is
-- rejected the same way.
-- ============================================================================
