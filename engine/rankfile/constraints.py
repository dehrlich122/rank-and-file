"""Level constraints and gentle warnings, checked by reading the code's structure.

Python's `ast` module turns source code into a tree of nodes: a `for` loop is a
`For` node, a function call is a `Call` node, and so on. Checking that tree is
far more reliable than searching the text: a comment that says "for" isn't a
loop, and `pawn.move ( 3 )` is the same call as `pawn.move(3)`.

Line and comment counts come from the `tokenize` module instead, because the
tree doesn't keep comments or blank lines.
"""

import ast
import inspect
import io
import tokenize
from collections import Counter
from dataclasses import dataclass

from .errors import _DEFS, _own_nodes, _param_names, _returns_value, closest
from .pieces import Piece
from .words import and_list, count

_IGNORED_TOKENS = {
    tokenize.COMMENT, tokenize.NL, tokenize.NEWLINE, tokenize.INDENT,
    tokenize.DEDENT, tokenize.ENDMARKER, tokenize.ENCODING,
}  # fmt: skip

# How to describe node types to a player.
NODE_NAMES = {
    "For": "a for loop",
    "While": "a while loop",
    "Break": "a break statement",
    "Continue": "a continue statement",
    "If": "an if statement",
    "FunctionDef": "a function definition (def)",
    "Return": "a return statement",
    "Call": "a function call",
    "Assign": "a variable assignment (=)",
    "AugAssign": "an update like += or -=",
    "JoinedStr": "an f-string (text like f\"...\" with a value inside)",
    "FormattedValue": "an f-string with a value inside its braces, like f\"I have {gems} gems\"",
    "ClassDef": "a class definition",
    "Try": "a try/except block",
    "With": "a with block",
    "Lambda": "a lambda",
    "ListComp": "a list comprehension",
    "Import": "an import",
    "ImportFrom": "an import",
}


@dataclass
class LintWarning:
    line: int
    message: str


def code_lines(code: str, tree: ast.Module | None = None) -> int:
    """Lines of code, counted as if each statement had a line of its own (M3.3).

    Blank lines, comment-only lines and docstrings don't count (M5.2: a docstring counts for nothing, exactly
    like a comment), and a statement split over several lines counts each of them. Squeezing statements together doesn't
    save lines: a second statement after `;`, a loop's body on the loop's own
    line, or `else:` with its body beside it each count as another line.
    Pass the parsed `tree` if there is one, to save parsing the code again.
    """
    return _line_count(code, tree)[0]


def _line_count(code: str, tree: ast.Module | None) -> tuple[int, bool]:
    """The count `code_lines` gives, and whether any line holds more than one statement."""
    if tree is None:
        try:
            tree = ast.parse(code)
        except (SyntaxError, ValueError):
            tree = ast.Module(body=[], type_ignores=[])
    docstrings = _docstrings(tree)
    source = code.split("\n")
    spans = [_span(node, source) for node in docstrings]
    lines: set[int] = set()
    starts: set[tuple[int, int]] = set()  # where each statement or clause (`else:`, `except ...:`) begins
    at_start = True  # a clause header always begins a logical line
    for token in _tokens(code):
        if token.type == tokenize.NEWLINE:
            at_start = True
        elif token.type in _IGNORED_TOKENS:
            continue
        elif any(a <= token.start and token.end <= b for a, b in spans):
            at_start = False  # the docstring is a statement, though it counts for nothing
        else:
            lines.update(range(token.start[0], token.end[0] + 1))
            if at_start:
                starts.add(token.start)
                at_start = False
    starts.update(
        (node.lineno, node.col_offset) for node in ast.walk(tree) if isinstance(node, ast.stmt) and node not in docstrings
    )
    per_line = Counter(line for line, _ in starts)
    return sum(max(1, per_line[line]) for line in lines), any(n > 1 for n in per_line.values())


def _is_docstring(node: ast.stmt) -> bool:
    """A bare text literal as a statement (whether it is the first of its block is for `_docstrings` to say)."""
    return isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str)


def _docstrings(tree: ast.Module) -> list[ast.Expr]:
    """The docstrings: the bare text a module, function or class starts with."""
    scopes = (ast.Module, *_DEFS, ast.ClassDef)
    return [scope.body[0] for scope in ast.walk(tree) if isinstance(scope, scopes) and scope.body and _is_docstring(scope.body[0])]


def _span(node: ast.stmt, source: list[str]) -> tuple[tuple[int, int], tuple[int, int]]:
    """Where a statement sits as token positions: (line, column) from start to end. The tree counts columns
    in bytes and `tokenize` in characters, so they are converted."""

    def column(line: int, offset: int) -> tuple[int, int]:
        return line, len(source[line - 1].encode("utf-8")[:offset].decode("utf-8", "ignore"))

    return column(node.lineno, node.col_offset), column(node.end_lineno, node.end_col_offset)


def comment_count(code: str) -> int:
    return sum(1 for token in _tokens(code) if token.type == tokenize.COMMENT)


def check_constraints(tree: ast.Module, code: str, constraints, examine=None) -> list[str]:
    """Every way `code` breaks the level's rules, as messages for the player.
    `examine` is the level's examiner (levels.Examine) or None: an examiner level adds rules of its own."""
    problems = []
    if constraints.max_lines is not None:
        used, shared = _line_count(code, tree)
        if used > constraints.max_lines:
            why = "Two statements on one line count as two." if shared else "(Blank lines and comments don't count.)"
            problems.append(
                f"This level allows at most {count(constraints.max_lines, 'line')} of code, and yours has {used}. {why}"
            )
    if constraints.min_comments and comment_count(code) < constraints.min_comments:
        wanted = "a comment" if constraints.min_comments == 1 else f"{constraints.min_comments} comments"
        problems.append(
            f"This level wants {wanted} in your code. A comment starts with # and Python skips it; it's a note for humans."
        )
    used = {type(node).__name__ for node in ast.walk(tree)}
    for name in constraints.require_nodes:
        if name not in used:
            problems.append(f"This level needs you to use {describe_node(name)}.")
    for name in constraints.ban_nodes:
        if name in used:
            problems.append(f"This level doesn't allow {describe_node(name)}.")
    return problems + _number_problems(tree, constraints) + _function_problems(tree, constraints, examine)


def _function_problems(tree: ast.Module, constraints, examine) -> list[str]:
    """The function rules (M5.2): `constraints.functions` and `constraints.define`, and on an examiner level
    "define a function called <examine.function>" and "the program only defines" (decision 4). Only the
    functions defined at the left edge of the program count: not a method, not one inside another function."""
    defs = _top_functions(tree)
    problems = []
    if examine is not None:
        rule = constraints.functions.get(examine.function)
        if examine.function not in defs:
            problems.append(_missing_function(examine.function, rule.params if rule else None, defs))
        problems += _only_defines_problems(tree)
    for name, rule in constraints.functions.items():
        if name in defs:
            problems += _rule_problems(tree, defs[name], rule)
        elif examine is None or name != examine.function:  # the examiner's own function was said above
            problems.append(_missing_function(name, rule.params, defs))
    if constraints.define:
        problems += _define_problems(tree, defs, constraints.define, examine)
    return problems


def _top_functions(tree: ast.Module) -> dict[str, ast.FunctionDef | ast.AsyncFunctionDef]:
    """The functions defined at the left edge of the program, by name (a later `def` of a name wins)."""
    return {node.name: node for node in tree.body if isinstance(node, _DEFS)}


def _missing_function(name: str, params: int | None, defs: dict) -> str:
    near = closest(name, list(defs))
    if near:  # a typo in the name: say which one, since the examiner can't (the program is stopped before it can)
        return f"This level needs a function called `{name}`, and your program has `{near}`: the name has to match letter for letter."
    signature = "()" if params == 0 else "(...)"
    return (
        f"This level needs a function called `{name}`: define it with `def {name}{signature}:`, "
        "starting at the left edge of your program, not inside anything else."
    )


def _values(n: int) -> str:
    return "no values" if n == 0 else count(n, "value")


def _rule_problems(tree: ast.Module, fn: ast.FunctionDef | ast.AsyncFunctionDef, rule) -> list[str]:
    """What a level asks of one function the program defines, and where the program falls short."""
    args, name, problems = fn.args, fn.name, []
    takes = len(_param_names(fn))
    defaulted = len(args.defaults) + sum(default is not None for default in args.kw_defaults)
    if rule.params is not None and takes != rule.params:
        problems.append(
            f"This level wants `{name}` to take {_values(rule.params)} inside its parentheses, and yours takes {_values(takes)}."
        )
    if rule.defaults is not None and defaulted != rule.defaults:
        problems.append(
            f"This level wants `{name}` to have {_values(rule.defaults)} with a default (like `steps=1` inside its parentheses), "
            f"and yours has {_values(defaulted)} with a default."
        )
    called = _calls(tree, fn)
    if rule.calls is not None and called < rule.calls:
        tail = "never calls it" if called == 0 else f"calls it in {count(called, 'place')}"  # places in the code, not calls made
        problems.append(f"This level wants your program to call `{name}` in at least {count(rule.calls, 'place')}, and it {tail}.")
    if rule.returns and not _returns_value(_own_nodes(fn.body)):
        problems.append(
            f"This level wants `{name}` to hand back a value: put `return` and the value inside it. "
            "A `return` on its own hands back nothing."
        )
    return problems


def _outside(tree: ast.Module, fn: ast.FunctionDef | ast.AsyncFunctionDef):
    """Every node of the program that is not in `fn`'s own lines (its body, signature and decorators)."""
    inside = {id(node) for node in ast.walk(fn)}
    return (node for node in ast.walk(tree) if id(node) not in inside)


def _calls(tree: ast.Module, fn: ast.FunctionDef | ast.AsyncFunctionDef) -> int:
    """The places in the program that call `fn` by name, not counting the function calling itself."""
    return sum(isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == fn.name for n in _outside(tree, fn))


def _define_problems(tree: ast.Module, defs: dict, wanted: int, examine) -> list[str]:
    """`define`: at least `wanted` functions of the player's own naming, each called from outside its own lines.
    On an examiner level the examiner calls its function."""
    called = {name for name, fn in defs.items() if _calls(tree, fn) or (examine is not None and name == examine.function)}
    if len(called) >= wanted:
        return []
    what = "a function" if wanted == 1 else f"{wanted} functions"
    if not defs:
        each = "it" if wanted == 1 else "each one"
        return [f"This level needs {what} of your own: write {each} with a `def`, then call {each} in your program."]
    message = f"This level needs {what} of your own that your program calls."
    never = [fn for name, fn in defs.items() if name not in called]
    if never:
        names = and_list([f"`{fn.name}`" for fn in never])
        verb, them = ("is", "it") if len(never) == 1 else ("are", "them")
        message += f" {names} {verb} defined but never called. {_def_needs_a_call(them, and_list([_call_text(fn) for fn in never]))}."
    if len(defs) < wanted:
        message += f" Your program defines only {count(len(defs), 'function')}."
    return [message]


def _only_defines_problems(tree: ast.Module) -> list[str]:
    """On an examiner level the program only defines (decision 4): the examiner makes the calls, and a line that
    acts would run before it does. Allowed at the left edge: `def`s, a docstring, `pass`, and a name set to a
    plain value. A `def` runs its decorators and its default values when Python reads it, so those must not act
    either (a nested `def` runs only when called, and isn't judged)."""
    problems, spans = [], []
    for i, stmt in enumerate(tree.body):
        if isinstance(stmt, _DEFS):
            problems += _def_runs_nothing(stmt)
        elif not _only_defines(stmt, i == 0):
            spans.append((stmt.lineno, stmt.end_lineno))
    if not spans:
        return problems
    parts = [str(first) if first == last else f"{first} to {last}" for first, last in spans]
    where = f"line {parts[0]}" if len(parts) == 1 and spans[0][0] == spans[0][1] else f"lines {and_list(parts)}"
    return [f"On this level the examiner makes the calls: take out {where}."] + problems


def _def_runs_nothing(fn: ast.FunctionDef | ast.AsyncFunctionDef) -> list[str]:
    """What in a top-level `def`'s own line would run before the examiner calls: a decorator, or a default that
    isn't a plain value. (Annotations are read lazily, so they run nothing.)"""
    now = "On this level nothing runs until the examiner calls:"
    problems = [f"{now} take out the `@` line above `def {fn.name}` (line {d.lineno})." for d in fn.decorator_list]
    args = fn.args
    positional = args.posonlyargs + args.args
    defaulted = list(zip(positional[len(positional) - len(args.defaults) :], args.defaults, strict=True))
    defaulted += [(arg, default) for arg, default in zip(args.kwonlyargs, args.kw_defaults, strict=True) if default is not None]
    for arg, default in sorted(defaulted, key=lambda pair: pair[1].lineno):
        if not _plain_value(default):
            problems.append(
                f"{now} the default of `{arg.arg}` in `{fn.name}` (line {default.lineno}) has to be a plain value, like `{arg.arg}=1`."
            )
    return problems


def _only_defines(stmt: ast.stmt, first: bool) -> bool:
    if isinstance(stmt, (*_DEFS, ast.Pass)):
        return True
    if first and _is_docstring(stmt):
        return True
    return isinstance(stmt, ast.Assign) and len(stmt.targets) == 1 and isinstance(stmt.targets[0], ast.Name) and _plain_value(stmt.value)


def _plain_value(node: ast.expr) -> bool:
    """A number, a negative number, text, True, False or None, written out."""
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
        node = node.operand
        return isinstance(node, ast.Constant) and type(node.value) in (int, float)
    return isinstance(node, ast.Constant) and type(node.value) in (int, float, str, bool, type(None))


def numbers_written(tree: ast.Module) -> list[int | float]:
    """Every number written in the code, not counting numbers inside text. -3 counts as 3."""
    return [node.value for node in ast.walk(tree) if isinstance(node, ast.Constant) and type(node.value) in (int, float)]


# max_numbers: 1, in words (the Challenge panel's rule, and the message when it's broken)
ONE_NUMBER = "only one number, written once"


def _number_problems(tree: ast.Module, constraints) -> list[str]:
    """max_numbers (M3.2, QA-029): how many numbers the code may write."""
    limit = constraints.max_numbers
    if limit is None:
        return []
    numbers = numbers_written(tree)
    if len(numbers) <= limit:
        return []
    written = f"Your code writes {count(len(numbers), 'number')}: {and_list([str(number) for number in sorted(numbers)])}."
    if limit == 1:
        return [f"{written} It may contain {ONE_NUMBER}: give it a name, and use the name."]
    return [f"{written} This level allows at most {limit}."]


def lint(tree: ast.Module, namespace: dict, examine=None) -> list[LintWarning]:
    """Spot lines that are valid Python but almost certainly not what was meant.
    `examine` is the level's examiner (levels.Examine) or None: the examiner calls its function, so that one
    function is not noted as "defined but never called"; any other function of the player's is, as on any level."""
    pieces = {name: type(value) for name, value in namespace.items() if isinstance(value, Piece)}
    defs = _own_functions(tree)
    unused = {name: fn for name, fn in defs.items() if examine is None or name != examine.function}
    warnings = _never_called_warnings(tree, unused)
    for node in ast.walk(tree):
        if isinstance(node, (ast.While, ast.If)):
            warnings += _condition_warnings(node, pieces)
        if not isinstance(node, ast.Expr):
            continue
        value = node.value
        if isinstance(value, ast.Attribute) and isinstance(value.value, ast.Name) and value.value.id in pieces:
            warnings.append(LintWarning(node.lineno, _piece_attribute_warning(value.value.id, value.attr, pieces[value.value.id])))
        elif isinstance(value, ast.Name):
            if value.id in defs:
                message = (
                    f"This line names `{value.id}` but doesn't call it, so the lines inside it don't run. "
                    f"Add parentheses to call it: {_call_text(defs[value.id])}"
                )
            elif value.id == "print":
                message = "This line mentions `print` but doesn't call it. Add parentheses: print(...)"
            else:
                message = f"This line mentions `{value.id}` but doesn't do anything with it."
            warnings.append(LintWarning(node.lineno, message))
        elif isinstance(value, ast.Compare) and len(value.ops) == 1 and isinstance(value.ops[0], ast.Eq):
            warnings.append(
                LintWarning(node.lineno, "This line compares with == but doesn't use the answer. To store a value, use a single =.")
            )
    return sorted(warnings, key=lambda warning: warning.line)


def _own_functions(tree: ast.Module) -> dict[str, ast.FunctionDef | ast.AsyncFunctionDef]:
    """The functions the program defines with `def`, by name (a later `def` of a name wins). Methods are left out."""
    methods = {id(item) for cls in ast.walk(tree) if isinstance(cls, ast.ClassDef) for item in cls.body}
    return {
        node.name: node
        for node in ast.walk(tree)
        if isinstance(node, _DEFS) and id(node) not in methods
    }


def _call_text(fn: ast.FunctionDef | ast.AsyncFunctionDef) -> str:
    """How to call `fn`, without inventing values: `stride()`, or `stride(...)` when it takes parameters."""
    return f"{fn.name}({'...' if _param_names(fn) else ''})"


def _def_needs_a_call(them: str, calls: str) -> str:
    """The lesson a function defined but never called teaches (the two notes on it end the same way)."""
    return f"A `def` only teaches Python the name; the lines inside run when you call {them}: {calls}"


def _never_called_warnings(tree: ast.Module, defs: dict) -> list[LintWarning]:
    """A `def` whose name the program never uses outside the function's own lines (M5.2). A call, a bare mention
    (which has its own note) and handing it on as a value all count as use; a function that only calls itself doesn't."""
    found = []
    for fn in defs.values():
        if any(isinstance(n, ast.Name) and n.id == fn.name for n in _outside(tree, fn)):
            continue
        found.append(
            LintWarning(fn.lineno, f"`{fn.name}` is defined here but never called. {_def_needs_a_call('it', _call_text(fn))}")
        )
    return found


def _condition_warnings(node: ast.While | ast.If, pieces: dict) -> list[LintWarning]:
    """An ability named in a `while` or `if` condition without its parentheses (M3.5). The
    ability itself is always truthy, so `while not pawn.at_goal:` never runs and
    `while pawn.at_goal:` never ends."""
    called = {id(call.func) for call in ast.walk(node.test) if isinstance(call, ast.Call)}
    found = []
    for attr in ast.walk(node.test):
        if not (isinstance(attr, ast.Attribute) and isinstance(attr.value, ast.Name) and attr.value.id in pieces):
            continue
        if id(attr) in called or _is_property(pieces[attr.value.id], attr.attr):
            continue
        name = f"{attr.value.id}.{attr.attr}"
        found.append(
            LintWarning(
                node.lineno,
                f"`{name}` in this condition has no parentheses, so it's the ability itself, not its answer, "
                f"and that is always True. To ask it, call it: {name}()",
            )
        )
    return found


def describe_rules(constraints, examine=None) -> list[str]:
    """The level's rules as the Challenge panel lists them, one sentence each, in the order they are checked.
    `examine` (levels.Examine or None) adds an examiner level's own rules."""
    rules = []
    if constraints.max_lines is not None:
        rules.append(
            f"At most {count(constraints.max_lines, "line")} of code. Blank lines and comments don't count; "
            "two statements on one line count as two."
        )
    if constraints.min_comments:
        rules.append(f"At least {count(constraints.min_comments, 'comment')} (a note starting with #).")
    rules += [f"Must use {describe_node(name)}." for name in constraints.require_nodes]
    rules += [f"Not allowed: {describe_node(name)}." for name in constraints.ban_nodes]
    if constraints.max_numbers == 1:
        rules.append(f"Your code may contain {ONE_NUMBER}.")
    elif constraints.max_numbers:
        rules.append(f"Your code may contain at most {count(constraints.max_numbers, 'number')}.")
    return rules + _function_rules(constraints, examine)


def _function_rules(constraints, examine) -> list[str]:
    """The function rules (M5.2) as sentences, in the order `_function_problems` checks them."""
    rules = []
    if examine is not None:
        if not _rule_parts(constraints.functions.get(examine.function)):  # a rule with parts says it, fuller, below
            rules.append(f"Define a function called `{examine.function}`.")
        rules.append("Your program only defines; the examiner makes the calls. Keep to `def`s, `pass` and names set to plain values.")
    for name, rule in constraints.functions.items():
        parts = _rule_parts(rule)
        if parts:
            rules.append(f"Define a function called `{name}` that {and_list(parts)}.")
        elif examine is None or name != examine.function:
            rules.append(f"Define a function called `{name}`.")
    if constraints.define == 1:
        rules.append("Define a function of your own, and call it.")
    elif constraints.define:
        rules.append(f"Define {constraints.define} functions of your own, and call each one.")
    return rules


def _rule_parts(rule) -> list[str]:
    """What one function's rule asks, as the parts of a sentence ("takes 1 value", "hands back a value"); none when it asks nothing."""
    parts: list[str] = []
    if rule is None:
        return parts
    if rule.params is not None:
        takes = f"takes {_values(rule.params)}"
        parts.append(takes if rule.defaults is None else f"{takes} ({_of_them(rule.defaults)} with a default)")
    elif rule.defaults is not None:
        parts.append(f"has {_values(rule.defaults)} with a default")
    if rule.returns:
        parts.append("hands back a value")
    if rule.calls is not None:
        parts.append(f"is called in at least {count(rule.calls, 'place')}")
    return parts


def _of_them(n: int) -> str:
    return "none of them" if n == 0 else f"{n} of them"


def describe_node(name: str) -> str:
    return NODE_NAMES.get(name, f"`{name}`")


def _is_property(piece_type: type, attr: str) -> bool:
    return isinstance(inspect.getattr_static(piece_type, attr, None), property)


def _piece_attribute_warning(piece: str, attr: str, piece_type: type) -> str:
    if _is_property(piece_type, attr):
        return f"This line looks up `{piece}.{attr}` but doesn't use it. To see it, print it: print({piece}.{attr})"
    return (
        f"This line mentions `{piece}.{attr}` but doesn't call it, so nothing happens. "
        f"Add parentheses to make the {piece} act: {piece}.{attr}()"
    )


def _tokens(code: str):
    try:
        yield from tokenize.generate_tokens(io.StringIO(code).readline)
    except (tokenize.TokenError, SyntaxError):
        return  # only called on code that already compiled, so this is just a safety net
