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
