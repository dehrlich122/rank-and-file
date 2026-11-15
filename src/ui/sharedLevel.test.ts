// Opening a shared level (M4.3 step 5d): the pure parts. Levels here are hand-made 2x2 boards, never the repo's.
import { describe, expect, it, vi } from "vitest";
import type { LevelInfo } from "../py/protocol";
import { encodeLevel } from "../share/codec";
import { authorSolution, openShared, sharedSource } from "./sharedLevel";

const level = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "ch01-l01",
  title: "Tiny",
  trains: "moving",
  brief: "Reach the flag.",
  map: ["S.", ".G"],
  par: 2,
  ...extra,
});

const accepted = async (_data?: Record<string, unknown>) => ({ ok: true as const, level: {} as LevelInfo });
const refused = async () => ({ ok: false as const, error: "The board is too wide.", at: null });

describe("sharedSource", () => {
  it("is a level outside every chapter, with no lesson, under the shared id", () => {
    const data = level({ id: "shared-abc123abc123" });
    const source = sharedSource(data);
    expect(source.id).toBe("shared-abc123abc123");
    expect(source.chapter).toBe(0);
    expect(source.mastery).toBe(false);
    expect(source.lesson).toBe("");
    expect(source.title).toBe("Tiny");
    expect(source.trains).toBe("moving");
    expect(source.data === data).toBe(true);
  });

  it("copes with a missing title or trains line", () => {
    const source = sharedSource({ id: "shared-abc123abc123" });
    expect(source.title).toBe("Untitled");
    expect(source.trains).toBe("");
  });
});

describe("authorSolution", () => {
  it("offers the author's code, as text, with no note", async () => {
    const offer = authorSolution(level({ solution: "pawn.move()\n" }));
    expect(offer?.name).toBe("the author's solution");
    expect(offer?.explained).toBe(false);
    const loaded = await offer!.load();
    expect(loaded?.code).toBe("pawn.move()\n");
    expect(loaded?.note).toBe("");
  });

  it("offers nothing without a solution, or with one that isn't text", () => {
    expect(authorSolution(level())).toBeNull();
    expect(authorSolution(level({ solution: "" }))).toBeNull();
    expect(authorSolution(level({ solution: "  \n" }))).toBeNull();
    expect(authorSolution(level({ solution: 7 }))).toBeNull();
    expect(authorSolution(level({ solution: ["pawn.move()"] }))).toBeNull();
    expect(authorSolution(level({ solution: null }))).toBeNull();
  });
});

describe("openShared", () => {
  it("decodes, asks the engine, keeps the level and gives it back under its shared id", async () => {
    const code = await encodeLevel(level({ solution: "x = 1" }));
    const check = vi.fn((data: Record<string, unknown>) => accepted(data));
    const keep = vi.fn();
    const opening = await openShared(code, { check, keep });
    expect(opening.ok).toBe(true);
    if (!opening.ok) return;
    expect(String(opening.data.id)).toMatch(/^shared-[0-9a-f]{12}$/); // never the id it claimed
    expect(check).toHaveBeenCalledOnce();
    expect(check.mock.calls[0]![0] === opening.data).toBe(true); // the engine judges what will be kept
    expect(keep).toHaveBeenCalledOnce();
    expect(keep.mock.calls[0]![0] === opening.data).toBe(true);
  });

  it("opens the same level as the same id every time", async () => {
    const code = await encodeLevel(level());
    const first = await openShared(code, { check: accepted, keep: () => {} });
    const second = await openShared(code, { check: accepted, keep: () => {} });
    expect(first.ok && second.ok && first.data.id === second.data.id).toBe(true);
  });

  it("says why for a damaged code, and asks the engine nothing", async () => {
    const check = vi.fn((data: Record<string, unknown>) => accepted(data));
    const keep = vi.fn();
    const opening = await openShared("rf1.!!!", { check, keep });
    expect(opening.ok).toBe(false);
    if (opening.ok) return;
    expect(opening.reason.length).toBeGreaterThan(10);
    expect(check).not.toHaveBeenCalled();
    expect(keep).not.toHaveBeenCalled();
  });

  it("says why for something that isn't a code", async () => {
    const opening = await openShared("hello", { check: accepted, keep: () => {} });
    expect(opening.ok).toBe(false);
    if (!opening.ok) expect(opening.reason).toContain("rf1");
  });

  it("does not keep a level the engine refuses, and gives the engine's reason", async () => {
    const keep = vi.fn();
    const opening = await openShared(await encodeLevel(level()), { check: refused, keep });
    expect(opening).toEqual({ ok: false, reason: "The board is too wide." });
    expect(keep).not.toHaveBeenCalled();
  });

  it("does not keep a level when the check itself fails (Python would not run)", async () => {
    const keep = vi.fn();
    const broken = async (): Promise<never> => {
      throw new Error("worker gone");
    };
    const opening = await openShared(await encodeLevel(level()), { check: broken, keep });
    expect(opening.ok).toBe(false);
    if (!opening.ok) expect(opening.reason).toContain("worker gone");
    expect(keep).not.toHaveBeenCalled();
  });

  it("hands the carried solution to the engine's check as plain text, and nothing else", async () => {
    // it travels inside the data `loadLevel` checks, which never executes it; no other call is made with it here
    const code = await encodeLevel(level({ solution: "raise SystemExit" }));
    const check = vi.fn((data: Record<string, unknown>) => accepted(data));
    const opening = await openShared(code, { check, keep: () => {} });
    expect(opening.ok).toBe(true);
    expect(check.mock.calls[0]![0].solution).toBe("raise SystemExit");
  });
});
