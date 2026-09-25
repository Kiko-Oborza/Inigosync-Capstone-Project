-- A reservation's occupied resource set must not shrink while it is active.
-- Units may map to multiple physical resources; removing one mapping could
-- otherwise free a court that the customer/staff still expects to occupy.
create or replace function internal.guard_reservation_resource_mapping_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare affected_unit uuid;
begin
    if tg_op = 'INSERT' then return new; end if;
    if tg_op = 'DELETE' then affected_unit := old.court_unit_id;
    else
        if new.court_unit_id is not distinct from old.court_unit_id
           and new.resource_id is not distinct from old.resource_id then return new; end if;
        affected_unit := old.court_unit_id;
    end if;
    if exists (
        select 1 from public.court_unit_inventory u
        where u.id = affected_unit and (
            exists (select 1 from public.booking b where b.court_listing_id = u.court_id
                and b.status in ('pending', 'confirmed')
                and (b.court_unit_inventory_id = u.id or (b.court_unit_inventory_id is null and
                    (nullif(btrim(b.court_unit), '') is null or lower(btrim(b.court_unit)) = lower(btrim(u.label))))))
            or exists (select 1 from public.walk_in_booking w where w.court_listing_id = u.court_id
                and w.status in ('pending', 'confirmed')
                and (w.court_unit_inventory_id = u.id or (w.court_unit_inventory_id is null and
                    (nullif(btrim(w.court_unit), '') is null or lower(btrim(w.court_unit)) = lower(btrim(u.label))))))
        )
    ) then
        raise exception 'A court resource mapping cannot change while that unit has active reservations' using errcode = '23503';
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
end;
$$;
revoke all on function internal.guard_reservation_resource_mapping_change() from public, anon, authenticated;
drop trigger if exists court_unit_resource_map_active_reservation_guard on public.court_unit_resource_map;
create trigger court_unit_resource_map_active_reservation_guard
before update or delete on public.court_unit_resource_map
for each row execute function internal.guard_reservation_resource_mapping_change();
