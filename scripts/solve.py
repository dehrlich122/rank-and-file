"""Search a level for its shortest solution, without showing it (M3.1).

    .venv/Scripts/python scripts/solve.py levels/practice/practice-04.yaml [...]

For each level it prints whether plain calls can solve it (moving, turning,
waiting, capturing, and printing a gate's passphrase), the fewest lines of
code that do, and how many ticks that takes. It never prints the route or the
code: the designer is also the game's learner (see CLAUDE.md: no spoilers).
It's for checking a map while designing it; other scripts import
`fewest_lines` and `write_code` to write reference solutions blind.

The search runs the real engine's World (pits, gates, enemies and their
clocks), so what it finds is what the game does. Code clocks (`line`,
`new_line`) depend on how the code is written, not just on the route, so
levels with clockwork obstacles are beyond it.
"""

import sys
from collections import deque
from dataclasses import replace
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "engine"))

from rankfile.constraints import code_lines  # noqa: E402
from rankfile.exceptions import GameError, Lost  # noqa: E402
from rankfile.levels import Level, parse_level  # noqa: E402
from rankfile.runner import unmet_objectives  # noqa: E402
from rankfile.world import World  # noqa: E402

MAX_STATES = 400_000
CALLS = ("turn_left", "turn_right", "wait", "capture_left", "capture_right")


def fewest_lines(level: Level) -> list[tuple] | None:
    """The actions of a solution with the fewest lines of code, or None.

    Consecutive steps share one line (`pawn.move(3)`), so it's a 0-1 search:
    a step right after a step is free, anything else costs a line.
    """
    if any(enemy.clock != "action" for enemy in level.enemies) or any(t.clock != "action" for t in level.board.timers.values()):
        raise ValueError(f"{level.id}: clockwork obstacles depend on how the code is written; solve it by hand")
    start = World(level)
    queue = deque([(0, start, (), "")])
    best = {_key(start, "", ""): 0}  # the fewest lines that reach each state
    while queue:
        lines, world, actions, said = queue.popleft()
        if best.get(_key(world, actions[-1][0] if actions else "", said), lines) < lines:
            continue  # reached more cheaply since
        if not unmet_objectives(level, world, said) and not level.objectives.empty:
            return list(actions)
        for action in _actions(level, world):
            after = _try(world, action)
            if after is None:
                continue
            spoken = said + action[1] + "\n" if action[0] == "say" else said
            free = action[0] == "move" and bool(actions) and actions[-1][0] == "move"
            cost = lines + (0 if free else 1)
            key = _key(after, action[0], spoken)
            if best.get(key, cost + 1) <= cost:
                continue
            best[key] = cost
            if len(best) > MAX_STATES:
                return None
            item = (cost, after, (*actions, action), spoken)
            queue.appendleft(item) if free else queue.append(item)
    return None


def write_code(level: Level, actions: list[tuple]) -> list[str]:
    """The actions as Python, one call per line, with steps in a row merged into move(n)."""
    lines, piece = [], level.piece
    for action in actions:
        if action[0] == "move" and lines and lines[-1].startswith(f"{piece}.move("):
            squares = int(lines[-1][len(piece) + 6 : -1] or 1) + 1
            lines[-1] = f"{piece}.move({squares})"
        elif action[0] == "move":
            lines.append(f"{piece}.move()")
        elif action[0] == "say":
            lines.append(f"print({action[1]!r})")
        else:
            lines.append(f"{piece}.{action[0]}()")
    return lines


def _actions(level: Level, world: World) -> list[tuple]:
    actions = [("move",)] + [(name,) for name in CALLS if name in level.api]
    phrases = {phrase for phrase in level.board.gates.values()} | set(level.objectives.say)
    return actions + [("say", phrase) for phrase in sorted(phrases)]


def _try(world: World, action: tuple) -> World | None:
    after = _clone(world)
    try:
        if action[0] == "move":
            after.move_forward()
        elif action[0] == "say":
            after.hear(action[1])
        elif action[0].startswith("capture_"):
            after.capture(action[0].removeprefix("capture_"))
        else:
            getattr(after, action[0])()
    except (GameError, Lost):
        return None
    return after


def _clone(world: World) -> World:
    copy = World(world.level)
    copy.pos, copy.facing = world.pos, world.facing
    copy.opened, copy.refused = set(world.opened), dict(world.refused)
    copy.crossed, copy.collected = set(world.crossed), set(world.collected)
    copy.ticks = dict(world.ticks)
    copy.foes = [replace(foe) for foe in world.foes]
    return copy


def _key(world: World, last: str, said: str) -> tuple:
    timers = tuple(world.ticks["action"] % timer.every for timer in world.board.timers.values())
    foes = tuple((foe.pos, foe.index, foe.heading, foe.captured) for foe in world.foes)
    return (world.pos, world.facing, frozenset(world.opened), frozenset(world.crossed), frozenset(world.collected), foes, timers, said, last == "move")


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
