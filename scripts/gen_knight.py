"""Write the knight's practice levels in the Testing ground, blind (M5.1: docs/M5/M5.1.md, "The practice levels").

    .venv/Scripts/python scripts/gen_knight.py                    # every level below
    .venv/Scripts/python scripts/gen_knight.py practice-11        # just one
    .venv/Scripts/python scripts/gen_knight.py probe [practice-11] # only check the boards

How a reference is written, with no one reading it: a search plays the real engine on every board
of the level at once. One program runs on them all, a statement at a time: a jump, or a look at a
landing square that sends the boards where it sees a word one way and the rest another. The
program with the fewest lines that solves every board is the reference. Hints 1 and 2 and the
notes are stored in ROT13 (`said()` decodes them) and checked word by word against the repo's own
vocabulary. The generator prints counts and outcomes only, never code or prose: the designer is
also the game's learner (see CLAUDE.md: no spoilers).

The lessons (lessons/practice/) are written by hand: they are what the player reads first.
"""

from heapq import heappop, heappush
from itertools import count, product

import yaml
from gen_mastery import strangers
from levelgen import build, main, said, yaml_text

from rankfile.constraints import code_lines
from rankfile.exceptions import GameError, Lost
from rankfile.levels import Level, parse_level
from rankfile.pieces import PIECES
from rankfile.runner import unmet_objectives
from rankfile.search import _key
from rankfile.world import KNIGHT_JUMPS, World

Jumps = tuple[tuple[int, int], ...]  # jumps in a row
BODIES: list[Jumps] = [(), *[(jump,) for jump in KNIGHT_JUMPS], *product(KNIGHT_JUMPS, repeat=2)]  # what one branch of a look may do

# -- the search -----------------------------------------------------------------------------------


def lines_of(step: tuple) -> list[str]:
    """A statement as code: ("jump", offset), or ("look", offset, word, then, other)."""
    jump = "knight.jump({}, {})".format
    if step[0] == "jump":
        return [jump(*step[1])]
    _, at, word, then, other = step
    code = [f'if knight.look({at[0]}, {at[1]}) == "{word}":', *[f"    {jump(*offset)}" for offset in then]]
    return code + (["else:", *[f"    {jump(*offset)}" for offset in other]] if other else [])


def code_of(program: list[tuple]) -> str:
    return "\n".join(line for step in program for line in lines_of(step)) + "\n"


def jumped(level: Level, world: World, jumps: Jumps) -> World | None:
    """The world after these jumps, played as player code would, or None if one fails or loses."""
    after = world.copy()
    piece = PIECES[level.piece](after, level.api)
    try:
        for dx, dy in jumps:
            piece.jump(dx, dy)
    except (GameError, Lost):
        return None
    return after


def seen(level: Level, world: World) -> list[str | None]:
    """What the knight sees on each square a jump could land on."""
    piece = PIECES[level.piece](world.copy(), level.api)
    return [piece.look(dx, dy) for dx, dy in KNIGHT_JUMPS]


def ways(boards: list[Level], worlds: tuple, group: list[int], least: int) -> list[tuple[Jumps, dict[int, World]]]:
    """Every run of `least` to two jumps that works on each board of `group`, with the worlds after it."""
    found = []
    for body in BODIES:
        if len(body) < least:
            continue
        after = {index: jumped(boards[index], worlds[index], body) for index in group}
        if all(world is not None for world in after.values()):
            found.append((body, after))
    return found


def statements(boards: list[Level], worlds: tuple, looks: bool):
    """Every statement that works on every board from here, with the worlds after it."""
    for jump in KNIGHT_JUMPS:
        after = [jumped(board, world, (jump,)) for board, world in zip(boards, worlds, strict=True)]
        if all(world is not None for world in after):
            yield ("jump", jump), tuple(after)
    if not looks:
        return
    views = [seen(board, world) for board, world in zip(boards, worlds, strict=True)]
    for number, at in enumerate(KNIGHT_JUMPS):
        for word in sorted({view[number] for view in views if view[number] is not None}):
            yes = [index for index, view in enumerate(views) if view[number] == word]
            no = [index for index in range(len(boards)) if index not in yes]
            if not no:
                continue  # every board sees it: nothing to choose between
            for (then, moved), (other, stayed) in product(ways(boards, worlds, yes, 1), ways(boards, worlds, no, 0)):
                after = {**moved, **stayed}
                yield ("look", at, word, then, other), tuple(after[index] for index in range(len(boards)))


def shortest(level: Level, *, looks: bool, done=None) -> list[tuple] | None:
    """The program with the fewest lines that solves every board of `level`, or None.
    `done` (a board and its world) replaces the level's own objectives, for a wrong attempt."""
    boards = [case.level for case in level.cases()]
    done = done or (lambda board, world: not unmet_objectives(board, world, ""))
    start = tuple(World(board) for board in boards)
    key = lambda worlds: tuple(_key(world, "", "") for world in worlds)  # noqa: E731
    best = {key(start): 0}
    order = count()  # breaks ties between equal costs, so worlds are never compared
    queue = [(0, next(order), key(start), start, ())]
    while queue:
        lines, _, here, worlds, program = heappop(queue)
        if best[here] < lines:
            continue
        if all(done(board, world) for board, world in zip(boards, worlds, strict=True)):
            return list(program)
        for step, after in statements(boards, worlds, looks and len(boards) > 1):
            cost = lines + code_lines("\n".join(lines_of(step)))
            there = key(after)
            if there in best and best[there] <= cost:
                continue
            best[there] = cost
            heappush(queue, (cost, next(order), there, after, (*program, step)))
    return None


def shape(program: list[tuple]) -> str:
    """A program in counts, for the printout."""
    looks = sum(step[0] == "look" for step in program)
    return f"{len(program) - looks} plain jumps and {looks} looks"


# -- wrong attempts ---------------------------------------------------------------------------------


def found(program: list[tuple] | None) -> list[tuple]:
    """A wrong attempt's route. The board has to allow one: an empty attempt would fail for the wrong reason."""
    if program is None:
        raise SystemExit("a wrong attempt has no route on this board: change the board or the attempt")
    return program


def walk(_level: Level) -> str:
    """Asking the knight to walk, as a pawn would."""
    return "knight.move(2)\n"


def dodge(level: Level) -> str:
    """The quickest way to the goal that keeps clear of every enemy, as a pawn would have to."""
    return code_of(found(shortest(level, looks=False, done=lambda _board, world: world.at_goal() and not any(foe.captured for foe in world.foes))))


def one_board(level: Level) -> str:
    """The first board's own route, typed out, with no look."""
    return code_of(found(shortest(level.cases()[0].level, looks=False)))


WRONG = {"walk": walk, "dodge": dodge, "one_board": one_board}

# -- the levels -------------------------------------------------------------------------------------

LOOK_BOARD = """\
. . . . .
# . . . .
. # . O .
. P . . ."""

LEVELS = [
    {
        "id": "practice-11",
        "title": "First Jumps",
        "trains": "The knight's jump: knight.jump(dx, dy)",
        "brief": "Your knight starts in the corner. It can't walk a single square: jump to the goal.",
        "api": ["jump"],
        "map": """
            . . . G .
            . . . . .
            . . . . .
            . . . . .
            P . . . .
        """,
        "lesson_board": {"map": ". . . . .\n. . . . .\n. . P . .\n. . . . .\n. . . . .", "start": {"facing": "north"}},
        "par": 3,
        "hint3": ["start", 1],
        "wrong": ["walk"],
        "hints": [
            "Gur tbny vf gbb sne sbe bar whzc. Cvpx n fdhner ba gur jnl gurer svefg.",
            "Rnpu whzc tbrf gjb fdhnerf bar jnl naq bar fdhner gur bgure. Gur svefg ahzore vf ubj sne evtug, gur frpbaq ubj sne hc. "
            "Pbhag gur fdhnerf sebz lbhe xavtug gb gur tbny, naq oernx gung vagb whzcf.",
        ],
        "note": "{yvarf} whzcf ernpu gur tbny, naq zber guna bar ebhgr qbrf vg. Nal bs gurz vf nf tbbq nf gur bgure: n whzc vf bar yvar jungrire jnl vg tbrf.",
    },
    {
        "id": "practice-12",
        "title": "Over and Onto",
        "trains": "A jump flies over walls and takes what it lands on",
        "brief": "A wall no pawn could pass, an enemy beyond it, and two pits. Take the enemy, then land on the goal.",
        "api": ["jump"],
        "map": """
            . . . # . . G
            . . . # . . .
            . . . # O . .
            . . . # . O .
            P . . # . . .
        """,
        "legend": {"O": "pit"},
        "enemies": [{"kind": "patrol", "start": "f3"}],
        "objectives": ["reach_goal", {"capture": "all"}],
        "lesson_board": {"map": LOOK_BOARD, "legend": {"O": "pit"}, "enemies": [{"kind": "patrol", "start": "c3"}], "start": {"facing": "north"}},
        "par": 4,
        "hint3": ["start", 1],
        "wrong": ["dodge"],
        "hints": [
            "Ab cnja pbhyq cnff gung jnyy. N xavtug qbrfa'g arrq gb: vg syvrf bire.",
            "Bayl gur fdhner n whzc ynaqf ba znggref. Ynaq ba gur rarzl gb gnxr vg, naq xrrc bss gur cvgf. Gur tbny pbhagf bayl bapr gur rarzl vf gnxra.",
        ],
        "note": "Gur ersrerapr whzcf fgenvtug bire gur jnyy, ynaqf ba gur rarzl gb gnxr vg, naq tbrf ba gb gur tbny. "
        "Abguvat va orgjrra znggref gb n xavtug: bayl jurer vg ynaqf.",
    },
    {
        "id": "practice-13",
        "title": "Look Before You Leap",
        "trains": "Looking at a landing square first: knight.look(dx, dy)",
        "brief": "One of your knight's first landing squares is deadly or blocked, and which one depends on the board. Look before you jump.",
        "api": ["jump", "look"],
        "map": """
            . . . . G .
            . . . . . .
            . . . . . .
            . O . . . .
            . . . . . .
            P . . . . .
        """,
        "legend": {"O": "pit"},
        "variants": [
            """
            . . . . G .
            . . . . . .
            . . . . . .
            . . . . . .
            . . O . . .
            P . . . . .
            """,
            """
            . . . . G .
            . . . . . .
            . . . . . .
            . # . . . .
            . . . . . .
            P . . . . .
            """,
        ],
        "lesson_board": {"map": LOOK_BOARD, "legend": {"O": "pit"}, "start": {"facing": "north"}},
        "par": 6,
        "hint3": ["block", "knight.look", "One way to look before a jump:"],
        "wrong": ["one_board"],
        "hints": [
            "Gur obneqf qvssre ba gur svefg whzc. Lbhe pbqr pna'g xabj juvpu obneq vg vf ba hagvy vg ybbxf.",
            "xavtug.ybbx(qk, ql) anzrf jung vf ba n ynaqvat fdhner jvgubhg whzcvat. Ybbx ng bar bs gur gjb fdhnerf lbhe svefg whzc pbhyq ynaq ba, "
            "naq yrg na vs pubbfr gur whzc. Bar grfg unf gb or evtug ba rirel obneq.",
        ],
        "note": "Gur ersrerapr ybbxf ng n ynaqvat fdhner orsber vg whzcf, naq yrgf na vs pubbfr gur jnl. "
        "Gur grfg vf jevggra fb gung bar yvar bs pbqr vf evtug ba rirel obneq.",
    },
]

# -- writing a level ----------------------------------------------------------------------------------


def drawn(spec: dict) -> dict:
    """The spec as levelgen takes it: a knight's level, facing north."""
    return {**spec, "piece": "knight", "facing": "north"}


def write(draft: Level):
    program = shortest(draft, looks="look" in draft.api)
    if program is None:
        return None
    return code_of(program), shape(program), lambda kind, level: WRONG[kind](level)


def build_one(spec: dict) -> list[str]:
    words = {**drawn(spec), "hints": [said(hint) for hint in spec["hints"]], "note": said(spec["note"])}
    return strangers(spec) + build(words, 0, spec["api"], write)


def probe(spec: dict) -> None:
    level = parse_level(yaml.safe_load(yaml_text(drawn(spec), chapter=0, api=spec["api"], par=99, hints=["", "", ""])))
    boards = level.cases()
    alone = [shortest(case.level, looks=False) for case in boards]
    print(f"{spec['id']} ({spec['title']}): {len(boards)} boards; fewest jumps on each alone: {[len(route) if route else None for route in alone]}")
    if len(boards) > 1:
        print(f"  a program with no look solves every board: {shortest(level, looks=False) is not None}")
    print(f"  words in the hints and the note that aren't the repo's: {len(strangers(spec))}")
    found = shortest(level, looks="look" in level.api)
    print("  the search: " + (f"{code_lines(code_of(found))} lines, {shape(found)}" if found else "no program solves every board"))


if __name__ == "__main__":
    main(LEVELS, build_one, probe)
