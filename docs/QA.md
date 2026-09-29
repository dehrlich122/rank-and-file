# QA log

Manual QA feedback from the designer while play-testing. Each item records what
was observed, what's wanted, and anything still open. New findings go at the
bottom with the next ID. When an item is fixed, note the commit and the retest
steps, then mark it **Verified** once the designer has re-checked it.

Status: **Open** → **Fixed** (awaiting retest) → **Verified**

Every fix also gets automated browser checks in `npm run e2e`, named after the
QA id (e.g. "QA-005: …"). If one ever fails, `e2e-results/report.json` shows
which step broke, with a screenshot.

No spoilers here either (see `CLAUDE.md`): describe levels by concept and
mechanic, never by solution code.

---

## Session 1 — 2026-09-26 · M1 vertical slice (`m1-vertical-slice`)

### QA-001 · Playback speed resets on every level · Verified

- **Verified** by the designer, 2026-09-26.
- **Fixed** in `8d9687a` (2026-09-26); awaiting the designer's retest (steps under **Retest**).
  - Speed is now a field of the shared settings store (`src/settings.ts`, together with QA-006). It's saved in localStorage, so it also survives a reload.
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

### QA-002 · Level 4 (`ch01-l04`, "The Password") redesign · Verified

- **Verified** by the designer, 2026-09-26.
- **Fixed** in `bc8320d` (2026-09-26); awaiting the designer's retest (steps under **Retest**).
  - "Exact match" means nothing is trimmed. A trailing space, a different capital or the quote marks all get the hamster line.
  - Every line printed next to a *still locked* gate gets the guard's reply, not just near misses. Once the gate is open, it stops listening.
  - The guard's reply appears in the console as a game message, set apart from printed output. The gate also flashes.
  - New brief and hints (no passphrase), plus one lesson line about reading the code you start with. The solution note was rewritten.
  - Retest feedback: a wrong phrase followed by walking into the gate shows two messages. See QA-008.
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

### QA-003 · Autocomplete for calls you've already written · Verified

- **Verified** by the designer, 2026-09-26.
- **Fixed** in `1f12e64` (2026-09-26); awaiting the designer's retest (steps under **Retest**).
  - A call counts as typed once its opening `(` is typed. Pasting counts as typing, since it's the player's own action. Known calls last for the level until the tab is closed; they aren't saved across reloads.
  - Noticed while testing: pressing Enter after an unfinished line like `pawn.` gives the new line Python's continuation indent. That's CodeMirror's normal Python indentation.
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

### QA-004 · Level 5 (`ch01-l05`, "The Winding Path") rework · Verified

- **Verified** by the designer, 2026-09-26.
- **Fixed** in `bdf8755` (2026-09-26); awaiting the designer's retest (steps under **Retest**).
  - The script found a minimum of 11 lines with the gate, so `par` is 11 and `max_lines` is 13. One move per line needs 19.
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

### QA-005 · Playback buttons: new scheme, Play doubles as Run · Verified

- **Verified** by the designer, 2026-09-26.
- **Fixed** in `a0ac8e7` (2026-09-26); awaiting the designer's retest (steps under **Retest**).
  - **Choice to check on retest:** after an edit, the board stays where the last run left it, and the outcome card dims with "Your code has changed since this run". The label under the buttons says "Code changed since the last run." The next run starts from the beginning.
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

### QA-006 · Settings menu on every screen · Verified

- **Verified** by the designer, 2026-09-26.
- **Fixed** in `8d9687a` (2026-09-26); awaiting the designer's retest (steps under **Retest**).
  - Animations offers **Match system / Full / Reduced** (default: Match system).
  - Code text sizes are Small 13, Medium 15, Large 17 and Extra large 20 px.
  - Clicking outside the menu also closes it.
  - The Settings button sits at the right of the top bar.
  - Colour tokens now use `light-dark()`, so forcing a theme just switches `color-scheme`.
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

### QA-007 · Selected text doesn't show on highlighted lines · Verified

- **Verified** by the designer, 2026-09-26.
- **Fixed** in `7366901` (2026-09-26); awaiting the designer's retest (steps under **Retest**).
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

## Session 3 — 2026-09-26 · retesting round 1 (`m1-vertical-slice`)

### QA-008 · Level 4: a wrong passphrase shows two messages · Verified

- **Verified** by the designer, 2026-09-26.
- **Fixed** in `5127e8b` (2026-09-26); awaiting the designer's retest (steps under **Retest**).
  - Pointer wording: "The guard didn't accept what line N printed." It sits on its own line under the elderberries line, and points to the most recent wrong phrase said at that gate. The same applies in level 5.
- **Area:** Gate mechanic (QA-002), so levels 4 and 5
- **Observed:** A wrong passphrase printed next to the locked gate gets the
  guard's hamster line, and the program carries on. When the pawn then walks
  into the gate, the run stops with the elderberries error. One mistake shows
  two messages. This is what QA-002 specified.
- **Designer's question:** Thinking like a Python programmer, would the error
  usually be caught at the wrong `print()`, or when the pawn tries to move
  into the locked square?
- **Answer:**
  - **At the move.** `print()` can't fail because of *what* it prints. It
    writes the text and returns. Nothing goes wrong until the program tries
    something that can't be done, here walking into a locked square, and
    that's the line the error points to.
  - It's one of the most common patterns in real code: the mistake is on one
    line, and the crash comes later on another. Working back from the crash
    to the cause is a core debugging skill. In this level, the guard's reply
    in the console is the clue that leads back to the `print()`.
  - Stopping the run at the `print()` would teach something that isn't true
    of Python. A wrong value stops a program on the spot only when it's
    passed to something that checks it and raises an error (like `int("abc")`).
    A later piece of the API could work like that (a method that takes the
    phrase), but `print()` never does.
  - The guard's reply isn't an error. It works like a warning or a log line:
    the program notices, says so, and keeps going.
- **Recommendation:** Keep the behavior. One wrinkle: the elderberries line
  ends "Maybe try the passphrase first", which reads oddly when the player
  *did* try, just with the wrong words. Option: when a wrong phrase was said
  at that gate earlier in the run, the error card adds a line under the
  elderberries text pointing back to it (e.g. "The guard didn't accept what
  line N printed."). The elderberries line itself stays word for word.
- **Decided** *(Designer, 2026-09-26)*:
  1. **Keep both messages.** A wrong phrase gets the hamster line and the run
     carries on. Walking into the locked gate stops the run with the
     elderberries error, as QA-002 specifies.
  2. **Add the pointer line.** When a wrong phrase was said at that gate
     earlier in the run, the error adds a line under the elderberries text
     pointing back to the line that printed it. The elderberries line stays
     word for word. Walking in without having said anything shows the
     elderberries line alone.
- **Notes:**
  - The guard event is already attached to the step of the `print()` that
    caused it, so its line number is in the recording. The pointer can come
    from the engine (add it to the friendly text when raising
    `GateLockedError`, which keeps it in one place) rather than the UI working
    it out.
  - Tests: an engine case in `engine/tests/test_errors.py` or the gate tests
    for "wrong phrase, then walk in" (pointer present) and "walk in without
    saying anything" (no pointer).
  - If more than one wrong phrase was said at the gate, point to the most
    recent one.
- **Open questions:** none.
- **Retest:**
  - Level 4: print a near miss next to the gate, then walk into it. The
    console shows the hamster line, and the run stops with the elderberries
    error plus a line naming the line that printed the near miss.
  - Walk into the gate without printing anything: the elderberries error
    alone, with no pointer line.
  - Print the right phrase from too far away, then walk in: no pointer line,
    since the guard never heard it.
  - Level 5: the same with its gate.

### QA-009 · Settings: code panel on the right, bottom or left · Verified (right, left) · bottom → QA-012

- **Retest** *(Designer, 2026-09-26)*: right and left look good. Bottom is off by a fair margin; continued in QA-012.
- **Fixed** in `3641cd8` (2026-09-26); awaiting the designer's retest (steps under **Retest**).
  - Bottom: the code row takes about 40% of the window's height. The editor is on the left, with Variables above Console on the right.
  - Windows 1180px wide or less ignore the setting and keep today's layout.
- **Area:** UI, level screen layout + settings menu (feature request, builds
  on QA-006)
- **Observed:** A level is always three columns: Learn/Challenge on the left,
  the board in the middle, and the code on the right (the `.level` grid in
  `src/styles.css`). The only exception is below 1180px wide, where the code
  already drops to a full-width row under the other two.
- **Wanted** *(Designer, 2026-09-26)*:
  1. A new setting in the menu moves the code panel: **right** (today's
     layout, the default), **bottom** or **left**.
  2. **Bottom:** the Learn/Challenge panel stays as it is, on the left.
  3. **Left:** the Learn/Challenge panel swaps to the right side, so it's code
     | board | Learn/Challenge.
- **Decided** *(Designer, 2026-09-26)*:
  4. **The whole code column moves:** the Run/Stop bar, editor, Variables and
     Console, not just the editor.
  5. **Bottom is full width,** under both the Learn panel and the board, like
     today's narrow layout.
- **Notes:**
  - Settings: a new field in `Settings` (`src/settings.ts`, with `DEFAULTS`,
    `sanitize` and `settings.test.ts`) and a new group in
    `src/ui/settingsDialog.ts`.
  - Do the layout in CSS only: a `data-` attribute on `<html>` set by
    `applyToDocument` (the same pattern as theme and animations) that
    switches the `.level` grid's `grid-template-areas`. Nothing gets rebuilt,
    so switching while a level is open keeps the code, its undo history and
    the playback position.
  - Bottom already exists as the layout below 1180px, so it can reuse those
    rules. With the code full width, the editor can sit on the left with
    Variables and Console beside it instead of stacked under it.
  - The Scratch Python drawer lives in the Learn/Challenge panel, so it moves
    with it.
  - Narrow screens: three columns don't fit below 1180px, which is why the
    code goes to the bottom there today. **Right and left apply on wide
    screens only, and narrower screens keep today's layouts** *(Designer,
    2026-09-26)*.
- **Open questions:** none.
- **Retest:**
  - Settings shows the new option, with right selected by default.
  - Bottom: the whole code column (Run/Stop, editor, Variables, Console)
    runs full width under both the Learn panel and the board, and
    Learn/Challenge stays on the left.
  - Left: code | board | Learn/Challenge, and Scratch Python moves with
    Learn/Challenge.
  - Switching layouts mid-level keeps the code, undo history and playback
    position. The choice carries over to the next level and survives a
    reload.

### QA-010 · Learn panel in steps, with a next page · Verified

- **Retest** *(Designer, 2026-09-26)*: okay. A design-pass idea is under Revisit later: make it more obvious that there are more steps.
- **Fixed** in `9559bfd` (2026-09-26); awaiting the designer's retest (steps under **Retest**).
  - A lesson with one snippet (level 5) has one step. It shows only "Start the challenge →", with no step count and no Back button.
- **Area:** UI, Learn panel (feature request, goes with QA-009)
- **Observed:** The whole lesson is one scrolling column in the Learn tab
  (`src/ui/lesson.ts`), with "Start the challenge →" at the end.
- **Wanted** *(Designer, 2026-09-26)*: the Learn panel is **chunked into
  steps**, and past the page limit there's a **next page** instead of a
  longer scroll. The lesson text itself stays the same.
- **Decided** *(Designer, 2026-09-26)*:
  1. **Every layout,** not only with the code at the bottom.
  2. **One step per runnable snippet.** The lesson sets the page breaks, not
     the panel's height. A step that's still too tall for the panel scrolls
     inside it.
- **Notes:**
  - Each lesson is a heading and short paragraphs around 1–3 runnable
    snippets (≤150 words, enforced by `test_levels.py`). Ending a step after
    each snippet gives 2–3 pages per lesson with no changes to the lesson
    files. Text after the last snippet joins the last step.
  - Build every step once and show one at a time (`hidden`), so a snippet's
    code, mini board and output survive flipping pages.
  - Back and Next buttons with "Step 2 of 3" at the bottom of the panel. On
    the last step, Next becomes "Start the challenge →". A level opens on
    step 1. Going to the Challenge tab and back keeps the step you were on.
  - The Challenge tab stays one page. It's short.
- **Open questions:** none.
- **Retest:**
  - In each of the three layouts (QA-009), level 1's lesson shows step 1 of
    N, with one step per runnable snippet. Next and Back move between steps,
    and the last step ends with "Start the challenge →".
  - Run a snippet, go to the next step and back: its code, board and output
    are still there.
  - Switch to Challenge and back: still on the same step.

### QA-011 · Collapse the Learn/Challenge panel; the board grows · Reworked → QA-013

- **Retest** *(Designer, 2026-09-26)*: not happy with it in any layout, and especially with the code at the bottom. Collapsing should make the board easier to see and work with, but it made it harder. Continued in QA-013.
- **Fixed** in `a6689a7` (2026-09-26); awaiting the designer's retest (steps under **Retest**).
  - The board lost its old 560px cap in every layout, so on big windows it's larger even with the panel open.
  - **To check on retest:** in the Bottom layout, the playback controls and outcome sit *beside* the board, and the board already fills its row's height. Height is the limit there (the "whichever comes first" case), so collapsing widens the board's column but doesn't make the board itself bigger. With the code on the right or left, the board grows (e.g. 444 → 530 px in a 1400×860 window).
- **Area:** UI, level screen layout (feature request, desktop only; goes
  with QA-009)
- **Observed:** The Learn/Challenge panel is always open, and the board has
  a fixed cap: at most 560px wide and 60% of the window's height (`.board`
  in `src/styles.css`). Extra room in its column goes unused.
- **Wanted** *(Designer, 2026-09-26)*:
  1. The Learn/Challenge panel can be **collapsed and expanded**.
  2. The **board grows** into the room that frees up, and shrinks back when
     the panel expands.
  3. **Desktop only.** Mobile needs its own UI (see "Revisit later").
- **Decided** *(Designer, 2026-09-26)*:
  4. **Collapsed lasts for the level.** It stays as you left it while you're
     on a level, including when switching tabs or layouts. Each new level
     opens with the panel expanded, because every level starts with its
     lesson. It isn't a saved setting.
- **Is it possible?** Yes. The board is an SVG that scales cleanly to any
  size. Swap the fixed caps for "fill the middle column, keep the board's
  shape", and it grows and shrinks with whatever room the layout gives it.
  Height is the real limit on laptop screens, since the board shares its
  column with the playback controls and the outcome card, so it grows until
  it runs out of height or width, whichever comes first. The same change
  also helps QA-009's layouts.
- **Notes:**
  - Collapsed, the panel becomes a narrow strip with an expand button, not
    nothing at all, so it's always clear how to get it back. The collapse
    button sits in the panel's tab bar.
  - It works in every QA-009 layout: the strip is on the left when the code
    is on the right or at the bottom, and on the right when the code is on
    the left.
  - Hide the panel, don't rebuild it, so the lesson step (QA-010), snippet
    runs and Scratch Python session survive collapsing. Scratch Python lives
    in this panel, so it's out of sight while collapsed.
  - The grid column shrinks to the strip's width, and the board's column
    takes the rest. The resize follows the animations setting (instant when
    reduced).
  - Only the board needs to grow. The code column keeps its width.
- **Open questions:** none.
- **Retest:**
  - Collapse the panel: it becomes a strip with an expand button, and the
    board grows into the space. Expand it: the board shrinks back.
  - Collapse it, then change the code-panel layout in Settings: it stays
    collapsed. Go to the next level: it opens expanded.
  - Collapse and expand keep the lesson step, snippet results and Scratch
    Python history.
  - Works with the code on the right, at the bottom and on the left.
  - With reduced animations, the change is instant.

### QA-012 · Bottom layout: controls and outcome too wide · Verified

- **Verified** *(Designer, 2026-09-26)*: approved. The error/success card will change in the design pass (see Revisit later); fine for testing functionality now.
- **Retest** *(Designer, 2026-09-26)*: the empty space to the right of the board stays for now; an idea for it is under Revisit later (design pass).
- **Fixed** in `1b1f9b2` (2026-09-26); awaiting the designer's retest (steps under **Retest**).
  - Beside the editor, from top to bottom: the playback bar (buttons, slider, step, speed on one line), then the outcome or error card (scrolls if it's long), then Variables and Console side by side.
  - The board's row keeps an empty space on the right, the same width as the Learn panel, so the board is centred on the screen.
- **Area:** UI, level layout (continues QA-009)
- **Observed** *(Designer, 2026-09-26)*: with the code at the bottom, the
  whole playback line (buttons, slider, speed) and the outcome/error card are
  far too wide. They stretch across the board's row, beside the board.
- **Wanted** *(Designer, 2026-09-26)*: preferably fit them into the area next
  to the editor, where Variables and Console are. Otherwise, at least make
  them narrower so the board is larger and more central.
- **Decided:** the preferred option.
  - In the Bottom layout, the playback bar and the outcome card move into
    the code row, beside the editor, with Variables and Console.
  - The board then has its row to itself, fills that row's height, and sits
    in the middle of the screen (see QA-013).
- **Notes:**
  - The playback bar and outcome card are *moved* between the board panel
    and the code row when the layout changes (not rebuilt), so the playback
    position and the outcome survive a switch.
  - Narrow windows (1180px and below) keep today's layout, as QA-009 decided.
- **Retest:**
  - Bottom: the playback buttons, slider and speed, and the outcome or error
    card, sit beside the editor, together with Variables and Console. Nothing
    of theirs is left in the board's row.
  - The board fills the height of its row and is centred on the screen.
  - Switch between Bottom and Right mid-run: the playback position and the
    outcome card come along. Right and left are unchanged.

### QA-013 · Collapsing the Learn panel: the board stays put · Verified

- **Verified** *(Designer, 2026-09-26)*: approved.
- **Retest** *(Designer, 2026-09-26)*: with the code on the left or right, the code area is now a little too narrow. Continued in QA-014.
- **Fixed** in `1b1f9b2` (2026-09-26); awaiting the designer's retest (steps under **Retest**).
  - The Learn and code panels are both 29% of the window width, kept between 340 and 440px. In a 1400px window, the code panel is now 406px wide (it was about 510) and the board is 514px.
  - Collapsed, the panel becomes a strip at the outer edge of its column. The rest of that column is left empty, so nothing else moves.
- **Area:** UI, level layout (reworks QA-011)
- **Observed** *(Designer, 2026-09-26)*: collapsing made things worse in
  every layout, and most of all with the code at the bottom. The board
  shifted sideways, and the code area grew too, although it never needs to.
- **Wanted** *(Designer, 2026-09-26)*: keep the board in the centre of the
  screen in most cases, and don't have it shift. The code area doesn't need
  to enlarge.
- **The trade-off:** collapsing frees space on one side of the board only,
  so the board can either stay put or grow into that space, not both.
- **Decided** *(Designer, 2026-09-26, "Board stays put")*:
  - The Learn and code panels have **equal fixed widths**, so the board sits
    in the middle of the screen and is as large as the window allows.
  - **Collapsing only hides the lesson.** The panel shrinks to its strip
    against the outer edge, and nothing else moves or resizes.
  - The code panel never enlarges.
  - With the code at the bottom, the board is centred in its row (QA-012).
- **Retest:**
  - With the code on the right or left, the board is in the middle of the
    screen. Collapse and expand the Learn panel: the board and the code
    panel don't move or change size; only the lesson panel shrinks to its
    strip and back.
  - The same with the code at the bottom.
  - Collapsed still lasts for the level, and still keeps the lesson step,
    snippet results and Scratch Python (as in QA-011).
  - With reduced animations, the change is instant.

### QA-014 · Code panel a little too narrow on the left or right · Verified · wrapping → QA-015

- **Verified** *(Designer, 2026-09-26)*: the width looks good. The panel should behave a little differently, though: long lines should wrap instead of running off the side. Continued in QA-015.
- **Fixed** in `0d81b06` (2026-09-26); awaiting the designer's retest.
- **Observed** *(Designer, 2026-09-26)*: after QA-013, the code area is a
  little too narrow when it's on the left or right.
- **Wanted** *(Designer, 2026-09-26)*: about 25% wider.
- **Done:**
  - With the code on the left or right, the code column is now 1.25× the
    Learn column. In a 1400px window, it's 508px instead of 406px. Bottom is
    unchanged.
  - **Trade-off:** the board keeps QA-013's promise of never moving or
    resizing when the Learn panel collapses, and it's centred in its own
    column. But with a wider panel on one side, it now sits about 50px off
    the exact screen centre (towards the Learn panel), and it's 413px in a
    1400×860 window instead of 514px. Keeping it exactly centred would mean
    widening the Learn panel too, which would shrink the board to about
    340px. The Bottom layout keeps it exactly centred.
- **Retest:**
  - With the code on the right, and on the left, the editor has noticeably
    more room. Collapsing the Learn panel still moves nothing else.
  - Judge whether the board's size and position still feel right.

### QA-015 · Wrap long lines in the code editor · Verified

- **Verified** *(Designer, 2026-09-26)*: approved.
- **Fixed** in `987abfa` (2026-09-26); awaiting the designer's retest (steps under **Retest**).
  - A new setting, **Wrap long lines** (On or Off), is On by default.
  - A **Wrap** button at the right end of the code toolbar switches the same setting. It's highlighted while wrapping is on.
  - It applies to the level's code editor and the lesson examples. Scratch Python's input is a single line, so it's unchanged.
  - **Added:** when a line wraps, its extra rows start two columns past the line's own indentation. Otherwise a wrapped line inside a loop would start at the left edge and look dedented, and in Python indentation means something. The line numbers also show which rows belong to one line: only the first row gets a number.
- **Area:** UI, code editor + settings menu (continues QA-014)
- **Observed** *(Designer, 2026-09-26)*: long lines of code run off the side
  of the code panel.
- **Wanted** *(Designer, 2026-09-26)*:
  - Long lines wrap by default, so code doesn't continue off the screen.
  - A text wrapping option in the Settings menu.
  - A toggle on the code area to turn wrapping on or off.
- **Decided:** one setting, with two ways to change it. The Settings menu and
  the toggle in the code toolbar are two views of the same setting (like the
  playback speed, QA-001), so they always agree. The choice carries over to
  other levels and survives a reload.
- **Retest:**
  - Type a long line in a level's editor (a long comment will do). It wraps
    onto more rows instead of running off the side, and there's no sideways
    scrollbar.
  - Indent a long line: its wrapped rows start a little to the right of the
    line's own text, never at the left edge.
  - Press **Wrap** above the editor: long lines run off the side again and
    the button is no longer highlighted. Settings → Wrap long lines now says
    Off. Switch it back On in Settings: the editor wraps again straight away,
    and the button lights up.
  - The lesson examples in the Learn panel follow the same setting.
  - The choice carries over to other levels and survives a reload.
  - Playback's line highlight and the error line still cover the whole
    wrapped line.

## Session 4 — 2026-09-26 · M2 play-test (`m2-feedback-depth`)

The rest of PR #3's manual test list passed *(Designer, 2026-09-26)*:
- saved progress and Reset progress
- stars and par
- hints
- the solution comparison
- giving up
- "Next level" after Chapter 1

Item 6 (hidden boards) became QA-016.

### QA-016 · "Hidden boards": the name, and a goal that seems to move · Verified

- **Verified** *(Designer, 2026-09-26)*: passes, looks good.
- **Fixed** in `bec7f85` (2026-09-26); awaiting the designer's retest (steps under **Retest**).
  - The practice level is now **Blindfold**. It has one map, with no flag and four **?** squares (b3, b5, b6, b8). The Challenge panel says the goal is hidden on one of them and the code runs once for each.
  - After a run, each ? square shows ✓ or ✗. Above the board, a row of buttons names every case ("b3 ✗", "b6 ✓", …) and replays that case's run, with the flag where the goal was.
  - The outcome card follows the whole run: its headline (e.g. "Not there yet"), its colour, and "It worked for 1 of the 4 places the goal could be. This run is the one with the goal on b3." Replaying a case that worked still offers no "Next level" or comparison.
  - "Hidden board" is gone from everything the player reads. The engine calls these **cases**. Other whole maps (`variants`) still work, shown as "board 2", …, for later levels whose layout varies.
  - The lesson, brief, first hint and solution note are rewritten, the spoiler parts blind again.
- **Retest:**
  - Testing ground → Blindfold. Before running, the board shows four ? squares and no flag. The Challenge panel says the goal is on one of them and your code runs once for each.
  - Run code that counts its way to one ? square. The card says how many places it worked for. Each ? shows ✓ or ✗, and the row above the board names the cases.
  - Click a case in the row. Its run replays, with the flag where the goal was in that case. A case that worked still doesn't offer "Next level".
  - Solve it properly. The card says it worked for all 4 places, with three stars, and every case in the row is ✓.
  - Nothing on the page says "hidden board".
- **Area:** hidden boards (M2 step 6), the practice level "Hidden Corridors"
- **Observed** *(Designer, 2026-09-26)*:
  - The flag (goal) looks reachable with an ordinary move.
  - Reaching it, the goal then seems to shift somewhere else, which only
    happens once you've hit the target. It reads as though the goal moved.
  - The name "hidden board" feels odd.
- **Asked** *(Designer, 2026-09-26)*: why call it a hidden board? What
  terminology might fit better? Is there a reason for this terminology in
  Python programming?
- **Clarified** *(Designer, 2026-09-26)*:
  - Swapping the words won't be enough. The lesson's description ("the same
    kind of place, a little different each time") is odd too.
  - From the player's side the board stays the same. The success criteria
    only change if you run the obvious code, so it feels like a
    bait-and-switch.
  - Better: **hide the goal entirely**, or **randomize it** around a few
    spaces, as an honest example of a hidden target.
  - Or use chess feint terms: **Decoy**, **Trap**, **Deflection**, rather
    than "variations".
- **Background** *(Claude)*:
  - "Hidden board" isn't a Python term. It comes from `DESIGN.md`'s "hidden
    board variants".
  - The idea it borrows is **hidden test cases**, from autograders and coding
    sites. You see an example, but your code is judged on inputs you haven't
    seen, which catches hard-coded answers.
  - In Python itself, the matching idea is running the same test on several
    inputs: `@pytest.mark.parametrize`, and tests in general, which the
    curriculum reaches in Chapter 15.
- **What makes it feel like the goal moves:**
  - The extra boards are never shown before a run.
  - They only run after the visible board is solved.
  - The failing one is then drawn in the visible board's place.
- **Options for the name** *(Claude, proposed)*:
  - **Test boards** (recommended): "Your code must also pass 3 test boards."
    It's the vocabulary of real testing, and it doesn't suggest a trick.
  - **Hidden tests:** closest to the autograder term, but it keeps "hidden".
  - **Variations:** plain, and also a chess term (an alternative line of
    play), but it teaches nothing about programming.
- **Options for the goal seeming to move** *(Claude, proposed)*:
  - Show the test boards before a run: small previews in the Challenge panel.
  - Show every board's result as a row (your board ✓, test 1 ✗, …), so a
    failure reads as another board, not the same one changing.
  - Both.
- **Decided** *(Designer, 2026-09-26)*:
  - **Hidden goal.** No flag is drawn. The squares where the goal might be
    are marked **?**. The code runs once for each possible spot and must
    find the goal every time. Afterwards each spot shows ✓ or ✗, and any
    spot's run can be replayed. The reason to ask `at_goal()` instead of
    counting is plain from the start, and nothing seems to move.
  - **No "hidden board" wording** anywhere the player reads it. The lesson,
    goals and outcome describe it plainly, e.g. "the goal could be on any ?
    square", "found the goal from 3 of 4 spots".
  - **Chess feint terms** (Decoy, Deflection) go in level titles and flavour
    only. "Trap" is kept for Chapter 9's traps, which raise exceptions.
- **Plan** *(Claude)*:
  - The engine keeps its general mechanism (`variants`). A level can say the
    goal is hidden. Its description then lists the candidate squares instead
    of the goal, and a run reports every board's outcome, not just the first
    failure.
  - The board draws the ? squares and each spot's ✓ or ✗. Clicking a spot
    replays that run.
  - Hidden Corridors gets a rewritten brief, lesson, hints and note. The
    spoiler parts are written blind again.
  - `ARCHITECTURE.md` and `M2.md` are updated to match.

## Session 5 — 2026-09-27 · M3.1 play-test (`m3-1-toolkit`, PR #8)

### QA-017 · Pits are too much like walls · Verified

- **Verified** *(Designer, 2026-09-27)*: tested, checks out.
- **Fixed** in `15a0499` (2026-09-27); awaiting the designer's retest (steps
  under **Retest**).
  - A chaser whose step lands on an open pit falls in and is gone. The
    console says "The chaser fell into the pit on …".
  - Planks lie on the board and are picked up by walking over them. The
    console says how many the pawn carries. `pawn.bridge()` lays one over
    the pit ahead, and the board draws the plank over it. With no plank, or
    no open pit ahead, it's an error.
  - Stepping Stones is reworked around a plank. **Pitfall** is a new
    Testing-ground level (the last in the list).
  - Deferred: a general inventory for carried items (planks now, keys
    later), to be done when a second item arrives.
- **Retest:**
  - Testing ground → Stepping Stones:
    - The board shows the trench of pits and a plank.
    - The Challenge panel's Obstacles section explains pits and bridging.
    - Walking into a pit still reads "Lost".
    - `pawn.bridge()` with no plank, or with no pit ahead, is an error that
      says why.
    - Pick up the plank (the console says so), bridge a pit (a plank
      appears over it) and walk across.
  - Testing ground → Pitfall:
    - The Obstacles section says a chaser doesn't see pits.
    - Lure the chaser into a pit. It disappears, the console says it fell,
      and the way is clear.
  - Hovering an open pit says it's a pit, not that it's bridged.
- **Area:** pits (M3.1 step 1); Testing ground 2, Stepping Stones
- **Observed** *(Designer, 2026-09-27)*: it's not clear how a pit differs
  from a wall here. Both stop the code, and both let you run again.
- **Asked** *(Designer, 2026-09-27)*:
  - What makes them structurally different?
  - Can a pit be hopped over?
  - Can something be built to go over a pit, rather than around it?
  - Pits need better differentiation to be worth much. If they're worth
    anything, it's as a problem like a wall that has different ways to get
    past it.
- **Answer** *(Claude)*: today, almost nothing sets them apart.
  - **A wall** is a bump. The move never happens, the pawn stays where it
    was, and the run ends as an error ("Python stopped", with a traceback).
  - **A pit** is a loss. The pawn steps in, and the run ends as "Lost".
  - That error/loss difference is the only one. Nothing can jump a pit or
    cross it, and chasers avoid pits just as they avoid walls. So in play,
    a pit is a wall with a different message.
- **Decided** *(Designer, 2026-09-27)*: fix it in PR #8 in two ways:
  - **Pits swallow enemies.**
  - **Planks bridge pits.**
  - Not chosen: jumping (a knight's move, better kept for the knight tier),
    and hidden pits (they need sensing, from Chapter 4).
- **Plan** *(Claude)*:
  - **Swallowing:**
    - A chaser no longer avoids pits. If its step lands on one, it falls in
      and is gone. The console says so, and it no longer counts as an enemy.
    - Walls still hold a chaser, so luring one into a pit is a new tactic.
    - Patrols keep their fixed routes, which never cross a pit.
  - **Planks:**
    - A new `plank` tile, picked up by walking over it. The console says
      how many the pawn now carries. A level can also hand some out at the
      start (`start: {planks: 1}`).
    - `pawn.bridge()`, a new ability, lays a plank over the pit ahead. It's
      an action, so it costs a tick. The pit becomes floor, for enemies too.
    - With no plank, or no pit ahead, it's an error, as bumping a wall is.
    - Walls can't be bridged.
  - **Levels:**
    - Stepping Stones is reworked: a row of pits cuts the goal off, and a
      plank lies off to one side.
    - A new Testing-ground level, **Pitfall**: a chaser guards the way, and
      pits are the way to be rid of it.
  - The Obstacles text explains both rules.

### QA-018 · The idiomatic solution can be copied for three stars · Verified

- **Verified** *(Designer, 2026-09-27)*: tested, checks out.
- **Fixed** in `120930a` (2026-09-27); awaiting the designer's retest (steps
  under **Retest**).
  - The third star is now "No hints or solution seen". A run that misses it
    says why: "(you looked at the solution)", "(you opened 2 hints)", or
    both.
  - When seeing the solution would cost the star, Compare asks first in
    the Challenge panel ("Show it" / "Not yet"). From the outcome card, it
    opens the panel at the question. With nothing to lose (three stars
    already, a hint open, or the solution seen before), it opens straight
    away.
  - "Show me a solution" counts as seeing it. Best stars are never taken
    back.
- **Retest:**
  - Solve a Testing-ground level with one line over par (two stars), then
    press Compare on the outcome card. The Challenge panel asks first.
    "Not yet" keeps the solution closed; "Show it" opens it.
  - Run the idiomatic solution. It's solved with two stars, and the third
    says "(you looked at the solution)".
  - Press Compare again. It opens straight away.
  - On a level already solved with three stars, Compare opens straight
    away, and the level keeps its three stars.
  - The Challenge panel's Stars section says "Solve it without opening a
    hint or seeing the solution."
- **Area:** stars and the solution comparison (M2)
- **Observed** *(Designer, 2026-09-27)*: viewing the idiomatic solution
  doesn't count against the no-hints star. So a player can view it, write
  the code exactly as shown, and earn three stars.
- **Wanted** *(Designer, 2026-09-27)*: viewing the idiomatic solution should
  leave you at two stars at most, the same as opening a hint.
- **Plan** *(Claude)*:
  - The third star becomes "no hints and no solution seen".
    - The UI tells the engine whether the solution was seen, as it does
      for hints.
    - A run that misses the star says why: the hints opened, the solution
      seen, or both.
  - A new progress flag records that the solution was seen. Opening the
    comparison sets it, and so does "Show me a solution".
  - Opening the comparison would give up the star, so it asks first, inside
    the Challenge panel, the way "Show me a solution" does. When the level
    already has three stars, there's nothing to lose, and it opens straight
    away.
  - Best stars are never taken back. A level solved with three stars keeps
    them after its solution is viewed.

### QA-019 · Pursuit's lesson snippet has no chaser in it · Verified

- **Verified** *(Designer, 2026-09-27)*: tested, checks out.
- **Fixed** in `e3e7a76` (2026-09-27); awaiting the designer's retest (steps
  under **Retest**).
  - A level can give its lesson a board of its own (`lesson_board`).
  - Pursuit's lesson has two snippets on a board with a chaser straight
    ahead and a wall between. Turning on the spot, the chaser gets no
    closer. Stepping aside, it slides round the wall.
  - Pitfall's snippet has a pit between the pawn and a chaser. Two waits,
    and it falls in.
  - Snippets show the game's messages under their output, and a snippet
    that ends in a loss reads "Lost".
  - Other obstacle lessons (The Sentry's Round, Clockwork, Portcullis, The
    Capture) still use the plain board. They can get boards of their own
    if wanted.
- **Retest:**
  - Testing ground → Pursuit, Learn tab. Each snippet's board shows the
    chaser and the wall. Run the first: the pawn turns, and the chaser
    stays behind the wall. Run the second: the chaser moves round the wall
    toward the pawn, step by step.
  - Testing ground → Pitfall, Learn tab. Run the snippet: the chaser steps
    into the pit and disappears. Under the snippet, "The chaser fell into
    the pit on c2." appears before the printed line.
- **Decided** *(Designer, 2026-09-27)*: yes. As new obstacles or
  interactions are introduced, they're shown in the sample code. The rule
  is in `CLAUDE.md`.
- **Extended** in `6d25779`: every Testing-ground lesson that brings in
  something new has a lesson board and snippets that show it at work:
  - **Stepping Stones:** a long move falls into a pit (Lost); a plank
    bridges it.
  - **Checkpoints:** a waypoint ticked off in the middle of a move.
  - **The Sentry's Round:** stepping out too soon is caught (Lost); waiting
    lets the patrol pass.
  - **Clockwork:** a loop winds the patrol two steps, and the same prints
    copied out wind it three.
  - **Portcullis:** arriving early bumps the shut gate; waiting gets
    through.
  - **The Toll:** collect two gems, then answer the guard.
  - **The Capture:** take one enemy; trying the armoured one is an error.
  - A snippet can be marked meant to lose (`python run lost`), as one can
    be marked meant to fail.
- **Retest (extension):** on each of those lessons' Learn tabs, the
  snippet's board shows the obstacle, and running it shows it at work.

- **Area:** lesson snippets (M1), Testing ground 5 (Pursuit)
- **Observed** *(Designer, 2026-09-27)*: Pursuit's sample code doesn't make
  any sense. It should show the chaser at work as the code runs.
- **Cause** *(Claude)*: every lesson snippet runs on the same small, empty
  board. Pursuit's snippet just walks the pawn about. Pitfall's is worse: it
  prints "The chaser took two steps" on a board with no chaser.
- **Plan** *(Claude)*:
  - A level can give its lesson a board (`lesson_board`: map, legend,
    enemies, start). The level checker validates it like the level's own
    map. Levels without one keep the plain board.
  - Pursuit and Pitfall get boards with a chaser, and snippets that show it
    moving: for Pursuit, stepping toward the pawn and held by a wall; for
    Pitfall, falling into a pit.
  - Snippets show the game's messages (e.g. "The chaser fell into the pit")
    under their output, as the level's console does. A snippet that ends
    in a loss reads "Lost", not "Python stopped".

### QA-020 · `range()` isn't well explained in Clockwork's lesson · Verified

- **Verified** *(Designer, 2026-09-27)*: tested, checks out.
- **Fixed** in `1c19fa3` (2026-09-27); awaiting the designer's retest.
- **Retest:** Testing ground → Clockwork, Learn tab. It's three steps now:
  - `range(3)` and the numbers it hands the loop, printed round by round.
  - A loop of moves: the pawn walks three squares, and the clockwork
    patrol takes two steps.
  - The same moves copied out: the patrol takes three.
- **Area:** Testing ground 6 (Clockwork), its lesson
- **Observed** *(Designer, 2026-09-27)*: `range()` isn't well explained in
  this lesson.
- **See also** QA-021, the same level's patrol.
- **Cause** *(Claude)*: the lesson gives `range(3)` half a sentence ("counts
  0, 1, 2"). It doesn't say where the numbers stop, what the loop variable
  holds, or that the repeated lines can be moves.
- **Plan** *(Claude)*: rewrite the lesson in three steps:
  1. What `range(3)` hands the loop: 0, 1 and 2, one per round, starting at
     0 and stopping just before 3, so "three rounds". Each round, the loop
     variable holds that round's number (printed).
  2. A loop of moves: the pawn walks three squares, but the loop is only
     two lines of code, so the clockwork patrol takes two steps.
  3. The same moves copied out: three new lines, three steps.

### QA-021 · Clockwork's patrol seems to stop at a5 instead of turning back · Verified

- **Verified** *(Designer, 2026-09-27)*: tested, checks out.
- **Fixed** in `16bb3ee` (2026-09-27); awaiting the designer's retest (steps
  under **Retest**).
  - A clockwork enemy's gear badge counts its steps: ⚙ 0, ⚙ 1, ⚙ 2… While
    a loop repeats lines, the count stops, and so does the patrol. A
    clockwork timed gate's badge counts the same way ("⚙ 2 · every 3").
  - The Obstacles text for a new-line patrol adds: "While your code only
    repeats lines that have already run, it stands still." The lesson says
    it too.
  - The same commit fixes a slip in QA-020: the lesson's copied-out moves
    matched Chapter 1 level 1's reference solution word for word. The
    bundle check caught it. Each copied line now names its round in a
    comment.
- **Decided** *(Designer, 2026-09-27)*: show it with a count on the gear,
  and say it in words. (Not chosen: moving the patrol's start.)
- **Retest:**
  - Testing ground → Clockwork. Before running, the patrol's badge reads
    ⚙ 0.
  - Run code with a loop. The count goes up only on lines that run for the
    first time, and stays put, with the patrol, while the loop repeats.
  - The Obstacles section says it stands still while your code only
    repeats lines.
  - On the Learn tab, the second snippet shows the count stopping at 2.
- **Area:** clockwork obstacles (M3.1 step 4), Testing ground 6 (Clockwork)
- **Observed** *(Designer, 2026-09-27)*: the patrol stops once it reaches a5,
  instead of turning back and carrying on with its patrol.
- **Answer** *(Claude)*: it isn't a route bug, but it clearly doesn't read
  as intended.
  - Checked with the engine: nine new lines of code take it d5 → e5 → a5
    and back to e5, turning at both ends.
  - A clockwork patrol only steps when a line runs for the first time. A
    loop repeats old lines, so once the code runs no new ones, it stands
    still.
  - A five-line program gives it five steps, and five steps from d5 end
    exactly on a5. So it looks as if it stopped at the end of its route.
  - Nothing on the board shows that it's waiting for a new line. The
    Obstacles text says what moves it, but not that it stands still
    otherwise.


### QA-022 · Is The Toll teaching variables? · Verified

- **Verified** *(Designer, 2026-09-27)*: tested, checks out.
- **Fixed** in `fc26f1a` (2026-09-27); awaiting the designer's retest.
  - The lesson snippet prints the answer directly (`print(2)`), with no
    variable, and the text says where to stand.
  - Counting gems in a variable is noted in `docs/M3.md` as an idea for
    Chapter 2's level specs.
- **Decided** *(Designer, 2026-09-27)*: drop the variable, and keep the level
  about its two mechanics.
- **Retest:** Testing ground → The Toll, Learn tab. The snippet collects two
  gems, prints 2 next to the gate, and walks through. Nothing mentions
  variables.

- **Area:** Testing ground 8 (The Toll), its lesson
- **Asked** *(Designer, 2026-09-27)*: is The Toll supposed to teach creating
  variables? Neither the lesson nor the Challenge information makes it
  clear.
- **Answer** *(Claude)*: no. It's a Testing-ground level for two mechanics,
  collecting gems and a guard who asks a question.
  - Printing the answer directly passes the guard; no variable is needed.
  - The Trains line and the goals don't mention variables.
  - The confusion came from the lesson snippet written for QA-019
    (`gems = 2`, then `print(gems)`). It brings in a variable with no
    explanation.
  - Variables belong to Chapter 2 (M3.2), where counting gems in a variable
    fits naturally.


### QA-023 · The Toll teaches nothing that level 1.4 didn't · Verified

- **Verified** *(Designer, 2026-09-27)*: tested, checks out.
- **Fixed** in `656ab0f` (2026-09-27); awaiting the designer's retest.
  - The Toll's Trains line and brief now say it's a demo of two mechanics
    that teaches nothing beyond level 1.4, and that both come into their
    own later, when the code has to work the answer out as it runs.
- **Decided** *(Designer, 2026-09-27)*: keep it as a demo, and say so.
  - Not chosen: an answer that varies between boards (`print(pawn.gems)`),
    or removing the level.
  - The idea that makes a question guard worth having is in `docs/M3.md`
    for Chapter 2: an answer that can't be known ahead of time.
- **Retest:** Testing ground → The Toll. The level list and the Challenge
  panel say it's a demo with nothing new to learn.

- **Area:** gems and guards with a question (M3.1 steps 2-3), Testing ground
  8 (The Toll)
- **Observed** *(Designer, 2026-09-27)*: after QA-022, it's not clear what
  the gems are for, or what The Toll teaches that level 1.4 (the guard's
  gate) didn't.
- **Answer** *(Claude)*: nothing new.
  - The gems are waypoints you count, and the guard's question is 1.4's
    passphrase, worked out by counting on the board before writing any
    code.
  - A question only differs from a passphrase when its answer can't be
    known ahead of time, so the program has to find it out as it runs. On
    one fixed board, you can always count by eye.
  - This is the same kind of gap as QA-017 (pits were walls with a
    different message).


### QA-024 · Portcullis: a gate that shuts on the pawn should crush it · Verified

- **Verified** *(Designer, 2026-09-27)*: tested, checks out.
- **Fixed** in `bc8c4b1` (2026-09-27); awaiting the designer's retest (steps
  under **Retest**).
  - A timed gate is open for its first `open` ticks (default 2) of every
    `every`, starting open. Its badge reads "2 of 3".
  - Anything under a shut gate after a tick is crushed: the pawn loses the
    run ("crushed by the gate on …"), and a chaser is gone. Walking into a
    shut gate still bumps, like a wall.
  - Portcullis is regenerated for the new timing: new par, and new hints,
    written blind as before. Its lesson shows a bump, a crush and a clean
    pass.
- **Decided** *(Designer, 2026-09-27)*:
  - A level sets how long a gate stays open, 2 ticks by default.
  - A shutting gate crushes enemies too.
- **Retest:**
  - Testing ground → Portcullis. The gates' badges and the Obstacles text
    say how long each is open and that it crushes.
  - Walk straight through: the run is lost, crushed.
  - Walk into a shut gate: a bump, as before.
  - Arrive at each gate as it opens and step out the next tick to get
    through.
  - Learn tab: the three snippets show a bump, a crush and a clean pass.

- **Area:** timed gates (M3.1 step 3), Testing ground 7 (Portcullis)
- **Asked** *(Designer, 2026-09-27)*: can the gate open before the move and
  close after it, so that a pawn on the gate square at any time the gate is
  shut is lost?
- **Answer** *(Claude)*: yes, with one catch.
  - Today a timed gate is open for a single tick of each cycle ("every 3" is
    open on ticks 0, 3, 6, …).
  - Stepping onto the gate square takes a tick, and stepping off takes
    another. So a one-tick opening would always shut with the pawn on it.
  - For the rule to work, a gate has to stay open long enough to pass
    through: at least two ticks.

## Session 6 — 2026-09-29 · Testing-ground hints (`tg-hints`, PR #10)

The designer's answer to PR #8's question: are the Testing-ground hints good
enough, or should they be rewritten?

### QA-025 · Stepping Stones: hint 2 gives too much away · Fixed

- **Fixed** in `05221bc` (2026-09-29); awaiting the designer's retest.
  - Hint 2 only explains the plank: walk over it to pick it up, and lay it
    over a pit as a bridge you can walk on. It has no code.
  - Hint 3 shows the code for bridging (`pawn.bridge()`, then
    `pawn.move()`) instead of the first lines of the route.
  - Hint 1, the reference solution and par are unchanged.
- **Retest:** Testing ground → Stepping Stones. Open hints 2 and 3: hint 2
  explains, and hint 3 shows the code.

- **Area:** Testing ground 2 (Stepping Stones), its hints
- **Observed** *(Designer, 2026-09-29)*: hint 2 is a little on the nose.
- **Wanted** *(Designer, 2026-09-29)*: hint 2 could just explain that the
  plank can be used to build a bridge over pits. The code for building the
  bridge could then come in hint 3.


### QA-026 · The Sentry's Round turns, in the level that brings in `wait()` · Fixed

- **Fixed** in `03c75c5` (2026-09-29), with a level test in `b9f4034`;
  awaiting the designer's retest.
  - `scripts/solve.py` now weighs a solution by lines, then turns. Among
    the shortest programs it takes the one that turns least, so idle ticks
    go to `wait()`.
  - The Sentry's Round is regenerated. Par is still 3, and the reference
    and hint 3 wait instead of turning.
  - The fix changed three references: this one, Pursuit (QA-027) and
    Portcullis (QA-028). The other Testing-ground levels already turned
    only where they had to.
  - New level test: where `wait()` is unlocked, a reference never turns
    more than it needs to between one step and the next, and never after
    its last step.
- **Retest:** Testing ground → The Sentry's Round. Hint 3 uses `wait()`,
  with no turns. After solving, the solution in the comparison waits too.

- **Area:** Testing ground 4 (The Sentry's Round), its reference solution and
  hint 3; `scripts/solve.py`
- **Observed** *(Designer, 2026-09-29)*: the idiomatic solution uses
  `turn_left()` and `turn_right()`, and so does hint 3. That feels odd in the
  level where `wait()` is introduced.
- **Cause** *(Claude)*:
  - Hint 3 on the M3.1 levels is "One way to start:" plus the first lines
    of the reference solution, and `scripts/solve.py` finds the reference.
  - A turn spends a tick just like `wait()`. The search only counted lines,
    and it tried turns before `wait()`, so it passed time by turning away
    and back.


### QA-027 · Pursuit: hint 3 turns on the spot · Fixed

- **Fixed** in `c522931` (2026-09-29); awaiting the designer's retest.
  - `wait()` is unlocked. The reference takes the same route as before, but
    waits one tick where it spun for two, so par goes from 5 to 4.
  - Hint 3 is regenerated, and it waits. Hints 1 and 2 are unchanged.
  - The lesson's first snippet waits two ticks instead of turning on the
    spot.
- **Decided** *(Designer, 2026-09-29)*: unlock `wait()` in Pursuit, and
  accept par 4.
  - Not chosen: keep Pursuit without `wait()`, and reword hint 3 to explain
    turning on the spot.
- **Retest:** Testing ground → Pursuit.
  - The Challenge panel lists `wait()`, and par is 4.
  - Hint 3 uses `wait()`.
  - Learn tab: the first snippet waits two ticks, and the chaser stays
    behind its wall.

- **Area:** Testing ground 5 (Pursuit), its reference solution and hint 3
- **Observed** *(Designer, 2026-09-29)*: hint 3 is another odd one, with
  `turn_left()` and `turn_right()` in it. Hints 1 and 2 are good.
- **Cause** *(Claude)*: the same as QA-026. Pursuit has no `wait()`, so
  turning away and back is the only way it can pass time.


### QA-028 · Portcullis: hint 3 starts oddly, and the gates' cycle could be a hint · Fixed

- **Fixed** in `9721bc1` (2026-09-29); awaiting the designer's retest.
  - Hint 2 ends with the designer's reminder: "Don't forget: the gates keep
    cycling on every tick, so time your loops carefully!" ("run for every
    tick" became "keep cycling on every tick".)
  - The reference is regenerated with the QA-026 search, and its longest
    run of waits is a `for` loop. Par goes from 8 to 7.
  - Hint 3 is regenerated from it, and it only waits: no turns, and the
    pawn never faces the edge. The note says a loop does the longest wait.
- **Decided** *(Designer, 2026-09-29)*: the reference uses the loop, par 7.
  - Not chosen: one `wait()` per line, par 8.
- **Retest:** Testing ground → Portcullis.
  - Hint 2 ends with the reminder.
  - Hint 3 only waits.
  - Par is 7. After solving, the comparison's solution uses a loop.

- **Area:** Testing ground 7 (Portcullis), its hints
- **Observed** *(Designer, 2026-09-29)*: basically fine, except the weird
  "One way to start" hint, which has you run your pawn into a wall.
- **Wanted** *(Designer, 2026-09-29)*: if the gates run on loops, mention it
  in a hint, e.g. "Don't forget, gates run for every tick, so time your loops
  carefully!"
- **Cause** *(Claude)*: the same as QA-026. The reference passed time with
  turns, so its opening lines turned the pawn toward the edge of the board.

---

## Queued work

Planned tasks that aren't QA findings, in the order they should happen.

### After the next QA pass: checks for redundant code *(Designer, 2026-09-26)* · Done

- **Done** in `f86163d` (tools) and `3b7cbcd` (first `/simplify` sweep), 2026-09-26.
  - `npm run check` now runs `npm run lint`:
    - knip (TypeScript)
    - ruff and vulture (Python; vulture catches unused functions)
    - jscpd (copy-pasted blocks)
    All pass. Config is in `knip.json`, `pyproject.toml` and `.jscpd.json`.
  - The allowlist `scripts/vulture_allowlist.py` covers names used only from JavaScript, from player code, or through JSON. The glob-loaded engine files needed no allowlisting.
  - Tool findings fixed:
    - un-exported names used only in their own file
    - one copy-pasted block (the e2e suites' shared helpers, now `scripts/e2e/helpers.mjs`)
    - unused protocol parameters
    - import order
  - `/simplify` findings fixed:
    - The Challenge panel's goal and rule wording now comes from the engine (`Level.describe()`).
    - The watchdog's timeout isn't hard-coded in messages any more.
    - Playback frames share one console log instead of copying it per step.
    - A test-only method was removed.
  - The four `/simplify` review agents stopped early at the account's session usage limit, so the same four angles (reuse, simplification, efficiency, altitude) were reviewed directly.
  - Step 4 (`/simplify` at the end of every round) is in `CLAUDE.md`.

- **When:** after the designer's next round of testing is logged and its
  fixes (plus QA-008) are in. Do it before new features, so the first sweep
  covers everything built so far.
- **Why:** nothing checks for redundant code today. The TypeScript compiler
  catches unused variables, parameters and imports (`noUnusedLocals`,
  `noUnusedParameters` in `tsconfig.json`), but nothing covers the Python
  engine, files or exports nobody uses, or copy-pasted logic.
- **Steps:**
  1. Add three development-only tools and run them in `npm run check`:
     - `knip` (TypeScript): unused files, exports and dependencies.
     - `ruff` (Python, via `requirements-dev.txt`): unused imports and
       variables, and general tidiness. Add `vulture` too if unused functions
       should be caught.
     - `jscpd`: copy-pasted blocks across TypeScript and Python.

     The engine itself stays free of third-party imports. These only run
     during development.
  2. Run them over the whole codebase once and fix what they find. Expect
     false positives from code that's loaded by name rather than imported:
     the engine files pulled in by `import.meta.glob` in `src/py/worker.ts`,
     and the `bridge.py` functions the worker calls. Allowlist those in the
     tools' config, don't delete them.
  3. Run `/simplify` on that cleanup, for the things tools can't judge:
     near-duplicate functions, code more general than it needs to be, or
     something rebuilt where an existing helper would do.
  4. From then on, run `/simplify` at the end of every round of fixes,
     before committing.
     - **Changed** *(Designer, 2026-09-27)*: `/simplify` and the e2e
       checks (writing and running them) now happen once per PR, just
       before it's merged, not after each QA fix. They cost too many
       tokens. See `CLAUDE.md`.
- **Done when:** `npm run check` runs all three tools and passes, and
  `CLAUDE.md` lists them under Commands. Its line "No linter or formatter is
  configured" gets updated too.

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
- **Bottom layout, the empty space right of the board** (design pass). One idea: Variables move there, and Console takes the whole area under the playback slider beside the editor. *(Designer, 2026-09-26; QA-012)*
- **The outcome/error card, reworked in the design pass.** It works for testing functionality now. *(Designer, 2026-09-26; QA-012)*
- **Make it obvious a lesson has more steps** (design pass). For example, the Next button could name what's coming ("Step 2 →", "Step 3 →") instead of a plain "Next →". *(Designer, 2026-09-26; QA-010)*
- **Mobile UI.** Phones need a different UI entirely, not a squeezed
  desktop layout. Not in this milestone, and it may become a phase 2 build.
  `DESIGN.md` §7 already lists mobile layout as out of scope for now.
  Everything in QA-009 to QA-011 is desktop only. *(Designer, 2026-09-26)*
- **Moving obstacles and a finish-line objective, for later levels.** Obstacles
  that move on conditions. One example: an obstacle that moves each time a line
  runs *for the first time*, so a loop body only triggers it on its first pass,
  which rewards loops. That pairs naturally with a **finish line** objective
  (pass through it) as an alternative to the **set target** (end the program on
  the goal square). Early levels keep the set target. *(Designer, 2026-09-26)*
  Engine note: events already carry the full world state (the piece, and from
  QA-002 the opened gates), so moving obstacles would add their positions to
  that state. **Now planned:** M3.1's obstacle toolkit (`docs/M3.md`): patrols,
  chasers, a clock set per obstacle (including this first-time-a-line-runs
  trigger), and waypoints you pass over.
