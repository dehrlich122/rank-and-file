"""Write Chapter 8 (The Satchel: lists and tuples) blind (M5.3: docs/M5/M5.3.md, "The levels").

    .venv/Scripts/python scripts/gen_satchel.py                  # every level below
    .venv/Scripts/python scripts/gen_satchel.py ch08-l02         # just one
    .venv/Scripts/python scripts/gen_satchel.py probe [ch08-l02] # only lay the boards and count

It writes as Chapter 7's generator does (gen_spellbook.py, whose stones, code helpers and writers it borrows):
each level's board is stepping stones in a field of pits, laid by a seeded search; the reference is built from
the board's own jumps around fixed lines; fixed lines, hints 1 to 3 and the notes are stored in ROT13 and
checked word by word against the repo's vocabulary; only counts and outcomes are printed.

Two shapes are new here (the spec's "The levels"). A *ladder*: every jump goes two up and one step left or
right, so a route up it is a list of sides. A *hub*: a stone with other stones one jump from it; two squares a
jump from the same stone are never a jump from each other, so the only way from one to the next is back
through the hub. A board with side stones (a key one jump off the road) is checked with `alone`: no two stones
a jump apart unless the plan joins them. The engine then counts the fewest jumps with every key, door and gate
left as a plain stone.

The lessons (lessons/ch08/) are written by hand: they are what the player reads first.
"""

import random
from itertools import combinations, permutations, product

from gen_spellbook import (
    FOR,
    JUMP,
    RUNES,
    SIDE,
    apart,
    board,
    fits,
    indented,
    jumping,
    laid,
    looped,
    routes,
    row,
    snake,
    tight,
    writers,
)
from levelgen import main, said

from rankfile.world import KNIGHT_JUMPS

Pos = tuple[int, int]
CHAPTER = 8
PIT = {"O": "pit"}
FLOOR = {"tile": "floor"}
TRIES = 20000  # boards a seeded search may lay before it gives up

# -- stones -------------------------------------------------------------------------------------------


def on(square: Pos, jump: Pos) -> Pos:
    return square[0] + jump[0], square[1] + jump[1]


def back(jump: Pos) -> Pos:
    return -jump[0], -jump[1]


def alone(stones: list[Pos], links: list[tuple[Pos, Pos]]) -> bool:
    """One way on, for a board with side stones: no stone twice, and no two a jump apart unless `links` joins them."""
    joined = {frozenset(link) for link in links}
    return len(set(stones)) == len(stones) and all(frozenset(pair) in joined for pair in combinations(stones, 2) if apart(*pair))


def framed(paths: list[list[Pos]]) -> tuple[list[list[Pos]], tuple[int, int]]:
    """Several boards' stones moved together onto the smallest board that holds them all, and its size: what the
    boards share stays where it is from one to the next."""
    xs, ys = zip(*[square for path in paths for square in path], strict=True)
    return [[(x - min(xs), y - min(ys)) for x, y in path] for path in paths], (max(xs) - min(xs) + 1, max(ys) - min(ys) + 1)


def unsorted(rng: random.Random, count: int) -> list[int]:
    """Key numbers in the order they are picked up: not in order already, and not the smallest first."""
    while True:
        numbers = rng.sample(range(2, 40), count)
        if numbers != sorted(numbers) and numbers[0] != min(numbers):
            return numbers


def keys_of(names: list) -> dict:
    """A legend's keys, a symbol for each name in the order given."""
    return {RUNES[at]: {"tile": "key", "name": name} for at, name in enumerate(names)}


# -- 8.1: a list ----------------------------------------------------------------------------------------

LOOP, STEP = said("sbe fvqr va ebhgr:"), said("xavtug.whzc(fvqr, 2)")  # a ladder ridden from a list (8.1, 8.4)
CLIMB = {  # 8.1's fixed lines
    "head": "qrs pyvzo(ebhgr):",
    "place": "xavtug.whzc(ebhgr[{}], 2)",
    "at": "xavtug.whzc(ebhgr[v], 2)",
}


def ladders(spec: dict, rng: random.Random) -> dict:
    """The examiner calls with a list of sides on four ladders, each as tall as its list. Every list goes both
    ways, and none starts as another does all the way."""
    lengths = rng.sample(spec["lengths"], len(spec["lengths"]))
    while True:
        lists = [[rng.choice((1, -1)) for _ in range(length)] for length in lengths]
        if all(len(set(sides)) == 2 for sides in lists) and not any(a[: len(b)] == b for a, b in permutations(lists, 2)):
            break
    boards = [row([(side, 2) for side in sides]) for sides in lists]
    line = {key: said(value) for key, value in CLIMB.items()}
    return {
        "level": {
            "map": boards[0],
            "variants": boards[1:],
            "legend": PIT,
            "examine": {"function": "climb", "calls": [{"args": [sides], "board": n} for n, sides in enumerate(lists, start=1)]},
        },
        "reference": [line["head"], *indented([LOOP, *indented([STEP])])],
        "wrong": {
            "places": [line["head"], *indented([line["place"].format(at) for at in range(max(lengths))])],
            "counted": [line["head"], *indented([FOR.format("i", lengths[0]), *indented([line["at"]])])],
        },
        "shape": f"4 ladders of {lengths} jumps",
        "fills": {},
        "lengths": lengths,
    }


# -- 8.2: pairs -----------------------------------------------------------------------------------------

VISIT = {  # 8.2's fixed lines
    "head": "qrs ivfvg(fgbcf):",
    "loop": "sbe k, l va fgbcf:",
    "here": "urer_k, urer_l = xavtug.cbfvgvba",
    "step": "xavtug.whzc(k - urer_k, l - urer_l)",
    "asjump": "xavtug.whzc(k, l)",
    "each": "sbe fgbc va fgbcf:",
    "whole": "xavtug.whzc(fgbc)",
}


def paths(spec: dict, rng: random.Random) -> dict | None:
    """The examiner calls with a list of places on four winding paths of different lengths: every stone after
    the first, in order, as (x, y)."""
    boards, calls, lengths, first = [], [], rng.sample(spec["lengths"], len(spec["lengths"])), []
    for n, length in enumerate(lengths, start=1):
        plan = [f"j{at}" for at in range(length)]
        found = next(((chosen, squares) for chosen, squares in routes(rng, plan, spec["size"]) if len(set(chosen.values())) >= 3), None)
        if found is None:
            return None
        squares, size = tight(found[1])
        boards.append(board(squares, size))
        calls.append({"args": [[list(square) for square in squares[1:]]], "board": n})
        first = first or jumping([found[0][name] for name in plan])
    line = {key: said(value) for key, value in VISIT.items()}
    return {
        "level": {"map": boards[0], "variants": boards[1:], "legend": PIT, "examine": {"function": "visit", "calls": calls}},
        "reference": [line["head"], *indented([line["loop"], *indented([line["here"], line["step"]])])],
        "wrong": {
            "asjump": [line["head"], *indented([line["loop"], *indented([line["asjump"]])])],
            "whole": [line["head"], *indented([line["each"], *indented([line["whole"]])])],
            "typed": [line["head"], *indented(first)],
        },
        "shape": f"4 paths of {lengths} jumps",
        "fills": {},
        "lengths": lengths,
    }


# -- 8.3: the satchel -----------------------------------------------------------------------------------

KINDS = ["brass", "iron", "bone"]  # two of them lie on each board; the doors want the first two
PICK = said("xavtug.cvpx_hc()")
SATCHEL = {  # 8.3's fixed lines
    "ask": 'vs "{}" va xavtug.vairagbel:',
    "other": "ryfr:",
    "byhand": 'xavtug.vairagbel.nccraq("{}")',
}


def forked(spec: dict, rng: random.Random) -> dict | None:
    """Two road stones with a key one jump off each (the same jumps both times), then a fork: two doors a jump
    from the second road stone, two squares apart, which join again one jump on; the goal is a jump beyond.
    Three boards on one map: each holds a different two of the three kinds of key."""
    for _ in range(TRIES):
        road, spur, last, a = (rng.choice(KNIGHT_JUMPS) for _ in range(4))
        b = (-a[0], a[1]) if abs(a[0]) == 1 else (a[0], -a[1])  # the other door: the first one's mirror
        first = on((0, 0), road)
        second = on(first, road)
        keys, doors = [on(first, spur), on(second, spur)], [on(second, a), on(second, b)]
        join = on(doors[0], b)
        stones = [(0, 0), first, second, *keys, *doors, join, on(join, last)]
        # the same jumps fetch each key, so the keys' stones are a road's jump apart too: a second way, never a shorter program
        links = [((0, 0), first), (first, second), (first, keys[0]), (second, keys[1]), (keys[0], keys[1]), *[(second, door) for door in doors], *[(door, join) for door in doors], (join, stones[-1])]
        if alone(stones, links) and fits(stones, spec["size"]):
            break
    else:
        return None
    stones, size = tight(stones)
    marks = {stones[3]: RUNES[0], stones[4]: RUNES[1], stones[5]: "D", stones[6]: "E"}
    drawn = board(stones, size, marks)
    held = [rng.sample(pair, 2) for pair in rng.sample(list(combinations(KINDS, 2)), 3)]
    doors = {"D": {"tile": "door", "key": KINDS[0]}, "E": {"tile": "door", "key": KINDS[1]}}
    line = {key: said(value) for key, value in SATCHEL.items()}
    fetch = [FOR.format("i", 2), *indented([JUMP(*road), JUMP(*spur), PICK, JUMP(*back(spur))])]
    by_first, by_second, end = [JUMP(*a), JUMP(*b)], [JUMP(*b), JUMP(*a)], JUMP(*last)
    return {
        "level": {"map": drawn, "legend": {**PIT, **keys_of(held[0]), **doors}, "variants": [{"map": drawn, "legend": keys_of(pair)} for pair in held[1:]]},
        "open": {"map": drawn, "legend": {**PIT, **dict.fromkeys(marks.values(), FLOOR)}},
        "reference": [*fetch, line["ask"].format(KINDS[0]), *indented(by_first), line["other"], *indented(by_second), end],
        "wrong": {
            "samedoor": [*fetch, *by_first, end],
            "nokey": [PICK, *fetch, *by_first, end],
            "byhand": [line["byhand"].format(KINDS[0]), *fetch, *by_first, end],
        },
        "shape": f"{len(stones)} stones, 3 boards, both doors open on {sum(set(pair) == set(KINDS[:2]) for pair in held)} of them",
        "fills": {},
        "lengths": [5],
    }


# -- 8.4: append ----------------------------------------------------------------------------------------

GATHER = {  # 8.4's fixed lines
    "empty": "ebhgr = []",
    "keep": "ebhgr.nccraq(vag(xavtug.ernq()))",
    "kept": "ebhgr = ebhgr.nccraq(vag(xavtug.ernq()))",
    "raw": "ebhgr.nccraq(xavtug.ernq())",
    "name": "{} = vag(xavtug.ernq())",
    "use": "xavtug.whzc({}, 2)",
}
RUNGS = 4  # rune stones on the staircase, and jumps up the ladder


def gathered(spec: dict, rng: random.Random) -> dict | None:
    """A staircase of rune stones (one jump over and over), then a ladder whose sides are the runes' numbers in
    the order they were read. Three boards: the runes and the ladder differ, the staircase stays."""
    for _ in range(TRIES):
        stair = rng.choice([jump for jump in KNIGHT_JUMPS if abs(jump[0]) == 2])
        lists = [[rng.choice((1, -1)) for _ in range(RUNGS)] for _ in range(3)]
        laid_out = [laid([stair] * RUNGS + [(side, 2) for side in sides]) for sides in lists]
        differ = len({tuple(sides) for sides in lists}) == 3 and all(len(set(sides)) == 2 for sides in lists)
        if differ and all(snake(path) for path in laid_out) and fits([square for path in laid_out for square in path], (SIDE, SIDE)):
            break
    else:
        return None
    laid_out, size = framed(laid_out)
    boards = [
        {"map": board(path, size, {path[at + 1]: RUNES[at] for at in range(RUNGS)}), "legend": {RUNES[at]: {"tile": "rune", "text": str(side)} for at, side in enumerate(sides)}}
        for path, sides in zip(laid_out, lists, strict=True)
    ]
    line = {key: said(value) for key, value in GATHER.items()}
    stairs = FOR.format("i", RUNGS)

    def program(keep: str) -> list[str]:
        return [line["empty"], stairs, *indented([JUMP(*stair), keep]), LOOP, *indented([STEP])]

    names = "abcd"[:RUNGS]
    return {
        "level": {"map": boards[0]["map"], "legend": {**PIT, **boards[0]["legend"]}, "variants": boards[1:]},
        "reference": program(line["keep"]),
        "wrong": {
            "typed": [stairs, *indented([JUMP(*stair)]), *looped(jumping([(side, 2) for side in lists[0]]))],
            "names": [code for name in names for code in (JUMP(*stair), line["name"].format(name))] + [line["use"].format(name) for name in names],
            "kept": program(line["kept"]),
            "text": program(line["raw"]),
        },
        "shape": f"{len(laid_out[0])} stones on a board of {size}, 3 boards",
        "fills": {},
        "lengths": [2 * RUNGS] * 3,
    }


# -- 8.5: in order --------------------------------------------------------------------------------------

SMALLEST = "Halt! Which is the smallest key in your satchel? Answer with its number."
ALL = "And now all of them, smallest first. Answer with the list, as print() shows a list."
ORDER = {  # 8.5's fixed lines
    "least": "cevag(zva(xavtug.vairagbel))",
    "all": "cevag(fbegrq(xavtug.vairagbel))",
    "typed": "cevag({})",
    "asfilled": "cevag(xavtug.vairagbel)",
    "each": "sbe xrl va fbegrq(xavtug.vairagbel):",
    "show": "cevag(xrl)",
}
# three jumps that end one square along from where they began: the way round onto a gate from the stone beside it
ROUNDS = [trio for trio in product(KNIGHT_JUMPS, repeat=3) if sorted(abs(sum(leg)) for leg in zip(*trio, strict=True)) == [0, 1]]
KEYS = 4  # 8.5's keys


def answers_of(numbers: list[int]) -> dict:
    """The two guards of a board whose keys carry `numbers`."""
    return {"X": {"tile": "gate", "question": SMALLEST, "passphrase": str(min(numbers))}, "Y": {"tile": "gate", "question": ALL, "passphrase": str(sorted(numbers))}}


def guarded(spec: dict, rng: random.Random) -> dict | None:
    """Four road stones with a numbered key one jump off each (the same jumps every time). The last road stone
    is beside the first guard's gate; three jumps go round onto it, where the knight stands beside the second
    gate; the same three go round onto that, and the goal is a jump beyond. Three boards on one map: the keys'
    numbers differ, and with them both answers."""
    for _ in range(TRIES):
        road, spur, last = (rng.choice(KNIGHT_JUMPS) for _ in range(3))
        around = rng.choice(ROUNDS)
        path = laid([road] * KEYS + [*around] * 2 + [last])
        keys = [on(stone, spur) for stone in path[1 : KEYS + 1]]
        stones = [*path[:-1], *keys, path[-1]]
        # (the keys' stones are a road's jump apart, as in 8.3)
        if alone(stones, [*zip(path, path[1:], strict=False), *zip(path[1:], keys, strict=False), *zip(keys, keys[1:], strict=False)]) and fits(stones, spec["size"]):
            break
    else:
        return None
    stones, size = tight(stones)
    gates = [stones[KEYS + 3], stones[KEYS + 6]]
    marks = {**{stone: RUNES[at] for at, stone in enumerate(stones[-KEYS - 1 : -1])}, gates[0]: "X", gates[1]: "Y"}
    drawn = board(stones, size, marks)
    carried = []
    while len({tuple(sorted(numbers)) for numbers in carried}) < 3:
        carried = [unsorted(rng, KEYS) for _ in range(3)]
    line = {key: said(value) for key, value in ORDER.items()}
    fetch = [FOR.format("i", KEYS), *indented([JUMP(*road), JUMP(*spur), PICK, JUMP(*back(spur))])]
    round_, end = jumping(list(around)), JUMP(*last)

    def program(first: list[str], second: list[str]) -> list[str]:
        return [*fetch, *first, *round_, *second, *round_, end]

    return {
        "level": {
            "map": drawn,
            "legend": {**PIT, **keys_of(carried[0]), **answers_of(carried[0])},
            "variants": [{"map": drawn, "legend": {**keys_of(numbers), **answers_of(numbers)}} for numbers in carried[1:]],
        },
        "open": {"map": drawn, "legend": {**PIT, **dict.fromkeys(marks.values(), FLOOR)}},
        "reference": program([line["least"]], [line["all"]]),
        "wrong": {
            "typed": program([line["typed"].format(min(carried[0]))], [line["typed"].format(sorted(carried[0]))]),
            "asfilled": program([line["least"]], [line["asfilled"]]),
            "lines": program([line["least"]], [line["each"], *indented([line["show"]])]),
        },
        "shape": f"{len(stones)} stones on a board of {size}, 3 boards",
        "fills": {},
        "lengths": [KEYS + 7],
    }


# -- 8.6: the mastery -----------------------------------------------------------------------------------

VAULT = {  # 8.6's fixed lines
    "head": "qrs srgpu_xrlf(uho, cynprf):",
    "home": "uho_k, uho_l = uho",
    "here": "k, l = xavtug.cbfvgvba",
    "in": "xavtug.whzc(uho_k - k, uho_l - l)",
    "loop": "sbe k, l va cynprf:",
    "out": "xavtug.whzc(k - uho_k, l - uho_l)",
    "answer": "erghea fbegrq(xavtug.vairagbel)",
    "typed": "erghea {}",
    "asfilled": "erghea xavtug.vairagbel",
    "tuple": "erghea ghcyr(fbegrq(xavtug.vairagbel))",
}


def hubs(spec: dict, rng: random.Random) -> dict:
    """The examiner calls with a hub's place and a list of the places of the keys around it, on four boards
    with a different number of keys each. The knight starts one jump from the hub, and the hub is the goal:
    the engine wants a goal square, and it can't be the square the knight starts on."""
    wide, high = spec["size"]
    homes = rng.sample([(x, y) for x in range(2, wide - 2) for y in range(2, high - 2)], len(spec["keys"]))
    boards, calls = [], []
    for n, (hub, count) in enumerate(zip(homes, rng.sample(spec["keys"], len(spec["keys"])), strict=True), start=1):
        start, *keys = [on(hub, jump) for jump in rng.sample(KNIGHT_JUMPS, count + 1)]
        numbers = unsorted(rng, count)
        boards.append({"map": board([start, hub], spec["size"], {key: RUNES[at] for at, key in enumerate(keys)}), "legend": keys_of(numbers)})
        calls.append({"args": [{"tuple": list(hub)}, [list(key) for key in keys]], "board": n, "returns": sorted(numbers)})
    line = {key: said(value) for key, value in VAULT.items()}

    def spell(answer: str) -> list[str]:
        fetch = [line["loop"], *indented([line["out"], PICK, line["in"]])]
        return [line["head"], *indented([line["home"], line["here"], line["in"], *fetch, answer])]

    return {
        "level": {"map": boards[0]["map"], "legend": {**PIT, **boards[0]["legend"]}, "variants": boards[1:], "examine": {"function": "fetch_keys", "calls": calls}},
        "open": {"map": boards[0]["map"], "legend": {**PIT, **dict.fromkeys(boards[0]["legend"], FLOOR)}},
        "reference": spell(line["answer"]),
        "wrong": {
            "typed": spell(line["typed"].format(calls[0]["returns"])),
            "asfilled": spell(line["asfilled"]),
            "tuple": spell(line["tuple"]),
        },
        "shape": f"4 hubs with {[len(call['returns']) for call in calls]} keys",
        "fills": {},
        "lengths": [1],
    }


MAKERS = {"ladders": ladders, "paths": paths, "forked": forked, "gathered": gathered, "guarded": guarded, "hubs": hubs}

# -- the levels -----------------------------------------------------------------------------------------

OPEN = {"start": {"facing": "north"}}  # every lesson board: the knight faces north, as on the level
ROW = ". . . . ."
LEVELS = [
    {
        "id": "ch08-l01",
        "kind": "ladders",
        "seed": 8101,
        "title": "A List of Jumps",
        "trains": "A list: several values in a row under one name, and a for loop over them",
        "brief": "The examiner has written each climb down as a list: one number for every jump, 1 for a step to the right, -1 for a step to the left. "
        "It will call your spell climb with the list. Ride it.",
        "api": ["jump"],
        "lengths": [3, 4, 4, 5],
        "lesson_board": {"map": "\n".join([ROW, ROW, "P . . . .", ROW, ROW]), **OPEN},
        "hint3": ["said", "N ybbc bire n yvfg, bar vgrz sbe rnpu ync:\nsbe vgrz va vgrzf:\n    xavtug.whzc(vgrz, ...)"],
        "wrong": ["places", "counted"],
        "hints": [
            "Gur rknzvare'f pnyyf ner yvfgrq orsber gur eha. Ernq rnpu yvfg ntnvafg vgf obneq: jung qbrf n 1 qb, naq n -1?",
            "N sbe ybbc bire n yvfg ehaf vgf yvarf bapr sbe rnpu vgrz, naq vgf inevnoyr vf gur vgrz vgfrys, abg n pbhag. "
            "Fb gur ybbc arire arrqf gb xabj ubj ybat gur yvfg vf. Rnpu vgrz vf gur svefg ahzore bs n whzc; gur frpbaq vf nyjnlf gur fnzr.",
        ],
        "note": "Gur ersrerapr vf n shapgvba bs {yvarf} yvarf: n sbe ybbc bire gur yvfg vg vf unaqrq, naq bar whzc jubfr svefg ahzore vf gur vgrz. "
        "Gur fnzr yvarf evqr n yvfg bs nal yratgu.",
    },
    {
        "id": "ch08-l02",
        "kind": "paths",
        "seed": 8201,
        "title": "Pairs",
        "trains": "Tuples: two values that travel together, unpacked into two names, and knight.position as one",
        "brief": "This time the examiner names the stones, not the jumps: a list of places, each an (x, y) pair. Your knight knows where it stands. Work out each jump.",
        "api": ["jump", "position"],
        "lengths": [3, 4, 5, 6],
        "size": (8, 8),
        "lesson_board": {"map": "\n".join([ROW, ROW, "P . . . ."]), **OPEN},
        "hint3": ["said", "Gjb anzrf sbe rnpu cnve, naq gjb zber sbe jurer gur xavtug fgnaqf:\nsbe k, l va fgbcf:\n    urer_k, urer_l = xavtug.cbfvgvba\n    xavtug.whzc(k - ..., l - ...)"],
        "wrong": ["asjump", "whole", "typed"],
        "hints": [
            "Gur rknzvare unaqf bire cynprf, naq whzc() jnagf n whzc. Jurer vf lbhe xavtug fgnaqvat jura vg arrqf gur arkg bar?",
            "N sbe ybbc pna hacnpx rnpu cnve vagb gjb anzrf. xavtug.cbfvgvba vf n cnve gbb: jurer gur xavtug fgnaqf abj. "
            "N whzc vf gur qvssrerapr orgjrra gjb cynprf: ubj sne evtug sebz urer gb gurer, naq ubj sne hc.",
        ],
        "note": "Gur ersrerapr ybbcf bire gur fgbcf jvgu gjb anzrf. Ba rnpu ync vg hacnpxf xavtug.cbfvgvba vagb gjb zber anzrf "
        "naq whzcf ol gur qvssrerapr orgjrra gur gjb cynprf: {yvarf} yvarf sbe n cngu bs nal yratgu.",
    },
    {
        "id": "ch08-l03",
        "kind": "forked",
        "seed": 8301,
        "title": "The Satchel",
        "trains": "The satchel: pick_up(), knight.inventory, and asking a list a question with in",
        "brief": "Two keys lie by the road, and further on it forks: a brass door one way, an iron door the other. Your knight can't know which keys it will find. Its satchel can.",
        "api": ["jump", "pick_up", "inventory"],
        "size": (9, 9),
        "lesson_board": {"map": "\n".join([". a . . .", ". . D . .", "P . . . ."]), "legend": {"a": {"tile": "key", "name": "brass"}, "D": {"tile": "door", "key": "brass"}}, **OPEN},
        "hint3": ["said", 'Nfx gur fngpury, gura pubbfr:\nvs "oenff" va xavtug.vairagbel:\n    ...\nryfr:\n    ...'],
        "wrong": ["samedoor", "nokey", "byhand"],
        "hints": [
            "Cvpx hc obgu xrlf svefg. Juvpu qbbe gb gnxr vf n dhrfgvba bayl gur fngpury pna nafjre, naq gur nafjre qvssref sebz obneq gb obneq.",
            "xavtug.vairagbel vf n yvfg bs gur xrlf cvpxrq hc fb sne, ol anzr. va nfxf jurgure n inyhr vf va n yvfg, naq tvirf Gehr be Snyfr, fb vg pna fgnaq va na vs. "
            "Nfx nobhg bar qbbe'f xrl: gnxr gung qbbe vs vg vf gurer, gur bgure qbbe vs vg vfa'g.",
        ],
        "note": "Gur ersrerapr srgpurf obgu xrlf jvgu n ybbc (bhg, cvpx_hc(), naq onpx), gura nfxf gur fngpury bar dhrfgvba jvgu va "
        "naq gnxrf gur qbbe jubfr xrl vg sbhaq, be gur bgure qbbe: {yvarf} yvarf.",
    },
    {
        "id": "ch08-l04",
        "kind": "gathered",
        "seed": 8401,
        "title": "Gathering",
        "trains": "Building a list: an empty one, and append() adding to its end",
        "brief": "The first stones each carry a number. The ladder beyond them has no signs at all: the numbers you passed are its route. Remember every one.",
        "api": ["jump", "read"],
        "slack": 2,
        "lesson_board": {"map": "\n".join([". . . . . . ."] * 3 + ["P . . . . . ."]), **OPEN},
        "hint3": ["said", "Ohvyq gur yvfg, gura hfr vg:\nebhgr = []\nsbe v va enatr(...):\n    ...\n    ebhgr.nccraq(...)\nsbe fvqr va ebhgr:\n    ..."],
        "wrong": ["typed", "names", "kept", "text"],
        "hints": [
            "Gur eharf pbzr svefg naq gur ynqqre nsgre gurz, fb gur ahzoref unir gb or xrcg. Ubj znal anzrf jbhyq gung gnxr, naq ubj znal yvarf?",
            "Fgneg jvgu na rzcgl yvfg orsber gur ybbc. Ba rnpu ehar fgbar, nqq vgf ahzore gb gur raq bs gur yvfg jvgu nccraq: bar yvar, ubjrire znal eharf gurer ner. "
            "Ghea gur ehar'f grkg vagb n ahzore svefg. Nsgre gur ynfg ehar gur yvfg vf gur ynqqre'f ebhgr: ybbc bire vg.",
        ],
        "note": "Gur ersrerapr fgnegf jvgu na rzcgl yvfg, nccraqf rnpu ehar'f ahzore gb vg va n ybbc, naq gura evqrf gur ynqqre jvgu n frpbaq ybbc bire gur yvfg vg ohvyg: "
        "{yvarf} yvarf. N anzr sbe rnpu ahzore pbzrf gb {anzrf}.",
    },
    {
        "id": "ch08-l05",
        "kind": "guarded",
        "seed": 8501,
        "title": "In Order",
        "trains": "A whole list at once: sorted(), min() and max()",
        "brief": "The keys of the vault are numbered. Two guards stand before it. The first asks for your smallest key. The second wants to hear all of them, smallest first.",
        "api": ["jump", "pick_up", "inventory"],
        "size": (12, 12),
        "lesson_board": {"map": "\n".join([". a . . .", ROW, "P . b . ."]), "legend": {"a": {"tile": "key", "name": 12}, "b": {"tile": "key", "name": 5}}, **OPEN},
        "hint3": ["said", "Bar yvar sbe rnpu thneq:\ncevag(zva(xavtug.vairagbel))\ncevag(fbegrq(xavtug.vairagbel))"],
        "wrong": ["typed", "asfilled", "lines"],
        "hints": [
            "Gur xrlf' ahzoref qvssre ba rirel obneq, fb gur nafjref pna'g or glcrq va. Gur fngpury xabjf gurz.",
            "zva tvirf gur fznyyrfg vgrz bs n yvfg. fbegrq tvirf n arj yvfg jvgu gur fnzr vgrzf va beqre, fznyyrfg svefg, naq yrnirf gur svefg yvfg nf vg jnf. "
            "Gur frpbaq thneq jnagf gur jubyr yvfg, nf cevag fubjf n yvfg: fdhner oenpxrgf naq pbzznf. Fnl rnpu nafjre sebz gur fgbar orfvqr vgf tngr.",
        ],
        "note": "Gur ersrerapr srgpurf gur sbhe xrlf jvgu n ybbc, gura nafjref rnpu thneq va bar yvar: zva() bs gur fngpury sbe gur svefg, "
        "naq fbegrq() bs vg, cevagrq nf n yvfg, sbe gur frpbaq: {yvarf} yvarf.",
    },
    {
        "id": "ch08-l06",
        "kind": "hubs",
        "seed": 8601,
        "title": "The Vault",
        "trains": "Mastery: a list of pairs, the satchel, and an answer handed back in order",
        "brief": "The examiner's last test of the tier: a hub, keys scattered around it, and a list of where they lie. It names the hub's place first. "
        "Fetch every key, end on the hub, and hand their numbers back, smallest first.",
        "api": ["jump", "position", "pick_up", "inventory"],
        "mastery": True,
        "size": (7, 7),
        "keys": [2, 3, 4, 5],
        "lesson_board": {"map": "\n".join([ROW, ROW, "P . . . ."]), **OPEN},
        "hint3": ["said", "Gur ybbc, naq gur nafjre:\n    sbe k, l va cynprf:\n        xavtug.whzc(k - uho_k, l - uho_l)\n        ...\n    erghea fbegrq(...)"],
        "wrong": ["typed", "asfilled", "tuple"],
        "hints": [
            "Gur rknzvare anzrf gur uho svefg, gura jurer gur xrlf yvr. Rirel xrl vf bar whzc sebz gur uho: bhg, cvpx vg hc, naq onpx.",
            "Hacnpx gur uho vagb gjb anzrf, naq whzc gurer sebz jurer gur xavtug fgnaqf. Gura ybbc bire gur cynprf jvgu gjb anzrf: "
            "n whzc vf gur qvssrerapr orgjrra gjb cynprf, gurer naq onpx. Jura gur ybbc vf qbar, gur fngpury ubyqf rirel xrl: unaq onpx vgf ahzoref va beqre, nf n yvfg.",
        ],
        "note": "Gur ersrerapr hacnpxf gur uho, whzcf gb vg sebz xavtug.cbfvgvba, naq ybbcf bire gur cynprf: bhg, cvpx_hc(), naq onpx, "
        "rnpu whzc gur qvssrerapr orgjrra gjb cynprf. Vg ergheaf fbegrq() bs gur fngpury: {yvarf} yvarf.",
    },
]

if __name__ == "__main__":
    main(LEVELS, *writers(CHAPTER, MAKERS))
