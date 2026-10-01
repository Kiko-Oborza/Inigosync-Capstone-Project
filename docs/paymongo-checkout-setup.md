# PayMongo checkout setup and rollout

Customer bookings now start with a short physical-court hold. The browser sends the selected court or lane, time, and payment choice to `paymongo-checkout`; the server checks availability and rates, then creates **one PayMongo session for the cart**. A booking and calendar block are created only after a signed PayMongo payment event is verified. A redirect from PayMongo is never proof of payment. A cancelled or expired session keeps its hold until the provider confirms that the session has closed.

## Required server configuration

The public site at `https://inigossportcenter.com` uses Supabase project
`xrlwtnwamboucihsamrr`. The project manager confirmed this is a thesis demo
site using PayMongo **test mode only**, with no real customer payments. The
test secret key and matching test webhook secret may therefore be configured
on this project for the demo. Do not switch to live PayMongo credentials or
present test payments as real payments without a separate launch review.

Set these Supabase Edge Function secrets in the environment being tested or launched:

| Secret | Purpose |
| --- | --- |
| `PAYMONGO_SECRET_KEY` | Rotated `sk_test_...` key for this thesis demo. The earlier test key was pasted into chat and should not be reused. |
| `PAYMONGO_WEBHOOK_SECRET` | Signing secret for this project's enabled **test-mode** webhook. |
| `APP_BASE_URL` | `https://inigossportcenter.com` for the deployed demo; its allowed-origin preflight was verified. |

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Keep all provider and service-role credentials off the browser, repository, and owner settings page. The owner page changes the deposit percentage and enabled payment methods in `app_settings`; it only **reports** PayMongo connection, webhook, and last confirmed payment status.

The expiry worker's shared token is generated in Supabase Vault by migration `20260927025000_enable_checkout_expiry_cron.sql`. The scheduled job sends that token to `paymongo-expire-checkouts`; the worker validates it through a service-only database function. Do not copy the token into frontend code or a second secret.

## Webhook and payment behavior

Register an enabled **test-mode** PayMongo endpoint at `https://xrlwtnwamboucihsamrr.supabase.co/functions/v1/paymongo-webhook` for `checkout_session.payment.paid`, then set that endpoint's signing secret above. The handler verifies the raw-body signature, test/live mode, PHP gross amount, and session ID, and deduplicates the event. `paymongo-webhook` and the cron worker have Supabase JWT verification disabled because they use separate signed authentication. Customer and staff checkout functions require an authenticated Supabase JWT.

The default deposit is 50%; the owner may change it and enable Cash, Card, and GCash. At least one online method must stay enabled. New checkouts snapshot their total and deposit charge, so later settings or court-rate edits cannot reprice them. Bowling uses `/set`: each set costs one set rate and reserves one hour on the selected lane.

Staff may collect a deposit booking's remaining balance in Cash through the authenticated check-in action. For PayMongo, staff start a separate balance checkout. A verified paid webhook records the balance and Time-In together when the reservation is still eligible. A checkout opened before the grace deadline keeps the slot held while PayMongo resolves it; settlement after that deadline may still record Time-In if the reservation has not ended. A late or invalid settlement is retained for review without Time-In. Neither a successful browser redirect nor an unverified payment may increase `amount_paid`.

## Rollout checks

1. Configure the two PayMongo test secrets on this demo project; `APP_BASE_URL` is already set. Verify the owner Payment Configuration page reports an API connection and ready webhook.
2. Test a full-payment cart and a deposit cart with PayMongo test credentials. Confirm the bookings appear only after the signed webhook, and that one cart creates one checkout.
3. Test cancellation and expiry; verify the hold is removed only after PayMongo reports the session expired. Check duplicate webhook delivery creates no extra payment or booking.
4. Test two customers choosing the same physical court at the same time, two bowling sets on one lane, and Cash and PayMongo balance collection at staff check-in.
5. Review any older unpaid pending bookings individually. Existing attempts remain eligible for provider reconciliation; do not delete or mark them paid without checking PayMongo.

If PayMongo credentials or the webhook are missing, online checkout is unavailable. The database and Edge Functions may be deployed first; their missing-configuration responses prevent a customer from creating an unpaid booking. The scheduled worker also reports unconfigured until `PAYMONGO_SECRET_KEY` is present. Keep this demo in test mode. Any future real-payment launch requires its own credential, webhook, policy, and acceptance review.

An ambiguous checkout creation stays held for review. Search PayMongo by the attempt UUID without hyphens (`reference_number`) and close any provider session before releasing its court hold. The worker moves an unattached creating attempt to review after 23 hours rather than assuming it can safely expire it.
