"""The obstacle toolkit (M3.1): ticks, losing, pits and waiting."""

import pytest

from conftest import make_level
from rankfile.levels import LevelError
from rankfile.runner import run_level

API = ["move", "turn_left", "turn_right", "at_goal", "wait"]


def events(result, kind=None):
    return [event for step in result.steps for event in step["events"] if kind is None or event["kind"] == kind]


@pytest.fixture
def pits():
    """Pawn on a1 facing north; a pit on a3; the goal on b3."""
    return make_level(". . .\nO G .\n. . .\nP . .\n", legend={"O": {"tile": "pit"}}, api=API)


# -- ticks -------------------------------------------------------------------------


def test_every_square_turn_and_wait_is_a_tick(pits):
    result = run_level(pits, "pawn.turn_right()\npawn.move(2)\npawn.wait()\npawn.turn_left()")
    # The piece acts, then the tick is over: each event shows the ticks before it.
    assert [event["state"]["tick"] for event in events(result)] == [0, 1, 2, 3, 4]
    assert result.final["tick"] == 5


def test_asking_the_board_costs_no_tick(pits):
    result = run_level(pits, "pawn.at_goal()\npawn.at_goal()")
    assert result.final["tick"] == 0


def test_the_start_state_has_no_ticks_and_is_not_lost(pits):
    start = pits.describe()["start"]
    assert (start["tick"], start["lost"]) == (0, None)


def test_waiting_stands_still(pits):
    result = run_level(pits, "pawn.wait()")
    assert [event["kind"] for event in events(result)] == ["wait"]
    assert result.final["pos"] == [0, 0]


def test_waiting_is_locked_unless_the_level_unlocks_it():
    level = make_level("G\nP\n")
    result = run_level(level, "pawn.wait()")
    assert result.error.type == "LockedAbilityError"


# -- pits and losing -----------------------------------------------------------------


def test_stepping_into_a_pit_loses_the_run(pits):
    result = run_level(pits, "pawn.move()\npawn.move()\npawn.turn_right()")
    assert result.status == "lost"
    assert result.summary == "Your pawn fell into the pit on a3."
    assert result.final["pos"] == [0, 2]
    assert result.final["lost"] == [0, 2]
    lost = events(result, "lost")
    assert [(event["at"], event["message"]) for event in lost] == [([0, 2], "Your pawn fell into the pit on a3.")]
    assert result.steps[-1]["line"] == 2  # the turn never ran
    assert result.error.line == 2
    assert result.error.traceback == ""  # the game ended it, not Python
    assert result.stars == []


def test_a_long_move_stops_in_the_pit(pits):
    result = run_level(pits, "pawn.move(3)")
    assert result.status == "lost"
    assert result.final["pos"] == [0, 2]


def test_except_exception_cannot_swallow_a_loss(pits):
    code = "try:\n    pawn.move(2)\nexcept Exception:\n    pass\npawn.turn_right()\npawn.move()"
    result = run_level(pits, code)
    assert result.status == "lost"
    assert result.error.line == 2
    assert 5 not in [step["line"] for step in result.steps]


def test_a_lost_run_stays_lost_even_if_the_code_catches_it(pits):
    code = "try:\n    pawn.move(2)\nexcept BaseException:\n    pass\npawn.turn_right()\npawn.move()"
    result = run_level(pits, code)
    assert result.status == "lost"
    assert result.summary == "Your pawn fell into the pit on a3."
    assert result.error.line == 2  # where it was lost, not where the code tried to carry on
    assert result.final["pos"] == [0, 2]  # the pawn never climbed out


def test_pits_are_drawn():
    level = make_level("O\nG\nP\n", legend={"O": "pit"})
    assert level.describe()["tiles"][2] == ["pit"]


# -- waypoints and gems ----------------------------------------------------------------


@pytest.fixture
def waypoints():
    """Pawn on a1 facing north; waypoints on a2 and c2; the goal on c3."""
    return make_level(". . G\nW . W\nP . .\n", legend={"W": "waypoint"}, api=API)


def test_waypoints_are_an_objective_whenever_the_map_has_any(waypoints):
    assert waypoints.objectives.waypoints
    assert "Cross all 2 waypoints on the way: a2 and c2. Passing over them is enough." in waypoints.goals()


def test_passing_over_a_waypoint_crosses_it(waypoints):
    result = run_level(waypoints, "pawn.move(2)\npawn.turn_right()\npawn.move()")
    assert result.final["crossed"] == [[0, 1]]
    assert result.status == "incomplete"
    assert result.summary == "Your program finished, but your pawn stopped on b3, and the goal is on c3. Also, you didn't cross the waypoint on c2."


def test_every_waypoint_crossed_and_the_goal_reached_solves_it(waypoints):
    code = "pawn.move()\npawn.turn_right()\npawn.move(2)\npawn.turn_left()\npawn.move()"
    result = run_level(waypoints, code)
    assert result.status == "solved"
    assert result.final["crossed"] == [[0, 1], [2, 1]]


def test_listing_waypoints_needs_some_on_the_map():
    with pytest.raises(LevelError, match="waypoint squares"):
        make_level("G\nP\n", objectives=["reach_goal", "waypoints"])


@pytest.fixture
def gems():
    """Pawn on a1 facing east; gems on b1, c1 and d1; the goal on e1."""
    return make_level("P $ $ $ G\n", legend={"$": "gem"}, api=API, start={"facing": "east"}, objectives=["reach_goal", {"collect": "all"}])


def test_gems_are_collected_by_walking_over_them(gems):
    result = run_level(gems, "pawn.move(4)")
    assert result.status == "solved"
    assert result.final["collected"] == [[1, 0], [2, 0], [3, 0]]
    assert [len(event["state"]["collected"]) for event in events(result)] == [1, 2, 3, 3]


def test_missing_gems_leaves_it_incomplete(gems):
    result = run_level(gems, "pawn.move(2)")
    assert result.summary.endswith("Also, you collected 2 of the 3 gems.")


def test_collecting_some_of_the_gems():
    level = make_level("G\n$\n$\nP\n", legend={"$": "gem"}, objectives=["reach_goal", {"collect": 1}])
    assert level.goals()[1] == "Collect at least 1 gem of the 2 by walking over them."
    assert run_level(level, "pawn.move(3)").status == "solved"


def test_the_collect_objective_is_checked():
    with pytest.raises(LevelError, match="needs gem squares"):
        make_level("G\nP\n", objectives=["reach_goal", {"collect": "all"}])
    with pytest.raises(LevelError, match="asks for 3 gems, and the map has 1"):
        make_level("G\n$\nP\n", legend={"$": "gem"}, objectives=["reach_goal", {"collect": 3}])
    with pytest.raises(LevelError, match="unknown objective"):
        make_level("G\n$\nP\n", legend={"$": "gem"}, objectives=["reach_goal", {"collect": "some"}])


def test_a_board_with_only_gems_to_collect():
    level = make_level("$ . P\n", legend={"$": "gem"}, api=API, start={"facing": "west"}, objectives=[{"collect": "all"}])
    assert run_level(level, "pawn.move(2)").status == "solved"
    assert run_level(level, "pawn.move()").summary == "Your program finished, but you didn't collect the gem."


def test_pits_are_listed_as_obstacles():
    level = make_level("O . O\n. G .\nO P .\n", legend={"O": "pit"})
    assert level.describe()["obstacles"] == ["Pits on a1, a3 and c3: step in and the run is lost."]


# -- timed gates -------------------------------------------------------------------------


@pytest.fixture
def portcullis():
    """Pawn on a1 facing east; a gate on c1 open every 3 ticks; the goal on d1."""
    return make_level("P . T G\n", legend={"T": {"tile": "timed_gate", "every": 3}}, api=API, start={"facing": "east"})


def test_a_timed_gate_is_open_on_every_nth_tick(portcullis):
    result = run_level(portcullis, "pawn.wait()\npawn.wait()\npawn.wait()\npawn.wait()")
    ticks = [(event["state"]["tick"], event["state"]["opened"]) for event in events(result, "tick")]
    assert ticks == [(1, []), (2, []), (3, [[2, 0]]), (4, [])]
    assert portcullis.describe()["start"]["opened"] == [[2, 0]]  # open at the start


def test_a_shut_timed_gate_blocks_like_a_wall(portcullis):
    result = run_level(portcullis, "pawn.move(3)")  # reaches the gate on tick 1
    assert result.status == "error"
    assert result.error.friendly == "Your pawn bumped into the gate on c1. It's shut right now: it opens every 3 ticks."
    assert events(result, "bump")[-1]["at"] == [2, 0]


def test_arriving_while_it_is_open_goes_through(portcullis):
    result = run_level(portcullis, "pawn.move()\npawn.wait()\npawn.wait()\npawn.move(2)")
    assert result.status == "solved"


def test_a_timed_gate_can_keep_time_with_the_code():
    level = make_level("P T G\n", legend={"T": {"tile": "timed_gate", "every": 2, "clock": "line"}}, start={"facing": "east"})
    assert run_level(level, "pawn.move(2)").status == "error"  # line 1 ticks it shut
    assert run_level(level, "x = 1\npawn.move(2)").status == "solved"  # two lines: open again


def test_the_new_line_clock_ticks_once_per_line():
    level = make_level("P T G\n", legend={"T": {"tile": "timed_gate", "every": 2, "clock": "new_line"}}, start={"facing": "east"})
    looped = "for i in range(3):\n    x = i\npawn.move(2)"  # 3 new lines: shut
    assert run_level(level, looped).status == "error"
    copied = "x = 0\nx = 1\nx = 2\npawn.move(2)"  # 4 new lines: open
    assert run_level(level, copied).status == "solved"


def test_timed_gates_are_described():
    level = make_level("P T G\n", legend={"T": {"tile": "timed_gate", "every": 3}}, start={"facing": "east"})
    described = level.describe()
    assert described["timed_gates"] == [{"pos": [1, 0], "every": 3, "clock": "action"}]
    assert described["obstacles"] == [
        "The gate on b1 is open at the start, then shut for 2 ticks, then open again, over and over. "
        "It ticks once for each square you move, each turn and each wait."
    ]


@pytest.mark.parametrize(
    ("meaning", "message"),
    [
        ({"tile": "timed_gate"}, "needs every"),
        ({"tile": "timed_gate", "every": 1}, "2 or more"),
        ({"tile": "timed_gate", "every": 3, "clock": "sometimes"}, "clock must be one of"),
        ({"tile": "timed_gate", "every": 3, "passphrase": "x"}, "doesn't take passphrase"),
        ({"tile": "gate", "passphrase": "4", "question": ""}, "needs question"),
    ],
)
def test_gate_details_are_checked(meaning, message):
    with pytest.raises(LevelError, match=message):
        make_level("P T G\n", legend={"T": meaning})


# -- guards with a question ----------------------------------------------------------------


@pytest.fixture
def toll():
    """Pawn on a1 facing north; a gate on a3 whose guard asks a question; the goal on a4."""
    legend = {"X": {"tile": "gate", "question": "What is two plus two?", "passphrase": "4"}}
    return make_level("G\nX\n.\nP\n", legend=legend, api=API)


def test_the_right_answer_opens_the_gate(toll):
    assert run_level(toll, "pawn.move()\nprint(2 + 2)\npawn.move(2)").status == "solved"


def test_a_wrong_answer_gets_the_guards_reply(toll):
    result = run_level(toll, "pawn.move()\nprint(5)\npawn.move(2)")
    assert [event["message"] for event in events(result, "guard")] == ['"Wrong!" says the guard. The gate remains locked.']
    assert result.error.friendly == "The guard won't open the gate until you answer: \"What is two plus two?\"\nThe guard didn't accept what line 2 printed."


def test_the_question_is_shown_and_the_answer_is_not(toll):
    described = toll.describe()
    assert described["questions"] == [{"pos": [0, 2], "text": "What is two plus two?"}]
    assert 'The guard asks: "What is two plus two?" Print the answer next to the gate.' in described["goals"][1]
    assert '"4"' not in str(described)
