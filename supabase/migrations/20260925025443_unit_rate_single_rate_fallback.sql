-- A unit with only a day rate represents a single all-day hourly rate
-- (for example volleyball); only a fully configured unequal pair needs a
-- local day/night cutoff.
create or replace function public.prepare_paymongo_checkout(p_booking_id bigint, p_customer_id uuid)
returns table (attempt_id uuid, amount_minor bigint, total_minor bigint, payment_option text,
               booking_id bigint, courts text, time_date timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  b public.booking%rowtype;
  v_rate numeric;
  v_day_rate numeric;
  v_night_rate numeric;
  v_rate_unit text;
  v_cutoff time;
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

  select u.rate_day, u.rate_night, u.rate_unit into v_day_rate, v_night_rate, v_rate_unit
  from public.court_unit_inventory u
  where u.id = b.court_unit_inventory_id and u.is_active and u.inventory_verified;
  if v_rate_unit is null then
    select c.rate, c.rate_unit into v_rate, v_rate_unit from public.court c
    where c.id = b.court_listing_id and c.is_active and c.status = 'Available';
  end if;
  if v_rate_unit = '/hr' and v_day_rate is not null and (v_night_rate is null or v_day_rate = v_night_rate) then
    v_total := round(v_day_rate * coalesce(b.duration_minutes, 60)::numeric / 60, 2);
  elsif v_rate_unit = '/hr' and v_day_rate is not null and v_night_rate is not null then
    select s.night_rate_starts_at into v_cutoff from public.app_settings s where s.id = true;
    if v_cutoff is null then
      raise exception 'Online payment is unavailable until day/night cutoff is configured' using errcode = '22023';
    end if;
    select round(coalesce(sum(
      extract(epoch from least(b.end_at, x.hour_at + interval '1 hour') - greatest(b.time_date, x.hour_at)) / 3600
      * case when (x.hour_at at time zone 'Asia/Manila')::time >= v_cutoff then v_night_rate else v_day_rate end
    ), 0), 2) into v_total
    from generate_series(date_trunc('hour', b.time_date), b.end_at - interval '1 microsecond', interval '1 hour') as x(hour_at);
  elsif v_rate_unit = '/hr' and v_rate is not null then
    v_total := round(v_rate * coalesce(b.duration_minutes, 60)::numeric / 60, 2);
  else
    raise exception 'Online payment is unavailable until this court has an hourly rate' using errcode = '22023';
  end if;
  if v_total is null or v_total <= 0 then raise exception 'Online payment amount must be greater than zero' using errcode = '22023'; end if;
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
