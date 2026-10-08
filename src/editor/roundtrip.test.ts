// Every level in the game goes through the editor's draft code and the real engine (the level checker, in
// Python): read as a draft, written again, and drawn. The engine must describe the rewritten level exactly as
// it describes the original, and the drawing data must match its own (scripts/compare_levels.py).
// It prints counts and field names only: a level's description holds its hints.
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { draftToLevelInfo } from "./draft";
import { parseYaml } from "../content";
import { draftToLevelData, draftToYaml, levelDataToDraft, yamlToDraft } from "./levelData";

const files = import.meta.glob<string>("/levels/*/*.yaml", { query: "?raw", import: "default", eager: true });
const levels = Object.entries(files).map(([path, source]) => ({ path, data: parse(source, { version: "1.1" }) as Record<string, unknown> }));

// Node's own modules, which this browser-typed project doesn't have types for.
type Run = (command: string, args: string[], options: object) => { status: number | null; stdout: string; stderr: string };
const nodeModule = async (name: string): Promise<Record<string, unknown>> => import(/* @vite-ignore */ name);

describe("every level in the game", () => {
  it("is found", () => {
    expect(levels.length).toBeGreaterThanOrEqual(45);
  });

  it("is written again as the same level, by the draft and by its YAML text", () => {
    // compared as true or false, so a failure never prints a level (its hints are spoilers)
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    for (const { path, data } of levels) {
      const draft = levelDataToDraft(data);
      expect(same(draftToLevelData(draft), draftToLevelData(yamlToDraft(draftToYaml(draft)))), `${path}: the draft written, read and written again`).toBe(true);
      // reading the text a draft was written to gives the same level back: the YAML layout never changes the data
      expect(same(parseYaml(draftToYaml(draft)), draftToLevelData(draft)), `${path}: the YAML text read back`).toBe(true);
    }
  });

  it("is described by the engine as before, and drawn as the engine describes it", async () => {
    const fs = (await nodeModule("node:fs")) as { writeFileSync(path: string, text: string): void; mkdtempSync(prefix: string): string; rmSync(path: string, options: object): void };
    const os = (await nodeModule("node:os")) as { tmpdir(): string };
    const path = (await nodeModule("node:path")) as { join(...parts: string[]): string };
    const child = (await nodeModule("node:child_process")) as { spawnSync: Run };

    const entries: Record<string, unknown> = {};
    for (const { data } of levels) {
      const draft = levelDataToDraft(data);
      entries[String(data.id)] = { original: data, exported: draftToLevelData(draft), info: draftToLevelInfo(draft) };
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rank-and-file-"));
    try {
      const file = path.join(dir, "levels.json");
      fs.writeFileSync(file, JSON.stringify(entries));
      const result = child.spawnSync("node", ["scripts/venv.mjs", "scripts.compare_levels", file], { encoding: "utf-8" });
      // the script prints counts and field names only, so its output is safe to show
      expect(result.stdout, result.stderr).toMatch(/^\d+ levels checked, 0 differ$/m);
      expect(result.status).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
