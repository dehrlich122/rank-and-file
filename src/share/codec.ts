// Share codes (M4.3 step 5, docs/M4/M4.3.md sections 5 and 6): a level travels as `rf1.` + base64url of the deflated
// JSON of its level file, inside a link `…/#/play/<code>`. A code can come from anyone, so decoding is defensive: the
// code is size-capped, decompression is read in chunks and stopped past MAX_LEVEL_BYTES (a compression bomb never
// fills memory), and the level's id is rewritten to one derived from its content, so a stranger's level can never
// pose as a curriculum level (progress, reference solutions and the Codex are all looked up by id). Nothing here
// evaluates anything: the result is plain data for the engine to judge.

/** The longest code we make or accept, in characters. */
export const MAX_CODE_LENGTH = 20_000;
/** The most a code may decompress to, in bytes (the same cap as a `.yaml` file). */
export const MAX_LEVEL_BYTES = 64 * 1024;

const PREFIX = "rf1.";
const CODE_PREFIX = /^rf(\d+)\./;
const NESTING_LIMIT = 200; // a real level is 6 deep or so; this only stops a hostile one from overflowing the stack

/** A code that can't be used. The message is for the player: plain words, no jargon. */
export class ShareError extends Error {}

/** A level as a share code. */
export async function encodeLevel(data: Record<string, unknown>): Promise<string> {
  const packed = await deflate(new TextEncoder().encode(JSON.stringify(data)));
  const code = PREFIX + toBase64Url(packed);
  if (code.length > MAX_CODE_LENGTH) {
    throw new ShareError("This level is too big to share as a link. Shorten its text, or use fewer boards, and try again.");
  }
  return code;
}

/** What a code holds, with its `id` replaced by the content id. Throws ShareError when the code can't be used. */
export async function decodeLevel(code: string): Promise<Record<string, unknown>> {
  const text = code.trim();
  if (!text.startsWith(PREFIX)) {
    const version = CODE_PREFIX.exec(text);
    throw new ShareError(
      version
        ? "This level code was made by a newer version of Rank & File. Reload the page, or ask for a link from the same version."
        : "That isn't a Rank & File level code. A level code starts with rf1.",
    );
  }
  if (text.length > MAX_CODE_LENGTH) throw new ShareError("This level code is too long to be a real level.");
  const body = text.slice(PREFIX.length);
  if (!/^[A-Za-z0-9_-]*$/.test(body)) {
    throw new ShareError("This level code has characters a level code never has. It was probably changed or copied wrongly.");
  }
  const damaged = new ShareError("This level code is damaged or cut off, so it can't be opened. Ask for it again.");
  if (body.length % 4 === 1) throw damaged; // no byte string encodes to this many characters
  const unpacked = await inflate(fromBase64Url(body), damaged);
  let json: string;
  try {
    json = new TextDecoder("utf-8", { fatal: true }).decode(unpacked);
  } catch {
    throw new ShareError("This level code holds text that can't be read. It was probably damaged.");
  }
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new ShareError("This level code holds text, but not a level. It was probably damaged.");
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new ShareError("This level code holds something other than a level.");
  }
  return { ...(data as Record<string, unknown>), id: await sharedId(data as Record<string, unknown>) };
}

/**
 * The id a shared level gets: `shared-` and the first 12 hex characters of a SHA-256 over its content without its id,
 * with object keys in sorted order. The same level always gets the same id, whatever its key order or claimed id.
 */
export async function sharedId(data: Record<string, unknown>): Promise<string> {
  const { id: _claimed, ...content } = data;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(content, 0)));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `shared-${hex.slice(0, 12)}`;
}

/** The code in pasted text: a whole link, or a bare code. Null when it holds neither. */
export function codeFromText(text: string): string | null {
  const marker = "#/play/";
  const at = text.lastIndexOf(marker);
  if (at >= 0) return text.slice(at + marker.length).trim() || null;
  const bare = text.trim();
  return /^rf\d+\./.test(bare) ? bare : null;
}

/** A link that opens the level. The site lives under a path (`/rank-and-file/`), so the base keeps it. */
export function shareLink(code: string, base = location.origin + location.pathname): string {
  return `${base}#/play/${code}`;
}

/** JSON with every object's keys sorted, so equal content gives equal text. */
function canonical(value: unknown, depth: number): string {
  if (depth > NESTING_LIMIT) throw new ShareError("This level is nested too deeply to be a real level.");
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item, depth + 1)).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item, depth + 1)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Decompress, reading in chunks and giving up as soon as the output passes MAX_LEVEL_BYTES. */
async function inflate(bytes: Uint8Array, damaged: ShareError): Promise<Uint8Array> {
  const stream = new DecompressionStream("deflate");
  const writer = stream.writable.getWriter();
  // Fed beside the reading below: awaiting it first would stall once the stream's buffer fills. A failure here also
  // fails the reading, which is where it is reported.
  void writer.write(bytes as BufferSource).then(() => writer.close()).catch(() => undefined);
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_LEVEL_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new ShareError("This level is far too big to be a real level, so it wasn't opened.");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ShareError) throw error;
    throw damaged;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let at = 0; at < bytes.length; at += 8192) binary += String.fromCharCode(...bytes.subarray(at, at + 8192));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  return Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
}
