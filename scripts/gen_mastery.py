"""Write the Pawn tier's mastery set, "The Last Rank", blind (M4.5: docs/M4/M4.5.md).

    .venv/Scripts/python scripts/gen_mastery.py                     # every challenge below
    .venv/Scripts/python scripts/gen_mastery.py last-rank-01        # just one
    .venv/Scripts/python scripts/gen_mastery.py probe [last-rank-01] # only check the boards

A challenge is a level with a set, a difficulty and the chapters it draws on, and no chapter or
lesson. Each runs on several boards, and one program has to solve them all: a number, a place or
a word differs from board to board, so the code has to work it out.

How a reference is written, with no one reading it: each kind of challenge has a skeleton of fixed
lines, stored in ROT13 as the hints and notes are (`said()` decodes them), with holes the engine
fills by search: every candidate runs on the real engine, on every board, and the shortest that
solves them all wins. A board's answers come from its own geometry. The generator prints counts
and outcomes only, never code or prose: the designer is also the game's learner (see CLAUDE.md:
no spoilers). Since no one reads the decoded hints and notes, each word of them is checked against
the words the repo's own docs and lessons use, and only the number of strangers is printed.

`probe` is for designing a challenge: it prints what differs between the boards, how far each
board's own typed route gets on the others, and how many programs the search finds.
"""

import re

import yaml
from gen_while import pick, plain_routes, route_code, shortest_programs
from levelgen import BUDGET, ROOT, build, main, said, save, yaml_text

from rankfile.levels import MAX_SIDE, Level, parse_level
from rankfile.runner import run_level

SET = {
    "set": "last-rank",
    "title": "The Last Rank",
    "tier": "pawn",
    "summary": "Puzzles that mix the Pawn tier's chapters. No lessons; the Codex has everything.",
}
PAWN = ["move", "turn_left", "turn_right", "squares_ahead", "wait", "at_goal", "look"]  # what a challenge may call, unless it says
WORD = re.compile(r"[a-z]+")


# -- drafting boards -----------------------------------------------------------------------------

WALKED = "Halt! How many squares did you walk to get here? Answer with the number."


def guard(question: str, answer: object) -> dict:
    return {"tile": "gate", "question": question, "passphrase": str(answer)}


def toll_road(length: int, pits: list[int]) -> dict:
    """A corridor of `length` squares from the pawn to a guard's gate, with the goal behind the gate.
    `pits` are squares along it, counted from 1 at the pawn's first step. Each has a way round on
    the left, three squares long. The guard asks how many squares the walk took."""
    apart = all(later - sooner >= 4 for sooner, later in zip(pits, pits[1:], strict=False))
    assert apart and all(1 <= pit < length for pit in pits), "a pit needs floor after it, and its way round to itself"
    rows = []
    for rank in range(length + 2, -1, -1):
        road = "G" if rank == length + 2 else "X" if rank == length + 1 else "P" if rank == 0 else "O" if rank in pits else "."
        side = "." if any(abs(rank - pit) <= 1 for pit in pits) else "#"
        rows.append(f"# {side} {road} #")
    return {"map": "\n".join(rows) + "\n", "legend": {"O": "pit", "X": guard(WALKED, length + 2 * len(pits))}}


HEADINGS = [(0, 1), (1, 0), (0, -1), (-1, 0)]  # north, east, south, west: a right turn is the next one


def rune_trail(*runes: str) -> dict:
    """An open board with a trail of runes. The pawn faces north with the first rune on the square
    ahead. A rune's text is its legs, like "left 3, right 10": turn, then walk that far. They lead
    to the next rune, and the last rune's to the goal. The board is as big as the trail, no bigger,
    so no two boards have the same size or the same start."""
    x, y, heading = 0, 1, 0
    path, marks, legend = [(0, 0), (0, 1)], {(0, 0): "P"}, {}
    for symbol, text in zip("ABCDEF", runes, strict=False):
        marks[(x, y)] = symbol
        legend[symbol] = {"tile": "rune", "text": text}
        for leg in text.split(", "):
            word, squares = leg.split(" ")
            heading = (heading + {"right": 1, "left": -1}[word]) % 4
            for _ in range(int(squares)):
                x, y = x + HEADINGS[heading][0], y + HEADINGS[heading][1]
                path.append((x, y))
    marks[(x, y)] = "G"
    xs, ys = [px for px, _ in path], [py for _, py in path]
    assert len(set(path)) == len(path), "a trail never crosses itself"
    assert max(xs) - min(xs) < MAX_SIDE and max(ys) - min(ys) < MAX_SIDE, "a trail has to fit the largest board"
    rows = [" ".join(marks.get((px, py), ".") for px in range(min(xs), max(xs) + 1)) for py in range(max(ys), min(ys) - 1, -1)]
    return {"map": "\n".join(rows) + "\n", "legend": legend}


def written_hour(every: int, walk: int) -> dict:
    """A corridor: the pawn, a rune on the square ahead, `walk` squares of floor, a timed gate that is
    open for the first two ticks of every `every`, and the goal straight behind it. The rune says the gate's time."""
    rows = ["G", "T", *["."] * walk, "R", "P"]
    legend = {
        "R": {"tile": "rune", "text": f"The gate opens once every {every} ticks."},
        "T": {"tile": "timed_gate", "every": every, "open": 2},
    }
    return {"map": "\n".join(f"# {row} #" for row in rows) + "\n", "legend": legend}


def square(x: int, rank: int) -> str:
    """A square's chess name, from its column (0 is file a) and its rank (0 is rank 1)."""
    return f"{'abcdefghijkl'[x]}{rank + 1}"


def sentry(rank: int, wanted: dict[int, int], west: int) -> dict:
    """A patrol pacing `rank` of a gallery from wall to wall, set off so that at each tick in `wanted` it
    is in that lane. `west` is the column of the gallery's first lane."""
    for path in ([0, 1, 2], [2, 1, 0]):
        for first in (0, 1):
            at, heading, seen = first, 1, {}
            for tick in range(max(wanted) + 1):
                seen[tick] = path[at]
                if not 0 <= at + heading < len(path):
                    heading = -heading
                at += heading
            if all(seen[tick] == lane for tick, lane in wanted.items()):
                return {"kind": "patrol", "start": square(west + path[first], rank), "route": [square(west + path[0], rank), square(west + path[-1], rank)]}
    raise AssertionError("no patrol is in those lanes at those ticks")


def climb(events: tuple, west: int) -> tuple[int, int, set, list[dict]]:
    """A pawn's way up a gallery three lanes wide, from the middle lane: the lane and the rank it ends on,
    the walls (as lane and rank) and the enemies. `west` is the column of the gallery's first lane.
    ("walk", n) is n empty ranks. ("rook", side) is a rook diagonally ahead on that side, with a wall
    under it so its file is closed below. ("sentry", meeting) is a patrol pacing the next rank: on the
    pawn's arrival it is diagonally ahead ("left", "right"), or straight ahead and a tick later to one
    side ("ahead-left", "ahead-right"). Each rook or sentry moves the pawn one lane over."""
    lane, rank, tick = 1, 0, 0
    walls, paced, enemies = set(), set(), []
    for kind, how in events:
        if kind == "walk":
            rank, tick = rank + how, tick + how
            continue
        side = lane + (1 if how.endswith("right") else -1)
        assert 0 <= side <= 2, "the gallery has three lanes"
        if kind == "rook":
            walls.add((side, rank))
            enemies.append({"kind": "rook", "start": square(west + side, rank + 1)})
        else:
            waits = how.startswith("ahead")
            paced.add(rank + 1)
            enemies.append(sentry(rank + 1, {tick: lane, tick + 1: side} if waits else {tick: side}, west))
            tick += waits
        lane, rank, tick = side, rank + 1, tick + 1
    assert not any(y in paced for _, y in walls), "a wall on a sentry's rank"
    return lane, rank, walls, enemies


def gallery(*events: tuple[str, object]) -> dict:
    """A gallery between two walls, as long as its events (see `climb`), with the goal where they end."""
    lane, rank, walls, enemies = climb(events, 1)
    assert rank < MAX_SIDE, "a gallery has to fit the largest board"
    marks = {(1, 0): "P", (lane, rank): "G", **dict.fromkeys(walls, "#")}
    rows = ["# " + " ".join(marks.get((x, y), ".") for x in range(3)) + " #" for y in range(rank, -1, -1)]
    return {"map": "\n".join(rows) + "\n", "enemies": enemies}


TAKEN = "Halt! How many rooks did you take? Answer with the number."


def last_rank(events: tuple, way: str, far: int, pits: list[int], over: int) -> dict:
    """The finale's board. A gallery of rooks (see `climb`) ends under a guard's gate, who asks how many
    rooks were taken. Behind the gate is a rune on the last rank, which runs both ways. The rune says where
    the goal is: `far` squares to the `way` ("west" or "east"). `pits` are how many squares from the rune
    each pit on the way is, and the rank goes on `over` squares past the goal, so nothing but the rune
    says where to stop. The other way it runs two squares."""
    reach = {"west": 2, "east": 2, way: far + over}
    lane = climb(events, 0)[0]
    west = max(reach["west"] - lane, 1)  # the column of the gallery's first lane: a wall stands west of it
    lane, rank, walls, enemies = climb(events, west)
    rune, top, step = west + lane, rank + 2, -1 if way == "west" else 1
    width = max(rune + reach["east"] + 1, west + 4)
    assert width <= MAX_SIDE and top < MAX_SIDE and all(0 < pit < far for pit in pits), "the finale has to fit the largest board"
    marks = {(x, y): "." for x in range(west, west + 3) for y in range(rank + 1)}
    marks |= {(x, top): "." for x in range(rune - reach["west"], rune + reach["east"] + 1)}
    marks |= {(west + x, y): "#" for x, y in walls}
    marks |= {(west + 1, 0): "P", (rune, rank + 1): "X", (rune, top): "R", (rune + step * far, top): "G"}
    marks |= {(rune + step * pit, top): "O" for pit in pits}
    rows = [" ".join(marks.get((x, y), "#") for x in range(width)) for y in range(top, -1, -1)]
    legend = {"O": "pit", "X": guard(TAKEN, len(enemies)), "R": {"tile": "rune", "text": f"The goal is {far} squares to the {way}."}}
    return {"map": "\n".join(rows) + "\n", "legend": legend, "enemies": enemies}


# -- the challenges --------------------------------------------------------------------------------
# kind "toll": a road with pits to walk round and a guard who asks how far the walk was.
# kind "finale": a climb past rooks to a guard, then a walk along the last rank that a rune describes.
# kind "gallery": rooks and pacing sentries along a gallery of unknown length.
# kind "hour": a timed gate whose time is written on a rune.
# kind "trail": runes that each give the next legs of the route. `unseen` are boards the level doesn't
# have, which its reference must solve too.
# `hints` (hints 1 and 2) and `note` are ROT13, with {yvarf} for the line count; `hint3` is how hint 3
# is cut from the reference (levelgen.third_hint). `wrong` names the attempts to write.

LEVELS: list[dict] = [
    {
        "id": "last-rank-01",
        "title": "The Toll Road",
        "difficulty": 2,
        "draws_on": [2, 4, 5],
        "trains": "A counter kept through a loop that looks before every step",
        "brief": "The toll road runs straight to a guard, who asks how far you walked. Where the floor has fallen in, there is a way round on the left. Every board is a different road.",
        "api": PAWN,
        "kind": "toll",
        "par": 16,
        "boards": [toll_road(8, [3, 7]), toll_road(6, [4]), toll_road(9, [1, 5]), toll_road(5, [])],
        "wrong": ["typed", "once", "flat"],
        "hints": [
            "Rirel ebnq unf n qvssrerag yratgu naq vgf tncf ner va qvssrerag cynprf, fb gur nafjre pna'g or glcrq va. Pbhag rnpu fdhner nf lbh jnyx vg.",
            "Xrrc n pbhagre gung fgnegf ng 0. Ercrng hagvy gur thneq'f tngr vf nurnq: ybbx svefg. Vs n cvg vf nurnq, jnyx ebhaq vg ol gur fvqr cngu naq nqq gur fdhnerf gung gbbx. Bgurejvfr fgrc bapr naq nqq 1. Ng gur tngr, cevag gur pbhagre.",
        ],
        "hint3": ["start", 3],
        "note": "Gur ybbc ybbxf orsber rirel fgrc, fb vg jbexf ba nal ebnq. N cvg nurnq zrnaf gur jnl ebhaq naq sbhe zber fdhnerf; nalguvat ryfr zrnaf bar fgrc naq bar zber. Gur pbhagre vf frg orsber gur ybbc, punatrq vafvqr vg naq cevagrq nsgre vg. {yvarf} yvarf.",
    },
    {
        "id": "last-rank-02",
        "title": "Leg by Leg",
        "difficulty": 3,
        "draws_on": [3, 5, 6],
        "trains": "A loop inside a loop: runes read until the goal, each one's text cut into legs",
        "brief": "A trail of runes leads to the goal. Each rune gives the next stretch of the route: which way to turn, then how many squares to walk. Some give more than one leg. Every board has its own trail.",
        "api": ["move", "turn_left", "turn_right", "at_goal", "read"],
        "kind": "trail",
        "par": 8,
        "boards": [
            rune_trail("right 3", "left 2, right 4", "left 5"),
            rune_trail("left 4, right 6", "right 10"),
            rune_trail("right 2", "left 3", "left 5", "right 4, right 1", "left 2"),
            rune_trail("left 2", "right 3, left 1, right 2", "right 6", "right 1"),
        ],
        "unseen": [rune_trail("right 11", "left 10, left 2"), rune_trail("left 1", "left 1", "right 1, right 1, left 1")],
        "wrong": ["typed", "once", "single"],
        "hints": [
            "Gur ebhgr vf jevggra va cvrprf, bar ehar ng n gvzr, naq fbzr eharf ubyq zber guna bar yrt. Rirel obneq unf n qvssrerag ahzore bs eharf.",
            "Ercrng hagvy gur cnja fgnaqf ba gur tbny: ernq gur ehar haqre gur cnja naq phg vgf grkg vagb yrtf. Sbe rnpu yrt, gur svefg jbeq fnlf juvpu jnl gb ghea, naq gur ahzore nsgre gur fcnpr fnlf ubj sne gb jnyx. Vg vf fgvyy grkg, fb ghea vg vagb n ahzore svefg.",
        ],
        "hint3": ["loops", 1],
        "note": "Gjb ybbcf funer gur jbex. Gur bhgre bar tbrf ba hagvy gur tbny, ubjrire znal eharf gurer ner; gur vaare bar gnxrf gur yrtf bs bar ehar va ghea. Phggvat rnpu yrt ng gur fcnpr tvirf vgf ahzore, jungrire vgf yratgu. {yvarf} yvarf.",
    },
    {
        "id": "last-rank-03",
        "title": "The Written Hour",
        "difficulty": 3,
        "draws_on": [2, 6],
        "trains": "A number cut out of a rune's words, and arithmetic with the remainder to time a gate",
        "brief": "The gate ahead opens for two ticks, then shuts on anything under it. A rune says how often, and every board's gate keeps its own time. The walk to it is a different length on every board too.",
        "api": ["move", "squares_ahead", "wait", "read"],
        "kind": "hour",
        "par": 5,
        "boards": [written_hour(7, 3), written_hour(12, 6), written_hour(4, 5), written_hour(5, 8)],
        "unseen": [written_hour(3, 8), written_hour(11, 1), written_hour(6, 4), written_hour(10, 2)],
        "wrong": ["typed", "plain", "digit"],
        "hints": [
            "Rirel tngr xrrcf vgf bja gvzr, naq bayl gur ehar fnlf jung vg vf. Gur jnyx gb gur tngr gnxrf gvpxf gbb, naq vg vf n qvssrerag yratgu ba rnpu obneq.",
            "Ernq gur ehar, phg bhg gur ahzore naq ghea vg vagb n jubyr ahzore. Pbhag gur gvpxf lbhe cnja fcraqf sebz gur fgneg hagvy vg fgrcf haqre gur tngr: bar sbe rnpu fdhner. Gur tngr vf bcra jura gung pbhag vf n zhygvcyr bs gur ehar'f ahzore, fb jnvg sbe gur gvpxf gung ner zvffvat. Gur erznvaqre bcrengbe gryyf ubj sne vagb n plpyr n pbhag vf.",
        ],
        "hint3": ["key", "wait", "Wait for the missing ticks with a line like:"],
        "note": "Gur ehar'f grkg vf phg ng gur fcnprf, naq bar cvrpr orpbzrf n ahzore. Gur erznvaqre fnlf ubj znal gvpxf vagb n plpyr gur jnyx jbhyq raq, naq gur plpyr yrff gung vf gur jnvg. Nfxvat ubj znal fdhnerf ner nurnq zrnfherf gur jnyx, fb gur fnzr yvarf svg rirel obneq. {yvarf} yvarf.",
    },
    {
        "id": "last-rank-04",
        "title": "The Long Gallery",
        "difficulty": 4,
        "draws_on": [4, 5],
        "trains": "One loop that asks the board several questions on every pass, and waits for what moves",
        "brief": 'Rooks stand guard along the gallery, and sentries pace it from wall to wall. Your pawn\'s look() calls a sentry "patrol". The gallery is a different length on every board, and no two are guarded the same way.',
        "api": ["move", "wait", "at_goal", "look", "capture_left", "capture_right"],
        "kind": "gallery",
        "par": 9,
        "boards": [
            gallery(("walk", 1), ("rook", "left"), ("walk", 1), ("sentry", "ahead-right"), ("walk", 1), ("rook", "right"), ("walk", 2)),
            gallery(("walk", 2), ("sentry", "left"), ("walk", 1), ("rook", "right"), ("rook", "right"), ("walk", 1), ("sentry", "ahead-left"), ("walk", 2)),
            gallery(("rook", "right"), ("walk", 1), ("rook", "left"), ("walk", 1), ("sentry", "right"), ("walk", 1)),
            gallery(("walk", 1), ("sentry", "ahead-left"), ("walk", 2), ("sentry", "right"), ("walk", 1), ("rook", "left"), ("walk", 1), ("rook", "right"), ("walk", 1)),
        ],
        "unseen": [
            gallery(("sentry", "ahead-right"), ("walk", 1), ("rook", "left"), ("walk", 1), ("sentry", "left"), ("walk", 1)),
            gallery(("walk", 3), ("rook", "right"), ("walk", 1), ("sentry", "ahead-left"), ("walk", 1), ("rook", "left"), ("walk", 1)),
        ],
        "wrong": ["typed", "nowait", "rooks"],
        "hints": [
            "N ebbx pna bayl or gnxra, arire cnffrq. N fragel xrrcf zbivat, fb jung lbhe cnja frrf punatrf sebz bar gvpx gb gur arkg.",
            "Ercrng hagvy gur tbny. Rnpu gvzr, ybbx guerr jnlf. Vs n ebbx be n fragel fgnaqf qvntbanyyl nurnq, gnxr vg. Vs n fragel fgnaqf fgenvtug nurnq, jnvg n gvpx naq ybbx ntnva. Bgurejvfr fgrc sbejneq.",
        ],
        "hint3": ["block", said("cnja.ybbx() =="), "Waiting for a sentry to step aside looks like this:"],
        "note": "Bar ybbc nfxf gur obneq guerr dhrfgvbaf ba rirel cnff, naq gur beqre znggref: gnxvat pbzrf svefg, jnvgvat frpbaq, jnyxvat ynfg. Jnvgvat vafvqr gur ybbc zrnaf gur cnja ybbxf ntnva nsgre rirel gvpx. {yvarf} yvarf.",
    },
    {
        "id": "last-rank-05",
        "title": "The Last Rank",
        "difficulty": 5,
        "draws_on": [2, 3, 4, 5, 6],
        "trains": "Everything the Pawn tier taught, in one program: a counted climb, a guard, a rune and a measured walk",
        "brief": "Climb past the rooks to the guard, who asks how many you took. Behind his gate, a rune on the last rank says where the goal lies. The floor along the last rank has gaps, and you carry two planks. Here your pawn can't tell when it has arrived: only the rune says where to stop.",
        "api": ["move", "turn_left", "turn_right", "look", "capture_left", "capture_right", "bridge", "read"],
        "kind": "finale",
        "planks": 2,
        "par": 21,
        "boards": [
            last_rank((("walk", 1), ("rook", "left"), ("walk", 1), ("rook", "right"), ("walk", 1)), "east", 5, [2, 4], 1),
            last_rank((("rook", "right"), ("walk", 2), ("rook", "left"), ("rook", "left"), ("walk", 1)), "west", 6, [3], 2),
            last_rank((("walk", 2), ("rook", "left"), ("walk", 2)), "east", 3, [], 0),
            last_rank((("rook", "left"), ("rook", "right"), ("walk", 1), ("rook", "right"), ("walk", 1), ("rook", "left"), ("walk", 1)), "west", 4, [1, 3], 3),
        ],
        "unseen": [
            last_rank((("walk", 1), ("rook", "right"), ("walk", 1)), "east", 6, [5], 2),
            last_rank((("rook", "left"), ("walk", 1), ("rook", "right"), ("rook", "right"), ("walk", 2)), "west", 3, [2], 1),
        ],
        "wrong": ["typed", "half", "blind"],
        "hints": [
            "Guerr wbof, bar nsgre nabgure: tb hc gb gur thneq, nafjre uvz, gura sbyybj gur ehar nybat gur ynfg enax. Rnpu obneq vf qvssrerag va nyy guerr.",
            "Tb hc jvgu n ybbc gung tbrf ba hagvy gur tngr vf nurnq, gnxvat ebbxf ba rvgure fvqr naq nqqvat 1 gb n pbhagre sbe rnpu. Cevag gur pbhagre, jnyx guebhtu naq ernq gur ehar. Bar jbeq va vg fnlf juvpu jnl gb ghea, naq nabgure, nf n ahzore, ubj znal fdhnerf gb jnyx. Jnyx gurz jvgu n frpbaq ybbc gung ybbxf sbe n cvg orsber rirel fgrc naq oevqtrf vg.",
        ],
        "hint3": ["block", said("sbe _ va"), "The walk along the last rank can look like this:"],
        "note": "Gur jnl hc unf ab xabja yratgu, fb vg vf n juvyr ybbc; gur jnyx'f yratgu vf ernq sebz gur ehar, fb vg vf n sbe ybbc. Gur pbhagre nafjref gur thneq, n dhrfgvba gb gur grkg cvpxf gur ghea, naq bar cvrpr bs vg, nf n ahzore, frgf gur enatr. {yvarf} yvarf.",
    },
]


def drawn(spec: dict) -> dict:
    """The spec as `yaml_text` wants it: the first board as the level's own, the others as variants."""
    first, *others = spec["boards"]
    return {**spec, **first, "set": SET["set"], "facing": spec.get("facing", "north"), "variants": others}


def draft(spec: dict) -> Level:
    """The challenge as drafted, with par and hints blank, to check its boards before anything is written."""
    return parse_level(yaml.safe_load(yaml_text(drawn(spec), chapter=0, api=spec["api"], par=99, hints=["", "", ""])))


# -- the programs ------------------------------------------------------------------------------------

# Fixed lines, in ROT13. Once decoded, {k} is a number the search fills in.
TOLL = {
    "before": "fgrcf = 0",
    "loop": 'cnja.ybbx() != "tngr"',
    "branch": 'cnja.ybbx() == "cvg"',
    "step": ["cnja.zbir()", "fgrcf += 1"],
    "round": ["cnja.ghea_yrsg()", "cnja.zbir()", "cnja.ghea_evtug()", "cnja.zbir(2)", "cnja.ghea_evtug()", "cnja.zbir()", "cnja.ghea_yrsg()"],
    "count": "fgrcf += {x}",
    "after": ["cevag(fgrcf)", "cnja.zbir(2)"],
}


def lines_of(key: str) -> list[str]:
    return [said(line) for line in TOLL[key]]


def solves(level: Level, code: str) -> bool:
    return run_level(level, code, line_budget=BUDGET, enforce_constraints=False).status == "solved"


def toll_search() -> dict:
    """What gen_while's search over one loop and a chain of branches needs: the way round a pit is
    tried with each count from 1 to 6, and the engine's guards say which one is right."""
    count = said(TOLL["count"])
    rounds = [(*lines_of("round"), count.format(k=k)) for k in range(1, 7)]
    return {
        "calls": [],
        "actions": [tuple(lines_of("step")), *rounds],
        "loop_conds": [said(TOLL["loop"])],
        "branch_conds": [said(TOLL["branch"])],
        "before": said(TOLL["before"]) + "\n",
        "after": "\n".join(lines_of("after")) + "\n",
        "rungs": 1,
    }


def write_toll(_spec: dict, draft_level: Level):
    found = shortest_programs(draft_level, toll_search())
    if found is None:
        return None
    lines, codes = found
    reference = pick(codes)
    count = said(TOLL["count"])

    def wrong_code(kind: str, level: Level) -> str:
        if kind == "typed":  # board 1's own route and answer, typed out
            return route_code(level.cases()[0].level)
        if kind == "once":  # the loop turned into a single check
            return reference.replace("while ", "if ", 1)
        return re.sub(re.escape(count.format(k="")) + r"\d+", count.format(k=1), reference)  # "flat": every pass counts as one

    return reference, f"{lines} lines searched, {len(codes)} like it", wrong_code


# A trail's fixed lines, in ROT13, and what the search may put in each hole, in the order the lessons teach them.
TRAIL = {
    "first": "cnja.zbir()",
    "outer": "juvyr {pbaq}:",
    "inner": "sbe yrt va cnja.ernq().fcyvg({frc}):",
    "bind": "yrt = cnja.ernq()",
    "turn": ["vs {grfg}:", "    cnja.ghea_yrsg()", "ryfr:", "    cnja.ghea_evtug()"],
    "walk": "cnja.zbir(vag({ahz}))",
}
TRAIL_HOLES = {
    "cond": ["abg cnja.ng_tbny()", "cnja.ernq() != Abar", "cnja.ernq()"],
    "sep": ['", "', '","'],
    "test": ['yrt.fgnegfjvgu("yrsg")', '"yrsg" va yrt', 'yrt[0] == "y"'],
    "num": ['yrt.fcyvg(" ")[1]', 'yrt.fcyvg(" ")[-1]', "yrt[5:]", "yrt[-1]"],
}


def trail_code(cond: str, sep: str, test: str, num: str, *, nested: bool = True) -> str:
    """A trail's program with its holes filled. Not `nested`: each rune taken as a single leg."""
    body = [said(line).format(test=test) for line in TRAIL["turn"]] + [said(TRAIL["walk"]).format(num=num)]
    if nested:
        body = [said(TRAIL["inner"]).format(sep=sep), *(f"    {line}" for line in body)]
    else:
        body = [said(TRAIL["bind"]), *body]
    return "\n".join([said(TRAIL["first"]), said(TRAIL["outer"]).format(cond=cond), *(f"    {line}" for line in body)]) + "\n"


def write_trail(spec: dict, draft_level: Level):
    unseen = draft({**spec, "boards": spec["unseen"]})
    fillings = [
        (cond, sep, test, num)
        for cond in map(said, TRAIL_HOLES["cond"])
        for sep in TRAIL_HOLES["sep"]
        for test in map(said, TRAIL_HOLES["test"])
        for num in map(said, TRAIL_HOLES["num"])
    ]
    works = [filling for filling in fillings if all(solves(level, trail_code(*filling)) for level in (draft_level, unseen))]
    if not works:
        return None
    reference = trail_code(*works[0])

    def wrong_code(kind: str, level: Level) -> str:
        if kind == "typed":
            return route_code(level.cases()[0].level)
        if kind == "once":
            return reference.replace("while ", "if ", 1)
        return trail_code(*works[0], nested=False)  # "single"

    return reference, f"{len(works)} of {len(fillings)} fillings solve every board, and two boards the level doesn't have", wrong_code


# The written hour's fixed lines, in ROT13. {c} (once decoded) is a small number the engine settles, in
# the wait and in the last walk. `plain` is the wait with no remainder, `digit` the reading that keeps one character.
HOUR = {
    "first": "cnja.zbir()",
    "read": "plpyr = vag(cnja.ernq().fcyvg({frc})[{v}])",
    "digit": "plpyr = vag(cnja.ernq().fcyvg({frc})[{v}][0])",
    "measure": "nurnq = cnja.fdhnerf_nurnq()",
    "wait": "cnja.jnvg({jnvg})",
    "walk": "cnja.zbir(nurnq + {p})",
    "waits": ["plpyr - (nurnq + {p}) % plpyr", "(plpyr - nurnq - {p}) % plpyr"],
    "plain": "plpyr - nurnq - {p}",
}


def hour_code(index: int, wait: str, c: int, far: int, *, read: str = "read") -> str:
    lines = [
        said(HOUR["first"]),
        said(HOUR[read]).format(sep='" "', i=index),
        said(HOUR["measure"]),
        said(HOUR["wait"]).format(wait=said(wait).format(c=c)),
        said(HOUR["walk"]).format(c=far),
    ]
    return "\n".join(lines) + "\n"


def write_hour(spec: dict, draft_level: Level):
    unseen = draft({**spec, "boards": spec["unseen"]})
    fillings = [(index, wait, c, far) for index in (5, -2) for wait in HOUR["waits"] for c in range(5) for far in range(1, 4)]
    works = [filling for filling in fillings if all(solves(level, hour_code(*filling)) for level in (draft_level, unseen))]
    if not works:
        return None
    index, _wait, c, far = works[0]
    reference = hour_code(*works[0])

    def wrong_code(kind: str, level: Level) -> str:
        if kind == "typed":
            return route_code(level.cases()[0].level)
        if kind == "plain":
            return hour_code(index, HOUR["plain"], c, far)
        return hour_code(*works[0], read="digit")

    return reference, f"{len(works)} of {len(fillings)} fillings solve every board, and four boards the level doesn't have", wrong_code


# The gallery's fixed lines, in ROT13: once decoded, {side} is left or right and {kind} what look() calls a piece.
GALLERY = {
    "loop": "juvyr abg cnja.ng_tbny():",
    "sees": 'cnja.ybbx("{fvqr}") == "{xvaq}"',
    "take": "cnja.pncgher_{fvqr}()",
    "ahead": 'cnja.ybbx() == "cngeby"',
    "wait": "cnja.jnvg()",
    "step": "cnja.zbir()",
}


def gallery_code(sides: tuple[str, ...] = ("left", "right"), kinds: tuple[str, ...] = ("rook", "patrol"), *, waits: bool = True) -> str:
    """The gallery's loop: a branch for each side, one for what's straight ahead (unless not `waits`), and the step."""
    lines, word = [said(GALLERY["loop"])], "if"
    for side in sides:
        sees = " or ".join(said(GALLERY["sees"]).format(side=side, kind=kind) for kind in kinds)
        lines += [f"    {word} {sees}:", "        " + said(GALLERY["take"]).format(side=side)]
        word = "elif"
    if waits:
        lines += [f"    elif {said(GALLERY['ahead'])}:", "        " + said(GALLERY["wait"])]
    return "\n".join([*lines, "    else:", "        " + said(GALLERY["step"])]) + "\n"


def write_gallery(spec: dict, draft_level: Level):
    unseen = draft({**spec, "boards": spec["unseen"]})
    variants = {
        "the reference": gallery_code(),
        "the sides the other way round": gallery_code(("right", "left")),
        "nowait": gallery_code(waits=False),
        "rooks": gallery_code(kinds=("rook",)),
    }
    works = [name for name, code in variants.items() if all(solves(level, code) for level in (draft_level, unseen))]
    if "the reference" not in works:
        return None

    def wrong_code(kind: str, level: Level) -> str:
        return route_code(level.cases()[0].level) if kind == "typed" else variants[kind]

    return variants["the reference"], f"{len(works)} of {len(variants)} variants solve every board and two the level doesn't have (the two orders of the sides should)", wrong_code


# The finale's fixed lines, in ROT13. Its holes: the question that picks the turn, and which piece of the
# rune's text is the number. `half` leaves out the second line that counts, `blind` the look before each step.
FINALE = {
    "climb": [
        "gnxra = 0",
        'juvyr cnja.ybbx() != "tngr":',
        '    vs cnja.ybbx("yrsg") == "ebbx":',
        "        cnja.pncgher_yrsg()",
        "        gnxra += 1",
        '    ryvs cnja.ybbx("evtug") == "ebbx":',
        "        cnja.pncgher_evtug()",
        "        gnxra += 1",
        "    ryfr:",
        "        cnja.zbir()",
    ],
    "answer": ["cevag(gnxra)", "cnja.zbir(2)", "grkg = cnja.ernq()"],
    "turn": ["vs {grfg}:", "    cnja.ghea_yrsg()", "ryfr:", "    cnja.ghea_evtug()"],
    "walk": 'sbe _ va enatr(vag(grkg.fcyvg(" ")[{v}])):',
    "look": ['    vs cnja.ybbx() == "cvg":', "        cnja.oevqtr()"],
    "step": "    cnja.zbir()",
    "tests": ['"jrfg" va grkg', 'grkg.raqfjvgu("jrfg.")'],
}


def finale_code(test: str, index: int, *, half: bool = False, blind: bool = False) -> str:
    climbing = [said(line) for line in FINALE["climb"]]
    if half:
        del climbing[7]
    lines = [
        *climbing,
        *map(said, FINALE["answer"]),
        *(said(line).format(test=said(test)) for line in FINALE["turn"]),
        said(FINALE["walk"]).format(i=index),
        *([] if blind else map(said, FINALE["look"])),
        said(FINALE["step"]),
    ]
    return "\n".join(lines) + "\n"


def write_finale(spec: dict, draft_level: Level):
    unseen = draft({**spec, "boards": spec["unseen"]})
    fillings = [(test, index) for test in FINALE["tests"] for index in (3, -5, 2, 4)]
    works = [filling for filling in fillings if all(solves(level, finale_code(*filling)) for level in (draft_level, unseen))]
    if not works:
        return None

    def wrong_code(kind: str, level: Level) -> str:
        if kind == "typed":
            return route_code(level.cases()[0].level)
        return finale_code(*works[0], half=kind == "half", blind=kind == "blind")

    return finale_code(*works[0]), f"{len(works)} of {len(fillings)} fillings solve every board, and two boards the level doesn't have", wrong_code


WRITERS = {"toll": write_toll, "trail": write_trail, "hour": write_hour, "gallery": write_gallery, "finale": write_finale}


# -- the words no one reads ------------------------------------------------------------------------------


def vocabulary() -> set[str]:
    """Every word the repo's own prose uses (its docs and lessons)."""
    files = [ROOT / "DESIGN.md", ROOT / "CLAUDE.md", *(ROOT / "docs").rglob("*.md"), *(ROOT / "lessons").rglob("*.md")]
    return {word for path in files for word in WORD.findall(path.read_text(encoding="utf-8").lower())}


def strangers(spec: dict) -> list[str]:
    """Where the decoded hints and note use a word the repo never does (a slip in the ROT13, most likely):
    which text and which word by number, never the word."""
    known = vocabulary()
    found = []
    for name, text in [("hint 1", spec["hints"][0]), ("hint 2", spec["hints"][1]), ("the note", spec["note"])]:
        words = WORD.findall(said(text).lower())
        found += [f"{spec['id']}: {name}, word {number} of {len(words)} isn't in the repo's vocabulary" for number, word in enumerate(words, start=1) if len(word) > 1 and word not in known]
    return found


# -- writing a challenge -----------------------------------------------------------------------------------


def list_set(this: dict) -> None:
    """A set's entry in levels/challenges.yaml, rewritten only if it isn't there as it is here. (The Knight
    tier's set, gen_tour.py, is listed through this too.)"""
    path = ROOT / "levels" / "challenges.yaml"
    text = path.read_text(encoding="utf-8")
    listed = yaml.safe_load(text) or []
    if this not in listed:
        listed = [entry for entry in listed if entry["set"] != this["set"]] + [this]
        head = "".join(line for line in text.splitlines(keepends=True) if line.startswith("#"))  # the file's own comment stays
        save(path, head + yaml.safe_dump(listed, sort_keys=False, allow_unicode=True, width=200))


def build_one(spec: dict) -> list[str]:
    problems = strangers(spec)
    list_set(SET)
    words = {**drawn(spec), "hints": [said(hint) for hint in spec["hints"]], "note": said(spec["note"])}
    return problems + build(words, 0, spec["api"], lambda draft_level: WRITERS[spec["kind"]](spec, draft_level))


# -- probe ---------------------------------------------------------------------------------------------


def probe(spec: dict) -> None:
    level = draft(spec)
    answers = [board["legend"]["X"]["passphrase"] for board in spec["boards"] if "X" in board.get("legend", {})]
    print(f"{spec['id']} ({spec['title']}): {len(level.cases())} boards; {plain_routes(level)}")
    if answers:
        print(f"  the guards' answers differ on every board: {len(set(answers)) == len(spec['boards'])}")
    print(f"  words in the hints and the note that aren't the repo's: {len(strangers(spec))}")
    found = WRITERS[spec["kind"]](spec, level)
    print("  the search: " + (found[1] if found else "no program solves every board"))


if __name__ == "__main__":
    main(LEVELS, build_one, probe)
