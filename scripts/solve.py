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
from itertools import groupby
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "engine"))

from rankfile.constraints import code_lines  # noqa: E402
from rankfile.levels import Level, parse_level  # noqa: E402
from rankfile.search import CLOCKS, ROUTE, RouteSearch  # noqa: E402

MAX_STATES = 400_000  # the scripts can afford more than the editor's check (rankfile.search.MAX_STATES)


def fewest_lines(level: Level) -> list[tuple] | None:
    """The actions of a solution with the fewest lines of code, or None.

    The search itself is `rankfile.search` (the level editor's solvability check runs the same one, in slices).
    Here it runs to the end; `ValueError` for a level with clockwork obstacles, which it can't judge.
    """
    search = RouteSearch(level, MAX_STATES)
    search.run()
    if search.status == CLOCKS:
        raise ValueError(f"{level.id}: clockwork obstacles depend on how the code is written; solve it by hand")
    return search.actions if search.status == ROUTE else None


def write_code(level: Level, actions: list[tuple]) -> list[str]:
    """The actions as Python, one call per line, with steps in a row merged into move(n)."""
    lines, piece = [], level.piece
    for name, run in groupby(actions, key=lambda action: action[0] if action[0] == "move" else action):
        if name == "move":
            lines.append(move_call(piece, len(list(run))))
        else:
            lines.extend(f"print({action[1]!r})" if action[0] == "say" else f"{piece}.{action[0]}()" for action in run)
    return lines


def move_call(piece: str, squares: int) -> str:
    """A call walking `squares` squares: `pawn.move()` for one, `pawn.move(3)` for more."""
    return f"{piece}.move({squares if squares > 1 else ''})"


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
