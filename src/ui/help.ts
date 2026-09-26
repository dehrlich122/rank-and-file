// Help on a level (M2), in the Challenge panel.
//
// - Tiered hints: a nudge, then a concept reminder, then a partial example.
//   They open one at a time, only when asked, and stay open. Opening the
//   first gives up the level's no-hints star, and the panel says so first.
// - Once every hint is open and GIVE_UP_AFTER more runs have failed, "Show me
//   a solution", behind a confirm step. Seeing it marks the level solved with
//   help, with no stars until the player solves it themselves.
// - Once the level is solved (or its solution seen), the comparison with an
//   idiomatic solution.
//
// It keeps the level's progress up to date: `recordRun` once per run.
import { progress } from "../progress";
import type { LevelResult } from "../py/protocol";
import { openComparison } from "./compare";
import { confirmStep } from "./dialog";
import { h } from "./dom";

const GIVE_UP_AFTER = 3; // failed runs after the last hint

export class HelpPanel {
  private readonly hintsSection = h("section", { class: "hints", "aria-live": "polite" });
  private readonly solutionSection = h("section", { class: "solution-section" });
  readonly element = h("div", { class: "help" }, this.hintsSection, this.solutionSection);
  private confirming = false;

  constructor(
    private readonly levelId: string,
    private readonly hints: string[],
    private readonly currentCode: () => string, // what "Your code" shows in the comparison
  ) {
    this.render();
  }

  private get allOpen(): boolean {
    return progress.level(this.levelId).hints >= this.hints.length;
  }

  /** "Show me a solution" is on offer: every hint open, enough failed runs since, and not solved or seen yet. */
  private get canGiveUp(): boolean {
    const { failedAfterHints, helped } = progress.level(this.levelId);
    return this.allOpen && failedAfterHints >= GIVE_UP_AFTER && !helped && !progress.solved(this.levelId);
  }

  /** Save what a finished run means for the level: its best stars, or one more failed run after the hints. */
  recordRun(result: LevelResult): void {
    const { stars, failedAfterHints, helped } = progress.level(this.levelId);
    if (result.status === "solved") {
      const earned = result.stars.filter((star) => star.earned).length;
      if (earned > stars) progress.update(this.levelId, { stars: earned });
    } else if (this.allOpen && !helped && !progress.solved(this.levelId) && failedAfterHints < GIVE_UP_AFTER) {
      progress.update(this.levelId, { failedAfterHints: failedAfterHints + 1 });
    }
    this.render();
  }

  /**
   * What a finished run's outcome card offers: the comparison after a solve
   * (with the code that solved it), or a way to the hints. The hint and
   * solution buttons call `showHelp`, which opens this panel: it says what a
   * hint costs, and asks before showing a solution.
   */
  outcomeAction(result: LevelResult, runCode: string, showHelp: () => void): HTMLElement | null {
    if (result.status === "solved") return this.compareButton(() => runCode);
    const label = !this.allOpen ? "Need a hint?" : this.canGiveUp ? "Show me a solution…" : null;
    return label ? h("button", { class: "btn btn-small", onClick: showHelp }, label) : null;
  }

  /** Put focus on the next thing to do here: the next hint, or "Show me a solution". */
  focus(): void {
    this.hintsSection.scrollIntoView({ block: "nearest" });
    this.hintsSection.querySelector<HTMLElement>(".hint-button, .give-up-button")?.focus();
  }

  private openNextHint(): void {
    if (this.allOpen) return;
    progress.update(this.levelId, { hints: progress.level(this.levelId).hints + 1 });
    this.render();
    this.hintsSection.querySelector<HTMLElement>(".hint-list li:last-child")?.focus();
  }

  private askToGiveUp(asking: boolean): void {
    this.confirming = asking;
    this.render();
    if (!asking) this.hintsSection.querySelector<HTMLElement>(".give-up-button")?.focus();
  }

  private giveUp(): void {
    this.confirming = false;
    progress.update(this.levelId, { helped: true });
    this.render();
    openComparison(this.levelId, this.currentCode());
  }

  private compareButton(code: () => string): HTMLElement {
    return h("button", { class: "btn btn-small", onClick: () => openComparison(this.levelId, code()) }, "Compare with an idiomatic solution");
  }

  private render(): void {
    this.renderHints();
    this.renderSolution();
  }

  private renderHints(): void {
    const total = this.hints.length;
    if (total === 0) {
      this.hintsSection.replaceChildren();
      return;
    }
    const { hints: opened, failedAfterHints, helped } = progress.level(this.levelId);
    const parts: HTMLElement[] = [h("h3", {}, "Hints")];
    if (opened > 0) {
      parts.push(h("ol", { class: "hint-list" }, ...this.hints.slice(0, opened).map((hint) => h("li", { tabindex: -1 }, ...withCode(hint)))));
    }
    if (!this.allOpen) {
      const label = opened === 0 ? `Show a hint (1 of ${total})` : `Show the next hint (${opened + 1} of ${total})`;
      parts.push(h("button", { class: "btn btn-small hint-button", onClick: () => this.openNextHint() }, label));
      if (opened === 0) {
        parts.push(h("p", { class: "muted small" }, "Opening a hint gives up this level's no-hints star. Hints stay open once you've seen them."));
      }
    } else if (this.canGiveUp) {
      parts.push(
        this.confirming
          ? confirmStep(
              "See a full solution? This level will count as solved with help, and earns no stars until you solve it yourself.",
              "Show it",
              "Not yet",
              (yes) => (yes ? this.giveUp() : this.askToGiveUp(false)),
            )
          : h("button", { class: "btn btn-small give-up-button", onClick: () => this.askToGiveUp(true) }, "Show me a solution…"),
      );
    } else if (!helped && !progress.solved(this.levelId)) {
      const left = GIVE_UP_AFTER - failedAfterHints;
      parts.push(h("p", { class: "muted small" }, `That's every hint. Still stuck after ${left} more ${left === 1 ? "run" : "runs"}? Then you can ask to see a solution.`));
    }
    this.hintsSection.replaceChildren(...parts);
  }

  private renderSolution(): void {
    const solved = progress.solved(this.levelId);
    if (!solved && !progress.level(this.levelId).helped) {
      this.solutionSection.replaceChildren();
      return;
    }
    const why = solved
      ? "You've solved this level. See your code next to an idiomatic solution, and why it's written that way."
      : "You've seen a solution. Solve the level yourself to earn its stars.";
    this.solutionSection.replaceChildren(h("h3", {}, "Solution"), h("p", { class: "muted small" }, why), this.compareButton(this.currentCode));
  }
}

/** Text with `backtick` spans shown as code. Always text nodes, never HTML. */
function withCode(text: string): Array<string | HTMLElement> {
  return text.split("`").map((part, i) => (i % 2 === 1 ? h("code", {}, part) : part));
}
