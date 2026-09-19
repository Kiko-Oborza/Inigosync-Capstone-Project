# Customer access and optional phone verification

## Early email availability

Signup checks the normalized email after a short typing pause, on blur, and
before leaving step 1. A taken address stays on step 1 with a login suggestion.
Failed checks and rate limits show retry guidance rather than claiming availability.
Responses for an older input are ignored. Successful answers are cached for 30
seconds; signup remains authoritative if another registration wins the race.

`public.signup_email_availability(text)` is a security-invoker RPC exposing only
`available`, `taken`, `invalid`, or `rate_limited`. Its private helper checks
`auth.users`, including existing customer/staff/admin and unconfirmed accounts,
without exposing account details. This intentionally discloses exact-address
registration status as requested; it never provides a searchable user list.

The private limiter allows 20 checks/minute per forwarded-client header and 300
globally, using atomic upserts. The global ceiling remains even if caller headers
are spoofed. Only hashed client buckets are retained; old minute buckets are
removed on subsequent requests. No email/IP strings are stored in the limiter.
The limiter has RLS and no client grants/policies: its deny-all advisor INFO is
intentional. See [RLS policy advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
Existing unrelated project security warnings were not changed.

The migration is in `supabase/migrations/*_signup_email_availability.sql` and was
applied to the connected project. Live rollback-only SQL assertions verified
existing-email matching, case/space normalization, invalid input, rate limiting
and absence of anonymous table access. An anonymous HTTP RPC check also passed.

Google buttons on customer Log In and Sign Up accept only an active `customer`
profile. Authenticated `staff`/`admin` profiles are signed out locally and see a
persistent explanation directing them to **Log in as Admin**. The existing role
is never changed. Password logins check the same profile before sending a
first-device email OTP. Existing remembered staff/admin sessions still resume
their own dashboard.

The signup phone field is optional. Blank numbers are submitted as `null`;
entered numbers must pass the existing PH mobile validator. After email
confirmation (or immediate signup when confirmation is disabled), customers
who supplied a number can choose **Verify** beside their number or **Skip for now**.
The signup-step button explains that verification follows email confirmation.
After a confirmed SMS code, the button shows **Verified** and **Continue** finishes login.
Skipping leaves the number unverified and lets Account Settings handle it later.

Email availability uses a compact label beside the email heading and green/red
field borders. Status changes reserve the same space, so the card does not resize.

The SMS flow calls `auth.updateUser({ phone })`, confirms that a pending phone
change exists, and verifies the supplied code with `type: 'phone_change'`.
It then checks the server-returned user ID, confirmed phone and confirmation
timestamp before saving `contact_num` and `phone_verified` together. No code is
generated locally. A missing SMS provider never produces a success state.
The existing profile verification flag is display metadata, not an authorization
claim; roles continue to come from the protected profile role.

## Delivery setup still needed

For the capstone, signup now defaults to an explicitly labelled free SMS demo
via `Config/phoneVerification.js`. The displayed test code is 123456 (60-second
expiry); successful simulation says Demo passed and does not save phone_verified.
The live API flow described above remains available only with mode set to live.

On 2026-09-19, the project's public Auth settings report `external.phone: false`.
Phone authentication and an SMS provider with phone confirmations enabled are
required for actual delivery. No provider was enabled or purchased by this change.
Provider fees/trial limits are separate from the application. Test-number codes
do not send text messages and must not be represented as real SMS delivery.

Official reference: https://supabase.com/docs/guides/auth/phone-login

The branded SMS template is now saved in the hosted project. See
[SMS activation guide](sms-provider-setup.md) for the remaining provider account,
credentials, billing review and real-delivery check. Run
`node scripts/check-sms-readiness.cjs` for a read-only configuration preflight.

## Verification

`tests/auth-account-flows.cjs` uses mocked Auth responses; it creates no real
accounts and sends no emails/SMS. It covers rejected Google roles, successful
customer OAuth, optional and malformed phone values, both email-confirmation
paths, invalid codes, cooldown, verified-only persistence, unavailable sending,
mismatched confirmed numbers and skipping. Real SMS delivery remains unverified
until a provider is configured.
