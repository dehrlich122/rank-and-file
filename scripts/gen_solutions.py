"""Generate reference and naive solutions for levels, without ever showing them.

    .venv/Scripts/python scripts/gen_solutions.py             # every level listed below
    .venv/Scripts/python scripts/gen_solutions.py ch01-l04    # just one

For each level it searches the board for a route that needs the fewest lines
of code (tracking the pawn's square, which way it faces, and which gates are
open), writes that route as Python (the reference solution), and writes the
level's naive variants: plausible wrong attempts that must fail, each starting
with `# expect: <outcome> [ErrorType]` for engine/tests/test_levels.py.

It prints file names and line counts only, never code. The designer is also
the game's learner (see CLAUDE.md: no spoilers).
"""

import sys
from collections import deque
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "engine"))

from rankfile.board import Tile, step  # noqa: E402
from rankfile.constraints import code_lines  # noqa: E402
from rankfile.levels import Level, parse_level  # noqa: E402

# Per level: how the reference is written, and which wrong attempts to write.
# A naive entry is (file suffix, expected outcome, description, transform).
LEVELS = {
    "ch01-l01": {
        "compress": False,  # this level teaches plain calls, one step per call
        "naive": [("naive", "incomplete", "forgot the parentheses, so nothing is called", "no_parens")],
    },
    "ch01-l02": {
        "naive": [("naive", "constraint", "one call per square: too many lines", "unrolled")],
    },
    "ch01-l03": {
        "naive": [
            ("naive", "error BlockedError", "right instructions, wrong order: turning before walking", "turns_first"),
            ("naive2", "error BlockedError", "right instructions, wrong order: walking before turning", "moves_first"),
        ],
    },
    "ch01-l04": {
        "naive": [
            ("naive", "error GateLockedError", "says the passphrase before reaching the gate", "say_first"),
            ("naive2", "error GateLockedError", "walks up to the gate without saying anything", "no_say"),
            ("naive3", "error GateLockedError", "prints the passphrase with its quote marks", "say_with_quotes"),
            ("naive4", "error GateLockedError", "the passphrase in the wrong case", "say_lowercase"),
        ],
    },
    "ch01-l05": {
        "naive": [
            ("naive", "constraint", "every step on its own line: far too many lines", "unrolled"),
            ("naive2", "error GateLockedError", "the old route, with nothing said at the gate", "no_say"),
            ("naive3", "error GateLockedError", "says the passphrase too early, far from the gate", "say_first"),
            ("naive4", "error GateLockedError", "a near miss on the passphrase", "say_lowercase"),
        ],
    },
}


def load(level_id: str) -> tuple[Level, Path]:
    chapter = level_id.split("-")[0]
    path = ROOT / "levels" / chapter / f"{level_id}.yaml"
    return parse_level(yaml.safe_load(path.read_text(encoding="utf-8"))), ROOT / "solutions" / chapter


def fewest_lines_route(level: Level) -> list:
    """Actions ("M", "L", "R" or ("SAY", gate)) for a route with the fewest lines.

    A 0-1 breadth-first search: continuing a straight run of moves costs no new
    line (it becomes `move(n)`); every other action costs one line.
    """
    start = (level.start, level.facing, frozenset(), False)
    best = {start: 0}
    came_from: dict = {start: None}
    queue = deque([start])
    while queue:
        state = queue.popleft()
        pos, facing, opened, moving = state
        if pos == level.goal:
            break
        for action, nxt, cost in _options(level, state):
            new_cost = best[state] + cost
            if new_cost < best.get(nxt, 1 << 30):
                best[nxt] = new_cost
                came_from[nxt] = (state, action)
                (queue.appendleft if cost == 0 else queue.append)(nxt)
    else:
        raise SystemExit(f"{level.id}: no route to the goal")
    actions = []
    while came_from[state] is not None:
        state, action = came_from[state]
        actions.append(action)
    return actions[::-1]


def _options(level: Level, state):
    pos, facing, opened, moving = state
    board = level.board
    ahead = step(pos, facing)
    if not board.blocked(ahead) and (board.tile(ahead) is not Tile.GATE or ahead in opened):
        yield "M", (ahead, facing, opened, True), 0 if moving else 1
    yield "L", (pos, facing.turned_left(), opened, False), 1
    yield "R", (pos, facing.turned_right(), opened, False), 1
    for gate in board.neighbours(pos):
        if board.tile(gate) is Tile.GATE and gate not in opened:
            yield ("SAY", gate), (pos, facing, opened | {gate}, False), 1


def write_code(level: Level, actions: list, *, compress=True, parens=True, say=lambda phrase: phrase) -> list[str]:
    piece, call = level.piece, "()" if parens else ""
    lines: list[str] = []
    i = 0
    while i < len(actions):
        action = actions[i]
        if action == "M":
            run = 1
            while i + run < len(actions) and actions[i + run] == "M":
                run += 1
            if compress and run > 1:
                lines.append(f"{piece}.move({run})")
            else:
                lines.extend([f"{piece}.move{call}"] * run)
            i += run
            continue
        if action in ("L", "R"):
            lines.append(f"{piece}.turn_{'left' if action == 'L' else 'right'}{call}")
        else:
            lines.append(f"print({_python_string(say(level.board.gates[action[1]]))})")
        i += 1
    return lines


def _python_string(text: str) -> str:
    return '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"'


TRANSFORMS = {
    "unrolled": lambda level, acts: write_code(level, acts, compress=False),
    "no_parens": lambda level, acts: write_code(level, acts, compress=False, parens=False),
    "turns_first": lambda level, acts: write_code(level, [a for a in acts if a != "M"] + [a for a in acts if a == "M"]),
    "moves_first": lambda level, acts: write_code(level, [a for a in acts if a == "M"] + [a for a in acts if a != "M"]),
    "no_say": lambda level, acts: write_code(level, [a for a in acts if not isinstance(a, tuple)]),
    "say_first": lambda level, acts: write_code(
        level, [a for a in acts if isinstance(a, tuple)] + [a for a in acts if not isinstance(a, tuple)]
    ),
    "say_with_quotes": lambda level, acts: write_code(level, acts, say=lambda phrase: f"'{phrase}'"),
    "say_lowercase": lambda level, acts: write_code(level, acts, say=str.lower),
}


def save(path: Path, lines: list[str]) -> None:
    path.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


def generate(level_id: str) -> None:
    spec = LEVELS[level_id]
    level, out = load(level_id)
    actions = fewest_lines_route(level)
    header = [line for line in level.starter.splitlines() if line.strip()]
    reference = header + write_code(level, actions, compress=spec.get("compress", True))
    save(out / f"{level_id}.py", reference)
    print(f"wrote {level_id}.py: {code_lines(chr(10).join(reference))} lines of code (fewest possible for this route style)")
    for suffix, expect, description, transform in spec["naive"]:
        lines = [f"# expect: {expect}", f"# {description}"] + TRANSFORMS[transform](level, actions)
        save(out / f"{level_id}.{suffix}.py", lines)
        print(f"wrote {level_id}.{suffix}.py: expects {expect}")


if __name__ == "__main__":
    for level_id in sys.argv[1:] or list(LEVELS):
        generate(level_id)
