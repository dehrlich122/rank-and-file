import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PythonHungError, StoppedError, type PyClient } from "../py/client";
import { boardsText, starsText, tierTags } from "./editorList";

describe("shared level rows", () => {
  it("words the stars", () => {
    expect(starsText(0)).toBe("not solved yet");
    expect(starsText(2)).toBe("★★☆");
    expect(starsText(3)).toBe("★★★");
  });
  it("words the boards", () => {
    expect(boardsText(1)).toBe("1 board");
    expect(boardsText(3)).toBe("3 boards");
  });
});

// A document whose elements keep only what these tests read: their class and their text.
interface Node2 {
  cls: string;
  parts: Array<Node2 | string>;
  setAttribute(name: string, value: string): void;
  addEventListener(): void;
  append(...nodes: Array<Node2 | string>): void;
  replaceChildren(...nodes: Array<Node2 | string>): void;
}
const text = (node: Node2 | string): string => (typeof node === "string" ? node : node.parts.map(text).join(""));
const slotOf = (node: Node2, cls: string): Node2 | undefined =>
  node.cls.split(" ").includes(cls) ? node : node.parts.flatMap((part) => (typeof part === "string" ? [] : [slotOf(part, cls)])).find(Boolean);
const element = (): Node2 => ({
  cls: "",
  parts: [],
  setAttribute(name, value) {
    if (name === "class") this.cls = value;
  },
  addEventListener() {},
  append(...nodes) {
    this.parts.push(...nodes);
  },
  replaceChildren(...nodes) {
    this.parts = nodes;
  },
});

beforeEach(() => vi.stubGlobal("document", { createElement: element }));
afterEach(() => vi.unstubAllGlobals());

/** What the tier slot of a row says once the client has answered (or failed) the `levelTags` request. */
async function tierSlotAfter(reply: () => Promise<unknown>): Promise<string> {
  const client = { ready: async () => ({}), call: reply } as unknown as PyClient;
  const tags = tierTags(client, () => false, () => {});
  const cell = tags.slot("my-1", null) as unknown as Node2;
  tags.ask("my-1", () => ({}));
  await new Promise((resolve) => setTimeout(resolve, 0)); // the answer is a few promises away
  const slot = slotOf(cell, "tags-tier");
  return slot ? text(slot) : "(no slot)";
}

describe("a row's tier tag", () => {
  it("shows the tier the engine works out", async () => {
    expect(await tierSlotAfter(async () => ({ tier: "pawn", chapter: 6 }))).toBe("♟ Pawn");
  });
  it("says 'has problems' when the engine refuses the level", async () => {
    const refusal = new Error('PythonError: Traceback (most recent call last):\n  File "/engine/rankfile/bridge.py", line 90, in level_tags\nrankfile.levels.LevelError: the title is too long');
    expect(await tierSlotAfter(async () => Promise.reject(refusal))).toBe("has problems");
  });
  it("says nothing when it only couldn't ask: the worker stopped, hung or crashed", async () => {
    for (const error of [new StoppedError(), new PythonHungError(3000), Object.assign(new Error("Worker crashed: out of memory"), { name: "WorkerFailedError" }), new Error("PythonError: Traceback\nKeyError: 'api'")]) {
      expect(await tierSlotAfter(async () => Promise.reject(error))).toBe("");
    }
  });
});
