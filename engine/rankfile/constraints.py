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
from dataclasses import dataclass

from .pieces import Piece
from .words import count

_IGNORED_TOKENS = {
    tokenize.COMMENT, tokenize.NL, tokenize.NEWLINE, tokenize.INDENT,
    tokenize.DEDENT, tokenize.ENDMARKER, tokenize.ENCODING,
}  # fmt: skip

# How to describe node types to a player.
NODE_NAMES = {
    "For": "a for loop",
    "While": "a while loop",
    "If": "an if statement",
    "FunctionDef": "a function definition (def)",
    "Return": "a return statement",
    "Call": "a function call",
    "Assign": "a variable assignment (=)",
    "AugAssign": "an update like += or -=",
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


def code_lines(code: str) -> int:
    """Lines that contain code (blank lines and comment-only lines don't count)."""
    lines: set[int] = set()
    for token in _tokens(code):
        if token.type not in _IGNORED_TOKENS:
            lines.update(range(token.start[0], token.end[0] + 1))
    return len(lines)


def comment_count(code: str) -> int:
    return sum(1 for token in _tokens(code) if token.type == tokenize.COMMENT)


def check_constraints(tree: ast.Module, code: str, constraints) -> list[str]:
    """Every way `code` breaks the level's rules, as messages for the player."""
    problems = []
    if constraints.max_lines is not None:
        used = code_lines(code)
        if used > constraints.max_lines:
            problems.append(
                f"This level allows at most {count(constraints.max_lines, 'line')} of code, and yours has {used}. "
                "(Blank lines and comments don't count.)"
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
    return problems


def lint(tree: ast.Module, namespace: dict) -> list[LintWarning]:
    """Spot lines that are valid Python but almost certainly not what was meant."""
    pieces = {name: type(value) for name, value in namespace.items() if isinstance(value, Piece)}
    warnings = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Expr):
            continue
        value = node.value
        if isinstance(value, ast.Attribute) and isinstance(value.value, ast.Name) and value.value.id in pieces:
            warnings.append(LintWarning(node.lineno, _piece_attribute_warning(value.value.id, value.attr, pieces[value.value.id])))
        elif isinstance(value, ast.Name):
            if value.id == "print":
                message = "This line mentions `print` but doesn't call it. Add parentheses: print(...)"
            else:
                message = f"This line mentions `{value.id}` but doesn't do anything with it."
            warnings.append(LintWarning(node.lineno, message))
        elif isinstance(value, ast.Compare) and len(value.ops) == 1 and isinstance(value.ops[0], ast.Eq):
            warnings.append(
                LintWarning(node.lineno, "This line compares with == but doesn't use the answer. To store a value, use a single =.")
            )
    return sorted(warnings, key=lambda warning: warning.line)


def describe_rules(constraints) -> list[str]:
    """The level's rules as the Challenge panel lists them, one sentence each."""
    rules = []
    if constraints.max_lines is not None:
        rules.append(f"At most {count(constraints.max_lines, "line")} of code. Blank lines and comments don't count.")
    if constraints.min_comments:
        rules.append(f"At least {count(constraints.min_comments, 'comment')} (a note starting with #).")
    rules += [f"Must use {describe_node(name)}." for name in constraints.require_nodes]
    rules += [f"Not allowed: {describe_node(name)}." for name in constraints.ban_nodes]
    return rules


def describe_node(name: str) -> str:
    return NODE_NAMES.get(name, f"`{name}`")


def _piece_attribute_warning(piece: str, attr: str, piece_type: type) -> str:
    if isinstance(inspect.getattr_static(piece_type, attr, None), property):
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
