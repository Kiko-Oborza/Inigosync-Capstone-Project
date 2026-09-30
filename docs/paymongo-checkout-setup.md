# PayMongo checkout setup and rollout

Customer bookings now start with a short physical-court hold. The browser sends the selected court or lane, time, and payment choice to `paymongo-checkout`; the server checks availability and rates, then creates **one PayMongo session for the cart**. A booking and calendar block are created only after a signed PayMongo payment event is verified. A redirect from PayMongo is never proof of payment. A cancelled or expired session keeps its hold until the provider confirms that the session has closed.

## Required server configuration

The public site at `https://inigossportcenter.com` uses Supabase project
`xrlwtnwamboucihsamrr`. Do not put a PayMongo **test** key in that project while
the site accepts real customer bookings: public checkouts would use test
payments. Run the test-mode checkout and webhook checks against an isolated
test backend and test frontend first. Configure the public project with live
credentials only as part of an intentional live-payment launch.

Set these Supabase Edge Function secrets in the environment being tested or launched:

| Secret | Purpose |
| --- | --- |
| `PAYMONGO_SECRET_KEY` | Secret key for that environment: `sk_test_...` in isolation, `sk_live_...` for a deliberate public launch. |
| `PAYMONGO_WEBHOOK_SECRET` | Signing secret for a webhook in the same PayMongo mode and environment. |
| `APP_BASE_URL` | Exact origin of the pages using that backend. For the public site, `https://inigossportcenter.com`; use the test frontend's origin for an isolated test backend. |

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Keep all provider and service-role credentials off the browser, repository, and owner settings page. The owner page changes the deposit percentage and enabled payment methods in `app_settings`; it only **reports** PayMongo connection, webhook, and last confirmed payment status.

The expiry worker's shared token is generated in Supabase Vault by migration `20260927025000_enable_checkout_expiry_cron.sql`. The scheduled job sends that token to `paymongo-expire-checkouts`; the worker validates it through a service-only database function. Do not copy the token into frontend code or a second secret.

## Webhook and payment behavior

Register a PayMongo endpoint at `https://<environment-project-ref>.supabase.co/functions/v1/paymongo-webhook` for `checkout_session.payment.paid`, then set that endpoint's signing secret above. For a deliberate public launch, the project ref is `xrlwtnwamboucihsamrr` and the webhook must be in **live** mode. The handler verifies the raw-body signature, test/live mode, PHP gross amount, and session ID, and deduplicates the event. `paymongo-webhook` and the cron worker have Supabase JWT verification disabled because they use separate signed authentication. Customer and staff checkout functions require an authenticated Supabase JWT.

The default deposit is 50%; the owner may change it and enable Cash, Card, and GCash. At least one online method must stay enabled. New checkouts snapshot their total and deposit charge, so later settings or court-rate edits cannot reprice them. Bowling uses `/set`: each set costs one set rate and reserves one hour on the selected lane.

Staff may collect a deposit booking's remaining balance in Cash through the authenticated check-in action. For PayMongo, staff start a separate balance checkout. A verified paid webhook records the balance and Time-In together when the reservation is still eligible. A checkout opened before the grace deadline keeps the slot held while PayMongo resolves it; settlement after that deadline may still record Time-In if the reservation has not ended. A late or invalid settlement is retained for review without Time-In. Neither a successful browser redirect nor an unverified payment may increase `amount_paid`.

## Rollout checks

1. Isolate test-mode checkout from the public site, configure the three test secrets there, and verify the owner Payment Configuration page reports an API connection and ready webhook.
2. Test a full-payment cart and a deposit cart with PayMongo test credentials. Confirm the bookings appear only after the signed webhook, and that one cart creates one checkout.
3. Test cancellation and expiry; verify the hold is removed only after PayMongo reports the session expired. Check duplicate webhook delivery creates no extra payment or booking.
4. Test two customers choosing the same physical court at the same time, two bowling sets on one lane, and Cash and PayMongo balance collection at staff check-in.
5. Review any older unpaid pending bookings individually. Existing attempts remain eligible for provider reconciliation; do not delete or mark them paid without checking PayMongo.

If PayMongo credentials, webhook, or the app return origin are missing, online checkout is unavailable. The public site currently uses this backend, so do not add test credentials there just to make its readiness check pass. The database and Edge Functions may be deployed first; their missing-configuration responses prevent a customer from creating an unpaid booking. The scheduled worker also reports unconfigured until `PAYMONGO_SECRET_KEY` is present. After isolated test-mode verification, configure a separate live-mode webhook and live secrets before enabling public online checkout.

An ambiguous checkout creation stays held for review. Search PayMongo by the attempt UUID without hyphens (`reference_number`) and close any provider session before releasing its court hold. The worker moves an unattached creating attempt to review after 23 hours rather than assuming it can safely expire it.
