-- Persist stable inventory IDs alongside readable labels so quantity/name
-- edits cannot silently retarget an online booking or walk-in.
alter table public.booking
    add column if not exists court_unit_inventory_id uuid
        references public.court_unit_inventory(id) on update cascade on delete restrict;
alter table public.walk_in_booking
    add column if not exists court_unit_inventory_id uuid
        references public.court_unit_inventory(id) on update cascade on delete restrict;

create index if not exists booking_court_unit_inventory_id_idx
    on public.booking(court_unit_inventory_id) where court_unit_inventory_id is not null;
create index if not exists walk_in_booking_court_unit_inventory_id_idx
    on public.walk_in_booking(court_unit_inventory_id) where court_unit_inventory_id is not null;

create or replace function internal.sync_reservation_resource_slots()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
    listing_id uuid;
    target_booking bigint;
    target_walkin bigint;
    mapped_count integer;
    requested_unit_id uuid := new.court_unit_inventory_id;
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

    if requested_unit_id is not null and not exists (
        select 1 from public.court_unit_inventory u
        where u.id = requested_unit_id and u.court_id = listing_id
          and u.is_active and u.inventory_verified
          and (nullif(btrim(new.court_unit), '') is null
               or lower(btrim(u.label)) = lower(btrim(new.court_unit)))
    ) then
        raise exception 'This court unit ID does not match the selected court and label' using errcode = '22023';
    end if;

    insert into internal.reservation_resource_slots (booking_id, walkin_id, resource_id, during)
    select target_booking, target_walkin, m.resource_id,
           pg_catalog.tstzrange(new.time_date, new.end_at, '[)')
    from public.court_unit_inventory u
    join public.court_unit_resource_map m on m.court_unit_id = u.id
    join public.physical_court_resource r on r.id = m.resource_id and r.is_active
    where u.court_id = listing_id and u.is_active and u.inventory_verified
      and (requested_unit_id is not null and u.id = requested_unit_id
           or requested_unit_id is null and
              (nullif(btrim(new.court_unit), '') is null
               or lower(btrim(u.label)) = lower(btrim(new.court_unit))));

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
