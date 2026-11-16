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
from levelgen import ROOT, build, main, said, save, yaml_text

from rankfile.levels import Level, parse_level

SET = {
    "set": "last-rank",
    "title": "The Last Rank",
    "tier": "pawn",
    "summary": "Puzzles that mix the Pawn tier's chapters. No lessons; the Codex has everything.",
}
PAWN = ["move", "turn_left", "turn_right", "squares_ahead", "wait", "at_goal", "look"]  # what every challenge may call
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


# -- the challenges --------------------------------------------------------------------------------
# kind "toll": a road with pits to walk round and a guard who asks how far the walk was.
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


def write_toll(draft_level: Level):
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


WRITERS = {"toll": write_toll}


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
    return problems + build(words, 0, spec["api"], WRITERS[spec["kind"]])


# -- probe ---------------------------------------------------------------------------------------------


def probe(spec: dict) -> None:
    level = draft(spec)
    answers = [board["legend"]["X"]["passphrase"] for board in spec["boards"] if "X" in board.get("legend", {})]
    print(f"{spec['id']} ({spec['title']}): {len(level.cases())} boards; {plain_routes(level)}")
    print(f"  the guards' answers differ on every board: {len(set(answers)) == len(spec['boards'])}; words that aren't the repo's: {len(strangers(spec))}")
    found = WRITERS[spec["kind"]](level)
    print("  the search: " + (found[1] if found else "no program solves every board"))


if __name__ == "__main__":
    main(LEVELS, build_one, probe)
