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
    kind: str  # "ability", "property" (used without parentheses) or "builtin"
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
}


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


def builtin_entry(name: str) -> Entry:
    calls, doc = BUILTINS[name]
    return Entry(name, "builtin", calls, **parse_docstring(doc))


# -- which entries a level lists: "taught so far" ---------------------------------


def builtins_called(code: str) -> set[str]:
    """The Python built-ins `code` calls by name (print, range, ...). The level checker uses it too."""
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return set()  # a lesson snippet that's meant to be a syntax error
    return {
        node.func.id
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and hasattr(builtins, node.func.id)
    }


def lesson_snippets(markdown: str) -> list[str]:
    """The code of a lesson's runnable snippets, in order."""
    return [code for _, code in SNIPPET.findall(markdown)]


def taught(markdown: str) -> set[str]:
    """The documented built-ins a lesson's snippets call."""
    return {name for code in lesson_snippets(markdown) for name in builtins_called(code) if name in BUILTINS}


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
    """A level's Codex: its piece's abilities, then every built-in taught so far.

    The piece's entries are exactly this level's abilities, since a locked one
    can't be used. Python's built-ins always work, so every one taught so far
    is listed, in BUILTINS' order. Each says which level brought it in.
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
    found += [builtin_entry(name) for name in BUILTINS if name in introduced]
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
    """The Codex entry for an ability (`pawn.move`), a built-in (`print`), or either's name as text."""
    if isinstance(thing, str):
        if thing in BUILTINS:
            return builtin_entry(thing)
        piece_name, _, ability = thing.partition(".")
        piece = PIECES.get(piece_name)
        return ability_entry(piece, ability) if piece and ability in piece.ABILITIES else None
    owner = getattr(thing, "__self__", None)
    if isinstance(owner, Piece) and getattr(thing, "__name__", "") in type(owner).ABILITIES:
        return ability_entry(type(owner), thing.__name__)
    return next((builtin_entry(name) for name in BUILTINS if thing is getattr(builtins, name)), None)


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
