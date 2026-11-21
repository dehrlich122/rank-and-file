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
from itertools import combinations

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


def routes(rng: random.Random, plan: list[str], size: tuple[int, int], differ: tuple[tuple[str, ...], ...] = ()):
    """Every choice of a jump for each name in `plan` whose stones are a snake that fits a board of `size`, in the
    seed's order: the choice (name to jump) and the squares, from the origin. The names in each group of
    `differ` get jumps that all differ (checked as each is chosen, so a bad start is dropped at once)."""
    order = list(dict.fromkeys(plan))

    def go(chosen: dict):
        squares = laid([chosen[name] for name in plan[: next((i for i, name in enumerate(plan) if name not in chosen), len(plan))]])
        same = any(len({chosen[name] for name in group if name in chosen}) < sum(name in chosen for name in group) for group in differ)
        if same or not snake(squares) or not fits(squares, size):
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


# -- 7.5: scope -----------------------------------------------------------------------------------------

QUESTION = "Halt! What did the three crossings cost you in all? Answer with the number."
RUNES = "abcdefhijkmnqrstuvwyz"  # a board's rune stones, in the path's order
TOLL = {  # 7.5's fixed lines
    "head": "qrs pebff(fgbarf):",
    "zero": "gbyy = 0",
    "loop": "sbe v va enatr(fgbarf):",
    "pay": "gbyy += vag(xavtug.ernq())",
    "back": "erghea gbyy",
    "first": "gbgny = pebff({})",
    "more": "gbgny += pebff({})",
    "say": "cevag(gbgny)",
    "outer": "gbgny = 0",
    "leak": "gbgny += vag(xavtug.ernq())",
    "plain": "pebff({})",
    "show": "cevag(gbyy)",
    "typed": "cevag({})",
    "after": "gbgny = gbyy",
}


def runes(squares: list[Pos], rng: random.Random) -> tuple[dict[Pos, str], dict, int]:
    """Rune stones with a number each: their marks on the map, their legend, and what they come to."""
    numbers = [rng.randint(1, 9) for _ in squares]
    legend = {RUNES[n]: {"tile": "rune", "text": str(number)} for n, number in enumerate(numbers)}
    return {square: RUNES[n] for n, square in enumerate(squares)}, legend, sum(numbers)


def tolls(spec: dict, rng: random.Random) -> dict | None:
    """Three bridges of rune stones, each crossed by one jump over and over, joined by single jumps; then the
    stone beside a guard's gate, and three jumps round onto the gate itself, with the goal one jump beyond."""
    lengths = rng.sample(spec["bridges"], 3)
    plan = [name for n, length in enumerate(lengths) for name in [*["a"] * length, f"c{n}"]] + ["g0", "g1", "g2", "f"]
    for chosen, squares in routes(rng, plan, spec["size"], (("a", "c0"), ("a", "c1"))):
        beside, gate = squares[-5], squares[-2]
        if abs(beside[0] - gate[0]) + abs(beside[1] - gate[1]) != 1:
            continue
        squares = placed(squares, spec["size"], rng)
        stones = [squares[at] for at, name in enumerate(plan, start=1) if name == "a"]
        boards = [runes(stones, rng) for _ in range(3)]
        if len({total for _, _, total in boards}) < 3:
            continue
        drawn = board(squares, spec["size"], {**boards[0][0], squares[-2]: "X"})
        guard = lambda total: {"X": {"tile": "gate", "question": QUESTION, "passphrase": str(total)}}  # noqa: E731
        line = {key: said(value) for key, value in TOLL.items()}
        step, joins, home = JUMP(*chosen["a"]), jumping([chosen[f"c{n}"] for n in range(3)]), jumping([chosen[name] for name in plan[-4:]])

        def program(head: list[str], first: str, more: str, say: str, step=step, joins=joins, home=home, line=line) -> list[str]:
            crossings = [line[first].format(lengths[0]), *[line[more].format(length) for length in lengths[1:]]]
            return [*head, *[code for pair in zip(crossings, joins, strict=True) for code in pair], say, *home]

        walk = [line["loop"], *indented([step])]
        own = [line["zero"], line["loop"], *indented([step, line["pay"]])]
        loops = [code for length, join in zip(lengths, joins, strict=True) for code in [FOR.format("i", length), *indented([step, line["leak"]]), join]]
        return {
            "level": {"map": drawn, "legend": {"O": "pit", **boards[0][1], **guard(boards[0][2])}, "variants": [{"map": drawn, "legend": {**legend, **guard(total)}} for _, legend, total in boards[1:]]},
            "open": {"map": drawn, "legend": {"O": "pit", **boards[0][1], "X": {"tile": "floor"}}},
            "reference": program([line["head"], *indented([*own, line["back"]])], "first", "more", line["say"]),
            "wrong": {
                "typed": program([line["head"], *indented(walk)], "plain", "plain", line["typed"].format(boards[0][2])),
                "outside": program([line["outer"], line["head"], *indented([line["loop"], *indented([step, line["leak"]])])], "plain", "plain", line["say"]),
                "printed": program([line["head"], *indented([*own, line["show"]])], "first", "more", line["say"]),
                "gone": [line["head"], *indented(own), line["plain"].format(lengths[0]), line["after"]],
                "loops": [line["outer"], *loops, line["say"], *home],
            },
            "shape": f"{len(squares)} stones, bridges of {sorted(lengths)} runes, 3 boards",
            "fills": {},
            "lengths": [len(plan)],
        }
    return None


# -- 7.6: functions that call functions -----------------------------------------------------------------

PAIR, LONG = said("cnve"), said("ybat")  # the reference's names for its two functions


def flat(route: list[str]) -> int:
    """The fewest lines found for the route with functions that never call each other: each holds jumps (and
    loops) only. Every one function is tried, every two of the 40 best, every three of the 12 best."""
    seq, spots = tuple(route), {}
    for size in range(2, len(seq) // 2 + 1):
        for at in range(len(seq) - size + 1):
            spots.setdefault(seq[at : at + size], []).append(at)
    pieces = [piece for piece, at in spots.items() if at[-1] - at[0] >= len(piece)]

    def lines(chosen: tuple) -> int:
        best, back = [0] + [len(seq)] * len(seq), [(0, "")] * (len(seq) + 1)
        for end in range(1, len(seq) + 1):
            best[end], back[end] = best[end - 1] + 1, (end - 1, seq[end - 1])
            for number, piece in enumerate(chosen):
                start = end - len(piece)
                if start >= 0 and seq[start:end] == piece and best[start] + 1 < best[end]:
                    best[end], back[end] = best[start] + 1, (start, f"f{number}()")
        tokens, end = [], len(seq)
        while end:
            end, token = back[end]
            tokens.append(token)
        return sum(1 + len(looped(list(piece))) for piece in chosen) + len(looped(tokens[::-1]))

    ranked = sorted(pieces, key=lambda piece: lines((piece,)))
    tried = [(piece,) for piece in ranked] + list(combinations(ranked[:40], 2)) + list(combinations(ranked[:12], 3))
    return min([len(looped(route)), *map(lines, tried)])


def layered(route: list[str]) -> int:
    """The fewest lines found for the route with one function that the others may call: every piece of the route
    that comes more than once is tried as that function, and `flat` writes the rest around its calls."""
    seq, best = tuple(route), len(route)
    for size in range(2, len(seq) // 2 + 1):
        for piece in sorted({seq[at : at + size] for at in range(len(seq) - size + 1)}):
            tokens, at = [], 0
            while at < len(seq):
                found = seq[at : at + size] == piece
                tokens.append("inner()" if found else seq[at])
                at += size if found else 1
            if tokens.count("inner()") > 1:
                best = min(best, 1 + len(looped(list(piece))) + flat(tokens))
    return best


def nested(spec: dict, rng: random.Random) -> dict | None:
    """A small figure of two jumps, alone at first; then a bigger figure (three of the small one, with a jump
    between each two) twice over. Single jumps join them. A longer plan has no board of 12 by 12 (M5.2, "As
    built"): this is the shortest one where a function calling a function is the only way under the limit."""
    small = ["s0", "s1"]
    bigger = [*small, "x", *small, "y", *small]
    plan = [*small, "c0", *bigger, "c1", *bigger]
    for chosen, squares in routes(rng, plan, spec["size"], (("s0", "s1"), ("x", "y"), ("c0", "c1"))):
        jump = {name: JUMP(*chosen[name]) for name in chosen}
        reference = [
            *[f"def {PAIR}():", *indented([jump["s0"], jump["s1"]])],
            *[f"def {LONG}():", *indented([f"{PAIR}()", jump["x"], f"{PAIR}()", jump["y"], f"{PAIR}()"])],
            *[f"{PAIR}()", jump["c0"], f"{LONG}()", jump["c1"], f"{LONG}()"],
        ]
        route = [jump[name] for name in plan]
        limit = len(reference) + spec["slack"]
        if len(looped(route)) <= limit or (fewest := flat(route)) <= limit or (deep := layered(route)) < len(reference):
            continue
        # the tempting one: the bigger figure named and written out, jump by jump
        one_layer = [f"def {LONG}():", *indented([jump[name] for name in bigger]), jump["s0"], jump["s1"], jump["c0"], f"{LONG}()", jump["c1"], f"{LONG}()"]
        return {
            "level": {"map": board(placed(squares, spec["size"], rng), spec["size"]), "legend": {"O": "pit"}},
            "reference": reference,
            "wrong": {"written": route, "loops": looped(route), "flat": one_layer},
            "shape": f"{len(route) + 1} stones, {len(route)} jumps written out, {len(looped(route))} lines with loops alone, {fewest} at best with functions that never call each other, "
            f"{deep} at best with one function the others call, the limit {limit}",
            "fills": {},
            "lengths": [len(route)],
        }
    return None


# -- 7.7: the mastery -------------------------------------------------------------------------------------

RIDE = {  # 7.7's fixed lines
    "head": "qrs evqr(oevqtrf, fgbarf={}):",
    "bare": "qrs evqr(oevqtrf, fgbarf):",
    "zero": "gbgny = 0",
    "outer": "sbe v va enatr(oevqtrf):",
    "sized": "sbe v va enatr({}):",
    "inner": "sbe w va enatr(fgbarf):",
    "pay": "gbgny += vag(xavtug.ernq())",
    "back": "erghea gbgny",
    "typed": "erghea {}",
}


def round_of(_spec: dict, rng: random.Random) -> dict:
    """The examiner calls with a number of bridges and the stones on each, once leaving the stones out. A bridge
    is one jump over and over onto rune stones; another jump joins it to the next, or to the goal."""
    usual = 2
    calls = rng.sample([(3, None), (2, 3), (1, 4), (1, 3)], 4)  # what fits a board: every bridge runs the same way
    laps = [[(bridges, stones or usual)] for bridges, stones in calls]
    path = lambda a, c, bridges, stones: laid(([a] * stones + [c]) * bridges)  # noqa: E731
    good = lambda a, c: all(snake(path(a, c, *lap)) and fits(path(a, c, *lap), (SIDE, SIDE)) for [lap] in laps)  # noqa: E731
    a, c = rng.choice([(a, c) for a in KNIGHT_JUMPS for c in KNIGHT_JUMPS if a != c and good(a, c)])
    boards, totals = [], []
    for [(bridges, stones)] in laps:
        squares, size = tight(path(a, c, bridges, stones))
        marks, legend, total = runes([square for at, square in enumerate(squares) if at % (stones + 1)], rng)
        boards.append({"map": board(squares, size, marks), "legend": legend})
        totals.append(total)
    line = {key: said(value) for key, value in RIDE.items()}

    def spell(head: str, outer: str, back: str) -> list[str]:
        return [head, *indented([line["zero"], outer, *indented([line["inner"], *indented([JUMP(*a), line["pay"]]), JUMP(*c)]), back])]

    head = line["head"].format(usual)
    return {
        "level": {
            "map": boards[0]["map"],
            "legend": {"O": "pit", **boards[0]["legend"]},
            "variants": boards[1:],
            "examine": {
                "function": "ride",
                "calls": [{"args": [bridges, stones] if stones else [bridges], "board": n, "returns": total} for n, ((bridges, stones), total) in enumerate(zip(calls, totals, strict=True), start=1)],
            },
        },
        "reference": spell(head, line["outer"], line["back"]),
        "wrong": {
            "typed": spell(head, line["outer"], line["typed"].format(totals[0])),
            "sized": spell(head, line["sized"].format(calls[0][0]), line["back"]),
            "nodefault": spell(line["bare"], line["outer"], line["back"]),
        },
        "shape": f"4 boards of {[bridges * ((stones or usual) + 1) + 1 for bridges, stones in calls]} stones",
        "fills": {},
        "lengths": [bridges * ((stones or usual) + 1) for bridges, stones in calls],
    }


MAKERS = {"stepping": stepping, "figure": named_figure, "orders": orders, "answers": answers, "tolls": tolls, "nested": nested, "round": round_of}

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
    {
        "id": "ch07-l05",
        "kind": "tolls",
        "seed": 7501,
        "title": "What Happens in the Spell",
        "trains": "Scope: a function's own names, and why values go in through parameters and come out through return",
        "brief": "Three toll bridges. Every stone on a bridge names its toll. At the gate the guard asks what the three crossings cost you in all.",
        "api": ["jump", "read"],
        "size": (12, 12),
        "bridges": [1, 2, 3],  # every bridge runs the same way, so longer ones don't fit a board
        "slack": 0,
        "rules": {"define": 1},
        "lesson_board": {
            "map": ". R . . .\n. . . . X\nP . . . .",
            "legend": {"R": {"tile": "rune", "text": "4"}, "X": {"tile": "gate", "question": "What did the crossing cost you?", "passphrase": "4"}},
            **OPEN,
        },
        "hint3": ["said", "Gur shapgvba ergheaf vgf bja fhz, naq gur cebtenz nqqf vg gb gur gbgny:\ngbgny = pebff(...)\ngbgny += pebff(...)"],
        "wrong": ["typed", "outside", "printed", "gone", "loops"],
        "hints": [
            "Bar shapgvba pna pebff nal bs gur guerr oevqtrf, vs vg vf gbyq ubj znal fgbarf gur oevqtr unf. Jung fubhyq vg unaq onpx?",
            "N anzr znqr vafvqr n shapgvba yvirf bayl gurer, naq fgnegf serfu ba rirel pnyy. N shapgvba pna ernq n anzr sebz bhgfvqr, ohg vg pnaabg punatr bar: "
            "nqqvat gb na bhgfvqr gbgny sebz vafvqr vf na reebe. Fb nqq rnpu gbyy gb n anzr bs gur shapgvba'f bja, erghea vg, naq xrrc gur gbgny bhgfvqr. "
            "Cevag gur gbgny ba gur fgbar orfvqr gur tngr.",
        ],
        "note": "Gur ersrerapr unf bar shapgvba gung pebffrf n oevqtr bs nal yratgu: vg nqqf rnpu gbyy gb n anzr bs vgf bja naq ergheaf gur fhz. "
        "Gur cebtenz xrrcf gur gbgny bhgfvqr, nqqf rnpu pebffvat gb vg, naq cevagf vg orfvqr gur tngr. "
        "Guerr ybbcf jevggra bhg pbzr gb {ybbcf} yvarf, bar bire gur yvzvg bs {yvarf}.",
    },
    {
        "id": "ch07-l06",
        "kind": "nested",
        "seed": 7601,
        "title": "Spells That Cast Spells",
        "trains": "Functions that call functions: a long job taken apart into small named pieces",
        "brief": "The longest road yet, and the shortest spellbook you can write for it. Small spells, and bigger spells made of them.",
        "api": ["jump"],
        "size": (12, 12),
        "slack": 0,
        "lesson_board": {"map": ". . . . . . .\n. . . . . . .\n. . . . . . .\nP . . . . . .", **OPEN},
        "hint3": ["said", "N shapgvba gung pnyyf nabgure:\nqrs cnve():\n    xavtug.whzc(...)\n    xavtug.whzc(...)\n\nqrs ybat():\n    cnve()\n    xavtug.whzc(...)\n    cnve()"],
        "wrong": ["written", "loops", "flat"],
        "hints": [
            "Ybbx sbe gur fznyyrfg svther gung ercrngf, gura sbe gur ovttre svther gung vf znqr bs vg.",
            "N shapgvba pna pnyy nabgure shapgvba. Anzr gur fznyy svther svefg. Gura anzr gur ovttre svther, naq va vgf obql pnyy gur fznyy bar "
            "vafgrnq bs jevgvat vgf whzcf ntnva. Gur cebtenz vgfrys vf gura n srj pnyyf naq gur whzcf va orgjrra.",
        ],
        "note": "Gur ersrerapr anzrf gur fznyy svther bapr, naq ohvyqf gur ovttre svther bhg bs pnyyf gb vg. "
        "Jevggra bhg, gur ebhgr vf {jevggra} yvarf, naq jvgu shapgvbaf gung arire pnyy rnpu bgure vg vf {syng}; gur ersrerapr vf {yvarf}.",
    },
    {
        "id": "ch07-l07",
        "kind": "round",
        "seed": 7701,
        "title": "The Examiner's Round",
        "trains": "Mastery: a function with parameters and a default, a total kept inside it and returned",
        "brief": "The examiner's last test: several toll bridges in one ride, and it wants the whole bill.",
        "api": ["jump", "read"],
        "mastery": True,
        "lesson_board": {"map": ". . . . .\n. . . . .\nP . . . .", **OPEN},
        "hint3": ["said", "N ybbc vafvqr n ybbc, naq n gbgny gung vf erghearq:\n    gbgny = 0\n    sbe v va enatr(oevqtrf):\n        sbe w va enatr(fgbarf):\n            ...\n    erghea gbgny"],
        "wrong": ["typed", "sized", "nodefault"],
        "hints": [
            "Rirel pnyy fnlf ubj znal oevqtrf, naq ubj znal fgbarf ba rnpu. Jura vg yrnirf gur frpbaq bhg, pbhag gur fgbarf ba gung obneq.",
            "Bar ybbc pebffrf n oevqtr, ernqvat rirel ehar naq nqqvat vg gb n gbgny. Nabgure ybbc ehaf gung bapr sbe rnpu oevqtr, "
            "jvgu gur whzc gung wbvaf gur oevqtrf nsgre vg. Gur gbgny yvirf vafvqr gur shapgvba naq vf erghearq ng gur raq.",
        ],
        "note": "Gur ersrerapr vf bar shapgvba: n ybbc bire gur oevqtrf, naq vafvqr vg n ybbc bire gur fgbarf bs bar oevqtr, nqqvat rnpu ehar gb n gbgny "
        "gung vf erghearq ng gur raq. Gur frpbaq cnenzrgre unf n qrsnhyg sbe gur pnyy gung yrnirf vg bhg.",
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
    # a guard's gate can't be passed without the answer, so a board with one is counted with the gate left open
    opened = {key: value for key, value in spec.items() if key != "rules"} if "open" in made else spec
    level = parse_level(yaml.safe_load(yaml_text(drawn(opened, {**made, "level": made.get("open", made["level"])}), chapter=CHAPTER, api=spec["api"], par=99, hints=["", "", ""])))
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
