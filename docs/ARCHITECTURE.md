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
| `lost` | Fell into a pit or was caught by an enemy *(M3.1)*: a game over, not a mistake in the code |
| `error` | Python or the game raised an error (syntax errors never start running) |
| `timeout` | Hit the line budget |
| `constraint` | Broke a level rule, so it wasn't run at all |

Game errors (`BlockedError`, `LockedAbilityError`, …, in `exceptions.py`) carry
their own player-facing message. They still subclass the matching built-in type
(`TypeError`, `AttributeError`) so they behave normally with `try`/`except`
later, and they report their module as `builtins` so tracebacks read
`BlockedError: …` rather than exposing the engine's module path.

A loss *(M3.1)* raises `Lost`, which derives from `BaseException` like the
line budget's `StepBudgetExceeded`, so `except Exception:` can't swallow it.
The World also remembers it (`World.lost`), and a lost piece can't act again,
so even a bare `except:` can't undo a loss.

**Ticks and clocks** *(M3.1)*. Timed gates and enemies keep time with a clock:
- `action` (the default): one tick per square moved, per turn, per wait and
  per capture. The piece acts, then everything on that clock takes its turn,
  then the World checks for a catch. `pawn.move(3)` is three ticks.
- `line`: one tick as each line of player code starts to run.
- `new_line`: one tick the first time each line runs, so a loop gives it
  fewer ticks than the same calls copied out.

The tracer calls `World.on_line` as each player line starts. That's where
the `line` and `new_line` clocks tick. Asking the board (`at_goal()`,
`position`) costs no tick.

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
| `loadLevel` | Validate a level (the parsed YAML) and describe it for drawing. A refusal carries `at`: where the problem is (a square, an enemy's number, a field, a legend symbol), for the level editor (M4.2) |
| `editorOptions` | What the level editor offers (M4.2), read from the checker's own tables: each piece's abilities, the details each tile takes, enemy keys, clocks, facings, the board size limit |
| `runLevel` | Run code against a level (with the number of hints opened, for scoring); returns the full recording |
| `loadSandbox` / `runSandbox` | The small open board lesson snippets run on |
| `codex` | A level's Codex entries: its abilities and the built-ins taught so far ([Codex.md](Codex.md)) |
| `replPush` / `replReset` | The scratch REPL (a session that lives in the worker). Each line carries the level's piece and abilities, for the session's stand-in piece |
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
  R: {tile: rune, text: "north-3"}                   # M3.6: floor with text, read with pawn.read()
  X: {tile: gate, passphrase: Open sesame}
  Q: {tile: gate, question: "How many gems did you collect?", passphrase: "4"}
  T: {tile: timed_gate, every: 3, open: 2}           # open and clock (action) are optional
  O: pit
  W: waypoint
  $: gem
  L: plank
enemies:                     # optional (M3.1); squares are chess names
  - {kind: patrol, route: [b4, e4]}                   # there and back, from its first corner
  - {kind: patrol, start: c2, route: [c2, f2, f5, c5], loop: true, clock: new_line}
  - {kind: patrol, start: d4, armoured: true}         # no route: it stands guard
  - {kind: chaser, start: g6, strategy: simple}
  - {kind: rook, start: e5}                           # M3.4: stands still; also bishop
start: {facing: north}       # also `planks: 1`: planks the piece starts with (QA-017)
objectives:                  # default [reach_goal]
  - reach_goal               # end the program on the goal square
  - say: open sesame         # print this exact line at some point
  - waypoints                # cross every waypoint (added whenever the map has any)
  - collect: all             # or a number: gems to walk over
  - capture: all             # or a number: enemies to capture (armoured ones can't be)
api: [move, turn_left, turn_right]      # abilities the piece has in this level (also squares_ahead, at_goal, wait, capture_left, capture_right, bridge, look, read)
constraints: {max_lines: 4, min_comments: 1, require_nodes: [For], ban_nodes: []}
                             # also max_numbers: 1 (M3.2, QA-029): only one number, written once
par: {lines: 3}              # the par star: this many lines of code or fewer
hints: ["nudge", "concept reminder", "partial example"]   # opened one at a time, on request
variants:                    # optional: the same level on other maps, which it must also solve
  - map: |                   # shown small beside the level's board, before and after a run (M3.2, QA-032)
      ...
    legend: {X: {...}}       # optional (M3.2): this board's own entry for a symbol, e.g. a guard's answer
    enemies: [...]           # optional (M3.4): this board's own enemies, instead of the level's
mastery: true                # optional (M3.2): the chapter's optional mastery challenge
lesson: ch01/ch01-l03.md
starter: ""                  # optional initial editor contents
lesson_board:                # optional (QA-019): the board the lesson's snippets run on
  map: |                     # map, legend, enemies and start, as above; no objectives
    ...
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
  - With a `question` *(M3.1)*, the guard asks it: the question is shown in
    the goals and on the gate, and the passphrase is its answer. A wrong
    answer gets one of two replies *(QA-030)*. The answer's words with
    another number get "Do you not know how to count!?". Anything else,
    such as a typo, gets "I can't understand you!". A yes/no question's
    other answer (True for False, or False for True) gets "Wrong!" *(M3.4)*.
  - The guard lines live in `world.py`.
  - `describe()` never includes the passphrase.
- `timed_gate` *(M3.1)*: open for the first `open` ticks (default 2) of every
  `every` ticks of its clock, starting open; `every` must be more than
  `open`. Shut, it blocks like a wall. Anything under it when it shuts is
  crushed *(QA-024)*: the piece loses the run, and a chaser is gone. Its
  badge counts its clock's ticks during playback ("2 of 4 · tick 5", M3.2).
- `rune` *(M3.6)*: floor the piece walks over, with text on it; needs `text`.
  - `pawn.read()` gives back the text of the rune the piece stands on, or
    None off a rune. It costs no tick, and announces a `read` event so
    playback can light the rune.
  - A rune's text is shown before the run: on the tile's tooltip and in the
    Challenge panel, like a signpost's. Each board of a level can give the
    same symbol its own text through a variant's `legend`, so one program has
    to decode every board.
  - Enemies can stand on one.
- `pit` *(M3.1)*: stepping in loses the run. `pawn.bridge()` lays a plank
  over the pit ahead *(QA-017)*, which makes it floor for everyone. A chaser
  whose step lands on an open pit falls in and is gone.
- `plank` *(QA-017)*: picked up by walking over it. The piece carries any
  number. Bridging with none, or with no open pit ahead, is a `BridgeError`.
- `waypoint` *(M3.1)*: must be crossed (passed over, not stopped on) before
  the program ends.
- `gem` *(M3.1)*: collected by walking over it.

The piece's counting and waiting *(M3.2)*:
- `squares_ahead()` gives back how many squares the piece could walk straight
  ahead. It stops before a wall, the board's edge, a signpost, any timed gate
  (even an open one), and a guard's gate that isn't open yet. Pits and
  enemies don't stop it. It costs no tick.
- `wait(ticks=1)` waits a whole number of ticks, from 0 to 100. The ceiling
  keeps one line from recording a flood of ticks.
- `look(side=None)` *(M3.4)* names what's on the square straight ahead, or
  diagonally ahead with `"left"` or `"right"` (the squares a pawn captures
  on). It gives back a word, or None if the square is empty:
  - the board: "wall", "edge", "signpost", "rune", "pit", "gate", "portcullis"
  - things to pick up: "gem", "plank"
  - an enemy's kind, such as "rook"
  - A bridged pit, an opened gate and a picked-up gem look empty. Squares
    you only pass over (the goal, a waypoint) look empty too, so a hidden
    goal stays hidden. It costs no tick.

`max_numbers` *(M3.2, QA-029)*: how many numbers the code may write, counted
with `ast`. With 1, "Your code may contain only one number, written once".
Numbers inside text don't count, and `-3` counts as 3.

Enemies *(M3.1)* move one square per tick of their clock:
- A **patrol** walks its `route`, straight lines between the corners listed,
  there and back (or round and round with `loop: true`). With no route it
  stands guard on `start`. `start` defaults to the first corner and must be
  on the route.
- A **chaser** (`strategy: simple`, the only one so far) steps toward the
  piece along the bigger gap (east or west on a tie). If that way is blocked,
  it tries the other. If both are blocked, it waits. Pits don't block it: it
  falls in *(QA-017)*.
- An enemy on the piece's square catches it, and the run is `lost`.
- A **rook** or **bishop** *(M3.4)* stands still and attacks along real chess
  lines: a rook its rank and file, a bishop its diagonals. A line runs to
  the board's edge or the first wall, closed gate or shut timed gate. A
  square holding another enemy is attacked too, and ends the line.
  - Standing on an attacked square loses the run: "The rook on c3 took your
    pawn on b3."
  - Taking the piece (capturing diagonally) ends its attacks.
  - The checker refuses a level whose start square is attacked.
  - States carry `attacked`, the attacked squares, on levels with chess
    pieces.
- `armoured: true` means it can't be captured. `pawn.capture_left()` and
  `capture_right()` take an enemy one square diagonally forward and move onto
  its square. That costs a tick. An empty square or an armoured enemy is a
  `CaptureError`.
- The checker keeps enemies on open ground (floor, waypoints, gems, planks) and
  starts them apart from the piece and from each other.
- `Level.obstacles()` words every obstacle's rule for the Challenge panel.
- Every event's state carries each enemy's square (`null` once captured or
  fallen), the waypoints crossed, the gems and planks picked up, the planks
  carried, the pits bridged, the tick count, and where a run was lost.

Unknown keys, symbols,
abilities or `ast` node names are errors, so typos fail in the level checker.

What a level must have *(M4.2)*: `id`, `title`, `map` and `api`. A level made in the level editor has no
`chapter` (0), `lesson` or `trains`, so the engine doesn't insist on them; `test_levels.py` still does for every
level in the repo. A board is at most 12 squares along a side (`MAX_SIDE`; the repo's levels all fit).
Every `LevelError` carries `at`, saying where, for the editor: any of `square` ("c4"), `enemy` (its number from
1, as in the message), `field` (a key of the level) or `squares` (several, e.g. every square that uses
a wrong legend entry). The message is the same either way.
`max_lines` counts lines containing code (blank and comment-only lines don't
count), as if every statement had its own line *(M3.3)*: a second statement
after `;`, a loop's body on the loop's own line, or `else:` with its body
beside it counts as another line, so squeezing code together can't dodge a
limit. The par star counts the same way. `require_nodes`/`ban_nodes` name
`ast` node classes.

Alongside each level:

- `lessons/<chapter>/<id>.md`: at most 150 words of prose and 1–3 fenced
  ```` ```python run ```` blocks, which become runnable snippet widgets on a
  small open board with the level's abilities, or on its `lesson_board` *(QA-019)*,
  so a snippet can show an obstacle at work. Mark a snippet that is *meant*
  to fail (to show an error) with ```` ```python run error ````, and one meant
  to lose (to show a pit or an enemy at work) with ```` ```python run lost ````, and one
  meant to run out of lines (an endless loop) with ```` ```python run timeout ```` *(M3.5)*. The Learn
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
  codex.py                    the Codex: entries from docstrings, a level's list, help()
  bridge.py                   JSON functions the worker calls
engine/tests/      pytest suite, including the level checker (test_levels.py)
levels/ lessons/ solutions/   level content (chNN/ folders, plus practice/)
src/app.ts         shell and routes (#/, #/lessons, #/level/<id>, #/editor[/<id>[/play]], #/harness)
src/content.ts     bundles level YAML and lesson Markdown; loads solutions lazily
src/settings.ts src/progress.ts src/storage.ts   saved settings and progress (localStorage)
src/py/            worker, client and protocol
src/editor/        the level editor's draft (M4.2): draft.ts (the data, and what the board draws from it),
                   levelData.ts (draft <-> level file and YAML; keys it doesn't edit are kept as they were)
src/ui/            board, editor, playback, panels, lesson, repl, levelView, lessonsMenu, titleScreen, promotionScreen, codex,
                   help (hints, giving up, the comparison), compare, dialog, settingsDialog
scripts/           copy-pyodide.mjs (runs after npm install), venv.mjs, check-bundle.mjs, e2e/,
                   solve.py gen_solutions.py gen_loops.py gen_conditions.py levelgen.py (search levels, write solutions blind)
public/pyodide/    Pyodide runtime, copied from node_modules (not committed)
```

## Known trade-offs

- Player code can reach engine internals (`import js`, private attributes).
  Acceptable for a local single-player game; AST bans can close it later.
- `sys.settrace` is simple and fast enough; `sys.monitoring` (PEP 669) is a faster
  option if tracing ever becomes a bottleneck.
- The game must be served over http (`npm run dev` / `npm run play`); browsers
  won't run workers or WebAssembly from `file://`.
- The game is published on GitHub Pages under `/rank-and-file/`, not at the
  root. `.github/workflows/pages.yml` builds with Vite's `--base`, and the
  worker finds Pyodide through `import.meta.env.BASE_URL`. So never write
  root-absolute URLs (`/pyodide/...`) in the app. The e2e suite passes against
  a subpath build (`npm run e2e -- http://localhost:4174/rank-and-file/`).

## Open questions for later milestones

- Movement API for knight, bishop, rook and queen (e.g. `knight.jump(...)`?), and
  whether promoted pieces keep pawn abilities. Decide before M5.
- `match` isn't placed yet. It's a natural fit for tile types, in Chapter 9
  or 11 (the brief's Chapters 8 and 10, which move up by one after the split
  below).
- Settled for M3 in `docs/M3/M3.md`:
  - Chapter 4 is split in two (conditions, then `while`), so every later
    chapter moves up by one.
  - Where `break`/`continue`, `in`, truthiness and `None` and nested loops
    go.
  - The obstacle toolkit: a clock set per obstacle, patrols, chasers, pits,
    waypoints, a "lost" outcome, and enemy chess pieces from Chapter 4.
  - Early levels still use a **set target** (end the program on the goal
    square). Waypoints are the pass-through squares.
