import { describe, expect, it } from "vitest";
import { chapters } from "../content";
import { ProgressStore } from "../progress";
import { memoryStorage } from "../storage.fake";
import { mountSandbox, sandboxAbilities } from "./sandboxScreen";

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

  it("is mounted by the Free Play route", () => {
    expect(typeof mountSandbox).toBe("function");
  });
});
