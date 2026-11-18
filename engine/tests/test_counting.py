"""Chapter 2's abilities (M3.2): counting the squares ahead, and waiting a number of ticks."""

import pytest

from conftest import events, make_level
from rankfile.constraints import code_lines
from rankfile.runner import run_level

MOVES = ["move", "turn_left", "turn_right"]
GATES = {
    "X": {"tile": "gate", "passphrase": "Open up"},
    "T": {"tile": "timed_gate", "every": 4, "open": 2},
    "S": {"tile": "sign", "text": "Hello"},
    "O": "pit",
}


def counted(map_text: str, code: str = "print(pawn.squares_ahead())") -> str:
    """What the code printed on this map, with squares_ahead unlocked."""
    level = make_level(map_text, api=[*MOVES, "squares_ahead"], legend=GATES)
    return run_level(level, code).output.strip()


@pytest.mark.parametrize(
    ("map_text", "ahead"),
    [
        ("# .\nG .\n. .\nP .\n", "2"),  # a wall; the goal is ordinary floor
        ("G\n.\nP\n", "2"),  # the edge of the board
        ("S G\n. .\nP .\n", "1"),  # a signpost
        ("G\nX\n.\nP\n", "1"),  # a guard's gate, still locked
        ("G\nT\n.\nP\n", "1"),  # a timed gate, even though it's open at the start
        ("G\nO\n.\nP\n", "3"),  # a pit doesn't stop the count
        ("G\n#\nP\n", "0"),  # something right in front
    ],
)
def test_squares_ahead_counts_until_something_could_stop_the_piece(map_text, ahead):
    assert counted(map_text) == ahead


def test_a_guards_gate_counts_as_floor_once_its_open():
    code = "pawn.move()\nprint('Open up')\nprint(pawn.squares_ahead())"
    assert counted("G\nX\n.\nP\n", code).splitlines()[-1] == "2"


def test_counting_is_free():
    level = make_level("G\n.\nP\n", api=[*MOVES, "squares_ahead"])
    result = run_level(level, "pawn.squares_ahead()\npawn.squares_ahead()")
    assert result.final["tick"] == 0 and events(result) == []


def test_squares_ahead_is_locked_until_a_level_unlocks_it():
    result = run_level(make_level("G\n.\nP\n"), "pawn.squares_ahead()")
    assert result.status == "error" and "hasn't learned `squares_ahead`" in result.error.friendly


@pytest.mark.parametrize(("code", "ticks"), [("pawn.wait()", 1), ("pawn.wait(3)", 3), ("pawn.wait(0)", 0)])
def test_wait_takes_a_number_of_ticks(code, ticks):
    level = make_level("G\n.\nP\n", api=[*MOVES, "wait"])
    result = run_level(level, code)
    assert result.final["tick"] == ticks and len(events(result, "wait")) == ticks


@pytest.mark.parametrize(
    ("code", "says"),
    [
        ("pawn.wait('2')", "quote marks"),
        ("pawn.wait(1.5)", "whole number of ticks"),
        ("pawn.wait(-1)", "The fewest is 0"),
        ("pawn.wait(101)", "The most is 100"),
        ("pawn.wait(True)", "needs a number of ticks"),
    ],
)
def test_bad_arguments_to_wait(code, says):
    result = run_level(make_level("G\n.\nP\n", api=[*MOVES, "wait"]), code)
    assert result.status == "error" and says in result.error.friendly


# -- a docstring counts for nothing, like a comment (M5.2, decision 8) ---------------------

CORRIDOR = "G\n.\n.\nP\n"


@pytest.mark.parametrize(
    ("code", "lines"),
    [
        ('"""A note."""\npawn.move()\n', 1),  # a module's
        ('"""A note\nover three\nlines."""\npawn.move()\n', 1),
        ("'''A note.'''\npawn.move()\n", 1),
        ("'A note.'\npawn.move()\n", 1),
        ('("A note "\n "in two parts")\npawn.move()\n', 1),
        ('def f():\n    """What f does."""\n    pawn.move()\n', 2),  # a function's
        ('def f():\n    """What f does\n\n    in more words.\n    """\n    pawn.move()\n', 2),
        ('async def f():\n    """What f does."""\n    pawn.move()\n', 2),
        ('class C:\n    """What C is."""\n    x = 1\n', 2),  # a class's
        ('class C:\n    """What C is."""\n    def go(self):\n        """What go does."""\n        pass\n', 3),
        ('def f(): """What f does."""\n', 1),  # on the def's own line: the def still counts
        ('def f():\n    """Zoë\'s café, é."""\n    pass\n', 2),
        ('"""A note."""; pawn.move()\n', 1),
        ('def f():\n    """What f does."""\n    pass\n    pass\n', 3),
    ],
)
def test_a_docstring_counts_for_no_lines(code, lines):
    assert code_lines(code) == lines


@pytest.mark.parametrize(
    ("code", "lines"),
    [
        ("pawn.move()\n'a bare text'\n", 2),  # not the first statement
        ("def f():\n    pawn.move()\n    'a bare text'\n", 3),
        ("if x:\n    'a bare text'\n", 2),  # an `if` has no docstring
        ("for _ in x:\n    'a bare text'\n", 2),
        ("x = 'text'\n", 1),
        ("x = 1; 'text'\n", 2),  # squeezed beside a statement, it still counts as one of its own
        ("f'{x}'\npawn.move()\n", 2),  # an f-string isn't a docstring
        ("b'bytes'\npawn.move()\n", 2),
        ("def f():\n    '''One.'''\n    '''Two.'''\n", 2),  # only the first statement is the docstring
        ("def f():\n    x = 1\n    '''Two.'''\n", 3),
        ("'''One.'''\n'''Two.'''\n", 1),
    ],
)
def test_a_bare_text_anywhere_else_still_counts(code, lines):
    assert code_lines(code) == lines


def test_a_docstring_does_not_change_how_the_lines_around_it_are_counted():
    level = make_level(CORRIDOR, constraints={"max_lines": 3})
    result = run_level(level, 'def f():\n    """Doc."""\n    a = 1; b = 2\n    c = 3\n')
    assert result.summary == "This level allows at most 3 lines of code, and yours has 4. Two statements on one line count as two."
    assert code_lines('def f():\n    """Doc."""\n    if x: a()\n') == 3


def test_the_line_limit_does_not_count_a_docstring():
    code = 'def walk():\n    """Walk three squares\n    north.\n    """\n    pawn.move(3)\nwalk()\n'
    result = run_level(make_level(CORRIDOR, constraints={"max_lines": 3}), code)
    assert result.status == "solved" and result.code_lines == 3
    result = run_level(make_level(CORRIDOR, constraints={"max_lines": 2}), code)
    assert result.status == "constraint" and result.summary.startswith("This level allows at most 2 lines of code, and yours has 3.")


def test_par_follows_the_count():
    result = run_level(make_level(CORRIDOR, par={"lines": 3}), 'def walk():\n    """Walk north."""\n    pawn.move(3)\nwalk()\n')
    assert result.code_lines == 3
    assert next(star for star in result.stars if star.kind == "par").earned
