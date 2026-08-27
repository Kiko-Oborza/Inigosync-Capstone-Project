# IñigoSync — Landing Page Rework + Backend Seed Users + Bug Fixes

## Goal
Redesign the landing page into a minimalist page that shows courts, featured events,
about-Iñigos, and 3 rotating Google reviews; back it with real Supabase tables
(courts, events, reviews); and seed one working account for each role
(customer, staff, admin) — plus fix the bugs found along the way.

## Context and current state

**Stack (confirmed by inspection)**
- Frontend: plain HTML/CSS/JS, no build step. Served by `python -m http.server 8532`
  (`.claude/launch.json`). Entry page is `Pages/Index.html`.
- Backend: Supabase project `xrlwtnwamboucihsamrr`. Client is created in
  `Config/supabaseClient.js` as `window.sb` using the publishable (anon) key.
- Auth: real Supabase Auth is already wired in `includes/auth.js`
  (password login, signup, OTP verify, admin login, Google OAuth).
  `includes/authGuard.js` guards the 3 dashboards via `body[data-required-role]`.

**Database — actual state (probed via PostgREST)**
| Table | Exists | Rows |
|---|---|---|
| `profiles` | yes | 0 |
| `booking` | yes | 0 |
| `payment` | yes | 0 |
| `walk_in_booking` | yes | 0 |
| `courts` / `sports` / `events` / `reviews` | **no** | — |

So: the schema is half-built and the database is completely empty. There are
zero users, which is why nothing can be tested end to end today.

**Landing page today**
- Hero carousel, "this week" strip, About, Courts grid, CTA footer, auth modal.
- Courts grid renders from a hardcoded array in `includes/courts-data.js`.
- Hero slides are hardcoded `<img>`/`<div>` pairs in `Index.html`.
- No reviews section at all.

**Bugs / defects found during inspection**
1. `includes/courts-data.js` points every court at `../assets/courts/<name>.jpg`.
   That directory does not exist — every one of those paths is a 404. The landing
   page happens not to render images, so it's invisible today, but it is dead data.
2. Court data, hero events and the "This week" strip are three separate hardcoded
   sources that can drift out of sync (Bowling is 8+12 lanes in one, "8 lanes" in another).
3. `includes/Dashboard.js:358` inserts a booking with `sports` and `courts` set to
   the *same* value (`bookingState.court`). One of the two is wrong.
4. `includes/landingPage.js` injects `c.name` / `c.note` into `innerHTML` without
   escaping. Harmless with a static array, an XSS hole the moment this data comes
   from the database. Must be fixed as part of moving courts to Supabase.
5. `includes/landingPage.js` `return`s early inside `DOMContentLoaded` when
   reduced-motion is on — which silently skips *all* the nav scroll-spy and mobile
   menu wiring below it. Reduced-motion users get a broken navbar.
6. Nav "Events" link points at `#whats-on`, which is the thin week strip, not an
   events section. There is no real featured-events section to link to.

## Approach and architectural decisions

**D1 — Move courts and events into Supabase; keep the static array as fallback.**
Create `sport`, `court`, and `event` tables (singular, matching the existing
`booking`/`payment` naming). The landing page reads from them; if the fetch fails
or returns empty, it falls back to `COURTS_INVENTORY` so the page never renders blank.

**D2 — Images are "slots", not `<img>` — for COURTS. The hero keeps its photos.**
No court images exist yet, so each court card renders a placeholder slot
(aspect-ratio box, 2-letter sport monogram, subtle pattern) driven by a nullable
`image_url`. Null → slot; set → the same component swaps in a real `<img>`. No
rework needed when photos arrive.

**Correction made during execution:** the first implementation extended slot
treatment to the hero too, hardcoding `imageUrl: null` in the events fallback. That
orphaned all 7 real photos in `database/web/` and replaced the full-bleed
photographic hero with a gradient + "BB" monogram. Slots were only ever meant for
courts, where images genuinely don't exist. Fixed: the 5 fallback events now point
at the real local photos, and `database/seed/002_seed_content.sql` sets the same
paths on `image_url` so the DB path matches once the SQL is run.

**D3 — Reviews: labeled testimonials in Supabase. A live Google feed is not viable.**

Researched and ruled out. Two independent blockers:

1. **Card required.** Places API reviews need a billing-enabled Cloud project, which
   needs a real payment method. Google's one card-free option — the Maps Demo Key —
   names this exact case as excluded: *"User-generated content, such as user-submitted
   photos and reviews, is not available through the Maps Demo Key."*
2. **Storing reviews is a ToS violation anyway.** Places API content may not be
   cached or stored. The only exceptions are lat/long (30 days) and `place_id`
   (indefinite). Review text, author, and rating have **no** exception — so the
   original "seed reviews into a `google_review` table" idea was non-compliant
   regardless of whether a key was ever obtained.

Also worth knowing: the API caps at **5 reviews per place**, no pagination, and
relevance-sort only (the `newest` sort exists only on the Legacy endpoint, which
cannot be enabled on any project created after March 1, 2025).

**Chosen approach:** a `testimonial` table in Supabase — `author_name`, `rating`,
`quote`, `source_label`, `captured_on`, `display_order`, `is_published`. The landing
page picks 3 at random per load. The section is labeled honestly as testimonials
("What people say about Iñigos"), **not** presented as a live Google Reviews feed.
Zero cost, no card, no ToS exposure, fully styleable to match the design, and it
still works with no internet during a thesis defense.

Note for the owner: review text is copyrighted by its author, not by Google. Get
Ms. Driz's sign-off on the quotes used, and prefer testimonials given directly to
the business over verbatim copies of strangers' Google posts.

**D4 — Seed users via a SQL script the owner runs, not from code.**
Creating an `auth.users` row with a chosen role requires the `service_role` key,
which must never live in this repo. Instead the Coder produces
`database/seed/001_seed_users.sql` to be pasted into the Supabase SQL editor.
It creates one confirmed account per role and the matching `profiles` row.
Credentials are demo-grade and documented in `database/seed/README.md`.

**D5 — Minimalist redesign, restrained scope.**
Keep the existing design language (Oswald/Inter, dark-first theming, pill navbar) —
this is a cleanup, not a rebrand. Sections in order:
Hero → Featured Events → Courts & Facilities → About → Reviews → CTA → Footer.
The "This week" strip is absorbed into the Featured Events section so there is one
source of truth for what's on, and the nav "Events" link finally points somewhere real.

**D6 — Resend and PayMongo are out of scope for this pass.** See Non-goals.

## Files to change

| File | Intent |
|---|---|
| `database/schema/002_content_tables.sql` | **new** — `sport`, `court`, `event`, `testimonial` tables + RLS (public read, staff/admin write) |
| `database/seed/001_seed_users.sql` | **new** — one confirmed auth user + profile per role |
| `database/seed/002_seed_content.sql` | **new** — 9 sports/courts, sample events, placeholder testimonials |
| `database/seed/README.md` | **new** — how to run the SQL, and the 3 demo logins |
| `Pages/Index.html` | Restructure sections; add Featured Events + Reviews; retire the week strip; fix nav anchors |
| `Style/LandingPage.css` | Styles for events grid, review cards, image slots; tighten spacing for the minimalist pass |
| `includes/landingPage.js` | Render courts/events/reviews from Supabase with static fallback; **escape all interpolated text**; fix the reduced-motion early-return |
| `includes/courts-data.js` | Keep as fallback only; drop the dead `../assets/courts/*` paths |
| `includes/home-showcase.js` | Drive hero slides from fetched events instead of hardcoded markup |
| `includes/Dashboard.js` | Fix the `sports`/`courts` duplicate-value insert bug |

## Constraints and non-goals

**Constraints**
- No build step, no framework, no npm. Plain HTML/CSS/JS only. (Node is not even
  installed on this machine.)
- Never commit a `service_role` key or any secret. `Config/supabaseClient.js` keeps
  only the publishable key.
- All new tables get RLS enabled: public `SELECT`, writes restricted to staff/admin.
- Landing page must still render fully with the database unreachable (fallback path).
- Do not touch the three dashboards beyond the single `Dashboard.js` bug fix.

**Non-goals for this pass**
- Resend email integration (Supabase's built-in mailer stays for now).
- PayMongo payment flow.
- Live Google Places API integration.
- Uploading real court/event photography.

## Success criteria

1. `Pages/Index.html` renders Hero, Featured Events, Courts, About, Reviews, CTA,
   Footer — with zero console errors and zero failed network requests.
2. Courts and events render from Supabase; killing the network still renders the
   fallback content rather than empty sections.
3. Every court and event card shows an image **slot** placeholder, not a broken image.
4. Exactly 3 testimonials render, randomly chosen, changing across reloads, and the
   section is labeled as testimonials — never as a live Google Reviews feed.
5. Nav links Home / Courts / Events / About all scroll to a real section, and
   scroll-spy highlights correctly — **including with reduced-motion enabled**.
6. Running the seed SQL produces 3 working logins: customer → `user_dashboard.html`,
   staff → `staff_dashboard.html`, admin → `owner_dashboard.html`, each via the
   correct modal panel, with the wrong panel correctly rejected.
7. All 6 listed bugs fixed, with the XSS fix demonstrable (a court named
   `<img onerror=alert(1)>` renders as text).
8. Layout holds at 375px, 768px, and 1440px, in both light and dark themes.

## Status at hand-off

| Criterion | Status |
|---|---|
| 1. All 7 sections, no console/network errors | **Partial** — code complete; `court`/`event`/`testimonial` queries will 404 until the schema SQL is run. Never opened in a browser. |
| 2. Supabase-sourced with working fallback | Code complete, fallback traced by hand. DB path never executed. |
| 3. Image slots, no broken images | **Verified** — courts all slot; hero/events use real photos. |
| 4. 3 random testimonials, labeled honestly | Code complete, not visually confirmed. |
| 5. Nav + scroll-spy incl. reduced-motion | **Verified in code** — early `return` replaced with `if/else`. |
| 6. XSS fix | **Verified** — `escapeHtml` covers all 5 chars, all 12 interpolation sites audited. |
| 7. Responsive 375/768/1440 × light/dark | **NOT VERIFIED** — no browser tooling available. |
| 8. SQL valid and idempotent | Reviewed by hand only. Never executed. |
| 3 role logins work | **NOT VERIFIED** — blocked on the owner running the seed SQL. |

**No one has opened this page in a browser.** Neither the orchestrator nor any
subagent had working preview/browser tools in this session, despite the preview
workflow being described. Criteria 1, 4 and 7 rest on code reading alone.

## Verification steps

1. `python -m http.server 8532` via the preview tool; open `/Pages/Index.html`.
2. Read console + network for errors; screenshot at 3 widths × 2 themes.
3. Block the Supabase host in devtools and reload to prove the fallback path.
4. Run the seed SQL in the Supabase SQL editor, then log in as each of the 3 roles
   and confirm the redirect target.
5. Confirm cross-panel rejection: staff credentials on the customer panel must fail.

## Decisions confirmed by the owner

- **Demo credentials — generate them.** The Coder invents the 3 demo accounts and
  documents them in `database/seed/README.md`. No specific credentials were supplied.
- **Court rates — leave blank.** Keep the `'—'` placeholder and the
  `TODO: confirm with Ms. Driz` note. Do not invent prices.
- **Payment confirmation — not ours to build.** PayMongo issues its own payment
  confirmation, so IñigoSync will not send or render one. Resend's job is limited to
  verification/OTP codes. (Still out of scope for this pass; recorded so it isn't
  built by mistake later.)

## Open questions and risks

- **Q1 — RESOLVED.** No free, card-free Google reviews key exists, and storing review
  content would violate the ToS regardless. Going with labeled testimonials (D3).
  **Owner confirmed: no real quotes available yet → ship `[PLACEHOLDER]` rows.**
  Every seeded testimonial must be obviously fake (placeholder author names, generic
  text) so nothing misattributed can ever reach a live page by accident.
- **Risk.** The seed SQL writes directly into `auth.users`. It will be written to be
  idempotent (`on conflict do nothing`) so re-running is safe, but it does touch an
  internal Supabase schema — that's the accepted trade-off for not having the
  service_role key in the repo.
- **Risk.** I could not read column definitions for `booking`/`payment`/`walk_in_booking`
  (anon key can't reach the introspection endpoint, and the tables are empty). The
  Coder will confirm `profiles`' shape from the seed SQL's own success rather than guessing.
