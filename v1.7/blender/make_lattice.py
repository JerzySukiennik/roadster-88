"""Generates shared/lattice.json: node-beam damage lattice fitted inside the Roadster body."""
import sys
import json
import itertools
import numpy as np
import body_sdf as B

F32 = np.float32
MASS = 1950.0

xs = [-0.82, -0.42, 0.0, 0.42, 0.82]
ys = [0.17, 0.50, 0.82]
zs = [-2.12, -1.85, -1.55, -1.20, -0.85, -0.45, -0.05, 0.35, 0.75, 1.10, 1.45, 1.80, 2.12]
nodes = []
grid = {}
for i, x in enumerate(xs):
    for j, y in enumerate(ys):
        for k, z in enumerate(zs):
            px, py, pz = x, y, z
            d = float(B.base(np.array([px], F32), np.array([py], F32), np.array([pz], F32))[0])
            if d > 0.0:
                for s in np.linspace(1.0, 0.4, 13):
                    px2, py2 = x * s, 0.17 + (y - 0.17) * s
                    d2 = float(B.base(np.array([px2], F32), np.array([py2], F32), np.array([pz], F32))[0])
                    if d2 < -0.03:
                        px, py = px2, py2
                        break
                else:
                    continue
            grid[(i, j, k)] = len(nodes)
            nodes.append([px, py, pz])
roof = {}
for k, z in enumerate(zs):
    if -1.2 <= z <= 0.75:
        for i, x in ((1, -0.42), (3, 0.42)):
            y = float(B.FH(np.array([z], F32))[0]) - 0.06
            roof[(i, k)] = len(nodes)
            nodes.append([x, y, z])
hubs = {'Wheel_FL': (0.85, 0.347, 1.425), 'Wheel_FR': (-0.85, 0.347, 1.425), 'Wheel_RL': (0.845, 0.364, -1.425),
        'Wheel_RR': (-0.845, 0.364, -1.425)}
hub_ids = {}
for nmn, p in hubs.items():
    hub_ids[nmn] = len(nodes)
    nodes.append(list(p))
N = np.array(nodes)


def zone(p, idx):
    if idx in hub_ids.values():
        return 'wheel'
    x, y, z = p
    if y > 1.0:
        return 'roof'
    if z > 1.25:
        return 'front'
    if z < -1.3:
        return 'rear'
    if y < 0.25:
        return 'floor'
    return 'cabin'


zones = [zone(p, i) for i, p in enumerate(N)]
beams = set()
keys = list(grid.keys())
for (i, j, k) in keys:
    a = grid[(i, j, k)]
    for di, dj, dk in itertools.product((-1, 0, 1), repeat=3):
        if (di, dj, dk) == (0, 0, 0):
            continue
        if abs(di) + abs(dj) + abs(dk) > 2:
            continue
        b = grid.get((i + di, j + dj, k + dk))
        if b is not None:
            beams.add((min(a, b), max(a, b)))
for (i, k), a in roof.items():
    for dk in (-1, 1):
        b = roof.get((i, k + dk))
        if b is not None:
            beams.add((min(a, b), max(a, b)))
    b = roof.get((4 - i, k))
    if b is not None:
        beams.add((min(a, b), max(a, b)))
    for gi in (i - 1, i, i + 1):
        g = grid.get((gi, 2, k))
        if g is not None:
            beams.add((min(a, g), max(a, g)))
for nmn, h in hub_ids.items():
    d = np.linalg.norm(N - N[h], axis=1)
    order = [o for o in np.argsort(d) if o != h and zones[o] != 'wheel'][:5]
    for o in order:
        beams.add((min(h, o), max(h, o)))

CLS = {
    'crumple': dict(k=1.6e6, d=700, yield_=0.010, brk=0.28),
    'cabin': dict(k=7.0e6, d=1500, yield_=0.030, brk=0.55),
    'floor': dict(k=9.0e6, d=1800, yield_=0.040, brk=0.65),
    'roof': dict(k=3.0e6, d=900, yield_=0.020, brk=0.40),
    'suspension': dict(k=2.5e6, d=1200, yield_=0.050, brk=0.35),
}
out_beams = []
for a, b in sorted(beams):
    za, zb = zones[a], zones[b]
    if 'wheel' in (za, zb):
        c = 'suspension'
    elif 'front' in (za, zb) or 'rear' in (za, zb):
        c = 'crumple'
    elif 'roof' in (za, zb):
        c = 'roof'
    elif za == 'floor' and zb == 'floor':
        c = 'floor'
    else:
        c = 'cabin'
    p = CLS[c]
    out_beams.append(dict(a=int(a), b=int(b), k=p['k'], d=p['d'], **{'yield': p['yield_'], 'break': p['brk']}, **{'class': c}))

w = np.array([3.0 if z == 'floor' else 0.6 if z in ('roof',) else 1.6 if z == 'wheel' else 1.0 for z in zones])
m = w / w.sum() * MASS
PART_BOXES = {
    'Bumper_F': lambda p: p[2] > 1.95 and p[1] < 0.65,
    'Flap_F': lambda p: p[2] > 2.0 and abs(p[0]) < 0.5 and p[1] < 0.6,
    'Hood': lambda p: p[2] > 1.2 and p[1] > 0.6 and abs(p[0]) < 0.5,
    'Bumper_R': lambda p: p[2] < -1.95 and p[1] < 0.85,
    'Door_L': lambda p: -0.5 < p[2] < 0.9 and p[0] > 0.6 and p[1] > 0.3,
    'Door_R': lambda p: -0.5 < p[2] < 0.9 and p[0] < -0.6 and p[1] > 0.3,
    'Mirror_L': lambda p: 0.3 < p[2] < 0.9 and p[0] > 0.6 and p[1] > 0.6,
    'Mirror_R': lambda p: 0.3 < p[2] < 0.9 and p[0] < -0.6 and p[1] > 0.6,
    'Wing': lambda p: p[2] < -1.7 and p[1] > 0.7,
    'Roof_Targa': lambda p: p[1] > 1.0 and -0.8 < p[2] < 0.1,
    'Glass_Windshield': lambda p: p[1] > 0.75 and 0.0 < p[2] < 1.3 and abs(p[0]) < 0.6,
    'Glass_Rear': lambda p: p[1] > 0.8 and -1.8 < p[2] < -0.75 and abs(p[0]) < 0.6,
}
parts = []
for nmn, fn in PART_BOXES.items():
    ids = [i for i, p in enumerate(N) if zones[i] != 'wheel' and fn(p)]
    if not ids:
        c = {'Mirror_L': (0.9, 0.86, 0.7), 'Mirror_R': (-0.9, 0.86, 0.7)}.get(nmn, (0, 0.5, 0))
        ids = [int(np.argmin(np.linalg.norm(N - np.array(c), axis=1)))]
    imp = {'Mirror_L': 1500, 'Mirror_R': 1500, 'Flap_F': 2500, 'Wing': 6000}.get(nmn, 9000)
    parts.append(dict(name=nmn, nodes=[int(i) for i in ids], break_impulse=imp))
nozzles = {}
for nmn, p in (('Nozzle_RL1', (0.40, 0.30, -2.10)), ('Nozzle_RL2', (0.17, 0.29, -2.12)), ('Nozzle_RR2', (-0.17, 0.29, -2.12)),
               ('Nozzle_RR1', (-0.40, 0.30, -2.10)), ('Nozzle_FL', (0.13, 0.30, 2.10)), ('Nozzle_FR', (-0.13, 0.30, 2.10))):
    d = np.linalg.norm(N - np.array(p), axis=1)
    nozzles[nmn] = [int(i) for i in np.argsort(d)[:2]]
wheels = {nmn: [int(h)] + [int(b['b'] if b['a'] == h else b['a']) for b in out_beams if h in (b['a'], b['b'])][:3]
          for nmn, h in hub_ids.items()}
data = dict(version=1, notes='Generated by blender/make_lattice.py. Car frame: x left, y up, z forward, metres.',
            nodes=[dict(id=i, p=[round(float(v), 4) for v in N[i]], m=round(float(m[i]), 3), zone=zones[i]) for i in range(len(N))],
            beams=out_beams, parts=parts, wheels=wheels, nozzles=nozzles)
json.dump(data, open(sys.argv[1], 'w'), indent=1)
print(f'nodes {len(N)} beams {len(out_beams)} parts {len(parts)} mass {m.sum():.1f}')
