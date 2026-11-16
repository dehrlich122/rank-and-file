import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chapters } from "../content";
import { ProgressStore } from "../progress";
import { memoryStorage } from "../storage.fake";
import { type Fake, fakeDocument } from "./dom.fake";
import { abilitiesLine, boardIsLoaded, sandboxAbilities } from "./sandboxScreen";

const apiOf = (id: string) => chapters.flatMap((c) => c.levels).find((l) => l.id === id)!.data.api as string[];
const solve = (store: ProgressStore, id: string) => store.update(id, { stars: 1 });

describe("sandboxAbilities", () => {
  it("is just move when nothing is solved", () => {
    expect(sandboxAbilities(new ProgressStore(null))).toEqual(["move"]);
  });

  it("adds the abilities of solved curriculum levels, once each, in play order", () => {
    const store = new ProgressStore(memoryStorage());
    const levels = chapters.filter((c) => c.curriculum).flatMap((c) => c.levels);
    levels.slice(0, 12).forEach((level) => solve(store, level.id));
    const abilities = sandboxAbilities(store);
    expect(abilities[0]).toBe("move");
    expect(new Set(abilities).size).toBe(abilities.length);
    for (const level of levels.slice(0, 12)) for (const name of apiOf(level.id)) expect(abilities).toContain(name);
    expect(abilities.length).toBeGreaterThan(1);
  });

  it("ignores levels outside the curriculum", () => {
    const store = new ProgressStore(memoryStorage());
    for (const chapter of chapters.filter((c) => !c.curriculum)) chapter.levels.forEach((level) => solve(store, level.id));
    expect(sandboxAbilities(store)).toEqual(["move"]);
  });
});

describe("the Sandbox's page furniture", () => {
  beforeEach(() => vi.stubGlobal("document", fakeDocument));
  afterEach(() => vi.unstubAllGlobals());

  it("lists the abilities in code, after 'You can use:'", () => {
    const line = abilitiesLine(["move", "turn_left"]) as unknown as Fake;
    expect(line.text).toBe("You can use: move · turn_left");
    expect(line.children.filter((k) => typeof k !== "string" && k.tag === "code").length).toBe(2);
    expect((abilitiesLine(["move"]) as unknown as Fake).text).toBe("You can use: move");
  });

  it("holds Run back while the loading note is in the board's place", () => {
    const loading = { querySelector: (selector: string) => (selector === ".board-loading" ? {} : null) };
    expect(boardIsLoaded(loading)).toBe(false);
    expect(boardIsLoaded({ querySelector: () => null })).toBe(true);
  });
});
