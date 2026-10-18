# Roadster 88 Earth bake: turns ETOPO 2022 60 arc-second surface elevation (NOAA, public domain) and the Natural Earth 10 m land, lake and glacier polygons (public domain) into the bundled Earth data in assets/earth: 10 x 10 degree tiles of ground elevation and water level, a global water mask for the globe and a small biome map.
# usage: python3 web/tools/earth-bake.py [src_dir] [out_dir]   (src_dir holds etopo60s.nc and the unzipped ne_10m_* folders)
import sys, os, json, zlib, struct
import numpy as np
import h5py, shapefile
from PIL import Image, ImageDraw

Image.MAX_IMAGE_PIXELS = None
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
SRC = ARGS[0] if len(ARGS) > 0 else 'Niepotrzebne/earth-src'
OUT = ARGS[1] if len(ARGS) > 1 else 'assets/earth'
W, H, R = 21600, 10800, 60
TILE, N = 10, 600
VALLEY = (35.1, -117.9)
LAND = -32768
os.makedirs(OUT, exist_ok=True)


def load_etopo():
    f = h5py.File(os.path.join(SRC, 'etopo60s.nc'), 'r')
    z, lat, lon = f['z'], f['lat'][:], f['lon'][:]
    print('etopo', z.shape, z.dtype, 'lat', lat[0], lat[-1], 'lon', lon[0], lon[-1])
    assert z.shape == (H, W)
    assert abs(lon[0] - (-180 + 0.5 / R)) < 1e-4 and abs(lat[0] - (-90 + 0.5 / R)) < 1e-4
    E = np.empty((H, W), np.int16)
    step = 600
    for i in range(0, H, step):
        E[i:i + step] = np.clip(np.rint(z[i:i + step]), -32000, 32000).astype(np.int16)
    return E[::-1].copy()


def ring_area(pts):
    a = 0.0
    for k in range(len(pts)):
        x0, y0 = pts[k]; x1, y1 = pts[(k + 1) % len(pts)]
        a += x0 * y1 - x1 * y0
    return a / 2


def rings(shp):
    parts = list(shp.parts) + [len(shp.points)]
    for k in range(len(parts) - 1):
        p = shp.points[parts[k]:parts[k + 1]]
        if len(p) >= 3:
            yield p


def px(pts, ox=0, oy=0):
    return [((x + 180) * R - ox, (90 - y) * R - oy) for x, y in pts]


def land_raster():
    img = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(img)
    for shp in shapefile.Reader(os.path.join(SRC, 'ne_10m_land/ne_10m_land')).shapes():
        for p in rings(shp):
            d.polygon(px(p), fill=255 if ring_area(p) < 0 else 0)
    return np.asarray(img) > 127


def poly_mask(shp):
    xs = [(x + 180) * R for x, y in shp.points]; ys = [(90 - y) * R for x, y in shp.points]
    x0, x1, y0, y1 = int(np.floor(min(xs))) - 2, int(np.ceil(max(xs))) + 2, int(np.floor(min(ys))) - 2, int(np.ceil(max(ys))) + 2
    img = Image.new('L', (x1 - x0, y1 - y0), 0)
    d = ImageDraw.Draw(img)
    for p in rings(shp):
        d.polygon(px(p, x0, y0), fill=255 if ring_area(p) < 0 else 0)
    return np.asarray(img) > 127, x0, y0


def dilate(m):
    o = m.copy()
    o[1:] |= m[:-1]; o[:-1] |= m[1:]; o[:, 1:] |= m[:, :-1]; o[:, :-1] |= m[:, 1:]
    return o


def main():
    E = load_etopo()
    i0 = int((90 - VALLEY[0]) * R - 0.5); j0 = int((VALLEY[1] + 180) * R - 0.5)
    fy = (90 - VALLEY[0]) * R - 0.5 - i0; fx = (VALLEY[1] + 180) * R - 0.5 - j0
    q = E[i0:i0 + 2, j0:j0 + 2].astype(np.float64)
    E0 = float(q[0, 0] * (1 - fx) * (1 - fy) + q[0, 1] * fx * (1 - fy) + q[1, 0] * (1 - fx) * fy + q[1, 1] * fx * fy)
    print('E0', E0)
    land = land_raster()
    print('land fraction', land.mean())
    Wl = np.where(land, LAND, 0).astype(np.int16)
    lakeM = np.zeros((H, W), bool)
    lakes = shapefile.Reader(os.path.join(SRC, 'ne_10m_lakes/ne_10m_lakes'))
    nl = 0
    for shp in lakes.shapes():
        m, x0, y0 = poly_mask(shp)
        if not m.any():
            continue
        h, w = m.shape
        ys, xs = slice(max(0, y0), min(H, y0 + h)), slice(max(0, x0), min(W, x0 + w))
        m = m[ys.start - y0:ys.stop - y0, xs.start - x0:xs.stop - x0]
        if xs.stop <= xs.start or ys.stop <= ys.start or not m.any():
            continue
        e = E[ys, xs]; wl = Wl[ys, xs]; lk = lakeM[ys, xs]
        rim = dilate(dilate(m)) & ~m & (wl == LAND)
        lvl = int(np.percentile(e[rim], 20)) if rim.any() else int(np.percentile(e[m], 80))
        sel = m & ~lk
        wl[sel] = lvl; lk[sel] = True
        e[sel] = np.clip(np.minimum(e[sel], lvl - 2), lvl - 300, None)
        e[rim] = np.maximum(e[rim], lvl + 1)
        nl += 1
    print('lakes', nl)
    from scipy import ndimage
    sea = (Wl == 0) & ~lakeM
    lab, nlab = ndimage.label(sea, structure=np.ones((3, 3), bool))
    sizes = ndimage.sum(sea, lab, range(1, nlab + 1))
    world = set((np.argsort(sizes)[::-1][:1] + 1).tolist())
    for edge in (lab[:, 0], lab[:, -1]):
        for v in np.unique(edge):
            if v: world.add(int(v))
    objs = ndimage.find_objects(lab)
    ne = 0
    for k, sl in enumerate(objs, start=1):
        if sl is None or k in world or sizes[k - 1] < 40:
            continue
        ys = slice(max(0, sl[0].start - 3), min(H, sl[0].stop + 3)); xs = slice(max(0, sl[1].start - 3), min(W, sl[1].stop + 3))
        m = lab[ys, xs] == k
        e = E[ys, xs]; wl = Wl[ys, xs]; lk = lakeM[ys, xs]
        rim = dilate(dilate(m)) & ~m & (wl == LAND)
        if not rim.any():
            continue
        lvl = int(np.percentile(e[rim], 20))
        wl[m] = lvl; lk[m] = True
        e[m] = np.clip(np.minimum(e[m], lvl - 2), lvl - 300, None)
        e[rim] = np.maximum(e[rim], lvl + 1)
        ne += 1
    print('enclosed seas', ne)
    water = Wl != LAND
    ocean = water & ~lakeM
    E[ocean] = np.minimum(E[ocean], -1)
    coast = ~water & dilate(ocean)
    E[coast] = np.maximum(E[coast], 1)
    E[:] = np.maximum(E, -400)
    mask = np.where(water, 255, 0).astype(np.uint8)
    Image.fromarray(mask).resize((8192, 4096), Image.BOX).save(os.path.join(OUT, 'mask_8k.png'), optimize=True)
    print('mask written')
    glac = Image.new('L', (W // 4, H // 4), 0)
    d = ImageDraw.Draw(glac)
    for shp in shapefile.Reader(os.path.join(SRC, 'ne_10m_glaciated_areas/ne_10m_glaciated_areas')).shapes():
        for p in rings(shp):
            d.polygon([((x + 180) * R / 4, (90 - y) * R / 4) for x, y in p], fill=255 if ring_area(p) < 0 else 0)
    glac.save(os.path.join(OUT, 'ice_5k.png'), optimize=True)
    tiles, total = {}, 0
    for la in range(-90, 90, TILE):
        for lo in range(-180, 180, TILE):
            r0 = (90 - (la + TILE)) * R; c0 = (lo + 180) * R
            e = E[r0:r0 + N, c0:c0 + N][::-1].astype(np.int32)
            w = Wl[r0:r0 + N, c0:c0 + N][::-1].astype(np.int32)
            p = np.zeros_like(e)
            p[0, 1:] = e[0, :-1]; p[1:, 0] = e[:-1, 0]
            p[1:, 1:] = e[1:, :-1] + e[:-1, 1:] - e[:-1, :-1]
            r = e - p
            assert np.abs(r).max() < 32768
            ze = ((r << 1) ^ (r >> 31)).astype(np.uint16)
            pw = np.zeros_like(w); pw[:, 1:] = w[:, :-1]; pw[1:, 0] = w[:-1, 0]
            rw = (w - pw).astype(np.int64)
            zw = ((rw << 1) ^ (rw >> 63)).astype(np.uint32)
            body = b''.join([(ze & 255).astype(np.uint8).tobytes(), (ze >> 8).astype(np.uint8).tobytes()] + [((zw >> (8 * k)) & 255).astype(np.uint8).tobytes() for k in range(4)])
            comp = zlib.compress(body, 9)
            name = f'e_{la}_{lo}.bin'
            with open(os.path.join(OUT, name), 'wb') as fo:
                fo.write(b'R88E' + struct.pack('<HHhhI', 1, N, la, lo, len(comp)) + comp)
            land_frac = float((w == LAND).mean())
            tiles[f'{la}_{lo}'] = [len(comp) + 16, round(land_frac, 3), int(e.max()), int(e.min())]
            total += len(comp) + 16
    print('tiles', len(tiles), 'MB', total / 1048576)
    idx = {
        'version': 1, 'res': R, 'tile': TILE, 'n': N, 'rows': 'south to north', 'cols': 'west to east', 'sample': 'cell centres: lat = lat0 + (i + 0.5) / 60, lon = lon0 + (j + 0.5) / 60',
        'encoding': 'header 16 bytes (R88E, u16 version, u16 n, i16 lat0, i16 lon0, u32 length) + zlib body: elevation as plane-predicted zigzag uint16 (lo plane, hi plane), water level as left-predicted zigzag uint32 (4 byte planes, -32768 = land)',
        'valley': {'lat': VALLEY[0], 'lon': VALLEY[1], 'E0': round(E0, 2)},
        'source': 'NOAA ETOPO 2022 60 arc-second surface elevation (public domain); Natural Earth 10 m land, lakes and glaciated areas (public domain)',
        'tiles': tiles,
    }
    with open(os.path.join(OUT, 'index.json'), 'w') as fo:
        json.dump(idx, fo, separators=(',', ':'))
    print('done')


if __name__ == '__main__' and '--biome' not in sys.argv:
    main()


def biome(out=OUT, day='assets/space/earth_day_jul_4k.webp'):
    im = np.asarray(Image.open(day).convert('RGB')).astype(np.float32) / 255
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    lum = (r + g + b) / 3
    sat = im.max(2) - im.min(2)
    ice = np.clip((lum - 0.5) / 0.2, 0, 1) * np.clip(1 - sat * 5, 0, 1)
    arid = np.clip((r - g + 0.015) / 0.07, 0, 1) * np.clip((lum - 0.2) / 0.15, 0, 1) * (1 - ice)
    veg = np.clip((g - np.maximum(r, b) + 0.015) / 0.05, 0, 1) * (1 - ice) * (1 - arid * 0.7)
    h, w = im.shape[:2]
    land = 1 - np.asarray(Image.open(os.path.join(out, 'mask_8k.png')).convert('L').resize((w, h), Image.BOX)).astype(np.float32) / 255
    rgba = np.stack([veg * land, arid * land, ice * land, land], 2)
    small = rgba.reshape(h // 4, 4, w // 4, 4, 4).mean((1, 3))
    lf = np.maximum(small[..., 3:4], 1e-3)
    small[..., :3] = np.where(small[..., 3:4] > 0.02, small[..., :3] / lf, 0)
    Image.fromarray((np.clip(small, 0, 1) * 255).astype(np.uint8), 'RGBA').save(os.path.join(out, 'biome_1k.png'), optimize=True)
    print('biome written', small.shape)


if __name__ == '__main__' and '--biome' in sys.argv:
    biome()
