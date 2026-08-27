-- ============================================================================
-- IñigoSync — Schema: content tables (sport, court, event, testimonial)
-- ============================================================================
-- Run this in the Supabase SQL editor (Project → SQL Editor) BEFORE any file
-- in database/seed/. Safe to re-run: tables use CREATE TABLE IF NOT EXISTS,
-- policies are dropped-then-recreated, and the helper function uses CREATE
-- OR REPLACE, so running this twice does not error or duplicate anything.
--
-- These are NEW tables only. Nothing here touches the existing profiles,
-- booking, payment, or walk_in_booking tables.
--
-- Design notes:
--   * `sport`  — the 8 sport categories offered (Basketball, Badminton, ...).
--                Mostly a lookup table for grouping/labeling.
--   * `court`  — one row per bookable unit shown on the landing page's
--                "Courts & Facilities" grid (9 rows — Bowling is split into
--                a Duckpin row and a Ten-Pin row under the same sport, same
--                as includes/courts-data.js). Rates are left NULL on
--                purpose — see database/seed/002_seed_content.sql.
--   * `event`  — featured events shown in the Hero carousel and the
--                Featured Events section. Optionally tagged with a sport
--                (used to pick an icon/monogram when there's no image yet).
--   * `testimonial` — labeled placeholder testimonials ("What people say
--                about Iñigos"). This is NOT a live Google Reviews feed —
--                see database/seed/002_seed_content.sql for why.
--
--   `image_url` on `court` and `event` is nullable. NULL means the landing
--   page renders a placeholder "slot" (pattern + sport monogram) instead of
--   a broken <img>; setting it later needs no frontend rework.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- sport
-- ----------------------------------------------------------------------------
create table if not exists public.sport (
    id             uuid primary key default gen_random_uuid(),
    slug           text not null unique,
    name           text not null,
    display_order  int not null default 0,
    is_active      boolean not null default true,
    created_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- court
-- ----------------------------------------------------------------------------
create table if not exists public.court (
    id             uuid primary key default gen_random_uuid(),
    sport_id       uuid references public.sport(id) on delete set null,
    slug           text not null unique,
    name           text not null,
    quantity       int not null default 1,
    unit           text not null default 'courts',   -- 'courts' | 'lanes' | 'tables'
    description    text,
    rate           numeric(10,2),                     -- NULL = rate not confirmed yet (see seed file)
    rate_unit      text not null default '/hr',        -- '/hr' | '/game'
    status         text not null default 'Available', -- 'Available' | 'Maintenance' | ...
    image_url      text,                               -- NULL = render a placeholder slot
    display_order  int not null default 0,
    is_active      boolean not null default true,
    created_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- event
-- ----------------------------------------------------------------------------
create table if not exists public.event (
    id             uuid primary key default gen_random_uuid(),
    sport_id       uuid references public.sport(id) on delete set null,
    tag            text,                               -- short eyebrow label, e.g. "This weekend"
    title          text not null,
    meta           text,                               -- freeform line, e.g. "Sat & Sun · 8AM-10PM"
    event_date     date,
    image_url      text,                               -- NULL = render a placeholder slot
    display_order  int not null default 0,
    is_published   boolean not null default true,
    created_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- testimonial
-- ----------------------------------------------------------------------------
create table if not exists public.testimonial (
    id             uuid primary key default gen_random_uuid(),
    author_name    text not null,
    rating         smallint not null check (rating between 1 and 5),
    quote          text not null,
    source_label   text,                               -- e.g. "Placeholder — awaiting a real quote"
    captured_on    date,
    display_order  int not null default 0,
    is_published   boolean not null default true,
    created_at     timestamptz not null default now()
);

-- ============================================================================
-- Row Level Security — public SELECT, writes limited to staff/admin
-- ============================================================================
alter table public.sport enable row level security;
alter table public.court enable row level security;
alter table public.event enable row level security;
alter table public.testimonial enable row level security;

-- Helper: is the currently-authenticated user a staff or admin (per
-- profiles.role)? SECURITY DEFINER so this check works regardless of
-- whatever RLS policy profiles itself has — it only ever looks at the
-- caller's own row (auth.uid() = id), never anyone else's.
create or replace function public.inigosync_is_staff_or_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('staff', 'admin')
    );
$$;

grant execute on function public.inigosync_is_staff_or_admin() to anon, authenticated;

-- Table-level grants. RLS policies only ever *narrow* access that the
-- underlying GRANT already allows — without these, anon/authenticated would
-- get "permission denied" before RLS is even evaluated.
grant select on public.sport, public.court, public.event, public.testimonial
    to anon, authenticated;
grant insert, update, delete on public.sport, public.court, public.event, public.testimonial
    to authenticated;

-- ---- sport ----
drop policy if exists "sport_public_read" on public.sport;
create policy "sport_public_read" on public.sport
    for select
    using (true);

drop policy if exists "sport_staff_write" on public.sport;
create policy "sport_staff_write" on public.sport
    for all
    to authenticated
    using (public.inigosync_is_staff_or_admin())
    with check (public.inigosync_is_staff_or_admin());

-- ---- court ----
drop policy if exists "court_public_read" on public.court;
create policy "court_public_read" on public.court
    for select
    using (true);

drop policy if exists "court_staff_write" on public.court;
create policy "court_staff_write" on public.court
    for all
    to authenticated
    using (public.inigosync_is_staff_or_admin())
    with check (public.inigosync_is_staff_or_admin());

-- ---- event ----
drop policy if exists "event_public_read" on public.event;
create policy "event_public_read" on public.event
    for select
    using (true);

drop policy if exists "event_staff_write" on public.event;
create policy "event_staff_write" on public.event
    for all
    to authenticated
    using (public.inigosync_is_staff_or_admin())
    with check (public.inigosync_is_staff_or_admin());

-- ---- testimonial ----
drop policy if exists "testimonial_public_read" on public.testimonial;
create policy "testimonial_public_read" on public.testimonial
    for select
    using (true);

drop policy if exists "testimonial_staff_write" on public.testimonial;
create policy "testimonial_staff_write" on public.testimonial
    for all
    to authenticated
    using (public.inigosync_is_staff_or_admin())
    with check (public.inigosync_is_staff_or_admin());
