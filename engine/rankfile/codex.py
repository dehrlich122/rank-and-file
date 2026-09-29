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
"""

import ast
import builtins
import contextlib
import inspect
import io
import textwrap
from dataclasses import asdict, dataclass, field

from .pieces import PIECES, Piece

SECTIONS = ("Args", "Returns", "Example")


@dataclass
class Entry:
    name: str  # as code writes it: "pawn.move", "print"
    kind: str  # "ability", "property" (used without parentheses) or "builtin"
    call: str  # how to use it: "pawn.move(squares=1)", "pawn.position"
    summary: str  # what it does; paragraphs are separated by a blank line
    args: list[dict] = field(default_factory=list)  # {"name", "about"} for each argument
    returns: str = ""
    example: str = ""
    introduced: str = ""  # the level that first unlocked or taught it (set by `entries`)
    new: bool = False  # ...when that's the level being played

    def to_dict(self) -> dict:
        return asdict(self)


# Python's built-ins that the lessons teach: how each is called, and its entry.
# The level checker fails if a lesson calls a built-in that isn't here.
BUILTINS: dict[str, tuple[str, str]] = {
    "print": (
        "print(value, ...)",
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
        "range(stop) or range(start, stop)",
        """Count whole numbers, most often to repeat something with `for`.

        `range(3)` counts 0, 1, 2: three numbers, starting at 0 and stopping
        just before 3. `range(2, 5)` starts at 2 instead: 2, 3, 4.

        Args:
            start: where to start counting, a whole number (int). Leave it
                out to start at 0.
            stop: where to stop, a whole number (int). The count stops just
                before it.

        Returns:
            The numbers, ready for a `for` loop to go through one at a time.

        Example:
            for number in range(3):
                print(number)
        """,
    ),
}


def parse_docstring(doc: str) -> dict:
    """Split a Google-style docstring into its summary, args, returns and example."""
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
        "summary": "\n\n".join(" ".join(paragraph.split()) for paragraph in paragraphs if paragraph.strip()),
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
    return Entry(f"{piece.NAME}.{name}", kind, call, **parse_docstring(doc or ""))


def builtin_entry(name: str) -> Entry:
    call, doc = BUILTINS[name]
    return Entry(name, "builtin", call, **parse_docstring(doc))


def taught(snippets: list[str]) -> list[str]:
    """The documented built-ins these lesson snippets call, in the order they first appear."""
    names: list[str] = []
    for code in snippets:
        try:
            tree = ast.parse(code)
        except SyntaxError:
            continue  # a snippet that's meant to be a syntax error
        calls = sorted(
            (node.lineno, node.col_offset, node.func.id)
            for node in ast.walk(tree)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in BUILTINS
        )
        for *_, name in calls:
            if name not in names:
                names.append(name)
    return names


def entries(piece: str, api: list[str], history: list[dict]) -> list[Entry]:
    """A level's Codex: its piece's abilities, then the built-ins taught so far.

    `history` is the levels that count, in play order and ending with this
    one, each as {"label", "api", "snippets"} (docs/Codex.md, "Taught so
    far"). The piece's entries are exactly this level's abilities, since a
    locked one can't be used; Python's built-ins always work, so every one
    taught so far is listed.
    """
    introduced: dict[str, str] = {}
    for level in history:
        for name in [f"{piece}.{ability}" for ability in level["api"]] + taught(level["snippets"]):
            introduced.setdefault(name, level["label"])
    here = history[-1]["label"] if history else ""
    piece_class = PIECES[piece]
    found = [ability_entry(piece_class, name) for name in piece_class.ABILITIES if name in api]
    found += [builtin_entry(name) for name in introduced if name in BUILTINS]
    for entry in found:
        entry.introduced = introduced.get(entry.name, here)
        entry.new = entry.introduced == here
    return found


# -- help() ----------------------------------------------------------------------

_NOTHING = object()  # help() with nothing in the brackets

INTRO = """help(something) shows what it does and how to use it. For example:

    help(print)
    help(pawn.move)
    help(pawn)          everything your pawn knows in this level

The Codex tab lists everything you've learned so far."""


def help(thing=_NOTHING) -> None:
    """Show what something does and how to use it, like Python's own help().

    It stands in for Python's `help` in player code: that one shows engine
    internals (rankfile.pieces), and its interactive mode can't run here.
    """
    print(describe(thing), end="\n\n")  # a blank line after, as Python's own help() leaves


def player_builtins() -> dict:
    """Python's built-ins for player code, with the Codex's help() in place of Python's.

    It goes in as the namespace's `__builtins__`, so `help` is a built-in there,
    as in real Python, and never shows up among the player's variables.
    """
    return {**vars(builtins), "help": help}


def describe(thing) -> str:
    """What help(thing) shows."""
    if thing is _NOTHING or thing is help or (isinstance(thing, str) and thing in ("help", "modules")):
        return INTRO
    entry = _entry_for(thing)
    if entry is not None:
        return format_entry(entry)
    if isinstance(thing, Piece):
        return _overview(thing)
    return _python_help(thing)


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
    lines = [f"Help on {entry.name}:", "", entry.call]
    for paragraph in entry.summary.split("\n\n"):
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
    piece_class = type(piece)
    name = piece_class.NAME
    unlocked = dir(piece)  # what the level unlocked (sorted, so the piece's own order is used below)
    known = [ability_entry(piece_class, ability) for ability in piece_class.ABILITIES if ability in unlocked]
    if not known:
        return f"Help on {name}: your piece. It doesn't know anything yet."
    lines = [f"Help on {name}: your piece. In this level it knows:", ""]
    for entry in known:
        lines += [f"    {entry.call}", *_fill(entry.summary.split("\n\n")[0], 8), ""]
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
