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
import types
from dataclasses import dataclass

from .exceptions import IT_KNOWS, GameArgumentError, GameError, Lost
from .pieces import Pawn, Piece
from .tracer import PLAYER_FILENAME, StepBudgetExceeded
from .words import and_list, count


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
    """The plain-language sentence for `exc`. A translation is a helper, and a helper must never take the player's
    error down with it: if one raises, the error gets the sentence an untranslated error gets. Only `Exception` is
    caught, so `KeyboardInterrupt`, `SystemExit` and the tracer's `StepBudgetExceeded` (a `BaseException`) pass."""
    try:
        return _translate(exc, namespace, line)
    except Exception:
        try:
            return f"Python stopped with a {type(exc).__name__}: {exc}"
        except Exception:  # an error whose own text can't be made
            return f"Python stopped with a {type(exc).__name__}."


def _translate(exc: BaseException, namespace: dict, line: int | None) -> str:
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
        return _explain_index(exc, line)
    if isinstance(exc, ValueError):
        return _explain_value(exc, line)
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
        tree = ast.parse("".join(linecache.getlines(PLAYER_FILENAME)))
    except SyntaxError:
        return None
    _mark_comprehension_names(tree)
    return tree


def _mark_comprehension_names(tree: ast.Module) -> None:
    """Flag the names a list, set or dict comprehension makes for itself (`i` in `[a[i] for i in ...]`). Python 3.14 runs
    these inside the enclosing frame and takes the name out again, so a lookup after the error would find another `i`."""
    for comp in ast.walk(tree):
        if not isinstance(comp, (ast.ListComp, ast.SetComp, ast.DictComp)):
            continue
        made = {name.id for gen in comp.generators for name in ast.walk(gen.target) if isinstance(name, ast.Name)}
        parts = [comp.key, comp.value] if isinstance(comp, ast.DictComp) else [comp.elt]
        parts += [gen.iter for gen in comp.generators[1:]]  # the first `iter` is read before the names are made
        parts += [test for gen in comp.generators for test in gen.ifs]
        for part in parts:
            for name in ast.walk(part):
                if isinstance(name, ast.Name) and name.id in made:
                    name.made_by_comprehension = True  # ast nodes take any attribute


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


def _bound_names(body: list[ast.stmt]) -> set[str]:
    """The names a scope sets itself: assignments, loop variables, `def`s, imports."""
    names = set()
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


def _innermost_player_frame(exc: BaseException) -> types.FrameType | None:
    """The innermost frame of the error's traceback that is the player's own code, or None."""
    frame, tb = None, exc.__traceback__
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == PLAYER_FILENAME:
            frame = tb.tb_frame
        tb = tb.tb_next
    return frame


def _innermost_locals(exc: BaseException) -> list[str]:
    """The names the innermost player frame holds (a function's parameters and locals), for "did you mean"."""
    frame = _innermost_player_frame(exc)
    return [key for key in frame.f_locals if not key.startswith("__")] if frame else []


def _raising_function(exc: BaseException) -> str | None:
    """The name of the player's function the error was raised in (innermost), or None."""
    frame = _innermost_player_frame(exc)
    return frame.f_code.co_name if frame else None


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


def _unused_answers(tree: ast.Module) -> set[int]:
    """The ids of the expressions that stand as a whole statement: nobody uses their answer."""
    return {id(node.value) for node in ast.walk(tree) if isinstance(node, ast.Expr)}


def _none_from_own_function(line: int | None) -> str:
    """Where the error's line calls a function of the player's own that returns no value, say so."""
    tree = _player_tree()
    if tree is None or line is None:
        return ""
    defs = {fn.name: fn for fn in _functions(tree)}
    unused = _unused_answers(tree)
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


_LIST_METHODS = ("append", "sort", "extend", "insert", "remove", "reverse", "clear")


def _list_method_of(node: ast.AST) -> str | None:
    """The method's name where `node` is a call like `x.sort()` of a list method that hands back None."""
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr in _LIST_METHODS:
        return node.func.attr
    return None


def _none_from_list_method(line: int | None) -> str:
    """Where the error's line uses the answer of a list method (`b = a.sort()`, then `b[0]`), say it hands back None."""
    tree = _player_tree()
    if tree is None or line is None:
        return ""
    unused = _unused_answers(tree)
    assigned = {}  # name -> the list method its value came from
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and (method := _list_method_of(node.value)):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    assigned.setdefault(target.id, method)
    found = None
    for node in ast.walk(tree):
        if getattr(node, "lineno", None) != line:
            continue
        if (method := _list_method_of(node)) and id(node) not in unused:
            found = method
            break
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load) and node.id in assigned and found is None:
            found = assigned[node.id]
    if found is None:
        return ""
    return f"`.{found}()` changes the list itself and hands back nothing (None). Call it on a line of its own, and keep using the list's own name."


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
    if listed := _none_from_list_method(line):
        return listed
    piece = piece_class(namespace).NAME
    return f"If it came from `read()`, your {piece} isn't standing on a rune: {_GET_ONTO_A_RUNE.get(piece, 'get onto one')} first."


# -- text: positions and numbers read from it (M3.6) ----------------------------


def _explain_index(exc: IndexError, line: int | None) -> str:
    msg = str(exc)
    if "string index out of range" in msg:
        return (
            "That position is past the end of the text. Positions start at 0, so text with 4 characters "
            "ends at position 3. A negative position counts back from the end: -1 is the last character."
        )
    if match := re.fullmatch(r"(list|tuple)(?: assignment)? index out of range", msg):
        return _explain_past_the_end(match.group(1), _player_scope(exc), line)
    return f"Python stopped with an IndexError: {msg}"


def _explain_value(exc: ValueError, line: int | None) -> str:
    msg = str(exc)
    if match := re.match(r"invalid literal for int\(\) with base 10: (.+)", msg):
        return (
            f"`int()` can only read text made of digits, like \"42\", and it was given {match.group(1)}. "
            "Spaces, letters and anything else in the text have to be taken out first."
        )
    if match := re.fullmatch(r"(too many|not enough) values to unpack \(expected (\d+)(?:, got (\d+))?\)", msg):
        return _explain_unpack_count(match.group(1) == "too many", int(match.group(2)), match.group(3), line)
    if match := re.fullmatch(r"(list|tuple)\.(?:remove|index)\(x\): x not in \1", msg):
        return f"That value isn't in the {match.group(1)}. Ask first with `in`."
    if match := re.fullmatch(r"(max|min)\(\) iterable argument is empty", msg):
        return _explain_empty_pick(match.group(1), _player_scope(exc), line)
    return f"Python stopped with a ValueError: {msg}"


# -- lists and tuples (M5.3): the numbers and names are read from the error's line with `ast` ------

_MISSING = object()  # a value the line's code can't be read for


def _player_scope(exc: BaseException) -> dict:
    """The names the innermost player frame can see (its locals over the program's own names), as they stood at the error."""
    frame = _innermost_player_frame(exc)
    return {**frame.f_globals, **frame.f_locals} if frame else {}


def _nodes_on(line: int | None, *types: type[ast.AST]) -> list:
    """Every node of these types that starts on the error's line."""
    tree = _player_tree()
    if tree is None or line is None:
        return []
    return [node for node in ast.walk(tree) if isinstance(node, types) and getattr(node, "lineno", None) == line]


def _value_of(node: ast.AST, scope: dict):
    """What a small expression is worth (a literal, a name, `a[i]`, a sum of those), or _MISSING. Calls are never run."""
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Name):
        if getattr(node, "made_by_comprehension", False):
            return _MISSING  # the comprehension's own name is gone from the frame; whatever `scope` has under it is another
        return scope.get(node.id, _MISSING)
    if isinstance(node, (ast.List, ast.Tuple)):
        parts = [_value_of(part, scope) for part in node.elts]
        if any(part is _MISSING for part in parts):
            return _MISSING
        return parts if isinstance(node, ast.List) else tuple(parts)
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        inner = _value_of(node.operand, scope)
        return -inner if type(inner) in (int, float) else _MISSING
    if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub, ast.Mult)):
        left, right = _value_of(node.left, scope), _value_of(node.right, scope)
        if type(left) is int and type(right) is int and left.bit_length() + right.bit_length() <= _MAX_BITS:
            return {ast.Add: left + right, ast.Sub: left - right, ast.Mult: left * right}[type(node.op)]
    if isinstance(node, ast.Subscript):
        seq, place = _value_of(node.value, scope), _value_of(node.slice, scope)
        if type(seq) in (list, tuple) and type(place) is int and -len(seq) <= place < len(seq):
            return seq[place]  # exact kinds only: a subclass's own `__len__` or `__getitem__` is the player's code
    return _MISSING


_MAX_BITS = 64  # the biggest whole number these sentences will write out or do sums with: it keeps `str()` and `*` cheap and safe


def _plain(value, depth: int = 0) -> bool:
    """Whether `value` is of a built-in kind that can be written out with no player code and no surprises: a small
    number, short text, a bool, None, or a short list or tuple of those. Exact kinds: a subclass can bring its own `__repr__`."""
    kind = type(value)
    if kind is int:
        return value.bit_length() <= _MAX_BITS
    if kind is str:
        return len(value) <= 20
    if kind in (float, bool, type(None)):
        return True
    return kind in (list, tuple) and depth < 3 and len(value) <= 6 and all(_plain(item, depth + 1) for item in value)


def _shown(value) -> str | None:
    """A value as the player wrote it, or None where it is unknown, None itself, not plain (see `_plain`), or too long
    for a sentence. It never calls the player's code (`safe_repr` would call a class's own `__repr__`)."""
    if value is _MISSING or value is None or not _plain(value):
        return None
    text = repr(value)
    return text if len(text) <= 20 else None


def _explain_past_the_end(kind: str, scope: dict, line: int | None) -> str:
    """A place past either end of a list or tuple. The length and the place come from the line's `a[i]`, when exactly one fits."""
    hits = {  # a set: a line that reads and writes the same place (`a[i] = a[i]`) names it once
        (len(seq), place)
        for node in _nodes_on(line, ast.Subscript)
        if type(seq := _value_of(node.value, scope)) in (list, tuple)
        and type(seq).__name__ == kind
        and type(place := _value_of(node.slice, scope)) is int
        and not -len(seq) <= place < len(seq)
    }
    if len(hits) != 1 or next(iter(hits))[1].bit_length() > _MAX_BITS:  # too big a number to write into a sentence
        return (
            f"That place is past the end of the {kind}. Places count from 0, so a {kind} with 4 items ends at `[3]`; "
            "a negative place counts back from the end, and -1 is the last one."
        )
    size, place = hits.pop()
    if size == 0:
        return f"That {kind} is empty, so there is nothing at `[{place}]`."
    if place >= 0:
        return f"That {kind} has {count(size, 'item')}, so the last one is at `[{size - 1}]`: places count from 0. There is nothing at `[{place}]`."
    if size == 1:
        return f"That {kind} has 1 item, so its only place is `[0]` (or `[-1]`, counting back from the end). There is nothing at `[{place}]`."
    return (
        f"That {kind} has {count(size, 'item')}, so its places run from `[0]` to `[{size - 1}]`, "
        f"and back from the end from `[-1]` to `[-{size}]`. There is nothing at `[{place}]`."
    )


def _unpacking_on(line: int | None) -> tuple[ast.stmt, ast.expr | None] | None:
    """The one unpacking on the line, as (the statement, its value): `x, y = ...` or `for x, y in ...`; None if none or several."""
    found = [
        (node, node.value if isinstance(node, ast.Assign) else None)
        for node in _nodes_on(line, ast.Assign, ast.For)
        if isinstance(node.targets[0] if isinstance(node, ast.Assign) else node.target, (ast.Tuple, ast.List))
    ]
    return found[0] if len(found) == 1 else None


def _explain_unpack_count(too_many: bool, names: int, values: str | None, line: int | None) -> str:
    have = count(int(values), "value") if values else ("more values than that" if too_many else "fewer values than that")
    found = _unpacking_on(line)
    if found and isinstance(found[0], ast.For):
        where = f"There are {count(names, 'name')} after the `for` and {have} in the item it was given."
    elif found:
        where = f"There are {count(names, 'name')} on the left of the `=` and {have} on the right."
    else:
        where = f"There are {count(names, 'name')} on the left and {have} on the right."
    return f"{where} Unpacking needs exactly one name for each value."


def _explain_unpack_non_row(type_name: str, scope: dict, line: int | None) -> str:
    """`x, y = 5`: the value and the names are read from the line's one unpacking, where there is one."""
    found = _unpacking_on(line)
    names = shown = None
    subject = "The value on the right"
    if found:
        statement, value = found
        target = statement.target if isinstance(statement, ast.For) else statement.targets[0]
        if all(isinstance(part, ast.Name) for part in target.elts):
            names = and_list([f"`{part.id}`" for part in target.elts])
        if value is not None:
            shown = _shown(_value_of(value, scope))
        else:
            subject = "Each item it goes through"
    kind = _kind(type_name)
    if shown and shown != kind:
        subject = shown
    return (
        f"{subject} is {kind}: there is nothing inside it to hand out to {names or 'the names on the left'}. "
        "Unpacking needs a tuple or a list."
    )


def _explain_empty_pick(fn: str, scope: dict, line: int | None) -> str:
    """`max()` or `min()` of nothing. The empty thing is named where the line's call hands it a name or a literal we can read."""
    kinds = {
        type(value).__name__
        for call in _nodes_on(line, ast.Call)
        if isinstance(call.func, ast.Name)
        and call.func.id == fn
        and len(call.args) == 1
        and not call.keywords
        and type(value := _value_of(call.args[0], scope)) in (list, tuple, str)
        and len(value) == 0
    }
    what = {"list": "an empty list", "tuple": "an empty tuple", "str": "empty text"}[kinds.pop()] if len(kinds) == 1 else "something with no items in it"
    return f"`{fn}()` was handed {what}, so there is no {'largest' if fn == 'max' else 'smallest'} item to hand back."


def _sequences_ordered_on(line: int | None, scope: dict) -> list:
    """What the line's `sorted(...)`, `min(...)`, `max(...)` and `.sort()` are asked to put in order: lists and tuples we can read."""
    found = []
    for call in _nodes_on(line, ast.Call):
        func = call.func
        if isinstance(func, ast.Name) and func.id in ("sorted", "min", "max") and call.args:
            found.append(_value_of(call.args[0], scope) if len(call.args) == 1 else [_value_of(arg, scope) for arg in call.args])
        elif isinstance(func, ast.Attribute) and func.attr == "sort":
            found.append(_value_of(func.value, scope))
    return [seq for seq in found if type(seq) in (list, tuple)]


def _explain_unordered(left: str, right: str, scope: dict, line: int | None) -> str:
    """Text against a number. The pair shown is read from the one sequence the line puts in order."""
    head = "Python can't put text and numbers in one order"
    pairs = set()
    for seq in _sequences_ordered_on(line, scope):
        first = {type(item).__name__: item for item in reversed(seq)}  # the first of each kind wins
        if left in first and right in first and (a := _shown(first[left])) and (b := _shown(first[right])):
            pairs.add((a, b))
    if len(pairs) == 1:
        a, b = pairs.pop()
        return f"{head}: it has no rule for whether {a} comes before {b}."
    return f"{head}: it has no rule for which of them comes first."


def _explain_place_kind(kind: str, type_name: str, scope: dict, line: int | None) -> str:
    """A place in a list that isn't a whole number. The value is named where the line has one `a[...]` it can read."""
    shown = {
        _shown(place)
        for node in _nodes_on(line, ast.Subscript)
        if type(_value_of(node.value, scope)).__name__ == kind and type(place := _value_of(node.slice, scope)).__name__ == type_name
    }
    value = shown.pop() if len(shown) == 1 else None
    return f"A place in a {kind} is a whole number, like `[0]`. {value or 'That place'} is {_kind(type_name)}."


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


_ITEM_CALLS = {"list": "a list", "tuple": "a tuple"}
_ITEM_CALLS_OTHER = ("sorted", "min", "max", "sum")


def _call_wanting_items(line: int | None) -> str:
    """The built-in (`list`, `sorted`...) the error's line calls on something without items, unless a `for` on the line goes through it."""
    loops = (ast.For, ast.AsyncFor, ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)
    nodes = _nodes_on(line, ast.AST)
    if any(isinstance(node, loops) for node in nodes):
        return ""
    for node in nodes:
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in (*_ITEM_CALLS, *_ITEM_CALLS_OTHER):
            return node.func.id
    return ""


def _explain_no_items(name: str, type_name: str) -> str:
    kind = _kind(type_name)
    kind = kind[0].upper() + kind[1:]
    if name in _ITEM_CALLS:
        return f"`{name}()` makes {_ITEM_CALLS[name]} out of something that has items in it, like text or a tuple. {kind} has none."
    return f"`{name}()` needs something that has items in it, like a list, a tuple or text. {kind} has none."


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
    if msg == "'tuple' object does not support item assignment":
        return "A tuple can't be changed once it is made. Build a new one, or use a list if the values have to change."
    if (
        (match := re.fullmatch(r"'[<>]=?' not supported between instances of '(\w+)' and '(\w+)'", msg))
        and "str" in match.groups()
        and {*match.groups()} & {"int", "float"}
    ):  # text against a number only: other mixes keep Python's words
        return _explain_unordered(match.group(1), match.group(2), _player_scope(exc), line)
    if match := re.fullmatch(r"cannot unpack non-iterable (\w+) object", msg):
        return _explain_unpack_non_row(match.group(1), _player_scope(exc), line)
    if match := re.fullmatch(r"(list|tuple) indices must be integers or slices, not (\w+)", msg):
        return _explain_place_kind(match.group(1), match.group(2), _player_scope(exc), line)
    if msg in ("'NoneType' object is not subscriptable", "object of type 'NoneType' has no len()"):
        if listed := _none_from_list_method(line):
            return f"There's nothing to use here: the value is None. {listed}"
        return f"There's no text here: the value is None. {_none_hint(namespace, line)}"
    if match := re.match(r"'(\w+)' object is not iterable", msg):
        if match.group(1) == "NoneType" and (listed := _none_from_list_method(line)):
            return listed
        if call := _call_wanting_items(line):
            return _explain_no_items(call, match.group(1))
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
