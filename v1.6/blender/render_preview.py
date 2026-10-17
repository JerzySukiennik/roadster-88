"""Renders the preview body npz from reference-like camera angles (run inside Blender)."""
import sys
import math
import numpy as np
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
NPZ, OUT = argv[0], argv[1]
HDRI = argv[2] if len(argv) > 2 else None
ENGINE = argv[3] if len(argv) > 3 else 'EEVEE'
RES = (int(argv[4]), int(argv[5])) if len(argv) > 5 else (960, 600)

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


def principled(name, color, metallic=0.0, rough=0.5, coat=0.0, coat_rough=0.03, emit=None, alpha=1.0, transmission=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = rough
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Coat Roughness'].default_value = coat_rough
    b.inputs['Transmission Weight'].default_value = transmission
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = 4.0
    return m


paint = principled('Paint', (0.46, 0.008, 0.012), metallic=0.55, rough=0.16, coat=1.0, coat_rough=0.004)
rubber = principled('Tire', (0.02, 0.02, 0.02), rough=0.8)
rim = principled('Rim', (0.06, 0.06, 0.065), metallic=0.9, rough=0.35)
ground_m = principled('Ground', (0.32, 0.32, 0.32), rough=0.7)

body = load_mesh(NPZ, 'Body')
for m in (paint, principled('Glass', (0.30, 0.32, 0.33), rough=0.0, transmission=0.92), principled('Trim', (0.015, 0.015, 0.015), rough=0.35), principled('Liner', (0.02, 0.02, 0.02), rough=0.9)):
    body.data.materials.append(m)

for (z, r, w, x) in [(1.425, 0.347, 0.265, 0.85), (-1.425, 0.364, 0.325, 0.86)]:
    for s in (1, -1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=r, depth=w, location=(s * x, -z, r), rotation=(0, math.pi / 2, 0))
        t = bpy.context.active_object
        t.data.materials.append(rubber)
        bpy.ops.object.shade_smooth()
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=r * 0.72, depth=w + 0.01, location=(s * x, -z, r), rotation=(0, math.pi / 2, 0))
        bpy.context.active_object.data.materials.append(rim)

bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
bpy.context.active_object.data.materials.append(ground_m)

world = bpy.data.worlds.new('W')
scn.world = world
world.use_nodes = True
nt = world.node_tree
bg = nt.nodes['Background']
if HDRI:
    env = nt.nodes.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(HDRI)
    nt.links.new(env.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 1.0
else:
    bg.inputs['Color'].default_value = (0.8, 0.8, 0.85, 1)

sun = bpy.data.lights.new('Sun', 'SUN')
sun.energy = 2.5
sun.angle = 0.05
so = bpy.data.objects.new('Sun', sun)
so.rotation_euler = (math.radians(50), 0, math.radians(35))
scn.collection.objects.link(so)

if ENGINE == 'CYCLES':
    scn.render.engine = 'CYCLES'
    scn.cycles.samples = 64
    scn.cycles.use_denoising = True
else:
    scn.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
    ee = scn.eevee
    for attr, val in (('use_raytracing', True), ('taa_render_samples', 32), ('use_shadows', True)):
        if hasattr(ee, attr):
            setattr(ee, attr, val)
scn.view_settings.view_transform = 'AgX'
scn.render.resolution_x, scn.render.resolution_y = RES
scn.render.film_transparent = False

cam_data = bpy.data.cameras.new('Cam')
cam = bpy.data.objects.new('Cam', cam_data)
scn.collection.objects.link(cam)
scn.camera = cam

VIEWS = {
    'side_r': ((-9.0, 0.0, 0.7), (0, 0, 0.55), 85),
    'ref1': ((4.2, -5.6, 0.75), (0.1, -0.3, 0.55), 55),
    'c9': ((2.3, -4.0, 2.3), (0.15, 0.4, 0.45), 26),
    'c4': ((0.0, -7.2, 2.3), (0, 0, 0.55), 55),
    'ref3': ((-3.3, 5.6, 1.15), (0, 0.2, 0.6), 50),
    'c8': ((0.0, 5.6, 2.5), (0, 0.6, 0.55), 40),
    'top': ((0.0, 0.0, 12.0), (0, 0, 0), 60),
}
only = argv[6].split(',') if len(argv) > 6 else list(VIEWS)
for name in only:
    pos, tgt, lens = VIEWS[name]
    cam.location = pos
    d = Vector(tgt) - Vector(pos)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    cam_data.lens = lens
    if name in ('top', 'side_r'):
        cam_data.type = 'ORTHO'
        cam_data.ortho_scale = 5.0
    else:
        cam_data.type = 'PERSP'
    scn.render.filepath = f'{OUT}/{name}.png'
    bpy.ops.render.render(write_still=True)
