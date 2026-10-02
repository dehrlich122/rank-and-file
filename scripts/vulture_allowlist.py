"""Names vulture can't see being used, so it would wrongly call them dead code.

Vulture only follows Python calls. These are used from elsewhere:
"""

from rankfile import bridge, codex, exceptions, levels, pieces, runner, tracer

# Called from JavaScript by the Web Worker (src/py/worker.ts), by name.
bridge.codex
bridge.load_level
bridge.load_sandbox
bridge.repl_push
bridge.repl_reset

# Called by the player's code, which vulture never sees.
pieces.Pawn.move
pieces.Pawn.position
pieces.Pawn.capture_left
pieces.Pawn.capture_right
pieces.Pawn.look

# Level fields read by the level checker (engine/tests/test_levels.py), which
# vulture doesn't scan.
levels.Level.lesson

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
