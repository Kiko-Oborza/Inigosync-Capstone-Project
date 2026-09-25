-- One exclusion constraint must see both booking channels. Advisory-lock +
-- SELECT checks alone can read an old snapshot at REPEATABLE READ.
-- Apply as one transaction: lock writers during validation/backfill/install.
lock table public.booking, public.walk_in_booking in share row exclusive mode;

create schema if not exists internal;
create extension if not exists btree_gist;

-- A named unit is a singleton range; an unspecified legacy unit occupies all
-- units of that court. Unlike equality on a nullable label, range overlap
-- represents both cases without serializing unrelated courts or units.
create type internal.court_unit_range as range (subtype = text, collation = "C");

create table internal.reservation_slots (
    booking_id bigint unique references public.booking(booking_id) on update cascade on delete cascade,
    walkin_id bigint unique references public.walk_in_booking(walkin_id) on update cascade on delete cascade,
    court_key text not null check (court_key <> ''),
    unit_span internal.court_unit_range not null,
    during tstzrange not null check (
        not isempty(during) and not lower_inf(during) and not upper_inf(during)
        and isfinite(lower(during)) and isfinite(upper(during))
    ),
    constraint reservation_one_source check (num_nonnulls(booking_id, walkin_id) = 1),
    constraint reservation_slots_no_overlap exclude using gist (
        court_key with =, unit_span with &&, during with &&
    )
);
alter table internal.reservation_slots enable row level security;
revoke all on table internal.reservation_slots from public, anon, authenticated;
revoke all on type internal.court_unit_range from public, anon, authenticated;

-- Existing bad data aborts the migration, rather than cancelling or moving a
-- reservation automatically. The existing source RLS/payment policies stay put.
insert into internal.reservation_slots (booking_id, walkin_id, court_key, unit_span, during)
select booking_id, null::bigint, lower(btrim(courts)),
       internal.court_unit_range(nullif(lower(btrim(court_unit)), ''), nullif(lower(btrim(court_unit)), ''), '[]'),
       tstzrange(time_date, coalesce(end_at, time_date + make_interval(mins => coalesce(duration_minutes, 60))), '[)')
from public.booking where status in ('pending', 'confirmed')
union all
select null::bigint, walkin_id, lower(btrim(courts)),
       internal.court_unit_range(nullif(lower(btrim(court_unit)), ''), nullif(lower(btrim(court_unit)), ''), '[]'),
       tstzrange(time_date, coalesce(end_at, time_date + make_interval(mins => coalesce(duration_minutes, 60))), '[)')
from public.walk_in_booking where status in ('pending', 'confirmed');

-- Give both channels the same persisted interval. Explicit end edits win;
-- start/duration-only edits recalculate end instead of retaining a stale end.
create or replace function internal.normalize_reservation_time()
returns trigger language plpgsql set search_path = '' as $$
begin
    if tg_op = 'UPDATE' then
        if new.end_at is not distinct from old.end_at
           and (new.time_date is distinct from old.time_date
                or new.duration_minutes is distinct from old.duration_minutes) then
            new.end_at := new.time_date + pg_catalog.make_interval(mins => coalesce(new.duration_minutes, 60));
        end if;
    end if;
    if new.end_at is null then
        new.end_at := new.time_date + pg_catalog.make_interval(mins => coalesce(new.duration_minutes, 60));
    end if;
    if new.time_date is null or new.end_at is null
       or not pg_catalog.isfinite(new.time_date) or not pg_catalog.isfinite(new.end_at)
       or new.end_at <= new.time_date then
        raise exception 'A valid positive reservation time range is required' using errcode = '22023';
    end if;
    new.duration_minutes := greatest(1, pg_catalog.ceil(extract(epoch from (new.end_at - new.time_date)) / 60)::integer);
    if nullif(pg_catalog.btrim(new.courts), '') is null then
        raise exception 'A court is required' using errcode = '22023';
    end if;
    return new;
end;
$$;
revoke all on function internal.normalize_reservation_time() from public, anon, authenticated;

drop trigger if exists booking_fill_end_at_trigger on public.booking;
create trigger booking_normalize_time before insert or update on public.booking
for each row execute function internal.normalize_reservation_time();
create trigger walkin_normalize_time before insert or update on public.walk_in_booking
for each row execute function internal.normalize_reservation_time();

create or replace function internal.sync_reservation_slot()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
    unit_key text := nullif(pg_catalog.lower(pg_catalog.btrim(new.court_unit)), '');
begin
    if tg_table_name = 'booking' then
        if new.status in ('pending', 'confirmed') then
            insert into internal.reservation_slots (booking_id, court_key, unit_span, during)
            values (new.booking_id, pg_catalog.lower(pg_catalog.btrim(new.courts)),
                    internal.court_unit_range(unit_key, unit_key, '[]'),
                    pg_catalog.tstzrange(new.time_date, new.end_at, '[)'))
            on conflict (booking_id) do update set
                court_key = excluded.court_key, unit_span = excluded.unit_span, during = excluded.during;
        else
            delete from internal.reservation_slots where booking_id = new.booking_id;
        end if;
    else
        if new.status in ('pending', 'confirmed') then
            insert into internal.reservation_slots (walkin_id, court_key, unit_span, during)
            values (new.walkin_id, pg_catalog.lower(pg_catalog.btrim(new.courts)),
                    internal.court_unit_range(unit_key, unit_key, '[]'),
                    pg_catalog.tstzrange(new.time_date, new.end_at, '[)'))
            on conflict (walkin_id) do update set
                court_key = excluded.court_key, unit_span = excluded.unit_span, during = excluded.during;
        else
            delete from internal.reservation_slots where walkin_id = new.walkin_id;
        end if;
    end if;
    return new;
exception when exclusion_violation then
    -- Do not disclose source reservation IDs or other customers' details in
    -- constraint DETAIL text through PostgREST.
    raise exception 'This court is already reserved during the selected time' using errcode = '23P01';
end;
$$;
revoke all on function internal.sync_reservation_slot() from public, anon, authenticated;

drop trigger if exists booking_prevent_cross_channel_overlap on public.booking;
drop trigger if exists walkin_prevent_cross_channel_overlap on public.walk_in_booking;
drop function if exists internal.prevent_reservation_overlap();
drop function if exists public.booking_fill_end_at();
create trigger booking_sync_reservation_slot after insert or update on public.booking
for each row execute function internal.sync_reservation_slot();
create trigger walkin_sync_reservation_slot after insert or update on public.walk_in_booking
for each row execute function internal.sync_reservation_slot();

-- Same API contract, same auth checks, minimal occupancy fields only. Read
-- directly from the constrained ledger so availability and enforcement agree.
create or replace function public.court_occupancy(from_at timestamptz, to_at timestamptz)
returns table (source text, courts text, court_unit text, time_date timestamptz,
               end_at timestamptz, duration_minutes integer, status text)
language plpgsql stable security definer set search_path = '' as $$
begin
    if (select auth.uid()) is null then
        raise exception 'Sign in to check court availability' using errcode = '42501';
    end if;
    if from_at is null or to_at is null or not pg_catalog.isfinite(from_at)
       or not pg_catalog.isfinite(to_at) or to_at <= from_at or to_at - from_at > interval '31 days' then
        raise exception 'Availability range must be between 0 and 31 days' using errcode = '22023';
    end if;
    return query
    select 'online'::text, b.courts, b.court_unit, pg_catalog.lower(r.during), pg_catalog.upper(r.during),
           greatest(1, pg_catalog.ceil(extract(epoch from (pg_catalog.upper(r.during) - pg_catalog.lower(r.during))) / 60)::integer), b.status
    from internal.reservation_slots r join public.booking b on b.booking_id = r.booking_id
    where r.during && pg_catalog.tstzrange(from_at, to_at, '[)')
    union all
    select 'walkin'::text, w.courts, w.court_unit, pg_catalog.lower(r.during), pg_catalog.upper(r.during),
           greatest(1, pg_catalog.ceil(extract(epoch from (pg_catalog.upper(r.during) - pg_catalog.lower(r.during))) / 60)::integer), w.status
    from internal.reservation_slots r join public.walk_in_booking w on w.walkin_id = r.walkin_id
    where r.during && pg_catalog.tstzrange(from_at, to_at, '[)');
end;
$$;
revoke all on function public.court_occupancy(timestamptz, timestamptz) from public, anon;
grant execute on function public.court_occupancy(timestamptz, timestamptz) to authenticated;
