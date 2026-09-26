@echo off
rem Rank & File: checks this computer can run the game. See README.md.
rem Double-click it, or run it from a Command Prompt or PowerShell in this folder.
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Rank ^& File: check setup
echo Rank ^& File: checking this computer can run the game.
echo.

rem -- Node.js 18 or later ---------------------------------------------------
set "NODE_OK="
set "NODE_STATUS=not found"
for /f "delims=" %%v in ('node --version 2^>nul') do set "NODE_STATUS=too old: %%v, needs 18 or later"
call node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)" >nul 2>&1 && set "NODE_OK=1"
if defined NODE_OK for /f "delims=" %%v in ('node --version') do set "NODE_STATUS=found: %%v"

rem -- Python 3.8 or later ---------------------------------------------------
rem Tries the py launcher, then python and python3. Running each one (not
rem just finding it) skips the Microsoft Store placeholder that stands in for
rem python when Python isn't really installed. `call` also handles runtimes
rem installed as batch-file shims (e.g. pyenv-win), which would otherwise end
rem this script.
set "PYTHON="
set "PYTHON_STATUS=not found"
for %%p in (py python python3) do (
  if not defined PYTHON (
    call %%p -c "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)" >nul 2>&1 && set "PYTHON=%%p"
  )
)
if defined PYTHON for /f "delims=" %%v in ('!PYTHON! -c "import platform; print(platform.python_version())"') do set "PYTHON_STATUS=found: Python %%v"

echo   Node.js 18 or later:  !NODE_STATUS!
echo   Python 3.8 or later:  !PYTHON_STATUS!
echo.

rem -- Run the full check with one of them ------------------------------------
if defined NODE_OK (
  call node serve.mjs --check
) else if defined PYTHON (
  call !PYTHON! serve.py --check
) else (
  goto :missing
)
set "RESULT=!ERRORLEVEL!"
echo.
pause
exit /b !RESULT!

:missing
echo You need Node.js 18+ or Python 3.8+ to serve the game to your browser.
echo Install either one, then run this check again:
echo   Node.js: https://nodejs.org  - the LTS download
echo   Python:  https://www.python.org/downloads/  - tick "Add python.exe to PATH"
echo After installing, close and reopen any terminal windows. README.md has more help.
echo.
pause
exit /b 1
