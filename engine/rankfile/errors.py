"""Turn Python errors into plain-language explanations.

Every ErrorInfo keeps two views of the same error:

- `friendly`: a short explanation for the player, shown first.
- `traceback`: Python's real traceback, trimmed to the player's own code.
  Learning to read these is part of the curriculum, so it's always available.

Friendly messages never mention line numbers; the UI shows the line next to
them and highlights it in the editor.
"""

import ast
import builtins
import difflib
import linecache
import re
import traceback
from dataclasses import dataclass

from .exceptions import GameError, Lost
from .pieces import Piece
from .tracer import PLAYER_FILENAME, StepBudgetExceeded
from .words import count


@dataclass
class ErrorInfo:
    type: str  # the exception class name, e.g. "NameError"
    message: str  # Python's own message, e.g. "name 'pwan' is not defined"
    friendly: str  # a plain-language explanation for the player
    line: int | None  # the line of the player's code that caused it
    traceback: str  # the real traceback, trimmed to the player's own code


def explain(exc: BaseException, namespace: dict | None = None) -> ErrorInfo:
    """Describe `exc`. `namespace` holds the player's variables, for "did you mean" suggestions."""
    tb = traceback.TracebackException.from_exception(exc)
    _keep_player_frames(tb)
    return ErrorInfo(
        type=type(exc).__name__,
        message=str(exc),
        friendly=friendly_message(exc, namespace or {}),
        line=_error_line(exc, tb),
        traceback="".join(tb.format()),
    )


def friendly_message(exc: BaseException, namespace: dict) -> str:
    if isinstance(exc, (GameError, Lost)):
        return str(exc)  # the game's own messages are written for the player already
    if isinstance(exc, StepBudgetExceeded):
        return (
            f"Your program never finished. It ran more than {exc.budget:,} lines, "
            f"which almost always means a loop that never ends.{_endless_while_hint()}"
        )
    if isinstance(exc, SyntaxError):
        return _explain_syntax(exc)
    if isinstance(exc, NameError):
        return _explain_name(exc, namespace)
    if isinstance(exc, AttributeError):
        return _explain_attribute(exc)
    if isinstance(exc, TypeError):
        return _explain_type(exc)
    if isinstance(exc, ZeroDivisionError):
        return "You divided by zero. That has no answer, in maths or in Python."
    if isinstance(exc, RecursionError):
        return "A function kept calling itself and never stopped, so Python gave up."
    return f"Python stopped with a {type(exc).__name__}: {exc}"


# -- syntax errors: Python couldn't even read the code ------------------------

_BRACKET_PAIRS = {"(": ")", "[": "]", "{": "}"}


def _explain_syntax(exc: SyntaxError) -> str:
    msg = exc.msg or ""
    if isinstance(exc, TabError):
        return "This line mixes tabs and spaces for indentation. Use spaces only."
    if isinstance(exc, IndentationError):
        if "unexpected indent" in msg:
            return (
                "This line starts with spaces, but nothing above it opens an indented block. "
                "Remove the spaces at the start of the line."
            )
        if "expected an indented block" in msg:
            return (
                "The line before this one ends with a colon (:), so Python expects the lines "
                "after it to be indented by 4 spaces."
            )
        if "unindent does not match" in msg:
            return "This line's indentation doesn't line up with any line above it."
    if match := re.fullmatch(r"'(break|continue)' (?:outside loop|not properly in loop)", msg):
        return (
            f"`{match.group(1)}` only works inside a loop (a `for` or a `while`). "
            "Indent it so it sits under the loop it belongs to."
        )
    if match := re.search(r"'(.)' was never closed", msg):
        opening = match.group(1)
        return f"The bracket {opening} opened on this line is never closed. Add the matching {_BRACKET_PAIRS.get(opening, '')}."
    if msg.startswith("unmatched"):
        return "This line has a closing bracket without a matching opening one."
    if msg.startswith("closing parenthesis"):
        return "The brackets on this line don't match up: one kind is opened and a different kind is closed."
    if "unterminated string literal" in msg or "unterminated triple-quoted" in msg:
        return 'This text is missing its closing quote mark. Text (a "string") needs a quote at both ends, like "hello".'
    if msg == "expected ':'":
        return "This line needs a colon (:) at the end."
    if match := re.search(r"Missing parentheses in call to '(\w+)'", msg):
        name = match.group(1)
        return f'{name} needs parentheses around what it should use, like {name}("hello").'
    if "Perhaps you forgot a comma" in msg:
        return "Python found two things side by side with nothing between them. Is a comma, a dot or a bracket missing?"
    if "Did you mean" in msg:
        return f"Python couldn't understand this line. {msg[msg.index('Did you mean') :]}"
    if msg.startswith("invalid character"):
        return f"This line contains a character Python doesn't understand ({msg.split('(')[0].removeprefix('invalid character').strip()}). Was it pasted from somewhere?"
    if msg == "invalid syntax":
        return "Python couldn't understand this line. Look for a missing bracket, quote mark or colon, or a misspelled word."
    return f"Python couldn't understand this line: {msg}."


# -- loops that never end (M3.5) -------------------------------------------------


def _endless_while_hint() -> str:
    """A hint for a program that ran out of lines, when the player's `while` explains it. The
    source comes from linecache (see `runner.remember_source`); checked with `ast`."""
    try:
        tree = ast.parse("".join(linecache.getlines(PLAYER_FILENAME)))
    except SyntaxError:
        return ""
    whiles = [node for node in ast.walk(tree) if isinstance(node, ast.While)]
    for loop in whiles:
        called = {id(node.func) for node in ast.walk(loop.test) if isinstance(node, ast.Call)}
        for node in ast.walk(loop.test):
            if isinstance(node, ast.Attribute) and id(node) not in called:
                return (
                    f" A `while` repeats as long as its condition is True, and `{ast.unparse(node)}` "
                    f"without parentheses is never False. Did you mean `{ast.unparse(node)}()`?"
                )
    if whiles:
        return (
            " A `while` repeats as long as its condition is True: check that something inside "
            "the loop can make it False, or leave it with `break`."
        )
    return ""


# -- names and attributes: usually typos ---------------------------------------

# Built-in names worth suggesting. Suggesting obscure ones (`help` for `hello`)
# would only confuse.
COMMON_BUILTINS = [
    "True", "False", "None", "print", "input", "len", "range", "int", "float", "str",
    "bool", "list", "tuple", "dict", "set", "type", "sorted", "reversed", "sum", "min",
    "max", "abs", "round", "enumerate", "zip", "isinstance", "open",
]  # fmt: skip
assert all(hasattr(builtins, name) for name in COMMON_BUILTINS)


def _explain_name(exc: NameError, namespace: dict) -> str:
    name = exc.name or ""
    for piece_name, value in namespace.items():
        if isinstance(value, Piece) and name in type(value).ABILITIES:
            return (
                f"`{name}` is one of the {piece_name}'s abilities, so it needs the {piece_name}'s name "
                f"in front of it: {piece_name}.{name}()"
            )
    candidates = [key for key in namespace if not key.startswith("__")] + COMMON_BUILTINS
    if suggestion := closest(name, candidates):
        return f"Python doesn't know the name `{name}`. Did you mean `{suggestion}`?"
    return (
        f"Python doesn't know the name `{name}`. A name has to be created (for example `{name} = 3`) "
        f'before it can be used. If you meant it as text, put it in quotes: "{name}".'
    )


def _explain_attribute(exc: AttributeError) -> str:
    name, obj = exc.name, exc.obj
    if isinstance(obj, Piece):
        piece = type(obj).NAME
        unlocked = list(object.__getattribute__(obj, "_unlocked"))
        suggestion = closest(name, list(type(obj).ABILITIES))
        if suggestion and suggestion in unlocked:
            return f"The {piece} doesn't know `{name}`. Did you mean `{suggestion}`?"
        if suggestion:
            return f"The {piece} doesn't know `{name}`. Did you mean `{suggestion}`? (The {piece} hasn't learned that yet.)"
        return f"The {piece} doesn't have an ability called `{name}`. In this level it knows: {', '.join(unlocked)}."
    if name and obj is not None:
        type_name = type(obj).__name__
        options = [attr for attr in dir(obj) if not attr.startswith("_")]
        if suggestion := closest(name, options):
            return f"A {type_name} value doesn't have `{name}`. Did you mean `{suggestion}`?"
        return f"A {type_name} value doesn't have anything called `{name}`."
    return f"Python stopped with an AttributeError: {exc}"


# -- type errors: the right thing used the wrong way -----------------------------

# How to name a value's type to a beginner.
_KINDS = {
    "int": "a whole number (an int)",
    "float": "a number with a decimal point (a float)",
    "str": "text (a str)",
    "bool": "True or False (a bool)",
    "NoneType": "None",
}


def _kind(type_name: str) -> str:
    """A type's name as a beginner reads it: "text (a str)", or "a list"."""
    return _KINDS.get(type_name, f"a {type_name}")


def _explain_type(exc: TypeError) -> str:
    msg = str(exc)
    pattern = r"([\w.]+)\(\) takes (?:from (\d+) to )?(\d+) positional arguments? but (\d+) (?:were|was) given"
    if match := re.match(pattern, msg):
        qualified = match.group(1)
        most, given = int(match.group(3)), int(match.group(4))
        least = int(match.group(2)) if match.group(2) else most
        name = qualified.rsplit(".", 1)[-1]
        if "." in qualified:  # a method: Python counts `self` too
            least, most, given = least - 1, most - 1, given - 1
        if most == 0:
            return f"`{name}()` doesn't take anything inside its parentheses. Write it with empty parentheses: {name}()"
        takes = count(most, "value") if least == most else f"at most {count(most, 'value')}"
        return f"`{name}()` takes {takes} inside its parentheses, but got {given}."
    if match := re.match(r"([\w.]+)\(\) missing \d+ required positional arguments?: (.+)", msg):
        name = match.group(1).rsplit(".", 1)[-1]
        return f"`{name}()` needs more inside its parentheses: a value for {match.group(2).replace(chr(39), '`')}."
    if match := re.match(r"'(\w+)' object is not callable", msg):
        return (
            f"You used parentheses to call something that isn't a function: it's {_kind(match.group(1))}. "
            "Is there an extra pair of parentheses?"
        )
    if msg.startswith("can only concatenate str"):
        return "You can only join text to text with +. To join a number to text, turn it into text first with str()."
    if match := re.match(r"unsupported operand type\(s\) for (.+): '(\w+)' and '(\w+)'", msg):
        op, left, right = match.groups()
        return f"Python can't use {op} between {_kind(left)} and {_kind(right)}."
    if match := re.match(r"'(\w+)' object is not iterable", msg):
        return (
            f"Python can't go through {_kind(match.group(1))} one item at a time, "
            "the way a for loop needs. To repeat something a number of times, give the number to range(): "
            "for step in range(5):"
        )
    if match := re.match(r"'(\w+)' object cannot be interpreted as an integer", msg):
        kind = match.group(1)
        hint = {
            "float": " If it came from dividing with /, use // instead: it gives a whole number.",
            "str": " Numbers in quotes are text.",
        }.get(kind, "")
        return f"This needs a whole number (an int), but got {_kind(kind)}.{hint}"
    return f"Python stopped with a TypeError: {msg}"


# -- helpers --------------------------------------------------------------------


def closest(word: str | None, options: list[str]) -> str | None:
    """The option that looks most like `word` (e.g. a typo), or None."""
    if not word:
        return None
    for option in options:  # same word, different capitals: true -> True
        if option.lower() == word.lower() and option != word:
            return option
    # Like difflib.get_close_matches, but a tie goes to the earlier option, so
    # the player's own names beat built-ins (`stpe` is `step`, not `type`).
    scores = [difflib.SequenceMatcher(None, option, word).ratio() for option in options]
    best = max(scores, default=0)
    return options[scores.index(best)] if best >= 0.75 else None


def _keep_player_frames(tb: traceback.TracebackException) -> None:
    """Drop engine frames so the traceback only shows code the player wrote."""
    tb.stack = traceback.StackSummary.from_list([frame for frame in tb.stack if frame.filename == PLAYER_FILENAME])
    for linked in (tb.__cause__, tb.__context__):
        if linked is not None:
            _keep_player_frames(linked)


def _error_line(exc: BaseException, tb: traceback.TracebackException) -> int | None:
    if isinstance(exc, SyntaxError):
        return exc.lineno
    if isinstance(exc, StepBudgetExceeded):
        return exc.line
    if tb.stack:
        return tb.stack[-1].lineno
    return None
