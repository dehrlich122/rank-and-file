// Tests for the workflow hooks (`npm run test:hooks`, part of `npm run check`).
// Every case uses made-up paths and synthetic transcripts: no test ever opens a real solution.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { contextTokens, LIMITS, onStop, onToolUse, subagentTranscript } from "./context-guard.mjs";
import { resumeCard, startContext } from "./session-start.mjs";
import { verdict } from "./spoiler-guard.mjs";

const ROOT = "C:\\dev\\rank-and-file";
const WT = `${ROOT}\\.claude\\worktrees\\wp-a`;
const run = (tool, tool_input, extra = {}) => verdict({ tool_name: tool, tool_input, cwd: ROOT, ...extra }, ROOT);
const denied = (...args) => run(...args)?.decision === "deny";
const worker = { agent_id: "a1", cwd: WT };

describe("spoiler guard: files", () => {
  test("reading or writing solutions is denied, in the main checkout and in worktrees", () => {
    assert.ok(denied("Read", { file_path: `${ROOT}\\solutions\\ch01\\ch01-l01.py` }));
    assert.ok(denied("Read", { file_path: `${WT}\\solutions\\ch01\\ch01-l01.py` }, worker));
    assert.ok(denied("Read", { file_path: "solutions/ch02/ch02-l03.naive.py" }));
    assert.ok(denied("Write", { file_path: `${ROOT}\\solutions\\ch09\\new.py`, content: "" }));
  });
  test("level files are denied, except chapters.yaml", () => {
    assert.ok(denied("Read", { file_path: `${ROOT}\\levels\\ch01\\ch01-l01.yaml` }));
    assert.ok(denied("Edit", { file_path: `${ROOT}\\levels\\ch03\\ch03-l02.yaml` }));
    assert.ok(denied("Read", { file_path: `${ROOT}\\levels\\practice\\p01.yaml` }));
    assert.equal(run("Read", { file_path: `${ROOT}\\levels\\chapters.yaml` }), null);
  });
  test("the generators are closed to subagents only", () => {
    assert.ok(denied("Read", { file_path: `${WT}\\scripts\\gen_runes.py` }, worker));
    assert.ok(denied("Read", { file_path: `${WT}\\scripts\\levelgen.py` }, worker));
    assert.equal(run("Read", { file_path: `${ROOT}\\scripts\\gen_runes.py` }), null);
  });
  test("ordinary files pass", () => {
    assert.equal(run("Read", { file_path: `${ROOT}\\src\\app.ts` }), null);
    assert.equal(run("Read", { file_path: `${ROOT}\\lessons\\ch01\\ch01-l01.md` }), null);
    assert.equal(run("Edit", { file_path: `${WT}\\src\\share\\codec.ts` }, worker), null);
    assert.equal(run("Read", { file_path: "C:\\Users\\someone\\notes.txt" }), null);
  });
});

describe("spoiler guard: Grep", () => {
  test("names and counts are always fine", () => {
    assert.equal(run("Grep", { pattern: "move", path: "solutions" }), null);
    assert.equal(run("Grep", { pattern: "move", output_mode: "count" }), null);
  });
  test("content inside a protected folder is denied", () => {
    assert.ok(denied("Grep", { pattern: "x", path: `${ROOT}\\solutions`, output_mode: "content" }));
    assert.ok(denied("Grep", { pattern: "x", path: "levels/ch02", output_mode: "content" }));
  });
  test("content over a whole checkout needs a filter that leaves out .py and .yaml", () => {
    assert.ok(denied("Grep", { pattern: "x", output_mode: "content" }));
    assert.ok(denied("Grep", { pattern: "x", path: ROOT, glob: "*.py", output_mode: "content" }));
    assert.ok(denied("Grep", { pattern: "x", path: ROOT, glob: "**/*", output_mode: "content" }));
    assert.ok(denied("Grep", { pattern: "x", path: WT, output_mode: "content" }, worker));
    assert.ok(denied("Grep", { pattern: "x", path: "C:\\dev", output_mode: "content" }));
    assert.equal(run("Grep", { pattern: "x", path: ROOT, glob: "*.ts", output_mode: "content" }), null);
    assert.equal(run("Grep", { pattern: "x", type: "ts", output_mode: "content" }), null);
  });
  test("content in other folders passes", () => {
    assert.equal(run("Grep", { pattern: "x", path: `${ROOT}\\src`, output_mode: "content" }), null);
    assert.equal(run("Grep", { pattern: "x", path: "engine/rankfile", output_mode: "content" }), null);
  });
});

describe("spoiler guard: shell", () => {
  const sh = (command, extra) => denied("Bash", { command }, extra);
  const ps = (command) => denied("PowerShell", { command });
  test("printing protected files is denied", () => {
    assert.ok(sh("cat solutions/ch01/ch01-l01.py"));
    assert.ok(sh("head -5 levels/ch03/ch03-l01.yaml"));
    assert.ok(sh("grep -n move solutions/ch01/*.py"));
    assert.ok(sh(`python -c "print(open('solutions/ch01/a.py').read())"`));
    assert.ok(sh("git show HEAD:solutions/ch01/ch01-l01.py"));
    assert.ok(ps("Get-Content levels\\ch01\\ch01-l01.yaml"));
    assert.ok(ps("type solutions\\ch01\\ch01-l01.py"));
    assert.ok(sh("sed -n 1,5p scripts/gen_runes.py", worker));
  });
  test("patches must leave out solutions/ and levels/", () => {
    assert.ok(sh("git diff"));
    assert.ok(sh("git diff main...HEAD"));
    assert.ok(sh("git show abc1234"));
    assert.ok(sh("git log -p -3"));
    assert.ok(sh("git log -p --stat -3"));
    assert.ok(sh("gh pr diff 21"));
    assert.ok(sh("git diff -- ."));
    assert.ok(sh("git diff -- . ':!solutions'"));
    assert.ok(sh("git diff -- solutions"));
  });
  test("scoped patches, stats and harmless commands pass", () => {
    for (const command of [
      "git diff -- src engine",
      "git diff main...HEAD -- . ':!solutions' ':!levels'",
      "git diff --stat",
      "git diff --stat -- solutions",
      "git show --stat HEAD",
      "git show HEAD:src/app.ts",
      "git show HEAD:levels/chapters.yaml",
      "git log --oneline -5",
      "gh pr diff 21 --name-only",
      "ls solutions/ch01",
      "wc -l solutions/ch01/*.py",
      "git add solutions/ch05/ch05-l01.py",
      "npm run test:py -- engine/tests/test_levels.py",
      "node scripts/venv.mjs scripts.show_level ch01-l01",
      "cat src/app.ts",
      "git status",
    ]) {
      assert.equal(run("Bash", { command }), null, command);
    }
  });
});

describe("context guard", () => {
  const dir = mkdtempSync(join(tmpdir(), "context-guard-"));
  const line = (type, tokens, extra = {}) => JSON.stringify({
    type, ...extra,
    message: { usage: { input_tokens: 2, cache_creation_input_tokens: 1000, cache_read_input_tokens: tokens - 1002 } },
  });

  test("reads the last assistant usage from a transcript", () => {
    const file = join(dir, "t.jsonl");
    writeFileSync(file, ['{"cut', line("assistant", 100_000), line("user", 999_999), line("assistant", 310_000), '{"type":"user"}'].join("\n"));
    assert.equal(contextTokens(file), 310_000);
    assert.equal(contextTokens(join(dir, "missing.jsonl")), null);
  });
  test("a subagent's transcript sits in the session's subagents folder", () => {
    const path = subagentTranscript({ transcript_path: join(dir, "s1.jsonl"), session_id: "s1", agent_id: "a9" });
    assert.equal(path, join(dir, "s1", "subagents", "agent-a9.jsonl"));
  });
  test("the orchestrator is warned once per 10k from 300k, and told to stop from 340k", () => {
    const state = {};
    assert.equal(onToolUse({}, LIMITS.handoff - 1, state), null);
    assert.match(onToolUse({}, 301_000, state), /HANDOFF READY/);
    assert.equal(onToolUse({}, 309_000, state), null);
    assert.match(onToolUse({}, 311_000, state), /Finish the unit/);
    assert.match(onToolUse({}, 345_000, state), /Stop the current work now/);
  });
  test("a worker is told to wrap up from 150k", () => {
    const state = {};
    assert.equal(onToolUse({ agent_id: "a1" }, 140_000, state), null);
    assert.match(onToolUse({ agent_id: "a1" }, 151_000, state), /Status: partial/);
  });
  test("stopping past 300k is blocked once until handoff.md is rewritten", () => {
    const state = { crossedAt: 1000 };
    assert.match(onStop({}, 320_000, state, 500), /handoff\.md/);
    assert.equal(onStop({}, 320_000, state, 2000), null);
    assert.equal(onStop({ stop_hook_active: true }, 320_000, state, 500), null);
    assert.equal(onStop({}, 200_000, {}, null), null);
  });
  after(() => rmSync(dir, { recursive: true, force: true }));
});

describe("session start", () => {
  const handoff = "# Handoff\n\nintro\n\n## Resume card\n\n- Phase: build\n### WPs\n| a | b |\n\n## Rules\n\nlong\n";
  test("injects the Resume card only", () => {
    const card = resumeCard(handoff);
    assert.match(card, /^## Resume card/);
    assert.match(card, /### WPs/);
    assert.doesNotMatch(card, /## Rules/);
    assert.match(startContext(handoff), /read handoff\.md/);
    assert.match(startContext(null), /missing/);
  });
});
