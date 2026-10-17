#!/bin/zsh
set -e
cd "$(dirname "$0")/.."
R=Niepotrzebne/renders/$1
mkdir -p $R
cd blender && nice -n 10 ../Niepotrzebne/venv/bin/python build_preview.py ${2:-0.010} ../Niepotrzebne/build/preview_body.npz && cd ..
nice -n 10 /Applications/Blender.app/Contents/MacOS/Blender -b --python blender/render_preview.py -- Niepotrzebne/build/preview_body.npz $R Niepotrzebne/hdri/${HDR:-studio}.hdr EEVEE 960 640 >/dev/null 2>&1
nice -n 10 /Applications/Blender.app/Contents/MacOS/Blender -b --python blender/render_match.py -- Niepotrzebne/build/preview_body.npz Niepotrzebne/build/cams.json $R Niepotrzebne/hdri/studio.hdr 2.85 >/dev/null 2>&1
for n in c14 c10 ref1; do Niepotrzebne/venv/bin/python Niepotrzebne/tools/overlay.py Niepotrzebne/refs/extra/$n.jpg $R/match_$n.png $R/ov_$n.jpg; done
F=Niepotrzebne/refs; X=$F/extra
Niepotrzebne/venv/bin/python Niepotrzebne/tools/sheet.py $R/compare.jpg 4 480 $F/1.png $R/ref1.png $X/c9.jpg $R/c9.png $X/c4.jpg $R/c4.png $F/3.png $R/ref3.png $X/c8.jpg $R/c8.png $R/side_r.png $R/top.png
echo done $R
