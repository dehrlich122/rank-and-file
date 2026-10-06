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

## 0. Where the project stands *(Updated 2026-10-07)*

Playable now: the Pawn tier's six chapters, each with five levels and (from
Chapter 2) one optional mastery challenge, plus a Testing ground of practice
levels.

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

The first design pass (§9) is merged: a wire world with one solid hero, the start
menu, the Lessons directory, the promotion ceremony and the knight skin (§8), the
motion kit and an accessibility pass. Next is M4 (§7, `docs/M4/M4.md`): sound,
the level editor with sharing, free play, and the Pawn tier's mastery set.

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
5. **Tiered hints:** nudge → concept reminder → partial example. Never the full solution unless explicitly requested after several failed attempts. *(Updated, Designer 2026-10-07: a solution can be asked for after three failed runs, whether or not any hint was opened. QA-042, built in M4.0.)*
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

## 4. Curriculum map *(Updated 2026-10-07)*

Chapter 4 was split in two, so every later chapter moved up by one. Each chapter has **5 levels plus 1 optional mastery challenge** (Chapter 1 has no mastery challenge yet). Each tier ends with a promotion (§8) and a set of optional mastery challenges that cover the whole tier; the Pawn tier's comes in M4. *(Proposed, 2026-10-07, for the designer to confirm: the set lives in Free Play, not Lessons, and has no lesson phase; `docs/M4/M4.md`.)*

| # | Tier | Chapter | Python concepts | Board mechanic | Status |
|---|------|---------|-----------------|----------------|--------|
| 1 | Pawn | First Moves | calling functions, arguments, sequencing, comments, `print()` | walk forward to the goal | Playable |
| 2 | Pawn | Counting Steps | variables, ints, arithmetic, f-strings | distances worked out in code, guards who ask for a number | Playable |
| 3 | Pawn | Marching Orders | `for`, `range()`, nested loops | long corridors, waypoints, clockwork obstacles | Playable |
| 4 | Pawn | Eyes Open | booleans, comparisons, `if/elif/else`, `None` | pits, enemy rooks and bishops, `look()` | Playable |
| 5 | Pawn | Keep Going | `while`, `break`, `continue`, counters | goals hidden on several squares, winding roads | Playable |
| 6 | Pawn | Runes | strings: indexing, slicing, methods, `in`, `int()`, `split()` | read rune tiles to decode guards, roads and destinations | Playable |
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

## 7. Milestones *(Updated 2026-10-07)*

| Milestone | What | Status |
|---|---|---|
| M0 Foundations | architecture, repo skeleton, Pyodide worker, timeout | Done |
| M1 Vertical slice | board, editor, Run, animated event log, line highlighting, variables, error translation, Learn phase, Chapter 1 | Done |
| M2 Feedback depth | tiered hints, AST constraints, several boards, par and stars, idiomatic-solution reveal, progress saving | Done |
| M3.0–M3.5 | the obstacle toolkit, the Codex, Chapters 2–5 | Done |
| M3.6 Chapter 6 | Runes | Merged 2026-10-02 (`docs/M3/M3.6.md`), PR #16 |
| **M3.7 Look & Feel** | the first major design pass (§9), with the **promotion ceremony** and the knight skin (§8) | Merged 2026-10-03 (`docs/M3/M3.7.md`), PR #17 |
| **M4 Sound, editor and free play** | **sound** (a soundtrack and effects); author levels without hand-writing YAML, and **share** them; **free play** (challenges, your own and shared levels, a sandbox, the skins gallery); the Pawn tier's set of mastery challenges | Planning (`docs/M4/M4.md`) |
| M5+ | the remaining chapters, one tier at a time, each ending in a promotion | Planned |

*(Designer, 2026-10-02)* The design pass comes **before** the editor. By then the Pawn tier holds every tile, enemy and ability the editor's palette must show, and an editor built on the old look would be restyled straight away.

*(Designer, 2026-10-07)* Sound comes into M4, music and effects together. The editor is for players as well as the designer, and its levels can be exported and shared. *(Proposed, 2026-10-07)* Free play, planned as M4.x, comes into M4 too, because it holds the editor's levels, shared levels and the Pawn tier's set.

**Out of scope for now:** accounts, multiplayer, mobile layout, and a server (so shared levels travel as links, codes and files).

---

## 8. Promotion, pieces and skins *(Updated 2026-10-02)*

*(Designer, 2026-10-02)* The end of Chapter 6 celebrates the promotion from pawn to knight, and the knight becomes an unlockable skin. Both are built in the design pass (M3.7), in the new look, not in M3.6.

- **A piece is its rules; a skin is its look.** The pawn walks forward and captures diagonally. From Chapter 7 the player's piece is a knight with L-moves. A knight skin on a Pawn-tier level still moves like a pawn. *(Designer, 2026-10-03)* A skin never renames the object in the player's code either: Pawn-tier levels always say `pawn.move()`, whatever skin is worn. The name becomes `knight` when the rules do (Chapter 7), so promotion stays visible in the code itself.
- **The promotion ceremony** closes each tier. The first is at the end of Chapter 6:
  - It shows once, automatically, when the five core levels are solved. The mastery stays optional. The chapter's heading in the level list can replay it.
  - It is a full-screen moment, not a pop-up. It celebrates, sums up what the player learned (the Codex), shows the new piece, and teases the next tier.
- **Unlocking:** a skin unlocks when its promotion is earned. The rule is worked out from the saved progress, so Reset progress locks it again. The bishop, rook and queen would unlock the same way *(proposed; confirm when those tiers are built)*.
- **Using a skin:**
  - From M3.7, once a skin is unlocked it is **selectable in the menu**: Settings has a **Piece** choice (pawn or knight) that works on every level.
  - Free play (M4.4) gets a gallery of unlocked skins.

---

## 9. Visual direction: retro-futuristic *(planning only; the work is M3.7)*

*(Designer, 2026-10-02)* A first major design pass, drawing on the 80s and 90s video games: some "technowizardry" in the sprites and the board, more animation, board lines that glow slightly.

### Principles
- **Clarity first.** The code and the board stay as easy to read as they are now. Glow is an accent on lines and edges, never on text.
- **Nothing is told by colour or glow alone.** Shape, label or position always says it too. Contrast is checked in both themes.
- **Motion is optional.** Everything new honours the existing Animations setting (`reduced`).
- **Dark-first, light kept.** Glow is designed for dark. The light theme keeps the same shapes and palette family as a "daylight terminal", with softer accents.
- **A system, not a reskin.** Later tiers add tiles and pieces, so the pass delivers a style that new things slot into.

### Decided for the pass *(Designer, 2026-10-02)*

**Priority order.** When two of these conflict, the higher one wins.
1. **Readability is the product.** The game teaches Python by showing what code does on the board. If the board or the code panel gets harder to parse, the design has failed, however good it looks. The rules are testable:
   - Every tile, piece and enemy is told apart by its silhouette alone, in greyscale, at the smallest main-board size we ship (a 12×12 board at its minimum height, about 20px a square). The small side and lesson boards get a simpler sprite tier and only have to keep tiles distinguishable.
   - Squares stay quiet: art lives on squares, and the squares don't get busy. Quiet isn't invisible. Light and dark squares keep a visible step (about 1.4:1 against each other) while sprites stay well above that against both. The grid reads in greyscale, so squares can be counted at a glance. The threatened-square hatch reads on both square colours. File letters and rank numbers meet normal text contrast. All of these go in the automated contrast check.
   - Glow, glitch and texture go on edges, sprites and lines, never on code, lesson text, labels or badges.
   - At most one thing on the board moves "ambiently" in a given square. Everything else is still unless the event log says something happened.
   - With Animations set to reduced, every meaning still reads with zero motion.
2. **It's a coding game as much as a chess game.** Draw the world as a running program: terminal greens and phosphor amber, cursor blinks, scanning reads, circuit-trace walls, `>_` on runes, line numbers and coordinates treated as part of the HUD. The player's piece is the program: clean, lit, stable.
3. **Enemies and threats are corrupted code.** Data gone wrong, in magenta and red on a dark body: cracks, dead pixels and intermittent glitch bursts (RGB split, a horizontal slice offset, a frame of noise) every few seconds, not constant. Squares an enemy threatens get the same language: a diagonal hatch (it works without colour) plus a slow scanline or flicker. **Stable = yours or safe; unstable = hostile.** The player should feel the difference before reading any tooltip. In reduced motion the corruption stays as a static colour fringe plus the hatch.
4. **80s retro-futurism, cyberpunk.** A near-black blue/violet base with cyan, amber and green used sparingly. Magenta is hostile wherever the board can be seen; the big chrome moments may use the full sunset (see "Step 0 feedback" below). Synthwave and vector-arcade energy belongs in the chrome (titles, the promotion ceremony, level-complete), not the play area. CRT scanlines are optional and off by default. The light theme is a "daylight terminal": the same shapes and semantic colours, softer, with no glow.

**Colour roles** (every later decision hangs on these):
- cyan / white: the player and their code (piece, pointer, trail, step line)
- magenta / red: **hostile only** (enemies, threatened squares, enemy routes, lost runs). Magenta is taken out of every non-hostile accent. The one exception is the sunset in the big chrome moments, away from the board (see "Step 0 feedback").
- amber: goals, gates, things to act on
- phosphor green: text the world holds (runes, signs), and success
- violet / near-black: structure (walls, pits, the board itself)

**Heroes** are small armoured figures whose silhouette still reads as their chess piece, so each piece's chess identity lives in its outline. The pawn is a round-helmed knight-errant with a lit visor; the knight skin is a horse-head helm. ~~The style draws on SNES Zelda and the modern pixel games in that lineage (Shovel Knight, Hyper Light Drifter, Dead Cells, Loop Hero): chunky readable shapes, a 1px dark outline, 3–4 tone shading, and personality in a 2-frame idle.~~ *Revisited after step 0 (see below): the old-game lineage is dialled down, and the drawing style (neon pixel or vector) is being compared.* Whichever wins stays crisp, high-contrast and deliberately limited, keeps a 2-frame idle, and carries over to the environment tiles.

**Glitch lives in two places only:** on the board (enemies and threatened squares) and on the error card. When player code throws, the card's frame gets one brief corruption flicker, never its text, so bugs and enemies read as the same kind of thing. Every other panel, the lessons and the level list stay calm.

**The board is the "lit grid"** and every style tile uses it, so the tiles differ in sprites and chrome, not in the board:
- a clear checker: dark squares near-black navy, light squares a visibly lighter indigo (about 1.4:1 between them)
- thin cyan grid lines at low strength between every square, with a faint glow on the outer edge only
- a small cyan tick where grid lines cross, so squares can be counted like on a targeting grid
- file letters (a–h) along the bottom and rank numbers (1–8) up the left, always both, restyled from today's `labels()`; they're text, so no glow

**The start menu** is a styled title screen with some animation, honouring reduced motion. Its four entries are Lessons, Free Play, Level Editor and Settings. Free Play (M4.4) and Level Editor (M4.2) show now as "coming soon" and switch on when those milestones land.
- Direction: ~~the arcade title, with a pixel-font logo~~ *the neon title (revised after step 0, below)*. A big "RANK & FILE" logo with a hard offset shadow (an offset, not a blur, so it isn't glow on text), over a slowly scrolling synthwave perspective grid and a striped sun. **A rank of enemy chess pieces stands in front of the sun, and the player's hero (the pawn, or whatever rank the player has reached) stands under the menu.** A blinking ▶ marks the selected entry. With reduced motion the grid, the blink and the glitches stop.
- The name stays Rank & File. The code form `rank_and_file()` is a secondary mark (for example the subtitle under the logo), never the logo.
- Keyboard first: the arrow keys move the selection and Enter opens it.

**Lessons is a directory, not a long page.** `src/ui/lessonsMenu.ts` (it replaced `levelSelect.ts`, which showed every chapter open on one page) is a folder cascade: Lessons / Chapter 1 / its levels, with a breadcrumb showing the path.
- Direction: the "neon explorer". Collapsible chapter folders grouped under tier headings in the display face, inside a thin cyan HUD frame with corner brackets, with indent guides under an open folder. Each chapter has a segmented progress bar (one block per level) and the victory symbol; each level row has its number or ✓ and its stars, and keeps "Solution seen" and the mastery tag. Folders slide open. One hybrid is mocked up as an alternative: the explorer on the left, and a detail pane for the selected level on the right (what it trains, a mini board, best stars, Run / Replay).
- **Nothing is locked.** Every chapter and level stays open, as today.
- **Only what you need is open.** On load, the folder holding the next unsolved level is the only one open, and that level is selected and scrolled into view. Folders the player opens by hand are remembered per browser, like settings. The Testing ground is its own folder.
- **Clearing a chapter earns a victory symbol** (a pixel crown in the samples). When all five core levels are solved the chapter's folder gets it, with a short flourish the first time and still afterwards. The mastery challenge upgrades it (a second state of the same symbol). It reads by shape and label, not only by colour.

**Words and themes follow the art direction.** Flavour lives in the chrome: titles, chapter and tier headings, the intro, the start menu, folder names, the level-complete and promotion moments, and the theme names in Settings (for example a dark "Night shift" and a light "Daylight terminal"). The voice is terse, 80s-terminal and cyberpunk, with the player as the one writing the program and enemies as corrupted code. **Teaching text stays plain**: lessons, hints, error translations, the Codex and tooltips keep today's clear wording (§2), because a clever line that slows down understanding is a bug. Any label someone clicks still says plainly what it does. The voice guide, with before/after examples, is in `docs/M3/M3.7.md`.

**Sprite system.**
*(Revised after round 5: the pixel-grid plan was dropped for small 3D meshes.)*
- Each sprite is a small 3D model (a lathe-turned body plus boxes, or an extruded outline), seen in a 3/4 view and fitted into its 64-unit square (`src/ui/sprites/mesh.ts`, `models.ts`). It is drawn one of three ways (`draw.ts`): clean wire for the world, flat-shaded solid for the hero, broken wire for enemies.
- Sprites are code, not images, so they scale to any board size and the level editor's palette can reuse them.
- The registry in `src/ui/sprites/index.ts` says which sprite each tile kind and enemy kind uses; `board.ts` calls it. Pawn and knight are skins (§8). An enemy is broken at rest and glitches now and then, so its rest frame still reads as hostile with reduced motion.
- Every sprite takes its colours from CSS tokens (no hard-coded hex in TS), so the light theme and the contrast checks still work.
- Every existing state class (open, crossed, collected, bridged, gone, lost, celebrate, bumping, reading, refusing), the badges and the tooltips stay, restyled, not replaced.

### Step 0 feedback *(Designer, 2026-10-02)*

After the first three style tiles (`docs/M3/M3.7.md`):
- **Neon is the base**, pushed further toward 80s cyberpunk and retro-futurism. The new inspiration is Hotline Miami (its neon, its type and its title screens, without the violence), *Hackers*, *The Lawnmower Man* and their kin. The old video-game references (SNES Zelda and the pixel games in its lineage) are dialled down.
- **Pink in the big chrome moments.** The title screen, the promotion ceremony and the level-complete flourish may use the full sunset (pink, orange and violet) in the sky, the sun and the logo. Wherever the board can be seen (the level screen, the lessons, the level list), magenta still means hostile, so the rule players learn on the board stays true.
- **The title screen** gets a rank of enemy chess pieces lined up in front of the sun, and the player's hero, at the rank they've reached, under the menu.
- **Drawing style: to be compared.** The fourth tile switches between neon pixel sprites and vector "VR" figures (flat-shaded polygons with a lit edge), on the same board, before one is chosen.

After round 2 *(Designer, 2026-10-02)*: neither style yet, and the noir tile is parked as it is. Four quite different directions come first, each a tiny sample (wireframe, low-poly solid, neon poster, hologram).
- **Vector beat pixel:** larger models and more distinct silhouettes read as characters, not flat icons.
- **Pieces must pop off the board**, not sit on it like paper dolls: better shading and a sense of perspective. They stay inside their squares but fill most of them.
- **The threat hatch was overwhelming.** It can be quite subtle, especially once it has an animated pulse.
- **Amber worked** when it stayed on objects that aren't a threat. **The goal needs to be more distinctive and eye-catching.**
- The colours generally look good.

**Direction decided after round 3** *(Designer, 2026-10-02)*:
- **The world is wireframe** (direction A): glowing line art, no fills.
- **The hero is the only solid thing in it**, and the only thing with a floor shadow.
- **Enemies are broken wireframe**: magenta mesh that looks damaged even at rest (missing segments, lines out of register), with an occasional "glitch and break" animation. With reduced motion the resting frame alone still looks broken.
- **Threatened squares use the poster direction's halftone dots** (C), kept quiet.
- **Walls are A's wireframe wall:** clean, violet and still.
- Round 4 compares three ways of making the solid hero distinctive.

**After round 4** *(Designer, 2026-10-02)*:
- **The hero reads as solid:** flat-shaded cyan faces with no mesh lines inside them, lit from one direction, with a glowing edge along its outline only. Next to the wire enemies it is a different material at a glance, in greyscale too.
- **HUD brackets frame the hero's square**, for the hero only. They show its facing: the side it faces is brighter and carries a small notch. No floating glyph.
- **No light pool.** The floor shadow stays.

**Approved after round 5** *(Designer, 2026-10-02)*: round 5 is the style, ready to apply to the full set. One note: **the halftone dots scale with the board**, so a threatened square stays clear on the smaller boards too.

### The look *(directions to explore, not decisions)*
- **Colour:** a near-black blue/violet base, with cyan, amber and phosphor green as role colours used sparingly (see the roles above), in the spirit of synthwave, 80s computer graphics and cyberpunk film. Magenta is reserved for hostile things and is never a general accent, except in the sunset of the big chrome moments.
- **Board:** thin lit lines that glow slightly; squares that stay quiet so tiles and pieces read first.
- **Sprites:** wireframe or pixel-grid pieces, tiles and enemies, with each tile's meaning clear at a glance.
- **Type:** a clean monospace for code. A geometric display face (80s computer lettering) only for titles and headings.
- **Texture:** CRT scanlines, optional and off by default, never over code or text.

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
Sound moved to M4.1 *(Designer, 2026-10-07)*: a soundtrack and sound effects, on and quiet by default, with a mute button (`docs/M4/M4.md`). Settled by the brief above: the light theme has no glow. *(Designer, 2026-10-03)* The optional CRT scanlines (off by default) are a good idea but not urgent: saved for a future design pass, and not built in M3.7.
