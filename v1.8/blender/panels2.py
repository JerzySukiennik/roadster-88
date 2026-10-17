"""Panel and glass regions for exact mesh slicing of the outer skin (fuselage + pods body)."""
import numpy as np
import body_sdf as B
from regions import Region

F32 = np.float32
GAP = 0.0055
T_PAINT = 0.02
T_GLASS = 0.006

DLO_BOTTOM = [(0.74, 0.852), (0.50, 0.858), (0.10, 0.872), (-0.40, 0.906)]
DOOR_PTS = [(0.86, 0.205), (0.86, 0.80), (0.80, 0.85), (0.74, 0.872), (0.50, 0.878), (0.10, 0.892), (-0.38, 0.926),
            (-0.43, 0.72), (-0.38, 0.585), (-0.30, 0.41), (-0.29, 0.28), (-0.25, 0.205)]
HOOD_PTS = [(0.0, 2.205), (0.30, 2.17), (0.50, 2.10), (0.58, 2.00), (0.585, 1.80), (0.58, 1.55), (0.565, 1.32),
            (0.54, 1.12), (0.48, 1.15), (0.30, 1.235), (0.0, 1.285), (-0.30, 1.235), (-0.48, 1.15), (-0.54, 1.12),
            (-0.565, 1.32), (-0.58, 1.55), (-0.585, 1.80), (-0.58, 2.00), (-0.50, 2.10), (-0.30, 2.17)]
BUMPER_F_PTS = [(-1.2, -0.05), (1.2, -0.05), (1.2, 0.565), (0.935, 0.558), (0.86, 0.535), (0.75, 0.505), (0.62, 0.483),
                (0.50, 0.468), (0.0, 0.46), (-0.50, 0.468), (-0.62, 0.483), (-0.75, 0.505), (-0.86, 0.535),
                (-0.935, 0.558), (-1.2, 0.565)]
FLAP_PTS = [(-0.24, 0.25), (0.24, 0.25), (0.25, 0.26), (0.25, 0.345), (0.24, 0.355), (-0.24, 0.355), (-0.25, 0.345),
            (-0.25, 0.26)]
SILL_PTS = [(1.03, -0.05), (1.03, 0.195), (-1.0, 0.195), (-1.0, -0.05)]
BUMPER_R_PTS = [(-1.88, -0.05), (-1.88, 0.60), (-1.92, 0.70), (-2.00, 0.755), (-2.10, 0.782), (-2.5, 0.788), (-2.5, -0.05)]

REGIONS = {
    'Flap_F': Region(FLAP_PTS, 'xy', smooth=1, clip=[(2, 1, 2.0)]),
    'Glass_Door': Region([(0.74, 0.852), (0.50, 0.858), (0.10, 0.872), (-0.40, 0.906), (-0.78, 0.972), (-0.98, 1.025),
                          (-1.06, 1.05), (-1.00, 1.068), (-0.90, 1.082), (-0.50, 1.10), (-0.08, 1.098), (0.10, 1.075),
                          (0.38, 0.985), (0.60, 0.895)], 'zy', smooth=2, clip=[(0, 1, 0.45, 'abs'), (2, 1, -0.40)]),
    'Glass_Quarter': Region([(0.74, 0.852), (0.50, 0.858), (0.10, 0.872), (-0.40, 0.906), (-0.78, 0.972), (-0.98, 1.025),
                             (-1.06, 1.05), (-1.00, 1.068), (-0.90, 1.082), (-0.50, 1.10), (-0.08, 1.098), (0.10, 1.075),
                             (0.38, 0.985), (0.60, 0.895)], 'zy', smooth=2, clip=[(0, 1, 0.45, 'abs'), (2, -1, -0.43)]),
    'Glass_Windshield': B.WINDSHIELD,
    'Roof_Targa': B.ROOF,
    'Glass_Rear': B.REAR_WIN,
    'Door': Region(DOOR_PTS, 'zy', smooth=1, clip=[(0, 1, 0.6, 'abs')]),
    'Sill': Region(SILL_PTS, 'zy', smooth=0, clip=[(0, 1, 0.7, 'abs')]),
    'Hood': Region(HOOD_PTS, 'xz', smooth=2, clip=[(1, 1, 0.5)]),
    'Bumper_F': Region(BUMPER_F_PTS, 'xy', smooth=1, clip=[(2, 1, 1.86)]),
    'Bumper_R': Region(BUMPER_R_PTS, 'zy', smooth=1),
}
PRIORITY = list(REGIONS)
GLASS = ('Glass_Door', 'Glass_Quarter', 'Glass_Windshield', 'Roof_Targa', 'Glass_Rear')
SIDE = ('Glass_Door', 'Glass_Quarter')


def field(name, X, Y, Z):
    X = X.astype(F32)
    Y = Y.astype(F32)
    Z = Z.astype(F32)
    r = REGIONS[name](X, Y, Z)
    if name in SIDE:
        r = np.maximum(r, B.BELT(Z) - F32(0.012) - Y)
    if name == 'Door':
        r = np.maximum(r, -field('Glass_Door', X, Y, Z))
    if name in GLASS or name == 'Hood':
        near = r < 0.15
        if near.any():
            fu = B.fuselage(X[near], Y[near], Z[near])
            po = B.pods(X[near], Y[near], Z[near])
            rr = r.copy()
            rr[near] = np.maximum(r[near], (fu - po) * F32(4.0) + F32(0.012))
            r = rr
    return r


LENS = Region([(0.49, 0.478), (0.62, 0.492), (0.75, 0.514), (0.86, 0.544), (0.925, 0.566), (0.948, 0.625), (0.938, 0.70),
               (0.84, 0.684), (0.72, 0.646), (0.59, 0.568)], 'xy', mirror_x=True, smooth=2, clip=[(2, 1, 1.80)])


def lens(X, Y, Z):
    X = X.astype(F32)
    Y = Y.astype(F32)
    Z = Z.astype(F32)
    d0 = B.base(X, Y, Z)
    return np.maximum(LENS(X, Y, Z) + F32(0.0015), np.abs(d0 + F32(0.0065)) - F32(0.0035))
