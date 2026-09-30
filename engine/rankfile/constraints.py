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


def code_lines(code: str) -> int:
    """Lines of code, counted as if each statement had a line of its own (M3.3).

    Blank lines and comment-only lines don't count, and a statement split over
    several lines counts each of them. Squeezing statements together doesn't
    save lines: a second statement after `;`, a loop's body on the loop's own
    line, or `else:` with its body beside it each count as another line.
    """
    lines = _lines_with_code(code)
    starts = _statement_starts(code)
    return sum(max(1, starts[line]) for line in lines)


def shares_lines(code: str) -> bool:
    """Whether any line holds more than one statement."""
    return any(n > 1 for n in _statement_starts(code).values())


def _lines_with_code(code: str) -> set[int]:
    lines: set[int] = set()
    for token in _tokens(code):
        if token.type not in _IGNORED_TOKENS:
            lines.update(range(token.start[0], token.end[0] + 1))
    return lines


def _statement_starts(code: str) -> Counter[int]:
    """How many statements, and clauses such as `else:`, start on each line."""
    try:
        tree = ast.parse(code)
    except (SyntaxError, ValueError):
        return Counter()
    starts = Counter(
        node.lineno for node in ast.walk(tree) if isinstance(node, (ast.stmt, ast.ExceptHandler))
    )
    starts.update(case.pattern.lineno for node in ast.walk(tree) if isinstance(node, ast.Match) for case in node.cases)
    # `else:` and `finally:` have no node of their own; find their keywords where a line of code begins.
    line_start = True
    for token in _tokens(code):
        if token.type in (tokenize.NEWLINE, tokenize.INDENT, tokenize.DEDENT, tokenize.ENCODING):
            line_start = True
        elif token.type not in (tokenize.COMMENT, tokenize.NL):
            if line_start and token.type == tokenize.NAME and token.string in ("else", "finally"):
                starts[token.start[0]] += 1
            line_start = False
    return starts


def comment_count(code: str) -> int:
    return sum(1 for token in _tokens(code) if token.type == tokenize.COMMENT)


def check_constraints(tree: ast.Module, code: str, constraints) -> list[str]:
    """Every way `code` breaks the level's rules, as messages for the player."""
    problems = []
    if constraints.max_lines is not None:
        used = code_lines(code)
        if used > constraints.max_lines:
            why = (
                "Two statements on one line count as two."
                if shares_lines(code)
                else "(Blank lines and comments don't count.)"
            )
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
    return problems + _number_problems(tree, constraints)


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
