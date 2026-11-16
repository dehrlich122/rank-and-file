import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveDraft } from "./save-level-plugin.ts";

let root = "";
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "rf-save-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const drafts = () => (existsSync(join(root, "drafts")) ? readdirSync(join(root, "drafts")).sort() : []);

describe("saveDraft", () => {
  it("writes the level, and the solution beside it when there is one", () => {
    const answer = saveDraft(root, { id: "a", yaml: "y: 1", solution: "move()" }, 10);
    expect(answer).toEqual({ status: 200, body: { saved: ["drafts/a.yaml", "drafts/a.py"], removed: [] } });
    expect(drafts()).toEqual(["a.py", "a.yaml"]);
  });

  it("answers an existing level with a 200 and exists: true, writing nothing, until told to replace it", () => {
    saveDraft(root, { id: "a", yaml: "y: 1" }, 10);
    expect(saveDraft(root, { id: "a", yaml: "y: 2" }, 10)).toEqual({ status: 200, body: { exists: true } });
    expect(saveDraft(root, { id: "a", yaml: "y: 2", overwrite: true }, 10).body).toEqual({ saved: ["drafts/a.yaml"], removed: [] });
  });

  it("removes the old solution when the new save has none, and says so", () => {
    saveDraft(root, { id: "a", yaml: "y: 1", solution: "move()" }, 10);
    const answer = saveDraft(root, { id: "a", yaml: "y: 1", overwrite: true }, 10);
    expect(answer.body).toEqual({ saved: ["drafts/a.yaml"], removed: ["drafts/a.py"] });
    expect(drafts()).toEqual(["a.yaml"]);
  });

  it("touches no other file, and refuses a bad id with a 4xx", () => {
    writeFileSync(join(root, "b.py"), "keep", "utf8");
    saveDraft(root, { id: "a", yaml: "y: 1" }, 10);
    expect(drafts()).toEqual(["a.yaml"]);
    expect(existsSync(join(root, "b.py"))).toBe(true);
    for (const id of ["../b", "A", "a/b", ""]) {
      const answer = saveDraft(root, { id, yaml: "y: 1", overwrite: true }, 10);
      expect(answer.status).toBe(400);
    }
    expect(drafts()).toEqual(["a.yaml"]);
  });
});
