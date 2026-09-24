-- Only court/time occupancy is exposed; no customer or walk-in identity.
-- Direct table RLS still protects the underlying reservations.
create or replace function public.court_occupancy(from_at timestamptz, to_at timestamptz)
returns table (
  source text,
  courts text,
  court_unit text,
  time_date timestamptz,
  end_at timestamptz,
  duration_minutes integer,
  status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to check court availability' using errcode = '42501';
  end if;
  if from_at is null or to_at is null or to_at <= from_at or to_at - from_at > interval '31 days' then
    raise exception 'Availability range must be between 0 and 31 days' using errcode = '22023';
  end if;
  return query
  select 'online'::text, b.courts, b.court_unit, b.time_date, b.end_at, b.duration_minutes, b.status
  from public.booking b
  where b.status in ('pending', 'confirmed') and b.time_date < to_at and b.end_at > from_at
  union all
  select 'walkin'::text, w.courts, w.court_unit, w.time_date,
         coalesce(w.end_at, w.time_date + pg_catalog.make_interval(mins => coalesce(w.duration_minutes,60))),
         coalesce(w.duration_minutes,60), w.status
  from public.walk_in_booking w
  where w.status in ('pending', 'confirmed') and w.time_date < to_at
    and coalesce(w.end_at, w.time_date + pg_catalog.make_interval(mins => coalesce(w.duration_minutes,60))) > from_at;
end;
$$;

revoke all on function public.court_occupancy(timestamptz,timestamptz) from public, anon;
grant execute on function public.court_occupancy(timestamptz,timestamptz) to authenticated;
