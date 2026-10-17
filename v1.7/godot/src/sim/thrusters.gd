# Thrusters: ten cold-gas nozzles in three groups (rear boost, front retro, side lift) with valve timing, gimbal slew, flap and pod deploy, frost and damage in the car frame, plus the control allocator. Mirrors web/src/sim/thrusters.js and allocator.js.
class_name Thrusters
extends RefCounted

const REAR_NAMES := ["Nozzle_RL1", "Nozzle_RL2", "Nozzle_RR2", "Nozzle_RR1"]
const FRONT_NAMES := ["Nozzle_FL", "Nozzle_FR"]
const SIDE_NAMES := ["Nozzle_SL1", "Nozzle_SL2", "Nozzle_SR1", "Nozzle_SR2"]
const BASIS := {
	"rear": [0.0, 1.0, 1.0, 0.0],
	"front": [0.0, -1.0, 1.0, 0.0],
	"side": [1.0, 0.0, 0.0, 1.0],
}

class Nozzle:
	var name: String
	var group: String
	var front: bool
	var a0y: float
	var a0z: float
	var a9y: float
	var a9z: float
	var base: Vector3
	var pos: Vector3
	var exit: float = 0.1
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

	func dir_of(p: float, s: float) -> Vector3:
		var fa := cos(p) * cos(s)
		var fb := sin(p) * cos(s)
		return Vector3(sin(s), fa * a0y + fb * a9y, fa * a0z + fb * a9z)

	func thrust() -> float:
		return force.length()

var t: Dictionary
var rear: Array[Nozzle] = []
var front: Array[Nozzle] = []
var side: Array[Nozzle] = []
var all: Array[Nozzle] = []
var deploy: float = 0.0
var deploy_target: float = 0.0
var front_last_use: float = -99.0
var side_deploy: float = 0.0
var side_target: float = 0.0
var side_last_use: float = -99.0
var time: float = 0.0
var flap: float = 0.0
var extend: float = 0.0
var total_force: Vector3 = Vector3.ZERO
var total_torque: Vector3 = Vector3.ZERO
var achieved: PackedFloat64Array = PackedFloat64Array([0, 0, 0, 0, 0, 0])

func _init() -> void:
	t = Tuning.data()["thrusters"]
	_group("rear", REAR_NAMES, rear)
	_group("front", FRONT_NAMES, front)
	_group("side", SIDE_NAMES, side)

func _group(g: String, names: Array, list: Array[Nozzle]) -> void:
	if not t.has(g):
		return
	var c: Dictionary = t[g]
	var ps: Array = c["positions"]
	var pr: Array = c["pitch_range_deg"]
	var b: Array = BASIS[g]
	for i in ps.size():
		var p: Array = ps[i]
		var n := Nozzle.new()
		n.name = names[i] if i < names.size() else "%s_%d" % [g, i]
		n.group = g
		n.front = g == "front"
		n.a0y = b[0]
		n.a0z = b[1]
		n.a9y = b[2]
		n.a9z = b[3]
		n.base = Vector3(float(p[0]), float(p[1]), float(p[2]))
		n.pos = n.base
		n.exit = float(c.get("exit_m", 0.1))
		n.thrust_max = float(c["thrust_each"])
		n.pitch_min = deg_to_rad(float(pr[0]))
		n.pitch_max = deg_to_rad(float(pr[1]))
		n.side_max = deg_to_rad(float(c["side_deflect_deg"]))
		n.dir = n.dir_of(0.0, 0.0)
		list.append(n)
		all.append(n)

func nozzle(nm: String) -> Nozzle:
	for n in all:
		if n.name == nm:
			return n
	return null

func available(n: Nozzle) -> float:
	if not n.attached:
		return 0.0
	var d := 1.0
	if n.group == "front":
		d = clampf((deploy - 0.5) / 0.5, 0.0, 1.0)
	elif n.group == "side":
		d = clampf((side_deploy - 0.5) / 0.5, 0.0, 1.0)
	return n.thrust_max * n.health * d

func request_front() -> void:
	front_last_use = time

func request_side() -> void:
	side_last_use = time

func update(dt: float, com: Vector3) -> void:
	var ft: Dictionary = t["front"]
	var st: Dictionary = t.get("side", {})
	time += dt
	deploy_target = 1.0 if (time - front_last_use) < float(ft["retract_delay_s"]) else 0.0
	deploy = move_toward(deploy, deploy_target, dt / float(ft["deploy_time_s"]))
	flap = clampf(deploy / 0.45, 0.0, 1.0)
	extend = clampf((deploy - 0.35) / 0.65, 0.0, 1.0)
	if not st.is_empty():
		side_target = 1.0 if (time - side_last_use) < float(st["retract_delay_s"]) else 0.0
		side_deploy = move_toward(side_deploy, side_target, dt / float(st["deploy_time_s"]))
	var g_rate := deg_to_rad(float(t["gimbal_rate_deg_s"])) * dt
	var v_open := float(t["valve_open_s"])
	var v_close := float(t["valve_close_s"])
	var travel := float(ft["deploy_travel_m"])
	var s_travel := float(st.get("deploy_travel_m", 0.0))
	total_force = Vector3.ZERO
	total_torque = Vector3.ZERO
	for n in all:
		if n.group == "front":
			n.pos = Vector3(n.base.x, n.base.y, n.base.z + travel * extend)
		elif n.group == "side":
			n.pos = Vector3(n.base.x, n.base.y - s_travel * side_deploy, n.base.z)
		var avail := available(n)
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
		n.dir = n.dir_of(n.pitch + n.mis_pitch, n.side + n.mis_side)
		var mag := n.valve * avail * n.ground_gain
		n.force = n.dir * mag
		n.frost = clampf(n.frost + (n.valve * n.valve * dt) / 7.0 - dt / 26.0, 0.0, 1.0)
		total_force += n.force
		total_torque += (n.pos - com).cross(n.force)

func _max_of(list: Array[Nozzle]) -> float:
	var s := 0.0
	for n in list:
		s += n.thrust_max * n.health * (1.0 if n.attached else 0.0)
	return s

func max_front() -> float:
	return _max_of(front)

func max_rear() -> float:
	return _max_of(rear)

func max_side() -> float:
	return _max_of(side)

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
	var n: Nozzle = all[i]
	var fx := v.x
	var fa := v.y * n.a0y + v.z * n.a0z
	var fb := v.y * n.a9y + v.z * n.a9z
	var th := atan2(fb, fa)
	var pmin := lim_pmin[i]
	var pmax := lim_pmax[i]
	if th < pmin or th > pmax:
		var b0a := cos(pmin)
		var b0b := sin(pmin)
		var b1a := cos(pmax)
		var b1b := sin(pmax)
		var t0 := maxf(0.0, fa * b0a + fb * b0b)
		var t1 := maxf(0.0, fa * b1a + fb * b1b)
		var d0 := (fa - t0 * b0a) * (fa - t0 * b0a) + (fb - t0 * b0b) * (fb - t0 * b0b)
		var d1 := (fa - t1 * b1a) * (fa - t1 * b1a) + (fb - t1 * b1b) * (fb - t1 * b1b)
		if d0 <= d1:
			fa = t0 * b0a
			fb = t0 * b0b
		else:
			fa = t1 * b1a
			fb = t1 * b1b
	var m := sqrt(fa * fa + fb * fb)
	var lm := lim_smax[i] * m
	fx = clampf(fx, -lm, lm)
	var mag := sqrt(fx * fx + fa * fa + fb * fb)
	if mag > tl:
		var sc := tl / mag
		fx *= sc
		fa *= sc
		fb *= sc
	return Vector3(fx, fa * n.a0y + fb * n.a9y, fa * n.a0z + fb * n.a9z)

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
		lim_t[i] = available(n) * n.ground_gain
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
		var fa := x.y * n.a0y + x.z * n.a0z
		var fb := x.y * n.a9y + x.z * n.a9z
		var mag := sqrt(fx * fx + fa * fa + fb * fb)
		if lim_t[i] <= 0.0 or mag < lim_t[i] * 0.004:
			n.cmd_valve = 0.0
			continue
		var m := sqrt(fa * fa + fb * fb)
		n.cmd_pitch = atan2(fb, fa)
		n.cmd_side = atan2(fx, m)
		n.cmd_valve = clampf(mag / lim_t[i], 0.0, 1.0)

func reset_state() -> void:
	for i in ax.size():
		ax[i] = Vector3.ZERO
	deploy = 0.0
	deploy_target = 0.0
	front_last_use = -99.0
	side_deploy = 0.0
	side_target = 0.0
	side_last_use = -99.0
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
		n.pos = n.base
