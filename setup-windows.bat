@echo off
setlocal

cd /d "%~dp0"

echo Setting up desktop build environment...
python -m venv .venv-desktop-build
if errorlevel 1 goto failed

call .venv-desktop-build\Scripts\activate.bat
if errorlevel 1 goto failed

python -m pip install --upgrade pip
if errorlevel 1 goto failed

python -m pip install -r requirements-desktop.txt
if errorlevel 1 goto failed

echo.
echo Done. Desktop dependencies are ready.
echo No app was built.
echo.
pause
exit /b 0

:failed
echo.
echo Setup failed. Check the message above.
pause
exit /b 1
