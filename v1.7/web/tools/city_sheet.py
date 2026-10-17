# Roadster 88 city sheet: tiles harness screenshots into one labelled JPEG contact sheet.
# usage: python3 web/tools/city_sheet.py out.jpg cols "label=path" "label=path" ...
import sys
from PIL import Image, ImageDraw, ImageFont

out, cols, items = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
W, H = 720, 450
rows = (len(items) + cols - 1) // cols
sheet = Image.new('RGB', (cols * W, rows * H), (12, 12, 14))
try:
    font = ImageFont.truetype('/System/Library/Fonts/SFNS.ttf', 26)
except Exception:
    font = ImageFont.load_default()
for i, it in enumerate(items):
    label, path = it.split('=', 1)
    try:
        im = Image.open(path).convert('RGB').resize((W, H), Image.LANCZOS)
    except Exception:
        continue
    d = ImageDraw.Draw(im)
    d.rectangle([0, H - 44, W, H], fill=(0, 0, 0))
    d.text((14, H - 38), label, fill=(240, 240, 240), font=font)
    sheet.paste(im, ((i % cols) * W, (i // cols) * H))
sheet.save(out, quality=88)
print('wrote', out)
