"""Search a level for a route, without ever showing it (M3.1, moved into the engine in M4.3).

The search plays the real engine: a World and the level's piece, called the way player code calls it, so what it
finds is what the game does. It tries the plain calls: moving, turning, waiting, capturing, bridging, and saying a
phrase the level knows (a gate's passphrase, or one an objective asks for). It can't read runes, use `look()`, count
or loop, so it can't judge *programs*; it says whether a route exists and how many lines the plain calls need.

It reports counts and words only. A route is kept in the search for the scripts that write reference solutions
(`scripts/solve.py`), never put into anything the UI receives.

The level editor (M4.3) runs it in short slices (`Search.step`), so one request never nears the worker's 3 s
watchdog, and a big board (many gems, an enemy) can be cancelled by not asking again.

Code clocks (`line`, `new_line`) depend on how the code is written, not just on the route, so levels with
clockwork obstacles are beyond it.
"""

import time
from heapq import heappop, heappush
from itertools import count

from .exceptions import GameError, Lost
from .levels import Case, Level
from .pieces import PIECES
from .runner import unmet_objectives
from .world import World

MAX_STATES = 200_000  # positions kept per board before it gives up
CALLS = ("move", "turn_left", "turn_right", "wait", "capture_left", "capture_right", "bridge")
TURNS = ("turn_left", "turn_right")

ROUTE, NO_ROUTE, GAVE_UP, CLOCKS = "route", "no_route", "gave_up", "clocks"


class RouteSearch:
    """The cheapest route on one board: fewest lines of plain calls, then fewest turns.

    Consecutive steps share one line (`pawn.move(3)`): a step right after a step is free, anything else costs a
    line. Among the shortest programs it takes one with the fewest turns. A turn spends a tick just like `wait()`,
    so without that the search would sometimes pass time by spinning on the spot (QA-026).
    """

    def __init__(self, level: Level, max_states: int = MAX_STATES):
        self.level = level
        self.max_states = max_states
        self.status: str | None = None  # None while searching; then ROUTE, NO_ROUTE, GAVE_UP or CLOCKS
        self.actions: list[tuple] = []  # the route, when there is one
        self.lines = 0  # lines of code it takes
        start = World(level)
        if start.code_clocked:
            self.status = CLOCKS
            return
        self._actions = _actions(level)
        first = _key(start, "", "")
        self._order = count()  # breaks ties between equal costs, so worlds are never compared
        self._queue = [((0, 0), next(self._order), first, start, (), "")]
        self._best = {first: (0, 0)}  # the cheapest (lines, turns) that reach each state

    @property
    def positions(self) -> int:
        """How many positions it has reached so far."""
        return len(self._best) if self.status != CLOCKS else 0

    def run(self, seconds: float | None = None) -> bool:
        """Search for up to `seconds` (no limit if None). True once it has an answer."""
        if self.status is not None:
            return True
        deadline = None if seconds is None else time.perf_counter() + seconds
        level, queue, best = self.level, self._queue, self._best
        while queue:
            if deadline is not None and time.perf_counter() > deadline:
                return False
            (lines, turns), _, key, world, path, said = heappop(queue)
            if best[key] < (lines, turns):
                continue  # reached more cheaply since
            if not level.nothing_to_do and not unmet_objectives(level, world, said):
                self.status, self.actions, self.lines = ROUTE, list(path), lines
                return True
            for action in self._actions:
                after = _try(level, world, action)
                if after is None:
                    continue
                spoken = said + action[1] + "\n" if action[0] == "say" else said
                free = action[0] == "move" and bool(path) and path[-1][0] == "move"
                next_cost = (lines + (0 if free else 1), turns + (action[0] in TURNS))
                next_key = _key(after, action[0], spoken)
                if next_key in best and best[next_key] <= next_cost:
                    continue
                best[next_key] = next_cost
                if len(best) > self.max_states:
                    self.status = GAVE_UP
                    return True
                heappush(queue, (next_cost, next(self._order), next_key, after, (*path, action), spoken))
        self.status = NO_ROUTE
        return True


class Search:
    """Every case of a level in turn (each place a hidden goal could be, or each board), in slices."""

    def __init__(self, level: Level, max_states: int = MAX_STATES):
        self.cases: list[Case] = level.cases()
        self._searches = [RouteSearch(case.level, max_states) for case in self.cases]
        self._current = 0

    @property
    def done(self) -> bool:
        return self._current >= len(self._searches)

    def step(self, seconds: float) -> dict:
        """Work for about `seconds`, then say how far it got. Counts and words only: never the route."""
        deadline = time.perf_counter() + seconds
        while not self.done and self._searches[self._current].run(max(0.0, deadline - time.perf_counter())):
            self._current += 1
            if time.perf_counter() > deadline:
                break
        shown = min(self._current, len(self._searches) - 1)
        return {
            "done": self.done,
            "case": shown + 1,
            "cases": len(self.cases),
            "positions": self._searches[shown].positions,
            "results": [self._result(i) for i in range(self._current)],
        }

    def _result(self, index: int) -> dict:
        case, search = self.cases[index], self._searches[index]
        return {"label": case.label, "where": case.where, "status": search.status, "lines": search.lines if search.status == ROUTE else None, "positions": search.positions}

    def route(self, index: int = 0) -> list[tuple] | None:
        """The actions of a case's route, for the scripts that write reference solutions. Never sent to the UI."""
        search = self._searches[index]
        return search.actions if search.status == ROUTE else None


def _actions(level: Level) -> list[tuple]:
    """Everything the piece can try on this level: its abilities, and saying each phrase the level knows."""
    phrases = set(level.board.gates.values()) | set(level.objectives.say)
    return [(name,) for name in CALLS if name in level.api or name == "move"] + [("say", phrase) for phrase in sorted(phrases)]


def _try(level: Level, world: World, action: tuple) -> World | None:
    """The world after one action, played as player code would, or None if it fails or loses."""
    after = world.copy()
    try:
        if action[0] == "say":
            after.hear(action[1])
        else:
            getattr(PIECES[level.piece](after, level.api), action[0])()
    except (GameError, Lost):
        return None
    return after


def _key(world: World, last: str, said: str) -> tuple:
    """Everything that decides what can happen next (and whether a step is free)."""
    timers = tuple(world.ticks["action"] % timer.every for timer in world.board.timers.values())
    foes = tuple((foe.pos, foe.index, foe.heading, foe.gone) for foe in world.foes)
    return (world.pos, world.facing, frozenset(world.opened), frozenset(world.crossed), frozenset(world.collected), frozenset(world.bridged), foes, timers, said, last == "move")
