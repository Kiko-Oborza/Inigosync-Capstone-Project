# Independent reservation QA review

Reviewed 2026-09-24 for the court availability and cross-channel reservation goal.

## Verdict

**Pass for the independently checked browser behavior and SQL/security design.** The browser checks use a mocked Supabase client and do not prove that the migration is installed or that the live database enforces concurrency. The project manager's full acceptance criteria also require the separate real PostgreSQL overlap/concurrency run and deployment verification recorded in the combined test report.

## Exact checks and results

From the repository root, start `node scripts/preview.cjs`, then run:

```powershell
$env:PLAYWRIGHT_MODULE='C:\Users\Kiko\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node tests/reservation-qa-ui.cjs
```

Result: `PASS reservation QA UI: occupancy, wildcard, cross-midnight, saves, schedule, payment, API errors, 23P01, stale responses` (exit 0). The fixture serves the actual customer/staff pages and scripts in headless Edge, replaces external Supabase calls with deterministic rows, and fixes the browser clock to 2026-09-24 09:00 Asia/Manila. It sends no live database writes.

The passing assertions cover:

- A saved online booking or walk-in on Basketball Court 1 blocks its hour there while Court 2 stays available to a customer; a legacy `NULL` or whitespace unit blocks both units. A cancelled booking frees its hour. A reservation beginning the previous night and ending during the selected day blocks the overlapping hour.
- The staff walk-in picker applies the same named-unit and missing-unit rules. The Court Schedule marks saved active rows on Court 1 and Court 2 as booked while an unrelated Badminton court remains open.
- A customer can save a pending booking on Court 2 while Court 1 is occupied. Its payload retains the selected `payment_option` and `amount_total` without marking any amount paid. A staff walk-in saves Court 2, pending status, `Cash`, `amount_total`, and `amount_paid` as before.
- A failed occupancy RPC disables customer and staff time pickers. If the final pre-save RPC fails, neither flow inserts. A simulated database `23P01` produces a visible error, does not produce a saved row or staff receipt, and refreshes availability. An older delayed customer RPC cannot overwrite the newer date's available hours.
- No uncaught browser exceptions occurred in these scenarios.

I also used read-only Supabase metadata/aggregate SQL against project `xrlwtnwamboucihsamrr` before migration deployment. The source tables had 4 active online bookings and 2 active walk-ins; 2 online and 1 walk-in active rows had no unit. All existing source rows had a nonblank court, a start, an end, and an end after start. No personal identifiers or contact details were selected. These aggregates show the missing-unit case exists in real data; the fixture determines the UI result.

## Security and correctness review

The proposed `20260924140659_reliable_court_reservations.sql` adds a private reservation ledger maintained by source-table triggers. Its GiST exclusion compares normalized court names, overlapping unit spans, and half-open time ranges. A missing unit spans every unit. The constraint should reject overlapping inserts and updates across both booking channels, including reactivation, while allowing adjacent intervals and separate units/courts. The original online `booking_no_overlap` constraint remains. The ledger and trigger functions have no `anon` or `authenticated` direct grant; the ledger has RLS enabled. This is a design review, not a substitute for real PostgreSQL tests.

The authenticated `court_occupancy` RPC reads the constrained ledger and returns court, unit, time, source, and status only. It requires `auth.uid()`, limits request ranges to 31 days, and omits customer names, contact details, IDs, and payment data. The previous live function ACL granted execution to `authenticated`, not `anon`; the migration preserves that rule. The live source policies restrict customer booking inserts to their own ID, pending status, zero paid amount, and null payment ID, and restrict customer reads to their own bookings. Walk-in table access remains staff/admin. The new migration does not edit these policies or payment columns. Existing `booking_fill_end_at` is replaced by a time-normalizing trigger; current live rows satisfy its court/time validation.

No new blocking authorization, personal-data, or payment finding emerged from the reviewed diff. The occupancy function intentionally discloses busy court/time slots to signed-in users, which is necessary to show availability without exposing reservation identities. A local/browser fixture cannot establish live RLS behavior or exclusion behavior under concurrent database transactions; those require the separate database run and post-deployment checks.
