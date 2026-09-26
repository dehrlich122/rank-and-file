# Rank & File — Architecture

This document records how the game is built and why. The design brief is
[`DESIGN.md`](../DESIGN.md); this is the engineering side of it.

## Decisions

| Area | Decision | Why |
|---|---|---|
| Avatar API | An object named after the current rank: `pawn.move()`, later `knight.…` | Dot notation from day one; promotion is visible in the code itself; attributes like `pawn.position` fit naturally. |
| Pawn movement | Chapter 1 L1–L2 forward only; `turn_left()` / `turn_right()` unlock at L3 | "Sequencing" only means something when the order of calls changes the outcome, which needs turning. |
| Constraints | A minimal AST check (`max_lines`, `require_nodes`, `ban_nodes`) ships in M1 | Rule #6 ("levels must force the concept") holds from the first playable levels. Stars/par/hints UI remain M2. |
| UI language | TypeScript, no framework | The worker↔UI messages are a contract between Python and the UI; types catch drift at compile time. Plain DOM modules keep dependencies minimal. |
| Python runtime | Pyodide (CPython 3.14 in WebAssembly) in a Web Worker, self-hosted | Real CPython; the UI never freezes; works offline. |
| Game rules | Written once, in Python | The UI renders whatever the engine reports and never re-implements rules. The same code is unit-tested with pytest. |
| Levels | YAML files with an ASCII map, plus a Markdown lesson | Easy to hand-author and diff; adding a level never needs engine changes. |

## The big picture

```
 UI thread (TypeScript)                          Web Worker
 ┌──────────────────────────────┐  postMessage  ┌───────────────────────────────┐
 │ Level view                   │ ────────────▶ │ src/py/worker.ts              │
 │  ├ Lesson (Markdown+snippets)│   requests    │  loads Pyodide from /pyodide/ │
 │  ├ Board (SVG + animation)   │               │  copies engine/*.py into its  │
 │  ├ Editor (CodeMirror 6)     │ ◀──────────── │  virtual filesystem           │
 │  ├ Playback timeline         │  JSON results │  calls rankfile.bridge        │
 │  └ Inspector / console       │               │  (CPython 3.14 in wasm)       │
 │ src/py/client.ts (PyClient)  │               └───────────────────────────────┘
 │  one request at a time, 3 s watchdog, warm spare worker
 └──────────────────────────────┘
```

**Why a worker?** Python runs synchronously. On the page's main thread a
long-running program would freeze the whole UI; in a worker it can't, and a
worker can be killed and replaced at any moment.

**Why is the game simulation in Python, not JavaScript?** The player's code
calls `pawn.move()`, which must be a real Python method. Keeping the whole
simulation next to it means a run is a single, deterministic Python call that
returns a complete recording. The UI then *plays back* that recording, which is
what makes step, pause and rewind easy: nothing is re-executed.

## Running player code

`engine/rankfile/runner.py` is the entry point, used both by the worker (through
`bridge.py`, which speaks JSON) and by pytest.

1. **Check** the code before running: syntax, level constraints (via `ast`, never
   string matching) and lint warnings (e.g. `pawn.move` without parentheses). *(M1)*
2. **Compile** it under the filename `<player>`. That name is how the tracer and
   the traceback filter tell the player's frames apart from the engine's.
3. **Build** a fresh world and a pawn whose abilities are limited to the level's `api` list. *(M1)*
4. **Run** it under the tracer (`tracer.py`, `sys.settrace`). For every line of
   player code it records a *step*: the line number, a safe `repr` of local
   variables, and the game events and printed output produced while that line
   ran. Variables are captured when a line *finishes*, so the inspector shows
   its effect. At most 3 000 steps are kept; longer runs are marked `truncated`.
5. **Classify** the outcome and translate any error into plain language
   (`errors.py`), keeping the real traceback (trimmed to the player's frames)
   for the "show traceback" panel.

| Outcome | Meaning |
|---|---|
| `solved` | Ran to the end with every objective met |
| `incomplete` | Ran to the end, but an objective wasn't met (the summary says which) |
| `finished` | Ran to the end on a board with no objectives (lesson snippets) |
| `error` | Python or the game raised an error (syntax errors never start running) |
| `timeout` | Hit the line budget |
| `constraint` | Broke a level rule, so it wasn't run at all |

Game errors (`BlockedError`, `LockedAbilityError`, …, in `exceptions.py`) carry
their own player-facing message. They still subclass the matching built-in type
(`TypeError`, `AttributeError`) so they behave normally with `try`/`except`
later, and they report their module as `builtins` so tracebacks read
`BlockedError: …` rather than exposing the engine's module path.

### Playback

The UI replays the recording (`src/ui/playback.ts`). Frame 0 is the moment
before the program starts; frame *k* is the moment after step *k*. Every event
carries the piece's full state, so any frame can be drawn directly, which makes
stepping back and scrubbing free. Stepping forward animates the frame's events.
The outcome card appears when playback reaches the last frame. Runs with more
than 150 steps, and timeouts, open at the last frame instead of autoplaying.

### Stopping programs that never end

There are two layers, because an endless program can hang in two different ways:

| Hang | Example | Caught by | Cost |
|---|---|---|---|
| Python-level loop | `while True: x += 1` | **Line budget** in the tracer: after N lines it raises `StepBudgetExceeded` (a `BaseException`, so `except Exception:` can't swallow it) | None: the worker stays loaded and the next Run is instant |
| One huge built-in operation | `sum(range(10**12))` | **Watchdog** in `PyClient`: after 3 s the worker is terminated | None in practice: a spare worker is kept loaded and takes over immediately |

### Speed

Measured in headless Chrome on this machine: Pyodide cold start ≈ 1.1 s (once
per page load); a small program's round trip ≈ 1–3 ms; 100 000 traced lines
≈ 35–45 ms; re-running right after a watchdog restart ≈ 110 ms. The "feedback
in under a second" rule applies to runs on a warm worker.

## Worker protocol

Defined in `src/py/protocol.ts`, which mirrors the engine's dataclasses.
`engine/rankfile/bridge.py` is the only Python module the worker calls; every
bridge function takes strings and returns a JSON string.

- The worker announces `ready` (Python version, load time) or `loadFailed`.
- The UI sends `{ id, kind, args }`; the worker answers `{ id, ok, result | message }`.

| Request | Does |
|---|---|
| `loadLevel` | Validate a level (the parsed YAML) and describe it for drawing |
| `runLevel` | Run code against a level; returns the full recording |
| `loadSandbox` / `runSandbox` | The small open board lesson snippets run on |
| `replPush` / `replReset` | The scratch REPL (a session that lives in the worker) |
| `runSnippet` | Plain Python with no board (the `#/harness` page) |

The UI parses YAML only to list levels; `levels.parse_level` in Python is what
checks and interprets them. The UI's parser runs in YAML 1.1 mode to match
PyYAML, which the level checker uses.

## Coordinates

`(x, y)` with `(0, 0)` at the bottom-left square, which chess calls **a1**.
North is +y. The board is labelled like a chessboard: files a–h, ranks 1–8.

## Level files

```yaml
id: ch01-l03                 # unique; must match the file name
chapter: 1
title: Around the Corner
trains: "…one line naming the concept…"
brief: One or two sentences describing the challenge.   # optional
piece: pawn
map: |                       # top row is the highest rank; symbols separated by spaces
  # S # G
  # . . .
  P . # #
legend:                      # optional: extra symbols beyond the built-ins
  S: {tile: sign, text: "Words written on the signpost"}
start: {facing: north}
objectives:                  # default [reach_goal]
  - reach_goal               # end the program on the goal square
  - say: open sesame         # print this exact line at some point
api: [move, turn_left, turn_right]      # abilities the piece has in this level
constraints: {max_lines: 4, min_comments: 1, require_nodes: [For], ban_nodes: []}
par: {lines: 3}              # used by M2's stars
hints: ["nudge", "concept reminder", "partial example"]   # shown in M2
lesson: ch01/ch01-l03.md
starter: ""                  # optional initial editor contents
```

Built-in map symbols: `.` floor, `#` wall, `P` start, `G` goal. Legend tiles:
`floor`, `wall`, `sign` (blocks movement; needs `text`). Unknown keys, symbols,
abilities or `ast` node names are errors, so typos fail in the level checker.
`max_lines` counts lines containing code (blank and comment-only lines don't
count); `require_nodes`/`ban_nodes` name `ast` node classes.

Alongside each level:

- `lessons/<chapter>/<id>.md`: at most 150 words of prose and 1–3 fenced
  ```` ```python run ```` blocks, which become runnable snippet widgets on a
  small open board with the level's abilities. Mark a snippet that is *meant*
  to fail (to show an error) with ```` ```python run error ````.
- `solutions/<chapter>/<id>.py`: the reference solution.
- `solutions/<chapter>/<id>.naive*.py`: approaches that must fail. The first line
  is `# expect: <outcome>` (e.g. `constraint`); the checker strips it before running.
- `solutions/<chapter>/<id>.md`: the idiomatic-solution note (prose) shown after solving (M2).
- `levels/chapters.yaml` lists the chapters (number, title, tier, summary).

`engine/tests/test_levels.py` checks all of these automatically for every level.

## Repository layout

```
engine/rankfile/   the Python game engine (no third-party dependencies)
  board.py levels.py          squares, tiles, level parsing and validation
  pieces.py world.py          the pawn and its abilities; the world and its events
  exceptions.py errors.py     game errors; plain-language error translation
  tracer.py runner.py         line tracing and recording; running code and judging outcomes
  constraints.py repl.py      ast rules and lint warnings; the scratch REPL
  bridge.py                   JSON functions the worker calls
engine/tests/      pytest suite, including the level checker (test_levels.py)
levels/ lessons/ solutions/   level content
src/app.ts         shell and routes (#/, #/level/<id>, #/harness)
src/content.ts     bundles level YAML and lesson Markdown
src/py/            worker, client and protocol
src/ui/            board, editor, playback, panels, lesson, repl, levelView, levelSelect
scripts/           copy-pyodide.mjs (runs after npm install), pytest.mjs
public/pyodide/    Pyodide runtime, copied from node_modules (not committed)
```

## Known trade-offs

- Player code can reach engine internals (`import js`, private attributes).
  Acceptable for a local single-player game; AST bans can close it later.
- `sys.settrace` is simple and fast enough; `sys.monitoring` (PEP 669) is a faster
  option if tracing ever becomes a bottleneck.
- The game must be served over http (`npm run dev` / `npm run play`); browsers
  won't run workers or WebAssembly from `file://`.

## Open questions for later milestones

- Movement API for knight, bishop, rook and queen (e.g. `knight.jump(...)`?), and
  whether promoted pieces keep pawn abilities. Decide before M5.
- Chapter 4 covers booleans, comparisons, `if/elif/else` and `while` at once;
  consider splitting it.
- Concepts not yet placed: `break`/`continue`, `in`, truthiness and `None`, nested
  loops, and `match` (a natural fit for tile types in Chapter 8 or 10).
- Objectives: early levels use a **set target**, where the program must end on
  the goal square (decided 2026-09-26). A **finish line** you pass through,
  together with obstacles that move on conditions (e.g. when a line runs for
  the first time), is planned for later levels. See `docs/QA.md` → Revisit later.
