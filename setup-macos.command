#!/bin/zsh
set -e

cd "$(dirname "$0")"

echo "Setting up desktop build environment..."
python3 -m venv .venv-desktop-build
. .venv-desktop-build/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-desktop.txt

echo ""
echo "Done. Desktop dependencies are ready."
echo "No app was built."
echo ""
if [ -t 0 ]; then
  read "?Press Enter to close..."
fi
