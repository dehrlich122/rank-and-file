# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Rank & File is a browser puzzle game that teaches Python: the player writes real
Python to move a chess piece. `DESIGN.md` is the design brief (pedagogy rules,
curriculum, milestones). `docs/ARCHITECTURE.md` records the decisions and the
level file format.

## Non-negotiable: no spoilers

The designer is also the target learner.

- Never show level solution code in chat, commit messages, PR descriptions or
  summaries unless explicitly asked. That covers code from `solutions/` and code
  written fresh.
- Describe levels only by the concept they train and their board mechanic.
- Verifying that a solution works is fine; pasting it is not.
- After each milestone, stop, list what the designer should test manually, and
  wait for feedback (`DESIGN.md` §7).

## Commands

```
npm install          # also runs scripts/copy-pyodide.mjs → public/pyodide/
npm run dev          # dev server, http://localhost:5173
npm run play         # production build + preview
npm run check        # typecheck + vitest + pytest; run before every commit
npm run typecheck    # tsc --noEmit (TypeScript 7)

npm run test:py -- engine/tests/test_runner.py::test_endless_loop_is_stopped_quickly
npm run test:py -- -k budget
npx vitest run src/py/client.test.ts -t "hung worker"
```

- No linter or formatter is configured.
- `test:py` runs pytest from `.venv`, which is Python 3.14 to match Pyodide's
  CPython 3.14. To create it: `py -3.14 -m venv .venv`, then
  `.venv/Scripts/python -m pip install -r requirements-dev.txt`.
- pytest config (`pythonpath = engine`) is in `pyproject.toml`, so tests import
  `rankfile` directly.
- If `public/pyodide/` is missing (it's gitignored), run
  `node scripts/copy-pyodide.mjs`.

## Architecture

Player code runs in real CPython (Pyodide) inside a Web Worker. **All game rules
live in Python.** The UI only renders what the engine reports.

**Request path** (read these files together):

1. `src/py/client.ts` (`PyClient`, UI thread) queues requests one at a time.
2. `src/py/worker.ts` receives them.
3. It calls `engine/rankfile/bridge.py`, which takes strings and returns JSON strings.
4. The bridge calls `runner.py`.
5. `runner.py` runs the code under `tracer.py`.
6. The worker parses the JSON. The result shapes are declared in
   `src/py/protocol.ts`, which must mirror the dataclasses in `runner.py`.
   Change both together, and add new request kinds to `Requests` in
   `protocol.ts` and to `handlers` in `worker.ts`.

**How the engine reaches the browser:**
- `worker.ts` pulls in `engine/rankfile/*.py` as raw text via
  `import.meta.glob` and writes the files into Pyodide's virtual FS at
  `/engine/rankfile/`.
- The glob is **flat**, so a new top-level module is picked up automatically,
  but a subpackage would need the glob changed.
- The engine must stay plain Python: no third-party or Pyodide-specific
  imports, so pytest can run it unchanged.

**Pyodide is not bundled.** `worker.ts` loads `pyodide.mjs` at runtime from
`${BASE_URL}pyodide/`, so the loader always matches the copied runtime files.
Import `pyodide` for types only (`import type`). A value import pulls Node-only
code into the bundle.

**The `<player>` filename convention.** Player code is compiled with the
filename `"<player>"` (`tracer.PLAYER_FILENAME`), and three things depend on it:
- the tracer traces only frames with that filename, so engine code runs untraced
- tracebacks are trimmed to those frames
- `runner.remember_source()` puts the source into `linecache` so tracebacks can
  quote it

**Two layers stop runaway programs:**
1. **Line budget.** `Tracer` counts player lines and raises `StepBudgetExceeded`.
   It derives from `BaseException` so player `except Exception:` can't swallow
   it. The worker survives.
2. **Watchdog.** `PyClient` has a 3 s watchdog for hangs inside C code, where no
   Python lines run. It terminates the worker and promotes a pre-loaded spare
   worker. `PyClient` is tested with a fake `WorkerLike`, so its logic needs no
   browser.

**Planned for M1** (see `docs/ARCHITECTURE.md`):
- A run returns a recording of per-line steps (line number, locals, game events,
  output) that the UI plays back. This is how step, pause and rewind work
  without re-running code.
- Levels are YAML (ASCII `map:` + `legend:`), normalized by the Python engine.
  The UI never re-implements rules.
- Constraints are checked with `ast`, never with string matching.
- Every level needs a reference solution and at least one naive solution that
  must fail, both in `solutions/`. `engine/tests/test_levels.py` enforces this.
- Adding a level must never require engine changes.

## UI conventions

- TypeScript, no framework. Build DOM with `h()` from `src/ui/dom.ts`.
  Attributes starting with `on` become listeners; string children become text
  nodes, so player text is never inserted as HTML.
- The current page is the M0 harness (`src/harness.ts`). It has demo buttons for
  each failure path (endless loop, C-level hang, syntax and runtime errors).
- Colors are CSS custom properties in `src/styles.css`, with a dark-mode override.

## Git

- Remote: private `github.com/dehrlich122/rank-and-file`.
- Work on one branch per milestone (e.g. `m1-vertical-slice`) and open a PR for
  the designer to merge after manual testing.
