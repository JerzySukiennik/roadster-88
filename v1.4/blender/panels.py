"""Panel layout: shut-line regions, glass regions and the gapped body shell SDF."""
import numpy as np
import body_sdf as B
from regions import Region

F32 = np.float32
GAP = 0.0055
T_PAINT = 0.02
T_GLASS = 0.008

DLO_PTS = [(0.80, 0.826), (0.50, 0.833), (0.10, 0.848), (-0.40, 0.887), (-0.78, 0.958), (-1.00, 1.015), (-1.09, 1.045),
           (-1.02, 1.07), (-0.93, 1.09), (-0.485, 1.133), (-0.05, 1.135), (0.10, 1.115), (0.40, 1.005), (0.62, 0.91)]
TOP_PTS = [(0.0, 1.30), (0.40, 1.17), (0.62, 1.00), (0.74, 0.80), (0.70, 0.45), (0.625, 0.10), (0.60, -0.40),
           (0.56, -0.80), (0.47, -1.20), (0.34, -1.52), (0.17, -1.72), (0.0, -1.76), (-0.17, -1.72), (-0.34, -1.52),
           (-0.47, -1.20), (-0.56, -0.80), (-0.60, -0.40), (-0.625, 0.10), (-0.70, 0.45), (-0.74, 0.80),
           (-0.62, 1.00), (-0.40, 1.17)]
HOOD_PTS = [(0.0, 2.212), (0.30, 2.198), (0.50, 2.15), (0.585, 2.065), (0.60, 1.85), (0.595, 1.55), (0.575, 1.27),
            (0.55, 1.12), (0.40, 1.22), (0.0, 1.312), (-0.40, 1.22), (-0.55, 1.12), (-0.575, 1.27), (-0.595, 1.55),
            (-0.60, 1.85), (-0.585, 2.065), (-0.50, 2.15), (-0.30, 2.198)]
BUMPER_F_PTS = [(-1.2, -0.05), (1.2, -0.05), (1.2, 0.565), (0.935, 0.558), (0.86, 0.535), (0.75, 0.505), (0.62, 0.483),
                (0.50, 0.468), (0.0, 0.46), (-0.50, 0.468), (-0.62, 0.483), (-0.75, 0.505), (-0.86, 0.535),
                (-0.935, 0.558), (-1.2, 0.565)]
FLAP_PTS = [(-0.24, 0.25), (0.24, 0.25), (0.25, 0.26), (0.25, 0.345), (0.24, 0.355), (-0.24, 0.355), (-0.25, 0.345),
            (-0.25, 0.26)]
DOOR_PTS = [(0.845, 0.205), (0.845, 0.80), (0.78, 0.819), (0.50, 0.826), (0.10, 0.841), (-0.38, 0.880), (-0.43, 0.72),
            (-0.38, 0.585), (-0.30, 0.41), (-0.29, 0.28), (-0.25, 0.205)]
SILL_PTS = [(1.03, -0.05), (1.03, 0.195), (-1.0, 0.195), (-1.0, -0.05)]
BUMPER_R_PTS = [(-1.88, -0.05), (-1.88, 0.60), (-1.92, 0.70), (-2.00, 0.755), (-2.10, 0.782), (-2.5, 0.788), (-2.5, -0.05)]

PANELS = {
    'Hood': Region(HOOD_PTS, 'xz', smooth=2, clip=[(1, 1, 0.5)]),
    'Bumper_F': Region(BUMPER_F_PTS, 'xy', smooth=1, clip=[(2, 1, 1.86)]),
    'Flap_F': Region(FLAP_PTS, 'xy', smooth=1, clip=[(2, 1, 2.0)]),
    'Door': Region(DOOR_PTS, 'zy', smooth=1, clip=[(0, 1, 0.6, 'abs')]),
    'Sill': Region(SILL_PTS, 'zy', smooth=0, clip=[(0, 1, 0.7, 'abs')]),
    'Bumper_R': Region(BUMPER_R_PTS, 'zy', smooth=1),
    'Glass_Door': Region(DLO_PTS, 'zy', smooth=2, clip=[(0, 1, 0.45, 'abs'), (2, 1, -0.40)]),
    'Glass_Quarter': Region(DLO_PTS, 'zy', smooth=2, clip=[(0, 1, 0.45, 'abs'), (2, -1, -0.43)]),
    'Glass_Windshield': Region(TOP_PTS, 'xz', smooth=2, clip=[(2, 1, 0.03), (1, 1, 0.7)]),
    'Roof_Targa': Region(TOP_PTS, 'xz', smooth=2, clip=[(2, -1, 0.0), (2, 1, -0.74), (1, 1, 0.7)]),
    'Glass_Rear': Region(TOP_PTS, 'xz', smooth=2, clip=[(2, -1, -0.77), (1, 1, 0.7)]),
}
GLASS = ('Glass_Door', 'Glass_Quarter', 'Glass_Windshield', 'Roof_Targa', 'Glass_Rear')
LENS = Region([(0.505, 0.481), (0.62, 0.493), (0.75, 0.515), (0.86, 0.545), (0.925, 0.566), (0.945, 0.62), (0.935, 0.69),
               (0.84, 0.668), (0.72, 0.628), (0.60, 0.556)], 'xy', mirror_x=True, smooth=2, clip=[(2, 1, 1.80)])


def shell(X, Y, Z, with_terms=False):
    X = X.astype(F32)
    Y = Y.astype(F32)
    Z = Z.astype(F32)
    d0, lb, cn = B.base_parts(X, Y, Z)
    d = B.with_pockets(X, Y, Z, d0)
    on_canopy = cn < lb + F32(0.004)
    r = {}
    for k, reg in PANELS.items():
        v = reg(X, Y, Z)
        if k in GLASS:
            v = np.where(on_canopy, v, np.maximum(v, F32(0.05)))
        r[k] = v
    glass = np.zeros(X.shape, bool)
    for k in GLASS:
        glass |= r[k] < 0
    t = np.where(glass, F32(T_GLASS), F32(T_PAINT))
    inner = -(d + t)
    s = np.maximum(d, inner)
    for k, rv in r.items():
        s = B.smax(s, F32(GAP / 2) - np.abs(rv), F32(0.0012))
    if with_terms:
        return s, d, inner, r
    return s


def lens(X, Y, Z):
    X = X.astype(F32)
    Y = Y.astype(F32)
    Z = Z.astype(F32)
    d0 = B.base(X, Y, Z)
    return np.maximum(LENS(X, Y, Z) + F32(0.0015), np.abs(d0 + F32(0.0065)) - F32(0.0035))
