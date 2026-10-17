"""Builds the final body panels (gapped shell, glass, lenses) as npz parts with per-face material ids."""
import sys
import json
import time
import numpy as np
from concurrent.futures import ProcessPoolExecutor
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from skimage.measure import marching_cubes

F32 = np.float32
MAT = ['Paint', 'Glass_Tint', 'Trim', 'Liner', 'Interior_Dark', 'Underbody', 'Paint_Black', 'Lens']
TARGET = {'Body_Shell': 260000, 'Hood': 28000, 'Bumper_F': 36000, 'Bumper_R': 30000, 'Door': 28000, 'Flap_F': 3000,
          'Sill': 5000, 'Glass_Door': 6000, 'Glass_Quarter': 4000, 'Glass_Windshield': 10000, 'Roof_Targa': 6000,
          'Glass_Rear': 7000, 'Light_Head': 4000}


def field(kind):
    import panels
    return panels.shell if kind == 'shell' else panels.lens


def mc_blocks(args):
    kind, blocks, bmin, h, block = args
    fn = field(kind)
    out_v, out_f, off = [], [], 0
    for (i, j, k) in blocks:
        o = bmin + np.array([i, j, k]) * block * h
        ax = o[0] + np.arange(block + 1) * h
        ay = o[1] + np.arange(block + 1) * h
        az = o[2] + np.arange(block + 1) * h
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
    fn = field(kind)
    bmin = np.asarray(bmin, np.float64)
    bmax = np.asarray(bmax, np.float64)
    n = np.ceil((bmax - bmin) / h).astype(int) + 1
    nb = np.ceil((n - 1) / block).astype(int)
    H = block * h
    cx, cy, cz = [bmin[a] + np.arange(nb[a] + 1) * H for a in range(3)]
    CX, CY, CZ = np.meshgrid(cx, cy, cz, indexing='ij')
    corner = fn(CX.astype(F32), CY.astype(F32), CZ.astype(F32))
    reach = H * np.sqrt(3) * 1.6
    active = []
    for i in range(nb[0]):
        for j in range(nb[1]):
            for k in range(nb[2]):
                c = corner[i:i + 2, j:j + 2, k:k + 2]
                if not (np.all(c > reach) or np.all(c < -reach)):
                    active.append((i, j, k))
    chunks = [active[w::workers * 6] for w in range(workers * 6)]
    with ProcessPoolExecutor(workers) as ex:
        res = list(ex.map(mc_blocks, [(kind, c, bmin, h, block) for c in chunks]))
    V, Fc, off = [], [], 0
    for v, f in res:
        if len(v):
            V.append(v)
            Fc.append(f + off)
            off += len(v)
    V = np.concatenate(V)
    Fc = np.concatenate(Fc)
    import mesher
    return mesher.weld(V, Fc, h * 1e-3), len(active)


def components(V, Fc):
    e = np.concatenate([Fc[:, [0, 1]], Fc[:, [1, 2]], Fc[:, [2, 0]]])
    g = coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(len(V), len(V)))
    n, lab = connected_components(g, directed=False)
    return n, lab[Fc[:, 0]]


def sub_mesh(V, Fc, mask):
    f = Fc[mask]
    used, inv = np.unique(f, return_inverse=True)
    return V[used], inv.reshape(-1, 3)


PRIORITY = ['Flap_F', 'Glass_Door', 'Glass_Quarter', 'Glass_Windshield', 'Roof_Targa', 'Glass_Rear', 'Door', 'Sill', 'Hood',
            'Bumper_F', 'Bumper_R']


def name_component(V, Fc):
    import panels
    c = V[Fc].mean(1).astype(F32)
    if len(c) > 3000:
        c = c[np.random.default_rng(1).choice(len(c), 3000, replace=False)]
    s, d, inner, r = panels.shell(c[:, 0], c[:, 1], c[:, 2], with_terms=True)
    best = 'Body_Shell'
    for k in PRIORITY:
        if float(np.mean(r[k] < 0)) > 0.6:
            best = k
            break
    side = 'L' if c[:, 0].mean() > 0 else 'R'
    if best in ('Door', 'Sill', 'Glass_Door', 'Glass_Quarter'):
        best = f'{best}_{side}'
    return best


def face_materials(name, V, Fc, N):
    import body_sdf as B
    import panels
    c = V[Fc].mean(1).astype(F32)
    fn = N[Fc].mean(1)
    X, Y, Z = c[:, 0], c[:, 1], c[:, 2]
    if name.startswith('Light_Head'):
        return np.full(len(c), 7, np.int8)
    if name.startswith('Sill'):
        return np.full(len(c), 6, np.int8)
    s, d, inner, r = panels.shell(X, Y, Z, with_terms=True)
    is_inner = inner > d + 0.0005
    if any(name.startswith(g) for g in panels.GLASS):
        return np.full(len(c), 1, np.int8)
    m = np.zeros(len(c), np.int8)
    d0 = B.base(X, Y, Z)
    for reg, depth in B.POCKETS:
        m[(reg(X, Y, Z) < 0.0015) & (d0 < -0.0015) & ~is_inner] = 2
    for a in (B.ARCH_F, B.ARCH_R):
        cut = B.arch_cut(X, Y, Z, a)
        m[(cut < 0.006) & (np.abs(X) < B.side_w(Y, Z) - 0.012)] = 3
    m[(fn[:, 1] < -0.6) & (Y < 0.2) & ~is_inner] = 5
    m[is_inner] = 4
    return m


def main():
    import mesher
    import body_sdf as B
    h = float(sys.argv[1]) if len(sys.argv) > 1 else 0.0025
    out = sys.argv[2] if len(sys.argv) > 2 else '../Niepotrzebne/build/parts'
    import os
    os.makedirs(out, exist_ok=True)
    t0 = time.time()
    raw = os.path.join(out, '..', 'raw_shell.npz')
    if os.path.exists(raw) and '--remesh' not in sys.argv:
        r = np.load(raw)
        V, Fc = r['v'], r['f']
        print('loaded raw shell', len(Fc), flush=True)
    else:
        (V, Fc), nact = mesh_parallel('shell', B.BOUNDS[0] - 0.01, B.BOUNDS[1] + 0.01, h)
        np.savez(raw, v=V.astype(F32), f=Fc.astype(np.int32))
        print(f'shell mc {time.time() - t0:.0f}s blocks {nact} verts {len(V)} tris {len(Fc)}', flush=True)
    n, lab = components(V, Fc)
    manifest = {}
    sizes = np.bincount(lab)
    import panels
    for ci in np.argsort(-sizes):
        if sizes[ci] < 200:
            continue
        v, f = sub_mesh(V, Fc, lab == ci)
        name = name_component(v, f)
        if name in manifest:
            k = 2
            while f'{name}.{k}' in manifest:
                k += 1
            name = f'{name}.{k}'
        base = name.split('.')[0]
        tgt = TARGET.get(base.rsplit('_', 1)[0] if base.endswith(('_L', '_R')) else base, 8000)
        v, f = mesher.decimate(v, f, tgt)
        v, _ = mesher.relax(panels.shell, v, f)
        nrm = mesher.sdf_normals(panels.shell, v)
        f = mesher.orient_faces(v, f, nrm)
        m = face_materials(name, v, f, nrm)
        mesher.save_part(f'{out}/{name}.npz', v, f, nrm, m=m)
        manifest[name] = dict(tris=int(len(f)), raw=int(sizes[ci]))
        print(name, len(f), flush=True)
    for side, sgn in (('L', 1), ('R', -1)):
        lo = np.array([0.45, 0.42, 1.75]) if sgn > 0 else np.array([-1.0, 0.42, 1.75])
        hi = np.array([1.0, 0.72, 2.30]) if sgn > 0 else np.array([-0.45, 0.72, 2.30])
        (v, f), _ = mesh_parallel('lens', lo, hi, h * 0.6, block=32)
        v, f = mesher.decimate(v, f, TARGET['Light_Head'])
        v, _ = mesher.relax(panels.lens, v, f, iters=4)
        nrm = mesher.sdf_normals(panels.lens, v)
        f = mesher.orient_faces(v, f, nrm)
        mesher.save_part(f'{out}/Light_Head_{side}.npz', v, f, nrm, m=np.full(len(f), 7, np.int8))
        manifest[f'Light_Head_{side}'] = dict(tris=int(len(f)))
    json.dump(dict(parts=manifest, materials=MAT, h=h), open(f'{out}/manifest.json', 'w'), indent=1)
    print(f'done {time.time() - t0:.0f}s', flush=True)


if __name__ == '__main__':
    main()
