// Help on a level (M2), in the Challenge panel.
//
// - Tiered hints: a nudge, then a concept reminder, then a partial example.
//   They open one at a time, only when asked, and stay open. Opening the
//   first gives up the level's third star, and the panel says so first.
// - Once GIVE_UP_AFTER runs have failed, whether or not any hint is open
//   (QA-042), "Show me a solution", behind a confirm step. Seeing it marks the
//   level solved with help, with no stars until the player solves it themselves.
// - Once the level is solved (or its solution seen), the comparison with an
//   idiomatic solution. Seeing it gives up the third star too (QA-018), so
//   when there's a star to lose, the panel asks first.
//
// It keeps the level's progress up to date: `recordRun` once per run.
import { GIVE_UP_AFTER, progress } from "../progress";
import type { LevelResult } from "../py/protocol";
import { openComparison } from "./compare";
import { confirmStep } from "./dialog";
import { h, withCode } from "./dom";

/** Where the help panel puts focus when it's opened: the next hint, or "Show me a solution". */
export type HelpFocus = "hint" | "solution";

export class HelpPanel {
  private readonly hintsSection = h("section", { class: "hints", "aria-live": "polite" });
  private readonly solutionSection = h("section", { class: "solution-section", "aria-live": "polite" });
  readonly element = h("div", { class: "help" }, this.hintsSection, this.solutionSection);
  private confirming = false;
  private comparing: (() => string) | null = null; // asking before a comparison: the code it would show as yours

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

  /** Save what a finished run means for the level: its best stars, or one more failed run. */
  recordRun(result: LevelResult): void {
    if (result.status === "solved") {
      const earned = result.stars.filter((star) => star.earned).length;
      if (earned > progress.level(this.levelId).stars) progress.update(this.levelId, { stars: earned });
    } else {
      progress.recordFailedRun(this.levelId);
    }
    this.render();
  }

  /**
   * What a finished run's outcome card offers: the comparison after a solve
   * (with the code that solved it); after a failed run, a way to the next
   * hint and, once it's on offer, to a solution. These buttons call
   * `showHelp`, which opens this panel: it says what a hint costs, and asks
   * before showing a solution.
   */
  outcomeActions(result: LevelResult, runCode: string, showHelp: (focus?: HelpFocus) => void): HTMLElement[] {
    if (result.status === "solved") return [this.compareButton(() => runCode, showHelp)];
    const offers: HTMLElement[] = [];
    if (!this.allOpen) offers.push(h("button", { class: "btn btn-small", onClick: () => showHelp("hint") }, "Need a hint?"));
    if (progress.offersSolution(this.levelId)) offers.push(h("button", { class: "btn btn-small", onClick: () => showHelp("solution") }, "Show me a solution…"));
    return offers;
  }

  /** Put focus on the next thing to do here: the next hint, or "Show me a solution" (whichever is there, `on` first). */
  focus(on: HelpFocus = "hint"): void {
    const [first, second] = on === "hint" ? [".hint-button", ".give-up-button"] : [".give-up-button", ".hint-button"];
    const target = this.element.querySelector<HTMLElement>(first) ?? this.element.querySelector<HTMLElement>(second);
    (target ?? this.element).scrollIntoView({ block: "nearest" });
    target?.focus();
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
    if (!asking) this.solutionSection.querySelector<HTMLElement>(".give-up-button")?.focus();
  }

  private giveUp(): void {
    this.confirming = false;
    progress.update(this.levelId, { helped: true, solutionSeen: true });
    this.showComparison(this.currentCode());
  }

  /** Seeing the solution would give up the third star: none lost yet, and no hint opened (which already gave it up). */
  private get comparingCosts(): boolean {
    const { stars, hints, solutionSeen } = progress.level(this.levelId);
    return stars < 3 && hints === 0 && !solutionSeen;
  }

  /** `reveal` opens the Challenge panel, where the question is asked (from the outcome card). */
  private compareButton(code: () => string, reveal?: () => void): HTMLElement {
    const compare = () => {
      if (!this.comparingCosts) return this.showComparison(code());
      this.comparing = code;
      this.render();
      reveal?.();
    };
    return h("button", { class: "btn btn-small", onClick: compare }, "Compare with an idiomatic solution");
  }

  private showComparison(yourCode: string): void {
    this.comparing = null;
    if (!progress.level(this.levelId).solutionSeen) progress.update(this.levelId, { solutionSeen: true });
    this.render();
    openComparison(this.levelId, yourCode);
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
    const opened = progress.level(this.levelId).hints;
    const parts: HTMLElement[] = [h("h3", {}, "Hints")];
    if (opened > 0) {
      parts.push(h("ol", { class: "hint-list" }, ...this.hints.slice(0, opened).map((hint) => h("li", { tabindex: -1 }, ...withCode(hint)))));
    }
    if (!this.allOpen) {
      const label = opened === 0 ? `Show a hint (1 of ${total})` : `Show the next hint (${opened + 1} of ${total})`;
      parts.push(h("button", { class: "btn btn-small hint-button", onClick: () => this.openNextHint() }, label));
      if (opened === 0) {
        parts.push(h("p", { class: "muted small" }, "Opening a hint gives up this level's third star. Hints stay open once you've seen them."));
      }
    }
    this.hintsSection.replaceChildren(...parts);
  }

  /** The solution: the comparison once solved or seen; before that, "Show me a solution" or the runs until it's offered. */
  private renderSolution(): void {
    const solved = progress.solved(this.levelId);
    const { helped, failedRuns } = progress.level(this.levelId);
    if (solved || helped) {
      const why = solved
        ? "You've solved this level. See your code next to an idiomatic solution, and why it's written that way."
        : "You've seen a solution. Solve the level yourself to earn its stars.";
      const code = this.comparing;
      const action = code
        ? confirmStep(
            "Seeing the idiomatic solution gives up this level's third star: from now on, a run can earn two at most. See it?",
            "Show it",
            "Not yet",
            (yes) => (yes ? this.showComparison(code()) : this.cancelComparing()),
          )
        : this.compareButton(this.currentCode);
      this.solutionSection.replaceChildren(h("h3", {}, "Solution"), h("p", { class: "muted small" }, why), action);
    } else if (progress.offersSolution(this.levelId)) {
      const action = this.confirming
        ? confirmStep(
            "See a full solution? This level will count as solved with help, and earns no stars until you solve it yourself.",
            "Show it",
            "Not yet",
            (yes) => (yes ? this.giveUp() : this.askToGiveUp(false)),
          )
        : h("button", { class: "btn btn-small give-up-button", onClick: () => this.askToGiveUp(true) }, "Show me a solution…");
      this.solutionSection.replaceChildren(h("h3", {}, "Solution"), action);
    } else if (failedRuns > 0) {
      const left = GIVE_UP_AFTER - failedRuns;
      this.solutionSection.replaceChildren(
        h("p", { class: "muted small give-up-note" }, `Still stuck after ${left} more ${left === 1 ? "run" : "runs"}? Then you can ask to see a solution.`),
      );
    } else {
      this.solutionSection.replaceChildren();
    }
  }

  private cancelComparing(): void {
    this.comparing = null;
    this.render();
    this.solutionSection.querySelector<HTMLElement>("button")?.focus();
  }
}
