"""The plain-language translations of common beginner errors."""

import pytest

from conftest import make_level
from rankfile.pieces import Knight
from rankfile.runner import run_level, run_sandbox


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
        ("for step in range(1):\n    print(stpe)", "Python doesn't know the name `stpe`. Did you mean `step`?", 2),
        # wrong number or kind of arguments
        ("pawn.turn_left(2)", "`turn_left()` doesn't take anything inside its parentheses.", 1),
        ("pawn.move(1, 2)", "`move()` takes at most 1 value inside its parentheses, but got 2.", 1),
        ("pawn.move()()", "You used parentheses to call something that isn't a function", 1),
        ('print("steps: " + 3)', "You can only join text to text with +.", 1),
        ("x = 3 - 'a'", "Python can't use - between a whole number (an int) and text (a str).", 1),
        ("x = 3\nx()", "isn't a function: it's a whole number (an int). Is there an extra pair of parentheses?", 2),
        ("x = 1 / 0", "You divided by zero.", 1),
        ("def f():\n    f()\nf()", "A function kept calling itself and never stopped, so Python gave up.", 2),
        # loops (M3.3)
        ("for step in 3:\n    pawn.move()", "Python can't go through a whole number (an int) one item at a time", 1),
        ("for step in 3:\n    pawn.move()", "give the number to range(): for step in range(5):", 1),
        ("for step in range(7 / 2):\n    pawn.move()", "This needs a whole number (an int), but got a number with a decimal point (a float). If it came from dividing with /, use // instead", 1),
        ('for step in range("3"):\n    pawn.move()', "This needs a whole number (an int), but got text (a str). Numbers in quotes are text.", 1),
        # while loops (M3.5)
        ("break", "`break` only works inside a loop", 1),
        ("pawn.move()\ncontinue", "`continue` only works inside a loop", 2),
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


@pytest.mark.parametrize(
    ("code", "friendly", "line"),
    [
        # text (M3.6)
        ("pawn.move()\ntext = pawn.read()\nprint(text[7])", "That position is past the end of the text. Positions start at 0", 3),
        ("pawn.move()\ntext = pawn.read()\ntext[0] = 'S'", "Text can't be changed once it's made", 3),
        ("text = pawn.read()\nprint(text[0])", "There's no text here: the value is None. If it came from `read()`, your pawn isn't standing on a rune", 2),
        ("text = pawn.read()\nprint(len(text))", "There's no text here: the value is None. If it came from `read()`", 2),
        ("text = pawn.read()\nprint(text.upper())", "The value here is None, which has no `upper`. If it came from `read()`", 2),
        ("pawn.move()\nprint(int(pawn.read()))", 'only read text made of digits, like "42", and it was given \'north-3\'', 2),
        ("pawn.move()\nprint(pawn.read().upr())", "A str value doesn't have `upr`. Did you mean `upper`?", 2),
        ('print(3 + "4")', "turn it into text first with str(), or use an f-string.", 1),
    ],
)
def test_text_friendly_messages(rune_corridor, code, friendly, line):
    result = run_level(rune_corridor, code)
    assert result.status == "error"
    assert friendly in result.error.friendly
    assert result.error.line == line


@pytest.mark.parametrize(
    ("code", "friendly"),
    [
        ("pawn.jump()", "The pawn doesn't have an ability called `jump`. In this level it knows: move, turn_left."),
        ("pawn.wait()", "Your pawn hasn't learned `wait` yet. In this level it knows: move, turn_left."),
    ],
)
def test_lesson_snippets_say_in_this_level_like_levels(code, friendly):
    # One wording everywhere (QA-061): lesson snippets run on sandbox_level and read like any level.
    result = run_sandbox(code, ["move", "turn_left"])
    assert result.status == "error"
    assert friendly in result.error.friendly
    assert "Here it knows" not in result.error.friendly


def test_a_run_that_lost_its_tracer_says_so_without_a_line(corridor):
    caught = "def f():\n    f()\ntry:\n    f()\nexcept RecursionError:\n    pass\n"
    for code in (caught, "import sys\nsys.settrace(None)\n"):
        result = run_level(corridor, code)
        assert result.status == "error"
        assert result.error.friendly == (
            "The game lost track of this program partway through, so the run ends here. "
            "That happens when a function calls itself until Python stops it and the program carries on anyway. "
            "Give the function a way to stop calling itself."
        )
        assert result.error.line is None


def test_a_real_level_keeps_in_this_level(corridor):
    result = run_level(corridor, "pawn.wait()")
    assert "Your pawn hasn't learned `wait` yet. In this level it knows: move" in result.error.friendly


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


def test_an_endless_while_gets_a_hint(waiting_corridor):
    result = run_level(waiting_corridor, "steps = 0\nwhile steps < 3:\n    pawn.wait()", line_budget=500)
    assert result.status == "timeout"
    assert "never finished" in result.error.friendly
    assert "check that something inside the loop can make it False, or leave it with `break`" in result.error.friendly


def test_an_endless_for_loop_gets_no_while_hint(waiting_corridor):
    result = run_level(waiting_corridor, "for i in range(10**9):\n    pawn.wait()", line_budget=500)
    assert result.status == "timeout"
    assert "`while`" not in result.error.friendly


# -- a knight level reads in the knight's own words (M5.1) ---------------------------------


@pytest.fixture
def knight_runes():
    """Knight on a1, a rune on b2 (text "north-3"), the goal on c3, with every knight ability."""
    return make_level(
        ". . G\n. R .\nP . .\n",
        piece="knight",
        api=list(Knight.ABILITIES),
        legend={"R": {"tile": "rune", "text": "north-3"}},
    )


@pytest.mark.parametrize(
    ("code", "friendly", "line"),
    [
        ("knight.move()", "Knights don't walk: they jump. `knight.jump(1, 2)` jumps one square right and two up.", 1),
        ("knight.turn_left()", "Knights don't walk: they jump. A jump can go any way", 1),
        ("knight.jump(1, 1)", "jump(1, 1) isn't a jump a knight can make. A knight moves two squares one way and one the other", 1),
        ("jump(1, 2)", "`jump` is one of the knight's abilities, so it needs the knight's name in front of it: knight.jump()", 1),
        ("move()", "Knights don't walk: they jump. `knight.jump(1, 2)` jumps one square right and two up.", 1),
        ("knight.jumpp(1, 2)", "The knight doesn't know `jumpp`. Did you mean `jump`?", 1),
        ("knight.jump()", "`jump()` needs two numbers inside its parentheses: how many squares right, then how many up, like `knight.jump(1, 2)`.", 1),
        ("knight.jump(1)", "`jump()` needs two numbers inside its parentheses", 1),
        ("knight.look()", "`look()` needs two numbers inside its parentheses: how many squares right, then how many up, like `knight.look(1, 2)`.", 1),
        ("knight.jump(1, 2, 3)", "`jump()` takes 2 values inside its parentheses, but got 3.", 1),
    ],
)
def test_knight_friendly_messages(knight_runes, code, friendly, line):
    result = run_level(knight_runes, code)
    assert result.status == "error"
    assert friendly in result.error.friendly
    assert result.error.line == line


@pytest.fixture
def knight_vault():
    """Knight on a1, a brass key on a2, its door on c2, the goal on c3, with every knight ability."""
    return make_level(
        ". . G\nK . D\nP . .\n",
        piece="knight",
        api=list(Knight.ABILITIES),
        legend={"K": {"tile": "key", "name": "brass"}, "D": {"tile": "door", "key": "brass"}},
    )


@pytest.mark.parametrize(
    ("code", "friendly", "line"),
    [
        ("knight.pick_up()", "There is nothing to pick up on a1.", 1),
        ("knight.wait()\nknight.jump(2, 1)", "The door on c2 is locked: it wants the brass key, and your satchel is empty.", 2),
    ],
)
def test_the_satchels_errors_reach_the_card_in_the_worlds_words(knight_vault, code, friendly, line):
    result = run_level(knight_vault, code)
    assert result.status == "error"
    assert result.error.friendly == friendly
    assert result.error.line == line


def test_a_function_of_the_players_own_keeps_the_general_message(knight_runes):
    result = run_level(knight_runes, "def hop(dx, dy):\n    pass\nhop()")
    assert "`hop()` needs more inside its parentheses: a value for `dx` and `dy`." in result.error.friendly


@pytest.mark.parametrize(
    ("code", "friendly"),
    [
        ("text = knight.read()\nprint(text[0])", "There's no text here: the value is None. If it came from `read()`, your knight isn't standing on a rune: land on one first."),
        ("text = knight.read()\nprint(len(text))", "If it came from `read()`, your knight isn't standing on a rune: land on one first."),
        ("text = knight.read()\nprint(text.upper())", "The value here is None, which has no `upper`. If it came from `read()`, your knight isn't standing on a rune: land on one first."),
    ],
)
def test_reading_off_a_rune_names_the_knight_and_says_land(knight_runes, code, friendly):
    result = run_level(knight_runes, code)
    assert result.status == "error"
    assert friendly in result.error.friendly
    assert "pawn" not in result.error.friendly and "walk" not in result.error.friendly


def test_reading_off_a_rune_on_a_pawn_level_reads_as_before(rune_corridor):
    result = run_level(rune_corridor, "text = pawn.read()\nprint(text[0])")
    assert result.error.friendly == (
        "There's no text here: the value is None. If it came from `read()`, your pawn isn't standing on a rune: walk onto one first."
    )
    result = run_level(rune_corridor, "text = pawn.read()\nprint(text.upper())")
    assert result.error.friendly == (
        "The value here is None, which has no `upper`. If it came from `read()`, your pawn isn't standing on a rune: walk onto one first."
    )


def test_a_none_message_still_names_the_knight_after_the_player_reuses_its_name(knight_runes):
    result = run_level(knight_runes, "knight = 3\nvalue = None\nprint(value.upper())")
    assert "If it came from `read()`, your knight isn't standing on a rune: land on one first." in result.error.friendly
    assert "pawn" not in result.error.friendly


def test_a_pawn_level_does_not_know_the_knights_words(corridor):
    result = run_level(corridor, "jump(1, 2)")
    assert "Did you mean" not in result.error.friendly and "Knights" not in result.error.friendly
    assert "Python doesn't know the name `jump`" in result.error.friendly


# -- functions (M5.2) ---------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("code", "friendly", "line"),
    [
        # a name set in a function is local to all of it (criteria 1 and 2)
        (
            "x = 5\ndef bump():\n    x = x + 1\n    return x\nbump()",
            "`bump()` can read the `x` from outside, but a line in it sets `x`, and that makes a new `x` of the function's own, which has no value yet on this line. Hand the value in through the parentheses, and hand the new one back with `return`.",
            3,
        ),
        (
            "def bump():\n    total = total + 1\n    return total\nbump()",
            "`total` is used inside `bump()` before `bump()` gave it a value.",
            2,
        ),
        # a name that only lives inside a function (criterion 3)
        (
            "def add(a, b):\n    result = a + b\n    return result\nadd(1, 2)\nprint(result)",
            "`result` lives inside `add()`, and it is gone when the function ends. `return` is how a value gets out",
            5,
        ),
        (
            "def add(a, b):\n    return a + b\nprint(b)",
            "`b` is what `add()` calls the value handed in to it. Out here there is no `b`: give it a value on a line above this one",
            3,
        ),
        # a call above its def (criterion 4)
        ("walk()\ndef walk():\n    pawn.move()", "Python reads the program from the top, and `walk` isn't defined until its `def` has run. Move the function above the line that calls it", 1),
        (
            "def first():\n    second()\nfirst()\ndef second():\n    pawn.move()",
            "`second` isn't defined until its `def` has run. Move the function above the line that calls it",
            2,
        ),
        # a keyword the function has no parameter for (criterion 6)
        ("def add(a, b):\n    return a + b\nadd(a=1, c=2)", "`add()` has nothing called `c` to fill inside its parentheses. The names it takes are: a, b.", 3),
        ("def hello():\n    pass\nhello(name=1)", "`hello()` has nothing called `name` to fill inside its parentheses. It doesn't take anything inside its parentheses.", 3),
        ("pawn.move(steps=2)", "`move()` has nothing called `steps` to fill inside its parentheses. Give its values in order, without names.", 1),
        # return outside a function (criterion 7)
        ("return 3", "`return` only works inside a function, in the indented lines under a `def`. Out here it has nowhere to hand a value back to.", 1),
        ("pawn.move()\nreturn", "`return` only works inside a function", 2),
        # a None from a function with no return (criterion 5)
        (
            "def walk():\n    print(1)\nprint(walk() + 1)",
            "Python can't use + between None and a whole number (an int). `walk()` handed back nothing (None) because it has no `return`. `print` shows a value on the screen, but only `return` hands it back.",
            3,
        ),
        ("def walk():\n    pawn.move()\nwalk().upper()", "The value here is None, which has no `upper`. `walk()` handed back nothing (None) because it has no `return`.", 3),
        ("def walk():\n    return\nprint(len(walk()))", "`walk()` handed back nothing (None) because it has no `return` with a value.", 3),
        # the review's fixes (M5.2-2c)
        # 1: a parameter's name used where it doesn't exist is not a job for `return`
        (
            "def double(n):\n    return n * 2\nprint(double(n))",
            "`n` is what `double()` calls the value handed in to it. Out here there is no `n`: give it a value on a line above this one (for example `n = 3`), or hand one in through the parentheses of `double()`.",
            3,
        ),
        (
            "def walk(steps):\n    pawn.move(steps)\ndef turn_and_walk():\n    pawn.turn_right()\n    walk(steps)\nturn_and_walk()",
            "`steps` is what `walk()` calls the value handed in to it, so `turn_and_walk()` can't see it. There is no `steps` inside `turn_and_walk()`: give it a value there, or hand one in through the parentheses of `turn_and_walk()`.",
            5,
        ),
        (
            "steps = 3\ndef f(step):\n    return step\nprint(step)",
            "Python doesn't know the name `step`. Did you mean `steps`?",
            4,
        ),
        (
            "def make():\n    total = 3\n    return total\ndef use():\n    print(total)\nmake()\nuse()",
            "`total` lives inside `make()`, so `use()` can't see it. There is no `total` inside `use()`",
            5,
        ),
        # 7: a name the function declares global is left out of that branch
        (
            "def setup():\n    global count\n    count = 3\nprint(count)\nsetup()",
            "Python doesn't know the name `count`. A name has to be created",
            4,
        ),
        # 8: a typo of a parameter or a local
        (
            "def walk(count):\n    pawn.move(cout)\nwalk(2)",
            "Python doesn't know the name `cout`. Did you mean `count`?",
            2,
        ),
        # 4: a None handed to an ability
        (
            "def steps():\n    print(2)\npawn.move(steps())",
            "move() needs a number of squares, like pawn.move(3), not None. `steps()` handed back nothing (None) because it has no `return`.",
            3,
        ),
        # 3 and 6: the note after Python's own words
        (
            "def steps():\n    print(2)\nprint(steps() + 1)",
            "Python can't use + between None and a whole number (an int). `steps()` handed back nothing",
            3,
        ),
        # 5: keywords of built-ins
        ("print('a', ends='')", "`print()` has nothing called `ends` to fill inside its parentheses. Did you mean `end`?", 1),
        ("max([1, 2], keys=len)", "`max()` has nothing called `keys` to fill inside its parentheses. Did you mean `key`?", 1),
        ("'a b'.split(sep2=' ')", "`split()` has nothing called `sep2` to fill inside its parentheses. Did you mean `sep`?", 1),
        ("int('3', bas=10)", "`int()` has nothing called `bas` to fill inside its parentheses. Did you mean `base`?", 1),
        ("round(2.5, digits=1)", "`round()` has nothing called `digits` to fill inside its parentheses. Did you mean `ndigits`?", 1),
        ("sorted([2, 1], reversed=True)", "`sorted()` has nothing called `reversed` to fill inside its parentheses. Did you mean `reverse`?", 1),
    ],
)
def test_function_friendly_messages(corridor, code, friendly, line):
    result = run_level(corridor, code)
    assert result.status == "error"
    assert friendly in result.error.friendly
    assert result.error.line == line
    assert "``" not in result.error.friendly and "global" not in result.error.friendly


def test_a_none_that_is_not_from_a_function_of_the_players_keeps_the_read_words(rune_corridor):
    code = "def walk():\n    return 1\ntext = pawn.read()\nprint(walk(), text.upper())"
    result = run_level(rune_corridor, code)
    assert result.error.friendly == (
        "The value here is None, which has no `upper`. If it came from `read()`, your pawn isn't standing on a rune: walk onto one first."
    )
    assert "handed back nothing" not in run_level(rune_corridor, "def walk():\n    pass\ntext = pawn.read()\nprint(text[0])").error.friendly


def test_a_none_that_is_not_from_a_function_of_the_players_keeps_the_read_words_for_a_knight(knight_runes):
    code = "def hop():\n    knight.jump(1, 2)\ntext = knight.read()\nprint(len(text))"
    result = run_level(knight_runes, code)
    assert "If it came from `read()`, your knight isn't standing on a rune: land on one first." in result.error.friendly
    assert "handed back nothing" not in result.error.friendly


def test_a_function_that_returns_a_value_is_not_blamed_for_none(corridor):
    result = run_level(corridor, "def pick(a):\n    if a:\n        return a\nprint(pick(0).upper())")
    assert "no `return`" not in result.error.friendly


def test_a_call_that_is_a_whole_statement_is_not_blamed_for_none(rune_corridor):
    code = "def say(text):\n    print(text)\nsay(pawn.read().upper())"
    result = run_level(rune_corridor, code)
    assert "handed back nothing" not in result.error.friendly
    assert "If it came from `read()`, your pawn isn't standing on a rune" in result.error.friendly


def test_a_none_handed_to_a_knights_ability_names_the_function(knight_runes):
    result = run_level(knight_runes, "def f():\n    print(1)\nknight.jump(f(), 2)")
    assert "`f()` handed back nothing (None) because it has no `return`." in result.error.friendly
    assert result.error.line == 3


def test_the_none_note_follows_a_full_stop(corridor):
    result = run_level(corridor, "def steps():\n    print(2)\nprint(steps() + 1)")
    assert ". `steps()` handed back nothing" in result.error.friendly
    result = run_level(corridor, "def steps():\n    print(2)\nprint(steps() < 1)")  # Python's own words, not ours
    assert "instances of 'NoneType' and 'int'. `steps()` handed back nothing" in result.error.friendly


def test_the_in_order_words_are_for_a_pieces_ability_only(corridor):
    result = run_level(corridor, "print('a', ends='')")
    assert "in order" not in result.error.friendly
    assert "in order, without names" in run_level(corridor, "pawn.move(steps=2)").error.friendly


def test_return_outside_a_function_does_not_presume_a_def(corridor):
    result = run_level(corridor, "pawn.move()\nreturn")
    assert "Indent it so it sits under the `def`" not in result.error.friendly
    assert "in the indented lines under a `def`" in result.error.friendly


def test_a_keyword_the_knights_ability_does_not_have(knight_runes):
    result = run_level(knight_runes, "knight.jump(1, 2, steps=3)")
    assert "`jump()` has nothing called `steps` to fill inside its parentheses. Give its values in order, without names." in result.error.friendly
    assert "Knight." not in result.error.friendly
    assert result.error.line == 1


# -- None from a list method, and a call that wanted items (M5.3-E1) -------------------

_W1 = "`.{}()` changes the list itself and hands back nothing (None). Call it on a line of its own, and keep using the list's own name."


@pytest.mark.parametrize(
    "code, method",
    [
        ("a = [3, 1]\nb = a.sort()\nb[0]", "sort"),
        ("a = [1]\na = a.append(2)\na.append(4)", "append"),
        ("a = [3, 1]\nfor x in a.sort():\n    print(x)", "sort"),
        ("a = [1]\nb = a.append(2)\nlen(b)", "append"),
        ("a = [3, 1]\nprint(a.sort()[0])", "sort"),
    ],
)
def test_a_none_from_a_list_method_names_the_method(corridor, code, method):
    friendly = run_level(corridor, code).error.friendly
    assert friendly.endswith(_W1.format(method))
    assert "rune" not in friendly and "read()" not in friendly and "range()" not in friendly


@pytest.mark.parametrize(
    "code, friendly",
    [
        ("list(5)", "`list()` makes a list out of something that has items in it, like text or a tuple. A whole number (an int) has none."),
        ("tuple(5)", "`tuple()` makes a tuple out of something that has items in it, like text or a tuple. A whole number (an int) has none."),
        ("sorted(5)", "`sorted()` needs something that has items in it, like a list, a tuple or text. A whole number (an int) has none."),
        ("min(5)", "`min()` needs something that has items in it, like a list, a tuple or text. A whole number (an int) has none."),
        ("max(5)", "`max()` needs something that has items in it, like a list, a tuple or text. A whole number (an int) has none."),
        ("sum(5)", "`sum()` needs something that has items in it, like a list, a tuple or text. A whole number (an int) has none."),
    ],
)
def test_a_call_given_something_without_items_says_so(corridor, code, friendly):
    assert run_level(corridor, code).error.friendly == friendly


def test_a_for_loop_over_a_number_keeps_the_range_words(corridor):
    friendly = run_level(corridor, "for x in 5:\n    pass").error.friendly
    assert friendly == (
        "Python can't go through a whole number (an int) one item at a time, "
        "the way a for loop needs. To repeat something a number of times, give the number to range(): "
        "for step in range(5):"
    )
    assert run_level(corridor, "for x in list(5):\n    pass").error.friendly == friendly


def test_a_none_from_read_keeps_the_rune_words_next_to_a_list_method(rune_corridor):
    friendly = run_level(rune_corridor, "a = [1]\na.append(2)\ntext = pawn.read()\nprint(text[0])").error.friendly
    assert "If it came from `read()`, your pawn isn't standing on a rune" in friendly
    assert "hands back nothing" not in friendly


# -- the mistakes lists and tuples bring (M5.3-E2) --------------------------------------------

_PAST_END = "That {} has 3 items, so the last one is at `[2]`: places count from 0. There is nothing at `[{}]`."
_PAST_END_ANY = "That place is past the end of the {}. Places count from 0, so a {} with 4 items ends at `[3]`; a negative place counts back from the end, and -1 is the last one."


@pytest.mark.parametrize(
    "code, friendly",
    [
        ("a = [5, 6, 7]\nprint(a[3])", _PAST_END.format("list", 3)),
        ("a = (5, 6, 7)\nprint(a[3])", _PAST_END.format("tuple", 3)),
        ("a = [5, 6, 7]\ni = 2\nprint(a[i + 3])", _PAST_END.format("list", 5)),
        ("a = [5, 6, 7]\na[3] = 1", _PAST_END.format("list", 3)),
        ("grid = [[1, 2, 3], [4]]\nprint(grid[0][3])", _PAST_END.format("list", 3)),
        ("a = [5, 6, 7]\nprint(a[-4])", "That list has 3 items, so its places run from `[0]` to `[2]`, and back from the end from `[-1]` to `[-3]`. There is nothing at `[-4]`."),
        ("a = [5]\nprint(a[-2])", "That list has 1 item, so its only place is `[0]` (or `[-1]`, counting back from the end). There is nothing at `[-2]`."),
        ("a = []\nprint(a[0])", "That list is empty, so there is nothing at `[0]`."),
        ("def f(items):\n    return items[3]\nf([5, 6, 7])", _PAST_END.format("list", 3)),
        # not readable from the line: the sentence stands without the numbers
        ("def f():\n    return [1, 2]\nprint(f()[5])", _PAST_END_ANY.format("list", "list")),
        ("a = (5, 6)\nb = (1,)\nprint(a[7], b[7])", _PAST_END_ANY.format("tuple", "tuple")),
    ],
)
def test_a_place_past_the_end_of_a_list_or_tuple(corridor, code, friendly):
    assert run_level(corridor, code).error.friendly == friendly


def test_text_keeps_its_words_for_a_place_past_the_end(corridor):
    friendly = run_level(corridor, "t = 'abc'\nprint(t[5])").error.friendly
    assert friendly.startswith("That position is past the end of the text.")
    assert run_level(corridor, "'abc'.index('z')").error.friendly == "Python stopped with a ValueError: substring not found"


_UNPACK = "Unpacking needs exactly one name for each value."


@pytest.mark.parametrize(
    "code, friendly",
    [
        ("x, y = [1, 2, 3]", f"There are 2 names on the left of the `=` and 3 values on the right. {_UNPACK}"),
        ("x, y, z = (1, 2)", f"There are 3 names on the left of the `=` and 2 values on the right. {_UNPACK}"),
        ("x, = [1, 2]", f"There are 1 name on the left of the `=` and 2 values on the right. {_UNPACK}"),
        ("for x, y in [(1, 2, 3)]:\n    pass", f"There are 2 names after the `for` and 3 values in the item it was given. {_UNPACK}"),
        ("x, y = iter([1, 2, 3])", f"There are 2 names on the left of the `=` and more values than that on the right. {_UNPACK}"),
        ("x, y = 1, 2; a, b = [1]", f"There are 2 names on the left and 1 value on the right. {_UNPACK}"),
    ],
)
def test_unpacking_the_wrong_number_of_values(corridor, code, friendly):
    assert run_level(corridor, code).error.friendly == friendly


@pytest.mark.parametrize(
    "code, friendly",
    [
        ("x, y = 5", "5 is a whole number (an int): there is nothing inside it to hand out to `x` and `y`. Unpacking needs a tuple or a list."),
        ("n = 2.5\nx, y, z = n", "2.5 is a number with a decimal point (a float): there is nothing inside it to hand out to `x`, `y` and `z`. Unpacking needs a tuple or a list."),
        ("def f():\n    return 5\nx, y = f()", "The value on the right is a whole number (an int): there is nothing inside it to hand out to `x` and `y`. Unpacking needs a tuple or a list."),
        ("a = [0, 0]\na[0], y = 5", "5 is a whole number (an int): there is nothing inside it to hand out to the names on the left. Unpacking needs a tuple or a list."),
        ("x, y = None", "The value on the right is None: there is nothing inside it to hand out to `x` and `y`. Unpacking needs a tuple or a list."),
        ("for x, y in [1, 2]:\n    pass", "Each item it goes through is a whole number (an int): there is nothing inside it to hand out to `x` and `y`. Unpacking needs a tuple or a list."),
    ],
)
def test_unpacking_something_that_is_not_a_row_of_values(corridor, code, friendly):
    assert run_level(corridor, code).error.friendly == friendly


def test_changing_a_tuples_item(corridor):
    friendly = run_level(corridor, "t = (1, 2)\nt[0] = 5").error.friendly
    assert friendly == "A tuple can't be changed once it is made. Build a new one, or use a list if the values have to change."
    assert run_level(corridor, "t = 'ab'\nt[0] = 'c'").error.friendly.startswith("Text can't be changed once it's made")


_NO_ORDER = "Python can't put text and numbers in one order: it has no rule for {}."


@pytest.mark.parametrize(
    "code, rule",
    [
        ("a = [3, 'a', 1]\nprint(sorted(a))", "whether 'a' comes before 3"),
        ("a = [3, 'a', 1]\na.sort()", "whether 'a' comes before 3"),
        ("a = (2.5, 'b')\nprint(max(a))", "whether 'b' comes before 2.5"),
        ("a = ['b', 7]\nprint(min(a))", "whether 7 comes before 'b'"),
        ("print(max(3, 'a'))", "whether 'a' comes before 3"),
        ("print(sorted(2 * [1] + ['x']))", "which of them comes first"),
        ("a = [1, 'a']\nb = [2, 'b']\nprint(sorted(a), sorted(b))", "which of them comes first"),
        ("print(sorted([4, 'z']))", "whether 'z' comes before 4"),
        ("def f():\n    return [1, 'a']\nprint(sorted(f()))", "which of them comes first"),
        ("a = [1, 'a']\nb = [2, 'b']\nprint(sorted(a) + sorted(b))", "which of them comes first"),
    ],
)
def test_putting_text_and_numbers_in_order(corridor, code, rule):
    assert run_level(corridor, code).error.friendly == _NO_ORDER.format(rule)


def test_other_kinds_with_no_order_between_them(corridor):
    friendly = run_level(corridor, "print([1] < 3)").error.friendly
    assert friendly == "Python stopped with a TypeError: '<' not supported between instances of 'list' and 'int'"


@pytest.mark.parametrize(
    "code, kind",
    [
        ("a = [1]\na.remove(2)", "list"),
        ("a = [1]\nprint(a.index(2))", "list"),
        ("a = (1,)\nprint(a.index(2))", "tuple"),
    ],
)
def test_remove_or_index_of_something_that_is_not_there(corridor, code, kind):
    assert run_level(corridor, code).error.friendly == f"That value isn't in the {kind}. Ask first with `in`."


@pytest.mark.parametrize(
    "code, friendly",
    [
        ("a = []\nprint(max(a))", "`max()` was handed an empty list, so there is no largest item to hand back."),
        ("a = []\nprint(min(a))", "`min()` was handed an empty list, so there is no smallest item to hand back."),
        ("print(min(()))", "`min()` was handed an empty tuple, so there is no smallest item to hand back."),
        ("print(max(''))", "`max()` was handed empty text, so there is no largest item to hand back."),
        ("print(max([]), max([]))", "`max()` was handed an empty list, so there is no largest item to hand back."),
        ("print(max(x for x in []))", "`max()` was handed something with no items in it, so there is no largest item to hand back."),
        ("def f():\n    return []\nprint(max(f()))", "`max()` was handed something with no items in it, so there is no largest item to hand back."),
    ],
)
def test_the_largest_or_smallest_of_nothing(corridor, code, friendly):
    assert run_level(corridor, code).error.friendly == friendly


@pytest.mark.parametrize(
    "code, friendly",
    [
        ("a = [1, 2]\nprint(a[1.0])", "A place in a list is a whole number, like `[0]`. 1.0 is a number with a decimal point (a float)."),
        ("a = (1, 2)\nprint(a['1'])", "A place in a tuple is a whole number, like `[0]`. '1' is text (a str)."),
        ("a = [1, 2]\nplace = 3 / 2\nprint(a[place])", "A place in a list is a whole number, like `[0]`. 1.5 is a number with a decimal point (a float)."),
        ("def f():\n    return [1, 2]\nprint(f()[1.0])", "A place in a list is a whole number, like `[0]`. That place is a number with a decimal point (a float)."),
        ("a = [1, 2]\nprint(a[0.5], a[1.5])", "A place in a list is a whole number, like `[0]`. That place is a number with a decimal point (a float)."),
    ],
)
def test_a_place_that_is_not_a_whole_number(corridor, code, friendly):
    assert run_level(corridor, code).error.friendly == friendly


def test_text_keeps_its_words_for_a_place_that_is_not_a_whole_number(corridor):
    friendly = run_level(corridor, "t = 'abc'\nprint(t[1.0])").error.friendly
    assert friendly == "Python stopped with a TypeError: string indices must be integers, not 'float'"
