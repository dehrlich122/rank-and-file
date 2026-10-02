"""The Codex (docs/Codex.md): its entries, a level's list, help(), and Scratch Python's stand-in piece."""

import builtins

import pytest

from rankfile import codex
from rankfile.pieces import PIECES, Pawn
from rankfile.repl import Repl
from rankfile.runner import run_sandbox

FENCE = "```"


def level(level_id: str, api: list[str], *snippets: str) -> dict:
    """A level as the UI sends it: its file's data and its lesson's Markdown."""
    data = {"id": level_id, "chapter": 1, "title": level_id, "trains": "t", "lesson": "l.md", "api": api, "map": "P . G"}
    return {"id": level_id, "data": data, "lesson": "".join(f"{FENCE}python run\n{code}\n{FENCE}\n" for code in snippets)}


CHAPTERS = [
    {"curriculum": True, "levels": [level("c1", ["move"], "pawn.move()"), level("c2", ["move", "turn_left"], "print(1)", "this is not Python")]},
    {"curriculum": False, "levels": [level("t1", ["move", "wait"], "for i in range(2):\n    print(i)"), level("t2", ["move"])]},
    {"curriculum": True, "levels": [level("d1", ["move", "turn_left", "turn_right"])]},
]


def test_a_google_style_docstring_is_split_into_its_parts():
    parsed = codex.parse_docstring(
        """Do a thing.

        More about it, over
        two lines.

        Args:
            first: the first one,
                which goes on.
            second: the second.

        Returns:
            Nothing
            at all.

        Example:
            for i in range(2):
                pawn.move()
        """
    )
    assert parsed["paragraphs"] == ["Do a thing.", "More about it, over two lines."]
    assert parsed["args"] == [{"name": "first", "about": "the first one, which goes on."}, {"name": "second", "about": "the second."}]
    assert parsed["returns"] == "Nothing at all."
    assert parsed["example"] == "for i in range(2):\n    pawn.move()"


@pytest.mark.parametrize("piece", PIECES.values(), ids=list(PIECES))
def test_every_ability_has_a_full_entry(piece):
    for name in piece.ABILITIES:
        entry = codex.ability_entry(piece, name)
        assert entry.paragraphs and entry.returns and entry.example, f"{piece.NAME}.{name}'s docstring needs a summary, Returns and Example"


def test_how_to_call_an_ability_comes_from_its_signature():
    assert codex.ability_entry(Pawn, "move").calls == ["pawn.move(squares=1)"]
    assert codex.ability_entry(Pawn, "turn_left").calls == ["pawn.turn_left()"]
    position = codex.ability_entry(Pawn, "position")
    assert (position.calls, position.kind) == (["pawn.position"], "property")  # no parentheses


@pytest.mark.parametrize("name", codex.PYTHON)
def test_every_documented_builtin_and_method_is_real_and_has_a_full_entry(name):
    entry = codex.python_entry(name)
    if name in codex.BUILTINS:
        assert hasattr(builtins, name) and entry.kind == "builtin"
    else:
        assert hasattr(str, name.removeprefix("str.")) and entry.kind == "method"
    assert entry.calls and entry.paragraphs and entry.returns and entry.example
    assert bool(entry.args) == ("()" not in entry.calls[0]), f"{name}: its entry lists arguments exactly when it takes some"


def test_taught_so_far_is_the_curriculum_before_a_level_then_its_own_chapter_up_to_it():
    def ids(level_id: str) -> list[str]:
        return [item["id"] for item in codex.history(level_id, CHAPTERS)]

    assert ids("c2") == ["c1", "c2"]
    assert ids("t2") == ["c1", "c2", "t1", "t2"]  # a chapter outside the curriculum counts the curriculum before it
    assert ids("d1") == ["c1", "c2", "d1"]  # ...but never counts towards a curriculum chapter
    assert ids("nowhere") == []


def test_a_levels_codex_is_its_abilities_then_the_builtins_taught_so_far():
    entries = codex.entries("t1", CHAPTERS)
    assert [entry.name for entry in entries] == ["pawn.move", "pawn.wait", "print", "range"]
    introduced = {entry.name: (entry.introduced, entry.new) for entry in entries}
    assert introduced["pawn.move"] == ("c1", False)
    assert introduced["print"] == ("c2", False)  # the snippet that isn't Python is skipped
    assert introduced["pawn.wait"] == ("t1", True)
    assert introduced["range"] == ("t1", True)


def test_only_this_levels_abilities_are_listed():
    # An ability unlocked earlier but locked here can't be used, so it isn't listed.
    assert [entry.name for entry in codex.entries("t2", CHAPTERS)] == ["pawn.move", "print", "range"]  # the built-ins still work


def test_a_lessons_built_ins_are_found_with_ast():
    assert codex.python_called("for i in range(2):\n    print(abs(i))\nx = print") == {"range", "print", "abs"}
    assert codex.python_called("this is not Python") == set()
    lesson = f"{FENCE}python run\nprint(abs(-2))\n{FENCE}\n\n{FENCE}python\nrange(3)\n{FENCE}\n"
    assert codex.taught(lesson) == {"print"}  # only documented built-ins, and only in runnable snippets


def test_a_lessons_text_methods_are_found_with_ast():
    code = "text = pawn.read()\nprint(text.upper().replace('a', 'b'), pawn.move(), text.nonsense())"
    assert codex.python_called(code) == {"print", "str.upper", "str.replace"}  # not the pawn's, and not made-up ones
    lesson = f"{FENCE}python run\nprint('x'.strip(), len('x'))\n{FENCE}\n"
    assert codex.taught(lesson) == {"print", "len", "str.strip"}


def test_a_levels_codex_lists_text_methods_after_the_builtins_once_taught():
    chapters = [{"curriculum": True, "levels": [level("r1", ["move"], "print(int('4'.strip()))")]}]
    entries = codex.entries("r1", chapters)
    assert [(entry.name, entry.kind) for entry in entries] == [("pawn.move", "ability"), ("print", "builtin"), ("int", "builtin"), ("str.strip", "method")]


def test_help_shows_a_text_method_however_it_is_asked_for():
    output = run_sandbox("help('abc'.upper)\nhelp(str.lower)\nhelp('str.split')", ["move"]).output
    for heading in ("Help on str.upper:", "text.upper()", "Help on str.lower:", "Help on str.split:"):
        assert heading in output


def test_help_shows_an_entry_in_player_code():
    result = run_sandbox("help(pawn.move)\nhelp(print)\nhelp('pawn.turn_left')", ["move", "turn_left"])
    assert result.status == "finished"
    for heading in ("Help on pawn.move:", "pawn.move(squares=1)", "Help on print:", "Help on pawn.turn_left:"):
        assert heading in result.output
    assert "rankfile" not in result.output  # no engine internals


def test_help_is_a_builtin_not_one_of_the_players_variables():
    names = {var["name"] for step in run_sandbox("x = 1", ["move"]).steps for var in step["vars"]}
    assert "x" in names and "help" not in names  # the Variables panel stays the player's own


def test_help_on_the_piece_lists_what_it_knows_here():
    output = run_sandbox("help(pawn)", ["move", "wait", "turn_left"]).output
    listed = [line.strip() for line in output.splitlines() if line.startswith("    pawn.")]
    assert listed == ["pawn.move(squares=1)", "pawn.turn_left()", "pawn.wait(ticks=1)"]  # the pawn's own order


def test_help_on_a_locked_ability_says_it_isnt_learned_yet():
    result = run_sandbox("help(pawn.wait)", ["move"])
    assert result.status == "error" and "hasn't learned `wait` yet" in result.error.friendly


def test_help_on_a_plain_value_or_unknown_text_says_so_briefly():
    # help(pawn.position) gets the position itself, and help(pawn.facing) gets "north".
    output = run_sandbox("help(pawn.position)\nhelp(pawn.facing)", ["move", "position", "facing"]).output
    assert "is a value (a tuple)" in output and "There's no help on 'north'" in output
    assert len(output.splitlines()) < 8  # not Python's whole page on tuples


def test_help_with_nothing_explains_itself():
    assert "help(pawn.move)" in run_sandbox("help()", ["move"]).output


def test_help_falls_back_to_pythons_own_for_everything_else():
    output = run_sandbox('def zigzag():\n    """Zig, then zag."""\n\nhelp(zigzag)', ["move"]).output
    assert "zigzag()" in output and "Zig, then zag." in output


def test_scratch_python_has_a_stand_in_piece():
    repl = Repl()

    def push(line: str) -> dict:
        return repl.push(line, "pawn", ["move", "turn_left", "position"])

    assert "no board" in push("pawn")["output"]
    assert push("dir(pawn)")["output"].strip() == "['move', 'position', 'turn_left']"
    assert "Help on pawn.move:" in push("help(pawn.move)")["output"]
    moved = push("pawn.move()")
    assert "Scratch Python has no board" in moved["error"]["friendly"]
    assert "Scratch Python has no board" in push("pawn.position")["error"]["friendly"]


def test_the_stand_in_follows_the_level_and_survives_a_reset():
    repl = Repl()
    repl.push("x = 1", "pawn", ["move"])
    assert repl.push("dir(pawn)", "pawn", ["move", "wait"])["output"].strip() == "['move', 'wait']"
    repl.reset()
    assert repl.push("dir(pawn)", "pawn", ["move"])["output"].strip() == "['move']"
    assert "Help on print:" in repl.push("help(print)")["output"]
