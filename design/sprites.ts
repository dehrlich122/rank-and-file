// M3.7 step 0 (design prototype, never shipped): sprites as data.
//
// A sprite is 16 rows of up to 16 characters, one character per pixel, drawn at
// 4 SVG units a pixel so it fills one 64-unit board square. `.` is empty and
// `o` is the 1px dark outline (`autoOutline` adds it around bodies that
// don't draw their own). Every other character names a tone in `pal`, and each
// tone is a CSS custom property, never a hex colour, so both themes and the
// contrast check work.
//
// Three render modes turn the same grid into three looks:
//   full  the 3-4 tone SNES-style sprite
//   neon  a lit outline, with every tone but the accents knocked back to a dark fill
//   mono  two tones plus accents, with every other pixel row dimmed (phosphor)
const SVG = "http://www.w3.org/2000/svg";
const PX = 4;
const SIZE = 16;

export type Mode = "full" | "neon" | "mono";

export interface Sprite {
  rows: string[];
  pal: Record<string, string>; // character -> CSS custom property
  lit: string; // the property a neon outline is drawn in
  keep?: string; // characters that stay bright in neon and mono (default: accents)
}

// -- palettes -----------------------------------------------------------------

const HERO = { o: "--px-line", 1: "--hero-1", 2: "--hero-2", 3: "--hero-3", 4: "--hero-4", v: "--hero-v", x: "--hero-w" };
const FOE = { o: "--px-line", 1: "--foe-1", 2: "--foe-2", 3: "--foe-3", 4: "--foe-4", v: "--foe-eye", k: "--foe-crack", d: "--foe-hot", x: "--foe-hot" };
const STR = { o: "--px-line", 1: "--str-1", 2: "--str-2", 3: "--str-3", 4: "--str-4", x: "--str-4" };
const AMB = { o: "--px-line", 1: "--amb-1", 2: "--amb-2", 3: "--amb-3", 4: "--amb-4", x: "--px-line" };
const GRN = { o: "--px-line", 1: "--grn-1", 2: "--grn-2", 3: "--grn-3", 4: "--grn-4", x: "--grn-4" };

/** Every row that didn't fit, so one run lists them all. */
export const problems: string[] = [];

/** Pad each row to 16 columns (so rows only need their left side counted) and check the size. */
function grid(rows: string[]): string[] {
  if (rows.length > SIZE) problems.push(`sprite has ${rows.length} rows`);
  const padded = rows.slice(0, SIZE).map((row, y) => {
    if (row.length > SIZE) problems.push(`row ${y} is ${row.length} wide: ${row}`);
    return row.slice(0, SIZE).padEnd(SIZE, ".");
  });
  while (padded.length < SIZE) padded.push(".".repeat(SIZE));
  return padded;
}

/** Add the dark outline around every body pixel that doesn't have one yet. */
function autoOutline(rows: string[]): string[] {
  const at = (x: number, y: number) => rows[y]?.[x] ?? ".";
  return rows.map((row, y) =>
    [...row]
      .map((c, x) => {
        if (c !== ".") return c;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const n = at(x + dx, y + dy);
            if (n !== "." && n !== "o") return "o";
          }
        }
        return ".";
      })
      .join(""),
  );
}

/** Swap tones in a grid: enemy bodies are the mid magenta, with a bright left rim and dark shade. */
const remap = (rows: string[]): string[] => rows.map((row) => [...row].map((c) => ({ 4: "3", 3: "4" } as Record<string, string>)[c] ?? c).join(""));

const make = (rows: string[], pal: Record<string, string>, lit: string, keep?: string, outline = false): Sprite => ({
  rows: grid(outline ? autoOutline(grid(rows)) : rows),
  pal,
  lit,
  keep,
});

// -- heroes: small armoured figures, each readable as its chess piece ---------------

/** The pawn: a round-helmed knight-errant with a lit visor. */
export const PAWN = make(
  [
    ".....443332",
    "....44433332",
    "...4433333322",
    "...4433333322",
    "...43vvvvvv22",
    "...43vvvvvv22",
    "...4333333222",
    "....33333222",
    "......2321",
    "...332xxxx211",
    "...332xxxx211",
    "...3322222211",
    "..433222222211",
    ".43333322222111",
  ],
  HERO,
  "--hero-3",
  undefined,
  true,
);

/** The knight skin: a horse-head helm, facing left, with a lit eye-slit and a crest. */
export const KNIGHT = make(
  [
    "......44.43",
    ".....444333x",
    "....4443333xx",
    "..443vv3332xx",
    ".4433333322xx",
    ".433333322xx",
    "..43333322x",
    ".....333222x",
    "......43322xx",
    "......3332211",
    ".....33332211",
    "....4333322211",
    "..433333222211",
    "..222222111111",
  ],
  HERO,
  "--hero-3",
  undefined,
  true,
);

// -- enemies: corrupted data -----------------------------------------------------

export const ROOK = make(
  remap([
    "..44...44...43",
    "..32...32...21",
    "..344444444421",
    "....3444444 21",
    "....34kk4421",
    "....3444k421",
    "....34d4kd21",
    "....3444421",
    "...33444 4221",
    "..3344444 4422",
    ".33333222222 22",
  ]).map((r) => r.replaceAll(" ", "")),
  FOE,
  "--foe-4",
  "vdxk",
  true,
);

export const BISHOP = make(
  remap([
    ".......43",
    "......3443",
    ".....344443",
    ".....34k443",
    "....344k4432",
    "....34k44432",
    "....3444 4432",
    ".....34444 32",
    "......3443",
    ".....344432",
    "....3344 4422",
    "...333222222 2",
  ]).map((r) => r.replaceAll(" ", "")),
  FOE,
  "--foe-4",
  "vdxk",
  true,
);

/** A patrol or chaser: a round body with two eyes that don't quite agree. */
export const BLOB = make(
  remap([
    "......444444",
    "....34444444 2",
    "...3444444444 2",
    "..34444444444 42",
    "..344vv44vv442",
    "..344vv44vv442",
    "..3444444k4442",
    "..34444k44 4442",
    "...3444dk44 42",
    "....3444k4 42",
    ".....3322222",
  ]).map((r) => r.replaceAll(" ", "")),
  FOE,
  "--foe-4",
  "vdxk",
  true,
);

// -- tiles ------------------------------------------------------------------------

export const WALL = make(
  [
    "oooooooooooooooo",
    "o43333244333332o",
    "o43333244333332o",
    "o43333244333332o",
    "o11111111111111o",
    "o33244333332433o",
    "o33244333332433o",
    "o33244333332433o",
    "o11111111111111o",
    "o43333244333332o",
    "o43333244333332o",
    "o43333244333332o",
    "o11111111111111o",
    "o33244333332433o",
    "o33244333332433o",
    "oooooooooooooooo",
  ],
  STR,
  "--str-4",
);

/** Circuit-trace wall (terminal): dark board, bright traces, a chip and vias. */
export const WALL_CIRCUIT = make(
  [
    "oooooooooooooooo",
    "o11111111111111o",
    "o14333333331111o",
    "o11111111131111o",
    "o11111111131111o",
    "o11222222234111o",
    "o11211111111111o",
    "o14411133333331o",
    "o11111132222241o",
    "o13333332111111o",
    "o11111111111111o",
    "o11433333333341o",
    "o11111111111111o",
    "o11111114111111o",
    "o11111111111111o",
    "oooooooooooooooo",
  ],
  STR,
  "--str-4",
);

export const SIGN = make(
  [
    "",
    "",
    "..3333333333 33",
    "..3nnnnnnnnnn32",
    "..3nggggggggn32",
    "..3nnnnnnnnnn32",
    "..3ngggggn nn32",
    "..3nnnnnnnnnn32",
    "..2222222222 22",
    ".......33",
    ".......23",
    ".......23",
    ".......23",
    "......2222",
  ].map((r) => r.replaceAll(" ", "")),
  { o: "--px-line", 1: "--amb-1", 2: "--amb-2", 3: "--amb-3", 4: "--amb-4", n: "--str-1", g: "--grn-3" },
  "--grn-3",
  "g",
  true,
);

export const RUNE = make(
  [
    "",
    "",
    "...oooooooooo",
    "..o3444444442o",
    ".o34nngggnnn22o",
    ".o34nngnnngn22o",
    ".o34nngggnnn22o",
    ".o34nngnngnn22o",
    ".o34nngnnngn22o",
    ".o34nnnnnnnn22o",
    "..o2222222222o",
    "...oooooooooo",
  ],
  { o: "--px-line", 1: "--str-1", 2: "--str-2", 3: "--str-3", 4: "--str-4", n: "--str-1", g: "--grn-3" },
  "--grn-3",
  "g",
);

/** A rune that is a terminal prompt: `>_` on a dark screen (terminal). */
export const RUNE_PROMPT = make(
  [
    "",
    "",
    "...oooooooooo",
    "..o3444444442o",
    ".o34nnnnnnnn22o",
    ".o34ngnnnnnn22o",
    ".o34nngnnnnn22o",
    ".o34ngnnnnnn22o",
    ".o34nnnngggn22o",
    ".o34nnnnnnnn22o",
    "..o2222222222o",
    "...oooooooooo",
  ],
  { o: "--px-line", 1: "--str-1", 2: "--str-2", 3: "--str-3", 4: "--str-4", n: "--str-1", g: "--grn-3" },
  "--grn-3",
  "g",
);

/** A barred gate. `p` is the padlock, which a timed gate doesn't have. */
const GATE_ROWS = [
  "oooooooooooooooo",
  "o44444444444444o",
  "o3nn22nn22nn223o",
  "o3nn22nn22nn223o",
  "o32222222222223o",
  "o3nn22nppnnn223o",
  "o3nn22pnnpnn223o",
  "o3nn22ppppnn223o",
  "o3nn22pxxpnn223o",
  "o3nn22ppppnn223o",
  "o3nn22nn22nn223o",
  "o32222222222223o",
  "o3nn22nn22nn223o",
  "o2333333333333 2o",
  "o1111111111111 1o",
  "oooooooooooooooo",
].map((r) => r.replaceAll(" ", ""));
const GATE_PAL = { o: "--px-line", 1: "--amb-1", 2: "--amb-2", 3: "--amb-3", 4: "--amb-4", n: "--str-1", p: "--amb-4", x: "--px-line" };
export const GATE = make(GATE_ROWS, GATE_PAL, "--amb-3", "p");
/** A timed gate: the same bars with no padlock. */
export const GATE_TIMED = make(
  GATE_ROWS.map((r) => r.replaceAll("p", "n").replaceAll("x", "n")),
  GATE_PAL,
  "--amb-3",
);
/** An open gate: the bars lifted into the lintel. */
export const GATE_OPEN = make(
  [
    "oooooooooooooooo",
    "o44444444444444o",
    "o3n2n2n2n2n2n23o",
    "o3nnnnnnnnnnnn3o",
    "o3nnnnnnnnnnnn3o",
    "o3nnnnnnnnnnnn3o",
    "o3nnnnnnnnnnnn3o",
    "o3nnnnnnnnnnnn3o",
    "o3nnnnnnnnnnnn3o",
    "o3nnnnnnnnnnnn3o",
    "o3nnnnnnnnnnnn3o",
    "o3nnnnnnnnnnnn3o",
    "o3nnnnnnnnnnnn3o",
    "o2333333333333 2o".replaceAll(" ", ""),
    "o1111111111111 1o".replaceAll(" ", ""),
    "oooooooooooooooo",
  ],
  GATE_PAL,
  "--amb-3",
);

export const PIT = make(
  [
    "",
    "",
    "....oooooooo",
    "..oo33333333oo",
    ".o3322222222 33o",
    ".o3211111111 12o",
    "o321111111111 12o",
    "o321111111111 12o",
    "o321111111111 12o",
    "o321111111111 12o",
    ".o3211111111 12o",
    ".oo32222222 22oo",
    "...oo222222oo",
    ".....oooooo",
  ].map((r) => r.replaceAll(" ", "")),
  { o: "--px-line", 1: "--px-void", 2: "--str-2", 3: "--str-4", 4: "--str-4" },
  "--str-4",
);

export const PLANK = make(
  [
    "",
    "",
    "",
    "",
    "oooooooooooooooo",
    "o44444444444444o",
    "o3333 3333333 33o",
    "o3322 3333332 23o",
    "o2222222222222 2o",
    "o1111111111111 1o",
    "oooooooooooooooo",
  ].map((r) => r.replaceAll(" ", "")),
  AMB,
  "--amb-3",
);

export const WAYPOINT = make(
  [
    "",
    ".....oooooo",
    "...oo333333oo",
    "..o33oooooo33o",
    "..o3o......o3o",
    ".o33o......o33o",
    ".o3o........o3o",
    ".o3o........o3o",
    ".o3o........o3o",
    ".o33o......o33o",
    "..o3o......o3o",
    "..o33oooooo33o",
    "...oo333333oo",
    ".....oooooo",
  ],
  AMB,
  "--amb-3",
);

export const WAYPOINT_DONE = make(
  [
    "",
    ".....oooooo",
    "...oo333333oo",
    "..o33oooooo33o",
    "..o3o......o3o",
    ".o33o....oo.o33o",
    ".o3o....o33o.o3o",
    ".o3o.o.o33o..o3o",
    ".o3o.o33o33o.o3o",
    ".o33o.o33o..o33o",
    "..o3o..oo...o3o",
    "..o33oooooo33o",
    "...oo333333oo",
    ".....oooooo",
  ].map((r) => r.replaceAll(".o33o.o33o..o33o", ".o33o.o33o..o33o")),
  { ...GRN, 3: "--grn-3", 4: "--grn-4" },
  "--grn-3",
);

/** A waypoint as a diamond (round 2), so it can't be mistaken for the goal's ring or a hidden-goal spot. */
export const WAYPOINT_DIAMOND = make(
  [
    "",
    ".......44",
    "......4334",
    ".....43..34",
    "....43....34",
    "...43......34",
    "..43........34",
    ".43..........34",
    ".23..........32",
    "..23........32",
    "...23......32",
    "....23....32",
    ".....23..32",
    "......2332",
    ".......22",
  ],
  AMB,
  "--amb-3",
  undefined,
  true,
);

export const WAYPOINT_DIAMOND_DONE = make(
  [
    "",
    ".......44",
    "......4334",
    ".....433334",
    "....43333334",
    "...4333333o34",
    "..433333oo3334",
    ".43o333oo333334",
    ".23oo3oo333332",
    "..23ooo333332",
    "...23o333332",
    "....233333 32",
    ".....233332",
    "......2332",
    ".......22",
  ].map((r) => r.replaceAll(" ", "")),
  GRN,
  "--grn-3",
  undefined,
  true,
);

export const GEM = make(
  [
    "",
    "",
    "",
    "",
    ".....444443",
    "...4343443432",
    "..222222222222",
    "...3433433432",
    "....33433432",
    ".....343342",
    "......3332",
    ".......32",
  ],
  AMB,
  "--amb-4",
  "4",
  true,
);

export const FLAG = make(
  [
    "",
    "",
    "....o",
    "....o4444o",
    "....o34444 4o",
    "....o3444 4o",
    "....o344o",
    "....o3o",
    "....o3o",
    "....o3o",
    "....o3o",
    "....o3o",
    "....o3o",
    "...ooooo",
  ].map((r) => r.replaceAll(" ", "")),
  AMB,
  "--amb-3",
  undefined,
  true,
);

/** The chapter's victory symbol: a pixel crown. */
export const CROWN = make(
  [
    "",
    "",
    "",
    "..4....44....4",
    "..44..4444..44",
    "..444444444444",
    "..433443344334",
    "..322222222222",
    "..211111111111",
    "..44444444444 4",
  ].map((r) => r.replaceAll(" ", "")),
  AMB,
  "--amb-3",
  "4",
  true,
);

/** The mastery state of the same crown: a lit jewel and sparkles. */
export const CROWN_MASTER = make(
  [
    ".w.........w",
    "..4....44....4",
    "..44..4444..44",
    "..444444444444",
    "..433443344334",
    "..32gg22gg2222",
    "..211111111111",
    "..444444444444",
  ].map((r) => r.replaceAll(" ", "")),
  { ...AMB, w: "--hero-4", g: "--grn-3" },
  "--amb-3",
  "wg4",
  true,
);

// -- drawing ----------------------------------------------------------------------

export interface DrawOptions {
  flat?: string; // draw only the silhouette, in this colour (a CSS value): for the glitch layers
  rows?: [number, number]; // only these rows (inclusive): for the glitch's slice offset and the idle's head
  dx?: number; // shift in sprite pixels
  dy?: number;
}

/** A sprite as SVG: one rect per horizontal run of one tone, filled from CSS tokens. */
export function draw(sprite: Sprite, mode: Mode, options: DrawOptions = {}): SVGGElement {
  const group = document.createElementNS(SVG, "g");
  group.setAttribute("class", `px px-${mode}`);
  group.setAttribute("shape-rendering", "crispEdges");
  if (options.dx || options.dy) group.setAttribute("transform", `translate(${(options.dx ?? 0) * PX} ${(options.dy ?? 0) * PX})`);
  const keep = sprite.keep ?? "vdwxk";
  const [from, to] = options.rows ?? [0, SIZE - 1];
  for (let y = from; y <= to; y++) {
    const row = sprite.rows[y] ?? "";
    for (let x = 0; x < SIZE; ) {
      const c = row[x] ?? ".";
      if (c === ".") {
        x++;
        continue;
      }
      let end = x;
      while (row[end + 1] === c) end++;
      const token = sprite.pal[c];
      if (!token) throw new Error(`no tone for "${c}"`);
      const rect = document.createElementNS(SVG, "rect");
      rect.setAttribute("x", String(x * PX));
      rect.setAttribute("y", String(y * PX));
      rect.setAttribute("width", String((end - x + 1) * PX));
      rect.setAttribute("height", String(PX));
      rect.setAttribute("fill", options.flat ?? fill(sprite, mode, c, token, keep));
      if (mode === "mono" && !options.flat && y % 2 === 1) rect.setAttribute("opacity", "0.78");
      group.append(rect);
      x = end + 1;
    }
  }
  return group;
}

function fill(sprite: Sprite, mode: Mode, c: string, token: string, keep: string): string {
  if (mode === "full" || keep.includes(c)) return `var(${token})`;
  if (mode === "neon") {
    return c === "o" ? `var(${sprite.lit})` : `color-mix(in srgb, var(${token}) 40%, var(--px-void))`;
  }
  // mono: the dark tones share one colour and the light tones another
  if (c === "o") return `var(${token})`;
  return `var(${sprite.pal[c === "1" || c === "2" ? "2" : "4"] ?? token})`;
}

/** A sprite centred on (0, 0), like the piece and the enemies. */
export function centred(group: SVGGElement): SVGGElement {
  const wrap = document.createElementNS(SVG, "g");
  wrap.setAttribute("transform", `translate(${-(SIZE * PX) / 2} ${-(SIZE * PX) / 2})`);
  wrap.append(group);
  return wrap;
}
