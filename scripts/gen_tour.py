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
from itertools import permutations

from gen_mastery import list_set
from gen_satchel import PIT, TRIES
from gen_spellbook import JUMP, SIDE, board, fits, indented, jumping, laid, snake, tight, writers
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


MAKERS = {"written": written}

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
]

BUILD, PROBE = writers(0, MAKERS)  # chapter 0: a challenge's files go to its set's folders


def build_one(spec: dict) -> list[str]:
    list_set(SET)
    return BUILD(spec)


if __name__ == "__main__":
    main(LEVELS, build_one, PROBE)
