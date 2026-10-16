# FlightComputer: ground boost / retro, hop, hover and ballistic modes plus flight assist (attitude hold, rate damping); feeds Thrusters.solve. Mirrors web/src/sim/flight.js.
class_name FlightComputer
extends RefCounted

const MPH := 0.44704
enum { GROUND, HOP, HOVER, BALLISTIC }

var tu: Dictionary
var T: Dictionary
var F: Dictionary
var th: Thrusters
var mode: int = GROUND
var assist: bool = true
var lift_held: float = 0.0
var hop_t: float = 0.0
var hop_ready: float = 0.0
var grounded_t: float = 0.0
var air_t: float = 0.0
var prev_lift: bool = false
var want_f: Vector3 = Vector3.ZERO
var want_t: Vector3 = Vector3.ZERO
var vz_cmd: float = 0.0
var yaw_cmd: float = 0.0
var retro: bool = false
var crash_hold: float = 0.0
var boost: bool = false

func _init(thrusters: Thrusters) -> void:
	tu = Tuning.data()
	T = tu["thrusters"]
	F = tu["flight_assist"]
	th = thrusters
	assist = bool(F["enabled_default"])

func mode_name() -> String:
	return ["ground", "hop", "hover", "ballistic"][mode]

func reset_state() -> void:
	mode = GROUND
	lift_held = 0.0
	hop_t = 0.0
	hop_ready = 0.0
	grounded_t = 0.0
	air_t = 0.0
	prev_lift = false

func update(dt: float, inp: CarInput, vs: VehicleSim, inertia: Vector3) -> void:
	var g := float(tu["gravity"])
	var m := vs.mass
	crash_hold = maxf(0.0, crash_hold - dt)
	var grounded := vs.contacts >= 2
	if grounded:
		grounded_t += dt
		air_t = 0.0
	else:
		air_t += dt
		grounded_t = 0.0
	var lift_edge := inp.lift and not prev_lift
	prev_lift = inp.lift
	if inp.lift:
		lift_held += dt
	else:
		lift_held = 0.0
	var tap := float(T["hop_tap_max_s"])
	var engage := float(T.get("hover_engage_s", 0.5))
	if mode == GROUND or mode == BALLISTIC:
		if lift_edge and grounded:
			mode = HOP
			hop_t = 0.0
			hop_ready = 0.0
		elif not grounded and assist and (inp.lift or inp.descend) and air_t > 0.05:
			mode = HOVER
		elif not grounded and not assist and inp.lift:
			mode = HOP
	if mode == HOP:
		hop_t += dt
		th.request_front()
		if th.deploy >= 0.5 or th.max_front() <= 0.0:
			hop_ready += dt
		if assist and inp.lift and lift_held >= engage:
			mode = HOVER
		elif not inp.lift and hop_ready >= tap:
			mode = GROUND if grounded else BALLISTIC
		elif not assist and not inp.lift and hop_ready >= tap:
			mode = BALLISTIC
	if mode == HOVER and not assist:
		mode = GROUND if grounded else BALLISTIC
	if mode == HOVER and grounded and grounded_t > 0.25 and not inp.lift:
		mode = GROUND
	if mode == BALLISTIC and grounded and grounded_t > 0.05:
		mode = GROUND
	if mode == GROUND and not grounded and air_t > 0.12:
		mode = BALLISTIC

	var b := vs.q_basis
	var fwd_w := b.z
	var fh := Vector3(fwd_w.x, 0.0, fwd_w.z)
	fh = fh.normalized() if fh.length() > 1e-3 else Vector3(0, 0, 1)
	var v := vs.vel
	var mph := vs.speed / MPH
	var gov_a: Array = F["air_speed_governor_mph"]
	var gov := clampf((float(gov_a[1]) - mph) / (float(gov_a[1]) - float(gov_a[0])), 0.0, 1.0)
	var rear_max := th.max_rear()
	var front_max := th.max_front()
	var fw := Vector3.ZERO
	var use_alloc := false
	var attitude := false
	var direct := false
	retro = false
	boost = inp.boost
	vz_cmd = 0.0
	if mode == GROUND:
		direct = true
		var bst := inp.boost and inp.brake <= 0.0
		var rtr := inp.boost and inp.brake > 0.0
		for n in th.rear:
			n.cmd_pitch = 0.0
			n.cmd_side = 0.0
			n.cmd_valve = gov if bst else 0.0
		if rtr:
			th.request_front()
		retro = rtr and vs.fwd_speed > 0.5
		for n in th.front:
			n.cmd_pitch = 0.0
			n.cmd_side = 0.0
			n.cmd_valve = 1.0 if retro else 0.0
	elif mode == HOP:
		use_alloc = true
		attitude = assist
		fw = Vector3.UP * (rear_max + front_max)
		if inp.throttle > 0.0 or inp.boost:
			fw += fh * ((1.0 if inp.boost else 0.5) * rear_max * gov)
	elif mode == HOVER:
		use_alloc = true
		attitude = true
		th.request_front()
		var vz := float(F["climb_rate"]) if inp.lift else (-float(F["descend_rate"]) if inp.descend else 0.0)
		if inp.descend and vs.clearance < 3.0:
			vz = maxf(vz, -(0.7 + vs.clearance * 1.6))
		vz_cmd = vz
		var az := clampf(3.2 * (vz - v.y), -g * 0.9, 16.0)
		var tilt := maxf(0.5, b.y.y)
		fw.y = m * (g + az) / tilt
		var vh := Vector2(v.x, v.z).length()
		if inp.boost:
			fw += fh * (rear_max * gov)
		elif inp.throttle > 0.0:
			fw += fh * (rear_max * 0.75 * gov)
		elif inp.brake > 0.0:
			fw += fh * (-front_max * 0.75)
			retro = true
		elif assist and vh > 0.05:
			var fade := 1.0 - VehicleSim.smoothstep01(18.0, 30.0, vh)
			var acc := minf(3.0, 0.9 * vh) * fade
			fw.x -= v.x / vh * acc * m
			fw.z -= v.z / vh * acc * m
	elif mode == BALLISTIC:
		attitude = assist and crash_hold <= 0.0 and vs.q_basis.y.y > 0.15
		if inp.boost:
			fw += fh * (rear_max * gov)
		elif inp.throttle > 0.0:
			fw += fh * (rear_max * 0.75 * gov)
		elif inp.brake > 0.0:
			fw += fh * (-front_max * 0.75)
			retro = true
		if inp.brake > 0.0:
			th.request_front()
		var any_rot := absf(inp.steer) > 0.0 or absf(inp.pitch) > 0.0 or absf(inp.roll) > 0.0
		use_alloc = attitude or fw.length_squared() > 0.0 or any_rot

	want_t = Vector3.ZERO
	if use_alloc:
		var w := vs.ang_local
		yaw_cmd = inp.steer * deg_to_rad(float(F["yaw_rate_deg_s"]))
		if attitude:
			var yaw := atan2(fwd_w.x, fwd_w.z)
			var qt := Basis(Vector3.UP, yaw) * Basis(Vector3.RIGHT, inp.pitch * deg_to_rad(float(F["max_pitch_deg"]))) * Basis(Vector3.BACK, inp.roll * deg_to_rad(float(F["max_roll_deg"])))
			var qe := (b.inverse() * qt).orthonormalized().get_rotation_quaternion()
			if qe.w < 0.0:
				qe = Quaternion(-qe.x, -qe.y, -qe.z, -qe.w)
			var ang := qe.get_angle()
			var e := qe.get_axis() * ang if ang > 1e-6 else Vector3.ZERO
			var kp := float(F["attitude_kp"])
			var kd := float(F["rate_kd"])
			want_t.x = inertia.x * (kp * e.x - kd * w.x)
			want_t.z = inertia.z * (kp * e.z - kd * w.z)
			want_t.y = inertia.y * (kd * 1.6 * (yaw_cmd - w.y)) + float(tu["aero"]["angular_drag"][1]) * w.y
			if mode == HOP and grounded:
				want_t.x *= 0.6
				want_t.z *= 0.6
				want_t.y *= 0.3
		else:
			var k := 4.0
			var mr: Dictionary = F["manual_rate_deg_s"]
			if absf(inp.pitch) > 0.0:
				want_t.x = inertia.x * k * (inp.pitch * deg_to_rad(float(mr["pitch"])) - w.x)
			if absf(inp.roll) > 0.0:
				want_t.z = inertia.z * k * (inp.roll * deg_to_rad(float(mr["roll"])) - w.z)
			if absf(inp.steer) > 0.0:
				want_t.y = inertia.y * k * (yaw_cmd - w.y)
		want_f = b.inverse() * fw
		th.solve(want_f, want_t, vs.com_local)
	elif not direct:
		th.clear()

func lifting() -> bool:
	return mode == HOP or mode == HOVER
