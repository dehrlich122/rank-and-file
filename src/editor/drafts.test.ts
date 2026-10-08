import { describe, expect, it } from "vitest";
import { memoryStorage } from "../storage.fake";
import { blankDraft } from "./draft";
import { DraftStore } from "./drafts";

describe("DraftStore", () => {
  it("starts empty", () => {
    expect(new DraftStore(memoryStorage()).list()).toEqual([]);
  });

  it("saves a level and reads it back in a new session", () => {
    const storage = memoryStorage();
    const draft = { ...blankDraft(5, 4, "my-a"), title: "Mine" };
    draft.cells[1]![2] = { tile: "sign", text: "Hello" };
    new DraftStore(storage, () => 1000).save(draft);
    const again = new DraftStore(storage);
    expect(again.list()).toEqual([{ id: "my-a", title: "Mine", width: 5, height: 4, edited: 1000 }]);
    const back = again.load("my-a")!;
    expect(back.cells[1]![2]).toMatchObject({ tile: "sign", text: "Hello" });
    expect([back.width, back.height, back.start, back.goal]).toEqual([5, 4, [0, 0], [4, 3]]);
  });

  it("lists the level edited last first, and saving again moves it up", () => {
    let now = 0;
    const store = new DraftStore(memoryStorage(), () => ++now);
    store.save(blankDraft(3, 3, "my-a"));
    store.save(blankDraft(3, 3, "my-b"));
    expect(store.list().map((entry) => entry.id)).toEqual(["my-b", "my-a"]);
    store.save(blankDraft(3, 3, "my-a"));
    expect(store.list().map((entry) => entry.id)).toEqual(["my-a", "my-b"]);
  });

  it("removes a level", () => {
    const storage = memoryStorage();
    const store = new DraftStore(storage);
    store.save(blankDraft(3, 3, "my-a"));
    store.remove("my-a");
    expect(store.load("my-a")).toBeNull();
    expect(new DraftStore(storage).list()).toEqual([]);
  });

  it("skips a damaged entry and keeps the rest", () => {
    const good = new DraftStore(memoryStorage());
    good.save(blankDraft(3, 3, "my-good"));
    const raw = JSON.parse(JSON.stringify({ levels: {} }));
    const storage = memoryStorage({ "rank-and-file:editor": JSON.stringify(raw) });
    const store = new DraftStore(storage);
    store.save(blankDraft(3, 3, "my-good"));
    const key = JSON.parse(storage.getItem("rank-and-file:editor")!);
    key.levels["my-bad"] = { data: { title: "no map" }, edited: 5 };
    key.levels["my-worse"] = "nonsense";
    storage.setItem("rank-and-file:editor", JSON.stringify(key));
    expect(new DraftStore(storage).list().map((entry) => entry.id)).toEqual(["my-good"]);
  });

  it("copes with storage holding something else, and with no storage at all", () => {
    expect(new DraftStore(memoryStorage({ "rank-and-file:editor": "[1, 2" })).list()).toEqual([]);
    expect(new DraftStore(memoryStorage({ "rank-and-file:editor": '"text"' })).list()).toEqual([]);
    const store = new DraftStore(null);
    store.save(blankDraft(3, 3, "my-a"));
    expect(store.load("my-a")?.id).toBe("my-a");
  });
});
