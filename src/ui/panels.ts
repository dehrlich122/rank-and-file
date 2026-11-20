// The small read-only panels around the board: variables, console output,
// and the outcome of a run.
import { VOICE } from "./voice";
import type { ErrorInfo, LevelInfo, LevelResult, Star, Step, Var } from "../py/protocol";
import { h, withCode } from "./dom";
import { icon } from "./icons";
import type { LogEntry } from "./playback";

/** The variables of the level's piece (whose type is its class, in any case) first; the rest keep their order. */
export function piecesFirst(vars: Var[], piece: string): Var[] {
  const isPiece = (v: Var) => v.type.toLowerCase() === piece.toLowerCase();
  return [...vars.filter(isPiece), ...vars.filter((v) => !isPiece(v))];
}

/** What `Inspector.show` is told when playback is inside a function: which one, how deep, and the program's names. */
type FunctionScope = Pick<Step, "scope" | "depth" | "globals">;

type Snapshot = Map<string, string>;
const snapshot = (vars: Var[]): Snapshot => new Map(vars.map((v) => [v.name, v.value]));

/**
 * One list of names as a table. A name is marked changed when its value differs from `before`; a name `before`
 * lacks is marked when `newMarked`. With no `before` (nothing to compare with) nothing is marked.
 */
function varTable(vars: Var[], piece: string, before: Snapshot | null, newMarked: boolean): HTMLElement {
  // The piece comes first; the player's own variables follow in the order they were made.
  const rows = piecesFirst(vars, piece).map((v) => {
    const changed = before ? (before.has(v.name) ? before.get(v.name) !== v.value : newMarked) : false;
    return h(
      "tr",
      { class: changed ? "changed" : undefined },
      h("td", { class: "var-name" }, v.name),
      h("td", { class: "var-value" }, v.value),
      h("td", { class: "var-type" }, v.type),
    );
  });
  return h("table", {}, h("tbody", {}, ...rows));
}

/** Shows the player's variables at the current moment of playback. */
export class Inspector {
  readonly element = h("div", { class: "inspector" });
  private program: Snapshot = new Map(); // the program's names as last shown, at module level or in the fold
  private inside: Snapshot | null = null; // the function's names as last shown...
  private insideKey = ""; // ...and the depth and scope they were shown in
  private foldOpen = false;

  /** `piece` is the level's piece, "pawn" or "knight": its variables are listed first. */
  constructor(private readonly piece: string) {}

  /** `vars` are the names the step sees; inside a function, `fn` adds which function and the program's names. */
  show(vars: Var[] | null, fn?: FunctionScope): void {
    if (fn && fn.depth > 0) {
      this.showInside(vars ?? [], fn);
      return;
    }
    this.inside = null;
    if (!vars || vars.length === 0) {
      this.element.replaceChildren(
        h("p", { class: "muted small" }, "No variables yet. Your own variables appear here as the program runs."),
      );
      this.program = new Map();
      return;
    }
    this.element.replaceChildren(varTable(vars, this.piece, this.program, this.program.size > 0));
    this.program = snapshot(vars);
  }

  private showInside(vars: Var[], fn: FunctionScope): void {
    const key = `${fn.depth}:${fn.scope}`;
    const same = this.inside !== null && this.insideKey === key;
    const heading = /^[A-Za-z_]\w*$/.test(fn.scope) ? `${fn.scope}()` : fn.scope;
    const fold = h(
      "details",
      { class: "fold", open: this.foldOpen },
      h("summary", {}, `your program's names (${fn.globals.length})`),
      varTable(fn.globals, this.piece, this.program, this.program.size > 0),
    );
    fold.addEventListener("toggle", () => {
      this.foldOpen = fold.open;
    });
    this.element.replaceChildren(
      h(
        "div",
        { class: "scope" },
        h("p", { class: "group-head" }, heading),
        vars.length > 0 ? varTable(vars, this.piece, same ? this.inside : null, true) : h("p", { class: "muted small" }, "No names of its own yet."),
      ),
      fold,
    );
    this.program = snapshot(fn.globals);
    this.inside = snapshot(vars);
    this.insideKey = key;
  }

  reset(): void {
    this.program = new Map();
    this.foldOpen = false;
    this.show(null);
  }
}

/** Everything printed up to the current moment of playback, plus what the game said. */
export class Console {
  readonly element = h("pre", { class: "console" });

  show(log: LogEntry[]): void {
    if (log.length) {
      this.element.replaceChildren(
        ...logNodes(log),
      );
      this.element.classList.remove("empty");
    } else {
      this.element.textContent = "Nothing printed yet.";
      this.element.classList.add("empty");
    }
    this.element.scrollTop = this.element.scrollHeight;
  }
}

/** What was printed as text, and what the game said as highlighted lines: the console's and snippets' contents. */
export function logNodes(log: LogEntry[]): Array<string | HTMLElement> {
  return log.map((entry) => (entry.kind === "game" ? h("span", { class: "game-message" }, entry.text) : entry.text));
}

/** A card describing how an error happened, with the real traceback tucked away. */
export function errorCard(error: ErrorInfo): HTMLElement {
  return h(
    "div",
    { class: "error-detail" },
    h("p", {}, error.line ? h("span", { class: "line-tag" }, `Line ${error.line}`) : null, ...withCode(error.friendly)),
    error.traceback
      ? h("details", {}, h("summary", {}, "Show Python's traceback"), h("pre", { class: "traceback" }, error.traceback))
      : null,
  );
}

const TONE: Record<LevelResult["status"], string> = {
  solved: "good",
  finished: "good",
  incomplete: "warn",
  constraint: "warn",
  lost: "bad",
  error: "bad",
  timeout: "bad",
};

const HEADLINE: Record<LevelResult["status"], string> = {
  solved: "Solved!",
  finished: "Finished",
  incomplete: "Not there yet",
  constraint: "Check the rules",
  lost: VOICE.lost,
  error: "Python stopped",
  timeout: "Endless loop",
};

/**
 * The banner shown when playback reaches the end of a run. `run` is the whole
 * run: its headline, colour and stars. `shown` is the recording being played:
 * the run itself, or one of its cases (M2), which supplies the details.
 */
export function outcomeCard(run: LevelResult, shown: LevelResult, actions: HTMLElement[] = [], showStars = true, replay?: (index: number) => void): HTMLElement {
  const result = shown;
  const body: HTMLElement[] = [];
  const note = [run.case_note, shown === run ? "" : shown.case_note].filter(Boolean).join(" ");
  if (note) body.push(h("p", { class: "case-note" }, note));
  if (result.error) {
    body.push(errorCard(result.error));
  } else if (result.problems.length > 0) {
    body.push(h("ul", { class: "problems" }, ...result.problems.map((problem) => h("li", {}, ...withCode(problem)))));
  } else {
    // an examiner's case: what happened, then its line in its own voice (`happened` never carries "Solved! ")
    const happened = result.call?.happened;
    const said = result.call?.said;
    if (happened && said) {
      body.push(
        h("p", {}, ...withCode(happened)),
        h("p", { class: "examiner-line" }, h("span", { class: "examiner-mark", title: "the examiner" }, "E"), `“${said}”`),
      );
    } else {
      const summary = result.status === "solved" ? result.summary.replace(/^Solved! /, "") : result.summary;
      body.push(h("p", {}, ...withCode(summary)));
    }
  }
  const table = callsTable(run, shown, replay);
  if (table) body.push(table);
  if (showStars && run.stars.length) body.push(starList(run.stars));
  if (result.truncated) {
    body.push(h("p", { class: "muted small" }, "This run was very long, so only its beginning was recorded for playback."));
  }
  const tone = TONE[run.status];
  // a run that goes wrong flickers the card's frame once (never its text); a solved one gets a sunset banner above it
  const card = h(
    "div",
    { class: `outcome outcome-${tone}${tone === "bad" ? " glitch-frame" : ""}` },
    h("div", { class: "outcome-head" }, h("strong", {}, HEADLINE[run.status]), ...actions),
    ...body,
  );
  return run.status === "solved" ? h("div", { class: "complete-wrap" }, h("div", { class: "complete-banner play", "aria-hidden": "true" }, h("span", { class: "complete-text", "data-text": VOICE.complete }, VOICE.complete)), card) : card;
}

/** On an examiner level, each call's answer wanted and got, a row each; a click replays that call. Nothing when only the board was judged (the buttons say as much). */
function callsTable(run: LevelResult, shown: LevelResult, replay?: (index: number) => void): HTMLElement | null {
  if (!run.cases.some((c) => c.call?.wanted != null)) return null;
  const picked = run.cases.findIndex((c) => c === shown);
  const rows = run.cases.map((c, i) => {
    const wanted = c.call?.wanted ?? null; // a call with no answer wanted leaves both cells empty
    const got = wanted === null ? null : (c.call?.returned ?? h("span", { class: "muted" }, "no answer"));
    const ok = c.status === "solved";
    return h(
      "tr",
      { class: i === picked ? "picked" : undefined },
      h("td", {}, h("button", { class: "btn btn-small", title: `Replay ${c.label}`, onClick: () => replay?.(i) }, c.label)),
      h("td", {}, wanted),
      h("td", {}, got),
      h("td", { class: ok ? "ok" : "no" }, ok ? "✓" : "✗"),
    );
  });
  return h("table", { class: "calls" }, h("thead", {}, h("tr", {}, ...["call", "wanted", "got", ""].map((t) => h("th", {}, t)))), h("tbody", {}, ...rows));
}

/** The calls an examiner will make, numbered, for the Challenge panel (M5.2-6b). A call names its board only when calls and boards don't match one to one. */
export function callList(examine: NonNullable<LevelInfo["examine"]>, boards: LevelInfo[]): HTMLElement[] {
  const plain = boards.length === 0 || examine.calls.every((c, i) => c.board === i + 1);
  return [
    h("p", { class: "call-intro" }, "The examiner will call:"),
    h("ol", { class: "call-list" }, ...examine.calls.map((c) => h("li", {}, h("code", { class: "call-code" }, c.text), plain ? null : h("span", { class: "muted small" }, ` on board ${c.board}`)))),
  ];
}

/** A solved run's stars, each with what it's for (M2). */
function starList(stars: Star[]): HTMLElement {
  const earned = stars.filter((star) => star.earned).length;
  return h(
    "ul",
    { class: "stars", "aria-label": `${earned} of ${stars.length} stars` },
    ...stars.map((star) => h("li", { class: star.earned ? "earned" : undefined }, icon(star.earned ? "star" : "starOutline"), star.label)),
  );
}

/** A simple card for problems that aren't a run result (e.g. Python restarting). */
export function noticeCard(tone: "good" | "warn" | "bad", title: string, text: string): HTMLElement {
  return h("div", { class: `outcome outcome-${tone}` }, h("div", { class: "outcome-head" }, h("strong", {}, title)), h("p", {}, text));
}
