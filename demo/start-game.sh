#!/bin/sh
# Rank & File: starts the game and opens it in your browser. See README.md.
# Run it from a terminal in this folder:  sh start-game.sh
# Keep the terminal open while you play; press Ctrl+C to stop.
cd "$(dirname "$0")" || exit 1

# Node.js 18 or later first, then Python 3.8 or later (see check-setup.sh).
if command -v node >/dev/null 2>&1 && node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)' 2>/dev/null; then
  exec node serve.mjs "$@"
fi
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)' 2>/dev/null; then
    exec "$candidate" serve.py "$@"
  fi
done
echo "Neither Node.js 18+ nor Python 3.8+ was found, so the game can't be served."
echo "Run: sh check-setup.sh   for details, or see README.md."
exit 1
