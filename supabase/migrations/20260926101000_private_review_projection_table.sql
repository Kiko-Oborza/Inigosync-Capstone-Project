-- Replace public definer views with a strict safe-data table. The private
-- review row remains authoritative; a trigger publishes only its safe fields.
drop view if exists public.owner_booking_reviews;
do $$
begin
    if exists (
        select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'public_booking_reviews' and c.relkind in ('v', 'm')
    ) then
        execute 'drop view public.public_booking_reviews';
    elsif exists (
        select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'public_booking_reviews' and c.relkind = 'r'
    ) then
        execute 'drop table public.public_booking_reviews';
    end if;
end;
$$;

create table public.public_booking_reviews (
    id uuid primary key,
    display_name text not null,
    rating smallint not null check (rating between 1 and 5),
    comment text null check (comment is null or char_length(comment) <= 2000),
    created_at timestamptz not null
);
alter table public.public_booking_reviews enable row level security;
revoke all on public.public_booking_reviews from public, anon, authenticated;
grant select on public.public_booking_reviews to anon, authenticated;
create policy public_booking_reviews_read on public.public_booking_reviews
    for select to anon, authenticated using (true);

insert into public.public_booking_reviews (id, display_name, rating, comment, created_at)
select id,
       display_name,
       rating,
       regexp_replace(
           regexp_replace(comment, '[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}', '[email removed]', 'gi'),
           '([+]?63[[:space:].()/-]*|0)9[0-9[:space:].()/-]{7,}[0-9]', '[phone number removed]', 'g'),
       created_at
from public.booking_review;

create or replace function public.publish_booking_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.public_booking_reviews (id, display_name, rating, comment, created_at)
    values (new.id, new.display_name, new.rating, new.comment, new.created_at)
    on conflict (id) do nothing;
    return new;
end;
$$;
revoke all on function public.publish_booking_review() from public, anon, authenticated;
drop trigger if exists booking_review_publish on public.booking_review;
create trigger booking_review_publish after insert on public.booking_review
for each row execute function public.publish_booking_review();

-- The customer view uses invoker rights and the base table's own-row RLS.
grant select (booking_id, customer_id) on public.booking_review to authenticated;
drop view if exists public.my_booking_reviews;
create view public.my_booking_reviews
with (security_barrier = true, security_invoker = true)
as
select r.booking_id from public.booking_review r
where r.customer_id = (select auth.uid());
revoke all on public.my_booking_reviews from public, anon, authenticated;
grant select on public.my_booking_reviews to authenticated;

comment on table public.public_booking_reviews is
    'Public safe projection of published on-site reviews. Contains no booking or customer account identifiers.';
