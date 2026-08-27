-- ============================================================================
-- IñigoSync — QA INTROSPECTION (READ-ONLY)
-- ============================================================================
-- Purpose: the QA/audit pass has only the publishable (anon) key, which cannot
-- read Postgres catalogs. These queries answer the questions the audit could
-- not answer from the outside. Nothing here writes, alters, or drops anything.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query
--   Paste ONE numbered block at a time, click Run, copy the result grid back.
--   (Running the whole file at once only shows the LAST result in the editor.)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Every table in the public schema, with its row count and RLS flag.
--    Confirms which tables exist and whether RLS is actually ON (not just
--    "policies were written in a .sql file that may never have been run").
-- ----------------------------------------------------------------------------
select
    c.relname                                   as table_name,
    c.relrowsecurity                            as rls_enabled,
    c.relforcerowsecurity                       as rls_forced,
    (select count(*) from pg_policy p where p.polrelid = c.oid) as policy_count,
    pg_catalog.obj_description(c.oid, 'pg_class') as comment
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relname;


-- ----------------------------------------------------------------------------
-- 2. Exact live row counts (query 1's estimate can be stale).
--    Any table listed in query 1 but missing here = it does not exist.
-- ----------------------------------------------------------------------------
select 'profiles'         as t, count(*) from public.profiles
union all select 'booking',          count(*) from public.booking
union all select 'payment',          count(*) from public.payment
union all select 'walk_in_booking',  count(*) from public.walk_in_booking
union all select 'sport',            count(*) from public.sport
union all select 'court',            count(*) from public.court
union all select 'event',            count(*) from public.event
union all select 'testimonial',      count(*) from public.testimonial
order by 1;


-- ----------------------------------------------------------------------------
-- 3. Full column definitions for the operational tables.
--    The audit had to INFER these from application code. This replaces the
--    guesswork: nullability, defaults, and exact types.
-- ----------------------------------------------------------------------------
select
    table_name,
    ordinal_position as pos,
    column_name,
    data_type,
    is_nullable,
    column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('profiles','booking','payment','walk_in_booking',
                     'sport','court','event','testimonial')
order by table_name, ordinal_position;


-- ----------------------------------------------------------------------------
-- 4. All constraints: primary keys, foreign keys, UNIQUE, and CHECK.
--    CHECK constraints matter most — they reveal the allowed values for
--    columns like profiles.role, booking.status, payment.status, which the
--    frontend currently hardcodes as string literals.
-- ----------------------------------------------------------------------------
select
    rel.relname            as table_name,
    con.conname            as constraint_name,
    case con.contype
        when 'p' then 'PRIMARY KEY'
        when 'f' then 'FOREIGN KEY'
        when 'u' then 'UNIQUE'
        when 'c' then 'CHECK'
        else con.contype::text
    end                    as kind,
    pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace n on n.oid = rel.relnamespace
where n.nspname = 'public'
order by rel.relname, kind, con.conname;


-- ----------------------------------------------------------------------------
-- 5. Every RLS policy, in full.
--    THIS IS THE SECURITY-CRITICAL ONE. The whole system's access control
--    depends on these, because the frontend role checks are client-side only
--    and a user can bypass them with devtools. Look for:
--      * a table with rls_enabled = true in query 1 but ZERO policies here
--        -> that table is completely unreadable/unwritable (silently breaks features)
--      * any policy with qual = "true" for role "anon" or "public" on
--        profiles / booking / payment -> data leak
--      * any INSERT/UPDATE/DELETE policy that does not check auth.uid()
-- ----------------------------------------------------------------------------
select
    rel.relname                              as table_name,
    pol.polname                              as policy_name,
    case pol.polcmd
        when 'r' then 'SELECT' when 'a' then 'INSERT'
        when 'w' then 'UPDATE' when 'd' then 'DELETE'
        else 'ALL'
    end                                      as command,
    coalesce(
        (select string_agg(rolname, ', ') from pg_roles where oid = any(pol.polroles)),
        'PUBLIC'
    )                                        as applies_to_roles,
    pg_get_expr(pol.polqual,      pol.polrelid) as using_expression,
    pg_get_expr(pol.polwithcheck, pol.polrelid) as with_check_expression
from pg_policy pol
join pg_class rel on rel.oid = pol.polrelid
join pg_namespace n on n.oid = rel.relnamespace
where n.nspname = 'public'
order by rel.relname, command, pol.polname;


-- ----------------------------------------------------------------------------
-- 6. Triggers and the functions they call.
--    Specifically: confirm the handle_new_user trigger that is supposed to
--    auto-create a profiles row on signup actually exists. If it does not,
--    every Google-OAuth signup lands with NO profile row and therefore NO
--    role -- which would break the role redirect after login.
-- ----------------------------------------------------------------------------
select
    trg.tgname                as trigger_name,
    rel.relname               as on_table,
    nsp.nspname               as on_schema,
    proc.proname              as calls_function,
    pg_get_triggerdef(trg.oid) as definition
from pg_trigger trg
join pg_class rel     on rel.oid = trg.tgrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
join pg_proc proc     on proc.oid = trg.tgfoid
where not trg.tgisinternal
  and nsp.nspname in ('public', 'auth')
order by nsp.nspname, rel.relname, trg.tgname;


-- ----------------------------------------------------------------------------
-- 7. Source of every custom function in public/auth.
--    Read handle_new_user's body: does it set role from user_metadata?
--    If it does, a user can self-assign role='admin' at signup by passing it
--    in the signUp options -- a full privilege-escalation hole.
-- ----------------------------------------------------------------------------
select
    n.nspname   as schema,
    p.proname   as function_name,
    pg_get_functiondef(p.oid) as source
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
   or (n.nspname = 'auth' and p.proname not like 'pg_%')
order by n.nspname, p.proname;


-- ----------------------------------------------------------------------------
-- 8. The actual user accounts, and whether their profile role lines up.
--    Expect exactly one usable account per role for the demo.
--    role_status column flags any auth user with no matching profiles row.
-- ----------------------------------------------------------------------------
select
    u.id,
    u.email,
    u.email_confirmed_at is not null as confirmed,
    u.last_sign_in_at,
    u.raw_app_meta_data ->> 'provider'  as signup_provider,
    p.role                              as app_role,
    p.status                            as profile_status,
    case
        when p.id is null then '!! NO PROFILE ROW -- role redirect will fail'
        else 'ok'
    end                                 as role_status
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at;


-- ----------------------------------------------------------------------------
-- 9. Scheduled jobs (pg_cron) and installed extensions.
--    The spec requires (a) automatic cancellation after a 30-minute grace
--    period and (b) a booking reminder in the 5h->0h window. Both need a
--    server-side scheduler; neither can be done reliably in browser JS,
--    because it only runs while somebody has the tab open.
--    If pg_cron is absent here, NEITHER feature can currently work.
-- ----------------------------------------------------------------------------
select extname, extversion from pg_extension order by extname;

-- Run this one only if the query above lists 'pg_cron':
-- select jobid, schedule, command, nodename, active, jobname from cron.job order by jobid;


-- ----------------------------------------------------------------------------
-- 10. Overlapping / double-booked reservations.
--     The paper names preventing double booking as a core objective. If this
--     returns ANY rows, the system has already allowed a double booking and
--     the guarantee is not enforced at the database level.
--     NOTE: adjust column names if query 3 shows they differ.
-- ----------------------------------------------------------------------------
select
    a.id            as booking_a,
    b.id            as booking_b,
    a.courts        as court,
    a.booking_date  as date,
    a.start_time    as a_start, a.end_time as a_end,
    b.start_time    as b_start, b.end_time as b_end,
    a.status        as a_status, b.status as b_status
from public.booking a
join public.booking b
  on  a.id < b.id
  and a.courts       = b.courts
  and a.booking_date = b.booking_date
  and a.start_time   < b.end_time
  and b.start_time   < a.end_time
where a.status not in ('cancelled','canceled','expired')
  and b.status not in ('cancelled','canceled','expired');
