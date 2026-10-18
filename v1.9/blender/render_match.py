"""Renders the body npz through cameras fitted to reference photos, for overlay comparison (run inside Blender)."""
import sys
import json
import math
import numpy as np
import bpy
from mathutils import Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
NPZ, CAMS, OUT, HDRI = argv[0], argv[1], argv[2], argv[3]
WB = float(argv[4]) if len(argv) > 4 else 2.85

bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene


def car_to_bl(v):
    return np.stack([v[:, 0], -v[:, 2], v[:, 1]], 1)


def load_mesh(path, name):
    d = np.load(path)
    V = car_to_bl(d['v'])
    N = car_to_bl(d['n'])
    F = d['f']
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(V))
    me.vertices.foreach_set('co', V.ravel())
    me.loops.add(len(F) * 3)
    me.loops.foreach_set('vertex_index', F.ravel())
    me.polygons.add(len(F))
    me.polygons.foreach_set('loop_start', np.arange(0, len(F) * 3, 3))
    me.polygons.foreach_set('loop_total', np.full(len(F), 3))
    me.update()
    me.polygons.foreach_set('use_smooth', np.ones(len(F), dtype=bool))
    if 'm' in d:
        me.polygons.foreach_set('material_index', d['m'].astype(np.int32))
    me.normals_split_custom_set_from_vertices([tuple(n) for n in N])
    ob = bpy.data.objects.new(name, me)
    scn.collection.objects.link(ob)
    return ob


def mat(name, color, metallic=0.0, rough=0.5, coat=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = rough
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Coat Roughness'].default_value = 0.02
    return m


body = load_mesh(NPZ, 'Body')
for m in (mat('Paint', (0.46, 0.008, 0.012), 0.55, 0.16, 1.0), mat('Glass', (0.01, 0.012, 0.014), 0.0, 0.04, 1.0), mat('Trim', (0.015, 0.015, 0.015), 0.0, 0.35), mat('Liner', (0.02, 0.02, 0.02), 0.0, 0.9)):
    body.data.materials.append(m)
tire = mat('Tire', (0.02, 0.02, 0.02), rough=0.8)
rim = mat('Rim', (0.08, 0.08, 0.085), 0.9, 0.35)
for (z, r, w, x) in [(WB / 2, 0.347, 0.265, 0.85), (-WB / 2, 0.364, 0.325, 0.86)]:
    for s in (1, -1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=r, depth=w, location=(s * x, -z, r), rotation=(0, math.pi / 2, 0))
        bpy.context.active_object.data.materials.append(tire)
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=r * 0.73, depth=w + 0.01, location=(s * x, -z, r), rotation=(0, math.pi / 2, 0))
        bpy.context.active_object.data.materials.append(rim)

world = bpy.data.worlds.new('W')
scn.world = world
world.use_nodes = True
nt = world.node_tree
env = nt.nodes.new('ShaderNodeTexEnvironment')
env.image = bpy.data.images.load(HDRI)
nt.links.new(env.outputs['Color'], nt.nodes['Background'].inputs['Color'])

scn.render.engine = 'BLENDER_EEVEE_NEXT'
scn.eevee.taa_render_samples = 16
scn.view_settings.view_transform = 'AgX'
scn.render.film_transparent = True

cams = json.load(open(CAMS))
cd = bpy.data.cameras.new('Cam')
cam = bpy.data.objects.new('Cam', cd)
scn.collection.objects.link(cam)
scn.camera = cam


def rot(yaw, pitch, roll):
    cy, sy = math.cos(yaw), math.sin(yaw)
    cp, sp = math.cos(pitch), math.sin(pitch)
    cr, sr = math.cos(roll), math.sin(roll)
    fwd = np.array([cp * cy, sp, cp * sy])
    right = np.cross(fwd, [0, 1.0, 0])
    right /= np.linalg.norm(right)
    up = np.cross(right, fwd)
    return cr * right + sr * up, -sr * right + cr * up, fwd


def c2b(v):
    return np.array([v[0], -v[2], v[1]])


for name, c in cams.items():
    p = c['cam']
    r, u, f = rot(p[3], p[4], p[5])
    R = np.stack([c2b(r), c2b(u), -c2b(f)], 1)
    M = Matrix(R.tolist()).to_4x4()
    M.translation = tuple(c2b(np.array(p[:3])))
    cam.matrix_world = M
    W, H = c['size']
    cd.sensor_fit = 'HORIZONTAL'
    cd.sensor_width = 36
    cd.lens = c['f'] / W * 36
    scn.render.resolution_x, scn.render.resolution_y = W, H
    scn.render.filepath = f'{OUT}/match_{name}.png'
    bpy.ops.render.render(write_still=True)
