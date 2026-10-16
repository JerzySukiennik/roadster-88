# DriverPose: seated driver on the Jurek rig as a SkeletonModifier3D: hips on Seat_Driver, reclined spine, two-bone IK legs to the footwell and arms to Grip_L/R, finger curl, right hand reaching to the touch point, head following the first-person look.
class_name DriverPose
extends SkeletonModifier3D

var targets: Dictionary = {}
var head_yaw := 0.0
var head_pitch := 0.0
var reach_k := 0.0
var reach_point := Vector3.ZERO
var cloth_poses: Dictionary = {}
var idx: Dictionary = {}
var rest_g: Dictionary = {}
var len: Dictionary = {}
var ready_ok := false
var breathe := 0.0
var eye_pos := Vector3.ZERO
var eye_valid := false

func init_rig() -> void:
	var sk := get_skeleton()
	if sk == null:
		return
	for nm in ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase", "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase", "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand", "RightShoulder", "RightArm", "RightForeArm", "RightHand"]:
		var i := sk.find_bone(nm)
		if i < 0 and nm == "Head":
			i = sk.find_bone("Head_2")
		idx[nm] = i
	for k in idx.keys():
		if idx[k] < 0:
			push_warning("driver rig missing bone " + k)
			return
	for k in idx.keys():
		rest_g[k] = sk.get_bone_global_rest(idx[k])
	for s in ["Left", "Right"]:
		len[s + "leg1"] = rest_g[s + "UpLeg"].origin.distance_to(rest_g[s + "Leg"].origin)
		len[s + "leg2"] = rest_g[s + "Leg"].origin.distance_to(rest_g[s + "Foot"].origin)
		len[s + "arm1"] = rest_g[s + "Arm"].origin.distance_to(rest_g[s + "ForeArm"].origin)
		len[s + "arm2"] = rest_g[s + "ForeArm"].origin.distance_to(rest_g[s + "Hand"].origin)
	ready_ok = true

func _gp(i: int) -> Transform3D:
	return get_skeleton().get_bone_global_pose(i)

func _set_global_rot(i: int, b: Basis) -> void:
	var sk := get_skeleton()
	var par := sk.get_bone_parent(i)
	var pb := Basis.IDENTITY
	if par >= 0:
		pb = sk.get_bone_global_pose(par).basis
	sk.set_bone_pose_rotation(i, (pb.inverse() * b).orthonormalized().get_rotation_quaternion())

func _rotate_world(i: int, axis: Vector3, ang: float) -> void:
	var cur := _gp(i).basis
	_set_global_rot(i, Basis(axis.normalized(), ang) * cur)

func _aim(i: int, child: int, want: Vector3) -> void:
	var bp := _gp(i).origin
	var cp := _gp(child).origin
	var cur := (cp - bp).normalized()
	var w := want.normalized()
	if cur.length() < 1e-5 or w.length() < 1e-5:
		return
	var axis := cur.cross(w)
	var s := axis.length()
	var c := cur.dot(w)
	if s < 1e-6:
		return
	var ang := atan2(s, c)
	_set_global_rot(i, Basis(axis / s, ang) * _gp(i).basis)

func _two_bone(a: int, b: int, c: int, target: Vector3, pole: Vector3, l1: float, l2: float) -> void:
	var p := _gp(a).origin
	var dv := target - p
	var d := dv.length()
	var lo := absf(l1 - l2) + 1e-3
	var hi := (l1 + l2) * 0.999
	var dc := clampf(d, lo, hi)
	var dir := dv / maxf(d, 1e-5)
	var aa := (l1 * l1 - l2 * l2 + dc * dc) / (2.0 * dc)
	var h := sqrt(maxf(0.0, l1 * l1 - aa * aa))
	var pc := pole - dir * pole.dot(dir)
	if pc.length_squared() < 1e-8:
		pc = Vector3(0, 0, 1)
	pc = pc.normalized()
	var k := p + dir * aa + pc * h
	_aim(a, b, k - p)
	var end := p + dir * dc
	_aim(b, c, end - _gp(b).origin)

func _hand_frame(fingers: Vector3, normal: Vector3) -> Basis:
	var f := fingers.normalized()
	var n := (normal - f * normal.dot(f)).normalized()
	var x := f.cross(n).normalized()
	return Basis(x, f, n)

func _curl(side: String, amount: float, point := false) -> void:
	var sk := get_skeleton()
	for f in ["Thumb", "Index", "Middle", "Ring", "Little"]:
		var k := amount * (0.5 if f == "Thumb" else 1.0)
		if point and f == "Index":
			k = 0.05
		for j in [1, 2, 3]:
			var bi := sk.find_bone("%sHand%s%d" % [side, f, j])
			if bi < 0:
				continue
			var r := sk.get_bone_rest(bi).basis.get_rotation_quaternion()
			var add := Quaternion(Vector3.RIGHT, k * (0.9 if j == 1 and f != "Thumb" else 1.05))
			sk.set_bone_pose_rotation(bi, r * add)

func _process_modification() -> void:
	var __t0 := Time.get_ticks_usec()
	if not ready_ok:
		init_rig()
		if not ready_ok:
			Prof.add("driver_pose", Time.get_ticks_usec() - __t0)
			return
	var sk := get_skeleton()
	for k in ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftUpLeg", "LeftLeg", "LeftFoot", "RightUpLeg", "RightLeg", "RightFoot", "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand", "RightShoulder", "RightArm", "RightForeArm", "RightHand"]:
		sk.reset_bone_pose(idx[k])
	for bn in cloth_poses.keys():
		var bi := sk.find_bone(bn)
		if bi >= 0:
			var cp: Dictionary = cloth_poses[bn]
			if cp.has("r"):
				sk.set_bone_pose_rotation(bi, cp["r"])
			if cp.has("p"):
				sk.set_bone_pose_position(bi, cp["p"])
	var seat: Vector3 = targets.get("seat", Vector3(0.38, 0.27, -0.5))
	var hips_i: int = idx["Hips"]
	var hrest: Transform3D = rest_g["Hips"]
	var recline := deg_to_rad(-27.0)
	var hb := Basis(Vector3.RIGHT, recline) * hrest.basis
	sk.set_bone_pose_rotation(hips_i, hb.get_rotation_quaternion())
	sk.set_bone_pose_position(hips_i, seat + Vector3(0, 0.08, 0.07))
	breathe += get_process_delta_time()
	var b := sin(breathe * 1.6) * 0.012
	var lean := deg_to_rad(7.0) + b
	for pair in [["Spine", 0.3], ["Spine1", 0.35], ["Spine2", 0.35]]:
		_rotate_world(idx[pair[0]], Vector3.RIGHT, lean * pair[1])
	var ny := head_yaw
	var npt := -head_pitch
	_rotate_world(idx["Neck"], Vector3.RIGHT, deg_to_rad(11.0) + npt * 0.35)
	_rotate_world(idx["Head"], Vector3.RIGHT, deg_to_rad(7.0) + npt * 0.65)
	if absf(ny) > 0.0:
		_rotate_world(idx["Neck"], Vector3.UP, ny * 0.4)
		_rotate_world(idx["Head"], Vector3.UP, ny * 0.6)
	var lift := float(targets.get("shoe_lift", 0.0275))
	for side in ["Left", "Right"]:
		var sgn := 1.0 if side == "Left" else -1.0
		var ank: Vector3 = targets.get(side.to_lower() + "_foot", seat + Vector3(sgn * 0.11, -0.05 + lift, 0.78))
		_two_bone(idx[side + "UpLeg"], idx[side + "Leg"], idx[side + "Foot"], ank, Vector3(sgn * 0.15, 1.0, 0.6), len[side + "leg1"], len[side + "leg2"])
		var fb: int = idx[side + "Foot"]
		var frest: Transform3D = rest_g[side + "Foot"]
		_set_global_rot(fb, Basis(Vector3.RIGHT, deg_to_rad(-38.0)) * frest.basis)
	for side in ["Left", "Right"]:
		var sgn2 := 1.0 if side == "Left" else -1.0
		var grip: Vector3 = targets.get(side.to_lower() + "_grip", seat + Vector3(sgn2 * 0.16, 0.42, 0.62))
		var wheel_c: Vector3 = targets.get("wheel_center", seat + Vector3(0, 0.4, 0.62))
		var wheel_up: Vector3 = targets.get("wheel_up", Vector3(0, 1, 0))
		var outward := Vector3(sgn2, 0, 0)
		var tgt := grip - wheel_up * 0.07 + outward * 0.015
		var point := false
		if side == "Right" and reach_k > 0.001:
			tgt = grip.lerp(reach_point, reach_k)
			point = reach_k > 0.5
		_rotate_world(idx[side + "Shoulder"], Vector3.UP, sgn2 * deg_to_rad(-6.0))
		_two_bone(idx[side + "Arm"], idx[side + "ForeArm"], idx[side + "Hand"], tgt, Vector3(sgn2 * 0.6, -1.0, -0.2), len[side + "arm1"], len[side + "arm2"])
		var palm := (wheel_c - grip)
		palm = palm - wheel_up * palm.dot(wheel_up) * 0.4
		var fingers := wheel_up
		var hbasis := _hand_frame(fingers, palm if side == "Left" else palm)
		if side == "Right" and reach_k > 0.001:
			var to := (reach_point - _gp(idx["RightHand"]).origin)
			var fb2 := _hand_frame(to.normalized() + Vector3(0, -0.2, 0), Vector3(0, -0.4, -1.0))
			hbasis = hbasis.slerp(fb2, reach_k)
		_set_global_rot(idx[side + "Hand"], hbasis)
		_curl(side, 1.05 * (1.0 - (reach_k if side == "Right" else 0.0)) + (0.3 if side == "Right" and point else 0.0), point)
	var le := sk.find_bone("LeftEye")
	var re := sk.find_bone("RightEye")
	if le >= 0 and re >= 0:
		var hbe := _gp(idx["Head"]).basis
		eye_pos = (_gp(le).origin + _gp(re).origin) * 0.5 + hbe.z.normalized() * 0.05
		eye_valid = true
	Prof.add("driver_pose", Time.get_ticks_usec() - __t0)

