# CarFx: cold-gas vapour from the Cycles flipbooks (axis-aligned jet billboards, valve puffs, ground billows, hover ring decal, boost cloud), condensation particles per nozzle, tyre smoke, sparks, and thrust pushing light props.
extends Node

const FX_DIR := "res://ext/assets/fx/"

var game
var car: Car
var nozzle_fx: Dictionary = {}
var billows: GPUParticles3D
var ring: MeshInstance3D
var ring_mat: ShaderMaterial
var ring_a := 0.0
var ring_phase := 0.0
var trail: GPUParticles3D
var smoke: Array = []
var sparks: GPUParticles3D
var soft_tex: Texture2D
var tex_jet: Texture2D
var tex_puff: Texture2D
var tex_ground: Texture2D
var tex_ring: Texture2D
var jet_shader: Shader
var ring_shader: Shader
var push_tick := 0
var preset := 2

func setup(g) -> void:
	game = g
	name = "CarFx"
	jet_shader = load("res://src/fx/jet.gdshader")
	ring_shader = load("res://src/fx/vapour_ring.gdshader")
	tex_jet = _tex("vapour_jet.webp")
	tex_puff = _tex("vapour_puff.webp")
	tex_ground = _tex("vapour_ground.webp")
	tex_ring = _tex("vapour_ground_ring.webp")
	soft_tex = _soft_texture()
	on_car_changed(game.car)

func _tex(f: String) -> Texture2D:
	var p := FX_DIR + f
	return load(p) as Texture2D if ResourceLoader.exists(p) else null

func on_preset(p: int) -> void:
	preset = p

func _soft_texture() -> Texture2D:
	var g := Gradient.new()
	g.set_color(0, Color(1, 1, 1, 1))
	g.set_color(1, Color(1, 1, 1, 0))
	g.add_point(0.5, Color(1, 1, 1, 0.35))
	var gt := GradientTexture2D.new()
	gt.gradient = g
	gt.fill = GradientTexture2D.FILL_RADIAL
	gt.fill_from = Vector2(0.5, 0.5)
	gt.fill_to = Vector2(0.5, 0.0)
	gt.width = 64
	gt.height = 64
	return gt

func _particle_mat(additive := false, atlas: Texture2D = null) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED if (additive or atlas) else BaseMaterial3D.SHADING_MODE_PER_VERTEX
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	if additive:
		m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	m.vertex_color_use_as_albedo = true
	m.albedo_texture = atlas if atlas else soft_tex
	m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	if atlas:
		m.particles_anim_h_frames = 8
		m.particles_anim_v_frames = 8
		m.particles_anim_loop = false
	m.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	m.proximity_fade_enabled = true
	m.proximity_fade_distance = 0.4
	return m

func _ramp(cols: Array) -> GradientTexture1D:
	var g := Gradient.new()
	g.set_color(0, cols[0][1])
	g.set_color(1, cols[cols.size() - 1][1])
	for i in range(1, cols.size() - 1):
		g.add_point(cols[i][0], cols[i][1])
	var t := GradientTexture1D.new()
	t.gradient = g
	return t

func _curve(pts: Array) -> CurveTexture:
	var c := Curve.new()
	for p in pts:
		c.add_point(p)
	var t := CurveTexture.new()
	t.curve = c
	return t

func _quad(mat: Material, offset := Vector3.ZERO) -> QuadMesh:
	var q := QuadMesh.new()
	q.size = Vector2(1, 1)
	q.center_offset = offset
	q.material = mat
	return q

func _jet_particles(dir: Vector3, gs: float) -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.amount = 36
	p.lifetime = 1.0
	p.local_coords = false
	p.emitting = false
	p.visibility_aabb = AABB(Vector3(-8, -8, -8), Vector3(16, 16, 16))
	var pm := ParticleProcessMaterial.new()
	pm.direction = dir
	pm.spread = 9.0
	pm.initial_velocity_min = 6.0
	pm.initial_velocity_max = 12.0
	pm.inherit_velocity_ratio = 0.3
	pm.gravity = Vector3(0, 0.35, 0)
	pm.damping_min = 2.5
	pm.damping_max = 3.5
	pm.scale_min = 0.3 * gs
	pm.scale_max = 0.45 * gs
	pm.scale_curve = _curve([Vector2(0, 1.0), Vector2(1, 4.4)])
	pm.color_ramp = _ramp([[0.0, Color(1, 1, 1, 0.0)], [0.1, Color(0.96, 0.98, 1.0, 0.36)], [0.6, Color(0.94, 0.96, 1.0, 0.16)], [1.0, Color(0.92, 0.94, 0.98, 0.0)]])
	p.process_material = pm
	p.draw_pass_1 = _quad(_particle_mat())
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return p

func _puff(dir: Vector3, gs: float) -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.amount = 3
	p.lifetime = 0.8
	p.one_shot = true
	p.explosiveness = 0.9
	p.local_coords = false
	p.emitting = false
	p.visibility_aabb = AABB(Vector3(-6, -6, -6), Vector3(12, 12, 12))
	var pm := ParticleProcessMaterial.new()
	pm.direction = dir
	pm.spread = 25.0
	pm.initial_velocity_min = 2.4
	pm.initial_velocity_max = 4.8
	pm.inherit_velocity_ratio = 1.0
	pm.damping_min = 2.5
	pm.damping_max = 2.5
	pm.scale_min = 1.3 * gs
	pm.scale_max = 2.4 * gs
	pm.scale_curve = _curve([Vector2(0, 1.0), Vector2(1, 1.15)])
	pm.anim_speed_min = 1.0
	pm.anim_speed_max = 1.0
	pm.color_ramp = _ramp([[0.0, Color(1, 1, 1, 0.0)], [0.08, Color(1, 1, 1, 0.75)], [0.75, Color(1, 1, 1, 0.75)], [1.0, Color(1, 1, 1, 0.0)]])
	p.process_material = pm
	p.draw_pass_1 = _quad(_particle_mat(false, tex_puff) if tex_puff else _particle_mat())
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return p

func _clear() -> void:
	for k in nozzle_fx.keys():
		var f: Dictionary = nozzle_fx[k]
		for key in ["jet", "parts", "puff"]:
			if f.has(key) and is_instance_valid(f[key]):
				f[key].queue_free()
	nozzle_fx.clear()
	for s in smoke:
		if is_instance_valid(s):
			s.queue_free()
	smoke.clear()
	for nd in [billows, ring, trail, sparks]:
		if nd and is_instance_valid(nd):
			nd.queue_free()

func on_car_changed(c) -> void:
	_clear()
	car = c
	if car == null or car.rig == null:
		return
	var idx := 0
	for nz in car.th.all:
		var node: Node3D = car.rig.model.find_child("Exhaust_" + nz.name, true, false)
		var ex_dir := Vector3(0, -1, 0) if nz.group == "side" else (Vector3(0, 0, 1) if nz.front else Vector3(0, 0, -1))
		if node == null:
			node = car.rig.n.get(nz.name)
		elif node.position.length() > 1e-6:
			ex_dir = node.position.normalized()
		if node == null:
			continue
		var gs := 1.0 if nz.group == "rear" else (0.85 if nz.front else 0.7)
		var jet := MeshInstance3D.new()
		jet.mesh = _quad(null)
		var m := ShaderMaterial.new()
		m.shader = jet_shader
		m.set_shader_parameter("atlas", tex_jet)
		m.set_shader_parameter("axis_local", ex_dir)
		jet.material_override = m
		jet.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		jet.extra_cull_margin = 8.0
		jet.visible = false
		node.add_child(jet)
		var parts := _jet_particles(ex_dir, gs)
		node.add_child(parts)
		var puff := _puff(ex_dir, gs)
		node.add_child(puff)
		nozzle_fx[nz.name] = {"jet": jet, "mat": m, "parts": parts, "puff": puff, "dir": ex_dir, "gs": gs, "phase": randf() * 64.0}
		idx += 1
	billows = GPUParticles3D.new()
	billows.amount = 90
	billows.lifetime = 2.5
	billows.local_coords = false
	billows.emitting = false
	billows.visibility_aabb = AABB(Vector3(-25, -5, -25), Vector3(50, 20, 50))
	var bm := ParticleProcessMaterial.new()
	bm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_RING
	bm.emission_ring_axis = Vector3(0, 1, 0)
	bm.emission_ring_radius = 1.4
	bm.emission_ring_inner_radius = 0.3
	bm.emission_ring_height = 0.02
	bm.direction = Vector3(1, 0.05, 0)
	bm.spread = 180.0
	bm.flatness = 0.9
	bm.initial_velocity_min = 1.0
	bm.initial_velocity_max = 2.0
	bm.radial_velocity_min = 2.0
	bm.radial_velocity_max = 4.0
	bm.gravity = Vector3(0, 0.12, 0)
	bm.damping_min = 0.6
	bm.damping_max = 0.9
	bm.scale_min = 1.5
	bm.scale_max = 2.0
	bm.scale_curve = _curve([Vector2(0, 1.0), Vector2(1, 3.2)])
	bm.anim_speed_min = 1.0
	bm.anim_speed_max = 1.0
	bm.color_ramp = _ramp([[0.0, Color(1, 1, 1, 0.0)], [0.1, Color(1, 1, 1, 0.6)], [0.7, Color(1, 1, 1, 0.5)], [1.0, Color(1, 1, 1, 0.0)]])
	billows.process_material = bm
	billows.draw_pass_1 = _quad(_particle_mat(false, tex_ground) if tex_ground else _particle_mat(), Vector3(0, 0.47, 0))
	billows.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	game.world3d.add_child(billows)
	ring = MeshInstance3D.new()
	var pl := PlaneMesh.new()
	pl.size = Vector2(1, 1)
	ring.mesh = pl
	ring_mat = ShaderMaterial.new()
	ring_mat.shader = ring_shader
	ring_mat.set_shader_parameter("atlas", tex_ring)
	ring.material_override = ring_mat
	ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	ring.visible = false
	game.world3d.add_child(ring)
	trail = GPUParticles3D.new()
	trail.amount = 260
	trail.lifetime = 2.2
	trail.local_coords = false
	trail.emitting = false
	trail.visibility_aabb = AABB(Vector3(-60, -5, -60), Vector3(120, 25, 120))
	var tm := ParticleProcessMaterial.new()
	tm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	tm.emission_box_extents = Vector3(0.4, 0.1, 0.4)
	tm.direction = Vector3(0, 0.08, -1)
	tm.spread = 14.0
	tm.initial_velocity_min = 6.0
	tm.initial_velocity_max = 12.0
	tm.inherit_velocity_ratio = 0.3
	tm.gravity = Vector3(0, 1.1, 0)
	tm.damping_min = 2.0
	tm.damping_max = 2.5
	tm.scale_min = 2.4
	tm.scale_max = 3.8
	tm.scale_curve = _curve([Vector2(0, 0.2), Vector2(0.4, 0.8), Vector2(1, 1.0)])
	tm.color_ramp = _ramp([[0.0, Color(1, 1, 1, 0.0)], [0.08, Color(0.98, 0.99, 1.0, 0.55)], [0.5, Color(0.96, 0.97, 1.0, 0.3)], [1.0, Color(0.95, 0.96, 0.98, 0.0)]])
	trail.process_material = tm
	trail.draw_pass_1 = _quad(_particle_mat())
	trail.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	car.rig.model.add_child(trail)
	trail.position = Vector3(0, 0.5, -2.1)
	for w in car.vs.wheels:
		var s := GPUParticles3D.new()
		s.amount = 70
		s.lifetime = 1.8
		s.local_coords = false
		s.emitting = false
		s.visibility_aabb = AABB(Vector3(-30, -5, -30), Vector3(60, 15, 60))
		var sm := ParticleProcessMaterial.new()
		sm.direction = Vector3(0, 1, 0)
		sm.spread = 50.0
		sm.initial_velocity_min = 0.4
		sm.initial_velocity_max = 1.6
		sm.gravity = Vector3(0, 0.35, 0)
		sm.damping_min = 0.8
		sm.damping_max = 1.6
		sm.scale_min = 0.5
		sm.scale_max = 1.1
		sm.scale_curve = _curve([Vector2(0, 0.4), Vector2(1, 3.0)])
		sm.color_ramp = _ramp([[0.0, Color(0.9, 0.9, 0.9, 0.0)], [0.08, Color(0.88, 0.88, 0.9, 0.38)], [1.0, Color(0.85, 0.86, 0.88, 0.0)]])
		s.process_material = sm
		s.draw_pass_1 = _quad(_particle_mat())
		s.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		game.world3d.add_child(s)
		smoke.append(s)
	sparks = GPUParticles3D.new()
	sparks.amount = 90
	sparks.lifetime = 0.5
	sparks.local_coords = false
	sparks.emitting = false
	sparks.visibility_aabb = AABB(Vector3(-20, -5, -20), Vector3(40, 15, 40))
	var spm := ParticleProcessMaterial.new()
	spm.direction = Vector3(0, 1, 0)
	spm.spread = 70.0
	spm.initial_velocity_min = 3.0
	spm.initial_velocity_max = 9.0
	spm.gravity = Vector3(0, -9.8, 0)
	spm.scale_min = 0.025
	spm.scale_max = 0.05
	spm.color_ramp = _ramp([[0.0, Color(1, 0.9, 0.6, 1)], [1.0, Color(1, 0.35, 0.05, 0)]])
	sparks.process_material = spm
	var spmat := _particle_mat(true)
	spmat.albedo_color = Color(4, 3, 2)
	sparks.draw_pass_1 = _quad(spmat)
	sparks.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	game.world3d.add_child(sparks)

func spark_burst(pos: Vector3, amount: float) -> void:
	if sparks == null:
		return
	sparks.global_position = pos
	sparks.amount_ratio = clampf(amount, 0.1, 1.0)
	sparks.emitting = true

func _process(dt: float) -> void:
	var __t0 := Time.get_ticks_usec()
	if car == null or not is_instance_valid(car) or car.wrecked:
		Prof.add("fx_process", Time.get_ticks_usec() - __t0)
		return
	var vis := car.visible
	var night: float = game.sky.night if game.sky else 0.0
	var bright := lerpf(1.0, 0.22, night)
	var cam := get_viewport().get_camera_3d()
	var cam_p: Vector3 = cam.global_position if cam else Vector3.ZERO
	var xf := car.get_global_transform_interpolated()
	var rw := 0.0
	var rp := Vector3.ZERO
	var rh := 0.0
	var boost_v := 0.0
	for nz in car.th.all:
		var f: Dictionary = nozzle_fx.get(nz.name, {})
		if f.is_empty():
			continue
		var v: float = nz.valve if nz.attached and vis else 0.0
		var gs: float = f["gs"]
		var jet: MeshInstance3D = f["jet"]
		var m: ShaderMaterial = f["mat"]
		var exw: Vector3 = xf.basis * (-nz.dir)
		var o: Vector3 = xf * nz.pos + exw * nz.exit
		var down := -exw.y
		jet.visible = v > 0.02
		if jet.visible:
			var ln := 4.0 * (0.45 + 0.4 * v) * gs
			if down > 0.35 and nz.ground_dist < 50.0:
				ln = minf(ln, maxf(0.25, nz.ground_dist - nz.exit + 0.2))
			var ctr := o + exw * ln * 0.488
			var to_cam := cam_p - ctr
			var cosv := absf(exw.dot(to_cam)) / maxf(to_cam.length(), 0.001)
			var a := minf(1.0, 0.45 + 0.75 * v) * minf(1.0, v * 6.0) * (1.0 - clampf((cosv - 0.4) / 0.5, 0.0, 1.0) * 0.85)
			f["phase"] = fmod(float(f["phase"]) + dt * (30.0 + 30.0 * v), 64.0)
			m.set_shader_parameter("len", ln)
			m.set_shader_parameter("wid", 1.25 * (0.7 + 0.3 * v) * gs)
			m.set_shader_parameter("frame", floorf(float(f["phase"])))
			m.set_shader_parameter("alpha", a)
			m.set_shader_parameter("bright", bright)
		var parts: GPUParticles3D = f["parts"]
		parts.emitting = v > 0.03
		parts.amount_ratio = clampf((0.35 + v) * (0.3 if down > 0.5 else 1.0), 0.05, 1.0)
		if (nz.puff == 1 or nz.puff == -1) and vis:
			(f["puff"] as GPUParticles3D).restart()
		if nz.group == "rear" and nz.pitch < 0.3:
			boost_v += v * 0.25
		if v > 0.05 and down > 0.35 and nz.ground_dist < 4.5:
			var reach := nz.ground_dist - nz.exit
			var gp := o + exw * reach
			var w := v * nz.thrust_max * down
			rw += w
			rp += gp * w
			rh += maxf(0.0, o.y - gp.y) * w
	if rw > 0.0:
		var c := rp / rw
		var h := rh / rw
		billows.global_position = c + Vector3(0, 0.02, 0)
		billows.emitting = true
		billows.amount_ratio = clampf(rw / 20000.0, 0.15, 1.0) * clampf(1.3 - h / 4.0, 0.3, 1.0)
		ring.global_position = c + Vector3(0, 0.05, 0)
		ring.scale = Vector3.ONE * minf(9.0, 4.0 + 1.5 * h)
	else:
		billows.emitting = false
	var ring_t := clampf(1.0 - (rh / rw if rw > 0.0 else 9.0) / 4.5, 0.0, 1.0) * minf(1.0, rw / 14000.0)
	ring_a = lerpf(ring_a, ring_t, minf(1.0, dt * (4.0 if ring_t > ring_a else 0.8)))
	ring.visible = ring_a > 0.01
	if ring.visible:
		ring_phase = fmod(ring_phase + dt * 20.0, 64.0)
		ring.rotation.y += dt * 0.1
		ring_mat.set_shader_parameter("frame", floorf(ring_phase))
		ring_mat.set_shader_parameter("alpha", ring_a)
		ring_mat.set_shader_parameter("bright", bright)
	trail.emitting = boost_v > 0.6 and car.vs.contacts > 0 and vis
	trail.amount_ratio = clampf(boost_v, 0.2, 1.0)
	for i in car.vs.wheels.size():
		var w = car.vs.wheels[i]
		var s: GPUParticles3D = smoke[i]
		var on: bool = w.contact and w.slip_vel > 4.5 and vis
		s.emitting = on
		if on:
			s.global_position = w.point + Vector3(0, 0.15, 0)
			s.amount_ratio = clampf((w.slip_vel - 4.5) / 12.0, 0.15, 1.0)
	if car.scrape > 0.25 and vis:
		var p := car.global_transform * Vector3(0, 0.15, 0)
		spark_burst(p, car.scrape)
	elif sparks:
		sparks.emitting = false
	Prof.add("fx_process", Time.get_ticks_usec() - __t0)

func _physics_process(_dt: float) -> void:
	var __t0 := Time.get_ticks_usec()
	if car == null or not is_instance_valid(car) or car.wrecked or not car.visible:
		Prof.add("fx_push", Time.get_ticks_usec() - __t0)
		return
	push_tick += 1
	if push_tick % 2 != 0:
		Prof.add("fx_push", Time.get_ticks_usec() - __t0)
		return
	var space := car.get_world_3d().direct_space_state
	var groups := {"rear": [Vector3.ZERO, 0.0, Vector3.ZERO], "front": [Vector3.ZERO, 0.0, Vector3.ZERO], "side": [Vector3.ZERO, 0.0, Vector3.ZERO]}
	var xf := car.global_transform
	for nz in car.th.all:
		if nz.valve < 0.08 or not nz.attached:
			continue
		var g: Array = groups[nz.group]
		var t: float = nz.valve * nz.thrust_max
		g[0] += (xf * nz.pos) * t
		g[1] += t
		g[2] += (xf.basis * (-nz.dir)) * t
	var q := PhysicsShapeQueryParameters3D.new()
	var sph := SphereShape3D.new()
	q.shape = sph
	q.collision_mask = Car.LAYER_PROPS | Car.LAYER_DEBRIS
	for k in groups.keys():
		var g: Array = groups[k]
		if g[1] < 300.0:
			continue
		var origin: Vector3 = g[0] / g[1]
		var dir: Vector3 = (g[2] as Vector3).normalized()
		var thrust: float = g[1]
		for dist in [1.8, 4.0]:
			var c: Vector3 = origin + dir * dist
			var hit := space.intersect_ray(PhysicsRayQueryParameters3D.create(origin, c, Car.LAYER_WORLD))
			if not hit.is_empty() and dist > 1.8:
				c = hit.position + Vector3.UP * 0.3
			sph.radius = 1.2 + dist * 0.45
			q.transform = Transform3D(Basis.IDENTITY, c)
			for r in space.intersect_shape(q, 12):
				var body = r["collider"]
				if body is RigidBody3D and body != car:
					var rb: RigidBody3D = body
					var away: Vector3 = rb.global_position - c
					away.y = maxf(away.y, 0.2)
					var push := (dir * 0.6 + away.normalized() * 0.6).normalized()
					var f: float = thrust * 0.05 / (1.0 + float(dist) * float(dist) * 0.35)
					rb.apply_central_impulse(push * f * 2.0 / 120.0 * 2.0)
					rb.sleeping = false
	Prof.add("fx_push", Time.get_ticks_usec() - __t0)
