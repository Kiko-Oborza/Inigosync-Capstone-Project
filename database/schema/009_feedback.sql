-- ============================================================================
-- IñigoSync — Schema: customer feedback (§2, InigoSync_Dashboard_Feedback_v6.md)
-- ============================================================================
-- Run this in the Supabase SQL editor (Project → SQL Editor) any time after
-- database/schema/002_content_tables.sql — order relative to 003/004/005/006/
-- 007 and the seed files in database/seed/ doesn't matter. Safe to re-run:
-- the CREATE TABLE uses `if not exists`, and policies are dropped-then-
-- recreated.
--
-- Why this exists: the customer dashboard's Feedback feature (§2 of the
-- feedback doc — a "How are we doing?" card at the bottom of the sidebar on
-- desktop/tablet, a distinct standalone button inside the nav bar on mobile,
-- both opening the SAME modal) has nowhere to write to. This is a NEW table
-- only — nothing here touches profiles, booking, payment, court, or any
-- other existing table.
--
-- Design — one row per submission, attributed to the signed-in customer via
-- profile_id. `rating` is an OPTIONAL 1-5 star score: the modal's textarea
-- is required but its star picker is not, and clicking a selected star again
-- clears it (see includes/Dashboard.js's feedback submit handler, which
-- sends `null` when no star is selected). `message` is required, matching
-- the modal's required textarea.
--
-- GRACEFUL DEGRADATION — this environment has no Supabase admin access, so
-- this file is written but NOT applied yet. Before the owner runs it, every
-- submit attempt from includes/Dashboard.js gets a Postgres "relation does
-- not exist" error (42P01), which the same schema-mismatch check already
-- used for the Overview court-peek widget (isOverviewSchemaMismatch(), a
-- generic Postgres-error classifier despite its name — see its own comment)
-- turns into a clear "needs a database update" toast instead of a fake
-- success message or an unhandled crash. Nothing else on the dashboard
-- depends on this table existing.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- feedback
-- ----------------------------------------------------------------------------
create table if not exists public.feedback (
    id             uuid primary key default gen_random_uuid(),
    profile_id     uuid not null references public.profiles(id) on delete cascade,
    rating         smallint check (rating is null or (rating between 1 and 5)),
    message        text not null,
    created_at     timestamptz not null default now()
);

comment on table public.feedback is 'Customer feedback submitted from the dashboard Feedback modal (§2 of InigoSync_Dashboard_Feedback_v6.md) — a sidebar card trigger on desktop/tablet, a standalone button in the mobile nav, one shared modal. Written by includes/Dashboard.js; queryable by staff/admin for review (no dashboard screen reads it yet this phase).';
comment on column public.feedback.profile_id is 'The submitting customer — references profiles(id). Always the signed-in customer''s own id (window.inigosyncProfile.id); the RLS policy below prevents it ever being set to anyone else''s.';
comment on column public.feedback.rating is 'Optional 1-5 star rating. NULL means the customer submitted a message without picking a star — the modal never forces a rating (§2: "optional 1-5 rating").';
comment on column public.feedback.message is 'Required free-text feedback message. Never blank — includes/Dashboard.js blocks submission client-side, and this NOT NULL is the server-side backstop.';

-- ============================================================================
-- Row Level Security — a customer may INSERT and SELECT only their own
-- feedback; staff/admin may SELECT every row (for review). Nobody may
-- UPDATE or DELETE — a submitted feedback entry is left immutable, same
-- "record, not an editable form" reasoning as the audit_log table in
-- database/schema/004_staff_module.sql.
-- ============================================================================
alter table public.feedback enable row level security;

-- Table-level grant. RLS policies only ever *narrow* access the underlying
-- GRANT already allows — without this, `authenticated` would get
-- "permission denied" before RLS is even evaluated. No `anon` grant: only
-- signed-in customers submit feedback, and no public-facing page reads it.
-- No delete/update grant either — see the immutability note above.
grant select, insert on public.feedback to authenticated;

-- A customer may insert only a row attributed to themselves.
drop policy if exists "feedback_customer_insert_own" on public.feedback;
create policy "feedback_customer_insert_own" on public.feedback
    for insert
    to authenticated
    with check (profile_id = auth.uid());

-- A customer may read only their own feedback...
drop policy if exists "feedback_customer_select_own" on public.feedback;
create policy "feedback_customer_select_own" on public.feedback
    for select
    to authenticated
    using (profile_id = auth.uid());

-- ...while staff/admin may read every row, reusing the exact same
-- SECURITY DEFINER helper database/schema/002_content_tables.sql already
-- defines (public.inigosync_is_staff_or_admin()) rather than a second copy.
drop policy if exists "feedback_staff_select_all" on public.feedback;
create policy "feedback_staff_select_all" on public.feedback
    for select
    to authenticated
    using (public.inigosync_is_staff_or_admin());

-- ============================================================================
-- Frontend behaviour before vs. after this file is applied
-- ============================================================================
-- BEFORE (current live state): includes/Dashboard.js's feedback submit
-- handler gets a "relation does not exist" (42P01) error from Supabase,
-- recognizes it via the same schema-mismatch check used elsewhere on this
-- page, and shows an honest "needs a database update" toast — the modal
-- stays open with the customer's message intact so nothing they typed is
-- lost.
--
-- AFTER: the insert succeeds, the modal closes with a "Thanks for your
-- feedback!" toast, and the row is queryable by staff/admin — a later phase
-- can add a Staff/Admin Feedback panel against this same table with no
-- further schema change.
-- ============================================================================
