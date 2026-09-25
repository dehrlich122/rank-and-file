# Rank & File

A browser puzzle game that teaches Python by having the player write real Python
to move a chess piece. Design brief: `DESIGN.md`. Architecture and decisions:
`docs/ARCHITECTURE.md`.

## Non-negotiable: no spoilers

The designer is also the target learner.

- Never show level solution code (from `solutions/` or written fresh) in chat,
  commit messages, PR descriptions or summaries unless explicitly asked.
- Describe levels by the concept they train and their board mechanic only.
- Verifying a solution works is fine; pasting it is not.

## Commands

```
npm install          # also copies Pyodide into public/pyodide/
npm run dev          # dev server at http://localhost:5173
npm run play         # production build + preview
npm run check        # typecheck + vitest + pytest (run before every commit)
npm run test:py      # pytest only (uses .venv); pass args after --
```

Python tooling lives in `.venv` (Python 3.14, matching Pyodide's CPython 3.14):
`py -3.14 -m venv .venv` then `.venv/Scripts/python -m pip install -r requirements-dev.txt`.

## Conventions

- **Game rules live only in Python** (`engine/rankfile/`). The UI renders what
  the engine reports. The engine must stay plain Python with no third-party
  imports and no Pyodide-specific code, so pytest can run it directly.
- Keep the engine readable: the designer may read and extend it to learn.
  Docstrings explain *why*; names are plain English.
- `engine/rankfile/bridge.py` is the only module the worker calls; it takes and
  returns JSON strings. `src/py/protocol.ts` mirrors its result shapes — change
  both together.
- Constraints are checked with `ast`, never string matching.
- Adding a level must never require engine changes. Every level needs a
  reference solution and at least one naive solution that must fail; the level
  checker (`engine/tests/test_levels.py`) enforces this.
- UI is TypeScript with no framework; build DOM with `h()` from `src/ui/dom.ts`.
  Player-provided text is always inserted as text, never as HTML.
- Git: work on a branch per milestone, open a PR, and stop for manual testing
  after each milestone (see `DESIGN.md` §7).
