-- ============================================================================
-- IñigoSync — Schema: booking + walk-in payment tracking
-- (Revision S2, implementation_plan.md, decision S12)
-- ============================================================================
-- Run this in the Supabase SQL editor (Project → SQL Editor) — this file
-- extends database/schema/016_walkin_checkin.sql; this revision's Time-In
-- popup uses the checked_in_at / payment_method columns that file adds,
-- alongside the payment columns below. Safe to re-run in full: every ALTER
-- uses `add column if not exists`, and every COMMENT is a plain
-- re-statement with no side effect the second time.
--
-- Why this exists: Revision S2 adds a Time-In payment popup (S11/S14) that
-- needs a Total, a running Paid-so-far, and a Balance due for a booking or a
-- walk-in row, none of which either relation carries today. It also lets the
-- customer wizard (S13a) record its chosen payment option and a computed
-- total up front, and lets the staff walk-in wizard (S13b) record the same
-- total plus what was actually collected at the desk.
--
-- No new policies here: database/schema/016_walkin_checkin.sql's
-- booking_staff_checkin / walkin_staff_checkin UPDATE policies already cover
-- every write this revision's Time-In confirm makes (checked_in_at plus the
-- new payment columns below, all via the same UPDATE), and the existing
-- customer insert path is unaffected — it already has whatever INSERT grant
-- let it create a row before this file existed.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- public.booking — amount_total/amount_paid/payment_option/
-- balance_payment_method/balance_paid_at.
-- ----------------------------------------------------------------------------
alter table public.booking
    add column if not exists amount_total numeric(10,2) null;

alter table public.booking
    add column if not exists amount_paid numeric(10,2) not null default 0;

alter table public.booking
    add column if not exists payment_option text null;

alter table public.booking
    add column if not exists balance_payment_method text null;

alter table public.booking
    add column if not exists balance_paid_at timestamptz null;

comment on column public.booking.amount_total is 'Revision S2 — total price in pesos for this booking: rate times hours at insert time (includes/Dashboard.js bookSubmit) when the court rate is known, else left null ("Rate TBA"). The staff Time-In popup fills this in if it is still null once a balance must be collected.';
comment on column public.booking.amount_paid is 'Revision S2 — pesos collected so far. Zero at insert time (no PayMongo yet); increased by the staff Time-In popup when a balance is collected at check-in.';
comment on column public.booking.payment_option is 'Revision S2 — the wizard choice recorded at insert time: full or downpayment. Null for a pre-migration row.';
comment on column public.booking.balance_payment_method is 'Revision S2 — how a remaining balance was collected at Time-In: Cash or Online payment. Null until that happens.';
comment on column public.booking.balance_paid_at is 'Revision S2 — when the balance above was collected. Null until then.';


-- ----------------------------------------------------------------------------
-- public.walk_in_booking — same payment tracking, minus payment_option (a
-- walk-in already records how it was paid via payment_method, added by
-- database/schema/016_walkin_checkin.sql — there is no separate full/
-- downpayment choice for a walk-in the way there is for the customer
-- wizard).
-- ----------------------------------------------------------------------------
alter table public.walk_in_booking
    add column if not exists amount_total numeric(10,2) null;

alter table public.walk_in_booking
    add column if not exists amount_paid numeric(10,2) not null default 0;

alter table public.walk_in_booking
    add column if not exists balance_payment_method text null;

alter table public.walk_in_booking
    add column if not exists balance_paid_at timestamptz null;

comment on column public.walk_in_booking.amount_total is 'Revision S2 — total price in pesos for this walk-in: rate times hours at insert time (includes/staff_dashboard.js) when the court rate is known, else left null ("Rate TBA").';
comment on column public.walk_in_booking.amount_paid is 'Revision S2 — pesos collected so far. Equals amount_total at insert time when the rate is known (a walk-in pays at the desk), zero otherwise; the staff Time-In popup increases this if a balance remains and is later collected.';
comment on column public.walk_in_booking.balance_payment_method is 'Revision S2 — how a remaining balance was collected at Time-In: Cash or Online payment. Null until that happens.';
comment on column public.walk_in_booking.balance_paid_at is 'Revision S2 — when the balance above was collected. Null until then.';


-- ============================================================================
-- Frontend behaviour before vs. after this file is applied
-- ============================================================================
-- BEFORE: the customer + staff walk-in inserts already try to send
-- payment_option/amount_total (or amount_total/amount_paid for a walk-in) —
-- PostgREST rejects the unknown columns, so both inserts retry without them
-- (same schema-mismatch idiom every other writer in this project uses) and
-- still succeed; the Time-In popup shows "Rate TBA" for every row whose
-- court rate is also unknown, and its own update retries with only
-- checked_in_at, toasting that payment fields need this file.
--
-- AFTER: both inserts succeed with a real total (when the court rate is
-- known) and, for a walk-in, a matching amount_paid; the Time-In popup can
-- show a genuine Total / Paid so far / Balance due and record a collection.
-- ============================================================================
