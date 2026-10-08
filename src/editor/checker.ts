// Asks the engine whether the draft is a level (M4.2): each change is exported to the level format and sent to
// `loadLevel`, a moment after the last one. The engine's answer is the only verdict. An answer for an older draft
// than the latest one asked about is never shown.
import type { PyClient } from "../py/client";
import type { LevelInfo } from "../py/protocol";
import type { Draft } from "./draft";
import { draftToLevelData } from "./levelData";
import { placeProblem, type Problem } from "./problems";

export interface Verdict {
  revision: number; // the draft's revision it's about
  level: LevelInfo | null; // the engine's description, when it accepts the draft
  problem: Problem | null; // what's wrong, when it doesn't
  data: Record<string, unknown>; // what was sent: the draft as a level file
}

const WAIT_MS = 150;

export class Checker {
  private timer: number | undefined;
  private latest = -1;
  private stopped = false;

  constructor(
    private readonly client: PyClient,
    private readonly onVerdict: (verdict: Verdict) => void,
  ) {}

  /** Check `draft` soon, unless another change comes first. */
  ask(draft: Draft, revision: number): void {
    this.latest = revision;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.run(draft, revision), WAIT_MS);
  }

  private async run(draft: Draft, revision: number): Promise<void> {
    const { data, squares } = draftToLevelData(draft);
    try {
      await this.client.ready();
      const result = await this.client.call("loadLevel", { level: data });
      if (this.stopped || revision !== this.latest) return;
      this.onVerdict(result.ok ? { revision, level: result.level, problem: null, data } : { revision, level: null, problem: placeProblem(result.error, result.at, squares), data });
    } catch (error) {
      if (this.stopped || revision !== this.latest) return;
      this.onVerdict({ revision, level: null, problem: placeProblem(`Python couldn't check this level: ${String(error)}`, null, {}), data });
    }
  }

  stop(): void {
    this.stopped = true;
    window.clearTimeout(this.timer);
  }
}
