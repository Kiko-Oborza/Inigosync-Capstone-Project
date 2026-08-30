# Landing Page Redesign — Light/Dark Legibility + Nav Restructure

> **Active plan.** The previous QA Remediation Plan is retained verbatim in the
> Appendix at the bottom of this file, so existing code comments that cite
> "implementation_plan.md (D2)" / "(D3)" / "Phase 3" still resolve here.

## Goal

Rebuild `Pages/Index.html` + `Style/LandingPage.css` so that (a) the light-mode
white haze over the navbar is gone, (b) every card and section is clearly
readable in *both* themes, and (c) the site navigation is exactly **Home ·
Courts · Pricing · About**, where Courts opens a per-sport photo viewer and
About contains the Iñigos story, reviews/feedback, and the footer.

## Context and current state

Static, no-build site: plain `<script src>` tags, hand-written CSS with
`:root` / `:root[data-theme="light"]` token blocks. `includes/theme.js` owns the
`data-theme` attribute; `includes/landingPage.js` renders the Courts, Events and
Testimonials grids from Supabase with a static fallback
(`includes/courts-data.js`); `includes/home-showcase.js` drives the hero photo
carousel from the same event data.

Three concrete defects confirmed by reading the source:

1. **The white haze.** `Style/LandingPage.css:159` still carries a legacy
   full-width `header { position: fixed; background: rgba(20,17,13,.5);
   backdrop-filter: blur(10px); padding: 20px 80px }` rule from before the
   navbar became a floating pill, plus `:root[data-theme="light"] header {
   background: rgba(255,252,244,.5) }` at line 170. `.site-nav` tries to undo it
   with `background: none; backdrop-filter: none`, but its specificity is `0,1,0`
   against the light override's `0,2,1` — **so the light rule wins and paints a
   full-bleed translucent white band with a blur across the top of the hero.**
   In dark mode the base `header` rule is only `0,0,1`, so `.site-nav` beats it
   and no band appears. That is exactly the "white shadow only in light mode"
   the user is seeing.

2. **Invisible cards.** In light mode `--color-bg-card` and
   `--color-bg-elevated` are *both* `#FFFFFF`, so every `.event-card` /
   `.court-card` / `.testimonial-card` sitting inside `.events` or `.about`
   (both `background: var(--color-bg-elevated)`) is white-on-white, separated
   only by a `#EFE3D2` hairline and no shadow. Dark mode is nearly as bad:
   `#201a14` card on `#1c1712` section is a ~2% luminance step.

3. **Nav does not match the requested IA.** Current links are Home · Events ·
   Courts · About; there is no Pricing section, courts are not clickable, and
   testimonials sit in their own top-level section unreachable from the nav.

## Approach and architectural decisions

**L1 — Delete the legacy `header` rules outright; do not patch specificity.**
The floating pill (`.site-nav` + `.site-nav-pill`) is the only navbar this page
has. Both the base `header {}` block and its `:root[data-theme="light"] header`
override are dead weight from the previous design and are removed, not
overridden. `.site-nav` keeps `background: none; backdrop-filter: none` so the
hero photo runs edge to edge behind a genuinely floating pill in both themes.
The pill itself keeps its own translucent surface + blur — that is intentional
and stays.

**L2 — Introduce explicit surface-elevation tokens instead of reusing
`--color-bg-elevated` for two different jobs.** A card must never share a colour
with the section it sits on. New tokens, defined in both theme blocks:

| Token | Dark | Light | Role |
|---|---|---|---|
| `--surface-page` | `#14110d` | `#FFFCF4` | default section background |
| `--surface-band` | `#191410` | `#F7F0E4` | alternating section band |
| `--surface-card` | `#241d16` | `#FFFFFF` | every card |
| `--surface-card-hover` | `#2b231a` | `#FFFDF8` | card hover |
| `--border-soft` | `rgba(244,239,230,.14)` | `#E6D8C2` | hairlines |
| `--border-card` | `rgba(244,239,230,.20)` | `#DCCBB1` | card outline |
| `--shadow-card` | `0 6px 20px rgba(0,0,0,.35)` | `0 6px 18px rgba(90,64,30,.10)` | card lift |
| `--shadow-card-hover` | `0 12px 34px rgba(0,0,0,.45)` | `0 14px 32px rgba(90,64,30,.16)` | card hover lift |

Existing `--color-bg*` / `--color-line` names are **kept as aliases** of the new
tokens so nothing in `Auth.css`, `Dashboard.css`, or the dashboard pages breaks.
The rule the redesign must satisfy: **card surface ≠ section surface in both
themes, and every card carries both a visible border and a shadow.** Light-mode
cards get a warm-grey border rather than the near-invisible `#EFE3D2`.

**L3 — Nav = Home · Courts · Pricing · About, and the page sections match
one-to-one.** Section order becomes: Hero (`#home`) → Courts (`#courts`) →
Pricing (`#pricing`) → About (`#about`, containing the Iñigos story + stats,
then Reviews/Feedback, then the CTA band) → site footer. The standalone
"Featured Events" section is **removed from the page and the nav** — the events
data is still fetched and still drives the hero carousel and its captions, which
is the "Home" the user said was already good. `includes/home-showcase.js` and
`getEvents()` are untouched. The hero's secondary CTA `href="#events"` is
repointed to `#courts`.

**L4 — Court cards become buttons that open a photo lightbox.** Each
`.court-card` renders as `<button class="court-card" data-court-id>` (real
button = keyboard + screen-reader support for free, no `tabindex` hacks). Click
opens a single reusable modal (`#courtViewer`) showing the court photo at full
size with the sport name, unit count, and note. Escape / backdrop click /
close-button all dismiss it; focus moves into the dialog on open and returns to
the invoking card on close; `body` scroll locks while open.
**Photo source:** the modal reads `court.imageUrl` — the same `image_url` column
the grid already reads. There are **no court photos in the repo today**
(`assets/` has only Logo/NavBar/Background) and `image_url` is NULL for every
row, so the viewer must degrade honestly: it shows the existing monogram
placeholder panel plus "Photo coming soon" rather than a broken `<img>`. The
moment the owner sets `image_url` via admin Court Listings, real photos appear
with zero code changes. If the user drops files into `assets/courts/`, the
fallback array in `includes/courts-data.js` is where the local paths go —
one line per sport, no other change needed. *(See Open questions.)*

**L5 — Pricing is a new section rendered from the same court data, and stays
honest.** No second hardcoded price list — this is the D2 rule from the
Appendix and it still applies. Pricing renders a table/card grid from
`getCourts()` using `rate` / `rateUnit`, showing "Rate TBA" where `rate` is
NULL, which is currently every row (`database/seed/002_seed_content.sql` leaves
prices unconfirmed on purpose). No invented numbers.

**L6 — Reviews live inside About; the testimonial honesty label stays.**
The existing `.testimonials` block moves under `#about` as a sub-block titled
Feedback & Reviews. The "these are testimonials shared with us, not a live
Google Reviews feed" wording from D3 (Appendix) is preserved verbatim — it is a
legal/accuracy constraint, not a style choice.

**L7 — Same theme, no rebrand.** Oswald / Inter / Space Mono, `#FF6115` orange,
warm near-black and warm off-white, pill navbar, rounded cards. This is a
legibility and IA fix, not a visual identity change.

## Files to change (with intent for each)

| File | Intent |
|---|---|
| `Style/LandingPage.css` | Delete legacy `header` + light-`header` rules (L1). Add the elevation token set to both `:root` blocks with back-compat aliases (L2). Restyle `.court-card` / `.event-card` / `.testimonial-card` / `.footer-card` / `.media-slot` for card-vs-section contrast + shadows in both themes. Add `.pricing`, `.pricing-grid`, `.court-viewer` (modal) blocks. Add `button.court-card` resets (font/text-align/width/cursor). Update responsive rules for the new sections. |
| `Pages/Index.html` | Nav links → Home/Courts/Pricing/About in both the pill nav and the off-canvas menu. Remove the `#events` section; repoint the hero secondary CTA to `#courts`. Add `#pricing` section shell + `[data-pricing-grid]`. Nest the testimonial block inside `#about` as Feedback & Reviews. Add the `#courtViewer` modal markup. Keep `<h1 class="sr-only">`, the auth modal, and all script tags/order unchanged. |
| `includes/landingPage.js` | `renderCourtCard` emits a `<button>` with `data-court-id`. New `renderPricingRow` + pricing-grid wiring off the *same* `getCourts()` promise (do not add a second fetch). New court-viewer open/close/focus-management module. Scroll-spy `sectionMap` still works off `nav ul li a[href^="#"]` — verify against the new anchors. |
| `includes/courts-data.js` | Only if local court photos are added: set `image_url` per sport. Otherwise unchanged. |
| `implementation_plan.md` | This file; update if the approach shifts. |

## Constraints and non-goals

- **No build step, no framework, no new dependencies.** Plain `<script src>`,
  hand-written CSS, exactly as today.
- **Do not touch** `includes/theme.js`, `includes/home-showcase.js`, the auth
  modal markup, `includes/auth.js`, `Config/`, `api/`, `database/`, or any
  dashboard page. The redesign is scoped to the landing page.
- **Do not break the dashboards:** `Auth.css`, `Dashboard.css` and the dashboard
  HTML consume `--color-bg`, `--color-bg-card`, `--color-bg-elevated`,
  `--color-ink*`, `--color-line`. Those names must keep working (L2 aliases).
- Keep the fetch-with-static-fallback pattern; never add a second source of
  truth for courts or prices (D2).
- Keep the `escapeHtml` usage on every `innerHTML` interpolation (D3) —
  including the new pricing rows and modal content.
- Keep every `@media (prefers-reduced-motion: reduce)` guard; new animations
  (modal transitions, card hover lift) need their own guards.
- No invented prices, no fake ratings, no fake review feed.
- Not in scope: sourcing/creating actual court photography, changing the colour
  palette or typefaces, touching booking logic.

## Success criteria

1. In **light mode**, no translucent white band or blur strip spans the top of
   the hero — the hero photo is visible edge-to-edge behind a floating pill.
   Computed style of `header.site-nav` has `background-color: rgba(0,0,0,0)` and
   `backdrop-filter: none` in both themes.
2. In **both themes**, every card (`.court-card`, `.testimonial-card`,
   `.footer-card`, pricing cards) has a background colour different from its
   parent section's, plus a visible border and shadow. No white-on-white.
3. Body text on every section meets WCAG AA (≥4.5:1) in both themes; large
   headings ≥3:1.
4. The nav shows exactly **Home, Courts, Pricing, About** — in both the desktop
   pill and the mobile off-canvas menu — and each link scrolls to a real
   section. Scroll-spy highlights the correct link.
5. Clicking any court card opens the photo viewer for that sport; it shows the
   photo when `image_url` exists and an honest placeholder when it does not.
   Escape, backdrop click, and the close button all dismiss it; focus returns to
   the card that opened it; the modal is reachable and operable by keyboard.
6. The Pricing section lists every sport from the same `getCourts()` data, with
   "Rate TBA" where the rate is NULL. No hardcoded price list.
7. `#about` contains the Iñigos story, the stats, and the Feedback & Reviews
   block with its "not a live review feed" disclosure intact, followed by the
   CTA band and the footer.
8. Zero console errors on load in both themes; the theme toggle still flips
   instantly with no flash and persists across reload.
9. Layout holds at 1440 / 1024 / 768 / 390 px wide in both themes.
10. The three dashboard pages still render correctly (token aliases intact).

## Verification steps

Dev server is `.claude/launch.json` → **static-server** (`python -m http.server
8532`); the landing page is at `/Pages/Index.html`.

1. Load the page in light mode. Screenshot the hero — confirm no white band.
2. Toggle to dark. Screenshot again. Confirm the pill still reads clearly.
3. Scroll each section in both themes; confirm card edges are visible in
   screenshots, not inferred from the CSS.
4. Read computed `background-color` of `header.site-nav`, and of a
   `.court-card` vs its parent section, in both themes.
5. Click a court card → viewer opens. Press Escape → closes, focus back on the
   card. Tab into a card and press Enter → same result.
6. Click each nav link; confirm scroll target and active-link highlight.
7. Check the console for errors and the network tab for 404s (particularly any
   court image paths).
8. Resize to 768 and 390; open the off-canvas menu; confirm 4 links.
9. Load `Pages/user_dashboard.html` and `Pages/owner_dashboard.html` in both
   themes to confirm the token aliases did not regress them.

## Open questions and risks

- **OQ1 — RESOLVED (user, 2026-08-28): images come from the database; build the
  slot.** No local `assets/courts/` directory, no bundled photos, no hardcoded
  image paths. Court photos and hero/featured photos are DB-driven via
  `image_url`. Both the grid card and the new court viewer render the existing
  `.media-slot` placeholder (pattern + sport monogram) while `image_url` is
  NULL, and swap in the real `<img>` with zero markup changes once the owner
  sets it through admin Court Listings. `includes/courts-data.js` keeps
  `image_url: null` for every fallback row.
- **OQ2 — RESOLVED (user): remove the standalone Featured Events section.**
  Confirmed. The hero carousel keeps reading the same DB-backed event data via
  `getEvents()` / `includes/home-showcase.js` — untouched.
- **OQ3 — RESOLVED (user): no rate sheet for now.** Pricing renders "Rate TBA"
  for every sport until the owner enters rates. Hardcoding prices would violate
  D1/D2 and is not being done. The section must still look deliberate and
  finished while every row reads TBA.
- **Risk — token renaming ripple.** `--color-bg-card` etc. are used by
  `Auth.css`, `Dashboard.css`, and three dashboard controllers. Mitigated by
  keeping the old names as aliases and by verification step 9.
- **Risk — scroll-spy.** `includes/landingPage.js` builds `sectionMap` from
  `nav ul li a[href^="#"]`; the `Home` link is `href="#"` and special-cased to
  `.hero`. Changing anchors requires re-checking that branch.

## Increment 2 — Remove the CTA band; per-court combobox in the viewer

**Goal.** (a) Delete the "Ready to lock in your slot?" CTA section entirely.
(b) Give the court viewer a combobox listing every individual court/lane/table
for that sport, switching the displayed image per selection.

**Blocker found and resolved (user chose Option B, 2026-08-28).** `public.court`
is **one row per sport**, not per unit: Badminton is a single row with
`quantity: 9` and exactly **one** `image_url`. No per-unit rows or per-unit
images exist anywhere in the schema, so a naive combobox could list Court 1–9 but
could never change the picture. The one genuine exception is **Bowling**, which
already has two real rows (Duckpin 8 lanes, Ten-Pin 12 lanes) with independent
`image_url`s that `mergeCourtsBySport()` collapses into one card.

**D-B — Add `unit_images jsonb` to `public.court`** via a new owner-applied
migration, `database/schema/006_court_unit_images.sql`. Shape:
`[{"label": "Court 1", "image_url": "https://…"}, …]`. Nullable; a CHECK
constrains it to a JSON array when present. This follows the established
owner-applied migration pattern (003/004/005), needs no new table and no join,
and does not touch booking or the dashboards.

**Unit resolution order** (the viewer builds its option list from the first that
applies):
1. `unit_images` is a non-empty array → one option per entry, each with its own
   `image_url`. Fully per-court.
2. The sport has multiple merged DB rows (Bowling) → one option per row, using
   that row's own name and `image_url`. Real today, no migration needed.
3. Otherwise → derive `quantity` options from the unit noun
   (`courts → Court N`, `lanes → Lane N`, `tables → Table N`), all sharing the
   sport's single `image_url` (placeholder while NULL).

Cases 2 and 3 mean the combobox works **before** the owner runs the migration,
and each sport upgrades to real per-court images the moment `unit_images` is
populated. Where a sport resolves to exactly one option, the combobox is hidden
rather than rendered as a dead single-item control.

**Constraints for this increment.** Everything from the sections above still
applies. Additionally: the `<select>` must carry a visible label, sit inside the
existing focus trap without breaking it, and be operable by keyboard; every label
and URL from the DB goes through `escapeHtml`; images that fail to load fall back
to the `.media-slot` placeholder rather than a broken `<img>`; removing
`.cta-footer` must also remove its CSS block and every responsive reference to
it, leaving `#about` ending on Feedback & Reviews followed by the site footer.

**Success criteria.** CTA section gone from markup, CSS and responsive rules,
with no layout gap left behind in either theme. Opening any court with more than
one unit shows a labelled combobox; changing the selection swaps the image (or
placeholder) and the unit label without closing the dialog. Bowling lists Duckpin
and Ten-Pin by name. Volleyball (quantity 1) shows no combobox. Migration file
parses as valid Postgres and is idempotent (`add column if not exists`). Zero
console errors; dashboards unaffected.

### Increment 2 — execution notes (2026-08-29)

Implemented and verified. Four deviations/additions, all small:

1. **`.about-reviews` bottom padding is now asymmetric** (desktop `84px 0` →
   `84px 0 56px`, ≤768px `56px 0` → `56px 0 40px`). With the CTA band gone, the
   reviews strip runs straight into `.site-footer` — both are `--surface-band`,
   so a symmetric 84px plus the footer's own 48px read as one ~132px dead
   stripe. Measured: the reviews/footer boxes now abut exactly (gap = 0 at
   1440/1024/768/390 in both themes) with 105px (desktop) / 89px (mobile) of
   whitespace between the last testimonial card and the footer brand.
2. **The unit label is an `.eyebrow`, above the sport name, not a chip below
   the count.** Rendered under the count it sat ~70px above a `<select>`
   displaying the identical string. As an eyebrow it captions the photo it
   names, matches the page-wide eyebrow→title rhythm, and is typographically
   distinct. Measured 5.52:1 (dark) / 5.59:1 (light) — AA.
3. **`mergeCourtsBySport()` now also emits `variants` and a concatenated
   `unitImages`.** Every field the grid card and pricing row read is byte-for-
   byte unchanged — verified by diffing rendered `.court-card` innerHTML and
   computed styles against the pre-change commit in both themes.
4. **`docs/OWNER_ACTION_LIST.md` gained an A4 row** for the new migration,
   matching the A1–A3 pattern.

Two things worth knowing:

- **The combobox is `disabled` whenever it is `[hidden]`.** The focus trap
  selects `select:not([disabled])` and `querySelectorAll` ignores `[hidden]`,
  so an enabled-but-hidden `<select>` would put an unfocusable element in the
  Tab rotation and drop focus to `<body>`. Do not remove the `disabled` toggle.
- **`unit_images` is read defensively.** undefined (column absent — the live
  state today), null, a non-array, an unparseable string, and non-object array
  entries all degrade to "no per-unit images" with one `console.warn`, never an
  error. A `unit_images` URL that 404s falls back to the `.media-slot`
  placeholder and an honest "could not be loaded" status line.

**Not verified here:** pressing Escape while the native `<select>` popup is
open. Chrome renders that popup as an OS widget that headless cannot drive, so
whether the browser swallows the Escape or the dialog also closes is untested —
it is the standard behaviour of any hand-rolled modal containing a `<select>`.

## Increment 3 — Auth modal redesign

Five defects in the Log In / Sign Up modal (`Pages/Index.html`'s
`.auth-overlay`, `Style/Auth.css`, `includes/auth.js`).

**A1 — Log In and Sign Up must render at the same card size.** `.auth-modal` has
no height floor and shrink-wraps whichever `.auth-form.is-active` is showing, so
switching tabs visibly resizes the card. Prefer a *structural* fix over a magic
`min-height` number that silently breaks when a field is added: place the two
tabbed panels in a shared grid cell so the taller one sets the height for both.
Only Log In and Sign Up are in scope — Admin, Verify, Forgot and Reset are
one-off panels and must keep shrink-wrapping. Any wrapper added must preserve
every `[data-auth-panel]` hook; `includes/auth.js` queries them with
`overlay.querySelectorAll`, which is descendant-based, so a wrapper is safe.

**A2 — Sign Up asks for email and password first.** Current order is Full name →
Email → Mobile → Password. New order: **Email → Password → Full name → Mobile**,
then the Terms checkbox. Field markup, `name` attributes, validation and the
submit handler are otherwise unchanged — this is a reorder, not a rewrite, and
`includes/phoneValidation.js` / `window.validatePhMobile` must still fire.

**A3 — Terms & Conditions opens as a popup, not a new tab.** The signup
checkbox's link currently targets `terms.html` with `target="_blank"`. It becomes
an in-page dialog. **Do not duplicate the terms text** — that would create a
second source of truth for a legal document. Fetch `terms.html` and extract its
`.terms-content` container into the dialog. Cache after first fetch. If the fetch
fails, fall back to the existing new-tab behaviour rather than showing an empty
dialog. `Pages/terms.html` stays as a standalone page (it is linked elsewhere and
is the fallback target).

**A4 — Design the auth brand header.** "IñigoSync / Book your court in a few
taps." is currently unstyled text. Give it a proper lockup — the existing
`assets/Logo/WebLogo.png` mark plus wordmark, with real hierarchy — matching the
landing page's visual language. *Interpretation of an ambiguous request; flag it
for confirmation.*

**A5 — Fix the Google logo.** The four-colour "G" in `includes/auth.js:838-843`
is hand-drawn and wrong — the `#FBBC05` yellow path in particular
(`M6.41 13.93A5.98 5.98 0 0 1 6.41 8.07V5.49H3.07a10 10 0 0 0 0 16.88l3.34-2.44z`)
arcs incorrectly and overshoots. Replace all four paths with Google's official
24×24 brand geometry. Colours stay `#4285F4` / `#34A853` / `#FBBC05` / `#EA4335`;
Google's branding rules forbid recolouring or distorting the mark.

**Constraints.** All prior constraints hold. Additionally: do not change any
authentication logic, Supabase calls, OAuth flow, validation rules, or `name`
attributes; the modal keeps its focus trap, Escape/backdrop close, and scroll
lock; the terms dialog must not fight the auth modal for focus or scroll lock
when stacked on top of it; both dialogs work in light and dark mode.

**Success criteria.** Log In and Sign Up measure identical card heights, with no
resize jump on tab switch, at every breakpoint in both themes. Sign Up field
order is Email, Password, Full name, Mobile. The Terms link opens an in-page
dialog containing the real `terms.html` copy, closes back to signup with the
checkbox state intact, and never opens a tab unless the fetch failed. The Google
"G" matches the official mark. Signup still succeeds end to end, including PH
mobile validation and the OTP step.

## Increment 4 — Stepped signup, password policy, forgot-password page

Corrects Increment 3's A1 and adds three things.

**B1 — The shared card height must be Log In's, not Sign Up's.** Increment 3 made
both panels equal by letting the taller one (Sign Up, 834px) win, which left Log
In with ~160px of dead space. The user wants the opposite: the card sizes to Log
In (~711px natural at 1440) and Sign Up fits inside it.

**B2 — Sign Up becomes a stepped flow.** Never show every field at once, so the
card height cannot be driven by field count. Steps:

1. **Email** → Continue. Keeps the divider + Google button + "Already have an
   account?" line, since Google sign-up short-circuits the whole flow.
2. **Password** + live requirement checklist → Continue / Back.
3. **Full name + Mobile + Terms** → Create Account / Back.

Structural requirements: keep **one** `<form data-auth-panel="signup">` and show
or hide step containers inside it, so `FormData` still collects every field and
the existing submit handler, `name` attributes and OTP hand-off are untouched.
Apply the same grid-stack technique used for the panels to the *steps* (all in
one grid cell, inactive ones `visibility: hidden`) — otherwise the panel height
tracks the current step and the card resizes between steps, reintroducing the
bug. Net effect: card height = max(Log In, tallest step); keep every step shorter
than Log In and the card is Log In's height. Verify with an assertion, not by eye.

Per-step validation gates advancement (bad email cannot reach step 2). Reopening
the modal, or switching to Log In and back, resets to step 1.

**B3 — Password policy on creation.** 8–15 characters, ≥1 uppercase, ≥1
lowercase, ≥1 number, ≥1 special character. Rendered as a live checklist that
ticks as the user types, and enforced on submit. Applies to **both** places a
password is created — signup step 2 and the Reset Password panel — so the reset
path cannot be used to set a weaker password than signup allows.
**Critical: Log In must not enforce it.** Existing accounts have older passwords
and must keep working; this is a creation-time rule only.

**B4 — Reset-password *email template* for Supabase.** Clarified by the user: the
HTML file is the one **pasted into Supabase → Authentication → Email Templates →
Reset Password**, not a page in the site. Ships as
`docs/email_templates/reset_password.html`, owner-applied like the SQL
migrations, and logged in `docs/OWNER_ACTION_LIST.md`.

No page is added and **no auth logic changes**: the modal's `forgot` and `reset`
panels both stay exactly as they are. `includes/auth.js:878` already computes
`redirectTo` as `${origin}${pathname}`, so `{{ .ConfirmationURL }}` returns the
user to the page they requested from and the existing `reset` panel handles it.

Email HTML is a different medium from web HTML and must be written as such:
table-based layout (no flex/grid), inline styles, no JavaScript, no external
CSS, ~600px max width, web-safe font stacks (Oswald/Inter will not load — the
brand look is approximated with fallbacks), a bulletproof CTA button with an
Outlook VML fallback, a plaintext copy of the link for clients that strip
buttons, and sensible rendering on both light and dark email clients. Must use
Supabase's Go template variables — `{{ .ConfirmationURL }}` at minimum.

*Asset constraint:* email images need a publicly reachable absolute URL, and this
project runs on localhost with no hosting. Default to a **CSS/text wordmark** so
the template works with no hosting at all, with a clearly commented slot for a
hosted logo URL (e.g. a Supabase Storage public bucket) to be dropped in later.

**Constraints.** All prior constraints hold. No changes to Supabase calls,
session handling, the OAuth flow, `name` attributes, or the OTP flow beyond what
B2's step containers strictly require. The page reuses the existing shell
(theme guard, nav, footer, tokens) exactly as `Pages/terms.html` does.

**Success criteria.** Card height equals Log In's natural height at every
breakpoint in both themes, and does not change across tab switch or any signup
step. Every signup step ≤ Log In height. Password checklist ticks live and blocks
submit until satisfied, on both signup and reset; login accepts a weak legacy
password unchanged. Signup still completes end to end into the OTP step.
`forgot-password.html` sends a reset link and handles the recovery redirect, in
both themes, at every breakpoint.

### Increment 4 — execution notes (2026-08-29)

Implemented and verified by measurement (headless Chrome over CDP): 91 behavioural
assertions plus a height matrix, all green. Card height is now **715px at
1440/1024/768 and 693px at 390, identical in both themes, and identical on Log In
and on all three signup steps** — equal to the login panel's height measured in
isolation (which matches the ~711px this plan quoted as Log In's pre-increment-3
natural height). Tallest step is 303px against a 477px login-panel budget; with the
longest inline error rendered it reaches 314px, still 163px of headroom. Also holds
at 360px and 320px wide, and at 700px/640px tall (where the card's pre-existing
`max-height: calc(100vh - 48px)` clamps it — equally on both panels).

Measurement note for whoever re-checks this: measure `.auth-modal.offsetHeight`,
not `getBoundingClientRect().height`. The modal animates in with
`transform: scale(.98)` and a rect is the transformed box, so a reading taken
mid-transition comes back 2% short (817 instead of 834, 701 instead of 715).

Deviations and things worth knowing:

1. **The last success criterion is void.** No `forgot-password.html` was created —
   the user clarified mid-increment that B4 is the Supabase email template, not a
   page. The modal's `forgot` and `reset` panels are untouched except for B3's
   password rules on `reset`. Ships as `docs/email_templates/reset_password.html`
   plus item **E3** in `docs/OWNER_ACTION_LIST.md`.
2. **Added `--color-alert-text`** (dark `#ee6f66`, light `#C2281F` = unchanged).
   Same split, and same reason, as `--color-accent-text` in the notes below:
   `--color-alert` measures only **4.20:1** on the dark modal surface, so the new
   inline step errors would have failed AA. `--color-alert` itself is untouched, so
   nothing else moves. The pre-existing `.auth-otp-error` / `.auth-field-error` /
   `.auth-status.is-error` still use `--color-alert` and still sit at 4.20:1 in dark
   mode — a pre-existing AA gap, deliberately left alone as out of scope.
3. **`setBusy()` had to learn which button it owns.** Sign Up now has three
   `.auth-submit` buttons (two Continues + Create Account) and
   `form.querySelector('.auth-submit')` was picking step 1's Continue, leaving
   Create Account enabled during the network call. Now matched with
   `button[type="submit"].auth-submit`. Verified: a double click fires `signUp`
   exactly once.
4. **The signup validation gate runs BEFORE `form.checkValidity()`,** not inside the
   `mode === 'signup'` branch. Two reasons: an Enter on step 1 would otherwise reach
   `reportValidity()` with a non-rendered required field (Chrome logs "not focusable"
   and shows the visitor nothing), and on step 3 the native bubble would preempt the
   step's own inline message for an empty name or an unticked Terms box.
5. **The "make the active step visible" rule is scoped to `.auth-form.is-active`.**
   Visibility is inherited, so an unscoped `visibility: visible` on the active step
   punches straight back through the `visibility: hidden` the panel stack puts on the
   whole Sign Up panel, and renders the step on top of the Log In form. The same trap
   is why the inline error reserves a line with `min-height` instead of toggling
   `visibility`, and why the checklist tick is `color: transparent` rather than
   hidden.
6. **Step 1 gained an "Already have an account? Log in" line** — the plan says
   "keeps" it, but the panel never had one. It balances the panel against Log In's
   own switch line and costs 20px of a 170px budget.

Two consequences the user may want to weigh in on:

- **The dead space moved.** That is the point of B1 — but it means each signup step
  now ends 87–109px above the card's bottom edge (step 1 the tightest, step 2 the
  airiest, measured at 1440), where Log In ends flush. Steps are top-aligned rather
  than vertically centred so the heading, the step indicator and the first field
  never move between steps.
- **A space counts as a special character** (the rule set is the printable-ASCII
  non-alphanumerics, spaces included, per OWASP). `Abcd1efg ` is accepted. An
  accented letter does *not* count, because the set is explicit rather than
  `[^A-Za-z0-9]`.

**Not verified here:** that Supabase renders email templates with `text/template`
rather than `html/template`. `html/template` strips HTML comments, which would drop
the Outlook VML branch. The template is written to degrade correctly either way (the
`<a>` deliberately carries no `mso-hide:all`), and the file says what to look for on
the first test send — but which of the two paths actually runs needs one real email.

## Increment 5 — Auth robustness fixes (user-approved, 2026-08-29)

Two pre-existing defects surfaced during increments 3–4, plus one contrast
carry-over. None were introduced by the redesign.

**C1 — Temporal-dead-zone crash kills the entire auth modal.** `includes/auth.js`
line 285 calls `consumePendingAuthNotice()` → `setAuthNotice()` (line ~1346),
which reads `let authNoticeDismissTimer` / `let authNoticeHideTimer` declared at
lines **1322–1323**. Reading a `let` before its declaration executes throws
`ReferenceError`, which aborts the rest of the `DOMContentLoaded` setup — no
close handler, no tab switching, no submit handlers, no Google button. **The
modal is completely dead.** It triggers whenever
`sessionStorage['inigosync-auth-notice']` is set, i.e. the `authGuard.js`
idle-timeout and superseded-session paths: a user who is idle-logged-out and
returns cannot log in at all.
Fix: hoist both declarations to the top-level `let` block (lines 45–57) beside
`signupStep` / `lastFocusedEl`. Declaration-site move only — no behaviour change.
Add a regression guard so the ordering cannot silently regress.

**C2 — The auth modal has no focus trap.** Tab from the last control walks out
into the page behind the overlay. The terms dialog (increment 3) already has a
correct trap — model C2 on it and make the two cooperate rather than compete:
while terms is open it owns the trap, and the auth modal reclaims it on close.
Must handle the panel/step stacks correctly: `visibility: hidden` panels and
steps are already out of the tab order, so the trap must compute its focusable
set **live** on each Tab rather than caching it at open time.

**C3 — `--color-alert` measures 4.20:1 on the dark modal surface**, failing AA
for `.auth-otp-error`, `.auth-field-error` and `.auth-status.is-error`.
Increment 4 already added `--color-alert-text` (dark `#ee6f66`, light `#C2281F`)
for exactly this reason and used it for the new inline errors. Point the three
pre-existing error styles at it too. `--color-alert` itself stays unchanged —
it is used for non-text purposes elsewhere.

**Non-goals.** No change to signup step layout (top alignment stays), the
password policy's space-as-special-character rule, Supabase calls, or anything
outside these three defects.

**Success criteria.** With `sessionStorage['inigosync-auth-notice']` set, the
page loads, the notice renders, and the modal is fully functional — close, tabs,
submit, Google button all working. Tab and Shift+Tab cycle within the auth modal
and never reach the page behind. Terms-over-auth nesting still behaves. All three
error styles meet AA in both themes. Everything from increments 1–4 still passes.

### Increment 5 — execution notes (2026-08-29)

Implemented and verified by measurement (headless Chrome over CDP): 396 new
behavioural assertions across both themes, plus the increment 1–4 suites re-run
unchanged. Three files touched: `includes/auth.js`, `Style/Auth.css`, and this
file. No markup change — `Pages/Index.html` is untouched by this increment.

**C1 — reproduced before, gone after.** With
`sessionStorage['inigosync-auth-notice'] = 'idle'`, the pre-fix page threw
`ReferenceError: Cannot access 'authNoticeDismissTimer' before initialization`
and the modal came up with **0 Google buttons**, no password-toggle icons, a
close button that did nothing and tabs that did not switch. After hoisting both
declarations into the top-level block: no exception, the notice renders, 2
Google buttons, close/tabs/submit/step-validation/trap all live. Both notice
reasons (`idle` and `superseded`) verified.

**The regression guard is `assertEarlySetupBindings()`** — a list of
`[name, () => binding]` thunks read immediately before the first synchronous
early-setup call, each in its own `try`, logging a `console.error` that names
the binding that moved. Chosen over a comment or a wrapping `try/catch` because
it converts a *silent, path-dependent* dead modal into an error on **every**
load, which every automated run and every visitor sees. Proved by deliberately
moving the declaration back down: the guard fired on an ordinary load (no
sessionStorage key needed) while the underlying crash was still only reachable
via the idle path. It does not swallow or rethrow — detection only.

**No other TDZ-class bug exists in `auth.js`.** Checked both by hand and with a
call-graph scanner over the whole `DOMContentLoaded` scope (47 top-level
bindings, 32 top-level functions). Four statement groups reference a
later-declared binding; three of them (`line 622` terms-link click, `line 966`
`panels.forEach` submit handler, `line 1285` OTP resend click) are all inside
`addEventListener` callbacks that cannot run before setup finishes. `line 346`
`consumePendingAuthNotice()` was the only genuinely synchronous one — i.e. C1
was the whole population. Post-fix the scan is clean apart from that same
deferred submit-handler group. `authGuard.js` and `home-showcase.js` scan clean
too.

**C2 — one `trapTab()` shared by both dialogs, not two.** The terms dialog's
inline trap body was replaced by a call to it, so the two cannot drift apart;
the keydown handler routes Tab to whichever dialog is on top, which is what
makes them cooperate instead of compete. Two things that had to be right:

- **The focusable set is recomputed on every Tab.** `FOCUSABLE` matches on
  markup alone, and this modal keeps its inactive panels and steps in the DOM.
  `isRenderedFocusable()` therefore applies *two* filters, neither of which
  subsumes the other: `getClientRects().length === 0` catches `display: none`
  (the one-off panels, the hidden tab bar, the hidden panel stack), and
  `getComputedStyle().visibility === 'hidden'` catches the panel/step stacks —
  a `visibility: hidden` element still generates boxes, and computed
  `visibility` on a `display: none` element still reads `visible`. Proved live:
  switching panels, advancing/reversing steps, and simply *enabling* the OTP
  resend button all change the ring within one open modal session.
- **The trap is gated on a new `authIsOpen` flag, not `overlay[hidden]`**,
  which lags the close by the 250ms fade-out. Same shape and reason as the
  terms dialog's existing `termsIsOpen`. Asserted: a Tab inside that window is
  *not* dragged back into a closing modal.

Ring sizes measured, both themes: login 11, signup step 1 = 7, step 2 = 7,
step 3 = 9, verify 9, admin 6, forgot 4, reset 6. 26 Tabs and 26 Shift+Tabs on
each stay inside `.auth-modal`, visit exactly the set Chrome's own
`Element.checkVisibility()` reports, in DOM order, and cycle with the right
period. Control run with the trap disabled: focus escapes after 8 Tabs into the
nav links, the theme toggle and the Book Now button behind the overlay.

**C3.** Dark mode goes **4.20:1 → 6.18:1** for all three styles on the real
composited modal surface (`#191410`); light is 5.13:1 either way, since the two
tokens are the same value there. `--color-alert` is untouched, and
`.auth-status.is-error` / `.auth-field.has-error input` keep it for their
*borders* — only the copy moved.

Two things worth knowing:

1. **Some panel switches drop focus to `<body>`, and that is pre-existing.**
   "Log in as Admin" and "Forgot password?" both live *inside* the Log In panel,
   and `setActivePanel()` `display: none`s the whole panel stack, so Chrome
   blurs the button that was just clicked. `setActivePanel()` has never moved
   focus and was not changed here. The trap makes the consequence strictly
   better rather than worse: before, the next Tab walked into the page behind;
   now it is pulled back to the modal's first control. Fixing it properly means
   giving `setActivePanel()` a focus policy, which is a behaviour change this
   increment did not have licence for.
2. **`.auth-field-error` has no markup anywhere on the site.** The style is
   real but currently unused (nothing sets `.auth-field.has-error`). It was
   measured by building the exact DOM state its CSS describes, inside the live
   modal.

**Not verified here:** the same thing increment 2 flagged — Escape while a
native `<select>` popup is open, which headless cannot drive. Unchanged by this
increment. The only console output on a clean load remains Chrome's own
`/favicon.ico` 404 (this repo ships no favicon) and a verbose `[DOM]` password-
form recommendation; neither is an error and both predate increment 5.

## Increment 6 — OTP email templates (fixes "no code arrives")

**Root cause.** Staff/admin login → `handleAdminSubmit` → `gateOtpThenCompleteLogin`
(`includes/auth.js:289`) → `signInWithOtp({ email, shouldCreateUser: false })`,
verified with `verifyOtp({ type: 'email' })`. `signInWithOtp` is served by
Supabase's **Magic Link** template, whose default body contains only
`{{ .ConfirmationURL }}` — a clickable link, **no code**. The UI renders six OTP
boxes and expects a token, so the recipient gets a link and has nothing to type.
Supabase only emits a 6-digit code when the template includes **`{{ .Token }}`**.

The same applies to signup, which uses `verifyOtp({ type: 'signup' })` and
`resend({ type: 'signup' })` — Supabase's **Confirm signup** template.
Note this is not staff/admin-specific: customer login runs the identical path
(`auth.js:1201`), so both templates fix all three roles at once.

**E1 — `docs/email_templates/magic_link.html`** — login code. Covers customer,
staff and admin login.
**E2 — `docs/email_templates/confirm_signup.html`** — signup verification code.

Both mirror `reset_password.html`'s design and construction exactly: table
layout, inline styles, no JS, no external CSS, no local asset refs, ~600px,
web-safe font stacks, dark-client handling, text wordmark with the same
commented hosted-logo slot.

**Code-only, deliberately.** Neither template includes `{{ .ConfirmationURL }}`.
A clickable link would let the recipient authenticate *outside* the app's OTP
gate — `gateOtpThenCompleteLogin` exists to enforce per-device trust, and a
magic link sidesteps the code entry the flow is built around, landing the user
in a half-initialised state. Code-only also matches what the UI actually asks
for. The 6-digit `{{ .Token }}` is the visual hero of both emails: large,
monospaced, letter-spaced, selectable as text.

**No application code changes.** These are owner-applied assets, pasted into
Supabase → Authentication → Email Templates. Log both in
`docs/OWNER_ACTION_LIST.md`.

**Caveat to flag, not fix: there are two possible failure modes.** If the email
*arrives but shows a link*, these templates fix it. If **no email arrives at
all**, the cause is Supabase's built-in SMTP — it is rate-limited to a handful
of messages per hour and is not intended for production — and no template can
fix that; it needs custom SMTP (Resend/SendGrid/Gmail SMTP) configured in the
Supabase dashboard. The user must confirm which symptom they have.

**Success criteria.** Both files are valid email HTML, visually consistent with
`reset_password.html`, contain `{{ .Token }}`, contain no `{{ .ConfirmationURL }}`,
no `<script>`, no external CSS and no local asset paths, and render correctly at
600px and 375px in both light and dark clients.

### Increment 6 — execution notes (2026-08-29)

Implemented and verified. Two new files (`docs/email_templates/magic_link.html`,
`docs/email_templates/confirm_signup.html`) plus `docs/OWNER_ACTION_LIST.md`.
**No application code touched** — `git status` shows nothing under `includes/`,
`Pages/`, `Style/`, `Config/`, `api/` or `database/`, and
`git diff --exit-code docs/email_templates/reset_password.html` is clean.

Verified by measurement (headless Chrome over CDP, same harness as increment 4):
**179 assertions green**, covering both templates × {600px, 375px} × {light,
dark}, plus a separate 9-check pixel pass on the code's optical centring and a
tag-balance check that also re-parses `reset_password.html` for comparison.

**Supabase variables were checked against the live docs, not assumed.** Fetched
`/docs/guides/auth/auth-email-templates`, `/auth/auth-email-passwordless`,
`/auth/auth-smtp` and `/auth/rate-limits`. Both files use exactly `.Token`,
`.Email`, `.SiteURL` — the full documented set is `.ConfirmationURL .Token
.TokenHash .SiteURL .RedirectTo .Data .Email`, and `.NewEmail / .OldEmail /
.Phone / .OldPhone / .Provider / .FactorType` are documented as valid **only**
in the change-notification templates, so they are excluded. The docs also
confirm the mechanism outright: *"Email OTPs share an implementation with Magic
Links. To send an OTP instead of a Magic Link, alter the Magic Link email
template… include the `{{ .Token }}` variable"*, and list that same swap as
their own mitigation for link-prefetching scanners.

Deviations and things worth knowing:

1. **The root-cause paragraph above names functions that do not exist.**
   There is no `handleAdminSubmit` and no `handleLoginSubmit`. Both log-ins run
   through one shared `panels.forEach` submit handler: the `mode === 'login'`
   branch (`auth.js:1201`) and the `mode === 'admin'` branch (`auth.js:1322`),
   each calling `gateOtpThenCompleteLogin()` (`auth.js:289`). The diagnosis is
   otherwise exactly right; the templates' header comments cite the real sites.
2. **No VML, and `xmlns:v` dropped from `<html>`.** `reset_password.html` needs
   both for its bulletproof CTA; these two have no button, so the namespace
   would be dead weight. `xmlns:o` stays — the mso `PixelsPerInch` block uses it.
   Consequence: **nothing load-bearing lives in a comment here**, and no
   template action appears inside any comment either, so both files render
   identically whether Supabase uses `text/template` or `html/template`. That
   was increment 4's one open question; it does not apply to these files, and it
   is asserted rather than assumed.
   *(Updated in increment 7: `reset_password.html` was rewritten code-based and
   lost its VML CTA too, so this now holds for **all three** templates and
   increment 4's open question is closed outright.)*
3. **`OWNER_ACTION_LIST` item E2 was rewritten, not duplicated.** It already
   covered the Magic Link fix with an inline snippet, and its closing line —
   "Keeping `{{ .ConfirmationURL }}` as well is fine" — directly contradicted
   the code-only decision. E2 now points at the file; Confirm signup is new as
   **E4**; both are in the quick-reference table. Item numbering is unchanged,
   so `reset_password.html`'s comment citing "item E2" still resolves.
4. **The code is centred with `text-indent` equal to `letter-spacing`.** Chrome
   adds a letter-space after the *last* digit too, so a centred run sits half a
   space left of true centre. Whoever re-measures this: a Range's
   `getBoundingClientRect()` includes that trailing space, so the naive reading
   is off by +L/2 by construction. Measured on the rendered pixels instead — ink gaps are
   150/152px at 600px and 57/58px at 375px (≤1px skew); with the compensation
   removed as a control the ink slides 6px left, so it is doing real work.

**The caveat in this section is not hypothetical and stays open — and there is
in-repo evidence the SMTP mode is already in play.** Supabase's built-in mailer
is capped at **2 messages per hour, project-wide**, and their docs call it "not
meant for production use". `includes/auth.js:1100` already handles
`over_email_send_rate_limit` specially, added in `288caf0` (2026-08-22) with the
comment *"the ones that came up while diagnosing the OTP email issue —
Supabase's built-in mailer caps out fast during repeated signups… ('429: email
rate limit exceeded')"*. So this project has hit the cap before. That does not
rule out the template defect — both can be true at once, and the template
defect is certain from the default body — but it means **pasting these two
templates in may not be sufficient on its own**; custom SMTP (item D → Resend)
may also be needed. E2 now documents both symptoms side by side, including that
signal, and asks the user which one they have.

**Also spotted, not fixed (out of scope, pre-existing):** the Verify panel
re-enables **Resend code** after 30s (`startResendCountdown(30)`), but Supabase
only accepts a new OTP request for the same address after **60s** by default, so
an immediate resend returns a rate-limit error. Noted in E2's testing steps
rather than changed, since this increment has no licence to touch `auth.js`.

**Not verified here:** rendering in a real inbox. Everything above is Chrome's
engine, which is a good proxy for Apple Mail and modern webmail and no proxy at
all for Outlook's Word engine — the construction is copied from the template
increment 4 already shipped, but neither has been through a real test send.
Likewise unverified: which of the two failure modes the user actually has.

## Increment 7 — Password recovery by code + loading states

**F1 — Recovery has no code-entry step.** `includes/auth.js:1326` (`mode ===
'forgot'`) calls `resetPasswordForEmail`, shows a notice, calls `form.reset()`
and returns. The flow then depends entirely on the user clicking a link in the
email, which lands back on the page with `#type=recovery`. But the email now
carries a **code**, and there is nowhere in the UI to type it — so recovery is a
dead end. The rest of the app (signup, login, staff/admin) is code-based; this is
the one path that isn't.

Fix: after `resetPasswordForEmail` succeeds, route to the existing Verify panel
with a new `otpPurpose = 'recovery'`, verify with
`verifyOtp({ email, token, type: 'recovery' })` — which establishes the session
Supabase requires — then show the existing `reset` panel to set the new password.
Reuse the existing OTP panel, boxes, countdown and resend; do not build a second
one. Resend under `recovery` must re-call `resetPasswordForEmail`, not
`resend({ type: 'signup' })`.

`docs/email_templates/reset_password.html` changes from link-based to
**code-based** (`{{ .Token }}`, no `{{ .ConfirmationURL }}`) to match, making all
three templates consistent.

**Keep the `#type=recovery` link path working.** `isRecoveryRedirect` /
`enterRecoveryMode()` must stay so reset emails already in flight, and any future
link-bearing template, still function. Two entry points, one `reset` panel.

**Preserve the anti-enumeration property.** The current handler is deliberately
vague about whether an email is registered, and `resetPasswordForEmail` does not
error on unknown addresses. Routing to the Verify panel must happen
*unconditionally*, so the UI still reveals nothing; an unregistered address
simply fails at code verification.

**F2 — No loading phase on send.** Login and signup call
`window.InigoLoading.show(...)` before their network call; `forgot` does not, so
the user clicks Send and gets nothing until the notice appears. Add the loading
overlay to `forgot`, and audit `reset`, the recovery `verifyOtp`, and the resend
paths for the same omission — match the existing wording and the existing
show/hide discipline, including hiding on the error path.

**Constraints.** All prior constraints hold. Changes confined to
`includes/auth.js`, `Pages/Index.html` (only if the Verify panel needs
recovery-specific copy), `Style/Auth.css` (only if needed), and the one email
template. No changes to Supabase config, the OAuth flow, the password policy, or
the landing page. The focus trap, panel stack, card-height parity and step flow
from increments 3–5 must all survive.

**Success criteria.** Forgot → Send shows a loading state, then the Verify panel
with six boxes. Entering the emailed code advances to Set-a-new-password, which
enforces the increment-4 policy, and the new password works on next login. Resend
works under recovery. A wrong or expired code errors clearly without leaving the
flow. The `#type=recovery` link path still reaches the same reset panel. Unknown
emails reveal nothing new. Zero console errors in both themes.

## Increment 8 — Merge signup steps 1 and 2 (email + password together)

**Change requested by the user.** Increment 4 (B2) deliberately split signup
into Email-alone → Password-alone → Name/Mobile/Terms, to keep every step
shorter than Log In. The user now wants **Email and Password shown together on
the first screen**, with name/mobile/terms still revealed only after — i.e.
signup becomes a **2-step** flow: **Step 1 (Email + Password)** → **Step 2
(Full name + Mobile + Terms)**.

**This is a markup + validation change, not a rebuild.** The step machinery
built in increment 4 is already generic — `signupStepEls =
querySelectorAll('[data-signup-step]')`, and every function
(`setSignupStep`, `validateSignupStep`, the step-dot renderer, the "Step N of
{{signupStepEls.length}}" indicator) derives the step count from the DOM rather
than a hardcoded `3`. Merging is done by combining the two step containers in
`Pages/Index.html` into one `[data-signup-step="1"]` holding both the email
field and the password field + live checklist, renumbering the former step 3 to
step 2, and updating `validateSignupStep` to check both fields' gates
(email format **and** the increment-4 password policy) before advancing out of
the merged step. Reduce the step dots from 3 to 2 to match.

**Card-height consequence — re-verify, don't assume.** The merged step is taller
than either of its two source steps (email + password fields + a 5-line
checklist in one screen). This may now be the tallest content in the modal,
which would flip increment 4's B1 outcome (card sizes to Log In) back the other
way. If the merged step exceeds Log In's natural height, Log In's card grows to
match it — restoring the *original* problem B1 fixed, just with the taller
panel reversed. Measure first; if it's a real risk, flag it before or instead of
silently accepting a larger modal.

**Everything else about the stepped flow is unchanged:** one `<form>`, `FormData`
untouched, Google button and "Already have an account?" stay on step 1 (now
carrying both fields), Back/Continue navigation, reset-to-step-1 on reopen or
tab switch, the live password checklist, and the focus trap's live focusable
recomputation (now over a step with two inputs instead of one).

**Constraints.** All increment 1–7 constraints hold. No Supabase logic changes.
No change to the password policy rules themselves, the terms dialog, the Google
SVG, the brand lockup, or the recovery/loading work from increment 7.

**Success criteria.** Signup shows Email + Password together on the first
screen; Continue is blocked until both are valid; the second screen has Full
name, Mobile, Terms, Create Account. Step indicator reads "Step 1 of 2" / "Step
2 of 2" with two dots. Card height is measured (not assumed) at all four
widths in both themes and the result — whether it still equals Log In's height
or now sizes to the merged step — is reported explicitly. Focus trap, reopen
reset, Back navigation, and the OTP hand-off all still work.

### Increment 8 — execution notes (2026-08-30)

Implemented and verified by measurement (headless Chrome over CDP). Three files
touched: `Pages/Index.html`, `includes/auth.js`, `Style/Auth.css`.

**B1 IS BROKEN, DELIBERATELY, AND THE CARD GREW BY 135px.** This section quoted
it as a risk to re-verify; it is not a risk, it is the outcome. Measured with
`.auth-modal.offsetHeight` at a 900px-tall viewport, identical in both themes:

| | before (3 steps) | after (merged) |
|---|---|---|
| card @ 1440 / 1024 / 768 | 715 | **850** |
| card @ 390 | 693 | **828** |
| Log In panel, on its own | 477 | 477 (unchanged) |
| Sign Up panel, on its own | 383 | **612** |
| tallest step | 303 (step 1) | **531 (merged step 1)** |
| step 2 (name/mobile/terms) | 297 | 298 |

The merged step is 531px against Log In's 477px, so the shared grid row now
resolves to **Sign Up**, exactly reversing increment 4's arrangement. Log In sits
under **136px** of dead space again (measured: 167.8px from the panel's bottom
edge to the card's, minus the card's own 32px bottom padding), and step 2 under
~250px. Nothing was tightened to hide this: the checklist keeps its own
line-height and gap. For the record, the mitigations that were measured and
**not** applied — a tighter checklist (gap 5→2px, line-height 1.35→1.15) buys
18px, and a two-column checklist buys 28px. Neither closes a 135px gap; only
dropping a field or the checklist would, and that is not the Coder's call.

Consequences worth weighing:

- **The modal starts scrolling internally at a much taller viewport.** It has
  always been clamped by `max-height: calc(100vh - 48px)`; the threshold moves
  from "shorter than 763px" to "shorter than 898px", which includes a lot of
  ordinary laptops. It degrades the same way it always did — `overflow-y: auto`,
  no clipping, verified at 700px and 640px tall.
- **The card no longer changes between panels or steps** (asserted at
  1440/1024/768/390/360/320 in both themes), so the resize-on-tab-switch defect
  increment 3 fixed has *not* come back. Only the height it settles at moved.

Deviations and things worth knowing:

1. **Step 1 has TWO inline error lines, not one** — `data-signup-error="1"` plus
   a new `data-signup-error-for="email"` / `="password"`. One shared line at the
   bottom of the step would have put "Enter a valid email address." ~200px below
   the email box. `setSignupStepError(step, message, field)` gained a third
   argument that picks the field's own line, falling back to the step's first
   line for any control without one — which is how step 2's single shared line
   keeps working unchanged for fullname/mobile/terms. Cost: 27px of the 135px.
2. **`validateSignupStep()` returns an array of issues instead of one object.**
   Step 1 reports email and password independently so both messages land at
   once; step 2 still returns at the first failure, because its three controls
   share one line and a second message would only overwrite the first.
3. **Bug found and fixed while wiring this: focus must move BEFORE the messages
   are written.** `focus()` blurs the previously focused control, and an
   `<input>` whose value changed while focused fires `change` on the way out —
   which the per-field clear handler answers by blanking a line. Written the
   natural way round (write, then focus), pressing Create Account with a
   filled-in mobile and an unticked Terms box set the message and instantly
   erased it. The old code was accidentally immune because it focused first.
4. **`.auth-step-error`'s `min-height` went 1.05rem → 1.06rem.** The reserved
   line was 16.80px while its own line box is 16.85px, so filling it in made the
   step ~0.05px taller. Invisible until now; with the signup step setting the
   card height, the two rounded-up lines on step 1 tipped `offsetHeight` from 849
   to 850 the moment any message appeared. The card is now constant at 850
   whatever the error state.
5. **One residual resize, at ≤400px wide only.** "Your password does not meet
   every requirement yet." is 312.6px of text against a 306px line at a 400px
   viewport, so it wraps to two lines and the card goes 828 → 845 (390px) /
   827 → 844 (360px). This wrap is pre-existing — it did the same to step 2
   before — it is only *visible* now because the signup step drives the card.
   Left alone on purpose: shortening it to "Password doesn't meet every
   requirement yet." (275px) would fit down to 360px, but that is user-facing
   copy and a product decision, not a fix to make silently.
6. **`signupForm` was added to `assertEarlySetupBindings()`.** `resetSignupFlow`
   → `clearSignupStepErrors` reads it directly now; it was already reached
   indirectly before the merge and was simply missing from the list.

Verification: 72 behavioural assertions × 2 themes on the merged flow (real
typing over CDP, `sb.auth.signUp` stubbed *and* `*supabase.co/auth/*` blocked, so
no account is created), plus the increment 4–7 suites re-run — password-policy
truth table 24/24, double-submit guard 6/6, focus trap 77/77 × 2 themes, live
ring recomputation 27/27, terms-over-auth nesting 25/25, increment 1–5 behaviour
38/38, recovery-by-code 69/69, recovery edge cases 35/35, landing + dashboards
17/17, reduced-motion + short-viewport 8/8, contrast (both themes) all AA. Focus
ring on step 1 grew 7 → 9 (email, password, the eye toggle) and the checklist is
correctly **not** in it. `FormData` and the `signUp` payload are byte-identical.

**Pre-existing, confirmed not caused by this increment:** one timing assertion in
the increment-7 loading suite ("stayed up for the whole call") fails
intermittently on a different case each run — it fails identically on the
unmodified code (checked by stashing the change), and it samples a polling loop
rather than the overlay's behaviour, which passes. Also unchanged: the light-mode
step dot measures 2.66:1, which is fine for an `aria-hidden` decoration that
duplicates the "Step N of 2" text beside it.

**Not updated (out of scope):** `docs/email_templates/confirm_signup.html` has a
comment mentioning "signup step 3". Email templates are do-not-touch this
increment; the comment is stale but carries no behaviour.

## Increment 9 — Two-column password checklist (partial height mitigation)

**Context.** Increment 8 merged signup steps 1–2 (email + password together),
which made that step taller than Log In (531px vs 477px) and grew the shared
card by 135px, leaving Log In with a visible dead-space stripe at the bottom.
The user was offered three options and **chose option 3**: lay the 5-rule
password checklist out in two columns instead of one, which increment 8's own
measurement showed recovers **~28px** of the 135px gap. This is an explicitly
partial mitigation, not a full fix — the user was told the number before
choosing it.

**Scope.** CSS-only. `.auth-password-rules` (or equivalent selector in
`Style/Auth.css`) changes from a single-column list to a two-column layout —
`display: grid; grid-template-columns: 1fr 1fr` (or `flex` + `flex-wrap`) — for
the 5 checklist items. Reasonable split: e.g. 3 items in column 1, 2 in column
2, or whatever grouping reads cleanly; the exact pairing is an implementation
call, not a product one.

**Constraints.** No JS changes — `syncPasswordRules()` and the pass/fail
tick-toggle logic already just toggle a class per `<li>`/rule element; the
columns are pure layout. No change to the rules themselves, their order of
evaluation, or their text. Preserve the live-updating tick behavior exactly.
Keep it legible at 390px — two columns must not force wrapping that looks worse
than the one-column version did; fall back to single-column below whatever
width stops working cleanly (this modal already has a 480px breakpoint from
increment 3, and a narrower one from increment 3/4 — reuse the existing
breakpoints rather than inventing a new one). WCAG AA unaffected (no color
changes). Guard any new transition, if one is added, with
`prefers-reduced-motion`.

**Success criteria.** Password checklist renders in two columns at ≥ the chosen
breakpoint, single-column below it if needed for legibility. Card height at
1440/1024/768 in both themes drops by approximately the ~28px increment 8
measured (report the actual number — the estimate was from one trial, not
guaranteed exact). Live pass/fail ticking still works per rule. No regression to
the increment 8 flow (advancing past step 1 still requires all 5 rules).

### Increment 9 — execution notes (2026-08-30)

Implemented and verified by measurement (headless Chrome over CDP). **One file
touched: `Style/Auth.css`** — `.auth-password-rules` gains a two-column track
template and a column gap, and one new rule spans the last odd item. No JS, no
markup, no colour, no new transition, no new breakpoint.

**The card dropped 43px, not the ~28px increment 8 estimated**, because that
trial let the special-character rule wrap; this one gives it a row of its own.
`.auth-modal.offsetHeight` on signup step 1, identical in both themes:

| viewport | before | after | delta |
|---|---|---|---|
| 1440 / 1024 / 768 | 850 | **807** | **-43** |
| 480 / 420 / 390 / 375 | 828 | **786** | **-42** |
| 360 | 827 | **785** | -42 |
| 361 | 828 | 828 | 0 — one column here (see below) |
| 320 | 837 | 837 | 0 — one column here |

The checklist itself goes 101px → 59px (5 rows → 3). Log In's own natural card
height is unchanged at 715px, so **the dead space under Log In goes 135px →
92px**: the card is still sized by signup step 1 (489px against Log In's
477px), which is what the user accepted when choosing this option. The card
still does not resize between panels or between steps at any width.

**Layout: 2 × 2 plus a full-width fifth row**, in DOM order, reading left to
right — `8–15 characters | 1 uppercase letter`, `1 lowercase letter | 1
number`, then `1 special character (! ? @ # …)` spanning both tracks. The
special rule is 177px of text against a 166px track at 1440, so left in a
column it wraps to two lines and gives back 16 of the 42px — that is exactly
the ~28px increment 8 measured, and why this increment measures more.

**No media query.** `repeat(auto-fit, minmax(132px, 1fr))` decides from the
list's own width, which is the right input: the modal caps at 420px and sheds
side padding at 480px and again at 360px, so one viewport width does not map to
one list width (346px at 1440/1024/768, 374 at 480, 296 at 390, 281 at 375, 267
at 361, back up to 278 at 360, 238 at 320). 132px is the narrowest track that
cannot wrap — the longest short rule, "1 uppercase letter", is 104.97px in Inter
(98.98 in the 'Segoe UI' fallback) plus a 15px marker and its 8px gap = 127.97px
— so wherever two columns render they are wrap-proof by construction rather than
by measurement. Swept a viewport pixel at a time from 376 down to 320: zero
wrapped labels anywhere, two columns from 1440 down to 372 and again at exactly
360, a clean single column at 361–371 and at ≤359. Three columns are
unreachable: a third track needs 3×132 + 2×14 = 424px of list against a 374px
maximum.

Two things worth knowing:

1. **The fallback is not monotone in viewport width, on purpose.** Two columns
   at 372+ and at exactly 360, one column at 361–371 and at ≤359. The 360px
   media query that already existed drops the modal's padding from 22px to
   16px, which *widens* the list by 11px right where the viewport narrows.
   Every real device width lands on the sensible side (320 → one column,
   360/375/390/393/412/430 → two); the inverted band is 361–371px wide, where
   no device sits. Forcing one column at ≤360 with the existing breakpoint was
   considered and dropped: it would cost 42px on the phones with the least
   vertical room to spare, to fix a band nothing renders in. 360px is a knife
   edge — its list is 278px, the two-track threshold to the pixel — so if a
   later change moves the modal's padding it will fall back to one column
   there, which is the safe direction.
2. **`grid-column: 1 / -1` does work under `auto-fit`.** Per spec a track is
   only collapsed when nothing is placed in *or spanning across* it, and the
   spanning row keeps track 2 alive; asserted live (the special row measures the
   full list width at every two-column size) rather than assumed.

Verification: 116 new assertions × 2 themes on the checklist (layout geometry at
9 widths, a 9-case tick truth table where each rule is independently the only
failure, keystroke-by-keystroke ticking including backspace, the sr-only "met" /
"not met" mirror, and the tick glyph and green fill read *after* the 0.2s marker
transition lands), plus 17 on reduced motion and stylesheet parsing. Regression:
increment 8 flow 72/72 × 2 themes, password policy 24/24, card-height matrix
0 failures, focus trap 77/77 × 2 themes, increment 1–5 behaviour 38/38 × 2,
recovery-by-code 69/69 × 2, recovery edge cases 35/35, terms nesting 25/25, live
focus ring 27/27, double-submit 6/6, narrow viewports at 360/320 clean. Contrast
re-measured rather than assumed: rule label 5.69:1 unmet / 10.32:1 met in dark,
4.55:1 / 5.41:1 in light — byte-identical to increment 8, since no colour moved.
Zero console errors in both themes.

**Also covered:** the Reset Password panel uses the same class, so its checklist
is two columns too and shortens by the same 42px. It is a one-off shrink-wrapping
panel, so nothing else moves. **Unchanged and still true:** the ≤400px wrap of
"Your password does not meet every requirement yet." still adds 16px when that
message is showing (786 → 802 at 390), exactly as increment 8 recorded it.

## Increment 10 — Card compaction, textbox colour parity, drop redundant line

User goal (set via `/goal`, session-enforced): Log In and Sign Up render the
same card size **with no internal scroll**, textbox colours match between the
two panels, the "Already have an account?" line is removed from Sign Up, and
element sizing/spacing inside the modal is tightened generally.

**G1 — Remove "Already have an account? Log in" from signup step 1**
(`Pages/Index.html:530`). Redundant: the Log In / Sign Up pill above already
switches panels. Delete the `<p class="auth-switch">…</p>` and its comment.
Login's mirror ("Are you a staff member or the owner? Log in as Admin") is
**not** in scope — that link has no equivalent control elsewhere and stays.

**G2 — Textbox colour mismatch, login vs signup.** `.auth-field input`
(`Style/Auth.css:559`) is a single shared rule using `--color-bg-card` — there
is no panel-specific override in the CSS, so the two *should* already render
identically. The far more likely real cause: **no `-webkit-autofill` override
exists anywhere in `Auth.css`.** Browsers repaint autofilled inputs with their
own background (Chrome's pale yellow/blue), and login's email/password are the
fields a browser is most likely to have saved and autofilled, while a fresh
signup's typically aren't — producing exactly the symptom described ("login
looks different, signup looks right"). Add the standard fix: a huge-delay
`transition` + `-webkit-text-fill-color` + inset `box-shadow` trick on
`input:-webkit-autofill` (and the `:hover`/`:focus`/`:active` variants Chrome
requires) forcing the autofill background back to `--color-bg-card` in both
themes. **Verify this diagnosis before committing to it** — force the
`:-webkit-autofill` state via CDP/devtools and confirm the mismatch reproduces
and the fix resolves it. If reproduction fails, re-inspect for a real
code-level difference instead of shipping a fix for the wrong cause.

**G3 — Fix sizing of elements inside.** General compaction pass, in service of
G4: modal outer padding (`Style/Auth.css:44`, `40px 36px 32px`), field gaps,
label-to-input spacing, and button heights have not been revisited since
increment 4 first built the stepped layout. Tighten what can be tightened
without harming legibility or tap targets (44px+ touch targets stay).

**G4 — Same card size, no scroll.** Consequence of G1 + G3: removing the
switch-line and compacting spacing both reduce signup step 1's height, which is
what currently drives the shared card's size
(increment 9 left it at ~807px desktop / ~786px at 480px-and-narrower, with the
modal's `max-height: calc(100vh - 48px); overflow-y: auto` kicking in on
short viewports). Push the height down as far as reasonably possible **without
removing or hiding any field, password rule, or required control** — this is a
layout compaction, not a content cut. **Report the actual resulting height and
the viewport height at which internal scrolling starts**, in both themes;
"zero scroll at every conceivable screen size" is not a claim to assert without
a number behind it. Login and signup must land on the **same** measured height
(the shared `.auth-panel-stack` / `.auth-step-stack` grid already guarantees
this structurally — confirm it still holds after the edits, don't re-derive it).

**Constraints.** No Supabase/logic changes. No change to password policy rules,
signup field order, the two-column checklist's grouping, the terms dialog, the
Google SVG, the brand lockup, the focus trap, or increment 7/8/9's behavior.
WCAG AA held on anything whose size or color changes. Guard new transitions
with `prefers-reduced-motion`.

**Success criteria.** "Already have an account?" gone from signup, login's
"Log in as Admin" line untouched. Autofilled and non-autofilled inputs render
identically in both panels and both themes (verified, not assumed). Card
height measured and reported at 1440/1024/768/390, both themes — equal between
login and signup, and lower than increment 9's baseline. The no-scroll
viewport-height threshold is measured and reported. No field, rule, or control
removed to hit the number.

### Increment 10 — execution notes (2026-08-30)

G1–G3's code was written and committed to the working tree in an earlier
session that was cut off mid-verification (last completed step: confirming a
361–377px viewport band was byte-identical before/after; the sentence
mid-measuring exact panel heights was never finished). This pass picked up
from there: confirmed the existing diff against a fresh read rather than
trusting the carried-over summary, then did everything G4 asks for plus a
full increment 1–9 regression re-run. **Two files touched, both already
diffed before this session began: `Pages/Index.html`, `Style/Auth.css`.**
`includes/auth.js` has zero diff — confirmed with `git diff --exit-code
includes/auth.js`. This session added no new code, only corrected three
stale comments (below) and this write-up.

**G1 — confirmed in the rendered DOM, not just the diff.** At every
theme/width combination measured (20 total), `signup.textContent` never
contains "Already have an account" and `login.textContent` always contains
"Log in as Admin".

**G2 — autofill parity, verified live for BOTH panels in BOTH themes,** not
just the one case the interrupted session had reached. Method: CDP
`CSS.forcePseudoState` → `["autofill"]` on the real input node (this actually
triggers Chrome's UA autofill repaint, not just CSS selector matching — Chrome
added this specifically for testing `:-webkit-autofill`/`:autofill`), then a
**pixel sample of the rendered screenshot** at each field (not
`getComputedStyle().backgroundColor`, which never changes — the fix works by
painting an inset `box-shadow` over the UA background, so the property itself
is static; only the composited pixel proves it). Sampled off-center (68% width,
vertical middle, 3×3-averaged) to dodge placeholder-text antialiasing.

| theme | panel | field | resting (baseline) | forced `:-webkit-autofill` | match |
|---|---|---|---|---|---|
| dark | login | email | rgb(36,29,22) | rgb(36,29,22) | yes |
| dark | login | password | rgb(36,29,22) | rgb(36,29,22) | yes |
| dark | signup | email | rgb(36,29,22) | rgb(36,29,22) | yes |
| dark | signup | password | rgb(36,29,22) | rgb(36,29,22) | yes |
| light | login | email | rgb(255,255,255) | rgb(255,255,255) | yes |
| light | login | password | rgb(255,255,255) | rgb(255,255,255) | yes |
| light | signup | email | rgb(255,255,255) | rgb(255,255,255) | yes |
| light | signup | password | rgb(255,255,255) | rgb(255,255,255) | yes |

8/8 byte-identical. Un-forcing each field afterward (`forcedPseudoClasses: []`)
also returned it to the same resting colour, confirming the harness itself
isn't leaving a field artificially stuck. **A real headless-Chrome trap along
the way, worth recording:** `Page.captureScreenshot` can return a stale
compositor frame the *first* time it's called right after a big paint change
(the modal opening) — one capture showed the hero photo bleeding through an
otherwise-opaque, `getComputedStyle`-confirmed-opaque modal; an immediate
second capture, no extra wait, was correct. Every screenshot in this session
is now taken twice, first discarded. Anyone scripting Chrome screenshots
against this modal should do the same or risk exactly this false positive.

Also verified live: under emulated `prefers-reduced-motion: reduce`, the
autofilled input's computed `transition` is exactly `background-color 5000s
ease-in-out` (the `border-color 0.2s` fade is dropped, the 5000s suppression
is not), and `box-shadow`/`-webkit-text-fill-color` still resolve to the
correct theme colours — confirming the reduced-motion exemption the plan
required actually holds at runtime, not just in the stylesheet source.

**G3 — compaction confirmed structurally sound.** One near-miss worth
recording exactly rather than glossing over: `.auth-tab` (Log In / Sign Up
pill) measures **43.61–44.00px across 24 samples** (both themes, both tested
widths, all 3 panel-reach states it renders in — login, signup step 1,
signup step 2; the tab bar stays visible through both signup steps, not just
step 1), not a flat 44px as its own code comment's arithmetic implies
("13 + 13 + an 18px line box = a 44px control"). Root cause, measured rather
than guessed: `.auth-tab` has no explicit `line-height`, so it resolves to
the UA default `line-height: normal`, which for Inter at 14.72px does not
land on a clean 18px line box — `getComputedStyle` reports `lineHeight:
"normal"` on the live element. This predates increment 10 (only the padding
changed, 10px→13px vertical; the missing `line-height` was already absent
before), the shortfall is sub-pixel (≤0.39px) at worst, and it clears the
real WCAG 2.5.8 AA target-size minimum (24px) by a wide margin. Left
uncorrected: fixing it would mean picking a new padding or an explicit
`line-height`, which would shift every number in the G4 table below and
require re-measuring the entire matrix for a change smaller than a device
pixel on most real screens. Every OTHER sub-44px control in the modal is
pre-existing and untouched by this increment's diff — confirmed with
`git diff Style/Auth.css | grep -i
"otp\|auth-link\|auth-close\|auth-toggle-visibility"`, which matches nothing
but a comment: `.auth-close` 33.54–34px (28 samples, every panel),
`.auth-toggle-visibility` 29.6–29.83px (20, every panel with a password
field), the native "remember me"/"terms" checkboxes 12.89–13px (8, their own
wrapping `<label>` is the real tap target), the plain-text `.auth-link`
buttons like "Forgot password?" 15.86–18.89px (24, sized to a line of text,
never padded to begin with), and `.auth-otp-box` — 48.91px at the 1440px
sample but 43.75px (dark) / 43.95px (light) at the 390px one (untested at
exactly 480; both samples are `aspect-ratio: 1` boxes sized off the modal's
own width, so the phone-width one was already narrower than 44px before this
increment touched anything). `.auth-field input`, `.auth-submit`,
`.auth-back` and `.auth-google-button` — the controls the plan's own padding
comments target — all measured comfortably ≥44px everywhere, all 28 panel
visits.

**G4 — card height, measured at 10 widths × 2 themes, login vs signup step 1
vs signup step 2, via `.auth-modal.offsetHeight` after the open/switch
transition fully settles (500ms; two `requestAnimationFrame`s alone is not
enough for a screenshot but is enough for a layout read):**

| width | dark = light | vs increment 9 baseline |
|---|---|---|
| 1440 / 1024 / 768 | **636px** | 807px → **-171** |
| 480 / 420 / 390 / 375 | **628px** | 786px → **-158** |
| 361 | 668px | 828px → -160 (still the inverted one-column band increment 9 documented) |
| 360 | 633px | 785px → -152 |
| 320 | 685px | 837px → -152 |

Login, Sign Up step 1, and Sign Up step 2 are equal at **every** cell above
(login = signup step 1: 20/20; signup step 2 also matches both at the four
required widths: 8/8) — the shared `.auth-panel-stack` / `.auth-step-stack` grid
technique still holds, confirmed by measurement rather than re-derived from
the CSS. Panel-only breakdown (constant across width, since neither panel's
own content reflows — only the modal's outer chrome does): Log In 411px,
Sign Up 454px (heading + step indicator + tallest step, 392px). Sign Up is
still the taller panel, same as increments 8–9 left it, just smaller; Log
In's dead space is now ~43px, down from increment 8's ~135px. All four
required widths (1440/1024/768/390) beat increment 9's baseline as the plan
requires. Zero fields, rules or controls were removed to get there (checked
live: signup step 1 always has exactly 2 inputs and 5 `.auth-password-rule`
items, at every one of the 20 theme/width combinations; step 2 always has
exactly 3 inputs including the Terms checkbox, at each of the 8
theme/width combinations it was reached in).

**No-scroll viewport-height threshold** — shrunk the viewport height and
binary-searched for the exact pixel where `.auth-modal.scrollHeight` first
exceeds `.clientHeight` (`max-height: calc(100vh - 48px)` is exact, so this
is just natural-card-height + 48, confirmed rather than assumed):

| width band | card height | scrolls at ≤ | clean at ≥ |
|---|---|---|---|
| 1440 (= 1024, 768) | 636px | 683px | **684px** |
| 390 (= 480, 420, 375) | 628px | 675px | **676px** |
| 320 (worst case tested) | 685px | 732px | **733px** |

Identical across dark/light and login/signup at every width tested (12/12
binary searches agree). **733px is the highest threshold found** — below
that viewport height, at 320px-wide screens, the card scrolls internally
exactly as the pre-existing `overflow-y: auto` always allowed; no clipping,
no lost content.

**Stale-comment finding, separate from G4 verification proper.** The
orchestrator's specific concern — whether increment 10's padding changes
touched `.auth-modal`'s *side* padding, which the `.auth-password-rules`
comment's list-width measurements (346px at 1440/1024/768, etc.) depend on —
checked out clean: side padding is `36px` (desktop), `22px` (≤480px), `16px`
(≤360px) at every breakpoint, byte-identical before and after this
increment's diff (only vertical padding numbers changed). That comment did
**not** need correcting. Two other, unrelated comments **did**: the "Log In /
Sign Up share one card height" block in `Style/Auth.css` and the "Sign Up —
stepped flow" block beneath it were both still asserting increment 8's
numbers (531px / 477px / 850px / 828px) as current fact — stale since
increment 9 shipped (807/786), and doubly stale after this increment. A third,
matching copy lived in `Pages/Index.html`'s "HEIGHT NOTE (increment 8)"
comment on the signup form. All three now cite the measured numbers above and
the current panel-vs-panel comparison (Sign Up 454px vs Log In 411px), with
the increment-by-increment history kept rather than deleted, matching this
file's own convention of narrating *why* a number moved, not just what it is
now.

**Regression, re-run rather than assumed given zero diff on `auth.js`:**

- **Focus trap, all 7 panel states × 2 themes (14/14 pass).** Real Tab and
  Shift+Tab key events over CDP (`Input.dispatchKeyEvent`, not synthetic JS
  `KeyboardEvent`s — Tab's default focus-move only fires from genuine input
  events), cycled two full loops forward and back from a known start,
  compared against the exact `FOCUSABLE` selector + `isRenderedFocusable()`
  filter copied verbatim from `includes/auth.js`. Ring sizes: login 11,
  signup step 1 = 8 (down from the 9 increment 8 measured after merging email
  + password onto one step — see that increment's own notes — and unchanged
  through increment 9's CSS-only change; the drop to 8 is exactly G1 removing
  the one "Already have an account?" link), signup step 2 = 9, admin 6,
  forgot 4, verify 10, reset 6. Every ring visited in exact
  DOM order and wrapped correctly at both ends, both themes. Verify and Reset
  have no direct `[data-auth-tab]` entry point (only reachable normally via a
  live OTP/recovery round trip), so they were reached for this check by
  replicating `setActivePanel()`'s own DOM effects directly (same
  class/hidden toggles, read straight out of `auth.js`) rather than by
  stubbing Supabase — the real `trapTab()` keydown handler still runs
  unmodified either way, since it only reads the resulting DOM state.
- **Password policy, both themes.** Two-column grid confirmed live
  (`getComputedStyle` on `.auth-password-rules` reports `166px 166px`, two
  tracks, at 1440). Full 7-case truth table (all-pass, each of the 5 rules
  independently the only failure, all-fail-on-empty) matches expected
  `is-met` classes AND the sr-only "met"/"not met" mirror in both themes.
  Gating re-confirmed: an invalid password blocks Continue (step 2 stays
  inactive, correct inline error), a valid email+password pair advances to
  step 2 — unchanged from increment 9.
- **Contrast.** No `color`/`background` property appears anywhere in this
  increment's diff (checked directly), so every ratio is mathematically
  identical to increment 9's. Recomputed from the current token values as a
  live cross-check rather than only citing the old number: rule label
  5.69:1 dark / 4.55:1 light, error text 6.18:1 / 5.13:1, heading/body text
  >15:1 in both themes — byte-identical to increment 9, all AA.
- **Console errors: zero**, across height-matrix (20 sessions), autofill
  parity (8), focus trap (14), password policy (2) — 44 browser sessions
  spanning every panel state, both themes, ten viewport widths, with
  `Runtime.consoleAPICalled` (type `error`), `Runtime.exceptionThrown` and
  `Log.entryAdded` (level `error`) all captured and empty. The touch-target
  sweep (28 more sessions, below) exercised the same code paths but its
  script didn't persist its error capture to disk (a harness bug, not
  re-run) — not treated as a gap given the other 44 sessions cover the
  identical reach-panel logic cleanly.
- **Touch targets, all input/button elements inside `.auth-modal`, all 7
  panels × 1440/390 × 2 themes (28 sessions).** Findings summarized under G3
  above; nothing newly below 44px except `.auth-tab`'s ≤0.39px shortfall,
  which is not treated as a regression.

**Judgment calls / things flagged rather than silently decided:**

1. **Did not touch `.auth-tab`'s CSS** for the sub-pixel shortfall above —
   explained under G3. Flagging instead of fixing because any fix would
   invalidate the G4 height table and require a full re-measurement for a
   change smaller than a device pixel on most real screens.
2. **Did not re-verify the Terms dialog nesting or the OTP network
   round-trip.** Zero diff touches `includes/auth.js`, `.auth-terms-*` rules,
   the Google SVG, or anything Supabase-facing, and increments 5/7 already
   verified those paths against this exact code. Re-running them would be
   re-testing code nobody changed; time went to G4's measurement instead,
   which is what this increment actually shipped.
3. **Dev-only tooling, not part of the repo or its dependency surface:**
   `websocket-client` and `Pillow` were `pip install`ed into the machine's
   global Python (no `requirements.txt`/`package.json` exists to add them
   to) purely to script headless Chrome for this verification pass, the same
   category of tooling every prior increment's "headless Chrome over CDP"
   notes imply but don't name. Nothing in the working tree references them.

**Not verified here (pre-existing, out of scope):** the same native
`<select>`-popup Escape behaviour increments 2/5 already flagged as
untestable by headless Chrome — moot for this increment regardless, since
the auth modal has no `<select>`.

## Increment 11 — Split Full name into three fields; digits-only mobile

**H1 — Signup step 2's "Full name" field becomes three fields, laid out
horizontally: Surname, First name, Middle name.** Only signup step 2
(`Pages/Index.html`, currently `name="fullname"`) is in scope — no other page's
name field changes.

**No schema change.** `public.profiles.full_name` is a single text column read
and written across `Dashboard.js`, `owner_dashboard.js`, `staff_dashboard.js`
and the seed data — untouched by this increment. The three new inputs are named
`surname`, `firstname`, `middlename` and are composed into one `data.fullname`
string in `includes/auth.js`'s submit handler, right where `const data =
Object.fromEntries(new FormData(form))` already runs, before validation and
before the `signUp` call — so every downstream consumer keeps receiving the
same shape it always has. Compose as `First [Middle ]Surname` (natural full-name
reading order), collapsing extra whitespace, trimmed.

**Surname and First name are required; Middle name is optional** — many
Filipino users legitimately have no middle name to disclose, and the old single
field never demanded one either. State this assumption plainly to the user
rather than silently deciding it; it's a product call, flagged for their
confirmation, not just an implementation footnote.

**Horizontal layout, one row, three roughly-equal columns** (`display: flex` or
`grid-template-columns: 1fr 1fr 1fr` with a small gap) — matches the phrase
"divided into 3... but it should be horizontally." Must degrade sensibly at
390px/360px without breaking the increment-10 44px touch-target floor or
reopening the card-height regression that increment 10 just closed — measure,
don't assume, since three inputs plus labels is more vertical-DOM-weight than
one.

**H2 — Mobile number field accepts digits only, capped at 11 characters,**
matching the "09XX XXX XXXX" placeholder (2 + 9 = 11 digits, the local format
`validatePhMobile` already normalizes to). Filter on `input` and `paste`,
stripping everything but `0-9` and slicing to 11 — same pattern
`includes/auth.js` already uses for the OTP boxes
(`box.value.replace(/[^0-9]/g, '').slice(0, 1)`), just with a length of 11
instead of 1. Add `inputmode="numeric"` and `maxlength="11"` as declarative
backup; the JS filter is what actually blocks non-digit keystrokes and
over-length paste, since `maxlength`/`pattern` alone don't prevent typing.

**`window.validatePhMobile` (`includes/phoneValidation.js`) is NOT changed.**
It is shared with Account Settings (`Dashboard.js`), which is out of scope —
the user said "on the signup." Restricting the *signup* input to digits-only
naturally satisfies the validator's local-format branch without touching the
shared file; the validator's `+639…` international branch simply becomes
unreachable from this one input, which is fine since the field can no longer
produce a `+` character. Flag to the user, don't just quietly narrow it, that
Account Settings' mobile field still accepts the `+639` form and pasted
spaces/dashes — ask whether they want the same restriction applied there.

**Constraints.** All prior-increment constraints hold: no Supabase logic
changes beyond the `data.fullname` composition, no change to the password
step, the OTP hand-off, the terms dialog, the focus trap (recompute the
focusable set correctly over 3 inputs instead of 1 — this is exactly the kind
of DOM change increment 5's live-recomputation was built to handle
automatically, confirm it does), or increment 10's card-height/no-scroll
result. WCAG AA on the three new labels; guard any new transition with
`prefers-reduced-motion`.

**Success criteria.** Surname/First name/Middle name render in one horizontal
row on signup step 2; Surname and First name are required, Middle name is not;
submitting composes a single correct `fullname` string and the existing
`sb.auth.signUp` payload shape is unchanged. Mobile number field rejects every
non-digit keystroke and paste, and cannot exceed 11 characters, in the DOM —
not just via a validation message after the fact. Focus trap still correctly
cycles over the new field count. Card height/no-scroll result from increment 10
is re-measured and still holds (or the delta is reported honestly if it
doesn't).

### Increment 11 — execution notes (2026-08-30)

Implemented and verified by measurement (headless Chrome over CDP). Three files
touched: `Pages/Index.html`, `Style/Auth.css`, `includes/auth.js`. 234 new
assertions green (94 behavioural × 2 themes, 23 regression × 2), plus a
before/after height matrix and a 168-width layout sweep.

**Increment 10's card height and no-scroll thresholds did not move by one
pixel.** Measured with `.auth-modal.offsetHeight` on Log In, Sign Up step 1 and
Sign Up step 2, at ten widths × both themes, against a copy of the tree with
increment 11 reverted and served side by side:

| width | card (before = after) | no-scroll at ≥ (before = after) |
|---|---|---|
| 1440 / 1024 / 768 | 636 | 684 |
| 480 / 420 / 390 | 628 | 676 |
| 375 | 628 | 690 |
| 361 | 668 | 716 |
| 360 | 633 | 690 |
| 320 | 685 | 733 |

60 of 60 card cells and 40 of 40 threshold cells identical; Log In, step 1 and
step 2 equal in every row. The only cell that moved anywhere is step 2's OWN
height at the two widths where the name row falls to two columns (262 → 337 at
361 and at 320) — invisible at the card level, because step 1 is 433/445px
there and is what the shared grid sizes to. Step 2 never once reached step 1
across the 168-width sweep.

**H1 — the row is `repeat(auto-fit, minmax(86px, 1fr))`, not three fixed
tracks, and that is the narrow-width decision.** 86px is measured, not chosen:
"MIDDLE NAME", the longest of the three labels, is 85.16px in Space Mono
(77.28px in the monospace fallback), so any track the grid actually renders is
wrap-proof by construction — the same argument and the same mechanism increment
9 used for the password checklist, and for the same reason (the modal sheds
side padding at 480 and again at 360, so viewport width does not map to row
width). Swept a viewport pixel at a time from 320 to 480: three columns at ≥372
and again at exactly 360, two columns at 361–371 and at ≤359 — the same
non-monotone band the checklist has, and again no real device sits in it. Every
real width lands on the sensible side: 390 / 375 / 360 and everything wider get
three columns of 86–92px; 320 gets two columns of 114px with Middle name
half-width on a second row. Zero wrapped labels and zero horizontal overflow at
every width from 320 to 1920. The smallest box measured anywhere is 86 × 45px,
so increment 10's 44px touch-target floor holds throughout.

Fixed `repeat(3, minmax(0, 1fr))` was measured first and rejected: it holds to
375, but below ~365 the middle label wraps to two lines and the boxes fall to
72px at 320. Stacking the three fields was rejected outright — each extra row
costs 75px and step 2 has only 130px of headroom before it starts driving the
card, so a full stack (+150px) would have reopened exactly the regression
increment 10 closed.

**Middle name has no visible "(optional)" marker.** "MIDDLE NAME (OPTIONAL)" is
~165px of mono against a ~109px column, so it would wrap the row's labels out
of alignment at every width. The absence of `required` is what carries it to
assistive tech, and step 2's validation never asks for it. Flagged rather than
silently decided: adding the marker is a one-line change if the user wants it
and is happy for that label to sit on two lines.

**H2 — the JS filter, not `maxlength`, is what enforces the cap, and the paste
handler has to preempt `maxlength` to do it.** Proven both ways in the same
session: with the browser doing the insertion (`Input.insertText`), maxlength
truncates `"+63 917 123 4567"` to `"+63 917 123"` BEFORE anything can filter it
and the field ends up holding `63917123`; with the paste handler running (real
OS-clipboard Ctrl+V, `isTrusted: true`), the same clipboard content strips
first and caps second, landing `63917123456`. Both are digits-only and ≤ 11,
which is the requirement, but only the second is the intended filter-then-cap
behaviour. Real keystrokes over CDP: `abc09xy17!12 34-56()789` → `09171234567`;
a 12th digit cannot land; a letters-only run leaves the box empty. Real pastes:
`0917 123 4567` and `09-17-12-34-567` → `09171234567`, a 19-digit run → the
first 11, text with no digits → empty. A rejected keystroke mid-value leaves
the value and the caret untouched — the handler only writes `.value` back when
it actually differs, which is also what stops the caret jumping to the end on
every accepted keystroke.

**Two more things worth knowing about that field:**

1. **The paste handler dispatches its own `input` event.** Assigning `.value`
   fires nothing, and the step's shared `input` listener is what clears the
   field's inline error — without it a stale "Mobile number is required."
   outlives the paste that fixed it. Asserted live.
2. **`window.validatePhMobile` and `includes/phoneValidation.js` are
   untouched**, as the plan requires. The validator's `+639…` branch is now
   unreachable from the signup box (it can no longer produce a `+`), and its
   local branch accepts exactly what the field can hold — verified by
   round-tripping the filtered value back through it. **Account Settings
   (`includes/Dashboard.js`) still accepts `+639…` and pasted spaces/dashes**;
   the user asked for signup only, so that field was left alone. Giving it the
   same treatment is a small change if they want the two to match.

**Focus trap: zero code changes, confirmed rather than assumed.** The step-2
ring goes 9 → 11 (surname, firstname, middlename replacing the one fullname
box) and `focusablesWithin()` picks all three up because it recomputes on every
Tab. Two full forward cycles and two full backward cycles of real
`Input.dispatchKeyEvent` Tab / Shift+Tab in both themes visit exactly the
expected 11 controls in DOM order, wrap at both ends, and never leave
`.auth-modal`.

**Everything downstream of `full_name` is untouched.** `composeFullName()` runs
on the `FormData` snapshot inside the `mode === 'signup'` branch, before the
mobile check and before `signUp`, so `data.fullname` reaches the payload in the
exact shape it always had. Asserted against the stubbed `signUp` call: keys are
still `email` / `password` / `options`, `options` still only `data`, `data`
still only `full_name` + `contact_num`. `Juan` + `Reyes` + `Dela Cruz` →
`"Juan Reyes Dela Cruz"`; with the middle box empty → `"Juan Dela Cruz"` (one
space, not two); `"  Dela   Cruz  "` + `"  Juan  "` + `"   "` →
`"Juan Dela Cruz"`. `FormData` now carries `surname` / `firstname` /
`middlename` in place of `fullname`, and `public.profiles.full_name` is
unchanged — no migration, no dashboard change, no seed change.

**Cosmetic, reported rather than fixed:** at 390 and 360 the surname box has
62px / 56px of text room against the ~66px "Dela Cruz" placeholder, so the
placeholder clips to "Dela Cru" / "Dela Cr". Typed values behave normally (the
field scrolls); only the example name is clipped, and the label carries the
meaning. A one-word surname would fit at every width but loses the "a compound
surname goes in this one box" hint the old `Juan Dela Cruz` placeholder
carried.

**No new transition and no new colour**, so the `prefers-reduced-motion` guard
and the contrast work have nothing new to cover. The three labels reuse
`.auth-label` unchanged and measure 5.69:1 (dark) / 4.55:1 (light) on the real
modal surface — identical to every other label in this form. Console on load
and through the whole flow: zero errors in both themes beyond Chrome's own
`/favicon.ico` 404, which this repo has never shipped a favicon for.

**Found while verifying, and not this increment's to fix: increments 9 and 10
are NOT committed.** `HEAD` (20591d1) is still the increment-8 state — its
`.auth-modal` is `padding: 40px 36px 32px` and its card measures 850px.
Increment 9's two-column checklist and increment 10's compaction, autofill
parity and G1 removal exist only in the working tree, so a `git stash`,
`git checkout` or `git restore` would destroy them (this pass hit exactly that
while building a before/after comparison, and recovered from the stash).
Increment 11 is stacked on top of them in the same uncommitted state. Worth a
commit before anything else touches this repo.

**Not verified here:** a real end-to-end signup against Supabase. Every run
blocked `*supabase.co/auth/*` and stubbed `sb.auth.signUp`, so no account was
created and nothing here confirms how the composed `full_name` looks once
`public.profiles` actually stores it — the payload was asserted at the call
site instead.

## Increment 12 — Loading phase on signup submit

**Bug confirmed by reading source.** `includes/auth.js`'s submit handler shows
`window.InigoLoading` before every other network call it makes — login
(`'Signing you in…'`, line ~1396), forgot (`'Sending your reset code…'`, line
~1596), reset (`'Updating your password…'`, line ~1640), recovery/login OTP
verify (`'Verifying…'`), resend (`'Sending a new code…'`), Google
(`'Redirecting to Google…'`) — **except `mode === 'signup'`**, whose
`sb.auth.signUp(...)` call (which sends the verification code) runs with no
loading state at all. The button just sits disabled with no explanation while
the network round-trip happens.

**Fix:** add `InigoLoading.show('Creating your account…')` immediately before
the `signUp` call (after the mobile-number validation, which is synchronous and
should still fail instantly with no overlay), and `hide()` once the response
comes back — before branching into whichever of the three outcomes applies
(already-registered error, session-already-returned redirect, or the normal
hand-off to the verify/OTP panel). The existing `catch` block already calls
`hide()` on a thrown error, so the only gap is the success path. Match the
wording style already used by the other five messages in this file.

**Constraints.** One function, `includes/auth.js`'s signup branch only. No
change to validation order, the `signUp` payload, the OTP hand-off, or any
other mode's branch. This is additive — do not restructure the try/catch.

**Success criteria.** Clicking Create Account shows a loading overlay
immediately, which clears the instant a response arrives, on all three
outcomes (already-registered, immediate-session, and the normal path to the
verify panel) — matching the show/hide discipline every other auth action in
this file already has, including hiding on error.

## Increment 13 — Middle name "(optional)" marker; Account Settings mobile parity

User approved both recommendations flagged at the end of increment 11/12.

**I1 — Visible "(optional)" marker on signup's Middle name field.** Increment 11
left this unmarked because "MIDDLE NAME (OPTIONAL)" (~165px in the existing
mono label style) doesn't fit the ~86–109px column without wrapping the row's
three labels out of alignment. Needs a compact solution that actually fits,
measured the same way increment 11 measured its column widths — not asserted.
Candidates to weigh: a shorter marker ("(OPT.)"), a lighter/smaller-weight
"optional" placed so it doesn't force alignment across all three labels (e.g.
only this one label allowed to wrap to a second line, since it's the one
field where that's tolerable), or folding the hint into the placeholder
instead of the label. Pick whichever holds up under measurement at every width
this row already supports (including the narrow two-column fallback from
increment 11), and report the actual numbers.

**I2 — Same digits-only/11-character mobile restriction on Account Settings.**
`Pages/user_dashboard.html`'s Mobile number field (`.dash-settings-grid
.dash-input`, third input, referenced *positionally* by
`includes/Dashboard.js` — `inputs[2]`) currently accepts anything a `type="tel"`
field allows, including the seed value's `"0912 345 6789"` spaced format.
Apply the identical filter increment 11 added to signup's mobile field —
strip non-digits, cap at 11, on `input` and `paste` — reusing the same
implementation pattern rather than writing a second one. Decide explicitly
whether the pre-filled/loaded value should be reformatted to digits-only for
display consistency, or left as-is until the user next edits it, and state
which was chosen and why. `window.validatePhMobile`
(`includes/phoneValidation.js`) stays untouched, same reasoning as increment
11 — Account Settings' save path already runs through it
(`includes/Dashboard.js:792`).

**Constraints.** No schema change, no change to `contact_num`'s stored shape,
no change to the signup fields or increment 11's composed-fullname logic, no
change to `owner_dashboard.js` / `staff_dashboard.js` (out of scope — Account
Settings only, matching what the user actually asked to extend), no change to
the shared validator. WCAG AA on any new/changed label text; guard new
transitions with `prefers-reduced-motion`; keep the 44px touch-target floor.

**Success criteria.** Middle name visibly reads as optional to sighted users,
with zero wrapping/misalignment regression at any width the row already
supports. Account Settings' mobile field rejects non-digit keystrokes/paste
and caps at 11 characters, verified with real keystroke/paste events exactly
as increment 11 verified signup's. Save still round-trips correctly through
`validatePhMobile` and `contact_num`.

### Increment 13 — execution notes (2026-08-30)

Implemented and verified by measurement (headless Chrome over CDP). Four
files touched: `Pages/Index.html`, `Style/Auth.css` (I1), `Pages/user_dashboard.html`,
`includes/Dashboard.js` (I2). `includes/auth.js`, `includes/owner_dashboard.js`,
`includes/staff_dashboard.js` and `includes/phoneValidation.js` all have zero
diff — confirmed with `git diff --stat`.

**I1 — measured, not asserted; the marker is a forced second line, and the
numbers show why that was the only option left standing.** Re-measured "MIDDLE
NAME" alone in the live modal: **85.16px**, byte-identical to increment 11's
number. Swept the row's own rendered column width at 17 points from 1440 down
to 320 (adding 430/412/393/372/365/359/340 to increment 11's original sweep):
3-column tracks run 86.0px (372, 360) up to **118.0px (480 — the single
widest column at any width)**; the 2-column fallback (371–361, 359–340, 320)
runs 114.0–133.5px. Also measured every candidate string live, in the real
`.auth-label` style, off-flow: `"MIDDLE NAME (OPTIONAL)"` = 170.31px,
`"MIDDLE NAME (OPT.)"` = 139.36px, and even the single word `"(OPT.)"` on its
own = 46.45px — which still does not fit: 85.16 + a space + 46.45 ≈ 135px
against a **118px ceiling that never grows past that at any width this row
renders**. No same-line suffix fits, at any abbreviation, at any width — this
is what settled I1's option choice, not a style preference.

Shipped as a nested `<span class="auth-label-hint">(optional)</span>` inside
Middle name's `.auth-label`, `display: block` (forces its own line
deterministically rather than relying on incidental wrap surviving future
font/metric changes), 0.64rem Inter, sentence case, reusing
**`--color-ink-faint`** — the exact same token `.auth-label` itself already
uses, so the contrast ratio is provably the label's own ratio, recomputed
live rather than assumed: **5.69:1 dark / 4.55:1 light** against the real
composited modal surface (`rgb(25,20,16)` dark / `rgb(247,240,228)` light) —
both clear AA's 4.5:1, and font-size does not change which ratio applies
(only the ≥18pt/14pt-bold "large text" carve-out would, and 0.64rem is far
below it).

Full sweep of the actual shipped markup/CSS (not a synthetic prototype), one
browser session per theme, resized to all 17 widths within each session (34
data points total):

| | result |
|---|---|
| Hint wraps to a 3rd line anywhere | **never** (`hintLines === 1` at all 17 widths, both themes) |
| Row/modal horizontal overflow | **zero** at all 17 widths (`overflowX` / `modalOverflowX` both 0.0px) |
| Surname vs First name input alignment | **identical `top` at all 17 widths** (byte-for-byte) — untouched by this change |
| Middle name's own input, 3-col rows | **+14.78px lower** than Surname/First in the same row — the accepted, task-sanctioned trade-off; only this one field's box grows |
| Step 2 height | +14.8px (3-col: 261.8→276.6px) / +14.7px (2-col: 337.2→351.9px) |
| **Card height, every width, both themes** | **byte-identical to the pre-I1 baseline at all 17 widths** (636/628/668/633/673/685) — step 1 (392.3–444.8px) still exceeds the grown step 2 (276.6–351.9px) everywhere, so increment 10's card-height/no-scroll result is untouched |
| Input touch targets (all 3 name boxes) | 45px unchanged at all 17 widths — increment 10's 44px floor holds |
| Dark vs light geometry | byte-identical (only colour differs) |

Screenshotted at 1440 (widest 3-col), 372 (narrowest 3-col), 361 (2-col
fallback) and 320 (narrowest 2-col), both themes — visually clean at every
one, no wrapping, no clipping beyond the pre-existing "Dela Cru[z]" placeholder
clip increment 11 already flagged and left alone (surname box text room,
unrelated to this change).

**Focus trap: zero code diff to `includes/auth.js`, re-verified live anyway**
because a DOM change happened even though the trap's own file didn't move.
Step 2's ring is still exactly **11** (increment 11's own number — a plain
`<span>` with no `href`/`tabindex` can never match `FOCUSABLE`), confirmed
with real `Input.dispatchKeyEvent` Tab **and** Shift+Tab, full cycle, both
directions, both themes: `surname → firstname → middlename → mobile → terms →
Terms link → Back → Create Account → close (×) → Log In tab → Sign Up tab →
(wraps)`. The hint span is never focused; focus never leaves `.auth-modal`.
Console: zero errors in both themes across every session above.

**I2 — reused increment 11's exact pattern, not a second implementation.**
`Pages/user_dashboard.html`'s Mobile number input gained `data-digits-only`,
`inputmode="numeric"`, `maxlength="11"`. `includes/Dashboard.js` gained one
hoisted `digitsOnly()` helper (a function declaration, not a `const` arrow —
this file has no top-level TDZ-hazard pattern the way `auth.js` once did, and
a hoisted declaration keeps that guarantee trivially rather than requiring a
source-order proof) plus the identical input/paste wiring `auth.js` uses for
signup's mobile field: strip non-digits on `input`, and on `paste`
`preventDefault()` + manual caret-respecting splice + a dispatched synthetic
`input` event, because `maxlength` alone truncates a paste before any filter
sees it (increment 11's own finding, reproduced again here). **Wired once, at
top-level setup, not inside `renderProfile()`** — that function can run twice
(on `inigosync:profile-ready` **and** immediately if `window.inigosyncProfile`
already exists at load), and attaching the paste handler twice would
double-apply its manual splice.

**Decision — the pre-filled/loaded value IS reformatted to digits-only, on
both paths, not left as-is.** Reasoning: `window.validatePhMobile`'s
`normalized` return is *always* the spaceless local form (confirmed by
reading `includes/phoneValidation.js` directly), and both write paths that
can ever populate `contact_num` — signup and this same Account Settings Save
handler — already store exactly that `normalized` value; the real seed rows
in `database/seed/001_seed_users.sql` (`'09171234501'` etc.) confirm this
holds in practice too. The **only** spaced value anywhere in the codebase was
the static HTML demo default (`"0912 345 6789"`), which would otherwise be
the one thing on the page that could never actually come from the database —
and would directly contradict the field's own new `maxlength="11"` (13
characters against an 11-character cap). Fixed at both the source that
matters:
1. The static seed value → `value="09123456789"` (verified: this is the
   literal on-disk value the browser renders with **zero** Supabase session
   at all — `authGuard.js`'s own `!window.sb` guard bails out and leaves the
   static shell untouched, confirming the fix is real and not merely masked
   by a live profile load).
2. `renderProfile()` → `inputs[2].value = digitsOnly(profile.contact_num).slice(0, 11)` —
   defensive, not a fix for anything either write path produces today, but
   guarantees the field displays what its own contract promises regardless
   of how a value got into the database. Verified live with a deliberately
   dirty fake profile (`contact_num: '0917 123 4501'`) → field displayed
   `'09171234501'` after load.

**Verification — real dispatched keystrokes and paste, same test matrix
increment 11 used for signup, 44/44 checks green across both themes** (22
checks × 2 themes; headless Chrome over CDP, `authGuard.js` satisfied with a
minimal fake `window.sb` — the real CDN script is blocked and a hand-rolled
chainable mock stands in, same category of substitution increment 8's own
verification used, "stubbed `sb.auth.signUp` and blocked `*supabase.co/auth/*`"):

- Real keystrokes `abc09xy17!12 34-56()789` → `09171234567` (byte-identical
  to increment 11's own signup test string). A 12th digit cannot land.
  Letters-only leaves the field empty. A rejected keystroke mid-value leaves
  both the value and the caret position untouched.
- Paste `0917 123 4567` → `09171234567`; `09-17-12-34-567` → `09171234567`;
  a 19-digit run → the first 11; text with no digits → stays empty; a paste
  into the middle of an existing value splices at the caret correctly
  (`'0917'` at caret 2 + pasted `'99'` → `'099917'`).
- Paste `+63 917 123 4567` → `63917123456`: digits-only extraction, capped at
  11, **not** a valid local number — expected and by design, identical to
  increment 11's own finding that the international branch becomes
  unreachable from a digits-only field once it can no longer produce a `+`.
- Full name (`inputs[0]`) accepts symbols/spaces unfiltered
  (`"O'Brien-Cruz III"` round-trips exactly) — confirms the filter is scoped
  to the mobile field alone. Email (`inputs[1]`) stays `disabled` and
  untouched throughout.
- Save round-trips correctly: a valid `09181234567` reaches the mocked
  `profiles` update payload's `contact_num` unchanged (already local-format,
  so `validatePhMobile` passes it straight through), `window.inigosyncProfile`
  and the re-rendered field both reflect it afterward. An invalid short entry
  (`091`, 3 digits) is blocked by the pre-existing `validatePhMobile` gate —
  **zero** update calls reach Supabase — confirming increment 13 added no new
  path around that validation and `includes/Dashboard.js:792`'s call site is
  unchanged.
- `.dash-settings-grid .dash-input` positional structure is unchanged:
  querying it inside the settings panel still returns 5 elements in the same
  order (Full name, Email, Mobile, New password, Confirm new password — the
  panel has two separate `.dash-settings-grid` blocks, and `inputs[0..2]` has
  always meant "the first three in DOM order," pre-existing behaviour this
  increment did not touch). The Change Password card's own 3
  `input[type="password"]` fields are untouched and not matched by the new
  `[data-digits-only]`-scoped selector.
- Console: zero errors in both themes beyond one **deliberate, harness-induced**
  message (`[supabaseClient] supabase-js failed to load…`) that fires only
  because the test setup blocks the real CDN to substitute the fake client —
  it cannot occur with real network access and is unrelated to any file this
  increment touched.

**`prefers-reduced-motion`: nothing new to guard.** Neither I1 nor I2 adds a
`transition`, `animation`, or any other motion — `.auth-label-hint` is static
text styling and the digits-only wiring is behavioural, not visual. Checked
directly rather than assumed: neither diff contains the string `transition`.

**Not verified here: real OS-clipboard paste.** This sandboxed shell has no
clipboard access — both `clip.exe` (`"Access is denied"`) and PowerShell's
`Set-Clipboard` (`ExternalException`) fail outright when actually invoked
with content. Every paste check above instead dispatches a synthetic
`ClipboardEvent` carrying a real `DataTransfer` (`isTrusted: false`), proven
first against a throwaway `about:blank` input to confirm it reliably reaches
`e.clipboardData.getData('text')`. This exercises the exact same handler code
path a real Ctrl+V would — the handler never branches on `event.isTrusted` —
but does not prove Chrome's own trusted-paste delivery pipeline, which is
standard platform behaviour this increment has no reason to doubt rather than
something specific to this code.

**Not this increment's to fix, flagged for the record:** the "Increment 12 —
execution notes" section referenced by this increment's own opening line
("both recommendations flagged at the end of increment 11/12") does not exist
in this file — increment 12's plan text has no matching write-up. The
recommendations actually being approved here (the marker, and Account
Settings parity) both trace to increment 11's own notes, not anything
increment 12 flagged, so this did not block I1/I2; noted only because a
future reader searching for "increment 12 execution notes" will not find one.

## Increment 14 — Fix Surname/First name/Middle name textbox misalignment

User-reported (screenshot) and confirmed: increment 13's `.auth-label-hint`
("(optional)") forces Middle name's label onto two lines while Surname's and
First name's labels stay on one, so **Middle name's input box sits visibly
lower than the other two** in the same horizontal row — exactly the alignment
regression increment 13 was supposed to avoid, now visible in a real
screenshot rather than only theorized.

**Fix: reserve equal label height across all three fields in the row**, not
by removing the hint. Give the label area inside `.auth-field-row .auth-field`
a `min-height` sized to the *tallest* label (Middle name's two-line version),
so Surname's and First name's single-line labels reserve the same vertical
space even though they render shorter — pushing all three `<input>` elements
to start at the identical Y position. Measure the real rendered heights (label
line height + hint line height + its `margin-top`) rather than guessing a
round number, and verify with `getBoundingClientRect().top` equality across
the three inputs, not just a visual screenshot.

**Scope this to the row that actually has three unequal labels.** Increment
11's two-column narrow fallback (≤371px, and ≥360 as a special case) already
puts Middle name on its own row below Surname/First name — there is no
three-way alignment to fix there, only the two-name row (which has no hint)
above it. Confirm the fix does not add unwanted empty space to that narrow
layout, where reserving two-line height for a label that's alone on its own
row serves no purpose.

**Constraints.** All increment 13 constraints hold: no schema change, no
change to `composeFullName()`, no change to `data-digits-only` mobile
filtering, no change to Surname/First name's `required` state or Middle
name's optional state, WCAG AA / 44px floor / `prefers-reduced-motion` per
house convention. Do not remove or reword the "(optional)" hint — the fix is
alignment, not reverting increment 13.

**Success criteria.** All three input boxes' top edges align exactly (0px
difference) at every width where they render as three columns in one row, in
both themes. The narrow two-column fallback is unaffected or improved, not
regressed. Screenshot confirms it visually, matching the measured numbers.

### Increment 14 — execution notes (2026-08-30)

Implemented and verified by measurement (headless Chrome over CDP). **One
file touched: `Style/Auth.css`** — a single new rule, `.auth-field-row
.auth-label { min-height: 29.2px }`, scoped inside a media query. No markup,
no JS, no colour, no new transition.

**Reproduced the bug live before touching anything.** Baseline measurement
(pre-fix) at 12 widths × 2 themes: Surname's and First name's `.auth-label`
render at 14px (one line); Middle name's at 29px (two lines, its
`.auth-label-hint`), at every width, both themes, without exception. At every
three-column width the three inputs'
`getBoundingClientRect().top` matched Surname == First name exactly, and
Middle name **14.65–14.78px lower** than both — confirming the reported bug
pixel-for-pixel, not just visually.

**The number is the real rendered one, not the JS-rounded one.**
`getComputedStyle()` on the live modal: `.auth-label` line box 14.4px
(0.72rem × line-height 1.25) + `.auth-label-hint` line box 12.8px (0.64rem ×
the same inherited 1.25) + the 2px `margin-top` between them = **29.2px**,
identical in both themes and at every width tested (320–1920; the label text
never wraps a third line). The obvious first choice — Middle name's own
`label.offsetHeight`, which CSSOM rounds to a plain **29** — was tried first
and produced a **0.168–0.172px residual** between Middle name's input and the
other two at every three-column width (measured, not eyeballed): Middle
name's real two-line box is the unrounded 29.2px internally, and a
`min-height` of the rounded integer on the *other two* labels falls 0.2px
short of matching it. Switching the literal to the unrounded 29.2px closed
the residual to **exactly 0.0000px** at every one of the 12 widths, both
themes — logged in the CSS comment so a future re-measure knows why the
number isn't a round one.

**Scoped to the three-column state, not applied unconditionally — checked by
rendering both ways, per the plan's own instruction, not assumed.** Rendered
an unconditional build (same rule, no media query) side by side with the true
baseline: at every two-column fallback width (361/359/320, both themes),
Surname's and First name's inputs — which have no taller row-mate in that
layout — were both pushed down **14.797px**, and Middle name's own input a
near-identical **14.812px**, i.e. the *entire* two-column row grows by about
15px of dead space above text that never needed it. That is a real,
measured regression against "unaffected or improved," not a hypothetical
one, so the rule ships inside
`@media (min-width: 372px), (min-width: 360px) and (max-width: 360px)` —
reusing `.auth-field-row`'s own documented three-column thresholds (≥372px,
and again at exactly 360px, the same non-monotone edge case increments 9 and
11 already found and left alone) rather than inventing a new breakpoint.
Re-confirmed live for this specific rule, not just carried over from memory:
at 372px and 360px the row renders 3 columns and the fix applies; at 361px
and 359px it renders 2 and the fix does not. With the scoped rule shipped,
the two-column fallback measures **byte-identical to the pre-fix baseline**
at 361/359/320 in both themes — 0.0px change to Surname's, First name's, or
Middle name's input position. Nothing was added, nothing was removed; the
fallback was already correct and stays that way.

Full width/theme matrix, `.auth-modal.offsetHeight` (card height) before vs.
after — **unchanged at every cell**:

| width | 1440/1024/768 | 480/420/390/375/372 | 361 | 360 | 359 | 320 |
|---|---|---|---|---|---|---|
| card height, before = after (both themes) | 636 | 628 | 668 | 633 | 673 | 685 |

This is the expected result, not a coincidence: step 2's height was already
being set by Middle name's own two-line label before this increment (that's
what increment 13 measured as step 2 growing from 261.8/337.2 to
276.6/351.9px). This fix only makes Surname's and First name's *own* labels
catch up to a row height the grid was already reserving for Middle name — it
does not add any new height to the row itself, so the step, and therefore the
card, does not move.

Top-alignment matrix, `getBoundingClientRect().top`, byte-identical in both
themes except where noted — two separate comparisons, because "aligned" only
means something between elements that actually share a row:

| width | 1440 | 1024 | 768 | 480 | 420 | 390 | 375 | 372 | 361 | 360 | 359 | 320 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| columns | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 2 | 3 | 2 | 2 |
| Surname vs. First name, before | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| Surname vs. First name, after | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| Middle name vs. Surname, before | 14.65–14.70‡ | 14.76–14.77‡ | 14.78 | 14.78 | 14.78 | 14.78 | 14.78 | 14.78 | 90.17† | 14.78 | 90.17† | 90.17† |
| Middle name vs. Surname, after | **0.000** | **0.000** | **0.000** | **0.000** | **0.000** | **0.000** | **0.000** | **0.000** | 90.17† | **0.000** | 90.17† | 90.17† |

Surname vs. First name — the pair that are always row-mates, in both the
three- and two-column layouts — measured 0.000px apart before this fix and
still do after, at all 12 widths, both themes: they were never the bug and
this change does not touch them beyond growing their shared label height.
Middle name vs. Surname is the actual bug metric, and it only means anything
in the three-column state (where all three genuinely share one row): **every
three-column width, including the 360px non-monotone one, goes from a real,
reproduced 14.65–14.78px gap to an exact 0.000px** in both themes. At 361,
359 and 320 the 90.17px reading is unchanged before vs. after (†) — that is
Middle name legitimately sitting on its own row below Surname/First name, not
a misalignment, and this fix leaves it exactly as it was; the number that
actually matters there — Surname's and First name's own top, individually,
against the true pre-fix baseline — also measured **0.0px difference** at
every one of those three widths, confirming zero pixels of new dead space
was added to the fallback (see the unconditional-vs-scoped comparison below
for what happens when that scoping is removed). ‡ dark/light differ by
≤0.05px at 1440/1024 only, sub-pixel font-hinting noise unrelated to this
fix (present in the "before" numbers too).

**Touch targets and overflow, re-checked rather than assumed unaffected:**
input height stayed **≥44.6px** at all 24 width/theme cells (44.60–44.98px at
1440/1024/768, a flat 45.00px everywhere narrower — small run-to-run
sub-pixel variance was visible specifically at 1440, the first width measured
right after navigation, consistent with web-font swap-in timing rather than
this fix; every repeat measurement still cleared 44px by a comfortable
margin). The input element's own CSS was never touched — the new rule only
sizes the label above it. `scrollWidth − clientWidth` stayed **0** for both
`.auth-field-row` and `.auth-modal` at every cell — no horizontal overflow
introduced.

**Focus trap: zero code touched, re-verified live anyway** because a
rendering change happened even though `includes/auth.js` didn't move. 26 real
`Input.dispatchKeyEvent` Tabs and 26 Shift+Tabs from Surname, both themes,
visit exactly increment 13's own documented 11-control ring in the same
order — `surname → firstname → middlename → mobile → terms → Terms link →
Back → Create Account → close (×) → Log In tab → Sign Up tab → (wraps)` —
every stop reporting `inModal: true`. Unchanged, as expected for a CSS-only
change.

**Console: zero errors or exceptions in either theme**, across the full
navigate → theme-set → step-2 → 26-Tab-cycle session (captured via a fixed
event-logging bug in the measurement harness itself, not just a one-off
sample at the end, so nothing early was silently missed). The only messages
present are the two pre-existing `console.log` informational lines
(`courts-data.js loaded…`, `hero showcase carousel loaded…`) and one
pre-existing Chrome DevTools "verbose" `[DOM]` password-form recommendation —
all three predate this increment and are not errors.

**WCAG AA and `prefers-reduced-motion`: nothing new to check.** The diff
touches no `color`/`background` declaration (`--color-ink-faint` is
mentioned only inside a pre-existing, untouched comment) and adds no
`transition`/`animation` — confirmed by re-reading the exact lines added, not
just by category. Contrast is therefore provably the same 4.55:1 light /
5.69:1 dark `.auth-label` already held.

Screenshots (both themes, `.auth-modal` clipped): 1440px (three-column, wide)
confirms all three boxes level; 360px confirms the non-monotone edge case
itself renders three level boxes, not just the widths on either side of it;
320px confirms the two-column fallback with Middle name cleanly on its own
row and no dead space above Surname/First name.

**Not verified here:** a real OS window resize (every width above is a CDP
`Emulation.setDeviceMetricsOverride`, the same category of substitution prior
increments' responsive sweeps used) and real-device rendering (Android's
common 360px-wide viewport was covered exactly at the value most devices
report, but only through Chrome's engine, not a physical device).

## Execution notes (2026-08-28) — deviations accepted

Implemented and verified. Six deviations from the plan as written, all accepted:

1. **Added `--color-accent-text`** (dark `#FF6115`, light `#B93E08`). L2 covered
   surfaces but not text: `#FF6115` measures only 2.94:1 on `#FFFCF4`, failing AA
   for `.eyebrow`, `.court-count`, `.testimonial-stars`, `.footer-card h3`. Brand
   orange is unchanged for buttons, borders, and dark mode.
2. **Adjusted `--color-ink-faint`** (dark `#8a8177 → #988e83`, light
   `#9A8E80 → #756C61`) — the light value was already failing at 2.83:1.
3. **`#about` is not itself `.reveal`;** its three children are. The section is
   several viewports tall and the shared observer's `threshold: 0.15` of the
   target's own area could never fire on short viewports, leaving it invisible.
4. **Added `:root[data-theme="light"] .dash-topbar` to LandingPage.css.**
   `user_dashboard.html` loads LandingPage.css and its topbar was silently
   inheriting its light surface from the deleted legacy `header` rule.
   Dashboard.css has no light block and is do-not-touch, so the surface was
   restated with a "delete when Dashboard.css grows its own light block" note.
5. **Raised the CTA band's overlay alphas** — over a worst-case photo pixel the
   old gradient left body copy at ~3.3:1.
6. **Deleted `renderEventCard` / `[data-event-grid]`** rather than leaving dead code.

Two bugs found and fixed during verification: `.court-viewer[hidden]` inherited
Auth.css's `display: flex`, leaving the close button focusable while closed; and
Chrome's anonymous content box centring made short court cards float their content.

**Outstanding, user's call:** `--color-bg-elevated` in light mode changed
`#FFFFFF → #F7F0E4`, which warms the auth modal panel and dashboard
sidebar/inputs. This resolves the same white-on-white defect there, but is a
visible change outside the landing page. `.court-card` is a `<button>` containing
flow content — works in every browser, will fail a W3C validator.

---

# Appendix — QA Remediation Plan (decisions D1–D8, still authoritative)

> Supersedes the previous landing-page plan, which is complete and archived in
> git history. Driven by `docs/QA_AUDIT_REPORT.md` (2026-08-27).

## Goal

Close the gap between what the thesis paper promises
(`docs/SPEC_scope_and_limitations.md`) and what the system actually does — in
priority order, so that at every stopping point the project is more defensible
than it was before.

## Context and current state

8 of 31 scope requirements are implemented, 12 partial, 11 missing. One of the
four stated Objectives (Payment Automation) has no code at all. The landing page
and auth layer are genuinely wired to Supabase; almost everything behind the
login is presentation over hardcoded arrays.

Live-verified: RLS is enforced on content tables; Google OAuth is enabled; the
`notification` and `audit_log` tables do not exist; the `.test` demo accounts do
not exist (the real-email variant was applied instead).

## Approach and architectural decisions

**D1 — Fix truthfulness before features.** Any UI text claiming a capability the
system lacks gets removed or corrected first. A panelist reading "already paid
through PayMongo" on a system with no payment code is a worse outcome than a
missing feature honestly labelled. Cheap, and it de-risks the demo immediately.

**D2 — One source of truth for courts: the `court` table.** The customer
dashboard and admin Court Listings currently hardcode two different court lists
that both contradict the landing page. Both get rewired to read `court`/`sport`
from Supabase, reusing the fetch-with-static-fallback pattern already proven in
`includes/landingPage.js`. Admin Court Listings becomes real CRUD against that
same table, so an admin edit is visible on the landing page on next load.

**D3 — Reuse `escapeHtml`, do not reinvent it.** The helper in
`includes/landingPage.js:30` is correct and already handles all five characters.
It moves to a shared file and gets applied to every `innerHTML` interpolation in
the three dashboard controllers. No templating library, no framework.

**D4 — Anything time-triggered must be server-side.** Automatic cancellation
(30-min grace) and the 5h→0h booking reminder cannot run in browser JS — that
only executes while somebody has the tab open, and the spec requires them to
fire regardless. These need `pg_cron` + a Postgres function, or a scheduled Edge
Function. Because there is no service_role key in this environment, these ship as
**SQL files the owner applies manually**, not as code the Coder can deploy.

**D5 — Double-booking prevention belongs in the database, not the client.** A
client-side conflict check loses to two simultaneous requests. The fix is a
Postgres exclusion constraint (`btree_gist` over court + time range), which makes
the guarantee unbreakable regardless of what the frontend does. Client-side
checking is added on top only for a friendly error message.

**D6 — Session Expiration is frontend; Single Session needs the database.**
Idle auto-logout is a plain activity-listener + timer, done entirely in
`includes/authGuard.js`. Single Session requires knowing that a *newer* session
exists elsewhere, which means a server-side record — an `active_session` table
with the current session ID per user, checked on focus/interval.

**D7 — Payment and email are gated on owner-supplied accounts.** PayMongo needs
a merchant account and a secret key that must live in an Edge Function, never in
the repo. Gmail delivery needs a mail provider and verified domain. Both are
blocked on the owner; the plan builds everything up to the integration boundary
and stops there.

**D8 — UI changes stay within the existing design language.** Oswald/Inter,
dark-first theming, pill navbar. Changes are made where the audit found real
defects (frozen stat tiles, dead buttons, false claims), not as a rebrand.

## Phases

Phase 1 is unambiguous and has no trade-offs. Phases 2+ need owner decisions.

### Phase 1 — Security and truthfulness *(no owner input needed)*

| Item | Files |
|---|---|
| Extract `escapeHtml` to a shared helper; apply to every dashboard `innerHTML` | `includes/` (new shared file), `staff_dashboard.js`, `owner_dashboard.js`, `Dashboard.js`, `landingPage.js` |
| Fix attribute injection in the staff-edit modal | `owner_dashboard.js:291` |
| Verify "Current password" via re-authentication before `updateUser` | `Dashboard.js:589`, `owner_dashboard.js:547` |
| Remove the false PayMongo claim and any other unbacked UI copy | `Pages/staff_dashboard.html:102` |
| PH mobile-number validation on signup and settings | `Pages/Index.html:328`, `Dashboard.js:567` |
| Make the Email settings field read-only (it is silently discarded today) | `Dashboard.js`, `Pages/user_dashboard.html` |
| Write the Terms & Conditions page covering all 5 mandated topics; wire the checkbox link | new `Pages/terms.html`, `Pages/Index.html:341` |
| Fix dead links: "Forgot password?", Details/View/Download | `Pages/Index.html:300`, `Dashboard.js` |

### Phase 2 — One source of truth for courts

Rewire the customer dashboard's Court Information and Booking Management option
lists to read `court`/`sport` from Supabase. Convert admin Court Listings from
`console.log` placeholders into real CRUD. Render hourly rate on landing cards
and add a `rating` column so Facilities & Pricing matches the spec.

### Phase 3 — Make the staff module operable

Render Confirm / Time-In / Time-Out actions on *real* booking rows. Persist
walk-in customer name and mobile. Add the `audit_log` table and write to it on
every booking state change, then render Transaction Records from it. Drive the
Court Schedule grid from real bookings.

### Phase 4 — Booking integrity and lifecycle *(SQL, owner-applied)*

Exclusion constraint against double booking. `pg_cron` job for the 30-minute
grace-period auto-cancel that reopens the slot. `notification` table plus the
5h→0h reminder job. RLS hardening on `profiles.role` if introspection shows it
is writable.

### Phase 5 — Payment *(blocked on owner)*

PayMongo Edge Function, real receipt/invoice generation, and the live loading
phase on payment matching the login overlay.

### Phase 6 — Session security

Idle session expiration. `active_session` table and single-session enforcement.
Login OTP, if confirmed as wanted on every login.

## Status

| Phase | State | Commit |
|---|---|---|
| 1 — Security & truthfulness | **Done, verified** | `953d431` |
| 2 — One source of truth for courts | **Done, verified** | `23f3d9c` |
| 3 — Staff module operable | **Done, verified** | working tree |
| 4 — Booking integrity & lifecycle | Blocked on `pg_cron` check | — |
| 5 — Payment (PayMongo **test mode**) | Blocked on owner account | — |
| 6 — Session security (OTP = **first-login-per-device**) | **Done, verified** | working tree |

### Owner decisions recorded (2026-08-28)
- **PayMongo:** demo/test mode only, no real money. Secret key lives in a
  Supabase Edge Function, never the repo.
- **Email:** no domain owned. Recommendation: **Resend** via its shared
  `onboarding@resend.dev` sender (free, no domain). Brevo is the fallback if
  Gmail deliverability matters. Build provider-agnostic.
- **OTP:** scoped to **first login per device**, not every login.
- **Live auth testing:** approved and performed — see the audit report's
  "Authenticated per-role testing" section.

### Live verification performed against the real backend
- Privilege escalation (customer → admin) is **blocked by a DB trigger**
  (`P0001: role cannot be changed directly`). Audit P2#5 closed.
- RLS read scoping on `profiles` is correct per role.
- An authenticated **admin can write to `court`** (PATCH 200), so the Phase 2
  admin CRUD works at runtime.
- The Phase 2 embedded query `court?select=*,sport(id,slug,name)` returns
  **HTTP 200 with all 9 courts** — the join and ordering are valid.
- Every `court` query uses `select('*')`, never an explicit `rating` column, so
  the code runs correctly **both before and after** `003_court_rating.sql`.

## Constraints and non-goals

- No build step, no framework, no npm. Node is not installed on this machine.
- Never commit a `service_role` key, a PayMongo secret, or any mail provider key.
- Anything requiring elevated DB access ships as a reviewed `.sql` file for the
  owner to run — the Coder cannot and must not execute it.
- Do not invent court prices. Rates come from the `court` table or stay blank
  with the existing `TODO: confirm with Ms. Driz` note.
- The paper's Limitations stand: single branch, network-dependent. Do not build
  multi-branch support or offline mode.

## Success criteria

**Phase 1**
1. A user registered as `<img src=x onerror=alert(1)>` renders as literal text in
   the staff table, the admin staff list, and the customer's own bookings.
2. A `"` in a staff member's name no longer breaks the edit modal's markup.
3. Changing a password fails with a clear error when the current password is wrong.
4. No UI string claims a capability the code does not have.
5. `09171234567` is accepted; `abc` and `123` are rejected, on both signup and settings.
6. The T&C link opens a page containing all five mandated sections.
7. Every visible button either does something or is removed.

**Later phases** — restated at the start of each phase, once its owner decisions
are settled.

## Verification steps

Browser tooling was unavailable this session, so verification is:
- `grep` proof that no unescaped interpolation of user data remains.
- Backend behaviour re-probed with `curl` where the anon key permits.
- `database/qa/001_introspect.sql` results, once the owner runs them.
- **Anything visual remains unverified** and must be checked by the owner, or by
  me in a session where the browser tools actually load.

## Open questions and risks

- **Q1 — PayMongo account?** Blocks Phase 5 entirely.
- **Q2 — Mail provider + verified domain?** Blocks Gmail reminders in Phase 4.
- **Q3 — OTP on every login, as the paper states, or first-login-per-device?**
- **Q4 — May I authenticate against the live project?** The sandbox blocked it;
  without it, role redirects and per-role RLS stay untested.
- **Risk.** No schema file exists in-repo for `profiles`, `booking`, `payment`,
  or `walk_in_booking`. Their real column names and constraints are inferred from
  application code. Phase 2+ SQL may need adjustment once introspection lands.
- **Risk.** The `invite-staff` Edge Function is called but its source is not in
  the repo. If it was never deployed, admin "Add staff" is already broken.
