# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Rank & File is a browser puzzle game that teaches Python: the player writes real
Python to move a chess piece. `DESIGN.md` is the design brief (pedagogy rules,
curriculum, milestones). `docs/ARCHITECTURE.md` records the decisions and the
level file format. Each milestone's plan, specs and build notes go in its own
folder, `docs/M<n>/` (e.g. `docs/M3/` holds `M3.md`, `M3.1.md`…); `docs/QA.md`
is the play-test log for all of them.

**This file is the core: what every session needs.** The detail is in one doc per area. Read the doc for the area
you are about to change (a brief names it):

| Doc | What it holds |
|---|---|
| `docs/ARCHITECTURE.md` | how the engine reaches the browser, how player code runs, errors, playback, the worker protocol, the level file format, how level content is written blind |
| `docs/UI.md` | the UI conventions: DOM, routes, colours, progress, the Codex, dialogs, settings, code editors, the level screen's layout |
| `docs/EDITOR.md` | the level editor (`src/editor/`, `#/editor`) |
| `docs/E2E.md` | the e2e checks: how to write one, how to judge a run, what bites |
| `docs/WORKFLOW.md` | the process: phases and gates, who does what, briefs, merges, the heavy passes |

## Non-negotiable: no spoilers

The designer is also the target learner.

- Never show level solution code in chat, commit messages, PR descriptions or
  summaries unless explicitly asked. That covers code from `solutions/` and code
  written fresh.
- Describe levels only by the concept they train and their board mechanic.
- Verifying that a solution works is fine; pasting it is not.
- Tool calls show up in the transcript too: don't `cat`/print solution files or
  screenshots of solved code.
- Hints, solutions and their notes are all spoilers. Write new ones without
  their text appearing in the conversation: through scripts that write the files
  without echoing them (`docs/ARCHITECTURE.md`, "Writing level content blind").
- `.claude/hooks/spoiler-guard.mjs` denies reading or printing `solutions/` and
  `levels/` (and patches carrying them) in every session and worker. Read a
  level with `node scripts/venv.mjs scripts.show_level <id>` (spoilers hidden).
- Never let a test print a level: compare level data as `JSON.stringify(a) === JSON.stringify(b)`.
- **Never put editor contents into a check's message or return value** (e2e: `docs/E2E.md` says why).

## Orchestration *(Designer, 2026-10-11; three levels from 2026-11-15)*

`docs/WORKFLOW.md` is the process. Three levels, each in its own worktree:

- **Fable (the orchestrator) coordinates only:** design with the designer,
  specs, the work breakdown, briefs, choosing the level for each job, merges,
  the free checks, the gates. It does no development and no review. Its own
  edits are docs, `handoff.md`, merge conflicts, level content, and code only
  under the limits in WORKFLOW.md "Fable's own edits".
- **Opus 5.5** (`lead`, `reviewer` in `.claude/agents/`) does the development
  that needs judgment and every review. A lead may hand packages to Sonnet
  workers branched from its own branch; it merges and validates them, and the
  orchestrator merges only the lead's branch.
- **Sonnet 5.5** (`implementer`, `implementer-deep`) builds scoped packages and
  never delegates.

Each job starts at the cheapest level that plausibly fits and moves up only
when a report comes back partial or wrong. Usage matters more than speed: one
package at a time unless they share no files. Free checks (`npm run check`,
e2e) come before any model review. Every package gets a ledger row (agent,
tokens, outcome) in the milestone doc.

**Level content never goes to an agent:** the orchestrator writes it through
the blind generators. Sessions restart from `handoff.md` instead of compacting:
the context guard asks for a handoff at 250k tokens, ceiling 300k *(Designer, 2026-11-16)*; leads and
workers wrap up at 150k. The `handoff` skill ends a session; the SessionStart hook starts the
next one with `start-session`.

Milestones stop for the designer at three gates only: draft approval, QA1
and QA2 (`docs/WORKFLOW.md`, `DESIGN.md` §7). There are no hand-test stops
between them.

## Commands

```
npm install          # also runs scripts/copy-pyodide.mjs → public/pyodide/
npm run dev          # dev server, http://localhost:5173
npm run play         # production build + preview
npm run check        # typecheck + lint + vitest + hook tests + pytest + check:bundle; run before every commit
npm run typecheck    # tsc --noEmit (TypeScript 7)
npm run lint         # all redundant-code checks below
npm run lint:ts      # knip: unused files, exports and dependencies (TypeScript)
npm run lint:py      # ruff (unused imports/variables, tidiness) + vulture (unused functions)
npm run lint:dupes   # jscpd: copy-pasted blocks across TypeScript, JS and Python
npm run check:bundle # production build: no reference solution in the main bundle

npm run test:py -- engine/tests/test_runner.py::test_endless_loop_is_stopped_quickly
npm run test:py -- -k budget
npx vitest run src/py/client.test.ts -t "hung worker"

npm run e2e                          # headless-Chrome checks; needs `npm run dev` running
npm run e2e -- http://localhost:4173/ --only=app   # against `npm run play`, one suite

npm run test:hooks      # the workflow hooks' tests (.claude/hooks/)
npm run worktree:setup  # in a worker's worktree: check or copy node_modules, .venv, public/pyodide
```

- Linting is about redundant code, not formatting (no formatter is configured):
  - knip reads `knip.json`. It fails on an export or exported type nothing outside its file uses.
    `knip.json` lists the `design/` entry files.
  - ruff and vulture read `pyproject.toml`. Vulture's allowlist is
    `scripts/vulture_allowlist.py`: names used only from JavaScript, from
    player code, or through JSON serialisation. Vulture needs new
    `bridge.*` functions and JSON-only dataclass fields there.
  - jscpd reads `.jscpd.json` and fails on any clone of 6+ lines.
  - When a tool flags something used by name (worker-loaded engine files,
    `bridge.py`), allowlist it; don't delete it.
  - Python tools run from `.venv` via `node scripts/venv.mjs <module> ...`.
- Between the two heavy passes of a milestone (`docs/WORKFLOW.md`), `npm run check` (before every commit) is the
  safety net. Judge it, and an e2e run, by the exit code and the last line.
- `npm run e2e` (`scripts/e2e/`) drives the real app over the Chrome DevTools
  protocol. Every user-visible change or fix gets a check. Read `docs/E2E.md` before writing or debugging one.
- `test:py` runs pytest from `.venv`, which is Python 3.14 to match Pyodide's
  CPython 3.14. To create it: `py -3.14 -m venv .venv`, then
  `.venv/Scripts/python -m pip install -r requirements-dev.txt`.
- pytest config (`pythonpath = engine`) is in `pyproject.toml`, so tests import
  `rankfile` directly.
- If `public/pyodide/` is missing (it's gitignored), run
  `node scripts/copy-pyodide.mjs`.
- Python: `read_text(encoding="utf-8")` and `write_text(..., newline="\n")` on Windows.

## Architecture

Player code runs in real CPython (Pyodide) inside a Web Worker. **All game rules
live in Python.** The UI only renders what the engine reports.

**Request path** (read these files together):

1. `src/py/client.ts` (`PyClient`, UI thread) queues requests one at a time.
2. `src/py/worker.ts` receives them.
3. It calls `engine/rankfile/bridge.py`, which takes strings and returns JSON strings.
4. The bridge calls `runner.py` (`run_level`, `run_sandbox`, `run_snippet`),
   `repl.py`, or `codex.py` (the Codex's entries).
5. `runner.py` checks the code (`constraints.py`), builds a `World` and the
   piece (`pieces.py`), and runs the code under `tracer.py`, which records one
   step per player line. World events and printed output are attached to the
   step that caused them.
6. The worker parses the JSON. The result shapes are declared in
   `src/py/protocol.ts`, which must mirror the engine's dataclasses
   (`LevelResult`, `ErrorInfo`, `Level.describe()`). Change both together, and
   add new request kinds to `Requests` in `protocol.ts`, to `handlers` in
   `worker.ts`, and to `bridge.py`.

**Rules that hold everywhere** (the reasons and the rest are in the area docs):

- The UI never re-implements game rules; it draws what the engine
  reports. In the level editor too: **the engine is the only judge.**
- The engine must stay plain Python: no third-party or Pyodide-specific
  imports, so pytest can run it unchanged.
- Import `pyodide` for types only (`import type`). A value import pulls Node-only
  code into the bundle.
- **Levels are data.** YAML in `levels/chNN/`, lesson in `lessons/chNN/`,
  solutions in `solutions/chNN/`. Adding a level must never require engine changes.
  `engine/tests/test_levels.py` checks every level automatically.
- Constraints are checked with `ast`/`tokenize`, never with string matching.
- New error translations belong in `errors.py`, with a case in
  `engine/tests/test_errors.py`.
- TypeScript, no framework. Build DOM with `h()` from `src/ui/dom.ts`. Never hard-code colours in TS. Never use
  browser `confirm()`/`alert()`, which block the page and the e2e checks.
- Reference solutions and their notes are **lazy** (`loadSolution`). `npm run check:bundle` fails if one ever lands
  in the main bundle. Never make those globs eager.
- A new ability, taught built-in or taught text method needs a Codex entry (`docs/UI.md`, `docs/Codex.md`).
- **Every new obstacle or interaction is shown in its lesson's sample code**
  *(Designer, 2026-09-27)*.

## Git

- Remote: public `github.com/dehrlich122/rank-and-file` (public since
  2026-09-27). Because it's public, `solutions/` and the hints in `levels/` can
  be read on github.com.
- Every merge to `main` publishes the game to GitHub Pages,
  https://dehrlich122.github.io/rank-and-file/, via
  `.github/workflows/pages.yml`. Pull requests only build. The site lives under
  `/rank-and-file/`, so app URLs must go through `import.meta.env.BASE_URL`,
  never `/...`. (Trying a subpath build locally: `docs/ARCHITECTURE.md`, "Known trade-offs".)
- Work on one branch per milestone (e.g. `m1-vertical-slice`) and open a PR for
  the designer to merge after manual testing. Merged branches are kept
  *(Designer, 2026-10-07)*.
