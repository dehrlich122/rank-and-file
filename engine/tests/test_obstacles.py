"""The obstacle toolkit (M3.1): ticks, losing, pits and waiting."""

import pytest

from conftest import events, make_level
from rankfile.levels import LevelError
from rankfile.runner import run_level
from rankfile.world import GUARD_MISCOUNTED, GUARD_NOT_UNDERSTOOD

API = ["move", "turn_left", "turn_right", "at_goal", "wait"]


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
    assert not waypoints.objectives.waypoints  # not listed, and still an objective
    assert not waypoints.nothing_to_do
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


# -- timed gates ---------------------------------------------------------------------------


@pytest.fixture
def portcullis():
    """Pawn on a1 facing east; a gate on c1, open for 2 ticks of every 3; the goal on d1."""
    return make_level("P . T G\n", legend={"T": {"tile": "timed_gate", "every": 3}}, api=API, start={"facing": "east"})


def test_a_timed_gate_is_open_for_its_first_ticks_of_each_cycle(portcullis):
    result = run_level(portcullis, "pawn.wait()\npawn.wait()\npawn.wait()\npawn.wait()")
    ticks = [(event["state"]["tick"], event["state"]["opened"]) for event in events(result, "tick")]
    assert ticks == [(1, [[2, 0]]), (2, []), (3, [[2, 0]]), (4, [[2, 0]])]  # open 2 of every 3, starting open
    assert portcullis.describe()["start"]["opened"] == [[2, 0]]


def test_a_shut_timed_gate_blocks_like_a_wall(portcullis):
    result = run_level(portcullis, "pawn.move()\npawn.wait()\npawn.move()")  # reaches the gate on tick 2
    assert result.status == "error"
    assert result.error.friendly == "Your pawn bumped into the gate on c1. It's shut right now: it's open for 2 ticks out of every 3."
    assert events(result, "bump")[-1]["at"] == [2, 0]


def test_a_gate_that_shuts_on_the_pawn_crushes_it(portcullis):
    result = run_level(portcullis, "pawn.move(3)")  # into the gate on its last open tick
    assert result.status == "lost"
    assert result.summary == "Your pawn was crushed by the gate on c1."
    assert result.final["lost"] == [2, 0]
    waiting = run_level(portcullis, "pawn.move()\npawn.wait()\npawn.wait()\npawn.move()\npawn.wait()")
    assert waiting.summary == "Your pawn was crushed by the gate on c1."  # in as it opened, but it stayed too long


def test_arriving_as_it_opens_goes_through(portcullis):
    result = run_level(portcullis, "pawn.move()\npawn.wait()\npawn.wait()\npawn.move(2)")
    assert result.status == "solved"


def test_a_gate_that_shuts_on_a_chaser_crushes_it():
    level = make_level("P # T .\n", legend={"T": {"tile": "timed_gate", "every": 3}}, api=API, start={"facing": "east"},
                       objectives=[{"say": "x"}], enemies=[{"kind": "chaser", "start": "d1"}])
    # The chaser steps into the open gate on tick 1; the wall stops it going on, and the gate shuts on tick 2.
    result = run_level(level, "pawn.wait()")
    assert events(result, "crush") == []
    result = run_level(level, "pawn.wait()\npawn.wait()")
    assert [(event["at"], event["message"]) for event in events(result, "crush")] == [([2, 0], "The chaser was crushed by the gate on c1.")]
    assert result.final["enemies"] == [None]


def test_a_level_sets_how_long_a_gate_stays_open():
    level = make_level("P T G\n", legend={"T": {"tile": "timed_gate", "every": 5, "open": 3}}, api=API, start={"facing": "east"})
    gate = level.describe()["timed_gates"][0]
    assert (gate["pos"], gate["every"], gate["open"]) == ([1, 0], 5, 3)
    assert run_level(level, "pawn.wait()\npawn.move(2)").status == "solved"  # in on tick 1, out on tick 2: still open


def test_a_timed_gate_can_keep_time_with_the_code():
    level = make_level("P T G\n", legend={"T": {"tile": "timed_gate", "every": 2, "open": 1, "clock": "line"}}, start={"facing": "east"})
    assert run_level(level, "pawn.move(2)").status == "error"  # line 1 ticks it shut
    assert run_level(level, "x = 1\npawn.move(2)").status == "solved"  # two lines: open again, and no line runs while the pawn is under it


def test_the_new_line_clock_ticks_once_per_line():
    level = make_level("P T G\n", legend={"T": {"tile": "timed_gate", "every": 2, "open": 1, "clock": "new_line"}}, start={"facing": "east"})
    looped = "for i in range(3):\n    x = i\npawn.move(2)"  # 3 new lines: shut
    assert run_level(level, looped).status == "error"
    copied = "x = 0\nx = 1\nx = 2\npawn.move(2)"  # 4 new lines: open
    assert run_level(level, copied).status == "solved"


def test_timed_gates_are_described():
    level = make_level("P T G\n", legend={"T": {"tile": "timed_gate", "every": 3}}, start={"facing": "east"})
    described = level.describe()
    gate = described["timed_gates"][0]
    assert {key: gate[key] for key in ("pos", "every", "clock", "open")} == {"pos": [1, 0], "every": 3, "clock": "action", "open": 2}
    assert gate["text"] == described["obstacles"][0]  # the tooltip says what the Obstacles section says
    assert described["obstacles"] == [
        "The gate on b1 is open for 2 ticks, then shut for 1 tick, over and over, starting open. "
        "It ticks once for each square you move, each turn and each wait. "
        "Anything under it when it shuts is crushed: if that's you, the run is lost."
    ]


@pytest.mark.parametrize(
    ("meaning", "message"),
    [
        ({"tile": "timed_gate"}, "needs every"),
        ({"tile": "timed_gate", "every": 2}, "every must be more than its open \\(2\\)"),
        ({"tile": "timed_gate", "every": 4, "open": 0}, "needs open"),
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
    assert [event["message"] for event in events(result, "guard")] == [GUARD_MISCOUNTED]
    assert result.error.friendly == "The guard won't open the gate until you answer: \"What is two plus two?\"\nThe guard didn't accept what line 2 printed."


def test_the_guard_tells_a_miscount_from_words_it_cant_follow():
    # QA-030: the right words with the wrong number are a miscount; anything else, such as a typo, isn't understood.
    legend = {"X": {"tile": "gate", "question": "How far? Answer like this: I walked 5 squares.", "passphrase": "I walked 2 squares."}}
    level = make_level("G\nX\n.\nP\n", legend=legend, api=API)
    code = "pawn.move()\nprint('I walked 3 squares.')\nprint('I walked 2 steps.')\nprint('I walked 2 squares.')\npawn.move(2)"
    result = run_level(level, code)
    assert [event["message"] for event in events(result, "guard")] == [GUARD_MISCOUNTED, GUARD_NOT_UNDERSTOOD]
    assert result.status == "solved"


def test_the_question_is_shown_and_the_answer_is_not(toll):
    described = toll.describe()
    assert described["questions"] == [{"pos": [0, 2], "text": "What is two plus two?"}]
    assert 'The guard asks: "What is two plus two?" Print the answer next to the gate.' in described["goals"][1]
    assert '"4"' not in str(described)


# -- patrols and chasers ---------------------------------------------------------------------

API_ALL = [*API, "capture_left", "capture_right"]


def enemy_level(map_text, *enemies, **overrides):
    return make_level(map_text, enemies=list(enemies), api=API_ALL, **overrides)


def positions(result):
    return [event["state"]["enemies"] for event in events(result, "tick")]


@pytest.fixture
def sentry():
    """Pawn on a1 facing north; a patrol walking a2 to c2 and back, starting on c2; the goal on c1."""
    return enemy_level(". . .\nP . G\n", {"kind": "patrol", "start": "c2", "route": ["a2", "c2"]})


def test_a_patrol_walks_its_route_there_and_back(sentry):
    result = run_level(sentry, "pawn.turn_right()\n" + "pawn.wait()\n" * 4)
    assert positions(result) == [[[1, 1]], [[0, 1]], [[1, 1]], [[2, 1]], [[1, 1]]]
    assert sentry.describe()["start"]["enemies"] == [[2, 1]]


def test_a_patrol_that_lands_on_the_pawn_catches_it(sentry):
    result = run_level(sentry, "pawn.move()\npawn.wait()\npawn.turn_right()")
    assert result.status == "lost"
    assert result.summary == "Your pawn was caught by the patrol on a2."
    assert result.final["lost"] == [0, 1]
    assert result.error.line == 2


def test_walking_into_a_patrol_is_being_caught(sentry):
    result = run_level(sentry, "pawn.turn_right()\npawn.turn_left()\npawn.move()")  # the patrol is on a2 by then
    assert result.status == "lost"
    assert result.summary == "Your pawn was caught by the patrol on a2."


def test_slipping_past_a_patrol(sentry):
    assert run_level(sentry, "pawn.turn_right()\npawn.move(2)").status == "solved"


def test_a_loop_patrol_goes_round_and_round():
    level = enemy_level(". . . .\n. . . .\n. . . .\nP . . G\n", {"kind": "patrol", "route": ["b2", "d2", "d4", "b4"], "loop": True})
    result = run_level(level, "pawn.wait()\n" * 9)
    walked = [enemies[0] for enemies in positions(result)]
    assert walked == [[2, 1], [3, 1], [3, 2], [3, 3], [2, 3], [1, 3], [1, 2], [1, 1], [2, 1]]
    assert level.obstacles()[0] == (
        "A patrol starts on b2 and walks b2 to d2 to d4 to b4 to b2, round and round, "
        "one square for each square you move, each turn and each wait."
    )


def test_a_patrol_can_stand_guard():
    level = enemy_level("G . .\n. . .\nP . .\n", {"kind": "patrol", "start": "b2"})
    result = run_level(level, "pawn.wait()\npawn.wait()")
    assert positions(result) == [[[1, 1]], [[1, 1]]]
    assert level.obstacles()[0] == "A patrol stands guard on b2."


def test_a_chaser_steps_toward_the_pawn_along_the_bigger_gap():
    level = enemy_level(". . . . .\n. . . . .\nP . . . G\n", {"kind": "chaser", "start": "e3"})
    result = run_level(level, "pawn.wait()\n" * 6)
    walked = [enemies[0] for enemies in positions(result)]
    # west (the bigger gap), west, west on a tie, south, west on a tie, then onto the pawn
    assert walked == [[3, 2], [2, 2], [1, 2], [1, 1], [0, 1], [0, 0]]
    assert result.status == "lost"
    assert result.summary == "Your pawn was caught by the chaser on a1."


def test_a_blocked_chaser_tries_the_other_way_then_waits():
    level = make_level(". # .\nP . .\n", api=API_ALL, objectives=[{"say": "hi"}], enemies=[{"kind": "chaser", "start": "c2"}])
    # From c2, west (b2) is a wall, so it goes south to c1, then west to b1: next to the pawn.
    result = run_level(level, "pawn.wait()\npawn.wait()")
    assert [enemies[0] for enemies in positions(result)] == [[2, 0], [1, 0]]
    walled_in = make_level("P # .\n", api=API_ALL, objectives=[{"say": "hi"}], enemies=[{"kind": "chaser", "start": "c1"}])
    assert positions(run_level(walled_in, "pawn.wait()")) == [[[2, 0]]]


def test_a_clockwork_chaser_moves_on_new_lines_only():
    level = enemy_level("P . . . . . G\n", {"kind": "chaser", "start": "g1", "clock": "new_line"}, start={"facing": "east"})
    looped = run_level(level, "for i in range(5):\n    x = i")  # two new lines: two steps
    assert looped.final["enemies"] == [[4, 0]]
    copied = run_level(level, "x = 0\nx = 1\nx = 2\nx = 3\nx = 4")  # five new lines: five steps
    assert copied.final["enemies"] == [[1, 0]]
    assert "It steps one square toward you for each line of your code that runs for the first time" in level.obstacles()[0]


def test_being_caught_stays_lost_even_if_the_code_catches_it(sentry):
    code = "pawn.move()\ntry:\n    pawn.wait()\nexcept BaseException:\n    pass\npawn.turn_right()\npawn.move()"
    result = run_level(sentry, code)
    assert result.status == "lost"
    assert result.final["pos"] == [0, 1]


# -- capturing ---------------------------------------------------------------------------------


@pytest.fixture
def prey():
    """Pawn on b1 facing north; a patrol standing on a2, an armoured one on c2."""
    return make_level(
        ". . .\n. . .\n. P .\n",
        api=API_ALL,
        objectives=[{"capture": "all"}],
        enemies=[{"kind": "patrol", "start": "a2"}, {"kind": "patrol", "start": "c2", "armoured": True}],
    )


def test_capturing_takes_the_enemy_diagonally_forward(prey):
    result = run_level(prey, "pawn.capture_left()")
    assert result.status == "solved"
    assert result.final["pos"] == [0, 1]
    assert result.final["enemies"] == [None, [2, 1]]
    assert [event["kind"] for event in events(result)] == ["capture", "tick"]
    assert result.final["tick"] == 1


def test_an_armoured_enemy_cannot_be_captured(prey):
    result = run_level(prey, "pawn.capture_right()")
    assert result.error.type == "CaptureError"
    assert result.error.friendly == "The patrol on c2 is armoured: it can't be captured."


def test_capturing_nothing_is_an_error(prey):
    result = run_level(prey, "pawn.move()\npawn.capture_left()")  # from b2 facing north: a3
    assert result.error.friendly == "There's nothing to capture on a3."
    west = run_level(prey, "pawn.turn_left()\npawn.capture_right()")  # facing west from b1: forward-right is a2
    assert west.status == "solved"
    off = run_level(prey, "pawn.turn_right()\npawn.capture_right()")  # facing east from b1: forward-right is off the board
    assert off.error.friendly == "There's no square there to capture on: your pawn is on b1, at the edge of the board."


def test_the_capture_objective(prey):
    assert prey.goals() == ["Capture the enemy that can be taken."]
    result = run_level(prey, "pawn.wait()")
    assert result.summary == "Your program finished, but you captured 0 of the 1 enemy that can be taken."
    assert "It's armoured: it can't be captured." in prey.obstacles()[1]


def test_the_ui_gets_each_enemys_route_and_marks(prey):
    described = prey.describe()
    assert described["enemies"][1] == {"kind": "patrol", "route": [[2, 1]], "loop": False, "clock": "action", "armoured": True}


@pytest.mark.parametrize(
    ("enemy", "message"),
    [
        ({"kind": "knight", "start": "a2"}, "kind must be patrol or chaser"),
        ({"kind": "patrol", "route": ["a2", "c3"]}, "isn't a straight line"),
        ({"kind": "patrol", "route": ["b2", "d2"]}, "d2 isn't on the board"),
        ({"kind": "patrol", "route": ["a3", "c3"]}, "is a wall"),
        ({"kind": "patrol", "start": "b1"}, "starts on the pawn's square"),
        ({"kind": "patrol", "start": "c2", "route": ["a2", "b2"]}, "isn't on its route"),
        ({"kind": "chaser", "start": "a2", "route": ["a2"]}, "a chaser doesn't take route"),
        ({"kind": "chaser", "start": "a2", "strategy": "cunning"}, "strategy must be one of simple"),
        ({"kind": "chaser", "start": "a2", "clock": "hourly"}, "clock must be one of"),
        ({"kind": "patrol", "start": "2a"}, "isn't a square"),
    ],
)
def test_enemies_are_checked(enemy, message):
    with pytest.raises(LevelError, match=message):
        make_level("# # #\n. . .\n. P G\n", enemies=[enemy])


def test_the_capture_objective_is_checked():
    with pytest.raises(LevelError, match="isn't armoured"):
        make_level(". .\nP G\n", objectives=[{"capture": "all"}], enemies=[{"kind": "patrol", "start": "a2", "armoured": True}])


# -- QA-017: pits that swallow chasers, and planks that bridge them -----------------------

BRIDGE_API = [*API, "bridge"]


@pytest.fixture
def plank_walk():
    """Pawn on a1 facing east; a plank on b1; a pit on c1; the goal on d1."""
    return make_level("P L O G\n", legend={"L": "plank", "O": "pit"}, api=BRIDGE_API, start={"facing": "east"})


def test_walking_over_a_plank_picks_it_up(plank_walk):
    result = run_level(plank_walk, "pawn.move()")
    picked = events(result, "pick_up")
    assert [(event["at"], event["message"]) for event in picked] == [([1, 0], "Your pawn picked up a plank. It's carrying 1 plank.")]
    assert result.final["planks"] == 1
    assert result.final["collected"] == [[1, 0]]


def test_a_plank_bridges_the_pit_ahead(plank_walk):
    result = run_level(plank_walk, "pawn.move()\npawn.bridge()\npawn.move(2)")
    assert result.status == "solved"
    assert result.final["bridged"] == [[2, 0]]
    assert result.final["planks"] == 0
    assert result.final["tick"] == 4  # the bridge is an action, like a step


def test_bridging_needs_a_plank_and_a_pit(plank_walk):
    none = run_level(make_level("P O G\n", legend={"O": "pit"}, api=BRIDGE_API, start={"facing": "east"}), "pawn.bridge()")
    assert none.error.type == "BridgeError"
    assert none.error.friendly == "Your pawn has no plank to lay. Walk over one to pick it up."
    floor = run_level(plank_walk, "pawn.bridge()")  # b1 has the plank on it, not a pit
    assert floor.error.friendly == "Planks only go over pits, and there's no open pit on b1."
    twice = run_level(make_level("P O G\n", legend={"O": "pit"}, api=BRIDGE_API, start={"facing": "east", "planks": 2}), "pawn.bridge()\npawn.bridge()")
    assert twice.error.friendly == "Planks only go over pits, and there's no open pit on b1."
    edge = run_level(plank_walk, "pawn.turn_left()\npawn.bridge()")
    assert edge.error.friendly == "There's nothing ahead to bridge: your pawn is at the edge of the board."


def test_a_level_can_hand_out_planks_at_the_start():
    level = make_level("P O G\n", legend={"O": "pit"}, api=BRIDGE_API, start={"facing": "east", "planks": 1})
    assert level.describe()["start"]["planks"] == 1
    assert run_level(level, "pawn.bridge()\npawn.move(2)").status == "solved"
    with pytest.raises(LevelError, match="start takes facing and planks"):
        make_level("P G\n", start={"facing": "east", "gems": 1})
    with pytest.raises(LevelError, match="start planks must be a whole number"):
        make_level("P G\n", start={"planks": -1})


@pytest.fixture
def pitfall():
    """Pawn on a1 facing north; a pit on c1; a chaser on d1, with the pit between it and the pawn; the goal on a3."""
    return make_level("G . . .\n. . . .\nP . O .\n", legend={"O": "pit"}, api=BRIDGE_API, enemies=[{"kind": "chaser", "start": "d1"}])


def test_a_chaser_that_steps_into_a_pit_falls_in(pitfall):
    result = run_level(pitfall, "pawn.wait()\npawn.wait()")
    fell = events(result, "fall")
    assert [(event["at"], event["message"]) for event in fell] == [([2, 0], "The chaser fell into the pit on c1.")]
    assert positions(result)[0] == [[2, 0]]  # the step into the pit is shown, then the fall
    assert result.final["enemies"] == [None]
    assert "A chaser doesn't see pits: if its step lands on one, it falls in and is gone." in pitfall.obstacles()


def test_a_bridged_pit_is_floor_for_enemies_too():
    level = make_level("P O . .\n", legend={"O": "pit"}, api=BRIDGE_API, objectives=[{"say": "x"}], start={"facing": "east", "planks": 1},
                       enemies=[{"kind": "chaser", "start": "d1"}])
    result = run_level(level, "pawn.bridge()\npawn.wait()")  # the chaser steps to c1, then onto the bridge on b1
    assert events(result, "fall") == []
    assert result.final["enemies"] == [[1, 0]]


def test_the_obstacles_explain_bridging(plank_walk):
    assert plank_walk.obstacles()[1] == "A plank laid over a pit (`bridge()`) makes it safe to cross. Walk over a plank to pick it up."


# -- QA-021: clockwork shows its count, and says it stands still ----------------------------


def test_the_state_counts_code_clock_ticks_only_when_something_uses_them():
    level = enemy_level("P . . . . . G\n", {"kind": "patrol", "route": ["c1", "e1"], "clock": "new_line"}, start={"facing": "east"})
    result = run_level(level, "for i in range(3):\n    x = i")
    assert level.describe()["start"]["clock_ticks"] == {"new_line": 0}
    assert result.final["clock_ticks"] == {"new_line": 2}  # two new lines; the loop repeating them adds nothing
    plain = run_level(make_level("G\nP\n"), "pawn.move()")
    assert "clock_ticks" not in plain.final


def test_a_new_line_patrol_says_it_stands_still_while_lines_repeat():
    level = enemy_level("P . . . . . G\n", {"kind": "patrol", "route": ["c1", "e1"], "clock": "new_line"}, start={"facing": "east"})
    assert level.obstacles()[0].endswith("While your code only repeats lines that have already run, it stands still.")
