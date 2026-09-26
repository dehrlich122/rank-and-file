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

npm run check      # typecheck + redundant-code checks (knip, ruff, vulture, jscpd) + Vitest + pytest
```

End-to-end checks drive the real game in headless Chrome (or Edge; set
`CHROME_PATH` if it isn't found). Start the game first, then run them:

```sh
npm run dev                                   # in one terminal
npm run e2e                                   # in another: all checks against http://localhost:5173/
npm run e2e -- http://localhost:4173/ --only=app   # e.g. against `npm run play`, one suite only
```

Results go to `e2e-results/report.json`: every check with its timing and the
browser console output. Each failure also saves a screenshot there, with code
blurred so no level solution is shown.

## Where things are

- `DESIGN.md`: the design brief (what and why)
- `docs/ARCHITECTURE.md`: how it's built
- `engine/rankfile/`: the game engine, in plain Python
- `src/`: the browser UI (TypeScript)
- `levels/`, `lessons/`, `solutions/`: level content

## License

The code is under the [MIT License](LICENSE). The level content in `levels/`,
`lessons/` and `solutions/` is under [CC BY-NC-SA 4.0](LICENSE-CONTENT): free
to share and adapt for non-commercial use, with credit, under the same license.
