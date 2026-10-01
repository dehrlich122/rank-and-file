"""Level files: reading them, checking them, and describing them to the UI.

Levels are written in YAML (the format is documented in docs/ARCHITECTURE.md).
By the time a level reaches this module it's a plain dict: PyYAML parses it in
the tests, the UI's YAML parser in the browser. `parse_level` checks it
thoroughly, because a typo in a level file should fail loudly in the level
checker instead of confusing a player.
"""

import ast
from dataclasses import asdict, dataclass, field, replace

from .board import Board, Direction, Pos, Tile, Timer, sign, square_name
from .constraints import describe_rules
from .pieces import PIECES
from .words import and_list, count
from .world import CHASERS, CHESS_LINES, CLOCKS, World


class LevelError(ValueError):
    """A level file is malformed."""


# Map symbols every level understands. A level's `legend` can add more.
# SPOT marks a square the goal might be on, when the goal is hidden (M2).
START, GOAL, SPOT = "P", "G", "?"
BUILTIN_SYMBOLS = {".": Tile.FLOOR, "#": Tile.WALL, START: Tile.FLOOR, GOAL: Tile.FLOOR, SPOT: Tile.FLOOR}
# Legend tiles that take details, e.g. `S: {tile: sign, text: "..."}`: the
# details each one needs, then the ones it may add.
TILE_DETAILS: dict[Tile, tuple[set[str], set[str]]] = {
    Tile.SIGN: ({"text"}, set()),
    Tile.GATE: ({"passphrase"}, {"question"}),
    Tile.TIMED_GATE: ({"every"}, {"clock", "open"}),
}

# Enemies (M3.1): the keys each kind takes, and the ground they can walk on.
ENEMY_KEYS = {
    "patrol": {"kind", "start", "route", "loop", "clock", "armoured"},
    "chaser": {"kind", "start", "clock", "strategy", "armoured"},
    "rook": {"kind", "start", "armoured"},  # chess pieces stand still (M3.4)
    "bishop": {"kind", "start", "armoured"},
}
OPEN_GROUND = (Tile.FLOOR, Tile.WAYPOINT, Tile.GEM, Tile.PLANK)

# What a code clock does while the code only repeats lines that have already run (QA-021).
CLOCK_STILL = {"new_line": " While your code only repeats lines that have already run, it {still}."}


def clock_still(clock: str, still: str = "stands still") -> str:
    """The sentence about what a code-clocked obstacle does while lines repeat ("" for other clocks)."""
    return CLOCK_STILL.get(clock, "").format(still=still)

# What makes each clock tick, in words: "one square for ..." (M3.1).
CLOCK_TICKS = {
    "action": "each square you move, each turn and each wait",
    "line": "each line of your code that runs",
    "new_line": "each line of your code that runs for the first time",
}

ALLOWED_KEYS = {
    "id", "chapter", "title", "trains", "brief", "piece", "map", "legend", "start",
    "objectives", "api", "constraints", "par", "hints", "lesson", "starter", "variants",
    "enemies", "lesson_board", "mastery",
}  # fmt: skip
REQUIRED_KEYS = {"id", "chapter", "title", "trains", "map", "api", "lesson"}


@dataclass
class Constraints:
    max_lines: int | None = None  # lines of code, not counting blanks and comments
    min_comments: int = 0
    require_nodes: list[str] = field(default_factory=list)  # ast node names, e.g. "For"
    ban_nodes: list[str] = field(default_factory=list)
    max_numbers: int | None = None  # numbers written in the code, at most (M3.2, QA-029); 1 means one number, written once


@dataclass
class Par:
    """The target a skilled solution meets; meeting it earns a star (M2)."""

    lines: int | None = None  # lines of code, counted like max_lines


@dataclass
class Objectives:
    reach_goal: bool = True
    say: list[str] = field(default_factory=list)  # phrases the program must print
    waypoints: bool = False  # listed (M3.1); every waypoint on a map must be crossed either way
    collect: int | str | None = None  # gems to collect (M3.1): a number, or "all"
    capture: int | str | None = None  # enemies to capture (M3.1): a number, or "all" that can be taken

    @property
    def empty(self) -> bool:
        """Nothing listed (see Level.nothing_to_do, which also counts the map's waypoints)."""
        return not (self.reach_goal or self.say or self.waypoints or self.collect or self.capture)


@dataclass
class Enemy:
    """A patrol or a chaser (M3.1). The World moves it (`world.Foe`)."""

    kind: str  # "patrol" or "chaser"
    start: Pos
    route: list[Pos]  # a patrol's corners, as the level lists them
    path: list[Pos]  # every square a patrol walks, in order (just its start if it stands guard)
    loop: bool = False  # a patrol: round and round, instead of there and back
    clock: str = "action"
    strategy: str = "simple"  # a chaser: how it picks its step
    armoured: bool = False  # can't be captured

    def describe(self) -> str:
        """Its rule, in words, for the Challenge panel."""
        start = square_name(self.start)
        ticks = CLOCK_TICKS[self.clock]
        if self.kind in CHESS_LINES:
            lines = "rank and file (straight across, and up and down)" if self.kind == "rook" else "diagonals"
            text = (
                f"A {self.kind} stands on {start}. It attacks every square along its {lines}, up to the first wall, "
                "closed gate or piece. Step onto one of those squares and it takes you: the run is lost."
            )
        elif self.kind == "chaser":
            text = (
                f"A chaser starts on {start}. It steps one square toward you for {ticks}: along the rank or "
                "the file, whichever gap is bigger (east or west when they're equal). If that way is blocked "
                "it tries the other, and if both are blocked it waits."
            ) + clock_still(self.clock)
        elif len(self.path) == 1:
            text = f"A patrol stands guard on {start}."
        else:
            corners = names(self.route)
            if self.loop:
                way = " to ".join([*corners, corners[0]]) + ", round and round"
            else:
                way = " to ".join(corners) + " and back"
            text = f"A patrol starts on {start} and walks {way}, one square for {ticks}.{clock_still(self.clock)}"
        return f"{text} It's armoured: it can't be captured." if self.armoured else text


@dataclass
class Level:
    id: str
    chapter: int
    title: str
    trains: str
    piece: str
    board: Board
    start: Pos
    facing: Direction
    goal: Pos | None
    objectives: Objectives
    api: list[str]
    constraints: Constraints
    par: Par = field(default_factory=Par)
    hints: list[str] = field(default_factory=list)
    lesson: str = ""
    brief: str = ""
    starter: str = ""
    # A hidden goal (M2): the squares it might be on (? on the map), when the
    # map has no G. A solution must reach it on every one of them.
    goal_spots: list[Pos] = field(default_factory=list)
    # Other maps (M2): the same level on other boards, which a solution must
    # solve too. For levels whose layout varies, e.g. randomized walls.
    variants: list[Level] = field(default_factory=list)
    enemies: list[Enemy] = field(default_factory=list)  # patrols and chasers (M3.1)
    planks: int = 0  # planks the piece starts with (QA-017)
    lesson_board: dict | None = None  # the board the lesson's snippets run on, as the level file gives it (QA-019)
    mastery: bool = False  # a chapter's optional mastery challenge (M3.2)

    def cases(self) -> list[Case]:
        """Every situation a solution must handle: one per square a hidden goal
        could be on, or this board and then each other map. (A level has one
        kind or the other, never both.)"""
        if self.goal_spots:
            return [Case(square_name(spot), f"with the goal on {square_name(spot)}", replace(self, goal=spot)) for spot in self.goal_spots]
        boards = [Case(f"board {number}", f"on board {number}", variant) for number, variant in enumerate(self.variants, start=2)]
        return [Case("board 1", "on board 1", replace(self, variants=[])), *boards]

    @property
    def case_words(self) -> tuple[str, str]:
        """How the player reads about this level's cases: the title of the row
        of cases above the board, and the noun for counting them."""
        return ("Where the goal was", "places the goal could be") if self.goal_spots else ("Boards", "boards")

    def goals(self) -> list[str]:
        """What the player has to do, one sentence each. Never gives away a passphrase."""
        goals = []
        if self.objectives.reach_goal and self.goal:
            goals.append(f"Reach the goal on {square_name(self.goal)}.")
        elif self.objectives.reach_goal and self.goal_spots:
            goals.append(
                f"Reach the goal. It's hidden on one of the {count(len(self.goal_spots), 'square')} marked ?. "
                "Your code runs once for each of them, and has to reach the goal every time."
            )
        for phrase in self.objectives.say:
            if any(phrase in text for text in self.board.signs.values()):
                goals.append("Say the phrase from the signpost: print it, exactly as written.")
            else:
                goals.append(f'Say "{phrase}" (print it).')
        waypoints = names(self.board.squares(Tile.WAYPOINT))
        if len(waypoints) == 1:
            goals.append(f"Cross the waypoint on {waypoints[0]} on the way. Passing over it is enough.")
        elif waypoints:
            goals.append(f"Cross all {len(waypoints)} waypoints on the way: {and_list(waypoints)}. Passing over them is enough.")
        gems = self.gems
        if self.objectives.collect == "all":
            goals.append("Collect the gem by walking over it." if gems == 1 else f"Collect all {gems} gems by walking over them.")
        elif self.objectives.collect:
            goals.append(f"Collect at least {count(self.objectives.collect, 'gem')} of the {gems} by walking over them.")
        capture = self.captures_needed()
        if self.objectives.capture == "all":
            goals.append("Capture the enemy that can be taken." if capture == 1 else f"Capture all {capture} enemies that can be taken.")
        elif capture:
            goals.append(f"Capture at least {count(capture, 'enemy', 'enemies')}.")
        for gate in sorted(self.board.gates):
            if question := self.board.questions.get(gate):
                goals.append(f'Get past the gate on {square_name(gate)}. The guard asks: "{question}" Print the answer next to the gate.')
            else:
                goals.append(f"Get past the locked gate on {square_name(gate)}. A guard keeps it shut.")
        if self.variants:
            goals.append(f"Your code has to work on all {len(self.variants) + 1} boards.")
        return goals

    @property
    def nothing_to_do(self) -> bool:
        """No objectives at all: a run just finishes. (Waypoints on the map are
        always an objective, listed or not. Lesson snippets are never judged.)"""
        return self.objectives.empty and not self.board.squares(Tile.WAYPOINT)

    @property
    def gems(self) -> int:
        return len(self.board.squares(Tile.GEM))

    @property
    def capturable(self) -> int:
        """How many enemies can be captured: the ones that aren't armoured."""
        return sum(not enemy.armoured for enemy in self.enemies)

    def gems_needed(self) -> int:
        """How many gems the collect objective asks for (0 when there isn't one)."""
        return _needed(self.objectives.collect, self.gems)

    def captures_needed(self) -> int:
        """How many enemies the capture objective asks for (0 when there isn't one)."""
        return _needed(self.objectives.capture, self.capturable)

    def obstacles(self) -> list[str]:
        """The obstacles' rules, one sentence each (M3.1), for the Challenge panel."""
        obstacles = []
        pits = names(self.board.squares(Tile.PIT))
        if pits:
            where = f"A pit on {pits[0]}" if len(pits) == 1 else f"Pits on {and_list(pits)}"
            obstacles.append(f"{where}: step in and the run is lost.")
            if "bridge" in self.api:
                obstacles.append("A plank laid over a pit (`bridge()`) makes it safe to cross. Walk over a plank to pick it up.")
            if any(enemy.kind == "chaser" for enemy in self.enemies):
                obstacles.append("A chaser doesn't see pits: if its step lands on one, it falls in and is gone.")
        obstacles.extend(gate_rule(pos, timer) for pos, timer in sorted(self.board.timers.items()))
        obstacles.extend(enemy.describe() for enemy in self.enemies)
        if any(enemy.kind not in CHESS_LINES for enemy in self.enemies):
            obstacles.append("If an enemy lands on your square, or you walk into one, you're caught and the run is lost.")
        elif self.enemies:
            obstacles.append("If you walk into an enemy, you're caught and the run is lost.")
        return obstacles

    def star_goals(self) -> list[str]:
        """What each of the three stars asks for (runner.score awards them)."""
        par = self.par.lines
        within = f"Use {count(par, 'line')} of code or fewer (par)." if par else "There's no par here: solving is enough."
        return ["Solve the level.", within, "Solve it without opening a hint or seeing the solution."]

    def describe(self) -> dict:
        """Everything the UI needs to draw the level, as JSON-friendly data."""
        return {
            "id": self.id,
            "chapter": self.chapter,
            "title": self.title,
            "trains": self.trains,
            "brief": self.brief,
            "piece": self.piece,
            "width": self.board.width,
            "height": self.board.height,
            # tiles[y][x], with y = 0 being the bottom rank
            "tiles": [
                [self.board.tile((x, y)).value for x in range(self.board.width)]
                for y in range(self.board.height)
            ],
            "signs": [{"pos": list(pos), "text": text} for pos, text in self.board.signs.items()],
            "questions": [{"pos": list(pos), "text": text} for pos, text in self.board.questions.items()],
            "timed_gates": [{"pos": list(pos), **asdict(timer), "text": gate_rule(pos, timer)} for pos, timer in self.board.timers.items()],
            "enemies": [
                {"kind": enemy.kind, "route": [list(pos) for pos in enemy.route], "loop": enemy.loop, "clock": enemy.clock, "armoured": enemy.armoured}
                for enemy in self.enemies
            ],  # where each one is comes with the world's state
            "goal": list(self.goal) if self.goal else None,
            "goal_spots": [list(spot) for spot in self.goal_spots],
            "case_title": self.case_words[0] if self.goal_spots else "",  # other maps show their boards instead
            # Gates appear in `tiles`; their passphrases are deliberately left out.
            "start": World(self).state(),
            "objectives": asdict(self.objectives),
            "api": self.api,
            "constraints": asdict(self.constraints),
            "par": asdict(self.par),
            "starter": self.starter,
            # What the Challenge panel shows, in words: the engine owns every
            # player-facing description of its rules.
            "goals": self.goals(),
            "rules": describe_rules(self.constraints),
            "obstacles": self.obstacles(),
            "stars": self.star_goals(),
            # Tiered hints (nudge, concept reminder, partial example); the UI
            # reveals them one at a time, and only when asked.
            "hints": self.hints,
            "mastery": self.mastery,
            # With other maps (M3.2): every board, first to last, shown beside the one on show (QA-032).
            "boards": [case.level.describe() for case in self.cases()] if self.variants else [],
        }


def parse_level(data: dict) -> Level:
    if not isinstance(data, dict):
        raise LevelError("a level must be a mapping of keys to values")
    unknown = set(data) - ALLOWED_KEYS
    if unknown:
        raise LevelError(f"unknown key(s): {', '.join(sorted(unknown))}")
    missing = REQUIRED_KEYS - set(data)
    if missing:
        raise LevelError(f"missing key(s): {', '.join(sorted(missing))}")

    piece = data.get("piece", "pawn")
    if piece not in PIECES:
        raise LevelError(f"unknown piece {piece!r}; expected one of {sorted(PIECES)}")

    legend = data.get("legend") or {}
    objectives = _parse_objectives(data.get("objectives", ["reach_goal"]))
    board, start, goal, spots = _parse_board(data["map"], legend, objectives)
    facing, planks = _parse_start(data.get("start") or {})

    level = Level(
        id=_text(data, "id"),
        chapter=_int(data, "chapter"),
        title=_text(data, "title"),
        trains=_text(data, "trains"),
        piece=piece,
        board=board,
        start=start,
        facing=facing,
        planks=planks,
        goal=goal,
        goal_spots=spots,
        objectives=objectives,
        api=_parse_api(data["api"], piece),
        constraints=_parse_constraints(data.get("constraints") or {}),
        par=_parse_par(data.get("par") or {}),
        hints=[str(hint) for hint in data.get("hints") or []],
        lesson=_text(data, "lesson"),
        brief=str(data.get("brief", "")),
        starter=str(data.get("starter", "")),
        mastery=data.get("mastery", False),
    )
    if not isinstance(level.mastery, bool):
        raise LevelError("mastery is true or false")
    if "lesson_board" in data:
        try:
            sandbox_level(level.api, piece, data["lesson_board"])
        except LevelError as exc:
            raise LevelError(f"lesson_board: {exc}") from None
        level.lesson_board = data["lesson_board"]
    level.enemies = _parse_enemies(data.get("enemies") or [])
    _check_enemies(level)
    capturable = level.capturable
    if level.objectives.capture and not capturable:
        raise LevelError("objective capture needs an enemy that isn't armoured")
    if isinstance(level.objectives.capture, int) and level.objectives.capture > capturable:
        raise LevelError(f"objective capture asks for {level.objectives.capture}, and only {capturable} can be taken")
    level.variants = _parse_variants(data.get("variants") or [], legend, level)
    if level.variants and level.goal_spots:
        raise LevelError("a level has ? squares for a hidden goal or other maps (variants), not both")
    return level


def parse_map(text: str, legend: dict) -> tuple[Board, Pos, Pos | None, list[Pos]]:
    """Read an ASCII map: its board, start, goal and hidden-goal squares (?).
    The first line is the top rank; symbols are separated by spaces."""
    if not isinstance(text, str) or not text.strip():
        raise LevelError("map must be a non-empty block of text")
    rows = [line.split() for line in text.strip("\n").splitlines() if line.strip()]
    width, height = len(rows[0]), len(rows)
    if any(len(row) != width for row in rows):
        raise LevelError("every map row must have the same number of squares")

    symbols = dict(BUILTIN_SYMBOLS)
    details: dict[str, dict] = {}  # symbol -> its details, e.g. a sign's text or a gate's passphrase
    for symbol, meaning in legend.items():
        symbol = str(symbol)
        if symbol in BUILTIN_SYMBOLS:
            raise LevelError(f"legend can't redefine the built-in symbol {symbol!r}")
        meaning = meaning if isinstance(meaning, dict) else {"tile": meaning}
        try:
            tile = symbols[symbol] = Tile(meaning.get("tile"))
        except ValueError:
            raise LevelError(f"legend {symbol!r}: unknown tile {meaning.get('tile')!r}") from None
        details[symbol] = _parse_details(symbol, tile, meaning)

    board = Board(width, height)
    start: Pos | None = None
    goal: Pos | None = None
    spots: list[Pos] = []
    for row_index, row in enumerate(rows):
        y = height - 1 - row_index
        for x, symbol in enumerate(row):
            if symbol not in symbols:
                raise LevelError(f"map symbol {symbol!r} at row {row_index + 1} isn't built in or in the legend")
            tile = symbols[symbol]
            if tile is not Tile.FLOOR:
                board.tiles[(x, y)] = tile
            if tile is Tile.SIGN:
                board.signs[(x, y)] = details[symbol]["text"]
            if tile is Tile.GATE:
                board.gates[(x, y)] = details[symbol]["passphrase"]
                if "question" in details[symbol]:
                    board.questions[(x, y)] = details[symbol]["question"]
            if tile is Tile.TIMED_GATE:
                board.timers[(x, y)] = Timer(**details[symbol])
            if symbol == START:
                if start is not None:
                    raise LevelError("the map has more than one start square (P)")
                start = (x, y)
            if symbol == GOAL:
                if goal is not None:
                    raise LevelError("the map has more than one goal square (G)")
                goal = (x, y)
            if symbol == SPOT:
                spots.append((x, y))
    if start is None:
        raise LevelError("the map needs a start square (P)")
    if goal is not None and spots:
        raise LevelError("a map has a goal (G) or squares a hidden goal might be on (?), not both")
    return board, start, goal, sorted(spots)


def _parse_details(symbol: str, tile: Tile, meaning: dict) -> dict:
    """A legend tile's details, checked: each text is non-empty, and a timed gate's timing makes sense."""
    needs, may = TILE_DETAILS.get(tile, (set(), set()))
    unknown = set(meaning) - {"tile"} - needs - may
    if unknown:
        raise LevelError(f"legend {symbol!r}: a {tile.value} doesn't take {', '.join(sorted(unknown))}")
    details = {key: value for key, value in meaning.items() if key != "tile"}
    for key in needs | set(details):
        value = details.get(key)
        if key in ("every", "open"):
            if not _positive(value):
                raise LevelError(f"legend {symbol!r}: a timed gate needs {key}: a whole number of ticks")
        elif key == "clock":
            _check_clock(f"legend {symbol!r}", value)
        elif not isinstance(value, str) or not value:
            raise LevelError(f"legend {symbol!r}: a {tile.value} needs {key}")
    open_for = details.get("open", Timer.open)
    if tile is Tile.TIMED_GATE and details["every"] <= open_for:
        raise LevelError(f"legend {symbol!r}: a timed gate's every must be more than its open ({open_for}), or it would never shut")
    return details


@dataclass
class Case:
    """One situation a solution must handle (see Level.cases)."""

    label: str  # "b3" (where a hidden goal is), or "board 1", "board 2", ...
    where: str  # for sentences: "with the goal on b3", "on board 2"
    level: Level  # the level as it is in this case


def sandbox_level(api: list[str], piece: str = "pawn", lesson_board: dict | None = None) -> Level:
    """The board lesson snippets run on: a small open one, or the level's own
    `lesson_board` (a map, legend, enemies and start: QA-019). Snippets have no
    objectives: runner.run_sandbox never judges a run."""
    level = Level(
        id="sandbox",
        chapter=0,
        title="Sandbox",
        trains="",
        piece=piece,
        board=Board(width=5, height=4),
        start=(2, 0),
        facing=Direction.NORTH,
        goal=None,
        objectives=Objectives(reach_goal=False),
        api=list(api),
        constraints=Constraints(),
    )
    if lesson_board is None:
        return level
    if not isinstance(lesson_board, dict) or set(lesson_board) - {"map", "legend", "enemies", "start"}:
        raise LevelError("a lesson board takes map, legend, enemies and start")
    board, start, goal, _spots = parse_map(lesson_board.get("map"), lesson_board.get("legend") or {})
    facing, planks = _parse_start(lesson_board.get("start") or {})
    enemies = _parse_enemies(lesson_board.get("enemies") or [])
    level = replace(level, board=board, start=start, goal=goal, facing=facing, planks=planks, enemies=enemies)
    _check_enemies(level)
    return level


def gate_rule(pos: Pos, timer: Timer) -> str:
    """A timed gate's rule, in words: the Obstacles text and the gate's tooltip (QA-024)."""
    return (
        f"The gate on {square_name(pos)} is open for {count(timer.open, 'tick')}, then shut for "
        f"{count(timer.every - timer.open, 'tick')}, over and over, starting open. It ticks once for "
        f"{CLOCK_TICKS[timer.clock]}.{clock_still(timer.clock, 'doesn’t open or shut')} Anything under it "
        "when it shuts is crushed: if that's you, the run is lost."
    )


def names(squares: list[Pos]) -> list[str]:
    return [square_name(pos) for pos in squares]


def _text(data: dict, key: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise LevelError(f"{key} must be non-empty text")
    return value


def _int(data: dict, key: str) -> int:
    value = data.get(key)
    if not isinstance(value, int) or isinstance(value, bool):
        raise LevelError(f"{key} must be a whole number")
    return value


def _parse_start(start) -> tuple[Direction, int]:
    """Which way the piece faces at the start, and how many planks it carries."""
    if not isinstance(start, dict) or set(start) - {"facing", "planks"}:
        raise LevelError("start takes facing and planks, e.g. {facing: north, planks: 1}")
    planks = start.get("planks", 0)
    if not isinstance(planks, int) or isinstance(planks, bool) or planks < 0:
        raise LevelError("start planks must be a whole number")
    return _parse_facing(start.get("facing", "north")), planks


def _parse_facing(value) -> Direction:
    try:
        return Direction(value)
    except ValueError:
        raise LevelError(f"start facing must be north, east, south or west, not {value!r}") from None


def _parse_objectives(items) -> Objectives:
    if not isinstance(items, list) or not items:
        raise LevelError("objectives must be a non-empty list")
    objectives = Objectives(reach_goal=False)
    for item in items:
        if item == "reach_goal":
            objectives.reach_goal = True
        elif item == "waypoints":
            objectives.waypoints = True
        elif isinstance(item, dict) and set(item) == {"say"} and isinstance(item["say"], str):
            objectives.say.append(item["say"])
        elif isinstance(item, dict) and len(item) == 1 and set(item) <= {"collect", "capture"}:
            [(kind, target)] = item.items()
            if target != "all" and not _positive(target):
                raise LevelError(f"unknown objective {item!r}")
            setattr(objectives, kind, target)  # how many gems to collect, or enemies to capture
        else:
            raise LevelError(f"unknown objective {item!r}")
    return objectives


def _positive(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 1


def _needed(target: int | str | None, total: int) -> int:
    """A counted objective's number: `total` for "all", 0 when there's no such objective."""
    return total if target == "all" else target or 0


def _check_clock(where: str, clock) -> None:
    if clock not in CLOCKS:
        raise LevelError(f"{where}: clock must be one of {', '.join(CLOCKS)}, not {clock!r}")


def _parse_api(names, piece: str) -> list[str]:
    if not isinstance(names, list):
        raise LevelError("api must be a list of ability names")
    known = PIECES[piece].ABILITIES
    for name in names:
        if name not in known:
            raise LevelError(f"api: the {piece} has no ability {name!r}; it has {', '.join(known)}")
    return list(names)


def _parse_board(text: str, legend: dict, objectives: Objectives) -> tuple[Board, Pos, Pos | None, list[Pos]]:
    """A map, checked against what the level asks for."""
    board, start, goal, spots = parse_map(text, legend)
    if objectives.reach_goal and goal is None and not spots:
        raise LevelError("objective reach_goal needs a goal square (G), or ? squares for a hidden goal, on the map")
    # Waypoints are always an objective: listing it is optional, but then the map needs some.
    if objectives.waypoints and not board.squares(Tile.WAYPOINT):
        raise LevelError("objective waypoints needs waypoint squares on the map")
    gems = len(board.squares(Tile.GEM))
    if objectives.collect and not gems:
        raise LevelError("objective collect needs gem squares on the map")
    if isinstance(objectives.collect, int) and objectives.collect > gems:
        raise LevelError(f"objective collect asks for {objectives.collect} gems, and the map has {gems}")
    return board, start, goal, spots


def _parse_variants(items, legend: dict, level: Level) -> list[Level]:
    """Each other map is the level on another board: same objectives and abilities,
    and the same legend, though a board can give a symbol its own entry (M3.2),
    e.g. a guard with a different answer."""
    if not isinstance(items, list):
        raise LevelError("variants must be a list of {map: ...} entries")
    variants = []
    for number, item in enumerate(items, start=1):
        if not isinstance(item, dict) or "map" not in item or set(item) - {"map", "legend"}:
            raise LevelError(f"variant {number} must have a map, and optionally a legend, and nothing else")
        if not isinstance(item.get("legend", {}), dict):
            raise LevelError(f"variant {number}: legend must be a mapping of symbols to tiles")
        try:
            board, start, goal, spots = _parse_board(item["map"], {**legend, **item.get("legend", {})}, level.objectives)
        except LevelError as exc:
            raise LevelError(f"variant {number}: {exc}") from None
        if spots:
            raise LevelError(f"variant {number}: ? squares are only for the level's own map")
        variant = replace(level, board=board, start=start, goal=goal, variants=[])
        try:
            _check_enemies(variant)
        except LevelError as exc:
            raise LevelError(f"variant {number}: {exc}") from None
        variants.append(variant)
    return variants


def _parse_enemies(items) -> list[Enemy]:
    if not isinstance(items, list):
        raise LevelError("enemies must be a list, e.g. [{kind: patrol, route: [b4, e4]}]")
    enemies = []
    for number, item in enumerate(items, start=1):
        where = f"enemy {number}"
        if not isinstance(item, dict) or item.get("kind") not in ENEMY_KEYS:
            raise LevelError(f"{where}: kind must be patrol, chaser, rook or bishop")
        kind = item["kind"]
        unknown = set(item) - ENEMY_KEYS[kind]
        if unknown:
            raise LevelError(f"{where}: a {kind} doesn't take {', '.join(sorted(unknown))}")
        route = item.get("route", [])
        if not isinstance(route, list):
            raise LevelError(f"{where}: route must be a list of squares, e.g. [b4, e4]")
        corners = [_square(where, name) for name in route]
        if "start" in item:
            start = _square(where, item["start"])
        elif corners:
            start = corners[0]
        else:
            raise LevelError(f"{where}: needs a start square")
        loop = item.get("loop", False)
        clock = item.get("clock", "action")
        strategy = item.get("strategy", "simple")
        armoured = item.get("armoured", False)
        if not isinstance(loop, bool) or not isinstance(armoured, bool):
            raise LevelError(f"{where}: loop and armoured are true or false")
        _check_clock(where, clock)
        if strategy not in CHASERS:
            raise LevelError(f"{where}: strategy must be one of {', '.join(CHASERS)}, not {strategy!r}")
        corners = corners or [start]
        path = _walk(where, corners, loop)
        if start not in path:
            raise LevelError(f"{where}: starts on {square_name(start)}, which isn't on its route")
        enemies.append(Enemy(kind, start, corners, path, loop, clock, strategy, armoured))
    return enemies


def _square(where: str, name) -> Pos:
    """A square from its chess name, e.g. "b4" -> (1, 3)."""
    text = str(name)
    if len(text) < 2 or not ("a" <= text[0] <= "z") or not text[1:].isdigit() or int(text[1:]) < 1:
        raise LevelError(f"{where}: {name!r} isn't a square; squares are named like b4")
    return (ord(text[0]) - ord("a"), int(text[1:]) - 1)


def _walk(where: str, corners: list[Pos], loop: bool) -> list[Pos]:
    """Every square along a patrol's route: straight lines from corner to corner
    (and back to the first, for a loop)."""
    closed = loop and len(corners) > 1
    path = [corners[0]]
    for end in corners[1:] + ([corners[0]] if closed else []):
        x, y = path[-1]
        if (x, y) == end or (x != end[0] and y != end[1]):
            raise LevelError(f"{where}: {square_name((x, y))} to {square_name(end)} isn't a straight line along a rank or file")
        dx, dy = sign(end[0] - x), sign(end[1] - y)
        while (x, y) != end:
            x, y = x + dx, y + dy
            path.append((x, y))
    if closed:
        path.pop()  # back where it started
    return path


def _check_enemies(level: Level) -> None:
    """Enemies stay on open ground, and start apart from the piece and each other."""
    starts: set[Pos] = set()
    for number, enemy in enumerate(level.enemies, start=1):
        for pos in enemy.path:
            if not level.board.contains(pos):
                raise LevelError(f"enemy {number}: {square_name(pos)} isn't on the board")
            if level.board.tile(pos) not in OPEN_GROUND:
                raise LevelError(f"enemy {number}: {square_name(pos)} is a {level.board.tile(pos).value}, and enemies walk on open ground")
        if enemy.start == level.start:
            raise LevelError(f"enemy {number}: starts on the {level.piece}'s square")
        if enemy.start in starts:
            raise LevelError(f"enemy {number}: starts on the same square as another enemy")
        starts.add(enemy.start)
    if foe := World(level).attacker(level.start):
        raise LevelError(f"the {level.piece} starts on {square_name(level.start)}, which the {foe.enemy.kind} on {square_name(foe.pos)} attacks")


def _parse_par(data: dict) -> Par:
    if not isinstance(data, dict):
        raise LevelError("par must be a mapping, e.g. {lines: 3}")
    unknown = set(data) - {"lines"}
    if unknown:
        raise LevelError(f"unknown par key(s): {', '.join(sorted(unknown))}")
    lines = data.get("lines")
    if lines is not None and not _positive(lines):
        raise LevelError("par lines must be a whole number of at least 1")
    return Par(lines=lines)


def _parse_constraints(data: dict) -> Constraints:
    allowed = {"max_lines", "min_comments", "require_nodes", "ban_nodes", "max_numbers"}
    unknown = set(data) - allowed
    if unknown:
        raise LevelError(f"unknown constraint(s): {', '.join(sorted(unknown))}")
    constraints = Constraints(**data)
    if constraints.max_numbers is not None and not _positive(constraints.max_numbers):
        raise LevelError("constraint max_numbers must be a whole number of at least 1")
    for name in constraints.require_nodes + constraints.ban_nodes:
        node_type = getattr(ast, name, None)
        if not (isinstance(node_type, type) and issubclass(node_type, ast.AST)):
            raise LevelError(f"constraint node {name!r} isn't an ast node type")
    return constraints
