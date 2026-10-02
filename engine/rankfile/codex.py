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
import inspect
import io
import re
import textwrap
from dataclasses import asdict, dataclass, field

from .levels import parse_level
from .pieces import PIECES, Piece

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

INTRO = """help(something) shows what it does and how to use it. For example:

    help(print)
    help(pawn.move)
    help(pawn)          everything your pawn knows in this level

The Codex tab lists everything you've learned so far."""

# Plain values: help(pawn.position) is help((2, 0)) by the time help sees it.
_VALUES = (int, float, bool, tuple, list, dict, set, type(None))


def help(thing=_NOTHING) -> None:
    """Show what something does and how to use it, like Python's own help().

    It stands in for Python's `help` in player code: that one shows engine
    internals (rankfile.pieces), and its interactive mode can't run here.
    """
    print(describe(thing), end="\n\n")  # a blank line after, as Python's own help() leaves


def player_namespace(**names) -> dict:
    """A fresh namespace for player code (a run, a snippet, the REPL), with `names` in it (e.g. the piece).

    Its built-ins are Python's, with the Codex's help() in place of Python's:
    so `help` is a built-in there, as in real Python, and never shows up
    among the player's variables. Each namespace gets its own copy, so one
    run's changes to them can't reach the next.
    """
    return {"__name__": "__main__", "__builtins__": {**vars(builtins), "help": help}, **names}


def describe(thing) -> str:
    """What help(thing) shows."""
    if thing is _NOTHING or thing is help or (isinstance(thing, str) and thing in ("help", "modules")):
        return INTRO
    entry = _entry_for(thing)
    if entry is not None:
        return format_entry(entry)
    if isinstance(thing, Piece):
        return _overview(thing)
    if isinstance(thing, _VALUES):
        return (
            f"{thing!r} is a value (a {type(thing).__name__}), and help() explains what things do. "
            'Try help(print), help(pawn) for what your pawn knows, or help("pawn.position") for one of them.'
        )
    text = _python_help(thing)
    if isinstance(thing, str) and text.startswith("No Python documentation found"):
        return f"There's no help on {thing!r}. Try help(print), or help(pawn) for what your pawn knows."
    return text


def _entry_for(thing) -> Entry | None:
    """The Codex entry for an ability (`pawn.move`), a built-in (`print`), a method of text (`"x".upper`), or any of their names as text."""
    if isinstance(thing, str):
        if thing in PYTHON:
            return python_entry(thing)
        piece_name, _, ability = thing.partition(".")
        piece = PIECES.get(piece_name)
        return ability_entry(piece, ability) if piece and ability in piece.ABILITIES else None
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
    lines = [f"Help on {name}: your piece. In this level it knows:", ""]
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
