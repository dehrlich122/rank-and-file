"""The Codex (docs/Codex.md): its entries, a level's list, help(), and Scratch Python's stand-in piece."""

import builtins

import pytest

from rankfile import codex
from rankfile.pieces import PIECES, Pawn
from rankfile.repl import Repl
from rankfile.runner import run_sandbox

HISTORY = [
    {"label": "1.1 First Steps", "api": ["move"], "snippets": ["pawn.move()"]},
    {"label": "1.2 Turning", "api": ["move", "turn_left"], "snippets": ["print(1)", "this is not Python"]},
    {"label": "Practice: Loops", "api": ["move", "turn_left", "wait"], "snippets": ["for i in range(2):\n    print(i)"]},
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
    assert parsed["summary"] == "Do a thing.\n\nMore about it, over two lines."
    assert parsed["args"] == [{"name": "first", "about": "the first one, which goes on."}, {"name": "second", "about": "the second."}]
    assert parsed["returns"] == "Nothing at all."
    assert parsed["example"] == "for i in range(2):\n    pawn.move()"


@pytest.mark.parametrize("piece", PIECES.values(), ids=list(PIECES))
def test_every_ability_has_a_full_entry(piece):
    for name in piece.ABILITIES:
        entry = codex.ability_entry(piece, name)
        assert entry.summary and entry.returns and entry.example, f"{piece.NAME}.{name}'s docstring needs a summary, Returns and Example"


def test_how_to_call_an_ability_comes_from_its_signature():
    assert codex.ability_entry(Pawn, "move").call == "pawn.move(squares=1)"
    assert codex.ability_entry(Pawn, "turn_left").call == "pawn.turn_left()"
    position = codex.ability_entry(Pawn, "position")
    assert (position.call, position.kind) == ("pawn.position", "property")  # no parentheses


@pytest.mark.parametrize("name", codex.BUILTINS)
def test_every_documented_builtin_is_real_and_has_a_full_entry(name):
    assert hasattr(builtins, name)
    entry = codex.builtin_entry(name)
    assert entry.summary and entry.args and entry.returns and entry.example


def test_a_levels_codex_is_its_abilities_then_the_builtins_taught_so_far():
    entries = codex.entries("pawn", ["move", "turn_left", "wait"], HISTORY)
    assert [entry.name for entry in entries] == ["pawn.move", "pawn.turn_left", "pawn.wait", "print", "range"]
    introduced = {entry.name: (entry.introduced, entry.new) for entry in entries}
    assert introduced["pawn.move"] == ("1.1 First Steps", False)
    assert introduced["print"] == ("1.2 Turning", False)  # the snippet that isn't Python is skipped
    assert introduced["pawn.wait"] == ("Practice: Loops", True)
    assert introduced["range"] == ("Practice: Loops", True)


def test_only_this_levels_abilities_are_listed():
    # An ability unlocked earlier but locked here can't be used, so it isn't listed.
    names = [entry.name for entry in codex.entries("pawn", ["move"], HISTORY)]
    assert "pawn.turn_left" not in names and "pawn.wait" not in names


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
    assert listed == ["pawn.move(squares=1)", "pawn.turn_left()", "pawn.wait()"]  # the pawn's own order


def test_help_on_a_locked_ability_says_it_isnt_learned_yet():
    result = run_sandbox("help(pawn.wait)", ["move"])
    assert result.status == "error" and "hasn't learned `wait` yet" in result.error.friendly


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
