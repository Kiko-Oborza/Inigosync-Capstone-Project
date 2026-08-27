-- ============================================================================
-- IñigoSync — Seed: one demo login per role (customer / staff / admin)
-- ============================================================================
-- Run this in the Supabase SQL editor AFTER database/schema/002_content_tables.sql.
-- Safe to re-run: every account is looked up by email first, so re-running
-- this script updates the same 3 rows instead of creating duplicates.
--
-- Why raw SQL instead of the normal sign-up form: creating a CONFIRMED user
-- with a specific role requires either the service_role key (which must
-- never live in this repo — see Config/supabaseClient.js) or direct SQL.
-- This script does the latter.
--
-- What this does, per role:
--   1. Looks up auth.users by email. If missing, inserts a row directly
--      with a bcrypt-hashed password (pgcrypto's crypt()/gen_salt('bf') —
--      the same algorithm Supabase Auth itself verifies against) and
--      email_confirmed_at set to now(), so the account can log in
--      immediately with no confirmation email round-trip.
--   2. Inserts a matching auth.identities row (provider 'email'), the same
--      bookkeeping row a normal sign-up would create, in case anything
--      downstream (Supabase Studio's Auth page, future provider linking)
--      expects one.
--   3. Upserts the matching public.profiles row with the intended role.
--
-- IMPORTANT — a DB trigger already exists that auto-creates a profiles row
-- (role defaulting to 'customer') whenever a new auth.users row appears
-- (see includes/auth.js's comment on signUp: "role is never client-settable
-- — see the DB trigger"). For the staff/admin accounts below, that trigger
-- may fire first and insert a 'customer' row — step 3's UPDATE-on-conflict
-- corrects the role regardless, so the end state is always right no matter
-- what that trigger did.
--
-- Do not confuse two different "role" columns in this file:
--   * auth.users.role       — a Postgres/PostgREST/GoTrue internal claim.
--                              Always 'authenticated' for a normal user.
--   * public.profiles.role  — IñigoSync's own app-level role:
--                              'customer' | 'staff' | 'admin'.
--
-- Demo credentials (also documented in database/seed/README.md):
--   Customer — demo.customer@inigosync.test / InigoDemo!Cust1
--   Staff    — demo.staff@inigosync.test    / InigoDemo!Staff1
--   Admin    — demo.admin@inigosync.test    / InigoDemo!Admin1
-- The ".test" TLD is IANA-reserved for testing and can never resolve to a
-- real mailbox — these are throwaway demo accounts for a thesis defense,
-- not real users, and are deliberately impossible to mistake for one.
--
-- KNOWN LIMITATION: the anon key this project ships with cannot introspect
-- public.profiles' real column constraints (see implementation_plan.md).
-- The values below (status = 'active', etc.) are the best-supported guess
-- from how the rest of the codebase reads/writes profiles. If any INSERT
-- below fails on a constraint you can see in the table editor that this
-- script doesn't account for, adjust the values and re-run — the script's
-- idempotency means that's always safe.
--
-- FALLBACK: if this script ever fails because your project's auth.users /
-- auth.identities columns don't match what's assumed here, you can instead
-- create the 3 auth.users rows by hand via Supabase Dashboard →
-- Authentication → Users → "Add user" (tick "Auto Confirm User"), then run
-- just the "profiles upsert" portion of each block below to set the role.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ----------------------------------------------------------------------------
-- Customer — demo.customer@inigosync.test
-- ----------------------------------------------------------------------------
do $$
declare
    v_user_id uuid;
    v_email   text := 'demo.customer@inigosync.test';
begin
    select id into v_user_id from auth.users where email = v_email;

    if v_user_id is null then
        v_user_id := gen_random_uuid();

        insert into auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
            created_at, updated_at, confirmation_token, recovery_token,
            email_change_token_new, email_change, is_super_admin, is_sso_user
        ) values (
            '00000000-0000-0000-0000-000000000000',
            v_user_id, 'authenticated', 'authenticated', v_email,
            crypt('InigoDemo!Cust1', gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object('full_name', 'Demo Customer', 'contact_num', '09171234501'),
            now(), now(), '', '', '', '', false, false
        );

        insert into auth.identities (
            id, provider_id, user_id, identity_data, provider,
            last_sign_in_at, created_at, updated_at
        )
        select gen_random_uuid(), v_user_id::text, v_user_id,
               jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
               'email', now(), now(), now()
        where not exists (
            select 1 from auth.identities where provider = 'email' and user_id = v_user_id
        );
    end if;

    insert into public.profiles (id, role, full_name, email, status, contact_num, position, avatar_url, created_at)
    values (v_user_id, 'customer', 'Demo Customer', v_email, 'active', '09171234501', null, null, now())
    on conflict (id) do update set
        role       = excluded.role,
        full_name  = excluded.full_name,
        email      = excluded.email,
        status     = excluded.status,
        contact_num = excluded.contact_num;
end $$;

-- ----------------------------------------------------------------------------
-- Staff — demo.staff@inigosync.test
-- ----------------------------------------------------------------------------
do $$
declare
    v_user_id uuid;
    v_email   text := 'demo.staff@inigosync.test';
begin
    select id into v_user_id from auth.users where email = v_email;

    if v_user_id is null then
        v_user_id := gen_random_uuid();

        insert into auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
            created_at, updated_at, confirmation_token, recovery_token,
            email_change_token_new, email_change, is_super_admin, is_sso_user
        ) values (
            '00000000-0000-0000-0000-000000000000',
            v_user_id, 'authenticated', 'authenticated', v_email,
            crypt('InigoDemo!Staff1', gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object('full_name', 'Demo Staff', 'contact_num', '09171234502'),
            now(), now(), '', '', '', '', false, false
        );

        insert into auth.identities (
            id, provider_id, user_id, identity_data, provider,
            last_sign_in_at, created_at, updated_at
        )
        select gen_random_uuid(), v_user_id::text, v_user_id,
               jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
               'email', now(), now(), now()
        where not exists (
            select 1 from auth.identities where provider = 'email' and user_id = v_user_id
        );
    end if;

    insert into public.profiles (id, role, full_name, email, status, contact_num, position, avatar_url, created_at)
    values (v_user_id, 'staff', 'Demo Staff', v_email, 'active', '09171234502', 'Court Attendant', null, now())
    on conflict (id) do update set
        role       = excluded.role,
        full_name  = excluded.full_name,
        email      = excluded.email,
        status     = excluded.status,
        contact_num = excluded.contact_num,
        position   = excluded.position;
end $$;

-- ----------------------------------------------------------------------------
-- Admin — demo.admin@inigosync.test
-- ----------------------------------------------------------------------------
do $$
declare
    v_user_id uuid;
    v_email   text := 'demo.admin@inigosync.test';
begin
    select id into v_user_id from auth.users where email = v_email;

    if v_user_id is null then
        v_user_id := gen_random_uuid();

        insert into auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
            created_at, updated_at, confirmation_token, recovery_token,
            email_change_token_new, email_change, is_super_admin, is_sso_user
        ) values (
            '00000000-0000-0000-0000-000000000000',
            v_user_id, 'authenticated', 'authenticated', v_email,
            crypt('InigoDemo!Admin1', gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object('full_name', 'Demo Admin', 'contact_num', '09171234503'),
            now(), now(), '', '', '', '', false, false
        );

        insert into auth.identities (
            id, provider_id, user_id, identity_data, provider,
            last_sign_in_at, created_at, updated_at
        )
        select gen_random_uuid(), v_user_id::text, v_user_id,
               jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
               'email', now(), now(), now()
        where not exists (
            select 1 from auth.identities where provider = 'email' and user_id = v_user_id
        );
    end if;

    insert into public.profiles (id, role, full_name, email, status, contact_num, position, avatar_url, created_at)
    values (v_user_id, 'admin', 'Demo Admin', v_email, 'active', '09171234503', 'Owner', null, now())
    on conflict (id) do update set
        role       = excluded.role,
        full_name  = excluded.full_name,
        email      = excluded.email,
        status     = excluded.status,
        contact_num = excluded.contact_num,
        position   = excluded.position;
end $$;
