// Context guard (docs/WORKFLOW.md, "Context management"). Sessions restart from handoff.md
// instead of compacting, so each one is told when its context gets big:
//   PostToolUse, orchestrator: from 300k tokens, finish the current unit, write the handoff and
//                              end with HANDOFF READY; from 340k, stop now (ceiling 350k).
//   PostToolUse, subagent:     from 150k, commit the work in progress and return a partial report.
//   Stop, orchestrator:        above 300k, refuse to stop once until handoff.md has been rewritten.
// The size is the last API call's input (fresh + cache write + cache read), read from the
// transcript, the same figure the status line shows.
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export const LIMITS = { handoff: 300_000, stop: 340_000, worker: 150_000, step: 10_000 };
const TAIL = 2 * 1024 * 1024; // the last usage line is near the end; read at most this much

/** Context tokens from the last main-thread (or subagent) API response in a transcript, or null. */
export function contextTokens(transcript) {
  if (!transcript || !existsSync(transcript)) return null;
  const fd = openSync(transcript, "r");
  let text;
  try {
    const size = fstatSync(fd).size;
    const length = Math.min(size, TAIL);
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, size - length);
    text = buffer.toString("utf8");
  } finally {
    closeSync(fd);
  }
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"usage"')) continue;
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue; // the first line of the tail is usually cut
    }
    const usage = entry?.message?.usage;
    if (entry?.type !== "assistant" || !usage) continue;
    return (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
  }
  return null;
}

/** A subagent's own transcript: <project>/<session>/subagents/agent-<id>.jsonl. */
export function subagentTranscript(input) {
  if (input.agent_transcript_path) return input.agent_transcript_path;
  if (!input.transcript_path || !input.session_id) return null;
  return join(dirname(input.transcript_path), input.session_id, "subagents", `agent-${input.agent_id}.jsonl`);
}

function stateFile(input) {
  const dir = join(input.scratchpad_dir || tmpdir(), "context-guard");
  mkdirSync(dir, { recursive: true });
  return join(dir, `${input.session_id || "session"}${input.agent_id ? `-${input.agent_id}` : ""}.json`);
}

function loadState(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

const k = (tokens) => `${Math.round(tokens / 1000)}k`;

function workerMessage(tokens) {
  return `[context-guard] Your context is at ${k(tokens)} tokens; the worker limit is ${k(LIMITS.worker)}. ` +
    "Wrap up now: get npm run check to exit 0 if you can within a few steps, commit your work in progress on your " +
    "branch, and return your report with Status: partial, saying exactly what is done and what remains, so a fresh " +
    "worker can carry on from your branch.";
}

function orchestratorMessage(tokens) {
  if (tokens >= LIMITS.stop) {
    return `[context-guard] Context is at ${k(tokens)}, close to the 350k ceiling. Stop the current work now: ` +
      "commit or note the work in progress, rewrite handoff.md's Resume card, and end the turn with HANDOFF READY.";
  }
  return `[context-guard] Context is at ${k(tokens)} (handoff at ${k(LIMITS.handoff)}, ceiling 350k). ` +
    "Finish the unit of work you are in, but don't start another. Then commit what's finished (npm run check " +
    "first), rewrite handoff.md's Resume card (phase, work packages, next action, open questions), and end your turn " +
    "with the line HANDOFF READY so the designer can /clear and type go.";
}

/** PostToolUse: a message to inject, or null. Remembers the last 10k step it warned at. */
export function onToolUse(input, tokens, state) {
  const limit = input.agent_id ? LIMITS.worker : LIMITS.handoff;
  if (tokens == null || tokens < limit) return null;
  const step = Math.floor(tokens / LIMITS.step);
  state.crossedAt ??= Date.now();
  if (step <= (state.step ?? -1)) return null;
  state.step = step;
  return input.agent_id ? workerMessage(tokens) : orchestratorMessage(tokens);
}

/** Stop: a reason to keep going, or null to let the session stop. */
export function onStop(input, tokens, state, handoffChangedAt) {
  if (input.agent_id || input.stop_hook_active || tokens == null || tokens < LIMITS.handoff) return null;
  state.crossedAt ??= Date.now();
  if (handoffChangedAt != null && handoffChangedAt >= state.crossedAt) return null;
  return `[context-guard] Context is at ${k(tokens)}, past the ${k(LIMITS.handoff)} handoff point, and handoff.md ` +
    "hasn't been rewritten since. Before stopping: commit finished work, rewrite handoff.md's Resume card, then end " +
    "with HANDOFF READY.";
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return;
  }
  const event = input.hook_event_name;
  if (event !== "PostToolUse" && event !== "Stop") return;
  const tokens = contextTokens(input.agent_id ? subagentTranscript(input) : input.transcript_path);
  const file = stateFile(input);
  const state = loadState(file);
  let output = null;
  if (event === "PostToolUse") {
    const message = onToolUse(input, tokens, state);
    if (message) output = { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: message } };
  } else {
    const handoff = join(process.env.CLAUDE_PROJECT_DIR || input.cwd || ".", "handoff.md");
    const changedAt = existsSync(handoff) ? statSync(handoff).mtimeMs : null;
    const reason = onStop(input, tokens, state, changedAt);
    if (reason) output = { decision: "block", reason };
  }
  writeFileSync(file, JSON.stringify(state));
  if (output) process.stdout.write(JSON.stringify(output));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`context-guard failed: ${error?.message ?? error}\n`);
  }
}
