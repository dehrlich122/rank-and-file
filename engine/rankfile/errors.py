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

from .exceptions import IT_KNOWS, GameArgumentError, GameError, Lost
from .pieces import Pawn, Piece
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
    line = _error_line(exc, tb)
    return ErrorInfo(
        type=type(exc).__name__,
        message=str(exc),
        friendly=friendly_message(exc, namespace or {}, line),
        line=line,
        traceback="".join(tb.format()),
    )


def friendly_message(exc: BaseException, namespace: dict, line: int | None = None) -> str:
    if isinstance(exc, (GameError, Lost)):
        text = str(exc)  # the game's own messages are written for the player already
        if isinstance(exc, GameArgumentError) and text.endswith(", not None.") and (note := _none_from_own_function(line)):
            text += f" {note}"  # an ability's number that is None: a function of the player's may have handed it back
        return text
    if isinstance(exc, StepBudgetExceeded):
        return (
            f"Your program never finished. It ran more than {exc.budget:,} lines, "
            f"which almost always means a loop that never ends.{_endless_while_hint()}"
        )
    if isinstance(exc, SyntaxError):
        return _explain_syntax(exc)
    if isinstance(exc, UnboundLocalError):
        return _explain_unbound(exc, namespace)
    if isinstance(exc, NameError):
        return _explain_name(exc, namespace)
    if isinstance(exc, AttributeError):
        return _explain_attribute(exc, namespace, line)
    if isinstance(exc, TypeError):
        return _explain_type(exc, namespace, line)
    if isinstance(exc, IndexError):
        return _explain_index(exc)
    if isinstance(exc, ValueError):
        return _explain_value(exc)
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
    if msg == "'return' outside function":
        return (
            "`return` only works inside a function, in the indented lines under a `def`. "
            "Out here it has nowhere to hand a value back to."
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
    """A hint for a program that ran out of lines, when the player has a `while`. The source
    comes from linecache (see `runner.remember_source`); checked with `ast`."""
    tree = _player_tree()
    if tree is not None and any(isinstance(node, ast.While) for node in ast.walk(tree)):
        return (
            " A `while` repeats as long as its condition is True: check that something inside "
            "the loop can make it False, or leave it with `break`."
        )
    return ""


# -- the program's own structure, read with `ast` (M5.2) -------------------------------

_DEFS = (ast.FunctionDef, ast.AsyncFunctionDef)


def _player_tree() -> ast.Module | None:
    """The player's program as a syntax tree, from linecache; None where it can't be parsed."""
    try:
        return ast.parse("".join(linecache.getlines(PLAYER_FILENAME)))
    except SyntaxError:
        return None


def _own_nodes(body: list[ast.stmt]):
    """Every node of one scope: a nested `def` or lambda shows up itself, but not its insides."""
    stack = list(body)
    while stack:
        node = stack.pop()
        yield node
        if not isinstance(node, (*_DEFS, ast.Lambda)):
            stack.extend(ast.iter_child_nodes(node))


def _is_none(node: ast.expr | None) -> bool:
    return node is None or (isinstance(node, ast.Constant) and node.value is None)


def _returns_value(nodes) -> bool:
    """Whether any of these nodes (a function's own, from `_own_nodes`) is a `return` that hands back a value."""
    return any(isinstance(n, ast.Return) and not _is_none(n.value) for n in nodes)


def _param_names(fn: ast.FunctionDef | ast.AsyncFunctionDef) -> list[str]:
    args = fn.args
    named = [arg.arg for arg in (*args.posonlyargs, *args.args, *args.kwonlyargs)]
    return named + [arg.arg for arg in (args.vararg, args.kwarg) if arg]


def _bound_names(body: list[ast.stmt], params: list[str] | None = None) -> set[str]:
    """The names a scope sets itself: parameters, assignments, loop variables, `def`s, imports."""
    names = set(params or [])
    for node in _own_nodes(body):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            names.add(node.id)
        elif isinstance(node, (*_DEFS, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            names.update((alias.asname or alias.name).split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ExceptHandler) and node.name:
            names.add(node.name)
    return names


def _functions(tree: ast.Module) -> list[ast.FunctionDef | ast.AsyncFunctionDef]:
    """Every `def` in the program, top to bottom."""
    found = [node for node in ast.walk(tree) if isinstance(node, _DEFS)]
    return sorted(found, key=lambda fn: fn.lineno)


def _innermost_locals(exc: BaseException) -> list[str]:
    """The names the innermost player frame holds (a function's parameters and locals), for "did you mean"."""
    names, tb = [], exc.__traceback__
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == PLAYER_FILENAME:
            names = [key for key in tb.tb_frame.f_locals if not key.startswith("__")]
        tb = tb.tb_next
    return names


def _raising_function(exc: BaseException) -> str | None:
    """The name of the player's function the error was raised in (innermost), or None."""
    name, tb = None, exc.__traceback__
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == PLAYER_FILENAME:
            name = tb.tb_frame.f_code.co_name
        tb = tb.tb_next
    return name


# -- functions: what goes wrong around `def`, parameters and `return` (M5.2) ------------


def _explain_unbound(exc: UnboundLocalError, namespace: dict) -> str:
    """A name set anywhere in a function is local to all of it, so reading it earlier finds no value."""
    match = re.search(r"local variable '(\w+)'", str(exc))
    name = match.group(1) if match else exc.name or "it"
    fn = _raising_function(exc)
    where = f"`{fn}()`" if fn and fn != "<module>" else "this function"
    if name in namespace and not name.startswith("__"):
        return (
            f"{where} can read the `{name}` from outside, but a line in it sets `{name}`, and that makes a new `{name}` "
            f"of the function's own, which has no value yet on this line. Hand the value in through the parentheses, "
            f"and hand the new one back with `return`."
        )
    return (
        f"`{name}` is used inside {where} before {where} gave it a value. "
        f"Set it on a line above this one (for example `{name} = 0`), or hand it in through the parentheses."
    )


def _shared_names(fn: ast.FunctionDef | ast.AsyncFunctionDef) -> set[str]:
    """The names a function declares `global` or `nonlocal`: they are not its own."""
    return {
        name for node in _own_nodes(fn.body) if isinstance(node, (ast.Global, ast.Nonlocal)) for name in node.names
    }


def _explain_function_name(name: str, exc: BaseException, has_suggestion: bool) -> str:
    """A NameError for a name the program does set, just not where Python can see it: "" when it isn't one.
    A close match (`has_suggestion`) comes before a name that lives inside another function."""
    tree = _player_tree()
    if tree is None:
        return ""
    if any(isinstance(node, _DEFS) and node.name == name for node in tree.body):
        return (
            f"Python reads the program from the top, and `{name}` isn't defined until its `def` has run. "
            f"Move the function above the line that calls it, so the `def` comes before the first call."
        )
    if has_suggestion or name in _bound_names(tree.body):
        return ""
    here = _raising_function(exc)
    for fn in _functions(tree):
        if name in _shared_names(fn):
            continue
        assigned = name in _bound_names(fn.body)
        if not (assigned or name in _param_names(fn)):
            continue
        if here and here != "<module>":
            what = f"`{name}` lives inside `{fn.name}()`" if assigned else f"`{name}` is what `{fn.name}()` calls the value handed in to it"
            return (
                f"{what}, so `{here}()` can't see it. There is no `{name}` inside `{here}()`: "
                f"give it a value there, or hand one in through the parentheses of `{here}()`."
            )
        if assigned:
            return (
                f"`{name}` lives inside `{fn.name}()`, and it is gone when the function ends. "
                f"`return` is how a value gets out: end `{fn.name}()` with `return {name}`, and keep what it hands back."
            )
        return (
            f"`{name}` is what `{fn.name}()` calls the value handed in to it. Out here there is no `{name}`: "
            f"give it a value on a line above this one (for example `{name} = 3`), or hand one in through the parentheses of `{fn.name}()`."
        )
    return ""


def _none_from_own_function(line: int | None) -> str:
    """Where the error's line calls a function of the player's own that returns no value, say so."""
    tree = _player_tree()
    if tree is None or line is None:
        return ""
    defs = {fn.name: fn for fn in _functions(tree)}
    unused = {id(node.value) for node in ast.walk(tree) if isinstance(node, ast.Expr)}  # a whole-statement call: nobody uses its answer
    for node in ast.walk(tree):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.lineno == line):
            continue
        fn = defs.get(node.func.id)
        if fn is None or id(node) in unused:
            continue
        inside = list(_own_nodes(fn.body))
        if _returns_value(inside):
            continue
        has_bare = any(isinstance(n, ast.Return) for n in inside)
        reason = "no `return` with a value" if has_bare else "no `return`"
        note = f"`{fn.name}()` handed back nothing (None) because it has {reason}."
        if any(isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "print" for n in inside):
            note += " `print` shows a value on the screen, but only `return` hands it back."
        return note
    return ""


def _explain_keyword(qualified: str, keyword: str, did_you_mean: str, namespace: dict, line: int | None) -> str:
    name = qualified.rsplit(".", 1)[-1]
    if name == "sort" and _sorted_called_with(keyword, line):  # Python's message names the list method inside `sorted`
        name = "sorted"
    head = f"`{name}()` has nothing called `{keyword}` to fill inside its parentheses."
    code = getattr(namespace.get(name), "__code__", None)
    if "." not in qualified and code is not None and code.co_filename == PLAYER_FILENAME:
        params = code.co_varnames[: code.co_argcount + code.co_kwonlyargcount]
        if not params:
            return f"{head} It doesn't take anything inside its parentheses."
        return f"{head} The names it takes are: {', '.join(params)}."
    if qualified.split(".")[0] in {cls.__name__ for cls in Piece.__subclasses__()}:
        return f"{head} Give its values in order, without names."
    return f"{head} {did_you_mean.replace(chr(39), '`')}".rstrip()


def _sorted_called_with(keyword: str, line: int | None) -> bool:
    """Whether the error's line calls `sorted(...)` with this keyword."""
    tree = _player_tree()
    if tree is None or line is None:
        return False
    return any(
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "sorted"
        and node.func.lineno == line
        and any(kw.arg == keyword for kw in node.keywords)
        for node in ast.walk(tree)
    )


# -- names and attributes: usually typos ---------------------------------------

# Built-in names worth suggesting. Suggesting obscure ones (`help` for `hello`)
# would only confuse.
COMMON_BUILTINS = [
    "True", "False", "None", "print", "input", "len", "range", "int", "float", "str",
    "bool", "list", "tuple", "dict", "set", "type", "sorted", "reversed", "sum", "min",
    "max", "abs", "round", "enumerate", "zip", "isinstance", "open",
]  # fmt: skip
assert all(hasattr(builtins, name) for name in COMMON_BUILTINS)


LEVEL_PIECE = "__level_piece__"  # where a namespace records its level's piece class: a dunder, so it never shows among the player's variables


def piece_class(namespace: dict) -> type[Piece]:
    """The kind of piece the level has, as its namespace recorded it, or the pawn where it recorded none (a plain snippet)."""
    return namespace.get(LEVEL_PIECE, Pawn)


def _explain_name(exc: NameError, namespace: dict) -> str:
    name = exc.name or ""
    for piece_name, value in namespace.items():
        if isinstance(value, Piece):
            if name in type(value).ABILITIES:
                return (
                    f"`{name}` is one of the {piece_name}'s abilities, so it needs the {piece_name}'s name "
                    f"in front of it: {piece_name}.{name}()"
                )
            if name in type(value).CANT:  # another piece's ability, asked of this one: its kind answer (M5.1)
                return type(value).CANT[name]
    candidates = [*_innermost_locals(exc), *(key for key in namespace if not key.startswith("__")), *COMMON_BUILTINS]
    suggestion = closest(name, candidates)
    if own := _explain_function_name(name, exc, suggestion is not None):
        return own
    if suggestion:
        return f"Python doesn't know the name `{name}`. Did you mean `{suggestion}`?"
    return (
        f"Python doesn't know the name `{name}`. A name has to be created (for example `{name} = 3`) "
        f'before it can be used. If you meant it as text, put it in quotes: "{name}".'
    )


def _explain_attribute(exc: AttributeError, namespace: dict, line: int | None) -> str:
    name, obj = exc.name, exc.obj
    if isinstance(obj, Piece):
        piece = type(obj).NAME
        unlocked = list(object.__getattribute__(obj, "_unlocked"))
        suggestion = closest(name, list(type(obj).ABILITIES))
        if suggestion and suggestion in unlocked:
            return f"The {piece} doesn't know `{name}`. Did you mean `{suggestion}`?"
        if suggestion:
            return f"The {piece} doesn't know `{name}`. Did you mean `{suggestion}`? (The {piece} hasn't learned that yet.)"
        return f"The {piece} doesn't have an ability called `{name}`. {IT_KNOWS}: {', '.join(unlocked)}."
    if obj is None and name:
        return f"The value here is None, which has no `{name}`. {_none_hint(namespace, line)}"
    if name and obj is not None:
        type_name = type(obj).__name__
        options = [attr for attr in dir(obj) if not attr.startswith("_")]
        if suggestion := closest(name, options):
            return f"A {type_name} value doesn't have `{name}`. Did you mean `{suggestion}`?"
        return f"A {type_name} value doesn't have anything called `{name}`."
    return f"Python stopped with an AttributeError: {exc}"


# What a None usually means in the game (M3.6): read() gives None off a rune. A pawn walks onto one, a knight lands on one.
_GET_ONTO_A_RUNE = {"pawn": "walk onto one", "knight": "land on one"}


def _none_hint(namespace: dict, line: int | None) -> str:
    if own := _none_from_own_function(line):
        return own
    piece = piece_class(namespace).NAME
    return f"If it came from `read()`, your {piece} isn't standing on a rune: {_GET_ONTO_A_RUNE.get(piece, 'get onto one')} first."


# -- text: positions and numbers read from it (M3.6) ----------------------------


def _explain_index(exc: IndexError) -> str:
    if "string index out of range" in str(exc):
        return (
            "That position is past the end of the text. Positions start at 0, so text with 4 characters "
            "ends at position 3. A negative position counts back from the end: -1 is the last character."
        )
    return f"Python stopped with an IndexError: {exc}"


def _explain_value(exc: ValueError) -> str:
    if match := re.match(r"invalid literal for int\(\) with base 10: (.+)", str(exc)):
        return (
            f"`int()` can only read text made of digits, like \"42\", and it was given {match.group(1)}. "
            "Spaces, letters and anything else in the text have to be taken out first."
        )
    return f"Python stopped with a ValueError: {exc}"


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


def _explain_type(exc: TypeError, namespace: dict, line: int | None) -> str:
    text = _explain_type_message(exc, namespace, line)
    if "NoneType" in str(exc) and (note := _none_from_own_function(line)) and note not in text:
        text += f"{'' if text.endswith(('.', '?', '!')) else '.'} {note}"
    return text


def _explain_type_message(exc: TypeError, namespace: dict, line: int | None) -> str:
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
        # a jump's two numbers (M5.1). Keyed on the name in Python's message, so a player's own class called Knight
        # with a `jump` method gets this answer too; contrived enough to leave.
        if match.group(1) in ("Knight.jump", "Knight.look"):
            return (
                f"`{name}()` needs two numbers inside its parentheses: how many squares right, then how many up, "
                f"like `knight.{name}(1, 2)`."
            )
        return f"`{name}()` needs more inside its parentheses: a value for {match.group(2).replace(chr(39), '`')}."
    if match := re.match(r"([\w.]+)\(\) got an unexpected keyword argument '(\w+)'(?:\. (Did you mean .+))?", msg):
        return _explain_keyword(match.group(1), match.group(2), match.group(3) or "", namespace, line)
    if match := re.match(r"'(\w+)' object is not callable", msg):
        return (
            f"You used parentheses to call something that isn't a function: it's {_kind(match.group(1))}. "
            "Is there an extra pair of parentheses?"
        )
    if msg.startswith("can only concatenate str"):
        return "You can only join text to text with +. To join a number to text, turn it into text first with str()."
    if match := re.match(r"unsupported operand type\(s\) for (.+): '(\w+)' and '(\w+)'", msg):
        op, left, right = match.groups()
        join = " To join a number to text, turn it into text first with str(), or use an f-string." if op == "+" and "str" in (left, right) else ""
        return f"Python can't use {op} between {_kind(left)} and {_kind(right)}.{join}"
    if "'str' object does not support item assignment" in msg:
        return (
            "Text can't be changed once it's made: you can't put a new character into a position. "
            "Make a new text instead, with a method like replace() or by joining pieces together."
        )
    if msg in ("'NoneType' object is not subscriptable", "object of type 'NoneType' has no len()"):
        return f"There's no text here: the value is None. {_none_hint(namespace, line)}"
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
