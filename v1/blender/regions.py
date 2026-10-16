"""2D region masks (polygons in a projection plane) as signed distance images, sampled in 3D."""
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt, map_coordinates

F32 = np.float32
AXES = {'xy': (0, 1), 'zy': (2, 1), 'xz': (0, 2)}


def chaikin(pts, iters=3, closed=True):
    p = np.asarray(pts, dtype=np.float64)
    for _ in range(iters):
        q = []
        n = len(p)
        rng = range(n) if closed else range(n - 1)
        for i in rng:
            a, b = p[i], p[(i + 1) % n]
            q.append(0.75 * a + 0.25 * b)
            q.append(0.25 * a + 0.75 * b)
        if not closed:
            q = [p[0]] + q + [p[-1]]
        p = np.array(q)
    return p


class Region:
    def __init__(self, pts, plane='xy', mirror_x=False, smooth=3, res=0.0015, pad=0.12, clip=None):
        poly = chaikin(pts, smooth) if smooth else np.asarray(pts, dtype=np.float64)
        self.plane = plane
        self.mirror = mirror_x
        self.clip = clip
        lo = poly.min(0) - pad
        hi = poly.max(0) + pad
        n = np.ceil((hi - lo) / res).astype(int) + 1
        img = Image.new('L', (int(n[0]), int(n[1])), 0)
        pix = [((p[0] - lo[0]) / res, (p[1] - lo[1]) / res) for p in poly]
        ImageDraw.Draw(img).polygon(pix, fill=255)
        m = np.array(img).T > 127
        inside = distance_transform_edt(m) * res
        outside = distance_transform_edt(~m) * res
        self.sdf = (outside - inside).astype(F32)
        self.lo = lo
        self.res = res
        self.n = n

    def __call__(self, X, Y, Z):
        P = [X, Y, Z]
        a, b = AXES[self.plane]
        u = P[a]
        if self.mirror and a == 0:
            u = np.abs(u)
        v = P[b]
        if self.mirror and b == 0:
            v = np.abs(v)
        iu = (u - self.lo[0]) / self.res
        iv = (v - self.lo[1]) / self.res
        far = (iu < 0) | (iv < 0) | (iu > self.n[0] - 1) | (iv > self.n[1] - 1)
        d = map_coordinates(self.sdf, [np.clip(iu, 0, self.n[0] - 1).ravel(), np.clip(iv, 0, self.n[1] - 1).ravel()],
                            order=1, mode='nearest').reshape(np.shape(u)).astype(F32)
        d = np.where(far, np.maximum(d, F32(0.12)), d)
        for cl in (self.clip if isinstance(self.clip, list) else [self.clip] if self.clip else []):
            axis, sign, val = cl[:3]
            q = np.abs(P[axis]) if len(cl) > 3 and cl[3] == 'abs' else P[axis]
            c = (q - val) * (-sign)
            d = np.maximum(d, c.astype(F32))
        return d
