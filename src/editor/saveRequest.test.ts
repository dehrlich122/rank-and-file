import { describe, expect, it } from "vitest";
import { checkSaveRequest, MAX_SAVE_BYTES } from "./saveRequest";

const paths = (body: unknown): string[] | null => {
  const checked = checkSaveRequest(body);
  return checked.ok ? checked.files.map((f) => f.path) : null;
};

describe("checkSaveRequest", () => {
  it("accepts plain ids", () => {
    for (const id of ["a", "my-abc123", "level-2", "x".repeat(60)]) expect(paths({ id, yaml: "a: 1" })).toEqual([`drafts/${id}.yaml`]);
  });

  it("refuses ids that could leave drafts/ or are malformed", () => {
    for (const id of ["", "../x", "a/b", "a\\b", "A", "a_b", "-a", "a-", "a--b", "a.b", "x".repeat(61), " a", "a\n"]) {
      const checked = checkSaveRequest({ id, yaml: "a: 1" });
      expect(checked.ok).toBe(false);
      if (!checked.ok) expect(checked.status).toBe(400);
    }
    expect(checkSaveRequest({ id: 5, yaml: "a: 1" }).ok).toBe(false);
    expect(checkSaveRequest({ yaml: "a: 1" }).ok).toBe(false);
  });

  it("needs the level as text and a body that is an object", () => {
    expect(checkSaveRequest({ id: "a", yaml: 3 }).ok).toBe(false);
    expect(checkSaveRequest({ id: "a" }).ok).toBe(false);
    expect(checkSaveRequest(null).ok).toBe(false);
    expect(checkSaveRequest([]).ok).toBe(false);
    expect(checkSaveRequest("a").ok).toBe(false);
  });

  it("caps the size", () => {
    const checked = checkSaveRequest({ id: "a", yaml: "x" }, MAX_SAVE_BYTES + 1);
    expect(!checked.ok && checked.status).toBe(413);
    expect(checkSaveRequest({ id: "a", yaml: "x" }, MAX_SAVE_BYTES).ok).toBe(true);
  });

  it("writes the solution beside the level only when there is one", () => {
    expect(paths({ id: "a", yaml: "y", solution: "move()" })).toEqual(["drafts/a.yaml", "drafts/a.py"]);
    expect(paths({ id: "a", yaml: "y", solution: "  \n" })).toEqual(["drafts/a.yaml"]);
    expect(paths({ id: "a", yaml: "y", solution: "" })).toEqual(["drafts/a.yaml"]);
    expect(checkSaveRequest({ id: "a", yaml: "y", solution: 4 }).ok).toBe(false);
  });

  it("uses \\n line endings and reads overwrite only when it is exactly true", () => {
    const checked = checkSaveRequest({ id: "a", yaml: "a\r\nb\rc", overwrite: true });
    expect(checked.ok && checked.files[0]!.text).toBe("a\nb\nc");
    expect(checked.ok && checked.overwrite).toBe(true);
    const no = checkSaveRequest({ id: "a", yaml: "y", overwrite: "true" });
    expect(no.ok && no.overwrite).toBe(false);
  });
});
