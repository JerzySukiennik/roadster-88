"""Per-face material classes for the body skin: 0 paint, 1 glass, 2 black trim/pocket/frit, 3 wheel-well liner."""
import numpy as np
import body_sdf as B

F32 = np.float32


def classify(V, Fc):
    c = V[Fc].mean(1).astype(F32)
    X, Y, Z = c[:, 0], c[:, 1], c[:, 2]
    m = np.zeros(len(c), np.int8)
    above = Y > B.BELT(Z) - 0.012
    for name, reg in B.GLASS_REGIONS.items():
        r = reg(X, Y, Z)
        ok = above if name == 'Glass_Side' else np.ones(len(c), bool)
        m[ok & (r < -B.FRIT)] = 1
        m[ok & (r < 0) & (r >= -B.FRIT)] = 2
    d0 = B.base(X, Y, Z)
    for reg, depth in B.POCKETS:
        m[(reg(X, Y, Z) < 0.001) & (d0 < -0.002)] = 2
    for a in (B.ARCH_F, B.ARCH_R):
        cut = B.arch_cut(X, Y, Z, a)
        m[(cut < 0.004) & (np.abs(X) < B.side_w(Y, Z) - 0.015)] = 3
    return m
