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


# -- the challenges --------------------------------------------------------------------------------
# kind "toll": a road with pits to walk round and a guard who asks how far the walk was.
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


WRITERS = {"toll": write_toll, "trail": write_trail}


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


def list_set() -> None:
    """The set's entry in levels/challenges.yaml, rewritten only if it isn't there as it is here."""
    path = ROOT / "levels" / "challenges.yaml"
    listed = yaml.safe_load(path.read_text(encoding="utf-8")) or []
    if SET not in listed:
        listed = [entry for entry in listed if entry["set"] != SET["set"]] + [SET]
        save(path, yaml.safe_dump(listed, sort_keys=False, allow_unicode=True, width=200))


def build_one(spec: dict) -> list[str]:
    problems = strangers(spec)
    list_set()
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
