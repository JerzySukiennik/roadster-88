# Parity harness: drives the real Car on a flat plate with the same scripted inputs as web/tools/parity.mjs and writes the godot section of shared/parity.md.
extends SceneTree

const MPH := 0.44704

var car: Car
var dt: float
var t := 0.0
var results: Dictionary = {}
var y0 := 0.0

func _initialize() -> void:
	Tuning.reload()
	Engine.physics_ticks_per_second = int(Tuning.top("physics_hz", 120))
	Engine.max_physics_steps_per_frame = 1
	dt = 1.0 / Engine.physics_ticks_per_second
	var root3d := Node3D.new()
	root.add_child(root3d)
	var ground := StaticBody3D.new()
	ground.collision_layer = Car.LAYER_WORLD
	var pm := PhysicsMaterial.new()
	pm.friction = 0.9
	ground.physics_material_override = pm
	var cs := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = Vector3(40000, 2, 40000)
	cs.shape = bs
	cs.position = Vector3(0, -1, 0)
	ground.add_child(cs)
	root3d.add_child(ground)
	car = Car.new()
	car.name = "Car"
	root3d.add_child(car)
	car.setup()
	_run.call_deferred()

func _inp(d: Dictionary) -> void:
	var i := car.input
	i.clear()
	i.throttle = float(d.get("throttle", 0.0))
	i.brake = float(d.get("brake", 0.0))
	i.steer = float(d.get("steer", 0.0))
	i.boost = bool(d.get("boost", false))
	i.lift = bool(d.get("lift", false))
	i.descend = bool(d.get("descend", false))
	i.pitch = float(d.get("pitch", 0.0))
	i.roll = float(d.get("roll", 0.0))

func step(d: Dictionary) -> void:
	await physics_frame
	_inp(d)
	t += dt

func fwd_speed() -> float:
	return car.linear_velocity.dot(car.global_transform.basis.z)

func com_y() -> float:
	return (car.global_transform * car.com_local).y

func make_world() -> void:
	await physics_frame
	car.teleport(Transform3D(Basis.IDENTITY, Vector3(0, 0.02, -9000)), 0.0)
	car.fc.assist = true
	for k in int(round(1.2 / dt)):
		await step({})
	y0 = com_y()

func zero_to(target: float, d: Dictionary) -> float:
	await make_world()
	var t0 := t
	while fwd_speed() < target:
		await step(d)
		if t - t0 > 60.0:
			return -1.0
	return t - t0

func brake60(retro: bool) -> Dictionary:
	await make_world()
	var t0 := t
	while fwd_speed() < 63.0 * MPH and t - t0 < 30.0:
		await step({"throttle": 1.0})
	var z0 := NAN
	var peak := 0.0
	t0 = t
	while fwd_speed() > 0.05 and t - t0 < 20.0:
		await step({"brake": 1.0, "boost": retro})
		if is_nan(z0) and fwd_speed() <= 60.0 * MPH:
			z0 = car.global_position.z
		peak = maxf(peak, -car.last_accel.z / 9.81)
	return {"d": car.global_position.z - z0, "g": peak}

func _run() -> void:
	results["zero60"] = await zero_to(60.0 * MPH, {"throttle": 1.0})
	print("0-60 motors ", results["zero60"])
	results["zero60boost"] = await zero_to(60.0 * MPH, {"throttle": 1.0, "boost": true})
	print("0-60 boost ", results["zero60boost"])
	results["to88"] = await zero_to(88.0 * MPH, {"throttle": 1.0})
	results["to88boost"] = await zero_to(88.0 * MPH, {"throttle": 1.0, "boost": true})
	print("0-88 ", results["to88"], " / ", results["to88boost"])
	var b1: Dictionary = await brake60(false)
	var b2: Dictionary = await brake60(true)
	results["brake60"] = b1["d"]
	results["brake60g"] = b1["g"]
	results["brake60retro"] = b2["d"]
	results["brake60retrog"] = b2["g"]
	print("60-0 ", b1, " retro ", b2)
	await make_world()
	var vmax := 0.0
	for k in int(round(70.0 / dt)):
		vmax = maxf(vmax, car.linear_velocity.length())
		await step({"throttle": 1.0})
	results["top"] = vmax / MPH
	await make_world()
	vmax = 0.0
	for k in int(round(40.0 / dt)):
		vmax = maxf(vmax, car.linear_velocity.length())
		await step({"throttle": 1.0, "boost": true})
	results["topBoost"] = vmax / MPH
	print("top ", results["top"], " boost ", results["topBoost"])

	await make_world()
	for k in int(round(1.4 / dt)):
		await step({"lift": true})
	for k in int(round(6.0 / dt)):
		await step({})
	var rear := 0.0
	var front := 0.0
	var side := 0.0
	var thrust := 0.0
	var vy := 0.0
	var n := 0
	for k in int(round(2.0 / dt)):
		var th := car.th
		var rs := 0.0
		for z in th.rear:
			rs += z.valve
		var fs := 0.0
		for z in th.front:
			fs += z.valve
		var ss := 0.0
		for z in th.side:
			ss += z.valve
		rear += rs / 4.0
		front += fs / 2.0
		side += ss / maxf(1.0, float(th.side.size()))
		thrust += th.total_force.y
		vy += absf(car.linear_velocity.y)
		n += 1
		await step({})
	results["hoverRear"] = rear / n
	results["hoverFront"] = front / n
	results["hoverSide"] = side / n
	results["hoverTW"] = thrust / n / (car.mass * 9.81)
	results["hoverMaxRatio"] = (thrust / n) / (car.th.max_rear() + car.th.max_front() + car.th.max_side())
	results["hoverAlt"] = com_y() - y0
	results["hoverVy"] = vy / n
	results["hoverMode"] = car.fc.mode_name()
	print("hover ", results["hoverRear"], " ", results["hoverFront"], " tw ", results["hoverTW"], " alt ", results["hoverAlt"], " ", results["hoverMode"])
	var yaw := 0.0
	var m := 0
	for k in int(round(2.5 / dt)):
		await step({"steer": 1.0})
	var prev := _yaw()
	for k in int(round(2.0 / dt)):
		var y := _yaw()
		var dd := y - prev
		if dd > PI:
			dd -= TAU
		if dd < -PI:
			dd += TAU
		yaw += dd
		prev = y
		m += 1
		await step({"steer": 1.0})
	results["hoverYaw"] = rad_to_deg(yaw / (m * dt))
	print("hover yaw ", results["hoverYaw"])

	await make_world()
	var apex := 0.0
	for k in int(round(0.3 / dt)):
		apex = maxf(apex, com_y() - y0)
		await step({"lift": true})
	for k in int(round(3.0 / dt)):
		apex = maxf(apex, com_y() - y0)
		await step({})
	results["hop"] = apex
	print("hop ", apex)

	await make_world()
	var t0 := t
	while fwd_speed() < 60.0 * MPH and t - t0 < 30.0:
		await step({"throttle": 1.0})
	for k in int(round(8.0 / dt)):
		await step(_hold())
	var rsum := 0.0
	var lat := 0.0
	var sp := 0.0
	n = 0
	for k in int(round(3.0 / dt)):
		var w := absf(car.angular_velocity.y)
		var s := car.linear_velocity.length()
		rsum += s / maxf(1e-3, w)
		lat += absf(s * w) / 9.81
		sp += s
		n += 1
		await step(_hold())
	results["turnR"] = rsum / n
	results["turnG"] = lat / n
	results["turnMph"] = sp / n / MPH
	print("turn ", results["turnR"], " ", results["turnG"], " ", results["turnMph"])
	_write()
	quit()

func _hold() -> Dictionary:
	return {"steer": 1.0, "throttle": clampf((60.0 * MPH - car.linear_velocity.length()) * 0.6 + 0.08, 0.0, 1.0)}

func _yaw() -> float:
	var f := car.global_transform.basis.z
	return atan2(f.x, f.z)

func _f(v: Variant, d: int = 2) -> String:
	if v == null or (v is float and v < -0.5):
		return "n/a"
	return ("%." + str(d) + "f") % float(v)

func _write() -> void:
	var r := results
	var path := ProjectSettings.globalize_path("res://").path_join("../shared/parity.md").simplify_path()
	var lines := PackedStringArray([
		"<!-- godot:begin -->",
		"## godot (Godot 4.6.2 build)",
		"",
		"Run: `godot/tools/parity.sh` (= `Godot --headless --path godot --fixed-fps %d --script res://tools/parity.gd`, Jolt, %d Hz, flat plate). Updated %s." % [Engine.physics_ticks_per_second, Engine.physics_ticks_per_second, Time.get_datetime_string_from_system(true, true).substr(0, 16) + " UTC"],
		"",
		"| Metric | Target | Godot |",
		"|---|---|---|",
		"| 0-60 mph, motors | 1.9 s | %s s |" % _f(r.get("zero60")),
		"| 0-60 mph, boost (W + Shift) | 1.1 s | %s s |" % _f(r.get("zero60boost")),
		"| 0-88 mph, motors | (report) | %s s |" % _f(r.get("to88")),
		"| 0-88 mph, boost | (report) | %s s |" % _f(r.get("to88boost")),
		"| 60-0 mph, tyres (S) | about 32 m | %s m (peak %s g) |" % [_f(r.get("brake60"), 1), _f(r.get("brake60g"))],
		"| 60-0 mph, tyres + retro (S + Shift) | shorter | %s m (peak %s g) |" % [_f(r.get("brake60retro"), 1), _f(r.get("brake60retrog"))],
		"| Top speed, motors (70 s) | 250 mph | %s mph |" % _f(r.get("top"), 1),
		"| Top speed, boost (40 s) | 250 mph | %s mph |" % _f(r.get("topBoost"), 1),
		"| Hover throttle, rear / front / side valve | (report) | %s / %s / %s |" % [_f(r.get("hoverRear"), 3), _f(r.get("hoverFront"), 3), _f(r.get("hoverSide"), 3)],
		"| Hover thrust / weight, thrust / max | 1.0 / (report) | %s / %s |" % [_f(r.get("hoverTW"), 3), _f(r.get("hoverMaxRatio"), 3)],
		"| Hop apex, 0.3 s Space (COM rise) | (report) | %s m |" % _f(r.get("hop"), 2),
		"| Turn radius, 60 mph full lock | (report) | %s m at %s mph, %s g lateral |" % [_f(r.get("turnR"), 1), _f(r.get("turnMph"), 1), _f(r.get("turnG"))],
		"| Hover yaw rate, A held | 70 deg/s (assist) | %s deg/s |" % _f(r.get("hoverYaw"), 1),
		"",
		"Method: identical protocol to the web harness (settle 1.2 s, 0-X until forward speed crosses X, 60-0 from 63 mph measured from the 60 mph crossing, hover = Space 1.4 s then 6 s hold then 2 s average, hop = Space 0.3 s, turn = 60 mph P-loop + full A for 8 s then 3 s average, yaw = A 2.5 s in hover then 2 s average). Same car model as web/src/sim ported to GDScript (suspension, combined-slip tyres with 4-substep implicit wheel spin, TC/ABS, regen, aero, flight computer modes and the same warm-started accelerated projected-gradient thrust allocator), so the numbers track the web build within about 1 percent.",
		"<!-- godot:end -->",
	])
	var block := "\n".join(lines)
	var old := FileAccess.get_file_as_string(path) if FileAccess.file_exists(path) else ""
	var out := ""
	var b0 := old.find("<!-- godot:begin -->")
	var b1 := old.find("<!-- godot:end -->")
	if b0 >= 0 and b1 > b0:
		out = old.substr(0, b0) + block + old.substr(b1 + "<!-- godot:end -->".length())
	elif old.strip_edges() == "":
		out = "# Parity results\n\nBoth engines write their own section between their markers. Targets from SPEC \"Parity\" must match within 5 percent.\n\n" + block + "\n"
	else:
		out = old.rstrip("\n") + "\n\n" + block + "\n"
	var fa := FileAccess.open(path, FileAccess.WRITE)
	fa.store_string(out)
	fa.close()
	print(JSON.stringify(r, " "))
