import ast

import pytest

from conftest import make_level
from rankfile import constraints
from rankfile.constraints import code_lines, comment_count
from rankfile.levels import Examine, LevelError
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


def _lint(code, examine=None):
    return [(w.line, w.message) for w in constraints.lint(ast.parse(code), {}, examine)]


NAMED = "This line names `stride` but doesn't call it, so the lines inside it don't run. Add parentheses to call it: "
UNCALLED = (
    "`stride` is defined here but never called. A `def` only teaches Python the name; "
    "the lines inside run when you call it: "
)


@pytest.mark.parametrize("code", ["def stride():\n    pass\nstride\n", "stride\ndef stride():\n    pass\nstride()\n"])
def test_names_a_function_without_calling_it_above_or_below_its_def(code):
    line = code.splitlines().index("stride") + 1
    assert _lint(code) == [(line, NAMED + "stride()")]


def test_named_function_with_parameters_shows_a_call_without_values():
    assert _lint("def stride(n, k=2):\n    pass\nstride\n") == [(3, NAMED + "stride(...)")]


def test_other_bare_names_keep_their_old_notes():
    messages = [message for _, message in _lint("x = 3\nprint\nx\n")]
    assert messages == [
        "This line mentions `print` but doesn't call it. Add parentheses: print(...)",
        "This line mentions `x` but doesn't do anything with it.",
    ]


def test_defined_but_never_called_is_noted_on_the_def_line():
    assert _lint("x = 1\ndef stride():\n    pass\n") == [(2, UNCALLED + "stride()")]
    assert _lint("def stride(a):\n    pass\n") == [(1, UNCALLED + "stride(...)")]


def test_called_or_handed_on_functions_get_no_never_called_note():
    assert _lint("def stride():\n    pass\nstride()\n") == []
    assert _lint("def stride():\n    pass\nrun(stride)\n") == []


def test_helper_of_an_uncalled_function_gets_no_note_of_its_own():
    code = "def helper():\n    pass\ndef outer():\n    helper()\n"
    assert _lint(code) == [(3, UNCALLED.replace("stride", "outer") + "outer()")]


def test_a_function_that_only_calls_itself_is_never_called():
    assert _lint("def stride(n):\n    stride(n)\n") == [(1, UNCALLED + "stride(...)")]


def test_a_named_function_does_not_also_get_the_never_called_note():
    assert len(_lint("def stride():\n    pass\nstride\n")) == 1


def test_examiner_level_exempts_only_its_own_function_from_never_called():
    examine = Examine(function="stride")
    assert _lint("def stride():\n    pass\n", examine) == []
    assert _lint("def stride():\n    pass\nstride\n", examine) == [(3, NAMED + "stride()")]
    # Any other function of the player's gets the note, as on any level.
    other = "def stride():\n    pass\ndef helper():\n    pass\n"
    assert _lint(other, examine) == [(3, UNCALLED.replace("stride", "helper") + "helper()")]
    assert _lint("def stride():\n    helper()\ndef helper():\n    pass\n", examine) == []


def test_methods_are_not_judged_and_nested_functions_are_judged_by_name():
    assert _lint("class A:\n    def go(self):\n        pass\n") == []
    nested = "def outer():\n    def inner():\n        pass\n    inner()\nouter()\n"
    assert _lint(nested) == []
    assert [line for line, _ in _lint("def outer():\n    def inner():\n        pass\nouter()\n")] == [2]


def test_function_notes_arrive_with_a_real_run_sorted_by_line(corridor):
    result = run_level(corridor, "def stride():\n    pawn.move()\nx = 1\nx == 2\n")
    assert [w["line"] for w in result.warnings] == [1, 4]
    assert result.warnings[0]["message"] == UNCALLED + "stride()"


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


# -- function rules, `define` and the examiner's "only defines" (M5.2-3) -------------------


def _problems(code, examine=None, **rules):
    """What check_constraints says about `code` on a level with these constraints."""
    level = make_level("P G\n", constraints=rules)
    return constraints.check_constraints(ast.parse(code), code, level.constraints, examine)


def _wants(name, params=None):
    signature = "()" if params == 0 else "(...)"
    return (
        f"This level needs a function called `{name}`: define it with `def {name}{signature}:`, "
        "starting at the left edge of your program, not inside anything else."
    )


def test_a_function_rule_wants_the_function_at_the_left_edge():
    rules = {"functions": {"gallop": {}}}
    assert _problems("x = 1\n", **rules) == [_wants("gallop")]
    assert _problems("def gallop():\n    pass\n", **rules) == []
    assert _problems("async def gallop():\n    pass\n", **rules) == []
    assert _problems("class Horse:\n    def gallop(self):\n        pass\n", **rules) == [_wants("gallop")]
    assert _problems("def outer():\n    def gallop():\n        pass\n", **rules) == [_wants("gallop")]
    assert _problems("if True:\n    def gallop():\n        pass\n", **rules) == [_wants("gallop")]


def test_the_missing_function_shows_empty_parentheses_when_it_takes_nothing():
    assert _problems("x = 1\n", functions={"gallop": {"params": 0}}) == [_wants("gallop", 0)]
    assert _problems("x = 1\n", functions={"gallop": {"params": 2}}) == [_wants("gallop")]


def test_a_function_defined_twice_is_judged_by_the_later_def():
    rules = {"functions": {"gallop": {"params": 2}}}
    assert _problems("def gallop(a):\n    pass\ndef gallop(a, b):\n    pass\n", **rules) == []
    assert len(_problems("def gallop(a, b):\n    pass\ndef gallop(a):\n    pass\n", **rules)) == 1


@pytest.mark.parametrize(
    ("wanted", "header", "message"),
    [
        (2, "def gallop(a):", "This level wants `gallop` to take 2 values inside its parentheses, and yours takes 1 value."),
        (1, "def gallop(a, b):", "This level wants `gallop` to take 1 value inside its parentheses, and yours takes 2 values."),
        (0, "def gallop(a):", "This level wants `gallop` to take no values inside its parentheses, and yours takes 1 value."),
        (1, "def gallop():", "This level wants `gallop` to take 1 value inside its parentheses, and yours takes no values."),
    ],
)
def test_the_wrong_number_of_values(wanted, header, message):
    assert _problems(f"{header}\n    pass\n", functions={"gallop": {"params": wanted}}) == [message]


def test_the_right_number_of_values_counts_every_kind_of_parameter():
    rules = {"gallop": {"params": 6}}
    assert _problems("def gallop(a, /, b, c=1, *d, e, **f):\n    pass\n", functions=rules) == []
    assert _problems("def gallop(a, b, c, d, e, f):\n    pass\n", functions=rules) == []


def test_defaults_are_counted_even_when_params_is_not_set():
    code = "def gallop(a, b=1, *, c=2, d):\n    pass\n"
    assert _problems(code, functions={"gallop": {"defaults": 2}}) == []
    assert _problems(code, functions={"gallop": {"defaults": 1}}) == [
        "This level wants `gallop` to have 1 value with a default (like `steps=1` inside its parentheses), "
        "and yours has 2 values with a default."
    ]
    assert _problems("def gallop(a):\n    pass\n", functions={"gallop": {"defaults": 1}}) == [
        "This level wants `gallop` to have 1 value with a default (like `steps=1` inside its parentheses), "
        "and yours has no values with a default."
    ]


def test_zero_defaults_can_be_asked_for():
    assert _problems("def gallop(a=1):\n    pass\n", functions={"gallop": {"defaults": 0}}) == [
        "This level wants `gallop` to have no values with a default (like `steps=1` inside its parentheses), "
        "and yours has 1 value with a default."
    ]


def test_params_and_defaults_can_both_be_broken_and_each_gets_a_message():
    problems = _problems("def gallop(a):\n    pass\n", functions={"gallop": {"params": 2, "defaults": 1}})
    assert len(problems) == 2 and "to take 2 values" in problems[0] and "to have 1 value with a default" in problems[1]


CALLED = "This level wants your program to call `gallop` at least 2 times, and it "


def test_calls_counts_the_places_that_call_the_function_by_name():
    rules = {"functions": {"gallop": {"calls": 2}}}
    head = "def gallop():\n    pass\n"
    assert _problems(head, **rules) == [CALLED + "never calls it."]
    assert _problems(head + "gallop()\n", **rules) == [CALLED + "calls it 1 time."]
    assert _problems(head + "gallop()\ngallop()\n", **rules) == []
    assert _problems(head + "for _ in range(5):\n    gallop()\n", **rules) == [CALLED + "calls it 1 time."]  # one place, however often
    assert _problems(head + "def twice():\n    gallop()\n    gallop()\n", **rules) == []
    assert _problems(head + "x = gallop\n", **rules) == [CALLED + "never calls it."]  # handing it on isn't calling it


def test_a_call_inside_the_functions_own_body_does_not_count():
    rules = {"functions": {"gallop": {"calls": 2}}}
    assert _problems("def gallop(n):\n    gallop(n)\n    gallop(n)\n", **rules) == [CALLED + "never calls it."]
    assert _problems("def gallop(n):\n    gallop(n)\ngallop(1)\n", **rules) == [CALLED + "calls it 1 time."]


def test_a_method_of_the_same_name_is_not_a_call_of_the_function():
    rules = {"functions": {"gallop": {"calls": 1}}}
    assert _problems("def gallop():\n    pass\nhorse.gallop()\n", **rules) == [
        "This level wants your program to call `gallop` at least 1 time, and it never calls it."
    ]


RETURNS = (
    "This level wants `gallop` to hand back a value: put `return` and the value inside it. "
    "A `return` on its own hands back nothing."
)


@pytest.mark.parametrize(
    ("body", "ok"),
    [
        ("    return 3\n", True),
        ("    if a:\n        return a + 1\n    return 0\n", True),
        ("    for _ in a:\n        return _\n", True),
        ("    pass\n", False),
        ("    print(a)\n", False),
        ("    return\n", False),
        ("    return None\n", False),
        ("    def inner():\n        return 3\n    inner()\n", False),  # a nested function's return is its own
        ("    f = lambda: 3\n", False),
        ("    def inner():\n        return 3\n    return 4\n", True),
    ],
)
def test_returns_wants_a_return_with_a_value_in_the_function_itself(body, ok):
    assert _problems(f"def gallop(a):\n{body}", functions={"gallop": {"returns": True}}) == ([] if ok else [RETURNS])


def test_returns_false_asks_nothing():
    assert _problems("def gallop():\n    pass\n", functions={"gallop": {"returns": False}}) == []


def test_every_function_rule_is_checked_in_the_order_the_file_lists_them():
    code = "def hop():\n    pass\n"
    problems = _problems(code, functions={"gallop": {}, "hop": {"params": 1}, "trot": {}})
    assert problems == [
        _wants("gallop"),
        "This level wants `hop` to take 1 value inside its parentheses, and yours takes no values.",
        _wants("trot"),
    ]


# `define`


def test_define_wants_a_function_of_the_players_own_that_is_called():
    assert _problems("pawn.move()\n", define=1) == [
        "This level needs a function of your own: write it with a `def`, then call it in your program."
    ]
    assert _problems("def stride():\n    pass\nstride()\n", define=1) == []
    assert _problems("def stride():\n    pass\n", define=1) == [
        "This level needs a function of your own that your program calls. `stride` is defined but never called. "
        "A `def` only teaches Python the name; the lines inside run when you call it: stride()"
    ]
    assert _problems("def stride(n):\n    stride(n)\n", define=1)[0].endswith("when you call it: stride(...)")


def test_define_counts_calls_from_anywhere_outside_the_functions_own_body():
    assert _problems("def a():\n    pass\ndef b():\n    a()\ndef c():\n    b()\n", define=2) == []
    assert _problems("def a():\n    pass\ndef b():\n    a()\n", define=2) == [
        "This level needs 2 functions of your own that your program calls. `b` is defined but never called. "
        "A `def` only teaches Python the name; the lines inside run when you call it: b()"
    ]


def test_define_counts_only_functions_at_the_left_edge_and_not_methods():
    assert _problems("class A:\n    def go(self):\n        pass\nA().go()\n", define=1)[0].startswith(
        "This level needs a function of your own:"
    )
    assert len(_problems("def outer():\n    def inner():\n        pass\n    inner()\nouter()\n", define=2)) == 1  # inner isn't one


def test_define_says_how_many_are_missing_and_which_are_never_called():
    assert _problems("pawn.move()\n", define=3) == [
        "This level needs 3 functions of your own: write each one with a `def`, then call each one in your program."
    ]
    assert _problems("def a():\n    pass\na()\n", define=2) == [
        "This level needs 2 functions of your own that your program calls. Your program defines only 1 function."
    ]
    assert _problems("def a():\n    pass\ndef b(x):\n    pass\n", define=2) == [
        "This level needs 2 functions of your own that your program calls. `a` and `b` are defined but never called. "
        "A `def` only teaches Python the name; the lines inside run when you call them: a() and b(...)"
    ]


def test_functions_named_by_the_level_count_towards_define():
    code = "def gallop():\n    pass\ngallop()\n"
    assert _problems(code, define=1, functions={"gallop": {}}) == []
    assert _problems(code, define=2, functions={"gallop": {}}) != []


# the examiner's rules


def _examined(code, **rules):
    return _problems(code, examine=Examine(function="gallop"), **rules)


def test_an_examiner_level_wants_its_function_defined():
    assert _examined("def hop():\n    pass\n") == [_wants("gallop")]
    assert _examined("def gallop():\n    pass\n") == []


def test_the_examiners_function_is_said_once_even_when_functions_names_it_too():
    assert _examined("pawn.move()\n", functions={"gallop": {"calls": 1}}) == [
        _wants("gallop"),
        "On this level the examiner makes the calls: take out line 1.",
    ]
    assert _examined("def gallop(a):\n    pass\n", functions={"gallop": {"params": 2}}) == [
        "This level wants `gallop` to take 2 values inside its parentheses, and yours takes 1 value."
    ]
    assert _examined("def hop():\n    pass\n", functions={"gallop": {"params": 0}}) == [_wants("gallop", 0)]


ONLY_DEFINES = "On this level the examiner makes the calls: take out "


@pytest.mark.parametrize(
    "line",
    [
        "pass",
        "steps = 3",
        "limit = -2",
        "ratio = 2.5",
        "name = 'knight'",
        'name = "knight"',
        "flag = True",
        "flag = False",
        "nothing = None",
        "def helper():\n    pawn.move()\n    print('inside a def is never touched')",
        "async def helper():\n    pawn.move()",
    ],
)
def test_the_examiner_levels_program_may_hold_these_at_the_left_edge(line):
    assert _examined(f"def gallop():\n    pass\n{line}\n") == []


@pytest.mark.parametrize(
    "line",
    [
        "gallop()",
        "pawn.move()",
        "print('hi')",
        "steps = 1 + 2",
        "steps = len('abc')",
        "steps = other",
        "a = b = 3",
        "a, b = 1, 2",
        "steps: int = 3",
        "steps += 1",
        "point = (1, 2)",
        "ratio = 1j",
        "name = b'x'",
        "for _ in range(2):\n    pass",
        "if True:\n    pass",
        "while False:\n    pass",
        "class Horse:\n    pass",
        "import math",
        "'a note in text'",
        "x = -y",
        "...",
    ],
)
def test_the_examiner_levels_program_may_not_hold_these_at_the_left_edge(line):
    assert _examined(f"def gallop():\n    pass\n{line}\n") == [ONLY_DEFINES + "line 3."]


def test_a_text_line_is_a_docstring_only_when_it_comes_first():
    assert _examined('"""A knight."""\ndef gallop():\n    pass\n') == []
    assert _examined('def gallop():\n    pass\n"""Later text."""\n') == [ONLY_DEFINES + "line 3."]


def test_the_message_names_every_line_to_take_out():
    code = "def gallop():\n    pass\ngallop()\n\nx = gallop\npawn.move()\n"
    assert _examined(code) == [ONLY_DEFINES + "lines 3, 5 and 6."]
    assert _examined("def gallop():\n    pass\ngallop()\npawn.move()\n") == [ONLY_DEFINES + "lines 3 and 4."]
    assert _examined("def gallop():\n    pass\nfor _ in x:\n    pass\n") == [ONLY_DEFINES + "line 3."]  # the line it starts on


def test_a_level_without_an_examiner_may_act_at_the_left_edge():
    assert _problems("pawn.move()\n", functions={}) == []


def test_function_rules_stop_a_real_run_before_it_starts():
    level = make_level("G\n.\n.\nP\n", constraints={"functions": {"stride": {"params": 1}}})
    result = run_level(level, "pawn.move(3)")
    assert result.status == "constraint" and result.steps == []
    assert result.summary == _wants("stride")
    assert run_level(level, "def stride(n):\n    pawn.move(n)\nstride(3)\n").status == "solved"


def test_function_rules_are_listed_for_the_challenge_panel():
    level = make_level(
        "P G\n",
        constraints={
            "functions": {
                "gallop": {"params": 2, "defaults": 1, "calls": 2, "returns": True},
                "hop": {},
                "trot": {"params": 0},
                "skip": {"defaults": 2},
                "jog": {"params": 2, "defaults": 0},
                "walk": {"returns": True},
            },
            "define": 2,
        },
    )
    assert level.describe()["rules"] == [
        "Define a function called `gallop` that takes 2 values (1 of them with a default), hands back a value and is called at least 2 times.",
        "Define a function called `hop`.",
        "Define a function called `trot` that takes no values.",
        "Define a function called `skip` that has 2 values with a default.",
        "Define a function called `jog` that takes 2 values (none of them with a default).",
        "Define a function called `walk` that hands back a value.",
        "Define 2 functions of your own, and call each one.",
    ]
    assert make_level("P G\n", constraints={"define": 1}).describe()["rules"] == ["Define a function of your own, and call it."]


def test_an_examiner_levels_rules_come_first_and_its_function_is_not_listed_twice():
    examine = Examine(function="gallop")
    level = make_level("P G\n", constraints={"max_lines": 5, "functions": {"gallop": {}, "hop": {"calls": 1}}, "define": 1})
    rules = constraints.describe_rules(level.constraints, examine)
    assert rules[:3] == [
        "At most 5 lines of code. Blank lines and comments don't count; two statements on one line count as two.",
        "Define a function called `gallop`.",
        "Your program only defines; the examiner makes the calls. Keep to `def`s, `pass` and names set to plain values.",
    ]
    assert rules[3:] == [
        "Define a function called `hop` that is called at least 1 time.",
        "Define a function of your own, and call it.",
    ]
    with_rule = make_level("P G\n", constraints={"functions": {"gallop": {"params": 1}}})
    assert constraints.describe_rules(with_rule.constraints, examine)[1:] == [
        "Your program only defines; the examiner makes the calls. Keep to `def`s, `pass` and names set to plain values.",
        "Define a function called `gallop` that takes 1 value.",
    ]
