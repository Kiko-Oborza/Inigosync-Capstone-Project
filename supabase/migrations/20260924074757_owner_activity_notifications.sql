-- Owner-only activity messages. Booking and feedback records never feed this.
create table if not exists public.owner_activity (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  target_section text not null check (target_section in ('overview','staff','courts','media','settings','profile')),
  created_at timestamptz not null default now(),
  seen_at timestamptz
);

create index if not exists owner_activity_owner_created_idx
  on public.owner_activity (owner_id, created_at desc);

alter table public.owner_activity enable row level security;
revoke all on public.owner_activity from anon, authenticated;
grant select, insert on public.owner_activity to authenticated;
grant update (seen_at) on public.owner_activity to authenticated;

create policy owner_activity_read on public.owner_activity
  for select to authenticated
  using (owner_id = (select auth.uid()) and public.inigosync_is_active_admin());
create policy owner_activity_insert on public.owner_activity
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.inigosync_is_active_admin());
create policy owner_activity_mark_seen on public.owner_activity
  for update to authenticated
  using (owner_id = (select auth.uid()) and public.inigosync_is_active_admin())
  with check (owner_id = (select auth.uid()) and public.inigosync_is_active_admin());
