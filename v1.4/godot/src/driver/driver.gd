# Driver: loads Jurek's avatar and garments from assets/driver at runtime (GLTFDocument on a worker thread), rebinds garment skins and Cloth_ bones to the body skeleton, seats him in the active Roadster and drives the pose.
extends Node

const BASE := "res://ext/assets/driver/"
const HEAD_MESHES := ["Head", "Lashes", "Eye_L", "Eye_R", "Hair_ScalpCap_Medium", "Hair_Strands_Medium", "Eyebrow_Strands_L", "Eyebrow_Strands_R"]
const OUTFITS := {
	"default": ["rtfkt-ar-hoodie", "sweatpants-hm", "crocs-green"],
	"tee": ["biedronka-tee", "sweatpants-hm", "crocs-green"],
	"af1": ["rtfkt-nike-af1-tee", "sweatpants-hm", "crocs-green"],
	"tnf": ["rtfkt-nike-af1-tee", "tnf-quest-jacket", "sweatpants-hm", "crocs-green"],
	"pigeon": ["stapleverse-pigeon-hoodie", "sweatpants-hm", "crocs-green"],
	"cap": ["rtfkt-ar-hoodie", "sweatpants-hm", "crocs-green", "cap-rtfkt-murakami"],
}

var game
var avatar: Node3D
var skel: Skeleton3D
var pose: DriverPose
var states: Dictionary = {}
var worn: Dictionary = {}
var outfit := "default"
var pending: Array = []
var task_ids: Dictionary = {}
var loaded_body := false
var reach_t := 9.0
var fpp_hidden := false
var head_nodes: Array = []

func setup(g) -> void:
	game = g
	name = "Driver"
	game.driver = self
	if args_skip():
		return
	_load_async("body", BASE + "character_nude_v2_mobile.glb")
	for item in OUTFITS[outfit]:
		_load_async(item, BASE + "garments/" + item + ".glb")

func args_skip() -> bool:
	return game.args.has("nodriver")

func _load_async(key: String, path: String) -> void:
	var gpath := path
	if not FileAccess.file_exists(path):
		var live := ProjectSettings.globalize_path("res://").path_join("../assets/driver/" + path.trim_prefix(BASE)).simplify_path()
		if FileAccess.file_exists(live):
			gpath = live
		else:
			return
	var st := GLTFState.new()
	var doc := GLTFDocument.new()
	states[key] = {"state": st, "doc": doc, "done": false, "err": OK}
	var id := WorkerThreadPool.add_task(func():
		var err := doc.append_from_file(gpath, st)
		states[key]["err"] = err
		states[key]["done"] = true
	, false, "gltf " + key)
	task_ids[key] = id

func _process(dt: float) -> void:
	for key in task_ids.keys():
		var id: int = task_ids[key]
		if WorkerThreadPool.is_task_completed(id):
			WorkerThreadPool.wait_for_task_completion(id)
			task_ids.erase(key)
			_finish(key)
	reach_t += dt
	if pose:
		var k := 0.0
		if reach_t < 0.28:
			k = smoothstep(0.0, 0.28, reach_t)
		elif reach_t < 0.55:
			k = 1.0
		elif reach_t < 0.95:
			k = 1.0 - smoothstep(0.55, 0.95, reach_t)
		pose.reach_k = k
		pose.head_yaw = game.cam.head_yaw if game.cam.fpp else 0.0
		pose.head_pitch = game.cam.head_pitch if game.cam.fpp else 0.0
		_update_targets()
	var want_hidden: bool = game.cam.fpp
	if want_hidden != fpp_hidden:
		fpp_hidden = want_hidden
		game.cam.cull_mask = (0xFFFFF & ~2) if fpp_hidden else 0xFFFFF

func _finish(key: String) -> void:
	var s: Dictionary = states[key]
	if int(s["err"]) != OK:
		push_warning("driver: failed to load " + key)
		return
	var scene: Node = (s["doc"] as GLTFDocument).generate_scene(s["state"])
	if key == "body":
		_setup_body(scene)
		for p in pending:
			_wear(p[0], p[1])
		pending.clear()
	elif skel == null:
		pending.append([key, scene])
	else:
		_wear(key, scene)

func _setup_body(scene: Node) -> void:
	avatar = scene as Node3D
	avatar.name = "Driver"
	skel = avatar.find_child("Skeleton3D", true, false) as Skeleton3D
	if skel == null:
		return
	for mi in avatar.find_children("*", "MeshInstance3D", true, false):
		var m3 := mi as MeshInstance3D
		m3.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		if HEAD_MESHES.has(String(m3.name)):
			m3.layers = 2
			head_nodes.append(m3)
	for ap in avatar.find_children("*", "AnimationPlayer", true, false):
		ap.queue_free()
	pose = DriverPose.new()
	pose.name = "DriverPose"
	skel.add_child(pose)
	_attach_to(game.car)
	loaded_body = true

func _attach_to(c) -> void:
	if avatar == null or c == null or c.rig == null:
		return
	if avatar.get_parent():
		avatar.get_parent().remove_child(avatar)
	c.rig.model.add_child(avatar)
	avatar.transform = Transform3D.IDENTITY
	avatar.visible = true
	_update_targets()

func on_car_changed(c) -> void:
	_attach_to(c)

func _local(n: Node3D) -> Vector3:
	return avatar.global_transform.affine_inverse() * n.global_position

func _update_targets() -> void:
	var c = game.car
	if c == null or c.rig == null or avatar == null or not avatar.is_inside_tree():
		return
	var r = c.rig
	if r.n.has("Seat_Driver"):
		pose.targets["seat"] = _local(r.n["Seat_Driver"])
	if r.n.has("Grip_L"):
		pose.targets["left_grip"] = _local(r.n["Grip_L"])
	if r.n.has("Grip_R"):
		pose.targets["right_grip"] = _local(r.n["Grip_R"])
	if r.n.has("SteeringWheel"):
		var sw: Node3D = r.n["SteeringWheel"]
		pose.targets["wheel_center"] = _local(sw)
		pose.targets["wheel_up"] = (avatar.global_transform.basis.inverse() * sw.global_transform.basis.y).normalized()

func eye_local() -> Variant:
	if skel == null or avatar == null or not avatar.is_inside_tree() or game.car == null:
		return null
	if pose == null or not pose.eye_valid:
		return null
	var w: Vector3 = skel.global_transform * pose.eye_pos
	return game.car.rig.model.global_transform.affine_inverse() * w

func reach(world_point: Vector3) -> void:
	if pose == null or avatar == null:
		return
	pose.reach_point = avatar.global_transform.affine_inverse() * world_point
	reach_t = 0.0

func set_outfit(o: String) -> void:
	if not OUTFITS.has(o):
		return
	outfit = o
	for k in worn.keys():
		var nodes: Array = worn[k]
		for n in nodes:
			if is_instance_valid(n):
				n.queue_free()
	worn.clear()
	for item in OUTFITS[o]:
		_load_async(item, BASE + "garments/" + item + ".glb")

func _bone_for(name_in: String) -> int:
	var i := skel.find_bone(name_in)
	if i < 0 and name_in == "Head":
		i = skel.find_bone("Head_2")
	return i

func _wear(key: String, scene: Node) -> void:
	var gskel := scene.find_child("Skeleton3D", true, false) as Skeleton3D
	if gskel == null:
		return
	for bi in gskel.get_bone_count():
		var bn := gskel.get_bone_name(bi)
		if bn.begins_with("Cloth_") and skel.find_bone(bn) < 0:
			var nb := skel.get_bone_count()
			skel.add_bone(bn)
			var gp := gskel.get_bone_parent(bi)
			var pname := gskel.get_bone_name(gp) if gp >= 0 else ""
			var pidx := _bone_for(pname) if pname != "" else -1
			skel.set_bone_parent(nb, pidx)
			skel.set_bone_rest(nb, gskel.get_bone_rest(bi))
			skel.reset_bone_pose(nb)
	var nodes: Array = []
	for mi in scene.find_children("*", "MeshInstance3D", true, false):
		var m3 := mi as MeshInstance3D
		var sk := m3.skin
		var ns := Skin.new()
		if sk:
			for i in sk.get_bind_count():
				var bname := String(sk.get_bind_name(i))
				if bname == "":
					bname = gskel.get_bone_name(sk.get_bind_bone(i))
				var bi2 := _bone_for(bname)
				if bi2 < 0:
					bi2 = 0
				ns.add_named_bind(skel.get_bone_name(bi2), sk.get_bind_pose(i))
		var gxf := m3.transform
		m3.get_parent().remove_child(m3)
		skel.add_child(m3)
		m3.transform = gxf
		m3.skin = ns
		m3.skeleton = NodePath("..")
		m3.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		if key.begins_with("cap"):
			m3.layers = 2
		nodes.append(m3)
	var ap := scene.find_child("AnimationPlayer", true, false) as AnimationPlayer
	if ap and ap.has_animation("hood_state_down"):
		var anim := ap.get_animation("hood_state_down")
		for t in anim.get_track_count():
			var path := String(anim.track_get_path(t))
			var bone := path.get_slice(":", 1)
			if bone == "" or anim.track_get_key_count(t) == 0:
				continue
			var entry: Dictionary = pose.cloth_poses.get(bone, {})
			match anim.track_get_type(t):
				Animation.TYPE_ROTATION_3D:
					entry["r"] = anim.track_get_key_value(t, 0)
				Animation.TYPE_POSITION_3D:
					entry["p"] = anim.track_get_key_value(t, 0)
			pose.cloth_poses[bone] = entry
	worn[key] = nodes
	scene.queue_free()
