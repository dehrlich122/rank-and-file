import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PythonHungError, StoppedError, type PyClient } from "../py/client";
import { asFake, fakeDocument } from "./dom.fake";
import { askTier, tierTags } from "./tierTags";

beforeEach(() => vi.stubGlobal("document", fakeDocument));
afterEach(() => vi.unstubAllGlobals());

// Answers are remembered by level content, so each test asks about a level of its own.
let made = 0;
const newLevel = () => ({ title: `level ${++made}` });
const clientThat = (reply: () => Promise<unknown>) => ({ ready: async () => ({}), call: vi.fn(reply) }) as unknown as PyClient & { call: ReturnType<typeof vi.fn> };
const settle = () => new Promise((resolve) => setTimeout(resolve, 0)); // the answer is a few promises away

/** What the tier slot of a row says once the client has answered (or failed) the `levelTags` request. */
async function tierSlotAfter(reply: () => Promise<unknown>): Promise<string> {
  const tags = tierTags(clientThat(reply), () => false, () => {});
  const level = newLevel();
  tags.ask("my-1", () => level);
  const cell = asFake(tags.slot("my-1", null));
  await settle();
  return cell.find("tags-tier")[0]?.text ?? "(no slot)";
}

describe("a row's tier tag", () => {
  it("shows the tier the engine works out", async () => {
    expect(await tierSlotAfter(async () => ({ tier: "pawn", chapter: 6, refused: false }))).toBe("♟ Pawn");
  });
  it("says 'has problems' when the engine refuses the level", async () => {
    expect(await tierSlotAfter(async () => ({ tier: null, chapter: null, refused: true }))).toBe("has problems");
  });
  it("says nothing when it only couldn't ask: the worker stopped, hung or crashed", async () => {
    for (const error of [new StoppedError(), new PythonHungError(3000), Object.assign(new Error("Worker crashed: out of memory"), { name: "WorkerFailedError" }), new Error("PythonError: Traceback\nKeyError: 'api'")]) {
      expect(await tierSlotAfter(async () => Promise.reject(error))).toBe("");
    }
  });
  it("redraws the list instead when a Tier filter is on", async () => {
    const redraw = vi.fn();
    const tags = tierTags(clientThat(async () => ({ tier: "pawn", chapter: 2, refused: false })), () => true, redraw);
    tags.ask("my-1", newLevel);
    expect(tags.tier("my-1")).toBeNull();
    await settle();
    expect(redraw).toHaveBeenCalledTimes(1);
    expect(tags.tier("my-1")).toBe("pawn");
  });
});

describe("the engine's answers are remembered by level content", () => {
  it("asks once for the same level, whoever asks, and has the tag at the first draw the next time", async () => {
    const client = clientThat(async () => ({ tier: "knight", chapter: 7, refused: false }));
    const level = newLevel();
    expect((await askTier(client, level)).tier).toBe("knight");
    expect((await askTier(client, { ...level })).tier).toBe("knight");
    const tags = tierTags(client, () => false, () => {});
    tags.ask("shared-1", () => level);
    expect(asFake(tags.slot("shared-1", null)).find("tags-tier")[0]!.text).toBe("♟ Knight");
    expect(client.call).toHaveBeenCalledTimes(1);
  });
  it("asks again after a try that couldn't be asked", async () => {
    let up = false;
    const client = clientThat(async () => (up ? { tier: "pawn", chapter: 1, refused: false } : Promise.reject(new StoppedError())));
    const level = newLevel();
    expect(await askTier(client, level)).toEqual({ tier: null, refused: false });
    up = true;
    expect(await askTier(client, level)).toEqual({ tier: "pawn", refused: false });
    expect(client.call).toHaveBeenCalledTimes(2);
  });
});
