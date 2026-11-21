"""Names vulture can't see being used, so it would wrongly call them dead code.

Vulture only follows Python calls. These are used from elsewhere:
"""

from rankfile import bridge, codex, exceptions, levels, pieces, runner, tracer

# Called from JavaScript by the Web Worker (src/py/worker.ts), by name.
bridge.code_lines
bridge.codex
bridge.load_level
bridge.load_sandbox
bridge.repl_push
bridge.repl_reset
bridge.solve_start
bridge.solve_step

# Called by the player's code, which vulture never sees.
pieces.Pawn.move
pieces.Pawn.position
pieces.Pawn.capture_left
pieces.Pawn.capture_right
pieces.Pawn.look

# Level fields read by the level checker (engine/tests/test_levels.py), which
# vulture doesn't scan.
levels.Level.lesson
levels.Level.solution  # read by the tests; the editor keeps it in the level file's data

# Dataclass fields that are serialised to JSON (asdict) for the UI.
codex.Entry.new
runner.SnippetResult.duration_ms
runner.LevelResult.final
runner.LevelResult.duration_ms
runner.LevelResult.stars
runner.LevelResult.case
runner.LevelResult.case_note
runner.Star.earned
runner.Star.label
tracer.Step.scope
tracer.Step.vars

# Read by Python's traceback module when it names an exception.
exceptions.GameError.__module__
tracer.StepBudgetExceeded.__module__

# Read by Python's error messages when they name the player's help().
codex.player_namespace.help.__qualname__

# M5.2 (functions and the examiner): fields only the UI reads, through JSON.
runner.LevelResult.call
tracer.Step.globals  # M5.2-1
tracer.Step.depth
tracer.Step.continues

# M5.2-5a: a lesson snippet's fence, read by name; only the level checker unpacks it.
codex.Snippet.meant

# M5.2-6a0: the examiner's two parts of a case's summary, read only through the result's JSON.
runner.CallInfo.happened
runner.CallInfo.said
