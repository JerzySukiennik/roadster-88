# Game: builds the test plate, sky, cars, cameras and UI, maps keyboard and mouse to the active Roadster, handles respawn, wrecks, quality presets (car LOD per preset) and dynamic resolution.
extends Node

const MPH := 0.44704

var plate: TestPlate
var sky: SkyEnv
var cam: CarCamera
var car: Car
var wrecks: Array = []
var scenario: Node = null
var preset := 2
var res_scale := -1.0
var paint := "Red Multi-Coat"
var outfit := "default"
var assist := true
var wing := false
var roof := true
var paused := false
var hud: Node = null
var menu: Node = null
var tt: Node = null
var audio: Node = null
var cockpit: Node = null
var driver: Node = null
var fx: Node = null
var post: Node = null
var args: Dictionary = {}
var world3d: Node3D
var input_enabled := true
var frame_times: PackedFloat32Array = PackedFloat32Array()
var dyn_scale := 1.0
var dyn_acc := 0.0
var dyn_gpu := 0.0
var dyn_n := 0
var dyn_cool := 0.0

func _ready() -> void:
	_parse_args()
	Tuning.reload()
	Engine.physics_ticks_per_second = int(Tuning.top("physics_hz", 120))
	Engine.max_physics_steps_per_frame = 6
	_input_map()
	if args.has("preset"):
		preset = clampi(int(args["preset"]), 0, 3)
	if args.has("scale"):
		res_scale = float(args["scale"])
	process_mode = Node.PROCESS_MODE_ALWAYS
	world3d = Node3D.new()
	world3d.name = "World"
	world3d.process_mode = Node.PROCESS_MODE_PAUSABLE
	add_child(world3d)
	sky = SkyEnv.new()
	world3d.add_child(sky)
	sky.build()
	plate = TestPlate.new()
	world3d.add_child(plate)
	plate.build(preset)
	cam = CarCamera.new()
	cam.name = "Camera"
	world3d.add_child(cam)
	cam.current = true
	car = spawn_car(plate.spawn)
	cam.attach(car)
	_build_systems()
	apply_preset(preset)
	get_viewport().size_changed.connect(func(): apply_preset(preset))
	RenderingServer.viewport_set_measure_render_time(get_viewport().get_viewport_rid(), true)
	if args.has("scenario"):
		var sc := load("res://src/scenario.gd")
		scenario = sc.new()
		scenario.name = "Scenario"
		add_child(scenario)
		scenario.start(self, String(args["scenario"]))
	else:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
		if not args.has("windowed"):
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)
			apply_preset.call_deferred(preset)

func _build_systems() -> void:
	for spec in [["hud", "res://src/ui/hud.gd"], ["tt", "res://src/fx/time_travel.gd"], ["audio", "res://src/audio/car_audio.gd"], ["fx", "res://src/fx/car_fx.gd"], ["cockpit", "res://src/ui/cockpit.gd"], ["driver", "res://src/driver/driver.gd"], ["post", "res://src/fx/post_fx.gd"], ["menu", "res://src/ui/pause_menu.gd"]]:
		if ResourceLoader.exists(spec[1]):
			var s: Script = load(spec[1])
			var node: Node = s.new()
			node.name = String(spec[0]).capitalize()
			node.process_mode = Node.PROCESS_MODE_PAUSABLE
			add_child(node)
			set(spec[0], node)
			if node.has_method("setup"):
				node.setup(self)

func _parse_args() -> void:
	var all := OS.get_cmdline_args() + OS.get_cmdline_user_args()
	for a in all:
		if a.begins_with("--") and a.contains("="):
			var kv := a.substr(2).split("=", true, 1)
			args[kv[0]] = kv[1]
		elif a.begins_with("--"):
			args[a.substr(2)] = "1"

func _key(action: String, keys: Array) -> void:
	if not InputMap.has_action(action):
		InputMap.add_action(action, 0.1)
	for k in keys:
		var ev := InputEventKey.new()
		ev.physical_keycode = k
		InputMap.action_add_event(action, ev)

func _input_map() -> void:
	_key("throttle", [KEY_W])
	_key("brake", [KEY_S])
	_key("steer_left", [KEY_A])
	_key("steer_right", [KEY_D])
	_key("boost", [KEY_SHIFT])
	_key("lift", [KEY_SPACE])
	_key("descend", [KEY_CTRL])
	_key("nose_down", [KEY_UP])
	_key("nose_up", [KEY_DOWN])
	_key("roll_left", [KEY_LEFT])
	_key("roll_right", [KEY_RIGHT])
	_key("camera", [KEY_C])
	_key("time_arm", [KEY_T])
	_key("respawn", [KEY_R])
	_key("doors", [KEY_F])
	_key("pause", [KEY_ESCAPE])
	_key("fullscreen", [KEY_F11])
	if not InputMap.has_action("tap"):
		InputMap.add_action("tap")
		var mb := InputEventMouseButton.new()
		mb.button_index = MOUSE_BUTTON_LEFT
		InputMap.action_add_event("tap", mb)

func model_lod() -> int:
	if args.has("lod"):
		return clampi(int(args["lod"]), 0, 1)
	return 1 if preset <= 1 else 0

func spawn_car(xf: Transform3D) -> Car:
	var c := Car.new()
	c.name = "Roadster"
	world3d.add_child(c)
	c.setup()
	_dress(c)
	c.teleport(xf)
	return c

func _dress(c: Car) -> void:
	c.model_lod = model_lod()
	var model: Node3D = CarModel.instantiate(c.model_lod)
	c.add_child(model)
	var mats := CarMaterials.new()
	mats.set_paint(paint)
	mats.apply(model)
	var rig := CarRig.new()
	c.add_child(rig)
	rig.setup(c, model, mats)
	rig.set_wing(wing)
	rig.set_roof(roof)
	rig.set_lod_bias([0.35, 0.6, 1.0, 1.4][preset])
	rig.set_shadows(preset >= 2)
	c.rig = rig
	c.fc.assist = assist
	c.damage = null
	if ResourceLoader.exists("res://src/damage/car_damage.gd"):
		var dmg: Node = load("res://src/damage/car_damage.gd").new()
		dmg.name = "Damage"
		c.add_child(dmg)
		dmg.setup(c, model, mats, self)
		c.damage = dmg

func _pristine(c: Car) -> bool:
	var d = c.damage
	if d == null:
		return true
	return float(d.total_energy) <= 0.0 and (d.detached as Dictionary).is_empty() and (d.cracks as Array).is_empty() and (d.shattered as Dictionary).is_empty()

func _swap_model(c: Car) -> void:
	var old_rig = c.rig
	var old_dmg = c.damage
	if old_dmg and c.impacted.is_connected(old_dmg._on_impact):
		c.impacted.disconnect(old_dmg._on_impact)
	_dress(c)
	if old_rig:
		c.rig.door_target = old_rig.door_target
		c.rig.door = old_rig.door
	for s in [hud, tt, audio, fx, cockpit, driver, menu]:
		if s and s.has_method("on_car_changed"):
			s.on_car_changed(c)
	if old_rig:
		old_rig.model.queue_free()
		old_rig.queue_free()
	if old_dmg:
		old_dmg.queue_free()

func respawn() -> void:
	if car == null:
		return
	var old := car
	var xf := old.global_transform
	var off := Tuning.v3("damage", "respawn_offset", Vector3(5, 0, 0))
	var fh := Vector3(xf.basis.z.x, 0, xf.basis.z.z)
	if fh.length() < 0.1:
		fh = Vector3(0, 0, 1)
	fh = fh.normalized()
	var b := Basis.looking_at(-fh, Vector3.UP)
	var pos := _free_spot(xf.origin, b, off)
	old.make_wreck()
	wrecks.append(old)
	var max_w := int(Tuning.g("damage", "max_wrecks", 8))
	while wrecks.size() > max_w:
		var w: Node = wrecks.pop_front()
		if is_instance_valid(w):
			w.queue_free()
	car = spawn_car(Transform3D(b, pos))
	cam.attach(car)
	for s in [hud, tt, audio, fx, cockpit, driver, menu]:
		if s and s.has_method("on_car_changed"):
			s.on_car_changed(car)

func _free_spot(origin: Vector3, b: Basis, off: Vector3) -> Vector3:
	var space := world3d.get_world_3d().direct_space_state
	var shape := BoxShape3D.new()
	shape.size = Vector3(2.2, 1.2, 4.6)
	var q := PhysicsShapeQueryParameters3D.new()
	q.shape = shape
	q.collision_mask = 1 | 2
	var tries := [off, -off, Vector3(off.x * 2.0, 0, 0), Vector3(-off.x * 2.0, 0, 0), Vector3(0, 0, -6.0), Vector3(0, 0, 6.0), Vector3(off.x, 0, -6.0)]
	for t in tries:
		var p: Vector3 = origin + b * t
		var down := space.intersect_ray(PhysicsRayQueryParameters3D.create(p + Vector3.UP * 30.0, p + Vector3.DOWN * 200.0, 1))
		var gy := 0.0 if down.is_empty() else float(down.position.y)
		p.y = gy + 0.05
		q.transform = Transform3D(b, p + Vector3(0, 0.8, 0))
		if space.intersect_shape(q, 1).is_empty():
			return p
	return origin + b * off + Vector3(0, 0.05, 0)

func apply_preset(p: int) -> void:
	if clampi(p, 0, 3) != preset:
		dyn_scale = 1.0
	preset = clampi(p, 0, 3)
	var vp := get_viewport()
	sky.apply_preset(preset, vp)
	_apply_scale()
	for c in [car] + wrecks:
		if is_instance_valid(c) and c.rig:
			c.rig.set_shadows(preset >= 2)
			c.rig.set_lod_bias([0.35, 0.6, 1.0, 1.4][preset])
	if car and car.model_lod != model_lod() and _pristine(car):
		_swap_model(car)
	if fx and fx.has_method("on_preset"):
		fx.on_preset(preset)
	if post and post.has_method("on_preset"):
		post.on_preset(preset)

func _apply_scale() -> void:
	var vp := get_viewport()
	var scale := res_scale
	if scale <= 0.0:
		var target_h: float = [680.0, 780.0, 900.0, 1100.0][preset]
		var phys_h := float(DisplayServer.window_get_size().y)
		scale = clampf(target_h / maxf(phys_h, 1.0) * dyn_scale, 0.35, 1.0)
	vp.scaling_3d_scale = scale
	if scale < 0.99:
		vp.scaling_3d_mode = Viewport.SCALING_3D_MODE_FSR2 if preset >= 2 else Viewport.SCALING_3D_MODE_FSR
		vp.fsr_sharpness = 0.35
		if preset >= 2:
			vp.use_taa = false
	else:
		vp.scaling_3d_mode = Viewport.SCALING_3D_MODE_BILINEAR

func _dynamic_resolution(dt: float) -> void:
	if scenario != null or paused or res_scale > 0.0 or args.has("nodynres"):
		dyn_acc = 0.0
		dyn_gpu = 0.0
		dyn_n = 0
		return
	dyn_cool -= dt
	dyn_acc += dt
	dyn_gpu += RenderingServer.viewport_get_measured_render_time_gpu(get_viewport().get_viewport_rid())
	dyn_n += 1
	if dyn_acc < 1.0:
		return
	var avg_ms := dyn_acc / dyn_n * 1000.0
	var gpu_ms := dyn_gpu / dyn_n
	dyn_acc = 0.0
	dyn_gpu = 0.0
	dyn_n = 0
	if dyn_cool > 0.0:
		return
	var want := dyn_scale
	if avg_ms > 18.5 and gpu_ms > 12.5:
		want = maxf(0.6, dyn_scale - 0.08)
	elif gpu_ms < 9.5 and avg_ms < 17.8:
		want = minf(1.0, dyn_scale + 0.04)
	if absf(want - dyn_scale) > 0.001:
		dyn_scale = want
		dyn_cool = 2.0
		_apply_scale()

func set_paint(p: String) -> void:
	paint = p
	if car and car.rig:
		car.rig.mats.set_paint(p)

func set_assist(on: bool) -> void:
	assist = on
	if car:
		car.fc.assist = on

func set_wing(on: bool) -> void:
	wing = on
	if car and car.rig:
		car.rig.set_wing(on)

func set_roof(on: bool) -> void:
	roof = on
	if car and car.rig:
		car.rig.set_roof(on)

func _unhandled_input(ev: InputEvent) -> void:
	if scenario != null:
		return
	if ev is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED and not paused:
		cam.mouse_look(ev.relative)
	if ev.is_action_pressed("pause"):
		if menu and menu.has_method("toggle"):
			menu.toggle()
	if paused:
		return
	if ev.is_action_pressed("camera"):
		cam.fpp = not cam.fpp
		if cockpit and cockpit.has_method("on_view_changed"):
			cockpit.on_view_changed(cam.fpp)
	if ev.is_action_pressed("respawn"):
		respawn()
	if ev.is_action_pressed("doors") and car and car.rig:
		car.rig.toggle_door()
		if audio and audio.has_method("door"):
			audio.door(car.rig.door_target > 0.5)
	if ev.is_action_pressed("time_arm") and tt and tt.has_method("toggle_arm"):
		tt.toggle_arm()
	if ev.is_action_pressed("tap") and cam.fpp and cockpit and cockpit.has_method("tap"):
		cockpit.tap()
	if ev.is_action_pressed("fullscreen"):
		var m := DisplayServer.window_get_mode()
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED if m == DisplayServer.WINDOW_MODE_FULLSCREEN else DisplayServer.WINDOW_MODE_FULLSCREEN)

func _physics_process(_dt: float) -> void:
	if car == null or scenario != null:
		return
	var i := car.input
	if paused or not input_enabled:
		i.clear()
		return
	i.throttle = Input.get_action_strength("throttle")
	i.brake = Input.get_action_strength("brake")
	i.steer = Input.get_action_strength("steer_left") - Input.get_action_strength("steer_right")
	i.boost = Input.is_action_pressed("boost")
	i.lift = Input.is_action_pressed("lift")
	i.descend = Input.is_action_pressed("descend")
	i.pitch = Input.get_action_strength("nose_down") - Input.get_action_strength("nose_up")
	i.roll = Input.get_action_strength("roll_right") - Input.get_action_strength("roll_left")

func _process(dt: float) -> void:
	frame_times.append(dt)
	if frame_times.size() > 600:
		frame_times = frame_times.slice(300)
	_dynamic_resolution(dt)
	if sky:
		var night := sky.is_night()
		for c in [car] + wrecks:
			if is_instance_valid(c) and c.rig:
				c.rig.lights_on = night and c == car
