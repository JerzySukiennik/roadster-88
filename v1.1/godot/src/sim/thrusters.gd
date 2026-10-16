# Thrusters: six cold-gas nozzles (valve timing, gimbal slew, front flap deploy, frost, damage) in the car frame, plus the control allocator. Mirrors web/src/sim/thrusters.js.
class_name Thrusters
extends RefCounted

const REAR_NAMES := ["Nozzle_RL1", "Nozzle_RL2", "Nozzle_RR2", "Nozzle_RR1"]
const FRONT_NAMES := ["Nozzle_FL", "Nozzle_FR"]

class Nozzle:
	var name: String
	var front: bool
	var base: Vector3
	var pos: Vector3
	var thrust_max: float
	var pitch_min: float
	var pitch_max: float
	var side_max: float
	var pitch: float = 0.0
	var side: float = 0.0
	var valve: float = 0.0
	var cmd_pitch: float = 0.0
	var cmd_side: float = 0.0
	var cmd_valve: float = 0.0
	var health: float = 1.0
	var mis_pitch: float = 0.0
	var mis_side: float = 0.0
	var attached: bool = true
	var frost: float = 0.0
	var ground_gain: float = 1.0
	var ground_dist: float = 99.0
	var dir: Vector3 = Vector3.FORWARD
	var force: Vector3 = Vector3.ZERO
	var puff: int = 0
	var last_valve: float = 0.0

	func available(deploy: float) -> float:
		if not attached:
			return 0.0
		var d := clampf((deploy - 0.5) / 0.5, 0.0, 1.0) if front else 1.0
		return thrust_max * health * d

	func thrust() -> float:
		return force.length()

var t: Dictionary
var rear: Array[Nozzle] = []
var front: Array[Nozzle] = []
var all: Array[Nozzle] = []
var deploy: float = 0.0
var deploy_target: float = 0.0
var front_last_use: float = -99.0
var time: float = 0.0
var flap: float = 0.0
var extend: float = 0.0
var total_force: Vector3 = Vector3.ZERO
var total_torque: Vector3 = Vector3.ZERO
var achieved: PackedFloat64Array = PackedFloat64Array([0, 0, 0, 0, 0, 0])

func _init() -> void:
	t = Tuning.data()["thrusters"]
	var r: Dictionary = t["rear"]
	var f: Dictionary = t["front"]
	var rp: Array = r["positions"]
	for i in rp.size():
		all.append(_mk(REAR_NAMES[i] if i < 4 else "Nozzle_R%d" % i, false, rp[i], float(r["thrust_each"]), r["pitch_range_deg"], float(r["side_deflect_deg"])))
	var fp: Array = f["positions"]
	for i in fp.size():
		all.append(_mk(FRONT_NAMES[i] if i < 2 else "Nozzle_F%d" % i, true, fp[i], float(f["thrust_each"]), f["pitch_range_deg"], float(f["side_deflect_deg"])))
	for n in all:
		if n.front:
			front.append(n)
		else:
			rear.append(n)

func _mk(nm: String, is_front: bool, p: Array, tmax: float, pr: Array, smax: float) -> Nozzle:
	var n := Nozzle.new()
	n.name = nm
	n.front = is_front
	n.base = Vector3(float(p[0]), float(p[1]), float(p[2]))
	n.pos = n.base
	n.thrust_max = tmax
	n.pitch_min = deg_to_rad(float(pr[0]))
	n.pitch_max = deg_to_rad(float(pr[1]))
	n.side_max = deg_to_rad(smax)
	n.dir = Vector3(0, 0, -1.0 if is_front else 1.0)
	return n

func nozzle(nm: String) -> Nozzle:
	for n in all:
		if n.name == nm:
			return n
	return null

static func thrust_dir(is_front: bool, pitch: float, side: float) -> Vector3:
	var cp := cos(pitch)
	var sp := sin(pitch)
	var cs := cos(side)
	var ss := sin(side)
	return Vector3(ss, sp * cs, (-cp if is_front else cp) * cs)

func request_front() -> void:
	front_last_use = time

func update(dt: float, com: Vector3) -> void:
	var ft: Dictionary = t["front"]
	time += dt
	deploy_target = 1.0 if (time - front_last_use) < float(ft["retract_delay_s"]) else 0.0
	deploy = move_toward(deploy, deploy_target, dt / float(ft["deploy_time_s"]))
	flap = clampf(deploy / 0.45, 0.0, 1.0)
	extend = clampf((deploy - 0.35) / 0.65, 0.0, 1.0)
	var g_rate := deg_to_rad(float(t["gimbal_rate_deg_s"])) * dt
	var v_open := float(t["valve_open_s"])
	var v_close := float(t["valve_close_s"])
	var travel := float(ft["deploy_travel_m"])
	total_force = Vector3.ZERO
	total_torque = Vector3.ZERO
	for n in all:
		if n.front:
			n.pos = Vector3(n.base.x, n.base.y, n.base.z + travel * extend)
		var avail := n.available(deploy)
		var want_p := clampf(n.cmd_pitch - n.mis_pitch, n.pitch_min, n.pitch_max)
		var want_s := clampf(n.cmd_side - n.mis_side, -n.side_max, n.side_max)
		n.pitch = move_toward(n.pitch, want_p, g_rate)
		n.side = move_toward(n.side, want_s, g_rate)
		var aim_err := absf(n.pitch - want_p) + absf(n.side - want_s)
		var aim_gate := 1.0 - aim_err / 0.35 * 0.85 if aim_err < 0.35 else 0.15 * maxf(0.0, 1.0 - (aim_err - 0.35) / 0.6)
		var target := clampf(n.cmd_valve, 0.0, 1.0) * aim_gate if avail > 0.0 else 0.0
		var rate := dt / v_open if target > n.valve else dt / v_close
		n.last_valve = n.valve
		n.valve = move_toward(n.valve, target, rate)
		if n.valve > 0.02 and n.last_valve <= 0.02:
			n.puff = 1
		elif n.valve <= 0.02 and n.last_valve > 0.02:
			n.puff = -1
		else:
			n.puff = 0
		n.dir = thrust_dir(n.front, n.pitch + n.mis_pitch, n.side + n.mis_side)
		var mag := n.valve * avail * n.ground_gain
		n.force = n.dir * mag
		n.frost = clampf(n.frost + (n.valve * n.valve * dt) / 7.0 - dt / 26.0, 0.0, 1.0)
		total_force += n.force
		total_torque += (n.pos - com).cross(n.force)

func max_front() -> float:
	var s := 0.0
	for n in front:
		s += n.thrust_max * n.health * (1.0 if n.attached else 0.0)
	return s

func max_rear() -> float:
	var s := 0.0
	for n in rear:
		s += n.thrust_max * n.health * (1.0 if n.attached else 0.0)
	return s

func clear() -> void:
	for i in ax.size():
		ax[i] = Vector3.ZERO
	for n in all:
		n.cmd_valve = 0.0

const ROW_WF := Vector3(1.0, 3.0, 1.0)
const ROW_WT := Vector3(10.0 * 0.25, 5.0 * 0.25, 10.0 / (0.35 * 0.35))
const ALLOC_ITERS := 40
const ALLOC_REG := 2e-3

var ax: Array[Vector3] = []
var ay: Array[Vector3] = []
var axp: Array[Vector3] = []
var ag: Array[Vector3] = []
var lim_t: PackedFloat64Array = PackedFloat64Array()
var lim_pmin: PackedFloat64Array = PackedFloat64Array()
var lim_pmax: PackedFloat64Array = PackedFloat64Array()
var lim_smax: PackedFloat64Array = PackedFloat64Array()
var lim_r: Array[Vector3] = []
var want_fv: Vector3 = Vector3.ZERO
var want_tv: Vector3 = Vector3.ZERO

func _alloc_init() -> void:
	var cnt := all.size()
	ax.resize(cnt)
	ay.resize(cnt)
	axp.resize(cnt)
	ag.resize(cnt)
	lim_r.resize(cnt)
	lim_t.resize(cnt)
	lim_pmin.resize(cnt)
	lim_pmax.resize(cnt)
	lim_smax.resize(cnt)
	for i in cnt:
		ax[i] = Vector3.ZERO
		ay[i] = Vector3.ZERO
		axp[i] = Vector3.ZERO
		ag[i] = Vector3.ZERO

func _project(i: int, v: Vector3) -> Vector3:
	var tl := lim_t[i]
	if tl <= 0.0:
		return Vector3.ZERO
	var fr := all[i].front
	var fx := v.x
	var fy := v.y
	var fz := -v.z if fr else v.z
	var th := atan2(fy, fz)
	var pmin := lim_pmin[i]
	var pmax := lim_pmax[i]
	if th < pmin or th > pmax:
		var b0y := sin(pmin)
		var b0z := cos(pmin)
		var b1y := sin(pmax)
		var b1z := cos(pmax)
		var t0 := maxf(0.0, fy * b0y + fz * b0z)
		var t1 := maxf(0.0, fy * b1y + fz * b1z)
		var d0 := (fy - t0 * b0y) * (fy - t0 * b0y) + (fz - t0 * b0z) * (fz - t0 * b0z)
		var d1 := (fy - t1 * b1y) * (fy - t1 * b1y) + (fz - t1 * b1z) * (fz - t1 * b1z)
		if d0 <= d1:
			fy = t0 * b0y
			fz = t0 * b0z
		else:
			fy = t1 * b1y
			fz = t1 * b1z
	var m := sqrt(fy * fy + fz * fz)
	var lm := lim_smax[i] * m
	fx = clampf(fx, -lm, lm)
	var mag := sqrt(fx * fx + fy * fy + fz * fz)
	if mag > tl:
		var sc := tl / mag
		fx *= sc
		fy *= sc
		fz *= sc
	return Vector3(fx, fy, -fz if fr else fz)

func _grad(x: Array[Vector3], g: Array[Vector3], wf: Vector3, wt: Vector3) -> void:
	var cnt := x.size()
	var f := Vector3.ZERO
	var tq := Vector3.ZERO
	for i in cnt:
		f += x[i]
		tq += lim_r[i].cross(x[i])
	var rf := (f - wf) * ROW_WF
	var rt := (tq - wt) * ROW_WT
	for i in cnt:
		var tl := lim_t[i] if lim_t[i] > 0.0 else 1.0
		g[i] = rf + rt.cross(lim_r[i]) + x[i] * (ALLOC_REG * 4.0e8 / (tl * tl + 1.0))

func _lipschitz() -> float:
	var cnt := all.size()
	var v: Array[Vector3] = []
	var t2: Array[Vector3] = []
	v.resize(cnt)
	t2.resize(cnt)
	for i in cnt:
		v[i] = Vector3.ONE
	var lam := 1.0
	for it in 12:
		_grad(v, t2, Vector3.ZERO, Vector3.ZERO)
		var nrm := 0.0
		var vn := 0.0
		for i in cnt:
			nrm += t2[i].length_squared()
			vn += v[i].length_squared()
		nrm = sqrt(nrm)
		if nrm <= 0.0:
			nrm = 1.0
		vn = sqrt(vn)
		lam = nrm / (vn if vn > 0.0 else 1.0)
		for i in cnt:
			v[i] = t2[i] / nrm
	return lam * 1.05

func solve(want_f: Vector3, want_t: Vector3, com: Vector3) -> void:
	var cnt := all.size()
	if ax.size() != cnt:
		_alloc_init()
	want_fv = want_f
	want_tv = want_t
	for i in cnt:
		var n: Nozzle = all[i]
		lim_r[i] = n.pos - com
		lim_t[i] = n.available(deploy) * n.ground_gain
		lim_pmin[i] = n.pitch_min + n.mis_pitch
		lim_pmax[i] = n.pitch_max + n.mis_pitch
		lim_smax[i] = tan(n.side_max)
	for i in cnt:
		ax[i] = _project(i, ax[i])
	var eta := 1.0 / _lipschitz()
	for i in cnt:
		ay[i] = ax[i]
		axp[i] = ax[i]
	for k in range(1, ALLOC_ITERS + 1):
		_grad(ay, ag, want_f, want_t)
		var beta := float(k - 1) / float(k + 2)
		for i in cnt:
			var nx := _project(i, ay[i] - ag[i] * eta)
			ax[i] = nx
			ay[i] = nx + (nx - axp[i]) * beta
			axp[i] = nx
	var f := Vector3.ZERO
	var tq := Vector3.ZERO
	for i in cnt:
		f += ax[i]
		tq += lim_r[i].cross(ax[i])
	achieved[0] = f.x
	achieved[1] = f.y
	achieved[2] = f.z
	achieved[3] = tq.x
	achieved[4] = tq.y
	achieved[5] = tq.z
	for i in cnt:
		var n: Nozzle = all[i]
		var x := ax[i]
		var fx := x.x
		var fy := x.y
		var fz := -x.z if n.front else x.z
		var mag := sqrt(fx * fx + fy * fy + fz * fz)
		if lim_t[i] <= 0.0 or mag < lim_t[i] * 0.004:
			n.cmd_valve = 0.0
			continue
		var m := sqrt(fy * fy + fz * fz)
		n.cmd_pitch = atan2(fy, fz)
		n.cmd_side = atan2(fx, m)
		n.cmd_valve = clampf(mag / lim_t[i], 0.0, 1.0)

func reset_state() -> void:
	for i in ax.size():
		ax[i] = Vector3.ZERO
	deploy = 0.0
	deploy_target = 0.0
	front_last_use = -99.0
	flap = 0.0
	extend = 0.0
	for n in all:
		n.pitch = 0.0
		n.side = 0.0
		n.valve = 0.0
		n.cmd_valve = 0.0
		n.cmd_pitch = 0.0
		n.cmd_side = 0.0
		n.force = Vector3.ZERO
		n.frost = 0.0
		n.puff = 0
