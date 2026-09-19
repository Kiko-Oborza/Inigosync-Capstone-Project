-- Anonymous signup needs an exact-address existence answer by design. It must
-- never gain SELECT access to auth.users/profiles or receive IDs/roles/status.
create schema if not exists signup_private;
revoke all on schema signup_private from public;
grant usage on schema signup_private to anon, authenticated;

create table signup_private.email_check_limits (
    bucket text not null,
    minute timestamptz not null,
    hits integer not null check (hits > 0),
    primary key (bucket, minute)
);
create index email_check_limits_expiry on signup_private.email_check_limits (minute);
alter table signup_private.email_check_limits enable row level security;
revoke all on signup_private.email_check_limits from public, anon, authenticated;

create function signup_private.email_availability(email_address text)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
    normalized text := pg_catalog.lower(pg_catalog.btrim(email_address));
    current_minute timestamptz := pg_catalog.date_trunc('minute', pg_catalog.clock_timestamp());
    request_headers jsonb := coalesce(nullif(pg_catalog.current_setting('request.headers', true), ''), '{}')::jsonb;
    caller_bucket text;
    used integer;
begin
    -- This is intentionally callable before auth.uid() exists: signup is public.
    if normalized is null or length(normalized) > 254 or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
        return 'invalid';
    end if;
    delete from signup_private.email_check_limits where minute < current_minute - interval '5 minutes';

    -- A shared cap bounds lookup volume even if a client spoofs IP headers.
    insert into signup_private.email_check_limits as limits (bucket, minute, hits)
    values ('global', current_minute, 1)
    on conflict (bucket, minute) do update set hits = limits.hits + 1 where limits.hits < 300
    returning hits into used;
    if used is null then return 'rate_limited'; end if;

    -- Do not persist email addresses or raw client IPs in the limiter.
    caller_bucket := 'ip:' || pg_catalog.md5(coalesce(nullif(request_headers->>'x-forwarded-for', ''), nullif(request_headers->>'x-real-ip', ''), 'unknown'));
    used := null;
    insert into signup_private.email_check_limits as limits (bucket, minute, hits)
    values (caller_bucket, current_minute, 1)
    on conflict (bucket, minute) do update set hits = limits.hits + 1 where limits.hits < 20
    returning hits into used;
    if used is null then return 'rate_limited'; end if;

    if exists (select 1 from auth.users where pg_catalog.lower(email) = normalized) then
        return 'taken';
    end if;
    return 'available';
end;
$$;
revoke all on function signup_private.email_availability(text) from public;
grant execute on function signup_private.email_availability(text) to anon, authenticated;

-- Only this tiny invoker wrapper is exposed through PostgREST.
create function public.signup_email_availability(email_address text)
returns text language sql volatile security invoker set search_path = ''
as $$ select signup_private.email_availability(email_address); $$;
revoke all on function public.signup_email_availability(text) from public;
grant execute on function public.signup_email_availability(text) to anon, authenticated;
comment on function public.signup_email_availability(text) is 'Rate-limited signup email check. Returns available/taken/invalid/rate_limited only; does not reserve an email or create an account.';
