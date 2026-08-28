# IñigoSync — Owner Action List

Everything here needs **your** credentials, your card-free signup, or an
account I have no access to. Nothing on this list can be done by me or by any
agent, because it requires either the `service_role` key (deliberately absent
from this repo) or a third-party account in your name.

Ordered by priority. Each item says **why it's blocked**, **what to do**, and
**what unblocks** once it's done.

---

## A. Run the SQL migrations *(highest value, ~5 minutes total)*

I can write SQL but cannot execute it — the app only ever holds the publishable
(anon) key, and DDL requires elevated access. Every file below is **idempotent**:
re-running it is always safe.

**How:** Supabase Dashboard → your project → **SQL Editor** → **New query** →
paste the file's contents → **Run**.

| # | File | What it does | If you skip it |
|---|---|---|---|
| A1 | `database/schema/003_court_rating.sql` | Adds a nullable `rating` column to `court` (0–5, `CHECK`ed) | Court cards never show a rating. Nothing breaks. |
| A2 | `database/schema/004_staff_module.sql` | Adds `booking.checked_in_at` / `checked_out_at` / `duration_minutes`, creates the `audit_log` table + RLS, adds walk-in name/mobile columns | Staff Time-In/Out and Transaction Records stay unavailable; the UI degrades to an honest empty state rather than erroring |
| A3 | `database/schema/005_session_security.sql` | Creates the `active_session` table + RLS for one-device-at-a-time enforcement | Single-session silently no-ops. Login and dashboards work normally. |
| A4 | `database/schema/006_court_unit_images.sql` | Adds a nullable `unit_images` jsonb column to `court`, so one sport can carry a photo per individual court/lane/table | The landing page's court viewer still lists every unit (Court 1–9, Duckpin/Ten-Pin, Table 1–2) — they just all share the sport's single photo. Nothing breaks. |

> All frontend code is written to **work correctly before these are applied**.
> Missing columns/tables degrade gracefully — they never break the app. Applying
> them switches the corresponding features on.

---

## B. Answer the `pg_cron` question *(blocks Phase 4 design)*

**Why it's blocked:** checking installed Postgres extensions requires catalog
access the anon key does not have.

**What to do:** run **block 9** of `database/qa/001_introspect.sql` in the SQL
Editor and send me the result. It is a read-only `select` — it changes nothing.

**Why it matters:** two spec requirements *must* run on a server-side schedule,
because browser JavaScript only runs while somebody has a tab open:

- **Automatic Cancellation** — the fixed 30-minute grace period, auto-cancel,
  and slot re-opening
- **Booking notifications** — the once-only reminder in the 5h→0h window

**The two possible answers:**
- `pg_cron` **is** listed → I build both as Postgres functions on a cron
  schedule. Clean, self-contained, no external service.
- `pg_cron` is **not** listed → they need a different design (a scheduled Edge
  Function, or an external cron pinging a webhook). Same features, different
  architecture — which is exactly why I want to know *before* building.

---

## C. Create a free PayMongo test account *(blocks Phase 5 — Payment Automation)*

**Why it's blocked:** it's an account in your name, and the secret key must never
touch this repo.

**What to do:**
1. Sign up at <https://dashboard.paymongo.com/signup> (free; no business
   documents needed while you stay in **Test Mode**).
2. Stay in **Test Mode** — the toggle is in the dashboard. No real money moves.
3. Go to **Developers → API Keys**. You'll see two test keys:
   - **Public key** (`pk_test_…`) — safe to share with me; it goes in frontend code.
   - **Secret key** (`sk_test_…`) — **never send this to me and never put it in
     the repo.** You'll set it as a Supabase Edge Function secret yourself:
     ```
     supabase secrets set PAYMONGO_SECRET_KEY=sk_test_xxx
     ```

**What unblocks:** the e-wallet payment flow (GCash/Maya in test mode), real
receipt/invoice generation, and the live payment loading phase — i.e. the
Payment Automation objective, which currently has **no code at all**.

**Test payments:** PayMongo's test mode provides simulated GCash/card flows that
always succeed or fail on demand — ideal for a defense demo, and no real funds.

---

## D. Create a free Resend account *(blocks email notifications)*

**Why it's blocked:** account in your name; the API key is a secret.

**Recommended because you have no domain.** Resend lets you send from its shared
`onboarding@resend.dev` sender on the free tier (**3,000 emails/month**) with
**no domain required**.

**What to do:**
1. Sign up at <https://resend.com/signup> (free, no card).
2. **API Keys → Create API Key.** Keep it secret — set it as a Supabase Edge
   Function secret yourself, exactly like the PayMongo key. Don't send it to me.
3. Tell me only that it's done, and which sender address you want to use.

**Caveat worth knowing:** on the shared `resend.dev` sender, deliverability to
Gmail is decent but not guaranteed, and mail may land in Spam. For a thesis
demo that's usually fine. If it isn't:
- **Brevo** (<https://brevo.com>) — free 300 emails/day, and it lets you verify a
  **single Gmail address as the sender** with no domain at all. Best
  deliverability without owning a domain.
- **Gmail SMTP + App Password** — free, ~500/day, sends as your own Gmail.
  Simplest of all, slightly less "real system" for a defense narrative.

I'll build the email layer **provider-agnostic**, so switching later is a
config change, not a rewrite.

**Optional — a free domain, if you want one:** you're a student, so the
[GitHub Student Developer Pack](https://education.github.com/pack) includes a
free `.me` domain from Namecheap for a year. Not required for any of the above.

---

## E. Configure the Supabase Auth redirect allowlist *(needed for password reset)*

**Why it's blocked:** it's a project setting in the Supabase dashboard.

**What to do:** Supabase Dashboard → **Authentication → URL Configuration →
Redirect URLs**, and add:
- `http://localhost:8532/Pages/Index.html` (local development)
- your production URL, when you have one

**Why it matters:** Phase 1 shipped a working forgot/reset-password flow. The
reset email's link will not return the user to the right page until this is set.
Until then, that feature is built but non-functional.

---

## E2. ⚠️ Fix the Magic Link email template *(REQUIRED — OTP login will otherwise fail)*

**Why it's blocked:** it's an email template in the Supabase dashboard.

**Why this is urgent.** Phase 6 added first-login-per-device email OTP. It sends
the code using Supabase's **Magic Link** template. Supabase's *default* Magic
Link template contains only a clickable link:

```html
<h2>Magic Link</h2>
<p><a href="{{ .ConfirmationURL }}">Log in</a></p>
```

There is **no `{{ .Token }}` in the default**, so the email would arrive with no
6-digit code to type — and the user would be stuck on the verify screen with no
way forward. **On a fresh project this is broken by default.** Please treat this
as a required step, not an optional one.

**What to do:** Supabase Dashboard → **Authentication → Email Templates →
Magic Link**, and make sure the body includes `{{ .Token }}`. For example:

```html
<h2>Confirm it's you</h2>
<p>Enter this code to finish signing in to IñigoSync:</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:700">{{ .Token }}</p>
<p>This code expires in 60 minutes. If you didn't try to log in, ignore this email.</p>
```

Keeping `{{ .ConfirmationURL }}` as well is fine — the code is what the app asks
for, the link is just a convenience.

**How to test:** log in from a browser you've never used before (or clear
`localStorage`). You should be asked for a code, and the email should contain a
6-digit number.

---

## F. Set real court rates *(no longer needs me — you can do this yourself now)*

Every `court.rate` is currently `NULL`, so the UI honestly shows **"Rate TBA"**
everywhere. I deliberately did not invent prices — fabricating figures in a
thesis system is worse than showing a placeholder.

**As of Phase 2 you can now do this yourself in the app:** log in as admin →
**Court Listings** → edit a court → set its rate. Changes are written straight to
the `court` table and appear immediately on the landing page and in the customer
booking dropdown.

Confirm the real figures with Ms. Driz first.

---

## G. Fill in the two Terms & Conditions placeholders

`Pages/terms.html` contains two `[TO BE CONFIRMED WITH MS. DRIZ]` markers —
online payment fees, and refund eligibility for voluntary cancellation. These
are business-policy decisions, not technical ones, so they were left explicit
rather than invented.

Get the real answers and I'll drop them in, or edit the file directly.

---

## Quick reference — what each item unblocks

| Do this | Unlocks |
|---|---|
| **A1–A4** (run SQL) | Court ratings, staff Time-In/Out, audit trail, single-session, per-court photos |
| **B** (`pg_cron` check) | Lets me *design* auto-cancellation + reminders correctly |
| **C** (PayMongo) | Payment Automation objective, receipts, payment loading phase |
| **D** (Resend) | Gmail booking reminders |
| **E** (redirect URLs) | Makes the already-built password reset actually work |
| **E2** (Magic Link `{{ .Token }}`) | **Required** — first-login OTP is unusable without it |
| **F** (court rates) | Replaces every "Rate TBA" with real pricing |
| **G** (T&C values) | Completes the Terms & Conditions page |

**Cheapest high-impact combination:** A1–A4 and E. That's roughly ten minutes of
copy-paste in the Supabase dashboard and it activates most of what's already
built and sitting dormant.
