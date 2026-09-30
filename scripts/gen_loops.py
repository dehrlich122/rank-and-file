"""Write Chapter 3's levels, reference solutions and wrong attempts blind (M3.3).

    .venv/Scripts/python scripts/gen_loops.py             # every level below
    .venv/Scripts/python scripts/gen_loops.py ch03-l02    # just one

Every Chapter 3 level has one way through: a corridor, or a walkway over
pits. `solve.py` finds that route with plain calls. This script finds the
shortest program that replays it exactly with `for` loops:
- a stretch of the route that repeats becomes a loop;
- a move whose length changes by the same amount every round uses the loop's
  variable;
- a move that always goes as far as the pawn can see asks `squares_ahead()`,
  which is how one program fits several boards;
- loops can sit inside loops, including one whose count is the outer loop's
  variable.
Because the replay is exact, the reference never turns more than it needs to
(QA-026). Loops inside loops can be switched off, which is how the "flat"
wrong attempt is made.

It writes each level's YAML (with par taken from the reference, and hint 3
taken from its first lines), the reference, the wrong attempts (each starting
with `# expect: <outcome>`) and the solution note. It prints only file names,
line counts and outcomes, never code: the designer is also the game's learner
(see CLAUDE.md: no spoilers).
"""

import json
import sys
from dataclasses import dataclass, replace
from functools import cache
from itertools import groupby, product
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "engine"))
sys.path.insert(0, str(ROOT / "scripts"))

from solve import fewest_lines, move_call, write_code  # noqa: E402

from rankfile.constraints import code_lines  # noqa: E402
from rankfile.levels import Level, parse_level  # noqa: E402
from rankfile.pieces import PIECES  # noqa: E402
from rankfile.runner import run_level  # noqa: E402
from rankfile.world import World  # noqa: E402

API = ["move", "turn_left", "turn_right", "squares_ahead", "wait"]


# -- the route, as moves and turns ------------------------------------------------


@dataclass(frozen=True)
class Move:
    squares: tuple | None  # per board; None when the boards (or rounds) differ, so it must be counted
    counted: bool  # squares_ahead() gives exactly this, here, on every board
    var: tuple | None = None  # (start, step): the loop's variable
    sample: int | None = None  # board 1's length in the first round, for a wrong attempt that types it


@dataclass(frozen=True)
class Call:
    name: str  # turn_left, turn_right, wait


def without_clockwork(level: Level) -> Level:
    """Code-clocked enemies depend on how the code is written, so the route is found without them."""
    return replace(level, enemies=[]) if World(level).code_clocked else level


def route_tokens(level: Level) -> list | None:
    """One board's plain-call route, as moves (merged, like `pawn.move(3)`) and calls."""
    level = without_clockwork(level)
    actions = fewest_lines(level)
    if actions is None:
        return None
    piece = PIECES[level.piece](World(level), [*level.api, "squares_ahead"])
    tokens = []
    for name, run in groupby(actions, key=lambda action: action[0]):
        if name == "move":
            squares = len(list(run))
            counted = piece.squares_ahead() == squares
            piece.move(squares)
            tokens.append(Move((squares,), counted, sample=squares))
        else:
            for _ in run:
                getattr(piece, name)()
                tokens.append(Call(name))
    return tokens


def merged_tokens(level: Level) -> list | None:
    """One token list that suits every board, or None if the routes differ in shape."""
    per_board = [route_tokens(case.level) for case in level.cases()]
    if None in per_board or len({len(tokens) for tokens in per_board}) != 1:
        return None
    merged = []
    for group in zip(*per_board, strict=True):
        if all(isinstance(t, Call) for t in group) and len({t.name for t in group}) == 1:
            merged.append(group[0])
        elif all(isinstance(t, Move) for t in group):
            squares = tuple(t.squares[0] for t in group)
            merged.append(Move(squares if len(set(squares)) == 1 else None, all(t.counted for t in group), sample=squares[0]))
        else:
            return None
    return merged


# -- the shortest program that replays the route --------------------------------

# A program is a tuple of items: ("call", token), or ("loop", rounds, var, body).
# `var` is None, or (start, step) for a loop whose variable the body uses.
# `rounds` is a number, or an outer loop's `var`: repeat as many times as its value.


@cache
def cost(program: tuple) -> tuple:
    """What `shortest` minimises: fewest lines; then count only where a typed length
    won't do; then fewest loops; then inner loops first in a loop's body, so it
    reads "flight, then landing"."""
    lines = counted = loops = 0
    leads = next((k for k, item in enumerate(program) if item[0] == "loop"), 0)
    for item in program:
        if item[0] == "call":
            token = item[1]
            lines += 1
            counted += isinstance(token, Move) and token.squares is None and token.var is None
        else:
            inner = cost(item[3])
            lines, counted, loops, leads = lines + 1 + inner[0], counted + inner[1], loops + 1 + inner[2], leads + inner[3]
    return lines, counted, loops, leads


def depth(program: tuple) -> int:
    return max((1 + depth(item[3]) for item in program if item[0] == "loop"), default=0)


def shortest(tokens: list, *, nesting=True) -> tuple | None:
    """The program with the lowest `cost` that replays `tokens` exactly, or None."""
    boards = max((len(t.squares) for t in tokens if isinstance(t, Move) and t.squares), default=1)

    def writable(token) -> bool:
        return not isinstance(token, Move) or token.squares is not None or token.var is not None or token.counted

    def keys(stretch):
        return tuple(("M", t.squares, t.var) if isinstance(t, Move) else t.name for t in stretch)

    @cache
    def best(seq: tuple, level: int):
        if not seq:
            return ()
        table = {}
        for length in range(1, len(seq) + 1):
            for i in range(0, len(seq) - length + 1):
                j = i + length
                options = []
                if length == 1:
                    if writable(seq[i]):
                        options.append((("call", seq[i]),))
                else:
                    options += [table[(i, k)] + table[(k, j)] for k in range(i + 1, j) if (i, k) in table and (k, j) in table]
                    if nesting or level == 0:
                        options += repeats(seq[i:j], level)
                    if nesting and level == 0:
                        options += growing(seq[i:j])
                if options:
                    table[(i, j)] = min(options, key=cost)
        return table.get((0, len(seq)))

    def repeats(stretch: tuple, level: int) -> list:
        found = []
        for period in range(1, len(stretch) // 2 + 1):
            if len(stretch) % period:
                continue
            rounds = len(stretch) // period
            shared = generalise(stretch, period, rounds)
            if shared is None:
                continue
            body = best(shared[0], level + 1)
            if body is not None:
                found.append((("loop", rounds, shared[1], body),))
        return found

    def growing(stretch: tuple) -> list:
        """An outer loop whose inner loop repeats as many times as the outer loop's
        variable, then a tail: rounds of `body` repeated first, first + step, ... times."""
        found = []
        for period, tail_length, first, step in product(range(1, 7), range(5), range(1, 7), (1, -1, 2)):
            matched = grow_rounds(stretch, stretch[:period], tail_length, first, step)
            if matched is None:
                continue
            rounds, tail = matched
            body, rest = best(stretch[:period], 2), best(tail, 1)
            if body is not None and rest is not None:
                var = (first, step)
                found.append((("loop", rounds, var, (("loop", var, None, body), *rest)),))
        return found

    def grow_rounds(stretch: tuple, body: tuple, tail_length: int, first: int, step: int):
        """(rounds, tail) if `stretch` is such rounds, or None."""
        pos, rounds, tail = 0, 0, None
        while pos < len(stretch):
            times = first + rounds * step
            end = pos + times * len(body) + tail_length
            if times < 1 or end > len(stretch):
                return None
            if any(keys(stretch[pos + k * len(body) : pos + (k + 1) * len(body)]) != keys(body) for k in range(times)):
                return None
            this_tail = stretch[end - tail_length : end]
            if tail is not None and keys(this_tail) != keys(tail):
                return None
            tail, pos, rounds = this_tail, end, rounds + 1
        return (rounds, tail) if rounds >= 2 else None

    def generalise(stretch: tuple, period: int, rounds: int):
        """The body shared by every round, and its variable, or None: each place in it must match across rounds."""
        body, var = [], None
        for q in range(period):
            group = [stretch[r * period + q] for r in range(rounds)]
            first = group[0]
            if isinstance(first, Call):
                if any(not isinstance(t, Call) or t.name != first.name for t in group):
                    return None
                body.append(first)
                continue
            if any(not isinstance(t, Move) for t in group):
                return None
            if any(t.var is not None for t in group):
                if all(t.var == first.var for t in group):
                    body.append(first)  # an outer loop's variable, the same in every round
                    continue
                return None
            squares = [t.squares for t in group]
            counted = all(t.counted for t in group)
            if all(s is not None and s == squares[0] for s in squares):
                body.append(Move(squares[0], counted, sample=first.sample))
                continue
            if boards == 1 and all(s is not None for s in squares):
                values = [s[0] for s in squares]
                step = values[1] - values[0]
                if step and all(v == values[0] + r * step for r, v in enumerate(values)) and var in (None, (values[0], step)):
                    var = (values[0], step)
                    body.append(Move(None, counted, var=var, sample=first.sample))
                    continue
            if counted:
                body.append(Move(None, True, sample=first.sample))
                continue
            return None
        return tuple(body), var

    return best(tuple(tokens), 0)


def render(program: tuple, piece: str, names: list[str], *, typed=False) -> str:
    """The program as Python. `names` are the loop variables' names, outer first;
    a loop whose variable isn't used gets `_`. With `typed`, every counted or
    variable move uses board 1's first-round length instead (a wrong attempt)."""
    lines, names = [], iter([*names, "n", "m", "k"])

    def move(token, scope) -> str:
        if typed and token.squares is None:
            return move_call(piece, token.sample)
        if token.var is not None:
            return f"{piece}.move({scope[token.var]})"
        if token.squares is not None:
            return move_call(piece, token.squares[0])
        return f"{piece}.move({piece}.squares_ahead())"

    def emit(items: tuple, indent: int, scope: dict):
        pad = "    " * indent
        for item in items:
            if item[0] == "call":
                token = item[1]
                lines.append(pad + (f"{piece}.{token.name}()" if isinstance(token, Call) else move(token, scope)))
                continue
            _, rounds, var, body = item
            inner = scope
            if var is None:
                count = scope[rounds] if isinstance(rounds, tuple) else rounds
                lines.append(f"{pad}for _ in range({count}):")
            else:
                inner = {**scope, var: next(names)}
                start, step = var
                stop = start + rounds * step
                args = f"{start}, {stop}" if step == 1 else f"{start}, {stop}, {step}"
                lines.append(f"{pad}for {inner[var]} in range({args}):")
            emit(body, indent + 1, inner)

    emit(program, 0, {})
    return "\n".join(lines) + "\n"


# -- the levels -----------------------------------------------------------------

# Per level: its file, the prose for hints 1 and 2 and the solution note
# (hint 3 comes from the reference), which wrong attempts to write, and how to
# pick hint 3's lines ("start": the first n lines; "loops": up to the nth
# loop; "key": the first line using a name). Wrong attempts: "copied" (the plain calls), "typed"
# (board 1's first lengths typed in), "flat" (loops, but none inside another).
LEVELS = [
    {
        "id": "ch03-l01",
        "title": "The Grand Staircase",
        "trains": "for loops and range(): repeating a block of lines",
        "brief": "A grand staircase climbs to the goal, six steps all the same. There's only room for 7 lines of code.",
        "map": """
            # # # # # . G
            # # # # . . #
            # # # . . # #
            # # . . # # #
            # . . # # # #
            . . # # # # #
            P # # # # # #
        """,
        "facing": "east",
        "limit": True,
        "par": 5,
        "hints": [
            "Every step of the staircase is the same. Find the moves for one step.",
            "Put the moves for one step under a for loop, indented, and let range() repeat them once for every step.",
        ],
        "hint3": ("start", 2),
        "note": (
            "A loop's body should be exactly the part that repeats: here, one whole step. Everything the six steps "
            "share is written once, and `range()` says how many times. Nothing inside the loop needs the round's "
            "number, so its variable is called `_`, which is how Python programmers say \"not needed\". The same "
            "{lines} lines would climb sixty steps."
        ),
        "wrong": ["copied"],
        "names": [],
        "lesson_board": {"map": ". . .\n. # .\nP . .", "start": {"facing": "north"}},
    },
    {
        "id": "ch03-l02",
        "title": "The Crooked Stair",
        "trains": "A loop's lines run afresh each round, so a count inside the loop gets a new answer every time",
        "brief": "Three crooked staircases, no two steps alike, and one program for all of them. There's only room for 7 lines of code.",
        "map": """
            # # # # # # # . . G
            # # # # # # # . # #
            # # # # # # . . # #
            # # # . . . . # # #
            # # . . # # # # # #
            # # . # # # # # # #
            . . . # # # # # # #
            P # # # # # # # # #
        """,
        "variants": [
            """
            # # # # # # # . . G
            # # # # # . . . # #
            # # # # # . # # # #
            # # # # . . # # # #
            # . . . . # # # # #
            . . # # # # # # # #
            . # # # # # # # # #
            P # # # # # # # # #
            """,
            """
            # # # # # # # # . G
            # # # # # # # # . #
            # # # # # # . . . #
            # # # # . . . # # #
            # # # # . # # # # #
            # # # . . # # # # #
            . . . . # # # # # #
            P # # # # # # # # #
            """,
        ],
        "facing": "east",
        "limit": True,
        "par": 5,
        "hints": [
            "No two steps are the same size, and no two boards are the same, so no number you type will fit them all.",
            "The loop runs its lines again every round, so a count taken inside the loop is taken again at every "
            "step. Let each move go as far as the pawn can see.",
        ],
        "hint3": ("key", "squares_ahead", "One way to write each move:"),
        "note": (
            "Counting inside the loop is what lets one program fit every step on every board: the loop runs its "
            "lines afresh each round, so each move measures its own stretch. Counting and moving in the same line "
            "saves a name that would only be used once."
        ),
        "wrong": ["copied", "typed"],
        "names": [],
        "lesson_board": {"map": ". . .\n. # .\n. # #\nP # #", "start": {"facing": "north"}},
    },
    {
        "id": "ch03-l03",
        "title": "The Spiral Walk",
        "trains": "The loop's variable, and range(start, stop, step)",
        "brief": (
            "A walkway spirals in over a bottomless pit, each stretch one square shorter than the last. "
            "Step off it and you fall. There's only room for 5 lines of code."
        ),
        "map": """
            P . . . . . . .
            O O O O O O O .
            O O . . . . O .
            O O . O O . O .
            O O . O G . O .
            O O . O O O O .
            O O . . . . . .
        """,
        "legend": {"O": "pit"},
        "facing": "north",
        "limit": True,
        "par": 3,
        "hints": [
            "Each stretch is one square shorter than the one before. Counting won't help: the pawn sees straight over the pits.",
            "The loop's variable changes every round. If it counts down one at a time, starting from the first "
            "stretch's length, it's exactly how far to walk each round.",
        ],
        "hint3": ("start", 1),
        "note": (
            "The loop's variable is the length of each stretch, so it has to count down with the walkway: `range()` "
            "takes a start, a stop it never reaches, and a step of -1. Walking that far and turning is the whole "
            "spiral, {lines} lines for seven stretches."
        ),
        "wrong": ["copied", "typed"],
        "names": ["length"],
        "lesson_board": {
            "map": "O O O . . . .\nO . . . O O O\n. . O O O O O\nP O O O O O O",
            "legend": {"O": "pit"},
            "start": {"facing": "north"},
        },
    },
    {
        "id": "ch03-l04",
        "title": "The Clockwork Sentry",
        "trains": "Outpacing clockwork: a loop runs fewer new lines than the same moves copied out",
        "brief": "A clockwork sentry waits on the gallery above the stairs. Every new line of code you write winds it one step closer.",
        "map": """
            # # . . . . . . .
            # # # # # # # # .
            # # # # # # . . G
            # # # # . . . # #
            # # . . . # # # #
            . . . # # # # # #
            P # # # # # # # #
        """,
        "enemies": [
            {"kind": "patrol", "route": ["c7", "i7", "i5", "g5", "g4", "e4", "e3", "c3", "c2", "a2", "a1"], "clock": "new_line"}
        ],
        "facing": "east",
        "limit": False,
        "par": 5,
        "hints": [
            "The sentry only moves when a line of your code runs for the first time. Watch its gear count.",
            "A loop's lines are new only in its first round. After that the sentry stands still while the loop "
            "repeats, however far the pawn climbs.",
        ],
        "hint3": ("start", 2),
        "note": (
            "{lines} new lines wind the sentry {lines} times, and then the loop does the rest: its lines are new "
            "only in the first round, so the sentry stands still while the pawn climbs every other step. Copied "
            "out, the same climb is {copied} new lines, and the sentry is down the stairs long before the pawn is up."
        ),
        "wrong": ["copied"],
        "names": [],
        "lesson_board": {
            "map": "# # # # # # #\nP . . . . . .\n# # # # # # #",
            "enemies": [{"kind": "patrol", "start": "g2", "route": ["g2", "a2"], "clock": "new_line"}],
            "start": {"facing": "east"},
        },
    },
    {
        "id": "ch03-l05",
        "title": "Three Flights",
        "trains": "Loops inside loops",
        "brief": "Three flights of stairs, each turned a quarter from the last, with a landing after each. There's only room for 10 lines of code.",
        "map": """
            # # # . . . # # #
            # # . . # . . # #
            # . . # # # . . #
            . . # # # # # . .
            . # # # # # # # .
            G # # # # # # . .
            # # # # # # . . #
            # # # # # . . # #
            # # # # # P # # #
        """,
        "facing": "east",
        "limit": True,
        "par": 8,
        "hints": [
            "Each flight is the same staircase, turned a quarter. Each landing is the same too.",
            "One loop can climb a flight. Put that loop, and the landing after it, inside another loop that runs "
            "once for every flight.",
        ],
        "hint3": ("loops", 2),
        "note": (
            "The inner loop climbs one flight and the outer loop repeats the flight with its landing. Each landing "
            "leaves the pawn turned a quarter, so the same inner loop climbs every flight, whichever way it faces. "
            "Three separate loops would take {flat} lines."
        ),
        "wrong": ["copied", "flat"],
        "names": [],
        "lesson_board": {"map": ". . .\n. # .\nP . .", "start": {"facing": "north"}},
    },
    {
        "id": "ch03-l06",
        "title": "The Clocktower",
        "trains": "Chapter 3 mastery: loops inside loops, a loop's variable and clockwork, together",
        "brief": (
            "A spiral stair winds up the clocktower, each flight one step longer than the last. "
            "A clockwork sentry is coming down to meet you."
        ),
        "map": """
            # # # . . . # #
            # # . . # . . #
            # . . # # # . .
            . . # # # # # .
            . # # # # # . .
            G . # # # # P #
            # . . # # # # #
            # # . . # # # #
            # # # . . # # #
            # # # # . . . #
        """,
        "enemies": [
            {
                "kind": "patrol",
                "start": "g1",
                "route": [
                    "g1", "e1", "e2", "d2", "d3", "c3", "c4", "b4", "b5", "a5", "a7", "b7", "b8",
                    "c8", "c9", "d9", "d10", "f10", "f9", "g9", "g8", "h8", "h6", "g6", "g5",
                ],
                "clock": "new_line",
            }
        ],
        "facing": "east",
        "limit": False,
        "par": 8,
        "mastery": True,
        "hints": [
            "The flights grow: one step, then two, then three. And the sentry winds up with every new line.",
            "An inner loop can repeat a step as many times as the outer loop's number. Let the outer loop count "
            "each flight's steps.",
        ],
        "hint3": ("start", 2),
        "note": (
            "The outer loop's variable is how many steps the flight has, and the inner loop climbs that many. "
            "{lines} lines, each new only once, and the sentry never gets near. Separate loops for each flight "
            "take {flat} lines, and the sentry catches you."
        ),
        "wrong": ["copied", "flat"],
        "names": ["steps"],
    },
]


def board_text(text: str) -> str:
    return "\n".join(line.strip() for line in text.strip("\n").splitlines()) + "\n"


def yaml_text(spec: dict, par: int, hints: list[str]) -> str:
    q = json.dumps
    lines = [
        f"id: {spec['id']}",
        "chapter: 3",
        f"title: {q(spec['title'])}",
        f"trains: {q(spec['trains'])}",
        f"brief: {q(spec['brief'])}",
        "piece: pawn",
        "map: |",
        *[f"  {row}" for row in board_text(spec["map"]).splitlines()],
    ]
    if spec.get("legend"):
        lines.append(f"legend: {q(spec['legend'])}")
    if spec.get("enemies"):
        lines.append("enemies:")
        lines += [f"- {q(enemy)}" for enemy in spec["enemies"]]
    lines.append(f"start: {q({'facing': spec['facing']})}")
    lines.append(f"api: {q(API)}")
    if spec["limit"]:
        lines.append(f"constraints: {q({'max_lines': par + 2})}")
    lines.append(f"par: {q({'lines': par})}")
    lines.append("hints:")
    lines += [f"- {q(hint)}" for hint in hints]
    lines.append(f"lesson: ch03/{spec['id']}.md")
    if spec.get("mastery"):
        lines.append("mastery: true")
    if "lesson_board" in spec:
        board = spec["lesson_board"]
        lines += ["lesson_board:", "  map: |", *[f"    {row}" for row in board["map"].splitlines()]]
        lines += [f"  {key}: {q(board[key])}" for key in ("legend", "enemies", "start") if key in board]
    if spec.get("variants"):
        lines.append("variants:")
        for variant in spec["variants"]:
            lines += ["- map: |", *[f"    {row}" for row in board_text(variant).splitlines()]]
    return "\n".join(lines) + "\n"


def third_hint(spec: dict, reference: str) -> str:
    kind, *how = spec["hint3"]
    code = reference.splitlines()
    if kind == "start":
        return "One way to start:\n" + "\n".join(code[: how[0]])
    if kind == "loops":  # everything up to and including the nth loop's first line
        headers = [i for i, line in enumerate(code) if line.lstrip().startswith("for ")]
        return "One way to start:\n" + "\n".join(code[: headers[how[0] - 1] + 1])
    key, intro = how
    return f"{intro}\n" + next(line.strip() for line in code if key in line)


def expect_line(level: Level, code: str) -> str | None:
    result = run_level(level, code)
    if result.status == "solved":
        return None
    error = f" {result.error.type}" if result.status == "error" and result.error else ""
    return f"# expect: {result.status}{error}"


def save(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")
    print(f"  {path.relative_to(ROOT).as_posix()}")


def generate(spec: dict) -> list[str]:
    """Write one level's files; return any problems (in words, never code)."""
    problems = []
    draft = parse_level(yaml.safe_load(yaml_text(spec, 99, ["", "", ""])))
    tokens = merged_tokens(draft)
    program = shortest(tokens) if tokens else None
    if program is None:
        return [f"{spec['id']}: no loop program replays the route"]
    reference = render(program, "pawn", spec["names"])
    par = code_lines(reference)
    if par != spec["par"]:
        problems.append(f"{spec['id']}: the reference has {par} lines, the spec's par is {spec['par']}")
    hints = [*spec["hints"], third_hint(spec, reference)]
    text = yaml_text(spec, par, hints)
    level = parse_level(yaml.safe_load(text))
    result = run_level(level, reference)
    stars = sum(star.earned for star in result.stars) if result.stars else 0
    print(f"{spec['id']} ({spec['title']}): par {par}, loops {depth(program)} deep, reference {result.status}, {stars} stars")
    if result.status != "solved" or stars != 3:
        return [*problems, f"{spec['id']}: the reference isn't a three-star solve ({result.status})"]

    counts = {"lines": par}
    wrong = []
    for kind in spec["wrong"]:
        if kind == "copied":
            code = "\n".join(write_code(level, fewest_lines(without_clockwork(level.cases()[0].level)))) + "\n"
        elif kind == "typed":
            code = render(program, "pawn", spec["names"], typed=True)
        else:  # flat
            code = render(shortest(tokens, nesting=False), "pawn", spec["names"])
        counts[kind] = code_lines(code)
        expect = expect_line(level, code)
        print(f"  wrong attempt '{kind}': {counts[kind]} lines, {expect or 'SOLVED (a problem)'}")
        if expect is None:
            problems.append(f"{spec['id']}: the '{kind}' attempt solves the level")
            continue
        wrong.append(f"{expect}\n{code}")

    folder = ROOT / "solutions" / "ch03"
    save(ROOT / "levels" / "ch03" / f"{spec['id']}.yaml", text)
    save(folder / f"{spec['id']}.py", reference)
    for old in folder.glob(f"{spec['id']}.naive*.py"):
        old.unlink()
    for number, code in enumerate(wrong, start=1):
        save(folder / f"{spec['id']}.naive{'' if number == 1 else number}.py", code)
    save(folder / f"{spec['id']}.md", spec["note"].format(**counts) + "\n")
    return problems


def main(ids: list[str]) -> None:
    problems = []
    for spec in LEVELS:
        if not ids or spec["id"] in ids:
            problems += generate(spec)
    for problem in problems:
        print(f"PROBLEM: {problem}")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main(sys.argv[1:])
