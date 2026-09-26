"""Names vulture can't see being used, so it would wrongly call them dead code.

Vulture only follows Python calls. These are used from elsewhere:
"""

from rankfile import bridge, exceptions, levels, pieces, runner, tracer

# Called from JavaScript by the Web Worker (src/py/worker.ts), by name.
bridge.load_level
bridge.load_sandbox
bridge.repl_push
bridge.repl_reset

# Called by the player's code, which vulture never sees.
pieces.Pawn.move
pieces.Pawn.position

# Dataclass fields that are serialised to JSON (asdict) for the UI.
levels.Level.hints
levels.Level.lesson
runner.SnippetResult.duration_ms
runner.LevelResult.final
runner.LevelResult.duration_ms
tracer.Step.scope
tracer.Step.vars

# Read by Python's traceback module when it names an exception.
exceptions.GameError.__module__
tracer.StepBudgetExceeded.__module__
