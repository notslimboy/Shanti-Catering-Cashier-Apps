#!/bin/zsh
set -e

cd "$(dirname "$0")"

echo "Installing desktop build tools..."
python3 -m venv .venv-desktop-build
. .venv-desktop-build/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-desktop.txt

echo "Building Kasir Shanti Catering macOS app..."
python -m PyInstaller \
  --noconfirm \
  --clean \
  --onedir \
  --windowed \
  --name "Kasir Shanti Catering" \
  --add-data "index.html:." \
  --add-data "styles.css:." \
  --add-data "script.js:." \
  --add-data "service-worker.js:." \
  --add-data "manifest.webmanifest:." \
  --add-data "icon.svg:." \
  --add-data "logocatering.webp:." \
  --add-data "sample-items.csv:." \
  --add-data "sample-bulk-orders.csv:." \
  --add-data "kasir-bento.sqlite3:." \
  desktop_app.py

echo ""
echo "Done."
echo "Mac app:"
echo "$(pwd)/dist/Kasir Shanti Catering.app"
echo ""
echo "Admin can double-click that .app."
echo "If macOS blocks it, right-click the app, choose Open, then confirm."
echo ""
if [ -t 0 ]; then
  read "?Press Enter to close..."
fi
