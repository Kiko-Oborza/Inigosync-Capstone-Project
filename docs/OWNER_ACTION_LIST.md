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

## E. Configure the Supabase Auth redirect allowlist *(optional now — belt and braces)*

**Why it's blocked:** it's a project setting in the Supabase dashboard.

**What to do:** Supabase Dashboard → **Authentication → URL Configuration →
Redirect URLs**, and add:
- `http://localhost:8532/Pages/Index.html` (local development)
- your production URL, when you have one

**Why it used to matter, and what changed.** Password reset used to work by
emailing a *link*, and that link only came back to the right page if this
allowlist contained it. **Reset is now code-based** — you type six digits into
the app, exactly like log-in and sign-up (see E3) — so the normal path no longer
touches this setting at all.

**Still worth two minutes,** because the app still asks Supabase to send people
back here (`redirectTo`) and still handles a `type=recovery` return:
- any reset email sent *before* you paste in the new template still carries a
  link, and that link needs this;
- it costs nothing and closes the gap if a link-bearing template is ever used.

---

## E2. ⚠️ Paste in the Magic Link email template *(REQUIRED — OTP login will otherwise fail)*

**Why it's blocked:** it's an email template in the Supabase dashboard. I can
write the file; only you can paste it in.

**Why this is urgent.** Phase 6 added first-login-per-device email OTP, and it
covers **all three roles** — customer, staff and admin all take the same path.
It sends the code using Supabase's **Magic Link** template. Supabase's *default*
Magic Link template contains only a clickable link:

```html
<h2>Magic Link</h2>
<p><a href="{{ .ConfirmationURL }}">Log in</a></p>
```

There is **no `{{ .Token }}` in the default**, so the email arrives with no
6-digit code to type — and you are stuck on the verify screen, staring at six
empty boxes, with no way forward. **On a fresh project this is broken by
default.** Please treat this as a required step, not an optional one.

**What to do:** open `docs/email_templates/magic_link.html`, copy the whole
file, then go to Supabase Dashboard → **Authentication → Email Templates →
Magic Link**, paste it into the message body, and Save. Suggested subject:

```
Your IñigoSync login code
```

**What it replaces.** The two-line default above. The new one is a proper
branded email built to match the reset-password one: IñigoSync wordmark, the
`#FF6115` accent, Iñigos Sports Center / Lucena City in the footer, and the
6-digit code as the hero of the message — big, monospaced and spaced out so it
can be read off a phone in one go.

**How to test:** log in from a browser you've never used before (or clear
`localStorage`). You should be asked for a code, and the email should contain a
6-digit number. One quirk to expect while testing: the **Resend code** button
re-enables after 30 seconds, but Supabase only accepts a new request for the
same address after **60**, so an immediate resend comes back as an error. Wait
the full minute.

**Notes worth knowing:**
- **It is deliberately code-only** — there is no login link in it, and please
  don't add one. A link would let whoever opens the mailbox log in from *that*
  device, which is exactly the check this OTP step exists to make; it would also
  leave the browser you actually started from stuck on the verify screen
  forever. The reasoning is written out in full at the top of the file.
- **This template needs nothing else configured.** It does not depend on the
  redirect allowlist (item E), because it contains no link. The same is now
  true of E3 and E4 — all three auth emails are code-only.
- **Do not "tidy" the file.** The tables, inline styles and the `<!--[if mso]>`
  block are deliberate; email clients (Outlook especially) do not support the
  CSS the website uses.

### ⚠️ If *no* email arrives at all, this template is not the fix

There are two different symptoms and they have two different causes:

| What you see | Cause | Fix |
|---|---|---|
| Email arrives, but it's a **link** and there's no code | the default template | **this item (E2)** |
| **No email at all**, or only the first one or two | Supabase's built-in SMTP | custom SMTP — see below |

Supabase's built-in email service is explicitly *"not meant for production
use"* and is currently capped at **2 messages per hour, project-wide** (their
Custom SMTP docs). For a defense demo where several people log in, that runs
out almost immediately; past the cap Supabase rejects the send with a
rate-limit error instead of delivering it, so the first test works and the
next one appears to do nothing.

The fix is to set up your own SMTP on the dashboard's Authentication settings
page (**Authentication → Emails → SMTP Settings** in the current layout) — the
Resend account in **item D** below is exactly what that needs, since Resend
hands you an SMTP host, port, user and password on the free tier. Once custom
SMTP is on, the limit starts at 30 messages/hour and is adjustable under
**Authentication → Rate Limits**.

**This is not hypothetical on this project.** `includes/auth.js` already carries
special handling for Supabase's `over_email_send_rate_limit` error, added on
2026-08-22 with the comment *"the ones that came up while diagnosing the OTP
email issue — Supabase's built-in mailer caps out fast during repeated
signups"*. So the cap has been hit here before, and the app turns it into
"Too many attempts — please wait a minute and try again" rather than a silent
failure. If you see **that** message, it is the mailer, not the template.

**Please tell me which of the two symptoms you actually have** — it decides
whether anything further is needed after pasting these templates in.

---

## E3. ⚠️ Paste in the Reset Password email template *(REQUIRED — password reset will otherwise dead-end)*

**Why it's blocked:** it's an email template in the Supabase dashboard — the
same place as E2 and E4. I can write the file; only you can paste it in.

**Why this is urgent now.** This item used to be cosmetic. It is not any more.
"Forgot password?" now works the same way as log-in and sign-up: you type your
email, the app sends a **6-digit code**, you type it into six boxes, and then
you choose the new password. There is nowhere in the app to paste a link.
Supabase's *default* Reset Password template is a link and nothing else:

```html
<h2>Reset Password</h2>
<p>Follow this link to reset the password for your user:</p>
<p><a href="{{ .ConfirmationURL }}">Reset Password</a></p>
```

No `{{ .Token }}` means no code to type, and the reset screen cannot be
satisfied. **On a fresh project this is broken by default.**

**What to do:** open `docs/email_templates/reset_password.html`, copy the whole
file, then go to Supabase Dashboard → **Authentication → Email Templates →
Reset Password**, paste it into the message body, and Save. Suggested subject:

```
Reset your IñigoSync password
```

**What it replaces.** The three-line default above. The new one matches the
other two exactly: IñigoSync wordmark, the `#FF6115` accent, Iñigos Sports
Center / Lucena City in the footer, and the 6-digit code as the hero of the
message — big, monospaced and spaced out so it can be read off a phone in one
go — plus the "expires in about an hour" note and the "if you didn't ask for
this, ignore it" security line.

**How to test:** open the app → **Log In → Forgot password?** → enter an
address you can read → **Send Reset Code**. You should land on a six-box screen
and the email should contain a 6-digit number. Type it in, choose a new
password, then log in with it. The same 60-second resend quirk described in E2
applies here too: the **Resend code** button re-enables after 30 seconds but
Supabase only accepts a new request after 60, so wait the full minute.

**Notes worth knowing:**
- **Same code-only rule as E2 and E4, and the same reason** — please don't add
  `{{ .ConfirmationURL }}` back. A link would hand a live recovery session to
  whatever device opened the mailbox, while the browser that asked for the
  reset sits waiting for six digits it will never get. The full reasoning is at
  the top of the file.
- **It no longer needs item E (redirect allowlist).** That was true of the old
  link-based version. This one contains no link, so there is nothing for the
  allowlist to govern. The app still keeps the link path working for emails
  sent before you paste this in — see item E.
- **No image is required.** The logo is live text, because an emailed image
  needs a public https URL and this project has no hosting yet. If you want the
  real mark later, upload `assets/Logo/WebLogo.png` to a **public** Supabase
  Storage bucket and follow the `LOGO SLOT` comment inside the file — it is one
  paste, no other change.
- **Do not "tidy" the file.** The tables, inline styles and the
  `<!--[if mso]>` block are deliberate; email clients (Outlook especially) do
  not support the CSS the website uses.
- **The "no email at all" caveat under E2 applies to this one too.** If reset
  emails stop arriving after the first couple, that is the built-in SMTP limit,
  not the template.

---

## E4. ⚠️ Paste in the Confirm signup email template *(REQUIRED — new sign-ups will otherwise stall)*

**Why it's blocked:** it's an email template in the Supabase dashboard — the
same place as E2 and E3.

**Why this is urgent.** It is the same defect as E2, one flow over. After
someone fills in the sign-up form, the app shows six boxes and waits for a
code, then verifies it. But Supabase's *default* **Confirm signup** template is
a link and nothing else:

```html
<h2>Confirm your signup</h2>
<p>Follow this link to confirm your user:</p>
<p><a href="{{ .ConfirmationURL }}">Confirm your mail</a></p>
```

No `{{ .Token }}` means no code, and a brand-new customer's first experience of
the system is a screen they cannot get past.

**What to do:** open `docs/email_templates/confirm_signup.html`, copy the whole
file, then go to Supabase Dashboard → **Authentication → Email Templates →
Confirm signup**, paste it into the message body, and Save. Suggested subject:

```
Confirm your IñigoSync account
```

**How to test:** register a new account with an address you can read. The email
should contain a 6-digit number; type it into the six boxes and you should land
straight in the customer dashboard.

**Notes worth knowing:**
- **Same code-only rule as E2, and the same reason** — please don't add a
  confirmation link. It would confirm the account in whatever device opened the
  mailbox while the browser that filled in the form waits forever. The full
  reasoning is at the top of the file.
- **Different email from E2, on purpose.** E2 is "here is your log-in code" for
  someone who already has an account; this one welcomes a new customer. They
  are not the same message with a different title.
- Staff and admin accounts don't come through here — they're invited from the
  admin dashboard, which is a different Supabase template again.
- **The "no email at all" caveat under E2 applies to this one too.** If sign-up
  emails stop arriving after the first couple, that is the built-in SMTP limit,
  not the template.

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
| **E** (redirect URLs) | Only the old link-style reset emails still in flight; reset itself no longer needs it |
| **E2** (Magic Link template) | **Required** — first-login OTP is unusable without it, for all three roles |
| **E3** (Reset Password template) | **Required** — "Forgot password?" cannot be completed without the code |
| **E4** (Confirm signup template) | **Required** — new sign-ups cannot get past the verify screen without it |
| **F** (court rates) | Replaces every "Rate TBA" with real pricing |
| **G** (T&C values) | Completes the Terms & Conditions page |

**Cheapest high-impact combination:** A1–A4, E2, E3 and E4 — all three email
templates, not two. That's roughly fifteen minutes of copy-paste in the Supabase
dashboard and it activates most of what's already built and sitting dormant —
including log-in, sign-up and password reset, all three of which are *currently
broken* on a default Supabase project because none of the default templates
contain `{{ .Token }}`.
