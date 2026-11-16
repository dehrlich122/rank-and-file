# The level editor

Read this before changing anything under `src/editor/` or the editor's screens. The spec and build notes are
`docs/M4/M4.2.md` (the editor) and `docs/M4/M4.3.md` (the solvability check); the UI conventions it shares with
the rest of the app are in `docs/UI.md`.

- The level editor (M4.2, `docs/M4/M4.2.md`; routes `#/editor`, `#/editor/<id>`, `#/editor/<id>/play`):
  - `src/editor/` is plain data and logic: `draft.ts` (the `Draft`, and `draftToLevelInfo`, which draws
    with no rules), `edit.ts` (pure changes that return a new draft or say why not), `history.ts`
    (undo and redo), `levelData.ts` (draft ⇄ level file and YAML; keys the editor doesn't edit stay in
    `draft.extra`), `checker.ts` (asks the engine), `drafts.ts` (My levels, saved under their own key,
    apart from progress), `starts.ts` (copy a lesson level, never its hints; test-play's `LevelSource`).
  - **The engine is the only judge.** The editor never re-implements a rule: it exports the draft and
    sends it to `loadLevel`. A refusal carries `at` (`LevelError.at`: a square or several, an enemy's
    number, or a field), which `problems.ts` turns into marks on the board. What it may offer
    comes from the `editorOptions` request. A new tile or enemy reaches the palette by being added to
    the sprite registry.
  - The board draws from the engine's own description when it accepted the current draft (that has the
    squares a rook attacks), and from the draft otherwise.
  - Test-play is `mountLevel(…, { testPlay })`: no lesson, hints, solution offer, stars or progress.
  - `engine/tests/test_editor_levels.py` and `src/editor/roundtrip.test.ts` (every level through a
    draft and the real engine, `scripts/compare_levels.py`) guard it. Keep new `LevelInfo` fields in
    step with `draftToLevelInfo`.

## What bites

- A field in the properties panel changes the draft through an update function
  (`ctx.change((d) => ...)`, QA-043).
- `draft()` in `editorScreen.ts` is the board being edited and `whole()` the
  level: save, check, export and test-play use `whole()`.
- `levelData.ts` assigns legend symbols across all boards
  together.
- `edit.ts` functions return `{refused}`; they never throw.
- Never let a test print a level: compare level data as `JSON.stringify(a) === JSON.stringify(b)`.
- In the browser the solver reaches its 200,000-position cap in about
  13 s on a 12 x 12 board with ten gems.
