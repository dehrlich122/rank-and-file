"""Search a level for its shortest solution, without showing it (M3.1).

    .venv/Scripts/python scripts/solve.py levels/practice/practice-04.yaml [...]

For each level it prints whether plain calls can solve it (moving, turning,
waiting, capturing, and printing a gate's passphrase), the fewest lines of
code that do, and how many actions that takes. It never prints the route or
the code: the designer is also the game's learner (see CLAUDE.md: no
spoilers). It's for checking a map while designing it; a level generator can
import `fewest_lines` and `write_code` to write reference solutions blind.

The search plays the real engine: a World and the level's piece, called the
way player code calls it, so what it finds is what the game does. Code clocks
(`line`, `new_line`) depend on how the code is written, not just on the
route, so levels with clockwork obstacles are beyond it.
"""

import sys
from heapq import heappop, heappush
from itertools import count, groupby
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "engine"))

from rankfile.constraints import code_lines  # noqa: E402
from rankfile.exceptions import GameError, Lost  # noqa: E402
from rankfile.levels import Level, parse_level  # noqa: E402
from rankfile.pieces import PIECES  # noqa: E402
from rankfile.runner import unmet_objectives  # noqa: E402
from rankfile.world import World  # noqa: E402

MAX_STATES = 400_000
CALLS = ("move", "turn_left", "turn_right", "wait", "capture_left", "capture_right", "bridge")
TURNS = ("turn_left", "turn_right")


def fewest_lines(level: Level) -> list[tuple] | None:
    """The actions of a solution with the fewest lines of code, or None.

    Consecutive steps share one line (`pawn.move(3)`): a step right after a
    step is free, anything else costs a line. Among the shortest programs it
    takes one with the fewest turns. A turn spends a tick just like `wait()`,
    so without that the search would sometimes pass time by spinning on the
    spot (QA-026).
    """
    start = World(level)
    if start.code_clocked:
        raise ValueError(f"{level.id}: clockwork obstacles depend on how the code is written; solve it by hand")
    actions = _actions(level)
    first = _key(start, "", "")
    order = count()  # breaks ties between equal costs, so worlds are never compared
    queue = [((0, 0), next(order), first, start, (), "")]
    best = {first: (0, 0)}  # the cheapest (lines, turns) that reach each state
    while queue:
        (lines, turns), _, key, world, path, said = heappop(queue)
        if best[key] < (lines, turns):
            continue  # reached more cheaply since
        if not level.nothing_to_do and not unmet_objectives(level, world, said):
            return list(path)
        for action in actions:
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
            if len(best) > MAX_STATES:
                return None
            heappush(queue, (next_cost, next(order), next_key, after, (*path, action), spoken))
    return None


def write_code(level: Level, actions: list[tuple]) -> list[str]:
    """The actions as Python, one call per line, with steps in a row merged into move(n)."""
    lines, piece = [], level.piece
    for name, run in groupby(actions, key=lambda action: action[0] if action[0] == "move" else action):
        if name == "move":
            squares = len(list(run))
            lines.append(f"{piece}.move({squares if squares > 1 else ''})")
        else:
            lines.extend(f"print({action[1]!r})" if action[0] == "say" else f"{piece}.{action[0]}()" for action in run)
    return lines


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


def main(paths: list[str]) -> None:
    for name in paths:
        level = parse_level(yaml.safe_load(Path(name).read_text(encoding="utf-8")))
        actions = fewest_lines(level)
        if actions is None:
            print(f"{level.id}: no solution with plain calls")
            continue
        lines = code_lines("\n".join(write_code(level, actions)))
        print(f"{level.id}: solvable in {lines} lines of code, {len(actions)} actions (par is {level.par.lines})")


if __name__ == "__main__":
    main(sys.argv[1:])
