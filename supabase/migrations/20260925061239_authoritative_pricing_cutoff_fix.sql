-- Correct the overlap interval for a night cutoff inside an hourly segment,
-- and make legacy checkout rows reprice from server-owned rates.
create or replace function internal.authoritative_reservation_amount(
    p_listing_id uuid,
    p_unit_id uuid,
    p_start timestamptz,
    p_end timestamptz,
    p_duration_minutes integer,
    p_quantity integer
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_listing_rate numeric;
    v_listing_rate_unit text;
    v_day_rate numeric;
    v_night_rate numeric;
    v_rate_unit text;
    v_cutoff time;
    v_end timestamptz;
    v_total numeric;
begin
    if p_start is null then return null; end if;
    v_end := coalesce(p_end, p_start + make_interval(mins => coalesce(p_duration_minutes, 60)));
    if v_end <= p_start then return null; end if;

    select u.rate_day, u.rate_night, u.rate_unit
      into v_day_rate, v_night_rate, v_rate_unit
      from public.court_unit_inventory u
     where u.id = p_unit_id and u.court_id = p_listing_id
       and u.is_active and u.inventory_verified;

    if v_rate_unit is null or (v_rate_unit = '/hr' and v_day_rate is null) then
        select c.rate, c.rate_unit into v_listing_rate, v_listing_rate_unit
          from public.court c
         where c.id = p_listing_id and c.is_active and c.status = 'Available';
        if v_rate_unit is null or v_listing_rate_unit is not null then v_rate_unit := v_listing_rate_unit; end if;
    end if;

    if v_rate_unit = '/set' and v_day_rate is not null then
        return round(v_day_rate * greatest(1, least(coalesce(p_quantity, 1), 100)), 2);
    elsif v_rate_unit = '/hr' and v_day_rate is not null
          and (v_night_rate is null or v_day_rate = v_night_rate) then
        return round(v_day_rate * extract(epoch from (v_end - p_start)) / 3600, 2);
    elsif v_rate_unit = '/hr' and v_day_rate is not null and v_night_rate is not null then
        select s.night_rate_starts_at into v_cutoff from public.app_settings s where s.id = true;
        if v_cutoff is null then return null; end if;
        with segments as (
            select greatest(p_start, g.hour_at) as segment_start,
                   least(v_end, g.hour_at + interval '1 hour') as segment_end,
                   (((g.hour_at at time zone 'Asia/Manila')::date + v_cutoff)
                       at time zone 'Asia/Manila') as cutoff_at
              from generate_series(date_trunc('hour', p_start), v_end - interval '1 microsecond', interval '1 hour') as g(hour_at)
        ), hourly_parts as (
            select segment_end - segment_start as covered,
                   greatest(interval '0 seconds', segment_end - greatest(segment_start, cutoff_at)) as night_covered
              from segments
        )
        select round(coalesce(sum(
            extract(epoch from (covered - night_covered)) / 3600 * v_day_rate
            + extract(epoch from night_covered) / 3600 * v_night_rate
        ), 0), 2) into v_total from hourly_parts;
        return v_total;
    elsif v_rate_unit = '/hr' and v_listing_rate is not null then
        return round(v_listing_rate * extract(epoch from (v_end - p_start)) / 3600, 2);
    end if;
    return null;
end;
$$;
revoke all on function internal.authoritative_reservation_amount(uuid, uuid, timestamptz, timestamptz, integer, integer)
    from public, anon, authenticated, service_role;

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
  v_total := case when b.rate_unit_snapshot is null
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
