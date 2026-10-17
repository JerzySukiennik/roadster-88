# CarDamage: drives the damage lattice from impacts (crush depth from tuning.damage.crush), resamples it into a 3D displacement texture for GPU skinning, cracks and shatters glass, detaches parts, degrades handling and shrinks the collider.
extends Node

const GW := 16
const GH := 10
const GD := 34
const GRID_MIN := Vector3(-1.15, -0.15, -2.45)
const GRID_SIZE := Vector3(2.3, 1.5, 4.9)

static var _lattice_dict: Dictionary = {}
static var _cell_nodes := PackedInt32Array()
static var _cell_w := PackedFloat32Array()

var car: Car
var model: Node3D
var mats: CarMaterials
var game
var lat: Lattice
var tune: Dictionary
var crush_t: Dictionary
var tex: ImageTexture3D
var slices: Array[Image] = []
var field := PackedFloat32Array()
var field_dirty := false
var tick := 0
var cracks: Array = []
var shattered: Dictionary = {}
var glass_nodes: Array = []
var debris: Array = []
var shards: Array = []
var last_crush := {}
var total_energy := 0.0
var detached: Dictionary = {}
var glass_pts: Dictionary = {}

func _sample_mesh(mi: MeshInstance3D, count: int) -> PackedVector3Array:
	var out := PackedVector3Array()
	var xf := _model_xf(mi)
	for s in mi.mesh.get_surface_count():
		var arr := mi.mesh.surface_get_arrays(s)
		var v: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
		var step := maxi(1, v.size() / count)
		var i := 0
		while i < v.size():
			out.append(xf * v[i])
			i += step
	return out

func setup(c: Car, m: Node3D, materials: CarMaterials, g) -> void:
	car = c
	model = m
	mats = materials
	game = g
	tune = Tuning.data()["damage"]
	crush_t = tune.get("crush", {})
	if _lattice_dict.is_empty():
		var d: Variant = Tuning.load_json("lattice.json")
		if d is Dictionary and (d as Dictionary).has("nodes") and CarModel.using_real:
			_lattice_dict = d
		else:
			_lattice_dict = LatticeGen.generate()
	lat = Lattice.new()
	lat.load_dict(_lattice_dict)
	lat.window = float(tune.get("active_window_s", 0.6))
	lat.substeps = maxi(2, int(tune.get("lattice_substeps", 6)) / 2)
	if _cell_nodes.is_empty():
		_precompute_cells()
	field.resize(GW * GH * GD * 4)
	field.fill(0.0)
	for z in GD:
		var img := Image.create_empty(GW, GH, false, Image.FORMAT_RGBAF)
		img.fill(Color(0, 0, 0, 0))
		slices.append(img)
	tex = ImageTexture3D.new()
	tex.create(Image.FORMAT_RGBAF, GW, GH, GD, false, slices)
	mats.set_deform(tex, true)
	for nm in ["Glass_Windshield", "Glass_Rear", "Glass_Door_L", "Glass_Door_R", "Glass_Quarter_L", "Glass_Quarter_R", "Roof_Targa"]:
		var gn := model.find_child(nm, true, false) as MeshInstance3D
		if gn:
			glass_nodes.append(gn)
			glass_pts[gn.name] = _sample_mesh(gn, 300)
	car.impacted.connect(_on_impact)

func _precompute_cells() -> void:
	var nc := GW * GH * GD
	_cell_nodes.resize(nc * 4)
	_cell_w.resize(nc * 4)
	var p0 := lat.p0
	for z in GD:
		for y in GH:
			for x in GW:
				var c := GRID_MIN + Vector3((x + 0.5) / GW * GRID_SIZE.x, (y + 0.5) / GH * GRID_SIZE.y, (z + 0.5) / GD * GRID_SIZE.z)
				var bd := [1e9, 1e9, 1e9, 1e9]
				var bi := [0, 0, 0, 0]
				for i in lat.n:
					var d := p0[i].distance_squared_to(c)
					if d < bd[3]:
						var k := 3
						while k > 0 and d < bd[k - 1]:
							bd[k] = bd[k - 1]
							bi[k] = bi[k - 1]
							k -= 1
						bd[k] = d
						bi[k] = i
				var ws := 0.0
				var w4 := [0.0, 0.0, 0.0, 0.0]
				for k in 4:
					var wv := 1.0 / maxf(bd[k], 0.0025)
					w4[k] = wv
					ws += wv
				var idx := ((z * GH + y) * GW + x) * 4
				for k in 4:
					_cell_nodes[idx + k] = bi[k]
					_cell_w[idx + k] = w4[k] / ws

func _update_field() -> void:
	var nc := GW * GH * GD
	var disp := PackedVector3Array()
	disp.resize(lat.n)
	for i in lat.n:
		disp[i] = lat.p[i] - lat.p0[i]
	for ci in nc:
		var d := Vector3.ZERO
		var b := ci * 4
		for k in 4:
			d += disp[_cell_nodes[b + k]] * _cell_w[b + k]
		field[b] = d.x
		field[b + 1] = d.y
		field[b + 2] = d.z
	var per := GW * GH * 4
	for z in GD:
		var chunk := field.slice(z * per, (z + 1) * per)
		slices[z] = Image.create_from_data(GW, GH, false, Image.FORMAT_RGBAF, chunk.to_byte_array())
	tex.update(slices)

func crush_depth(energy: float, zone: String) -> float:
	var fs := float(crush_t.get("crumple_force", 450000.0))
	var ls := float(crush_t.get("crumple_length", 0.55))
	match zone:
		"side":
			fs = float(crush_t.get("side_force", 300000.0))
			ls = float(crush_t.get("side_length", 0.25))
		"roof":
			fs = float(crush_t.get("roof_force", 260000.0))
			ls = float(crush_t.get("roof_length", 0.2))
		"floor":
			fs = float(crush_t.get("floor_force", 700000.0))
			ls = float(crush_t.get("floor_length", 0.12))
	var fc := float(crush_t.get("cabin_force", 2200000.0))
	var mx := float(crush_t.get("max_depth", 2.6))
	var d := 0.0
	if energy <= fs * ls:
		d = energy / fs
	else:
		d = ls + (energy - fs * ls) / fc
	return minf(d, mx)

func _on_impact(info: Dictionary) -> void:
	if car.in_limbo:
		return
	var imp := float(info["impulse"])
	var vn := float(info.get("vn", 0.0))
	var pw: Vector3 = info["point"]
	var nw: Vector3 = info["normal"]
	var xf := car.global_transform
	var inv := xf.affine_inverse()
	var pc := inv * pw
	var nc := (xf.basis.inverse() * nw).normalized()
	var center := Vector3(0, 0.55, 0)
	if nc.dot(center - pc) < 0.0:
		nc = -nc
	var min_v := float(tune.get("min_impact_speed", 2.2))
	var col: Object = info.get("collider")
	var radius := 3.0
	var m_eff := car.mass
	if col is RigidBody3D:
		var om := (col as RigidBody3D).mass
		m_eff = car.mass * om / (car.mass + om)
		radius = 1.4
	if col is CollisionObject3D:
		for ch in (col as Node).get_children():
			if ch is CollisionShape3D and (ch as CollisionShape3D).shape is CylinderShape3D:
				radius = ((ch as CollisionShape3D).shape as CylinderShape3D).radius * 1.6 + 0.12
	if imp > 15000.0:
		car.fc.crash_hold = 1.5
	if vn > min_v:
		var e := 0.5 * m_eff * vn * vn
		var zone := "crumple"
		if absf(nc.x) > 0.7:
			zone = "side"
		elif nc.y < -0.7:
			zone = "roof"
		elif nc.y > 0.7:
			zone = "floor"
		var depth := crush_depth(e, zone)
		if depth > 0.01:
			lat.impact(pc, nc, vn, m_eff, radius, depth)
			total_energy += e
			if depth > 0.95 and game and game.driver and game.driver.avatar and game.car == car:
				game.driver.avatar.visible = false
		if game and game.fx and game.fx.has_method("spark_burst"):
			game.fx.spark_burst(pw, clampf(vn / 20.0, 0.2, 1.0))
	var fall := float(tune.get("glass_falloff_m", 0.6))
	var crack_i := float(tune.get("glass_crack_impulse", 6500))
	var shat_i := float(tune.get("glass_shatter_impulse", 22000))
	for gn in glass_nodes:
		if not is_instance_valid(gn) or shattered.has(gn.name) or not gn.visible:
			continue
		var gp := _closest_point(gn, pc)
		var gi := imp * exp(-gp.distance_to(pc) / maxf(fall, 0.05))
		if gi > shat_i:
			_shatter(gn)
		elif gi > crack_i:
			_crack(gp, clampf((gi - crack_i) / (shat_i - crack_i), 0.15, 1.0))
	for k in lat.parts.keys():
		var part: Dictionary = lat.parts[k]
		if part["detached"]:
			continue
		var nodes: PackedInt32Array = part["nodes"]
		var dmin := 99.0
		for i in nodes:
			dmin = minf(dmin, lat.p[i].distance_to(pc))
		if dmin < 0.9 and imp * clampf(1.2 - dmin, 0.2, 1.0) > float(part["break_impulse"]):
			detach(k)
	var wbi := float(tune.get("wheel_break_impulse", 30000.0))
	for wk in lat.wheels.keys():
		if detached.has(wk):
			continue
		var wn: PackedInt32Array = lat.wheels[wk]
		var dm := 99.0
		for i in wn:
			dm = minf(dm, lat.p[i].distance_to(pc))
		if dm < 0.8 and imp * clampf(1.2 - dm, 0.2, 1.0) > wbi:
			detach(wk)
	var nbi := float(tune.get("nozzle_break_impulse", 9000.0))
	for nk in lat.nozzles.keys():
		if detached.has(nk):
			continue
		var nz = car.th.nozzle(nk)
		if nz == null:
			continue
		var npos: Vector3 = nz.pos
		var dn := npos.distance_to(pc)
		if dn < 0.7 and imp * clampf(1.1 - dn, 0.2, 1.0) > nbi:
			detach(nk)

func _model_xf(n: Node3D) -> Transform3D:
	var xf := Transform3D.IDENTITY
	var cur: Node = n
	while cur and cur != model:
		if cur is Node3D:
			xf = (cur as Node3D).transform * xf
		cur = cur.get_parent()
	return xf

func _closest_point(mi: MeshInstance3D, p: Vector3) -> Vector3:
	var pts: PackedVector3Array = glass_pts.get(mi.name, PackedVector3Array())
	var best := p
	var bd := 1e9
	for w in pts:
		var d := w.distance_squared_to(p)
		if d < bd:
			bd = d
			best = w
	return best

func _crack(pc: Vector3, strength: float) -> void:
	for c in cracks:
		var cv: Vector4 = c
		if Vector3(cv.x, cv.y, cv.z).distance_to(pc) < 0.12:
			return
	if cracks.size() >= 4:
		cracks.pop_front()
	cracks.append(Vector4(pc.x, pc.y, pc.z, strength))
	var gm: ShaderMaterial = mats.mats["Glass_Tint"]
	for i in 4:
		gm.set_shader_parameter("crack%d" % i, cracks[i] if i < cracks.size() else Vector4.ZERO)
	if game and game.audio:
		game.audio.play_at("glass_crack", car.global_transform * pc, clampf(strength + 0.3, 0.3, 1.0))

func _shatter(gn: MeshInstance3D) -> void:
	shattered[gn.name] = true
	if car.rig:
		car.rig.hide_part(gn.name)
	var aabb: AABB = gn.mesh.get_aabb()
	var gxf := gn.global_transform
	gn.visible = false
	var count := 110
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	var tri := ArrayMesh.new()
	var arrs := []
	arrs.resize(Mesh.ARRAY_MAX)
	arrs[Mesh.ARRAY_VERTEX] = PackedVector3Array([Vector3(0, 0, 0), Vector3(0.05, 0.0, 0.012), Vector3(0.015, 0.0, 0.05)])
	arrs[Mesh.ARRAY_NORMAL] = PackedVector3Array([Vector3.UP, Vector3.UP, Vector3.UP])
	tri.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrs)
	var sm := StandardMaterial3D.new()
	sm.albedo_color = Color(0.55, 0.62, 0.66, 0.55)
	sm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	sm.roughness = 0.05
	sm.metallic = 0.4
	sm.cull_mode = BaseMaterial3D.CULL_DISABLED
	tri.surface_set_material(0, sm)
	mm.mesh = tri
	mm.instance_count = count
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	game.world3d.add_child(mmi)
	var pos := PackedVector3Array()
	var vel := PackedVector3Array()
	var rot := []
	var spin := PackedVector3Array()
	var v0 := car.linear_velocity
	for i in count:
		var lp := aabb.position + Vector3(randf() * aabb.size.x, randf() * aabb.size.y, randf() * aabb.size.z)
		pos.append(gxf * lp)
		vel.append(v0 * randf_range(0.3, 0.9) + Vector3(randf_range(-3, 3), randf_range(0, 4), randf_range(-3, 3)))
		rot.append(Basis.from_euler(Vector3(randf() * TAU, randf() * TAU, randf() * TAU)).scaled(Vector3.ONE * randf_range(0.6, 1.8)))
		spin.append(Vector3(randf_range(-12, 12), randf_range(-12, 12), randf_range(-12, 12)))
	var ground := 0.0
	var hit := car.get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(gxf.origin + Vector3.UP, gxf.origin + Vector3.DOWN * 30.0, 1))
	if not hit.is_empty():
		ground = float(hit.position.y)
	shards.append({"mmi": mmi, "pos": pos, "vel": vel, "rot": rot, "spin": spin, "t": 0.0, "ground": ground})
	if game and game.audio:
		game.audio.play_at("glass_shatter", gxf.origin, 1.0)

func detach(part: String) -> void:
	if detached.has(part):
		return
	detached[part] = true
	if lat.parts.has(part):
		lat.parts[part]["detached"] = true
	var node := model.find_child(part, true, false) as Node3D
	if part.begins_with("Wheel_"):
		var w = car.vs.wheel_by_name(part)
		if w:
			w.lost = true
		var corner := part.substr(6)
		var steer := model.find_child("Steer_" + corner, true, false) as Node3D
		if steer:
			node = steer
		else:
			var br := model.find_child("Brake_" + corner, true, false) as Node3D
			if br:
				_spawn_debris(br, 6.0, false)
	elif part.begins_with("Nozzle_"):
		var nz = car.th.nozzle(part)
		if nz:
			nz.attached = false
	if node == null or not node.visible:
		return
	if car.rig:
		car.rig.hide_part(part)
		car.rig.n.erase(part)
	var mass := 8.0
	match part:
		"Door_L", "Door_R":
			mass = 24.0
		"Bumper_F", "Bumper_R":
			mass = 9.0
		"Hood":
			mass = 12.0
		"Mirror_L", "Mirror_R":
			mass = 1.5
		"Flap_F":
			mass = 0.8
		"Wing":
			mass = 6.0
		"Roof_Targa", "Glass_Windshield", "Glass_Rear":
			mass = 9.0
	if part.begins_with("Wheel_"):
		mass = 30.0
	if part.begins_with("Nozzle_"):
		mass = 3.0
	_spawn_debris(node, mass, part.begins_with("Wheel_"))
	if game and game.audio:
		game.audio.play_at("part_clunk", car.global_position, 0.9)

func _spawn_debris(node: Node3D, mass: float, wheel: bool) -> void:
	var gxf := node.global_transform
	var rest_in_car := car.global_transform.affine_inverse() * gxf
	var rb := RigidBody3D.new()
	rb.mass = mass
	rb.collision_layer = Car.LAYER_DEBRIS
	rb.collision_mask = Car.LAYER_WORLD | Car.LAYER_CARS | Car.LAYER_PROPS | Car.LAYER_DEBRIS
	game.world3d.add_child(rb)
	rb.global_transform = Transform3D(Basis.IDENTITY, gxf.origin)
	var parent := node.get_parent()
	parent.remove_child(node)
	rb.add_child(node)
	node.global_transform = gxf
	var frozen := _freeze_materials(node)
	var aabb := _local_aabb(node, rb)
	var cs := CollisionShape3D.new()
	if wheel:
		var cyl := CylinderShape3D.new()
		cyl.radius = maxf(aabb.size.y, aabb.size.z) * 0.5
		cyl.height = maxf(aabb.size.x, 0.1)
		cs.shape = cyl
		cs.transform = Transform3D(Basis(Vector3.BACK, PI * 0.5), aabb.get_center())
	else:
		var bs := BoxShape3D.new()
		bs.size = aabb.size.max(Vector3(0.04, 0.04, 0.04))
		cs.shape = bs
		cs.position = aabb.get_center()
	rb.add_child(cs)
	var pm := PhysicsMaterial.new()
	pm.friction = 0.7 if wheel else 0.5
	pm.bounce = 0.15
	rb.physics_material_override = pm
	var r := gxf.origin - car.global_transform * car.com_local
	rb.linear_velocity = car.linear_velocity + car.angular_velocity.cross(r) + Vector3(randf_range(-1.5, 1.5), randf_range(0.5, 2.5), randf_range(-1.5, 1.5))
	rb.angular_velocity = car.angular_velocity + Vector3(randf_range(-4, 4), randf_range(-4, 4), randf_range(-4, 4))
	if wheel:
		var axis := gxf.basis.x.normalized()
		rb.angular_velocity += axis * car.linear_velocity.length() / 0.35
	car.add_ray_exclude(rb.get_rid())
	debris.append({"rb": rb, "node": node, "rest": rest_in_car, "mats": frozen})
	if debris.size() > 30:
		var old: Dictionary = debris.pop_front()
		if is_instance_valid(old["rb"]):
			old["rb"].queue_free()

func _freeze_materials(node: Node) -> Array:
	var copy := ImageTexture3D.new()
	var imgs: Array[Image] = []
	for im in slices:
		imgs.append(im.duplicate())
	copy.create(Image.FORMAT_RGBAF, GW, GH, GD, false, imgs)
	var out: Array = []
	var cache := {}
	for mi in [node] + node.find_children("*", "MeshInstance3D", true, false):
		if not (mi is MeshInstance3D):
			continue
		var m3 := mi as MeshInstance3D
		for s in m3.get_surface_override_material_count():
			var mat := m3.get_surface_override_material(s)
			if mat is ShaderMaterial:
				var dup: ShaderMaterial
				if cache.has(mat):
					dup = cache[mat]
				else:
					dup = mat.duplicate()
					dup.set_shader_parameter("deform_tex", copy)
					cache[mat] = dup
					out.append(dup)
				m3.set_surface_override_material(s, dup)
	return out

func _local_aabb(node: Node3D, ref: Node3D) -> AABB:
	var out := AABB()
	var first := true
	for mi in [node] + node.find_children("*", "MeshInstance3D", true, false):
		if not (mi is MeshInstance3D) or (mi as MeshInstance3D).mesh == null:
			continue
		var m3 := mi as MeshInstance3D
		var xf := ref.global_transform.affine_inverse() * m3.global_transform
		var a := xf * m3.mesh.get_aabb()
		if first:
			out = a
			first = false
		else:
			out = out.merge(a)
	if first:
		out = AABB(Vector3(-0.2, -0.2, -0.2), Vector3(0.4, 0.4, 0.4))
	return out

func _physics_process(dt: float) -> void:
	var __t0 := Time.get_ticks_usec()
	tick += 1
	if lat.active and tick % 2 == 0:
		lat.step(dt * 2.0)
		field_dirty = true
	if field_dirty and tick % 2 == 0:
		_update_field()
		field_dirty = false
		_apply_handling()
	_update_shards(dt)
	Prof.add("damage", Time.get_ticks_usec() - __t0)

func _process(_dt: float) -> void:
	for d in debris:
		var rb: RigidBody3D = d["rb"]
		if not is_instance_valid(rb):
			continue
		var node: Node3D = d["node"]
		if not is_instance_valid(node):
			continue
		var w2c: Transform3D = d["rest"] * node.get_global_transform_interpolated().affine_inverse()
		var proj := Projection(w2c)
		for m in d["mats"]:
			(m as ShaderMaterial).set_shader_parameter("world_to_car", proj)

func _apply_handling() -> void:
	for w in car.vs.wheels:
		if not lat.wheels.has(w.name):
			continue
		var d: Vector3 = lat.mean_disp(lat.wheels[w.name])
		if d.length() > 0.2:
			d = d.normalized() * 0.2
		w.hub = d
		var side := 1.0 if w.left else -1.0
		w.toe = clampf(-d.x * side * 1.6 + d.z * 0.4 * side, -0.14, 0.14)
		w.camber = clampf(d.y * 1.2 - d.x * side * 0.6, -0.2, 0.2)
		w.bent = d.length()
		if d.length() > 0.19 and not detached.has(w.name):
			detach(w.name)
	for nz in car.th.all:
		if not lat.nozzles.has(nz.name) or not nz.attached:
			continue
		var d2: Vector3 = lat.mean_disp(lat.nozzles[nz.name])
		var l := d2.length()
		nz.health = clampf(1.0 - l / 0.2, 0.15, 1.0)
		nz.mis_pitch = clampf(d2.y * 2.5, -0.35, 0.35)
		nz.mis_side = clampf(d2.x * 2.5, -0.3, 0.3)
		if l > 0.24:
			detach(nz.name)
	var cr := lat.crush_extent()
	var changed := false
	for k in cr.keys():
		if absf(float(cr[k]) - float(last_crush.get(k, 0.0))) > 0.02:
			changed = true
	if changed:
		last_crush = cr
		var cc := {}
		for k in cr.keys():
			cc[k] = minf(float(cr[k]) * 0.85, 1.4)
		car.build_hull(cc)

func _update_shards(dt: float) -> void:
	for i in range(shards.size() - 1, -1, -1):
		var s: Dictionary = shards[i]
		s["t"] += dt
		var mmi: MultiMeshInstance3D = s["mmi"]
		if not is_instance_valid(mmi):
			shards.remove_at(i)
			continue
		if s["t"] > 4.0:
			continue
		var pos: PackedVector3Array = s["pos"]
		var vel: PackedVector3Array = s["vel"]
		var rot: Array = s["rot"]
		var spin: PackedVector3Array = s["spin"]
		var g: float = s["ground"]
		for k in pos.size():
			var vv := vel[k]
			vv.y -= 9.81 * dt
			var pp := pos[k] + vv * dt
			if pp.y < g + 0.01:
				pp.y = g + 0.01
				vv = Vector3(vv.x * 0.6, -vv.y * 0.15, vv.z * 0.6)
				spin[k] *= 0.5
			pos[k] = pp
			vel[k] = vv
			var b: Basis = rot[k]
			var sp := spin[k]
			if sp.length() > 0.01:
				b = Basis(sp.normalized(), sp.length() * dt) * b
			rot[k] = b
			mmi.multimesh.set_instance_transform(k, Transform3D(b, pp))
		s["pos"] = pos
		s["vel"] = vel
		s["spin"] = spin

func repair_state() -> Dictionary:
	return {"broken": lat.broken_count, "plastic": lat.plastic_total, "energy": total_energy}
