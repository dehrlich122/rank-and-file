// PreToolUse hook: keeps level spoilers out of the transcript (CLAUDE.md, "no spoilers").
// The designer is also the learner and reads every tool call, so no session or subagent may
// print a reference solution, a hint or a guard's passphrase. This is a backstop for the rules
// in CLAUDE.md, not a replacement: it denies the common ways of reading those files.
//   - solutions/**                   references and their notes
//   - levels/** but chapters.yaml    the level files hold hints and passphrases
//   - scripts/gen_*.py, levelgen.py  encoded hints and code (subagents only; the orchestrator writes them)
// Tests and generators still read these files; they just never print them.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SHOW_LEVEL = "`node scripts/venv.mjs scripts.show_level <level-id>` (hints, passphrases and solutions hidden)";
const EXCLUDES = "-- . ':!solutions' ':!levels'";

/** Absolute, lower-case, forward-slash form of a path. */
function normalize(path, base) {
  let p = String(path).replace(/\\/g, "/");
  if (!/^[a-z]:\//i.test(p) && !p.startsWith("/")) p = `${String(base || "").replace(/\\/g, "/")}/${p}`;
  return p.toLowerCase().replace(/\/(\.\/)+/g, "/").replace(/\/+/g, "/").replace(/\/\.?$/, "");
}

/**
 * Where a path sits in the repo (the main checkout or any worktree under .claude/worktrees):
 * its repo-relative path, or "" for a repo root, or null when it's outside. `covers` is true
 * when a search from there would reach a repo's protected folders (a root or anything above).
 */
function locate(path, cwd, projectDir) {
  const p = normalize(path || cwd || projectDir, cwd || projectDir);
  const root = normalize(projectDir || cwd || "", "");
  const worktree = p.match(/\/\.claude\/worktrees\/[^/]+(?:\/(.*))?$/);
  let rel = null;
  if (worktree) rel = worktree[1] ?? "";
  else if (p === root) rel = "";
  else if (p.startsWith(`${root}/`)) rel = p.slice(root.length + 1);
  const above = root === p || root.startsWith(`${p}/`);
  const covers = above || rel === "" || rel === ".claude" || rel === ".claude/worktrees";
  return { rel, covers };
}

/** The protected area a repo-relative path falls in, or null. */
function area(rel, isSubagent) {
  if (rel == null) return null;
  if (rel === "solutions" || rel.startsWith("solutions/")) return "solutions/";
  if ((rel === "levels" || rel.startsWith("levels/")) && rel !== "levels/chapters.yaml") return "levels/";
  if (isSubagent && /^scripts\/(gen_[^/]*|levelgen)\.py$/.test(rel)) return "the level generators";
  return null;
}

// Shell words that print a file (not counting git's own subcommands, handled below).
const READERS =
  /(?:^|[\s;|&(`$])(?<!\bgit\s)(?:cat|type|more|less|head|tail|bat|nl|sed|awk|grep|egrep|fgrep|rg|findstr|select-string|sls|get-content|gc|format-hex|od|xxd|hexdump|strings|cut|base64|tee|diff)(?=[\s;|&)]|$)/i;
const GIT_READERS = /\bgit\b[^;|&]*\s(?:show|blame|cat-file|grep)\b/i;
const INLINE_CODE = /(?:^|[\s;|&(])(?:python3?|py|node|deno|perl|ruby|pwsh|powershell)(?:\.exe)?\s+(?:-c|-e|--eval|-command)\b/i;
const MENTIONS = {
  "solutions/": /(?:^|[\s"'=:/\\(])solutions(?:[/\\\s"')]|$)/i,
  "levels/": /(?:^|[\s"'=:/\\(])levels[/\\](?!chapters\.yaml)/i,
  "the level generators": /(?:^|[\s"'=:/\\(])scripts[/\\](?:gen_\w+|levelgen)\.py/i,
};
// Commands that print patches: a diff can carry a reference or a hint.
const PATCH =
  /\bgit\b[^;|&]*\s(?:diff|show|whatchanged|format-patch|range-diff)\b|\bgit\b[^;|&]*\slog\b[^;|&]*\s(?:-p|--patch|-u)\b|\bgit\b[^;|&]*\sstash\s+show\b[^;|&]*\s(?:-p|--patch)\b|\bgh\s+pr\s+diff\b/i;
const STAT = /\s(?:--stat|--shortstat|--numstat|--name-only|--name-status|--summary|--dirstat|-s|--no-patch)\b/;
const PATCH_FLAG = /\s(?:-p|--patch|-u)\b/;

const statOnly = (command) => STAT.test(command) && !PATCH_FLAG.test(command);
const unquote = (s) => s.replace(/^["']|["']$/g, "");

/** True when a patch command's pathspecs leave out solutions/ and levels/. */
function patchIsScoped(command) {
  if (statOnly(command)) return true;
  if (/\bgh\s+pr\s+diff\b/i.test(command)) return /\s--name-only\b/.test(command);
  const show = command.match(/\bgit\s+show\s+(.+)$/i);
  if (show) {
    const args = show[1].split(/\s+/).map(unquote).filter((a) => a && !a.startsWith("-"));
    if (args.length > 0 && args.every((a) => /^[^:\s]+:[^:\s]/.test(a))) return true; // rev:path blobs
  }
  const dash = command.match(/\s--\s+(.*)$/);
  if (!dash) return false;
  const specs = dash[1].split(/\s+/).map(unquote).filter(Boolean);
  const excluded = (dir) => specs.some((s) => new RegExp(`^:(?:!|\\^|\\(exclude\\))/?${dir}(?:/|$)`, "i").test(s));
  const included = specs.filter((s) => !s.startsWith(":"));
  const broad = included.some((s) => /^(?:\.|\.\/|\*|\/)$/.test(s)) || specs.some((s) => /^:\/\*?$/.test(s));
  if (broad) return excluded("solutions") && excluded("levels");
  return included.length > 0 && included.every((s) => !/^(?:\.\/)?(?:solutions|levels)(?:[/\\]|$)/i.test(s));
}

const deny = (reason) => ({ decision: "deny", reason: `[spoiler-guard] ${reason}` });

/** The guard's decision for one PreToolUse event, or null to let it through. */
export function verdict(input, projectDir = process.env.CLAUDE_PROJECT_DIR) {
  const tool = input.tool_name;
  const args = input.tool_input || {};
  const isSubagent = Boolean(input.agent_id);
  const base = projectDir || input.cwd;

  if (tool === "Read" || tool === "Edit" || tool === "Write" || tool === "NotebookEdit") {
    const hit = area(locate(args.file_path || args.notebook_path, input.cwd, base).rel, isSubagent);
    if (!hit) return null;
    if (hit === "levels/" && tool === "Read") {
      return deny(`Reading a level file would show its hints and passphrases. Use ${SHOW_LEVEL}.`);
    }
    if (hit === "the level generators") {
      return deny("The level generators hold encoded hints and code; workers never need them. Ask the orchestrator.");
    }
    if (tool === "Read") {
      return deny("solutions/ holds the reference solutions. Check them by outcome (npm run test:py), never by reading.");
    }
    return deny(`${hit} is written by the blind generators (CLAUDE.md), never by hand: ` +
      "the tool call itself would put a reference or a hint in the transcript.");
  }

  if (tool === "Grep") {
    if ((args.output_mode || "files_with_matches") !== "content") return null; // names and counts are fine
    const { rel, covers } = locate(args.path, input.cwd, base);
    const hit = area(rel, isSubagent);
    if (hit) return deny(`A content Grep inside ${hit} prints spoilers. Use files_with_matches or count.`);
    if (covers) {
      const filter = `${args.glob || ""} ${args.type || ""}`.toLowerCase().trim();
      const named = filter.replace(/[*{},./\s]/g, "");
      if (!filter || /py|ya?ml|solutions|levels/.test(filter) || !/[a-z]/.test(named)) {
        return deny("A content Grep over a whole checkout can print lines from solutions/ or levels/. " +
          "Give a narrower path (src, engine, scripts, docs...) or a glob/type that leaves out .py and .yaml.");
      }
    }
    return null;
  }

  if (tool === "Bash" || tool === "PowerShell") {
    const command = String(args.command || "");
    const reads = READERS.test(command) || INLINE_CODE.test(command) || (GIT_READERS.test(command) && !statOnly(command));
    for (const [hit, mention] of Object.entries(MENTIONS)) {
      if (hit === "the level generators" && !isSubagent) continue;
      if (reads && mention.test(command)) {
        const alt = hit === "levels/" ? ` Use ${SHOW_LEVEL}.` : " List names, count lines or hash files instead.";
        return deny(`That command would print from ${hit}.${alt}`);
      }
    }
    if (PATCH.test(command) && !patchIsScoped(command)) {
      return deny("A patch (git diff/show/log -p, gh pr diff) can carry a reference or a hint. " +
        `Add --stat, name the paths you need, or exclude them: \`git diff main...HEAD ${EXCLUDES}\`.`);
    }
  }
  return null;
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return; // not an event we understand: let it through
  }
  const result = verdict(input);
  if (!result) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: result.decision,
      permissionDecisionReason: result.reason,
    },
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`spoiler-guard failed: ${error?.message ?? error}\n`);
  }
}
