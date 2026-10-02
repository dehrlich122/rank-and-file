// M3.7 step 0, round 2 (design prototype, never shipped): vector "VR" sprites.
//
// After The Lawnmower Man and Tron: flat-shaded polygons with a lit wire edge.
// A sprite is data, like the pixel ones: a list of faces in the 64-unit square,
// each face a tone (a CSS custom property, never a hex colour), plus details
// drawn on top (a visor, eyes, cracks). Light comes from the upper left, so a
// symmetric part is split down the middle into a lit face and a shaded face.
const SVG = "http://www.w3.org/2000/svg";

type Pt = [number, number];
type Tone = string; // a CSS custom property, e.g. "--hero-3"

interface Face {
  tone: Tone;
  points: Pt[];
}

interface Line {
  tone: Tone;
  points: Pt[];
  width?: number;
}

export interface VSprite {
  faces: Face[]; // drawn in order, with a dark outline under them all and a wire edge on each
  wire: Tone; // the lit edge on every face
  details?: Face[]; // filled, no wire: visors, eyes, dead pixels
  lines?: Line[]; // strokes: cracks, circuit traces, a shackle
}

const mirror = ([x, y]: Pt): Pt => [64 - x, y];

/**
 * A symmetric part from its left half: points from the top of the centre line,
 * down the left edge, to the bottom of the centre line. The left face takes
 * `lit`, the mirrored right face takes `shade`.
 */
function sym(left: Pt[], lit: Tone, shade: Tone): Face[] {
  return [
    { tone: lit, points: left },
    { tone: shade, points: left.map(mirror).reverse() },
  ];
}

const face = (tone: Tone, points: Pt[]): Face => ({ tone, points });

// -- heroes ------------------------------------------------------------------------------

/** The pawn: an armoured figure with a faceted round helm and a lit visor. */
export const V_PAWN: VSprite = {
  wire: "--hero-4",
  faces: [
    ...sym([[32, 50], [16, 51], [12, 58], [32, 58]], "--hero-2", "--hero-1"), // plinth
    ...sym([[32, 46], [19, 46], [16, 51], [32, 51]], "--hero-3", "--hero-2"), // plinth lip
    ...sym([[32, 30], [24, 30], [17, 35], [19, 46], [32, 46]], "--hero-3", "--hero-2"), // cuirass and pauldrons
    ...sym([[32, 27], [27, 27], [27, 31], [32, 31]], "--hero-2", "--hero-1"), // neck
    ...sym([[32, 5], [25, 6], [20, 11], [20, 23], [25, 28], [32, 28]], "--hero-3", "--hero-2"), // helm
    ...sym([[32, 5], [25, 6], [22, 9], [32, 10]], "--hero-4", "--hero-3"), // helm crown
  ],
  details: [
    face("--hero-v", [[22, 15], [42, 15], [42, 19], [22, 19]]), // visor
    face("--hero-w", [[29, 36], [35, 36], [35, 42], [29, 42]]), // the program's lit core
  ],
};

/** The knight skin: a faceted horse-head helm, facing left, with a lit eye-slit and a crest. */
export const V_KNIGHT: VSprite = {
  wire: "--hero-4",
  faces: [
    face("--hero-2", [[10, 58], [12, 50], [32, 50], [32, 58]]), // plinth
    face("--hero-1", [[32, 50], [52, 50], [54, 58], [32, 58]]),
    face("--hero-3", [[12, 50], [20, 47], [24, 39], [25, 35], [34, 35], [32, 50]]), // throat
    face("--hero-2", [[34, 35], [47, 33], [50, 43], [52, 50], [32, 50]]), // neck
    face("--hero-4", [[9, 27], [11, 22], [22, 12], [30, 8], [30, 24], [22, 34], [12, 32]]), // muzzle and brow
    face("--hero-3", [[30, 8], [34, 4], [40, 10], [46, 15], [48, 24], [47, 33], [25, 35], [22, 34], [30, 24]]), // cheek
    face("--hero-w", [[40, 10], [46, 15], [48, 24], [47, 33], [50, 43], [46, 43], [44, 33], [45, 24], [42, 15]]), // crest
  ],
  details: [
    face("--hero-v", [[18, 19], [27, 16], [27, 20], [18, 23]]), // eye-slit
    face("--px-line", [[11, 27], [14, 26], [14, 29], [11, 29]]), // nostril
  ],
};

// -- enemies: corrupted data ------------------------------------------------------------------

export const V_ROOK: VSprite = {
  wire: "--foe-4",
  faces: [
    ...sym([[32, 46], [17, 47], [13, 52], [12, 58], [32, 58]], "--foe-3", "--foe-2"), // base
    ...sym([[32, 19], [19, 19], [21, 23], [21, 46], [32, 46]], "--foe-3", "--foe-2"), // tower
    ...sym([[32, 8], [28, 8], [28, 13], [24, 13], [24, 8], [16, 8], [16, 19], [32, 19]], "--foe-4", "--foe-3"), // crown
  ],
  details: [
    face("--foe-hot", [[30, 26], [34, 26], [34, 35], [30, 35]]), // a lit arrow-slit: it watches
    face("--foe-eye", [[38, 41], [41, 41], [41, 44], [38, 44]]), // a dead pixel
  ],
  lines: [
    { tone: "--foe-crack", points: [[24, 21], [27, 28], [25, 33], [28, 40]], width: 1.6 },
    { tone: "--foe-crack", points: [[40, 10], [38, 15], [41, 18]], width: 1.6 },
  ],
};

export const V_BISHOP: VSprite = {
  wire: "--foe-4",
  faces: [
    ...sym([[32, 50], [16, 51], [13, 55], [12, 58], [32, 58]], "--foe-3", "--foe-2"), // base
    ...sym([[32, 41], [26, 42], [21, 50], [32, 50]], "--foe-3", "--foe-2"), // body
    ...sym([[32, 36], [24, 37], [24, 41], [32, 41]], "--foe-2", "--foe-1"), // collar
    ...sym([[32, 9], [26, 15], [21, 24], [21, 31], [26, 36], [32, 36]], "--foe-4", "--foe-3"), // mitre
    ...sym([[32, 2], [29, 5], [32, 8]], "--foe-4", "--foe-3"), // finial
  ],
  details: [
    face("--foe-hot", [[34, 14], [37, 16], [30, 28], [27, 26]]), // the mitre's cut, lit
    face("--foe-eye", [[22, 45], [25, 45], [25, 48], [22, 48]]), // a dead pixel
  ],
  lines: [{ tone: "--foe-crack", points: [[38, 22], [36, 27], [39, 31], [37, 35]], width: 1.6 }],
};

/** A patrol or chaser: a faceted virus with two eyes that don't quite agree. */
export const V_BLOB: VSprite = {
  wire: "--foe-4",
  faces: [
    face("--foe-4", [[32, 32], [32, 12], [15, 22]]),
    face("--foe-3", [[32, 32], [15, 22], [15, 42]]),
    face("--foe-2", [[32, 32], [15, 42], [32, 52]]),
    face("--foe-1", [[32, 32], [32, 52], [49, 42]]),
    face("--foe-2", [[32, 32], [49, 42], [49, 22]]),
    face("--foe-3", [[32, 32], [49, 22], [32, 12]]),
    face("--foe-3", [[15, 22], [9, 18], [13, 26]]), // spikes
    face("--foe-2", [[49, 22], [55, 18], [51, 26]]),
    face("--foe-2", [[15, 42], [9, 46], [13, 38]]),
    face("--foe-1", [[49, 42], [55, 46], [51, 38]]),
  ],
  details: [
    face("--foe-eye", [[21, 27], [29, 27], [29, 32], [21, 32]]),
    face("--foe-eye", [[35, 28], [43, 28], [43, 33], [35, 33]]),
    face("--foe-hot", [[26, 38], [30, 38], [30, 41], [26, 41]]),
  ],
  lines: [{ tone: "--foe-crack", points: [[38, 14], [35, 22], [39, 26]], width: 1.6 }],
};

// -- tiles ------------------------------------------------------------------------------------

/** A bevelled block, lit from the upper left. `inset` is the top face's margin. */
function block(x0: number, y0: number, x1: number, y1: number, inset: number, tones: [Tone, Tone, Tone, Tone, Tone]): Face[] {
  const [top, upper, left, right, lower] = tones;
  const [a, b, c, d] = [x0 + inset, y0 + inset, x1 - inset, y1 - inset];
  return [
    face(upper, [[x0, y0], [x1, y0], [c, b], [a, b]]),
    face(left, [[x0, y0], [a, b], [a, d], [x0, y1]]),
    face(right, [[x1, y0], [x1, y1], [c, d], [c, b]]),
    face(lower, [[x0, y1], [a, d], [c, d], [x1, y1]]),
    face(top, [[a, b], [c, b], [c, d], [a, d]]),
  ];
}

export const V_WALL: VSprite = {
  wire: "--str-3",
  faces: block(2, 2, 62, 62, 7, ["--str-1", "--str-3", "--str-2", "--str-1", "--str-1"]),
  lines: [
    { tone: "--str-3", points: [[13, 20], [30, 20], [36, 26], [51, 26]], width: 1.5 },
    { tone: "--str-3", points: [[13, 40], [24, 40], [30, 34], [42, 34], [42, 50]], width: 1.5 },
  ],
  details: [face("--str-4", [[48, 23], [54, 23], [54, 29], [48, 29]]), face("--str-4", [[39, 48], [45, 48], [45, 53], [39, 53]])],
};

/** A signpost: a screen on a post, with green lines of text. */
export const V_SIGN: VSprite = {
  wire: "--amb-4",
  faces: [
    face("--amb-2", [[29, 36], [32, 36], [32, 58], [29, 58]]),
    face("--amb-1", [[32, 36], [35, 36], [35, 58], [32, 58]]),
    ...block(7, 9, 57, 38, 4, ["--str-1", "--amb-3", "--amb-2", "--amb-1", "--amb-1"]),
  ],
  details: [face("--grn-3", [[15, 17], [47, 17], [47, 21], [15, 21]]), face("--grn-3", [[15, 26], [37, 26], [37, 30], [15, 30]])],
};

/** A rune: a dark tablet on the floor with a lit prompt, `>_`. */
export const V_RUNE: VSprite = {
  wire: "--grn-3",
  faces: block(8, 13, 56, 51, 5, ["--str-1", "--str-4", "--str-3", "--str-2", "--str-2"]),
  lines: [{ tone: "--grn-3", points: [[19, 23], [28, 32], [19, 41]], width: 4 }],
  details: [face("--grn-3", [[32, 38], [45, 38], [45, 42], [32, 42]])],
};

const GATE_FRAME = block(3, 3, 61, 61, 5, ["--str-1", "--amb-3", "--amb-2", "--amb-1", "--amb-1"]);
const bars = (top: number, bottom: number): Face[] =>
  [14, 24, 34, 44].flatMap((x) => [face("--amb-3", [[x, top], [x + 3, top], [x + 3, bottom], [x, bottom]]), face("--amb-1", [[x + 3, top], [x + 6, top], [x + 6, bottom], [x + 3, bottom]])]);

/** A guarded gate: bars and a padlock. */
export const V_GATE: VSprite = {
  wire: "--amb-4",
  faces: [...GATE_FRAME, ...bars(8, 56), face("--amb-4", [[23, 31], [41, 31], [41, 46], [23, 46]]), face("--amb-2", [[32, 31], [41, 31], [41, 46], [32, 46]])],
  lines: [{ tone: "--amb-4", points: [[26, 31], [26, 25], [29, 22], [35, 22], [38, 25], [38, 31]], width: 3 }],
  details: [face("--px-line", [[30, 36], [34, 36], [34, 42], [30, 42]])],
};

/** A timed gate: the same bars, no padlock, and a tick-mark dial on the lintel. */
export const V_GATE_TIMED: VSprite = {
  wire: "--amb-4",
  faces: [...GATE_FRAME, ...bars(8, 56)],
  details: [12, 22, 32, 42, 50].map((x) => face("--amb-4", [[x, 4], [x + 2, 4], [x + 2, 7], [x, 7]])),
};

/** An open gate: the bars drawn up into the lintel. */
export const V_GATE_OPEN: VSprite = {
  wire: "--amb-4",
  faces: [...GATE_FRAME, ...bars(8, 14)],
};

/** A pit: a lit rim around a wireframe funnel falling away into the dark. */
export const V_PIT: VSprite = {
  wire: "--str-4",
  faces: [
    face("--str-3", [[14, 6], [50, 6], [58, 14], [58, 50], [50, 58], [14, 58], [6, 50], [6, 14]]),
    face("--px-void", [[17, 11], [47, 11], [53, 17], [53, 47], [47, 53], [17, 53], [11, 47], [11, 17]]),
    face("--px-void", [[22, 18], [42, 18], [46, 22], [46, 42], [42, 46], [22, 46], [18, 42], [18, 22]]),
    face("--px-void", [[26, 24], [38, 24], [40, 26], [40, 38], [38, 40], [26, 40], [24, 38], [24, 26]]),
  ],
  lines: [
    { tone: "--str-4", points: [[17, 11], [26, 24]], width: 1.2 },
    { tone: "--str-4", points: [[47, 11], [38, 24]], width: 1.2 },
    { tone: "--str-4", points: [[47, 53], [38, 40]], width: 1.2 },
    { tone: "--str-4", points: [[17, 53], [26, 40]], width: 1.2 },
  ],
};

export const V_PLANK: VSprite = {
  wire: "--amb-4",
  faces: block(6, 24, 58, 40, 4, ["--amb-3", "--amb-4", "--amb-2", "--amb-1", "--amb-1"]),
  lines: [{ tone: "--amb-2", points: [[14, 32], [50, 32]], width: 1.5 }],
};

/** A waypoint: a diamond, so it can't be mistaken for the goal's ring or a hidden-goal spot. */
export const V_WAYPOINT: VSprite = {
  wire: "--amb-4",
  faces: [
    face("--amb-3", [[32, 7], [57, 32], [50, 32], [32, 14]]),
    face("--amb-3", [[32, 7], [32, 14], [14, 32], [7, 32]]),
    face("--amb-1", [[57, 32], [32, 57], [32, 50], [50, 32]]),
    face("--amb-2", [[7, 32], [14, 32], [32, 50], [32, 57]]),
  ],
};

export const V_WAYPOINT_DONE: VSprite = {
  wire: "--grn-4",
  faces: [face("--grn-3", [[32, 7], [57, 32], [32, 57], [7, 32]]), face("--grn-2", [[32, 32], [57, 32], [32, 57]])],
  lines: [{ tone: "--px-line", points: [[21, 32], [29, 40], [43, 24]], width: 5 }],
};

/** A gem: a faceted octahedron. */
export const V_GEM: VSprite = {
  wire: "--amb-4",
  faces: [
    face("--amb-4", [[32, 12], [32, 27], [17, 27]]),
    face("--amb-3", [[32, 12], [47, 27], [32, 27]]),
    face("--amb-3", [[17, 27], [32, 27], [32, 54]]),
    face("--amb-2", [[32, 27], [47, 27], [32, 54]]),
  ],
};

/** The goal's flag (its dashed ring is drawn by the board). */
export const V_FLAG: VSprite = {
  wire: "--amb-4",
  faces: [
    face("--amb-3", [[20, 12], [23, 12], [23, 54], [20, 54]]),
    face("--amb-1", [[23, 12], [25, 12], [25, 54], [23, 54]]),
    face("--amb-4", [[25, 12], [46, 19], [25, 26]]),
    face("--amb-2", [[25, 19], [46, 19], [25, 26]]),
    face("--amb-2", [[15, 54], [30, 54], [30, 58], [15, 58]]),
  ],
};

/** The chapter's victory symbol: a faceted crown. */
export const V_CROWN: VSprite = {
  wire: "--amb-4",
  faces: [
    face("--amb-3", [[8, 22], [20, 34], [32, 14], [44, 34], [56, 22], [52, 48], [12, 48]]),
    face("--amb-2", [[32, 14], [44, 34], [56, 22], [52, 48], [32, 48]]),
    face("--amb-1", [[12, 48], [52, 48], [52, 54], [12, 54]]),
  ],
};

/** The mastery state of the same crown: a lit jewel and two sparks. */
export const V_CROWN_MASTER: VSprite = {
  ...V_CROWN,
  details: [
    face("--grn-3", [[28, 36], [36, 36], [36, 43], [28, 43]]),
    face("--hero-4", [[4, 6], [8, 6], [8, 10], [4, 10]]),
    face("--hero-4", [[56, 4], [60, 4], [60, 8], [56, 8]]),
  ],
};

// -- drawing ------------------------------------------------------------------------------------

export interface VDrawOptions {
  flat?: string; // the silhouette only, in this CSS colour: for glitch copies and title-screen silhouettes
  dx?: number; // shift, in SVG units
  dy?: number;
  band?: [number, number]; // only the part between these y values: for the glitch's slice and the idle's head
}

let clipCount = 0;

const pts = (points: Pt[]) => points.map(([x, y]) => `${x},${y}`).join(" ");

/** A vector sprite as SVG, in its 64-unit square. */
export function drawVector(sprite: VSprite, options: VDrawOptions = {}): SVGGElement {
  const group = document.createElementNS(SVG, "g");
  group.setAttribute("class", "vx");
  if (options.dx || options.dy) group.setAttribute("transform", `translate(${options.dx ?? 0} ${options.dy ?? 0})`);
  const target = document.createElementNS(SVG, "g");
  if (options.band) {
    const id = `vband-${++clipCount}`;
    const clip = document.createElementNS(SVG, "clipPath");
    clip.setAttribute("id", id);
    const rect = document.createElementNS(SVG, "rect");
    rect.setAttribute("x", "-8");
    rect.setAttribute("y", String(options.band[0]));
    rect.setAttribute("width", "80");
    rect.setAttribute("height", String(options.band[1] - options.band[0]));
    clip.append(rect);
    group.append(clip);
    target.setAttribute("clip-path", `url(#${id})`);
  }
  group.append(target);
  const polygon = (points: Pt[], attrs: Record<string, string>) => {
    const node = document.createElementNS(SVG, "polygon");
    node.setAttribute("points", pts(points));
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    return node;
  };
  if (options.flat) {
    for (const f of sprite.faces) target.append(polygon(f.points, { fill: options.flat, stroke: options.flat, "stroke-width": "2", "stroke-linejoin": "round" }));
    return group;
  }
  // 1. a dark outline under everything, so the sprite stands off both squares
  for (const f of sprite.faces) target.append(polygon(f.points, { fill: "var(--px-line)", stroke: "var(--px-line)", "stroke-width": "4.5", "stroke-linejoin": "round" }));
  // 2. the faces, each with its lit wire edge
  const faces = document.createElementNS(SVG, "g");
  faces.setAttribute("class", "vx-faces");
  for (const f of sprite.faces) {
    faces.append(polygon(f.points, { fill: `var(${f.tone})`, stroke: `var(${sprite.wire})`, "stroke-width": "1.1", "stroke-linejoin": "round", "stroke-opacity": "0.75" }));
  }
  target.append(faces);
  for (const line of sprite.lines ?? []) {
    const node = document.createElementNS(SVG, "polyline");
    node.setAttribute("points", pts(line.points));
    node.setAttribute("fill", "none");
    node.setAttribute("stroke", `var(${line.tone})`);
    node.setAttribute("stroke-width", String(line.width ?? 2));
    node.setAttribute("stroke-linecap", "square");
    node.setAttribute("stroke-linejoin", "miter");
    target.append(node);
  }
  for (const f of sprite.details ?? []) target.append(polygon(f.points, { fill: `var(${f.tone})` }));
  return group;
}
