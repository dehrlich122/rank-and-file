"""Level files: reading them, checking them, and describing them to the UI.

Levels are written in YAML (the format is documented in docs/ARCHITECTURE.md).
By the time a level reaches this module it's a plain dict: PyYAML parses it in
the tests, the UI's YAML parser in the browser. `parse_level` checks it
thoroughly, because a typo in a level file should fail loudly in the level
checker instead of confusing a player.
"""

import ast
from dataclasses import asdict, dataclass, field, replace

from .board import Board, Direction, Pos, Tile, square_name
from .constraints import describe_rules
from .pieces import PIECES
from .words import count


class LevelError(ValueError):
    """A level file is malformed."""


# Map symbols every level understands. A level's `legend` can add more.
# SPOT marks a square the goal might be on, when the goal is hidden (M2).
START, GOAL, SPOT = "P", "G", "?"
BUILTIN_SYMBOLS = {".": Tile.FLOOR, "#": Tile.WALL, START: Tile.FLOOR, GOAL: Tile.FLOOR, SPOT: Tile.FLOOR}
# Legend tiles that need one extra detail, e.g. `S: {tile: sign, text: "..."}`.
TILE_DETAILS = {Tile.SIGN: "text", Tile.GATE: "passphrase"}

ALLOWED_KEYS = {
    "id", "chapter", "title", "trains", "brief", "piece", "map", "legend", "start",
    "objectives", "api", "constraints", "par", "hints", "lesson", "starter", "variants",
}  # fmt: skip
REQUIRED_KEYS = {"id", "chapter", "title", "trains", "map", "api", "lesson"}


@dataclass
class Constraints:
    max_lines: int | None = None  # lines of code, not counting blanks and comments
    min_comments: int = 0
    require_nodes: list[str] = field(default_factory=list)  # ast node names, e.g. "For"
    ban_nodes: list[str] = field(default_factory=list)


@dataclass
class Par:
    """The target a skilled solution meets; meeting it earns a star (M2)."""

    lines: int | None = None  # lines of code, counted like max_lines


@dataclass
class Objectives:
    reach_goal: bool = True
    say: list[str] = field(default_factory=list)  # phrases the program must print


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

    def cases(self) -> list[Case]:
        """Every situation a solution must handle: one per square a hidden goal
        could be on, or this board and then each other map. (A level has one
        kind or the other, never both.)"""
        if self.goal_spots:
            return [Case(square_name(spot), f"with the goal on {square_name(spot)}", replace(self, goal=spot)) for spot in self.goal_spots]
        boards = [Case(f"board {number}", f"on board {number}", variant) for number, variant in enumerate(self.variants, start=2)]
        return [Case("your board", "on your board", replace(self, variants=[])), *boards]

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
        for gate in sorted(self.board.gates):
            goals.append(f"Get past the locked gate on {square_name(gate)}. A guard keeps it shut.")
        if self.variants:
            goals.append(f"Your code is also checked on {count(len(self.variants), 'other board')}.")
        return goals

    def star_goals(self) -> list[str]:
        """What each of the three stars asks for (runner.score awards them)."""
        par = self.par.lines
        within = f"Use {count(par, 'line')} of code or fewer (par)." if par else "There's no par here: solving is enough."
        return ["Solve the level.", within, "Solve it without opening a hint."]

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
            "goal": list(self.goal) if self.goal else None,
            "goal_spots": [list(spot) for spot in self.goal_spots],
            "case_title": self.case_words[0] if self.goal_spots or self.variants else "",
            # Gates appear in `tiles`; their passphrases are deliberately left out.
            "start": {"pos": list(self.start), "facing": self.facing.value, "opened": []},
            "objectives": asdict(self.objectives),
            "api": self.api,
            "constraints": asdict(self.constraints),
            "par": asdict(self.par),
            "starter": self.starter,
            # What the Challenge panel shows, in words: the engine owns every
            # player-facing description of its rules.
            "goals": self.goals(),
            "rules": describe_rules(self.constraints),
            "stars": self.star_goals(),
            # Tiered hints (nudge, concept reminder, partial example); the UI
            # reveals them one at a time, and only when asked.
            "hints": self.hints,
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
    facing = _parse_facing((data.get("start") or {}).get("facing", "north"))

    level = Level(
        id=_text(data, "id"),
        chapter=_int(data, "chapter"),
        title=_text(data, "title"),
        trains=_text(data, "trains"),
        piece=piece,
        board=board,
        start=start,
        facing=facing,
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
    )
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
    details: dict[str, str] = {}  # symbol -> its sign text or gate passphrase
    for symbol, meaning in legend.items():
        symbol = str(symbol)
        if symbol in BUILTIN_SYMBOLS:
            raise LevelError(f"legend can't redefine the built-in symbol {symbol!r}")
        meaning = meaning if isinstance(meaning, dict) else {"tile": meaning}
        try:
            tile = symbols[symbol] = Tile(meaning.get("tile"))
        except ValueError:
            raise LevelError(f"legend {symbol!r}: unknown tile {meaning.get('tile')!r}") from None
        needs = TILE_DETAILS.get(tile)
        unknown = set(meaning) - {"tile"} - ({needs} if needs else set())
        if unknown:
            raise LevelError(f"legend {symbol!r}: a {tile.value} doesn't take {', '.join(sorted(unknown))}")
        if needs:
            if not isinstance(meaning.get(needs), str) or not meaning[needs]:
                raise LevelError(f"legend {symbol!r}: a {tile.value} needs {needs}")
            details[symbol] = meaning[needs]

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
                board.signs[(x, y)] = details[symbol]
            if tile is Tile.GATE:
                board.gates[(x, y)] = details[symbol]
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


@dataclass
class Case:
    """One situation a solution must handle (see Level.cases)."""

    label: str  # "b3" (where a hidden goal is), "your board" or "board 2"
    where: str  # for sentences: "with the goal on b3", "on board 2"
    level: Level  # the level as it is in this case


def sandbox_level(api: list[str], piece: str = "pawn") -> Level:
    """A small open board for trying things out in lesson snippets."""
    board = Board(width=5, height=4)
    return Level(
        id="sandbox",
        chapter=0,
        title="Sandbox",
        trains="",
        piece=piece,
        board=board,
        start=(2, 0),
        facing=Direction.NORTH,
        goal=None,
        objectives=Objectives(reach_goal=False),
        api=list(api),
        constraints=Constraints(),
    )


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
        elif isinstance(item, dict) and set(item) == {"say"} and isinstance(item["say"], str):
            objectives.say.append(item["say"])
        else:
            raise LevelError(f"unknown objective {item!r}")
    return objectives


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
    return board, start, goal, spots


def _parse_variants(items, legend: dict, level: Level) -> list[Level]:
    """Each other map is the level on another board: same legend, objectives and abilities."""
    if not isinstance(items, list):
        raise LevelError("variants must be a list of {map: ...} entries")
    variants = []
    for number, item in enumerate(items, start=1):
        if not isinstance(item, dict) or set(item) != {"map"}:
            raise LevelError(f"variant {number} must have a map, and nothing else")
        try:
            board, start, goal, spots = _parse_board(item["map"], legend, level.objectives)
        except LevelError as exc:
            raise LevelError(f"variant {number}: {exc}") from None
        if spots:
            raise LevelError(f"variant {number}: ? squares are only for the level's own map")
        variants.append(replace(level, board=board, start=start, goal=goal, variants=[]))
    return variants


def _parse_par(data: dict) -> Par:
    if not isinstance(data, dict):
        raise LevelError("par must be a mapping, e.g. {lines: 3}")
    unknown = set(data) - {"lines"}
    if unknown:
        raise LevelError(f"unknown par key(s): {', '.join(sorted(unknown))}")
    lines = data.get("lines")
    if lines is not None and (not isinstance(lines, int) or isinstance(lines, bool) or lines < 1):
        raise LevelError("par lines must be a whole number of at least 1")
    return Par(lines=lines)


def _parse_constraints(data: dict) -> Constraints:
    allowed = {"max_lines", "min_comments", "require_nodes", "ban_nodes"}
    unknown = set(data) - allowed
    if unknown:
        raise LevelError(f"unknown constraint(s): {', '.join(sorted(unknown))}")
    constraints = Constraints(**data)
    for name in constraints.require_nodes + constraints.ban_nodes:
        node_type = getattr(ast, name, None)
        if not (isinstance(node_type, type) and issubclass(node_type, ast.AST)):
            raise LevelError(f"constraint node {name!r} isn't an ast node type")
    return constraints
