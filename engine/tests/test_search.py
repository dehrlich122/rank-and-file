"""The solvability search (M4.3): a route of plain calls per board, found in slices, and never shown."""

import json
import sys
from pathlib import Path

import pytest
import yaml

from rankfile import bridge
from rankfile.constraints import code_lines
from rankfile.levels import parse_level
from rankfile.search import CLOCKS, GAVE_UP, NO_ROUTE, ROUTE, RouteSearch, Search

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


def test_obstacles_that_tick_with_the_code_cannot_be_judged():
    level = made(enemies=[{"kind": "patrol", "route": ["b2", "b3"], "clock": "line"}])
    search = RouteSearch(level)
    assert search.run() and search.status == CLOCKS and search.positions == 0


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
    assert result["cases"] == 2 and len(result["results"]) == 2
    assert set(result["results"][0]) == {"label", "where", "status", "lines", "positions"}
    assert "actions" not in json.dumps(result) and "move" not in json.dumps(result)


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
    level = parse_level(yaml.safe_load(path.read_text(encoding="utf-8")))
    sliced = finish(Search(level, max_states=400_000))["results"]
    whole = []
    for case in level.cases():
        one = RouteSearch(case.level, 400_000)
        one.run()
        whole.append((one.status, one.lines if one.status == ROUTE else None))
    assert [(r["status"], r["lines"]) for r in sliced] == whole
    assert all(status != NO_ROUTE for status, _ in whole)  # a level in the repo can always be walked, or its clocks are beyond the search


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
