"""Write Chapter 7 (Spellbook: functions, and the knight) blind (M5.2: docs/M5/M5.2.md, "The levels").

    .venv/Scripts/python scripts/gen_spellbook.py                  # every level below
    .venv/Scripts/python scripts/gen_spellbook.py ch07-l02         # just one
    .venv/Scripts/python scripts/gen_spellbook.py probe [ch07-l02] # only lay the boards and count

How a level is written, with no one reading it. Its board is stepping stones: floor in a field of pits. A seeded
search picks the jumps itself: each level gives it a plan (which jumps repeat, and where), and it takes the first
choice of jumps whose stones are a *snake*: no square twice, and no two stones a knight's jump apart unless they
follow each other on the path, so the board shows one way on. The engine then confirms, by count, that no shorter
route exists. The reference is built from the plan's structure (its loops, `def`s and calls) around the jumps the
search picked. Fixed lines of code, hints 1 to 3 and the notes are stored in ROT13 (`said()` decodes them) and
checked word by word against the repo's own vocabulary. The generator prints counts and outcomes only, never
code, prose or a board: the designer is also the game's learner (see CLAUDE.md: no spoilers).

The lessons (lessons/ch07/) are written by hand: they are what the player reads first.
"""

import random
from functools import cache

import yaml
from gen_knight import shortest
from gen_mastery import WORD, strangers, vocabulary
from levelgen import build, main, said, yaml_text

from rankfile.constraints import code_lines
from rankfile.levels import parse_level
from rankfile.world import KNIGHT_JUMPS

Pos = tuple[int, int]
CHAPTER = 7
SIDE = 12  # the longest a board may be along a side (levels.MAX_SIDE)
JUMP = "knight.jump({}, {})".format
FOR = said("sbe {} va enatr({}):")  # a loop's first line: its variable, how many rounds

# -- stones -------------------------------------------------------------------------------------------


def laid(jumps: list[Pos]) -> list[Pos]:
    """The squares a run of jumps lands on, from the origin, which comes first."""
    squares = [(0, 0)]
    for dx, dy in jumps:
        squares.append((squares[-1][0] + dx, squares[-1][1] + dy))
    return squares


def apart(a: Pos, b: Pos) -> bool:
    """A knight's jump apart."""
    return (abs(a[0] - b[0]), abs(a[1] - b[1])) in ((1, 2), (2, 1))


def snake(squares: list[Pos]) -> bool:
    """One way on: no square twice, and no two stones a jump apart unless they follow each other."""
    return len(set(squares)) == len(squares) and not any(apart(a, b) for i, a in enumerate(squares) for b in squares[i + 2 :])


def span(squares: list[Pos]) -> tuple[int, int]:
    xs, ys = zip(*squares, strict=True)
    return max(xs) - min(xs) + 1, max(ys) - min(ys) + 1


def fits(squares: list[Pos], size: tuple[int, int]) -> bool:
    return all(side <= most for side, most in zip(span(squares), size, strict=True))


def placed(squares: list[Pos], size: tuple[int, int], rng: random.Random) -> list[Pos]:
    """The squares moved onto a board of `size`, anywhere they fit."""
    (wide, high), (xs, ys) = span(squares), zip(*squares, strict=True)
    dx, dy = rng.randint(0, size[0] - wide) - min(xs), rng.randint(0, size[1] - high) - min(ys)
    return [(x + dx, y + dy) for x, y in squares]


def tight(squares: list[Pos]) -> tuple[list[Pos], tuple[int, int]]:
    """The squares on the smallest board that holds them, and its size."""
    size = span(squares)
    return placed(squares, size, random.Random(0)), size


def board(squares: list[Pos], size: tuple[int, int], marks: dict[Pos, str] | None = None) -> str:
    """The map: the path's stones in a field of pits, P on its first and G on its last, and `marks` over that."""
    cells = {square: "." for square in squares} | {squares[0]: "P", squares[-1]: "G"} | (marks or {})
    return "\n".join(" ".join(cells.get((x, y), "O") for x in range(size[0])) for y in reversed(range(size[1])))


def named(square: Pos) -> str:
    return f"{chr(97 + square[0])}{square[1] + 1}"


def routes(rng: random.Random, plan: list[str], size: tuple[int, int]):
    """Every choice of a jump for each name in `plan` whose stones are a snake that fits a board of `size`, in the
    seed's order: the choice (name to jump) and the squares, from the origin."""
    order = list(dict.fromkeys(plan))

    def go(chosen: dict):
        squares = laid([chosen[name] for name in plan[: next((i for i, name in enumerate(plan) if name not in chosen), len(plan))]])
        if not snake(squares) or not fits(squares, size):
            return
        if len(chosen) == len(order):
            yield dict(chosen), squares
            return
        for jump in rng.sample(KNIGHT_JUMPS, len(KNIGHT_JUMPS)):
            chosen[order[len(chosen)]] = jump
            yield from go(chosen)
            del chosen[order[len(chosen) - 1]]

    yield from go({})


# -- code ---------------------------------------------------------------------------------------------


def indented(lines: list[str]) -> list[str]:
    return ["    " + line for line in lines]


def text(lines: list[str]) -> str:
    return "\n".join(lines) + "\n"


def jumping(jumps: list[Pos]) -> list[str]:
    return [JUMP(*jump) for jump in jumps]


def looped(lines: list[str]) -> list[str]:
    """`lines` written with the fewest lines of `for` loops, loops inside loops allowed."""
    seq = tuple(lines)

    @cache
    def best(i: int, j: int) -> tuple[int, tuple]:
        if j - i == 1:
            return 1, (seq[i],)
        options = [(best(i, k)[0] + best(k, j)[0], best(i, k)[1] + best(k, j)[1]) for k in range(i + 1, j)]
        for period in range(1, (j - i) // 2 + 1):
            rounds, rest = divmod(j - i, period)
            if not rest and seq[i:j] == seq[i : i + period] * rounds:
                count, body = best(i, i + period)
                options.append((count + 1, ((rounds, body),)))
        return min(options, key=lambda option: option[0])

    def written(program: tuple, depth: int) -> list[str]:
        out = []
        for item in program:
            out += [item] if isinstance(item, str) else [FOR.format("ijkmn"[depth], item[0]), *indented(written(item[1], depth + 1))]
        return out

    return written(best(0, len(seq))[1], 0)


# -- 7.1: the jump --------------------------------------------------------------------------------------


def stepping(spec: dict, rng: random.Random) -> dict | None:
    """A path that opens with one jump, repeats a pair of jumps, and may close with one more. A column the path
    jumps over is a wall, and an enemy stands on one of the stones."""
    size, rounds = spec["size"], spec["rounds"]
    for tail in rng.sample([[], ["y"]], 2):
        plan = ["x", *["a", "b"] * rounds, *tail]
        for chosen, squares in routes(rng, plan, size):
            reference = [JUMP(*chosen["x"]), FOR.format("i", rounds), *indented(jumping([chosen["a"], chosen["b"]])), *jumping([chosen[name] for name in tail])]
            route = jumping([chosen[name] for name in plan])
            if chosen["a"] == chosen["b"] or len(looped(route)) != len(reference):
                continue
            squares = placed(squares, size, rng)
            columns = {x for x, _ in squares}
            gaps = [x for x in range(min(columns) + 1, max(columns)) if x not in columns]
            start = squares[0]
            falls = [(dx, dy) for dx, dy in KNIGHT_JUMPS if 0 <= start[0] + dx < size[0] and 0 <= start[1] + dy < size[1] and (start[0] + dx, start[1] + dy) not in squares]
            falls = [jump for jump in falls if start[0] + jump[0] not in gaps]
            if not gaps or not falls:
                continue
            wall = rng.choice(gaps)
            return {
                "level": {
                    "map": board(squares, size, {(wall, y): "#" for y in range(size[1])}),
                    "legend": {"O": "pit"},
                    "enemies": [{"kind": "patrol", "start": named(squares[rng.randrange(2, len(squares) - 1)])}],
                    "objectives": ["reach_goal", {"capture": "all"}],
                },
                "reference": reference,
                "wrong": {"walk": ["knight.move(2)"], "bent": ["knight.jump(1, 1)"], "fall": [JUMP(*rng.choice(falls))]},
                "shape": f"{len(squares)} stones, a pair of jumps {rounds} times over, {len(route)} jumps written out",
                "fills": {"repeat": rounds, "written": len(route)},
                "lengths": [len(route)],
            }
    return None


# -- 7.2: def -------------------------------------------------------------------------------------------

FIGURE = said("svther")  # the reference's name for its function


def named_figure(spec: dict, rng: random.Random) -> dict | None:
    """One figure of jumps, several times over, joined by single jumps that differ."""
    figure = [f"f{n}" for n in range(spec["figure"])]
    joins = [f"c{n}" for n in range(spec["times"] - 1)]
    plan = [name for n in range(spec["times"]) for name in [*figure, *joins[n : n + 1]]]
    for chosen, squares in routes(rng, plan, spec["size"]):
        steps = jumping([chosen[name] for name in figure])
        between = jumping([chosen[name] for name in joins])
        calls = [line for n in range(spec["times"]) for line in [f"{FIGURE}()", *between[n : n + 1]]]
        reference = [f"def {FIGURE}():", *indented(steps), *calls]
        route = jumping([chosen[name] for name in plan])
        if len(set(between)) < len(between) or len(looped(steps)) < len(steps) or len(looped(route)) <= len(reference):
            continue
        return {
            "level": {"map": board(placed(squares, spec["size"], rng), spec["size"]), "legend": {"O": "pit"}},
            "reference": reference,
            "wrong": {"written": route, "uncalled": reference[: len(steps) + 1], "early": [*calls, *reference[: len(steps) + 1]]},
            "shape": f"{len(squares)} stones, {len(route)} jumps written out, {len(looped(route))} lines with loops alone",
            "fills": {},
            "lengths": [len(route)],
        }
    return None


# -- 7.3 and 7.4: the examiner's rows -------------------------------------------------------------------

DIRECTION, STRIDES = said("qverpgvba"), said("fgevqrf")  # the reference's names for what the examiner hands over
COUNTED = FOR.format("i", STRIDES)


def stride_of(rng: random.Random, most: int, then: int = 0) -> list[Pos]:
    """Two different jumps east, a stride, and `then` more jumps after the last stride: a row of up to `most`
    strides is a snake that fits a board."""

    def rows(jumps: list[Pos], after: list[Pos]) -> bool:
        return all(snake(laid(jumps * n + after)) and fits(laid(jumps * n + after), (SIDE, SIDE)) for n in range(1, most + 1))

    strides = [[a, b] for a in KNIGHT_JUMPS for b in KNIGHT_JUMPS if a != b and a[0] > 0 and b[0] > 0 and rows([a, b], [])]
    stride = rng.choice(strides)
    return stride + rng.choice([[c] for c in KNIGHT_JUMPS if rows(stride, [c])] if then else [[]])


def row(jumps: list[Pos], marks: dict[int, str] | None = None) -> str:
    """A board that is one row of stones: `marks` by a stone's number on the path."""
    squares, size = tight(laid(jumps))
    return board(squares, size, {squares[at]: symbol for at, symbol in (marks or {}).items()})


def turning(jump: Pos) -> str:
    """A jump whose first number follows the direction handed in."""
    return JUMP(DIRECTION if jump[0] == 1 else f"{jump[0]} * {DIRECTION}", jump[1])


def orders(_spec: dict, rng: random.Random) -> dict:
    """The examiner calls with a direction and a number of strides, once leaving the number out."""
    a, b = stride_of(rng, 4)
    calls = list(zip(rng.sample([1, 1, -1, -1], 4), rng.sample([None, 2, 3, 4], 4), strict=True))
    boards = [row([(dx * way, dy) for dx, dy in (a, b)] * (strides or 1)) for way, strides in calls]
    body = indented([COUNTED, *indented([turning(a), turning(b)])])
    typed = next(strides for _, strides in calls if strides)
    return {
        "level": {
            "map": boards[0],
            "variants": boards[1:],
            "legend": {"O": "pit"},
            "examine": {"function": "gallop", "calls": [{"args": [way, strides] if strides else [way], "board": n} for n, (way, strides) in enumerate(calls, start=1)]},
        },
        "reference": [f"def gallop({DIRECTION}, {STRIDES}=1):", *body],
        "wrong": {
            "typed": [f"def gallop({DIRECTION}, {STRIDES}=1):", *indented([FOR.format("i", typed), *indented([turning(a), turning(b)])])],
            "nodefault": [f"def gallop({DIRECTION}, {STRIDES}):", *body],
            "swapped": [f"def gallop({STRIDES}, {DIRECTION}=1):", *body],
        },
        "shape": f"4 rows of {[2 * (strides or 1) + 1 for _, strides in calls]} stones, {sum(way == 1 for way, _ in calls)} of them eastward",
        "fills": {},
        "lengths": [2 * (strides or 1) for _, strides in calls],
    }


FETCH = {  # 7.4's fixed lines
    "keep": "ahzore = vag(xavtug.ernq())",
    "back": "erghea ahzore",
    "show": "cevag(ahzore)",
    "raw": "ahzore = xavtug.ernq()",
    "typed": "erghea {}",
    "there": "erghea vag(xavtug.ernq())",
}


def answers(_spec: dict, rng: random.Random) -> dict:
    """The examiner sends the knight along a row to a rune and one jump on to the goal, and wants the rune's number."""
    a, b, last = stride_of(rng, 4, then=1)
    sizes = rng.sample([1, 2, 3, 4], 4)
    numbers = rng.sample([*rng.sample(range(2, 10), 3), rng.randrange(11, 60)], 4)
    boards = [row([a, b] * strides + [last], {2 * strides: "R"}) for strides in sizes]
    rune = lambda number: {"R": {"tile": "rune", "text": str(number)}}  # noqa: E731
    line = {key: said(value) for key, value in FETCH.items()}
    head, walk, end = f"def fetch({STRIDES}):", [COUNTED, *indented(jumping([a, b]))], JUMP(*last)

    def spell(*after: str, before: tuple[str, ...] = ()) -> list[str]:
        return [head, *indented([*before, *walk, *after])]

    return {
        "level": {
            "map": boards[0],
            "variants": [{"map": drawn, "legend": rune(number)} for drawn, number in zip(boards[1:], numbers[1:], strict=True)],
            "legend": {"O": "pit", **rune(numbers[0])},
            "examine": {"function": "fetch", "calls": [{"args": [strides], "board": n, "returns": number} for n, (strides, number) in enumerate(zip(sizes, numbers, strict=True), start=1)]},
        },
        "reference": spell(line["keep"], end, line["back"]),
        "wrong": {
            "printed": spell(line["keep"], end, line["show"]),
            "text": spell(line["raw"], end, line["back"]),
            "typed": spell(end, line["typed"].format(numbers[0])),
            "early": spell(end, line["back"], before=(line["keep"],)),
            "there": spell(line["there"]),
        },
        "shape": f"4 rows of {[2 * strides + 2 for strides in sizes]} stones, {sum(number > 9 for number in numbers)} number of two digits",
        "fills": {},
        "lengths": [2 * strides + 1 for strides in sizes],
    }


MAKERS = {"stepping": stepping, "figure": named_figure, "orders": orders, "answers": answers}

# -- the levels -----------------------------------------------------------------------------------------

OPEN = {"start": {"facing": "north"}}  # every lesson board: the knight faces north, as on the level
LEVELS = [
    {
        "id": "ch07-l01",
        "kind": "stepping",
        "seed": 7101,
        "title": "Stepping Stones",
        "trains": "The knight's jump: knight.jump(dx, dy), over walls and onto enemies",
        "brief": "Your pawn is a knight now. It can't walk a single square, and no wall can stop it. Cross the stones.",
        "api": ["jump"],
        "size": (9, 5),
        "rounds": 3,
        "lesson_board": {"map": ". . . . .\n# . . . .\n. # . O .\n. P . . .", "legend": {"O": "pit"}, "enemies": [{"kind": "patrol", "start": "c3"}], **OPEN},
        "hint3": ["start", 1],
        "wrong": ["walk", "bent", "fall"],
        "hints": [
            "Sbyybj gur fgbarf. Rnpu whzc unf gb ynaq ba gur arkg bar: gur cvgf ner n snyy, naq gur jnyy vf bayl va gur jnl bs n cnja.",
            "Gur svefg ahzore bs n whzc vf ubj sne evtug, gur frpbaq ubj sne hc; n zvahf tbrf yrsg be qbja. "
            "Ybbx sbe gur cnve bs whzcf gung pbzrf ntnva naq ntnva ba gur cngu: n sbe ybbc pna ercrng vg.",
        ],
        "note": "Gur ersrerapr sbyybjf gur fgbarf, bire gur jnyy naq bagb gur rarzl. Gur fnzr cnve bs whzcf pbzrf {ercrng} gvzrf va n ebj, "
        "fb n sbe ybbc jevgrf vg bapr: {yvarf} yvarf vafgrnq bs {jevggra}.",
    },
    {
        "id": "ch07-l02",
        "kind": "figure",
        "seed": 7201,
        "title": "A Spell of Your Own",
        "trains": "def: giving some lines a name, and calling them by it",
        "brief": "The same steps, again and again, with something different in between each time. Teach your knight the steps once, and give them a name.",
        "api": ["jump"],
        "size": (10, 8),
        "figure": 4,
        "times": 3,
        "slack": 0,
        "rules": {"define": 1},
        "lesson_board": {"map": ". . . . .\n. . . . .\nP . . . .", **OPEN},
        "hint3": ["said", "N shapgvba, naq gjb pnyyf gb vg:\nqrs svther():\n    xavtug.whzc(...)\n    xavtug.whzc(...)\n\nsvther()\nsvther()"],
        "wrong": ["written", "uncalled", "early"],
        "hints": [
            "Gur fnzr svther bs whzcf pbzrf guerr gvzrf ba guvf obneq. Svaq vg va gur fgbarf orsber lbh jevgr n yvar.",
            "qrs tvirf n anzr gb fbzr yvarf: gur yvarf vaqragrq haqre vg ner gur shapgvba'f obql. Qrsvavat ehaf abguvat. "
            "Gur obql ehaf rnpu gvzr lbh pnyy gur anzr, jvgu cneragurfrf. Chg gur svther va n shapgvba, naq jevgr bayl gur whzcf va orgjrra ol unaq.",
        ],
        "note": "Gur ersrerapr chgf gur svther bs sbhe whzcf va n shapgvba naq pnyyf vg guerr gvzrf, jvgu gur gjb whzcf gung qvssre jevggra va orgjrra. "
        "Jevggra bhg, gur ebhgr vf {jevggra} yvarf; jvgu gur shapgvba vg vf {yvarf}.",
    },
    {
        "id": "ch07-l03",
        "kind": "orders",
        "seed": 7301,
        "title": "Spells That Take Orders",
        "trains": "Parameters: a function with blanks to fill, and a default value for one nobody fills",
        "brief": "The examiner will call your spell gallop: which way, and how many strides. Sometimes it won't say how many. Then it means one.",
        "api": ["jump"],
        "lesson_board": {"map": "\n".join([". . ."] * 6 + ["P . ."] + [". . ."] * 2), **OPEN},
        "hint3": ["said", "N cnenzrgre jvgu n qrsnhyg, naq n whzc gung sbyybjf gur qverpgvba:\nqrs tnyybc(qverpgvba, fgevqrf=1):\n    xavtug.whzc(qverpgvba * ..., ...)"],
        "wrong": ["typed", "nodefault", "swapped"],
        "hints": [
            "Gur rknzvare'f pnyyf ner yvfgrq orsber gur eha. Ernq gurz ntnvafg gur obneqf: jung qbrf gur svefg inyhr fnl, naq jung gur frpbaq?",
            "N cnenzrgre vf n anzr va gur cneragurfrf bs gur qrs yvar: rnpu pnyy svyyf vg jvgu n inyhr, va beqre. Hfr gur frpbaq bar gb pbhag gur fgevqrf, "
            "naq zhygvcyl gur svefg ahzore bs rnpu whzc ol gur svefg bar: zvahf bar gheaf rnfg vagb jrfg. "
            "N cnenzrgre jvgu n qrsnhyg, yvxr fgevqrf=1, znl or yrsg bhg bs n pnyy.",
        ],
        "note": "Gur ersrerapr unf gjb cnenzrgref. Gur frpbaq pbhagf gur fgevqrf, jvgu n qrsnhyg bs 1 sbe gur pnyy gung tvirf ab ahzore. "
        "Gur svefg vf 1 be -1, naq rnpu whzc zhygvcyvrf vgf svefg ahzore ol vg, fb bar obql tbrf rnfg be jrfg.",
    },
    {
        "id": "ch07-l04",
        "kind": "answers",
        "seed": 7402,
        "title": "Spells That Answer",
        "trains": "return: a function that hands a value back to whoever called it",
        "brief": "Near the far end of the stones is a rune with a number on it. The examiner sends your knight across to the goal, and wants the number back.",
        "api": ["jump", "read"],
        "lesson_board": {"map": ". R . . .\n. . . . .\nP . . . .", "legend": {"R": {"tile": "rune", "text": "21"}}, **OPEN},
        "hint3": ["said", "Xrrc gur nafjre, svavfu gur zbir, gura unaq vg onpx:\n    ahzore = vag(xavtug.ernq())\n    xavtug.whzc(...)\n    erghea ahzore"],
        "wrong": ["printed", "text", "typed", "early", "there"],
        "hints": [
            "Gur ahzore vf jevggra ba gur ehar, naq vg vf qvssrerag ba rirel obneq. Lbhe xavtug unf gb ynaq ba gur ehar gb ernq vg.",
            "erghea unaqf n inyhr onpx gb jubrire pnyyrq gur shapgvba, naq raqf gur shapgvba evtug gurer. Cevagvat bayl fubjf n inyhr ba gur fperra. "
            "Gur ehar tvirf grkg, naq gur rknzvare jnagf n ahzore. Gur tbny vf bar whzc cnfg gur ehar, fb xrrc gur ahzore va n anzr hagvy gur ynfg whzc vf qbar.",
        ],
        "note": "Gur ersrerapr whzcf vgf fgevqrf, ernqf gur ehar naq gheaf vgf grkg vagb n ahzore jvgu vag(), znxrf gur ynfg whzc gb gur tbny, "
        "naq bayl gura ergheaf gur ahzore: erghea raqf gur shapgvba, fb vg unf gb pbzr ynfg.",
    },
]

# -- writing a level ------------------------------------------------------------------------------------


def odd(spec: dict) -> list[str]:
    """Where the decoded hints and note use a word the repo never does: which text and which word, by number."""
    found = strangers(spec)
    if spec["hint3"][0] == "said":
        words = WORD.findall(said(spec["hint3"][1]).lower())
        found += [f"{spec['id']}: hint 3, word {number} of {len(words)} isn't in the repo's vocabulary" for number, word in enumerate(words, start=1) if len(word) > 1 and word not in vocabulary()]
    return found


def drawn(spec: dict, made: dict) -> dict:
    """The spec as levelgen takes it: a knight's level, facing north, with the board the search laid."""
    note = said(spec["note"])
    for key, value in made["fills"].items():
        note = note.replace("{" + key + "}", str(value))
    return {**spec, **made["level"], "piece": "knight", "facing": "north", "par": len(made["reference"]), "hints": [said(hint) for hint in spec["hints"]], "note": note}


def confirmed(spec: dict, made: dict) -> list[str]:
    """The engine's own count of the fewest jumps on each board, against the stones'."""
    level = parse_level(yaml.safe_load(yaml_text(drawn(spec, made), chapter=CHAPTER, api=spec["api"], par=99, hints=["", "", ""])))
    fewest = [len(route) if (route := shortest(case.level, looks=False)) else None for case in level.cases()]
    print(f"  {made['shape']}; fewest jumps on each board, by the engine: {fewest}; along the stones: {made['lengths']}")
    return [] if fewest == made["lengths"] else [f"{spec['id']}: a board has another way than along its stones"]


def made_of(spec: dict) -> dict | None:
    return MAKERS[spec["kind"]](spec, random.Random(spec["seed"]))


def build_one(spec: dict) -> list[str]:
    made = made_of(spec)
    if made is None:
        return [f"{spec['id']}: the search found no board for its plan"]
    print(f"{spec['id']}:")
    problems = odd(spec) + confirmed(spec, made)
    return problems + build(drawn(spec, made), CHAPTER, spec["api"], lambda _draft: (text(made["reference"]), f"{code_lines(text(made['reference']))} lines", lambda kind, _level: text(made["wrong"][kind])))


def probe(spec: dict) -> None:
    made = made_of(spec)
    print(f"{spec['id']} ({spec['title']}): " + ("no board for its plan" if made is None else f"a reference of {len(made['reference'])} lines"))
    if made:
        problems = odd(spec) + confirmed(spec, made)
        print(f"  problems: {len(problems)}" + "".join(f"\n  {problem}" for problem in problems))


if __name__ == "__main__":
    main(LEVELS, build_one, probe)
