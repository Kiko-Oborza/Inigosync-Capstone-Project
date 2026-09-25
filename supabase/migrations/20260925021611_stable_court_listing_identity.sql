-- Stable listing identity and fail-closed resource lifecycle guards.
create unique index if not exists court_normalized_name_uidx
    on public.court (lower(btrim(name)));

alter table public.booking add column if not exists court_listing_id uuid
    references public.court(id) on update cascade on delete restrict;
alter table public.walk_in_booking add column if not exists court_listing_id uuid
    references public.court(id) on update cascade on delete restrict;
update public.booking b set court_listing_id = c.id from public.court c
where b.court_listing_id is null and lower(btrim(c.name)) = lower(btrim(b.courts));
update public.walk_in_booking w set court_listing_id = c.id from public.court c
where w.court_listing_id is null and lower(btrim(c.name)) = lower(btrim(w.courts));
create index if not exists booking_court_listing_id_idx on public.booking(court_listing_id) where court_listing_id is not null;
create index if not exists walkin_court_listing_id_idx on public.walk_in_booking(court_listing_id) where court_listing_id is not null;

-- Normalize to stable IDs before any ledger trigger. In particular, derive the
-- human-readable unit label from its UUID so a blank label cannot become a wildcard.
create or replace function internal.normalize_reservation_resource_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare listing public.court%rowtype; unit public.court_unit_inventory%rowtype;
begin
    if new.court_unit_inventory_id is not null then
        select * into unit from public.court_unit_inventory where id = new.court_unit_inventory_id;
        if not found then raise exception 'This court unit is not configured for booking' using errcode = '22023'; end if;
        if new.court_listing_id is not null and new.court_listing_id <> unit.court_id then
            raise exception 'This court unit does not belong to the selected court' using errcode = '22023';
        end if;
        new.court_listing_id := unit.court_id;
        new.court_unit := unit.label;
    elsif new.court_listing_id is null then
        select * into listing from public.court where lower(btrim(name)) = lower(btrim(new.courts));
        if not found then raise exception 'This court is not configured for booking' using errcode = '22023'; end if;
        new.court_listing_id := listing.id;
    end if;
    select * into listing from public.court where id = new.court_listing_id;
    if not found or not listing.is_active then raise exception 'This court is not configured for booking' using errcode = '22023'; end if;
    new.courts := listing.name;
    if new.court_unit_inventory_id is null and nullif(btrim(new.court_unit), '') is not null then
        select * into unit from public.court_unit_inventory
        where court_id = listing.id and lower(btrim(label)) = lower(btrim(new.court_unit));
        if not found then raise exception 'This court unit is not configured for booking' using errcode = '22023'; end if;
        new.court_unit_inventory_id := unit.id;
        new.court_unit := unit.label;
    end if;
    return new;
end;
$$;
revoke all on function internal.normalize_reservation_resource_identity() from public, anon, authenticated;
-- The serialization lock must run before identity reads so READ COMMITTED
-- writers see configuration committed while they waited on the shared lock.
drop trigger if exists booking_serialize_resource_config on public.booking;
drop trigger if exists a_booking_serialize_resource_config on public.booking;
create trigger a_booking_serialize_resource_config before insert or update or delete on public.booking
for each row execute function internal.lock_reservation_resource_config();
drop trigger if exists walkin_serialize_resource_config on public.walk_in_booking;
drop trigger if exists a_walkin_serialize_resource_config on public.walk_in_booking;
create trigger a_walkin_serialize_resource_config before insert or update or delete on public.walk_in_booking
for each row execute function internal.lock_reservation_resource_config();
drop trigger if exists booking_normalize_resource_identity on public.booking;
create trigger booking_normalize_resource_identity before insert or update on public.booking
for each row execute function internal.normalize_reservation_resource_identity();
drop trigger if exists walkin_normalize_resource_identity on public.walk_in_booking;
create trigger walkin_normalize_resource_identity before insert or update on public.walk_in_booking
for each row execute function internal.normalize_reservation_resource_identity();

-- Sync by immutable listing/unit IDs, never by mutable display names.
create or replace function internal.sync_reservation_resource_slots()
returns trigger language plpgsql security definer set search_path = '' as $$
declare listing_id uuid := new.court_listing_id; target_booking bigint; target_walkin bigint; mapped_count integer;
begin
    if tg_table_name = 'booking' then
        target_booking := new.booking_id; target_walkin := null;
        delete from internal.reservation_resource_slots where booking_id = new.booking_id;
    else
        target_booking := null; target_walkin := new.walkin_id;
        delete from internal.reservation_resource_slots where walkin_id = new.walkin_id;
    end if;
    if new.status not in ('pending', 'confirmed') then return new; end if;
    if listing_id is null or not exists (select 1 from public.court where id = listing_id and is_active) then
        raise exception 'This court is not configured for booking' using errcode = '22023';
    end if;
    insert into internal.reservation_resource_slots(booking_id, walkin_id, resource_id, during)
    select target_booking, target_walkin, m.resource_id, pg_catalog.tstzrange(new.time_date, new.end_at, '[)')
    from public.court_unit_inventory u
    join public.court_unit_resource_map m on m.court_unit_id = u.id
    join public.physical_court_resource r on r.id = m.resource_id and r.is_active
    where u.court_id = listing_id and u.is_active and u.inventory_verified
      and (new.court_unit_inventory_id is not null and u.id = new.court_unit_inventory_id
           or new.court_unit_inventory_id is null and
              (nullif(btrim(new.court_unit), '') is null or lower(btrim(u.label)) = lower(btrim(new.court_unit))));
    get diagnostics mapped_count = row_count;
    if mapped_count = 0 then raise exception 'This court unit is not configured for booking' using errcode = '22023'; end if;
    return new;
exception when exclusion_violation then
    raise exception 'This physical court is already reserved during the selected time' using errcode = '23P01';
end;
$$;
revoke all on function internal.sync_reservation_resource_slots() from public, anon, authenticated;

-- Resource configuration refresh also uses stable listing IDs and active resources.
create or replace function internal.refresh_reservation_resource_slots()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    delete from internal.reservation_resource_slots;
    insert into internal.reservation_resource_slots(booking_id, walkin_id, resource_id, during)
    select s.booking_id, s.walkin_id, m.resource_id, s.during
    from internal.reservation_slots s
    join public.booking b on b.booking_id = s.booking_id and b.status in ('pending', 'confirmed')
    join public.court_unit_inventory u on u.court_id = b.court_listing_id and u.is_active and u.inventory_verified
    join public.court_unit_resource_map m on m.court_unit_id = u.id
    join public.physical_court_resource r on r.id = m.resource_id and r.is_active
    where nullif(btrim(b.court_unit), '') is null or lower(btrim(u.label)) = lower(btrim(b.court_unit))
    union all
    select s.booking_id, s.walkin_id, m.resource_id, s.during
    from internal.reservation_slots s
    join public.walk_in_booking w on w.walkin_id = s.walkin_id and w.status in ('pending', 'confirmed')
    join public.court_unit_inventory u on u.court_id = w.court_listing_id and u.is_active and u.inventory_verified
    join public.court_unit_resource_map m on m.court_unit_id = u.id
    join public.physical_court_resource r on r.id = m.resource_id and r.is_active
    where nullif(btrim(w.court_unit), '') is null or lower(btrim(u.label)) = lower(btrim(w.court_unit));
    if exists (select 1 from internal.reservation_slots s
        where (s.booking_id is not null and not exists (select 1 from internal.reservation_resource_slots r where r.booking_id = s.booking_id))
           or (s.walkin_id is not null and not exists (select 1 from internal.reservation_resource_slots r where r.walkin_id = s.walkin_id))) then
        raise exception 'Every active reservation must remain linked to a physical resource' using errcode = '23503';
    end if;
    return null;
exception when exclusion_violation then
    raise exception 'The resource mapping conflicts with an active reservation' using errcode = '23P01';
end;
$$;
revoke all on function internal.refresh_reservation_resource_slots() from public, anon, authenticated;
drop trigger if exists court_unit_inventory_refresh_reservations on public.court_unit_inventory;
create trigger court_unit_inventory_refresh_reservations after insert or update or delete on public.court_unit_inventory
for each statement execute function internal.refresh_reservation_resource_slots();
drop trigger if exists physical_court_resource_refresh_reservations on public.physical_court_resource;
create trigger physical_court_resource_refresh_reservations after insert or update or delete on public.physical_court_resource
for each statement execute function internal.refresh_reservation_resource_slots();

-- Do not deactivate a resource that owns a live reservation; otherwise a later
-- payment confirmation could fail after its physical hold disappeared.
create or replace function internal.guard_physical_resource_retirement()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if tg_op = 'DELETE' or (old.is_active and not new.is_active) then
        if exists (select 1 from internal.reservation_resource_slots where resource_id = old.id
                   and during && pg_catalog.tstzrange(now(), 'infinity', '[)')) then
            raise exception 'A physical court with active reservations cannot be disabled or deleted' using errcode = '23503';
        end if;
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
end;
$$;
revoke all on function internal.guard_physical_resource_retirement() from public, anon, authenticated;
drop trigger if exists physical_court_resource_guard on public.physical_court_resource;
create trigger physical_court_resource_guard before update or delete on public.physical_court_resource
for each row execute function internal.guard_physical_resource_retirement();
drop trigger if exists physical_court_resource_lock_reservations on public.physical_court_resource;
create trigger physical_court_resource_lock_reservations before insert or update or delete on public.physical_court_resource
for each statement execute function internal.lock_reservation_resource_config();
drop trigger if exists court_lock_reservations on public.court;
create trigger court_lock_reservations before update or delete on public.court
for each statement execute function internal.lock_reservation_resource_config();
