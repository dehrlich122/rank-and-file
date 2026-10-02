// The board's floor: the lit grid and the halftone on threatened squares (M3.7).
import { svg } from "./svg";

export const S = 64; // size of one square, in SVG units
export const M = 22; // margin for the file letters and rank numbers

/** The lit grid: thin lines between squares, a tick where they cross, a faint glow on the outer edge only. */
export function litGrid(width: number, height: number): SVGElement {
  let lines = "";
  let ticks = "";
  for (let x = 1; x < width; x++) lines += `M ${M + x * S} 0 V ${height * S} `;
  for (let y = 1; y < height; y++) lines += `M ${M} ${y * S} H ${M + width * S} `;
  for (let x = 0; x <= width; x++) for (let y = 0; y <= height; y++) ticks += `M ${M + x * S - 4} ${y * S} h 8 M ${M + x * S} ${y * S - 4} v 8 `;
  return svg("g", { class: "litgrid", "aria-hidden": "true" }, svg("path", { d: lines, class: "grid-lines" }), svg("path", { d: ticks, class: "grid-ticks" }), svg("rect", { x: M, y: 0, width: width * S, height: height * S, class: "grid-edge" }));
}

let boards = 0;

/** Below this many pixels a square, the coarser halftone takes over, so a dot stays about 1.5px or more. */
const COARSE_BELOW = 32;

/**
 * The halftone for threatened squares, sized in squares so it scales with the board: about
 * six dots across a square, or four bigger ones when the board is drawn small. It adds its
 * two patterns to `board`, and keeps `--halftone` on it pointing at the one that fits the
 * size the board is drawn at, now and whenever that changes. Returns what to call to stop watching.
 */
export function halftone(board: SVGSVGElement): () => void {
  const id = ++boards;
  const [fine, coarse] = [`ht-fine-${id}`, `ht-coarse-${id}`];
  const pattern = (name: string, step: number, r: number) =>
    svg("pattern", { id: name, patternUnits: "userSpaceOnUse", width: step, height: step, patternTransform: "rotate(45)" }, svg("circle", { cx: step / 2, cy: step / 2, r, class: "ht-dot" }));
  board.prepend(svg("defs", {}, pattern(fine, S / 6, 1.7), pattern(coarse, S / 4, 3)));
  board.style.setProperty("--halftone", `url(#${fine})`);
  if (typeof ResizeObserver === "undefined") return () => {};
  const watch = new ResizeObserver(() => {
    const pixelsPerSquare = (board.getBoundingClientRect().width / board.viewBox.baseVal.width) * S;
    board.style.setProperty("--halftone", `url(#${pixelsPerSquare < COARSE_BELOW ? coarse : fine})`);
  });
  watch.observe(board);
  return () => watch.disconnect();
}
