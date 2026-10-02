"""Write Chapter 5's levels, reference solutions and wrong attempts blind (M3.5).

    .venv/Scripts/python scripts/gen_while.py                  # every level below
    .venv/Scripts/python scripts/gen_while.py ch05-l02         # just one
    .venv/Scripts/python scripts/gen_while.py probe [ch05-l02] # only check the boards

A level is one level on several boards (or hidden-goal squares), and one program
has to solve them all. `solve.py` can't search this: its routes are plain calls,
and a `while` is exactly what a plain-call route can't say. So this script
enumerates small programs from a grammar of lines, runs each on the real engine
with `run_level`, and keeps the shortest that solves every board:
- statements: the level's own calls, plus `break` and `continue` inside a loop;
- blocks: `while`, `for` over a fixed `range()`, `if`, `if`/`else`;
- conditions: only the ones a level lists (what the board can be asked).
Levels whose answer is longer than a brute-force search reaches (a counter, a
road with turns) use one loop over a chain of branches instead, with the setup
and the final lines fixed.
Among the shortest it prefers fewer turns, then fewer characters. It writes each
level's YAML (par from the reference, hint 3 from its lines), the reference, the
wrong attempts and the solution note, and prints only file names, line counts and
outcomes, never code: the designer is also the game's learner (see CLAUDE.md: no
spoilers). Hints 1 and 2 and the notes are stored in ROT13, for the same reason.

`probe` is for designing a level: it prints the fewest lines of any program and of
the shortest ones that avoid `while`, avoid `for`, or avoid `break`, so a spec can
say what makes each concept necessary.
"""

import codecs
import sys
from itertools import product

import yaml
from levelgen import build, run_all, yaml_text  # first: it puts the engine on the import path
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

    @classmethod
    def from_spec(cls, spec: dict) -> Grammar:
        return cls(spec["calls"], spec["conds"], spec.get("ranges", []), statements=spec.get("statements", ()))

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
            for then in range(1, n - 1):
                for yes, no in product(self.sequences(then, in_loop, depth - 1), self.sequences(n - 2 - then, in_loop, depth - 1)):
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


def stairs(marks: dict[int, tuple[int, str]]) -> str:
    """An open board 7 wide and 8 tall with the pawn bottom left. `marks` puts a character on
    a row (counted from the bottom, from 1): {row: (column, character)}."""
    rows = []
    for row in range(8, 0, -1):
        cells = ["."] * 7
        if row == 1:
            cells[0] = "P"
        if row in marks:
            column, char = marks[row]
            cells[column] = char
        rows.append(" ".join(cells))
    return "\n".join(rows)


def staircase(rooks_: int) -> str:
    """The goal one square above the last rook of a diagonal line of `rooks_` rooks (or straight above the pawn if none)."""
    return stairs({rooks_ + 2: (rooks_, "G")})


def rooks(count: int) -> list[dict]:
    return [{"kind": "rook", "start": f"{'abcdefg'[i]}{i + 1}"} for i in range(1, count + 1)]


def tally(rooks_: int) -> dict:
    """The staircase with a guard straight above its last rook, and the goal above the guard.
    The guard asks how many rooks you took."""
    question = "Halt! How many rooks did you take? Answer with the number."
    return {
        "map": stairs({rooks_ + 2: (rooks_, "X"), rooks_ + 3: (rooks_, "G")}),
        "enemies": rooks(rooks_),
        "legend": {"X": {"tile": "gate", "question": question, "passphrase": str(rooks_)}},
    }


def under_a_rook(spots: int) -> str:
    """The staircase with a goal hidden under one of its first `spots` rooks (? marks each)."""
    return stairs({row: (row - 1, "?") for row in range(2, spots + 2)})


def keeper(*legs: int) -> dict:
    """The guard on a road that asks how far you walked: its question, and the answer for this road."""
    question = "Halt! How many squares did you walk to get here? Answer with the number."
    return {"X": {"tile": "gate", "question": question, "passphrase": str(sum(legs) - 2)}}


AT_GOAL = ["not pawn.at_goal()"]

# Each level: its boards and rules, what the search may use (`calls`, `conds`, `ranges`),
# and its words. Hints 1 and 2 and the note are ROT13 (see the docstring); `{lines}` in a
# note becomes the reference's line count. `wrong` names the attempts to write: "typed"
# (board 1's own moves, typed out), "once" (the loop's `while` turned into an `if`) and
# "norule" (the shortest program that breaks the level's rule).
LEVELS: list[dict] = [
    {
        "id": "ch05-l01",
        "title": "Until You Arrive",
        "trains": "while: repeat for as long as a condition is True, here until the pawn arrives",
        "brief": "The goal is hidden. It might be on any of the three squares marked ?.",
        "map": "# ? #\n# . #\n# . #\n# ? #\n# . #\n# . #\n# . #\n# ? #\n# . #\n# P #",
        "facing": "north",
        "api": ["move", "turn_left", "turn_right", "wait", "at_goal"],
        "calls": ["move()"],
        "conds": AT_GOAL,
        "ranges": [2, 3, 4, 5, 6, 7, 8, 9],
        "par": 2,
        "hints": [
            "Lbh qba'g xabj jurer gur tbny vf, fb lbh pna'g pbhag gur fgrcf. Nfx gur cnja jurgure vg unf neevirq.",
            "N juvyr ybbc ercrngf vgf vaqragrq yvarf sbe nf ybat nf vgf pbaqvgvba vf Gehr. Xrrc fgrccvat sbe nf ybat nf gur cnja vf abg ng gur tbny.",
        ],
        "hint3": ["key", "while", "Start the loop like this:"],
        "wrong": ["typed", "once"],
        "note": "N juvyr ybbc arrqf ab pbhag: vg raqf jura vgf pbaqvgvba gheaf Snyfr. {yvarf} yvarf, jurerire gur tbny vf.",
        "lesson_board": {"map": "# G #\n# . #\n# . #\n# . #\n# P #", "start": {"facing": "north"}},
    },
    {
        "id": "ch05-l02",
        "title": "The Winding Road",
        "trains": "while, when the number of rounds isn't known ahead",
        "brief": "The road bends left, and on every board it bends a different number of times. The goal is at the end. The pawn starts facing east.",
        "map": road(6, 3),
        "variants": [road(3, 4, 2), road(5, 4, 3, 2), road(4, 2, 5)],
        "facing": "east",
        "api": ["move", "turn_left", "turn_right", "squares_ahead", "wait", "at_goal", "look"],
        "calls": ["move()", "turn_left()", "move(pawn.squares_ahead())"],
        "conds": [*AT_GOAL, "pawn.look() != None"],
        "ranges": [8, 10, 12, 14, 16, 18],
        "search": 4,
        "par": 3,
        "hints": [
            "Rirel ebnq oraqf n qvssrerag ahzore bs gvzrf, fb ab svkrq ahzore bs ebhaqf jbexf. Ercrng hagvy lbh neevir.",
            "Bar ebhaq vf n fgergpu bs ebnq naq n ghea. Gur cnja pna nfx ubj sne gur arkg jnyy vf. Ercrng ebhaqf sbe nf ybat nf gur cnja vf abg ng gur tbny.",
        ],
        "hint3": ["key", "while", "Start the loop like this:"],
        "wrong": ["typed", "once"],
        "note": "Rnpu ebhaq pebffrf bar fgergpu naq gheaf, naq gur ybbc qrpvqrf ubj znal ebhaqf gurer ner. {yvarf} yvarf.",
        "lesson_board": {"map": "# . #\n# . #\n# . #\n# P #", "start": {"facing": "north"}},
    },
    {
        "id": "ch05-l03",
        "title": "Counting Steps, Again",
        "trains": "a counter: a variable changed on every pass of a while loop",
        "brief": "A guard stands on the road. He wants to know how far you walked to get here, and the road is different on every board.",
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
        "par": 9,
        "hints": [
            "Gur thneq nfxf nobhg lbhe jubyr jnyx, naq rirel ebnq vf qvssrerag. Pbhag nf lbh tb.",
            "Znxr n inevnoyr gung fgnegf ng 0 orsber gur ybbc naq tebjf ol 1 sbe rirel fgrc. Cevag vg jura gur thneq vf nurnq, gura jnyx ba.",
        ],
        "hint3": ["key", "+=", "Count inside the loop, with a line like:"],
        "wrong": ["typed", "once"],
        "note": "N pbhagre vf n inevnoyr punatrq ba rirel cnff bs gur ybbc: frg vg orsber, hcqngr vg vafvqr, cevag vg nsgre. {yvarf} yvarf.",
    },
    {
        "id": "ch05-l04",
        "title": "Which Rook?",
        "trains": "break: leaving a loop early (continue skips the rest of one pass)",
        "brief": "A staircase of rooks, and the goal is hidden under one of them. Take rooks until you find it.",
        "map": under_a_rook(4),
        "enemies": rooks(5),
        "facing": "north",
        "api": ["move", "turn_left", "turn_right", "wait", "at_goal", "look", "capture_left", "capture_right"],
        "calls": ["capture_right()", "move()"],
        "conds": ["not pawn.at_goal()", 'pawn.look("right") == "rook"'],
        "ranges": [1, 2, 3, 4, 5],
        "search": 4,
        "require": ["Break"],
        "need": ["break"],
        "par": 4,
        "hints": [
            "Lbh pna'g gryy juvpu ebbx uvqrf gur tbny, fb gnxr gurz bar ng n gvzr naq purpx nsgre rnpu pncgher.",
            "Hfr n ybbc gung arire raqf ol vgfrys, purpx sbe gur tbny vafvqr vg nsgre rnpu pncgher, naq yrnir gur ybbc jvgu oernx.",
        ],
        "hint3": ["key", "break", "Leave the loop with:"],
        "wrong": ["typed", "norule"],
        "note": "oernx yrnirf gur arnerfg ybbc ng bapr. Gur purpx fvgf nsgre gur pncgher, vafvqr gur ybbc, naq oernx raqf vg. {yvarf} yvarf.",
        "lesson_board": {"map": "# # #\n# . #\n# . #\n# . #\n# P #", "start": {"facing": "north"}},
    },
    {
        "id": "ch05-l05",
        "title": "The Staircase",
        "trains": "while on look(): a loop that runs as many times as the board says, even none",
        "brief": "A line of rooks climbs the board, one step up and one step across. Take them all. The goal is straight above the last one.",
        "map": staircase(2),
        "enemies": rooks(2),
        "variants": [{"map": staircase(n), "enemies": rooks(n)} for n in (0, 3, 5)],
        "facing": "north",
        "api": ["move", "turn_left", "turn_right", "wait", "at_goal", "look", "capture_left", "capture_right"],
        "calls": ["move()", "capture_right()"],
        "conds": ['pawn.look("right") == "rook"', "not pawn.at_goal()"],
        "ranges": [1, 2, 3, 4, 5, 6],
        "search": 4,
        "par": 3,
        "hints": [
            "Rirel obneq unf n qvssrerag ahzore bs ebbxf, rira abar. Ybbx orsber lbh gnxr.",
            "Xrrc gnxvat ebbxf sbe nf ybat nf bar fgnaqf qvntbanyyl nurnq ba gur evtug. Jura abar vf yrsg gur ybbc raqf, rira vs gurer jnf abar gb ortva jvgu.",
        ],
        "hint3": ["key", "while", "Start the loop like this:"],
        "wrong": ["typed", "once"],
        "note": "Gur ybbc'f pbaqvgvba nfxf gur obneq, fb vg ehaf bapr cre ebbx: svir gvzrf, bapr be abg ng nyy. {yvarf} yvarf.",
        "lesson_board": {
            "map": ". . . .\n. . . .\n. . . .\nP . . .",
            "enemies": [{"kind": "rook", "start": "b2"}, {"kind": "rook", "start": "c3"}],
            "start": {"facing": "north"},
        },
    },
    {
        "id": "ch05-l06",
        "title": "The Tally",
        "trains": "a loop that asks the board and keeps a count, together (mastery)",
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
        "par": 6,
        "limit": True,
        "mastery": True,
        "hints": [
            "Gjb wbof funer bar ybbc: gnxvat gur ebbxf naq pbhagvat gurz.",
            "Frg n pbhagre gb 0 orsber gur ybbc naq nqq 1 sbe rirel ebbx lbh gnxr. Jura gur thneq vf nurnq, cevag vg, gura jnyx guebhtu gur tngr.",
        ],
        "hint3": ["key", "+=", "Count inside the loop, with a line like:"],
        "wrong": ["typed", "once"],
        "note": "Rnpu cnff gnxrf n ebbx naq pbhagf vg, fb nsgrejneqf gur pbhagre vf gur nafjre. {yvarf} yvarf.",
    },
]


def level_of(spec: dict) -> Level:
    return parse_level(yaml.safe_load(yaml_text(spec, chapter=5, api=spec["api"], par=spec.get("par", 99), hints=["", "", ""])))


# -- the programs that solve a level -----------------------------------------------------------


def ladder_codes(spec: dict):
    """For a level whose answer is one loop over what's around it: every `while <loop cond>:`
    over a chain of up to `rungs` branches (`if`/`elif`, each a condition and its lines) and an
    optional `else`, between the level's fixed first and last lines."""
    calls = [(f"pawn.{call}",) for call in spec["calls"]] + [tuple(lines) for lines in spec.get("actions", [])]
    for loop in spec["loop_conds"]:
        for rungs in range(0, spec.get("rungs", 3) + 1):
            for chosen in product(product(spec["branch_conds"], calls), repeat=rungs):
                for other in [None, *calls]:
                    if rungs == 0 and other is None:
                        continue
                    lines = [f"while {loop}:"]
                    for i, (cond, call) in enumerate(chosen):
                        lines += [f"    {'if' if i == 0 else 'elif'} {cond}:", *[f"        {line}" for line in call]]
                    if other:
                        lines += ["    else:", *[f"        {line}" for line in other]]
                    yield spec.get("before", "") + "\n".join(lines) + "\n" + spec.get("after", "")


def grammar_codes(grammar: Grammar, spec: dict, lines: int, ban: tuple, need: tuple):
    """Every program of `lines` lines (plus the level's fixed first and last lines) that avoids
    the words in `ban` and uses those in `need`."""
    for program in grammar.sequences(lines, False, 2):
        if any(uses(program, word) for word in ban) or not all(uses(program, word) for word in need):
            continue
        code = spec.get("before", "") + text_of(program) + spec.get("after", "")
        if code_lines(code) == code_lines(spec.get("before", "")) + lines + code_lines(spec.get("after", "")):
            yield code


def shortest_programs(level: Level, spec: dict, *, ban: tuple = (), need: tuple = ()) -> tuple[int, list[str]] | None:
    """(lines, every program of that length that solves every board), shortest first."""

    def solves(code: str) -> bool:
        return run_level(level, code, line_budget=BUDGET, enforce_constraints=False).status == "solved"

    if "branch_conds" in spec:
        found: dict[int, list[str]] = {}
        for code in ladder_codes(spec):
            if solves(code):
                found.setdefault(code_lines(code), []).append(code)
        return (min(found), found[min(found)]) if found else None
    grammar = Grammar.from_spec(spec)
    for lines in range(1, spec.get("search", 4) + 1):
        codes = [code for code in grammar_codes(grammar, spec, lines, ban, need) if solves(code)]
        if codes:
            return code_lines(codes[0]), codes
    return None


def pick(codes: list[str]) -> str:
    """The plainest of equally short programs: fewest turns, then fewest characters."""
    return min(codes, key=lambda code: (code.count("turn"), len(code), code))


# -- writing a level -----------------------------------------------------------------------------


def said(text: str) -> str:
    return codecs.decode(text, "rot13")


def writer(spec: dict):
    """The `build` writer for one level: its reference and how to write each wrong attempt."""

    def write(draft: Level):
        found = shortest_programs(draft, spec, need=tuple(spec.get("need", ())))
        if found is None:
            return None
        lines, codes = found
        reference = pick(codes)

        def wrong_code(kind: str, level: Level) -> str:
            if kind == "typed":
                return route_code(level.cases()[0].level)
            if kind == "once":
                return reference.replace("while ", "if ", 1)
            return pick(shortest_programs(level, spec, ban=tuple(spec["need"]))[1])  # "norule"

        return reference, f"{lines} lines searched, {len(codes)} like it", wrong_code

    return write


def route_code(board: Level) -> str:
    """The board's own fewest-line route of plain calls, typed out as code."""
    return "\n".join(write_code(board, fewest_lines(board))) + "\n"


def build_one(spec: dict) -> list[str]:
    words = {**spec, "hints": [said(hint) for hint in spec["hints"]], "note": said(spec["note"])}
    return build(words, 5, spec["api"], writer(spec))


# -- checking a draft board ------------------------------------------------------------------------


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
    print(f"{spec['id']} ({spec['title']}): {len(level.cases())} boards; {plain_routes(level)}")
    if "branch_conds" in spec:
        best = shortest_programs(level, spec)
        print("  a loop over a chain of branches: " + (f"{best[0]} lines ({len(best[1])} programs)" if best else "none"))
        return
    grammar = Grammar.from_spec(spec)
    top = spec.get("search", 4)
    found = survey(level, grammar, top, before=spec.get("before", ""), after=spec.get("after", ""))
    for kind in KINDS:
        lines, number = found.get(kind, (None, 0))
        print(f"  {kind}: " + (f"{lines} lines ({number} programs)" if lines else f"none up to {top}"))


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "probe":
        for level_spec in LEVELS:
            if len(args) == 1 or level_spec["id"] in args[1:]:
                probe(level_spec)
    else:
        run_all(LEVELS, build_one, args)
