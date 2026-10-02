import ast

import pytest

from conftest import make_level
from rankfile import constraints
from rankfile.constraints import code_lines, comment_count
from rankfile.levels import LevelError
from rankfile.runner import run_level


def test_code_lines_ignore_blanks_and_comments():
    code = "# plan\n\npawn.move()  # go\n\n# done\npawn.turn_left()\n"
    assert code_lines(code) == 2
    assert comment_count(code) == 3


def test_a_statement_split_over_lines_counts_every_line():
    assert code_lines("pawn.move(\n    3\n)\n") == 3


@pytest.mark.parametrize(
    "squeezed, spread",
    [
        ("pawn.move(); pawn.turn_left(); pawn.move()\n", "pawn.move()\npawn.turn_left()\npawn.move()\n"),
        ("for _ in range(3): pawn.move(); pawn.turn_left()\n", "for _ in range(3):\n    pawn.move()\n    pawn.turn_left()\n"),
        ("if x: a()\nelif y: b()\nelse: c()\n", "if x:\n    a()\nelif y:\n    b()\nelse:\n    c()\n"),
        ("while x: a()\nelse: b()\n", "while x:\n    a()\nelse:\n    b()\n"),
        ("try: a()\nexcept ValueError: b()\nfinally: c()\n", "try:\n    a()\nexcept ValueError:\n    b()\nfinally:\n    c()\n"),
        ("match x:\n    case 1: a()\n    case _: b()\n", "match x:\n    case 1:\n        a()\n    case _:\n        b()\n"),
        ("def f(): return 3\n", "def f():\n    return 3\n"),
        ("@d\ndef f(): return 3\n", "@d\ndef f():\n    return 3\n"),
        ("class C: x = 1; y = 2\n", "class C:\n    x = 1\n    y = 2\n"),
        ("with x: a()\n", "with x:\n    a()\n"),
        ("try: a()\nexcept* ValueError: b()\n", "try:\n    a()\nexcept* ValueError:\n    b()\n"),
    ],
)
def test_squeezing_statements_onto_one_line_saves_no_lines(squeezed, spread):
    """Each statement counts as a line however it's laid out (M3.3), so `;`
    can't dodge a line limit."""
    assert code_lines(squeezed) == code_lines(spread)


def test_else_inside_an_expression_is_not_a_clause():
    assert code_lines("x = (1 if y\n     else 2)\n") == 2


def test_the_line_limit_says_why_a_squeezed_line_counts_twice():
    level = make_level("G\n.\n.\nP\n", constraints={"max_lines": 2})
    result = run_level(level, "pawn.move(); pawn.move(); pawn.move()")
    assert result.status == "constraint"
    assert result.summary == "This level allows at most 2 lines of code, and yours has 3. Two statements on one line count as two."


def test_max_lines_blocks_the_run():
    level = make_level("G\n.\n.\nP\n", constraints={"max_lines": 2})
    result = run_level(level, "pawn.move()\npawn.move()\npawn.move()")
    assert result.status == "constraint"
    assert result.summary.startswith("This level allows at most 2 lines of code, and yours has 3.")
    assert result.steps == []  # it never ran
    assert result.code_lines == 3


def test_comments_do_not_count_towards_max_lines():
    level = make_level("G\n.\n.\nP\n", constraints={"max_lines": 1})
    assert run_level(level, "# three squares north\npawn.move(3)  # go!\n").status == "solved"


def test_min_comments():
    level = make_level("G\nP\n", constraints={"min_comments": 1})
    assert run_level(level, "pawn.move()").status == "constraint"
    assert run_level(level, "pawn.move()  # onward").status == "solved"


def test_required_and_banned_nodes_use_the_ast_not_the_text():
    level = make_level("G\n.\n.\nP\n", constraints={"require_nodes": ["For"]})
    fake = "# for _ in range(3): pawn.move()\npawn.move(3)\n"
    result = run_level(level, fake)
    assert result.status == "constraint"
    assert result.summary == "This level needs you to use a for loop."
    assert run_level(level, "for _ in range(3):\n    pawn.move()\n").status == "solved"

    level = make_level("G\n.\n.\nP\n", constraints={"ban_nodes": ["For"]})
    assert run_level(level, "for _ in range(3):\n    pawn.move()\n").summary == "This level doesn't allow a for loop."


def test_warns_about_abilities_mentioned_but_not_called(corridor):
    result = run_level(corridor, "pawn.move\npawn.move()")
    assert result.status == "incomplete"
    assert result.warnings == [
        {
            "line": 1,
            "message": "This line mentions `pawn.move` but doesn't call it, so nothing happens. "
            "Add parentheses to make the pawn act: pawn.move()",
        }
    ]


def test_warns_about_other_do_nothing_lines(corridor):
    result = run_level(corridor, "x = 3\nprint\nx == 4\n")
    messages = [warning["message"] for warning in result.warnings]
    assert messages[0].startswith("This line mentions `print` but doesn't call it")
    assert messages[1].startswith("This line compares with ==")


@pytest.mark.parametrize("header", ["while not pawn.at_goal:", "while pawn.at_goal:", "if pawn.at_goal:"])
def test_warns_about_an_ability_without_parentheses_in_a_condition(header, waiting_corridor):
    result = run_level(waiting_corridor, f"{header}\n    pawn.wait()\npawn.move(2)", line_budget=500)
    assert [warning["line"] for warning in result.warnings] == [1]
    assert "`pawn.at_goal` in this condition has no parentheses" in result.warnings[0]["message"]


def test_no_condition_warning_when_the_ability_is_called(waiting_corridor):
    assert run_level(waiting_corridor, "while not pawn.at_goal():\n    pawn.move()").warnings == []


def test_no_warnings_for_normal_code(corridor):
    assert run_level(corridor, "pawn.move(3)\nprint('done')").warnings == []


def test_ast_module_is_what_we_think():
    # A reminder of what the constraint names refer to.
    assert type(ast.parse("for x in y: pass").body[0]).__name__ == "For"


# -- max_numbers (M3.2, QA-029) --------------------------------------------------------


def test_only_one_number_written_once():
    level = make_level("G\n.\n.\n.\n.\nP\n", constraints={"max_numbers": 1})
    result = run_level(level, "pawn.move(2)\npawn.move(3)")
    assert result.status == "constraint"
    assert result.summary == (
        "Your code writes 2 numbers: 2 and 3. It may contain only one number, written once: give it a name, and use the name."
    )
    assert run_level(level, "steps = 2\npawn.move(steps)\npawn.move(steps)\npawn.move()").status == "solved"
    assert run_level(level, "steps = 2\npawn.move(steps + steps)\npawn.move()").status == "solved"  # sums on the name are fine


def test_a_higher_limit_counts_every_number_written():
    level = make_level("G\n.\n.\n.\nP\n", constraints={"max_numbers": 2})
    assert run_level(level, "pawn.move(1)\npawn.move(1)\npawn.move(2)").summary.endswith("This level allows at most 2.")


def test_numbers_inside_text_dont_count_and_a_minus_sign_doesnt_hide_one():
    numbers = constraints.numbers_written(ast.parse("print('5 squares')\nx = -3\ny = 2.5\nz = True"))
    assert sorted(numbers) == [2.5, 3]


def test_max_numbers_is_described():
    assert make_level("G\nP\n", constraints={"max_numbers": 1}).describe()["rules"] == ["Your code may contain only one number, written once."]
    assert make_level("G\nP\n", constraints={"max_numbers": 3}).describe()["rules"] == ["Your code may contain at most 3 numbers."]


def test_max_numbers_must_be_a_whole_number():
    with pytest.raises(LevelError, match="max_numbers must be a whole number"):
        make_level("G\nP\n", constraints={"max_numbers": 0})
