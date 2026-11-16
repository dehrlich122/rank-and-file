# The e2e checks

How the browser checks work, how to write one, and what bites. Read this before writing or debugging a check.
`CLAUDE.md` has the commands; `docs/WORKFLOW.md` says when the full suite runs (the heavy passes).

## What it is

- `npm run e2e` (`scripts/e2e/`) drives the real app over the Chrome DevTools
  protocol. It needs `npm run dev` running.
- The suites are `harness.check.mjs`, `app.check.mjs` and
  `ui.check.mjs`, with shared helpers (`openLevel`, `setCode`, `solution`) in
  `helpers.mjs`.
- Each check is `check(label, fn)`, where `fn` throws via
  `expect`.
- It writes
  `e2e-results/report.json` plus failure screenshots with spoilers blurred
  (editors, opened hints, solution notes: `SPOILERS` in `suite.mjs`).
- Every user-visible change or fix gets a check, written in the heavy passes (`docs/WORKFLOW.md`).

## Judging a run

- Headless Chrome's renderer sometimes dies on this machine (a crash inside Chrome, not the game: `docs/M4/M4.4.md`
  "The e2e crash"). The runner starts a new Chrome and reruns that suite, at most three attempts, and names the
  restarts in its last line: judge a run by that line and the exit code. `CHROME_PATH` picks another browser (Edge).
- The full run takes 10 to 14 minutes. Never merge, and never edit files the dev server serves, while it is going:
  Vite reloads and checks fail.

## No spoilers in a check

- Solutions are read from
  `solutions/`, never written into a check.
- **Never put editor contents
  into a check's message or return value.** Earlier checks type reference
  solutions, and the app saves each level's code (`src/progress.ts`), so an
  editor dump can leak a solution.
- Read editors with `editorText` (compare in Node).

## Writing a check

- `openLevel(id, { fresh: true })` gives a
  clean page with no saved progress (on `?fresh=` loads, `run.mjs` clears
  every `rank-and-file:` key except settings). `{ reload: true }` reloads and
  keeps progress.
- Find buttons by label with `clickButton`/`hasButton`
  (`helpers.mjs`), and read editors with `editorText` (compare in Node).
- After a hash navigation, wait for `.level[data-level-id="<id>"]`; the old view
  lingers for a moment.
- Inside `evaluate` strings, which are JS template
  literals, write regex escapes as `\\s`.

## What bites

- `?fresh=` loads keep the settings key, so a check that changes a setting puts it back.
- `run()` jumps to the
  last frame and plays no events: `run({ jump: false })` to watch playback.
- Scope board queries to
  `.board-host .board`.
- `browser.key()` needs `keyCode` for arrows (37-40) and Delete (46).
- A mouse click focuses a
  row first: use `mousedown` where focus also selects.
- Downloads are captured by patching `URL.createObjectURL`; a
  file input is filled with `DOM.setFileInputFiles`.
- Sound: count oscillators after a real mouse press.
- Checks of
  Python's own `help()` use `abs`, which the Codex doesn't cover.
- One-off CDP scripts outside the repo import with
  `file:///C:/...` URLs; navigate to a new `?v=` URL, never `Page.navigate` then `Page.reload`.
- The site is published under `/rank-and-file/`: the suite also passes against a subpath build
  (`npm run e2e -- http://localhost:4174/rank-and-file/`, `docs/ARCHITECTURE.md` "Known trade-offs").
