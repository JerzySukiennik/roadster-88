# Scenario: scripted inputs and camera moves for screenshots and frame-time measurement (--scenario=<name>), then quits.
extends Node

const MPH := 0.44704

var game
var sname := ""
var out_dir := ""
var times: PackedFloat32Array = PackedFloat32Array()
var gpu: PackedFloat32Array = PackedFloat32Array()
var measuring := false
var vp_rid: RID

func start(g, n: String) -> void:
	game = g
	Prof.enabled = true
	sname = n
	out_dir = ProjectSettings.globalize_path("res://").path_join("../Niepotrzebne/shots-godot").simplify_path()
	DirAccess.make_dir_recursive_absolute(out_dir)
	vp_rid = get_viewport().get_viewport_rid()
	RenderingServer.viewport_set_measure_render_time(vp_rid, true)
	_run.call_deferred()

var spikes: Array = []
var t_run := 0.0

func _process(dt: float) -> void:
	t_run += dt
	if measuring:
		times.append(dt * 1000.0)
		gpu.append(RenderingServer.viewport_get_measured_render_time_gpu(vp_rid))
		if dt > 0.03:
			spikes.append("%.2fs:%.0fms(gpu %.0f)" % [t_run, dt * 1000.0, RenderingServer.viewport_get_measured_render_time_gpu(vp_rid)])

func inp() -> CarInput:
	return game.car.input

func wait(t: float) -> void:
	await get_tree().create_timer(t, true, true).timeout

func frames(n: int) -> void:
	for k in n:
		await get_tree().process_frame

func shot(tag: String) -> void:
	print("shot begin ", tag)
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	var p := out_dir.path_join("%s_%s.png" % [sname, tag])
	img.save_png(p)
	print("shot ", p)

func cam_at(pos: Vector3, look: Vector3, fov := 50.0) -> void:
	var xf := Transform3D(Basis.IDENTITY, pos).looking_at(look, Vector3.UP)
	game.cam.override_xf = xf
	game.cam.fov = fov

func cam_free() -> void:
	game.cam.override_xf = null

func car_pos() -> Vector3:
	return game.car.global_position

func report() -> void:
	if times.is_empty():
		return
	var a := Array(times)
	a.sort()
	var g := Array(gpu)
	g.sort()
	var avg := 0.0
	for x in a:
		avg += x
	avg /= a.size()
	var gavg := 0.0
	for x in g:
		gavg += x
	gavg /= maxf(g.size(), 1)
	var p99: float = a[int(a.size() * 0.99) - 1] if a.size() > 2 else a[0]
	var gp99: float = g[int(g.size() * 0.99) - 1] if g.size() > 2 else 0.0
	var line := "FRAMES %s: n=%d frame avg %.2f ms p99 %.2f ms max %.2f | gpu avg %.2f ms p99 %.2f ms | preset %d scale %.2f window %s" % [sname, a.size(), avg, p99, a[a.size() - 1], gavg, gp99, game.preset, get_viewport().scaling_3d_scale, str(DisplayServer.window_get_size())]
	print(line)
	print("PROF ", Prof.report(a.size()))
	print("RENDER draw calls %d objects %d primitives %d  video mem %.0f MB  physics frame %.2f ms" % [Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME), Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME), Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME), Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED) / 1048576.0, Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0])
	if not spikes.is_empty():
		print("SPIKES ", spikes.size(), ": ", " ".join(PackedStringArray(spikes.slice(0, 24))))
	var f := FileAccess.open(out_dir.path_join("frametimes.txt"), FileAccess.READ_WRITE if FileAccess.file_exists(out_dir.path_join("frametimes.txt")) else FileAccess.WRITE)
	f.seek_end()
	f.store_line(Time.get_datetime_string_from_system() + " " + line)
	f.close()

func _run() -> void:
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	DisplayServer.window_set_flag(DisplayServer.WINDOW_FLAG_ALWAYS_ON_TOP, true)
	DisplayServer.window_move_to_foreground()
	await frames(5)
	if has_method("sc_" + sname):
		await call("sc_" + sname)
	else:
		push_error("unknown scenario " + sname)
	report()
	get_tree().quit()

func sc_idle() -> void:
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	print("idle start")
	await wait(2.5)
	print("idle measuring")
	measuring = true
	await wait(3.0)
	measuring = false
	await shot("chase")
	var p := car_pos()
	cam_at(p + Vector3(4.2, 1.1, 5.6), p + Vector3(0, 0.55, 0.2), 38.0)
	await wait(1.2)
	await shot("front34")
	cam_at(p + Vector3(-4.5, 1.3, -5.2), p + Vector3(0, 0.6, -0.4), 38.0)
	await wait(1.2)
	await shot("rear34")
	cam_at(p + Vector3(0.1, 6.5, 1.0), p + Vector3(0, 0.4, 0.0), 45.0)
	await wait(1.2)
	await shot("top")
	cam_at(p + Vector3(6.5, 0.7, 0.2), p + Vector3(0, 0.55, 0.2), 40.0)
	await wait(1.2)
	await shot("side")

func measure(label: String, secs := 2.0) -> String:
	await wait(0.8)
	times.clear()
	gpu.clear()
	measuring = true
	await wait(secs)
	measuring = false
	var avg := 0.0
	for x in times:
		avg += x
	avg /= maxf(times.size(), 1)
	var ga := 0.0
	for x in gpu:
		ga += x
	ga /= maxf(gpu.size(), 1)
	var s := "%-28s frame %6.2f ms  gpu %6.2f ms" % [label, avg, ga]
	print("PERF ", s)
	return s

func _gpu_avg(secs: float) -> float:
	await wait(0.4)
	gpu.clear()
	times.clear()
	measuring = true
	await wait(secs)
	measuring = false
	var ga := 0.0
	for x in gpu:
		ga += x
	return ga / maxf(gpu.size(), 1)

func ab(label: String, on: Callable, off: Callable) -> String:
	var a1: float = await _gpu_avg(1.0)
	on.call()
	var b: float = await _gpu_avg(1.0)
	off.call()
	var a2: float = await _gpu_avg(1.0)
	var a := (a1 + a2) * 0.5
	var s := "%-26s base %6.2f  with %6.2f  delta %+6.2f ms" % [label, a, b, b - a]
	print("PERF ", s)
	return s

func sc_perf() -> void:
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	var env: Environment = game.sky.env
	await place(Vector3(0, 0.05, 40), 0.0)
	await wait(3.0)
	var lines := []
	var sun: DirectionalLight3D = game.sky.sun
	var model: Node3D = game.car.rig.model
	lines.append(await ab("no SSR", func(): env.ssr_enabled = false, func(): env.ssr_enabled = true))
	lines.append(await ab("no SSAO", func(): env.ssao_enabled = false, func(): env.ssao_enabled = true))
	lines.append(await ab("no glow", func(): env.glow_enabled = false, func(): env.glow_enabled = true))
	lines.append(await ab("no sun shadows", func(): sun.shadow_enabled = false, func(): sun.shadow_enabled = true))
	lines.append(await ab("2 shadow splits", func(): sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS, func(): sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS))
	lines.append(await ab("car hidden", func(): model.visible = false, func(): model.visible = true))
	lines.append(await ab("motion blur on", func(): game.post.blur.intensity = 0.6, func(): game.post.blur.intensity = 0.0))
	lines.append(await ab("SSIL on", func(): env.ssil_enabled = true, func(): env.ssil_enabled = false))
	lines.append(await ab("volumetric fog on", func(): env.volumetric_fog_enabled = true, func(): env.volumetric_fog_enabled = false))
	lines.append(await ab("SDFGI on", func(): env.sdfgi_enabled = true, func(): env.sdfgi_enabled = false))
	lines.append(await ab("TAA off", func(): get_viewport().use_taa = false, func(): get_viewport().use_taa = true))
	lines.append(await ab("scale 0.7 FSR2", func(): (func(): get_viewport().scaling_3d_mode = Viewport.SCALING_3D_MODE_FSR2; get_viewport().scaling_3d_scale = 0.7).call(), func(): (func(): get_viewport().scaling_3d_mode = Viewport.SCALING_3D_MODE_BILINEAR; get_viewport().scaling_3d_scale = 1.0).call()))
	lines.append("physics frame ms %.2f" % (Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0))
	var base: float = await _gpu_avg(2.0)
	lines.append("high default gpu %.2f ms, frame %.2f ms" % [base, _avg(times)])
	var f := FileAccess.open(out_dir.path_join("perf.txt"), FileAccess.WRITE)
	f.store_line("window %s  %s" % [str(DisplayServer.window_get_size()), Time.get_datetime_string_from_system()])
	for l in lines:
		f.store_line(l)
	f.close()

func _avg(a: PackedFloat32Array) -> float:
	var s := 0.0
	for x in a:
		s += x
	return s / maxf(a.size(), 1)

func sc_look() -> void:
	await wait(2.0)
	var p := car_pos()
	cam_at(p + Vector3(4.2, 1.1, 5.6), p + Vector3(0, 0.55, 0.2), 38.0)
	var sm: ShaderMaterial = game.sky.sky_mat
	for e in [0.18, 0.28, 0.4]:
		sm.set_shader_parameter("exposure", e)
		game.sky.set_time(10, 15, 14.0)
		await wait(1.5)
		await shot("exp%.2f" % e)

func place(pos: Vector3, yaw: float, speed := 0.0) -> void:
	var b := Basis(Vector3.UP, yaw)
	game.car.teleport(Transform3D(b, pos), speed)
	game.cam.initialized = false
	await physics_frames(2)

func physics_frames(n: int) -> void:
	for k in n:
		await get_tree().physics_frame

func hold(t: float, f: Callable = Callable()) -> void:
	var t0 := Time.get_ticks_msec()
	while Time.get_ticks_msec() - t0 < int(t * 1000.0):
		if f.is_valid():
			f.call()
		await get_tree().physics_frame

func mph() -> float:
	return game.car.linear_velocity.length() / MPH

func chase_shot(tag: String) -> void:
	cam_free()
	await shot(tag)

func sc_launch() -> void:
	await place(Vector3(0, 0.05, 0), 0.0)
	await wait(1.5)
	measuring = true
	Prof.reset()
	inp().throttle = 1.0
	await wait(0.45)
	await shot("chase_0.45s")
	while mph() < 60.0:
		await get_tree().physics_frame
	await shot("chase_60mph")
	await wait(1.0)
	measuring = false
	inp().throttle = 0.0
	inp().brake = 1.0
	var p := car_pos()
	cam_at(p + Vector3(5.0, 1.0, 22.0), p + Vector3(0, 0.5, 14.0), 40.0)
	await wait(0.6)
	await shot("braking_side")
	inp().brake = 0.0

func sc_boost() -> void:
	await place(Vector3(0, 0.05, 0), 0.0)
	await wait(1.5)
	measuring = true
	inp().throttle = 1.0
	inp().boost = true
	await wait(0.35)
	await shot("chase")
	var p := car_pos()
	var f: Vector3 = game.car.global_transform.basis.z
	var r: Vector3 = game.car.global_transform.basis.x
	cam_at(p - f * 3.5 + r * 4.5 + Vector3(0, 1.0, 0), p - f * 2.0 + Vector3(0, 0.35, 0), 45.0)
	await get_tree().process_frame
	await shot("rear_plumes")
	await wait(1.0)
	measuring = false
	inp().boost = false
	inp().throttle = 0.0

func sc_hop() -> void:
	await place(Vector3(140, 4.05, 150), 0.0, 0.0)
	await wait(1.0)
	inp().throttle = 1.0
	while car_pos().z < 196.0:
		await get_tree().physics_frame
	inp().lift = true
	await wait(0.2)
	inp().lift = false
	inp().throttle = 0.6
	cam_at(Vector3(118, 7.0, 225), Vector3(140, 3.5, 225), 55.0)
	var tt0 := Time.get_ticks_msec()
	while car_pos().z < 222.0 and Time.get_ticks_msec() - tt0 < 4000:
		print("hop dbg pos ", car_pos(), " v ", game.car.linear_velocity, " mode ", game.car.fc.mode_name())
		await get_tree().physics_frame
	await shot("over_gap_side")
	cam_free()
	await wait(0.15)
	await shot("over_gap_chase")
	await wait(1.4)
	inp().throttle = 0.0
	inp().brake = 1.0
	await shot("landed")
	inp().brake = 0.0

func sc_hover() -> void:
	await place(Vector3(-20, 0.05, 80), 0.3)
	await wait(1.0)
	inp().lift = true
	await wait(0.75)
	inp().lift = false
	await wait(2.0)
	measuring = true
	var p := car_pos()
	cam_at(p + Vector3(5.5, 0.6, 3.5), p + Vector3(0, 0.3, 0), 50.0)
	await wait(0.4)
	await shot("hover_low_side")
	inp().steer = 1.0
	await wait(1.6)
	await shot("hover_yaw")
	cam_free()
	await wait(1.0)
	await shot("hover_yaw_chase")
	inp().steer = 0.0
	measuring = false
	print("hover yaw rate deg/s ", rad_to_deg(game.car.angular_velocity.y), " height ", car_pos().y)

func sc_fly_land() -> void:
	var pad: Vector3 = game.plate.pads[25]
	await place(pad + Vector3(30, -25.0 + 0.05, -60), 0.0)
	await wait(1.0)
	measuring = true
	var phase := 0
	var shot_air := false
	var pwm := 0.0
	var t0 := Time.get_ticks_msec()
	while Time.get_ticks_msec() - t0 < 45000:
		var p := car_pos()
		var to := pad - p
		var c: Car = game.car
		var i := inp()
		i.clear()
		var b := c.global_transform.basis
		var f := Vector3(b.z.x, 0, b.z.z).normalized()
		var l := Vector3(b.x.x, 0, b.x.z).normalized()
		var head := atan2(f.x, f.z)
		var want := atan2(to.x, to.z)
		var dh := wrapf(want - head, -PI, PI)
		var hd := Vector2(to.x, to.z).length()
		var v := c.linear_velocity
		var vh := Vector2(v.x, v.z).length()
		if phase == 0:
			i.lift = true
			if p.y > pad.y + 7.0:
				phase = 1
		elif phase == 1:
			i.steer = clampf(dh * 1.5, -1.0, 1.0)
			if p.y < pad.y + 6.0:
				i.lift = true
			if absf(dh) < 0.3 and vh < 12.0 and hd > 18.0:
				i.throttle = 1.0
			if hd < 18.0:
				phase = 2
			if not shot_air and hd < 26.0:
				shot_air = true
				await shot("approach")
		else:
			var ef := Vector3(to.x, 0, to.z).dot(f)
			var el := Vector3(to.x, 0, to.z).dot(l)
			var vf := Vector3(v.x, 0, v.z).dot(f)
			var vl := Vector3(v.x, 0, v.z).dot(l)
			if hd > 1.2:
				i.steer = clampf(dh * 1.2, -1.0, 1.0) * (1.0 if ef > 0.0 else 0.0)
			var want_v := clampf(ef * 0.35, -2.5, 3.5)
			var acc := (want_v - vf) * 1.6
			if acc > 0.0 and absf(dh) < 0.6:
				pwm += clampf(acc / 8.5, 0.0, 1.0)
				if pwm >= 1.0:
					pwm -= 1.0
					i.throttle = 1.0
			elif acc < 0.0:
				pwm += clampf(-acc / 6.9, 0.0, 1.0)
				if pwm >= 1.0:
					pwm -= 1.0
					i.brake = 1.0
			if p.y < pad.y + 2.5 and hd > 2.0:
				i.lift = true
			elif p.y > pad.y + 4.5:
				i.descend = true
			if hd < 2.5 and vh < 1.5:
				phase = 3
			if Engine.get_physics_frames() % 120 == 0:
				print("fly dbg phase ", phase, " hd ", hd, " vh ", vh, " y ", p.y - pad.y, " ef ", ef, " el ", el)
		if phase == 3:
			var ef2 := Vector3(to.x, 0, to.z).dot(f)
			var el2 := Vector3(to.x, 0, to.z).dot(l)
			var vf2 := Vector3(v.x, 0, v.z).dot(f)
			var vl2 := Vector3(v.x, 0, v.z).dot(l)
			var acc2 := (clampf(ef2 * 0.35, -1.0, 1.0) - vf2) * 1.6
			pwm += clampf(absf(acc2) / 8.0, 0.0, 1.0)
			if pwm >= 1.0:
				pwm -= 1.0
				if acc2 > 0.0:
					i.throttle = 1.0
				else:
					i.brake = 1.0
			i.descend = true
			if c.fc.mode == FlightComputer.GROUND:
				break
		await get_tree().physics_frame
	inp().clear()
	measuring = false
	await wait(1.5)
	var p2 := car_pos()
	cam_at(p2 + Vector3(9.0, 4.0, -9.0), p2 + Vector3(0, 0.4, 0), 50.0)
	await wait(0.5)
	await shot("landed_pad")
	print("landed at ", p2, " pad ", pad, " dist ", Vector2(p2.x - pad.x, p2.z - pad.z).length(), " mode ", game.car.fc.mode_name())

func _crash(speed_mph: float, tag: String) -> void:
	var wall_z := 259.4
	var target := Vector3(-130, 0.05, wall_z - 40.0)
	await place(target, 0.0, speed_mph * MPH)
	measuring = true
	inp().throttle = 1.0
	var t0 := Time.get_ticks_msec()
	while game.car.global_position.z < wall_z - 6.0 and Time.get_ticks_msec() - t0 < 6000:
		var v: float = game.car.linear_velocity.dot(game.car.global_transform.basis.z) / MPH
		inp().throttle = clampf((speed_mph - v) * 0.3 + 0.3, 0.0, 1.0)
		await get_tree().physics_frame
	print("impact speed mph ", mph())
	inp().throttle = 0.0
	await wait(0.12)
	await shot("impact")
	await wait(1.3)
	measuring = false
	var p := car_pos()
	cam_at(p + Vector3(4.5, 1.6, -5.0), p + Vector3(0, 0.5, 0.6), 45.0)
	await wait(0.5)
	await shot("after_34")
	cam_at(p + Vector3(6.0, 1.0, -0.2), p + Vector3(0, 0.5, 0.0), 45.0)
	await wait(0.4)
	await shot("after_side")
	var dmg = game.car.damage
	if dmg:
		print("lattice: broken beams ", dmg.lat.broken_count, " plastic ", dmg.lat.plastic_total, " cost/step ms ", dmg.lat.cost_ms, " crush ", dmg.lat.crush_extent())

func sc_crash30() -> void:
	await _crash(30.0, "30")

func sc_crash80() -> void:
	await _crash(80.0, "80")

func sc_crash200() -> void:
	await _crash(200.0, "200")
	await wait(0.5)
	game.respawn()
	await wait(1.0)
	var p := car_pos()
	cam_at(p + Vector3(9, 3, -8), p + Vector3(-2.5, 0.5, 0), 50.0)
	await wait(0.5)
	await shot("respawn_next_to_wreck")

func sc_timejump() -> void:
	await place(Vector3(0, 0.05, 50), 0.0, 60.0 * MPH)
	game.tt.set_destination(game.tt.ERAS[2]["date"])
	game.tt.toggle_arm()
	await wait(0.3)
	inp().throttle = 0.35
	while mph() < 80.0:
		await get_tree().physics_frame
	await shot("buildup_80")
	inp().throttle = 0.2
	while game.tt.phase == 0:
		await get_tree().physics_frame
	await wait(0.05)
	await shot("flash")
	await wait(0.45)
	await shot("trails_hold")
	await wait(0.3)
	var p: Vector3 = game.tt.vanish_pos
	cam_at(p + Vector3(5, 1.5, 12), p + Vector3(0, 0.3, 4), 55)
	await wait(0.1)
	await shot("trails_side")
	cam_free()
	while game.tt.phase != 3:
		await get_tree().physics_frame
	await wait(0.25)
	await shot("arrival")
	await wait(0.8)
	await shot("arrival_frost")
	inp().throttle = 0.0

func sc_fpp_tap() -> void:
	await place(Vector3(0, 0.05, 0), 0.0)
	game.cam.fpp = true
	game.cockpit.on_view_changed(true)
	await wait(1.5)
	await shot("fpp_forward")
	game.cam.head_yaw = deg_to_rad(-16.0)
	game.cam.head_pitch = deg_to_rad(-24.0)
	await wait(0.8)
	await shot("fpp_screen")
	game.cockpit.tap()
	await wait(0.6)
	game.cam.head_yaw = deg_to_rad(-30.0)
	game.cam.head_pitch = deg_to_rad(-26.0)
	await wait(0.4)
	game.cockpit.tap()
	await wait(0.8)
	await shot("fpp_after_tap")
	game.cam.head_yaw = deg_to_rad(40.0)
	game.cam.head_pitch = deg_to_rad(-10.0)
	await wait(0.6)
	await shot("fpp_look_left")
	game.cam.fpp = false

func sc_night() -> void:
	await place(Vector3(0, 0.05, 50), 0.0, 75.0 * MPH)
	game.tt.set_destination({"y": 2080, "m": 6, "d": 21, "h": 22, "min": 40, "has_date": true})
	game.tt.toggle_arm()
	inp().throttle = 0.5
	while game.tt.phase == 0:
		await get_tree().physics_frame
	while game.tt.phase != 3:
		await get_tree().physics_frame
	inp().throttle = 0.0
	await wait(1.2)
	await shot("arrival_night_chase")
	inp().brake = 1.0
	await wait(3.0)
	inp().brake = 0.0
	var p := car_pos()
	cam_at(p + Vector3(4.0, 1.0, 6.5), p + Vector3(0, 0.55, 0.0), 42.0)
	await wait(0.8)
	await shot("night_front34")
	cam_at(p + Vector3(-3.5, 1.2, -6.5), p + Vector3(0, 0.6, 0.0), 42.0)
	await wait(0.6)
	await shot("night_rear34")

func sc_debug_interior() -> void:
	await place(Vector3(0, 0.05, 0), 0.0)
	await wait(1.0)
	var m: Node3D = game.car.rig.model
	for nm in ["Body_Shell", "Hood", "Door_L", "Door_R", "Bumper_F", "Glass_Windshield", "Roof_Targa", "Glass_Door_L", "Glass_Door_R"]:
		var nd := m.find_child(nm, true, false)
		if nd:
			nd.visible = false
	var p := car_pos()
	cam_at(p + Vector3(2.2, 2.0, -1.5), p + Vector3(0.2, 0.6, 0.3), 50.0)
	await wait(0.5)
	await shot("cutaway")
	for k in m.get_children():
		print("child ", k.name, " ", k.get_class(), " ", k.position, " vis ", k.visible, (" aabb " + str((k as MeshInstance3D).get_aabb())) if k is MeshInstance3D else "")

func sc_debug_fpp() -> void:
	await place(Vector3(0, 0.05, 0), 0.0)
	game.cam.fpp = true
	game.cockpit.on_view_changed(true)
	await wait(1.0)
	print("cam ", game.cam.global_position, " car ", car_pos(), " fov ", game.cam.fov)
	await shot("a_all")
	var m: Node3D = game.car.rig.model
	for nm in ["Hood", "Bumper_F"]:
		m.find_child(nm, true, false).visible = false
	await wait(0.3)
	await shot("b_nohood")
	for nm in ["Body_Shell"]:
		m.find_child(nm, true, false).visible = false
	await wait(0.3)
	await shot("c_nobody")

func sc_driver() -> void:
	await place(Vector3(0, 0.05, 0), 0.0)
	game.set_roof(false)
	var t0 := Time.get_ticks_msec()
	while (game.driver == null or not game.driver.loaded_body or not game.driver.task_ids.is_empty()) and Time.get_ticks_msec() - t0 < 30000:
		await get_tree().process_frame
	print("driver loaded in ", Time.get_ticks_msec() - t0, " ms")
	await wait(1.0)
	var p := car_pos()
	cam_at(p + Vector3(1.6, 2.2, 0.6), p + Vector3(0.38, 0.75, -0.2), 45.0)
	await wait(0.5)
	await shot("above")
	cam_at(p + Vector3(2.6, 1.2, -0.4), p + Vector3(0.38, 0.75, -0.2), 40.0)
	await wait(0.3)
	await shot("side")
	game.set_roof(true)
	cam_free()
	game.cam.fpp = true
	game.cockpit.on_view_changed(true)
	await wait(0.6)
	await shot("fpp")
	game.cam.head_yaw = deg_to_rad(-20.0)
	game.cam.head_pitch = deg_to_rad(-25.0)
	await wait(0.4)
	game.cockpit.tap()
	await wait(0.3)
	game.cam.fpp = false
	cam_at(p + Vector3(-1.4, 1.6, 1.4), p + Vector3(0.2, 0.75, 0.1), 45.0)
	game.set_roof(false)
	await wait(0.05)
	await shot("reach")

func sc_artifacts() -> void:
	await place(Vector3(0, 0.05, 0), 0.0)
	await wait(1.5)
	var p := car_pos()
	cam_at(p + Vector3(3.2, 1.0, 0.2), p + Vector3(0, 0.6, 0.2), 40.0)
	await wait(0.5)
	await shot("a_base")
	get_viewport().mesh_lod_threshold = 0.0
	await wait(0.4)
	await shot("a2_nolod")
	var body := game.car.rig.model.find_child("Body_Shell", true, false) as MeshInstance3D
	for mi in game.car.rig.model.find_children("*", "MeshInstance3D", true, false):
		(mi as MeshInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	await wait(0.4)
	await shot("b_noshadowcast")
	for m in game.car.rig.mats.all_shader_mats:
		m.set_shader_parameter("lattice_on", 0.0)
	await wait(0.4)
	await shot("c_nolattice")
	game.sky.env.ssao_enabled = false
	game.sky.env.ssr_enabled = false
	await wait(0.4)
	await shot("d_nossao_ssr")

func sc_rawglb() -> void:
	await place(Vector3(0, 0.05, 0), 0.0)
	var doc := GLTFDocument.new()
	var st := GLTFState.new()
	var path := ProjectSettings.globalize_path("res://ext/assets/car/roadster.glb")
	doc.append_from_file(path, st)
	var sc: Node3D = doc.generate_scene(st)
	game.world3d.add_child(sc)
	sc.position = Vector3(6, 0, 0)
	await wait(1.5)
	cam_at(Vector3(6, 0, 0) + Vector3(3.2, 1.0, 0.2), Vector3(6, 0.6, 0.2), 40.0)
	await wait(0.5)
	await shot("raw")

func sc_hero() -> void:
	game.sky.set_time(10, 15, 16.9)
	await place(Vector3(0, 0.05, 60), 0.35)
	await wait(2.0)
	var p := car_pos()
	var b: Basis = game.car.global_transform.basis
	var f := b.z
	var l := b.x
	cam_at(p + f * 5.2 - l * 3.1 + Vector3(0, 0.75, 0), p + f * 0.6 + Vector3(0, 0.45, 0), 34.0)
	await wait(1.2)
	await shot("front34")
	cam_at(p - f * 5.4 + l * 3.0 + Vector3(0, 1.2, 0), p - f * 0.6 + Vector3(0, 0.5, 0), 34.0)
	await wait(1.2)
	await shot("rear34")
	cam_at(p + f * 2.5 + l * 4.0 + Vector3(0, 5.5, 0), p + Vector3(0, 0.4, 0.2), 38.0)
	await wait(1.2)
	await shot("top")
	cam_at(p + l * 6.0 + f * 0.2 + Vector3(0, 0.55, 0), p + f * 0.2 + Vector3(0, 0.55, 0), 32.0)
	await wait(1.2)
	await shot("side")

func sc_debug_screen() -> void:
	await place(Vector3(0, 0.05, 0), 0.0)
	game.cam.fpp = true
	game.cockpit.on_view_changed(true)
	await wait(1.0)
	game.cam.head_yaw = deg_to_rad(-18.0)
	game.cam.head_pitch = deg_to_rad(-22.0)
	var m: Node3D = game.car.rig.model
	var sc := m.find_child("Screen", true, false) as MeshInstance3D
	var mat := sc.get_surface_override_material(0)
	print("screen mat ", mat, " is lib ", mat == game.car.rig.mats.mats["Screen"], " tex ", (mat as ShaderMaterial).get_shader_parameter("tex"), " use ", (mat as ShaderMaterial).get_shader_parameter("use_tex"))
	print("screen global ", sc.global_transform.origin, " cam ", game.cam.global_position)
	await wait(0.5)
	await shot("a")
	var bz := m.find_child("Screen_Bezel", true, false) as Node3D
	if bz:
		print("bezel at ", bz.global_transform.origin)
		bz.visible = false
	await wait(0.3)
	await shot("b_nobezel")

func _phys_avg(secs: float) -> float:
	var acc := 0.0
	var n := 0
	var t0 := Time.get_ticks_msec()
	while Time.get_ticks_msec() - t0 < int(secs * 1000.0):
		await get_tree().physics_frame
		acc += Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0
		n += 1
	return acc / maxf(n, 1)

func sc_physprof() -> void:
	await place(Vector3(0, 0.05, 40), 0.0)
	await wait(2.0)
	print("PHYS base ", await _phys_avg(2.0))
	Prof.reset()
	await wait(1.0)
	print("PHYS prof ", Prof.report(60))
	for pr in game.plate.props:
		pr.queue_free()
	await wait(0.5)
	print("PHYS no props ", await _phys_avg(2.0))
	for ch in game.plate.get_children():
		if ch is StaticBody3D and ch.get_index() > 3:
			ch.queue_free()
	await wait(0.5)
	print("PHYS no statics ", await _phys_avg(2.0))
	game.car.contact_monitor = false
	await wait(0.5)
	print("PHYS no contact monitor ", await _phys_avg(2.0))
	game.car.continuous_cd = false
	await wait(0.5)
	print("PHYS no ccd ", await _phys_avg(2.0))
	ProjectSettings.set_setting("physics/common/physics_interpolation", false)
	get_tree().physics_interpolation = false
	await wait(0.5)
	print("PHYS no interpolation ", await _phys_avg(2.0))

func _set_lod(l: int) -> void:
	game.args["lod"] = str(l)
	game._swap_model(game.car)
	await frames(10)

func sc_lod() -> void:
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	await place(Vector3(0, 0.05, 40), 0.0)
	await wait(2.5)
	var lines := []
	var p := car_pos()
	for view in ["chase", "close"]:
		if view == "close":
			cam_at(p + Vector3(4.2, 1.1, 5.6), p + Vector3(0, 0.55, 0.2), 38.0)
		var r := {0: [], 1: []}
		for l in [0, 1, 0, 1]:
			await _set_lod(l)
			var g: float = await _gpu_avg(1.5)
			r[l].append([g, _avg(times)])
		for l in [0, 1]:
			var g2 := 0.0
			var f2 := 0.0
			for e in r[l]:
				g2 += e[0] * 0.5
				f2 += e[1] * 0.5
			var line := "%s lod%d gpu %.2f ms frame %.2f ms prims %d" % [view, l, g2, f2, RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)]
			print("LOD ", line)
			lines.append(line)
	await _set_lod(1)
	await wait(1.0)
	await shot("lod1_front34")
	await _set_lod(0)
	await wait(1.0)
	await shot("lod0_front34")
	var f := FileAccess.open(out_dir.path_join("lod.txt"), FileAccess.WRITE)
	for l in lines:
		f.store_line(l)
	f.close()

