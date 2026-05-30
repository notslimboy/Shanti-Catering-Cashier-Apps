@echo off
setlocal

cd /d "%~dp0"

echo Installing desktop build tools...
if not exist ".venv-desktop-build\Scripts\activate.bat" (
  python -m venv .venv-desktop-build
  if errorlevel 1 goto failed
)
call .venv-desktop-build\Scripts\activate.bat
if errorlevel 1 goto failed
python -m pip install -r requirements-desktop.txt
if errorlevel 1 goto failed

echo Building Kasir Shanti Catering desktop app...
python -m PyInstaller ^
  --noconfirm ^
  --clean ^
  --onedir ^
  --windowed ^
  --name "Kasir Shanti Catering" ^
  --add-data "index.html;." ^
  --add-data "styles.css;." ^
  --add-data "script.js;." ^
  --add-data "service-worker.js;." ^
  --add-data "manifest.webmanifest;." ^
  --add-data "icon.svg;." ^
  --add-data "logocatering.webp;." ^
  --add-data "sample-items.csv;." ^
  --add-data "sample-bulk-orders.csv;." ^
  --add-data "kasir-bento.sqlite3;." ^
  desktop_app.py
if errorlevel 1 goto failed

echo.
echo Done.
echo App folder:
echo %cd%\dist\Kasir Shanti Catering
echo.
echo Give that whole folder to the admin, then create a Desktop shortcut to:
echo dist\Kasir Shanti Catering\Kasir Shanti Catering.exe
echo.
pause
exit /b 0

:failed
echo.
echo Build failed. Check the message above.
pause
exit /b 1
