# Staff portal migration history on the connected Supabase project

The checked-in SQL filenames and the live Supabase migration versions differ for
the staff portal rollout. The Supabase connector assigned a new version when each
migration was applied. The table below comes from the live project's migration
list on 2026-09-30, matched to the unique migration name in this repository.
It records application history; matching names alone do not prove that two SQL
bodies are identical.

| Checked-in file version | Live version | Migration name |
| --- | --- | --- |
| `20260928010000` | `20260929035830` | `staff_booking_rules_walkin_orders_attendance_receipts` |
| `20260928020000` | `20260929035843` | `staff_activity_announcements_notifications` |
| `20260929010000` | `20260929040335` | `fix_contact_phone_missing_proof` |
| `20260929020000` | `20260929095253` | `guard_profile_role_changes` |
| `20260929030000` | `20260929101013` | `fix_online_walkin_authoritative_amount` |
| `20260929040000` | `20260929101626` | `secure_staff_online_walkin_creation` |
| `20260930010000` | `20260930000532` | `staff_walkin_review_price_guard` |
| `20260930020000` | `20260930003421` | `notification_panel_targets` |
| `20260930030000` | `20260930053327` | `require_walkin_reviewed_price` |
| `20260930063008` | `20260930110844` | `customer_booking_payment_acknowledgments` |
| `20260930112247` | `20260930113649` | `balance_checkout_customer_link` |

Older migrations also have version differences, so this table is not a complete
repository-wide repair plan. Before using Supabase CLI migration replay or
`db push` against this project, compare the complete local and live histories,
inspect the live schema against the SQL bodies, and reconcile version records.
Do not reapply these files just because their checked-in timestamps appear
pending: several create or alter payment, reservation, receipt, and access
control objects that are already present. No migration history records were
changed as part of this audit.
