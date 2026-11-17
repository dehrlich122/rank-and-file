// The Rules tab's par section: the Sandbox's scratch level keeps only the starter code.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blankDraft } from "../editor/draft";
import { asFake, fakeDocument, type Fake } from "./dom.fake";
import type { PropsContext } from "./editorProps";
import { rulesFields } from "./editorRules";

// the counter touches classList, which the fake document has no use for
vi.mock("./editorFields", async (original) => ({ ...(await original<typeof import("./editorFields")>()), counter: () => document.createElement("span") }));

const context = (scratch: boolean) => ({ draft: blankDraft(), options: { constructs: [], limits: { starter: 600 } }, scratch, solutionLines: null, change: () => {} }) as unknown as PropsContext;
const fields = (root: Fake, name: string): Fake[] => [...(root.attributes.get("data-field") === name ? [root] : []), ...root.children.flatMap((child) => (typeof child === "string" ? [] : fields(child, name)))];
const heading = (root: Fake) => root.all("h3").map((h3) => h3.text).filter((text) => /starter/i.test(text));

describe("the par section", () => {
  beforeEach(() => vi.stubGlobal("document", fakeDocument));
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the par field, the solution block and the starter code on a level", () => {
    const body = asFake(rulesFields(context(false)));
    expect(heading(body)).toEqual(["Par and starter code"]);
    expect([fields(body, "par").length, fields(body, "solution").length, fields(body, "starter").length]).toEqual([1, 1, 1]);
  });

  it("leaves only the starter code on the scratch level", () => {
    const body = asFake(rulesFields(context(true)));
    expect(heading(body)).toEqual(["Starter code"]);
    expect([fields(body, "par").length, fields(body, "solution").length, fields(body, "starter").length]).toEqual([0, 0, 1]);
  });
});
