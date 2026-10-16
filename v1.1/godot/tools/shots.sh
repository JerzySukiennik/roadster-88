#!/bin/bash
# Roadster 88 (Godot): run every screenshot scenario (PNGs and frame times land in ../Niepotrzebne/shots-godot/).
HERE="$(cd "$(dirname "$0")/.." && pwd)"
GODOT="${GODOT:-/Applications/Godot.app/Contents/MacOS/Godot}"
LIST="${@:-idle launch boost hop hover fly_land crash30 crash80 crash200 timejump fpp_tap night driver hero}"
for s in $LIST; do
  echo "== $s"
  nice -n 10 "$GODOT" --path "$HERE" --scenario=$s > "/tmp/r88_scn_$s.log" 2>&1
  grep -E "FRAMES|SCRIPT ERROR|landed|hover yaw|lattice|impact speed" "/tmp/r88_scn_$s.log"
done
