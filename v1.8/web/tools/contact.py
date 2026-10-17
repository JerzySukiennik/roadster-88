# Roadster 88 contact sheets: cuts video frames (12 fps) into one sheet per marked segment so a gait can be judged at a glance.
# usage: python3 contact.py <frames_dir> <marks.json> <out_dir> [tag]
import json, os, sys
from PIL import Image, ImageDraw

frames_dir, marks_path, out_dir = sys.argv[1:4]
tag = sys.argv[4] if len(sys.argv) > 4 else ''
marks = json.load(open(marks_path))
files = sorted(f for f in os.listdir(frames_dir) if f.endswith(('.png', '.jpg')))
FPS = 12
for i, m in enumerate(marks[:-1]):
    a, b = int(m['t'] * FPS), int(marks[i + 1]['t'] * FPS)
    seg = files[a:b][:24]
    if not seg:
        continue
    seg = seg[::max(1, len(seg) // 12)][:12]
    tiles = []
    for f in seg:
        im = Image.open(os.path.join(frames_dir, f)).convert('RGB')
        w, h = im.size
        im = im.crop((w * 0.3, h * 0.08, w * 0.7, h * 0.95)).resize((256, int(256 * (h * 0.87) / (w * 0.4))))
        tiles.append(im)
    tw, th = tiles[0].size
    cols = 6
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (tw * cols, th * rows + 22), (16, 16, 18))
    d = ImageDraw.Draw(sheet)
    d.text((6, 4), m['name'], fill=(240, 200, 90))
    for k, t in enumerate(tiles):
        sheet.paste(t, ((k % cols) * tw, 22 + (k // cols) * th))
    sheet.save(os.path.join(out_dir, f"sheet_{m['name']}{tag}.png"))
