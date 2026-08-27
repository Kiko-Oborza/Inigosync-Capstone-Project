-- ============================================================================
-- IñigoSync — Schema: court rating (Phase 2)
-- ============================================================================
-- Run this in the Supabase SQL editor (Project → SQL Editor) any time after
-- database/schema/002_content_tables.sql — order relative to the seed files
-- in database/seed/ doesn't matter. Safe to re-run: uses
-- `add column if not exists`, so a second run is a no-op, not an error.
--
-- Why this exists: docs/QA_AUDIT_REPORT.md's Landing Page Module row for
-- "Facilities & Pricing — rate, rating, type" is PART because `court` has no
-- rating column at all (implementation_plan.md, Phase 2). This adds it.
--
-- Adds a nullable numeric rating (e.g. 4.5) to `court`. NULL means "no rating
-- yet" — the frontend (includes/landingPage.js's renderCourtCard,
-- includes/Dashboard.js's Court Information cards) renders a rating badge
-- ONLY when this is non-null, and omits it entirely otherwise. Do NOT
-- backfill this with invented numbers — leave every row NULL until the owner
-- has a real rating to enter (e.g. a future admin form field, or computed
-- later from real customer feedback). The same rule the owner already
-- applied to `court.rate` in database/seed/002_seed_content.sql applies here.
--
-- No RLS changes needed: `rating` is just one more column on a table that
-- already has RLS enabled with a public SELECT policy and a staff-or-admin
-- write policy (see database/schema/002_content_tables.sql,
-- "court_public_read" / "court_staff_write") — those apply to the whole row
-- automatically, this column included.
-- ============================================================================

alter table public.court
    add column if not exists rating numeric(2,1)
        check (rating is null or (rating >= 0 and rating <= 5));
