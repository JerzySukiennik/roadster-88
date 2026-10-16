"""Roadster 88 body: signed distance field of the outer skin in the car frame (x left, y up, z forward, metres)."""
import numpy as np
from scipy.interpolate import PchipInterpolator
from regions import Region

F32 = np.float32


def curve(pts, n=32768):
    pts = sorted(pts)
    k = np.array([p[0] for p in pts], dtype=np.float64)
    v = np.array([p[1] for p in pts], dtype=np.float64)
    xs = np.linspace(k[0], k[-1], n)
    ys = PchipInterpolator(k, v)(xs).astype(F32)
    ys = np.append(ys, ys[-1])
    x0 = F32(k[0])
    inv = F32((n - 1) / (k[-1] - k[0]))
    top = F32(n - 1)

    def f(t):
        u = np.clip((t - x0) * inv, F32(0), top)
        i = u.astype(np.int32)
        w = u - i
        return ys[i] * (1 - w) + ys[i + 1] * w
    return f


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b * (1 - h) + a * h - k * h * (1 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def relu(v):
    return np.maximum(v, 0)


def sstep(e0, e1, v):
    t = np.clip((v - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


WHEELBASE = 2.85
AXLE_F = WHEELBASE / 2
AXLE_R = -WHEELBASE / 2
R_TIRE_F = 0.347
R_TIRE_R = 0.364
ARCH_F = dict(z=AXLE_F, y=0.355, r=0.39, x_in=0.62)
ARCH_R = dict(z=AXLE_R, y=0.372, r=0.41, x_in=0.60)

FW = curve([(-2.21, 0.74), (-2.12, 0.84), (-1.95, 0.89), (-1.60, 0.91), (-1.20, 0.915), (-0.80, 0.925), (-0.30, 0.93),
            (0.30, 0.93), (0.80, 0.92), (1.20, 0.90), (1.60, 0.875), (1.95, 0.835), (2.15, 0.75), (2.26, 0.60)])
FYm = curve([(-2.21, 0.50), (-1.50, 0.52), (-0.50, 0.52), (0.50, 0.50), (1.50, 0.44), (2.26, 0.40)])
FH = curve([(-2.21, 0.78), (-2.15, 0.82), (-2.00, 0.85), (-1.80, 0.875), (-1.55, 0.95), (-1.30, 1.02), (-1.05, 1.08),
            (-0.80, 1.13), (-0.55, 1.15), (-0.30, 1.15), (0.00, 1.13), (0.25, 1.09), (0.50, 1.03), (0.75, 0.96),
            (1.00, 0.875), (1.25, 0.795), (1.45, 0.755), (1.80, 0.69), (2.00, 0.645), (2.15, 0.60), (2.22, 0.585), (2.28, 0.52)])
FPup = curve([(-2.21, 3.6), (-1.80, 3.4), (-1.30, 2.2), (-0.90, 2.4), (-0.30, 3.0), (0.30, 3.1), (0.80, 3.0),
              (1.20, 3.8), (2.26, 4.2)])
FPlo = curve([(-2.21, 3.0), (0.0, 3.6), (2.26, 3.0)])

PF_XC = curve([(0.85, 0.70), (1.20, 0.735), (1.60, 0.755), (1.95, 0.74), (2.16, 0.70)])
PF_AW = curve([(0.85, 0.17), (1.10, 0.245), (1.50, 0.245), (1.80, 0.225), (2.00, 0.19), (2.16, 0.14)])
PF_TOP = curve([(0.85, 0.80), (1.10, 0.845), (1.40, 0.85), (1.70, 0.785), (1.90, 0.71), (2.05, 0.648), (2.16, 0.605)])
PF_Z = (0.80, 2.17)
PR_XC = curve([(-2.20, 0.66), (-1.90, 0.72), (-1.40, 0.745), (-0.90, 0.74), (-0.40, 0.73)])
PR_AW = curve([(-2.20, 0.15), (-2.00, 0.23), (-1.60, 0.26), (-1.20, 0.26), (-0.80, 0.23), (-0.40, 0.15)])
PR_TOP = curve([(-2.20, 0.84), (-2.12, 0.88), (-1.95, 0.935), (-1.60, 0.975), (-1.20, 0.965), (-0.80, 0.925), (-0.40, 0.86)])
PR_Z = (-2.24, -0.35)
POD_BOT = 0.28
PodK = curve([(-2.30, 0.13), (-0.30, 0.12), (0.60, 0.075), (1.20, 0.05), (2.30, 0.045)])

ZfY = curve([(0.06, 2.10), (0.10, 2.185), (0.14, 2.215), (0.20, 2.232), (0.30, 2.248), (0.40, 2.256), (0.48, 2.256),
             (0.54, 2.247), (0.585, 2.228), (0.63, 2.18), (0.70, 2.06), (0.80, 1.90)])
ZrY = curve([(0.08, -2.00), (0.15, -2.06), (0.30, -2.14), (0.45, -2.19), (0.60, -2.21), (0.75, -2.215), (0.84, -2.205),
             (0.90, -2.175), (0.96, -2.10), (1.02, -1.98)])
Floor = curve([(-2.21, 0.30), (-2.05, 0.24), (-1.80, 0.13), (-1.55, 0.11), (1.50, 0.11), (1.80, 0.115), (2.05, 0.115), (2.26, 0.125)])

CREASE_Y = curve([(1.00, 0.60), (0.84, 0.61), (0.24, 0.66), (-0.41, 0.71), (-0.80, 0.74), (-1.05, 0.76)])
SCOOP_LO = curve([(1.00, 0.22), (0.65, 0.24), (0.04, 0.31), (-0.69, 0.34), (-1.05, 0.36)])
SCOOP_DEPTH = curve([(1.06, 0.0), (0.95, 0.045), (0.6, 0.07), (-0.4, 0.07), (-0.85, 0.05), (-1.08, 0.0)])

BELT = curve([(1.30, 0.80), (0.80, 0.85), (0.50, 0.855), (0.10, 0.87), (-0.40, 0.905), (-0.78, 0.97), (-1.10, 1.05)])
CAN_Z0, CAN_Z1 = -1.85, 1.28

E = F32(5e-4)


def scoop(Y, Z):
    yc = CREASE_Y(Z)
    ylo = SCOOP_LO(Z)
    t = (yc - Y) / np.maximum(yc - ylo, 0.05)
    e = F32(0.035)
    lo = 0.5 * (t + np.sqrt(t * t + e * e))
    u = 0.5 * (lo + 1 - np.sqrt((lo - 1) ** 2 + e * e))
    u = np.clip(u, 0, 1)
    return SCOOP_DEPTH(Z) * np.sin(np.pi * u ** 0.6)


def fuse_f(X, Y, Z):
    w = FW(Z) - scoop(Y, Z)
    ym = FYm(Z)
    up = Y >= ym
    b = np.where(up, np.maximum(FH(Z) - ym, F32(0.05)), np.maximum(ym - Floor(Z), F32(0.05)))
    p = np.where(up, FPup(Z), FPlo(Z))
    return (np.abs(X) / w) ** p + (np.abs(Y - ym) / b) ** p - 1


def pod_f(X, Y, Z, xc, aw, top, zr, py_up=2.6):
    zc = np.clip(Z, zr[0], zr[1])
    c = xc(zc)
    a = np.maximum(aw(zc), F32(0.03))
    t = top(zc)
    yc = (t + POD_BOT) / 2
    b = (t - POD_BOT) / 2
    py = np.where(Y > yc, F32(py_up), F32(2.6))
    f = (np.abs(np.abs(X) - c) / a) ** 2.4 + (np.abs(Y - yc) / b) ** py - 1
    return f + (relu(Z - zr[1]) + relu(zr[0] - Z)) * 12


def normalized(fn, X, Y, Z):
    f = fn(X, Y, Z)
    gx = (fn(X + E, Y, Z) - f) / E
    gy = (fn(X, Y + E, Z) - f) / E
    gz = (fn(X, Y, Z + E) - f) / E
    return f / np.maximum(np.sqrt(gx * gx + gy * gy + gz * gz), F32(1e-3))


def front_z(X, Y):
    return ZfY(Y) - 0.36 * (np.abs(X) / 0.9) ** 2.0


def rear_z(X, Y):
    return ZrY(Y) + 0.20 * (np.abs(X) / 0.9) ** 2.2


def grad_norm(fn, a, b, base):
    ga = (fn(a + E, b) - base) / E
    gb = (fn(a, b + E) - base) / E
    return np.sqrt(1 + ga * ga + gb * gb)


def fuselage(X, Y, Z):
    return normalized(fuse_f, X, Y, Z)


def pods(X, Y, Z):
    pf = normalized(lambda x, y, z: pod_f(x, y, z, PF_XC, PF_AW, PF_TOP, PF_Z, 1.75), X, Y, Z)
    pr = normalized(lambda x, y, z: pod_f(x, y, z, PR_XC, PR_AW, PR_TOP, PR_Z), X, Y, Z)
    return np.minimum(pf, pr)


def caps(d, X, Y, Z):
    zf = front_z(X, Y)
    d_front = (Z - zf) / grad_norm(front_z, X, Y, zf)
    zr = rear_z(X, Y)
    d_rear = (zr - Z) / grad_norm(rear_z, X, Y, zr)
    fl = Floor(Z)
    flz = (Floor(Z + E) - fl) / E
    d_bot = (fl - Y) / np.sqrt(1 + flz * flz)
    d = smax(d, d_front, F32(0.035))
    d = smax(d, d_rear, F32(0.025))
    d = smax(d, d_bot, F32(0.025))
    return d


def lower_body(X, Y, Z):
    return sculpt(caps(smin(fuselage(X, Y, Z), pods(X, Y, Z), PodK(Z)), X, Y, Z), X, Y, Z)


def canopy(X, Y, Z, lb=None):
    lb = lower_body(X, Y, Z) if lb is None else lb
    return np.where(Y > BELT(Z) - 0.01, lb - 0.001, lb + 1.0)


def side_w(Y, Z):
    return FW(Z) - scoop(Y, Z)


def arch_cut(X, Y, Z, a):
    rho = np.sqrt((Y - a['y']) ** 2 + (Z - a['z']) ** 2)
    return np.maximum(rho - a['r'], F32(a['x_in']) - np.abs(X))


def capsule(X, Y, Z, a, b, r):
    a = np.array(a, F32)
    b = np.array(b, F32)
    ab = b - a
    t = np.clip(((X - a[0]) * ab[0] + (Y - a[1]) * ab[1] + (Z - a[2]) * ab[2]) / float(ab @ ab), 0, 1)
    dx = X - (a[0] + ab[0] * t)
    dy = Y - (a[1] + ab[1] * t)
    dz = Z - (a[2] + ab[2] * t)
    return np.sqrt(dx * dx + dy * dy + dz * dz) - r


def ellipsoid(X, Y, Z, c, r):
    q = np.sqrt(((X - c[0]) / r[0]) ** 2 + ((Y - c[1]) / r[1]) ** 2 + ((Z - c[2]) / r[2]) ** 2)
    return (q - 1) * min(r)


def sculpt(d, X, Y, Z):
    ax = np.abs(X)
    groove = capsule(ax, Y, Z, (0.93, 0.585, 2.00), (0.86, 0.20, 2.17), 0.055)
    d = smax(d, -groove, F32(0.025))
    dish = ellipsoid(X, Y, Z, (0.0, 0.55, -2.47), (0.72, 0.20, 0.28))
    d = smax(d, -dish, F32(0.03))
    return d


HEADLIGHT = Region([(0.49, 0.478), (0.62, 0.492), (0.75, 0.514), (0.86, 0.544), (0.925, 0.566), (0.948, 0.625),
                    (0.938, 0.70), (0.84, 0.684), (0.72, 0.646), (0.59, 0.568)], 'xy', mirror_x=True, smooth=2,
                   clip=(2, 1, 1.80))
FANG = Region([(0.898, 0.55), (0.916, 0.55), (0.902, 0.45), (0.888, 0.39), (0.874, 0.39), (0.886, 0.45)], 'xy',
              mirror_x=True, smooth=2, clip=(2, 1, 1.80))
INTAKE = Region([(-0.63, 0.252), (-0.36, 0.270), (0.0, 0.276), (0.36, 0.270), (0.63, 0.252), (0.70, 0.205), (0.65, 0.145),
                 (0.30, 0.134), (0.0, 0.132), (-0.30, 0.134), (-0.65, 0.145), (-0.70, 0.205)], 'xy', smooth=2, clip=(2, 1, 1.90))
SIDE_VENT = Region([(0.86, 0.672), (0.95, 0.686), (1.09, 0.692), (1.03, 0.628), (0.94, 0.648)], 'zy', smooth=2,
                   clip=(0, -1, -0.80))
SIDE_VENT_L = Region([(0.86, 0.672), (0.95, 0.686), (1.09, 0.692), (1.03, 0.628), (0.94, 0.648)], 'zy', smooth=2,
                     clip=(0, 1, 0.80))
LIGHT_BAR = Region([(-0.93, 0.80), (-0.86, 0.828), (-0.5, 0.836), (0.0, 0.838), (0.5, 0.836), (0.86, 0.828), (0.93, 0.80),
                    (0.935, 0.83), (0.86, 0.855), (0.5, 0.862), (0.0, 0.864), (-0.5, 0.862), (-0.86, 0.855), (-0.935, 0.83)],
                   'xy', smooth=1, clip=(2, -1, -1.95))

DLO = Region([(0.74, 0.852), (0.50, 0.858), (0.10, 0.872), (-0.40, 0.906), (-0.78, 0.972), (-0.98, 1.025), (-1.06, 1.05),
              (-1.00, 1.068), (-0.90, 1.082), (-0.50, 1.10), (-0.08, 1.098), (0.10, 1.075), (0.38, 0.985), (0.60, 0.895)],
             'zy', smooth=2, clip=[(0, 1, 0.45, 'abs')])
WINDSHIELD = Region([(0.0, 1.215), (0.30, 1.16), (0.46, 1.03), (0.585, 0.88), (0.64, 0.70), (0.61, 0.45), (0.56, 0.20),
                     (0.50, 0.06), (0.0, 0.045), (-0.50, 0.06), (-0.56, 0.20), (-0.61, 0.45), (-0.64, 0.70), (-0.585, 0.88),
                     (-0.46, 1.03), (-0.30, 1.16)], 'xz', smooth=2, clip=[(1, 1, 0.80)])
ROOF = Region([(0.47, 0.0), (0.50, -0.08), (0.50, -0.62), (0.46, -0.70), (-0.46, -0.70), (-0.50, -0.62), (-0.50, -0.08),
               (-0.47, 0.0)], 'xz', smooth=2, clip=[(1, 1, 0.95)])
REAR_WIN = Region([(0.46, -0.80), (0.44, -1.05), (0.39, -1.30), (0.30, -1.55), (0.18, -1.70), (-0.18, -1.70), (-0.30, -1.55),
                   (-0.39, -1.30), (-0.44, -1.05), (-0.46, -0.80)], 'xz', smooth=2, clip=[(1, 1, 0.86)])
GLASS_REGIONS = {'Glass_Windshield': WINDSHIELD, 'Roof_Targa': ROOF, 'Glass_Rear': REAR_WIN, 'Glass_Side': DLO}
FRIT = 0.022

POCKETS = [(HEADLIGHT, 0.030), (FANG, 0.035), (INTAKE, 0.085), (SIDE_VENT, 0.03), (SIDE_VENT_L, 0.03), (LIGHT_BAR, 0.018)]


def base_parts(X, Y, Z):
    lb = lower_body(X, Y, Z)
    cn = canopy(X, Y, Z, lb)
    d = lb
    d = smax(d, -arch_cut(X, Y, Z, ARCH_F), F32(0.012))
    d = smax(d, -arch_cut(X, Y, Z, ARCH_R), F32(0.012))
    return d, lb, cn


def base(X, Y, Z):
    return base_parts(X, Y, Z)[0]


def with_pockets(X, Y, Z, d0):
    d = d0
    for reg, depth in POCKETS:
        pocket = np.maximum(reg(X, Y, Z), -(d0 + F32(depth)))
        d = smax(d, -pocket, F32(0.003))
    return d


def outer(X, Y, Z, pockets=True):
    X = X.astype(F32)
    Y = Y.astype(F32)
    Z = Z.astype(F32)
    d0 = base(X, Y, Z)
    return with_pockets(X, Y, Z, d0) if pockets else d0


BOUNDS = (np.array([-1.07, 0.05, -2.27], dtype=F32), np.array([1.07, 1.21, 2.31], dtype=F32))
