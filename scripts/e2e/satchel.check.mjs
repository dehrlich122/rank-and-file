// End-to-end checks for Chapter 8, The Satchel (lists, tuples, a satchel of keys): that it is in the level list, that
// every level opens, the lessons' error snippets and the called one, the Codex's new groups and entries, a list in the
// variables panel and in an error, and help() on a list and on sorted; then keys, doors and the satchel played for real
// on ch08-l03 (the page's own sentences and tiles, which follow the state the engine reports, through a run, a rewind and
// the other boards). Every program typed in the first part is made up: plain Python over lists of numbers. The second part
// types jumps it works out itself from what the board shows (a breadth-first search over a knight's jumps, never a stored
// route): they are part of a way through a real level, so no check reports them, a program's text or an examiner's answer.
// Checks report facts (labels, counts, class names, the words of a card), never the editor's contents.
import { sleep } from "./cdp.mjs";
import { examinerHelpers, lessonHelpers, levelHelpers, settingsHelpers } from "./helpers.mjs";
import { expect } from "./suite.mjs";

const CHAPTER = ["ch08-l01", "ch08-l02", "ch08-l03", "ch08-l04", "ch08-l05", "ch08-l06"];
const SCRATCH = "ch08-l04"; // an ordinary run-your-program knight level: a made-up program that moves nothing runs on it
const HELP = "ch08-l05";
const EXAMINER = "ch08-l06"; // an examiner level whose calls carry lists and which wants an answer handed back
const MARK = { no: "✗" };

export default async function satchelChecks({ browser: b, base, root, check }) {
  const { openLevel, setCode, run, brief, codexTab, press, toStart } = levelHelpers(b, base, root);
  const { lessonAt, runSnippet } = lessonHelpers(b, openLevel);
  const { examinerView, examinerCard, challengeCalls, stubFunction } = examinerHelpers(b);

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
    await lessonAt(id, index);
    return runSnippet(index);
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

  // ---- A list in the variables panel, and in an error ----
  /** Open level `id` fresh, type the made-up `code` and run it (to the last frame); returns the outcome card. */
  async function runMadeUp(id, code) {
    await openLevel(id, { fresh: true });
    await setCode(code);
    return run();
  }
  /** Back to the first frame, then forward one step at a time to the last: what `read()` gives at each frame. */
  async function framesOf(read) {
    const label = () => b.evaluate(`document.querySelector('.step-label').textContent`);
    await toStart();
    const frames = [await read()];
    const total = Number(/of (\d+)/.exec(await label())?.[1]);
    for (let i = 0; i < total; i++) {
      const before = await label();
      await press(3);
      await b.waitFor(`document.querySelector('.step-label').textContent !== ${JSON.stringify(before)}`, 5000, "the next step");
      frames.push(await read());
    }
    return frames;
  }
  /** The variables panel as {vars: {name: value}}. */
  const panel = () =>
    b.evaluate(`({ vars: Object.fromEntries([...document.querySelectorAll('.inspector tr')].map((r) => [r.querySelector('.var-name').textContent, r.querySelector('.var-value').textContent])) })`);

  await check("M5.3: stepping shows a list growing in the variables panel, and both names of a for over pairs with their values", async () => {
    // moves nothing, and is no route: an empty list, three appends of numbers, then a loop over two pairs
    const r = await runMadeUp(SCRATCH, "found = []\nfound.append(5)\nfound.append(6)\nfound.append(7)\nfor first, second in [(1, 2), (3, 4)]:\n    print(first, second)\n");
    expect(r.head !== "Python stopped", brief(r));
    const steps = await framesOf(panel);
    const seen = (name) => [...new Set(steps.map((s) => s.vars[name]).filter((v) => v !== undefined))];
    const found = seen("found");
    // the list's value grows: each value after the first holds the one before it, minus its closing bracket
    expect(found.length >= 4 && found[0].replace(/\s/g, "") === "[]" && found.every((v, i) => i === 0 || v.startsWith(found[i - 1].replace(/\]$/, ""))), `found takes the values [${found}]`);
    expect(found.at(-1).replace(/\s/g, "") === "[5,6,7]", `found ends as ${found.at(-1)}`);
    const [first, second] = [seen("first"), seen("second")];
    expect(first.join() === "1,3" && second.join() === "2,4", `first takes [${first}], second [${second}]`);
    return `${steps.length} steps; found: ${found.join(" -> ")}; first: ${first}; second: ${second}`;
  });

  await check("M5.3: asking a list for a place past its end stops with the friendly card, naming the list's length and the place", async () => {
    const r = await runMadeUp(SCRATCH, "items = [4, 9]\nprint(items[5])\n");
    const words = "That list has 2 items, so the last one is at [1]: places count from 0. There is nothing at [5].";
    expect(r.head === "Python stopped" && r.text.replace(/`/g, "").includes(words) && r.errorLine, brief(r));
    return "friendly card with the list's length, the last place and the place asked for";
  });

  await check("M5.3: help([]) and help(sorted) in a run print the list entry and the sorted entry", async () => {
    const r = await runMadeUp(HELP, "help([])\nhelp(sorted)\n");
    expect(r.head !== "Python stopped", brief(r));
    const at = (phrase) => r.console.indexOf(phrase);
    const [list, listWords, sorted, sortedWords] = ["Help on list:", "Several values in a row under one name", "Help on sorted:", "Make a new list with the same items in order, smallest first."].map(at);
    expect(list >= 0 && listWords > list && sorted > listWords && sortedWords > sorted, `phrases found at ${[list, listWords, sorted, sortedWords]} of ${r.console.length} characters`);
    return "the list entry, then the sorted entry, in the console";
  });

  // ---- The Codex ----
  /** Open level `id` and read its Codex tab: the group headings in order, and each entry's name, group and whether it is marked New. */
  async function codexOf(id) {
    await openLevel(id, { fresh: true });
    await codexTab();
    await b.waitFor(`document.querySelector('.codex .codex-entry')`, 20_000, "the Codex's entries");
    return b.evaluate(`(() => {
      const entries = [];
      const headings = [];
      for (const el of document.querySelector('.codex').children) {
        if (el.tagName === 'H3') headings.push(el.textContent);
        else if (el.classList.contains('codex-entry')) entries.push({ name: el.dataset.codex, group: headings.at(-1) ?? '', isNew: !!el.querySelector('.codex-new') });
      }
      return { headings, entries };
    })()`);
  }
  const newOnes = (codex, names) => names.filter((name) => codex.entries.some((e) => e.name === name && e.isNew));
  const allNew = (codex) => codex.entries.filter((e) => e.isNew).map((e) => e.name);

  await check("M5.3: ch08-l04's Codex has a Lists group straight after Text, holding list.append, new; every str. method is under Text", async () => {
    const { headings, entries } = await codexOf("ch08-l04");
    expect(headings.includes("Text") && headings.indexOf("Lists") === headings.indexOf("Text") + 1, headings.join("|"));
    const append = entries.find((e) => e.name === "list.append");
    expect(append && append.group === "Lists" && append.isNew, JSON.stringify(append));
    expect(entries.every((e) => (e.group === "Text") === e.name.startsWith("str.") && (e.group === "Lists") === e.name.startsWith("list.")), JSON.stringify(entries.map((e) => [e.name, e.group])));
    return headings.join("|");
  });

  await check("M5.3: ch08-l05's Codex lists sorted, min, max and sum, all new", async () => {
    const codex = await codexOf(HELP);
    const names = ["sorted", "min", "max", "sum"];
    expect(newOnes(codex, names).length === names.length, `new here: [${allNew(codex)}]`);
    return names.join();
  });

  await check("M5.3: ch08-l01's Codex lists the kind list, new, under Kinds of value", async () => {
    const codex = await codexOf("ch08-l01");
    const kind = codex.entries.find((e) => e.name === "list");
    expect(kind && kind.group === "Kinds of value" && kind.isNew, JSON.stringify(kind));
    return `kinds: ${codex.entries.filter((e) => e.group === "Kinds of value").map((e) => e.name)}`;
  });

  await check("M5.3: ch08-l02 brings in the kind tuple and knight.position; ch08-l03 the knight's pick_up and inventory", async () => {
    const two = await codexOf("ch08-l02");
    expect(newOnes(two, ["tuple", "knight.position"]).length === 2, `new on 8.2: [${allNew(two)}]`);
    expect(two.entries.find((e) => e.name === "tuple")?.group === "Kinds of value", "tuple is not under Kinds of value");
    const three = await codexOf("ch08-l03");
    expect(newOnes(three, ["knight.pick_up", "knight.inventory"]).length === 2, `new on 8.3: [${allNew(three)}]`);
    return `8.3 lists ${three.entries.filter((e) => e.name.startsWith("knight.")).map((e) => e.name)}`;
  });

  // ---- The examiner's buttons and table on a level whose calls carry lists ----
  // The made-up function: the call list's function name, a catch-all signature, a body that does nothing. It fails every
  // call and solves nothing. What the examiner wants is a spoiler: these checks measure the table's cells (widths, counts,
  // booleans) and never read their text out.
  async function stubRun() {
    await openLevel(EXAMINER, { fresh: true });
    await setCode(await stubFunction());
    return run();
  }

  await check("M5.3: before a run the Challenge panel lists every call in code, with lists in them; after a failed run the buttons read call N ✗ on one line, and the caption names the pressed call", async () => {
    await openLevel(EXAMINER, { fresh: true });
    const listed = await challengeCalls();
    const items = await b.evaluate(`document.querySelectorAll('ol.call-list li').length`);
    expect(listed.length >= 2 && items === listed.length, `${listed.length} calls in code of ${items} items`);
    expect(listed.some((call) => call.includes("[")) && listed.every((call) => call.endsWith(")")), "the calls do not carry lists");
    const r = await stubRun();
    expect(r.head !== "Solved!", `the made-up function solved the level: ${r.head}`);
    await b.waitFor(`document.querySelector('.board-host p.boards-caption')?.textContent.startsWith('The examiner calls ')`, 8000, "the caption filled at the last frame");
    const view = await examinerView();
    const n = listed.length;
    expect(JSON.stringify(view.texts) === JSON.stringify(listed.map((_, i) => `call ${i + 1} ${MARK.no}`)), `the buttons read ${JSON.stringify(view.texts)}`);
    expect(view.tops.every((top) => Math.abs(top - view.tops[0]) < 1), `the buttons' tops are ${view.tops.join()}: they do not stand on one line`);
    expect(view.pressed.join() === "0", `pressed buttons: [${view.pressed}]`);
    expect(JSON.stringify(view.calls) === JSON.stringify(listed), "a tooltip is not the Challenge panel's item of the same number");
    const said = view.caption.slice("The examiner calls ".length).replace(/[.]$/, "");
    expect(said === view.calls[view.pressed[0]], "the caption does not name the pressed button's tooltip");
    return `${n} calls, the buttons on one line at ${view.tops[0]}px; the caption names the pressed one`;
  });

  await check("M5.3: the result card's table holds its lists whole: no sideways scroll, a one-line first column, a wanted column wider than a character and clipped nowhere; its buttons replay", async () => {
    const r = await stubRun();
    expect(r.head !== "Solved!", `the made-up function solved the level: ${r.head}`);
    const m = await b.evaluate(`(() => {
      const card = document.querySelector('.outcome-host .outcome');
      const rows = [...card.querySelectorAll('table.calls tbody tr')];
      const width = (e) => e.getBoundingClientRect().width;
      const sideways = (e) => e.scrollWidth > e.clientWidth;
      return {
        rows: rows.length,
        cardSideways: sideways(card),
        hostSideways: sideways(document.querySelector('.outcome-host')),
        middleSideways: sideways(document.querySelector('.level-middle')),
        firstOneLine: rows.map((tr) => { const range = document.createRange(); range.selectNodeContents(tr.children[0].querySelector('button')); return range.getClientRects().length; }),
        firstWidths: rows.map((tr) => width(tr.children[0])),
        wantedFilled: rows.map((tr) => tr.children[1].textContent.trim() !== ''),
        wantedClipped: rows.map((tr) => sideways(tr.children[1])),
        wantedWidths: rows.map((tr) => width(tr.children[1])),
        listsInWanted: rows.filter((tr) => tr.children[1].textContent.includes('[')).length,
      };
    })()`);
    expect(m.rows >= 2, `${m.rows} rows`);
    expect(!m.cardSideways && !m.hostSideways && !m.middleSideways, `scrolls sideways: card ${m.cardSideways}, card's host ${m.hostSideways}, middle panel ${m.middleSideways}`);
    expect(m.firstOneLine.every((lines) => lines === 1), `first-column buttons take ${m.firstOneLine} lines`);
    expect(m.firstWidths.every((w) => Math.abs(w - m.firstWidths[0]) < 1), `first-column widths ${m.firstWidths.map(Math.round)}`);
    expect(m.wantedFilled.every(Boolean), "a wanted cell is empty");
    expect(m.wantedClipped.every((clipped) => !clipped), "a wanted cell is clipped");
    expect(m.wantedWidths.every((w) => w >= 80), `wanted widths ${m.wantedWidths.map(Math.round)}: one is under 80 px`);
    expect(m.listsInWanted >= 1, "no wanted cell holds a list");
    // A table button replays its call: that row is picked, and the button above the board with the same number is pressed.
    const last = m.rows - 1;
    await b.evaluate(`document.querySelectorAll('.outcome-host table.calls tbody tr')[${last}].children[0].querySelector('button').click()`);
    await b.waitFor(`document.querySelectorAll('.board-host .case-row button')[${last}]?.getAttribute('aria-pressed') === 'true' && document.querySelectorAll('.outcome-host table.calls tr')[${last + 1}]?.classList.contains('picked')`, 5000, "the last call's button pressed and its row picked");
    const [view, card] = [await examinerView(), await examinerCard()];
    expect(view.pressed.join() === String(last) && card.table.rows.findIndex((row) => row.picked) === last, `after the click: pressed [${view.pressed}]`);
    return `${m.rows} rows, widest first column ${Math.round(Math.max(...m.firstWidths))}px, narrowest wanted cell ${Math.round(Math.min(...m.wantedWidths))}px; the last row's button replays call ${m.rows}`;
  });

  // ---- Keys, doors and the satchel, played for real ----
  const KEYS = "ch08-l03"; // two boards, text-named keys and doors, the first level with pick_up()
  const NO_SATCHEL = "ch08-l01"; // no keys or doors on it: no satchel
  const JUMPS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const [file, rank] = [(sq) => sq.charCodeAt(0) - 97, (sq) => Number(sq.slice(1))];
  const keyWords = (name) => (/^\d+$/.test(name) ? `key ${name}` : `the ${name} key`);

  /** What the page shows of the board on show and its satchel, in one read: the board's label, its keys', doors' and pits' tiles by square (read off each tile's place in the drawing), and the satchel's rows. */
  const READ = `(() => {
    const stage = document.querySelector('.board-host .satchel-stage');
    const board = stage?.querySelector('.board');
    const box = stage?.querySelector('.satchel-box');
    const label = board?.getAttribute('aria-label') ?? '';
    const size = /(\\d+) by (\\d+) board/.exec(label);
    const [width, height] = [Number(size?.[1]), Number(size?.[2])];
    const at = (g) => {
      const t = /translate\\(\\s*(-?[\\d.]+)[ ,]+(-?[\\d.]+)/.exec(g.querySelector('.spr')?.getAttribute('transform') ?? '');
      return t ? String.fromCharCode(97 + Math.round((t[1] - 54) / 64)) + (height - Math.round((t[2] - 32) / 64)) : null;
    };
    const tiles = (selector) => [...(board?.querySelectorAll('.squares ' + selector) ?? [])];
    return {
      label, width, height,
      keys: tiles('g.key').map((g) => ({ sq: at(g), collected: g.classList.contains('collected') })),
      doorTiles: tiles('g.door').map((g) => ({ sq: at(g), open: g.classList.contains('open') })),
      blocked: tiles('g.pit, g.wall, g.gate').map(at),
      boxes: document.querySelectorAll('.satchel-box').length,
      stages: document.querySelectorAll('.satchel-stage').length,
      count: box?.querySelector('.satchel-head span')?.textContent ?? null,
      chips: [...(box?.querySelectorAll('.satchel-chip-name') ?? [])].map((e) => e.textContent),
      slots: box?.querySelectorAll('.satchel-slot').length ?? 0,
    };
  })()`;

  /** READ, with the label's sentences read out: the knight's square, the keys still to pick up (name and square) and each door (square, open, the key it wants). */
  async function look() {
    const raw = await b.evaluate(READ);
    const listed = /To pick up: ([^.]*)\./.exec(raw.label)?.[1];
    const left = (listed ? listed.split(/, | and /) : []).map((item) => {
      const m = /^(?:the (.+) key|key (.+)) on ([a-z]\d+)$/.exec(item);
      expect(m, `a "To pick up" item the check cannot read: "${item}"`);
      return { name: m[1] ?? m[2], sq: m[3] };
    });
    const doors = [...raw.label.matchAll(/The door on ([a-z]\d+) is (open|locked: it wants (?:the (.+?) key|key (\d+)))/g)].map((m) => ({ sq: m[1], open: m[2] === "open", wants: m[3] ?? m[4] ?? null }));
    return { ...raw, at: /Your knight is on ([a-z]\d+)/.exec(raw.label)?.[1], left, doors };
  }

  /** The look at the moment the page has stopped changing: the label and the satchel unchanged for two reads, 150 ms apart. */
  async function settledLook() {
    let [view, last] = [await look(), null];
    for (let i = 0; i < 25 && JSON.stringify([view.label, view.chips]) !== last; i++) {
      last = JSON.stringify([view.label, view.chips]);
      await sleep(150);
      view = await look();
    }
    return view;
  }

  /** The jumps (as [dx, dy] pairs) from square `from` to square `to` over the stones the drawing shows: a breadth-first search; pits, walls, gates and every door but `to` are never landed on. null when there is no way. */
  function jumpsBetween(view, from, to) {
    const shut = new Set([...view.blocked, ...view.doors.map((d) => d.sq)].filter((sq) => sq !== to));
    const came = new Map([[from, null]]);
    const queue = [from];
    for (let cur = queue.shift(); cur !== undefined; cur = queue.shift()) {
      if (cur === to) {
        const way = [];
        for (let c = cur; came.get(c); c = came.get(c)[0]) way.unshift(came.get(c)[1]);
        return way;
      }
      for (const [dx, dy] of JUMPS) {
        const [x, y] = [file(cur) + dx, rank(cur) + dy];
        const next = `${String.fromCharCode(97 + x)}${y}`;
        if (x < 0 || x >= view.width || y < 1 || y > view.height || shut.has(next) || came.has(next)) continue;
        came.set(next, [cur, [dx, dy]]);
        queue.push(next);
      }
    }
    return null;
  }

  /** The program for a list of parts: a [dx, dy] jump or "pick". */
  const typed = (parts) => parts.map((p) => (p === "pick" ? "knight.pick_up()" : `knight.jump(${p[0]}, ${p[1]})`)).join("\n") + "\n";

  /** The key to pick up first, with its way: one a door wants if there is one, then the shortest way. */
  function keyPlan(view) {
    const options = view.left.flatMap((key) => {
      const jumps = jumpsBetween(view, view.at, key.sq);
      return jumps ? [{ key, jumps, door: view.doors.find((d) => d.wants === key.name) ?? null }] : [];
    });
    return options.sort((p, q) => Number(!!q.door) - Number(!!p.door) || p.jumps.length - q.jumps.length)[0];
  }

  /** Everything the satchel and the board say, as plain facts to compare: the rows, the count, the keys still listed, each door's sentence and the tiles marked. */
  const facts = (view) => ({
    chips: view.chips, count: view.count, slots: view.slots, left: view.left.map((k) => `${k.name}@${k.sq}`),
    doors: view.doors.map((d) => `${d.sq}:${d.open}`), collected: view.keys.filter((k) => k.collected).map((k) => k.sq), open: view.doorTiles.filter((d) => d.open).map((d) => d.sq),
  });
  const same = (p, q) => JSON.stringify(p) === JSON.stringify(q);

  /** Open the keys level fresh and read it. */
  async function openKeys() {
    await openLevel(KEYS, { fresh: true });
    return settledLook();
  }

  /** Open the keys level, work out a way to a key from what it shows, type it with a pick_up() and run it (to the last frame). */
  async function pickedUp() {
    const start = await openKeys();
    const plan = keyPlan(start);
    expect(plan, "no key can be reached by jumps over the stones the board shows");
    await setCode(typed([...plan.jumps, "pick"]));
    const r = await run();
    return { start, plan, r, end: await settledLook() };
  }

  await check("M5.3: ch08-l03 opens with the satchel beside the large board, empty (0 of 8, eight slots, no key); the board's label lists the keys and a sentence per door; ch08-l01 has none", async () => {
    const v = await openKeys();
    expect(v.boxes === 1 && v.stages === 1, `${v.boxes} satchels, ${v.stages} stages`);
    expect(v.count === "0 of 8" && v.slots === 8 && v.chips.length === 0, `count "${v.count}", ${v.slots} slots, ${v.chips.length} keys`);
    const where = await b.evaluate(`({
      wide: !!document.querySelector('.board-host .boards.boards-wide'),
      inMain: !!document.querySelector('.boards-wide .boards-main .satchel-stage .satchel-box'),
      inThumbs: document.querySelectorAll('.board-thumb .satchel-box, .boards-side .satchel-box').length,
      thumbs: document.querySelectorAll('.board-host button.board-thumb').length,
    })`);
    expect(where.wide && where.inMain && where.inThumbs === 0 && where.thumbs >= 1, JSON.stringify(where));
    expect(v.left.length >= 1 && v.left.length === v.keys.length, `${v.left.length} keys listed in the label, ${v.keys.length} drawn`);
    expect(v.doors.length >= 1 && v.doors.length === (v.label.match(/ is locked/g) ?? []).length && v.doors.every((d) => !d.open && d.wants), `${v.doors.length} doors, ${(v.label.match(/ is locked/g) ?? []).length} "is locked" sentences`);
    expect(v.keys.every((k) => !k.collected) && v.doorTiles.every((d) => !d.open) && v.doorTiles.length === v.doors.length, "a tile is marked before any run");
    await openLevel(NO_SATCHEL, { fresh: true });
    const none = await b.evaluate(`({ stage: document.querySelectorAll('.satchel-stage').length, box: document.querySelectorAll('.satchel-box').length })`);
    expect(none.stage === 0 && none.box === 0, JSON.stringify(none));
    return `${v.left.length} keys and ${v.doors.length} doors on the board; a satchel on ${KEYS}, none on ${NO_SATCHEL}`;
  });

  await check("M5.3: a key picked up for real: the satchel holds its name (1 of 8, seven slots), the label drops it, its tile is marked collected, the console says so, and the door that wants it reads open", async () => {
    const { start, plan, r, end } = await pickedUp();
    expect(r.head !== "Python stopped", brief(r));
    const name = plan.key.name;
    expect(end.chips.length === 1 && end.chips[0] === name && end.count === "1 of 8" && end.slots === 7, `chips [${end.chips}], count "${end.count}", ${end.slots} slots`);
    expect(!end.left.some((k) => k.sq === plan.key.sq || k.name === name), `the label still lists the key: ${end.label}`);
    expect(end.left.length === start.left.length - 1, `${end.left.length} keys left of ${start.left.length}`);
    expect(end.keys.find((k) => k.sq === plan.key.sq)?.collected && end.keys.filter((k) => k.collected).length === 1, "its tile is not the one marked collected");
    expect(new RegExp(`picked up[^.]*${name}`).test(r.console), "the console does not say the key was picked up");
    // the doors that want it read open in the label and stand open in the drawing; the others stay locked
    const wanting = start.doors.filter((d) => d.wants === name).map((d) => d.sq);
    const [byLabel, byTile] = [end.doors.filter((d) => d.open).map((d) => d.sq), end.doorTiles.filter((d) => d.open).map((d) => d.sq)];
    expect(same(byLabel, wanting) && same(byTile, wanting), `doors open by the label [${byLabel}], by the tiles [${byTile}]; wanting it [${wanting}]`);
    expect(wanting.every((sq) => end.label.includes(`The door on ${sq} is open`)) && end.doors.every((d) => d.open || end.label.includes(`The door on ${d.sq} is locked`)), `the label: ${end.label}`);
    return `a key picked up in ${plan.jumps.length} jumps; ${wanting.length} of ${end.doors.length} doors open`;
  });

  await check("M5.3: at every frame of the run, the keys the label still lists plus the keys in the satchel make the board's number of keys, and the tiles marked collected are the satchel's", async () => {
    const { start } = await pickedUp();
    const frames = await framesOf(settledLook);
    const total = start.keys.length;
    expect(frames.length >= 3, `${frames.length} frames`);
    const sums = frames.map((f) => f.left.length + f.chips.length);
    expect(sums.every((n) => n === total), `at the frames, listed + carried is [${sums}] of ${total}`);
    const tiles = frames.map((f) => f.keys.filter((k) => k.collected).length);
    expect(same(tiles, frames.map((f) => f.chips.length)), `collected tiles [${tiles}], carried [${frames.map((f) => f.chips.length)}]`);
    expect(frames[0].chips.length === 0 && frames.at(-1).chips.length === 1, `carried [${frames.map((f) => f.chips.length)}]`);
    return `${frames.length} frames, listed + carried is ${total} at each; carried [${frames.map((f) => f.chips.length)}]`;
  });

  await check("M5.3: a rewind undoes it all (the satchel empty, the key on the board and in the label, the door locked) and the end, by Jump to end and by playing through, is as the run left it", async () => {
    const { start, end } = await pickedUp();
    await toStart();
    const back = await settledLook();
    expect(back.chips.length === 0 && back.count === "0 of 8" && back.slots === 8 && same(facts(back), facts(start)), `at the start: ${JSON.stringify(facts(back))}`);
    expect(end.chips.length === 1 && !same(facts(back), facts(end)), "the start and the end are not told apart");
    await press(4);
    await b.waitFor(`document.querySelector('.outcome-host .outcome')`, 10_000, "the outcome card at the end");
    expect(same(facts(await settledLook()), facts(end)), "Jump to end does not show what the run ended with");
    await press(0);
    await press(2);
    await b.waitFor(`document.querySelector('.outcome-host .outcome')`, 30_000, "the outcome card after playing through");
    expect(same(facts(await settledLook()), facts(end)), "playing through does not show what the run ended with");
    return "start, jump to end and play through each show the same satchel, label and tiles as before";
  });

  await check("M5.3: a new run starts empty: a program that does nothing ends with an empty satchel and every key on the board", async () => {
    const { start, end } = await pickedUp();
    expect(end.chips.length === 1, "the first run did not fill the satchel");
    await setCode("pass\n");
    const r = await run();
    expect(r.head !== "Python stopped", brief(r));
    const after = await settledLook();
    expect(same(facts(after), facts(start)) && after.count === "0 of 8", `after: ${JSON.stringify(facts(after))}`);
    return "the satchel is empty and every key is back on the board";
  });

  await check("M5.3: pick_up() where the knight starts stops with the friendly card naming that square, and the satchel stays empty", async () => {
    const start = await openKeys();
    await setCode(typed(["pick"]));
    const r = await run();
    const text = r.text.replace(/`/g, "");
    expect(r.head === "Python stopped" && text.includes(`There is nothing to pick up on ${start.at}.`) && r.errorLine, brief(r));
    const end = await settledLook();
    expect(end.chips.length === 0 && end.count === "0 of 8" && same(facts(end), facts(start)), `the satchel: ${JSON.stringify(facts(end))}`);
    return `the card names ${start.at}`;
  });

  /** The words of a carried list as Python writes them: ['bone'], [12]. */
  const pyList = (names) => `[${names.map((n) => (/^\d+$/.test(n) ? n : `'${n}'`)).join(", ")}]`;

  /** The shortest way over the stones to a door, from the start or from a key's stone after picking it up. Returns { parts, door, carried } or null. */
  function doorPlan(view, carry) {
    const starts = carry ? view.left.flatMap((key) => { const to = jumpsBetween(view, view.at, key.sq); return to ? [{ key, parts: [...to, "pick"], from: key.sq }] : []; }) : [{ key: null, parts: [], from: view.at }];
    const plans = starts.flatMap(({ key, parts, from }) =>
      view.doors.filter((d) => !key || d.wants !== key.name).flatMap((door) => {
        const to = jumpsBetween(view, from, door.sq);
        return to ? [{ parts: [...parts, ...to], jumps: parts.filter((p) => p !== "pick").length + to.length, door, carried: key ? [key.name] : [] }] : [];
      }),
    );
    return plans.sort((p, q) => p.jumps - q.jumps)[0] ?? null;
  }

  async function stoppedAtDoor(carry) {
    const start = await openKeys();
    const plan = doorPlan(start, carry);
    if (!plan || plan.jumps > 5) return { start, plan: null };
    await setCode(typed(plan.parts));
    const r = await run();
    const text = r.text.replace(/`/g, "");
    const words = `The door on ${plan.door.sq} is locked: it wants ${keyWords(plan.door.wants)}, and your satchel ${plan.carried.length ? `holds ${pyList(plan.carried)}` : "is empty"}.`;
    return { start, plan, r, said: text.includes(words), end: await settledLook() };
  }

  await check("M5.3: landing on a locked door with an empty satchel stops with the friendly card naming the door's square and the key it wants, and saying the satchel is empty", async () => {
    const { plan, r, said, end } = await stoppedAtDoor(false);
    expect(plan, "no door can be reached over the stones the board shows within five jumps");
    expect(r.head === "Python stopped" && said, brief(r));
    expect(end.chips.length === 0, `the satchel holds ${end.chips.length} keys`);
    return `the card names the door on ${plan.door.sq} and the key it wants, after ${plan.jumps} jumps`;
  });

  await check("M5.3: landing on a door that wants another key, with a key carried, says the satchel holds that key", async () => {
    const { plan, r, said, end } = await stoppedAtDoor(true);
    expect(plan, "no way picks up a key and lands on a door wanting another within five jumps");
    expect(r.head === "Python stopped" && said, brief(r));
    expect(end.chips.length === 1 && end.chips[0] === plan.carried[0], `the satchel holds [${end.chips}]`);
    return `the card says the satchel holds the key carried, at the door on ${plan.door.sq} after ${plan.jumps} jumps`;
  });

  await check("M5.3: code that changes knight.inventory in place gets the note, on its line, that the satchel fills only with pick_up()", async () => {
    await openKeys();
    await setCode('knight.inventory.append("brass")\n'); // made up: moves nothing, and is no route
    const r = await run();
    expect(r.warnMarks === 1, brief(r));
    const spot = await b.evaluate(`(() => { const r = document.querySelector('.level-right .cm-lint-marker-warning').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...spot });
    try {
      await b.waitFor(`document.querySelector('.cm-tooltip-lint .cm-diagnostic')`, 5000, "the warning's tooltip");
      const note = (await b.evaluate(`document.querySelector('.cm-tooltip-lint .cm-diagnostic').textContent`)).replace(/`/g, "");
      expect(note.includes("Your knight's satchel fills only with pick_up(). Changing knight.inventory changes a copy."), `the note reads "${note}"`);
    } finally {
      await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });
    }
    expect((await settledLook()).chips.length === 0, "the satchel holds a key");
    return "the warning on its line says the satchel fills only with pick_up(), and the satchel stayed empty";
  });

  await check("M5.3: the other boards: board 2 on show, at its end, adds up (listed + carried is its keys), board 1 put back shows its own satchel, and there is one satchel throughout", async () => {
    const { end } = await pickedUp();
    const oneSatchel = () => b.evaluate(`({ boxes: document.querySelectorAll('.satchel-box').length, wide: !!document.querySelector('.boards.boards-wide .boards-main .satchel-box'), thumbs: document.querySelectorAll('.board-thumb .satchel-box').length })`);
    const replay = async (n) => {
      await b.evaluate(`document.querySelector('button.board-thumb[title="Replay board ${n}"]').click()`);
      await b.waitFor(`document.querySelector('.boards-caption')?.textContent.startsWith('Board ${n}')`, 10_000, `board ${n} on show`);
      await press(4);
      await b.waitFor(`document.querySelector('.outcome-host .outcome')`, 10_000, `board ${n}'s outcome card`);
      return settledLook();
    };
    const two = await replay(2);
    expect(two.left.length + two.chips.length === two.keys.length && two.keys.length >= 1, `board 2: ${two.left.length} listed + ${two.chips.length} carried of ${two.keys.length} keys`);
    expect(two.keys.filter((k) => k.collected).length === two.chips.length && two.count === `${two.chips.length} of 8` && two.slots === 8 - two.chips.length, `board 2's satchel: count "${two.count}", ${two.slots} slots`);
    const shape = await oneSatchel();
    expect(shape.boxes === 1 && shape.wide && shape.thumbs === 0, JSON.stringify(shape));
    const one = await replay(1);
    expect(same(facts(one), facts(end)), `board 1 put back reads ${JSON.stringify(facts(one))}`);
    expect(one.left.length + one.chips.length === one.keys.length, "board 1 does not add up");
    return `board 2 ends carrying ${two.chips.length} of its ${two.keys.length} keys; board 1 is as its own run left it`;
  });

  // ---- Both themes ----
  const { keepingSettings } = settingsHelpers(b);
  const COLOURS = `(() => {
    const css = (selector, property) => getComputedStyle(document.querySelector(selector))[property];
    return { slot: css('.satchel-slot', 'borderTopColor'), key: css('.satchel-stage .board .key .k-line', 'stroke'), door: css('.satchel-stage .board .door .d-line', 'stroke'), page: css('body', 'backgroundColor') };
  })()`;
  const visible = (colour) => !!colour && colour !== "none" && colour !== "transparent" && !/^rgba\(.*,\s*0\)$/.test(colour) && !/\/\s*0\)$/.test(colour);

  await check("M5.3: in the dark and the light theme the satchel's slot border, a key's line and a door's line are all coloured (not transparent), and the page's background differs between the themes", async () => {
    await openLevel(KEYS, { fresh: true });
    const seen = {};
    await keepingSettings(async () => {
      for (const theme of ["dark", "light"]) {
        await b.evaluate(`localStorage.setItem('rank-and-file:settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('rank-and-file:settings') ?? '{}'), theme: ${JSON.stringify(theme)} }))`);
        await openLevel(KEYS, { fresh: true });
        seen[theme] = await b.evaluate(COLOURS);
        const unseen = Object.entries(seen[theme]).filter(([, colour]) => !visible(colour)).map(([what]) => what);
        expect(unseen.length === 0, `in the ${theme} theme these have no colour: ${unseen.map((what) => `${what} "${seen[theme][what]}"`)}`);
      }
    });
    expect(seen.dark.page !== seen.light.page, `the page's background is ${seen.dark.page} in both themes`);
    expect(seen.dark.slot !== seen.light.slot || seen.dark.key !== seen.light.key, "no colour changed with the theme");
    return `dark and light: slot border, key line, door line coloured; the page ${seen.dark.page} then ${seen.light.page}`;
  });

  // ---- A guard's gate says a word (QA-068) ----
  /** Every guard's gate with a badge on the board on show (not the other boards' small pictures): its badge's words, its tooltip, and (from the page's own geometry) the left and right edges of its square and of its pill. */
  const GATE_BADGES = `[...document.querySelectorAll('.board-host .board .squares g.gate:not(.timed-gate)')].filter((g) => g.querySelector('.badge-group') && !g.closest('.board-thumb')).map((g) => {
    const [square, pill] = [g.previousElementSibling.getBoundingClientRect(), g.querySelector('.badge-group rect.badge').getBoundingClientRect()];
    return { badge: g.querySelector('.badge-text').textContent, tip: g.querySelector(':scope > title')?.textContent ?? '', square: [square.left, square.right], pill: [pill.left, pill.right] };
  })`;

  await check("QA-068: 8.5's two guards' gates say a word each (smallest, then in order), each tooltip still gives the guard's whole question, and the pills sit inside their own squares without touching", async () => {
    await openLevel(HELP, { fresh: true });
    const gates = (await b.evaluate(GATE_BADGES)).sort((p, q) => p.square[0] - q.square[0]);
    expect(gates.length === 2, `${gates.length} guard's gates with a badge`);
    expect(gates[0].badge === "smallest" && gates[1].badge === "in order", `badges "${gates.map((g) => g.badge)}"`);
    expect(gates.every((g) => g.badge !== "?"), "a gate still says ?");
    expect(gates.every((g) => g.tip.startsWith('The guard asks: "') && g.tip.length - 'The guard asks: ""'.length > g.badge.length), `tooltips ${gates.map((g) => g.tip.length)} characters long`);
    expect(gates.every((g) => g.pill[0] >= g.square[0] - 0.5 && g.pill[1] <= g.square[1] + 0.5), `pill [${gates.map((g) => `${g.pill[0].toFixed(1)}..${g.pill[1].toFixed(1)}`)}] in squares [${gates.map((g) => `${g.square[0].toFixed(1)}..${g.square[1].toFixed(1)}`)}]`);
    const gap = gates[1].pill[0] - gates[0].pill[1];
    expect(gap >= 0, `the pills overlap by ${(-gap).toFixed(1)}px`);
    return `pill widths ${gates.map((g) => (g.pill[1] - g.pill[0]).toFixed(1)).join(" and ")}px, ${gap.toFixed(1)}px between them`;
  });

  await check("QA-068: an older guard's gate with no label still says ? (The Toll, practice-08)", async () => {
    await openLevel("practice-08", { fresh: true });
    const gates = await b.evaluate(GATE_BADGES);
    expect(gates.length >= 1 && gates.every((g) => g.badge === "?" && g.tip.startsWith('The guard asks: "')), `badges "${gates.map((g) => g.badge)}"`);
    return `${gates.length} guard's gate says ?`;
  });
}
