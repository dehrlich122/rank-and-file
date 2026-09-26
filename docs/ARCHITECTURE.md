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
| Scoring (M2) | The engine awards up to three stars: solved, within the line par, no hints opened | Scoring is a game rule, so it lives in Python with the rest. The UI passes how many hints were opened and draws the stars. |
| Several cases (M2, QA-016) | A goal can be hidden on one of several squares marked `?`, and a level can list other maps (`variants`). The code runs once per case and must handle them all. | Hard-coding one case fails, which forces the general idea. The `?` squares are shown, so the player knows up front why counting won't do (QA-016 replaced an earlier "hidden boards" design that felt like a bait-and-switch). Explicit squares and maps keep runs deterministic and levels hand-authored. |
| Progress (M2) | Saved in `localStorage`: solved levels, best stars, hints opened, each level's code | No backend; survives reloads. Settings → Reset progress clears it. |
| Solutions in the app (M2) | Loaded lazily, one small file per level, only when the comparison opens | Nothing in the main bundle can spoil a level; `npm run check:bundle` guards it. |

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
6. **Cases** *(M2, QA-016)*: a level with several cases (`Level.cases()`:
   one per `?` square a hidden goal might be on, plus one per other map) runs
   the code once for each. The constraints are checked on the first only.
   Code that never ran (a syntax error or a broken rule) is reported once.
   - A run that never ends is also reported once.
   - A level has `?` squares or other maps, never both.
   - The result is the **verdict** on the whole run: the first failing case's
     status (or the first case's), with stars when every case passed, and
     `case_note` ("It worked for 3 of the 4 places the goal could be").
   - It has no recording of its own. `cases` holds each case's result and
     recording, with its `label` and board `level`. `case` is the one to show
     first.
   - The UI shows a row of cases above the board, with ✓ or ✗ on each `?`
     square, and replays any case's run on its board.
7. **Score** a solved run *(M2)*: `stars` holds three `{kind, earned, label}`
   entries. They are solved, within `par.lines`, and no hints opened; the
   last uses the `hintsUsed` count the UI sends with every run.

| Outcome | Meaning |
|---|---|
| `solved` | Ran to the end with every objective met, in every case (see step 6) |
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
carries the whole world's state after it (`{pos, facing, opened}`: the piece,
and which gates are open), so any frame can be drawn directly, which makes
stepping back and scrubbing free. Moving obstacles would add their positions to
that same state. Stepping forward animates the frame's events.
The outcome card appears when playback reaches the last frame. A recording belongs
to the code it was made from: the first edit afterwards drops it (the outcome
card is dimmed as out of date). Play and the right arrows then run the current
code first, then play it, show step 1, or jump to the end
(`controlStates` in `playback.ts` has the button rules). Runs with more
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
| `runLevel` | Run code against a level (with the number of hints opened, for scoring); returns the full recording |
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
  X: {tile: gate, passphrase: Open sesame}
start: {facing: north}
objectives:                  # default [reach_goal]
  - reach_goal               # end the program on the goal square
  - say: open sesame         # print this exact line at some point
api: [move, turn_left, turn_right]      # abilities the piece has in this level (also at_goal)
constraints: {max_lines: 4, min_comments: 1, require_nodes: [For], ban_nodes: []}
par: {lines: 3}              # the par star: this many lines of code or fewer
hints: ["nudge", "concept reminder", "partial example"]   # opened one at a time, on request
variants:                    # optional: the same level on other maps, which it must also solve
  - map: |
      ...
lesson: ch01/ch01-l03.md
starter: ""                  # optional initial editor contents
```

Built-in map symbols: `.` floor, `#` wall, `P` start, `G` goal, `?` a square
a hidden goal might be on (a map has a `G` or `?` squares, not both; the code
must reach the goal whichever `?` it's on). Legend tiles:
- `floor`, `wall`
- `sign`: blocks movement; needs `text`
- `gate`: needs a `passphrase`, and blocks movement until opened.
  - Printing exactly the passphrase from a square orthogonally next to it opens
    it, whichever way the piece faces. The runner feeds every printed line to
    `World.hear`.
  - Any other line printed there gets the guard's reply. That's a `guard` event
    with a message shown in the console; it isn't an error.
  - Walking into it while locked raises `GateLockedError`. If a wrong phrase
    was said at that gate earlier, the error adds a line pointing back to
    the line that printed it (QA-008). The crash is still reported at the
    move, as it would be in Python.
  - Both guard lines live in `world.py`.
  - `describe()` never includes the passphrase.

Unknown keys, symbols,
abilities or `ast` node names are errors, so typos fail in the level checker.
`max_lines` counts lines containing code (blank and comment-only lines don't
count); `require_nodes`/`ban_nodes` name `ast` node classes.

Alongside each level:

- `lessons/<chapter>/<id>.md`: at most 150 words of prose and 1–3 fenced
  ```` ```python run ```` blocks, which become runnable snippet widgets on a
  small open board with the level's abilities. Mark a snippet that is *meant*
  to fail (to show an error) with ```` ```python run error ````. The Learn
  panel shows the lesson in steps, one per runnable snippet. Each step is
  the text leading up to a snippet plus the snippet; text after the last
  snippet joins the last step. So where the snippets go decides where the
  pages break (QA-010).
- `solutions/<chapter>/<id>.py`: the reference solution. It must solve every
  case too, and earn all three stars (so every par is reachable).
- `solutions/<chapter>/<id>.naive*.py`: approaches that must fail. The first line
  is `# expect: <outcome>` (e.g. `constraint`); the checker strips it before running.
- `solutions/<chapter>/<id>.md`: the idiomatic-solution note (prose), shown
  beside the reference solution in the comparison after solving.
- `levels/chapters.yaml` lists the chapters (number, title, tier, summary).
  The **Testing ground** (`levels/practice/`, chapter 0) is marked
  `curriculum: false`. It holds levels for trying out features before the
  chapters that use them, isn't numbered, and "Next level" never leads there.
  "Next level" follows this file's order.

Each file's folder is `ch01`, `ch02`, … or `practice`.
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
levels/ lessons/ solutions/   level content (chNN/ folders, plus practice/)
src/app.ts         shell and routes (#/, #/level/<id>, #/harness)
src/content.ts     bundles level YAML and lesson Markdown; loads solutions lazily
src/settings.ts src/progress.ts src/storage.ts   saved settings and progress (localStorage)
src/py/            worker, client and protocol
src/ui/            board, editor, playback, panels, lesson, repl, levelView, levelSelect,
                   help (hints, giving up, the comparison), compare, dialog, settingsDialog
scripts/           copy-pyodide.mjs (runs after npm install), venv.mjs, check-bundle.mjs, e2e/
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
- `match` isn't placed yet. It's a natural fit for tile types, in Chapter 9
  or 11 (the brief's Chapters 8 and 10, which move up by one after the split
  below).
- Settled for M3 in `docs/M3.md`:
  - Chapter 4 is split in two (conditions, then `while`), so every later
    chapter moves up by one.
  - Where `break`/`continue`, `in`, truthiness and `None` and nested loops
    go.
  - The obstacle toolkit: a clock set per obstacle, patrols, chasers, pits,
    waypoints, a "lost" outcome, and enemy chess pieces from Chapter 4.
  - Early levels still use a **set target** (end the program on the goal
    square). Waypoints are the pass-through squares.
