"""Finds surface anchor points (LED strips, badges, hinges) on the body SDF and writes them to JSON."""
import sys
import json
import numpy as np
import body_sdf as B

F32 = np.float32


def surface_z(x, y, front=True, lo=None, hi=None):
    lo = (1.4 if front else -2.4) if lo is None else lo
    hi = (2.4 if front else -1.4) if hi is None else hi
    zs = np.linspace(lo, hi, 2000).astype(F32)
    d = B.base(np.full_like(zs, x), np.full_like(zs, y), zs)
    inside = np.where(d < 0)[0]
    if not len(inside):
        return None
    return float(zs[inside[-1]] if front else zs[inside[0]])


def surface_x(y, z):
    xs = np.linspace(0.3, 1.1, 2000).astype(F32)
    d = B.base(xs, np.full_like(xs, y), np.full_like(xs, z))
    inside = np.where(d < 0)[0]
    return float(xs[inside[-1]]) if len(inside) else None


def strip(pts, front, inset):
    out = []
    for x, y in pts:
        z = surface_z(x, y, front)
        if z is not None:
            out.append([x, y, z - inset if front else z + inset])
    return out


hl = [(0.53, 0.489), (0.60, 0.495), (0.68, 0.506), (0.76, 0.52), (0.83, 0.536), (0.88, 0.551), (0.915, 0.566)]
drl = [(0.60, 0.548), (0.68, 0.585), (0.76, 0.612), (0.84, 0.638), (0.90, 0.66)]
bar = [(x, 0.848 - 0.03 * (abs(x) / 0.93) ** 6) for x in np.linspace(-0.915, 0.915, 61)]
res = dict(
    led_head_L=strip(hl, True, 0.022),
    drl_head_L=strip(drl, True, 0.020),
    led_tail=strip(bar, False, 0.010),
    tlogo=[0.0, 0.552, surface_z(0.0, 0.552, True)],
    wordmark=[0.0, 0.775, surface_z(0.0, 0.775, False)],
    hinge_door_L=[surface_x(0.5, 0.845) - 0.01, 0.5, 0.845],
    door_handle_L=[surface_x(0.70, 0.30), 0.70, 0.30],
    flap=[0.0, 0.355, surface_z(0.0, 0.355, True)],
    nose_center=[0.0, 0.30, surface_z(0.0, 0.30, True)],
    hood_hinge=[0.0, float(B.FH(np.array([1.29], F32))[0]), 1.29],
)
json.dump(res, open(sys.argv[1], 'w'), indent=1)
print(json.dumps({k: (v if len(str(v)) < 120 else f'{len(v)} pts') for k, v in res.items()}, indent=1))
