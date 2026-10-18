# TestPlate: the Part 1 proving ground (2 km straight, crash zone, jump zone, flight towers, stunt course, light props, distant ring of hills).
class_name TestPlate
extends Node3D

const LAYER_WORLD := 1
const LAYER_PROPS := 4

var mat_concrete: ShaderMaterial
var mat_struct: ShaderMaterial
var mat_struct_dark: ShaderMaterial
var mat_steel: ShaderMaterial
var mat_paint_white: StandardMaterial3D
var mat_paint_yellow: StandardMaterial3D
var mat_sand: ShaderMaterial
var mats_container: Array = []
var props: Array[RigidBody3D] = []
var pads: Dictionary = {}
var spawn := Transform3D(Basis.IDENTITY, Vector3(0, 0.05, 0))
var quality: int = 2
var label_font: Font

var batches: Dictionary = {}

func build(q: int) -> void:
	quality = q
	name = "TestPlate"
	_materials()
	_ground()
	_straight()
	_crash_zone()
	_jump_zone()
	_flight_zone()
	_stunt_zone()
	_props()
	_signs()
	_hills()
	_flush_batches()

func _batch(mesh: Mesh, mat: Material, xf: Transform3D) -> void:
	if not batches.has(mat):
		var st := SurfaceTool.new()
		st.begin(Mesh.PRIMITIVE_TRIANGLES)
		batches[mat] = st
	var stt: SurfaceTool = batches[mat]
	for si in mesh.get_surface_count():
		stt.append_from(mesh, si, xf)

func _flush_batches() -> void:
	for lm in line_batches.keys():
		var e: Dictionary = line_batches[lm]
		(e["mi"] as MeshInstance3D).mesh = (e["st"] as SurfaceTool).commit()
	line_batches.clear()
	for mat in batches.keys():
		var st: SurfaceTool = batches[mat]
		var mi := MeshInstance3D.new()
		mi.mesh = st.commit()
		mi.material_override = mat
		add_child(mi)
	batches.clear()

var noise_tex: NoiseTexture2D

func _make_noise() -> NoiseTexture2D:
	var fn := FastNoiseLite.new()
	fn.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	fn.frequency = 0.012
	fn.fractal_type = FastNoiseLite.FRACTAL_FBM
	fn.fractal_octaves = 6
	var nt := NoiseTexture2D.new()
	nt.width = 512
	nt.height = 512
	nt.seamless = true
	nt.seamless_blend_skirt = 0.2
	nt.generate_mipmaps = true
	nt.normalize = true
	nt.noise = fn
	return nt

func _materials() -> void:
	noise_tex = _make_noise()
	var sf := SystemFont.new()
	sf.font_names = PackedStringArray(["SF Pro Display", "Helvetica Neue", "Arial"])
	sf.font_weight = 700
	label_font = sf
	mat_concrete = ShaderMaterial.new()
	mat_concrete.shader = load("res://src/world/concrete.gdshader")
	mat_concrete.set_shader_parameter("zone_tex", _zone_texture())
	mat_concrete.set_shader_parameter("noise_tex", noise_tex)
	mat_struct = _smat(Color(0.66, 0.65, 0.62), 0.86, 0.0, 1.5)
	mat_struct_dark = _smat(Color(0.36, 0.36, 0.37), 0.8, 0.0, 2.0)
	mat_steel = _smat(Color(0.5, 0.51, 0.53), 0.45, 0.85, 3.0)
	mat_paint_white = StandardMaterial3D.new()
	mat_paint_white.albedo_color = Color(0.86, 0.86, 0.84)
	mat_paint_white.roughness = 0.6
	mat_paint_yellow = StandardMaterial3D.new()
	mat_paint_yellow.albedo_color = Color(0.92, 0.68, 0.06)
	mat_paint_yellow.roughness = 0.6
	for c in [Color(0.55, 0.16, 0.1), Color(0.1, 0.25, 0.45), Color(0.82, 0.82, 0.8), Color(0.2, 0.36, 0.22), Color(0.75, 0.45, 0.1)]:
		var m := _smat(c, 0.55, 0.3, 2.44)
		m.set_shader_parameter("corrugate", 1.0)
		mats_container.append(m)
	mat_sand = ShaderMaterial.new()
	mat_sand.shader = load("res://src/world/concrete.gdshader")
	mat_sand.set_shader_parameter("base_color", Color(0.62, 0.53, 0.42))
	mat_sand.set_shader_parameter("slab", 10000.0)
	mat_sand.set_shader_parameter("grid_strength", 0.0)
	mat_sand.set_shader_parameter("tile_scale", 0.25)
	mat_sand.set_shader_parameter("noise_tex", noise_tex)

func _smat(c: Color, rough: float, metal: float, panel: float) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = load("res://src/world/structure.gdshader")
	m.set_shader_parameter("base_color", c)
	m.set_shader_parameter("roughness", rough)
	m.set_shader_parameter("metallic", metal)
	m.set_shader_parameter("panel", panel)
	m.set_shader_parameter("noise_tex", noise_tex)
	return m

func _zone_texture() -> ImageTexture:
	var w := 480
	var h := 600
	var img := Image.create(w, h, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	var rect := Rect2(-1200, -600, 2400, 3000)
	var zones := [
		[Rect2(-230, -40, 200, 360), Color(0.62, 0.2, 0.17, 0.32)],
		[Rect2(30, -40, 250, 420), Color(0.17, 0.32, 0.55, 0.3)],
		[Rect2(-470, -130, 220, 450), Color(0.85, 0.6, 0.12, 0.28)],
		[Rect2(40, 480, 420, 640), Color(0.2, 0.45, 0.25, 0.28)],
		[Rect2(-14, -150, 28, 2200), Color(0.3, 0.3, 0.31, 0.45)],
	]
	for z in zones:
		var r: Rect2 = z[0]
		var c: Color = z[1]
		var x0 := int((r.position.x - rect.position.x) / rect.size.x * w)
		var y0 := int((r.position.y - rect.position.y) / rect.size.y * h)
		var x1 := int((r.end.x - rect.position.x) / rect.size.x * w)
		var y1 := int((r.end.y - rect.position.y) / rect.size.y * h)
		for y in range(maxi(y0, 0), mini(y1, h)):
			for x in range(maxi(x0, 0), mini(x1, w)):
				img.set_pixel(x, y, c)
	return ImageTexture.create_from_image(img)

func _static(mesh: Mesh, mat: Material, xf: Transform3D, shape: Shape3D, shape_xf := Transform3D.IDENTITY, layer := LAYER_WORLD) -> StaticBody3D:
	var sb := StaticBody3D.new()
	sb.collision_layer = layer
	sb.collision_mask = 0
	sb.transform = xf
	var pm := PhysicsMaterial.new()
	pm.friction = 0.9
	sb.physics_material_override = pm
	if mesh:
		if mesh is PlaneMesh or (mat is ShaderMaterial and (mat as ShaderMaterial).shader == mat_concrete.shader and mat == mat_concrete):
			var mi := MeshInstance3D.new()
			mi.mesh = mesh
			mi.material_override = mat
			sb.add_child(mi)
		else:
			_batch(mesh, mat, xf)
	if shape:
		var cs := CollisionShape3D.new()
		cs.shape = shape
		cs.transform = shape_xf
		sb.add_child(cs)
	add_child(sb)
	return sb

func box(pos: Vector3, size: Vector3, mat: Material, rot_y := 0.0, solid := true) -> StaticBody3D:
	var bm := BoxMesh.new()
	bm.size = size
	var shape: Shape3D = null
	if solid:
		var bs := BoxShape3D.new()
		bs.size = size
		shape = bs
	return _static(bm, mat, Transform3D(Basis(Vector3.UP, rot_y), pos), shape)

func cylinder(pos: Vector3, r: float, h: float, mat: Material) -> StaticBody3D:
	var cm := CylinderMesh.new()
	cm.top_radius = r
	cm.bottom_radius = r
	cm.height = h
	cm.radial_segments = 24
	var cs := CylinderShape3D.new()
	cs.radius = r
	cs.height = h
	return _static(cm, mat, Transform3D(Basis.IDENTITY, pos), cs)

func _ground() -> void:
	var pm := PlaneMesh.new()
	pm.size = Vector2(2400, 3000)
	pm.subdivide_width = 24
	pm.subdivide_depth = 30
	var bs := BoxShape3D.new()
	bs.size = Vector3(12000, 2, 12000)
	_static(pm, mat_concrete, Transform3D(Basis.IDENTITY, Vector3(0, 0, 900)), bs, Transform3D(Basis.IDENTITY, Vector3(0, -1, -900)))
	var outer := _ring_mesh(Vector2(0, 900), 1200, 1500, 6000, 64)
	var mi := MeshInstance3D.new()
	mi.mesh = outer
	mi.material_override = mat_sand
	add_child(mi)

func _ring_mesh(c: Vector2, hw: float, hh: float, r_out: float, seg: int) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var inner := []
	for k in seg:
		var a := float(k) / seg * TAU
		var d := Vector2(cos(a), sin(a))
		var tx := hw / maxf(absf(d.x), 1e-4)
		var ty := hh / maxf(absf(d.y), 1e-4)
		var tt := minf(tx, ty)
		inner.append(c + d * tt)
	for k in seg:
		var a0 := float(k) / seg * TAU
		var a1 := float(k + 1) / seg * TAU
		var i0: Vector2 = inner[k]
		var i1: Vector2 = inner[(k + 1) % seg]
		var o0 := c + Vector2(cos(a0), sin(a0)) * r_out
		var o1 := c + Vector2(cos(a1), sin(a1)) * r_out
		for p in [i0, o1, o0, i0, i1, o1]:
			st.set_normal(Vector3.UP)
			st.add_vertex(Vector3(p.x, -0.02, p.y))
	return st.commit()

var line_batches: Dictionary = {}

func _line(a: Vector3, b: Vector3, w: float, mat: Material) -> void:
	var d := b - a
	var l := d.length()
	var mid := (a + b) * 0.5
	var qm := QuadMesh.new()
	qm.size = Vector2(w, l)
	qm.orientation = PlaneMesh.FACE_Y
	if not line_batches.has(mat):
		var st := SurfaceTool.new()
		st.begin(Mesh.PRIMITIVE_TRIANGLES)
		line_batches[mat] = st
		var mi := MeshInstance3D.new()
		mi.material_override = mat
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.name = "Lines"
		add_child(mi)
		line_batches[mat] = {"st": st, "mi": mi}
	var e: Dictionary = line_batches[mat]
	(e["st"] as SurfaceTool).append_from(qm, 0, Transform3D(Basis(Vector3.UP, atan2(d.x, d.z)), mid + Vector3(0, 0.012, 0)))

func _straight() -> void:
	var lm := StandardMaterial3D.new()
	lm.albedo_color = Color(0.88, 0.88, 0.86)
	lm.roughness = 0.55
	var ym := StandardMaterial3D.new()
	ym.albedo_color = Color(0.9, 0.66, 0.08)
	ym.roughness = 0.55
	_line(Vector3(-12, 0, -150), Vector3(-12, 0, 2050), 0.25, lm)
	_line(Vector3(12, 0, -150), Vector3(12, 0, 2050), 0.25, lm)
	var z := -150.0
	while z < 2050.0:
		_line(Vector3(0, 0, z), Vector3(0, 0, z + 6), 0.18, lm)
		z += 15.0
	for k in 21:
		var zz := float(k) * 100.0
		_line(Vector3(-12, 0, zz), Vector3(12, 0, zz), 0.4 if k % 5 == 0 else 0.15, ym if k % 5 == 0 else lm)
		var lab := Label3D.new()
		lab.text = "%d" % (k * 100)
		lab.font = label_font
		lab.font_size = 256
		lab.pixel_size = 0.012
		lab.modulate = Color(0.92, 0.92, 0.9, 0.85)
		lab.outline_size = 0
		lab.shaded = true
		lab.transform = Transform3D(Basis(Vector3.RIGHT, -PI * 0.5) * Basis(Vector3.FORWARD, PI), Vector3(-7.5, 0.015, zz + 3.0))
		add_child(lab)
	var gate_mat := mat_steel
	for zz in [0.0, 1000.0, 2000.0]:
		box(Vector3(-15, 3.5, zz), Vector3(0.5, 7, 0.5), gate_mat)
		box(Vector3(15, 3.5, zz), Vector3(0.5, 7, 0.5), gate_mat)
		box(Vector3(0, 7.2, zz), Vector3(30.5, 0.6, 0.6), gate_mat, 0.0, false)
	box(Vector3(0, 1.0, 2085), Vector3(40, 2.0, 1.0), mat_struct)
	for k in 8:
		box(Vector3(-10 + k * 2.86, 0.4, 2070), Vector3(1.6, 0.8, 0.6), mat_struct_dark)

func _crash_zone() -> void:
	box(Vector3(-130, 2.0, 260), Vector3(36, 4.0, 1.2), mat_struct)
	box(Vector3(-130, 0.6, 258.8), Vector3(36, 1.2, 0.08), mat_paint_yellow, 0.0, false)
	for k in 10:
		box(Vector3(-200 + k * 3.2, 0.42, 160), Vector3(3.0, 0.84, 0.6), mat_struct)
	for k in 5:
		cylinder(Vector3(-90 - k * 9.0, 2.0, 120 + k * 22.0), 0.35 + k * 0.08, 4.0, mat_struct_dark)
	for k in 6:
		cylinder(Vector3(-60, 3.0, 40 + k * 18.0), 0.11, 6.0, mat_steel)
		box(Vector3(-60, 6.1, 40 + k * 18.0 + 0.6), Vector3(0.2, 0.15, 1.4), mat_steel, 0.0, false)
	var cpos := [[-170, 1.3, 210, 0.0], [-163, 1.3, 210, 0.0], [-166.5, 3.9, 210, 0.0], [-200, 1.3, 230, 0.3], [-120, 1.3, 190, PI * 0.5], [-110, 1.3, 200, PI * 0.5]]
	var i := 0
	for p in cpos:
		var bm := BoxMesh.new()
		bm.size = Vector3(2.44, 2.59, 6.06)
		var bs := BoxShape3D.new()
		bs.size = bm.size
		_static(bm, mats_container[i % mats_container.size()], Transform3D(Basis(Vector3.UP, p[3]), Vector3(p[0], p[1], p[2])), bs)
		i += 1
	box(Vector3(-40, 1.5, 300), Vector3(12, 3.0, 12), mat_struct)

func _wedge(pos: Vector3, rot_y: float, length: float, width: float, height: float, curve := true, mat: Material = null) -> StaticBody3D:
	var n := 18
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var prof := []
	for k in n + 1:
		var u := float(k) / n
		var y := height * (u * u if curve else u)
		prof.append(Vector2(u * length, y))
	var faces := PackedVector3Array()
	var hw := width * 0.5
	for k in n:
		var a: Vector2 = prof[k]
		var b: Vector2 = prof[k + 1]
		var p0 := Vector3(-hw, a.y, a.x)
		var p1 := Vector3(hw, a.y, a.x)
		var p2 := Vector3(hw, b.y, b.x)
		var p3 := Vector3(-hw, b.y, b.x)
		for q in [p0, p2, p1, p0, p3, p2]:
			faces.append(q)
		for side in [-1.0, 1.0]:
			var s0 := Vector3(side * hw, 0, a.x)
			var s1 := Vector3(side * hw, a.y, a.x)
			var s2 := Vector3(side * hw, b.y, b.x)
			var s3 := Vector3(side * hw, 0, b.x)
			if side > 0:
				for q in [s0, s1, s2, s0, s2, s3]:
					faces.append(q)
			else:
				for q in [s0, s2, s1, s0, s3, s2]:
					faces.append(q)
	var e0 := Vector3(-hw, 0, length)
	var e1 := Vector3(hw, 0, length)
	var e2 := Vector3(hw, height, length)
	var e3 := Vector3(-hw, height, length)
	for q in [e0, e1, e2, e0, e2, e3]:
		faces.append(q)
	for k in range(0, faces.size(), 3):
		var a3 := faces[k]
		var b3 := faces[k + 1]
		var c3 := faces[k + 2]
		var nn := (c3 - a3).cross(b3 - a3).normalized()
		for q in [a3, b3, c3]:
			st.set_normal(nn)
			st.add_vertex(q)
	var mesh := st.commit()
	var shape := ConcavePolygonShape3D.new()
	shape.set_faces(faces)
	return _static(mesh, mat if mat else mat_struct, Transform3D(Basis(Vector3.UP, rot_y), pos), shape)

func _jump_zone() -> void:
	_wedge(Vector3(70, 0, 40), 0.0, 10, 6, 1.0)
	_wedge(Vector3(90, 0, 40), 0.0, 16, 7, 2.5)
	_wedge(Vector3(112, 0, 40), 0.0, 22, 8, 5.0)
	_wedge(Vector3(140, 0, 110), 0.0, 30, 14, 4.0, false)
	box(Vector3(140, 2.0, 175), Vector3(14, 4.0, 70), mat_struct)
	box(Vector3(140, 2.0, 270), Vector3(14, 4.0, 60), mat_struct)
	_wedge(Vector3(140, 0, 330), PI, 30, 14, 4.0, false)
	box(Vector3(140, 4.02, 209.5), Vector3(14, 0.04, 1.0), mat_paint_yellow, 0.0, false)
	box(Vector3(140, 4.02, 240.5), Vector3(14, 0.04, 1.0), mat_paint_yellow, 0.0, false)
	box(Vector3(200, 3.0, 200), Vector3(16, 6.0, 40), mat_struct)
	_wedge(Vector3(200, 0, 140), 0.0, 40, 16, 6.0, false)
	box(Vector3(200, 3.0, 290), Vector3(16, 6.0, 40), mat_struct)
	_wedge(Vector3(200, 0, 350), PI, 40, 16, 6.0, false)

func _tower(pos: Vector3, height: float, size: float) -> void:
	var leg := maxf(0.8, height * 0.012)
	var off := size * 0.5 - leg
	for sx in [-1.0, 1.0]:
		for sz in [-1.0, 1.0]:
			box(pos + Vector3(sx * off, height * 0.5, sz * off), Vector3(leg, height, leg), mat_struct_dark)
	var lvl := 12.0
	var y := lvl
	while y < height - 2.0:
		for k in 4:
			var rot := float(k) * PI * 0.5
			var dir := Vector3(sin(rot), 0, cos(rot))
			box(pos + dir * off + Vector3(0, y, 0), Vector3(size - leg * 2.0, 0.35, 0.35) if k % 2 == 1 else Vector3(0.35, 0.35, size - leg * 2.0), mat_steel, 0.0, false)
		y += lvl
	box(pos + Vector3(0, height - 0.4, 0), Vector3(size, 0.8, size), mat_struct)
	var hm := StandardMaterial3D.new()
	hm.albedo_color = Color(0.9, 0.9, 0.88)
	hm.roughness = 0.6
	box(pos + Vector3(0, height + 0.012, 0), Vector3(size * 0.8, 0.02, 0.6), mat_paint_yellow, 0.0, false)
	box(pos + Vector3(-size * 0.18, height + 0.015, 0), Vector3(0.7, 0.02, size * 0.45), hm, 0.0, false)
	box(pos + Vector3(size * 0.18, height + 0.015, 0), Vector3(0.7, 0.02, size * 0.45), hm, 0.0, false)
	box(pos + Vector3(0, height + 0.015, 0), Vector3(size * 0.36, 0.02, 0.6), hm, 0.0, false)
	var lm := StandardMaterial3D.new()
	lm.albedo_color = Color(1, 0.7, 0.3)
	lm.emission_enabled = true
	lm.emission = Color(1.0, 0.55, 0.15)
	lm.emission_energy_multiplier = 3.0
	for sx in [-1.0, 1.0]:
		for sz in [-1.0, 1.0]:
			box(pos + Vector3(sx * (size * 0.5 - 0.3), height + 0.12, sz * (size * 0.5 - 0.3)), Vector3(0.25, 0.22, 0.25), lm, 0.0, false)
	var lab := Label3D.new()
	lab.text = "%d m" % int(height)
	lab.font = label_font
	lab.font_size = 200
	lab.pixel_size = 0.02
	lab.modulate = Color(0.1, 0.1, 0.1)
	lab.shaded = true
	lab.transform = Transform3D(Basis.IDENTITY, pos + Vector3(0, height - 0.4, size * 0.5 + 0.02))
	add_child(lab)
	pads[int(height)] = pos + Vector3(0, height, 0)

func _flight_zone() -> void:
	_tower(Vector3(-300, 0, -60), 10.0, 16.0)
	_tower(Vector3(-340, 0, 40), 25.0, 16.0)
	_tower(Vector3(-400, 0, 140), 50.0, 16.0)
	_tower(Vector3(-430, 0, 260), 100.0, 18.0)

func _grid_surface(rows: Array, mat: Material) -> StaticBody3D:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var faces := PackedVector3Array()
	for i in rows.size() - 1:
		var r0: Array = rows[i]
		var r1: Array = rows[i + 1]
		for j in r0.size() - 1:
			var a: Vector3 = r0[j]
			var b: Vector3 = r0[j + 1]
			var c: Vector3 = r1[j + 1]
			var d: Vector3 = r1[j]
			for q in [a, c, b, a, d, c]:
				faces.append(q)
	for k in range(0, faces.size(), 3):
		var a3 := faces[k]
		var b3 := faces[k + 1]
		var c3 := faces[k + 2]
		var nn := (c3 - a3).cross(b3 - a3).normalized()
		for q in [a3, b3, c3]:
			st.set_normal(nn)
			st.add_vertex(q)
	st.generate_normals()
	var shape := ConcavePolygonShape3D.new()
	shape.set_faces(faces)
	shape.backface_collision = true
	var sb := _static(st.commit(), mat, Transform3D.IDENTITY, shape)
	return sb

func _stunt_zone() -> void:
	var r := 9.0
	var w := 6.0
	var c := Vector3(150, r, 700)
	var rows := []
	var n := 96
	for k in n + 1:
		var u := float(k) / n
		var a := u * TAU
		var shift := u * (w + 1.5)
		var p := Vector3(c.x + shift, c.y - r * cos(a), c.z + r * sin(a))
		var inward := Vector3(0, cos(a), -sin(a))
		var side := Vector3(1, 0, 0)
		rows.append([p - side * w * 0.5, p + side * w * 0.5])
	var rows_t := []
	for k in rows.size():
		rows_t.append([rows[k][1], rows[k][0]])
	_grid_surface(rows_t, mat_struct)
	_line(Vector3(150, 0, 600), Vector3(150, 0, 690), 0.3, mat_paint_yellow)
	var cb := Vector3(300, 0, 900)
	var rad := 45.0
	var bank := deg_to_rad(30.0)
	var bw := 14.0
	var brows := []
	var m := 64
	for k in m + 1:
		var u := float(k) / m
		var a := lerpf(-PI * 0.5, PI * 0.5, u)
		var ramp := smoothstep(0.0, 0.18, u) * smoothstep(1.0, 0.82, u)
		var b := bank * ramp
		var dir := Vector3(cos(a), 0, sin(a))
		var inner := cb + dir * (rad - bw * 0.5)
		var outer := cb + dir * (rad + bw * 0.5) + Vector3(0, bw * tan(b), 0)
		brows.append([outer, inner])
	_grid_surface(brows, mat_struct)
	for k in m:
		var u := (float(k) + 0.5) / m
		var a := lerpf(-PI * 0.5, PI * 0.5, u)
		var ramp := smoothstep(0.0, 0.18, u) * smoothstep(1.0, 0.82, u)
		var h := bw * tan(bank * ramp)
		if h > 0.3:
			var dir := Vector3(cos(a), 0, sin(a))
			var p := cb + dir * (rad + bw * 0.5 + 0.25)
			box(p + Vector3(0, h * 0.5, 0), Vector3(0.5, h, rad * PI / m + 0.1), mat_struct_dark, atan2(dir.x, dir.z) + PI * 0.5, false)
	var hp := Vector3(380, 0, 560)
	var hr := 6.0
	var hrows := []
	var len_h := 70.0
	var cs := 40
	var cross := []
	for k in cs + 1:
		var u := float(k) / cs
		var x := lerpf(-1.0, 1.0, u)
		var px := 0.0
		var py := 0.0
		var flat := 2.0
		if absf(x) < 0.15:
			px = x / 0.15 * flat
			py = 0.0
		else:
			var s := signf(x)
			var t2 := (absf(x) - 0.15) / 0.85
			var ang := t2 * PI * 0.5
			px = s * (flat + hr * sin(ang))
			py = hr * (1.0 - cos(ang))
		cross.append(Vector2(px, py))
	for k in 2:
		var z := hp.z + float(k) * len_h
		var row := []
		for p in cross:
			row.append(Vector3(hp.x + p.x, p.y, z))
		hrows.append(row)
	_grid_surface(hrows, mat_struct)
	for side in [-1.0, 1.0]:
		box(Vector3(hp.x + side * (2.0 + hr + 0.6), hr * 0.5, hp.z + len_h * 0.5), Vector3(1.2, hr, len_h), mat_struct_dark)
	for k in 14:
		_cone(Vector3(100 + (2.0 if k % 2 == 0 else -2.0) * 0.0, 0, 520 + k * 14.0))

func _cone(pos: Vector3) -> void:
	var rb := RigidBody3D.new()
	rb.mass = 3.0
	rb.collision_layer = LAYER_PROPS
	rb.collision_mask = LAYER_WORLD | LAYER_PROPS | 2 | 8
	rb.position = pos + Vector3(0, 0.36, 0)
	var cm := CylinderMesh.new()
	cm.top_radius = 0.03
	cm.bottom_radius = 0.17
	cm.height = 0.72
	cm.radial_segments = 16
	var mi := MeshInstance3D.new()
	mi.mesh = cm
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(0.95, 0.32, 0.04)
	m.roughness = 0.55
	mi.material_override = m
	rb.add_child(mi)
	var base := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.42, 0.04, 0.42)
	base.mesh = bm
	base.position = Vector3(0, -0.34, 0)
	var m2 := StandardMaterial3D.new()
	m2.albedo_color = Color(0.05, 0.05, 0.05)
	base.material_override = m2
	rb.add_child(base)
	var cs := CollisionShape3D.new()
	var sh := CylinderShape3D.new()
	sh.radius = 0.16
	sh.height = 0.72
	cs.shape = sh
	rb.add_child(cs)
	rb.can_sleep = true
	rb.sleeping = true
	add_child(rb)
	props.append(rb)

func _barrel(pos: Vector3, color: Color) -> void:
	var rb := RigidBody3D.new()
	rb.mass = 18.0
	rb.collision_layer = LAYER_PROPS
	rb.collision_mask = LAYER_WORLD | LAYER_PROPS | 2 | 8
	rb.position = pos + Vector3(0, 0.44, 0)
	var cm := CylinderMesh.new()
	cm.top_radius = 0.29
	cm.bottom_radius = 0.29
	cm.height = 0.88
	cm.radial_segments = 20
	var mi := MeshInstance3D.new()
	mi.mesh = cm
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = 0.45
	m.metallic = 0.4
	mi.material_override = m
	rb.add_child(mi)
	var cs := CollisionShape3D.new()
	var sh := CylinderShape3D.new()
	sh.radius = 0.29
	sh.height = 0.88
	cs.shape = sh
	rb.add_child(cs)
	rb.can_sleep = true
	rb.sleeping = true
	add_child(rb)
	props.append(rb)

func _pallet(pos: Vector3) -> void:
	var rb := RigidBody3D.new()
	rb.mass = 22.0
	rb.collision_layer = LAYER_PROPS
	rb.collision_mask = LAYER_WORLD | LAYER_PROPS | 2 | 8
	rb.position = pos + Vector3(0, 0.072, 0)
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(0.62, 0.48, 0.32)
	m.roughness = 0.85
	for k in 5:
		var mi := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(1.2, 0.022, 0.14)
		mi.mesh = bm
		mi.position = Vector3(0, 0.061, -0.43 + k * 0.215)
		mi.material_override = m
		rb.add_child(mi)
	for k in 3:
		var mi2 := MeshInstance3D.new()
		var bm2 := BoxMesh.new()
		bm2.size = Vector3(0.1, 0.1, 1.0)
		mi2.mesh = bm2
		mi2.position = Vector3(-0.55 + k * 0.55, -0.01, 0)
		mi2.material_override = m
		rb.add_child(mi2)
	var cs := CollisionShape3D.new()
	var sh := BoxShape3D.new()
	sh.size = Vector3(1.2, 0.144, 1.0)
	cs.shape = sh
	rb.add_child(cs)
	rb.can_sleep = true
	rb.sleeping = true
	add_child(rb)
	props.append(rb)

func _props() -> void:
	var cols := [Color(0.1, 0.3, 0.7), Color(0.85, 0.35, 0.05), Color(0.75, 0.75, 0.72)]
	for k in 12:
		_barrel(Vector3(-25 + (k % 4) * 0.7, 0, 30 + int(k / 4) * 0.7), cols[k % 3])
	for k in 9:
		_barrel(Vector3(-150 + (k % 3) * 0.65, 0, 100 + int(k / 3) * 0.65), cols[(k + 1) % 3])
	for k in 8:
		_pallet(Vector3(-30 + (k % 2) * 1.4, float(int(k / 2)) * 0.15, 60))
	for k in 6:
		_pallet(Vector3(-320 + k * 1.5, 0, -20))
	for k in 16:
		_cone(Vector3(-16.0 + (k % 2) * 32.0, 0, 20 + int(k / 2) * 40.0))
	for k in 10:
		_cone(Vector3(-308 + (k % 5) * 4.0, 0, -40 + int(k / 5) * 4.0))

func _sign(pos: Vector3, rot_y: float, title: String, sub: String, color: Color) -> void:
	box(pos + Vector3(0, 1.6, 0), Vector3(0.12, 3.2, 0.12), mat_steel, rot_y, false)
	var panel := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(4.2, 1.6, 0.08)
	panel.mesh = bm
	var pm := StandardMaterial3D.new()
	pm.albedo_color = Color(0.92, 0.92, 0.9)
	pm.roughness = 0.5
	panel.material_override = pm
	panel.transform = Transform3D(Basis(Vector3.UP, rot_y), pos + Vector3(0, 3.6, 0))
	add_child(panel)
	var bar := MeshInstance3D.new()
	var bb := BoxMesh.new()
	bb.size = Vector3(4.2, 0.22, 0.09)
	bar.mesh = bb
	var bmat := StandardMaterial3D.new()
	bmat.albedo_color = color
	bar.material_override = bmat
	bar.transform = Transform3D(Basis(Vector3.UP, rot_y), pos + Vector3(0, 4.3, 0))
	add_child(bar)
	for face in [1.0, -1.0]:
		var l := Label3D.new()
		l.text = title
		l.font = label_font
		l.font_size = 128
		l.pixel_size = 0.0075
		l.modulate = Color(0.08, 0.08, 0.09)
		l.shaded = true
		var b := Basis(Vector3.UP, rot_y + (0.0 if face > 0 else PI))
		l.transform = Transform3D(b, pos + Vector3(0, 3.75, 0) + b * Vector3(0, 0, 0.05))
		add_child(l)
		var l2 := Label3D.new()
		l2.text = sub
		l2.font = label_font
		l2.font_size = 64
		l2.pixel_size = 0.0075
		l2.modulate = Color(0.25, 0.25, 0.27)
		l2.shaded = true
		l2.transform = Transform3D(b, pos + Vector3(0, 3.2, 0) + b * Vector3(0, 0, 0.05))
		add_child(l2)

func _signs() -> void:
	_sign(Vector3(-30, 0, -20), 0.0, "ZONE A  CRASH", "walls · containers · pillars · poles", Color(0.7, 0.18, 0.15))
	_sign(Vector3(30, 0, -20), 0.0, "ZONE B  JUMPS", "ramps 1 / 2.5 / 5 m · ravines 30 m", Color(0.15, 0.32, 0.6))
	_sign(Vector3(-250, 0, -110), 0.6, "ZONE C  FLIGHT", "platforms 10 / 25 / 50 / 100 m", Color(0.9, 0.62, 0.1))
	_sign(Vector3(60, 0, 470), 0.0, "ZONE D  STUNTS", "loop · banked turn · half-pipe · slalom", Color(0.2, 0.5, 0.26))
	_sign(Vector3(18, 0, -60), 0.0, "STRAIGHT", "2 km · 88 mph · top speed", Color(0.3, 0.3, 0.32))

func _hills() -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var seg := 180
	var rings := [2600.0, 3400.0, 4300.0, 5200.0, 6000.0]
	var noise := FastNoiseLite.new()
	noise.seed = 88
	noise.frequency = 0.004
	noise.fractal_octaves = 5
	var pts := []
	for ri in rings.size():
		var row := []
		for k in seg + 1:
			var a := float(k) / seg * TAU
			var d := Vector2(cos(a), sin(a))
			var r: float = rings[ri]
			var p2 := Vector2(0, 900) + d * r
			var hmax: float = [0.0, 90.0, 260.0, 420.0, 300.0][ri]
			var nval := noise.get_noise_2d(p2.x * 0.3, p2.y * 0.3) * 0.5 + 0.5
			var ridge := 1.0 - absf(noise.get_noise_2d(p2.x * 0.11 + 500.0, p2.y * 0.11) )
			var h: float = hmax * (0.35 + 0.65 * nval) * (0.6 + 0.4 * ridge)
			row.append(Vector3(p2.x, h - 2.0, p2.y))
		pts.append(row)
	for ri in rings.size() - 1:
		for k in seg:
			var a: Vector3 = pts[ri][k]
			var b: Vector3 = pts[ri][k + 1]
			var c: Vector3 = pts[ri + 1][k + 1]
			var d: Vector3 = pts[ri + 1][k]
			for q in [a, c, b, a, d, c]:
				st.add_vertex(q)
	st.generate_normals()
	var mi := MeshInstance3D.new()
	mi.mesh = st.commit()
	var m := ShaderMaterial.new()
	m.shader = load("res://src/world/hills.gdshader")
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
