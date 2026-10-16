"""Beauty renders of the assembled Roadster .blend from reference-like angles (run inside Blender)."""
import sys
import math
import os
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
OUT, HDRI = argv[0], argv[1]
ENGINE = argv[2] if len(argv) > 2 else 'EEVEE'
RES = (int(argv[3]), int(argv[4])) if len(argv) > 4 else (1280, 800)
ONLY = argv[5].split(',') if len(argv) > 5 else None
SUN_ROT = (math.radians(62), 0, math.radians(-35))

scn = bpy.context.scene
for o in scn.objects:
    if o.name.startswith('Wing'):
        o.hide_render = True
        for c in o.children_recursive:
            c.hide_render = True

world = bpy.data.worlds.new('W')
scn.world = world
world.use_nodes = True
nt = world.node_tree
env = nt.nodes.new('ShaderNodeTexEnvironment')
env.image = bpy.data.images.load(HDRI)
mp = nt.nodes.new('ShaderNodeMapping')
tc = nt.nodes.new('ShaderNodeTexCoord')
mp.inputs['Rotation'].default_value = (0, 0, math.radians(140))
nt.links.new(tc.outputs['Generated'], mp.inputs['Vector'])
nt.links.new(mp.outputs['Vector'], env.inputs['Vector'])
nt.links.new(env.outputs['Color'], nt.nodes['Background'].inputs['Color'])
nt.nodes['Background'].inputs['Strength'].default_value = 1.0

gm = bpy.data.materials.new('Ground')
gm.use_nodes = True
b = gm.node_tree.nodes['Principled BSDF']
b.inputs['Base Color'].default_value = (0.16, 0.16, 0.165, 1)
b.inputs['Roughness'].default_value = 0.55
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, 0))
g = bpy.context.active_object
g.data.materials.append(gm)

sun = bpy.data.lights.new('Sun', 'SUN')
sun.energy = 3.5
sun.angle = math.radians(1.2)
so = bpy.data.objects.new('Sun', sun)
so.rotation_euler = SUN_ROT
scn.collection.objects.link(so)

if ENGINE == 'CYCLES':
    scn.render.engine = 'CYCLES'
    scn.cycles.samples = int(os.environ.get("CYCLES_SAMPLES", "96"))
    scn.cycles.use_denoising = True
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        scn.cycles.device = 'GPU'
    except Exception:
        pass
else:
    scn.render.engine = 'BLENDER_EEVEE_NEXT'
    ee = scn.eevee
    ee.taa_render_samples = 64
    for attr, val in (('use_raytracing', True), ('use_shadows', True), ('use_gtao', True)):
        if hasattr(ee, attr):
            setattr(ee, attr, val)
    if hasattr(ee, 'ray_tracing_options'):
        ee.ray_tracing_options.resolution_scale = '1'
scn.view_settings.view_transform = 'AgX'
scn.view_settings.look = 'AgX - Punchy'
scn.render.resolution_x, scn.render.resolution_y = RES

cd = bpy.data.cameras.new('Cam')
cam = bpy.data.objects.new('Cam', cd)
scn.collection.objects.link(cam)
scn.camera = cam

eye = scn.objects.get('Eye_Driver')
VIEWS = {
    'hero': ((7.8, -9.2, 1.05), (0.1, -0.2, 0.55), 85),
    'ref1': ((4.2, -5.6, 0.75), (0.1, -0.3, 0.55), 55),
    'c9': ((2.3, -4.0, 2.3), (0.15, 0.4, 0.45), 26),
    'front': ((0.0, -8.5, 1.4), (0, 0, 0.55), 70),
    'ref3': ((-3.6, 6.2, 1.25), (0, 0.2, 0.55), 50),
    'rear': ((0.0, 6.8, 2.6), (0, 0.6, 0.55), 45),
    'side': ((-9.5, 0.0, 0.8), (0, 0, 0.55), 70),
    'top': ((3.5, -3.0, 6.5), (0, 0, 0.3), 35),
    'wheel': ((2.2, -2.9, 0.55), (0.85, -1.425, 0.36), 50),
    'tail': ((-1.1, 3.4, 0.55), (0, 2.1, 0.35), 40),
    'fpp': (None, None, 22),
    'door': ((-3.2, -0.2, 0.7), (-0.9, -0.1, 0.5), 40),
    'dot': ((0.9, -2.6, 1.25), (0.509, -1.731, 0.696), 60),
    'cabin': ((1.6, 0.9, 2.2), (0.2, -0.1, 0.55), 30),
}
for name in (ONLY or list(VIEWS)):
    pos, tgt, lens = VIEWS[name]
    if name == 'fpp':
        if eye is None:
            continue
        p = eye.matrix_world.translation
        cam.location = p
        d = Vector((0.0, -1.0, -0.18))
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        cd.lens = 16
        cd.clip_start = 0.02
    else:
        cam.location = pos
        cam.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
        cd.lens = lens
        cd.clip_start = 0.1
    scn.render.filepath = f'{OUT}/{name}.png'
    bpy.ops.render.render(write_still=True)
