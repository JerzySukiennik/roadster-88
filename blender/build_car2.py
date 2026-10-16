"""Builds body panels by exact slicing of the smooth outer skin along shut lines, with flanged edges."""
import os
import sys
import json
import time
import numpy as np
from concurrent.futures import ProcessPoolExecutor
from skimage.measure import marching_cubes

F32 = np.float32
MAT = ['Paint', 'Glass_Tint', 'Trim', 'Liner', 'Interior_Dark', 'Underbody', 'Paint_Black', 'Lens']
FLANGE = {'paint': 0.018, 'glass': 0.006}


def field_fn(kind):
    if kind == 'outer':
        import body_sdf
        return body_sdf.outer
    import panels2
    return panels2.lens


def mc_blocks(args):
    kind, blocks, bmin, h, block = args
    fn = field_fn(kind)
    out_v, out_f, off = [], [], 0
    for (i, j, k) in blocks:
        o = bmin + np.array([i, j, k]) * block * h
        ax, ay, az = [o[a] + np.arange(block + 1) * h for a in range(3)]
        X, Y, Z = np.meshgrid(ax, ay, az, indexing='ij')
        v = fn(X.astype(F32), Y.astype(F32), Z.astype(F32))
        if v.min() > 0 or v.max() < 0:
            continue
        try:
            vs, fs, _, _ = marching_cubes(v, 0.0, spacing=(h, h, h), allow_degenerate=False)
        except (ValueError, RuntimeError):
            continue
        out_v.append(vs + o)
        out_f.append(fs + off)
        off += len(vs)
    if not out_v:
        return np.zeros((0, 3)), np.zeros((0, 3), np.int64)
    return np.concatenate(out_v), np.concatenate(out_f)


def mesh_parallel(kind, bmin, bmax, h, block=40, workers=4):
    import mesher
    fn = field_fn(kind)
    bmin = np.asarray(bmin, np.float64)
    bmax = np.asarray(bmax, np.float64)
    n = np.ceil((bmax - bmin) / h).astype(int) + 1
    nb = np.ceil((n - 1) / block).astype(int)
    H = block * h
    cx, cy, cz = [bmin[a] + np.arange(nb[a] + 1) * H for a in range(3)]
    CX, CY, CZ = np.meshgrid(cx, cy, cz, indexing='ij')
    corner = fn(CX.astype(F32), CY.astype(F32), CZ.astype(F32))
    reach = H * np.sqrt(3) * 1.6
    active = [(i, j, k) for i in range(nb[0]) for j in range(nb[1]) for k in range(nb[2])
              if not (np.all(corner[i:i + 2, j:j + 2, k:k + 2] > reach) or np.all(corner[i:i + 2, j:j + 2, k:k + 2] < -reach))]
    chunks = [active[w::workers * 6] for w in range(workers * 6)]
    with ProcessPoolExecutor(workers) as ex:
        res = list(ex.map(mc_blocks, [(kind, c, bmin, h, block) for c in chunks]))
    V, Fc, off = [], [], 0
    for v, f in res:
        if len(v):
            V.append(v)
            Fc.append(f + off)
            off += len(v)
    return mesher.weld(np.concatenate(V), np.concatenate(Fc), h * 1e-3)


def centroids(V, Fc):
    return V[Fc].mean(1).astype(F32)


def flange(V, Fc, N, depth):
    n = len(V)
    e = np.concatenate([Fc[:, [0, 1]], Fc[:, [1, 2]], Fc[:, [2, 0]]])
    key = np.minimum(e[:, 0], e[:, 1]).astype(np.int64) * n + np.maximum(e[:, 0], e[:, 1])
    uk, idx, cnt = np.unique(key, return_index=True, return_counts=True)
    bnd = e[idx[cnt == 1]]
    if not len(bnd):
        return V, Fc, N, np.zeros(len(Fc), np.int8)
    a, b = bnd[:, 0], bnd[:, 1]
    A0, B0 = V[a], V[b]
    A1, B1 = A0 - N[a] * depth, B0 - N[b] * depth
    fn = np.cross(B0 - A0, A1 - A0)
    fn /= np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12)
    k = len(bnd)
    rv = np.stack([A0, B0, B1, A1], 1).reshape(-1, 3)
    rn = np.repeat(-fn, 4, axis=0)
    ids = len(V) + np.arange(4 * k).reshape(k, 4)
    rf = np.concatenate([ids[:, [0, 2, 1]], ids[:, [0, 3, 2]]])
    kind = np.concatenate([np.zeros(len(Fc), np.int8), np.full(len(rf), 2, np.int8)])
    return np.concatenate([V, rv]).astype(F32), np.concatenate([Fc, rf]), np.concatenate([N, rn]).astype(F32), kind


def outer_materials(V, Fc, N):
    import body_sdf as B
    c = centroids(V, Fc)
    X, Y, Z = c[:, 0], c[:, 1], c[:, 2]
    fn = N[Fc].mean(1)
    m = np.zeros(len(c), np.int8)
    d0 = B.base(X, Y, Z)
    for reg, depth in B.POCKETS:
        m[(reg(X, Y, Z) < 0.0015) & (d0 < -0.0015)] = 2
    for a in (B.ARCH_F, B.ARCH_R):
        cut = B.arch_cut(X, Y, Z, a)
        m[(cut < 0.006) & (np.abs(X) < B.side_w(Y, Z) - 0.012)] = 3
    m[(fn[:, 1] < -0.6) & (Y < 0.2)] = 5
    m[(Z < -1.96) & (Y < 0.40) & (fn[:, 2] < -0.25) & (m == 0)] = 6
    m[(Z > 2.0) & (Y < 0.165) & (fn[:, 2] > 0.25) & (m == 0)] = 6
    return m


def main():
    import mesher
    import body_sdf as B
    import panels2 as P
    h = float(sys.argv[1]) if len(sys.argv) > 1 else 0.003
    out = sys.argv[2] if len(sys.argv) > 2 else '../Niepotrzebne/build/parts2'
    target = int(sys.argv[3]) if len(sys.argv) > 3 else 460000
    os.makedirs(out, exist_ok=True)
    t0 = time.time()
    raw = os.path.join(out, 'raw_outer.npz')
    if os.path.exists(raw) and '--remesh' not in sys.argv:
        r = np.load(raw)
        V, Fc = r['v'], r['f'].astype(np.int64)
    else:
        V, Fc = mesh_parallel('outer', B.BOUNDS[0] - 0.01, B.BOUNDS[1] + 0.01, h)
        np.savez(raw, v=V.astype(F32), f=Fc.astype(np.int32))
    print(f'outer {len(Fc)} tris {time.time() - t0:.0f}s', flush=True)
    V, Fc = mesher.decimate(V, Fc, target, agg=4)
    V, _ = mesher.relax(B.outer, V, Fc, iters=6)
    V, Fc = mesher.refine(B.outer, V, Fc, max_deg=9.0, passes=3)
    print(f'decimated+relaxed+refined {len(Fc)} {time.time() - t0:.0f}s', flush=True)
    g = P.GAP / 2
    for name in P.PRIORITY:
        for level in (-g, g):
            n0 = len(V)
            r = P.field(name, V[:, 0], V[:, 1], V[:, 2])
            V, Fc = mesher.slice_mesh(V, Fc, r, level)
            if len(V) > n0:
                V[n0:] = mesher.project(B.outer, V[n0:], 2)
        print(f'sliced {name} {len(Fc)}', flush=True)
    c = centroids(V, Fc)
    fields = {k: P.field(k, c[:, 0], c[:, 1], c[:, 2]) for k in P.PRIORITY}
    gapmask = np.zeros(len(c), bool)
    for k in P.PRIORITY:
        gapmask |= np.abs(fields[k]) < g
    label = np.full(len(c), -1, np.int32)
    for i, k in reversed(list(enumerate(P.PRIORITY))):
        label[fields[k] < 0] = i
    keep = ~gapmask
    Fc, label = Fc[keep], label[keep]
    for k in fields:
        fields[k] = fields[k][keep]
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    manifest = {}
    names = ['Body_Shell'] + P.PRIORITY
    for li in range(-1, len(P.PRIORITY)):
        sel = np.where(label == li)[0]
        if not len(sel):
            continue
        base = names[li + 1]
        F_sel = Fc[sel]
        e = np.concatenate([F_sel[:, [0, 1]], F_sel[:, [1, 2]], F_sel[:, [2, 0]]])
        gmat = coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(len(V), len(V)))
        ncomp, lab = connected_components(gmat, directed=False)
        flab = lab[F_sel[:, 0]]
        sizes = np.bincount(flab)
        for ci in np.argsort(-sizes):
            if sizes[ci] < 60:
                continue
            fsub = F_sel[flab == ci]
            v, f, used = mesher.compact(V, fsub)
            cx = v[:, 0].mean()
            nm = base
            if base in ('Door', 'Sill', 'Glass_Door', 'Glass_Quarter'):
                nm = f'{base}_{"L" if cx > 0 else "R"}'
            if nm in manifest:
                k2 = 2
                while f'{nm}.{k2}' in manifest:
                    k2 += 1
                nm = f'{nm}.{k2}'
            is_glass = base in P.GLASS
            if is_glass:
                n0 = len(v)
                v, f = mesher.slice_mesh(v, f, P.field(base, v[:, 0], v[:, 1], v[:, 2]), -B.FRIT)
                if len(v) > n0:
                    v[n0:] = mesher.project(B.outer, v[n0:], 2)
            N = mesher.sdf_normals(B.outer, v)
            f = mesher.orient_faces(v, f, N)
            mo = outer_materials(v, f, N)
            if is_glass:
                cc = centroids(v, f)
                rr = P.field(base, cc[:, 0], cc[:, 1], cc[:, 2])
                mo = np.where(rr > -B.FRIT, 2, 1).astype(np.int8)
            if base == 'Sill':
                mo = np.full(len(f), 6, np.int8)
            v2, f2, n2, kind = flange(v, f, N, FLANGE['glass' if is_glass else 'paint'])
            m = np.concatenate([mo, np.full((kind == 2).sum(), 2 if is_glass else (6 if base == 'Sill' else 0), np.int8)])
            if base == 'Body_Shell':
                rim = np.where(kind == 2)[0]
                if len(rim):
                    cr = centroids(v2, f2[rim])
                    dark = cr[:, 1] > B.BELT(cr[:, 2]) - 0.03
                    m[rim[dark]] = 4
            if (base == 'Body_Shell' and nm == 'Body_Shell') or base == 'Door':
                vt, ft = v, f
                if base == 'Body_Shell':
                    for fld in (lambda q: q[:, 1] - (B.BELT(q[:, 2]) - 0.03), lambda q: q[:, 2] + 1.9, lambda q: 1.3 - q[:, 2]):
                        nb0 = len(vt)
                        vt, ft = mesher.slice_mesh(vt, ft, fld(vt), 0.0)
                        if len(vt) > nb0:
                            vt[nb0:] = mesher.project(B.outer, vt[nb0:], 2)
                    cc = centroids(vt, ft)
                    cab = (cc[:, 1] > B.BELT(cc[:, 2]) - 0.03) & (cc[:, 2] > -1.9) & (cc[:, 2] < 1.3) & (np.abs(cc[:, 0]) < 1.0)
                    ft = ft[cab]
                if len(ft):
                    used, inv = np.unique(ft, return_inverse=True)
                    Nt = mesher.sdf_normals(B.outer, vt[used])
                    vi = vt[used] - Nt * 0.012
                    fi2 = inv.reshape(-1, 3)[:, ::-1] + len(v2)
                    v2 = np.concatenate([v2, vi.astype(F32)])
                    n2 = np.concatenate([n2, -Nt])
                    f2 = np.concatenate([f2, fi2])
                    m = np.concatenate([m, np.full(len(fi2), 4, np.int8)])
            mesher.save_part(f'{out}/{nm}.npz', v2, f2, n2, m=m)
            manifest[nm] = dict(tris=int(len(f2)))
            print(nm, len(f2), flush=True)
    for side, sgn in (('L', 1), ('R', -1)):
        lo = np.array([0.45, 0.42, 1.75]) if sgn > 0 else np.array([-1.0, 0.42, 1.75])
        hi = np.array([1.0, 0.72, 2.30]) if sgn > 0 else np.array([-0.45, 0.72, 2.30])
        v, f = mesh_parallel('lens', lo, hi, 0.0015, block=32)
        v, f = mesher.decimate(v, f, 4000)
        nrm = mesher.sdf_normals(P.lens, v)
        f = mesher.orient_faces(v, f, nrm)
        mesher.save_part(f'{out}/Light_Head_{side}.npz', v, f, nrm, m=np.full(len(f), 7, np.int8))
        manifest[f'Light_Head_{side}'] = dict(tris=int(len(f)))
    json.dump(dict(parts=manifest, materials=MAT, h=h, gap=P.GAP), open(f'{out}/manifest.json', 'w'), indent=1)
    print(f'done {time.time() - t0:.0f}s', flush=True)


if __name__ == '__main__':
    main()
