"""Write Chapter 4's levels, reference solutions and wrong attempts blind (M3.4).

    .venv/Scripts/python scripts/gen_conditions.py             # every level below
    .venv/Scripts/python scripts/gen_conditions.py ch04-l02    # just one

Every Chapter 4 level is one level on several boards, and one program has to
solve them all. `solve.py` finds each board's own route with plain calls. This
script lines the routes up and writes one program that follows every one:
- where every board does the same thing, it's written once;
- where the boards part ways, the pawn asks the squares in front of it
  (`look()`, `look("left")`, `look("right")`) and branches on the answers with
  `if`/`elif`/`else`, and the branches join again where the routes meet;
- where the boards walk different distances, a count does it;
- where a guard wants True or False, the answer is a comparison of a count
  taken at the start;
- where every board takes the same number of one-square steps, each chosen
  by what's around it, it's one loop around one chain of conditions.
Among programs of equal length it prefers the simpler conditions and fewer
loops. It writes each level's YAML (par from the reference, hint 3 from its
lines), the reference, the wrong attempts and the solution note, and prints
only file names, line counts and outcomes, never code: the designer is also
the game's learner (see CLAUDE.md: no spoilers).
"""

import operator
import re
import sys
from dataclasses import dataclass
from functools import cache
from itertools import permutations, product

from levelgen import build, run_all  # first: it puts the engine on the import path
from solve import fewest_lines, move_call, write_code

from rankfile.levels import Level
from rankfile.pieces import PIECES
from rankfile.world import World

BASE_API = ["move", "turn_left", "turn_right", "squares_ahead", "wait", "at_goal"]
OBSERVATIONS = (None, "left", "right")  # look(), look("left"), look("right")


# -- each board's route, step by step ------------------------------------------------


@dataclass(frozen=True)
class Step:
    kind: str  # "move", "call" or "say"
    value: object  # a move's squares, a call's name, a phrase
    counted: bool = False  # a move that squares_ahead() gives exactly, here


@dataclass(frozen=True)
class Run:
    """One board's route: its steps, and the world before each step (then after the last)."""

    steps: tuple
    worlds: tuple
    start_count: int  # squares_ahead() before the first step


def act(world: World, step: Step) -> None:
    piece = PIECES[world.level.piece](world, [*world.level.api, "squares_ahead"])
    if step.kind == "move":
        piece.move(step.value)
    elif step.kind == "say":
        world.hear(step.value)
    else:
        getattr(piece, step.value)()


def board_run(level: Level, *, single=False) -> Run | None:
    """A board's plain-call route; moves in a row become one step unless `single`."""
    actions = fewest_lines(level)
    if actions is None:
        return None
    world = World(level)
    start_count = world.squares_ahead()
    steps, worlds = [], []
    i = 0
    while i < len(actions):
        name = actions[i][0]
        if name == "move":
            j = i + 1
            while not single and j < len(actions) and actions[j][0] == "move":
                j += 1
            step = Step("move", j - i, world.squares_ahead() == j - i)
            i = j
        elif name == "say":
            step = Step("say", actions[i][1])
            i += 1
        else:
            step = Step("call", name)
            i += 1
        worlds.append(world.copy())
        act(world, step)
        steps.append(step)
    worlds.append(world.copy())
    return Run(tuple(steps), tuple(worlds), start_count)


# -- conditions ----------------------------------------------------------------------


@dataclass(frozen=True)
class Cond:
    side: str | None  # which look(): None straight ahead, "left", "right"
    test: str  # "none" (empty), "some" (anything there), "is" (one of `words`)
    words: tuple = ()

    def text(self) -> str:
        look = "pawn.look()" if self.side is None else f'pawn.look("{self.side}")'
        if self.test == "none":
            return f"not {look}"
        if self.test == "some":
            return look
        return " or ".join(f'{look} == "{word}"' for word in self.words)

    def rank(self) -> tuple:
        """Naming one thing reads best ("== 'pit'"), then anything/nothing, then a list."""
        order = {"some": 1, "none": 2}.get(self.test, 0 if len(self.words) == 1 else 1 + len(self.words))
        return (order, OBSERVATIONS.index(self.side))


def separating(inside: list[World], outside: list[World]) -> Cond | None:
    """The simplest condition that's True for every world `inside` and False for every one `outside`."""
    found = []
    for side in OBSERVATIONS:
        mine = {world.look(side) for world in inside}
        theirs = {world.look(side) for world in outside}
        if mine & theirs:
            continue
        if mine == {None}:
            found.append(Cond(side, "none"))
        elif None not in mine:
            if theirs <= {None}:
                found.append(Cond(side, "some"))
            found.append(Cond(side, "is", tuple(sorted(mine))))
    return min(found, key=Cond.rank, default=None)


# -- programs ------------------------------------------------------------------------
#
# A program is a tuple of items:
#   ("call", name)  ("move", squares | "count" | "var")  ("say", phrase, expr)
#   ("set",)  the count taken at the start
#   ("if", ((cond, body), ...), else_body)
#   ("loop", rounds, body)


@cache
def lines_of(program: tuple) -> int:
    total = 0
    for item in program:
        if item[0] == "if":
            branches, otherwise = item[1], item[2]
            total += sum(1 + lines_of(body) for _, body in branches) + (1 + lines_of(otherwise) if otherwise else 0)
        elif item[0] == "loop":
            total += 1 + lines_of(item[2])
        else:
            total += 1
    return total


@cache
def cost(program: tuple) -> tuple:
    """Fewest lines; then fewest if-chains (one chain with elif reads better than
    separate ifs); then the simplest conditions; then fewest loops."""
    chains, conds, loops = 0, [], 0
    for item in program:
        if item[0] in ("if", "loop"):
            bodies = [*(body for _, body in item[1]), item[2]] if item[0] == "if" else [item[2]]
            if item[0] == "if":
                chains += 1
                conds += [cond.rank() for cond, _ in item[1]]
            else:
                loops += 1
            for body in bodies:
                _, sub_chains, sub_conds, sub_loops = cost(body)
                chains, conds, loops = chains + sub_chains, conds + sub_conds, loops + sub_loops
    return lines_of(program), chains, sorted(conds), loops


def place(world: World) -> tuple:
    return (world.pos, world.facing)


class Synth:
    """Lines up several boards' routes into one program (see the module docstring)."""

    def __init__(self, runs: list[Run], count: bool, questions: str):
        self.runs = runs
        self.count = count  # the count taken at the start is available as a name
        self.numbers = sorted({int(n) for n in re.findall(r"\d+", questions)})

    def program(self) -> tuple | None:
        found = self.span(tuple(range(len(self.runs))), tuple(0 for _ in self.runs), tuple(len(run.steps) for run in self.runs))
        if found is None:
            return None
        return (("set",), *found) if self.count else found

    @cache  # noqa: B019 - one Synth per level, kept only while it runs
    def span(self, boards: tuple, at: tuple, end: tuple) -> tuple | None:
        """The best program taking each board in `boards` from step `at` to step `end`."""
        if all(a == e for a, e in zip(at, end, strict=True)):
            return ()
        options = []
        if all(a < e for a, e in zip(at, end, strict=True)):
            item = self.together([self.runs[b].steps[a] for b, a in zip(boards, at, strict=True)], boards)
            if item is not None:
                rest = self.span(boards, tuple(a + 1 for a in at), end)
                if rest is not None:
                    options.append((item, *rest))
        if not options:
            options += self.branches(boards, at, end)
        return min(options, key=cost, default=None)

    def together(self, steps: list[Step], boards: tuple):
        """One item that does every board's next step, or None."""
        first = steps[0]
        if any(step.kind != first.kind for step in steps):
            return None
        if first.kind == "call":
            return ("call", first.value) if all(step.value == first.value for step in steps) else None
        if first.kind == "move":
            if all(step.value == first.value for step in steps):
                return ("move", first.value)
            if self.count and all(step.value == self.runs[b].start_count for step, b in zip(steps, boards, strict=True)):
                return ("move", "var")
            return ("move", "count") if all(step.counted for step in steps) else None
        if all(step.value == first.value for step in steps):
            return ("say", first.value, None)
        expr = self.comparison([(self.runs[b].start_count, step.value) for step, b in zip(steps, boards, strict=True)])
        return ("say", None, expr) if expr else None

    def comparison(self, cases: list[tuple[int, str]]) -> str | None:
        """The simplest True/False expression of the start count that gives each board its phrase."""
        if not self.count or any(phrase not in ("True", "False") for _, phrase in cases):
            return None
        ops = {">": operator.gt, "<": operator.lt, ">=": operator.ge, "<=": operator.le, "==": operator.eq, "!=": operator.ne}
        atoms = [(op, n) for op in ops for n in self.numbers]

        def value(atom, count):
            op, n = atom
            return ops[op](count, n)

        want = [phrase == "True" for _, phrase in cases]
        for atom in atoms:
            if [value(atom, count) for count, _ in cases] == want:
                return ("atom", atom)
        for joiner in ("or", "and"):
            for a, b in product(atoms, atoms):
                if a[1] >= b[1]:
                    continue
                combine = operator.or_ if joiner == "or" else operator.and_
                if [combine(value(a, count), value(b, count)) for count, _ in cases] == want:
                    return (joiner, a, b)
        return None

    def branches(self, boards: tuple, at: tuple, end: tuple) -> list:
        """Where the boards part ways: an if-chain over what the pawn sees, each branch
        following its boards until every board meets again (or to the end)."""
        found = []
        index = {b: i for i, b in enumerate(boards)}
        for groups in partitions(list(boards)):
            if len(groups) < 2:
                continue
            for meet in self.meetings(boards, at, end, groups):
                bodies = []
                for group in groups:
                    body = self.span(tuple(group), tuple(at[index[b]] for b in group), tuple(meet[index[b]] for b in group))
                    if body is None:
                        break
                    bodies.append(body)
                else:
                    rest = self.span(boards, meet, end)
                    if rest is None:
                        continue
                    for chain in self.chains(groups, bodies, {b: self.runs[b].worlds[at[index[b]]] for b in boards}):
                        found.append((chain, *rest))
        return found

    def meetings(self, boards: tuple, at: tuple, end: tuple, groups: list) -> list:
        """Where the groups can join again: the end; the earliest place every board
        reaches (taking the last moment of its first stay there, so a bridge laid
        on the spot comes before it); or where every board has the same steps left."""
        reach = []
        for b, a, e in zip(boards, at, end, strict=True):
            run, stays = self.runs[b], {}
            for k in range(a, e + 1):
                key = place(run.worlds[k])
                if key not in stays:
                    stays[key] = k
                elif stays[key] == k - 1 and place(run.worlds[k - 1]) == key:
                    stays[key] = k  # still there: the stay goes on
            reach.append(stays)
        common = set(reach[0]).intersection(*reach[1:])
        meets = sorted((tuple(stay[key] for stay in reach) for key in common), key=sum)
        shortest = min(e - a for a, e in zip(at, end, strict=True))
        for left in range(shortest, 0, -1):
            tails = {tuple((s.kind, s.value) for s in self.runs[b].steps[e - left : e]) for b, e in zip(boards, end, strict=True)}
            if len(tails) == 1:
                meets.append(tuple(e - left for e in end))
                break
        meets = [meet for meet in meets if meet != end and any(m > a for m, a in zip(meet, at, strict=True))]
        return [end, *meets[:3]]

    def chains(self, groups: list, bodies: list, worlds: dict) -> list:
        """Every if/elif/else chain that sends each group of boards down its own body."""
        found = []
        for order in permutations(range(len(groups))):
            conds, ok = [], True
            for k, g in enumerate(order[:-1]):
                later = [worlds[b] for h in order[k + 1 :] for b in groups[h]]
                cond = separating([worlds[b] for b in groups[g]], later)
                if cond is None:
                    ok = False
                    break
                conds.append(cond)
            if not ok or any(not bodies[g] for g in order[:-1]):
                continue
            found.append(("if", tuple(zip(conds, (bodies[g] for g in order[:-1]), strict=True)), bodies[order[-1]]))
        return found


def partitions(items: list) -> list:
    if not items:
        return [[]]
    first, rest = items[0], items[1:]
    out = []
    for smaller in partitions(rest):
        out.append([[first], *smaller])
        for i in range(len(smaller)):
            out.append([*smaller[:i], [first, *smaller[i]], *smaller[i + 1 :]])
    return out


def policy(runs: list[Run]) -> tuple | None:
    """One loop around one chain of conditions, if every board takes the same number of
    one-square steps and what's around the pawn always says which step comes next."""
    if len({len(run.steps) for run in runs}) != 1 or len(runs[0].steps) < 2:
        return None
    samples = {}  # (kind, value) -> the worlds that step is taken from
    for run in runs:
        for step, world in zip(run.steps, run.worlds, strict=False):
            samples.setdefault((step.kind, step.value), []).append(world)
    kinds = list(samples)
    best = None
    for order in permutations(kinds):
        conds = []
        for k, step in enumerate(order[:-1]):
            cond = separating(samples[step], [w for later in order[k + 1 :] for w in samples[later]])
            if cond is None:
                break
            conds.append(cond)
        else:
            body = tuple(("move", value) if kind == "move" else ("call", value) for kind, value in order)
            chain = ("if", tuple(zip(conds, ((item,) for item in body[:-1]), strict=True)), (body[-1],))
            program = (("loop", len(runs[0].steps), (chain,)),)
            if best is None or cost(program) < cost(best):
                best = program
    return best


# -- rendering -----------------------------------------------------------------------


def render(program: tuple, names: dict, *, typed: list | None = None, same: bool = False, take: str | None = None, unroll=False) -> str:
    """The program as Python. Wrong attempts: `typed` (board 1's phrases, in order)
    says them word for word; `same` reuses the first comparison; `take` replaces
    every if-chain with its first ("first") or last ("last") branch; `unroll`
    writes a loop's body out."""
    typed = list(typed) if typed is not None else None
    lines = []
    count = names.get("count", "count")
    said = {"first": None}

    def expression(expr) -> str:
        if expr[0] == "atom":
            op, n = expr[1]
            return f"{count} {op} {n}"
        joiner, (op1, n1), (op2, n2) = expr
        return f"{count} {op1} {n1} {joiner} {count} {op2} {n2}"

    def emit(items, depth):
        pad = "    " * depth
        for item in items:
            kind = item[0]
            if kind == "set":
                lines.append(f"{pad}{count} = pawn.squares_ahead()")
            elif kind == "call":
                lines.append(f"{pad}pawn.{item[1]}()")
            elif kind == "move":
                squares = item[1]
                if squares == "var":
                    lines.append(f"{pad}pawn.move({count})")
                elif squares == "count":
                    lines.append(f"{pad}pawn.move(pawn.squares_ahead())")
                else:
                    lines.append(pad + move_call("pawn", squares))
            elif kind == "say":
                phrase, expr = item[1], item[2]
                if typed is not None:
                    phrase, expr = typed.pop(0), None
                if expr is None:
                    lines.append(f"{pad}print({phrase!r})")
                else:
                    if same and said["first"] is not None:
                        expr = said["first"]
                    said["first"] = said["first"] or expr
                    lines.append(f"{pad}print({expression(expr)})")
            elif kind == "if":
                branches, otherwise = item[1], item[2]
                if take == "first":
                    emit(branches[0][1], depth)
                elif take == "last":
                    emit(otherwise, depth)
                else:
                    for k, (cond, body) in enumerate(branches):
                        lines.append(f"{pad}{'if' if k == 0 else 'elif'} {cond.text()}:")
                        emit(body, depth + 1)
                    if otherwise:
                        lines.append(f"{pad}else:")
                        emit(otherwise, depth + 1)
            elif kind == "loop":
                if unroll:
                    for _ in range(item[1]):
                        emit(item[2], depth)
                else:
                    lines.append(f"{pad}for _ in range({item[1]}):")
                    emit(item[2], depth + 1)

    emit(program, 0)
    return "\n".join(lines) + "\n"


def depth_of(program: tuple) -> int:
    deepest = 0
    for item in program:
        if item[0] == "if":
            deepest = max(deepest, 1 + max(depth_of(body) for body in [*(b for _, b in item[1]), item[2]]))
        elif item[0] == "loop":
            deepest = max(deepest, 1 + depth_of(item[2]))
    return deepest


# -- the levels -----------------------------------------------------------------
#
# Per level: its file, the prose for hints 1 and 2 and the solution note (hint 3
# comes from the reference), which wrong attempts to write, and how to pick hint
# 3's lines ("key": the first line containing a text; "block": that line and the
# lines indented under it; "start": the first n lines). Wrong attempts: "copied"
# (board 1's plain calls), "typed" (board 1's answers word for word), "same" (the
# first comparison for both guards), "first"/"last" (every if-chain replaced by
# its first or last branch), "unrolled" (the loop's body written out).

GUARD_1 = "Gate 1. Halt! Is the hall you walked up before your turn longer than 4 squares? Answer True or False."
GUARD_2 = "Gate 2. And was that same hall shorter than 3 squares, or longer than 6? Answer True or False."


def guards(first: str, second: str) -> dict:
    return {
        "X": {"tile": "gate", "question": GUARD_1, "passphrase": first},
        "Y": {"tile": "gate", "question": GUARD_2, "passphrase": second},
    }


def hall_board(squares: int) -> str:
    rows = ["# # # # # # #", ". . X . Y G #"] + [". # # # # # #"] * (squares - 1) + ["P # # # # # #"]
    return "\n".join(rows)


def storm_rooks(*squares: str) -> list[dict]:
    return [{"kind": "rook", "start": square} for square in squares]


LOOK = [*BASE_API, "look", "bridge"]
TAKE = [*LOOK, "capture_left", "capture_right"]

LEVELS = [
    {
        "id": "ch04-l01",
        "title": "True or False",
        "trains": "True and False, comparisons, and combining them with and, or and not",
        "brief": "Two guards stand between you and the goal. Each asks about the hall: the stretch you walked before your turn. Count it before you leave it, then answer True or False.",
        "map": hall_board(2),
        "legend": guards("False", "True"),
        "variants": [
            {"map": hall_board(4), "legend": guards("False", "False")},
            {"map": hall_board(5), "legend": guards("True", "False")},
            {"map": hall_board(7), "legend": guards("True", "True")},
        ],
        "api": BASE_API,
        "facing": "north",
        "par": 8,
        "names": {"count": "hall"},
        "hints": [
            "Count the hall before you leave it: the guards ask about it at the top, when it's behind you.",
            "A comparison such as \"longer than 4\" is already True or False, so printing the comparison itself prints "
            "the answer. The second question is two comparisons joined by or.",
        ],
        "hint3": ("key", "print(", "One way to answer the first guard:"),
        "note": (
            "The count is taken at the start, while the hall is still ahead, and kept in a name for both guards. A "
            "comparison is already True or False, so printing it answers a guard, and `or` joins the second "
            "question's two comparisons. Typing the answers in would only ever suit one board."
        ),
        "wrong": ["typed", "same"],
        "lesson_board": {
            "map": "# G #\n# X #\n# . #\n# P #",
            "legend": {"X": {"tile": "gate", "question": "Is five more than four? Answer True or False.", "passphrase": "True"}},
            "start": {"facing": "north"},
        },
    },
    {
        "id": "ch04-l02",
        "title": "Mind the Gap",
        "trains": "if: lines that run only when a condition is True, and look()",
        "brief": "The hall has two places where the floor may have fallen away. On each board it's different. You're carrying two planks.",
        "map": """
            # G #
            # . #
            # . #
            # O #
            # . #
            # . #
            # O #
            # . #
            # P #
        """,
        "legend": {"O": "pit"},
        "variants": [
            "# G #\n# . #\n# . #\n# . #\n# . #\n# . #\n# O #\n# . #\n# P #",
            "# G #\n# . #\n# . #\n# O #\n# . #\n# . #\n# . #\n# . #\n# P #",
        ],
        "api": LOOK,
        "facing": "north",
        "planks": 2,
        "par": 7,
        "names": {},
        "hints": [
            "Stop in front of each place where the floor might be gone, and look before you step.",
            "look() names what's straight ahead. An if runs the lines indented under it only when its condition is "
            "True: bridge only when what's ahead is a pit.",
        ],
        "hint3": ("block", "if ", "One way to check, each time:"),
        "note": (
            "Each place where the floor might be gone gets the same check: look first, and lay a plank only over a "
            "pit. The lines after the if run on every board, pit or no pit."
        ),
        "wrong": ["first", "last"],
        "lesson_board": {"map": "# G #\n# . #\n# O #\n# . #\n# L #\n# P #", "legend": {"O": "pit", "L": "plank"}, "start": {"facing": "north"}},
    },
    {
        "id": "ch04-l03",
        "title": "Road Closed",
        "trains": "if and else: one thing or the other. None counts as False, and not",
        "brief": (
            "The road north is closed on some boards, by a wall or a signpost. Where it's closed, go the long way "
            "round. Where it's open, the long way is shut."
        ),
        "map": """
            # . # # #
            . G . . #
            # . # . #
            # . # # #
            # . . . #
            # P # # #
        """,
        "legend": {"S": {"tile": "sign", "text": "No entry. By order of the management."}},
        "variants": [
            "# . # # #\n. G . . #\n# . # . #\n# # # . #\n# . . . #\n# P # # #",
            "# . # # #\n. G . . #\n# . # . #\n# S # . #\n# . . . #\n# P # # #",
        ],
        "api": LOOK,
        "facing": "north",
        "par": 10,
        "names": {},
        "hints": [
            "From the junction, look north. What you see decides which way to go.",
            "look() gives back None for an empty square, and None counts as False in an if, while any word counts as "
            "True. So one condition can ask whether anything is there at all, and else covers the rest.",
        ],
        "hint3": ("key", "if ", "One way to decide:"),
        "note": (
            "`if pawn.look():` is True for anything at all ahead, a wall or a signpost alike, and False for None. "
            "So a single condition covers both ways the road can be closed, and `else` is the open road."
        ),
        "wrong": ["first", "last"],
        "lesson_board": {"map": ". # .\n. P .", "start": {"facing": "north"}},
    },
    {
        "id": "ch04-l04",
        "title": "What Lies Ahead",
        "trains": "elif: a chain of conditions, where the first that's True wins",
        "brief": "Something different lies across the road on every board: a pit, a wall, or nothing at all. You're carrying one plank.",
        "map": """
            . . . G #
            . # # . #
            # # # O #
            . . . . #
            # # # P #
        """,
        "legend": {"O": "pit"},
        "variants": [
            ". . . G #\n. # # . #\n. # # # #\n. . . . #\n# # # P #",
            ". . . G #\n. # # . #\n# # # . #\n. . . . #\n# # # P #",
        ],
        "api": LOOK,
        "facing": "north",
        "planks": 1,
        "par": 10,
        "names": {},
        "hints": [
            "Three boards, three different things across the road, and each needs its own answer.",
            "Check for one thing with if, the next with elif, and leave else for when it's neither. Once a pit is "
            "bridged, it's the open road again.",
        ],
        "hint3": ("key", "if ", "One way to start:"),
        "note": (
            "A chain of conditions checks one thing after another and runs the first branch whose condition is "
            "True. Every board needs something different at the same spot, and the chain gives each its own."
        ),
        "wrong": ["first", "last"],
        "lesson_board": {"map": ". O .\n. P #\n. . .", "legend": {"O": "pit"}, "start": {"facing": "north"}},
    },
    {
        "id": "ch04-l05",
        "title": "Under Attack",
        "trains": "Enemy chess pieces: rooks, which can be taken, and bishops, which can't. And look(\"left\") and look(\"right\")",
        "brief": "An enemy rook has taken the goal square. On each board it stands somewhere else, and on one it has gone. Take it back.",
        "map": """
            # G . . #
            # . . . #
            # # . # #
            # # . # #
            # # P # #
        """,
        "enemies": storm_rooks("b5"),
        "variants": [
            {"map": "# . . G #\n# . . . #\n# # . # #\n# # . # #\n# # P # #", "enemies": storm_rooks("d5")},
            {"map": "# . G . #\n# . . . #\n# # . # #\n# # . # #\n# # P # #", "enemies": []},
        ],
        "api": TAKE,
        "facing": "north",
        "par": 7,
        "names": {},
        "hints": [
            "The rook stands on one of the two squares a pawn captures on. Look at both before you move.",
            "look(\"left\") and look(\"right\") name what's diagonally ahead. Take the rook on whichever side it "
            "stands; when neither side has one, the goal is straight ahead.",
        ],
        "hint3": ("key", "if ", "One way to start:"),
        "note": (
            "A pawn takes diagonally, so the rook can only be taken from the square below it, on whichever side it "
            "stands. The chain looks at both capture squares; when neither holds a rook, the goal is straight ahead."
        ),
        "wrong": ["first", "last"],
        "lesson_board": {
            "map": ". . . .\n. . . .\n. . . .\n. . P .",
            "enemies": [{"kind": "bishop", "start": "a4"}, {"kind": "rook", "start": "d2"}],
            "start": {"facing": "north"},
        },
    },
    {
        "id": "ch04-l06",
        "title": "Pawn Storm",
        "trains": "Chapter 4 mastery: conditions inside a for loop, on boards that each place their rooks differently",
        "brief": "A corridor full of rooks, a different storm on every board. Every time one stands diagonally ahead, take it before it takes you.",
        "map": """
            # . . G #
            # . . . #
            # . . # #
            # . . . #
            # . # . #
            # . . . #
            # # . . #
            # . P . #
        """,
        "enemies": storm_rooks("b3", "c5", "d7"),
        "variants": [
            {
                "map": "# G . . #\n# . . . #\n# # . . #\n# . . . #\n# . # . #\n# . . . #\n# . . # #\n# . P . #",
                "enemies": storm_rooks("d3", "c5", "b7"),
            },
            {
                "map": "# G . . #\n# # . . #\n# . . . #\n# . # . #\n# . . . #\n# # . . #\n# . . . #\n# . P . #",
                "enemies": storm_rooks("b4", "c6", "b8"),
            },
        ],
        "api": TAKE,
        "facing": "north",
        "limit": True,
        "par": 7,
        "mastery": True,
        "names": {},
        "hints": [
            "Every board is different, but every round asks the same question: is there a rook to take?",
            "Put 4.5's choice inside a loop. Each round the pawn looks again, so the same lines take a rook on the "
            "left, a rook on the right, or step forward.",
        ],
        "hint3": ("start", 2),
        "note": (
            "The loop asks the same questions every round, and every board answers them differently, so the same "
            "{lines} lines take every rook on every board. Writing the choice out for each round would take "
            "{unrolled}."
        ),
        "wrong": ["copied", "unrolled"],
    },
]


def questions(level: Level) -> str:
    return " ".join(text for case in level.cases() for text in case.level.board.questions.values())


def best_program(level: Level) -> tuple | None:
    """The best program over every way of lining the boards up: moves in a row as one
    step (so a count can cover them), or one square at a time (so boards that part
    in the middle of a walk still line up), and the one-loop form."""
    options = []
    for single in (False, True):
        runs = [board_run(case.level, single=single) for case in level.cases()]
        if None in runs:
            return None
        for count in (False, True):
            if program := Synth(runs, count, questions(level)).program():
                options.append(merge_moves(program))
        if single and (looped := policy(runs)) is not None:
            options.append(looped)
    return min(options, key=cost, default=None)


def merge_moves(program: tuple) -> tuple:
    """Moves of a known length in a row, as one move: `pawn.move(3)`."""
    out = []
    for item in program:
        if item[0] == "if":
            item = ("if", tuple((cond, merge_moves(body)) for cond, body in item[1]), merge_moves(item[2]))
        elif item[0] == "loop":
            item = ("loop", item[1], merge_moves(item[2]))
        if out and item[0] == "move" and out[-1][0] == "move" and isinstance(item[1], int) and isinstance(out[-1][1], int):
            out[-1] = ("move", out[-1][1] + item[1])
        else:
            out.append(item)
    return tuple(out)


def writer(spec: dict):
    """How `levelgen.build` gets this level's reference and wrong attempts."""

    def write(draft: Level):
        program = best_program(draft)
        if program is None:
            return None

        def wrong_code(kind: str, level: Level) -> str:
            if kind == "copied":
                return "\n".join(write_code(level, fewest_lines(level.cases()[0].level))) + "\n"
            if kind == "typed":
                said = [step.value for step in board_run(level.cases()[0].level).steps if step.kind == "say"]
                return render(program, spec["names"], typed=said)
            if kind == "same":
                return render(program, spec["names"], same=True)
            if kind == "unrolled":
                return render(program, spec["names"], unroll=True)
            return render(program, spec["names"], take=kind)  # first, last

        return render(program, spec["names"]), f"nested {depth_of(program)} deep", wrong_code

    return write


if __name__ == "__main__":
    run_all(LEVELS, lambda spec: build(spec, 4, spec["api"], writer(spec)), sys.argv[1:])
