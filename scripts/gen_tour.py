"""Write the Knight tier's mastery set, "The Knight's Tour", blind (M5.4: docs/M5/M5.4.md, "The set").

    .venv/Scripts/python scripts/gen_tour.py                        # every challenge below
    .venv/Scripts/python scripts/gen_tour.py knights-tour-01        # just one
    .venv/Scripts/python scripts/gen_tour.py probe [knights-tour-01] # only lay the boards and count

A challenge is a level with a set, a difficulty and the chapters it draws on, and no chapter or lesson (as in
gen_mastery.py, the Pawn tier's set). These are the knight's: each board is stepping stones in a field of pits,
laid by a seeded search, and it is written as Chapters 7 and 8 are (gen_spellbook.py and gen_satchel.py, whose
stones, code helpers and writers it borrows): the reference is built from the board's own jumps around fixed
lines; fixed lines, hints 1 to 3 and the notes are stored in ROT13 and checked word by word against the repo's
vocabulary; only counts and outcomes are printed. The designer is also the game's learner (CLAUDE.md: no
spoilers).

No challenge has `look`: it was never in a lesson, and a challenge practises, it never teaches. So what differs
between boards reaches the code as a rune, an argument, a guard's question or the satchel.
"""

import random
from itertools import islice, permutations

from gen_mastery import list_set
from gen_satchel import FLOOR, PICK, PIT, TRIES, Pos, alone, back, keys_of, on
from gen_spellbook import JUMP, RUNES, SIDE, board, fits, indented, jumping, laid, routes, snake, tight, writers
from levelgen import main, said

from rankfile.world import KNIGHT_JUMPS

SET = {
    "set": "knights-tour",
    "title": "The Knight's Tour",
    "tier": "knight",
    "summary": "Puzzles that mix the Knight tier's chapters with the Pawn tier's. No lessons; the Codex has everything.",
}

# -- 1: a ladder whose way up is written at its foot ------------------------------------------------------

WORDS = {1: "right", -1: "left"}  # what a rune calls each side of a ladder
WRITTEN = {  # challenge 1's fixed lines
    "loop": "sbe jbeq va xavtug.ernq().fcyvg():",
    "left": 'vs jbeq == "yrsg":',
    "other": "ryfr:",
    "letters": "sbe jbeq va xavtug.ernq():",
    "early": "jbeqf = xavtug.ernq().fcyvg()",
    "each": "sbe jbeq va jbeqf:",
}


def written(spec: dict, rng: random.Random) -> dict | None:
    """One jump sideways onto a rune stone, the same on every board, then a ladder: every jump two up and one
    step left or right. The rune holds the way up, a word for each jump. Four boards: each ladder goes both
    ways, no two are as tall, and none starts as another does all the way."""
    lengths = rng.sample(spec["lengths"], len(spec["lengths"]))
    for _ in range(TRIES):
        first = rng.choice([jump for jump in KNIGHT_JUMPS if abs(jump[0]) == 2])
        lists = [[rng.choice((1, -1)) for _ in range(length)] for length in lengths]
        paths = [laid([first, *[(side, 2) for side in sides]]) for sides in lists]
        differ = all(len(set(sides)) == 2 for sides in lists) and not any(a[: len(b)] == b for a, b in permutations(lists, 2))
        if differ and all(snake(path) and fits(path, (SIDE, SIDE)) for path in paths):
            break
    else:
        return None
    boards = []
    for path, sides in zip(paths, lists, strict=True):
        squares, size = tight(path)
        boards.append({"map": board(squares, size, {squares[1]: "R"}), "legend": {"R": {"tile": "rune", "text": " ".join(WORDS[side] for side in sides)}}})
    line = {key: said(value) for key, value in WRITTEN.items()}
    choice = [line["left"], *indented([JUMP(-1, 2)]), line["other"], *indented([JUMP(1, 2)])]
    return {
        "level": {"map": boards[0]["map"], "legend": {**PIT, **boards[0]["legend"]}, "variants": boards[1:]},
        "reference": [JUMP(*first), line["loop"], *indented(choice)],
        "wrong": {
            "typed": [JUMP(*first), *jumping([(side, 2) for side in lists[0]])],
            "letters": [JUMP(*first), line["letters"], *indented(choice)],
            "early": [line["early"], JUMP(*first), line["each"], *indented(choice)],
        },
        "shape": f"4 ladders of {lengths} jumps",
        "fills": {},
        "lengths": [length + 1 for length in lengths],
    }


# -- 2: a trail out to a key, and back ------------------------------------------------------------------

KEY = "brass"
RETURN = {  # challenge 2's fixed lines
    "head": "qrs bhg_naq_onpx(ebhgr):",
    "out": "sbe qk, ql va ebhgr:",
    "step": "xavtug.whzc(qk, ql)",
    "down": "sbe v va enatr(yra(ebhgr) - 1, -1, -1):",
    "pair": "qk, ql = ebhgr[v]",
    "undo": "xavtug.whzc(-qk, -ql)",
}


def trail(rng: random.Random, length: int, gate: list[Pos], size: tuple[int, int]) -> tuple[list[Pos], list[Pos]] | None:
    """A winding trail of `length` jumps from the origin, with the door and the goal (`gate`) beside its start:
    its jumps, and every stone (the trail's, then the door's and the goal's). Nothing joins two stones but the
    trail and the two jumps through the door, and the way out undone in the order it was made leaves the stones."""
    plan = [f"j{at}" for at in range(length)]
    for chosen, squares in islice(routes(rng, plan, size), 4000):
        jumps, stones = [chosen[name] for name in plan], [*squares, *gate]
        links = [*zip(squares, squares[1:], strict=False), (squares[0], gate[0]), (gate[0], gate[1])]
        strays = any(on(squares[-1], square) not in stones for square in laid([back(jump) for jump in jumps]))
        if len(set(jumps)) >= 3 and strays and alone(stones, links) and fits(stones, size):
            return jumps, stones
    return None


def out_and_back(spec: dict, rng: random.Random) -> dict | None:
    """The examiner calls with the way out, a list of jumps as pairs, on four trails of different lengths. A key
    lies on the trail's last stone; its door is one jump from the start, the same jump on every board, and the
    goal one jump beyond it. The way back is nobody's to hand over."""
    lengths = rng.sample(spec["lengths"], len(spec["lengths"]))
    for _ in range(TRIES):
        door, last = rng.choice(KNIGHT_JUMPS), rng.choice(KNIGHT_JUMPS)
        trails = [trail(rng, length, laid([door, last])[1:], spec["size"]) for length in lengths]
        if all(trails):
            break
    else:
        return None
    boards, calls = [], []
    for n, (jumps, stones) in enumerate(trails, start=1):
        stones, size = tight(stones)
        boards.append(board(stones, size, {stones[-3]: RUNES[0], stones[-2]: "D"}))
        calls.append({"args": [[list(jump) for jump in jumps]], "board": n})
    line = {key: said(value) for key, value in RETURN.items()}
    out, end = [line["out"], *indented([line["step"]])], jumping([door, last])
    undone = [line["down"], *indented([line["pair"], line["undo"]])]
    first = trails[0][0]

    def spell(*body: str) -> list[str]:
        return [line["head"], *indented(list(body))]

    return {
        "level": {
            "map": boards[0],
            "variants": boards[1:],
            "legend": {**PIT, **keys_of([KEY]), "D": {"tile": "door", "key": KEY}},
            "examine": {"function": "out_and_back", "calls": calls},
        },
        # counted with the key and the door as plain stones: two jumps, through the door (`trail` keeps every other way shut)
        "open": {"map": boards[0], "variants": boards[1:], "legend": {**PIT, RUNES[0]: FLOOR, "D": FLOOR}},
        "reference": spell(*out, PICK, *undone, *end),
        "wrong": {
            "oneway": spell(*out, PICK, *end),
            "sameorder": spell(*out, PICK, line["out"], *indented([line["undo"]]), *end),
            "nokey": spell(*out, *undone, *end),
            "typed": spell(*jumping(first), PICK, *jumping([back(jump) for jump in reversed(first)]), *end),
        },
        "shape": f"4 trails of {lengths} jumps",
        "fills": {},
        "lengths": [2] * len(lengths),
    }


MAKERS = {"written": written, "back": out_and_back}

# -- the challenges ---------------------------------------------------------------------------------------

LEVELS = [
    {
        "id": "knights-tour-01",
        "set": SET["set"],
        "difficulty": 2,
        "draws_on": [4, 6, 7, 8],
        "kind": "written",
        "seed": 5401,
        "title": "The Written Climb",
        "trains": "A rune's text cut into words, and a choice made for each one",
        "brief": "A ladder of stones, and one rune at its foot, a jump from where your knight stands. The rune spells the way up, a word for every jump: "
        "left or right. Every jump climbs two squares. No two ladders are alike.",
        "api": ["jump", "read"],
        "lengths": [2, 3, 4, 5],
        "hint3": ["said", "Gur ybbc, naq gur pubvpr:\nsbe jbeq va xavtug.ernq().fcyvg():\n    vs jbeq == ...:\n        ...\n    ryfr:\n        ..."],
        "wrong": ["typed", "letters", "early"],
        "hints": [
            "Gur ehar ng gur ynqqre'f sbbg ubyqf bar jbeq sbe rirel whzc. Pbzcner vg jvgu gur obneq: jung qbrf rnpu jbeq qb?",
            "ernq() tvirf gur ehar'f grkg nf bar cvrpr. fcyvg() phgf vg vagb n yvfg bs vgf jbeqf. "
            "N sbe ybbc bire gung yvfg gnxrf bar jbeq n ync, naq na vs qrpvqrf juvpu jnl gb whzc. Gur xavtug unf gb fgnaq ba gur ehar gb ernq vg.",
        ],
        "note": "Gur ersrerapr whzcf bagb gur ehar, phgf vgf grkg vagb jbeqf jvgu fcyvg(), naq ybbcf bire gurz: na vs pubbfrf gur whzc sbe rnpu jbeq. "
        "{yvarf} yvarf sbe n ynqqre bs nal urvtug. Gur ebhgr glcrq bhg sbe bar obneq pbzrf gb {glcrq} yvarf, naq snvyf ba gur bguref.",
    },
    {
        "id": "knights-tour-02",
        "set": SET["set"],
        "difficulty": 3,
        "draws_on": [3, 7, 8],
        "kind": "back",
        "seed": 5402,
        "title": "Out and Back",
        "trains": "A list walked forwards, then backwards: the way back worked out from the way out",
        "brief": "A winding trail of stones leads out to a key. The door it opens is one jump from where your knight starts, and the goal one jump behind the door: "
        "the same two jumps on every board. The examiner calls your spell out_and_back with the way out, a list of jumps, each a (dx, dy) pair. "
        "Nobody hands you the way back, and the trail is the only ground there is.",
        "api": ["jump", "pick_up"],
        "lengths": [3, 4, 5, 6],
        "size": (9, 9),
        "hint3": ["said", "Gur jnl onpx, pbhagrq qbja:\n    sbe v va enatr(yra(ebhgr) - 1, -1, -1):\n        qk, ql = ebhgr[v]\n        xavtug.whzc(..., ...)"],
        "wrong": ["oneway", "sameorder", "nokey", "typed"],
        "hints": [
            "Gur jnl onpx vf gur jnl bhg ntnva: gur fnzr whzcf, rnpu bar ghearq ebhaq, va gur bccbfvgr beqre. Juvpu whzc pbzrf svefg ba gur jnl onpx?",
            "N yvfg'f vgrzf unir cynprf, pbhagrq sebz 0, naq yra() fnlf ubj znal gurer ner. enatr() pna pbhag qbja: sebz gur ynfg cynpr gb 0, jvgu n fgrc bs -1. "
            "Gnxr gur cnve ng rnpu cynpr, hacnpx vg, naq whzc gur bgure jnl: zvahf obgu ahzoref. Cvpx hc gur xrl orsber lbh ghea onpx.",
        ],
        "note": "Gur ersrerapr evqrf gur jnl bhg jvgu n sbe ybbc gung hacnpxf rnpu cnve, cvpxf hc gur xrl, naq pbhagf onpx qbja gur fnzr yvfg jvgu enatr() naq yra(), "
        "whzcvat rnpu cnve gur bgure jnl. Gura gur qbbe naq gur tbny: {yvarf} yvarf.",
    },
]

BUILD, PROBE = writers(0, MAKERS)  # chapter 0: a challenge's files go to its set's folders


def build_one(spec: dict) -> list[str]:
    list_set(SET)
    return BUILD(spec)


if __name__ == "__main__":
    main(LEVELS, build_one, PROBE)
