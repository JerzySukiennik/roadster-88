# CarCamera: spring-damped chase camera with look-ahead, speed FOV, shake and mouse orbit, plus the first-person driver eye with head look.
class_name CarCamera
extends Camera3D

const MPH := 0.44704

var car: Car
var fpp := false
var cfg: Dictionary
var yaw := 0.0
var pitch := 0.0
var orbit_yaw := 0.0
var orbit_pitch := 0.0
var idle_mouse := 99.0
var head_yaw := 0.0
var head_pitch := 0.0
var pos_s: Vector3
var target_s: Vector3
var shake := 0.0
var shake_t := 0.0
var impact_kick := 0.0
var frozen := false
var initialized := false
var fov_s := 60.0
var focus_k := 0.0
var focus_on := false
var dist_s := 5.8
var height_s := 1.55
var _ray := PhysicsShapeQueryParameters3D.new()
var _sphere := SphereShape3D.new()
var override_xf: Variant = null
var noise := FastNoiseLite.new()

func _ready() -> void:
	physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF
	cfg = Tuning.data()["camera"]
	near = 0.05
	far = 9000.0
	_sphere.radius = 0.22
	_ray.shape = _sphere
	_ray.collision_mask = 1 | 2 | 4
	noise.frequency = 1.0
	noise.fractal_octaves = 2

func attach(c: Car) -> void:
	car = c
	initialized = false

func mouse_look(rel: Vector2) -> void:
	idle_mouse = 0.0
	if fpp:
		head_yaw = clampf(head_yaw - rel.x * 0.0028, -deg_to_rad(float(cfg["fpp_yaw_limit_deg"])), deg_to_rad(float(cfg["fpp_yaw_limit_deg"])))
		head_pitch = clampf(head_pitch - rel.y * 0.0028, -deg_to_rad(float(cfg["fpp_pitch_limit_deg"])), deg_to_rad(float(cfg["fpp_pitch_limit_deg"])))
	else:
		orbit_yaw = wrapf(orbit_yaw - rel.x * 0.0035, -PI, PI)
		orbit_pitch = clampf(orbit_pitch + rel.y * 0.0025, -0.35, 1.2)

func kick(amount: float) -> void:
	impact_kick = maxf(impact_kick, amount)

func _process(dt: float) -> void:
	var __t0 := Time.get_ticks_usec()
	if car == null or not is_instance_valid(car):
		Prof.add("camera", Time.get_ticks_usec() - __t0)
		return
	if override_xf != null:
		global_transform = override_xf
		Prof.add("camera", Time.get_ticks_usec() - __t0)
		return
	idle_mouse += dt
	var cxf := car.get_global_transform_interpolated()
	if fpp:
		_fpp(cxf, dt)
	else:
		_chase(cxf, dt)
	Prof.add("camera", Time.get_ticks_usec() - __t0)

func _fpp(cxf: Transform3D, dt: float) -> void:
	var eye := Vector3(0.38, 0.97, -0.44)
	if car.rig and car.rig.n.has("Eye_Driver"):
		eye = (car.rig.n["Eye_Driver"] as Node3D).transform.origin
	var drv = get_tree().root.get_node_or_null("Game/Driver")
	if drv and drv.has_method("eye_local"):
		var e: Variant = drv.eye_local()
		if e != null:
			eye = e
	var b := cxf.basis.orthonormalized()
	var look := Basis(Vector3.UP, head_yaw) * Basis(Vector3.RIGHT, -head_pitch)
	var cam_b := b * look * Basis(Vector3.UP, PI)
	var p := cxf * eye
	var sc_node: Node3D = car.rig.n.get("Screen") if car.rig else null
	var fk_target := 0.0
	var sp := p
	if sc_node and CarModel.using_real:
		sp = sc_node.global_position
		var ang := acos(clampf((-cam_b.z).dot((sp - p).normalized()), -1.0, 1.0))
		focus_on = ang < (0.46 if focus_on else 0.3)
		fk_target = 1.0 if focus_on else 0.0
	focus_k = lerpf(focus_k, fk_target, 1.0 - exp(-5.0 * dt))
	var fk := focus_k * focus_k * (3.0 - 2.0 * focus_k)
	p = p.lerp(sp, fk * 0.42)
	shake_t += dt
	var sh := _shake_amount() * 0.25
	var off := Vector3(noise.get_noise_2d(shake_t * 18.0, 0.0), noise.get_noise_2d(0.0, shake_t * 18.0), 0.0) * sh * 0.02
	global_transform = Transform3D(cam_b, p + cam_b * off)
	var spd := car.linear_velocity.length() / MPH
	fov = lerpf(fov, lerpf(72.0, 82.0, clampf(spd / 200.0, 0.0, 1.0)) - 20.0 * fk, 1.0 - exp(-3.0 * dt))

func _shake_amount() -> float:
	var th := car.th
	var thrust := th.total_force.length() / maxf(th.max_rear() + th.max_front(), 1.0)
	var boost := 0.0
	for nz in th.rear:
		boost += nz.valve * (1.0 if nz.pitch < 0.4 else 0.3)
	boost /= 4.0
	impact_kick = maxf(0.0, impact_kick - impact_kick * 3.0 * get_process_delta_time())
	var road := clampf(car.linear_velocity.length() / 110.0, 0.0, 1.0) * 0.15 * (1.0 if car.vs.contacts > 0 else 0.0)
	return clampf(thrust * 0.35 + boost * 0.6 + impact_kick + road + car.scrape * 0.6, 0.0, 2.0)

func _chase(cxf: Transform3D, dt: float) -> void:
	var b := cxf.basis.orthonormalized()
	var fwd := b.z
	var fh := Vector3(fwd.x, 0, fwd.z)
	if fh.length() < 0.2:
		fh = Vector3(sin(yaw), 0, cos(yaw))
	fh = fh.normalized()
	var heading := atan2(fh.x, fh.z)
	var v := car.linear_velocity
	var vh := Vector3(v.x, 0, v.z)
	var la := float(cfg["look_ahead"])
	if vh.length() > 4.0:
		var vhead := atan2(vh.x, vh.z)
		var diff := wrapf(vhead - heading, -PI, PI)
		if absf(diff) < PI * 0.6:
			heading += diff * la * clampf((vh.length() - 4.0) / 10.0, 0.0, 1.0)
	if idle_mouse > float(cfg["recentre_after_s"]):
		var k := 1.0 - exp(-2.2 * dt)
		orbit_yaw = lerp_angle(orbit_yaw, 0.0, k)
		orbit_pitch = lerpf(orbit_pitch, 0.0, k)
	var stiff := float(cfg["follow_stiffness"])
	var tgt := cxf * Vector3(0, 0.45, 0) + Vector3.UP * 0.3
	if not initialized:
		yaw = heading
		pos_s = tgt
		target_s = tgt
		initialized = true
	var desired_yaw := heading + orbit_yaw
	yaw = lerp_angle(yaw, desired_yaw, 1.0 - exp(-stiff * 0.55 * dt))
	target_s = target_s.lerp(tgt, 1.0 - exp(-stiff * 2.2 * dt))
	target_s.x = tgt.x
	target_s.z = tgt.z
	var spd := v.length()
	var mph := spd / MPH
	var dist := float(cfg["chase_distance"]) * (1.0 + clampf(mph / 250.0, 0.0, 1.0) * 0.12)
	var height := float(cfg["chase_height"])
	dist_s = lerpf(dist_s, dist, 1.0 - exp(-2.0 * dt))
	var base_pitch := atan2(height - 0.75, dist_s)
	var p := clampf(base_pitch + orbit_pitch, -0.25, 1.35)
	var dir := Vector3(-sin(yaw) * cos(p), sin(p), -cos(yaw) * cos(p))
	var r := sqrt(dist_s * dist_s + pow(height - 0.75, 2.0))
	var want := target_s + dir * r
	var space := get_world_3d().direct_space_state
	_ray.transform = Transform3D(Basis.IDENTITY, target_s)
	_ray.motion = want - target_s
	_ray.exclude = [car.get_rid()]
	var res := space.cast_motion(_ray)
	if res.size() == 2 and res[0] < 1.0:
		want = target_s + (want - target_s) * maxf(res[0] - 0.02, 0.08)
	var cc := cxf * Vector3(0, 0.55, 0)
	var away := want - cc
	if away.length() < 2.6:
		if away.length() < 0.01:
			away = -fh
		want = cc + away.normalized() * 2.6
	var gq := PhysicsRayQueryParameters3D.create(want + Vector3.UP * 2.0, want + Vector3.DOWN * 3.0, 1)
	var gh := space.intersect_ray(gq)
	if not gh.is_empty():
		want.y = maxf(want.y, gh.position.y + 0.35)
	pos_s = want
	shake_t += dt
	var sh := _shake_amount()
	var off := Vector3(noise.get_noise_2d(shake_t * 22.0, 3.0), noise.get_noise_2d(7.0, shake_t * 22.0), 0.0) * sh * 0.045
	var look_at_p := target_s + fh * (1.6 + clampf(mph / 200.0, 0.0, 1.0) * 1.5) + Vector3(0, 0.05, 0)
	var xf := Transform3D(Basis.IDENTITY, pos_s).looking_at(look_at_p, Vector3.UP)
	xf.origin += xf.basis * off
	global_transform = xf
	var fmin := float(cfg["fov_min"])
	var fmax := float(cfg["fov_max"])
	var fat := float(cfg["fov_full_at_mph"])
	var want_fov := lerpf(fmin, fmax, clampf(mph / fat, 0.0, 1.0)) + sh * 1.5
	fov_s = lerpf(fov_s, want_fov, 1.0 - exp(-3.0 * dt))
	fov = fov_s
