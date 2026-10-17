# VehicleSim: raycast suspension, combined-slip tyres with implicit substepped wheel spin, AWD powertrain (TC, ABS, regen), aero. Same model as web/src/sim/car.js, pure math.
class_name VehicleSim
extends RefCounted

const MPH := 0.44704
const NS := 4

class Wheel:
	var name: String
	var i: int
	var front: bool
	var left: bool
	var r: float
	var k: float
	var width: float
	var arb: float
	var local: Vector3
	var hard: Vector3
	var static_comp: float
	var inertia: float
	var compression: float = 0.0
	var prev_comp: float = 0.0
	var length: float = 0.0
	var contact: bool = false
	var load: float = 0.0
	var point: Vector3 = Vector3.ZERO
	var normal: Vector3 = Vector3.UP
	var collider: Object = null
	var ground_dist: float = 99.0
	var omega: float = 0.0
	var spin: float = 0.0
	var steer: float = 0.0
	var kappa: float = 0.0
	var alpha: float = 0.0
	var fx: float = 0.0
	var fy: float = 0.0
	var slip: float = 0.0
	var slip_vel: float = 0.0
	var tc: float = 1.0
	var abs_k: float = 1.0
	var drive: float = 0.0
	var brake: float = 0.0
	var regen: float = 0.0
	var lost: bool = false
	var toe: float = 0.0
	var camber: float = 0.0
	var hub: Vector3 = Vector3.ZERO
	var bent: float = 0.0
	var mu_x: float = 1.0
	var mu_y: float = 1.0
	var sy: float = 0.0
	var cap: float = 0.0

var tu: Dictionary
var wheels: Array[Wheel] = []
var mass: float
var g: float
var com_local: Vector3
var n0: float
var wing: bool = false
var steer_angle: float = 0.0
var gear: String = "D"
var reverse_hold: float = 0.0
var parked_t: float = 0.0
var wreck: bool = false

var xf: Transform3D
var q_basis: Basis
var vel: Vector3
var ang_w: Vector3
var ang_local: Vector3
var com_w: Vector3
var fwd: Vector3
var up: Vector3
var left: Vector3
var speed: float = 0.0
var fwd_speed: float = 0.0
var lat_speed: float = 0.0
var contacts: int = 0
var clearance: float = 0.0
var motor_force: float = 0.0
var regen_force: float = 0.0
var load: float = 0.0
var motor_rpm: float = 0.0
var brake_on: float = 0.0
var last_accel: Vector3 = Vector3.ZERO
var force_acc: Vector3 = Vector3.ZERO
var torque_acc: Vector3 = Vector3.ZERO
var inp: CarInput

func _init() -> void:
	configure()

func configure() -> void:
	tu = Tuning.data()
	var c: Dictionary = tu["car"]
	var s: Dictionary = tu["suspension"]
	var w: Dictionary = tu["wheels"]
	mass = float(c["mass"])
	g = float(tu["gravity"])
	com_local = Tuning.v3("car", "com")
	var wb := float(c["wheelbase"]) * 0.5
	var front_load := mass * g * ((wb + com_local.z) / float(c["wheelbase"])) * 0.5
	var rear_load := mass * g - front_load * 2.0
	n0 = mass * g / 4.0
	wheels.clear()
	var names := ["Wheel_FL", "Wheel_FR", "Wheel_RL", "Wheel_RR"]
	for i in 4:
		var wh := Wheel.new()
		wh.name = names[i]
		wh.i = i
		wh.front = i < 2
		wh.left = i % 2 == 0
		wh.r = float(w["radius_front"]) if wh.front else float(w["radius_rear"])
		wh.k = float(s["spring_front"]) if wh.front else float(s["spring_rear"])
		wh.width = float(w["width_front"]) if wh.front else float(w["width_rear"])
		wh.arb = float(s["antiroll_front"]) if wh.front else float(s["antiroll_rear"])
		var ld := front_load if wh.front else rear_load * 0.5
		var xs := ld / wh.k
		var x := (1.0 if wh.left else -1.0) * (float(c["track_front"]) if wh.front else float(c["track_rear"])) * 0.5
		var z := wb if wh.front else -wb
		wh.local = Vector3(x, wh.r + float(s["rest_length"]) - xs, z)
		wh.hard = wh.local
		wh.static_comp = xs
		wh.inertia = float(w.get("inertia_each", 0.5 * float(w["mass_each"]) * wh.r * wh.r + 1.1))
		wh.compression = xs
		wh.prev_comp = xs
		wh.length = float(s["rest_length"]) - xs
		wheels.append(wh)

func wheel_by_name(n: String) -> Wheel:
	for wh in wheels:
		if wh.name == n:
			return wh
	return null

static func smoothstep01(a: float, b: float, x: float) -> float:
	var t := clampf((x - a) / (b - a), 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)

func read_state(t: Transform3D, lv: Vector3, av: Vector3) -> void:
	xf = t
	q_basis = t.basis.orthonormalized()
	vel = lv
	ang_w = av
	com_w = t * com_local
	ang_local = q_basis.inverse() * av
	fwd = q_basis.z
	up = q_basis.y
	left = q_basis.x
	speed = vel.length()
	fwd_speed = vel.dot(fwd)
	lat_speed = vel.dot(left)

func add_force_at(f: Vector3, p: Vector3) -> void:
	force_acc += f
	var r := p - com_w
	torque_acc += r.cross(f)

func step(dt: float, input: CarInput, ray: Callable) -> void:
	force_acc = Vector3.ZERO
	torque_acc = Vector3.ZERO
	inp = input
	steering(dt)
	suspension(dt, ray)
	powertrain(dt)
	tyres(dt)
	aero()

func steering(dt: float) -> void:
	var w: Dictionary = tu["wheels"]
	var sf: Dictionary = w["steer_speed_falloff"]
	var v := absf(fwd_speed)
	var full := float(sf["full_until"])
	var at := float(sf["at"])
	var mn := float(sf["min_factor"])
	var k := 1.0
	if v > full:
		k = mn if v >= at else 1.0 - (1.0 - mn) * (v - full) / (at - full)
	var max_s := deg_to_rad(float(w["max_steer_deg"]))
	var target := inp.steer * max_s * k
	if contacts >= 2 and v > 6.0:
		var beta := atan2(lat_speed, absf(fwd_speed))
		var dz := deg_to_rad(5.0)
		if absf(beta) > dz:
			target += clampf((beta - signf(beta) * dz) * 0.55, deg_to_rad(-12.0), deg_to_rad(12.0)) * signf(fwd_speed)
	target = clampf(target, -max_s, max_s)
	steer_angle = move_toward(steer_angle, target, deg_to_rad(float(w["steer_rate_deg_s"])) * dt)
	var d := steer_angle
	var lb := float(tu["car"]["wheelbase"])
	var t := float(tu["car"]["track_front"])
	var ack := float(w["ackermann"])
	for wh in wheels:
		if not wh.front:
			wh.steer = wh.toe
			continue
		var a := d
		if absf(d) > 1e-4:
			var rr := lb / tan(absf(d))
			var inner := (d > 0.0) == wh.left
			var acka := atan(lb / (rr + (-t * 0.5 if inner else t * 0.5)))
			a = signf(d) * (absf(d) + ack * (acka - absf(d)))
		wh.steer = a + wh.toe

func suspension(dt: float, ray: Callable) -> void:
	var s: Dictionary = tu["suspension"]
	var rest := float(s["rest_length"])
	var travel := float(s["travel"])
	var dir := -up
	contacts = 0
	var min_clear := 99.0
	for wh in wheels:
		wh.hard = wh.local + wh.hub
		if wh.lost:
			wh.contact = false
			wh.load = 0.0
			wh.compression = 0.0
			continue
		var o := xf * wh.hard
		var max_len := rest + wh.r + 0.6
		var hit: Dictionary = ray.call(o, o + dir * max_len)
		wh.prev_comp = wh.compression
		var toi := max_len
		if not hit.is_empty():
			toi = o.distance_to(hit.position)
		wh.ground_dist = toi - wh.r - rest
		min_clear = minf(min_clear, maxf(0.0, wh.ground_dist))
		var ln := toi - wh.r
		var x := rest - ln
		if not hit.is_empty() and x > 0.0:
			wh.contact = true
			contacts += 1
			wh.compression = minf(x, rest + wh.r)
			wh.point = o + dir * toi
			wh.normal = hit.normal
			if wh.normal.dot(up) < 0.0:
				wh.normal = -wh.normal
			wh.collider = hit.get("collider")
		else:
			wh.contact = false
			wh.compression = 0.0
			wh.collider = null
		wh.length = clampf(rest - wh.compression, rest - travel - 0.05, rest)
	clearance = min_clear
	if contacts == 0:
		var co := xf * com_local
		var ch: Dictionary = ray.call(co, co + Vector3.DOWN * 80.0)
		clearance = maxf(min_clear, co.distance_to(ch.position) - com_local.y) if not ch.is_empty() else 80.0
	var forces := [0.0, 0.0, 0.0, 0.0]
	var bump := float(s["damper_bump"])
	var reb := float(s["damper_rebound"])
	var bk := float(s["bump_stop_k"])
	for wh in wheels:
		if not wh.contact:
			continue
		var x2 := wh.compression
		var vx := (x2 - wh.prev_comp) / dt
		var f := wh.k * x2 + (bump if vx > 0.0 else reb) * vx
		if x2 > travel:
			f += bk * (x2 - travel) * (1.0 + minf(4.0, (x2 - travel) * 30.0)) + maxf(0.0, vx) * bump * 2.0
		forces[wh.i] = f
	for pair in [[0, 1], [2, 3]]:
		var a: Wheel = wheels[pair[0]]
		var b: Wheel = wheels[pair[1]]
		var dd := (a.compression if a.contact else 0.0) - (b.compression if b.contact else 0.0)
		var fa := a.arb * dd
		if a.contact:
			forces[a.i] += fa
		if b.contact:
			forces[b.i] -= fa
	for wh in wheels:
		wh.load = maxf(0.0, forces[wh.i]) if wh.contact else 0.0
		if wh.load > 0.0:
			add_force_at(up * wh.load, wh.point)

func powertrain(dt: float) -> void:
	var p: Dictionary = tu["powertrain"]
	var v := fwd_speed
	var grounded := contacts > 0
	var still := absf(v) < 0.6
	var drive := 0.0
	var brake := 0.0
	var i_thr := inp.throttle
	var i_brk := inp.brake
	if wreck:
		i_thr = 0.0
		i_brk = 1.0
	if gear == "D":
		drive = i_thr
		brake = i_brk
		if i_brk > 0.0 and i_thr <= 0.0 and still and not inp.boost and not wreck:
			reverse_hold += dt
			if reverse_hold > 0.18:
				gear = "R"
				reverse_hold = 0.0
		else:
			reverse_hold = 0.0
	else:
		drive = i_brk
		brake = i_thr
		if i_thr > 0.0 and i_brk <= 0.0 and still:
			reverse_hold += dt
			if reverse_hold > 0.12:
				gear = "D"
				reverse_hold = 0.0
		elif i_thr <= 0.0:
			reverse_hold = 0.0
	if inp.boost and i_brk > 0.0 and gear == "D":
		drive = 0.0
	var dir_sign := 1.0 if gear == "D" else -1.0
	var sp := absf(v)
	var f := drive * float(p["max_wheel_force"])
	f = minf(f, float(p["max_power_kw"]) * 1000.0 / maxf(sp, 0.5))
	var limit := float(p["limiter_mph"]) * MPH if gear == "D" else float(p["reverse_max_mph"]) * MPH
	f *= clampf((limit - sp) / (1.2 * MPH), 0.0, 1.0)
	var regen := 0.0
	var rf_max := float(p["regen_force"])
	if drive <= 0.0 and brake <= 0.0 and gear == "D" and v > 0.0:
		regen = rf_max * smoothstep01(0.4, 4.0, v)
	if drive <= 0.0 and brake <= 0.0 and gear == "R" and v < 0.0:
		regen = rf_max * 0.5 * smoothstep01(0.4, 3.0, -v)
	motor_force = f * dir_sign
	regen_force = regen
	load = drive
	grip_prepass()
	var slide := absf(inp.steer) * (1.0 - smoothstep01(5.0, 16.0, sp))
	var tck := 1.0 + 0.15 * slide
	var a_fwd := maxf(0.0, last_accel.dot(fwd))
	var tcs := float(p["traction_control"])
	for wh in wheels:
		wh.cap = wheel_cap(wh, tcs) * tck + wh.inertia * a_fwd / (wh.r * wh.r) + (0.0 if wh.contact else 1e9)
	var cap_f := wheels[0].cap + wheels[1].cap
	var cap_r := wheels[2].cap + wheels[3].cap
	var ff := f * float(p["front_share"])
	var fr := f * (1.0 - float(p["front_share"]))
	if ff > cap_f:
		fr += ff - cap_f
		ff = cap_f
	if fr > cap_r:
		ff = minf(cap_f, ff + fr - cap_r)
		fr = cap_r
	var rs := float(p["front_share"])
	var bfs := float(p["brake_front_share"])
	var bf := float(p["brake_force"])
	var held := gear == "D" and drive <= 0.0 and not inp.boost and still and grounded
	if held:
		parked_t += dt
	else:
		parked_t = 0.0
	brake_on = 1.0 if (brake > 0.0 or held) else 0.0
	for wh in wheels:
		if wh.lost:
			wh.drive = 0.0
			wh.brake = 0.0
			wh.regen = 0.0
			continue
		var mate: Wheel = wheels[wh.i ^ 1]
		var axf := ff if wh.front else fr
		var share := 1.0
		if not mate.lost:
			share = wh.cap / (wh.cap + mate.cap) if wh.cap + mate.cap > 0.0 else 0.5
		var fw1 := minf(axf * (1.0 if mate.lost else 0.5), wh.cap)
		var fw2 := minf(axf * share, wh.cap)
		wh.drive = dir_sign * maxf(fw1, fw2) * wh.r
		var n := 1.0 if mate.lost else 2.0
		wh.regen = regen * (rs if wh.front else 1.0 - rs) / n * wh.r
		wh.brake = (brake * bf * (bfs if wh.front else 1.0 - bfs) / n + (bf * 0.25 if held else 0.0)) * wh.r
	motor_rpm = absf(wheels[2].omega * wheels[2].r) * float(p["motor_rpm_per_mps"])

func grip_prepass() -> void:
	var ty: Dictionary = tu["tyres"]
	var ap := deg_to_rad(float(ty["peak_slip_angle_deg"]))
	for wh in wheels:
		var nl := wh.load
		var ls := clampf(1.0 - float(ty["load_sensitivity"]) * (nl / n0 - 1.0), 0.7, 1.15)
		var ck := 1.0 - minf(0.5, absf(wh.camber) * 2.5)
		wh.mu_x = float(ty["mu_long"]) * ls * ck
		wh.mu_y = float(ty["mu_lat"]) * ls * ck
		wh.sy = wh.alpha / ap

func wheel_cap(wh: Wheel, kappa: float) -> float:
	if wh.lost or not wh.contact or wh.load <= 0.0:
		return 0.0
	var ty: Dictionary = tu["tyres"]
	var sx := kappa / float(ty["peak_slip_ratio"])
	var c := tyre_curve(ty, sx, wh.sy)
	return wh.mu_x * wh.load * c.x * absf(sx) / c.z if c.z > 1e-6 else 0.0

static func tyre_curve(ty: Dictionary, sx: float, sy: float) -> Vector3:
	var s := sqrt(sx * sx + sy * sy)
	if s < 1e-6:
		return Vector3(0.0, 2.0, s)
	if s <= 1.0:
		return Vector3(s * (2.0 - s), 2.0 - 2.0 * s, s)
	var fall := (float(ty["falloff_long"]) * sx * sx + float(ty["falloff_lat"]) * sy * sy) / (s * s)
	var u := (s - 1.0) * 1.5
	return Vector3(fall + (1.0 - fall) / (1.0 + u * u), 0.0, s)

func tyres(dt: float) -> void:
	var ty: Dictionary = tu["tyres"]
	var p: Dictionary = tu["powertrain"]
	var kp := float(ty["peak_slip_ratio"])
	var ap := deg_to_rad(float(ty["peak_slip_angle_deg"]))
	var relax := float(ty["relaxation_length"])
	var rres := float(ty["rolling_resistance"])
	var h := dt / NS
	var nsum := 0.0
	for wh in wheels:
		nsum += wh.load
	var sp := absf(fwd_speed)
	var tc_limit := float(p["traction_control"]) * (1.0 + 2.5 * absf(inp.steer) * (1.0 - smoothstep01(5.0, 16.0, sp))) + 0.06
	for wh in wheels:
		if wh.lost:
			continue
		var ii := wh.inertia
		if not wh.contact or wh.load <= 0.0:
			var om := wh.omega + dt * (wh.drive * 0.25) / ii
			var rg := wh.regen + wh.brake
			var dec := dt * rg / ii
			om = 0.0 if absf(om) <= dec else om - signf(om) * dec
			wh.omega = om * (1.0 - 0.15 * dt)
			wh.spin = fmod(wh.spin + wh.omega * dt, TAU)
			wh.fx = 0.0
			wh.fy = 0.0
			wh.kappa = 0.0
			wh.slip = 0.0
			wh.slip_vel = 0.0
			wh.alpha *= 0.9
			wh.tc = 1.0
			continue
		var n := wh.normal
		var fw := q_basis * Vector3(sin(wh.steer), 0.0, cos(wh.steer))
		fw = (fw - n * fw.dot(n)).normalized()
		var lw := n.cross(fw)
		var r := wh.point - com_w
		var vc := ang_w.cross(r) + vel
		if wh.collider is RigidBody3D:
			var rb: RigidBody3D = wh.collider
			vc -= rb.linear_velocity + rb.angular_velocity.cross(wh.point - rb.global_transform.origin)
		var v_long := vc.dot(fw)
		var v_lat := vc.dot(lw)
		var nl := wh.load
		var mux := wh.mu_x
		var muy := wh.mu_y
		var alpha_ss := atan2(v_lat, maxf(absf(v_long), 2.0))
		wh.alpha += (alpha_ss - wh.alpha) * minf(1.0, (absf(v_long) + 4.0) * dt / relax)
		var sy := wh.alpha / ap
		var mw := maxf(80.0, mass * nl / maxf(1.0, nsum))
		var vl := v_long
		var fx_sum := 0.0
		var kap := 0.0
		var fy_last := 0.0
		for k in NS:
			var vden := maxf(absf(vl), 3.0)
			kap = (wh.omega * wh.r - vl) / vden
			var sx := kap / kp
			var cv := tyre_curve(ty, sx, sy)
			var fxk := mux * nl * cv.x * sx / cv.z if cv.z > 1e-6 else 0.0
			fy_last = -muy * nl * cv.x * sy / cv.z if cv.z > 1e-6 else 0.0
			var keff := mux * nl * maxf(0.05, cv.y) / kp
			var dir_d := signf(wh.drive) if wh.drive != 0.0 else 1.0
			if wh.drive != 0.0 and dir_d * kap > tc_limit:
				wh.tc = maxf(0.05, wh.tc - h * 12.0 * (dir_d * kap / tc_limit - 0.9))
			else:
				wh.tc = minf(1.0, wh.tc + h * 4.0)
			if wh.brake > 0.0 and kap < -0.14:
				wh.abs_k = maxf(0.15, wh.abs_k - h * 40.0)
			else:
				wh.abs_k = minf(1.0, wh.abs_k + h * 12.0)
			var denom := ii + h * wh.r * wh.r * keff / vden
			var om2 := wh.omega + h * (wh.drive * wh.tc - wh.r * fxk) / denom
			var bt := wh.brake * wh.abs_k + wh.regen * wh.abs_k
			if bt > 0.0:
				var dec2 := h * bt / denom
				om2 = 0.0 if absf(om2) <= dec2 else om2 - signf(om2) * dec2
			wh.omega = om2
			fx_sum += fxk
			vl += fxk * h / mw
		var fxt := fx_sum / NS
		fxt -= rres * nl * smoothstep01(0.0, 0.6, absf(v_long)) * signf(v_long)
		var fyt := fy_last - nl * 0.35 * wh.camber
		wh.kappa = kap
		wh.fx = fxt
		wh.fy = fyt
		var svv := wh.omega * wh.r - v_long
		wh.slip_vel = sqrt(svv * svv + v_lat * v_lat)
		wh.slip = clampf(sqrt(pow(kap / kp, 2.0) + pow(wh.alpha / ap, 2.0)) - 1.0, 0.0, 3.0)
		wh.spin = fmod(wh.spin + wh.omega * dt, TAU)
		add_force_at(fw * fxt + lw * fyt, wh.point)

func aero() -> void:
	var a: Dictionary = tu["aero"]
	var rho := float(tu["air_density"])
	var cd := float(a["cd_a"]) + (float(a["wing_drag_a"]) if wing else 0.0)
	add_force_at(vel * (-0.5 * rho * cd * speed), com_w)
	var vf := maxf(0.0, fwd_speed)
	var q := 0.5 * rho * vf * vf
	var la := float(a["lift_a"])
	if la != 0.0:
		add_force_at(up * (q * la), com_w)
	if wing:
		add_force_at(up * (-q * float(a["wing_downforce_a"])), xf * Vector3(0.0, 0.9, -1.85))
	var ad: Array = a["angular_drag"]
	var tl := Vector3(-float(ad[0]) * ang_local.x, -float(ad[1]) * ang_local.y, -float(ad[2]) * ang_local.z)
	torque_acc += q_basis * tl

func reset_state(v: float) -> void:
	steer_angle = 0.0
	gear = "D"
	reverse_hold = 0.0
	parked_t = 0.0
	for wh in wheels:
		wh.omega = v / wh.r
		wh.compression = wh.static_comp
		wh.prev_comp = wh.static_comp
		wh.alpha = 0.0
		wh.tc = 1.0
		wh.abs_k = 1.0
