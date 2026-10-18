# TimeTravel: time circuits (destination / present / last departed), arming, 70 mph flux build-up, the 88 mph jump with flash, implosion, fire trails or ring, departure hold, arrival crackle and frost.
extends Node3D

const MPH := 0.44704
const MONTHS := ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
const ERAS := [
	{"id": "hadean", "label": "Hadean", "date": {"y": -4000000000, "m": 6, "d": 21, "h": 12, "min": 0, "has_date": false}},
	{"id": "dino", "label": "Late Cretaceous", "date": {"y": -66000000, "m": 6, "d": 21, "h": 12, "min": 0, "has_date": false}},
	{"id": "1885", "label": "Wild West", "date": {"y": 1885, "m": 9, "d": 2, "h": 8, "min": 0, "has_date": true}},
	{"id": "2026", "label": "Today", "date": {"y": 2026, "m": 10, "d": 15, "h": 14, "min": 0, "has_date": true}},
	{"id": "2080", "label": "Near future", "date": {"y": 2080, "m": 6, "d": 21, "h": 20, "min": 30, "has_date": true}},
	{"id": "ruins", "label": "Ruins", "date": {"y": 2600, "m": 6, "d": 21, "h": 12, "min": 0, "has_date": false}},
	{"id": "scifi", "label": "Far future", "date": {"y": 12000, "m": 6, "d": 21, "h": 12, "min": 0, "has_date": false}},
]

enum { IDLE, JUMPING, HOLD, ARRIVING }

var game
var tune: Dictionary
var armed := false
var phase := IDLE
var phase_t := 0.0
var buildup := 0.0
var present := {"y": 2026, "m": 10, "d": 15, "h": 14, "min": 0, "has_date": true}
var destination := {"y": 1885, "m": 9, "d": 2, "h": 8, "min": 0, "has_date": true}
var last_departed: Dictionary = {}
var hide_hud := false
var arcs: MeshInstance3D
var arc_mesh: ImmediateMesh
var arc_mat: ShaderMaterial
var arc_light: OmniLight3D
var arc_points: PackedVector3Array = PackedVector3Array()
var arc_normals: PackedVector3Array = PackedVector3Array()
var arc_timer := 0.0
var arc_bolts: Array = []
var flash_layer: CanvasLayer
var flash_rect: ColorRect
var flash_a := 0.0
var trails: Array = []
var vanish_pos := Vector3.ZERO
var vanish_vel := Vector3.ZERO
var implosion: MeshInstance3D
var burst_light: OmniLight3D
var vapour: GPUParticles3D
var crackle := 0.0
var rng := RandomNumberGenerator.new()
var trail_parent: Node3D
var flame_tex: Texture2D

signal jumped(from: Dictionary, to: Dictionary)
signal changed

func setup(g) -> void:
	game = g
	tune = Tuning.data()["time_travel"]
	name = "TimeTravel"
	rng.seed = 88
	arc_mesh = ImmediateMesh.new()
	arcs = MeshInstance3D.new()
	arcs.mesh = arc_mesh
	arcs.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	arc_mat = ShaderMaterial.new()
	arc_mat.shader = _arc_shader()
	arcs.material_override = arc_mat
	arc_light = OmniLight3D.new()
	arc_light.light_color = Color(0.6, 0.8, 1.0)
	arc_light.omni_range = 7.0
	arc_light.light_energy = 0.0
	arc_light.shadow_enabled = false
	flash_layer = CanvasLayer.new()
	flash_layer.layer = 20
	add_child(flash_layer)
	flash_rect = ColorRect.new()
	flash_rect.color = Color(1, 1, 1, 0)
	flash_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	flash_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	flash_layer.add_child(flash_rect)
	trail_parent = Node3D.new()
	trail_parent.name = "Trails"
	game.world3d.add_child(trail_parent)
	implosion = MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 1.0
	sm.height = 2.0
	sm.radial_segments = 32
	sm.rings = 16
	implosion.mesh = sm
	var im := ShaderMaterial.new()
	im.shader = _implosion_shader()
	implosion.material_override = im
	implosion.visible = false
	implosion.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	game.world3d.add_child(implosion)
	burst_light = OmniLight3D.new()
	burst_light.light_color = Color(0.85, 0.92, 1.0)
	burst_light.omni_range = 40.0
	burst_light.light_energy = 0.0
	game.world3d.add_child(burst_light)
	flame_tex = _flame_texture()
	on_car_changed(game.car)

func on_car_changed(c) -> void:
	if arcs.get_parent():
		arcs.get_parent().remove_child(arcs)
	if arc_light.get_parent():
		arc_light.get_parent().remove_child(arc_light)
	c.add_child(arcs)
	c.add_child(arc_light)
	arc_light.position = Vector3(0, 0.8, 0)
	_sample_points(c)
	if vapour and is_instance_valid(vapour):
		vapour.queue_free()
	vapour = _make_vapour()
	c.add_child(vapour)

func _sample_points(c) -> void:
	arc_points.clear()
	arc_normals.clear()
	var model: Node3D = c.rig.model if c.rig else null
	if model == null:
		return
	for nm in ["Hood", "Door_L", "Door_R", "Bumper_F", "Bumper_R", "Roof_Targa", "Glass_Rear"]:
		var mi := model.find_child(nm, true, false) as MeshInstance3D
		if mi == null or mi.mesh == null:
			continue
		var xf: Transform3D = _rel_xf(model, mi)
		for s in mi.mesh.get_surface_count():
			var arr := mi.mesh.surface_get_arrays(s)
			var v: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
			var nn: PackedVector3Array = arr[Mesh.ARRAY_NORMAL]
			var step := maxi(1, v.size() / 90)
			var i := rng.randi_range(0, step - 1)
			while i < v.size():
				arc_points.append(xf * v[i])
				arc_normals.append((xf.basis * nn[i]).normalized())
				i += step

func _rel_xf(root: Node3D, n: Node3D) -> Transform3D:
	var xf := Transform3D.IDENTITY
	var cur: Node = n
	while cur and cur != root:
		if cur is Node3D:
			xf = (cur as Node3D).transform * xf
		cur = cur.get_parent()
	return xf

func toggle_arm() -> void:
	if phase != IDLE:
		return
	armed = not armed
	if game.audio and game.audio.has_method("play"):
		game.audio.play("tc_arm" if armed else "tc_disarm", 0.9)
	changed.emit()

func set_destination(d: Dictionary) -> void:
	destination = d.duplicate()
	changed.emit()

static func era_of_year(y: int) -> Dictionary:
	var best: Dictionary = ERAS[0]
	for e in ERAS:
		if int(e["date"]["y"]) <= y:
			best = e
	return best

static func fmt_year(y: int) -> String:
	if y < 0:
		return _group(-y) + " BC"
	if y >= 10000:
		return _group(y)
	return str(y)

static func _group(n: int) -> String:
	var s := str(n)
	var out := ""
	var c := 0
	for i in range(s.length() - 1, -1, -1):
		out = s[i] + out
		c += 1
		if c % 3 == 0 and i > 0:
			out = "," + out
	return out

static func fmt(d: Dictionary) -> String:
	if d.is_empty():
		return "--- -- ---- --:--"
	if not d.get("has_date", true) or int(d["y"]) < 0 or int(d["y"]) >= 10000:
		return fmt_year(int(d["y"]))
	return "%s %02d %s %02d:%02d" % [MONTHS[int(d["m"]) - 1], int(d["d"]), fmt_year(int(d["y"])), int(d["h"]), int(d["min"])]

func dest_label_short() -> String:
	return fmt_year(int(destination["y"]))

func _process(dt: float) -> void:
	var __t0 := Time.get_ticks_usec()
	var c: Car = game.car
	if c == null or not is_instance_valid(c):
		Prof.add("time_travel", Time.get_ticks_usec() - __t0)
		return
	var mph := c.linear_velocity.length() / MPH
	var from := float(tune["buildup_from_mph"])
	var trig := float(tune["trigger_mph"])
	phase_t += dt
	match phase:
		IDLE:
			var want := 0.0
			if armed:
				want = clampf((mph - from) / (trig - from), 0.0, 1.0)
			buildup = move_toward(buildup, want, dt * 2.5)
			if armed and mph >= trig and not c.wrecked:
				_depart(c)
		JUMPING:
			buildup = 0.0
			if phase_t >= float(tune["flash_s"]):
				if game.cam.fpp:
					_arrive(c)
				else:
					phase = HOLD
					phase_t = 0.0
		HOLD:
			if phase_t >= float(tune["departure_hold_s"]):
				_arrive(c)
		ARRIVING:
			var vs := float(tune["arrival_vapour_s"])
			var k := clampf(1.0 - phase_t / vs, 0.0, 1.0)
			if c.rig and c.rig.mats:
				c.rig.mats.mats["Paint"].set_shader_parameter("ice", k * k * 0.35)
				c.rig.mats.mats["Glass_Tint"].set_shader_parameter("frost", k * 0.8)
			vapour.amount_ratio = k
			if phase_t >= vs:
				vapour.emitting = false
				phase = IDLE
				phase_t = 0.0
	crackle = maxf(0.0, crackle - dt * 1.6)
	flash_a = maxf(0.0, flash_a - dt / maxf(float(tune["flash_s"]), 0.05))
	flash_rect.color = Color(0.92, 0.96, 1.0, clampf(flash_a, 0.0, 1.0))
	burst_light.light_energy = maxf(0.0, burst_light.light_energy - dt * 120.0)
	_update_arcs(dt, c)
	_update_trails(dt)
	if game.audio and game.audio.has_method("set_flux"):
		game.audio.set_flux(buildup if phase == IDLE else 0.0, crackle)
	Prof.add("time_travel", Time.get_ticks_usec() - __t0)

func _depart(c: Car) -> void:
	phase = JUMPING
	phase_t = 0.0
	vanish_pos = c.global_transform * Vector3(0, 0.5, 0)
	vanish_vel = c.linear_velocity
	flash_a = 1.0
	burst_light.global_position = vanish_pos
	burst_light.light_energy = 60.0
	implosion.global_position = vanish_pos
	implosion.visible = true
	implosion.scale = Vector3(2.6, 1.4, 3.2)
	var tw := create_tween()
	tw.tween_property(implosion, "scale", Vector3.ONE * 0.02, 0.14).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_IN)
	tw.tween_callback(func(): implosion.visible = false)
	if not game.cam.fpp:
		game.cam.override_xf = game.cam.global_transform
	if c.vs.contacts >= 2:
		_spawn_trails(c)
	else:
		_spawn_ring(c)
	c.enter_limbo()
	c.visible = false
	hide_hud = true
	if game.audio and game.audio.has_method("play"):
		game.audio.play("tc_boom_double", 1.0)
		game.audio.play("tc_fire_whoosh", 0.9)
	last_departed = present.duplicate()
	jumped.emit(present, destination)

func _arrive(c: Car) -> void:
	phase = ARRIVING
	phase_t = 0.0
	present = destination.duplicate()
	armed = false
	flash_a = 1.0
	for t in trails:
		if is_instance_valid(t["node"]):
			t["node"].queue_free()
	trails.clear()
	var hour := float(present["h"]) + float(present["min"]) / 60.0
	game.sky.set_time(int(present["m"]), int(present["d"]), hour)
	c.visible = true
	c.exit_limbo()
	game.cam.override_xf = null
	hide_hud = false
	crackle = 1.0
	vapour.emitting = true
	vapour.restart()
	if c.rig and c.rig.mats:
		c.rig.mats.mats["Paint"].set_shader_parameter("ice", 0.35)
	if game.audio and game.audio.has_method("play"):
		game.audio.play("tc_arrive_zap", 1.0)
	if game.audio and game.audio.has_method("on_era_changed"):
		game.audio.on_era_changed(era_of_year(int(present["y"]))["id"])
	changed.emit()

func _update_arcs(dt: float, c: Car) -> void:
	var inten := maxf(buildup, crackle)
	if phase == JUMPING:
		inten = 1.0
	arc_mesh.clear_surfaces()
	arc_light.light_energy = inten * (2.0 + rng.randf() * 4.0) if inten > 0.01 and c.visible else 0.0
	if inten < 0.01 or arc_points.size() < 8 or not c.visible:
		arc_bolts.clear()
		return
	arc_timer -= dt
	if arc_timer <= 0.0:
		arc_timer = rng.randf_range(0.03, 0.07)
		arc_bolts.clear()
		var count := int(2 + inten * 14)
		for k in count:
			arc_bolts.append(_make_bolt(inten))
	var cam := get_viewport().get_camera_3d()
	if cam == null or arc_bolts.is_empty():
		return
	var cam_local := c.global_transform.affine_inverse() * cam.global_position
	arc_mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	for bolt in arc_bolts:
		var pts: PackedVector3Array = bolt["pts"]
		var w: float = bolt["w"]
		for i in pts.size() - 1:
			var a := pts[i]
			var b := pts[i + 1]
			var seg := b - a
			var view := (cam_local - (a + b) * 0.5).normalized()
			var side := seg.cross(view).normalized() * w
			arc_mesh.surface_set_color(Color(0.7, 0.85, 1.0, 1.0))
			arc_mesh.surface_set_uv(Vector2(0, 0))
			arc_mesh.surface_add_vertex(a - side)
			arc_mesh.surface_set_uv(Vector2(1, 0))
			arc_mesh.surface_add_vertex(a + side)
			arc_mesh.surface_set_uv(Vector2(1, 1))
			arc_mesh.surface_add_vertex(b + side)
			arc_mesh.surface_set_uv(Vector2(0, 0))
			arc_mesh.surface_add_vertex(a - side)
			arc_mesh.surface_set_uv(Vector2(1, 1))
			arc_mesh.surface_add_vertex(b + side)
			arc_mesh.surface_set_uv(Vector2(0, 1))
			arc_mesh.surface_add_vertex(b - side)
	arc_mesh.surface_end()
	arc_mat.set_shader_parameter("intensity", 3.0 + inten * 9.0)

func _make_bolt(inten: float) -> Dictionary:
	var n := arc_points.size()
	var i0 := rng.randi_range(0, n - 1)
	var p := arc_points[i0] + arc_normals[i0] * 0.02
	var pts := PackedVector3Array([p])
	var steps := rng.randi_range(4, 9)
	var dirv := Vector3(rng.randf_range(-1, 1), rng.randf_range(-0.3, 0.6), rng.randf_range(-1, 1)).normalized()
	var cur := i0
	for s in steps:
		var best := -1
		var best_d := 1e9
		for t in 14:
			var j := rng.randi_range(0, n - 1)
			var d := arc_points[j].distance_to(arc_points[cur] + dirv * 0.25)
			if d < best_d and j != cur:
				best_d = d
				best = j
		cur = best
		var q := arc_points[cur] + arc_normals[cur] * rng.randf_range(0.02, 0.09 + inten * 0.08)
		var mid := (pts[pts.size() - 1] + q) * 0.5 + Vector3(rng.randf_range(-1, 1), rng.randf_range(-1, 1), rng.randf_range(-1, 1)) * 0.05
		pts.append(mid)
		pts.append(q)
	return {"pts": pts, "w": rng.randf_range(0.004, 0.009) * (1.0 + inten)}

func _flame_texture() -> Texture2D:
	var g := Gradient.new()
	g.set_color(0, Color(1, 1, 1, 1))
	g.set_color(1, Color(1, 1, 1, 0))
	g.add_point(0.45, Color(1, 1, 1, 0.55))
	var gt := GradientTexture2D.new()
	gt.gradient = g
	gt.fill = GradientTexture2D.FILL_RADIAL
	gt.fill_from = Vector2(0.5, 0.5)
	gt.fill_to = Vector2(0.5, 0.0)
	gt.width = 64
	gt.height = 64
	return gt

func _fire_particles(amount: int, life: float) -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.amount = amount
	p.lifetime = life
	p.explosiveness = 0.0
	p.randomness = 0.6
	p.local_coords = false
	p.visibility_aabb = AABB(Vector3(-40, -5, -40), Vector3(80, 20, 80))
	var pm := ParticleProcessMaterial.new()
	pm.direction = Vector3(0, 1, 0)
	pm.spread = 12.0
	pm.initial_velocity_min = 0.5
	pm.initial_velocity_max = 1.6
	pm.gravity = Vector3(0, 2.2, 0)
	pm.damping_min = 0.8
	pm.damping_max = 1.8
	pm.scale_min = 0.12
	pm.scale_max = 0.28
	var sc := Curve.new()
	sc.add_point(Vector2(0, 0.4))
	sc.add_point(Vector2(0.3, 1.0))
	sc.add_point(Vector2(1, 0.2))
	var sct := CurveTexture.new()
	sct.curve = sc
	pm.scale_curve = sct
	var cr := Gradient.new()
	cr.set_color(0, Color(1.0, 0.95, 0.7, 1.0))
	cr.set_color(1, Color(0.15, 0.1, 0.08, 0.0))
	cr.add_point(0.25, Color(1.0, 0.6, 0.15, 0.9))
	cr.add_point(0.6, Color(0.8, 0.2, 0.04, 0.5))
	var crt := GradientTexture1D.new()
	crt.gradient = cr
	pm.color_ramp = crt
	p.process_material = pm
	var q := QuadMesh.new()
	q.size = Vector2(0.4, 0.75)
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	m.vertex_color_use_as_albedo = true
	m.albedo_texture = flame_tex
	m.albedo_color = Color(1.25, 0.8, 0.5)
	m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	m.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	m.proximity_fade_enabled = true
	m.proximity_fade_distance = 0.35
	q.material = m
	p.draw_pass_1 = q
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return p

func _spawn_trails(c: Car) -> void:
	var xf := c.global_transform
	var v := vanish_vel
	var fwd := Vector3(v.x, 0, v.z)
	if fwd.length() < 0.5:
		fwd = xf.basis.z
	fwd = fwd.normalized()
	var length := v.length() * 0.45
	for w in c.vs.wheels:
		if w.front or not w.contact:
			continue
		var start := w.point + Vector3(0, 0.02, 0) - fwd * 1.5
		var node := Node3D.new()
		trail_parent.add_child(node)
		var p := _fire_particles(520, 0.55)
		node.add_child(p)
		var light := OmniLight3D.new()
		light.light_color = Color(1.0, 0.55, 0.2)
		light.omni_range = 9.0
		light.light_energy = 3.0
		node.add_child(light)
		trails.append({"node": node, "p": p, "light": light, "start": start, "dir": fwd, "len": length, "t": 0.0})
	_update_trails(0.0)

func _spawn_ring(c: Car) -> void:
	var node := Node3D.new()
	trail_parent.add_child(node)
	var p := _fire_particles(900, 0.9)
	var pm: ParticleProcessMaterial = p.process_material
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_RING
	pm.emission_ring_radius = 2.4
	pm.emission_ring_inner_radius = 2.1
	pm.emission_ring_height = 0.2
	var v := vanish_vel.normalized() if vanish_vel.length() > 1.0 else Vector3.FORWARD
	pm.emission_ring_axis = Vector3(0, 0, 1)
	pm.gravity = Vector3(0, 1.0, 0)
	node.add_child(p)
	node.global_transform = Transform3D(Basis.looking_at(-v, Vector3.UP if absf(v.y) < 0.95 else Vector3.RIGHT), vanish_pos)
	var light := OmniLight3D.new()
	light.light_color = Color(1.0, 0.55, 0.2)
	light.omni_range = 12.0
	light.light_energy = 4.0
	node.add_child(light)
	trails.append({"node": node, "p": p, "light": light, "ring": true, "t": 0.0})

func _update_trails(dt: float) -> void:
	var life := float(tune["fire_trail_life_s"])
	for t in trails:
		t["t"] += dt
		var k := clampf(1.0 - t["t"] / life, 0.0, 1.0)
		var p: GPUParticles3D = t["p"]
		p.amount_ratio = k
		t["light"].light_energy = (3.0 + rng.randf() * 1.5) * k
		if t.has("ring"):
			continue
		var grow := clampf(t["t"] / 0.35, 0.0, 1.0)
		var l: float = t["len"] * grow + 1.5
		var dirv: Vector3 = t["dir"]
		var center: Vector3 = t["start"] + dirv * l * 0.5
		var node: Node3D = t["node"]
		node.global_transform = Transform3D(Basis.looking_at(-dirv, Vector3.UP), center)
		var pm: ParticleProcessMaterial = p.process_material
		pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
		pm.emission_box_extents = Vector3(0.06, 0.02, l * 0.5)
		t["light"].position = Vector3(0, 0.5, 0)

func _make_vapour() -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.amount = 90
	p.lifetime = 1.3
	p.local_coords = false
	p.emitting = false
	p.visibility_aabb = AABB(Vector3(-30, -5, -30), Vector3(60, 20, 60))
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(0.9, 0.35, 2.1)
	pm.direction = Vector3(0, 1, 0)
	pm.spread = 60.0
	pm.initial_velocity_min = 0.2
	pm.initial_velocity_max = 0.8
	pm.gravity = Vector3(0, 0.25, 0)
	pm.damping_min = 0.4
	pm.damping_max = 1.0
	pm.scale_min = 0.35
	pm.scale_max = 0.9
	var cr := Gradient.new()
	cr.set_color(0, Color(1, 1, 1, 0.0))
	cr.set_color(1, Color(1, 1, 1, 0.0))
	cr.add_point(0.15, Color(0.95, 0.97, 1.0, 0.16))
	cr.add_point(0.6, Color(0.9, 0.93, 0.97, 0.06))
	var crt := GradientTexture1D.new()
	crt.gradient = cr
	pm.color_ramp = crt
	p.process_material = pm
	var q := QuadMesh.new()
	q.size = Vector2(1.0, 1.0)
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_PER_VERTEX
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.vertex_color_use_as_albedo = true
	m.albedo_texture = flame_tex
	m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	m.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	m.proximity_fade_enabled = true
	m.proximity_fade_distance = 0.6
	q.material = m
	p.draw_pass_1 = q
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	p.position = Vector3(0, 0.6, 0)
	return p

func _arc_shader() -> Shader:
	var s := Shader.new()
	s.code = """
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled;
uniform float intensity = 6.0;
void fragment() {
	float x = abs(UV.x - 0.5) * 2.0;
	float core = 1.0 - smoothstep(0.0, 1.0, x);
	ALBEDO = mix(vec3(0.45, 0.65, 1.0), vec3(1.0), core * core) * intensity * core;
	ALPHA = core;
}
"""
	return s

func _implosion_shader() -> Shader:
	var s := Shader.new()
	s.code = """
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled;
void fragment() {
	float rim = pow(1.0 - abs(dot(normalize(NORMAL), VIEW)), 4.0);
	ALBEDO = vec3(0.7, 0.85, 1.0) * rim * 5.0;
}
"""
	return s

func jump_now() -> void:
	if game.car:
		armed = true
		_depart(game.car)
