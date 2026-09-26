#!/bin/sh
# Rank & File: checks this computer can run the game. See README.md.
# Run it from a terminal in this folder:  sh check-setup.sh
cd "$(dirname "$0")" || exit 1
echo "Rank & File: checking this computer can run the game."
echo

# -- Node.js 18 or later -------------------------------------------------------
node_ok=""
node_status="not found"
if command -v node >/dev/null 2>&1; then
  version=$(node --version 2>/dev/null)
  if node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)' 2>/dev/null; then
    node_ok=1
    node_status="found: $version"
  else
    node_status="too old: $version, needs 18 or later"
  fi
fi

# -- Python 3.8 or later ---------------------------------------------------------
python=""
python_status="not found"
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1; then
    version=$("$candidate" -c 'import platform; print(platform.python_version())' 2>/dev/null)
    if "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)' 2>/dev/null; then
      python="$candidate"
      python_status="found: Python $version"
      break
    fi
    python_status="too old: Python $version, needs 3.8 or later"
  fi
done

echo "  Node.js 18 or later:  $node_status"
echo "  Python 3.8 or later:  $python_status"
echo

# -- Run the full check with one of them -------------------------------------------
if [ -n "$node_ok" ]; then
  exec node serve.mjs --check
elif [ -n "$python" ]; then
  exec "$python" serve.py --check
fi
echo "You need Node.js 18+ or Python 3.8+ to serve the game to your browser."
echo "Install either one, then run this check again:"
echo "  Node.js: https://nodejs.org  (the LTS download; on macOS also: brew install node)"
echo "  Python:  https://www.python.org/downloads/  (most Linux systems already have python3)"
echo "README.md has more help."
exit 1
