// Tiered hints (M2): a nudge, then a concept reminder, then a partial example.
//
// They sit in the Challenge panel and open one at a time, only when asked.
// Opened hints stay open. Opening the first gives up the level's no-hints
// star, and the panel says so before that happens.
//
// When every hint is open and GIVE_UP_AFTER more runs have failed, the panel
// offers "Show me a solution", behind a confirm step. Seeing it marks the
// level solved with help, with no stars until the player solves it.
import type { LevelProgress } from "../progress";
import { h } from "./dom";

const GIVE_UP_AFTER = 3; // failed runs after the last hint

type HintsState = Pick<LevelProgress, "hints" | "failedAfterHints" | "solved" | "helped">;

interface HintsActions {
  open(opened: number): void; // a hint was opened; `opened` is how many are open now
  giveUp(): void; // the player confirmed they want to see a solution
}

export class HintsPanel {
  readonly element = h("section", { class: "hints", "aria-live": "polite" });
  private confirming = false;

  constructor(
    private readonly hints: string[],
    private readonly state: () => HintsState,
    private readonly actions: HintsActions,
  ) {
    this.render();
  }

  get allOpen(): boolean {
    return this.state().hints >= this.hints.length;
  }

  /** "Show me a solution" is on offer: every hint open, enough failed runs since, and not solved or seen yet. */
  get canGiveUp(): boolean {
    const { failedAfterHints, solved, helped } = this.state();
    return this.allOpen && failedAfterHints >= GIVE_UP_AFTER && !solved && !helped;
  }

  /** Redraw after the level's progress changed elsewhere (a failed run, a solve). */
  refresh(): void {
    this.render();
  }

  private openNext(): void {
    if (this.allOpen) return;
    this.actions.open(this.state().hints + 1);
    this.render();
    this.element.querySelector<HTMLElement>(".hint-list li:last-child")?.focus();
  }

  private confirm(asking: boolean): void {
    this.confirming = asking;
    this.render();
    this.element.querySelector<HTMLElement>(asking ? ".give-up-confirm button" : ".give-up-button")?.focus();
  }

  private giveUp(): void {
    this.confirming = false;
    this.actions.giveUp();
    this.render();
  }

  private render(): void {
    const total = this.hints.length;
    if (total === 0) {
      this.element.replaceChildren();
      return;
    }
    const { hints: opened, failedAfterHints, solved, helped } = this.state();
    const parts: HTMLElement[] = [h("h3", {}, "Hints")];
    if (opened > 0) {
      parts.push(
        h("ol", { class: "hint-list" }, ...this.hints.slice(0, opened).map((hint) => h("li", { tabindex: -1 }, ...withCode(hint)))),
      );
    }
    if (!this.allOpen) {
      const label = opened === 0 ? `Show a hint (1 of ${total})` : `Show the next hint (${opened + 1} of ${total})`;
      parts.push(h("button", { class: "btn btn-small hint-button", onClick: () => this.openNext() }, label));
      if (opened === 0) {
        parts.push(h("p", { class: "muted small" }, "Opening a hint gives up this level's no-hints star. Hints stay open once you've seen them."));
      }
    } else if (this.canGiveUp) {
      parts.push(this.confirming ? this.confirmBox() : h("button", { class: "btn btn-small give-up-button", onClick: () => this.confirm(true) }, "Show me a solution…"));
    } else if (!solved && !helped) {
      const left = GIVE_UP_AFTER - failedAfterHints;
      parts.push(
        h("p", { class: "muted small" }, `That's every hint. Still stuck after ${left} more ${left === 1 ? "run" : "runs"}? Then you can ask to see a solution.`),
      );
    }
    this.element.replaceChildren(...parts);
  }

  private confirmBox(): HTMLElement {
    return h(
      "div",
      { class: "give-up-confirm" },
      h("p", {}, "See a full solution? This level will count as solved with help, and earns no stars until you solve it yourself."),
      h(
        "div",
        { class: "choices" },
        h("button", { class: "btn btn-small btn-danger", onClick: () => this.giveUp() }, "Show it"),
        h("button", { class: "btn btn-small", onClick: () => this.confirm(false) }, "Not yet"),
      ),
    );
  }
}

/** Text with `backtick` spans shown as code. Always text nodes, never HTML. */
function withCode(text: string): Array<string | HTMLElement> {
  return text.split("`").map((part, i) => (i % 2 === 1 ? h("code", {}, part) : part));
}
