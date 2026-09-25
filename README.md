# Rank & File

Learn Python by writing real Python to move a chess piece across a board.
Everything runs locally in your browser; player code runs in real CPython
(via [Pyodide](https://pyodide.org)) inside a Web Worker.

## Run it

Requirements: Node.js 22.12+ (24 LTS recommended) and, for the engine tests, Python 3.14.

```sh
npm install        # installs dependencies and copies Pyodide into public/pyodide/
npm run dev        # open http://localhost:5173
```

`npm run play` builds the production version and opens it in a preview server.
The game has to be served over http: opening `index.html` directly from disk won't work.

## Tests

```sh
py -3.14 -m venv .venv                                   # once (macOS/Linux: python3.14 -m venv .venv)
.venv/Scripts/python -m pip install -r requirements-dev.txt

npm run check      # TypeScript typecheck + Vitest + pytest
```

## Where things are

- `DESIGN.md`: the design brief (what and why)
- `docs/ARCHITECTURE.md`: how it's built
- `engine/rankfile/`: the game engine, in plain Python
- `src/`: the browser UI (TypeScript)
- `levels/`, `lessons/`, `solutions/`: level content
