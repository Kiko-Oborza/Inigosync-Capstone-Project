-- Keep listing and physical-resource configuration stable for every active
-- reservation, including expired-but-unsettled PayMongo attempts.
create unique index if not exists court_unit_normalized_label_uidx
    on public.court_unit_inventory(court_id, lower(btrim(label)));

create or replace function internal.guard_court_listing_retirement()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if tg_op = 'DELETE' or (old.is_active and not new.is_active) then
        if exists (select 1 from public.booking b
                   where b.court_listing_id = old.id and b.status in ('pending', 'confirmed'))
           or exists (select 1 from public.walk_in_booking w
                   where w.court_listing_id = old.id and w.status in ('pending', 'confirmed')) then
            raise exception 'A court listing with active reservations cannot be disabled or deleted' using errcode = '23503';
        end if;
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
end;
$$;
revoke all on function internal.guard_court_listing_retirement() from public, anon, authenticated;
drop trigger if exists court_listing_retirement_guard on public.court;
create trigger court_listing_retirement_guard before update or delete on public.court
for each row execute function internal.guard_court_listing_retirement();

create or replace function internal.guard_physical_resource_retirement()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if tg_op = 'DELETE' or (old.is_active and not new.is_active) then
        if exists (select 1 from internal.reservation_resource_slots where resource_id = old.id) then
            raise exception 'A physical court with active reservations cannot be disabled or deleted' using errcode = '23503';
        end if;
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
end;
$$;
revoke all on function internal.guard_physical_resource_retirement() from public, anon, authenticated;

-- A deactivated listing may still have historical cancelled rows. Permit
-- metadata/status cleanup on those rows while rejecting any reactivation or
-- reassignment that would create a live reservation against disabled inventory.
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
    if not found then raise exception 'This court is not configured for booking' using errcode = '22023'; end if;
    if not listing.is_active and not (
        tg_op = 'UPDATE' and old.court_listing_id = listing.id
        and old.court_unit_inventory_id is not distinct from new.court_unit_inventory_id
        and old.status not in ('pending', 'confirmed')
    ) then
        raise exception 'This court is not configured for booking' using errcode = '22023';
    end if;
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
