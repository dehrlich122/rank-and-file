"""The Codex (docs/Codex.md): its entries, a level's list, help(), and Scratch Python's stand-in piece."""

import ast
import builtins
import types
from dataclasses import replace

import pytest

from rankfile import codex
from rankfile.levels import Examine, ExamineCall, parse_level
from rankfile.pieces import PIECES, Knight, Pawn
from rankfile.repl import Repl
from rankfile.runner import run_level, run_sandbox, run_snippet
from rankfile.tracer import snapshot_vars

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
        kind, _, method = name.partition(".")
        assert hasattr({"str": str, "list": list}[kind], method) and entry.kind == "method"
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
    assert [entry.name for entry in entries] == ["pawn.move", "pawn.wait", "print", "range", "for", "whole number"]  # a keyword the lesson uses, then a kind of value (M5.2-7, M5.3)
    introduced = {entry.name: (entry.introduced, entry.new) for entry in entries}
    assert introduced["pawn.move"] == ("c1", False)
    assert introduced["print"] == ("c2", False)  # the snippet that isn't Python is skipped
    assert introduced["pawn.wait"] == ("t1", True)
    assert introduced["range"] == ("t1", True)


def test_only_this_levels_abilities_are_listed():
    # An ability unlocked earlier but locked here can't be used, so it isn't listed.
    assert [entry.name for entry in codex.entries("t2", CHAPTERS)] == ["pawn.move", "print", "range", "for", "whole number"]  # the built-ins, keywords and kinds of value still work


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
    assert [(entry.name, entry.kind) for entry in entries] == [("pawn.move", "ability"), ("print", "builtin"), ("int", "builtin"), ("str.strip", "method"), ("text", "value")]


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


def test_help_shows_nothing_internal_when_printed_or_asked_for_its_doc():
    for api, piece in ((["move"], "pawn"), (KNIGHT_API, "knight")):
        output = run_sandbox("print(help)\nprint(help.__doc__)", api, piece).output
        assert "help" in output and "Show what something does" in output
        for internal in ("player_namespace", "<locals>", "level_help", "rankfile"):
            assert internal not in output


def test_help_with_one_thing_too_many_gets_the_friendly_answer_on_either_piece():
    for api, piece in ((["move"], "pawn"), (KNIGHT_API, "knight")):
        result = run_sandbox("help(print, len)", api, piece)
        assert result.status == "error"
        assert result.error.friendly == "`help()` takes at most 1 value inside its parentheses, but got 2."


def test_the_piece_record_is_not_one_of_the_players_variables():
    for api, piece in ((["move"], "pawn"), (KNIGHT_API, "knight")):
        names = {var["name"] for step in run_sandbox("x = 1", api, piece).steps for var in step["vars"]}
        assert "x" in names and not any(name.startswith("__") for name in names)
    repl = Repl()
    repl.push("x = 1", "knight", KNIGHT_API)
    shown = {var["name"] for var in snapshot_vars(types.SimpleNamespace(f_locals=repl.namespace))}
    assert "x" in shown and "knight" in shown and not any(name.startswith("__") for name in shown)


def test_help_on_the_piece_lists_what_it_knows_here():
    output = run_sandbox("help(pawn)", ["move", "wait", "turn_left"]).output
    listed = [line.strip() for line in output.splitlines() if line.startswith("    pawn.")]
    assert listed == ["pawn.move(squares=1)", "pawn.turn_left()", "pawn.wait(ticks=1)"]  # the pawn's own order


def test_help_on_the_piece_says_in_this_level_in_a_snippet_and_in_a_level(corridor):
    assert "your piece. In this level it knows:" in run_sandbox("help(pawn)", ["move"]).output
    assert "your piece. In this level it knows:" in run_level(corridor, "help(pawn)").output


def test_help_on_a_locked_ability_says_it_isnt_learned_yet():
    result = run_sandbox("help(pawn.wait)", ["move"])
    assert result.status == "error" and "hasn't learned `wait` yet" in result.error.friendly


def test_help_on_a_plain_value_or_unknown_text_says_so_briefly():
    # help(pawn.position) gets the position itself, and help(pawn.facing) gets "north".
    output = run_sandbox("help(2.5)\nhelp(pawn.facing)", ["move", "position", "facing"]).output
    assert "2.5 is a value (a float)" in output and "There's no help on 'north'" in output
    assert len(output.splitlines()) < 8  # not Python's whole page on floats


def test_help_with_nothing_explains_itself():
    assert "help(pawn.move)" in run_sandbox("help()", ["move"]).output


PAWN_INTRO = """help(something) shows what it does and how to use it. For example:

    help(print)
    help(pawn.move)
    help(pawn)          everything your pawn knows in this level

The Codex tab lists everything you've learned so far."""

KNIGHT_API = list(Knight.ABILITIES)


def knight_says(code: str) -> str:
    """What a knight level prints for `code` (a run on a knight's sandbox board)."""
    result = run_sandbox(code, KNIGHT_API, "knight")
    assert result.status == "finished", result.error
    return result.output


def test_help_on_help_shows_its_own_entry_however_it_is_asked_for():
    expected = codex.format_entry(codex.python_entry("help")) + "\n\n"
    for code in ("help(help)", 'help("help")'):
        assert run_sandbox(code, ["move"]).output == expected
        assert knight_says(code) == expected
    assert run_snippet("help(help)").output == expected
    assert expected.startswith("Help on help:") and "help(thing) or help()" in expected


def test_help_is_the_last_of_the_first_builtins_taught_and_a_full_builtin_entry():
    entry = codex.python_entry("help")
    assert list(codex.BUILTINS)[-5] == "help"  # chapter 8's four (M5.3) come after it
    assert entry.kind == "builtin" and entry.calls[0] == "help(thing)"


def test_chapter_eights_five_entries_are_the_last_of_their_kind_in_order():
    assert list(codex.BUILTINS)[-4:] == ["sorted", "min", "max", "sum"]
    assert list(codex.METHODS)[-1] == "list.append"
    kinds = {name: codex.python_entry(name).kind for name in ("sorted", "min", "max", "sum", "list.append")}
    assert kinds == {"sorted": "builtin", "min": "builtin", "max": "builtin", "sum": "builtin", "list.append": "method"}


def test_the_new_builtins_and_list_append_are_found_with_ast():
    code = "keys = []\nkeys.append(1)\nprint(sorted(keys), min(keys), max(keys), sum(keys), 'x'.upper())"
    assert codex.python_called(code) == {"print", "sorted", "min", "max", "sum", "list.append", "str.upper"}


def test_help_shows_the_new_entries_however_they_are_asked_for():
    for code, name in (("help(sorted)", "sorted"), ("help(min)", "min"), ("help(max)", "max"), ("help(sum)", "sum"), ("help([].append)", "list.append")):
        assert run_sandbox(code, ["move"]).output == codex.format_entry(codex.python_entry(name)) + "\n\n"


def test_a_lesson_that_calls_help_brings_its_entry_in_on_its_level_and_not_before():
    chapters = [{"curriculum": True, "levels": [level("h1", ["move"], "print(1)"), level("h2", ["move"], "help(print)"), level("h3", ["move"])]}]
    assert "help" not in [entry.name for entry in codex.entries("h1", chapters)]
    here = {entry.name: entry for entry in codex.entries("h2", chapters)}
    assert here["help"].new and here["help"].introduced == "h2"
    later = {entry.name: entry for entry in codex.entries("h3", chapters)}
    assert later["help"].introduced == "h2" and not later["help"].new


def test_help_on_a_pawn_level_with_nothing_is_the_pawns_intro_as_before():
    assert run_sandbox("help()", ["move"]).output == PAWN_INTRO + "\n\n"
    assert run_sandbox('help("modules")', ["move"]).output == PAWN_INTRO + "\n\n"
    assert codex.describe(codex._NOTHING) == PAWN_INTRO  # no piece known (a plain snippet): the pawn's words
    assert run_snippet("help()").output == PAWN_INTRO + "\n\n"


def test_help_on_a_knight_level_introduces_the_knight():
    for code in ("help()", 'help("modules")'):
        output = knight_says(code)
        assert output == (
            "help(something) shows what it does and how to use it. For example:\n\n"
            "    help(print)\n"
            "    help(knight.jump)\n"
            "    help(knight)        everything your knight knows in this level\n\n"
            "The Codex tab lists everything you've learned so far.\n\n"
        )
        assert "pawn" not in output.lower()


def test_help_on_the_knight_lists_its_abilities_and_never_says_pawn():
    output = knight_says("help(knight)")
    listed = [line.strip() for line in output.splitlines() if line.startswith("    knight.")]
    assert listed == ["knight.jump(dx, dy)", "knight.look(dx, dy)", "knight.at_goal()", "knight.position", "knight.wait(ticks=1)", "knight.read()", "knight.pick_up()", "knight.inventory"]
    assert "Help on knight: your piece. In this level it knows:" in output
    assert "pawn" not in output.lower()


def test_help_on_a_value_or_unknown_text_names_the_knight_on_a_knight_level():
    output = knight_says('help(2.5)\nhelp("nonsense")')
    assert 'Try help(print), help(knight) for what your knight knows, or help("knight.position") for one of them.' in output
    assert "There's no help on 'nonsense'. Try help(print), or help(knight) for what your knight knows." in output
    assert "pawn" not in output.lower()
    pawn = run_sandbox('help(2.5)\nhelp("nonsense")', ["move", "position"]).output
    assert 'Try help(print), help(pawn) for what your pawn knows, or help("pawn.position") for one of them.' in pawn
    assert "There's no help on 'nonsense'. Try help(print), or help(pawn) for what your pawn knows." in pawn


def test_help_on_a_knight_level_still_speaks_of_the_knight_when_the_player_reuses_its_name():
    for code in ("knight = 3\nhelp()", "del knight\nhelp()", "knight = None\nhelp()"):
        output = knight_says(code)
        assert "help(knight.jump)" in output and "pawn" not in output


def test_help_by_text_answers_only_for_the_levels_own_piece():
    on_pawn_level = run_sandbox('help("knight.jump")\nhelp("pawn.move")', ["move"]).output
    assert "Help on knight.jump" not in on_pawn_level
    assert "There's no help on 'knight.jump'. Try help(print), or help(pawn) for what your pawn knows." in on_pawn_level
    assert "Help on pawn.move:" in on_pawn_level
    on_knight_level = knight_says('help("knight.jump")\nhelp("pawn.move")')
    assert "Help on knight.jump:" in on_knight_level and "knight.jump(dx, dy)" in on_knight_level
    assert "Help on pawn.move" not in on_knight_level
    assert "There's no help on 'pawn.move'" in on_knight_level


def test_help_on_the_knights_jump_shows_its_entry_by_name_or_by_method():
    by_text, by_method = knight_says('help("knight.jump")'), knight_says("help(knight.jump)")
    assert by_text == by_method
    assert by_text.startswith("Help on knight.jump:")


def test_the_scratch_stand_in_knows_its_levels_piece_for_help():
    repl = Repl()
    knight_api = list(Knight.ABILITIES)
    assert "pawn" not in repl.push("help()", "knight", knight_api)["output"]
    assert "Help on knight.jump:" in repl.push("help('knight.jump')", "knight", knight_api)["output"]
    assert "Help on pawn.move" not in repl.push("help('pawn.move')", "knight", knight_api)["output"]
    pawn_repl = Repl()
    assert "Help on pawn.move:" in pawn_repl.push("help('pawn.move')", "pawn", ["move"])["output"]
    assert "Help on knight.jump" not in pawn_repl.push("help('knight.jump')", "pawn", ["move"])["output"]


def test_scratch_help_follows_the_level_not_the_players_variables():
    repl = Repl()
    pawn_api = ["move"]
    assert "help(pawn.move)" in repl.push("help()", "pawn", pawn_api)["output"]
    repl.push("me = pawn", "pawn", pawn_api)  # a variable holding the old stand-in
    output = repl.push("help()", "knight", KNIGHT_API)["output"]
    assert "help(knight.jump)" in output and "pawn" not in output
    repl.push("knight = 3", "knight", KNIGHT_API)
    assert "help(knight.jump)" in repl.push("help()", "knight", KNIGHT_API)["output"]


def test_scratch_python_with_no_level_speaks_of_the_pawn():
    assert "help(pawn.move)" in Repl().push("help()")["output"]


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


# -- a level's tier (M4.4) -------------------------------------------------------------


def tier_chapter(number: int, tier: str, *levels: dict, curriculum: bool = True) -> dict:
    return {"curriculum": curriculum, "chapter": number, "tier": tier, "levels": list(levels)}


def taught_level(api: list[str], *snippets: str, piece: str = "pawn") -> dict:
    item = level("t", api, *snippets)
    item["data"]["piece"] = piece
    return item


def needs(api: list[str], require_nodes: list[str] | None = None) -> dict:
    """The level file of a level that needs these, for `level_tags`."""
    data = {"id": "q", "title": "q", "map": "P . G", "api": api}
    if require_nodes:
        data["constraints"] = {"require_nodes": require_nodes}
    return data


def tags(chapters: list[dict], api: list[str], require_nodes: list[str] | None = None) -> tuple:
    answer = codex.level_tags(needs(api, require_nodes), chapters)
    return answer["tier"], answer["chapter"]


TIERED = [
    tier_chapter(1, "pawn", taught_level(["move"], "pawn.move()")),
    tier_chapter(2, "knight", taught_level(["move", "turn_left"], "pawn.turn_left()")),
    tier_chapter(3, "bishop", taught_level(["move", "wait"], "while True:\n    break")),
]


def test_an_ability_brought_in_by_a_later_chapter_raises_the_tier():
    assert tags(TIERED, ["move"]) == ("pawn", 1)
    assert tags(TIERED, ["move", "turn_left"]) == ("knight", 2)
    assert tags(TIERED, ["turn_left", "wait"]) == ("bishop", 3)


def test_a_required_construct_is_found_through_a_lessons_snippets():
    assert tags(TIERED, ["move"], ["While"]) == ("bishop", 3)
    # The words "While" in a title or in prose teach nothing, and nor does a snippet that isn't a runnable one.
    prose = taught_level(["move"], "pawn.move()")
    prose["data"]["title"] = "While"
    prose["lesson"] += "A While loop repeats.\n```python\nwhile True:\n    break\n```\n"
    assert tags([tier_chapter(1, "pawn", prose)], ["move"], ["While"]) == ("pawn", 1)
    assert tags([tier_chapter(1, "pawn", prose), *TIERED[2:]], ["move"], ["While"]) == ("bishop", 3)


FUNCTIONAL = [
    tier_chapter(1, "pawn", taught_level(["move"], "pawn.move()")),
    tier_chapter(2, "knight", taught_level(["move"], "def hop():\n    pass")),
    tier_chapter(3, "bishop", taught_level(["move"], "def hop():\n    return 1")),
]


def rules_tags(constraints: dict) -> tuple:
    data = {**needs(["move"]), "constraints": constraints}
    answer = codex.level_tags(data, FUNCTIONAL)
    return answer["tier"], answer["chapter"]


def test_function_rules_need_def_and_a_returning_rule_needs_return():
    assert rules_tags({"max_lines": 3}) == ("pawn", 1)
    assert rules_tags({"functions": {"hop": {}}}) == ("knight", 2)
    assert rules_tags({"define": 1}) == ("knight", 2)
    assert rules_tags({"functions": {"hop": {"returns": False}}}) == ("knight", 2)
    assert rules_tags({"functions": {"hop": {"returns": True}}}) == ("bishop", 3)
    assert rules_tags({"functions": {"hop": {}, "skip": {"returns": True}}}) == ("bishop", 3)


def test_an_examiner_needs_def_and_a_judged_answer_needs_return():
    level = parse_level(needs(["move"]))
    assert codex._rule_nodes(level) == set()
    assert codex._rule_nodes(replace(level, examine=Examine(function="hop"))) == {"FunctionDef"}
    only_board = Examine(function="hop", calls=[ExamineCall(args=[1])])
    assert codex._rule_nodes(replace(level, examine=only_board)) == {"FunctionDef"}
    judged = Examine(function="hop", calls=[ExamineCall(returns=None), ExamineCall(returns=3)])
    assert codex._rule_nodes(replace(level, examine=judged)) == {"FunctionDef", "Return"}


def test_a_snippet_that_is_not_python_teaches_nothing_and_does_not_stop_the_search():
    chapters = [
        tier_chapter(1, "pawn", taught_level(["move"], "this is not Python", "pawn.move()")),
        tier_chapter(2, "knight", taught_level(["move"], "for i in range(2):\n    pass")),
    ]
    assert tags(chapters, ["move"], ["For"]) == ("knight", 2)


def test_the_piece_counts():
    chapters = [
        tier_chapter(1, "pawn", taught_level(["move"], piece="knight")),
        tier_chapter(2, "knight", taught_level(["move"])),
    ]
    assert tags(chapters, []) == ("knight", 2)
    assert tags(chapters, ["move"]) == ("knight", 2)


def test_non_curriculum_chapters_never_count():
    chapters = [
        tier_chapter(0, "practice", taught_level(["move", "wait"], "while True:\n    break"), curriculum=False),
        tier_chapter(1, "pawn", taught_level(["move"])),
    ]
    assert tags(chapters, ["move"]) == ("pawn", 1)
    assert tags(chapters, ["wait"]) == ("pawn", 1)  # only the piece is taught by the curriculum
    assert tags(chapters, ["move"], ["While"]) == ("pawn", 1)
    assert tags(chapters[:1], ["move"]) == (None, None)


def test_nothing_known_gives_no_tier():
    assert tags([], ["move"]) == (None, None)
    assert tags([tier_chapter(1, "pawn", taught_level(["move"], piece="knight"))], ["wait"], ["While"]) == (None, None)


def test_something_taught_by_nobody_is_ignored_and_the_rest_decides():
    assert tags(TIERED[:2], ["move", "wait"], ["Lambda"]) == ("pawn", 1)


def test_the_latest_of_several_needs_wins():
    assert tags(TIERED, ["turn_left"], ["While"]) == ("bishop", 3)
    assert tags(TIERED, ["wait"], ["For"]) == ("bishop", 3)  # nobody teaches For: only the ability counts


# -- keywords (M5.2-7) -------------------------------------------------------------

KEYWORD_NAMES = ["for", "if", "while", "break", "continue", "def", "return"]


def test_the_seven_keyword_entries_have_the_approved_words():
    assert list(codex.KEYWORDS) == KEYWORD_NAMES
    entries = {name: codex.keyword_entry(name) for name in KEYWORD_NAMES}
    assert all(entry.kind == "keyword" and entry.name == name and len(entry.calls) == 1 for name, entry in entries.items())
    assert entries["for"].to_dict() == {
        "name": "for", "kind": "keyword", "calls": ["for name in things:"],
        "paragraphs": ["Run the indented lines once for each item, with `name` holding that item. `range(3)` hands out 0, 1 and 2."],
        "args": [], "returns": "", "example": "for i in range(3):\n    print(i)", "introduced": "", "new": False,
    }
    assert entries["if"].calls == ["if condition: … elif other: … else:"]
    assert "`elif` tries another condition" in entries["if"].paragraphs[0]
    assert entries["if"].example == 'if steps > 3:\n    print("far")\nelif steps == 3:\n    print("just right")\nelse:\n    print("near")'
    assert entries["while"].example == "left = 3\nwhile left > 0:\n    left = left - 1"
    assert entries["break"].calls == ["break"] and entries["break"].example == "while True:\n    if done:\n        break"
    assert entries["continue"].paragraphs == ["Skip the rest of this lap and go straight on to the next one."]
    assert entries["def"].calls == ["def name(parameter, other=default):"]
    assert entries["def"].paragraphs[0].endswith("a docstring) says what the function does, and `help(name)` shows it.")
    assert entries["def"].example.splitlines()[2] == '        print(f"Go, {name}!")'
    assert entries["return"].calls == ["return value"] and "`return` gives it to the caller." in entries["return"].paragraphs[0]
    assert entries["return"].example == "def double(n):\n    return n * 2\nprint(double(4) + 1)"


def keyword_chapters() -> list[dict]:
    return [
        {"curriculum": True, "levels": [level("k1", ["move"], "pawn.move()"), level("k2", ["move"], "for i in range(2):\n    pass", "this is not Python")]},
        {"curriculum": True, "levels": [level("k3", ["move"], "def f():\n    return 1\nwhile x:\n    break"), level("k4", ["move"], "if a:\n    pass\nelif b:\n    pass")]},
    ]


def keywords_at(level_id: str) -> list[tuple[str, str, bool]]:
    return [(entry.name, entry.introduced, entry.new) for entry in codex.entries(level_id, keyword_chapters()) if entry.kind == "keyword"]


def test_a_keyword_is_listed_from_the_first_lesson_that_uses_it_and_not_before():
    assert keywords_at("k1") == []
    assert keywords_at("k2") == [("for", "k2", True)]
    assert keywords_at("k3") == [("for", "k2", False), ("while", "k3", True), ("break", "k3", True), ("def", "k3", True), ("return", "k3", True)]
    assert keywords_at("k4")[1] == ("if", "k4", True)
    assert [name for name, _, _ in keywords_at("k4")] == ["for", "if", "while", "break", "def", "return"]  # `continue` is taught by nobody here


def test_keywords_come_after_the_text_methods():
    chapters = [{"curriculum": True, "levels": [level("r1", ["move"], "for c in 'a'.upper():\n    print(c)")]}]
    assert [entry.kind for entry in codex.entries("r1", chapters)] == ["ability", "builtin", "method", "keyword", "value"]


def test_help_on_a_keyword_shows_its_entry_on_any_level():
    output = run_sandbox('help("def")\nhelp("else")\nhelp("elif")\nhelp("continue")', ["move"]).output
    assert output.count("Help on if:") == 2 and "Help on def:" in output and "Help on continue:" in output
    assert "def name(parameter, other=default):" in output and "Example:\n        def cheer(name, times=1):" in output
    assert len(output) < 3000  # not Python's reference manual


def test_help_on_other_text_keeps_its_behaviour():
    assert "There's no help on 'zzz'" in run_sandbox('help("zzz")', ["move"]).output


# -- kinds of value (M5.3-K2) --------------------------------------------------------

VALUE_NAMES = ["whole number", "text", "True and False", "None", "list", "tuple"]


def test_every_kind_of_value_has_a_full_entry_whose_example_runs():
    assert list(codex.VALUES) == VALUE_NAMES
    assert not set(codex.VALUES) & (set(codex.PYTHON) | set(codex.KEYWORDS))
    for name in VALUE_NAMES:
        entry = codex.value_entry(name)
        assert entry.kind == "value" and entry.name == name and entry.calls and entry.paragraphs and entry.example
        ast.parse(entry.example)
        assert run_snippet(entry.example).status == "ok", name
    assert codex.value_entry("True and False").calls == ["True", "False"]
    assert codex.value_entry("list").calls == ["[1, 2, 3]"]


def kinds_made(code: str) -> set[str]:
    return set(codex._kinds_made(f"{FENCE}python run\n{code}\n{FENCE}\n"))


@pytest.mark.parametrize(
    ("code", "kind"),
    [
        ("x = 7", "whole number"),
        ('x = "a"', "text"),
        ("x = f'{y}'", "text"),
        ("x = True", "True and False"),
        ("x = False", "True and False"),
        ("x = None", "None"),
        ("x = []", "list"),
        ("print([1, 2])", "list"),
        ("x = (3, 2)", "tuple"),
        ("def f():\n    return 1, 2", "tuple"),
    ],
)
def test_a_lesson_makes_a_kind_of_value_by_writing_one(code, kind):
    assert kind in kinds_made(code)


def test_what_does_not_make_a_value_brings_in_nothing():
    assert kinds_made("x = True") == {"True and False"}  # a bool is no whole number
    assert kinds_made("x, y = pair") == set()  # an unpacking target makes no tuple
    assert kinds_made("[a, b] = pair") == set()  # nor an assigned-to list display
    assert kinds_made("for x, y in pairs:\n    pass") == set()
    assert kinds_made("print(a, b)") == set()
    assert kinds_made("this is not Python") == set()


def values_chapters() -> list[dict]:
    return [
        {"curriculum": True, "levels": [level("v1", ["move"], "pawn.move()"), level("v2", ["move"], "x = 'a'\ny = [1]"), level("v3", ["move"], "z = (1, 2)\nx, y = z")]},
    ]


def test_a_kind_of_value_is_listed_from_the_first_lesson_that_makes_it_after_the_keywords():
    def at(level_id: str) -> list[tuple[str, str, bool]]:
        return [(e.name, e.introduced, e.new) for e in codex.entries(level_id, values_chapters()) if e.kind == "value"]

    assert at("v1") == []
    assert at("v2") == [("whole number", "v2", True), ("text", "v2", True), ("list", "v2", True)]
    assert at("v3") == [("whole number", "v2", False), ("text", "v2", False), ("list", "v2", False), ("tuple", "v3", True)]
    kinds = [entry.kind for entry in codex.entries("v3", values_chapters())]
    assert kinds == ["ability", "value", "value", "value", "value"]


def test_help_on_a_kind_of_value_by_name_alias_or_type():
    output = run_sandbox('help("list")\nhelp("tuple")\nhelp("text")\nhelp("whole number")\nhelp("True and False")\nhelp("None")', ["move"]).output
    for name in VALUE_NAMES:
        assert f"Help on {name}:" in output
    assert "Help on int:" in run_sandbox('help("int")\nhelp(int)', ["move"]).output
    assert "Help on whole number:" not in run_sandbox('help("int")\nhelp(int)', ["move"]).output
    by_alias = run_sandbox('help("str")\nhelp("bool")', ["move"]).output
    assert "Help on text:" in by_alias and "Help on True and False:" in by_alias
    by_type = run_sandbox("help(list)\nhelp(tuple)\nhelp(str)\nhelp(bool)", ["move"]).output
    for name in ("list", "tuple", "text", "True and False"):
        assert f"Help on {name}:" in by_type
    assert "There's no help on 'north'" in run_sandbox('help("north")', ["move"]).output


def test_help_on_a_value_answers_for_its_kind_and_points_at_the_piece():
    pointer = "help() explains what things do: try help(print), or help(pawn) for what your pawn knows."
    for code, name in (("[]", "list"), ("(3, 2)", "tuple"), ("7", "whole number"), ("True", "True and False"), ("None", "None"), ("pawn.position", "tuple")):
        output = run_sandbox(f"help({code})", ["move", "position"]).output
        assert f"Help on {name}:" in output, code
        assert output.endswith(f"\n\n{pointer}\n\n"), code
    knight = knight_says("help(knight.position)")
    assert "help(knight) for what your knight knows." in knight and "pawn" not in knight.lower()


def test_help_on_a_float_a_dict_or_a_set_keeps_the_one_sentence():
    output = run_sandbox("help(2.5)\nhelp({})\nhelp({1})", ["move"]).output
    for kind in ("float", "dict", "set"):
        assert f"is a value (a {kind}), and help() explains what things do." in output
    assert "Help on" not in output


def function_help(code: str) -> str:
    result = run_sandbox(code, ["move"])
    assert result.status == "finished"
    return result.output


def test_help_on_the_players_function_with_a_docstring_is_in_the_codex_style():
    output = function_help('def stride(squares, times=2, *rest):\n    """Walk a few squares.\n\n    Then rest."""\n\nhelp(stride)')
    assert output.splitlines()[0] == "stride(squares, times=2, *rest)"
    assert "    Walk a few squares." in output and "    Then rest." in output
    assert "Help on function" not in output and "__main__" not in output


def test_help_on_the_players_function_without_a_docstring_says_how_to_add_one():
    output = function_help("def stride(squares, times=2):\n    pass\n\nhelp(stride)")
    assert output.splitlines()[0] == "stride(squares, times=2)"
    assert "a sentence in quotes as the first line of its" in output and "body would show here" in output
    assert "Help on function" not in output and "__main__" not in output


def test_help_on_a_lambda_does_not_crash():
    output = function_help("double = lambda n: n * 2\nhelp(double)")
    assert output.splitlines()[0] == "<lambda>(n)"


# -- the fence of a lesson's runnable snippet (M5.2-5a) --------------------------------------------------------


def fenced(info, code="pawn.move(1)\n"):
    return f"{FENCE}python {info}\n{code}{FENCE}\n"


@pytest.mark.parametrize(
    ("info", "meant", "call"),
    [
        ("run", "", ""),
        ("run error", "error", ""),
        ("run lost", "lost", ""),
        ("run timeout", "timeout", ""),
        ("run calls gallop(1, 2)", "", "gallop(1, 2)"),
        ("run error calls gallop(1)", "error", "gallop(1)"),
        ("run lost calls gallop(1)", "lost", "gallop(1)"),
        ("run timeout calls gallop(1)", "timeout", "gallop(1)"),
        ("run calls  gallop('a b', -1)  ", "", "gallop('a b', -1)"),
    ],
)
def test_a_snippets_fence_gives_its_meaning_call_and_code_by_name(info, meant, call):
    [snippet] = codex.snippets("Words.\n\n" + fenced(info, "a = 1\nb = 2\n") + "\nMore words.\n")
    assert (snippet.meant, snippet.call, snippet.code) == (meant, call, "a = 1\nb = 2\n")


@pytest.mark.parametrize("info", ["run calls", "run calls ", "runner", "run erro", "run error calls", "py run calls f()", "calls f()"])
def test_a_fence_that_is_not_a_runnable_snippet_is_not_found(info):
    assert codex.snippets(fenced(info)) == []


def test_lesson_snippets_are_still_just_the_codes_in_order():
    text = fenced("run", "one()\n") + "\n" + fenced("run calls hop(1)", "def hop(n):\n    pass\n") + fenced("run error", "two(\n")
    assert codex.lesson_snippets(text) == ["one()\n", "def hop(n):\n    pass\n", "two(\n"]
    assert [snippet.meant for snippet in codex.snippets(text)] == ["", "", "error"]


def test_what_a_marked_snippet_calls_is_still_taught():
    text = fenced("run calls shout('hi')", "def shout(word):\n    print(word.upper())\n")
    assert codex.taught(text) == {"print", "str.upper"}


def test_help_is_brought_in_by_the_lesson_that_calls_it_in_the_real_curriculum():
    from test_levels import chapters_in_play_order

    chapters = chapters_in_play_order()
    assert "help" not in [entry.name for entry in codex.entries("ch07-l05", chapters)]
    here = {entry.name: entry for entry in codex.entries("ch07-l06", chapters)}
    assert here["help"].new and here["help"].introduced == "ch07-l06"


def test_help_without_a_builtins_help_still_looks_things_up(monkeypatch):
    # `builtins.help` exists only once `site` has run (M5.2-V); help(None) must not match the builtin that is missing.
    monkeypatch.delattr(builtins, "help")
    assert not hasattr(builtins, "help")
    assert codex._entry_for(print).name == "print"
    assert [codex._entry_for(thing) for thing in (None, 42, lambda: 0)] == [None, None, None]
    for code in ("help(None)", "help(42)", "def f():\n    pass\nhelp(f)"):
        result = run_snippet(code)
        assert result.status == "ok", code
        assert "Help on help:" not in result.output, code
    assert "Help on None:" in run_snippet("help(None)").output  # the value's own kind answers (M5.3)
    assert "Help on print:" in run_snippet("help(print)").output
