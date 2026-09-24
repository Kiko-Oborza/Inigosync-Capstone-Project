-- Read-only post-deployment audit. All three counts must be zero.
-- No customer identity or payment information is returned.
with expected as (
    select booking_id, null::bigint as walkin_id, lower(btrim(courts)) as court_key,
           internal.court_unit_range(nullif(lower(btrim(court_unit)), ''), nullif(lower(btrim(court_unit)), ''), '[]') as unit_span,
           tstzrange(time_date, coalesce(end_at, time_date + make_interval(mins => coalesce(duration_minutes, 60))), '[)') as during
    from public.booking where status in ('pending', 'confirmed')
    union all
    select null::bigint, walkin_id, lower(btrim(courts)),
           internal.court_unit_range(nullif(lower(btrim(court_unit)), ''), nullif(lower(btrim(court_unit)), ''), '[]'),
           tstzrange(time_date, coalesce(end_at, time_date + make_interval(mins => coalesce(duration_minutes, 60))), '[)')
    from public.walk_in_booking where status in ('pending', 'confirmed')
), missing as (
    select * from expected except select * from internal.reservation_slots
), unexpected as (
    select * from internal.reservation_slots except select * from expected
), conflicts as (
    select 1 from expected a join expected b
      on (coalesce(a.booking_id, a.walkin_id), a.booking_id is null)
       < (coalesce(b.booking_id, b.walkin_id), b.booking_id is null)
     and a.court_key = b.court_key and a.unit_span && b.unit_span and a.during && b.during
)
select (select count(*) from missing) as missing_or_changed_slots,
       (select count(*) from unexpected) as unexpected_or_changed_slots,
       (select count(*) from conflicts) as active_overlaps;
