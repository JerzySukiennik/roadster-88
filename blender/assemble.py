"""Assembles the Roadster: body parts from npz, procedural wheels, nozzles, diffuser, interior, lights; exports GLB (run inside Blender)."""
import sys
import os
import json
import math
import numpy as np
import bpy
import bmesh
from mathutils import Vector, Matrix, Euler

argv = sys.argv[sys.argv.index('--') + 1:]
PARTS, TEX, FEAT, OUT_GLB = argv[0], argv[1], argv[2], argv[3]
OUT_BLEND = argv[4] if len(argv) > 4 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
feat = json.load(open(FEAT))
manifest = json.load(open(os.path.join(PARTS, 'manifest.json')))

TRACK_F, TRACK_R = 0.85, 0.845
R_F, R_R = 0.347, 0.364
W_F, W_R = 0.265, 0.325
RIM_F, RIM_R = 0.254, 0.267
AXLE = 1.425


def c2b(v):
    return Vector((v[0], -v[2], v[1]))


def c2b_np(v):
    return np.stack([v[:, 0], -v[:, 2], v[:, 1]], 1)


def img(name, noncolor=False):
    path = os.path.abspath(os.path.join(TEX, name))
    im = bpy.data.images.load(path, check_existing=True)
    if noncolor:
        im.colorspace_settings.name = 'Non-Color'
    return im


def material(name, color, metallic=0.0, rough=0.5, coat=0.0, coat_rough=0.03, emit=None, emit_strength=0.0,
             transmission=0.0, alpha=1.0, base_tex=None, normal_tex=None, normal_strength=1.0, uv_scale=None,
             alpha_tex=None, ior=1.5):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = rough
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Coat Roughness'].default_value = coat_rough
    b.inputs['Transmission Weight'].default_value = transmission
    b.inputs['IOR'].default_value = ior
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = emit_strength
    mapping = None
    if uv_scale:
        tc = nt.nodes.new('ShaderNodeTexCoord')
        mapping = nt.nodes.new('ShaderNodeMapping')
        mapping.inputs['Scale'].default_value = (uv_scale, uv_scale, 1)
        nt.links.new(tc.outputs['UV'], mapping.inputs['Vector'])
    if base_tex:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = img(base_tex)
        if mapping:
            nt.links.new(mapping.outputs['Vector'], t.inputs['Vector'])
        nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if normal_tex:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = img(normal_tex, True)
        if mapping:
            nt.links.new(mapping.outputs['Vector'], t.inputs['Vector'])
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = normal_strength
        nt.links.new(t.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    if alpha_tex:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = img(alpha_tex, True)
        nt.links.new(t.outputs['Color'], b.inputs['Alpha'])
        m.blend_method = 'CLIP' if hasattr(m, 'blend_method') else None
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
    if transmission > 0:
        for attr, val in (('use_raytrace_refraction', True), ('surface_render_method', 'DITHERED'), ('use_screen_refraction', True)):
            if hasattr(m, attr):
                setattr(m, attr, val)
        if hasattr(m, 'thickness_mode'):
            m.thickness_mode = 'SLAB'
    return m


MATS = {
    'Paint': material('Paint', (0.46, 0.008, 0.012), metallic=0.55, rough=0.16, coat=1.0, coat_rough=0.004),
    'Paint_Black': material('Paint_Black', (0.012, 0.012, 0.013), rough=0.45),
    'Glass_Tint': material('Glass_Tint', (0.12, 0.13, 0.14), rough=0.0, transmission=0.95, ior=1.52),
    'Glass_Clear': material('Glass_Clear', (0.9, 0.92, 0.95), rough=0.0, transmission=1.0, ior=1.52),
    'Trim': material('Trim', (0.008, 0.008, 0.009), rough=0.22, coat=0.6),
    'Liner': material('Liner', (0.025, 0.025, 0.025), rough=0.92),
    'Interior_Dark': material('Interior_Dark', (0.03, 0.03, 0.032), rough=0.8),
    'Underbody': material('Underbody', (0.02, 0.02, 0.021), rough=0.85),
    'Lens': material('Lens', (0.05, 0.05, 0.055), rough=0.02, transmission=0.7, ior=1.49),
    'Carbon': material('Carbon', (0.04, 0.04, 0.045), rough=0.28, coat=1.0, coat_rough=0.04, base_tex='carbon_base.png',
                       normal_tex='carbon_normal.png', normal_strength=0.6, uv_scale=6.0),
    'Chrome': material('Chrome', (0.9, 0.9, 0.92), metallic=1.0, rough=0.08),
    'Rubber': material('Rubber', (0.02, 0.02, 0.02), rough=0.85),
    'Tire': material('Tire', (0.03, 0.03, 0.03), rough=0.86, base_tex='tyre_base.png', normal_tex='tyre_normal.png',
                     normal_strength=1.0),
    'Rim': material('Rim', (0.10, 0.10, 0.105), metallic=0.85, rough=0.32),
    'Brake_Disc': material('Brake_Disc', (0.3, 0.3, 0.3), metallic=0.4, rough=0.55, base_tex='disc_base.png',
                           normal_tex='disc_normal.png'),
    'Caliper': material('Caliper', (0.55, 0.02, 0.02), rough=0.25, coat=0.8),
    'LED_Head': material('LED_Head', (1, 1, 1), rough=0.3, emit=(0.85, 0.92, 1.0), emit_strength=12.0),
    'LED_Tail': material('LED_Tail', (0.6, 0.0, 0.0), rough=0.3, emit=(1.0, 0.02, 0.01), emit_strength=6.0),
    'Lens_Tail': material('Lens_Tail', (0.32, 0.0, 0.004), rough=0.03, coat=1.0, transmission=0.55, emit=(0.6, 0.0, 0.0), emit_strength=0.4),
    'Interior_Leather': material('Interior_Leather', (0.80, 0.79, 0.76), rough=0.55, normal_tex='leather_perf_normal.png',
                                 normal_strength=0.4, uv_scale=3.0),
    'Alcantara': material('Alcantara', (0.035, 0.035, 0.038), rough=0.95),
    'Nozzle_Metal': material('Nozzle_Metal', (0.55, 0.53, 0.5), metallic=1.0, rough=0.38),
    'Screen': material('Screen', (0.0, 0.0, 0.0), rough=0.05, emit=(0.02, 0.02, 0.03), emit_strength=1.0),
    'Cluster': material('Cluster', (0.0, 0.0, 0.0), rough=0.05, emit=(0.02, 0.02, 0.03), emit_strength=1.0),
    'Badge': material('Badge', (0.85, 0.85, 0.87), metallic=1.0, rough=0.12, alpha_tex='tlogo_alpha.png'),
    'Wordmark': material('Wordmark', (0.02, 0.02, 0.02), metallic=0.6, rough=0.2, alpha_tex='wordmark_alpha.png'),
}
PART_MATS = manifest['materials']


PENDING = []


def link(ob, parent=None):
    scn.collection.objects.link(ob)
    if parent is not None:
        PENDING.append((ob, parent))
    return ob


def adopt_all():
    for ob, parent in PENDING:
        bpy.context.view_layer.update()
        mw = ob.matrix_world.copy()
        ob.parent = parent
        ob.matrix_parent_inverse = Matrix.Identity(4)
        ob.matrix_world = mw
    PENDING.clear()
    bpy.context.view_layer.update()


def empty(name, loc_car, parent=None, kind='PLAIN_AXES', size=0.05):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = kind
    e.empty_display_size = size
    link(e, parent)
    e.location = c2b(loc_car)
    return e


def mesh_from_np(name, V_bl, F, N_bl=None, mats=None, mat_idx=None, uv=None):
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(V_bl))
    me.vertices.foreach_set('co', V_bl.astype(np.float32).ravel())
    me.loops.add(len(F) * 3)
    me.loops.foreach_set('vertex_index', F.astype(np.int32).ravel())
    me.polygons.add(len(F))
    me.polygons.foreach_set('loop_start', np.arange(0, len(F) * 3, 3, dtype=np.int32))
    me.polygons.foreach_set('loop_total', np.full(len(F), 3, dtype=np.int32))
    me.update()
    me.polygons.foreach_set('use_smooth', np.ones(len(F), dtype=bool))
    for m in mats or []:
        me.materials.append(m)
    if mat_idx is not None:
        me.polygons.foreach_set('material_index', mat_idx.astype(np.int32))
    if uv is not None:
        layer = me.uv_layers.new(name='UVMap')
        layer.data.foreach_set('uv', uv[F.ravel()].astype(np.float32).ravel())
    if N_bl is not None:
        me.normals_split_custom_set_from_vertices([tuple(n) for n in N_bl])
    me.update()
    return me


def place(ob, pivot_car, parent=None):
    pw = c2b(pivot_car)
    ob.data.transform(Matrix.Translation(-pw))
    link(ob, parent)
    ob.location = pw
    return ob


def read_part(path):
    d = np.load(path)
    return c2b_np(d['v']), c2b_np(d['n']), d['f'], d['m']


def load_part(name, pivot_car, parent=None, out_name=None, extras=None):
    files = sorted(f for f in os.listdir(PARTS) if f == name + '.npz' or (f.startswith(name + '.') and f.endswith('.npz')))
    if not files:
        print('MISSING PART', name)
        e = empty(out_name or name, pivot_car, parent)
        for k, v in (extras or {}).items():
            e[k] = v
        return e
    Vs, Ns, Fs, Ms, off = [], [], [], [], 0
    for f in files:
        v, n, fc, m = read_part(os.path.join(PARTS, f))
        Vs.append(v)
        Ns.append(n)
        Fs.append(fc + off)
        Ms.append(m)
        off += len(v)
    V, N, F, m = np.concatenate(Vs), np.concatenate(Ns), np.concatenate(Fs), np.concatenate(Ms)
    used = sorted(set(m.tolist()))
    remap = {u: i for i, u in enumerate(used)}
    idx = np.array([remap[x] for x in m.tolist()], np.int32)
    me = mesh_from_np(out_name or name, V, F, N, [MATS[PART_MATS[u]] for u in used], idx)
    ob = bpy.data.objects.new(out_name or name, me)
    for k, v in (extras or {}).items():
        ob[k] = v
    return place(ob, pivot_car, parent)


def catmull(pts, n=6, closed=False):
    P = [Vector(p) for p in pts]
    out = []
    cnt = len(P) if closed else len(P) - 1
    for i in range(cnt):
        p0 = P[(i - 1) % len(P)] if closed or i > 0 else P[0]
        p1, p2 = P[i], P[(i + 1) % len(P)]
        p3 = P[(i + 2) % len(P)] if closed or i + 2 < len(P) else P[-1]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    if not closed:
        out.append(P[-1])
    return out


def lathe(name, profile, segs=96, arc=(0.0, 2 * math.pi), closed_profile=False, uv=True, cap=False):
    """profile: list of (r, a) with a along +X (wheel axis); revolves around X in the YZ plane."""
    prof = profile
    n = len(prof)
    full = abs(arc[1] - arc[0] - 2 * math.pi) < 1e-6
    rings = segs if full else segs + 1
    V, UV = [], []
    lens = [0.0]
    for i in range(1, n):
        lens.append(lens[-1] + math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]))
    tot = lens[-1] or 1.0
    for s in range(rings):
        th = arc[0] + (arc[1] - arc[0]) * s / segs
        c, sn = math.cos(th), math.sin(th)
        for i, (r, a) in enumerate(prof):
            V.append((a, r * c, r * sn))
            UV.append((s / segs, lens[i] / tot))
    F = []
    for s in range(segs):
        s2 = (s + 1) % rings if full else s + 1
        for i in range(n - 1 + (1 if closed_profile else 0)):
            i2 = (i + 1) % n
            F.append((s * n + i, s2 * n + i, s2 * n + i2, s * n + i2))
    me = bpy.data.meshes.new(name)
    me.from_pydata(V, [], F)
    if uv:
        layer = me.uv_layers.new(name='UVMap')
        for poly in me.polygons:
            for li in poly.loop_indices:
                vi = me.loops[li].vertex_index
                u, v = UV[vi]
                layer.data[li].uv = (u, v)
        if full:
            for poly in me.polygons:
                us = [layer.data[li].uv[0] for li in poly.loop_indices]
                if max(us) - min(us) > 0.5:
                    for li in poly.loop_indices:
                        if layer.data[li].uv[0] < 0.5:
                            layer.data[li].uv = (layer.data[li].uv[0] + 1.0, layer.data[li].uv[1])
    for p in me.polygons:
        p.use_smooth = True
    me.update()
    return me


def smooth_profile(pts, n=4):
    return [(p.x, p.y) for p in catmull([(r, a, 0) for r, a in pts], n)]


def obj(name, me, mats):
    ob = bpy.data.objects.new(name, me)
    for m in mats:
        ob.data.materials.append(m)
    return ob


def tire_mesh(name, R, W, rim):
    h = W / 2
    pts = [(rim + 0.004, h - 0.014), (rim + 0.014, h + 0.001), (rim + 0.045, h + 0.008), (R - 0.03, h + 0.006),
           (R - 0.008, h - 0.008), (R, h - 0.03), (R, 0.0), (R, -h + 0.03), (R - 0.008, -h + 0.008), (R - 0.03, -h - 0.006),
           (rim + 0.045, -h - 0.008), (rim + 0.014, -h - 0.001), (rim + 0.004, -h + 0.014)]
    return lathe(name, smooth_profile(pts, 4), segs=128)


def rim_mesh(name, rim, W, outward):
    s = rim / 0.254
    h = W / 2
    prof = [(0.200 * s, -h + 0.006), (0.236 * s, -h + 0.006), (0.248 * s, -h + 0.014), (0.240 * s, -h + 0.024),
            (0.214 * s, -h + 0.034), (0.211 * s, h - 0.045), (0.232 * s, h - 0.024), (0.252 * s, h - 0.013),
            (0.259 * s, h - 0.005), (0.255 * s, h + 0.001), (0.243 * s, h - 0.001), (0.226 * s, h - 0.020),
            (0.204 * s, h - 0.032), (0.198 * s, -h + 0.006)]
    me = lathe(name, prof, segs=112, closed_profile=True, uv=False)
    bm = bmesh.new()
    bm.from_mesh(me)
    r_hub, r_split, r_end = 0.066 * s, 0.112 * s, 0.207 * s

    def a_face(r):
        k = (r - r_hub) / (r_end - r_hub)
        return h - 0.024 - 0.05 * (1 - k) ** 1.4

    def beam(r0, r1, ang0, ang1, w0, w1, depth, nseg=7):
        verts = []
        for i in range(nseg + 1):
            t = i / nseg
            r = r0 + (r1 - r0) * t
            ang = ang0 + (ang1 - ang0) * t
            w = w0 + (w1 - w0) * t
            af = a_face(r)
            dirv = Vector((0, math.cos(ang), math.sin(ang)))
            perp = Vector((0, -math.sin(ang), math.cos(ang)))
            ring = []
            for (pw, pd) in ((-0.5, 0.0), (0.5, 0.0), (0.42, -1.0), (-0.42, -1.0)):
                p = dirv * r + perp * (pw * w)
                ring.append(bm.verts.new((af + pd * depth, p.y, p.z)))
            verts.append(ring)
        for i in range(nseg):
            a, b = verts[i], verts[i + 1]
            for j in range(4):
                j2 = (j + 1) % 4
                bm.faces.new((a[j], b[j], b[j2], a[j2]))
        bm.faces.new(list(reversed(verts[0])))
        bm.faces.new(verts[-1])
    for k in range(5):
        base = k * 2 * math.pi / 5 + math.pi / 10
        beam(r_hub * 0.9, r_split, base, base, 0.036 * s, 0.040 * s, 0.032)
        for sg in (-1, 1):
            beam(r_split * 0.96, r_end, base + sg * 0.03, base + sg * 0.165, 0.024 * s, 0.019 * s, 0.026)
    hub = bmesh.ops.create_cone(bm, cap_ends=True, segments=40, radius1=r_hub, radius2=r_hub * 0.92, depth=0.05,
                                matrix=Matrix.Translation((a_face(r_hub) - 0.02, 0, 0)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
    for k in range(5):
        ang = k * 2 * math.pi / 5
        bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.0095 * s, radius2=0.0085 * s, depth=0.018,
                              matrix=Matrix.Translation((a_face(r_hub) + 0.008, 0.042 * s * math.cos(ang),
                                                         0.042 * s * math.sin(ang))) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    if outward < 0:
        me.transform(Matrix.Scale(-1, 4, (1, 0, 0)))
        me.flip_normals()
    return me


def disc_mesh(name, r, outward):
    me = lathe(name, [(0.09, -0.032), (r, -0.032), (r, -0.002), (0.09, -0.002), (0.075, 0.02), (0.06, 0.02)], segs=72,
               uv=False)
    layer = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            layer.data[li].uv = (co.y / (2 * r) + 0.5, co.z / (2 * r) + 0.5)
    if outward < 0:
        me.transform(Matrix.Scale(-1, 4, (1, 0, 0)))
        me.flip_normals()
    return me


def caliper_mesh(name, r, outward, front):
    c = math.pi if front else 0.0
    me = lathe(name, [(r - 0.075, -0.052), (r + 0.016, -0.052), (r + 0.02, -0.03), (r + 0.016, 0.012),
                      (r - 0.075, 0.012), (r - 0.08, -0.02)], segs=14, arc=(c - 0.62, c + 0.62),
               closed_profile=True, uv=False)
    if outward < 0:
        me.transform(Matrix.Scale(-1, 4, (1, 0, 0)))
        me.flip_normals()
    return me


root = bpy.data.objects.new('Roadster', None)
link(root)

body = load_part('Body_Shell', (0, 0.5, 0), root, 'Body_Shell', {'deform': True})
load_part('Hood', tuple(feat['hood_hinge']), root, 'Hood', {'part': 'Hood', 'detach': True, 'deform': True})
load_part('Bumper_F', (0, 0.32, 2.05), root, 'Bumper_F', {'part': 'Bumper_F', 'detach': True, 'deform': True})
load_part('Bumper_R', (0, 0.45, -2.05), root, 'Bumper_R', {'part': 'Bumper_R', 'detach': True, 'deform': True})
flap = load_part('Flap_F', tuple(feat['flap']), root, 'Flap_F', {'part': 'Flap_F', 'detach': True})
hx, hy, hz = feat['hinge_door_L']
doors = {}
for side, sg in (('L', 1), ('R', -1)):
    dr = load_part(f'Door_{side}', (sg * hx, hy, hz), root, f'Door_{side}', {'part': f'Door_{side}', 'detach': True, 'deform': True})
    doors[side] = dr
    load_part(f'Glass_Door_{side}', (sg * hx, hy, hz), dr, f'Glass_Door_{side}', {'part': f'Glass_Door_{side}', 'detach': True})
    load_part(f'Glass_Quarter_{side}', (sg * 0.8, 0.98, -0.75), root, f'Glass_Quarter_{side}', {'part': f'Glass_Quarter_{side}', 'detach': True})
    load_part(f'Sill_{side}', (sg * 0.92, 0.15, 0.0), root, f'Sill_{side}')
load_part('Glass_Windshield', (0, 0.95, 0.6), root, 'Glass_Windshield', {'part': 'Glass_Windshield', 'detach': True})
load_part('Roof_Targa', (0, 1.13, -0.37), root, 'Roof_Targa', {'part': 'Roof_Targa', 'detach': True})
load_part('Glass_Rear', (0, 1.0, -1.25), root, 'Glass_Rear', {'part': 'Glass_Rear', 'detach': True})

for side, sg in (('L', 1), ('R', -1)):
    lh = load_part(f'Light_Head_{side}', (sg * 0.75, 0.58, 1.98), root, f'Light_Head_{side}', {'part': f'Light_Head_{side}', 'detach': True})
    for key, mname in (('led_head_L', 'LED_Head'), ('drl_head_L', 'LED_Head')):
        pts = [Vector((sg * p[0], p[1], p[2])) for p in feat[key]]
        cu = bpy.data.curves.new(f'{key}_{side}', 'CURVE')
        cu.dimensions = '3D'
        cu.bevel_depth = 0.0028 if key.startswith('led') else 0.0022
        cu.bevel_resolution = 2
        sp = cu.splines.new('POLY')
        sm = catmull([tuple(p) for p in pts], 5)
        sp.points.add(len(sm) - 1)
        for i, p in enumerate(sm):
            sp.points[i].co = (*c2b(p), 1)
        co = bpy.data.objects.new(f'LED_{key.split("_")[0]}_{side}', cu)
        co.data.materials.append(MATS[mname])
        link(co)
        bpy.context.view_layer.objects.active = co
        co.select_set(True)
        bpy.ops.object.convert(target='MESH')
        co.select_set(False)
        PENDING.append((co, lh))

tail_pts = [Vector(p) for p in feat['led_tail']]
cu = bpy.data.curves.new('LED_Tail_curve', 'CURVE')
cu.dimensions = '3D'
cu.bevel_depth = 0.0075
cu.bevel_resolution = 2
sp = cu.splines.new('POLY')
sp.points.add(len(tail_pts) - 1)
for i, p in enumerate(tail_pts):
    sp.points[i].co = (*c2b(p), 1)
tail = bpy.data.objects.new('Light_Tail', cu)
tail.data.materials.append(MATS['LED_Tail'])
link(tail)
bpy.context.view_layer.objects.active = tail
tail.select_set(True)
bpy.ops.object.convert(target='MESH')
tail.select_set(False)
tail.parent = root
cu2 = bpy.data.curves.new('Lens_Tail_curve', 'CURVE')
cu2.dimensions = '3D'
cu2.extrude = 0.013
sp2 = cu2.splines.new('POLY')
lens_pts = [Vector((p[0], p[1], p[2] - 0.006)) for p in feat['led_tail']]
sp2.points.add(len(lens_pts) - 1)
for i, p in enumerate(lens_pts):
    sp2.points[i].co = (*c2b(p), 1)
lt = bpy.data.objects.new('Tail_Lens', cu2)
lt.data.materials.append(MATS['Lens_Tail'])
link(lt)
bpy.context.view_layer.objects.active = lt
lt.select_set(True)
bpy.ops.object.convert(target='MESH')
lt.select_set(False)
PENDING.append((lt, tail))

wheel_specs = {
    'FL': (TRACK_F, AXLE, R_F, W_F, RIM_F, 1, True), 'FR': (-TRACK_F, AXLE, R_F, W_F, RIM_F, -1, True),
    'RL': (TRACK_R, -AXLE, R_R, W_R, RIM_R, 1, False), 'RR': (-TRACK_R, -AXLE, R_R, W_R, RIM_R, -1, False),
}
for key, (x, z, R, W, rim, sg, front) in wheel_specs.items():
    hub = (x, R, z)
    holder = root
    if front:
        holder = empty(f'Steer_{key}', hub, root)
    wheel = empty(f'Wheel_{key}', hub, holder)
    wheel['part'] = f'Wheel_{key}'
    wheel['detach'] = True
    tm = tire_mesh(f'Tire_{key}', R, W, rim)
    if sg < 0:
        tm.transform(Matrix.Scale(-1, 4, (1, 0, 0)))
        tm.flip_normals()
    t = obj(f'Tire_{key}', tm, [MATS['Tire']])
    link(t, wheel)
    t.location = c2b(hub)
    rm = obj(f'Rim_{key}', rim_mesh(f'Rim_{key}', rim, W, sg), [MATS['Rim']])
    link(rm, wheel)
    rm.location = c2b(hub)
    brake = empty(f'Brake_{key}', hub, holder)
    dr = obj(f'Disc_{key}', disc_mesh(f'Disc_{key}', 0.19 if front else 0.18, sg), [MATS['Brake_Disc']])
    link(dr, wheel)
    dr.location = c2b(hub)
    cl = obj(f'Caliper_{key}', caliper_mesh(f'Caliper_{key}', 0.19 if front else 0.18, sg, front), [MATS['Caliper']])
    link(cl, brake)
    cl.location = c2b(hub)


def nozzle_mesh(name, length, r_exit, r_throat):
    prof = [(0.0, -0.035), (0.03, -0.034), (0.045, -0.02), (0.046, 0.0), (0.04, 0.02), (r_throat + 0.006, 0.04),
            (r_throat + 0.004, length * 0.42), (r_exit * 0.7 + 0.004, length * 0.7), (r_exit + 0.004, length),
            (r_exit, length + 0.002), (r_exit - 0.003, length - 0.004), (r_exit * 0.7, length * 0.7),
            (r_throat, length * 0.42), (r_throat * 0.6, 0.05), (0.0, 0.05)]
    me = lathe(name, smooth_profile(prof, 3), segs=48, uv=False)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=0.056, radius2=0.056, depth=0.012,
                          matrix=Matrix.Rotation(math.pi / 2, 4, 'Y'))
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.transform(Matrix.Rotation(-math.pi / 2, 4, 'Z'))
    return me


rear_pos = [(0.40, 0.30, -2.10), (0.17, 0.29, -2.12), (-0.17, 0.29, -2.12), (-0.40, 0.30, -2.10)]
rear_names = ['Nozzle_RL1', 'Nozzle_RL2', 'Nozzle_RR2', 'Nozzle_RR1']
for nm, p in zip(rear_names, rear_pos):
    me = nozzle_mesh(nm, 0.15, 0.058, 0.026)
    o = obj(nm, me, [MATS['Nozzle_Metal']])
    link(o, root)
    o.location = c2b(p)
    o['part'] = nm
    o['detach'] = True
    ex = empty('Exhaust', (p[0], p[1], p[2] - 0.152), o, 'SINGLE_ARROW', 0.05)
    ex.name = f'Exhaust_{nm}'
    hous = bpy.data.meshes.new(f'Housing_{nm}')
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=40, radius1=0.068, radius2=0.068, depth=0.10,
                          matrix=Matrix.Rotation(math.pi / 2, 4, 'X'))
    bm.to_mesh(hous)
    bm.free()
    for poly in hous.polygons:
        poly.use_smooth = True
    ho = obj(f'Housing_{nm}', hous, [MATS['Carbon']])
    link(ho, root)
    ho.location = c2b((p[0], p[1], p[2] + 0.02))

mount = empty('NozzleMount_F', (0.0, 0.30, 2.10), root)
for nm, x in (('Nozzle_FL', 0.13), ('Nozzle_FR', -0.13)):
    me = nozzle_mesh(nm, 0.10, 0.040, 0.019)
    me.transform(Matrix.Rotation(math.pi, 4, 'Z'))
    o = obj(nm, me, [MATS['Nozzle_Metal']])
    link(o, mount)
    o.location = c2b((x, 0.30, 2.10))
    o['part'] = nm
    o['detach'] = True
    ex = empty('Exhaust', (x, 0.30, 2.10 + 0.102), o, 'SINGLE_ARROW', 0.04)
    ex.name = f'Exhaust_{nm}'


def plate(name, outline_car, y_of, thick, mat):
    bm = bmesh.new()
    top = [bm.verts.new(c2b((x, y_of(x, z), z))) for x, z in outline_car]
    bot = [bm.verts.new(c2b((x, y_of(x, z) - thick, z))) for x, z in outline_car]
    n = len(outline_car)
    bm.faces.new(top)
    bm.faces.new(list(reversed(bot)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((top[i], bot[i], bot[j], top[j]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = obj(name, me, [mat])
    link(o, root)
    return o


diff_y = lambda x, z: 0.118 + max(0.0, (-1.80 - z)) * 0.40
outline = [(0.80, -1.78), (0.86, -2.0), (0.84, -2.18), (0.6, -2.235), (0.0, -2.245), (-0.6, -2.235), (-0.84, -2.18),
           (-0.86, -2.0), (-0.80, -1.78)]
plate('Diffuser', outline, lambda x, z: diff_y(x, z) + 0.008, 0.008, MATS['Carbon'])
for fx in (0.0, 0.285, -0.285, 0.55, -0.55):
    bm = bmesh.new()
    pts = [(-1.90, diff_y(0, -1.90)), (-2.20, diff_y(0, -2.20)), (-2.20, 0.175), (-2.08, 0.165)]
    a = [bm.verts.new(c2b((fx + 0.004, y, z))) for z, y in pts]
    b = [bm.verts.new(c2b((fx - 0.004, y, z))) for z, y in pts]
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((a[i], b[i], b[j], a[j]))
    me = bpy.data.meshes.new(f'Fin_{fx:+.2f}')
    bm.to_mesh(me)
    bm.free()
    o = obj(f'Diffuser_Fin', me, [MATS['Carbon']])
    link(o, root)
for sg in (1, -1):
    bm = bmesh.new()
    pts = [(-2.02, 0.42), (-2.17, 0.36), (-2.22, 0.14), (-2.05, 0.12)]
    a = [bm.verts.new(c2b((sg * 0.935, y, z))) for z, y in pts]
    b = [bm.verts.new(c2b((sg * 0.915, y, z))) for z, y in pts]
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((a[i], b[i], b[j], a[j]))
    me = bpy.data.meshes.new('Blade')
    bm.to_mesh(me)
    bm.free()
    link(obj('Diffuser_Blade', me, [MATS['Carbon']]), root)

sp_outline = []
for x in np.linspace(-0.92, 0.92, 37):
    sp_outline.append((float(x), 2.25 - 0.22 * (abs(x) / 0.92) ** 2.6 + 0.035))
for x in np.linspace(0.92, -0.92, 37):
    sp_outline.append((float(x), 2.25 - 0.22 * (abs(x) / 0.92) ** 2.6 - 0.16))
plate('Splitter', sp_outline, lambda x, z: 0.118, 0.008, MATS['Carbon'])


def rounded_box(name, size, bevel=0.02, segs=3, mats=(), loc_car=(0, 0, 0), rot=(0, 0, 0), parent=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=segs, affect='EDGES', profile=0.5)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    o = obj(name, me, list(mats))
    link(o, parent or root)
    o.rotation_euler = rot
    o.location = c2b(loc_car)
    return o


def bl_size(sx, sy, sz):
    return (sx, sz, sy)


back = rounded_box('Diffuser_Back', bl_size(1.52, 0.17, 0.02), 0.006, 2, [MATS['Carbon']], (0.0, 0.275, -2.17))


interior = empty('Interior', (0, 0.4, 0), root)
interior_parts = []
interior_parts.append(rounded_box('Floor', bl_size(1.56, 0.02, 2.2), 0.01, 2, [MATS['Alcantara']], (0, 0.145, -0.2)))
interior_parts.append(rounded_box('Tunnel', bl_size(0.24, 0.20, 1.5), 0.05, 4, [MATS['Interior_Dark']], (0, 0.24, -0.15)))
interior_parts.append(rounded_box('Console', bl_size(0.22, 0.06, 0.95), 0.025, 4, [MATS['Carbon']], (0, 0.37, -0.05)))
dash_prof = [(1.00, 0.76), (0.70, 0.80), (0.45, 0.79), (0.33, 0.74), (0.30, 0.60), (0.36, 0.47), (0.65, 0.44), (1.00, 0.50)]
bm = bmesh.new()
L = [bm.verts.new(c2b((0.82, y, z))) for z, y in dash_prof]
Rr = [bm.verts.new(c2b((-0.82, y, z))) for z, y in dash_prof]
bm.faces.new(L)
bm.faces.new(list(reversed(Rr)))
for i in range(len(dash_prof)):
    j = (i + 1) % len(dash_prof)
    bm.faces.new((L[i], Rr[i], Rr[j], L[j]))
bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.012, segments=3, affect='EDGES')
dme = bpy.data.meshes.new('Dash')
bm.to_mesh(dme)
bm.free()
for p in dme.polygons:
    p.use_smooth = True
interior_parts.append(link(obj('Dash', dme, [MATS['Alcantara']])))
interior_parts.append(rounded_box('Dash_Band', bl_size(1.62, 0.05, 0.02), 0.008, 2, [MATS['Carbon']], (0, 0.67, 0.305)))
interior_parts.append(rounded_box('Dash_Light', bl_size(1.5, 0.004, 0.006), 0.0015, 1, [MATS['LED_Head']], (0, 0.703, 0.298)))


def seat(name, x, z, y0, scale=1.0, recline=0.40):
    grp = empty(name, (x, y0, z), interior)
    s = scale
    cush = rounded_box(f'{name}_Cushion', bl_size(0.50 * s, 0.10, 0.50 * s), 0.04, 4, [MATS['Interior_Leather']],
                       (x, y0 + 0.05, z + 0.05), (0.12, 0, 0), grp)
    back = rounded_box(f'{name}_Back', bl_size(0.50 * s, 0.70 * s, 0.10), 0.045, 4, [MATS['Interior_Leather']],
                       (x, y0 + 0.36 * s, z - 0.25 - 0.16 * s), (-recline, 0, 0), grp)
    shell = rounded_box(f'{name}_Shell', bl_size(0.52 * s, 0.72 * s, 0.04), 0.02, 3, [MATS['Carbon']],
                        (x, y0 + 0.36 * s, z - 0.31 - 0.16 * s), (-recline, 0, 0), grp)
    for sgn in (1, -1):
        rounded_box(f'{name}_Bolster', bl_size(0.07, 0.42 * s, 0.13), 0.03, 3, [MATS['Interior_Leather']],
                    (x + sgn * 0.22 * s, y0 + 0.30 * s, z - 0.22 - 0.12 * s), (-recline, 0, 0), grp)
        rounded_box(f'{name}_SideCush', bl_size(0.07, 0.10, 0.42 * s), 0.03, 3, [MATS['Interior_Leather']],
                    (x + sgn * 0.22 * s, y0 + 0.08, z + 0.04), (0.12, 0, 0), grp)
    return grp


seat('Seat_FL', 0.38, -0.40, 0.17)
seat('Seat_FR', -0.38, -0.40, 0.17)
seat('Seat_RL', 0.36, -1.12, 0.22, 0.78, 0.55)
seat('Seat_RR', -0.36, -1.12, 0.22, 0.78, 0.55)
interior_parts.append(rounded_box('Parcel_Shelf', bl_size(1.3, 0.02, 0.55), 0.01, 2, [MATS['Alcantara']], (0, 0.86, -1.62)))
interior_parts.append(rounded_box('Rear_Bulkhead', bl_size(1.4, 0.70, 0.03), 0.01, 2, [MATS['Interior_Dark']], (0, 0.50, -1.40)))
for p in interior_parts:
    PENDING.append((p, interior))

col_top = c2b((0.38, 0.62, 0.32))
wheel_c = (0.38, 0.70, 0.02)
sw = bpy.data.objects.new('SteeringWheel', None)
link(sw, root)
sw.location = c2b(wheel_c)
tilt = math.radians(24)
sw.rotation_euler = Euler((tilt, 0, 0))
bm = bmesh.new()
yoke = [(-0.165, 0.02), (-0.170, -0.06), (-0.150, -0.10), (-0.06, -0.115), (0.06, -0.115), (0.150, -0.10), (0.170, -0.06),
        (0.165, 0.02), (0.150, 0.075), (0.125, 0.085), (0.112, 0.05), (0.112, -0.035), (0.08, -0.06), (-0.08, -0.06),
        (-0.112, -0.035), (-0.112, 0.05), (-0.125, 0.085), (-0.150, 0.075)]
pts = catmull([(x, 0, y) for x, y in yoke], 4, closed=True)
front = [bm.verts.new((p.x, -0.018, p.z)) for p in pts]
back = [bm.verts.new((p.x, 0.018, p.z)) for p in pts]
bm.faces.new(front)
bm.faces.new(list(reversed(back)))
for i in range(len(pts)):
    j = (i + 1) % len(pts)
    bm.faces.new((front[i], back[i], back[j], front[j]))
bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.008, segments=3, affect='EDGES')
bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.055, radius2=0.05, depth=0.05,
                      matrix=Matrix.Translation((0, 0.03, -0.02)) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.022, radius2=0.022, depth=0.30,
                      matrix=Matrix.Translation((0, 0.18, -0.02)) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
yme = bpy.data.meshes.new('SteeringWheel_mesh')
bm.to_mesh(yme)
bm.free()
for p in yme.polygons:
    p.use_smooth = True
ym = obj('SteeringWheel_Yoke', yme, [MATS['Alcantara']])
link(ym, sw)
M_sw = Matrix.Translation(c2b(wheel_c)) @ Euler((tilt, 0, 0)).to_matrix().to_4x4()
ym.matrix_world = M_sw
for nm, x in (('Grip_L', 0.14), ('Grip_R', -0.14)):
    g = bpy.data.objects.new(nm, None)
    g.empty_display_size = 0.03
    link(g, sw)
    g.matrix_world = M_sw @ Matrix.Translation((x, 0, 0))


def display(name, center_car, w, h, tilt_deg, yaw_deg, mat, bezel=0.012):
    me = bpy.data.meshes.new(name)
    hw, hh = w / 2, h / 2
    V = [(-hw, 0, -hh), (hw, 0, -hh), (hw, 0, hh), (-hw, 0, hh)]
    me.from_pydata(V, [], [(0, 1, 2, 3)])
    uvl = me.uv_layers.new(name='UVMap')
    for li, uv in zip(me.polygons[0].loop_indices, ((1, 0), (0, 0), (0, 1), (1, 1))):
        uvl.data[li].uv = uv
    o = obj(name, me, [mat])
    link(o, root)
    o.location = c2b(center_car)
    o.rotation_euler = Euler((math.radians(-tilt_deg), 0, math.radians(yaw_deg)))
    bz = rounded_box(f'{name}_Bezel', (w + 2 * bezel, 0.012, h + 2 * bezel), 0.005, 2, [MATS['Trim']], center_car, parent=None)
    bz.rotation_euler = o.rotation_euler
    bz.location = o.location + (o.rotation_euler.to_matrix() @ Vector((0, 0.007, 0)))
    PENDING.append((bz, interior))
    return o


display('Screen', (0.0, 0.67, 0.25), 0.38, 0.2375, 30, -10, MATS['Screen'])
display('Cluster', (0.38, 0.815, 0.30), 0.17, 0.062, 35, 0, MATS['Cluster'], 0.008)

for side, sg in (('L', 1), ('R', -1)):
    dr = doors[side]
    a = rounded_box(f'DoorCard_{side}', bl_size(0.025, 0.26, 0.90), 0.010, 3, [MATS['Interior_Leather']], (sg * 0.79, 0.55, 0.25))
    b = rounded_box(f'DoorArm_{side}', bl_size(0.07, 0.035, 0.50), 0.012, 3, [MATS['Carbon']], (sg * 0.755, 0.56, 0.15))
    for o in (a, b):
        PENDING.append((o, dr))
    mr = bpy.data.meshes.new(f'Mirror_{side}')
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * 0.022, v.co.y * 0.055, v.co.z * 0.018))
    bm.to_mesh(mr)
    bm.free()
    for p in mr.polygons:
        p.use_smooth = True
    mo = obj(f'Mirror_{side}', mr, [MATS['Paint_Black']])
    mo['part'] = f'Mirror_{side}'
    mo['detach'] = True
    link(mo, dr)
    mo.location = c2b((sg * 0.872, 0.875, 0.70))

wing = bpy.data.objects.new('Wing', None)
link(wing, root)
wing.location = c2b((0, 1.10, -2.0))
wing['part'] = 'Wing'
wing['detach'] = True
foil = [(0.14, 0.0), (0.10, 0.018), (0.0, 0.028), (-0.10, 0.02), (-0.14, 0.006), (-0.10, -0.004), (0.0, -0.006), (0.10, -0.004)]
fpts = catmull([(z, y, 0) for z, y in foil], 4, closed=True)
bm = bmesh.new()
lv = [bm.verts.new((0.92, -p.x, p.y)) for p in fpts]
rv = [bm.verts.new((-0.92, -p.x, p.y)) for p in fpts]
bm.faces.new(lv)
bm.faces.new(list(reversed(rv)))
for i in range(len(fpts)):
    j = (i + 1) % len(fpts)
    bm.faces.new((lv[i], rv[i], rv[j], lv[j]))
for sx in (0.92, -0.92):
    plate_v = [bm.verts.new((sx, y, z)) for y, z in ((-0.17, -0.10), (0.16, -0.10), (0.16, 0.06), (-0.12, 0.08))]
    bm.faces.new(plate_v)
for sx in (0.45, -0.45):
    sv = [bm.verts.new((sx + dx, y, z)) for dx, y, z in ((0.006, 0.02, 0.0), (0.006, -0.06, -0.22), (0.006, 0.06, -0.22),
                                                          (-0.006, 0.02, 0.0), (-0.006, -0.06, -0.22), (-0.006, 0.06, -0.22))]
    bm.faces.new(sv[:3])
    bm.faces.new(sv[3:][::-1])
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new((sv[i], sv[3 + i], sv[3 + j], sv[j]))
wme = bpy.data.meshes.new('Wing_mesh')
bm.to_mesh(wme)
bm.free()
for p in wme.polygons:
    p.use_smooth = True
wo = obj('Wing_Body', wme, [MATS['Carbon']])
link(wo, wing)
wo.location = wing.location


def badge(name, pos_car, normal_car, w, h, mat, up_car=(0, 1, 0)):
    n = c2b(normal_car).normalized()
    up = c2b(up_car).normalized()
    right = up.cross(n).normalized()
    up = n.cross(right).normalized()
    me = bpy.data.meshes.new(name)
    hw, hh = w / 2, h / 2
    me.from_pydata([(-hw, -hh, 0), (hw, -hh, 0), (hw, hh, 0), (-hw, hh, 0)], [], [(0, 1, 2, 3)])
    uvl = me.uv_layers.new(name='UVMap')
    for li, uv in zip(me.polygons[0].loop_indices, ((0, 0), (1, 0), (1, 1), (0, 1))):
        uvl.data[li].uv = uv
    o = obj(name, me, [mat])
    link(o, root)
    M = Matrix((right, up, n)).transposed().to_4x4()
    M.translation = c2b(pos_car) + n * 0.003
    o.matrix_world = M
    return o


depsgraph = bpy.context.evaluated_depsgraph_get()


def ray_surface(origin_car, dir_car):
    hit, loc, nrm, idx, ob, mtx = scn.ray_cast(bpy.context.evaluated_depsgraph_get(), c2b(origin_car), c2b(dir_car).normalized())
    if not hit:
        return None, None
    return (loc.x, loc.z, -loc.y), (nrm.x, nrm.z, -nrm.y)


p, n = ray_surface((0, 0.505, 2.6), (0, 0, -1))
if p:
    badge('Badge_T', p, n, 0.085, 0.085, MATS['Badge'])
p, n = ray_surface((0, 0.775, -2.7), (0, 0, 1))
if p:
    badge('Badge_Wordmark', p, n, 0.46, 0.0575, MATS['Wordmark'], (0, 1, 0))

empty('Seat_Driver', (0.38, 0.27, -0.50), root, 'ARROWS', 0.1)
empty('Eye_Driver', (0.38, 1.0, -0.58), root, 'ARROWS', 0.1)
empty('COM', (0.0, 0.43, -0.06), root, 'SPHERE', 0.05)
empty('Lamp_Head_L', (0.78, 0.58, 2.02), root, 'SINGLE_ARROW', 0.1)
empty('Lamp_Head_R', (-0.78, 0.58, 2.02), root, 'SINGLE_ARROW', 0.1)
empty('Lamp_Tail', (0.0, 0.85, -2.21), root, 'SINGLE_ARROW', 0.1)
empty('Cam_Chase', (0.0, 1.6, -6.0), root, 'ARROWS', 0.1)

adopt_all()
for ob in list(scn.objects):
    if ob.type == 'MESH' and ob.data.uv_layers.get('UVMap') is None and not ob.data.uv_layers:
        bpy.ops.object.select_all(action='DESELECT')
        bpy.context.view_layer.objects.active = ob
        ob.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        try:
            bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003)
        except RuntimeError:
            pass
        bpy.ops.object.mode_set(mode='OBJECT')
        ob.select_set(False)

stats = {}
for ob in scn.objects:
    if ob.type == 'MESH':
        stats[ob.name] = sum(len(p.vertices) - 2 for p in ob.data.polygons)
print('TRIS TOTAL', sum(stats.values()))
print(json.dumps(dict(sorted(stats.items(), key=lambda kv: -kv[1])[:20])))

if OUT_BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=False, export_apply=True,
                          export_extras=True, export_yup=True, export_texcoords=True, export_normals=True,
                          export_materials='EXPORT', export_image_format='AUTO')
print('EXPORTED', OUT_GLB)
