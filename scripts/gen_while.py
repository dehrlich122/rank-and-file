"""Chapter 5's search for programs with `while` loops, written blind (M3.5).

    .venv/Scripts/python scripts/gen_while.py probe             # check every draft board
    .venv/Scripts/python scripts/gen_while.py probe ch05-l01    # just one

A level is one level on several boards (or hidden-goal squares), and one program
has to solve them all. `solve.py` can't search this: its routes are plain calls,
and a `while` is exactly what a plain-call route can't say. So this script
enumerates small programs from a grammar of lines, runs each on the real engine
with `run_level`, and keeps the shortest that solves every board:
- statements: the level's own calls, plus `break` and `continue` inside a loop;
- blocks: `while`, `for` over a fixed `range()`, `if`, `if`/`else`;
- conditions: only the ones a draft lists (what the board can be asked).

`probe` is for designing a level: it prints, for each draft, the fewest lines of
any program and of the shortest ones that avoid `while`, avoid `for`, or avoid
`break`, so the spec can say what makes each concept necessary. It never prints
a program: the designer is also the game's learner (see CLAUDE.md: no spoilers).
"""

import sys
from itertools import product

import yaml
from levelgen import yaml_text  # first: it puts the engine on the import path
from solve import fewest_lines, write_code

from rankfile.constraints import code_lines
from rankfile.levels import Level, parse_level
from rankfile.runner import run_level

BUDGET = 400  # lines of player code a candidate may run before it counts as endless

# A program is a tuple of items; an item is a line (a string) or a block
# (header, body, else_body | None). Rendering is the only place text is made.
Item = str | tuple


def render(program: tuple, indent: int = 0) -> list[str]:
    pad = "    " * indent
    lines = []
    for item in program:
        if isinstance(item, str):
            lines.append(pad + item)
            continue
        header, body, other = item
        lines += [pad + header + ":", *render(body, indent + 1)]
        if other is not None:
            lines += [pad + "else:", *render(other, indent + 1)]
    return lines


def text_of(program: tuple) -> str:
    return "\n".join(render(program)) + "\n"


def uses(program: tuple, word: str) -> bool:
    for item in program:
        if isinstance(item, str):
            if item == word:
                return True
        elif item[0].startswith(word) or uses(item[1], word) or (item[2] is not None and uses(item[2], word)):
            return True
    return False


class Grammar:
    """Every program of exactly n lines, built from a draft's calls and conditions."""

    def __init__(self, calls: list[str], conds: list[str], ranges: list[int], *, statements=(), loops=("while", "for")):
        self.calls, self.conds, self.ranges, self.loops = calls, conds, ranges, loops
        self.statements = list(statements)  # lines that aren't calls on the piece, e.g. "steps += 1"
        self.cache: dict[tuple, list[tuple]] = {}

    def headers(self) -> list[str]:
        found = []
        if "while" in self.loops:
            found += [f"while {cond}" for cond in self.conds]
        if "for" in self.loops:
            found += [f"for _ in range({n})" for n in self.ranges]
        return found

    def sequences(self, n: int, in_loop: bool, depth: int) -> list[tuple]:
        """Programs of n lines, as a tuple of items."""
        key = (n, in_loop, depth)
        if key in self.cache:
            return self.cache[key]
        made: list[tuple] = []
        for first in range(1, n + 1):
            for item in self.items(first, in_loop, depth):
                if first == n:
                    made.append((item,))
                else:
                    made += [(item, *rest) for rest in self.sequences(n - first, in_loop, depth)]
        self.cache[key] = made
        return made

    def items(self, n: int, in_loop: bool, depth: int) -> list[Item]:
        if n == 1:
            simple: list[Item] = [f"pawn.{call}" for call in self.calls] + self.statements
            return simple + (["break", "continue"] if in_loop else [])
        if depth == 0 or n < 2:
            return []
        found: list[Item] = []
        for header in self.headers():
            found += [(header, body, None) for body in self.sequences(n - 1, True, depth - 1)]
        for cond in self.conds:
            found += [(f"if {cond}", body, None) for body in self.sequences(n - 1, in_loop, depth - 1)]
        for cond in self.conds:
            for then in range(1, n - 2 + 1):
                for yes, no in product(self.sequences(then, in_loop, depth - 1), self.sequences(n - 1 - then - 1, in_loop, depth - 1)):
                    found.append((f"if {cond}", yes, no))
        if "while" in self.loops:
            found += [("while True", body, None) for body in self.sequences(n - 1, True, depth - 1) if uses(body, "break")]
        return found


# What a solving program can be told apart by, so one pass answers every question.
KINDS = {  # name: (words it must avoid, words it must use)
    "any program": ((), ()),
    "without while": (("while",), ()),
    "without for": (("for",), ()),
    "without break": (("break",), ()),
    "using break": ((), ("break",)),
    "without while or for": (("while", "for"), ()),
}


def survey(level: Level, grammar: Grammar, max_lines: int, *, before="", after="") -> dict[str, tuple[int, int]]:
    """For each kind of program in KINDS: (fewest lines, how many programs of that length
    solve every board). One pass over each length, shortest first, until every kind has an
    answer or `max_lines` is reached. `before` and `after` are lines every program starts and
    ends with (a counter's setup, say); `lines` counts only the searched part."""
    found: dict[str, tuple[int, int]] = {}
    for lines in range(1, max_lines + 1):
        counts = dict.fromkeys(KINDS, 0)
        for program in grammar.sequences(lines, False, 2):
            code = before + text_of(program) + after
            if code_lines(code) != code_lines(before) + lines + code_lines(after):
                continue
            if run_level(level, code, line_budget=BUDGET, enforce_constraints=False).status != "solved":
                continue
            for kind, (banned, needed) in KINDS.items():
                if not any(uses(program, word) for word in banned) and all(uses(program, word) for word in needed):
                    counts[kind] += 1
        for kind, number in counts.items():
            if number and kind not in found:
                found[kind] = (lines, number)
        if len(found) == len(KINDS):
            break
    return found


def road(*legs: int, turn: str = "left", guard: bool = False) -> str:
    """A one-square-wide road, as map text: it starts facing north, goes `legs[0]` squares,
    turns (left, or right) and goes `legs[1]`, and so on. Everything off the road is wall.
    With `guard`, a gate (X) stands on the square before the goal."""
    ahead = [(0, 1), (-1, 0), (0, -1), (1, 0)]  # north, west, south, east: a left turn is +1
    step = 1 if turn == "left" else -1
    here, way, squares = (0, 0), 0, [(0, 0)]
    for leg in legs:
        for _ in range(leg):
            here = (here[0] + ahead[way][0], here[1] + ahead[way][1])
            squares.append(here)
        way = (way + step) % 4
    xs, ys = [x for x, _ in squares], [y for _, y in squares]
    rows = []
    for y in range(max(ys) + 1, min(ys) - 2, -1):
        row = []
        for x in range(min(xs) - 1, max(xs) + 2):
            at = (x, y)
            row.append("P" if at == squares[0] else "G" if at == squares[-1] else "X" if guard and at == squares[-2] else "." if at in squares else "#")
        rows.append(" ".join(row))
    return "\n".join(rows)



def staircase(rooks_: int) -> str:
    """A board 7 wide and 8 tall: the pawn starts bottom left, and the goal is one square
    above the last rook of a diagonal line of `rooks_` rooks (or straight above the pawn if none)."""
    rows = []
    for row in range(8, 0, -1):
        cells = ["."] * 7
        if row == 1:
            cells[0] = "P"
        if row == rooks_ + 2:
            cells[rooks_] = "G"
        rows.append(" ".join(cells))
    return "\n".join(rows)


def rooks(count: int) -> list[dict]:
    return [{"kind": "rook", "start": f"{'abcdefg'[i]}{i + 1}"} for i in range(1, count + 1)]


def tally(rooks_: int) -> dict:
    """The staircase with a guard straight above its last rook, and the goal above the guard.
    The guard asks how many rooks you took."""
    rows = []
    for row in range(8, 0, -1):
        cells = ["."] * 7
        if row == 1:
            cells[0] = "P"
        if row == rooks_ + 2:
            cells[rooks_] = "X"
        if row == rooks_ + 3:
            cells[rooks_] = "G"
        rows.append(" ".join(cells))
    question = "Halt! How many rooks did you take? Answer with the number."
    return {"map": "\n".join(rows), "enemies": rooks(rooks_), "legend": {"X": {"tile": "gate", "question": question, "passphrase": str(rooks_)}}}


def under_a_rook(spots: int) -> str:
    """The staircase with a goal hidden under one of its first `spots` rooks (? marks each)."""
    rows = []
    for row in range(8, 0, -1):
        cells = ["."] * 7
        if row == 1:
            cells[0] = "P"
        if 2 <= row <= spots + 1:
            cells[row - 1] = "?"
        rows.append(" ".join(cells))
    return "\n".join(rows)


def keeper(*legs: int) -> dict:
    """The guard on a road that asks how far you walked: its question, and the answer for this road."""
    question = "Halt! How many squares did you walk to get here? Answer with the number."
    return {"X": {"tile": "gate", "question": question, "passphrase": str(sum(legs) - 2)}}


AT_GOAL = ["not pawn.at_goal()"]

HALL = "# # # # #\n# . G . #\n# . . . #\n# . . . #\n# . . . #\n# . P . #"  # three wide, five long

# The draft boards: maps and rules only. `calls` and `conds` are what the search may use.
DRAFTS: list[dict] = [
    {
        "id": "ch05-l01",
        "title": "Until You Arrive",
        "trains": "while, until you arrive",
        "brief": "The goal is hidden.",
        "map": "# ? #\n# . #\n# . #\n# ? #\n# . #\n# . #\n# . #\n# ? #\n# . #\n# P #",
        "facing": "north",
        "api": ["move", "turn_left", "turn_right", "wait", "at_goal"],
        "calls": ["move()", "wait()"],
        "conds": AT_GOAL,
        "ranges": [2, 3, 4, 5, 6, 7, 8, 9],
    },
    {
        "id": "ch05-l02",
        "title": "The Winding Road",
        "trains": "while, a road of unknown length",
        "brief": "The road bends left, and every board bends differently.",
        "map": road(6, 3),
        "variants": [road(3, 4, 2), road(5, 4, 3, 2), road(4, 2, 5)],
        "facing": "north",
        "api": ["move", "turn_left", "turn_right", "squares_ahead", "wait", "at_goal", "look"],
        "calls": ["move()", "turn_left()", "move(pawn.squares_ahead())"],
        "conds": [*AT_GOAL, "pawn.look() != None"],
        "ranges": [8, 10, 12, 14, 16, 18],
        "search": 4,
    },
    {
        "id": "ch05-l03",
        "title": "Counting Steps, Again",
        "trains": "a counter kept inside a while loop",
        "brief": "A guard on the road wants to know how far you walked.",
        "map": road(6, 3, guard=True),
        "legend": keeper(6, 3),
        "variants": [
            {"map": road(3, 4, 2, guard=True), "legend": keeper(3, 4, 2)},
            {"map": road(5, 4, 3, 2, guard=True), "legend": keeper(5, 4, 3, 2)},
            {"map": road(4, 2, 5, guard=True), "legend": keeper(4, 2, 5)},
        ],
        "facing": "north",
        "api": ["move", "turn_left", "turn_right", "squares_ahead", "wait", "at_goal", "look"],
        "calls": ["turn_left()"],
        "actions": [("pawn.move()", "steps += 1"), ("steps += pawn.squares_ahead()", "pawn.move(pawn.squares_ahead())", "pawn.turn_left()")],
        "loop_conds": ['pawn.look() != "gate"'],
        "branch_conds": ["pawn.look() != None"],
        "before": "steps = 0\n",
        "after": "print(steps)\npawn.move(2)\n",
        "rungs": 2,
    },
    {
        "id": "ch05-l04",
        "title": "Which Rook?",
        "trains": "stopping a loop early: break",
        "brief": "The goal is hidden under one of the rooks.",
        "map": under_a_rook(4),
        "enemies": rooks(5),
        "facing": "north",
        "api": ["move", "turn_left", "turn_right", "wait", "at_goal", "look", "capture_left", "capture_right"],
        "calls": ["capture_right()", "move()"],
        "conds": ["not pawn.at_goal()", 'pawn.look("right") == "rook"'],
        "ranges": [1, 2, 3, 4, 5],
        "search": 4,
    },
    {
        "id": "ch05-l05",
        "title": "The Staircase",
        "trains": "while on look(), capturing a line of rooks of unknown length",
        "brief": "A line of rooks climbs the board, one step up and one step across. Take them all.",
        "map": staircase(2),
        "enemies": rooks(2),
        "variants": [{"map": staircase(n), "enemies": rooks(n)} for n in (0, 3, 5)],
        "facing": "north",
        "api": ["move", "turn_left", "turn_right", "wait", "at_goal", "look", "capture_left", "capture_right"],
        "calls": ["move()", "capture_right()"],
        "conds": ['pawn.look("right") == "rook"', "not pawn.at_goal()"],
        "ranges": [1, 2, 3, 4, 5, 6],
        "search": 4,
    },
    {
        "id": "ch05-l06",
        "title": "The Tally",
        "trains": "everything in Chapter 5 together (mastery)",
        "brief": "Take every rook on the staircase, then tell the guard how many you took.",
        **tally(2),
        "variants": [tally(n) for n in (1, 3, 5)],
        "facing": "north",
        "api": ["move", "turn_left", "turn_right", "wait", "at_goal", "look", "capture_left", "capture_right"],
        "calls": ["capture_right()", "move()"],
        "statements": ["taken += 1"],
        "conds": ['pawn.look("right") == "rook"'],
        "ranges": [1, 2, 3, 4, 5],
        "before": "taken = 0\n",
        "after": "print(taken)\npawn.move(2)\n",
        "search": 3,
    },
]


def level_of(spec: dict) -> Level:
    return parse_level(yaml.safe_load(yaml_text(spec, chapter=5, api=spec["api"], par=99, hints=["", "", ""])))


def ladder_survey(level: Level, spec: dict) -> tuple[int, int] | None:
    """For a level whose answer is one loop that reacts to what's around it: the fewest lines
    of `while <loop cond>:` over a chain of up to `rungs` branches (`if`/`elif`, each a condition
    and a call) and an optional `else` call, and how many of that length solve every board."""
    calls = [(f"pawn.{call}",) for call in spec["calls"]] + [tuple(lines) for lines in spec.get("actions", [])]
    conds = spec["branch_conds"]
    found: dict[int, int] = {}
    for loop in spec["loop_conds"]:
        for rungs in range(0, spec.get("rungs", 3) + 1):
            for chosen in product(product(conds, calls), repeat=rungs):
                for other in [None, *calls]:
                    if rungs == 0 and other is None:
                        continue
                    lines = [f"while {loop}:"]
                    for i, (cond, call) in enumerate(chosen):
                        lines += [f"    {'if' if i == 0 else 'elif'} {cond}:", *[f"        {line}" for line in call]]
                    if other:
                        lines += ["    else:", *[f"        {line}" for line in other]]
                    code = spec.get("before", "") + "\n".join(lines) + "\n" + spec.get("after", "")
                    if run_level(level, code, line_budget=BUDGET, enforce_constraints=False).status == "solved":
                        found[code_lines(code)] = found.get(code_lines(code), 0) + 1
    return (min(found), found[min(found)]) if found else None


def plain_routes(level: Level) -> str:
    """How far plain calls get: each board's own fewest-line route, and how many boards it solves."""
    if level.goal_spots:
        return f"the goal is hidden on {len(level.goal_spots)} squares, so each case needs its own stop"
    boards = [case.level for case in level.cases()]
    reach = []
    for board in boards:
        route = fewest_lines(board)
        if route is None:
            return "a board has no plain-call solution"
        code = "\n".join(write_code(board, route))
        reach.append(sum(run_level(other, code, line_budget=BUDGET, enforce_constraints=False).status == "solved" for other in boards))
    return f"each board's own route solves {min(reach)} to {max(reach)} of {len(boards)} boards"


def probe(spec: dict) -> None:
    level = level_of(spec)
    if "branch_conds" in spec:
        best = ladder_survey(level, spec)
        print(f"{spec['id']} ({spec['title']}): {len(level.cases())} boards; {plain_routes(level)}")
        print("  a loop over a chain of branches: " + (f"{best[0]} lines ({best[1]} programs)" if best else "none"))
        return
    grammar = Grammar(spec["calls"], spec["conds"], spec.get("ranges", [2, 3, 4, 5, 6, 7]), statements=spec.get("statements", ()))
    top = spec.get("search", 4)
    found = survey(level, grammar, top, before=spec.get("before", ""), after=spec.get("after", ""))
    print(f"{spec['id']} ({spec['title']}): {len(level.cases())} boards; {plain_routes(level)}")
    for kind in KINDS:
        lines, number = found.get(kind, (None, 0))
        print(f"  {kind}: " + (f"{lines} lines ({number} programs)" if lines else f"none up to {top}"))


def main(ids: list[str]) -> None:
    for spec in DRAFTS:
        if not ids or spec["id"] in ids:
            probe(spec)


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "probe":
        main(args[1:])
    else:
        print(__doc__)
