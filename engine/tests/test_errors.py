"""The plain-language translations of common beginner errors."""

import pytest

from rankfile.runner import run_level


@pytest.mark.parametrize(
    ("code", "friendly", "line"),
    [
        # typos in names and abilities
        ("pwan.move()", "Python doesn't know the name `pwan`. Did you mean `pawn`?", 1),
        ("pawn.mvoe()", "The pawn doesn't know `mvoe`. Did you mean `move`?", 1),
        ("pawn.turnleft()", "The pawn doesn't know `turnleft`. Did you mean `turn_left`?", 1),
        ("pawn.jump()", "The pawn doesn't have an ability called `jump`. In this level it knows: move, turn_left, turn_right.", 1),
        ("move()", "`move` is one of the pawn's abilities, so it needs the pawn's name in front of it: pawn.move()", 1),
        ("pawn.move()\nPrint('hi')", "Python doesn't know the name `Print`. Did you mean `print`?", 2),
        ("x = true", "Python doesn't know the name `true`. Did you mean `True`?", 1),
        ("print(hello)", 'If you meant it as text, put it in quotes: "hello".', 1),
        # wrong number or kind of arguments
        ("pawn.turn_left(2)", "`turn_left()` doesn't take anything inside its parentheses.", 1),
        ("pawn.move(1, 2)", "`move()` takes at most 1 value inside its parentheses, but got 2.", 1),
        ("pawn.move()()", "You used parentheses to call something that isn't a function", 1),
        ('print("steps: " + 3)', "You can only join text to text with +.", 1),
        ("x = 1 / 0", "You divided by zero.", 1),
        # syntax errors
        ('pawn.move(\nprint("hi")', "The bracket ( opened on this line is never closed. Add the matching ).", 1),
        ('print("hi)', "This text is missing its closing quote mark.", 1),
        ("pawn.move())", "This line has a closing bracket without a matching opening one.", 1),
        ("    pawn.move()", "This line starts with spaces", 1),
        ('print "hi"', 'print needs parentheses around what it should use, like print("hello").', 1),
        ("pawn move()", "Python couldn't understand this line.", 1),
    ],
)
def test_friendly_messages(corridor, code, friendly, line):
    result = run_level(corridor, code)
    assert result.status == "error"
    assert friendly in result.error.friendly
    assert result.error.line == line


def test_real_traceback_is_kept_and_trimmed(corridor):
    result = run_level(corridor, "pawn.move()\npawn.mvoe()")
    traceback = result.error.traceback
    assert 'File "<player>", line 2, in <module>' in traceback
    assert "pawn.mvoe()" in traceback
    assert "AttributeError" in traceback
    assert "pieces.py" not in traceback and "runner.py" not in traceback


def test_game_errors_raised_inside_the_engine_still_point_at_the_players_line(corridor):
    result = run_level(corridor, "pawn.move()\npawn.move()\npawn.move(5)")
    assert result.error.line == 3
    assert result.error.traceback.count('File "<player>"') == 1


def test_game_errors_read_like_builtin_errors_in_tracebacks(corridor):
    result = run_level(corridor, "pawn.turn_right()\npawn.move()")
    assert result.error.traceback.rstrip().splitlines()[-1] == "BlockedError: Your pawn bumped into a wall on c1."
