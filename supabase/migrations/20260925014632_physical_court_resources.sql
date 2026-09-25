-- Physical-resource reservation model shared by customer bookings and staff
-- walk-ins. A sport listing unit can be mapped to one or more real resources,
-- and multiple sport listings can map to the same resource.

create table if not exists public.court_unit_inventory (
    id uuid primary key default gen_random_uuid(),
    court_id uuid not null references public.court(id) on delete cascade,
    label text not null,
    pricing_tier text,
    is_active boolean not null default true,
    inventory_verified boolean not null default true,
    created_at timestamptz not null default now(),
    unique (court_id, label),
    check (nullif(btrim(label), '') is not null),
    check (pricing_tier is null or pricing_tier in ('old', 'new', 'standard'))
);

create table if not exists public.physical_court_resource (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    check (nullif(btrim(name), '') is not null)
);

create table if not exists public.court_unit_resource_map (
    court_unit_id uuid not null references public.court_unit_inventory(id) on delete cascade,
    resource_id uuid not null references public.physical_court_resource(id) on delete restrict,
    primary key (court_unit_id, resource_id)
);
create index if not exists court_unit_resource_map_resource_idx
    on public.court_unit_resource_map(resource_id);

alter table public.court_unit_inventory enable row level security;
alter table public.physical_court_resource enable row level security;
alter table public.court_unit_resource_map enable row level security;

grant select on public.court_unit_inventory, public.physical_court_resource,
    public.court_unit_resource_map to anon, authenticated;
grant insert, update, delete on public.court_unit_inventory,
    public.physical_court_resource, public.court_unit_resource_map to authenticated;

drop policy if exists court_unit_inventory_read on public.court_unit_inventory;
create policy court_unit_inventory_read on public.court_unit_inventory
    for select to anon, authenticated using (inventory_verified and is_active);
drop policy if exists court_unit_inventory_admin_write on public.court_unit_inventory;
create policy court_unit_inventory_admin_write on public.court_unit_inventory
    for all to authenticated
    using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
    with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists physical_court_resource_read on public.physical_court_resource;
create policy physical_court_resource_read on public.physical_court_resource
    for select to anon, authenticated using (true);
drop policy if exists physical_court_resource_admin_write on public.physical_court_resource;
create policy physical_court_resource_admin_write on public.physical_court_resource
    for all to authenticated
    using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
    with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists court_unit_resource_map_read on public.court_unit_resource_map;
create policy court_unit_resource_map_read on public.court_unit_resource_map
    for select to anon, authenticated using (exists (
        select 1 from public.court_unit_inventory u
        join public.physical_court_resource r on r.id = court_unit_resource_map.resource_id and r.is_active
        where u.id = court_unit_resource_map.court_unit_id
          and u.is_active and u.inventory_verified
    ));
drop policy if exists court_unit_resource_map_admin_write on public.court_unit_resource_map;
create policy court_unit_resource_map_admin_write on public.court_unit_resource_map
    for all to authenticated
    using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
    with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create table if not exists internal.reservation_resource_slots (
    booking_id bigint references public.booking(booking_id) on update cascade on delete cascade,
    walkin_id bigint references public.walk_in_booking(walkin_id) on update cascade on delete cascade,
    resource_id uuid not null references public.physical_court_resource(id) on delete restrict,
    during tstzrange not null check (
        not isempty(during) and not lower_inf(during) and not upper_inf(during)
        and isfinite(lower(during)) and isfinite(upper(during))
    ),
    check (num_nonnulls(booking_id, walkin_id) = 1),
    unique (booking_id, resource_id),
    unique (walkin_id, resource_id),
    constraint reservation_resource_slots_no_overlap exclude using gist
        (resource_id with =, during with &&)
);
alter table internal.reservation_resource_slots enable row level security;
revoke all on table internal.reservation_resource_slots from public, anon, authenticated;

-- Stable per-unit rows for the venue's currently configured inventory. Labels
-- intentionally remain the same labels already used in reservation records.
insert into public.court_unit_inventory (court_id, label)
select c.id,
       case when c.unit in ('lanes', 'tables') then initcap(regexp_replace(c.unit, 's$', ''))
            else 'Court' end || ' ' || n::text
from public.court c
cross join lateral generate_series(1, greatest(1, c.quantity)) as n
on conflict (court_id, label) do nothing;

-- The current pickleball quantity is known to be stale; keep the last-known
-- labels for historical reconciliation, but do not expose them as bookable
-- until an admin verifies the renovated inventory.
update public.court_unit_inventory u
set inventory_verified = false
from public.court c
where c.id = u.court_id and c.slug = 'pickleball';

-- Each known unit begins mapped to its own physical resource. Administrators
-- can map a second sport's unit onto the same resource to express shared space.
-- Pickleball's physical inventory is explicitly marked for admin verification;
-- never infer that stale quantity is complete.
insert into public.physical_court_resource (name)
select c.name || ' · ' || u.label
from public.court_unit_inventory u
join public.court c on c.id = u.court_id
where not exists (
    select 1 from public.court_unit_resource_map m where m.court_unit_id = u.id
);
insert into public.court_unit_resource_map (court_unit_id, resource_id)
select u.id, r.id
from public.court_unit_inventory u
join public.court c on c.id = u.court_id
join public.physical_court_resource r on r.name = c.name || ' · ' || u.label
on conflict do nothing;

-- Retain a normalized source occupancy row for compatibility with PayMongo and
-- reporting, and also reserve every physical resource represented by a source
-- court unit. Unspecified legacy units conservatively occupy every resource
-- mapped to that listing.
create or replace function internal.sync_reservation_resource_slots()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
    listing_id uuid;
    target_booking bigint;
    target_walkin bigint;
    mapped_count integer;
begin
    if tg_table_name = 'booking' then
        target_booking := new.booking_id;
        target_walkin := null;
        delete from internal.reservation_resource_slots where booking_id = new.booking_id;
    else
        target_booking := null;
        target_walkin := new.walkin_id;
        delete from internal.reservation_resource_slots where walkin_id = new.walkin_id;
    end if;

    if new.status not in ('pending', 'confirmed') then
        return new;
    end if;

    select c.id into listing_id from public.court c
    where lower(btrim(c.name)) = lower(btrim(new.courts)) and c.is_active
    limit 1;
    if listing_id is null then
        raise exception 'This court is not configured for booking' using errcode = '22023';
    end if;

    insert into internal.reservation_resource_slots (booking_id, walkin_id, resource_id, during)
    select target_booking, target_walkin, m.resource_id,
           pg_catalog.tstzrange(new.time_date, new.end_at, '[)')
    from public.court_unit_inventory u
    join public.court_unit_resource_map m on m.court_unit_id = u.id
    join public.physical_court_resource r on r.id = m.resource_id and r.is_active
    where u.court_id = listing_id and u.is_active and u.inventory_verified
      and (nullif(btrim(new.court_unit), '') is null
           or lower(btrim(u.label)) = lower(btrim(new.court_unit)));

    get diagnostics mapped_count = row_count;
    if mapped_count = 0 then
        raise exception 'This court unit is not configured for booking' using errcode = '22023';
    end if;
    return new;
exception when exclusion_violation then
    raise exception 'This physical court is already reserved during the selected time' using errcode = '23P01';
end;
$$;
revoke all on function internal.sync_reservation_resource_slots() from public, anon, authenticated;
drop trigger if exists booking_sync_reservation_resource_slots on public.booking;
create trigger booking_sync_reservation_resource_slots after insert or update on public.booking
for each row execute function internal.sync_reservation_resource_slots();
drop trigger if exists walkin_sync_reservation_resource_slots on public.walk_in_booking;
create trigger walkin_sync_reservation_resource_slots after insert or update on public.walk_in_booking
for each row execute function internal.sync_reservation_resource_slots();

-- Backfill from the existing constrained source ledger. Any existing
-- unspecified court_unit reserves every resource configured for that listing.
insert into internal.reservation_resource_slots (booking_id, walkin_id, resource_id, during)
select s.booking_id, s.walkin_id, m.resource_id, s.during
from internal.reservation_slots s
join public.booking b on b.booking_id = s.booking_id
join public.court c on lower(btrim(c.name)) = lower(btrim(b.courts))
join public.court_unit_inventory u on u.court_id = c.id and u.is_active and u.inventory_verified
join public.court_unit_resource_map m on m.court_unit_id = u.id
where b.status in ('pending', 'confirmed')
  and (nullif(btrim(b.court_unit), '') is null or lower(btrim(u.label)) = lower(btrim(b.court_unit)))
union all
select s.booking_id, s.walkin_id, m.resource_id, s.during
from internal.reservation_slots s
join public.walk_in_booking w on w.walkin_id = s.walkin_id
join public.court c on lower(btrim(c.name)) = lower(btrim(w.courts))
join public.court_unit_inventory u on u.court_id = c.id and u.is_active and u.inventory_verified
join public.court_unit_resource_map m on m.court_unit_id = u.id
where w.status in ('pending', 'confirmed')
  and (nullif(btrim(w.court_unit), '') is null or lower(btrim(u.label)) = lower(btrim(w.court_unit)))
on conflict do nothing;

-- Mapping edits are configuration changes with occupancy consequences. Rebuild
-- the physical ledger in the same transaction; adding an invalid shared-space
-- mapping fails on the exclusion constraint and rolls the mapping back.
create or replace function internal.refresh_reservation_resource_slots()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if exists (
        select 1 from internal.reservation_slots s
        join public.booking b on b.booking_id = s.booking_id and b.status in ('pending', 'confirmed')
        join public.court c on lower(btrim(c.name)) = lower(btrim(b.courts))
        where nullif(btrim(b.court_unit), '') is not null
          and not exists (select 1 from public.court_unit_inventory u
                          where u.court_id = c.id and lower(btrim(u.label)) = lower(btrim(b.court_unit))
                            and u.is_active)
        union all
        select 1 from internal.reservation_slots s
        join public.walk_in_booking w on w.walkin_id = s.walkin_id and w.status in ('pending', 'confirmed')
        join public.court c on lower(btrim(c.name)) = lower(btrim(w.courts))
        where nullif(btrim(w.court_unit), '') is not null
          and not exists (select 1 from public.court_unit_inventory u
                          where u.court_id = c.id and lower(btrim(u.label)) = lower(btrim(w.court_unit))
                            and u.is_active)
    ) then
        raise exception 'An active reservation refers to a court unit that would be removed or renamed' using errcode = '23503';
    end if;
    delete from internal.reservation_resource_slots;
    insert into internal.reservation_resource_slots (booking_id, walkin_id, resource_id, during)
    select s.booking_id, s.walkin_id, m.resource_id, s.during
    from internal.reservation_slots s
    join public.booking b on b.booking_id = s.booking_id
    join public.court c on lower(btrim(c.name)) = lower(btrim(b.courts))
    join public.court_unit_inventory u on u.court_id = c.id and u.is_active and u.inventory_verified
    join public.court_unit_resource_map m on m.court_unit_id = u.id
    where b.status in ('pending', 'confirmed')
      and (nullif(btrim(b.court_unit), '') is null or lower(btrim(u.label)) = lower(btrim(b.court_unit)))
    union all
    select s.booking_id, s.walkin_id, m.resource_id, s.during
    from internal.reservation_slots s
    join public.walk_in_booking w on w.walkin_id = s.walkin_id
    join public.court c on lower(btrim(c.name)) = lower(btrim(w.courts))
    join public.court_unit_inventory u on u.court_id = c.id and u.is_active and u.inventory_verified
    join public.court_unit_resource_map m on m.court_unit_id = u.id
    where w.status in ('pending', 'confirmed')
      and (nullif(btrim(w.court_unit), '') is null or lower(btrim(u.label)) = lower(btrim(w.court_unit)));
    if exists (
        select 1 from internal.reservation_slots s
        where (s.booking_id is not null and not exists (
            select 1 from internal.reservation_resource_slots r where r.booking_id = s.booking_id))
           or (s.walkin_id is not null and not exists (
            select 1 from internal.reservation_resource_slots r where r.walkin_id = s.walkin_id))
    ) then
        raise exception 'Every active reservation must remain linked to a physical resource' using errcode = '23503';
    end if;
    return null;
exception when exclusion_violation then
    raise exception 'The resource mapping conflicts with an active reservation' using errcode = '23P01';
end;
$$;
revoke all on function internal.refresh_reservation_resource_slots() from public, anon, authenticated;
drop trigger if exists court_unit_resource_map_refresh_reservations on public.court_unit_resource_map;
create trigger court_unit_resource_map_refresh_reservations
after insert or update or delete on public.court_unit_resource_map
for each statement execute function internal.refresh_reservation_resource_slots();

-- Availability is projected back through the same mapping used by the hard
-- exclusion constraint, so other sport listings sharing a physical resource
-- display the reservation as occupied too.
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
    select distinct on (rs.resource_id, coalesce(rs.booking_id, -rs.walkin_id), c.id, u.id)
        case when rs.booking_id is not null then 'online'::text else 'walkin'::text end,
        c.name, u.label, pg_catalog.lower(rs.during), pg_catalog.upper(rs.during),
        greatest(1, pg_catalog.ceil(extract(epoch from (pg_catalog.upper(rs.during) - pg_catalog.lower(rs.during))) / 60)::integer),
        coalesce(b.status, w.status)
    from internal.reservation_resource_slots rs
    join public.court_unit_resource_map target_map on target_map.resource_id = rs.resource_id
    join public.court_unit_inventory u on u.id = target_map.court_unit_id and u.is_active
    join public.court c on c.id = u.court_id and c.is_active
    left join public.booking b on b.booking_id = rs.booking_id
    left join public.walk_in_booking w on w.walkin_id = rs.walkin_id
    where rs.during && pg_catalog.tstzrange(from_at, to_at, '[)')
    order by rs.resource_id, coalesce(rs.booking_id, -rs.walkin_id), c.id, u.id;
end;
$$;
revoke all on function public.court_occupancy(timestamptz, timestamptz) from public, anon;
grant execute on function public.court_occupancy(timestamptz, timestamptz) to authenticated;
