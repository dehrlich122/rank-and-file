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
- **The knight's abilities** *(M5.1)* are documented the same way, on `Knight` in the same file: `jump(dx, dy)`
  and `look(dx, dy)` in full, and `at_goal()`, `position`, `wait()` and `read()` as short entries of the
  knight's own that say they work just like the pawn's (M5.1 decision 6). A level's Codex lists its own
  piece's abilities, so a knight level shows `knight.jump`, never `pawn.move`.
- **Python's built-ins** (`print`, `range`, and more as chapters teach them)
  are documented in `engine/rankfile/codex.py`, in the same style. Python's
  own help text for them is written for experienced programmers.
- **Methods of text** *(M3.6)* (`.upper()`, `.replace()`, `.find()` and the
  rest) are documented in `codex.METHODS`, named as `str.upper`, with the
  call shown as `text.upper()`. The Codex tab lists them under "Text", and
  hovering `.upper` in code on any value shows the entry once it's taught.
  Indexing and slicing are syntax, so they have no entry.
- **Keywords** *(M5.2)* (`for`, `if`, `while`, `break`, `continue`, `def`, `return`) are entries of a kind of
  their own, `keyword`, written in `codex.py`. An entry says how the keyword is written, what it does, and
  shows a short example that is never on a board, so it is no hint for a level. The words are in
  `docs/M5/M5.2.md`, "The Codex's keywords". The Codex tab lists them under "Keywords", after "Text", and
  hovering one in code shows its entry (`elif` and `else` answer as `if`).
- **Kinds of value** *(M5.3)* (`whole number`, `text`, `True and False`, `None`, `list`, `tuple`) are entries of the
  kind `value`, written in `codex.VALUES`. They answer "what is a list?", which is neither an ability, a built-in
  nor a keyword. No name clashes with a built-in's or keyword's (so the whole numbers are `whole number`; `int`
  stays the built-in's entry). The Codex tab lists them under "Kinds of value", after "Keywords". They have no
  hover: a variable called `text` or `list` must not show a card. A lesson brings one in when its snippets make
  such a value, read with `ast` (`codex._kinds_made`): a constant, an f-string, or a list or tuple display that is
  read, not assigned to (`x, y = pair` makes no tuple). The methods are split by owner: "Text" (`str.…`) and
  "Lists" (`list.…`).
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
- A keyword is taught by the first curriculum lesson whose snippets use its construct: `codex.KEYWORD_NODES`
  maps each keyword to its `ast` node, so a `for` loop in a snippet unlocks `for`. A level's function rules
  or examiner count as `def`, and a wanted answer as `return` (`codex._rule_nodes`).
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
| `help(help)`, `help("help")` | The entry for `help` itself; `help()` with nothing is the how-to-use text |
| `help(pawn)` | What the pawn knows in this level, one line each |
| `help("list")`, `help(list)`, `help([])`, `help(pawn.position)` and the other kinds of value *(M5.3)*: `help("str")`, `help("bool")`, `help(7)`, `help(True)`, `help(None)` | The kind's entry (a bool is `True and False`), then, for a value, a line pointing at `help(print)` and `help(pawn)`. `help(int)` and `help("int")` stay the built-in's |
| `help(2.5)`, a dict or a set | A line saying it's a value, and what to try instead |
| `help("def")`, `help("for")` and the other keywords *(M5.2)* | That keyword's entry, on any level |
| `help(my_function)`, a function of your own *(M5.2)* | How to call it (`stride(squares, times=2)`), then its docstring, or a line saying it has no description yet and where one goes |
| `help(anything else)` | Python's own help text (`pydoc`) |
| `help("text")` that isn't found | A line saying so, and what to try instead |
| `help()` | How to use `help()` |

**Scratch Python has no board,** so its session gets a stand-in `pawn` with the
level's abilities.
- `help(pawn.move)` and `dir(pawn)` work there.
- Calling an ability says there's no board to move on, and suggests a lesson
  snippet or the level itself.
- The UI sends the level's piece and abilities with every line typed, so the
  stand-in follows the level, and it survives a restart of Python.

**`help()` speaks of the level's piece** *(M5.1)*. Each run, snippet and Scratch session gets its own `help`,
and the namespace records which piece the level has (`errors.LEVEL_PIECE`), so the answer doesn't change
when the player reuses the piece's name.
- On a knight level `help()` introduces the knight, `help(knight)` lists what it knows, and
  `help("knight.jump")` answers; `help("pawn.move")` there is unknown text, and the other way round.
- Chapter 7 brings the knight's entries in *(M5.2)*: `knight.jump` on 7.1 and `knight.read` on 7.4, with `def`
  on 7.2, `return` on 7.4 and `help` on 7.6 (the first lesson to call it). The Testing ground comes after
  Chapter 7 in play order, so its three knight levels (`practice-11` to `practice-13`, from
  `scripts/gen_knight.py`: the jump, jumping over and landing on, `knight.look(dx, dy)`) show `knight.jump` as
  brought in by 7.1; only `knight.look` is still brought in there, by `practice-13`.
- Chapter 8 brings in *(M5.3)*: the kind `list` on 8.1 and `tuple` on 8.2, with `knight.position`;
  `knight.pick_up` (an ability) and `knight.inventory` (a property: the satchel, a fresh list each time it is
  asked for) on 8.3; `list.append`, the first entry under "Lists", on 8.4; and the built-ins `sorted`, `min`,
  `max` and `sum` on 8.5, whose lesson calls all four. The mastery, 8.6, brings in nothing.
