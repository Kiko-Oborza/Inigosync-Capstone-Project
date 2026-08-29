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
