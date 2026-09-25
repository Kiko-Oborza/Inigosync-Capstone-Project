-- A booking may be created while its rate is TBA. If an administrator
-- configures that rate later, calculate the checkout total from the current
-- authoritative unit schedule instead of passing through a NULL saved total.
-- Existing saved totals remain immutable; payment eligibility and grants do
-- not change.
create or replace function public.prepare_paymongo_checkout(p_booking_id bigint, p_customer_id uuid)
returns table (attempt_id uuid, amount_minor bigint, total_minor bigint, payment_option text,
               booking_id bigint, courts text, time_date timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  b public.booking%rowtype;
  v_pct numeric;
  v_total numeric;
  v_charge numeric;
  v_attempt internal.paymongo_checkout_attempts%rowtype;
begin
  select * into b from public.booking where public.booking.booking_id = p_booking_id for update;
  if not found or b.customer_id <> p_customer_id then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  if b.status not in ('pending', 'confirmed') or b.checked_in_at is not null
     or b.payment_id is not null or b.amount_paid <> 0 or b.payment_option is null
     or b.payment_option not in ('full', 'downpayment') then
    raise exception 'This booking is not eligible for online payment' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_customer_id and p.status = 'active') then
    raise exception 'Active customer account required' using errcode = '42501';
  end if;
  select * into v_attempt from internal.paymongo_checkout_attempts a
    where a.booking_id = p_booking_id and a.status in ('creating', 'ready', 'review')
    order by a.created_at desc limit 1 for update;
  if found then
    return query select v_attempt.id, v_attempt.amount_minor, v_attempt.total_minor,
      v_attempt.payment_option, b.booking_id, b.courts, b.time_date;
    return;
  end if;
  if b.time_date <= now() then raise exception 'This booking is not eligible for online payment' using errcode = '22023'; end if;
  if coalesce(b.rate_unit_snapshot, internal.authoritative_reservation_rate_unit(b.court_listing_id, b.court_unit_inventory_id)) is distinct from '/hr' then
    raise exception 'Online payment is unavailable until this court has an hourly rate' using errcode = '22023';
  end if;
  v_total := case when b.rate_unit_snapshot is null or b.amount_total is null
      then internal.authoritative_reservation_amount(b.court_listing_id, b.court_unit_inventory_id,
        b.time_date, b.end_at, b.duration_minutes, b.rate_quantity)
      else b.amount_total end;
  if v_total is null or v_total <= 0 then raise exception 'Online payment is unavailable until a valid rate is configured' using errcode = '22023'; end if;
  select s.downpayment_pct into v_pct from public.app_settings s where s.id = true;
  v_pct := coalesce(v_pct, 50);
  v_charge := case when b.payment_option = 'full' then v_total else round(v_total * v_pct / 100, 2) end;
  if v_charge <= 0 then raise exception 'Online payment amount must be greater than zero' using errcode = '22023'; end if;
  insert into internal.paymongo_checkout_attempts(booking_id, customer_id, amount_minor, total_minor, payment_option)
  values(b.booking_id, p_customer_id, round(v_charge * 100)::bigint, round(v_total * 100)::bigint, b.payment_option)
  returning * into v_attempt;
  update public.booking set amount_total = v_attempt.total_minor / 100.0 where public.booking.booking_id = b.booking_id;
  return query select v_attempt.id, v_attempt.amount_minor, v_attempt.total_minor,
    v_attempt.payment_option, b.booking_id, b.courts, b.time_date;
end;
$$;
revoke all on function public.prepare_paymongo_checkout(bigint, uuid) from public, anon, authenticated;
grant execute on function public.prepare_paymongo_checkout(bigint, uuid) to service_role;
