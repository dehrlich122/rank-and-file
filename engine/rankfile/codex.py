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
import types
from dataclasses import asdict, dataclass, field
from typing import NamedTuple

from .errors import LEVEL_PIECE, piece_class
from .exceptions import IT_KNOWS
from .levels import Level, parse_level
from .pieces import PIECES, Pawn, Piece

SECTIONS = ("Args", "Returns", "Example")

# A lesson's runnable snippets: ```python run``` blocks, optionally `run error`, `run lost` or `run timeout`, and
# optionally `calls gallop(1, 2)` after that (M5.2-5a): the call the examiner makes once the snippet has run, the
# rest of the fence line.
SNIPPET = re.compile(
    r"^```python run(?: (?P<meant>error|lost|timeout))?(?: calls +(?P<call>\S[^\n]*))?\n(?P<code>.*?)^```", re.MULTILINE | re.DOTALL
)


@dataclass
class Entry:
    name: str  # as code writes it: "pawn.move", "print"
    # "ability", "property" (used without parentheses), "builtin", "method" (of text, M3.6), "keyword" (`def`,
    # `return`, `for`...: a word of the language itself, M5.2) or "value" (a kind of value, M5.3)
    kind: str
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
    "help": (
        ["help(thing)", "help()"],
        """Show what something does: its entry in the Codex.

        `help(print)` shows the entry for `print` in the console, and it works
        the same way on an ability of your piece. Put a word of the language
        in quotes: `help("def")`. On a function of your own it shows how to
        call it, and the docstring you wrote under its `def` line.

        Args:
            thing: what to ask about: an ability, a built-in, a function of
                your own, or a keyword in quotes. Leave it out to see how
                `help()` works.

        Returns:
            Nothing.

        Example:
            help(print)
        """,
    ),
    "sorted": (
        ["sorted(values)"],
        """Make a new list with the same items in order, smallest first.

        The list you give it doesn't change: `sorted()` hands back a new one.
        Numbers go from the smallest up, and text goes in alphabetical order,
        capital letters first. Pairs go by their first value, then by their
        second.

        Args:
            values: the items to put in order: a list or a tuple. They must
                all be the same kind: Python can't put text and numbers in
                one order.

        Returns:
            A new list, in order.

        Example:
            keys = [12, 3, 7]
            print(sorted(keys))
        """,
    ),
    "min": (
        ["min(values)"],
        """Find the smallest item.

        `min([12, 3, 7])` is 3. With text, it's the first in alphabetical
        order. Several values separated by commas work too: `min(3, 7)`.

        Args:
            values: the items to look through: a list or a tuple with at
                least one item. An empty one stops your program with an
                error.

        Returns:
            The smallest item. The list doesn't change.

        Example:
            print(min([12, 3, 7]))
        """,
    ),
    "max": (
        ["max(values)"],
        """Find the largest item.

        `max([12, 3, 7])` is 12. With text, it's the last in alphabetical
        order. Several values separated by commas work too: `max(3, 7)`.

        Args:
            values: the items to look through: a list or a tuple with at
                least one item. An empty one stops your program with an
                error.

        Returns:
            The largest item. The list doesn't change.

        Example:
            print(max([12, 3, 7]))
        """,
    ),
    "sum": (
        ["sum(values)"],
        """Add up all the numbers in a list.

        `sum([1, 2, 3])` is 6. An empty list adds up to 0.

        Args:
            values: the numbers to add: a list or a tuple of numbers.

        Returns:
            The total, a number.

        Example:
            print(sum([4, 9, 2]))
        """,
    ),
}

# Methods of text (M3.6), and of lists (M5.3: only `append` is taught): called on a piece of text, `text.upper()`. Named
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
    "list.append": (
        ["items.append(value)"],
        """Add one item to the end of a list.

        It changes the list itself: afterwards the list is one longer. Start
        with an empty list, `[]`, and append to it to build a list one item
        at a time.

        It hands back nothing (None), so call it on a line of its own.
        `items = items.append(3)` would lose the list.

        Args:
            value: the item to add: a number, text, a pair, anything.

        Returns:
            Nothing.

        Example:
            seen = []
            seen.append("brass")
            seen.append("iron")
            print(seen)
        """,
    ),
}

# Everything the lessons can teach about Python itself, built-ins first.
PYTHON = {**BUILTINS, **METHODS}

# The words of the language itself (M5.2), in the order the curriculum brings them in. Each is brought in by the
# first lesson whose snippets use the syntax named in KEYWORD_NODES. `elif` and `else` are part of `if`'s entry.
KEYWORDS: dict[str, tuple[list[str], str]] = {
    "for": (
        ["for name in things:"],
        """Run the indented lines once for each item, with `name` holding that item. `range(3)` hands out 0, 1 and 2.

        Example:
            for i in range(3):
                print(i)
        """,
    ),
    "if": (
        ["if condition: … elif other: … else:"],
        """Run the indented lines only if the condition is true. `elif` tries another condition when the ones above it were false; `else` runs when none were true. Both are optional.

        Example:
            if steps > 3:
                print("far")
            elif steps == 3:
                print("just right")
            else:
                print("near")
        """,
    ),
    "while": (
        ["while condition:"],
        """Run the indented lines again and again, for as long as the condition is true. It is checked before every lap, so something inside has to change it.

        Example:
            left = 3
            while left > 0:
                left = left - 1
        """,
    ),
    "break": (
        ["break"],
        """Leave the loop you are in at once. The laps that were left don't happen.

        Example:
            while True:
                if done:
                    break
        """,
    ),
    "continue": (
        ["continue"],
        """Skip the rest of this lap and go straight on to the next one.

        Example:
            for i in range(5):
                if i == 2:
                    continue
                print(i)
        """,
    ),
    "def": (
        ["def name(parameter, other=default):"],
        """Make a function of your own: a name for some lines of code. Nothing runs when Python reads the `def`; the lines run each time the name is called. The names in the parentheses are parameters: blanks that each call fills in, in order. A parameter written with `= value` has a default: leave it out of a call and it holds that value. Parameters with defaults come last. A sentence in quotes as the first line of the body (a docstring) says what the function does, and `help(name)` shows it.

        Example:
            def cheer(name, times=1):
                for i in range(times):
                    print(f"Go, {name}!")
            cheer("Ada")
            cheer("Bo", 3)
        """,
    ),
    "return": (
        ["return value"],
        """Hand a value back to the line that called the function, and leave the function right there. A function that ends without a `return` hands back `None`. `print` shows a value on the screen; `return` gives it to the caller.

        Example:
            def double(n):
                return n * 2
            print(double(4) + 1)
        """,
    ),
}

# The syntax (`ast` node names) whose first use in a lesson's snippets brings each keyword into the Codex.
KEYWORD_NODES = {"for": "For", "if": "If", "while": "While", "break": "Break", "continue": "Continue", "def": "FunctionDef", "return": "Return"}
KEYWORD_ALIASES = {"elif": "if", "else": "if"}  # help("elif") answers with the `if` entry

# The kinds of value (M5.3, decision 9): "what is a list?" is neither an ability, a built-in nor a keyword. Each is brought
# in by the first lesson whose snippets make such a value (`_kinds_made`). Named so that none is also a PYTHON name: the
# whole numbers are `whole number` because `int` is the built-in's entry.
VALUES: dict[str, tuple[list[str], str]] = {
    "whole number": (
        ["7"],
        """A whole number, written with digits and no quotes. Python calls it an integer, `int` for short.

        Numbers are for counting and arithmetic: `+`, `-` and `*` work on them, and `%` gives what is left over after dividing. `<`, `>` and `==` compare two of them. A number in quotes, `"7"`, is text: `int("7")` makes the number.

        Example:
            steps = 7
            print(steps + 1)
            print(steps % 2)
        """,
    ),
    "text": (
        ['"north"'],
        """Text: letters, digits and signs between quotes. Python calls it a string, `str` for short.

        `+` joins two texts and `len(text)` counts the characters. Each character has a place, counting from 0: `word[0]` is the first and `word[-1]` the last. `part in word` asks whether one text is inside another. Text never changes: a method such as `.upper()` hands back a new text and leaves the old one as it was.

        Example:
            word = "north"
            print(word + "!")
            print(len(word))
            print(word[0])
        """,
    ),
    "True and False": (
        ["True", "False"],
        """A yes or a no. There are only two, written with a capital and no quotes. Python calls them booleans, `bool` for short.

        A comparison such as `steps > 3` makes one, and so does `in`. `if` and `while` read one to decide what runs. `and`, `or` and `not` combine them.

        Example:
            steps = 5
            far = steps > 3
            print(far)
            if far and steps < 10:
                print("in range")
        """,
    ),
    "None": (
        ["None"],
        """Python's word for "nothing here". There is only one, written with a capital and no quotes.

        A function that ends without a `return` hands back `None`, and so does a call that only does something, like `print()`. A name that holds `None` where you expected a value usually kept the answer of such a call.

        Example:
            def shout(word):
                print(word + "!")
            answer = shout("go")
            print(answer)
        """,
    ),
    "list": (
        ["[1, 2, 3]"],
        """Several values in a row under one name, written in square brackets with commas between them. `[]` is a list with nothing in it.

        Each item has a place, counting from 0: `route[0]` is the first and `route[-1]` the last. `len(route)` counts the items, `value in route` asks whether one is there, and `for step in route:` visits each in turn. Unlike text, a list can change: `.append(value)` adds to its end.

        Example:
            route = [2, 5, 3]
            print(route[0])
            print(len(route))
            for step in route:
                print(step)
        """,
    ),
    "tuple": (
        ["(3, 2)"],
        """Values that belong together, written in round brackets with a comma between them. A tuple of two is a pair, like the `(x, y)` of a square.

        A tuple never changes once it is made. Take one value by its place, `place[0]`, or give each value a name of its own in one line: `x, y = place`. That is unpacking, and it needs exactly as many names as there are values. A function that returns two values with a comma between them hands back a tuple.

        Example:
            place = (3, 2)
            x, y = place
            print(x)
            print(place[1])
        """,
    ),
}
VALUE_ALIASES = {"str": "text", "bool": "True and False"}  # help("str") answers with the `text` entry


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


def keyword_entry(name: str) -> Entry:
    """The entry for a keyword of Python (`def`, `for`...)."""
    calls, doc = KEYWORDS[name]
    return Entry(name, "keyword", calls, **parse_docstring(doc))


def value_entry(name: str) -> Entry:
    """The entry for a kind of value (`list`, `text`...)."""
    calls, doc = VALUES[name]
    return Entry(name, "value", calls, **parse_docstring(doc))


def python_entry(name: str) -> Entry:
    """The entry for one of Python's own tools: a built-in (`print`) or a method of text or of a list (`str.upper`)."""
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
    """The methods among them, named as the Codex does ("str.upper", "list.append"). The code doesn't say what kind of value a
    method is called on, so an attribute matches every METHODS name that ends in it."""
    return {name for name in METHODS for callee in callees if isinstance(callee, ast.Attribute) and name.partition(".")[2] == callee.attr}


def python_called(code: str) -> set[str]:
    """The built-ins (print, range, ...) and methods of text or lists ("str.upper") `code` calls by name. The level checker uses it too."""
    callees = _callees(code)
    return _builtins_in(callees) | _methods_in(callees)


class Snippet(NamedTuple):
    """One runnable snippet of a lesson, as its fence gives it."""

    meant: str  # how it ends on purpose: "error", "lost", "timeout", or "" (it finishes)
    call: str  # the call the examiner makes after it ("gallop(1, 2)"), or "" (none)
    code: str


def snippets(markdown: str) -> list[Snippet]:
    """A lesson's runnable snippets, in order, read by name from the pattern."""
    return [Snippet(found["meant"] or "", (found["call"] or "").strip(), found["code"]) for found in SNIPPET.finditer(markdown)]


def lesson_snippets(markdown: str) -> list[str]:
    """The code of a lesson's runnable snippets, in order."""
    return [snippet.code for snippet in snippets(markdown)]


def taught(markdown: str) -> set[str]:
    """The documented built-ins and text or list methods a lesson's snippets call."""
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
    abilities, nodes, pieces = set(level.api), set(level.constraints.require_nodes) | _rule_nodes(level), {level.piece}
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


def _rule_nodes(level: Level) -> set[str]:
    """The syntax a level's function rules and examiner need (M5.2), so the level file needn't repeat them in
    `require_nodes`: a function rule, `define` or an examiner needs `def`; a rule that a function hands back a value,
    or an examiner call that judges an answer, needs `return`."""
    rules, examine = level.constraints, level.examine
    nodes = {"FunctionDef"} if rules.functions or rules.define or examine is not None else set()
    if any(rule.returns for rule in rules.functions.values()) or (examine is not None and examine.judges_answer):
        nodes.add("Return")
    return nodes


@functools.lru_cache(maxsize=256)  # a list asks about every level in it, and the lessons are the same each time
def _parsed(lesson: str) -> tuple[ast.Module, ...]:
    """A lesson's snippets, parsed. A snippet that isn't Python is left out."""
    trees = []
    for code in lesson_snippets(lesson):
        try:
            trees.append(ast.parse(code))
        except SyntaxError:
            continue
    return tuple(trees)


@functools.lru_cache(maxsize=256)
def _nodes_used(lesson: str) -> frozenset[str]:
    """The names of the syntax a lesson's snippets use ("For", "While"...). A snippet that isn't Python adds none."""
    return frozenset(type(node).__name__ for tree in _parsed(lesson) for node in ast.walk(tree))


def _kind_of(node: ast.AST) -> str | None:
    """The kind of value a piece of syntax makes, if any: a constant, an f-string, or a list or tuple display that is
    read. An unpacking target (`x, y = pair`) or an assigned-to list display is a Store, which makes nothing."""
    if isinstance(node, ast.Constant):
        return "text" if isinstance(node.value, str) else _VALUE_KINDS.get(type(node.value))
    if isinstance(node, ast.JoinedStr):
        return "text"
    if isinstance(node, (ast.List, ast.Tuple)) and isinstance(node.ctx, ast.Load):
        return type(node).__name__.lower()
    return None


@functools.lru_cache(maxsize=256)
def _kinds_made(lesson: str) -> frozenset[str]:
    """The kinds of value a lesson's snippets make (VALUES' names). A snippet that isn't Python makes none."""
    return frozenset(kind for tree in _parsed(lesson) for node in ast.walk(tree) if (kind := _kind_of(node)))


def entries(level_id: str, chapters: list[dict]) -> list[Entry]:
    """A level's Codex: its piece's abilities, then every built-in and text or list method taught so far.

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
        used = _nodes_used(item["lesson"])
        for name, node in KEYWORD_NODES.items():
            if node in used:
                introduced.setdefault(name, item["id"])
        for name in _kinds_made(item["lesson"]):
            introduced.setdefault(name, item["id"])
    here = parse_level(counted[-1]["data"])
    piece = PIECES[here.piece]
    found = [ability_entry(piece, name) for name in piece.ABILITIES if name in here.api]
    found += [python_entry(name) for name in PYTHON if name in introduced]
    found += [keyword_entry(name) for name in KEYWORDS if name in introduced]
    found += [value_entry(name) for name in VALUES if name in introduced]
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


# Plain values: help(pawn.position) is help((2, 0)) by the time help sees it. The kinds with an entry (M5.3) ...
_VALUE_KINDS = {int: "whole number", bool: "True and False", type(None): "None", list: "list", tuple: "tuple"}
# ... and the rest, which keep the one-sentence answer.
_VALUES = (float, dict, set)
# The types themselves, for help(list): `int` is left out, since the built-in's entry answers for it.
_VALUE_TYPES = {str: "text", bool: "True and False", list: "list", tuple: "tuple"}


def player_namespace(**names) -> dict:
    """A fresh namespace for player code (a run, a snippet, the REPL), with `names` in it (e.g. the piece).

    Its built-ins are Python's, with the Codex's help() in place of Python's:
    so `help` is a built-in there, as in real Python, and never shows up
    among the player's variables. Each namespace gets its own copy, so one
    run's changes to them can't reach the next. Its help() speaks of the
    level's piece, which the namespace records under a dunder name (LEVEL_PIECE)
    when it's given one; the REPL records its stand-in there later. A player
    can't lose it by reassigning or deleting the piece's name.
    """
    namespace = {"__name__": "__main__", **names}
    if piece := next((type(value) for value in names.values() if isinstance(value, Piece)), None):
        namespace[LEVEL_PIECE] = piece

    def help(thing=_NOTHING) -> None:
        """Show what something does and how to use it, like Python's own help().

        Python's own help() would show the game's inner workings, and its
        interactive mode can't run here, so this one stands in for it.
        """
        print(describe(thing, piece_class(namespace)), end="\n\n")  # a blank line after, as Python's own help() leaves

    help.__qualname__ = "help"  # Python's error messages quote this: "help() takes ...", not "player_namespace.<locals>.help()"
    help._codex_help = True
    namespace["__builtins__"] = {**vars(builtins), "help": help}
    return namespace


def describe(thing, piece: type[Piece] = Pawn) -> str:
    """What help(thing) shows, on a level whose piece is `piece`."""
    if thing is _NOTHING or thing == "modules":
        return intro(piece)
    entry = _entry_for(thing, piece)
    if entry is not None:
        return format_entry(entry)
    if isinstance(thing, Piece):
        return _overview(thing)
    name = piece.NAME
    if (kind := _VALUE_KINDS.get(type(thing))) is not None:  # help([]) answers for the kind, and still points at the piece
        return (
            f"{format_entry(value_entry(kind))}\n\n"
            f"help() explains what things do: try help(print), or help({name}) for what your {name} knows."
        )
    if isinstance(thing, _VALUES):
        return (
            f"{thing!r} is a value (a {type(thing).__name__}), and help() explains what things do. "
            f'Try help(print), help({name}) for what your {name} knows, or help("{name}.position") for one of them.'
        )
    if isinstance(thing, types.FunctionType):
        return _function_help(thing)
    text = _python_help(thing)
    if isinstance(thing, str) and text.startswith("No Python documentation found"):
        return f"There's no help on {thing!r}. Try help(print), or help({name}) for what your {name} knows."
    return text


def _is_help(thing) -> bool:
    """help itself: a namespace's own copy of it."""
    return getattr(thing, "_codex_help", False) is True


def _entry_for(thing, piece: type[Piece] = Pawn) -> Entry | None:
    """The Codex entry for an ability (`pawn.move`), a built-in (`print`), a method of text or of a list (`"x".upper`), or any of their names as text.
    A name as text answers for the level's own piece only: help("knight.jump") on a pawn level knows nothing."""
    if _is_help(thing):
        return python_entry("help")
    if isinstance(thing, str):
        if thing in PYTHON:
            return python_entry(thing)
        if (keyword := KEYWORD_ALIASES.get(thing, thing)) in KEYWORDS:
            return keyword_entry(keyword)
        if (kind := VALUE_ALIASES.get(thing, thing)) in VALUES:
            return value_entry(kind)
        piece_name, _, ability = thing.partition(".")
        return ability_entry(piece, ability) if piece_name == piece.NAME and ability in piece.ABILITIES else None
    owner = getattr(thing, "__self__", None)
    if isinstance(owner, Piece) and getattr(thing, "__name__", "") in type(owner).ABILITIES:
        return ability_entry(type(owner), thing.__name__)
    for kind in (str, list):
        method = f"{kind.__name__}.{getattr(thing, '__name__', '')}"
        if method in METHODS and (isinstance(owner, kind) or thing is getattr(kind, thing.__name__)):  # "x".upper, or str.upper
            return python_entry(method)
    if isinstance(thing, type) and thing in _VALUE_TYPES:
        return value_entry(_VALUE_TYPES[thing])  # help(list)
    # `help` is in `builtins` only once `site` has run; a missing one is None, which must not match help(None)
    return next((python_entry(name) for name in BUILTINS if thing is not None and thing is getattr(builtins, name, None)), None)


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


def _function_help(function: types.FunctionType) -> str:
    """help(f) for a function the player wrote, in the Codex's plain style: how to call it, then its docstring."""
    lines = [f"{function.__name__}{inspect.signature(function)}", ""]
    doc = inspect.getdoc(function)
    if not doc:
        return "\n".join(lines + _fill("It has no description yet: a sentence in quotes as the first line of its body would show here.", 4))
    for paragraph in doc.split("\n\n"):
        lines += [*_fill(" ".join(paragraph.split()), 4), ""]
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
