# QA log

Manual QA feedback from the designer while play-testing. Each item records what
was observed, what's wanted, and anything still open. New findings go at the
bottom with the next ID. When an item is fixed, note the commit and the retest
steps, then mark it **Verified** once the designer has re-checked it.

Status: **Open** → **Fixed** (awaiting retest) → **Verified**

No spoilers here either (see `CLAUDE.md`): describe levels by concept and
mechanic, never by solution code.

---

## Session 1 — 2026-09-26 · M1 vertical slice (`m1-vertical-slice`)

### QA-001 · Playback speed resets on every level · Open

- **Area:** UI, playback controls
- **Observed:** The speed selector goes back to 1× whenever a new level opens.
  The select is rebuilt per level with 1× preselected
  (`src/ui/levelView.ts`, speed `<select>`), and `Player.speed` starts at 1
  (`src/ui/playback.ts`).
- **Wanted:** The speed the player picks stays in effect from level to level.
- **Notes:** Keep it as an app-wide setting that each new level view and
  `Player` read on creation. Remembering it across reloads too (localStorage,
  wrapped in try/catch) seems natural; confirm with the designer. Speed will
  likely also appear in the settings menu (QA-006), so build it as a field of
  that shared settings store rather than a one-off.
- **Retest:** Set 2× on level 1, go to level 2 via Next and via the level
  select: selector shows 2× and playback runs at 2×.

### QA-002 · Level 4 (`ch01-l04`, "The Password") redesign · Open

- **Area:** Level content + one new board mechanic
- **Observed:** The passphrase sits on a signpost off to the side, printing it
  anywhere in the program counts, and a comment is required
  (`min_comments: 1`). It feels odd, and it lets go of the ordering idea that
  level 3 builds up.
- **Wanted:**
  1. **Locked gate replaces the sign.** The gate is the obstacle and the goal
     is behind it. **Gate on b3** *(Designer, 2026-09-26)*: the square
     between the goal and the rest of the path. The old sign square (b4)
     becomes wall for now *(Designer, 2026-09-26)*. A visual design pass on
     the level can come in a later build.
  2. **Passphrase:** `Pawns never retreat`. It must be an **exact match**:
     same case, same punctuation, nothing extra. The printed line has to
     equal the passphrase, so printing it with the quote marks fails.
     *(Designer, 2026-09-26)*
  3. **Only works from 1 space away.** That means **adjacent (orthogonally),
     not necessarily facing** the gate *(Designer, 2026-09-26)*. Saying it
     anywhere else doesn't open the gate, so *when* you print matters as
     much as *what* you print. This keeps level 3's ordering lesson in play.
  4. **Guard lines** *(Designer, 2026-09-26)*:
     - **Wrong phrase:**
       `The guard called your mother a hamster! The gate remains locked.`
       Shown when anything other than the exact passphrase is printed while
       the pawn is adjacent to the locked gate. The gate stays locked and the
       run carries on.
     - **Walking into the locked gate:**
       `Does your father really smell of elderberries? Maybe try the passphrase first.`
       This is an error. The run stops there, the same as walking into a
       wall.
  5. **Passphrase arrives as a comment in the editor** (the level's `starter`
     code), not in the brief or instructions panel. Exact wording
     *(Designer, 2026-09-26)*:
     `# Tell the guard at the gate that 'Pawns never retreat'`
  6. **The lesson panel mentions comments.** It already covers them; make sure
     it still ties in.
  7. **No required comment.** Drop `min_comments`. The level shows why
     comments are useful by design and example instead of forcing one.
  8. **Keep the basic layout** otherwise.
- **Implementation notes:**
  - New tile: a gate that blocks movement until it's opened. That's an engine
    change: `board.py` / `world.py`, the board renderer (locked and open
    states), and the tile list in `docs/ARCHITECTURE.md`. `DESIGN.md` §3
    already lists "locked door". Put the passphrase in the level data (e.g.
    `legend: X: {tile: gate, passphrase: ...}`) so later levels can reuse the
    gate without engine changes.
  - Today's `say` objective means "printed at some point". The gate needs a
    positional check instead: each printed line is compared with the
    passphrase while the pawn is orthogonally adjacent to a locked gate.
    Facing doesn't matter. The wrong-phrase line is a game message, not an
    error. The walking-into-it line is a game error with its own
    player-facing text, like the wall error in `exceptions.py`. Keep both
    strings with the gate mechanic (engine, one place) so levels 4 and 5
    share them.
  - Rewrite the brief (drop the sign and password text) and the hints (hint 2
    refers to "the sign").
  - The comment's wording brings in a **guard** at the gate, and the wrong
    phrase response speaks as the guard. The art could show one too, but
    that's optional.
  - The comment marks the passphrase with single quotes, so
    `'Pawns never retreat'` is already a valid Python string. Copying it
    straight into `print()` works. Printing the quote marks themselves is the
    likely near miss. With exact matching, that gets the wrong-phrase line.
  - Tests: regenerate the reference solution by script without echoing it.
    Add naive solutions that should fail: printing before reaching the gate,
    walking up without printing, and a near-miss phrase (wrong case, or with
    the quote marks). `test_levels.py` covers the rest. Add engine tests for
    the gate itself (adjacent but facing away works, 2 squares away doesn't,
    a wrong phrase gives the hamster line and the run continues, walking into
    it gives the elderberries error and the run stops).
- **Open questions:** none.
- **Retest:**
  - The gate is on b3. It stays locked if the phrase is printed too early or
    from a square that isn't adjacent. It opens (visibly) when printed from an
    adjacent square, including while facing away from it. The goal can be
    reached only through it.
  - Printing a near miss (different case, missing word, with quote marks)
    next to the gate gives "The guard called your mother a hamster! The gate
    remains locked." and the gate stays shut.
  - Walking into the locked gate stops the run with "Does your father really
    smell of elderberries? Maybe try the passphrase first."
  - No comment is required. The brief and instructions panel don't show the
    passphrase. The starter code shows the comment above word for word.

### QA-003 · Autocomplete for calls you've already written · Open

- **Area:** UI, code editor + scratch REPL (feature request)
- **Observed:** Every call has to be typed out in full, every time. Real
  editors and REPLs rarely make you do that. The editor also already pops up
  CodeMirror's standard Python suggestions (every builtin, keywords, snippets
  like `def`, and local names), and Enter accepts them. That goes against the
  rules below and has to be replaced.
- **Rule:** A suggestion appears only if you've **already typed that call**
  *and* it's **real**. You type it in full the first time, and after that the
  editor offers it.
- **Wanted — methods (`pawn.`):**
  1. After typing `pawn.`, a dropdown lists the methods already used on `pawn`
     in this code. If `pawn.move()` and `pawn.turn_left()` are both in the
     code, both appear.
  2. **Only real API methods appear:** they must be in the level's `api`
     list, so a typo like `pawn.mvoe()` is never offered. *(Designer,
     2026-09-26)*
  3. **Chapter 1: no untyped methods.** Methods the level unlocks but you
     haven't typed yet are never offered. The designer may revisit this for
     later chapters. *(Designer, 2026-09-26)*
  4. Up and Down arrows move through the list. More letters narrow it:
     `pawn.t` leaves only `turn_left()`.
- **Wanted — accepting:**
  5. **Tab only** accepts. Enter, Space and typing straight through never pick
     from the list. *(Designer, 2026-09-26)*
  6. A faint **Tab** key label sits after the highlighted suggestion so it's
     clear what to press. *(Designer, 2026-09-26)*
- **Wanted — scratch REPL:**
  7. Same logic, but scoped to the scratch session: only calls already made
     in the scratch REPL are offered. Expect it to come up rarely.
     *(Designer, 2026-09-26)*
- **Wanted — only what the player typed:**
  8. **Chapter 1: only code the player typed themselves counts.** No
     autocomplete in the Learn-panel snippets. Calls that come pre-written in
     a snippet or in a level's starter code don't make that call "known".
     The designer may revisit this for later chapters, with more options.
     *(Designer, 2026-09-26)*
- **Plain calls (`print()` etc.) — approved *(Designer, 2026-09-26)*:**
  - Use the same two rules as methods. A name is offered only if it's
    **already been called** in this code (or this scratch session) and it's
    **real**: a Python builtin now, or later a function the player defined
    with `def`. A typo like `prnit()` is never offered.
  - The list opens from the first letter of a name that isn't after a `.`, and
    each letter narrows it. `p` offers `print()`, and at `pa` it's ruled out,
    so the list closes. *(The designer's own idea; this just writes it down.)*
  - Tab-only accepting is what makes this safe. The list will pop up often
    while you type other names (like `pawn`), but typing straight through
    never picks from it.
  - No suggestions inside comments or strings. This matters in level 4, where
    you type the passphrase comment and then print the passphrase string.
  - Calls only. Plain names that aren't being called (like `pawn` itself, or
    variables) aren't offered for now. Revisit in Chapter 2 when variables
    arrive.
- **Notes:**
  - Switch off the standard Python sources with
    `autocompletion({ override: [ourSource] })` in `src/ui/editor.ts`. Also
    drop Enter from the completion keymap and put `acceptCompletion` on Tab
    ahead of `indentWithTab`, so Tab still indents when the list is closed.
  - Find the calls already written from the syntax tree (`CallExpression` /
    `MemberExpression`), never with regexes. Record only calls inside ranges
    the player changed (transactions with an `input` user event), so
    pre-written starter code doesn't count. Suggested default: once typed, a
    call stays known for that level even if the line is later deleted. Filter methods against
    `LevelInfo.api` (`src/py/protocol.ts`, from `Level.describe()`), so the
    engine doesn't need to change. For plain calls, check the builtins list
    (and later, the `def`s in the code).
  - Write it generally (any `<object>.`, not just `pawn`) so it keeps working
    for later pieces and the player's own classes.
  - Insert `move()` with the cursor between the parentheses.
  - Tab label: CodeMirror's `addToOptions` renders one extra element per
    option. Show it only on the selected row (`[aria-selected]`), in the muted
    text color.
  - Scratch REPL: the input is a plain `<input>` today (`src/ui/repl.ts`).
    The simplest way to share this code is to switch it to a one-line
    CodeMirror editor. Arrow keys there already step through REPL history, so
    they should move through the list only while it's open. The set of known
    calls follows the session, so "Reset session" clears it.
  - If untyped methods are ever offered in later chapters, make that a data
    flag (e.g. in `levels/chapters.yaml`), not a code change.
- **Open questions:** none. The spec is settled for Chapter 1.
- **Retest:**
  - The standard Python suggestions no longer appear. On a fresh level,
    typing `pawn.` offers nothing.
  - After one `pawn.move()`, `pawn.` offers `move()`. After adding
    `pawn.turn_left()`, both appear and arrows switch between them.
    `pawn.t` narrows to `turn_left()`.
  - Tab inserts the suggestion with the cursor inside `()`. Enter makes a new
    line even with the list open. Tab still indents when the list is closed.
    The faint Tab label shows on the highlighted row only.
  - A misspelled call already in the code (e.g. `pawn.mvoe()`) is never
    offered.
  - Scratch: nothing is offered until a call has been made in that session.
    After "Reset session", nothing is offered again.
  - Learn-panel snippets never show suggestions. A call that comes with a
    level's starter code isn't offered until the player types it themselves.
  - Plain calls: after one `print(...)`, `p` offers `print()`
    and `pa` closes the list. Nothing pops up inside a comment or a string.

### QA-004 · Level 5 (`ch01-l05`, "The Winding Path") rework · Open

- **Area:** Level content (reuses QA-002's gate)
- **Depends on:** QA-002. The locked gate mechanic has to exist first. Its
  rules carry over unchanged: an exact passphrase match, said from an
  adjacent square (facing doesn't matter), the hamster line for a wrong
  phrase, and the elderberries error for walking into the locked gate.
- **Observed:** The level is a pure route-planning review: calls, arguments
  and sequencing. `print()` and comments from level 4 don't come back.
  `max_lines` equals par, so the limit is exactly the minimum with no slack.
- **Wanted:**
  1. **Bring `print()` back** through the same locked gate from level 4.
     Passphrase: `Checking out`, exact match.
  2. **The gate sits in the middle of the run**, not at the end just before
     the goal. **Gate on b5** *(Designer, 2026-09-26; moved from b4 for an
     extra planning step)*: on the b-file stretch, partway along the route.
  3. **The starter code already has a comment** carrying useful information,
     as a reminder that comments are worth reading. As in level 4, the
     passphrase isn't in the brief or the instructions panel. Exact wording
     *(Designer, 2026-09-26)*:
     `# Tell the guard you are 'Checking out' to get to the next chapter.`
  4. **Line limit = minimum + 2.** Adding the gate raises the minimum, so
     `max_lines` becomes the new minimum plus 2.
  5. Keep the winding layout otherwise.
- **Implementation notes:**
  - Work out the new minimum with the solution-search script after the gate
    is placed, never by hand, and without echoing solutions. Keep `par` at
    that minimum and set `max_lines` to par + 2. Line counting ignores
    comment-only lines, so the starter comment doesn't eat into the limit.
  - Update `trains:` (it now reviews `print()` and comments too) and the
    brief, which currently says "exactly enough lines". Rewrite the hints so
    they mention the gate and the comment in the code. Check that the lesson
    still fits within 150 words; it could briefly note that comments can
    carry useful information.
  - Tests: regenerate the reference solution by script. The existing naive
    solution (expects `constraint`) needs rechecking against the new limit.
    Add naive solutions that should fail: the old route with no passphrase
    (blocked at the gate), the passphrase printed from a square that isn't
    adjacent (gate stays locked), and a near-miss phrase.
- **Open questions:** none.
- **Retest:**
  - The gate is on b5, mid-route and not next to the goal.
  - It opens only when exactly `Checking out` is printed from an adjacent
    square. A near miss gets the hamster line. Walking into the locked gate
    stops the run with the elderberries error.
  - The starter code shows the comment above word for word. The brief and
    instructions panel don't show the passphrase.
  - A shortest solution fits with 2 lines to spare, and the limit still
    rejects a solution that moves one square per line.

---

## Session 2 — 2026-09-26 · M1 vertical slice (`m1-vertical-slice`)

### QA-005 · Playback buttons: new scheme, Play doubles as Run · Open

- **Area:** UI, playback controls
- **Observed:** The five buttons under the board are ⏮ (back to the start),
  ◀ (step back), ▶/⏸ (play/pause), ▶| (step forward) and ⏭ (jump to the
  end), made by the `control(...)` calls in `src/ui/levelView.ts`. Step back
  and step forward don't match (◀ vs ▶|), and step back looks almost like
  Play. All five stay disabled until the code has been run with the Run
  button.
- **Wanted** *(Designer, 2026-09-26)*, left to right:
  1. **Double left arrow:** rewind to the beginning, before any line has run.
  2. **Single left arrow:** back one step.
  3. **Play:** plays through all the steps. It **can double as Run**.
  4. **Single right arrow:** forward one step.
  5. **Double right arrow:** jump to the outcome, or to the error if the run
     failed.
- **Decided** *(Designer, 2026-09-26)*:
  6. **Edited code runs fresh.** If the code has changed since the last run,
     Play runs the new code instead of replaying the old run.
  7. **The Run button stays** next to the editor, and Ctrl+Enter still runs.
  8. **The right arrows run too** when there's no run of the current code
     (on a fresh level, or after an edit). The single right arrow runs the
     code and shows step 1. The double right arrow runs it and jumps to the
     outcome or error. The left arrows stay disabled at the start.
- **Notes:**
  - The behavior behind 1, 2, 4 and 5 already exists (`seek(0)`,
    `previous()`, `next()`, `seek(last)` on `Player` in
    `src/ui/playback.ts`), and the last frame is already where the outcome or
    error appears. The work is the icons, the tooltips, and running from
    Play and the right arrows.
  - Tooltips and aria-labels: "Back to the start", "Step back",
    "Play" / "Pause" / "Replay", "Step forward", and "Jump to the outcome"
    (or "Jump to the error" when the run failed).
  - The single right arrow must not look like Play. Glyphs like ⏮ ⏭ ⏸ can
    also turn into color emoji on Windows, depending on the font. Draw the
    icons as inline SVG (or plain text arrows) from one place, so the visual
    pass can reskin them.
  - Running from the controls: when there's no recording of the current
    code, Play, single right and double right call the same path as `run()`
    first, then play, step once or jump to the end. They're enabled as soon
    as the level has loaded. Play still turns into Pause while playing.
  - Knowing when the recording is out of date: remember the code each
    recording was made from and compare it with the editor's code. The
    editor's `onChange` already fires on every edit, and edits already clear
    the step and error highlights. Suggested default: once the code changes,
    drop the old recording, so the left arrows disable just as they do at the
    start.
  - Keep Stop. It's the only way to halt a program that's still running in
    Python (it restarts the worker), which Pause can't do.
- **Open questions:** none.
- **Retest:**
  - Left to right: double left, single left, Play, single right, double
    right. The hover text matches each one.
  - On a fresh level, Play runs the code and plays it, single right runs it
    and shows step 1, and double right runs it and jumps to the end. The
    left arrows are disabled until there's a run. Pause works while playing.
  - After a run, edit the code and press Play: the new code runs, not the
    old recording. The same goes for either right arrow.
  - Double right lands on the outcome card, or on the error with its line
    marked. Double left goes back to before the first line.
  - The Run button and Ctrl+Enter still work.

### QA-006 · Settings menu on every screen · Open

- **Area:** UI, app shell (feature request)
- **Observed:** There's no settings menu. The only preference in the game,
  playback speed, is a dropdown under the board, and it resets on every level
  (QA-001).
- **Wanted** *(Designer, 2026-09-26)*:
  1. An **obvious way to open settings on every screen**: a menu you can
     click in the UI.
  2. **Esc** opens it too.
  3. It holds **settings for the UI**.
- **Decided** *(Designer, 2026-09-26)*:
  4. **First version has four settings:** playback speed, theme (light, dark
     or follow the system), code text size, and animations (full or reduced).
  5. **Esc opens settings from inside the code editor too.** Ctrl+M
     (CodeMirror's switch that makes Tab move focus) stays the keyboard way
     out of the editor, since Esc-then-Tab no longer does that.
  6. **The speed dropdown under the board stays** as a shortcut. It and the
     setting are the same value, so changing one changes the other.
- **Notes:**
  - The top bar (`src/app.ts`) is shared by every screen, so one Settings
    button there covers the level select, every level and the harness.
  - A `<dialog>` opened with `showModal()` closes on Esc and keeps focus
    inside while it's open. Make sure focus goes back where it was on close,
    and restore it by hand if the browser doesn't.
  - **Esc already has jobs in the code editor.** CodeMirror uses it to close
    the autocomplete list (QA-003 adds that list), close the search panel
    (Ctrl+F) and collapse multiple cursors. Rule: an Esc that closes or
    cancels something does only that, and an Esc that nothing used opens
    settings. To wire it, listen on `document` and skip events that are
    already `defaultPrevented` (CodeMirror sets that on keys it handles).
  - Opening settings pauses playback, like a game's pause menu. A program
    still running in Python can't be paused, only stopped.
  - One small settings store (e.g. `src/settings.ts`) that screens read on
    creation and that notifies them on change, saved in localStorage (wrapped
    in try/catch, with defaults if it's unavailable). QA-001's speed becomes
    one field of it.
  - Plain styling for now (visual pass deferred). Colors come from the CSS
    custom properties.
  - **Per setting:**
    - **Playback speed:** the same values as today's dropdown (0.5×–4×).
      This is QA-001's setting, so fixing one fixes the other.
    - **Theme:** today dark mode only follows the system
      (`@media (prefers-color-scheme: dark)` in `src/styles.css`). Add a
      `data-theme` attribute on `<html>`: the dark tokens apply under
      `:root[data-theme="dark"]`, and under the media query only when the
      theme isn't forced to light. The board and CodeMirror already read the
      CSS variables, so they follow.
    - **Code text size:** a few fixed sizes. The editor's size is set in
      `EditorView.theme` in `src/ui/editor.ts` (15px, 14px for snippets).
      Move it to a CSS variable so one setting covers the editor, lesson
      snippets, console and scratch REPL.
    - **Animations:** today they're reduced only by the OS
      (`@media (prefers-reduced-motion: reduce)` in `src/styles.css`). The
      setting follows the OS by default. "Reduced" applies the same rules
      through a `data-motion` attribute.
- **Open questions:** none.
- **Retest:**
  - The level select, a level and the harness all show the Settings button
    in the same place.
  - Esc opens settings from the board, the Learn panel, the scratch REPL and
    the code editor. With the autocomplete list or the search panel open, Esc
    only closes that. Ctrl+M then Tab moves focus out of the editor.
  - Esc or the close button closes settings, and focus goes back where it
    was. Playback that was running is paused.
  - Each of the four settings takes effect right away, carries over to the
    next level, and survives a reload.
  - Changing speed in the dropdown under the board shows up in settings, and
    the other way round. The theme can be forced light or dark
    whatever the system says, and set back to follow the system.

### QA-007 · Selected text doesn't show on highlighted lines · Open

- **Area:** UI, code editor (bug)
- **Observed:** Highlighting text on line 1 to copy and paste it doesn't
  work. Line 1 had the yellow playback highlight (the step line) at the time
  *(Designer, 2026-09-26)*.
- **Reproduced (2026-09-26):** In a fresh editor, selecting on line 1 works.
  It fails on any line the last run marked: the yellow step line, or the red
  line for an error. After a run that ended with an error on line 1, dragging
  across line 1 does select the text (copying would work), but no highlight
  is drawn, so it looks like nothing happened.
- **Cause:** CodeMirror draws the selection in a layer behind the text. The
  step-line and error-line backgrounds (`--step-line` and `--error-line` in
  `src/styles.css`, used by `.cm-step-line` and `.cm-error-line`) are solid
  colors, so they paint over it. The cursor-line tint (`--active-line`) is
  see-through, which is why unmarked lines are fine.
- **Wanted:** Selected text is visibly highlighted on every line, marked or
  not, and can be copied.
- **Notes:**
  - Fix: make `--step-line` and `--error-line` translucent (a color with
    alpha) in both the light and dark blocks, close to how they look now.
    The lesson snippets and the harness use the same editor setup and tokens,
    so they're covered too.
- **Open questions:** none. The designer's case (yellow line 1) matches the
  cause above.
- **Retest:**
  - Step a run to step 1 so line 1 is yellow, then drag across line 1: the
    selection is visible, and Ctrl+C then Ctrl+V pastes it.
  - The same on a line marked red by an error.
  - Both again in dark mode.

---

## Revisit later

Deferred on purpose. Not bugs, but don't lose them.

- **Game-wide visual design pass, after the vertical slice.** This covers
  the whole game, not just Level 4 (whose old sign square is plain wall for
  now, QA-002). *(Designer, 2026-09-26)* Until then, keep new visuals on the
  seams that already exist so the pass is a reskin, not a rewrite:
  - Colors go in the CSS custom properties in `src/styles.css`, with dark
    mode. Never hard-code colors in TS.
  - Each tile type gets its own draw function and CSS classes in
    `src/ui/board.ts`. When the gate is added, turn the per-tile `if` chain
    into a tile-type → draw-function table.
  - Level files name tile types only, never colors or art.
  - UI icons (playback buttons, the Settings button) are drawn from one
    place, so the pass can swap them. (QA-005, QA-006)
- **Autocomplete in later chapters:** whether to offer methods that are
  unlocked but not typed yet, and whether to suggest in Learn-panel snippets
  and starter code. Chapter 1 counts only what the player typed. (QA-003)
- **Variable names in autocomplete:** revisit in Chapter 2 when variables
  arrive. (QA-003)
- **Guard art at the gate:** optional. (QA-002)
- **Moving obstacles and a finish-line objective, for later levels.** Obstacles
  that move on conditions. One example: an obstacle that moves each time a line
  runs *for the first time*, so a loop body only triggers it on its first pass,
  which rewards loops. That pairs naturally with a **finish line** objective
  (pass through it) as an alternative to the **set target** (end the program on
  the goal square). Early levels keep the set target. *(Designer, 2026-09-26)*
  Engine note: events already carry the full world state (the piece, and from
  QA-002 the opened gates), so moving obstacles would add their positions to
  that state.
