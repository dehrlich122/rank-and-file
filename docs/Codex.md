# The Codex: a dictionary of the functions you know

The level screen's only list of functions used to be one line at the bottom
of the Challenge panel, "Your pawn knows": bare names, with no word on what
they do or what they take. The Codex replaces it with a proper dictionary.
*(Designer's idea, 2026-09-29.)*

## Decisions *(Designer, 2026-09-29)*

- **Where:** a third tab, **Codex**, beside Learn and Challenge. Hovering a
  function in your own code (the editor, the REPL, lesson snippets) shows the
  same entry as a tooltip, like an IDE. The "knows" chips link to it.
- **Which entries:** everything taught so far. That means the pawn's
  abilities in this level, plus the Python built-ins that the lessons have
  taught up to this level. Anything this level brings in is marked **New**.
  It's found automatically from each level's unlocks and its lesson code.
  - Not chosen: only this level's entries; the whole game's list with
    locked entries greyed out.
- **`help()`:** it works in your code, lesson snippets and Scratch Python,
  and it shows the same entry, as real Python's `help()` does.
- **When:** its own PR, after PR #10 and before Chapter 2.

## What an entry says

- **How to call it:** `pawn.move(squares=1)`, `pawn.position`,
  `range(stop)`.
- **What it does,** in a sentence or two.
- **Each argument,** in words, with its type: "how many squares to walk, a
  whole number (int). Leave it out to walk 1."
- **What it returns.** The Codex uses Python's own word, "Returns",
  rather than the mockup's "Gives back", so it matches `help()` and real
  docstrings.
- **A short example.**
- **Where it was introduced:** the level that first unlocked or taught it.

The entry lists what you've been taught, never what a level's solution needs.
A list of "functions you'll need here" would be a hint in disguise. The level
checker makes sure a solution only uses built-ins taught by then, so
everything a level expects is already in its Codex.

## Where the words come from

The engine owns every player-facing description, so entries are written in
Python, as docstrings in Google style, the format many Python projects use:

```
Walk forward, one square per step.

Args:
    squares: how many squares to walk, a whole number (int). Leave it out
        to walk 1.

Returns:
    Nothing.

Example:
    pawn.move(3)
```

- **The pawn's abilities** are documented where they're defined, in
  `engine/rankfile/pieces.py`. How to call one comes from its real signature.
- **Python's built-ins** (`print`, `range`, and more as chapters teach them)
  are documented in `engine/rankfile/codex.py`, in the same style. Python's
  own help text for them is written for experienced programmers.
- **Methods of text** *(M3.6)* (`.upper()`, `.replace()`, `.find()` and the
  rest) are documented in `codex.METHODS`, named as `str.upper`, with the
  call shown as `text.upper()`. The Codex tab lists them under "Text", and
  hovering `.upper` in code on any value shows the entry once it's taught.
  Indexing and slicing are syntax, so they have no entry.
- The level checker fails if an unlocked ability, a built-in or a text method
  called in a lesson has no entry. It also fails if a reference solution
  calls a built-in or method that hasn't been taught by its level.

## "Taught so far"

The engine owns this rule (`codex.history`), like every other game rule. The
level checker calls the same function, so the Codex and the checks can't
disagree.

- The UI sends every chapter's levels in play order (`chapters.yaml`, then
  each chapter's levels by id), with each level's file and lesson.
- The levels that count for a level:
  - every curriculum level before it
  - the levels of its own chapter, up to and including it
  - So a Testing-ground level counts Chapter 1 and the Testing-ground levels
    before it.
- The engine finds the built-ins and text methods each lesson snippet calls
  with `ast`, never by matching strings. A snippet that is meant to be a syntax error is
  skipped.
- The pawn's entries are exactly this level's abilities, since a locked
  ability can't be used.
- The built-ins' and methods' entries are every documented one taught so
  far, in the order `codex.PYTHON` lists them (`BUILTINS`, then `METHODS`),
  since Python's own tools always work.
- Each entry names the id of the level that brought it in. The UI turns that
  into "1.4 The Password" or "Testing ground: Clockwork".

## `help()`

`help` in the player's namespace is the engine's own. Python's shows engine
internals (`rankfile.pieces`), and its interactive mode can't run here.

| Call | Shows |
|---|---|
| `help(pawn.move)`, `help(print)`, `help("pawn.move")` | That entry, laid out like Python's `help()` |
| `help(pawn)` | What the pawn knows in this level, one line each |
| `help(pawn.position)`, or any other plain value | A line saying it's a value, and what to try instead |
| `help(my_function)` or anything else | Python's own help text (`pydoc`), so your own docstrings show |
| `help("text")` that isn't found | A line saying so, and what to try instead |
| `help()` | How to use `help()` |

**Scratch Python has no board,** so its session gets a stand-in `pawn` with the
level's abilities.
- `help(pawn.move)` and `dir(pawn)` work there.
- Calling an ability says there's no board to move on, and suggests a lesson
  snippet or the level itself.
- The UI sends the level's piece and abilities with every line typed, so the
  stand-in follows the level, and it survives a restart of Python.
