-- A no-show must free the court even when no browser tab is open.
-- Existing bookings are excluded from automatic changes: the live project
-- contained historical pending rows when this policy was introduced.
create extension if not exists pg_cron with schema pg_catalog;

alter table public.booking
  add column if not exists no_show_policy_applies boolean not null default false,
  add column if not exists auto_cancelled_at timestamptz;
alter table public.walk_in_booking
  add column if not exists no_show_policy_applies boolean not null default false,
  add column if not exists auto_cancelled_at timestamptz;

alter table public.booking alter column no_show_policy_applies set default true;
alter table public.walk_in_booking alter column no_show_policy_applies set default true;

create or replace function internal.cancel_no_show_bookings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  online_count integer;
  walkin_count integer;
begin
  update public.booking
  set status = 'cancelled', auto_cancelled_at = now()
  where no_show_policy_applies
    and status in ('pending', 'confirmed')
    and checked_in_at is null
    and time_date + interval '30 minutes' < now();
  get diagnostics online_count = row_count;

  update public.walk_in_booking
  set status = 'cancelled', auto_cancelled_at = now()
  where no_show_policy_applies
    and status in ('pending', 'confirmed')
    and checked_in_at is null
    and time_date + interval '30 minutes' < now();
  get diagnostics walkin_count = row_count;

  return online_count + walkin_count;
end;
$$;

revoke all on function internal.cancel_no_show_bookings() from public, anon, authenticated;

-- Customers only create/read their reservations. The former broad UPDATE
-- policy let a customer change status and check-in fields through the API.
drop policy if exists booking_update on public.booking;

drop policy if exists booking_insert on public.booking;
create policy booking_insert on public.booking
  for insert to authenticated
  with check (
    internal.is_staff_or_admin((select auth.uid()))
    or (
      customer_id = (select auth.uid())
      and status = 'pending'
      and checked_in_at is null
      and checked_out_at is null
      and amount_paid = 0
      and payment_id is null
      and auto_cancelled_at is null
      and no_show_policy_applies
    )
  );

select cron.schedule(
  'inigosync-cancel-no-shows',
  '* * * * *',
  'select internal.cancel_no_show_bookings()'
);
