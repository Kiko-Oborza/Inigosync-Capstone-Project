-- Serialize physical-resource configuration edits with every reservation
-- source write. The version update is intentionally a real row update: at
-- READ COMMITTED it serializes writers; at REPEATABLE READ a stale waiter
-- gets SQLSTATE 40001 instead of proceeding with a pre-edit snapshot.
create table if not exists internal.reservation_resource_config_lock (
    id boolean primary key default true check (id),
    version bigint not null default 0
);
insert into internal.reservation_resource_config_lock(id, version)
values (true, 0) on conflict (id) do nothing;
alter table internal.reservation_resource_config_lock enable row level security;
revoke all on table internal.reservation_resource_config_lock from public, anon, authenticated;

create or replace function internal.lock_reservation_resource_config()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    update internal.reservation_resource_config_lock
    set version = version + 1 where id = true;
    if tg_level = 'ROW' then
        if tg_op = 'DELETE' then return old; end if;
        return new;
    end if;
    return null;
end;
$$;
revoke all on function internal.lock_reservation_resource_config() from public, anon, authenticated;

drop trigger if exists booking_serialize_resource_config on public.booking;
create trigger booking_serialize_resource_config
before insert or update or delete on public.booking
for each row execute function internal.lock_reservation_resource_config();
drop trigger if exists walkin_serialize_resource_config on public.walk_in_booking;
create trigger walkin_serialize_resource_config
before insert or update or delete on public.walk_in_booking
for each row execute function internal.lock_reservation_resource_config();

-- Lock before the map/inventory rows change; the existing AFTER statement
-- trigger then refreshes every active resource slot while this transaction
-- still owns the lock.
drop trigger if exists court_unit_resource_map_lock_reservations on public.court_unit_resource_map;
create trigger court_unit_resource_map_lock_reservations
before insert or update or delete on public.court_unit_resource_map
for each statement execute function internal.lock_reservation_resource_config();
drop trigger if exists court_unit_inventory_lock_reservations on public.court_unit_inventory;
create trigger court_unit_inventory_lock_reservations
before insert or update or delete on public.court_unit_inventory
for each statement execute function internal.lock_reservation_resource_config();
