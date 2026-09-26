# Rank & File: {{TITLE}}

Rank & File is a puzzle game that teaches Python: you write real Python to move
a chess piece. This folder is a ready-built copy of the game. It runs entirely on
your computer, in your web browser, and nothing is sent anywhere.

## What you need

- **A web browser:** a recent Chrome, Edge or Firefox (Safari 16.4 or later works too).
- **Node.js 18 or later, or Python 3.8 or later.** You only need one of them:
  - Node.js: <https://nodejs.org> (the LTS download)
  - Python: <https://www.python.org/downloads/> (on Windows, tick **Add python.exe to
    PATH** in the installer)

Why the second one: browsers won't run the game straight from its files
(double-clicking `index.html` just shows a blank page). It needs a small local web
server. Two are included, `serve.mjs` for Node.js and `serve.py` for Python, and
they need nothing else installed.

## 1. Check your setup

- **Windows:** double-click **`Check setup.cmd`**.
- **macOS or Linux:** open a terminal in this folder and run `sh check-setup.sh`.

The check:

1. finds Node.js and Python, and reports their versions;
2. makes sure the game's files are all here;
3. finds a free port to serve on, from 8000 to 8010;
4. starts the server for a moment and loads the game's key files the way your
   browser will, to confirm they arrive with the types browsers require.

It ends with **Ready**, or lists what to fix, marked `[!!]`. A good run looks
like this:

```
  Node.js 18 or later:  found: v22.11.0
  Python 3.8 or later:  not found

Checking with Node.js v22.11.0.

  [ok] Node.js 18 or later
  [ok] the game's files are all here
  [ok] a free port: 8000
  [ok] serves index.html as text/html
  [ok] serves assets/index-B6qluGP6.js as text/javascript
  [ok] serves pyodide/pyodide.mjs as text/javascript
  [ok] serves pyodide/pyodide.asm.wasm as application/wasm

Ready. Start the game with Start game.cmd (Windows), sh start-game.sh, or: node serve.mjs
```

Only one of Node.js and Python has to be found.

### Checking by hand

Open a terminal (on Windows, PowerShell or Command Prompt) and run:

```
node --version       should print v18.0.0 or later
python --version     should print Python 3.8 or later
```

On macOS and Linux, try `python3 --version` too. On Windows, try `py --version`.

- If you see "not recognized" or "command not found", that program isn't
  installed, or your terminal was opened before you installed it. Open a new
  terminal and try again.
- On Windows, a message about the Microsoft Store means Python isn't really
  installed. Install it from python.org.

Then run the full check by hand, in this folder: `node serve.mjs --check`, or
`python serve.py --check`.

## 2. Start the game

- **Windows:** double-click **`Start game.cmd`**.
- **macOS or Linux:** `sh start-game.sh`, in a terminal in this folder.
- **By hand:** `node serve.mjs`, or `python serve.py` (`python3` on macOS and Linux).

Your browser opens at <http://localhost:8000> (or a nearby port, if 8000 is busy).
The first load takes a few seconds while Python starts up inside the page.

Keep the window that started the game open while you play. Close it, or press
Ctrl+C in it, to stop the game.

## Troubleshooting

| What you see | What to do |
|---|---|
| A blank page, or "Setting up the board…" that never finishes | You probably opened `index.html` directly. Start the game with the steps above instead. |
| "Python failed to load" at the top of the page | Another web server may be sending the files with the wrong types. Use the included server, and run the check. |
| Windows says it "protected your PC" when you open a `.cmd` file | Files from a downloaded zip are marked as coming from the internet. Click **More info**, then **Run anyway**. Or, before unzipping, right-click the zip, choose **Properties**, tick **Unblock**, and unzip again. |
| "Ports 8000 to 8010 are all in use" | Close other local web servers (or other copies of this game) and try again. |
| The browser didn't open by itself | Open the address the window shows, e.g. <http://localhost:8000>. |
| The check says a file is missing | The zip didn't unpack completely. Unzip it again, into a folder you can write to. |

## What's saved

{{SAVED}} This is stored in your browser, for the address the game runs at
(<http://localhost:8000>). A different browser, or a different port, starts fresh.
Nothing is saved in this folder.

## License

Rank & File is by David Ehrlich. The game's code is under the MIT License
(`LICENSE`). Its levels, lessons and solutions, which are built into the game,
are under Creative Commons BY-NC-SA 4.0 (`LICENSE-CONTENT`): free to share and
adapt for non-commercial use, with credit, under the same license.

## Removing it

Delete this folder. To also clear what the game saved, clear your browser's site data
for `localhost`.
