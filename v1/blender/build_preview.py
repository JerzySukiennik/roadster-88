"""Meshes the outer body SDF at preview resolution into an npz for quick renders."""
import sys
import time
import numpy as np
import body_sdf as B
import mesher as M
from classify import classify

h = float(sys.argv[1]) if len(sys.argv) > 1 else 0.008
out = sys.argv[2] if len(sys.argv) > 2 else '../Niepotrzebne/build/preview_body.npz'
t0 = time.time()
V, Fc = M.mesh_sdf(B.outer, B.BOUNDS[0], B.BOUNDS[1], h, block=40)
t1 = time.time()
V, Fc = M.decimate(V, Fc, 400000)
N = M.sdf_normals(B.outer, V)
Fc = M.orient_faces(V, Fc, N)
M.save_part(out, V, Fc, N, m=classify(V, Fc))
print(f'mesh {t1 - t0:.1f}s total {time.time() - t0:.1f}s verts {len(V)} tris {len(Fc)}')
