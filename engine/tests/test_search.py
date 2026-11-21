"""The solvability search (M4.3): a route of plain calls per board, found in slices, and never shown."""

import itertools
import json
import sys
import time
from pathlib import Path

import pytest
import yaml

from rankfile import bridge
from rankfile import search as search_module
from rankfile.constraints import code_lines
from rankfile.levels import parse_level
from rankfile.runner import unmet_objectives
from rankfile.search import (
    CLOCKS,
    EXAMINER,
    GAVE_UP,
    KEYS,
    MAX_STATES,
    NO_ROUTE,
    ROUTE,
    WORK_FACTOR,
    RouteSearch,
    Search,
)
from rankfile.world import World

ROOT = Path(__file__).resolve().parents[2]
LEVEL_FILES = sorted(path for path in (ROOT / "levels").glob("*/*.yaml") if path.name != "chapters.yaml")
OPEN = "G . . .\n. . . .\n. . . .\nP . . .\n"


def made(**changes):
    data = {"id": "my-test", "title": "Mine", "map": OPEN, "api": ["move", "turn_left", "turn_right"]}
    data.update(changes)
    return parse_level(data)


def finish(search: Search) -> dict:
    while not (result := search.step(0.05))["done"]:
        pass
    return result


def test_a_route_is_found_and_counted_in_lines():
    search = RouteSearch(made())
    assert search.run() and search.status == ROUTE
    assert search.lines == 1  # one call walks the whole file


def test_a_walled_in_goal_has_no_route():
    level = made(map="G # . .\n# . . .\n. . . .\nP . . .\n")
    search = RouteSearch(level)
    search.run()
    assert search.status == NO_ROUTE


def test_a_small_cap_gives_up_on_a_board_that_has_a_route():
    search = RouteSearch(made(), max_states=3)
    search.run()
    assert search.status == GAVE_UP and search.actions == []
    assert search.positions == 3  # it never says it looked at more than its limit


def test_obstacles_that_tick_with_the_code_cannot_be_judged():
    level = made(enemies=[{"kind": "patrol", "route": ["b2", "b3"], "clock": "line"}])
    search = RouteSearch(level)
    assert search.run() and search.status == CLOCKS and search.positions == 0


def test_an_examiner_level_is_declined_at_once_before_any_board_is_searched():
    level = made(examine={"function": "gallop", "calls": [{"args": [1], "board": 1}, {"args": [2], "board": 2}]}, variants=[{"map": "G .\nP .\n"}])
    search = RouteSearch(level)
    assert search.run() and search.status == EXAMINER and search.positions == 0 and search.actions == []
    clocked = made(examine={"function": "gallop", "calls": [{}]}, enemies=[{"kind": "patrol", "route": ["b2", "b3"], "clock": "line"}])
    assert RouteSearch(clocked).status == EXAMINER  # not "clocks"


def test_the_search_reports_an_examiner_level_as_one_result_not_one_per_call():
    level = made(examine={"function": "gallop", "calls": [{"args": [1], "board": 1}, {"args": [2], "board": 2}]}, variants=[{"map": "G .\nP .\n"}])
    search = Search(level)
    result = search.step(0.05)
    assert result["done"] and search.done and result["cases"] == 1
    assert [r["status"] for r in result["results"]] == [EXAMINER]


VAULT = {"map": "G . D .\nK . . .\nP . . .\n", "legend": {"K": {"tile": "key", "name": "brass"}, "D": {"tile": "door", "key": "brass"}}}
KNIGHT = {"piece": "knight", "api": ["jump", "pick_up"]}


def test_a_level_with_a_key_and_a_door_is_declined_at_once():
    search = RouteSearch(made(**KNIGHT, **VAULT))
    assert search.run() and search.status == KEYS and search.positions == 0 and search.actions == []
    result = Search(made(**KNIGHT, **VAULT)).step(0.05)
    assert result["done"] and result["cases"] == 1 and [r["status"] for r in result["results"]] == [KEYS]


def test_a_key_only_on_a_variant_makes_the_level_one_declined_case():
    other = {"map": ". . . .\n. K . G\n. . P .\n", "legend": {"K": {"tile": "key", "name": "brass"}}}
    level = made(**KNIGHT, map="G D\n. P\n", legend={"D": {"tile": "door", "key": "brass"}}, variants=[other])
    result = finish(Search(level))
    assert result["cases"] == 1 and [r["status"] for r in result["results"]] == [KEYS]


def test_an_examiner_level_with_a_key_stays_an_examiner_level():
    level = made(**KNIGHT, **VAULT, examine={"function": "gallop", "calls": [{}]})
    assert RouteSearch(level).status == EXAMINER


def test_a_level_without_keys_or_doors_is_still_searched():
    assert RouteSearch(made()).run() and finish(Search(made()))["results"][0]["status"] == ROUTE


def test_a_slice_stops_after_its_time_and_carries_on_where_it_was():
    search = RouteSearch(made(map="G . . . . . . .\n. . . . . . . .\n. . . . . . . .\nP . . . . . . .\n"))
    assert search.run(0.0) is False and search.status is None
    assert search.run() is True and search.status == ROUTE


def test_each_hidden_goal_square_and_each_board_is_its_own_case():
    hidden = Search(made(map="? . ?\n. . .\nP . .\n"))
    assert [case.label for case in hidden.cases] == ["a3", "c3"]
    boards = Search(made(variants=[{"map": "G .\nP .\n"}, {"map": "G #\n# P\n"}]))
    assert [case.label for case in boards.cases] == ["board 1", "board 2", "board 3"]
    result = finish(boards)
    assert [r["status"] for r in result["results"]] == [ROUTE, ROUTE, NO_ROUTE]


def test_what_a_step_reports_is_counts_and_words_never_a_route():
    result = finish(Search(made(map="? . ?\n. . .\nP . .\n")))
    assert result["cases"] == 2 and result["unit"] == "place" and len(result["results"]) == 2
    assert set(result["results"][0]) == {"label", "where", "status", "lines", "positions"}
    assert "actions" not in json.dumps(result) and "move" not in json.dumps(result)


def test_a_knight_level_is_beyond_the_walking_search_until_m5_5():
    level = made(piece="knight", api=["jump"], map="G . .\n. . .\n. P .\n")  # one jump away
    search = RouteSearch(level)
    search.run()
    assert search.status == NO_ROUTE
    assert [r["status"] for r in finish(Search(level))["results"]] == [NO_ROUTE]


GATE = {"D": {"tile": "gate", "passphrase": "open"}}
WALLED_GATE = "G # . .\n# . . .\n. . D .\nP . . .\n"  # the goal is walled in, and a gate stands where it doesn't help
KNIGHT_GATE = "G . . .\n. . . .\n. . D .\nP . . .\n"


def searched(level, cap=400_000) -> RouteSearch:
    search = RouteSearch(level, cap)
    search.run()
    return search


def test_a_phrase_that_opens_nothing_does_not_keep_a_walled_in_pawn_board_searching():
    plain = searched(made(map="G # . .\n# . . .\n. . . .\nP . . .\n"))
    gated = searched(made(map=WALLED_GATE, legend=GATE), cap=2000)
    assert plain.status == gated.status == NO_ROUTE
    assert gated.positions < 4 * plain.positions  # not near the cap


@pytest.mark.parametrize("legend, say", [(GATE, ""), ({"D": {"tile": "gate", "passphrase": "open", "question": "What opens a door?"}}, ""), ({}, "open")], ids=["a gate", "a gate that asks", "an objective phrase"])
def test_a_knight_board_with_a_phrase_to_say_ends_at_once_with_no_route(legend, say):
    level = made(piece="knight", api=["jump"], map=KNIGHT_GATE if legend else OPEN, legend=legend, objectives=["reach_goal", {"say": say}] if say else ["reach_goal"])
    search = searched(level)
    assert search.status == NO_ROUTE and search.positions < 10


def test_a_phrase_that_opens_the_only_way_to_the_goal_is_still_a_route_with_the_say_counted():
    walled = "G . . .\n# # D #\n. . . .\nP . . .\n"
    shut = searched(made(map=walled.replace("D", "#")))
    through = searched(made(map=walled, legend=GATE))
    assert shut.status == NO_ROUTE
    assert through.status == ROUTE and ("say", "open") in through.actions
    assert through.lines > 1  # the walk, the say and the walk on are separate lines


def test_a_phrase_an_objective_asks_for_is_said_on_the_route_and_counted():
    without = searched(made())
    asked = searched(made(objectives=["reach_goal", {"say": "hello"}]))
    assert asked.status == ROUTE and ("say", "hello") in asked.actions
    assert asked.lines == without.lines + 1


def test_the_check_goes_through_the_bridge_in_slices():
    started = json.loads(bridge.solve_start(json.dumps({"id": "x", "title": "x", "map": OPEN, "api": ["move"]})))
    assert started == {"ok": True, "cases": 1}
    while not (progress := json.loads(bridge.solve_step(0.05)))["done"]:
        pass
    assert progress["results"][0]["status"] == ROUTE
    refused = json.loads(bridge.solve_start(json.dumps({"id": "x"})))
    assert refused["ok"] is False and "error" in refused


@pytest.mark.parametrize("path", LEVEL_FILES, ids=lambda path: path.stem)
def test_every_repo_board_gets_the_same_answer_sliced_or_whole(path):
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    level = parse_level(data)
    sliced = finish(Search(level, max_states=400_000))["results"]
    legends = [data.get("legend") or {}] + [(variant.get("legend") or {}) for variant in data.get("variants") or []]
    has_keys = any(isinstance(entry, dict) and entry.get("tile") in ("key", "door") for legend in legends for entry in legend.values())
    if level.examine or has_keys:  # declined whole, one case for the level: an examiner level (M5.2-4b-3), or keys and doors (until M5.5)
        expected = EXAMINER if level.examine else KEYS
        assert [(r["status"], r["lines"]) for r in sliced] == [(expected, None)]
        one = RouteSearch(level, 400_000)
        one.run()
        assert one.status == expected
        return
    whole = []
    for case in level.cases():
        one = RouteSearch(case.level, 400_000)
        one.run()
        whole.append((one.status, one.lines if one.status == ROUTE else None))
    assert [(r["status"], r["lines"]) for r in sliced] == whole
    if level.piece == "pawn":
        assert all(status != NO_ROUTE for status, _ in whole)  # a level in the repo can always be walked, or its clocks are beyond the search
    else:
        # The search only walks until M5.5, so every board of another piece is NO_ROUTE. When it learns to
        # jump, this fails: flip this branch then.
        assert all(status == NO_ROUTE for status, _ in whole)


def test_the_lines_counted_are_the_lines_of_the_code_the_scripts_write():
    sys.path.insert(0, str(ROOT / "scripts"))
    import solve

    for path in LEVEL_FILES:
        level = parse_level(yaml.safe_load(path.read_text(encoding="utf-8")))
        for case in level.cases():
            search = RouteSearch(case.level, 400_000)
            search.run()
            if search.status == ROUTE:
                assert search.lines == code_lines("\n".join(solve.write_code(case.level, search.actions))), (path.stem, case.label)


# The hard limits (M5.3-S): no board may run for ever or eat the machine.
ENDLESS = "G # . .\n# . . .\n. . . .\nP . . .\n"  # the goal is walled in, so only a limit can end a search that never repeats


def endless(monkeypatch) -> list:
    """Make every step land on a position never seen before; returns the entries pushed onto the frontier."""
    fresh, pushed = itertools.count(), []
    monkeypatch.setattr(search_module, "_key", lambda *_: next(fresh))
    real_push = search_module.heappush
    monkeypatch.setattr(search_module, "heappush", lambda queue, entry: (pushed.append(entry), real_push(queue, entry))[1])
    return pushed


def test_the_work_a_search_may_do_is_a_multiple_of_its_state_cap():
    assert RouteSearch(made(), max_states=7).max_work == WORK_FACTOR * 7
    assert RouteSearch(made()).max_work == WORK_FACTOR * MAX_STATES
    assert RouteSearch(made(), max_work=5).max_work == 5


def test_a_search_that_has_done_its_work_gives_up_on_a_board_that_has_a_route():
    search = RouteSearch(made(map="G . . . . . . .\n. . . . . . . .\n. . . . . . . .\nP . . . . . . .\n"), max_work=2)
    assert search.run() is True
    assert search.status == GAVE_UP and search.actions == [] and search.work == 3
    assert search.positions <= search.max_states


def test_a_search_that_never_repeats_a_position_is_stopped_by_its_work_cap_with_flat_memory(monkeypatch):
    pushed = endless(monkeypatch)
    search = RouteSearch(made(map=ENDLESS, api=["move", "turn_left", "turn_right", "wait"]), max_states=10**9, max_work=3000)
    started = time.perf_counter()
    assert search.run() is True
    assert time.perf_counter() - started < 1
    assert search.status == GAVE_UP and search.work == 3001
    assert len(pushed) == 3000  # nothing was pushed after the limit
    assert len({len(entry) for entry in pushed}) == 1  # an entry is the same size at any depth...
    assert all(entry[4] is None or (len(entry[4]) == 2 and isinstance(entry[4][1], tuple)) for entry in pushed)  # ...a link, not a route
    assert search._queue == [] and search._best == {}  # the frontier is dropped once it gives up


def test_a_route_is_rebuilt_from_its_links_in_order():
    level = made(map="G . . .\n# # # .\n. . . .\nP . . .\n")
    search = searched(level)
    assert search.status == ROUTE and len(search.actions) > 3
    world = World(level)
    for action in search.actions:  # played in the order given, the route reaches the goal
        world = search_module._try(level, world, action)
        assert world is not None
    assert not unmet_objectives(level, world, "")


def test_run_with_no_slice_gives_up_at_its_default_deadline(monkeypatch):
    endless(monkeypatch)
    monkeypatch.setattr(search_module, "RUN_SECONDS", -1.0)  # already past
    search = RouteSearch(made(map=ENDLESS), max_states=10**9, max_work=10**9)
    assert search.run() is True and search.status == GAVE_UP


def test_the_default_deadline_follows_the_clock(monkeypatch):
    endless(monkeypatch)
    now = itertools.count(step=10.0)  # each look at the clock is ten seconds later
    monkeypatch.setattr(search_module.time, "perf_counter", lambda: next(now))
    search = RouteSearch(made(map=ENDLESS), max_states=10**9, max_work=10**9)
    assert search.run() is True and search.status == GAVE_UP
    assert 0 < search.work <= 20  # about RUN_SECONDS / 10 looks at the clock


def test_a_slice_is_not_cut_short_by_the_default_deadline(monkeypatch):
    monkeypatch.setattr(search_module, "RUN_SECONDS", -1.0)
    search = RouteSearch(made())
    assert search.run(5.0) is True and search.status == ROUTE  # a given slice has its own deadline
    sliced = RouteSearch(made())
    assert sliced.run(0.0) is False and sliced.status is None  # and is still just a pause
