-- Keep active reservations linked when admins rename, disable, or unverify a
-- bookable unit. The shared refresh function validates each current source
-- reservation and lets the physical overlap exclusion constraint reject a
-- mapping or inventory edit that would create a collision.
drop trigger if exists court_unit_inventory_refresh_reservations on public.court_unit_inventory;
create trigger court_unit_inventory_refresh_reservations
after insert or update or delete on public.court_unit_inventory
for each statement execute function internal.refresh_reservation_resource_slots();
