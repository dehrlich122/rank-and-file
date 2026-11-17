"""The Codex: the player's dictionary of the functions they know (docs/Codex.md).

Each entry says how to call a function, what it does, what its arguments
mean and what it returns, with a short example. The Codex tab, the editor's
hover tooltips and help() all show the same entry.

The words are docstrings in Google style, the format many Python projects
use:

    Walk forward, one square at a time.

    Args:
        squares: how many squares to walk, ...

    Returns:
        Nothing.

    Example:
        pawn.move(3)

A piece's abilities are documented where they're defined (pieces.py).
Python's built-ins that the lessons teach are documented here, in the same
style, because Python's own help text is written for experienced
programmers.

Which entries a level lists ("taught so far") is decided here too, from
every level's abilities and lesson snippets: the UI sends them, and the
level checker uses the same rule.
"""

import ast
import builtins
import contextlib
import functools
import inspect
import io
import re
import textwrap
from dataclasses import asdict, dataclass, field

from .errors import piece_class
from .exceptions import IT_KNOWS
from .levels import parse_level
from .pieces import PIECES, Pawn, Piece

SECTIONS = ("Args", "Returns", "Example")

# A lesson's runnable snippets: ```python run``` blocks, optionally `run error`, `run lost` or `run timeout`.
SNIPPET = re.compile(r"^```python run(?: (error|lost|timeout))?\n(.*?)^```", re.MULTILINE | re.DOTALL)


@dataclass
class Entry:
    name: str  # as code writes it: "pawn.move", "print"
    kind: str  # "ability", "property" (used without parentheses), "builtin" or "method" (of text, M3.6)
    calls: list[str]  # how to use it: ["pawn.move(squares=1)"]; some built-ins have more than one form
    paragraphs: list[str]  # what it does
    args: list[dict] = field(default_factory=list)  # {"name", "about"} for each argument
    returns: str = ""
    example: str = ""
    introduced: str = ""  # the id of the level that first unlocked or taught it (set by `entries`)
    new: bool = False  # ...when that's the level being played

    def to_dict(self) -> dict:
        return asdict(self)


# Python's built-ins that the lessons teach: the ways to call each, and its
# entry, in the order the curriculum teaches them (the Codex lists them in
# this order). The level checker fails if a lesson calls a built-in that
# isn't here.
BUILTINS: dict[str, tuple[list[str], str]] = {
    "print": (
        ["print(value, ...)"],
        """Show values in the console, then start a new line.

        Give it several values, separated by commas, and it shows them on one
        line with a space between each. Guards at gates hear what you print,
        if your pawn is close enough.

        Args:
            value: what to show: text in quotes, a number, a variable, or
                several of them separated by commas.

        Returns:
            Nothing.

        Example:
            print("Hello")
            print("Squares to go:", 3)
        """,
    ),
    "range": (
        ["range(stop)", "range(start, stop)", "range(start, stop, step)"],
        """Count whole numbers, most often to repeat something with `for`.

        `range(3)` counts 0, 1, 2: three numbers, starting at 0 and stopping
        just before 3. `range(2, 5)` starts at 2 instead: 2, 3, 4. A step
        counts in bigger jumps, or backwards: `range(0, 10, 3)` counts 0, 3,
        6, 9, and `range(3, 0, -1)` counts down 3, 2, 1.

        Args:
            start: where to start counting, a whole number (int). Leave it
                out to start at 0.
            stop: where to stop, a whole number (int). The count stops just
                before it.
            step: how much to add each time, a whole number (int). Leave it
                out to add 1. A negative step counts down.

        Returns:
            The numbers, ready for a `for` loop to go through one at a time.

        Example:
            for number in range(3):
                print(number)
        """,
    ),
    "len": (
        ["len(text)"],
        """Count the characters in a piece of text.

        Letters, digits, spaces and punctuation each count as one.

        Args:
            text: the text to measure, a str.

        Returns:
            How many characters, a whole number (int).

        Example:
            print(len("knight"))
        """,
    ),
    "int": (
        ["int(text)"],
        """Turn text made of digits into a whole number.

        `int("42")` is the number 42, which you can add and compare. Text that
        isn't a whole number, like `"4 2"` or `"ten"`, is an error.

        Args:
            text: the digits to read, a str such as "42". A leading minus
                sign is fine.

        Returns:
            The number, a whole number (int).

        Example:
            print(int("7") + 1)
        """,
    ),
}

# Methods of text (M3.6): called on a piece of text, `text.upper()`. Named
# "str.upper" in the Codex, since a str is Python's name for text. The order is
# the order the lessons teach them.
METHODS: dict[str, tuple[list[str], str]] = {
    "str.upper": (
        ["text.upper()"],
        """Make a copy of the text in capital letters.

        The original text doesn't change: text can never be changed, only
        copied. Keep the copy in a variable, or use it straight away.

        Returns:
            The new text (a str).

        Example:
            print("rook".upper())
        """,
    ),
    "str.lower": (
        ["text.lower()"],
        """Make a copy of the text in small letters.

        Handy for comparing text without caring about capitals.

        Returns:
            The new text (a str).

        Example:
            print("ROOK".lower())
        """,
    ),
    "str.replace": (
        ["text.replace(old, new)"],
        """Make a copy of the text with every `old` swapped for `new`.

        Args:
            old: the piece of text to find, a str.
            new: what to put there instead, a str. An empty "" takes it out.

        Returns:
            The new text (a str).

        Example:
            print("a-b-c".replace("-", " "))
        """,
    ),
    "str.strip": (
        ["text.strip()"],
        """Make a copy of the text without the spaces at its start and end.

        Spaces in the middle stay.

        Returns:
            The new text (a str).

        Example:
            print("  hello  ".strip())
        """,
    ),
    "str.startswith": (
        ["text.startswith(start)"],
        """Check whether the text begins with some other text.

        Args:
            start: the beginning to look for, a str.

        Returns:
            True if it does, False if it doesn't (a bool).

        Example:
            print("knight".startswith("kn"))
        """,
    ),
    "str.endswith": (
        ["text.endswith(end)"],
        """Check whether the text finishes with some other text.

        Args:
            end: the ending to look for, a str.

        Returns:
            True if it does, False if it doesn't (a bool).

        Example:
            print("knight".endswith("ght"))
        """,
    ),
    "str.find": (
        ["text.find(part)"],
        """Find where a piece of text first appears inside the text.

        Positions count from 0, like the characters of text do.

        Args:
            part: the text to look for, a str.

        Returns:
            The position where it starts (an int), or -1 if it isn't there.

        Example:
            print("bishop".find("sh"))
        """,
    ),
    "str.count": (
        ["text.count(part)"],
        """Count how many times a piece of text appears inside the text.

        Copies that would overlap aren't counted twice.

        Args:
            part: the text to look for, a str.

        Returns:
            How many times, a whole number (int). 0 if it isn't there.

        Example:
            print("banana".count("a"))
        """,
    ),
    "str.split": (
        ["text.split(separator)"],
        """Cut the text into pieces wherever the separator appears.

        The separator itself is left out. Take one piece by its position,
        counting from 0: `pieces[0]` is the first.

        Args:
            separator: the text to cut at, a str. Leave it out to cut at
                every run of spaces.

        Returns:
            The pieces, in order, in square brackets (a list), like
            ["a", "b"].

        Example:
            pieces = "north,3".split(",")
            print(pieces[0])
        """,
    ),
}

# Everything the lessons can teach about Python itself, built-ins first.
PYTHON = {**BUILTINS, **METHODS}


def parse_docstring(doc: str) -> dict:
    """Split a Google-style docstring into its paragraphs, args, returns and example."""
    sections: dict[str, list[str]] = {"": []}
    current = ""
    for line in inspect.cleandoc(doc).splitlines():
        if line.endswith(":") and line[:-1] in SECTIONS:
            current = line[:-1]
            sections[current] = []
        else:
            sections[current].append(line)
    paragraphs = "\n".join(sections[""]).split("\n\n")
    return {
        "paragraphs": [" ".join(paragraph.split()) for paragraph in paragraphs if paragraph.strip()],
        "args": _parse_args(textwrap.dedent("\n".join(sections.get("Args", [])))),
        "returns": " ".join(" ".join(sections.get("Returns", [])).split()),
        "example": textwrap.dedent("\n".join(sections.get("Example", []))).strip("\n"),
    }


def _parse_args(text: str) -> list[dict]:
    """`name: about` lines; an indented line continues the argument above it."""
    args: list[dict] = []
    for line in text.splitlines():
        if not line.strip():
            continue
        if line[0].isspace() and args:
            args[-1]["about"] += " " + line.strip()
        else:
            name, _, about = line.partition(":")
            args.append({"name": name.strip(), "about": about.strip()})
    return args


def ability_entry(piece: type[Piece], name: str) -> Entry:
    """A piece's ability, from its docstring. How to call it comes from its real signature."""
    member = inspect.getattr_static(piece, name)
    if isinstance(member, property):
        kind, call, doc = "property", f"{piece.NAME}.{name}", member.fget.__doc__
    else:
        parameters = list(inspect.signature(member).parameters.values())[1:]  # all but self
        kind, call, doc = "ability", f"{piece.NAME}.{name}({', '.join(map(str, parameters))})", member.__doc__
    return Entry(f"{piece.NAME}.{name}", kind, [call], **parse_docstring(doc or ""))


def python_entry(name: str) -> Entry:
    """The entry for one of Python's own tools: a built-in (`print`) or a method of text (`str.upper`)."""
    calls, doc = PYTHON[name]
    return Entry(name, "builtin" if name in BUILTINS else "method", calls, **parse_docstring(doc))


# -- which entries a level lists: "taught so far" ---------------------------------


def _callees(code: str) -> list[ast.expr]:
    """What each call in `code` calls: a name (`print`) or an attribute (`text.upper`)."""
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return []  # a lesson snippet that's meant to be a syntax error
    return [node.func for node in ast.walk(tree) if isinstance(node, ast.Call)]


def _builtins_in(callees: list[ast.expr]) -> set[str]:
    return {callee.id for callee in callees if isinstance(callee, ast.Name) and hasattr(builtins, callee.id)}


def _methods_in(callees: list[ast.expr]) -> set[str]:
    """The methods of text among them, named as the Codex does ("str.upper")."""
    return {f"str.{callee.attr}" for callee in callees if isinstance(callee, ast.Attribute) and f"str.{callee.attr}" in METHODS}


def python_called(code: str) -> set[str]:
    """The built-ins (print, range, ...) and methods of text ("str.upper") `code` calls by name. The level checker uses it too."""
    callees = _callees(code)
    return _builtins_in(callees) | _methods_in(callees)


def lesson_snippets(markdown: str) -> list[str]:
    """The code of a lesson's runnable snippets, in order."""
    return [code for _, code in SNIPPET.findall(markdown)]


def taught(markdown: str) -> set[str]:
    """The documented built-ins and text methods a lesson's snippets call."""
    return {name for code in lesson_snippets(markdown) for name in python_called(code) if name in PYTHON}


def history(level_id: str, chapters: list[dict]) -> list[dict]:
    """The levels that count towards a level's Codex, "taught so far", in play
    order and ending with the level itself: every curriculum level before it,
    then its own chapter's levels up to it. So a Testing-ground level counts
    the chapters listed before the Testing ground, then the Testing-ground
    levels up to it.

    `chapters` is every chapter in play order, as the UI lists them:
    {"curriculum": bool, "levels": [{"id", "data" (the level file), "lesson" (Markdown)}]}.
    """
    counted: list[dict] = []
    for chapter in chapters:
        ids = [level["id"] for level in chapter["levels"]]
        if level_id in ids:
            return counted + chapter["levels"][: ids.index(level_id) + 1]
        if chapter["curriculum"]:
            counted += chapter["levels"]
    return []


def level_tags(data: dict, chapters: list[dict]) -> dict:
    """A level's tier, worked out from what it needs (M4.4, docs/M4/M4.4.md decision 4): the latest curriculum chapter
    that brings in one of its abilities, a construct its rules require, or its piece; that chapter's tier.

    An ability or a piece is brought in by the first curriculum level that has it, a construct by the first whose
    lesson snippets use it. What no curriculum chapter teaches is ignored.

    `chapters` is every chapter in play order, as for `history`, each also with its "chapter" number and "tier".
    Returns {"tier": str | None, "chapter": int | None}.
    """
    level = parse_level(data)
    abilities, nodes, pieces = set(level.api), set(level.constraints.require_nodes), {level.piece}
    latest: dict | None = None
    for chapter in chapters:
        if not chapter["curriculum"] or not (abilities or nodes or pieces):
            continue
        found = False
        for item in chapter["levels"]:
            seen = item["data"]
            brought = abilities & set(seen.get("api", []))
            abilities -= brought
            found = found or bool(brought) or seen.get("piece", "pawn") in pieces
            pieces.discard(seen.get("piece", "pawn"))
            if nodes:
                used = _nodes_used(item["lesson"]) & nodes
                nodes -= used
                found = found or bool(used)
        if found:
            latest = chapter  # later chapters come later in play order, so the last one found is the latest
    return {"tier": latest["tier"], "chapter": latest["chapter"]} if latest else {"tier": None, "chapter": None}


@functools.lru_cache(maxsize=256)  # a list asks about every level in it, and the lessons are the same each time
def _nodes_used(lesson: str) -> frozenset[str]:
    """The names of the syntax a lesson's snippets use ("For", "While"...). A snippet that isn't Python adds none."""
    used: set[str] = set()
    for code in lesson_snippets(lesson):
        try:
            used |= {type(node).__name__ for node in ast.walk(ast.parse(code))}
        except SyntaxError:
            continue
    return frozenset(used)


def entries(level_id: str, chapters: list[dict]) -> list[Entry]:
    """A level's Codex: its piece's abilities, then every built-in and text method taught so far.

    The piece's entries are exactly this level's abilities, since a locked one
    can't be used. Python's own tools always work, so every one taught so far
    is listed, in PYTHON's order. Each says which level brought it in.
    """
    counted = history(level_id, chapters)
    if not counted:
        return []
    introduced: dict[str, str] = {}
    for item in counted:
        level = parse_level(item["data"])
        for name in [f"{level.piece}.{ability}" for ability in level.api] + sorted(taught(item["lesson"])):
            introduced.setdefault(name, item["id"])
    here = parse_level(counted[-1]["data"])
    piece = PIECES[here.piece]
    found = [ability_entry(piece, name) for name in piece.ABILITIES if name in here.api]
    found += [python_entry(name) for name in PYTHON if name in introduced]
    for entry in found:
        entry.introduced = introduced[entry.name]
        entry.new = entry.introduced == level_id
    return found


# -- help() ----------------------------------------------------------------------

_NOTHING = object()  # help() with nothing in the brackets

def intro(piece: type[Piece] = Pawn) -> str:
    """What help() with nothing in the brackets says, in the words of the level's piece (M5.1)."""
    name = piece.NAME
    return f"""help(something) shows what it does and how to use it. For example:

    help(print)
    help({name}.{piece.ABILITIES[0]})
    {f"help({name})".ljust(19)} everything your {name} knows in this level

The Codex tab lists everything you've learned so far."""


# Plain values: help(pawn.position) is help((2, 0)) by the time help sees it.
_VALUES = (int, float, bool, tuple, list, dict, set, type(None))


def help(thing=_NOTHING) -> None:
    """Show what something does and how to use it, like Python's own help().

    A stand-in for Python's `help` in player code: that one shows engine
    internals (rankfile.pieces), and its interactive mode can't run here.
    This copy doesn't know the level's piece, so it speaks of the pawn;
    `player_namespace` gives each run one that does.
    """
    print(describe(thing), end="\n\n")  # a blank line after, as Python's own help() leaves


def player_namespace(**names) -> dict:
    """A fresh namespace for player code (a run, a snippet, the REPL), with `names` in it (e.g. the piece).

    Its built-ins are Python's, with the Codex's help() in place of Python's:
    so `help` is a built-in there, as in real Python, and never shows up
    among the player's variables. Each namespace gets its own copy, so one
    run's changes to them can't reach the next. Its help() looks in the
    namespace for the level's piece each time it's asked (the REPL's
    stand-in arrives after the namespace is made), and speaks of that piece.
    """
    namespace = {"__name__": "__main__", **names}

    def level_help(thing=_NOTHING) -> None:
        print(describe(thing, piece_class(namespace)), end="\n\n")

    level_help.__name__ = "help"
    level_help.__doc__ = help.__doc__
    level_help._codex_help = True
    namespace["__builtins__"] = {**vars(builtins), "help": level_help}
    return namespace


def describe(thing, piece: type[Piece] = Pawn) -> str:
    """What help(thing) shows, on a level whose piece is `piece`."""
    if thing is _NOTHING or _is_help(thing) or (isinstance(thing, str) and thing in ("help", "modules")):
        return intro(piece)
    entry = _entry_for(thing, piece)
    if entry is not None:
        return format_entry(entry)
    if isinstance(thing, Piece):
        return _overview(thing)
    name = piece.NAME
    if isinstance(thing, _VALUES):
        return (
            f"{thing!r} is a value (a {type(thing).__name__}), and help() explains what things do. "
            f'Try help(print), help({name}) for what your {name} knows, or help("{name}.position") for one of them.'
        )
    text = _python_help(thing)
    if isinstance(thing, str) and text.startswith("No Python documentation found"):
        return f"There's no help on {thing!r}. Try help(print), or help({name}) for what your {name} knows."
    return text


def _is_help(thing) -> bool:
    """help itself: the module's, or a namespace's own copy of it."""
    return thing is help or getattr(thing, "_codex_help", False) is True


def _entry_for(thing, piece: type[Piece] = Pawn) -> Entry | None:
    """The Codex entry for an ability (`pawn.move`), a built-in (`print`), a method of text (`"x".upper`), or any of their names as text.
    A name as text answers for the level's own piece only: help("knight.jump") on a pawn level knows nothing."""
    if isinstance(thing, str):
        if thing in PYTHON:
            return python_entry(thing)
        piece_name, _, ability = thing.partition(".")
        return ability_entry(piece, ability) if piece_name == piece.NAME and ability in piece.ABILITIES else None
    owner = getattr(thing, "__self__", None)
    if isinstance(owner, Piece) and getattr(thing, "__name__", "") in type(owner).ABILITIES:
        return ability_entry(type(owner), thing.__name__)
    method = f"str.{getattr(thing, '__name__', '')}"
    if method in METHODS and (isinstance(owner, str) or thing is getattr(str, thing.__name__)):  # "x".upper, or str.upper
        return python_entry(method)
    return next((python_entry(name) for name in BUILTINS if thing is getattr(builtins, name)), None)


def format_entry(entry: Entry) -> str:
    """An entry laid out the way Python's help() lays out a function."""
    lines = [f"Help on {entry.name}:", "", " or ".join(entry.calls)]
    for paragraph in entry.paragraphs:
        lines += [*_fill(paragraph, 4), ""]
    if entry.args:
        lines.append("    Args:")
        for arg in entry.args:
            lines += _fill(f"{arg['name']}: {arg['about']}", 8, 12)
        lines.append("")
    if entry.returns:
        lines += ["    Returns:", *_fill(entry.returns, 8), ""]
    if entry.example:
        lines += ["    Example:", *textwrap.indent(entry.example, " " * 8).splitlines()]
    return "\n".join(lines).rstrip()


def _overview(piece: Piece) -> str:
    """help(pawn): what the piece knows in this level, one line each."""
    name = type(piece).NAME
    known = [ability_entry(type(piece), ability) for ability in piece._unlocked]  # in the piece's own order
    if not known:
        return f"Help on {name}: your piece. It doesn't know anything yet."
    lines = [f"Help on {name}: your piece. {IT_KNOWS}:", ""]
    for entry in known:
        lines += [f"    {entry.calls[0]}", *_fill(entry.paragraphs[0], 8), ""]
    lines.append(f"help({known[0].name}) tells you more about one of them.")
    return "\n".join(lines)


def _fill(text: str, indent: int, hanging: int | None = None) -> list[str]:
    return textwrap.wrap(text, 76, initial_indent=" " * indent, subsequent_indent=" " * (hanging or indent))


def _python_help(thing) -> str:
    """Python's own help text, for everything the Codex doesn't cover (your own functions, for one)."""
    import pydoc  # only when it's needed: it's a big module to load

    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer):  # pydoc prints some messages instead of returning them
        pydoc.Helper(input=io.StringIO(), output=buffer).help(thing)
    return buffer.getvalue().strip("\n")
