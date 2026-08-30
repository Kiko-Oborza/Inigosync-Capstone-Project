# Loop & Agent Redesign — build the gate, close the open loop

## Goal

Right now the `coder` agent is the only thing judging whether the `coder`
agent finished — there is no test, lint, build, or `Stop` hook anywhere in
this repo. Close that loop: add a zero-model-token verification gate (static
checks + browser smoke tests), wire it to Claude Code's `Stop` hook with a
turn ceiling so a red run can never silently read as done, fix the config bug
that makes the hook invisible on non-Windows machines, and tighten the four
agent definitions (`orchestrator`, `coder`, `researcher`, `reviewer`) so the
loop and the roles built to run inside it agree with each other.

This plan **does not** fix the QA audit's P0/P1/P2 findings (court-list
duplication, dead handlers, hardcoded stats, stored XSS, etc.). It builds the
mechanism that will verify those fixes once a later task starts on them. That
sequencing is deliberate: a gate is only trustworthy if it existed before the
work it's grading.

## Context and current state

Source of this plan: a prior planning session (`cse_014JWBJodtJNU2pzSR3dte1n`)
produced a full design doc, pasted into this session verbatim. I re-verified
its factual claims against the live repo (currently at commit `16937df`,
clean working tree except the archive move below) before turning it into this
plan. Findings:

- **Confirmed as described:**
  - `.claude/Settings.json` is capital-S. Claude Code reads
    `.claude/settings.json` (lowercase). It loads on Windows (case-insensitive
    filesystem) and is silently ignored everywhere else — Linux, macOS, CI,
    cloud sandboxes.
  - No `Stop` hook, no `maxTurns` on any agent, no `package.json`, no test/lint/
    build of any kind. [.claude/agents/coder.md:48](.claude/agents/coder.md:48)
    tells the Coder to "run the tests / linter / build" — commands that name
    nothing that exists, so the instruction is satisfied by doing nothing.
  - [includes/owner_dashboard.js](includes/owner_dashboard.js) has 6
    `console.log(… placeholder …)` handlers (lines 385, 877, 884, 925, 932,
    957).
  - [Pages/owner_dashboard.html:169-190](Pages/owner_dashboard.html:169)
    ships admin stat tiles hardcoded to `102` / `14` / `8` / `4` with no
    `data-*` binding.
  - Court data is defined in four places independently
    ([includes/courts-data.js](includes/courts-data.js),
    [includes/courtsData.js](includes/courtsData.js),
    [includes/landingPage.js](includes/landingPage.js), plus inline literals
    in `Pages/owner_dashboard.html` / `Pages/user_dashboard.html`) — the "one
    court source of truth" defect is real.
  - `implementation_plan.md` had grown to 2,288 lines as an append-only log.
    Archived (see below) as part of this change.
- **Already fixed since the audit/plan doc were written** (repo moved on;
  the design doc's citations are now stale on these two points, though its
  conclusions don't depend on them):
  - The false "bookings arrive already paid through PayMongo" claim is gone.
    `Pages/staff_dashboard.html:102` is now a generic subtitle; repo-wide
    search for `PayMongo`/`already paid` returns nothing.
  - The Terms & Conditions link is no longer dead —
    [Pages/Index.html:639](Pages/Index.html:639) links to a real
    [Pages/terms.html](Pages/terms.html) (327 lines). Content completeness
    against the 5 mandated topics is unverified and stays out of scope here.
  - JS file count is 13, not 15 (minor drift, doesn't affect the design).
- **New finding, not in the original doc — changes how this must be built:**
  My own Bash tool session in this project has a broken `PATH`: `node` is
  installed at `C:\Program Files\nodejs\node.exe` (confirmed working,
  v24.20.0) but that directory is **not on `PATH`** in this shell. Bare
  `python` / `python3` resolve to the Windows Store app-execution-alias stub
  ("Python was not found; run without arguments to install...") instead of
  the real interpreter — the working install is `py -3` / the launcher, or
  the full path into `AppData\Local\Programs\Python\Python39`. The design
  doc's honesty table says "Tools present? PASS" for Node 22 / Python 3.11;
  that's true of the *machine*, but bare command names do not reliably
  resolve to them in the shell Claude Code's Bash tool actually uses here,
  and the installed Python is 3.9, not 3.11. Any command this gate runs —
  in `static.py`, in the `Stop` hook's command string, in `package.json`
  scripts — must be written defensively (resolve an interpreter explicitly,
  don't assume `node`/`python`/`python3` resolve) or it will fail exactly
  the way finding #1 (Settings.json casing) already failed: silently, on a
  platform difference nobody was looking at.

## Approach and architectural decisions

Adopting the redesign doc's architecture as-is, with the amendments noted
inline.

### 1. The gate — two layers, zero model tokens

**Layer 1 — `.claude/gate/static.py`.** Fast, deterministic, no browser:

| Check | Rule |
|---|---|
| JS parses | `node --check` on every tracked `.js` file |
| No placeholder handlers | no `console.log(… placeholder …)` under `includes/` |
| Stat tiles bound | every `*-stat-value` has a `data-*` attr, not a bare numeric literal |
| No dead required links | no `href="#"` on a link a `required` input depends on |
| No raw user HTML | `innerHTML` assignment touching `full_name`/`contact_num`/`courts`-shaped data fails |
| One court source of truth | court-name/rate literals defined in exactly one file |
| No unbacked claims | a capability named in HTML text requires a matching JS call in the same page's script graph |
| Migrations idempotent | every `database/schema/*.sql` file uses `IF NOT EXISTS` / `OR REPLACE` |

**Layer 2 — `.claude/gate/smoke.spec.js`.** Playwright, against
`python -m http.server 8532` (or the resolved-explicitly equivalent) serving
the repo root per [.claude/launch.json](.claude/launch.json):

- every page in `Pages/` loads with zero console errors
- landing page renders ≥1 court card sourced from Supabase, with type **and**
  hourly rate
- login rejects a bad password with a visible error
- customer dashboard court names match landing page court names
- staff booking table renders an Actions cell with ≥1 enabled control on a
  real row
- no `data-*`-bound stat tile still shows its literal default after data loads

**Orchestration — `.claude/gate/run.py`.** Runs Layer 1; only runs Layer 2 if
Layer 1 passes (fail fast, keep the common case cheap). Reads the hook's
stdin JSON for `session_id`, keeps a per-session block counter under
`.claude/gate/.state/<session_id>.json` (gitignored). On red: increments the
counter, prints the failing checks to stderr, exits `2` (blocks the stop,
Claude Code feeds the stderr back and forces another turn) — up to 25 times.
On the 26th still-red evaluation for that session: prints a loud
`CEILING HIT — STILL RED` banner and exits `0` (lets the turn end), so an
exhausted run can never be mistaken for a successful one. On green: resets
the counter, exits `0`.

Explicitly **not** `if stop_hook_active: exit 0` — that shortcut blocks
exactly once and waves everything through after, which is worse than no gate
because it *looks* like one.

### 2. Wiring — `.claude/settings.json`

```json
{
  "agent": "orchestrator",
  "hooks": {
    "Stop": [
      { "matcher": "", "hooks": [
          { "type": "command", "command": "<resolved interpreter> .claude/gate/run.py" } ] }
    ]
  },
  "permissions": {
    "deny": ["Edit(.claude/gate/**)", "Write(.claude/gate/**)"]
  }
}
```

`git mv .claude/Settings.json .claude/settings.json` first — this is the fix
for the casing bug, not a new file. The `deny` rule is maker/checker
separation made mechanical: whatever agent is writing product code cannot
edit the thing grading it. `<resolved interpreter>` must be settled by the
Coder based on the PATH finding above, not assumed.

### 3. Agent changes

| Agent | maxTurns | Change |
|---|---|---|
| `orchestrator` | 40 | New plans go to `docs/plans/<module>.md`, not a growing root file; `reviewer` becomes mandatory (not discretionary) for auth/payment/RLS-touching work; "done" is redefined as a green gate run, not a self-report |
| `coder` | 25 | Verification section stops naming tools that don't exist; names the real, resolved gate command; explicit rule against weakening a gate check, backed by the `deny` permission so it's enforced, not just requested |
| `reviewer` | 15 | Adopts the QA audit's P0–P3 severity ladder so findings drop straight into `docs/QA_AUDIT_REPORT.md`-style output unchanged |
| `researcher` | 20 | `effort: max` → `effort: high` — max effort on Sonnet for repo reading is overpay |

No fifth "gatekeeper" agent — that would put a model back in the judging
seat, which is the entire thing this removes.

### 4. Plan-file convention change

`implementation_plan.md`'s 2,288 lines (landing-page redesign plan with the
prior QA remediation plan appended underneath it) is archived verbatim to
[docs/plans/archive/2026-08-30-landing-page-and-qa-remediation-plan.md](docs/plans/archive/2026-08-30-landing-page-and-qa-remediation-plan.md)
(done, via `git mv`, ahead of this delegation — no content lost). This file
you're reading now is the last plan written to project-root
`implementation_plan.md` under the old convention. Going forward, per the
updated `orchestrator.md`, new task plans live at `docs/plans/<module>.md`.

## Files to change

- `.claude/gate/static.py` — new, Layer 1 checks above
- `.claude/gate/smoke.spec.js` — new, Layer 2 checks above
- `.claude/gate/run.py` — new, orchestration + ceiling + per-session state
- `.claude/gate/.state/` — new, gitignored
- `.claude/settings.json` — renamed from `.claude/Settings.json` via `git mv`, hooks + deny added
- `package.json`, `package-lock.json` — new, Playwright as devDependency, `gate`/`test` scripts
- `.gitignore` — add `node_modules/`, `.claude/gate/.state/`, Playwright's `test-results/`/`playwright-report/`
- `.claude/agents/orchestrator.md` — maxTurns, plan-location convention, mandatory-reviewer rule
- `.claude/agents/coder.md` — maxTurns, real verification command, no-weakening-the-gate rule
- `.claude/agents/reviewer.md` — maxTurns, P0–P3 severity ladder
- `.claude/agents/researcher.md` — maxTurns, effort high

## Constraints and non-goals

- Do not fix any QA audit P0/P1/P2 item in this task. Building the gate and
  starting the module queue are sequenced separately on purpose (see verdict
  above). The next task, not this one, is "collapse the three/four
  contradictory court lists" (audit P0 #8, module-queue item 1).
- No scheduled tasks or cron — this is a conditional gate, not calendar
  automation.
- No LLM judge anywhere in the gate — it must stay at zero model tokens and
  be un-foolable by a persuasive report.
- No parallel Coder lanes — 13 JS files are heavily coupled; splitting them
  invites collisions, not speed.
- Don't rewrite the four agent prompts wholesale. They're sound; the fix is
  ceilings, a real verification command, and a real gate to point at — not a
  new voice.
- Bare `node` / `python` / `python3` must not be assumed to resolve in any
  script or hook command this task adds (see PATH finding above). Resolve
  explicitly and defensively.

## Success criteria

1. `.claude/settings.json` (lowercase) exists with valid JSON; `.claude/Settings.json` is gone (renamed, not duplicated).
2. `python .claude/gate/static.py` (via whatever interpreter the Coder confirms actually resolves) runs standalone and exits non-zero on the current repo, printing which checks failed.
3. Running the gate against **today's unmodified code is RED**, and the failing checks include at minimum: the 6 placeholder `console.log` handlers and the hardcoded `102/14/8/4` admin stat tiles. (A gate that reports green on a repo with known-incomplete requirements is broken — this is the doc's own second proof.)
4. Injecting a fresh, isolated defect — the doc's proof step: hardcode `Pages/staff_dashboard.html`'s `bookings-today` stat tile to a literal `47` — makes the relevant Layer 1 check fail with a clear message; reverting it clears that specific check. (Full-repo green is out of scope — see constraints.)
5. `.claude/gate/run.py` correctly implements the 25-block ceiling and per-session counter, verified by direct invocation with crafted stdin JSON (not by relying on an untested live hook firing), and does **not** use the `stop_hook_active` shortcut.
6. `permissions.deny` in `.claude/settings.json` actually blocks `Edit`/`Write` under `.claude/gate/` — verified by attempting one and confirming it's refused.
7. All four agent files updated per the table above; each retains valid frontmatter (`name`, `description`, `tools`, `model`, `effort`, `color`, plus the new `maxTurns`).
8. `package.json` installs cleanly (`npm install`) and Playwright can launch Chromium in this environment.
9. No secrets, and nothing under `node_modules/` or `.claude/gate/.state/` committed.

## Verification steps

- `git status` / `git diff` — confirm the archive move landed and no unrelated files changed.
- Direct invocation of `.claude/gate/run.py` with a hand-crafted stdin JSON payload (mimicking Claude Code's `Stop` hook input, including a `session_id`) to observe the exit code and stderr on both a red and a green(-per-check) run, without depending on whether `Stop` hooks fire for subagent turns or only top-level ones (genuinely uncertain in this runtime — see open questions).
- `node --check` on each `.js` file directly, to confirm the baseline the gate's own check relies on.
- `npx playwright test .claude/gate/smoke.spec.js` against the static server on 8532, at least once, to confirm the harness itself runs (individual smoke assertions are expected to fail against today's code — that's correct, not a bug to fix here).
- Attempt an `Edit` under `.claude/gate/` as a sanity check that `permissions.deny` actually refuses it.

## Open questions and risks

- **Does the `Stop` hook fire on a subagent's (the Coder's) turn ending, or only at the top-level session's turn end?** Genuinely unclear in this runtime. If it's subagent-scoped, the Coder's own final report in this task will trigger the real gate live, red, against ~23 known pre-existing gaps, and the ceiling logic will run for real before this task is even reviewed. If it's top-level-only, the first real live enforcement will be when I (the orchestrator) finish synthesizing this task's results back to the user — which, once `.claude/settings.json` is live, could itself trip the ceiling. Either way: **once this task lands, the very next turn-end in this project is red by design**, per the doc's own "must go red before any fix" proof. That is expected, not a malfunction, but it does mean the practical next step right after this lands should be starting the module queue (audit P0 #8 — collapse the court lists), not a separate approval cycle. I'm flagging this now rather than after the fact: expect visible blocking/ceiling behavior on the turn immediately following this change, in this or the next session.
- **Interpreter resolution.** The Coder must confirm, empirically, which command actually resolves `node`/a Python 3.9+ interpreter in the context the `Stop` hook's command string runs in (which may not be identical to an interactive Bash tool session) — full paths or an explicit `PATH` prefix in the hook command may be required. Do not ship a hook command that only works in one shell context and fails silently in another — that's the exact bug this task exists to fix.
- **`terms.html` content completeness** against the 5 mandated T&C topics is unverified — out of scope here, worth a note for whoever picks up the module queue.
- **Playwright/Chromium install size and first-run download** — first `npx playwright install` may need network access; confirm it's available in this environment before relying on Layer 2 for the red/green proof.
