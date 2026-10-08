// Undo and redo for the editor (M4.2): snapshots of whatever is being edited. A stroke (a drag across the board)
// and a burst of typing in one field each count as one step.

const DEPTH = 100;
const BURST_MS = 1000; // typing in one field within this long of the last keystroke is one step

export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  private pending: T | null = null; // where the stroke in progress began
  private burst: { key: string; at: number } | null = null;

  constructor(
    private present: T,
    private readonly now: () => number = Date.now,
  ) {}

  get current(): T {
    return this.present;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** One undoable change. `burst` joins it to the last change made with the same key a moment ago (typing in a field). */
  set(next: T, burst?: string): void {
    if (next === this.present) return;
    const at = this.now();
    const joins = burst !== undefined && this.burst?.key === burst && at - this.burst.at < BURST_MS;
    this.burst = burst === undefined ? null : { key: burst, at };
    if (this.pending !== null || joins) {
      this.present = next; // part of a stroke, or of a burst already on the stack
      return;
    }
    this.record(this.present);
    this.present = next;
  }

  /** Start a stroke: every `set` until `end` is one step. */
  begin(): void {
    this.pending ??= this.present;
  }

  /** Finish the stroke: one step if anything changed. */
  end(): void {
    const start = this.pending;
    this.pending = null;
    if (start !== null && start !== this.present) this.record(start);
  }

  undo(): T | null {
    this.end();
    const previous = this.past.pop();
    if (previous === undefined) return null;
    this.future.push(this.present);
    this.burst = null;
    return (this.present = previous);
  }

  redo(): T | null {
    this.end();
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.present);
    this.burst = null;
    return (this.present = next);
  }

  private record(before: T): void {
    this.past.push(before);
    if (this.past.length > DEPTH) this.past.shift();
    this.future = [];
  }
}
