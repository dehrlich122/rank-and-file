// The small read-only panels around the board: variables, console output,
// and the outcome of a run.
import type { ErrorInfo, LevelResult, Star, Var } from "../py/protocol";
import { h } from "./dom";
import { icon } from "./icons";
import type { LogEntry } from "./playback";

/** Shows the player's variables at the current moment of playback. */
export class Inspector {
  readonly element = h("div", { class: "inspector" });
  private previous = new Map<string, string>();

  show(vars: Var[] | null): void {
    if (!vars || vars.length === 0) {
      this.element.replaceChildren(
        h("p", { class: "muted small" }, "No variables yet. Your own variables appear here as the program runs."),
      );
      this.previous = new Map();
      return;
    }
    // The piece comes first; the player's own variables follow in the order they were made.
    const ordered = [...vars.filter((v) => v.type === "Pawn"), ...vars.filter((v) => v.type !== "Pawn")];
    const rows = ordered.map((v) => {
      const changed = this.previous.has(v.name) ? this.previous.get(v.name) !== v.value : this.previous.size > 0;
      return h(
        "tr",
        { class: changed ? "changed" : undefined },
        h("td", { class: "var-name" }, v.name),
        h("td", { class: "var-value" }, v.value),
        h("td", { class: "var-type" }, v.type),
      );
    });
    this.element.replaceChildren(h("table", {}, h("tbody", {}, ...rows)));
    this.previous = new Map(vars.map((v) => [v.name, v.value]));
  }

  reset(): void {
    this.previous = new Map();
    this.show(null);
  }
}

/** Everything printed up to the current moment of playback, plus what the game said. */
export class Console {
  readonly element = h("pre", { class: "console" });

  show(log: LogEntry[]): void {
    if (log.length) {
      this.element.replaceChildren(
        ...log.map((entry) => (entry.kind === "game" ? h("span", { class: "game-message" }, entry.text) : entry.text)),
      );
      this.element.classList.remove("empty");
    } else {
      this.element.textContent = "Nothing printed yet.";
      this.element.classList.add("empty");
    }
    this.element.scrollTop = this.element.scrollHeight;
  }
}

/** A card describing how an error happened, with the real traceback tucked away. */
export function errorCard(error: ErrorInfo): HTMLElement {
  return h(
    "div",
    { class: "error-detail" },
    h("p", {}, error.line ? h("span", { class: "line-tag" }, `Line ${error.line}`) : null, error.friendly),
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
  error: "bad",
  timeout: "bad",
};

const HEADLINE: Record<LevelResult["status"], string> = {
  solved: "Solved!",
  finished: "Finished",
  incomplete: "Not there yet",
  constraint: "Check the rules",
  error: "Python stopped",
  timeout: "Endless loop",
};

/** The banner shown when playback reaches the end of a run. */
export function outcomeCard(result: LevelResult, actions: HTMLElement[] = []): HTMLElement {
  const body: HTMLElement[] = [];
  if (result.hidden_board) body.push(h("p", { class: "hidden-note" }, result.hidden_board.note));
  if (result.error) {
    body.push(errorCard(result.error));
  } else if (result.problems.length > 0) {
    body.push(h("ul", { class: "problems" }, ...result.problems.map((problem) => h("li", {}, problem))));
  } else {
    const summary = result.status === "solved" ? result.summary.replace(/^Solved! /, "") : result.summary;
    body.push(h("p", {}, summary));
  }
  if (result.stars.length) body.push(starList(result.stars));
  if (result.truncated) {
    body.push(h("p", { class: "muted small" }, "This run was very long, so only its beginning was recorded for playback."));
  }
  return h(
    "div",
    { class: `outcome outcome-${TONE[result.status]}`, role: "status" },
    h("div", { class: "outcome-head" }, h("strong", {}, result.hidden_board ? "Not on every board" : HEADLINE[result.status]), ...actions),
    ...body,
  );
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
  return h("div", { class: `outcome outcome-${tone}`, role: "status" }, h("div", { class: "outcome-head" }, h("strong", {}, title)), h("p", {}, text));
}
