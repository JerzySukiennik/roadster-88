# Car: the Roadster rigid body (Jolt) gluing VehicleSim, Thrusters and FlightComputer; applies forces each physics tick and reports impacts.
class_name Car
extends RigidBody3D

signal impacted(info: Dictionary)

const LAYER_WORLD := 1
const LAYER_CARS := 2
const LAYER_PROPS := 4
const LAYER_DEBRIS := 8
const MPH := 0.44704

var vs: VehicleSim
var th: Thrusters
var fc: FlightComputer
var input := CarInput.new()
var rig: Node3D = null
var damage: Node = null
var wrecked: bool = false
var com_local: Vector3
var inertia_v: Vector3
var prev_lin_vel: Vector3 = Vector3.ZERO
var prev_ang_vel: Vector3 = Vector3.ZERO
var last_accel: Vector3 = Vector3.ZERO
var frozen_vel: Vector3 = Vector3.ZERO
var frozen_ang: Vector3 = Vector3.ZERO
var in_limbo: bool = false
var sim_time: float = 0.0
var pending_impacts: Array = []
var scrape: float = 0.0
var max_impulse_tick: float = 0.0
var hull_body: CollisionShape3D
var hull_cabin: CollisionShape3D
var _ray := PhysicsRayQueryParameters3D.new()
var _ray_fn: Callable
var _excludes: Array[RID] = []

func _init() -> void:
	vs = VehicleSim.new()
	th = Thrusters.new()
	fc = FlightComputer.new(th)

func setup() -> void:
	var t := Tuning
	mass = t.f("car", "mass", 1950.0)
	com_local = t.v3("car", "com")
	center_of_mass_mode = RigidBody3D.CENTER_OF_MASS_MODE_CUSTOM
	center_of_mass = com_local
	var inr: Dictionary = t.g("car", "inertia", {})
	inertia_v = Vector3(float(inr.get("pitch", 3050.0)), float(inr.get("yaw", 3380.0)), float(inr.get("roll", 690.0)))
	inertia = inertia_v
	var proj_g := float(ProjectSettings.get_setting("physics/3d/default_gravity", 9.81))
	gravity_scale = float(t.top("gravity", 9.81)) / proj_g
	linear_damp_mode = RigidBody3D.DAMP_MODE_REPLACE
	angular_damp_mode = RigidBody3D.DAMP_MODE_REPLACE
	linear_damp = 0.0
	angular_damp = 0.0
	can_sleep = false
	continuous_cd = true
	contact_monitor = true
	max_contacts_reported = 12
	collision_layer = LAYER_CARS
	collision_mask = LAYER_WORLD | LAYER_CARS | LAYER_PROPS | LAYER_DEBRIS
	var pm := PhysicsMaterial.new()
	pm.friction = 0.45
	pm.bounce = 0.08
	physics_material_override = pm
	build_hull({})
	_ray.collision_mask = LAYER_WORLD | LAYER_CARS | LAYER_PROPS
	_ray.hit_back_faces = false
	_ray_fn = Callable(self, "_raycast")
	_excludes = [get_rid()]
	_ray.exclude = _excludes

static func hull_points(crush: Dictionary) -> Array:
	var c: Dictionary = Tuning.data()["car"]
	var w := float(c["width"]) * 0.5 - 0.02
	var l := float(c["length"]) * 0.5
	var cf := float(crush.get("front", 0.0))
	var cr := float(crush.get("rear", 0.0))
	var cl := float(crush.get("left", 0.0))
	var cri := float(crush.get("right", 0.0))
	var top := float(crush.get("roof", 0.0))
	var zf := l - 0.04 - cf
	var zr := -l + 0.02 + cr
	var wl := w - cl
	var wr := -(w - cri)
	var body := PackedVector3Array([
		Vector3(wl * 0.86, 0.24, zf), Vector3(wr * 0.86, 0.24, zf), Vector3(wl * 0.86, 0.52, zf - 0.05), Vector3(wr * 0.86, 0.52, zf - 0.05),
		Vector3(wl, 0.2, minf(zf, 1.6)), Vector3(wr, 0.2, minf(zf, 1.6)), Vector3(wl, 0.8, minf(zf - 0.45, 1.0)), Vector3(wr, 0.8, minf(zf - 0.45, 1.0)),
		Vector3(wl, 0.2, maxf(zr, -1.7)), Vector3(wr, 0.2, maxf(zr, -1.7)), Vector3(wl, 0.88, maxf(zr + 0.4, -1.6)), Vector3(wr, 0.88, maxf(zr + 0.4, -1.6)),
		Vector3(wl * 0.92, 0.3, zr), Vector3(wr * 0.92, 0.3, zr), Vector3(wl * 0.92, 0.82, zr + 0.05), Vector3(wr * 0.92, 0.82, zr + 0.05),
	])
	var ct := float(c["height"]) - top
	var cabin := PackedVector3Array([
		Vector3(0.72, 0.78, 0.75), Vector3(-0.72, 0.78, 0.75), Vector3(0.6, ct - 0.08, -0.05), Vector3(-0.6, ct - 0.08, -0.05),
		Vector3(0.58, ct - 0.02, -0.6), Vector3(-0.58, ct - 0.02, -0.6), Vector3(0.7, 0.86, -1.55), Vector3(-0.7, 0.86, -1.55),
		Vector3(0.78, 0.78, -0.4), Vector3(-0.78, 0.78, -0.4),
	])
	return [body, cabin]

func build_hull(crush: Dictionary) -> void:
	var pts := hull_points(crush)
	if hull_body == null:
		hull_body = CollisionShape3D.new()
		hull_body.name = "HullBody"
		add_child(hull_body)
		hull_cabin = CollisionShape3D.new()
		hull_cabin.name = "HullCabin"
		add_child(hull_cabin)
	var s1 := ConvexPolygonShape3D.new()
	s1.points = pts[0]
	hull_body.shape = s1
	var s2 := ConvexPolygonShape3D.new()
	s2.points = pts[1]
	hull_cabin.shape = s2

func _raycast(from: Vector3, to: Vector3) -> Dictionary:
	_ray.from = from
	_ray.to = to
	return get_world_3d().direct_space_state.intersect_ray(_ray)

func add_ray_exclude(rid: RID) -> void:
	_excludes.append(rid)
	_ray.exclude = _excludes

func teleport(xf: Transform3D, v: float = 0.0) -> void:
	global_transform = xf
	linear_velocity = xf.basis.z * v
	angular_velocity = Vector3.ZERO
	prev_lin_vel = linear_velocity
	prev_ang_vel = Vector3.ZERO
	vs.reset_state(v)
	th.reset_state()
	fc.reset_state()
	reset_physics_interpolation()

func speed_mph() -> float:
	return linear_velocity.length() / MPH

func _physics_process(dt: float) -> void:
	var __t0 := Time.get_ticks_usec()
	if in_limbo:
		Prof.add("car_physics", Time.get_ticks_usec() - __t0)
		return
	if wrecked and sleeping:
		Prof.add("car_physics", Time.get_ticks_usec() - __t0)
		return
	sim_time += dt
	var xf := global_transform
	var lv := linear_velocity
	var av := angular_velocity
	last_accel = (lv - prev_lin_vel) / dt
	vs.read_state(xf, lv, av)
	vs.last_accel = last_accel
	vs.wreck = wrecked
	vs.step(dt, input, _ray_fn)
	var ftot := vs.force_acc
	var ttot := vs.torque_acc
	if not wrecked:
		fc.update(dt, input, vs, inertia_v)
		_ground_gain(xf)
		th.update(dt, com_local)
		var b := vs.q_basis
		ftot += b * th.total_force
		ttot += b * th.total_torque
	apply_central_force(ftot)
	apply_torque(ttot)
	prev_lin_vel = lv
	prev_ang_vel = av
	Prof.add("car_physics", Time.get_ticks_usec() - __t0)

func _ground_gain(xf: Transform3D) -> void:
	var ge: Dictionary = Tuning.data()["thrusters"]["ground_effect"]
	var hgt := float(ge["height"])
	var boost := float(ge["boost"])
	var b := vs.q_basis
	for n in th.all:
		n.ground_gain = 1.0
		n.ground_dist = 99.0
		if not n.attached or n.valve < 0.01:
			continue
		var o := xf * n.pos
		var d := b * (-n.dir)
		if d.y > -0.2:
			continue
		var hit := _raycast(o, o + d * hgt * 2.5)
		if not hit.is_empty():
			var toi := o.distance_to(hit.position)
			n.ground_dist = toi
			if toi < hgt:
				n.ground_gain = 1.0 + boost * (1.0 - toi / hgt) * -d.y

func _integrate_forces(state: PhysicsDirectBodyState3D) -> void:
	var n := state.get_contact_count()
	max_impulse_tick = 0.0
	var scr := 0.0
	var comw := state.transform * com_local
	for i in n:
		var imp: Vector3 = state.get_contact_impulse(i)
		var mag := imp.length()
		var pos: Vector3 = state.get_contact_local_position(i)
		var nor: Vector3 = state.get_contact_local_normal(i)
		var obj: Object = state.get_contact_collider_object(i)
		var cvel: Vector3 = state.get_contact_collider_velocity_at_position(i)
		var v_pt := prev_lin_vel + prev_ang_vel.cross(pos - comw) - cvel
		var vn := -v_pt.dot(nor)
		var vt := (v_pt + nor * vn).length()
		if vt > 2.0:
			scr = maxf(scr, clampf(vt / 20.0, 0.0, 1.0) * clampf(mag / 200.0, 0.0, 1.0))
		max_impulse_tick = maxf(max_impulse_tick, mag)
		if mag > 300.0:
			pending_impacts.append({"impulse": mag, "point": pos, "normal": nor, "collider": obj, "vn": vn, "vt": vt, "vel": prev_lin_vel})
	scrape = lerpf(scrape, scr, 0.25)

func _process(_dt: float) -> void:
	if pending_impacts.is_empty():
		return
	var best: Dictionary = {}
	var total := 0.0
	for im in pending_impacts:
		total += float(im.impulse)
		if best.is_empty() or float(im.impulse) > float(best.impulse):
			best = im
	pending_impacts.clear()
	best["total"] = total
	impacted.emit(best)

func enter_limbo() -> void:
	frozen_vel = linear_velocity
	frozen_ang = angular_velocity
	in_limbo = true
	freeze_mode = RigidBody3D.FREEZE_MODE_STATIC
	freeze = true

func exit_limbo() -> void:
	freeze = false
	in_limbo = false
	linear_velocity = frozen_vel
	angular_velocity = frozen_ang
	prev_lin_vel = frozen_vel
	reset_physics_interpolation()

func make_wreck() -> void:
	wrecked = true
	input.clear()
	for nz in th.all:
		nz.valve = 0.0
		nz.cmd_valve = 0.0
		nz.force = Vector3.ZERO
	th.total_force = Vector3.ZERO
	th.total_torque = Vector3.ZERO
	can_sleep = true
