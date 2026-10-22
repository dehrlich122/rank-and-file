// The share codec (M4.3 step 5). Levels here are hand-made 2x2 boards, never the repo's.
import { afterEach, describe, expect, it, vi } from "vitest";
import { codeFromText, decodeLevel, encodeLevel, MAX_CODE_LENGTH, MAX_LEVEL_BYTES, ShareError, shareLink, sharedId } from "./codec";

const level = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "ch01-l01",
  title: "Tiny",
  brief: "Reach the flag.",
  map: ["S.", ".G"],
  hints: ["Look left", "Then right"],
  par: 2,
  ...extra,
});

/** A code built by hand from raw bytes, for the inputs `encodeLevel` would never make. */
async function codeOfBytes(bytes: Uint8Array, prefix = "rf1."): Promise<string> {
  const packed = new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  const text = btoa(Array.from(packed, (byte) => String.fromCharCode(byte)).join(""));
  return prefix + text.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const codeOfText = (text: string, prefix?: string) => codeOfBytes(new TextEncoder().encode(text), prefix);

async function refusal(code: string): Promise<string> {
  const error = await decodeLevel(code).then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(ShareError);
  return (error as ShareError).message;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("round trip", () => {
  it("gives the level back with only its id changed to the shared id", async () => {
    const original = level();
    const code = await encodeLevel(original);
    expect(code.startsWith("rf1.")).toBe(true);
    expect(code).toMatch(/^rf1\.[A-Za-z0-9_-]+$/); // base64url: no padding, no + or /
    const back = await decodeLevel(code);
    expect(back).toEqual({ ...original, id: await sharedId(original) });
  });

  it("trims whitespace around a code", async () => {
    const code = await encodeLevel(level());
    expect((await decodeLevel(`  \n${code}\t `)).title).toBe("Tiny");
  });

  it("keeps non-ASCII text", async () => {
    const back = await decodeLevel(await encodeLevel(level({ title: "Café ♞ 日本" })));
    expect(back.title).toBe("Café ♞ 日本");
  });
});

describe("the shared id", () => {
  it("replaces a curriculum id", async () => {
    const back = await decodeLevel(await encodeLevel(level({ id: "ch01-l01" })));
    expect(back.id).toMatch(/^shared-[0-9a-f]{12}$/);
  });

  it("is the same for any key order or claimed id, and different for different content", async () => {
    const a = level({ id: "one", nested: { x: 1, y: [1, { p: 1, q: 2 }] } });
    const b = { nested: { y: [1, { q: 2, p: 1 }], x: 1 }, par: 2, hints: ["Look left", "Then right"], map: ["S.", ".G"], brief: "Reach the flag.", title: "Tiny", id: "two" };
    const { id: _dropped, ...noId } = a;
    expect(await sharedId(a)).toBe(await sharedId(b));
    expect(await sharedId(a)).toBe(await sharedId(noId));
    expect(await sharedId(level({ title: "Tiny!" }))).not.toBe(await sharedId(level()));
    expect(await sharedId(level({ hints: ["Then right", "Look left"] }))).not.toBe(await sharedId(level())); // arrays keep their order
  });

  it("is the same through a code, whatever id it claimed", async () => {
    const first = await decodeLevel(await encodeLevel(level({ id: "mine" })));
    const second = await decodeLevel(await encodeLevel(level({ id: "ch02-l05" })));
    expect(first.id).toBe(second.id);
  });

  it("refuses a level nested absurdly deep instead of overflowing the stack", async () => {
    let deep: unknown = 1;
    for (let i = 0; i < 5000; i++) deep = [deep];
    await expect(sharedId({ deep })).rejects.toBeInstanceOf(ShareError);
  });
});

describe("refusals", () => {
  it("each has its own wording", async () => {
    const good = await encodeLevel(level());
    const noPrefix = await refusal("hello world");
    const newer = await refusal(await codeOfText("{}", "rf2."));
    const tooLong = await refusal(`rf1.${"A".repeat(MAX_CODE_LENGTH)}`);
    const badChars = await refusal("rf1.abc def$");
    const truncated = await refusal(good.slice(0, Math.floor(good.length / 2)));
    const garbage = await refusal("rf1.AAAAAAAA");
    const notJson = await refusal(await codeOfText("this is not json"));
    const notObject = await refusal(await codeOfText("[1, 2, 3]"));
    const badUtf8 = await refusal(await codeOfBytes(new Uint8Array([0x7b, 0xff, 0xfe, 0x7d])));
    const all = [noPrefix, newer, tooLong, badChars, truncated, notJson, notObject, badUtf8];
    expect(new Set(all).size).toBe(all.length);
    expect(garbage).toBe(truncated); // both are "damaged or cut off"
    expect(newer).toMatch(/newer version/);
    expect(noPrefix).toMatch(/rf1/);
    expect(tooLong).toMatch(/too long/);
    expect(truncated).toMatch(/damaged or cut off/);
    for (const message of all) expect(message).not.toMatch(/Error|stack|undefined|zlib|JSON/); // plain words
  });

  it("refuses an empty body and a body of an impossible length", async () => {
    expect(await refusal("rf1.")).toMatch(/damaged or cut off/);
    expect(await refusal("rf1.A")).toMatch(/damaged or cut off/);
  });

  it("refuses JSON that is null, a number or a string", async () => {
    for (const text of ["null", "42", '"level"', "true"]) expect(await refusal(await codeOfText(text))).toMatch(/other than a level/);
  });
});

describe("the size caps", () => {
  it("refuses a bomb as too big, and stops reading early", async () => {
    // 5 MB of one character deflates to a few KB, well inside the code cap.
    const bomb = await codeOfText(JSON.stringify(level({ brief: "a".repeat(5 * 1024 * 1024) })));
    expect(bomb.length).toBeLessThan(MAX_CODE_LENGTH);
    const read = vi.spyOn(ReadableStreamDefaultReader.prototype, "read");
    const cancel = vi.spyOn(ReadableStreamDefaultReader.prototype, "cancel");
    expect(await refusal(bomb)).toMatch(/far too big/);
    const sizes = (await Promise.all(read.mock.results.map((r) => r.value as Promise<{ value?: Uint8Array }>))).map((r) => r.value?.length ?? 0);
    const total = sizes.reduce((sum, n) => sum + n, 0);
    expect(total).toBeGreaterThan(MAX_LEVEL_BYTES); // it did read past the cap...
    expect(total).toBeLessThan(MAX_LEVEL_BYTES + 512 * 1024); // ...and stopped, far short of 5 MB
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("accepts a level just under the byte cap", async () => {
    const big = level({ brief: "ab".repeat(20_000) });
    expect(JSON.stringify(big).length).toBeLessThan(MAX_LEVEL_BYTES);
    expect((await decodeLevel(await codeOfText(JSON.stringify(big)))).brief).toBe(big.brief);
  });

  it("encodeLevel refuses a level whose code would be too long", async () => {
    let seed = 12345; // incompressible text: random printable characters
    const noise = Array.from({ length: 40_000 }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return String.fromCharCode(33 + ((seed >>> 16) % 90));
    }).join("");
    const error = await encodeLevel(level({ brief: noise })).then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(ShareError);
    expect((error as ShareError).message).toMatch(/too big to share as a link/);
  });

  it("refuses a code over the length cap before decoding it", async () => {
    expect(await refusal(`rf1.${"A".repeat(MAX_CODE_LENGTH + 1)}`)).toMatch(/too long/);
  });
});

describe("codeFromText", () => {
  const code = "rf1.abc-_123";

  it("takes the code from a whole link, path and all", () => {
    expect(codeFromText(`https://dehrlich122.github.io/rank-and-file/#/play/${code}`)).toBe(code);
    expect(codeFromText(`  http://localhost:5173/#/play/${code}\n`)).toBe(code);
  });

  it("takes the part after the last marker", () => {
    expect(codeFromText(`see #/play/junk and #/play/${code}`)).toBe(code);
  });

  it("takes a bare code, with spaces around it", () => {
    expect(codeFromText(`   ${code}  `)).toBe(code);
    expect(codeFromText("rf2.xyz")).toBe("rf2.xyz"); // a newer version is decodeLevel's to explain
  });

  it("gives null for anything else", () => {
    expect(codeFromText("")).toBeNull();
    expect(codeFromText("hello there")).toBeNull();
    expect(codeFromText("https://example.com/#/level/ch01-l01")).toBeNull();
    expect(codeFromText("https://example.com/#/play/")).toBeNull();
  });
});

describe("shareLink", () => {
  it("joins the base and the code", () => {
    expect(shareLink("rf1.abc", "https://x.github.io/rank-and-file/")).toBe("https://x.github.io/rank-and-file/#/play/rf1.abc");
  });

  it("defaults to this page's origin and path, so the site's subpath is kept", () => {
    vi.stubGlobal("location", { origin: "https://x.github.io", pathname: "/rank-and-file/" });
    expect(shareLink("rf1.abc")).toBe("https://x.github.io/rank-and-file/#/play/rf1.abc");
  });

  it("makes a link that codeFromText reads back", async () => {
    const code = await encodeLevel(level());
    expect(codeFromText(shareLink(code, "http://localhost:5173/"))).toBe(code);
  });
});
