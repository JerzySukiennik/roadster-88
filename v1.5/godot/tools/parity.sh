#!/bin/bash
# Roadster 88 (Godot): run the headless parity harness at a fixed 120 Hz and update shared/parity.md.
HERE="$(cd "$(dirname "$0")/.." && pwd)"
GODOT="${GODOT:-/Applications/Godot.app/Contents/MacOS/Godot}"
nice -n 10 "$GODOT" --headless --path "$HERE" --fixed-fps 120 --script res://tools/parity.gd
