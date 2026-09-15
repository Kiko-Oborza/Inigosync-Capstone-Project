# Codex handoff — project history doc + portable agent roles

## Goal

Produce, inside the repo, everything a fresh AI assistant (OpenAI Codex) needs
to continue IñigoSync without re-discovering it: a single honest history /
current-state document, a Codex-native project-instructions file, and the four
working roles (orchestrator / coder / researcher / reviewer) ported into the
format Codex actually reads.

## Context and current state

- **Two branches, and `main` is stale.** `main` (= `origin/main`) ends at
  `f2d7ee8`, 2026-08-31. `feature/dashboard-court-slot-widget`
  (= `origin/feature/dashboard-court-slot-widget`) is 16 commits ahead
  (`bdec147` … `9ca87df`, 2026-08-31 → 2026-09-14) and carries every
  September change: customer dashboard Revisions 2–5, owner dashboard A1–A3,
  staff portal S1–S3, migrations `008`–`018`, `Style/typography.css`,
  `includes/imageTools.js`, `includes/businessHours.js`, invite-staff email
  template, `docs/plans/2026-09-08-auth-pricing-booking.md`. Nothing is
  uncommitted or stashed. The working tree was switched to `main` just before
  this session (reflog `HEAD@{0}`).
- **Existing knowledge artifacts** (all on the feature branch; `main` has a
  subset): `implementation_plan.md` (a running log — newest revision on top,
  S3 → S2 → S1 → A3 → A2 → A1 → Rev 5 → Rev 2/3/4, with decision tables and
  post-implementation notes), `docs/QA_AUDIT_REPORT.md` (2026-08-27/28 audit
  incl. live-verified backend findings), `docs/OWNER_ACTION_LIST.md` (items
  A1–A5, B, C, D, E, E2–E4, F, G — things only the owner can do),
  `docs/SPEC_scope_and_limitations.md` (thesis scope text),
  `docs/plans/archive/*` (Aug 30/31 plans), `database/schema/002`–`018`,
  `database/seed/README.md`, `docs/email_templates/*.html`.
- **Claude-side config** in `.claude/`: `agents/{orchestrator,coder,
  researcher,reviewer}.md` (frontmatter: name/description/tools/model/effort),
  `launch.json` (static server: `python -m http.server 8532`),
  `Settings.json` (`"agent": "orchestrator"`), `settings.local.json`
  (permission allowlist — machine-specific, not portable). There is **no**
  `CLAUDE.md`, no `.claude/skills/`, and no user-level `~/.claude/skills/`.
- Stack: static HTML/CSS/vanilla JS + Supabase (anon key only, project
  `xrlwtnwamboucihsamrr`), Chart.js, html2canvas; no build step, no test
  runner; verification = `node --check` + manual browser walkthrough on
  `http://localhost:8532/Pages/…`.

## Approach and architectural decisions

- **H1 — Write the handoff from the feature branch, not `main`.** The
  handoff must describe the code that actually exists. All new files are
  created on `feature/dashboard-court-slot-widget`. The handoff doc states
  the branch situation explicitly and tells the next assistant (and the user)
  that `main` is behind and how to merge when ready. Switching branches is
  safe: the tree is clean and the new files don't exist on either branch.
  *(Requires user confirmation — see Open questions.)*
- **H2 — One document, `HANDOFF.md` at the repo root, is the entry point.**
  It is a *synthesis*, not a copy: it summarises the phases/revisions from
  `implementation_plan.md` and the archived plans into a dated timeline,
  states per-area status (done / partial / not started) with file pointers,
  lists everything still open, and links out to the detailed docs rather than
  duplicating them. Sections: How to run · Architecture & file map ·
  Timeline of work (Aug 19 → Sep 14) · Current status by area · Conventions
  and hard rules · Database migrations status · Open work & known gaps ·
  Blocked-on-owner items (link to OWNER_ACTION_LIST) · How the AI workflow
  works (roles, plan-first, verification) · Branch/git state.
- **H3 — `AGENTS.md` at the repo root is the Codex-native instruction file**
  (Codex reads it automatically). Short and operational: what the project is,
  read `HANDOFF.md` first, how to run/verify, the hard rules (below), the
  plan-first workflow, and how to use the ported roles. This is the file
  Codex will actually obey; `HANDOFF.md` is the reference it points to.
- **H4 — Port the four roles as real Codex subagents (confirmed 2026-09-15
  by researcher against official docs + `openai/codex` source).**
  - Codex's `multi_agent` feature is *Stable* and on by default. Roles are
    declared in `.codex/config.toml` as `[agents.<name>]` with `description`
    and `config_file = "./agents/<name>.toml"`; each role file is a normal
    config layer carrying `developer_instructions` (the ported prompt),
    `model_reasoning_effort`, `sandbox_mode` (`read-only` for researcher and
    reviewer, `workspace-write` for coder), optionally `model`.
  - The **orchestrator is the top-level session**, steered by `AGENTS.md`
    (Codex only delegates via `spawn_agent` when AGENTS.md/skills say to).
    Its prompt content goes into `AGENTS.md` + a `plan-first` skill; also
    declare `[agents.orchestrator]` so it's spawnable if wanted.
  - Skills: `.agents/skills/<name>/SKILL.md` (same Agent Skills spec as
    Claude; frontmatter `name` + `description`). Ship `plan-first`
    (implementation_plan.md template + approval gate + delegation routing)
    and `inigosync-conventions` (the H5 hard rules, verification commands).
    Custom prompts (`~/.codex/prompts`) are deprecated and home-dir only —
    do not use.
  - Effort mapping: `high` → `"high"`, `max` → `"xhigh"` (documented set is
    minimal|low|medium|high|xhigh). Model: leave `model` commented with a
    dated note — the roster moves fast and there are open Codex bugs on
    per-subagent model overrides; inherit the session model by default.
  - `.codex/config.toml` only loads after the user marks the folder trusted
    (stored in `~/.codex/config.toml`, not committable) — document this in
    `HANDOFF.md` as a first-run step.
  - Also produce a **generic, tool-agnostic copy** of the four role prompts
    under `docs/agents/` so they survive any future tool switch.
- **H5 — Hard rules that must survive the tool switch** (captured in
  `AGENTS.md` and `HANDOFF.md`): every `innerHTML` interpolation of user/DB
  text goes through `window.escapeHtml` (two stored-XSS bugs already paid
  for); fetch-with-fallback — the app must work before and after each SQL
  migration is applied; migrations are idempotent and RLS-scoped, shipped as
  files only (never executed by the assistant; no service-role key ever in
  the repo); SQL comments must not contain "table <word>" / "on <word>"
  phrases (Supabase editor scanner); `node --check` on every edited JS;
  keep panel/hook prefixes (`data-dash-*`, `data-admin-*`, `data-staff-*`);
  both themes and 360/768/1280 widths; no invented business figures ("Rate
  TBA" over made-up prices); plan first, approval, then implement; verify
  before reporting.
- **H6 — Do not touch `.claude/`.** The user may come back to Claude; the
  Claude config stays valid. Nothing is deleted.

## Files to change

| File | Intent |
|---|---|
| `HANDOFF.md` (new, root) | The full "what we did / what's next" document (H2). |
| `AGENTS.md` (new, root) | Codex project instructions (H3, H5). |
| `docs/agents/{orchestrator,coder,researcher,reviewer}.md` (new) | Tool-agnostic role prompts (H4). |
| Codex-native role files — exact paths per researcher result (e.g. `.codex/skills/<role>/SKILL.md`, `.codex/config.toml`, and/or `.codex/agents/*.toml`) | The reusable roles in the form Codex loads (H4). |
| `.gitignore` | Only if Codex writes machine-local state under `.codex/` that shouldn't be committed. |
| `implementation_plan.md` (feature branch) | Prepend a short "Codex handoff (2026-09-15)" entry so the running log stays complete — consistent with how every earlier revision was logged. |

## Constraints and non-goals

- No application code, CSS, SQL, or docs-content changes beyond the files
  above. This is a documentation/config task only.
- Do not merge `main` and the feature branch, do not push, do not delete or
  rewrite `.claude/`.
- `HANDOFF.md` must be *truthful*: every "done" claim must be traceable to a
  commit, a decision table entry, or a post-implementation note. Where a
  status is uncertain (e.g. whether the owner has run migrations, whether
  a feature was browser-verified), say "unverified" rather than guessing.
- Do not paste the whole `implementation_plan.md` into `HANDOFF.md`;
  summarise and link.
- Do not include secrets. The anon key in `Config/supabaseClient.js` is
  public by design; note that fact, do not copy it into docs.

## Success criteria

1. `HANDOFF.md` exists on the feature branch, and a reader with no prior
   context can answer from it alone: how to run the app, what each file/dir
   is for, what was built in each dated phase/revision, what is still open,
   what the owner must do, and which branch is current.
2. `AGENTS.md` exists at the root, ≤ ~150 lines, and contains every hard rule
   in H5 plus the run/verify commands and the plan-first workflow.
3. All four roles exist in the Codex-native format the researcher confirmed,
   with frontmatter valid for that format, and the prompt content preserved
   (same responsibilities, escalation rules, report structure).
4. Tool-agnostic copies exist under `docs/agents/`.
5. `.claude/` is byte-identical to before (`git diff --stat -- .claude` is
   empty).
6. `git status` on the feature branch shows only the intended new/changed
   files; `main` is untouched.
7. Every file path and commit hash cited in `HANDOFF.md` actually exists
   (`git cat-file -e` / `ls` spot-check by the reviewer).

## Verification steps

- `git branch --show-current` → `feature/dashboard-court-slot-widget`.
- `git status --short` → only the files in the table above.
- `git diff --stat main -- .claude` → empty.
- Spot-check 10 cited paths/hashes from `HANDOFF.md` against the tree/log.
- Read `AGENTS.md` top-to-bottom for the H5 rule list.
- Validate SKILL.md / TOML frontmatter against the schema the researcher
  reported (field names, required keys).
- `reviewer` pass on the diff: accuracy of status claims in `HANDOFF.md`
  against `implementation_plan.md` post-implementation notes and the QA
  audit; no over-claiming.

## Open questions and risks

- **Q1 (needs user):** confirm creating the handoff on
  `feature/dashboard-court-slot-widget` (H1). Alternative is to write it on
  `main`, which would be inaccurate — not recommended.
- **Q2 (needs user):** should the handoff also be merged into `main` now?
  Default: no — leave branch state as-is and document it; merging is a
  separate, user-initiated decision.
- **Risk:** Codex's subagent story changes fast; whatever format the
  researcher confirms today is dated in the files themselves so the user
  knows when to re-check. The `docs/agents/` copies are the hedge.
- **Risk:** The running `implementation_plan.md` has decision IDs (D1, E1–E6,
  B1–B7, C1–C5, S1–S14) that code comments cite. `HANDOFF.md` must keep
  those IDs when referring to decisions so the comments stay resolvable.
