-- Configuration edits may add capacity when conflict-free, but must never
-- release any physical resource already held by an active booking/walk-in.
create or replace function internal.refresh_reservation_resource_slots()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if exists (
        select 1 from internal.reservation_resource_slots old
        join public.booking b on b.booking_id = old.booking_id and b.status in ('pending', 'confirmed')
        where not exists (
            select 1 from public.court_unit_inventory u
            join public.court_unit_resource_map m on m.court_unit_id = u.id and m.resource_id = old.resource_id
            join public.physical_court_resource r on r.id = m.resource_id and r.is_active
            where u.court_id = b.court_listing_id and u.is_active and u.inventory_verified
              and (b.court_unit_inventory_id = u.id or (b.court_unit_inventory_id is null and
                   (nullif(btrim(b.court_unit), '') is null or lower(btrim(u.label)) = lower(btrim(b.court_unit)))))
        )
        union all
        select 1 from internal.reservation_resource_slots old
        join public.walk_in_booking w on w.walkin_id = old.walkin_id and w.status in ('pending', 'confirmed')
        where not exists (
            select 1 from public.court_unit_inventory u
            join public.court_unit_resource_map m on m.court_unit_id = u.id and m.resource_id = old.resource_id
            join public.physical_court_resource r on r.id = m.resource_id and r.is_active
            where u.court_id = w.court_listing_id and u.is_active and u.inventory_verified
              and (w.court_unit_inventory_id = u.id or (w.court_unit_inventory_id is null and
                   (nullif(btrim(w.court_unit), '') is null or lower(btrim(u.label)) = lower(btrim(w.court_unit)))))
        )
    ) then
        raise exception 'Configuration cannot release a physical court held by an active reservation' using errcode = '23503';
    end if;

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
