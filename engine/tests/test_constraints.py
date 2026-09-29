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


def test_no_warnings_for_normal_code(corridor):
    assert run_level(corridor, "pawn.move(3)\nprint('done')").warnings == []


def test_ast_module_is_what_we_think():
    # A reminder of what the constraint names refer to.
    assert type(ast.parse("for x in y: pass").body[0]).__name__ == "For"


# -- the signpost rules (M3.2) ---------------------------------------------------------

SIGNS = {"S": {"tile": "sign", "text": "Walk 3, then 2 more."}}


def signpost_level(**rules):
    return make_level("G .\n. .\n. .\n. .\n. .\nP S\n", legend=SIGNS, constraints=rules)


def test_only_signpost_numbers_may_appear():
    level = signpost_level(numbers_from_signs=True)
    assert level.constraints.sign_numbers == [2, 3]
    result = run_level(level, "pawn.move(5)")
    assert result.status == "constraint"
    assert result.summary == "Your code uses 5, which isn't on a signpost. The only numbers allowed are the signposts': 2 and 3."
    assert run_level(level, "pawn.move(3 + 2)").status == "solved"


def test_each_number_may_appear_only_once():
    level = signpost_level(numbers_once=True)
    result = run_level(level, "pawn.move(2)\npawn.move(2)\npawn.move()")
    assert result.status == "constraint" and result.summary.startswith("Your code writes 2 more than once.")
    assert run_level(level, "steps = 2\npawn.move(steps)\npawn.move(steps)\npawn.move()").status == "solved"


def test_numbers_inside_text_dont_count_and_a_minus_sign_doesnt_hide_one():
    numbers = constraints.numbers_written(ast.parse("print('5 squares')\nx = -3\ny = 2.5\nz = True"))
    assert sorted(numbers) == [2.5, 3]


def test_the_signpost_rules_are_described():
    rules = signpost_level(numbers_from_signs=True, numbers_once=True).describe()["rules"]
    assert rules == [
        "Numbers must come from the signposts: only 2 and 3 may appear in your code.",
        "Each number may appear only once in your code.",
    ]


def test_numbers_from_signs_needs_a_signpost_with_a_number():
    with pytest.raises(LevelError, match="needs a signpost with a number"):
        make_level("G\n.\nP\n", constraints={"numbers_from_signs": True})
