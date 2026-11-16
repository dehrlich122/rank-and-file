# How a milestone is built

*(Designer, 2026-10-11; three levels of agents from 2026-11-15.)* Each milestone runs in three phases with three
designer gates. A Fable orchestrator plans and coordinates; Opus agents develop and review; Sonnet workers build
scoped packages. Every agent works in its own git worktree. Why it is set up this way is at the end.

**The principle** *(Designer, 2026-11-15)*: more done per unit of usage, never faster. Nothing is time-sensitive, so
the cheaper route wins even when it is slower: the smallest model that fits, one package at a time, checks that cost
no tokens before any that do.

**Autonomous run** *(Designer, 2026-10-22)*: for the rest of M4 no phase stops for the designer. Gate 1 becomes the
orchestrator's recommendation, recorded under "Decided without the designer" in the spec; QA1 becomes e2e checks plus
an automated QA pass (findings logged in `docs/QA.md` as automated); QA2 becomes the `/simplify` pipeline, the full
`npm run e2e` and a retest list in the PR. Each sub-milestone is pushed with a PR but **never merged**: the designer
merges. Handoffs still need the designer's `/clear` + `go`.

## The three phases

**1. Draft** (orchestrator with the designer). `docs/M<n>/M<n>.md` holds the goals, every open decision as
options with a recommendation, design sheets in `design/` for anything visual, the draft hand-test list and the
**work breakdown** (below).
→ **Gate 1: the designer approves.** Nothing else stops for the designer until QA1. A question that comes up
while building takes the recommended default where that's safe and is listed for QA1; only a truly blocking
question waits.

**2. Build** (no designer).
- **Contract first.** What every work package builds on is committed before any worker starts: engine dataclasses,
  `protocol.ts` types, bridge and worker stubs, request kinds, CSS tokens, registry entries, shared helpers. The
  contract is code, so an Opus agent writes it from the spec. A worktree starts from its spawner's HEAD, so an
  agent sees only committed work.
- **One package at a time**, each merged and validated as it lands. Two or three at once only when they share no
  file and nothing one builds is needed by another.
- **Feature-complete.** e2e checks for everything a player can see, the full `npm run e2e`, push, open the PR,
  and post the QA1 hand-test list. → **Gate 2: designer QA1** (findings go in `docs/QA.md`).

**3. QA** (no designer until QA2). The orchestrator turns findings into QA-NNN items and hands each fix out as a
work package. Each fix gets an e2e check. Then the **`/simplify` pipeline on the whole milestone diff** (below), the
full `npm run e2e`, and a retest list (the fixes plus anything `/simplify` changed that a player could notice).
→ **Gate 3: designer QA2.** Fixes from QA2 follow the usual QA-fix path, with no second pass. Then the merge commit
and the "status rows" commit on `main`.

## Who does what

| | Fable (orchestrator) | Opus `lead` | Opus `reviewer` | Sonnet `implementer` / `implementer-deep` |
|---|---|---|---|---|
| Work | design with the designer, specs, the work breakdown, briefs, choosing the level for each job, merges, the free checks, the gates, docs, level content | development that needs judgment (an investigation, a contract, a cross-cutting change); leading a job split into Sonnet packages; the `/simplify` pipeline | every code and feature review, read-only, on a prepared diff | one scoped package: UI, plumbing, pure modules and unit tests (medium effort); engine, protocol and e2e checks (`-deep`, high effort) |
| May delegate | to Opus and to Sonnet | to Sonnet only | no | no |
| Where | the main checkout, on the milestone branch | its own worktree, from the milestone branch | read-only | its own worktree, from its spawner's branch |

**Fable coordinates only.** It does no development and no review. After a merge it reads the report, the list of
files changed and the checks' exit codes; a judgement about code goes to a `reviewer`.

### Fable's own edits

- **Always its own:** docs (specs, milestone docs, `docs/QA.md`, this file, `CLAUDE.md`), `handoff.md`, memory, and
  level content (next section).
- **Code, only when all of these hold:**
  1. It came up in Fable's own job: a conflict while merging, or a check that fails right after a merge (an unused
     export, a stale import, an allowlist line, a typo).
  2. The failing output already says what is wrong and what fixes it. Nothing to investigate, no choice to make.
  3. It is about 20 lines or fewer, in files the merge already touched.
- **Never:** a QA item, a feature, a review finding, or anything that came from a plan, however short the fix turns
  out to be. **If it could have been a brief, it is a brief.**
- **Every use is logged** as a ledger row ("Fable edit": file, lines, why). More than two in one milestone is
  reported to the designer at the next gate, so the allowance cannot quietly grow.

### Level content

**Level content never goes to an agent** *(Designer, 2026-11-15: a named exception to "coordinates only")*: boards,
hints, lessons and references are written by the orchestrator through the blind generators (CLAUDE.md). The spoiler
guard keeps agents out of the generators.

## Choosing the level

Start each job at the cheapest level that plausibly fits, and move it up only when a report comes back partial or
wrong.

| The job | Goes to |
|---|---|
| One scoped package: named files, clear acceptance criteria | Fable → Sonnet, directly |
| Needs investigation, a design judgment, or a contract others build on | Fable → Opus `lead`, who does it itself |
| Several packages that depend on each other or share files; `/simplify` | Fable → Opus `lead` → Sonnet workers |
| A review | Fable (or a lead) → Opus `reviewer` |

- Every agent pays about 40k tokens before it does anything (the dry run of 2026-11-15: a lead and one worker cost
  about 100k for a two-file job). A lead is worth it from about three packages, or when the job needs its judgment.
- A worker that reports `partial` because it ran out of room is followed by a fresh worker from its branch. One that
  reports `partial` or `blocked` because the approach was wrong goes up a level.

## Work breakdown

Each work package (WP) in `M<n>.md` has: an id (`M4.3-5a`), a level, the **files it owns**, the contract it builds
on, acceptance criteria, its validation commands, and what it depends on. Packages that touch the same file run one
after the other. Size each one to finish well under 150k tokens of an agent's context; anything bigger is split.
What has worked: few named files with line pointers, "read only these files", one or two fixes per package, and
code in one package with its e2e checks in the next.

### Brief template (the prompt an agent receives)

```
WP <id>: <title>          Level: implementer | implementer-deep | lead (may delegate: yes | no)
Milestone branch: <branch> at <sha>   (your worktree starts here)

Goal: <one paragraph: what the player or the code gains>
Already known / ruled out: <facts, so nothing is rediscovered>
Contract you build on: <types, requests, classes, routes already committed; file:line pointers>
Read only: <the files worth reading>
You own: <files you may edit>          You may create: <new files>
Append-only: scripts/vulture_allowlist.py, knip.json
Don't touch: everything else (list the near misses explicitly)

Acceptance criteria:
1. <observable behaviour, each one testable>
Tests to write: <which files, which cases>
Rules that bite here: <the CLAUDE.md rules this WP is most likely to break>
Validation: npm run worktree:setup; targeted tests; npm run check (exit code 0)
Budget: stop and report `partial` at about 150k tokens
Commit attribution line: <the line for the agent's model>
Report: the template in the agent's definition (.claude/agents/)
```

## Merging across three levels

- A worker's worktree starts from the HEAD of whoever spawned it. So a lead **commits what its workers build on
  before it spawns them**, and its workers branch from the lead's branch.
- **The lead merges its workers** (`--no-ff`, into its own branch), validates each (chain B) and reports once.
- **Fable merges only what it spawned**: a lead's branch, or a direct worker's. It never touches a lead's workers
  or their branches.
- After a merge the worktree is removed. Branches are kept, like every merged branch.

## Validation chains

**Free checks come first.** `npm run check` and the e2e suites cost no tokens, so they run before any model reads
a diff. The e2e runner restarts Chrome and reruns a suite by itself; a run is judged by its last line and its exit
code, and nobody reads the log unless that line says something failed.

**Chain A, the worker** (in `.claude/agents/implementer.md`): setup → tests for every criterion → only owned
files → `npm run check` judged by its exit code → self-review of the diff → commit on its branch (never push) →
the fixed report.

**Chain B, the lead, for each of its workers:**
1. `git merge --no-ff <worker-branch>` into the lead's branch, then `git worktree remove <path>`.
2. `npm run check`: exit 0 on the merged tree.
3. Read the diff against the brief: only owned files, every criterion met, the contract kept (`protocol.ts` against
   the engine's dataclasses; `Requests`, `handlers` and `bridge.py`; the allowlists). Small fixes are the lead's
   own; bigger ones go back to the same worker or to a fresh one.
4. A ledger row for the worker, from its completion notice.

**Chain C, the orchestrator, for each branch it spawned:**
1. `git merge --no-ff <branch>` into the milestone branch, then `git worktree remove <path>`.
2. `npm run check`: exit 0 on the merged tree.
3. The report against the brief: status, files changed (`git diff --stat`) inside what the package owned, every
   criterion answered.
4. Targeted e2e for the touched area (`npm run e2e -- --only=<suite>`), dev server on the main checkout. **Never
   merge while e2e is running**: it reloads Vite and fails checks.
5. A review only where the free checks can't judge: a direct worker's engine or protocol package, or a change a
   player sees that has no check yet. One `reviewer`, on the diff saved to a file.
6. "As built" and the ledger rows in `M<n>.md`; the WP table in `handoff.md`.

## Reviews and the /simplify pipeline

**A review** is one Opus `reviewer`, read-only, on a diff prepared as a file
(`git diff <base>...HEAD -- . ':!levels' ':!solutions' ':!lessons'`), with the question it is asked to answer. Two
reviewers only for a milestone-wide diff (above about 3,000 lines), each with its own lens: correctness and
contract; reuse and simplification. It returns findings, never edits.

**`/simplify`** (the QA2 pass) is led by an Opus `lead`:
1. Fable saves the milestone diff to a file and briefs the lead, after `npm run check` and the full e2e are clean.
2. The lead reviews it (itself, or with one or two `reviewer`s for a large diff).
3. It sorts the findings: **apply**, **leave** (with the reason), **the designer's call**.
4. It splits "apply" into packages by the files they own, one after another where they share a file.
5. Sonnet workers build them from the lead's branch; the lead runs chain B on each.
6. It reports once: what was applied, what was left and why, the designer's calls, anything a player could notice
   (for the retest list), and the ledger rows.
7. Fable runs chain C, then the full e2e, and writes the retest list.

## The ledger

Each milestone doc keeps one table, a row per package, so the cost of a merged package is visible:

| WP | Agent | Tokens | Outcome |
|---|---|---|---|
| `<id>` what it was | model and effort | from the completion notice | done / partial / blocked; merge commit |

A lead reports its workers' rows. A Fable edit (above) gets a row too.

## Context management

Sessions don't compact (`autoCompactEnabled` is off); they restart from `handoff.md`.

- **Orchestrator:** hands off at 150k tokens of context (ceiling 200k). The context guard
  (`.claude/hooks/context-guard.mjs`) warns after each tool call from 150k: finish the unit of work and run the
  **`handoff` skill** (check the tree, `npm run check`, commit what is finished, rewrite the Resume card to its
  template, print the next action, end with **HANDOFF READY**). Its Stop hook refuses to stop once until
  `handoff.md` has changed. The designer then types `/clear` and `go`.
- **Starting:** the SessionStart hook injects the Resume card and points to the **`start-session` skill** (check the
  card against `git status`, the log, `git worktree list`, the dev server and open PRs; list what is waiting on the
  designer; carry on from the next action).
- **Leads and workers:** stay under 150k. Past it the guard tells them to commit work in progress and report
  `partial`; whoever spawned them starts a fresh agent from that branch. No designer action needed.
- **The Resume card** (at most about 40 lines at the top of `handoff.md`, a fixed template): phase, milestone,
  branch, the WP table (id, level, status, branch, last commit), the next action, what is waiting on the designer.

## Guards and tools

| File | What it does |
|---|---|
| `.claude/agents/` | `lead` and `reviewer` (Opus), `implementer` and `implementer-deep` (Sonnet, no delegating) |
| `.claude/skills/` | `handoff` (end of a session) and `start-session` (after `/clear`) |
| `.claude/settings.json` | worktrees branch from HEAD; the hooks below; a permission allowlist so background agents don't stall |
| `.claude/hooks/spoiler-guard.mjs` | PreToolUse: denies reading or printing `solutions/` and `levels/` (and, for agents, the generators), and patches that would carry them |
| `.claude/hooks/context-guard.mjs` | PostToolUse warnings at 150k/190k (agents 150k); the Stop gate |
| `.claude/hooks/session-start.mjs` | on startup and `/clear`: the Resume card, and a pointer to `start-session` |
| `.claude/hooks/hooks.test.mjs` | their tests (`npm run test:hooks`, part of `npm run check`) |
| `.worktreeinclude` | copies `node_modules/`, `.venv/` and `public/pyodide/` into new worktrees |
| `scripts/worktree-setup.mjs` | `npm run worktree:setup`: checks a worktree's dependencies, copies what's missing |
| `scripts/show_level.py` | prints a level with hints, passphrases and solutions hidden |

## Why

**2026-10-11.** The per-step hand tests inside each sub-milestone were the bottleneck; three gates per milestone
replace them. Worktrees (not separate repos) keep one `.git` and native merges. A Stop hook can't watch the context,
so a PostToolUse hook does, and the Stop hook gates the handoff; no hook can run `/clear`, hence `/clear` + `go`.
`/simplify` runs before QA2 so nothing reaches the site unplayed (the M3.2 lesson).

**2026-11-15.** The orchestrator on the top model was doing development and review that a smaller model does as
well for less. Three levels put each kind of work on the cheapest model that fits it, and a ledger shows what a
merged package cost. The dry run showed nesting works here (a worker starts from its lead's branch; hooks did not
interfere) and what it costs (about 40k tokens for each agent before any work), which is why one scoped package
skips the lead.
