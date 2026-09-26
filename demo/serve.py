#!/usr/bin/env python3
"""Rank & File: a small local web server for the game, with the right file types.

    python serve.py            serve the game and open it in your browser
    python serve.py --check    check this computer and folder can run the game
    python serve.py --no-open  serve it without opening a browser

It listens only on this computer (127.0.0.1), on the first free port from
8000 to 8010. Press Ctrl+C, or close the window, to stop it.

Works with Python 3.8 or later, and needs nothing else installed.
"""

import functools
import glob
import http.server
import os
import platform
import socket
import sys
import threading
import urllib.request
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
PORTS = range(8000, 8011)

# Browsers only run the game's scripts and WebAssembly when they're served
# with these types, and some Python versions and Windows setups guess them
# wrong, so they're set here.
TYPES = {
    "": "application/octet-stream",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".wasm": "application/wasm",
    ".zip": "application/zip",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".md": "text/plain; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
}

# Files the game can't start without (plus its main script, found by name).
REQUIRED = [
    "index.html",
    "pyodide/pyodide.mjs",
    "pyodide/pyodide.asm.mjs",
    "pyodide/pyodide.asm.wasm",
    "pyodide/python_stdlib.zip",
    "pyodide/pyodide-lock.json",
]


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = TYPES

    def log_message(self, *args):
        pass  # keep the window quiet


def free_port():
    """The first port from 8000 to 8010 that nothing else is using, or None."""
    for port in PORTS:
        with socket.socket() as probe:
            try:
                probe.bind(("127.0.0.1", port))
            except OSError:
                continue
            return port
    return None


class Server(http.server.ThreadingHTTPServer):
    def handle_error(self, request, client_address):
        # A browser (or the check) that stops reading mid-file isn't a problem.
        if not isinstance(sys.exc_info()[1], ConnectionError):
            super().handle_error(request, client_address)


def make_server(port):
    return Server(("127.0.0.1", port), functools.partial(Handler, directory=HERE))


def line(ok, text):
    print(("  [ok] " if ok else "  [!!] ") + text)
    return ok


def check():
    """Check everything the game needs; print what's wrong. Returns an exit code."""
    print("Checking with Python " + platform.python_version() + ".\n")
    ok = line(sys.version_info >= (3, 8), "Python 3.8 or later")

    missing = [name for name in REQUIRED if not os.path.isfile(os.path.join(HERE, name))]
    scripts = sorted(glob.glob(os.path.join(HERE, "assets", "index-*.js")))
    if not scripts:
        missing.append("assets/index-*.js")
    ok = line(not missing, "the game's files are all here" if not missing else "missing files: " + ", ".join(missing)) and ok

    port = free_port()
    ok = line(port is not None, "a free port: " + str(port) if port else "no free port from 8000 to 8010") and ok

    if port and not missing:
        # Serve for a moment and fetch the key files the way a browser will.
        server = make_server(port)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        probes = [
            ("index.html", "text/html"),
            ("assets/" + os.path.basename(scripts[0]), "text/javascript"),
            ("pyodide/pyodide.mjs", "text/javascript"),
            ("pyodide/pyodide.asm.wasm", "application/wasm"),
        ]
        try:
            for path, expected in probes:
                try:
                    with urllib.request.urlopen("http://127.0.0.1:%d/%s" % (port, path), timeout=10) as response:
                        got = response.headers.get_content_type()
                        passed = response.status == 200 and got == expected
                except OSError as error:
                    passed, got = False, str(error)
                ok = line(passed, "serves " + path + (" as " + expected if passed else ": got " + got + ", needs " + expected)) and ok
        finally:
            server.shutdown()
            server.server_close()

    print("\n  Use a recent Chrome, Edge or Firefox (or Safari 16.4 or later) to play.\n")
    if ok:
        print("Ready. Start the game with Start game.cmd (Windows), sh start-game.sh, or: python serve.py")
        return 0
    print("Not ready yet: fix the items marked [!!] above. README.md has help.")
    return 1


def main():
    if "--check" in sys.argv[1:]:
        sys.exit(check())
    port = free_port()
    if port is None:
        print("Ports 8000 to 8010 are all in use. Close another local web server and try again.")
        sys.exit(1)
    server = make_server(port)
    url = "http://localhost:%d/" % port
    print("Rank & File is running at " + url)
    print("Keep this window open while you play. Press Ctrl+C (or close the window) to stop.")
    if "--no-open" not in sys.argv[1:]:
        threading.Timer(0.5, webbrowser.open, [url]).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
