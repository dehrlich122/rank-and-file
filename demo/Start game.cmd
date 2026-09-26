@echo off
rem Rank & File: starts the game and opens it in your browser. See README.md.
rem Keep this window open while you play; close it (or press Ctrl+C) to stop.
setlocal EnableExtensions
cd /d "%~dp0"
title Rank ^& File

rem Node.js 18 or later first, then Python 3.8 or later (see Check setup.cmd).
rem `call` handles runtimes installed as batch-file shims, e.g. pyenv-win.
call node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)" >nul 2>&1 && (
  call node serve.mjs
  goto :end
)
for %%p in (py python python3) do (
  call %%p -c "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)" >nul 2>&1 && (
    call %%p serve.py
    goto :end
  )
)
echo Neither Node.js 18+ nor Python 3.8+ was found, so the game can't be served.
echo Double-click "Check setup.cmd" for details, or see README.md.

:end
echo.
pause
