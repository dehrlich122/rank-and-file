# Rank & File — design brief and vision
*(Working title. Alternatives: `return knight.codex()`, `pawn.promote()`, `import knight`, Gambit.py)*

**Where this fits** *(Updated 2026-10-02)*: this began as the kickoff brief and is
now the project's vision and curriculum. It says what we're building and why.
The decisions and how they were made live elsewhere:
- `docs/ARCHITECTURE.md`: the architecture, and the level file format.
- `docs/M2/`, `docs/M3/`: each milestone's plan, specs and build notes.
- `docs/QA.md`: the play-test log, with the designer's decisions.
- `docs/Codex.md`: the in-game dictionary of what the player knows.
- `CLAUDE.md`: the working rules for building it.

Sections marked *(Updated …)* have changed since the first brief. *(Designer,
date)* marks a decision.

---

## 0. Where the project stands *(Updated 2026-10-02)*

Playable now: Chapters 1 to 5 (the first five of the Pawn tier's six), each with
five levels and one optional mastery challenge, plus a Testing ground of
practice levels. Chapter 6, Runes, is being built (M3.6).

Built beyond the first brief:
- **Feedback:** tiered hints, stars for par, a reveal of the idiomatic solution,
  friendly error translations that keep the real traceback, step/pause/rewind
  playback, a variables panel, and a scratch REPL.
- **The Codex:** a dictionary of every ability and Python tool the player has
  learned so far. It appears as a tab, as hover tooltips in code, and through
  `help()`.
- **Cases:** a level can run on several boards, or on a goal hidden on several
  squares, so the code has to work out what it can't know ahead.
- **A toolkit of obstacles:** a clock per obstacle, patrols and chasers, enemy
  rooks and bishops, pits and planks, waypoints, gems, guards who ask
  questions, timed gates, and (M3.6) runes.
- **Quality:** an automated check that every level's reference solves it and
  its naive attempts fail; blind level generators that write solutions without
  anyone reading them; an end-to-end suite that drives the real app.

Next: finish Chapter 6, with a promotion ceremony (§8). Then a first design pass
(§9), then the level editor and free play (§7).

---

## 1. What we're building

A browser-based puzzle game that teaches Python from beginner through advanced by having the player write **real Python** to control a chess piece on a board.

I'm the designer **and** the target learner. I know some core Python but learn by doing: try something, see what happens, adjust. Lecture/video formats don't work for me. Every design decision should favor:

**short explanation → immediate hands-on attempt → rich, specific feedback**

### Core loop
- A chessboard grid (levels choose their size).
- The player controls one piece (the avatar) by writing Python in an in-game editor and pressing Run.
- Level objective: get the piece to a target square — sometimes with extras (collect items, reveal a hidden target, survive traps, build a path).
- Every level has two phases:
  1. **Learn** — introduces one concept and its syntax, interactively.
  2. **Challenge** — a puzzle that can only be solved by applying it.

---

## 2. Pedagogy rules (non-negotiable)

1. **Real Python only.** No blocks, no pseudo-language. Player code runs in actual CPython.
2. **Learn phase is short and runnable.** Max ~150 words of explanation per concept, plus 1–3 editable snippets the player can run in place. Show, don't tell. Include a scratch REPL on every level.
3. **Feedback in under a second.** Visualize execution step by step: highlight the executing line as the piece moves, show live variable values in an inspector panel, allow step / pause / rewind.
4. **Errors are teaching moments.** Translate tracebacks into plain language pointing at the exact line (e.g. `AttributeError` on `knight.mvoe()` → "The knight doesn't know `mvoe` — did you mean `move`?"), but keep the real traceback visible and expandable. Learning to read real tracebacks is part of the curriculum.
5. **Tiered hints:** nudge → concept reminder → partial example. Never the full solution unless explicitly requested after several failed attempts.
6. **Levels must force the target concept.** A loop level must be unsolvable by pasting `move()` ten times. Tools for this:
   - **Several boards:** a solution is validated against more than one board, shown up front, so hard-coding fails and the player must generalize. *(Updated: in play-testing, boards that changed after a solve felt like a bait-and-switch, so every board is visible before the run. QA-016.)*
   - **Constraints:** line/character limits, step budgets, required or banned constructs — checked via `ast` inspection, never string matching.
   - **Par scoring:** solving = pass; meeting par (fewest lines / fewest moves / required idiom) earns stars. Optional mastery challenges per chapter.
7. **Spaced review:** later levels deliberately reuse earlier concepts.
8. **After solving:** show an unlockable "idiomatic solution" alongside the player's, with a one-paragraph note on why it's written that way.
9. Each level states in one line which concept it trains.

Learned from play-testing *(Updated 2026-10-02; Designer decisions)*:
10. **The code has to work out what can't be known ahead.** A guard's question is only worth having if its answer differs between boards. Don't force with a rule what the board already shows. (QA-023, QA-029)
11. **Hints have a shape.** Hint 2 explains the mechanic in words. Hint 3 shows its code. Neither tells the player to idle or spin their turns.
12. **Every new obstacle or interaction is shown at work in its lesson,** including how it loses a run.
13. **Where par can't force a construct, a rule can.** A level may require one (for example `break`) when the shortest solution doesn't need it.

---

## 3. Mechanics toolkit *(Updated 2026-10-02)*

The engine composes levels from reusable, extensible elements. Levels name tile types and abilities only, never art (§9).

**Built:**
- **Tiles:** floor, wall, signpost, guarded gate (a passphrase, or a question whose answer the code works out), timed gate, pit, plank (bridges a pit), waypoint, gem, and rune (floor with text on it, M3.6).
- **Enemies:** patrols, chasers, and standing rooks and bishops whose attacked squares are drawn on the board. Each moves on its own clock: per move, per line of code, or the first time each line runs.
- **Avatar API, unlocked progressively** (locked methods give a friendly "you haven't learned this yet"): `move()`, `move(n)`, `turn_left()`, `turn_right()`, `position`, `facing`, `squares_ahead()`, `look()`, `at_goal()`, `wait()`, `capture_left()`, `capture_right()`, `bridge()`, and `read()`.

**Planned, as chapters need them:** fog and `sense()`, `pick_up()`, `use(item)`, `inventory`, `place(obj)`, movable blocks, hidden traps that raise exceptions, teleporter pairs, crumbling floor.

**Chess as progression metaphor:** the player starts as a **pawn** (forward only) and "promotes" as they advance — knight L-moves, bishop diagonals, rook lines, finally the queen. New movement rules arrive alongside new concepts, and each promotion is celebrated (§8).

---

## 4. Curriculum map *(Updated 2026-10-02)*

Chapter 4 was split in two, so every later chapter moved up by one. Each chapter has **5 levels plus 1 optional mastery challenge**. Each tier ends with a promotion (§8) and, in M4, a set of optional mastery challenges that cover the whole tier.

| # | Tier | Chapter | Python concepts | Board mechanic | Status |
|---|------|---------|-----------------|----------------|--------|
| 1 | Pawn | First Moves | calling functions, arguments, sequencing, comments, `print()` | walk forward to the goal | Playable |
| 2 | Pawn | Counting Steps | variables, ints, arithmetic, f-strings | distances worked out in code, guards who ask for a number | Playable |
| 3 | Pawn | Marching Orders | `for`, `range()`, nested loops | long corridors, waypoints, clockwork obstacles | Playable |
| 4 | Pawn | Eyes Open | booleans, comparisons, `if/elif/else`, `None` | pits, enemy rooks and bishops, `look()` | Playable |
| 5 | Pawn | Keep Going | `while`, `break`, `continue`, counters | goals hidden on several squares, winding roads | Playable |
| 6 | Pawn | Runes | strings: indexing, slicing, methods, `in`, `int()`, `split()` | read rune tiles to decode guards, roads and destinations | In progress (M3.6) |
| 7 | Knight | Spellbook | `def`, parameters, `return`, scope | reusable maneuvers; knight L-moves | Planned |
| 8 | Knight | The Satchel | lists, tuples (coordinates), iteration, sorting | collect keys in the right order | Planned |
| 9 | Bishop | The Map Legend | dicts, sets | key→door pairs, tracking visited squares | Planned |
| 10 | Bishop | Traps | `try/except/finally`, `raise`, custom exceptions | hidden traps raise errors; survive and recover | Planned |
| 11 | Rook | Compact Casting | comprehensions, `lambda`, `sorted(key=)`, `enumerate`, `zip` | batch-process board data | Planned |
| 12 | Rook | The Forge | classes, `__init__`, methods, inheritance, dunder methods | define your own piece with its own movement rules | Planned |
| 13 | Queen | The Labyrinth | recursion, BFS/DFS, `collections.deque` | fog-of-war mazes, hidden targets | Planned |
| 14 | Queen | Patrols | iterators, generators, `yield` | predict and dodge enemy routes | Planned |
| 15 | Queen | Enchantments | decorators, context managers | `with knight.shield():`, logged/buffed moves | Planned |
| 16 | Queen | The Architect | dataclasses, type hints, modules, file I/O, testing (`assert`, pytest) | load maps from files, write validators and tests | Planned |
| 17 | — | Grandmaster (capstone) | integration; optionally `asyncio` | coordinate multiple pieces; write a level generator | Planned |

Where the unplaced concepts went *(Designer, 2026-09-26)*: truthiness and `None` with conditions (Chapter 4), `break` and `continue` with `while` (Chapter 5), and `in` with strings (Chapter 6), then lists later.

### From pilot to engineer
The grid alone can't cover all of Python, so the player's role should shift over time:
- **Beginner:** you *drive* the piece.
- **Intermediate:** you *program behaviors* (functions, classes, strategies the piece follows on unseen boards).
- **Advanced:** you *build the world* — define new pieces, write the pathfinder, write the level validator, write tests, generate levels.

Include some **Workshop levels** that aren't movement puzzles at all: decode a scroll, analyze a patrol log, clean up corrupted map data. The board is still the theme, but the task is data processing.

---

## 5. Technical direction *(Updated 2026-10-02)*

The decisions are recorded in `docs/ARCHITECTURE.md`, with the level file format. In short, as built:

- **Browser app, runs locally**, static files, no backend. Published to GitHub Pages on every merge to `main`.
- **Pyodide in a Web Worker** runs player code as real CPython. A line budget and a watchdog stop runaway programs, with a friendly "your loop never ended" message.
- **The game's rules are written in Python** (running in Pyodide). Player code acts on the simulation, which records an event log; the front end only draws it. Execution is deterministic, which is what makes step-through and rewind cheap.
- **Line tracing** maps each event to the source line that caused it.
- **TypeScript, no framework,** with CodeMirror 6 for the editor. Minimal dependencies.
- **Data-driven levels:** each level is a YAML file plus a Markdown lesson and reference solution. Adding a level never requires engine changes.
- **Progress and settings** live in `localStorage` (per browser).
- The Python engine stays clean and readable: I may want to read or extend it as a learning exercise.

---

## 6. Quality and anti-spoiler rules *(Updated 2026-10-02)*

- The engine has pytest tests, the UI has vitest tests, and `npm run check` (types, lint, tests, bundle check) must pass before every commit.
- Every level has a reference solution plus an automated check that (a) it solves every board and earns every star, and (b) each naive attempt fails the way it should.
- Reference solutions live in `solutions/`. **I'm a learner too:** never show solution code in chat, commit messages or summaries unless I ask. Describe levels by concept and mechanic only. Level generators write references and hints without printing them, and print only counts.
- At each milestone's feature-complete point, a cleanup pass and the full end-to-end run happen once. Anything a player could notice becomes a retest list, which I check before the merge.
- After each milestone: stop, list what I should test manually, and wait for feedback.

---

## 7. Milestones *(Updated 2026-10-02)*

| Milestone | What | Status |
|---|---|---|
| M0 Foundations | architecture, repo skeleton, Pyodide worker, timeout | Done |
| M1 Vertical slice | board, editor, Run, animated event log, line highlighting, variables, error translation, Learn phase, Chapter 1 | Done |
| M2 Feedback depth | tiered hints, AST constraints, several boards, par and stars, idiomatic-solution reveal, progress saving | Done |
| M3.0–M3.5 | the obstacle toolkit, the Codex, Chapters 2–5 | Done |
| M3.6 Chapter 6 | Runes, ending with the **promotion ceremony** and the knight skin (§8) | In progress: engine built, level specs approved |
| **M3.7 Look & Feel** | the first major design pass (§9) | Planned, before M4 |
| M4 Level editor | author levels without hand-writing YAML; the Pawn tier's set of mastery challenges | Planned |
| **M4.x Free play** | an open board to experiment on, with a skins gallery | Planned, after M4 |
| M5+ | the remaining chapters, one tier at a time, each ending in a promotion | Planned |

*(Designer, 2026-10-02)* The design pass comes **before** the editor. By then the Pawn tier holds every tile, enemy and ability the editor's palette must show, and an editor built on the old look would be restyled straight away.

**Out of scope for now:** accounts, multiplayer, mobile layout. Sound is out of scope too, but is worth revisiting in the design pass (§9).

---

## 8. Promotion, pieces and skins *(Updated 2026-10-02)*

*(Designer, 2026-10-02)* The end of Chapter 6 celebrates the promotion from pawn to knight, and the knight becomes an unlockable skin.

- **A piece is its rules; a skin is its look.** The pawn walks forward and captures diagonally. From Chapter 7 the player's piece is a knight with L-moves. A knight skin on a Pawn-tier level still moves like a pawn.
- **The promotion ceremony** closes each tier. The first is at the end of Chapter 6:
  - It shows once, automatically, when the five core levels are solved. The mastery stays optional. The chapter's heading in the level list can replay it.
  - It is a full-screen moment, not a pop-up. It celebrates, sums up what the player learned (the Codex), shows the new piece, and teases the next tier.
- **Unlocking:** a skin unlocks when its promotion is earned. The rule is worked out from the saved progress, so Reset progress locks it again. The bishop, rook and queen would unlock the same way *(proposed; confirm when those tiers are built)*.
- **Using a skin:**
  - From M3.6, Settings has a **Piece** choice (pawn or knight) that works on every level, in a simple style that the design pass replaces.
  - After M4, free play gets a gallery of unlocked skins.

---

## 9. Visual direction: retro-futuristic *(planning only; the work is M3.7)*

*(Designer, 2026-10-02)* A first major design pass, drawing on the 80s and 90s video games: some "technowizardry" in the sprites and the board, more animation, board lines that glow slightly.

### Principles
- **Clarity first.** The code and the board stay as easy to read as they are now. Glow is an accent on lines and edges, never on text.
- **Nothing is told by colour or glow alone.** Shape, label or position always says it too. Contrast is checked in both themes.
- **Motion is optional.** Everything new honours the existing Animations setting (`reduced`).
- **Dark-first, light kept.** Glow is designed for dark. The light theme keeps the same shapes and palette family as a "daylight terminal", with softer accents.
- **A system, not a reskin.** Later tiers add tiles and pieces, so the pass delivers a style that new things slot into.

### The look *(directions to explore, not decisions)*
- **Colour:** a deep near-black, with cyan, magenta and amber used sparingly, in the spirit of synthwave and 80s arcade vector graphics.
- **Board:** thin lit lines that glow slightly; squares that stay quiet so tiles and pieces read first.
- **Sprites:** wireframe or pixel-grid pieces, tiles and enemies, with each tile's meaning clear at a glance.
- **Type:** a clean monospace for code. A pixel-adjacent or geometric display face only for titles and badges.
- **Texture:** a restrained scanline or grain, off by default.

### Motion kit
A trail behind a move, turns, a bump, a capture (the rook takes the pawn, from QA Session 9), a rune read as a scan, a gate unlocking, a level-complete flourish, the promotion ceremony, and screen transitions.

### Ideas already logged for the pass
- Red hatched lines along the squares an enemy attacks, and the rook animating its capture (QA Session 9).
- The outcome and error card, a Next button that names the lesson step, and the empty space beside the board when the code sits at the bottom (QA, "Revisit later").
- The redrawn knight and the skin registry (§8).

### Seams that already exist, and stay
Colours are CSS custom properties written as `light-dark()`, there is a tile-to-draw-function table in `src/ui/board.ts`, icons come from one place, and level files name tile types only. The pass adds a **sprite and skin registry** and a **motion kit** to them.

### How the pass would run *(proposed)*
0. **Direction:** a mood board, then three style tiles on the real board in both themes. I pick one.
1. **Foundations:** colour tokens, the board and every sprite (including the knight and the skin registry).
2. **Motion:** the motion kit.
3. **Chrome:** panels, cards, lessons and the level list.
4. **Polish:** accessibility, contrast checks and reduced motion.

### Tools to bring in *(to evaluate together)*
- Style tiles and mockups as pages we can open and compare, and the Claude design tools.
- A `#/styleguide` page, like the existing `#/harness`, showing every tile, piece, skin and animation in both themes. The level editor's palette can reuse it.
- An automated contrast check inside `npm run check`.
- Before/after screenshots through the end-to-end suite.

### Open for the pass
Sound (tiny optional chiptune effects, off by default); how much CRT texture; whether the light theme keeps any glow.
