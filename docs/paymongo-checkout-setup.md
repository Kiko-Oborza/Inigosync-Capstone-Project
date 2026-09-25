# PayMongo hosted checkout setup

IñigoSync uses PayMongo Checkout Sessions for customer online payments. The browser only sends a booking ID to `paymongo-checkout`; the function authenticates the Supabase user, computes the amount from the saved hourly court rate and payment preference, and creates a server-side session. Only the signed `checkout_session.payment.paid` webhook creates a `payment` row and confirms the booking.

## Required configuration

Configure these as Supabase Edge Function secrets for the project:

| Secret | Value |
| --- | --- |
| `PAYMONGO_SECRET_KEY` | PayMongo **test** secret key for testing; use a separate live key only for a deliberate production launch. |
| `PAYMONGO_WEBHOOK_SECRET` | Signing secret for the matching PayMongo webhook endpoint and mode. |
| `APP_BASE_URL` | Exact customer app base URL, e.g. `http://127.0.0.1:5500` for local preview or the production HTTPS origin. |
| `PAYMONGO_EXPIRY_CRON_SECRET` | A separate random secret used only by the scheduled expiry worker. Store the same value in Supabase Vault as `paymongo_expiry_cron_secret`. |

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Never put PayMongo or service-role secrets in frontend files, git, or browser storage.

The owner must also enter each court's confirmed hourly price in the Courts settings. Checkout intentionally rejects unknown prices and `/game` rates. Full payment charges the saved total. Downpayment charges the configured `app_settings.downpayment_pct`. The existing venue-payment flow remains available.

An enabled pg_cron job checks past reservations every minute. The worker explicitly expires unpaid PayMongo sessions so a customer cannot pay for a slot after its booking has been released. Until the separate worker secret is configured in both Edge secrets and Vault, this scheduled job remains inert and past online reservations stay held for staff reconciliation.

## Webhook

Register one **test-mode** PayMongo endpoint at:

`https://xrlwtnwamboucihsamrr.supabase.co/functions/v1/paymongo-webhook`

Subscribe only to `checkout_session.payment.paid`, then save the endpoint's test signing secret as `PAYMONGO_WEBHOOK_SECRET`. The handler verifies PayMongo's HMAC signature over the unmodified body, checks event mode, validates the payment amount and session against the database, and deduplicates by event ID. Do not register a live endpoint until production keys, a public HTTPS app URL, rates, and an end-to-end production-readiness review are complete.

`paymongo-webhook` and `paymongo-expire-checkouts` are intentionally deployed with Supabase JWT verification disabled: PayMongo does not send a Supabase JWT, and the expiry worker authenticates with its separate shared secret. The webhook independently verifies PayMongo's signature before processing any payload.

## Test flow

Use a PayMongo test key and test webhook secret. Select a future hourly reservation whose court has an owner-confirmed rate, choose full payment or downpayment, and choose “Pay online now.” PayMongo returns the customer to the dashboard; the dashboard checks the saved attempt status but does not treat the redirect as proof of payment. The webhook is authoritative. A missing webhook leaves the booking unpaid and should be reconciled from PayMongo's dashboard before staff take further action.

The checkout attempt ID is reused as the PayMongo idempotency key so retrying the same booking does not create a second logical attempt. Attempt snapshots preserve the amount shown at checkout if a court price changes later.

If checkout creation remains ambiguous for 23 hours without an attached session ID, automated retries stop and the attempt moves to staff review. Search the PayMongo dashboard using the attempt UUID (without hyphens) as the `reference_number`; verify whether a session exists and expire it before staff release or collect against that reservation. This fail-closed path avoids creating another session after PayMongo's idempotency window.
