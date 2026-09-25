# Rank & File — design brief & Claude Code kickoff prompt
*(Working title. Alternatives: `return knight.codex()`, `pawn.promote()`, `import knight`, Gambit.py)*

**How to use:** Create an empty folder, save this file as `DESIGN.md`, open Claude Code there, switch to plan mode, and say:
> Read DESIGN.md end to end. Then propose an architecture and a plan for Milestones 0 and 1. Ask me about anything ambiguous. Don't write code until I approve the plan.

---

## 1. What we're building

A browser-based puzzle game that teaches Python from beginner through advanced by having the player write **real Python** to control a chess piece on a board.

I'm the designer **and** the target learner. I know some core Python but learn by doing: try something, see what happens, adjust. Lecture/video formats don't work for me. Every design decision should favor:

**short explanation → immediate hands-on attempt → rich, specific feedback**

### Core loop
- A chessboard grid (8×8 default; levels may resize).
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
   - **Hidden board variants:** a solution is validated against several randomized versions of the board, so hard-coding fails and the player must generalize.
   - **Constraints:** line/character limits, step budgets, required or banned constructs — checked via `ast` inspection, never string matching.
   - **Par scoring:** solving = pass; meeting par (fewest lines / fewest moves / required idiom) earns stars. Optional mastery challenges per chapter.
7. **Spaced review:** later levels deliberately reuse earlier concepts.
8. **After solving:** show an unlockable "idiomatic solution" alongside the player's, with a one-paragraph note on why it's written that way.
9. Each level states in one line which concept it trains.

---

## 3. Mechanics toolkit

The engine should compose levels from reusable, extensible elements.

**Tiles/objects:** empty, wall, pit/water, bridgeable gap, locked door, key, switch/pressure plate, rune tile (holds text), fog (hidden until sensed), hidden trap (raises an exception when stepped on), movable block, patrolling enemy, hidden target.

**Avatar API — unlocked progressively** (the API grows as the player advances; locked methods give a friendly "you haven't learned this yet" message):
`move()`, `move(n)`, `turn_left()`, `turn_right()`, `position`, `facing`, `look()`, `sense()`, `at_goal()`, `pick_up()`, `use(item)`, `read()`, `place(obj)`, `inventory`, and more as chapters require.

**Chess as progression metaphor:** the player starts as a **pawn** (forward only) and "promotes" as they advance — knight L-moves, bishop diagonals, rook lines, finally the queen. New movement rules arrive alongside new concepts.

---

## 4. Curriculum map (draft — challenge and refine it)

| # | Tier | Chapter | Python concepts | Board mechanic |
|---|------|---------|-----------------|----------------|
| 1 | Pawn | First Moves | calling functions, arguments, sequencing, comments, `print()` | walk forward to the goal |
| 2 | Pawn | Counting Steps | variables, ints, arithmetic, f-strings | distance given as a clue/calculation |
| 3 | Pawn | Marching Orders | `for`, `range()` | long corridors under a line limit |
| 4 | Pawn | Eyes Open | booleans, comparisons, `if/elif/else`, `while` | randomized walls, `look()`, `at_goal()` |
| 5 | Pawn | Runes | strings: indexing, slicing, methods | read rune tiles to decode the destination |
| 6 | Knight | Spellbook | `def`, parameters, `return`, scope | reusable maneuvers; knight L-moves |
| 7 | Knight | The Satchel | lists, tuples (coordinates), iteration, sorting | collect keys in the right order |
| 8 | Bishop | The Map Legend | dicts, sets | key→door pairs, tracking visited squares |
| 9 | Bishop | Traps | `try/except/finally`, `raise`, custom exceptions | hidden traps raise errors; survive and recover |
| 10 | Rook | Compact Casting | comprehensions, `lambda`, `sorted(key=)`, `enumerate`, `zip` | batch-process board data |
| 11 | Rook | The Forge | classes, `__init__`, methods, inheritance, dunder methods | define your own piece with its own movement rules |
| 12 | Queen | The Labyrinth | recursion, BFS/DFS, `collections.deque` | fog-of-war mazes, hidden targets |
| 13 | Queen | Patrols | iterators, generators, `yield` | predict and dodge enemy routes |
| 14 | Queen | Enchantments | decorators, context managers | `with knight.shield():`, logged/buffed moves |
| 15 | Queen | The Architect | dataclasses, type hints, modules, file I/O, testing (`assert`, pytest) | load maps from files, write validators and tests |
| 16 | — | Grandmaster (capstone) | integration; optionally `asyncio` | coordinate multiple pieces; write a level generator |

### From pilot to engineer
The grid alone can't cover all of Python, so the player's role should shift over time:
- **Beginner:** you *drive* the piece.
- **Intermediate:** you *program behaviors* (functions, classes, strategies the piece follows on unseen boards).
- **Advanced:** you *build the world* — define new pieces, write the pathfinder, write the level validator, write tests, generate levels.

Include some **Workshop levels** that aren't movement puzzles at all: decode a scroll, analyze a patrol log, clean up corrupted map data. The board is still the theme, but the task is data processing.

---

## 5. Technical direction (propose alternatives if you disagree, with reasons)

- **Browser app, runs locally**, static files, no backend.
- **Pyodide in a Web Worker** runs player code as real CPython. A timeout terminates the worker to catch infinite loops, with a friendly "your loop never ended" message.
- **Game simulation written in Python** (running in Pyodide). Player code acts on the simulation, which records an event log; the front end animates the log. This keeps execution deterministic and enables step-through and rewind.
- **Line tracing** via `sys.settrace` to map each event to the source line that caused it.
- **Editor:** CodeMirror 6 with Python highlighting.
- **Data-driven levels:** each level is a YAML/JSON file (board, API unlocks, constraints, variants, par, hints) plus Markdown lesson content and an optional Python validator. Adding a level must never require engine changes.
- **Progress** saved in `localStorage`.
- Minimal dependencies. Choose TypeScript or plain JS for the UI and explain the choice.
- Keep the Python engine code clean and readable; I may want to read or extend it later as a learning exercise.

### Level file sketch (starting point, refine it)
```yaml
id: ch03-l02
chapter: 3
title: The Long Hall
trains: "for loops with range()"
board: {width: 8, height: 8}
start: {pos: [0, 0], facing: north}
goal: [0, 7]
tiles: []
variants: {count: 5, randomize: [goal_distance]}
api_unlocked: [move, turn_left, turn_right]
constraints:
  max_lines: 3
  require_nodes: [For]
par: {lines: 2}
hints:
  - "You're repeating yourself. Python has a way to repeat things for you."
  - "Look back at the Learn panel: range() gives you a sequence of numbers."
  - "for _ in range(...): <something indented>"
lesson: lessons/ch03-l02.md
```

---

## 6. Quality & anti-spoiler rules

- Engine has pytest unit tests.
- Every level has a reference solution plus an automated check that (a) it solves all variants and (b) the intended naive solution fails where it should.
- Reference solutions live in `solutions/`. **I'm a learner too:** never show solution code in chat, commit messages or summaries unless I ask. Describe levels by concept and mechanic only.

---

## 7. Milestones

After each milestone: stop, list what I should test manually, and wait for feedback.

- **M0 — Foundations:** architecture proposal, repo skeleton, Pyodide worker runs a snippet and returns output, timeout works.
- **M1 — Vertical slice:** board rendering, editor, Run, animated event log, line highlighting, variable inspector, error translation, Learn phase, and 5 playable Chapter 1 levels end to end.
- **M2 — Feedback depth:** tiered hints, AST constraints, hidden variants, par/stars, idiomatic-solution reveal, progress saving.
- **M3 — Chapters 2–5** (completes the Pawn tier).
- **M4 — Level editor** for me, so I can author levels without hand-writing YAML.
- **M5+ —** remaining chapters, one tier at a time.

**Out of scope for now:** accounts, multiplayer, mobile layout, sound.
