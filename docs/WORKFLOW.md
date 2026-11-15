# How a milestone is built

*(Designer, 2026-10-11.)* From M4.3 step 5 on, each milestone runs in three phases with three designer gates.
An Opus orchestrator plans, writes the shared contract, hands work packages to Sonnet workers in their own git
worktrees, then merges and validates. The plan that set this up, and why, is summarised at the end.

**Autonomous run** *(Designer, 2026-10-22)*: for the rest of M4 (M4.3 step 5, M4.4, M4.5) no phase stops for the
designer. Gate 1 becomes the orchestrator's recommendation, recorded under "Decided without the designer" in the
spec; QA1 becomes e2e checks plus an automated QA pass (findings logged in `docs/QA.md` as automated); QA2 becomes
`/simplify`, the full `npm run e2e` and a retest list in the PR. Each sub-milestone is pushed with a PR (stacked on
the one before) but **never merged**: the designer merges. Handoffs still need the designer's `/clear` + `go`.

## The three phases

**1. Draft** (orchestrator with the designer). `docs/M<n>/M<n>.md` holds the goals, every open decision as
options with a recommendation, design sheets in `design/` for anything visual, the draft hand-test list and the
**work breakdown** (below).
→ **Gate 1: the designer approves.** Nothing else stops for the designer until QA1. A question that comes up
while building takes the recommended default where that's safe and is listed for QA1; only a truly blocking
question waits.

**2. Build** (no designer).
- **Contract first.** The orchestrator commits what every work package builds on before any worker starts:
  engine dataclasses, `protocol.ts` types, bridge and worker stubs, request kinds, CSS tokens, registry entries,
  shared helpers. Workers branch from the milestone branch's HEAD (`worktree.baseRef: "head"`), so they see
  only committed work.
- **Waves.** Each wave's work packages run as background workers, at most 3-4 at once. Each one is merged and
  validated as it lands (chain B).
- **Feature-complete.** e2e checks for everything a player can see, the full `npm run e2e`, push, open the PR,
  and post the QA1 hand-test list. → **Gate 2: designer QA1** (findings go in `docs/QA.md`).

**3. QA** (no designer until QA2). The orchestrator turns findings into QA-NNN items and fixes them: small ones
itself, larger ones as work packages. Each fix gets an e2e check. Then **`/simplify` on the whole milestone
diff**, the full `npm run e2e`, and a retest list (the fixes plus anything `/simplify` changed that a player could
notice). → **Gate 3: designer QA2.** Fixes from QA2 follow the usual QA-fix path, with no second pass. Then the
merge commit and the "status rows" commit on `main`.

## Who does what

| | Orchestrator (Opus 5.5, xhigh) | `implementer` (Sonnet, medium) | `implementer-deep` (Sonnet, high) |
|---|---|---|---|
| Work | drafts, contracts, merges, reviews, QA triage, small fixes, level content | UI, plumbing, pure modules, unit tests | engine and algorithms, protocol changes, e2e checks |
| Where | the main checkout, on the milestone branch | its own worktree under `.claude/worktrees/` | the same |

**Level content never goes to workers:** boards, hints, lessons and references are written by the orchestrator
through the blind generators (CLAUDE.md).

## Work breakdown

Each work package (WP) in `M<n>.md` has: an id (`M4.3-5a`), a tier, the **files it owns**, the contract it builds
on, acceptance criteria, its validation commands, and what it depends on. Packages that touch the same file go in
different waves, or into the contract. Size each one to finish well under 150k tokens of a worker's context;
anything bigger is split.

### Brief template (the prompt a worker receives)

```
WP <id>: <title>                      Tier: implementer | implementer-deep
Milestone branch: <branch> at <sha>   (your worktree starts here)

Goal: <one paragraph: what the player or the code gains>
Contract you build on: <types, requests, classes, routes already committed; file:line pointers>
You own: <files you may edit>          You may create: <new files>
Append-only: scripts/vulture_allowlist.py, knip.json
Don't touch: everything else (list the near misses explicitly)

Acceptance criteria:
1. <observable behaviour, each one testable>
Tests to write: <which files, which cases>
Rules that bite here: <the CLAUDE.md rules this WP is most likely to break>
Validation: npm run worktree:setup; targeted tests; npm run check (exit code 0)
Commit attribution line: <the line from the session's reminder>
Report: the template in .claude/agents/implementer.md
```

## Validation chains

**Chain A, the worker** (in `.claude/agents/implementer.md`): setup → tests for every criterion → only owned
files → `npm run check` judged by its exit code → self-review of the diff → commit on its branch (never push) →
the fixed report.

**Chain B, the orchestrator, for each WP:**
1. `git merge --no-ff <wp-branch>` into the milestone branch (keeps where each change came from), then
   `git worktree remove <path>`. The branch is kept, like every merged branch.
2. `npm run check`: exit 0 on the merged tree.
3. Contract audit: `protocol.ts` against the engine's dataclasses; `Requests`, `handlers` and `bridge.py`;
   the allowlists.
4. Review the diff (`/code-review` at medium for a large WP, otherwise a targeted read). Small fixes are made
   directly; bigger ones go back to the same worker (SendMessage) or to a fresh one.
5. Targeted e2e for the touched area (`npm run e2e -- --only=<suite>`), dev server on the main checkout. **Never
   merge while e2e is running**: it reloads Vite and fails checks.
6. "As built" in `M<n>.md`; the WP table in `handoff.md`.

## Context management

Sessions don't compact (`autoCompactEnabled` is off); they restart from `handoff.md`.

- **Orchestrator:** hands off at 300k tokens of context (ceiling 350k). The context guard
  (`.claude/hooks/context-guard.mjs`) warns after each tool call from 300k: finish the unit of work, commit,
  rewrite the Resume card at the top of `handoff.md`, and end the turn with **HANDOFF READY**. Its Stop hook
  refuses to stop once until `handoff.md` has changed. The designer then types `/clear` and `go`; the
  SessionStart hook injects the Resume card. If nobody is around, work simply waits.
- **Workers:** stay under 150k. Past it the guard tells them to commit work in progress and report `partial`;
  the orchestrator starts a fresh worker from that branch. No designer action needed.
- **The Resume card** (at most about 60 lines at the top of `handoff.md`): phase, milestone, branch, the WP table
  (id, tier, status, branch, last commit), the next action, open questions for the next gate.

If handoffs turn out to be frequent, the restart can be automated later (a relay session that restarts the
orchestrator as a subagent, or a headless `claude -p` loop).

## Guards and tools

| File | What it does |
|---|---|
| `.claude/settings.json` | worktrees branch from HEAD; the hooks below; a permission allowlist so background workers don't stall |
| `.claude/hooks/spoiler-guard.mjs` | PreToolUse: denies reading or printing `solutions/` and `levels/` (and, for workers, the generators), and patches that would carry them |
| `.claude/hooks/context-guard.mjs` | PostToolUse warnings at 300k/340k (workers 150k); the Stop gate |
| `.claude/hooks/session-start.mjs` | on startup and `/clear`: read `handoff.md` first, with its Resume card |
| `.claude/hooks/hooks.test.mjs` | their tests (`npm run test:hooks`, part of `npm run check`) |
| `.worktreeinclude` | copies `node_modules/`, `.venv/` and `public/pyodide/` into new worktrees |
| `scripts/worktree-setup.mjs` | `npm run worktree:setup`: checks a worktree's dependencies, copies what's missing |
| `scripts/show_level.py` | prints a level with hints, passphrases and solutions hidden |

## Why (2026-10-11)

The per-step hand tests inside each sub-milestone were the bottleneck; three gates per milestone replace them.
Worktrees (not separate repos) keep one `.git` and native merges. A Stop hook can't watch the context, so a
PostToolUse hook does, and the Stop hook gates the handoff; no hook can run `/clear`, hence `/clear` + `go`.
`/simplify` runs before QA2 so nothing reaches the site unplayed (the M3.2 lesson). Workers are sized so they
never need the restart cycle. The first run (the pilot) is M4.3 step 5; afterwards its designer time,
wall-clock time and QA findings are compared with M4.2's before M4.4.
