# UI conventions

How the TypeScript side is put together. Read this before changing anything under `src/ui/`, `src/app.ts`,
`src/styles.css`, settings or progress. The level editor has its own page, `docs/EDITOR.md`; the engine and the
worker are in `docs/ARCHITECTURE.md`; the Codex's entries are in `docs/Codex.md`.

## The basics

- TypeScript, no framework. Build DOM with `h()` from `src/ui/dom.ts`.
  Attributes starting with `on` become listeners; string children become text
  nodes, so player text is never inserted as HTML.
- Routes live in `src/app.ts`: `#/` (level select), `#/level/<id>`
  (`ui/levelView.ts`), and `#/harness` (the M0 page for running raw Python,
  with demo buttons for each failure path).
- One `PyClient` is shared by the whole app; the scratch REPL's session lives
  in the worker, so it resets if the watchdog restarts Python.
- The UI never re-implements game rules; it draws what the engine
  reports.

## Content, colours and progress

- Level content is bundled by `src/content.ts`. Reference solutions and their
  notes are **lazy** (`loadSolution`): each is its own file, fetched only when
  the player opens the comparison (`ui/compare.ts`) after solving.
  `npm run check:bundle` fails if one ever lands in the main bundle. Never
  make those globs eager.
- Colours are CSS custom properties in `src/styles.css`, written as
  `light-dark(<light>, <dark>)`. The Theme setting switches `color-scheme` via
  `data-theme` on `<html>`. Never hard-code colours in TS. Icons come from
  `src/ui/icons.ts` (inline SVG). A visual design pass is planned, so keep new
  visuals on these seams (tokens, icons, the tile → draw-function table in
  `board.ts`).
- `design/` stays as a record; the noir tile (round 2) is parked: don't edit or delete it.
- Progress lives in `src/progress.ts`: per level, the best stars (solved
  means at least one), hints opened, failed runs after the last hint, whether
  the solution was seen, and the code. It's saved to localStorage like
  settings; both use `src/storage.ts`. Settings → Reset progress clears it.
- A level's help (hints, "Show me a solution", the comparison) is
  `ui/help.ts`. It records each run's result once, from `run()` in
  `levelView.ts`, never from playback, which can reach the end many times.

## The Codex

- The Codex (`ui/codex.ts`, `docs/Codex.md`) is the dictionary of functions
  the player knows.
  - It appears as a third tab, as hover tooltips in every editor, and on the
    Challenge panel's chips. Player code's `help()` shows the same entries.
  - Entries are Google-style docstrings: abilities in `pieces.py`, built-ins
    in `codex.BUILTINS`, or `codex.METHODS` for a method of text. A new ability,
    taught built-in or taught text method needs one.
  - The engine decides what's "taught so far" (`codex.history`). The UI
    sends every chapter's levels and lessons (`content.codexChapters`).
  - The level checker fails if a lesson calls an undocumented built-in, or a
    reference calls one no lesson has taught by then.
  - Scratch Python gets a stand-in piece with no board (`repl.NoBoard`).

## Dialogs and settings

- Dialogs and confirm steps share `ui/dialog.ts` (`modal`, `dialogHead`,
  `confirmStep`). Confirm steps are always inside the page. Never use browser
  `confirm()`/`alert()`, which block the page and the e2e checks.
- Settings (speed, theme, code size, animations, code panel, wrap long lines)
  live in `src/settings.ts`, one store with `get`/`set`/`subscribe` saved to
  localStorage. Screens read it on creation and subscribe to changes. The menu
  is `ui/settingsDialog.ts`. Esc opens it unless CodeMirror used that Esc
  (`defaultPrevented`).
  - Some settings also have a control on the level screen: the speed dropdown
    and the Wrap button. Both are just other views of the same setting.
  - Code editors follow Wrap long lines themselves (`followWrapSetting` in
    `editor.ts`), and stop listening when they're destroyed.

## Code editors

- Editors don't use `basicSetup`: `editor.ts` assembles the same extensions
  minus CodeMirror's autocompletion. Autocomplete is `ui/completion.ts`
  (QA-003). It offers only calls the player typed that are also real (level
  API / builtins / their own `def`s), and only Tab accepts. The level editor
  and the REPL use it; lesson snippets don't.

## The level screen

- The level screen is a CSS grid with named areas `learn` / `board` / `code`
  (`styles.css`). The Code panel setting (QA-009) sets `data-code-panel` on
  `<html>` to rearrange them on wide screens (above 1180px); narrow windows
  always put the code underneath.
  - The Learn and code columns share one fixed width (`--side-col`), so the
    board sits in the middle of the screen (QA-013).
  - Collapsing the Learn panel (`.learn-collapsed` on `.level`) only shrinks
    the panel inside its own column: the board and the code never move or
    resize.
  - With the code at the bottom, `placePlayback()` in `levelView.ts` moves the
    playback bar and outcome card beside the editor (QA-012). They're moved,
    never rebuilt.
  - The board fills its column up to `--board-max-height`.
  - Keep layout changes in CSS wherever possible, and never rebuild the
    editor, board or lesson.
- What kind of level the screen is showing is a `LevelHost` (`ui/levelHost.ts`): a lesson level, a test-play
  from the editor, a shared level, a Free Play challenge, or the Sandbox's scratch level (QA-061,
  `docs/EDITOR.md`). The host says where progress and code are kept, whether there is a Learn tab, a tier tag,
  a solution to offer and stars to show, and where the solved card leads. **A new difference between kinds of
  level is a field on the host; the view never tests `host.kind`.**
- The Learn panel pages one step per runnable snippet (`splitIntoSteps` in
  `ui/lesson.ts`, QA-010).
- Playback buttons follow `controlStates()` in `ui/playback.ts`. Editing code
  drops the current recording, and Play or the right arrows then run the new
  code. How a recording is replayed is in `docs/ARCHITECTURE.md` ("Playback").

## What bites

- `.editor`, `.problems` and `.route` are taken class names: grep before naming a class.
- knip fails on an export or exported type nothing outside its file uses.
- The site lives under
  `/rank-and-file/`, so app URLs must go through `import.meta.env.BASE_URL`,
  never `/...`.
