"""Narrow-band block marching cubes for SDF functions, welding, decimation and analytic normals."""
import numpy as np
from skimage.measure import marching_cubes

F32 = np.float32


def mesh_sdf(fn, bmin, bmax, h, block=48, iso=0.0):
    bmin = np.asarray(bmin, dtype=np.float64)
    bmax = np.asarray(bmax, dtype=np.float64)
    n = np.ceil((bmax - bmin) / h).astype(int) + 1
    nb = np.ceil((n - 1) / block).astype(int)
    H = block * h
    cx = bmin[0] + np.arange(nb[0] + 1) * H
    cy = bmin[1] + np.arange(nb[1] + 1) * H
    cz = bmin[2] + np.arange(nb[2] + 1) * H
    CX, CY, CZ = np.meshgrid(cx, cy, cz, indexing='ij')
    corner = fn(CX.astype(F32), CY.astype(F32), CZ.astype(F32)) - iso
    reach = H * np.sqrt(3) * 1.6
    verts_all, faces_all = [], []
    voff = 0
    for i in range(nb[0]):
        for j in range(nb[1]):
            for k in range(nb[2]):
                c = corner[i:i + 2, j:j + 2, k:k + 2]
                if np.all(c > reach) or np.all(c < -reach):
                    continue
                o = bmin + np.array([i, j, k]) * H
                ax = o[0] + np.arange(block + 1) * h
                ay = o[1] + np.arange(block + 1) * h
                az = o[2] + np.arange(block + 1) * h
                X, Y, Z = np.meshgrid(ax, ay, az, indexing='ij')
                v = fn(X.astype(F32), Y.astype(F32), Z.astype(F32)) - iso
                if v.min() > 0 or v.max() < 0:
                    continue
                try:
                    vs, fs, _, _ = marching_cubes(v, 0.0, spacing=(h, h, h), allow_degenerate=False)
                except (ValueError, RuntimeError):
                    continue
                verts_all.append(vs + o)
                faces_all.append(fs + voff)
                voff += len(vs)
    if not verts_all:
        return np.zeros((0, 3), F32), np.zeros((0, 3), np.int64)
    V = np.concatenate(verts_all)
    Fc = np.concatenate(faces_all)
    return weld(V, Fc, h * 1e-3)


def weld(V, Fc, tol):
    key = np.round(V / tol).astype(np.int64)
    _, idx, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    V2 = V[idx]
    F2 = inv.reshape(-1)[Fc]
    good = (F2[:, 0] != F2[:, 1]) & (F2[:, 1] != F2[:, 2]) & (F2[:, 0] != F2[:, 2])
    return V2.astype(F32), F2[good]


def decimate(V, Fc, target_tris, agg=4):
    import fast_simplification
    if len(Fc) <= target_tris:
        return V, Fc
    ratio = 1.0 - target_tris / len(Fc)
    v2, f2 = fast_simplification.simplify(V.astype(np.float32), Fc.astype(np.int32), target_reduction=ratio, agg=agg)
    return v2.astype(F32), f2.astype(np.int64)


def relax(fn, V, Fc, iters=8, lam=0.5, feature_deg=32.0):
    from scipy.sparse import coo_matrix
    n = len(V)
    e = np.concatenate([Fc[:, [0, 1]], Fc[:, [1, 2]], Fc[:, [2, 0]]])
    e = np.concatenate([e, e[:, ::-1]])
    A = coo_matrix((np.ones(len(e), F32), (e[:, 0], e[:, 1])), shape=(n, n)).tocsr()
    A.data[:] = 1.0
    deg = np.asarray(A.sum(1)).ravel()
    V = V.astype(F32).copy()
    N = sdf_normals(fn, V)
    nb_dot = np.ones(n, F32)
    for a, b in ((e[:, 0], e[:, 1]),):
        d = (N[a] * N[b]).sum(1)
        np.minimum.at(nb_dot, a, d)
    frozen = nb_dot < np.cos(np.radians(feature_deg))
    for _ in range(iters):
        L = (A @ V) / np.maximum(deg, 1)[:, None]
        disp = L - V
        disp -= (disp * N).sum(1, keepdims=True) * N
        disp[frozen] = 0
        V += lam * disp
        for _ in range(2):
            X, Y, Z = V[:, 0], V[:, 1], V[:, 2]
            s = fn(X, Y, Z)
            G = sdf_normals(fn, V)
            V -= (s[:, None] * G).astype(F32)
        N = sdf_normals(fn, V)
    return V, frozen


def sdf_normals(fn, V, eps=1.0e-3):
    X, Y, Z = V[:, 0], V[:, 1], V[:, 2]
    e = F32(eps)
    gx = fn(X + e, Y, Z) - fn(X - e, Y, Z)
    gy = fn(X, Y + e, Z) - fn(X, Y - e, Z)
    gz = fn(X, Y, Z + e) - fn(X, Y, Z - e)
    N = np.stack([gx, gy, gz], 1)
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
    return N.astype(F32)


def orient_faces(V, Fc, N):
    a, b, c = V[Fc[:, 0]], V[Fc[:, 1]], V[Fc[:, 2]]
    fn = np.cross(b - a, c - a)
    avg = N[Fc[:, 0]] + N[Fc[:, 1]] + N[Fc[:, 2]]
    flip = (fn * avg).sum(1) < 0
    Fc = Fc.copy()
    Fc[flip] = Fc[flip][:, [0, 2, 1]]
    return Fc


def save_part(path, V, Fc, N, **extra):
    np.savez_compressed(path, v=V.astype(F32), f=Fc.astype(np.int32), n=N.astype(F32), **extra)


def slice_mesh(V, Fc, r, c):
    s = (r - c).astype(np.float64)
    s = np.where(np.abs(s) < 1e-9, 1e-9, s)
    pos = s > 0
    cnt = pos[Fc].sum(1)
    mixed = (cnt == 1) | (cnt == 2)
    if not mixed.any():
        return V, Fc
    Fm = Fc[mixed]
    pm = pos[Fm]
    lone = np.where(cnt[mixed] == 1, np.argmax(pm, 1), np.argmin(pm, 1))
    ar = np.arange(len(Fm))
    a = Fm[ar, lone]
    b = Fm[ar, (lone + 1) % 3]
    c2 = Fm[ar, (lone + 2) % 3]
    n = len(V)
    ku = np.concatenate([np.minimum(a, b), np.minimum(a, c2)]).astype(np.int64)
    kv = np.concatenate([np.maximum(a, b), np.maximum(a, c2)]).astype(np.int64)
    keys = ku * n + kv
    uk, inv = np.unique(keys, return_inverse=True)
    eu, ev = uk // n, uk % n
    t = (s[eu] / (s[eu] - s[ev]))[:, None]
    P = V[eu] + (V[ev] - V[eu]) * t
    pab = n + inv[:len(a)]
    pac = n + inv[len(a):]
    new = np.concatenate([np.stack([a, pab, pac], 1), np.stack([pab, b, c2], 1), np.stack([pab, c2, pac], 1)])
    return np.concatenate([V, P.astype(V.dtype)]), np.concatenate([Fc[~mixed], new])


def project(fn, V, steps=2):
    V = V.astype(F32).copy()
    for _ in range(steps):
        s = fn(V[:, 0], V[:, 1], V[:, 2])
        G = sdf_normals(fn, V)
        V -= (s[:, None] * G).astype(F32)
    return V


def compact(V, Fc):
    used, inv = np.unique(Fc, return_inverse=True)
    return V[used], inv.reshape(-1, 3), used


def solidify(V, Fc, N, t):
    n = len(V)
    inner = V - N * t
    e = np.concatenate([Fc[:, [0, 1]], Fc[:, [1, 2]], Fc[:, [2, 0]]])
    key = np.minimum(e[:, 0], e[:, 1]).astype(np.int64) * n + np.maximum(e[:, 0], e[:, 1])
    uk, idx, cnt = np.unique(key, return_index=True, return_counts=True)
    bnd = e[idx[cnt == 1]]
    Vo = np.concatenate([V, inner])
    No = np.concatenate([N, -N])
    Fo = np.concatenate([Fc, Fc[:, ::-1] + n])
    kind = np.concatenate([np.zeros(len(Fc), np.int8), np.ones(len(Fc), np.int8)])
    if len(bnd):
        a, b = bnd[:, 0], bnd[:, 1]
        base = len(Vo)
        A0, B0, A1, B1 = V[a], V[b], inner[a], inner[b]
        quad = np.stack([A0, B0, B1, A1], 1)
        fn_ = np.cross(B0 - A0, A1 - A0)
        fn_ /= np.maximum(np.linalg.norm(fn_, axis=1, keepdims=True), 1e-12)
        rv = quad.reshape(-1, 3)
        rn = np.repeat(-fn_, 4, axis=0)
        k = len(bnd)
        ids = base + np.arange(4 * k).reshape(k, 4)
        rf = np.concatenate([ids[:, [0, 2, 1]], ids[:, [0, 3, 2]]])
        Vo = np.concatenate([Vo, rv])
        No = np.concatenate([No, rn])
        Fo = np.concatenate([Fo, rf])
        kind = np.concatenate([kind, np.full(len(rf), 2, np.int8)])
    return Vo.astype(F32), Fo, No.astype(F32), kind


def refine(fn, V, Fc, max_deg=10.0, passes=3, min_len=0.003):
    V = V.astype(F32)
    Fc = Fc.astype(np.int64)
    cos_t = np.cos(np.radians(max_deg))
    for _ in range(passes):
        N = sdf_normals(fn, V)
        n = len(V)
        e = np.concatenate([Fc[:, [0, 1]], Fc[:, [1, 2]], Fc[:, [2, 0]]])
        lo, hi = np.minimum(e[:, 0], e[:, 1]), np.maximum(e[:, 0], e[:, 1])
        key = lo * n + hi
        uk, inv = np.unique(key, return_inverse=True)
        a, b = uk // n, uk % n
        dots = (N[a] * N[b]).sum(1)
        length = np.linalg.norm(V[a] - V[b], axis=1)
        mark = (dots < cos_t) & (length > min_len)
        if not mark.any():
            break
        mid_id = np.full(len(uk), -1, np.int64)
        mid_id[mark] = n + np.arange(mark.sum())
        P = project(fn, (V[a[mark]] + V[b[mark]]) * 0.5, 2)
        V = np.concatenate([V, P])
        m = mid_id[inv].reshape(3, -1).T
        f0, f1, f2 = Fc[:, 0], Fc[:, 1], Fc[:, 2]
        m01, m12, m20 = m[:, 0], m[:, 1], m[:, 2]
        cnt = (m >= 0).sum(1)
        out = [Fc[cnt == 0]]
        s3 = cnt == 3
        out += [np.stack([f0[s3], m01[s3], m20[s3]], 1), np.stack([f1[s3], m12[s3], m01[s3]], 1),
                np.stack([f2[s3], m20[s3], m12[s3]], 1), np.stack([m01[s3], m12[s3], m20[s3]], 1)]
        for k, (va, vb, vc, ma) in enumerate(((f0, f1, f2, m01), (f1, f2, f0, m12), (f2, f0, f1, m20))):
            s1 = (cnt == 1) & (ma >= 0)
            out += [np.stack([va[s1], ma[s1], vc[s1]], 1), np.stack([ma[s1], vb[s1], vc[s1]], 1)]
        for va, vb, vc, mab, mbc in ((f0, f1, f2, m01, m12), (f1, f2, f0, m12, m20), (f2, f0, f1, m20, m01)):
            s2 = (cnt == 2) & (mab >= 0) & (mbc >= 0)
            out += [np.stack([mab[s2], vb[s2], mbc[s2]], 1), np.stack([va[s2], mab[s2], mbc[s2]], 1),
                    np.stack([va[s2], mbc[s2], vc[s2]], 1)]
        Fc = np.concatenate(out)
    return V, Fc
