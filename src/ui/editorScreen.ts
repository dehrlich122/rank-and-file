// The level editor (M4.2): `#/editor/<id>`. Palette on the left, the real board in the middle, properties on the
// right. The board is drawn from the draft straight away; the engine decides whether the draft is a level
// (editor/checker.ts), and its problems are marked where they belong. Keyboard first: one tab stop on the board,
// arrow keys move a cursor, Enter paints, and the status line says where you are.
import { Checker, type Verdict } from "../editor/checker";
import { draftToLevelInfo, squareName, type Draft } from "../editor/draft";
import { drafts } from "../editor/drafts";
import { enemyAt, erase, extendRoute, fill, moveEnemy, occupantOf, paint, placeEnemy, placeGoal, placeStart, resize, rotateStart, toggleSpot, type Edit } from "../editor/edit";
import { History } from "../editor/history";
import type { Problem } from "../editor/problems";
import type { PyClient } from "../py/client";
import type { EditorOptions, Enemy, LevelInfo, Pos, TileKind } from "../py/protocol";
import { sound } from "../sound";
import { BoardView } from "./board";
import { confirmStep } from "./dialog";
import { h } from "./dom";
import { renderProps, type Selection, type Tab } from "./editorProps";
import { ENEMY_SPRITE, enemy as enemySprite, goal as goalSprite, hero, TILE_SPRITE, tile as tileSprite } from "./sprites";
import { M, S } from "./sprites/floor";
import { svg } from "./svg";
import { wornPiece } from "../promotion";

let cachedOptions: EditorOptions | null = null;

// -- tools ----------------------------------------------------------------------------------------------------------

type Action =
  | { kind: "select" }
  | { kind: "erase" }
  | { kind: "tile"; tile: TileKind }
  | { kind: "start" }
  | { kind: "goal" }
  | { kind: "spot" }
  | { kind: "enemy"; enemy: Enemy["kind"] }
  | { kind: "route" };

interface Tool {
  id: string;
  label: string;
  hint: string;
  group: string;
  action: Action;
  art: () => SVGElement;
}

const HINTS: Record<string, string> = {
  wall: "Blocks the way",
  sign: "Blocks the way, and says something",
  rune: "Floor with words on it, read by the pawn",
  gate: "A guard: it asks, and opens for the right answer",
  timed_gate: "Opens and shuts on a clock",
  pit: "Stepping in loses the run",
  plank: "Picked up, then laid over a pit",
  waypoint: "Must be crossed",
  gem: "Collected by walking over it",
  patrol: "Walks a route, or stands guard",
  chaser: "Steps toward the pawn",
  rook: "Stands still and attacks along its rank and file",
  bishop: "Stands still and attacks along its diagonals",
};
const title = (text: string) => text.replace("_", " ").replace(/^./, (c) => c.toUpperCase());
const glyph = (text: string) => (): SVGElement => svg("text", { x: 0, y: 12, "text-anchor": "middle", class: "pal-glyph" }, text) as unknown as SVGElement;

/** The palette: the sprite registry's tiles and enemies (a new one appears here by being added there), and the rest. */
function buildTools(options: EditorOptions): Tool[] {
  const tiles = (Object.keys(TILE_SPRITE) as Array<keyof typeof TILE_SPRITE>).map((kind): Tool => ({
    id: kind,
    label: title(kind),
    hint: HINTS[kind] ?? "",
    group: (options.tiles[kind]?.needs.length ?? 0) > 0 ? "Words" : "Ground",
    action: { kind: "tile", tile: kind },
    art: () => tileSprite(TILE_SPRITE[kind]),
  }));
  const enemies = (Object.keys(ENEMY_SPRITE) as Array<Enemy["kind"]>).map((kind): Tool => ({
    id: kind,
    label: title(kind),
    hint: HINTS[kind] ?? "",
    group: "Enemies",
    action: { kind: "enemy", enemy: kind },
    art: () => enemySprite(ENEMY_SPRITE[kind], "rest"),
  }));
  return [
    { id: "select", label: "Select", hint: "Pick a square or an enemy to change it; drag the start, goal or an enemy to move it", group: "Tools", action: { kind: "select" }, art: glyph("↖") },
    { id: "erase", label: "Erase", hint: "Takes away what's on a square", group: "Tools", action: { kind: "erase" }, art: glyph("✕") },
    ...tiles.filter((tool) => tool.group === "Ground"),
    ...tiles.filter((tool) => tool.group === "Words"),
    { id: "start", label: "Start", hint: "Where the pawn begins (R turns it)", group: "Start and goal", action: { kind: "start" }, art: () => hero(wornPiece(), "north") },
    { id: "goal", label: "Goal", hint: "Where the run must end", group: "Start and goal", action: { kind: "goal" }, art: () => goalSprite() },
    { id: "spot", label: "Hidden goal", hint: "Squares the goal might be on: the code must work whichever it is", group: "Start and goal", action: { kind: "spot" }, art: glyph("?") },
    ...enemies,
    { id: "route", label: "Route", hint: "Click squares to add corners to the chosen patrol's route", group: "Enemies", action: { kind: "route" }, art: glyph("⤳") },
  ];
}

// -- the screen -----------------------------------------------------------------------------------------------------

export function mountEditor(root: HTMLElement, client: PyClient, id: string, onTitle: (title: string) => void): () => void {
  const first = drafts.load(id);
  if (!first) {
    root.replaceChildren(h("div", { class: "editor-missing" }, h("h1", {}, "No such level"), h("p", {}, "This level isn't saved in this browser."), h("a", { class: "btn", href: "#/editor" }, "← My levels")));
    return () => {};
  }

  const history = new History<Draft>(first);
  let revision = 0;
  let options: EditorOptions | null = null;
  let tools: Tool[] = [];
  let tool: Tool | null = null;
  let cursor: Pos = first.start;
  let anchor: Pos | null = null; // one corner of a rectangle, with the cursor the other (Shift + arrows)
  let selection: Selection = null;
  let tab: Tab = "level";
  let verdict: Verdict | null = null;
  let board: BoardView | null = null;
  let message = "";
  let painting: { button: number; last: string } | null = null;
  let dragging: { what: "start" | "goal" | "enemy"; index: number } | null = null;
  let fromPanel = false; // the change came from a field in the properties panel: leave that panel alone
  const draft = () => history.current;

  const host = h("div", { class: "ed-board", tabindex: "0", role: "group", "aria-label": "Level board", "aria-describedby": "ed-status" });
  const status = h("p", { class: "ed-status", id: "ed-status", "aria-live": "polite" });
  const keysHelp = h("p", { class: "ed-keys muted small" }, "Arrows move · Enter paints · Shift+arrows pick a rectangle · 1–9 choose a tool · R turns the start · Ctrl+Z undoes");
  const paletteHost = h("aside", { class: "panel ed-left", "aria-label": "Palette" });
  const propsHost = h("aside", { class: "panel ed-right", "aria-label": "Properties" });
  const confirmHost = h("div", { class: "ed-confirm" });
  const undoButton = h("button", { class: "btn btn-small", onClick: () => undo() }, "Undo");
  const redoButton = h("button", { class: "btn btn-small", onClick: () => redo() }, "Redo");
  const widthInput = h("input", { type: "number", min: "2", "aria-label": "Width in squares" });
  const heightInput = h("input", { type: "number", min: "2", "aria-label": "Height in squares" });
  widthInput.addEventListener("change", () => resizeTo(Number(widthInput.value), draft().height));
  heightInput.addEventListener("change", () => resizeTo(draft().width, Number(heightInput.value)));
  const toolbar = h(
    "div",
    { class: "toolbar ed-toolbar" },
    h("a", { class: "btn btn-small", href: "#/editor" }, "← My levels"),
    undoButton,
    redoButton,
    h("span", { class: "ed-sep" }),
    h("span", { class: "ed-size" }, "Size ", widthInput, " × ", heightInput),
    h("span", { class: "grow" }),
    h("span", { class: "muted small" }, "Saved in this browser"),
  );
  const middle = h("div", { class: "ed-middle" }, host, status, keysHelp);
  root.replaceChildren(h("div", { class: "level-editor" }, toolbar, confirmHost, h("div", { class: "ed ed-a" }, paletteHost, middle, propsHost)));
  host.replaceChildren(h("p", { class: "muted" }, "Setting up the editor…"));

  const checker = new Checker(client, (next) => {
    verdict = next;
    renderBoard();
    renderProps_();
  });

  // -- changing the draft ------------------------------------------------------------------------------------------

  function say(text: string): void {
    message = text;
    renderStatus();
  }

  function commit(next: Draft, note?: string, burst?: string): void {
    history.set(next, burst);
    changed(note);
  }

  /** The draft is different now (a change, an undo or a redo): save it, ask the engine, redraw. */
  function changed(note?: string): void {
    revision++;
    drafts.save(draft());
    onTitle(draft().title);
    checker.ask(draft(), revision);
    if (note !== undefined) message = note;
    keepInside();
    renderBoard();
    renderStatus();
    renderToolbar();
    if (fromPanel) renderProblemsOnly();
    else renderProps_();
  }

  /** After a change (a smaller board, an undo) the cursor, rectangle and selection must still be on the board. */
  function keepInside(): void {
    const { width, height } = draft();
    const clamp = ([x, y]: Pos): Pos => [Math.min(x, width - 1), Math.min(y, height - 1)];
    cursor = clamp(cursor);
    if (anchor) anchor = clamp(anchor);
    if (selection?.kind === "enemy" && !draft().enemies[selection.index]) selection = null;
    if (selection?.kind === "square" && (selection.pos[0] >= width || selection.pos[1] >= height)) selection = null;
  }

  function undo(): void {
    if (history.undo()) {
      confirmHost.replaceChildren();
      changed("Undone.");
    }
  }

  function redo(): void {
    if (history.redo()) {
      confirmHost.replaceChildren();
      changed("Redone.");
    }
  }

  function resizeTo(width: number, height: number): void {
    const max = options?.max_side ?? 12;
    const [w, h2] = [Math.min(max, Math.max(2, Math.round(width) || 2)), Math.min(max, Math.max(2, Math.round(height) || 2))];
    if (w === draft().width && h2 === draft().height) return renderToolbar();
    const { draft: next, lost } = resize(draft(), w, h2);
    if (!lost.length) return commit(next, `The board is ${w} × ${h2}.`);
    confirmHost.replaceChildren(
      confirmStep(`A ${w} × ${h2} board drops ${lost.join(", ")}. Make it smaller anyway?`, "Yes, make it smaller", "Keep the size", (yes) => {
        confirmHost.replaceChildren();
        if (yes) commit(next, `The board is ${w} × ${h2}.`);
        else renderToolbar();
        host.focus();
      }),
    );
  }

  // -- tools applied -----------------------------------------------------------------------------------------------

  const needs = (tile: TileKind) => options?.tiles[tile]?.needs ?? [];

  function editFor(d: Draft, pos: Pos, action: Action): Edit {
    switch (action.kind) {
      case "erase":
        return erase(d, pos);
      case "tile":
        return paint(d, pos, action.tile, needs(action.tile));
      case "start":
        return placeStart(d, pos);
      case "goal":
        return placeGoal(d, pos);
      case "spot":
        return toggleSpot(d, pos);
      case "enemy":
        return placeEnemy(d, pos, action.enemy);
      case "route":
        return selection?.kind === "enemy" ? extendRoute(d, selection.index, pos) : { refused: "Choose a patrol first: use the Select tool on it." };
      case "select":
        return { refused: "" };
    }
  }

  /** Apply the tool (or `override`, for a right-click erase) to one square. */
  function applyAt(pos: Pos, override?: Action): void {
    const action = override ?? tool?.action;
    if (!action) return;
    if (action.kind === "select") return selectAt(pos);
    const edit = editFor(draft(), pos, action);
    if ("refused" in edit) return say(edit.refused);
    commit(edit.draft, edit.note);
    if (action.kind === "enemy") select({ kind: "enemy", index: edit.draft.enemies.length - 1 });
    else if (action.kind === "tile" && (options?.tiles[action.tile]?.needs.length ?? 0) > 0) select({ kind: "square", pos });
  }

  /** The tool across the rectangle between the anchor and the cursor (only tiles and erasing make sense over many squares). */
  function applyRectangle(): void {
    const action = tool?.action;
    if (!anchor) return applyAt(cursor);
    if (action?.kind !== "tile" && action?.kind !== "erase") return say("Only a tile or Erase can fill a rectangle.");
    const edit = fill(draft(), anchor, cursor, (d, pos) => editFor(d, pos, action));
    if ("refused" in edit) say(edit.refused);
    else commit(edit.draft, edit.note);
    anchor = null;
    renderMarks();
  }

  function selectAt(pos: Pos): void {
    const enemy = enemyAt(draft(), pos);
    select(enemy >= 0 ? { kind: "enemy", index: enemy } : { kind: "square", pos });
  }

  function select(next: Selection): void {
    selection = next;
    if (next?.kind === "enemy") tab = "enemy";
    else if (next?.kind === "square") tab = "square";
    renderMarks();
    renderProps_();
    renderStatus();
  }

  function chooseTool(next: Tool): void {
    tool = next;
    anchor = null;
    renderPalette();
    renderMarks();
    say(`${next.label}: ${next.hint}.`);
  }

  // -- drawing -----------------------------------------------------------------------------------------------------

  /** What the board shows: the engine's own description when it has accepted this very draft (it knows what attacks what), else the draft's. */
  function levelToDraw(): LevelInfo {
    return verdict?.level && verdict.revision === revision ? verdict.level : draftToLevelInfo(draft());
  }

  let marksLayer: SVGGElement | null = null;

  /** Only the marks over the board: where the cursor, the selection and a rectangle are. */
  function renderMarks(): void {
    if (!marksLayer?.isConnected) return renderBoard();
    const next = marks(draft());
    marksLayer.replaceWith(next);
    marksLayer = next;
  }

  function renderBoard(): void {
    if (!options) return;
    const d = draft();
    board?.dispose();
    board = new BoardView(levelToDraw());
    marksLayer = marks(d);
    board.element.append(marksLayer);
    host.replaceChildren(board.element);
  }

  const square = ([x, y]: Pos, height: number): [number, number] => [M + x * S, (height - 1 - y) * S];
  const box = (pos: Pos, height: number, className: string, inset = 3) => {
    const [x, y] = square(pos, height);
    return svg("rect", { x: x + inset, y: y + inset, width: S - 2 * inset, height: S - 2 * inset, class: className });
  };

  /** The cursor, the selection, a rectangle in progress and the problems, drawn over the board. */
  function marks(d: Draft): SVGGElement {
    const layer = svg("g", { class: "ed-marks", "aria-hidden": "true" });
    if (anchor) {
      const [x0, y0] = [Math.min(anchor[0], cursor[0]), Math.min(anchor[1], cursor[1])];
      const [x1, y1] = [Math.max(anchor[0], cursor[0]), Math.max(anchor[1], cursor[1])];
      const [left, top] = square([x0, y1], d.height);
      layer.append(svg("rect", { x: left, y: top, width: (x1 - x0 + 1) * S, height: (y1 - y0 + 1) * S, class: "ed-rectangle" }));
    }
    const target = selection?.kind === "square" ? selection.pos : selection?.kind === "enemy" ? d.enemies[selection.index]?.start : undefined;
    if (target) {
      const [x, y] = square(target, d.height);
      const b = 12;
      layer.append(
        box(target, d.height, "ed-selected", 2),
        svg("path", { d: `M ${x + 2} ${y + 2 + b} V ${y + 2} H ${x + 2 + b} M ${x + S - 2 - b} ${y + 2} H ${x + S - 2} V ${y + 2 + b} M ${x + S - 2} ${y + S - 2 - b} V ${y + S - 2} H ${x + S - 2 - b} M ${x + 2 + b} ${y + S - 2} H ${x + 2} V ${y + S - 2 - b}`, class: "ed-brackets" }),
      );
    }
    layer.append(box(cursor, d.height, "ed-cursor"));
    const problem = verdict?.problem;
    if (problem) {
      const rung = [...problem.squares, ...(problem.enemy !== null && d.enemies[problem.enemy] ? [d.enemies[problem.enemy]!.start] : [])];
      for (const pos of rung) {
        const [x, y] = square(pos, d.height);
        layer.append(box(pos, d.height, "ed-problem", 1), svg("circle", { cx: x + S - 10, cy: y + 10, r: 9, class: "ed-badge" }), svg("text", { x: x + S - 10, y: y + 15, "text-anchor": "middle", class: "ed-badge-mark" }, "!"));
      }
    }
    return layer;
  }

  function renderPalette(): void {
    const groups = [...new Set(tools.map((t) => t.group))];
    paletteHost.replaceChildren(
      ...groups.map((group) =>
        h(
          "section",
          { class: "pal-group" },
          h("h3", { class: "pal-title" }, group),
          h(
            "div",
            { class: "pal-tools" },
            ...tools
              .filter((t) => t.group === group)
              .map((t) => {
                const number = tools.indexOf(t) + 1;
                const on = tool === t;
                return h(
                  "button",
                  { class: `tool${on ? " active" : ""}`, "aria-pressed": String(on), title: `${t.label}: ${t.hint}`, onClick: () => (sound.play("menu_move"), chooseTool(t), host.focus()) },
                  h("span", { class: "pal-art", "aria-hidden": "true" }, svg("svg", { viewBox: "-32 -32 64 64", class: "pal-sprite" }, t.art()) as unknown as Node),
                  h("span", { class: "tool-name" }, t.label),
                  number <= 9 ? h("kbd", { "aria-hidden": "true" }, String(number)) : null,
                );
              }),
          ),
        ),
      ),
    );
  }

  function describeSquare(pos: Pos): string {
    const d = draft();
    const here = occupantOf(d, pos);
    const cell = d.cells[pos[1]]![pos[0]]!;
    const parts = [here === "start" ? `start, facing ${d.facing}` : here === "goal" ? "goal" : here === "spot" ? "a square the goal might be on" : here === "enemy" ? `enemy ${enemyAt(d, pos) + 1}: ${d.enemies[enemyAt(d, pos)]!.kind}` : ""];
    if (cell.tile !== "floor") parts.push(cell.tile.replace("_", " "));
    return parts.filter(Boolean).join(", ") || "floor";
  }

  function renderStatus(): void {
    const where = `${squareName(cursor)} · ${describeSquare(cursor)}`;
    const doing = anchor ? ` · rectangle to ${squareName(anchor)}: Enter fills it` : tool ? ` · Enter: ${tool.label.toLowerCase()}` : "";
    status.replaceChildren(h("strong", {}, where), doing, ...(message ? [h("span", { class: "ed-note" }, ` — ${message}`)] : []));
  }

  function renderToolbar(): void {
    undoButton.disabled = !history.canUndo;
    redoButton.disabled = !history.canRedo;
    widthInput.max = heightInput.max = String(options?.max_side ?? 12);
    widthInput.value = String(draft().width);
    heightInput.value = String(draft().height);
  }

  const propsContext = () => ({
    draft: draft(),
    options: options!,
    selection,
    tab,
    problem: verdict?.problem ?? null,
    checking: !!verdict && verdict.revision !== revision,
    change: (next: Draft, burst?: string) => {
      fromPanel = true;
      commit(next, undefined, burst);
      fromPanel = false;
    },
    select,
    say,
    setTab: (next: Tab) => {
      tab = next;
      renderProps_();
    },
    goTo: (problem: Problem) => {
      const pos = problem.squares[0] ?? (problem.enemy !== null ? draft().enemies[problem.enemy]?.start : undefined);
      if (problem.field === "goal" && !pos) {
        const goal = tools.find((t) => t.id === "goal");
        if (goal) chooseTool(goal);
        host.focus();
      } else if (pos) {
        cursor = pos;
        select(problem.enemy !== null && draft().enemies[problem.enemy] ? { kind: "enemy", index: problem.enemy } : { kind: "square", pos });
        host.focus();
      } else {
        tab = "level";
        renderProps_();
        propsHost.querySelector<HTMLElement>(`[data-field="${problem.field ?? ""}"] input, [data-field="${problem.field ?? ""}"] textarea, [data-field="${problem.field ?? ""}"] select`)?.focus();
      }
    },
  });

  function renderProps_(): void {
    if (options) propsHost.replaceChildren(renderProps(propsContext()));
  }

  /** A field in the panel changed the draft: update only the problems list, so the field keeps its focus. */
  function renderProblemsOnly(): void {
    if (!options) return;
    const fresh = renderProps(propsContext());
    const old = propsHost.querySelector(".ed-problems");
    const next = fresh.querySelector(".ed-problems");
    if (old && next) old.replaceWith(next);
  }

  // -- the mouse ---------------------------------------------------------------------------------------------------

  function squareAtPointer(event: PointerEvent): Pos | null {
    const element = board?.element;
    const matrix = element?.getScreenCTM();
    if (!element || !matrix) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const x = Math.floor((point.x - M) / S);
    const y = draft().height - 1 - Math.floor(point.y / S);
    return x >= 0 && y >= 0 && x < draft().width && y < draft().height ? [x, y] : null;
  }

  host.addEventListener("pointerdown", (event) => {
    const pos = squareAtPointer(event);
    if (!pos || !options) return;
    host.focus();
    cursor = pos;
    anchor = null;
    host.setPointerCapture(event.pointerId);
    if (event.button === 2) {
      history.begin();
      painting = { button: 2, last: pos.join(",") };
      applyAt(pos, { kind: "erase" });
      return;
    }
    if (event.button !== 0) return;
    if (tool?.action.kind === "select") {
      const d = draft();
      const here = occupantOf(d, pos);
      dragging = here === "start" || here === "goal" ? { what: here, index: 0 } : here === "enemy" ? { what: "enemy", index: enemyAt(d, pos) } : null;
      selectAt(pos);
      return;
    }
    history.begin();
    const action = tool?.action.kind;
    painting = { button: 0, last: action === "tile" || action === "erase" || action === "start" || action === "goal" ? pos.join(",") : "" };
    applyAt(pos);
  });

  host.addEventListener("pointermove", (event) => {
    const pos = squareAtPointer(event);
    if (!pos || (cursor[0] === pos[0] && cursor[1] === pos[1])) return;
    cursor = pos;
    if (painting && painting.last && painting.last !== pos.join(",")) {
      painting.last = pos.join(",");
      applyAt(pos, painting.button === 2 ? { kind: "erase" } : undefined);
    } else renderMarks();
    renderStatus();
  });

  const endPointer = (event: PointerEvent) => {
    if (dragging) {
      const pos = squareAtPointer(event);
      const move = dragging;
      dragging = null;
      const d = draft();
      const from = move.what === "start" ? d.start : move.what === "goal" ? d.goal : d.enemies[move.index]?.start;
      if (pos && from && (from[0] !== pos[0] || from[1] !== pos[1])) {
        const edit = move.what === "start" ? placeStart(d, pos) : move.what === "goal" ? placeGoal(d, pos) : moveEnemy(d, move.index, pos);
        if ("refused" in edit) say(edit.refused);
        else {
          commit(edit.draft, edit.note);
          if (move.what === "enemy") select({ kind: "enemy", index: move.index });
        }
      }
    }
    if (painting) history.end();
    painting = null;
  };
  host.addEventListener("pointerup", endPointer);
  host.addEventListener("pointercancel", endPointer);
  host.addEventListener("contextmenu", (event) => event.preventDefault());

  // -- the keyboard ------------------------------------------------------------------------------------------------

  const MOVES: Record<string, Pos> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };

  host.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || !options) return;
    const move = MOVES[event.key];
    if (move) {
      if (event.shiftKey) anchor ??= cursor;
      else anchor = null;
      cursor = [Math.min(draft().width - 1, Math.max(0, cursor[0] + move[0])), Math.min(draft().height - 1, Math.max(0, cursor[1] + move[1]))];
      sound.play("menu_move");
    } else if (event.key === "Enter" || event.key === " ") {
      if (anchor) applyRectangle();
      else if (tool?.action.kind === "select") selectAt(cursor);
      else {
        history.begin();
        applyAt(cursor);
        history.end();
      }
    } else if (event.key === "Delete" || event.key === "Backspace") {
      history.begin();
      if (anchor) {
        const edit = fill(draft(), anchor, cursor, (d, pos) => erase(d, pos));
        if ("refused" in edit) say(edit.refused);
        else commit(edit.draft, edit.note);
        anchor = null;
      } else applyAt(cursor, { kind: "erase" });
      history.end();
    } else if (event.key === "Escape" && anchor) {
      anchor = null;
    } else if (/^[1-9]$/.test(event.key) && tools[Number(event.key) - 1]) {
      chooseTool(tools[Number(event.key) - 1]!);
    } else if (event.key === "[" || event.key === "]") {
      const at = tool ? tools.indexOf(tool) : 0;
      chooseTool(tools[(at + (event.key === "]" ? 1 : tools.length - 1)) % tools.length]!);
    } else if (event.key === "r" || event.key === "R") {
      const edit = rotateStart(draft());
      if ("draft" in edit) commit(edit.draft, edit.note);
    } else return;
    event.preventDefault();
    renderMarks();
    renderStatus();
  });

  // undo and redo anywhere on the screen but inside a text field, which has its own
  const onKey = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select")) return;
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) undo();
    else if (key === "y" || (key === "z" && event.shiftKey)) redo();
    else return;
    event.preventDefault();
  };
  document.addEventListener("keydown", onKey);

  // -- start up ----------------------------------------------------------------------------------------------------

  let live = true;
  onTitle(first.title);
  renderToolbar();
  void (async () => {
    try {
      await client.ready();
      cachedOptions ??= await client.call("editorOptions", {});
      if (!live) return;
      options = cachedOptions;
      tools = buildTools(options);
      tool = tools.find((t) => t.id === "select") ?? tools[0] ?? null;
      renderPalette();
      renderToolbar();
      renderBoard();
      renderStatus();
      renderProps_();
      checker.ask(draft(), revision);
    } catch (error) {
      host.replaceChildren(h("p", { class: "muted" }, `Python couldn't start: ${String(error)}`));
    }
  })();

  return () => {
    live = false;
    checker.stop();
    document.removeEventListener("keydown", onKey);
    board?.dispose();
    drafts.save(draft());
  };
}
