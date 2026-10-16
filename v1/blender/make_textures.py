"""Generates the car's baked textures (tyre, brake disc, carbon weave, leather, badge) as PNGs."""
import sys
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = sys.argv[1] if len(sys.argv) > 1 else '../Niepotrzebne/build/tex'
os.makedirs(OUT, exist_ok=True)


def height_to_normal(h, strength):
    gy, gx = np.gradient(h.astype(np.float64))
    n = np.dstack([-gx * strength, gy * strength, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8))


def font(size):
    for p in ('/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/System/Library/Fonts/Helvetica.ttc',
              '/Library/Fonts/Arial Bold.ttf'):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def tyre():
    W, H = 4096, 512
    h = np.zeros((H, W), np.float32)
    v = np.arange(H) / (H - 1)
    tread = (v > 0.36) & (v < 0.64)
    for g in (0.405, 0.47, 0.53, 0.595):
        h[np.abs(v - g) < 0.006, :] = -1.0
    u = np.arange(W) / W
    for k in range(180):
        c = k / 180
        du = np.abs(((u - c + 0.5) % 1.0) - 0.5) < 0.0008
        rows = (v > 0.37) & (v < 0.40) | (v > 0.60) & (v < 0.63)
        h[np.ix_(rows, du)] = -0.7
    img = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(img)
    f = font(46)
    fs = font(26)
    for side, y0 in (('A', 70), ('B', H - 120)):
        for rep in range(2):
            x0 = rep * W // 2
            d.text((x0 + 300, y0), 'MICHELIN', font=f, fill=255)
            d.text((x0 + 900, y0 + 10), 'PILOT SPORT 4S', font=fs, fill=255)
            d.text((x0 + 1500, y0 + 10), '265/35 ZR 20  101Y', font=fs, fill=255)
    lettering = np.array(img.filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255
    h += lettering * 0.6
    h = np.array(Image.fromarray(((h + 1) * 120).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32) / 120 - 1
    height_to_normal(h, 6.0).save(f'{OUT}/tyre_normal.png')
    rough = np.full((H, W), 0.82, np.float32)
    rough[tread] = 0.9
    rough -= lettering * 0.25
    base = np.full((H, W), 22, np.float32) + lettering * 10
    Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).convert('RGB').save(f'{OUT}/tyre_base.png')
    orm = np.dstack([np.full((H, W), 255, np.uint8), (rough * 255).astype(np.uint8), np.zeros((H, W), np.uint8)])
    Image.fromarray(orm).save(f'{OUT}/tyre_orm.png')


def disc():
    S = 1024
    yy, xx = np.mgrid[0:S, 0:S] / (S - 1) * 2 - 1
    r = np.sqrt(xx * xx + yy * yy)
    a = np.arctan2(yy, xx)
    rng = np.random.default_rng(3)
    base = 70 + 18 * rng.standard_normal((S, S))
    base = np.array(Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5))).astype(np.float32)
    h = np.zeros((S, S), np.float32)
    for ring, n, off in ((0.62, 36, 0.0), (0.74, 36, 0.5), (0.86, 36, 0.0)):
        for k in range(n):
            ang = (k + off) / n * 2 * np.pi + ring * 3
            cx, cy = ring * np.cos(ang), ring * np.sin(ang)
            hole = (xx - cx) ** 2 + (yy - cy) ** 2 < 0.018 ** 2
            h[hole] = -1
            base[hole] = 15
    grooves = (np.abs(np.sin(a * 10 + r * 9)) < 0.04) & (r > 0.55) & (r < 0.95)
    h[grooves] = -0.5
    hat = r < 0.5
    base[hat] = 40
    rgb = np.dstack([base, base, base * 1.02])
    Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).save(f'{OUT}/disc_base.png')
    height_to_normal(h, 4.0).save(f'{OUT}/disc_normal.png')


def carbon():
    S = 1024
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    cell = 32
    cx = (xx // cell).astype(int)
    cy = (yy // cell).astype(int)
    warp = ((cx + cy) % 2 == 0)
    fx = (xx % cell) / cell
    fy = (yy % cell) / cell
    tow = np.where(warp, np.sin(fy * np.pi), np.sin(fx * np.pi))
    stripe = np.where(warp, 0.5 + 0.5 * np.sin(xx * 0.9), 0.5 + 0.5 * np.sin(yy * 0.9))
    lum = 18 + 28 * tow * (0.7 + 0.3 * stripe)
    Image.fromarray(np.dstack([lum, lum, lum * 1.05]).clip(0, 255).astype(np.uint8)).save(f'{OUT}/carbon_base.png')
    height_to_normal(tow * 0.6, 3.0).save(f'{OUT}/carbon_normal.png')


def leather():
    S = 1024
    rng = np.random.default_rng(7)
    n = rng.standard_normal((S, S)).astype(np.float32)
    n = np.array(Image.fromarray(((n * 30) + 128).clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.2))).astype(np.float32)
    h = (n - 128) / 30
    yy, xx = np.mgrid[0:S, 0:S]
    perf = ((xx % 24 - 12) ** 2 + (yy % 24 - 12) ** 2) < 9
    h2 = h.copy()
    h2[perf] -= 3
    height_to_normal(h, 1.2).save(f'{OUT}/leather_normal.png')
    height_to_normal(h2, 1.2).save(f'{OUT}/leather_perf_normal.png')


def wordmark():
    W, H = 2048, 256
    img = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(img)
    s = 150
    gap = 300
    x = 160
    t = 22
    y0 = 50

    def bar(x0, y_, w, h_):
        d.rectangle([x0, y_, x0 + w, y_ + h_], fill=255)
    bar(x, y0, s, t)
    bar(x + s // 2 - t // 2, y0 + t + 12, t, s - t - 12)
    x += gap
    bar(x, y0, s, t)
    bar(x, y0 + s // 2 - t // 2, s, t)
    bar(x, y0 + s - t, s, t)
    x += gap
    bar(x, y0, s, t)
    bar(x, y0 + t, t, s // 2 - t)
    bar(x, y0 + s // 2 - t // 2, s, t)
    bar(x + s - t, y0 + s // 2, t, s // 2 - t)
    bar(x, y0 + s - t, s, t)
    x += gap
    bar(x, y0, t, s)
    bar(x, y0 + s - t, s, t)
    x += gap
    d.polygon([(x, y0 + s), (x + s // 2 - t // 2, y0), (x + s // 2 + t // 2, y0), (x + s, y0 + s), (x + s - t, y0 + s),
               (x + s // 2, y0 + t + 6), (x + t, y0 + s)], fill=255)
    bar(x + s // 4, y0 + s * 0.62, s // 2, t)
    img.save(f'{OUT}/wordmark_alpha.png')


def tlogo():
    S = 512
    img = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(img)
    d.polygon([(40, 120), (256, 150), (472, 120), (472, 150), (290, 180), (270, 470), (256, 480), (242, 470), (222, 180),
               (40, 150)], fill=255)
    d.polygon([(70, 60), (256, 80), (442, 60), (430, 95), (256, 110), (82, 95)], fill=255)
    img.filter(ImageFilter.GaussianBlur(1)).save(f'{OUT}/tlogo_alpha.png')


tyre()
disc()
carbon()
leather()
wordmark()
tlogo()
print('textures ok')
