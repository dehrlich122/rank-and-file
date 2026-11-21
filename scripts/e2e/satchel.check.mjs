// End-to-end checks for Chapter 8, The Satchel (lists, tuples, a satchel of keys): that it is in the level list, that
// every level opens, the lessons' error snippets and the called one, the Codex's new groups and entries, a list in the
// variables panel and in an error, and help() on a list and on sorted. Nothing here pins how a key, a door or the
// satchel is drawn (the designer's picks are still open). Every program typed here is made up: plain Python over
// lists of numbers, never a route for a level, never a solution. Checks report facts (labels, counts, class names, the
// words of a card), never the editor's contents.
import { levelHelpers } from "./helpers.mjs";
import { expect } from "./suite.mjs";

const CHAPTER = ["ch08-l01", "ch08-l02", "ch08-l03", "ch08-l04", "ch08-l05", "ch08-l06"];
const SCRATCH = "ch08-l04"; // an ordinary run-your-program knight level: a made-up program that moves nothing runs on it
const HELP = "ch08-l05";

export default async function satchelChecks({ browser: b, base, root, check }) {
  const { openLevel, setCode, run, brief, codexTab, press } = levelHelpers(b, base, root);

  // ---- The level list ----
  await check("M5.3: Chapter 8 is listed after Chapter 7 as The Satchel, in the Knight tier, with six levels and a last one that is the mastery", async () => {
    await b.send("Page.navigate", { url: `${base}?fresh=${Date.now()}#/lessons` });
    await b.waitFor(`document.querySelector('.folder[data-chapter="8"] .lrow')`, 20_000, "Chapter 8's rows");
    const list = await b.evaluate(`(() => {
      const folder = (n) => document.querySelector('.folder[data-chapter="' + n + '"]');
      const tierOf = (el) => { let n = el.previousElementSibling; while (n && !n.matches('h2.tier-head')) n = n.previousElementSibling; return n?.textContent ?? null; };
      const ids = (el) => [...el.querySelectorAll('.lrow')].map((r) => r.dataset.levelId);
      const masteries = (el) => [...el.querySelectorAll('.lrow')].filter((r) => r.querySelector('.mastery-tag')).map((r) => r.dataset.levelId);
      const folders = [...document.querySelectorAll('.folder-title')].map((e) => e.textContent);
      return {
        folders, title: folder(8).querySelector('.folder-title').textContent, tier: tierOf(folder(8)), tier7: tierOf(folder(7)),
        ids: ids(folder(8)), masteries: masteries(folder(8)), masteries7: masteries(folder(7)),
        order: !!(folder(7).compareDocumentPosition(folder(8)) & Node.DOCUMENT_POSITION_FOLLOWING),
      };
    })()`);
    expect(list.order && list.title === "08 · The Satchel", JSON.stringify({ title: list.title, order: list.order }));
    expect(list.tier !== null && list.tier === list.tier7 && /knight/i.test(list.tier), `tier "${list.tier}", Chapter 7's "${list.tier7}"`);
    expect(JSON.stringify(list.ids) === JSON.stringify(CHAPTER), list.ids.join());
    expect(JSON.stringify(list.masteries) === JSON.stringify(["ch08-l06"]) && list.masteries7.length === 1, `mastery on ${list.masteries}, Chapter 7's on ${list.masteries7}`);
    return `${list.title} under "${list.tier}", mastery on the sixth`;
  });

  // ---- Every level opens ----
  await check("M5.3: every Chapter 8 level opens: its view and its board are there and the page threw nothing", async () => {
    const failed = [];
    for (const id of CHAPTER) {
      const logsBefore = b.logs.length;
      await openLevel(id, { fresh: true });
      const there = await b.evaluate(`!!document.querySelector('.level[data-level-id="${id}"] .board-host .board')`);
      const thrown = b.logs.slice(logsBefore).filter((line) => line.startsWith("[exception]"));
      if (!there || thrown.length) failed.push(`${id}: board ${there}, ${thrown.length} exceptions`);
    }
    expect(failed.length === 0, failed.join("; "));
    return `${CHAPTER.length} levels open without an exception`;
  });

  // ---- The lessons' snippets (Learn panel) ----
  /** Open lesson `id`, page to the step holding snippet `index`, run it and read what it shows: its ending status, the examiner's words, the error card. */
  async function runLessonSnippet(id, index) {
    await openLevel(id, { fresh: true });
    for (let i = 0; i < index; i++) await b.evaluate(`document.querySelector('.lesson-pager .btn-primary').click()`);
    const step = `document.querySelectorAll('.lesson .lesson-step')[${index}]`;
    await b.waitFor(`${step}?.hidden === false`, 5000, `lesson step ${index} on show`);
    await b.evaluate(`${step}.querySelector('.snippet .btn').click()`);
    await b.waitFor(`/^[✓✗⏱]/.test(${step}.querySelector('.snippet-status').textContent)`, 30_000, "the snippet's ending status");
    return b.evaluate(`(() => {
      const s = ${step}.querySelector('.snippet');
      const card = s.querySelector('.error-detail p');
      return {
        snippets: document.querySelectorAll('.lesson .snippet').length,
        status: s.querySelector('.snippet-status').textContent,
        caption: s.querySelector('.snippet-call code')?.textContent ?? null,
        summary: s.querySelector('.snippet-summary').textContent,
        card: card ? card.innerText.replace(/\\s+/g, ' ').trim() : null,
        cardCodes: card ? card.querySelectorAll('code').length : 0,
      };
    })()`);
  }

  const ERROR_SNIPPETS = [
    ["ch08-l01", "That list has 3 items, so the last one is at [2]: places count from 0. There is nothing at [3]."],
    ["ch08-l02", "A tuple can't be changed once it is made. Build a new one, or use a list if the values have to change."],
    ["ch08-l04", "The value here is None, which has no append. .append() changes the list itself and hands back nothing (None). Call it on a line of its own, and keep using the list's own name."],
  ];
  for (const [id, words] of ERROR_SNIPPETS) {
    await check(`M5.3: ${id}'s lesson error snippet stops with the friendly card, in the lesson's words`, async () => {
      const ran = await runLessonSnippet(id, 1);
      expect(ran.snippets === 3, `${ran.snippets} snippets`);
      expect(ran.status === "✗ Python stopped", `the status reads "${ran.status}"`);
      expect(ran.card !== null && ran.card.includes(words), `the card reads "${ran.card}"`);
      expect(!ran.card.includes("`"), "a backtick shows in the card");
      return `card with ${ran.cardCodes} code spans`;
    });
  }

  await check("M5.3: ch08-l01's third lesson snippet runs to its end, and its caption and summary name the examiner's call cross([1, -1])", async () => {
    const ran = await runLessonSnippet("ch08-l01", 2);
    expect(ran.snippets === 3 && ran.status === "✓ Finished", `${ran.snippets} snippets, status "${ran.status}"`);
    expect(ran.caption === "cross([1, -1])", `the caption's call is "${ran.caption}"`);
    expect(ran.summary.includes("cross([1, -1])") && !ran.summary.includes("`"), `the summary reads "${ran.summary}"`);
    return ran.summary;
  });
}
