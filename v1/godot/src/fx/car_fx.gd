# CarFx: thruster plumes, condensation particles and valve puffs per nozzle, ground dust ring, tyre smoke, sparks, and thrust pushing light props.
extends Node

var game
var car: Car
var nozzle_fx: Dictionary = {}
var dust: GPUParticles3D
var smoke: Array = []
var sparks: GPUParticles3D
var soft_tex: Texture2D
var plume_shader: Shader
var push_tick := 0
var preset := 2

func setup(g) -> void:
	game = g
	name = "CarFx"
	plume_shader = load("res://src/fx/plume.gdshader")
	soft_tex = _soft_texture()
	on_car_changed(game.car)

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

func _particle_mat(col0: Color, col1: Color, additive := false) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED if additive else BaseMaterial3D.SHADING_MODE_PER_VERTEX
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	if additive:
		m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	m.vertex_color_use_as_albedo = true
	m.albedo_texture = soft_tex
	m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
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

func _jet(dir: Vector3) -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.amount = 56
	p.lifetime = 0.32
	p.local_coords = false
	p.emitting = false
	p.fixed_fps = 0
	p.visibility_aabb = AABB(Vector3(-6, -6, -6), Vector3(12, 12, 12))
	var pm := ParticleProcessMaterial.new()
	pm.direction = dir
	pm.spread = 7.0
	pm.initial_velocity_min = 16.0
	pm.initial_velocity_max = 28.0
	pm.gravity = Vector3(0, 0.6, 0)
	pm.damping_min = 30.0
	pm.damping_max = 55.0
	pm.scale_min = 0.1
	pm.scale_max = 0.2
	pm.scale_curve = _curve([Vector2(0, 0.3), Vector2(0.35, 1.0), Vector2(1, 1.6)])
	pm.color_ramp = _ramp([[0.0, Color(1, 1, 1, 0.0)], [0.08, Color(0.96, 0.98, 1.0, 0.32)], [0.5, Color(0.92, 0.95, 1.0, 0.1)], [1.0, Color(0.9, 0.93, 0.97, 0.0)]])
	p.process_material = pm
	var q := QuadMesh.new()
	q.size = Vector2(1, 1)
	q.material = _particle_mat(Color.WHITE, Color.WHITE)
	p.draw_pass_1 = q
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return p

func _puff(dir: Vector3) -> GPUParticles3D:
	var p := _jet(dir)
	p.amount = 18
	p.lifetime = 0.55
	p.one_shot = true
	p.explosiveness = 0.95
	var pm: ParticleProcessMaterial = p.process_material
	pm.spread = 35.0
	pm.initial_velocity_min = 4.0
	pm.initial_velocity_max = 10.0
	pm.damping_min = 12.0
	pm.damping_max = 20.0
	pm.scale_min = 0.25
	pm.scale_max = 0.5
	pm.scale_curve = _curve([Vector2(0, 0.5), Vector2(1, 2.4)])
	pm.color_ramp = _ramp([[0.0, Color(1, 1, 1, 0.7)], [0.4, Color(0.95, 0.97, 1.0, 0.3)], [1.0, Color(0.9, 0.93, 0.97, 0.0)]])
	return p

func on_car_changed(c) -> void:
	for k in nozzle_fx.keys():
		var f: Dictionary = nozzle_fx[k]
		for key in ["plume", "jet", "puff"]:
			if f.has(key) and is_instance_valid(f[key]):
				f[key].queue_free()
	nozzle_fx.clear()
	for s in smoke:
		if is_instance_valid(s):
			s.queue_free()
	smoke.clear()
	if dust and is_instance_valid(dust):
		dust.queue_free()
	if sparks and is_instance_valid(sparks):
		sparks.queue_free()
	car = c
	if car == null or car.rig == null:
		return
	for nz in car.th.all:
		var node: Node3D = car.rig.model.find_child("Exhaust_" + nz.name, true, false)
		if node == null:
			node = car.rig.n.get(nz.name)
		if node == null:
			continue
		var ex_dir := Vector3(0, 0, 1) if nz.front else Vector3(0, 0, -1)
		var plume := MeshInstance3D.new()
		var cm := CylinderMesh.new()
		cm.top_radius = 0.6
		cm.bottom_radius = 1.0
		cm.height = 1.0
		cm.radial_segments = 20
		cm.rings = 6
		cm.cap_top = false
		cm.cap_bottom = false
		plume.mesh = cm
		var m := ShaderMaterial.new()
		m.shader = plume_shader
		m.set_shader_parameter("seed", float(nozzle_fx.size()) * 17.3)
		plume.material_override = m
		plume.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		plume.visible = false
		node.add_child(plume)
		var jet := _jet(ex_dir)
		node.add_child(jet)
		var puff := _puff(ex_dir)
		node.add_child(puff)
		nozzle_fx[nz.name] = {"plume": plume, "mat": m, "jet": jet, "puff": puff, "dir": ex_dir}
	dust = GPUParticles3D.new()
	dust.amount = 220
	dust.lifetime = 1.4
	dust.local_coords = false
	dust.emitting = false
	dust.visibility_aabb = AABB(Vector3(-20, -5, -20), Vector3(40, 15, 40))
	var dm := ParticleProcessMaterial.new()
	dm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_RING
	dm.emission_ring_axis = Vector3(0, 1, 0)
	dm.emission_ring_radius = 1.6
	dm.emission_ring_inner_radius = 0.6
	dm.emission_ring_height = 0.05
	dm.direction = Vector3(1, 0.15, 0)
	dm.spread = 180.0
	dm.flatness = 0.85
	dm.initial_velocity_min = 4.0
	dm.initial_velocity_max = 11.0
	dm.radial_velocity_min = 5.0
	dm.radial_velocity_max = 10.0
	dm.gravity = Vector3(0, 0.4, 0)
	dm.damping_min = 3.0
	dm.damping_max = 6.0
	dm.scale_min = 0.6
	dm.scale_max = 1.5
	dm.scale_curve = _curve([Vector2(0, 0.4), Vector2(1, 2.2)])
	dm.color_ramp = _ramp([[0.0, Color(0.72, 0.68, 0.62, 0.0)], [0.1, Color(0.72, 0.69, 0.64, 0.32)], [1.0, Color(0.75, 0.72, 0.68, 0.0)]])
	dust.process_material = dm
	var dq := QuadMesh.new()
	dq.size = Vector2(1, 1)
	dq.material = _particle_mat(Color.WHITE, Color.WHITE)
	dust.draw_pass_1 = dq
	dust.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	game.world3d.add_child(dust)
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
		var sq := QuadMesh.new()
		sq.size = Vector2(1, 1)
		sq.material = _particle_mat(Color.WHITE, Color.WHITE)
		s.draw_pass_1 = sq
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
	var sq2 := QuadMesh.new()
	sq2.size = Vector2(1, 1)
	var spmat := _particle_mat(Color.WHITE, Color.WHITE, true)
	spmat.albedo_color = Color(4, 3, 2)
	sq2.material = spmat
	sparks.draw_pass_1 = sq2
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
	var any_down := 0.0
	var down_pt := Vector3.ZERO
	var down_n := 0.0
	for nz in car.th.all:
		var f: Dictionary = nozzle_fx.get(nz.name, {})
		if f.is_empty():
			continue
		var v: float = nz.valve if nz.attached and vis else 0.0
		var plume: MeshInstance3D = f["plume"]
		var boost: float = 1.0 if (not nz.front and nz.pitch < 0.35) else 0.0
		var length := (0.35 + 1.5 * v + boost * v * 1.2) * (0.7 + 0.3 * nz.ground_gain)
		var width := 0.06 + 0.16 * v + boost * v * 0.06
		plume.visible = v > 0.02
		if plume.visible:
			var d: Vector3 = f["dir"]
			var b := Basis(Vector3.RIGHT, PI * 0.5 if not nz.front else -PI * 0.5)
			plume.transform = Transform3D(b * Basis.from_scale(Vector3(width, length, width)), d * (length * 0.5))
			(f["mat"] as ShaderMaterial).set_shader_parameter("strength", clampf(v * 1.1, 0.0, 1.2))
		var jet: GPUParticles3D = f["jet"]
		jet.emitting = v > 0.03
		jet.amount_ratio = clampf(v, 0.0, 1.0)
		if nz.puff == 1 and vis:
			(f["puff"] as GPUParticles3D).restart()
		if v > 0.05 and nz.ground_dist < 3.2:
			var w := v * (1.0 - nz.ground_dist / 3.2)
			var exw: Vector3 = car.global_transform.basis * (-nz.dir)
			var ex_origin: Vector3 = car.global_transform * nz.pos
			down_pt += (ex_origin + exw * nz.ground_dist) * w
			down_n += w
			any_down += w
	if down_n > 0.01:
		dust.global_position = down_pt / down_n + Vector3(0, 0.05, 0)
		dust.emitting = true
		dust.amount_ratio = clampf(any_down * 0.6, 0.05, 1.0)
	else:
		dust.emitting = false
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
	var groups := {"rear": [Vector3.ZERO, 0.0, Vector3.ZERO], "front": [Vector3.ZERO, 0.0, Vector3.ZERO]}
	var xf := car.global_transform
	for nz in car.th.all:
		if nz.valve < 0.08 or not nz.attached:
			continue
		var g: Array = groups["front" if nz.front else "rear"]
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

