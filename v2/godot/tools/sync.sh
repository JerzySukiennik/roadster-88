#!/bin/bash
# Roadster 88 (Godot): mirror ../assets and ../shared into ext/ (read-only copies, never edit them here).
set -e
HERE="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
mkdir -p "$HERE/ext"
rsync -a --delete --exclude ".DS_Store" --exclude "*.import" --filter="P *.png" --filter="P *.jpg" --filter="P *.jpeg" --filter="P *.webp" "$ROOT/assets/" "$HERE/ext/assets/"
rsync -a --delete --exclude ".DS_Store" --exclude "*.import" --exclude "parity.md" --exclude "TUNING-LOG.md" "$ROOT/shared/" "$HERE/ext/shared/"
echo "synced assets + shared into $HERE/ext"
