# CarRig: binds the contract nodes of the car model (real GLB or placeholder), samples the model's animation clips (gullwing doors, flap, nozzle mounts, wing, targa) and animates everything from the simulation: wheels, steering, suspension, ten nozzle gimbals, lights.
class_name CarRig
extends Node3D

const STEER_RATIO := 9.0
const DOOR_ANGLE := 1.15
const FLAP_ANGLE := 1.35

var car
var model: Node3D
var mats: CarMaterials
var n: Dictionary = {}
var rest: Dictionary = {}
var door_target := 0.0
var door := 0.0
var lights_on := false
var head_l: SpotLight3D
var head_r: SpotLight3D
var tail_light: OmniLight3D
var cabin_light: OmniLight3D
var wing_on := false
var roof_on := true
var hidden_nodes: Dictionary = {}
var hub_offset: Dictionary = {}
var clips: Dictionary = {}
var nz_rig: Dictionary = {}
var wing_t := 0.0
var wing_target := 0.0
var roof_t := 0.0
var roof_target := 0.0

const NAMES := ["Body_Shell", "Hood", "Frunk_Lid", "Bumper_F", "Bumper_R", "Door_L", "Door_R", "Mirror_L", "Mirror_R", "Roof_Targa", "Flap_F", "Wing", "Underbody",
	"Glass_Windshield", "Glass_Rear", "Glass_Door_L", "Glass_Door_R", "Glass_Quarter_L", "Glass_Quarter_R",
	"Light_Head_L", "Light_Head_R", "Light_Tail", "Light_Brake", "Lamp_Head_L", "Lamp_Head_R", "Lamp_Tail",
	"Wheel_FL", "Wheel_FR", "Wheel_RL", "Wheel_RR", "Steer_FL", "Steer_FR", "Brake_FL", "Brake_FR", "Brake_RL", "Brake_RR",
	"Nozzle_RL1", "Nozzle_RL2", "Nozzle_RR1", "Nozzle_RR2", "Nozzle_FL", "Nozzle_FR", "NozzleMount_F", "Nozzle_SL1", "Nozzle_SL2", "Nozzle_SR1", "Nozzle_SR2", "NozzleMount_S",
	"Interior", "SteeringWheel", "Screen", "Cluster", "Seat_Driver", "Grip_L", "Grip_R", "Eye_Driver", "COM", "Cam_Chase"]

func setup(c, m: Node3D, materials: CarMaterials) -> void:
	car = c
	model = m
	mats = materials
	name = "Rig"
	for nm in NAMES:
		var node := model.find_child(nm, true, false) as Node3D
		if node:
			n[nm] = node
			rest[nm] = node.transform
	for corner in ["FL", "FR", "RL", "RR"]:
		var hub_parent: Node3D = n.get("Steer_" + corner, n.get("Wheel_" + corner))
		if hub_parent:
			hub_offset[corner] = hub_parent.transform.origin
	if n.has("Wing"):
		n["Wing"].visible = wing_on
	_bind_clips()
	_bind_nozzles()
	if CarModel.using_real and n.has("Screen"):
		_relocate_screen(n["Screen"])
	for disp in ["Screen", "Cluster"]:
		if n.has(disp) and CarModel.using_real:
			var dn: Node3D = n[disp]
			var toward := -dn.transform.basis.z.normalized()
			var eye: Vector3 = n["Eye_Driver"].transform.origin if n.has("Eye_Driver") else Vector3(0.38, 1.0, -0.6)
			if toward.dot(eye - dn.transform.origin) < 0.0:
				toward = -toward
			dn.position += toward * 0.02
			rest[disp] = dn.transform
	_make_lights()

func _relocate_screen(sc: Node3D) -> void:
	var mi := sc as MeshInstance3D
	if mi == null or mi.mesh == null:
		return
	var bb := mi.mesh.get_aabb()
	var dims := [bb.size.x, bb.size.y, bb.size.z]
	var ax: int = dims.find(dims.min())
	var others := [0, 1, 2]
	others.erase(ax)
	if dims[others[0]] < dims[others[1]]:
		others.reverse()
	var eye: Vector3 = (n["Eye_Driver"] as Node3D).transform.origin if n.has("Eye_Driver") else Vector3(0.36, 0.96, -0.52)
	var p := Vector3(0.07, 0.87, 0.42)
	var nl := Vector3.ZERO
	nl[ax] = 1.0
	var b0 := sc.basis.orthonormalized()
	var want := (eye - p).normalized()
	if (b0 * nl).dot(want) < 0.0:
		nl = -nl
	var q := Quaternion((b0 * nl).normalized(), want)
	sc.transform = Transform3D(Basis(q) * b0 * Basis.from_scale(Vector3.ONE * 1.45), p)
	rest["Screen"] = sc.transform
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.012, 0.012, 0.014)
	mat.roughness = 0.25
	mat.clearcoat_enabled = true
	var bs := Vector3.ZERO
	bs[ax] = 0.018
	bs[others[0]] = dims[others[0]] * 1.06
	bs[others[1]] = dims[others[1]] * 1.08
	var back := MeshInstance3D.new()
	back.name = "Screen_Back"
	var bm := BoxMesh.new()
	bm.size = bs
	back.mesh = bm
	back.material_override = mat
	back.position = bb.get_center() - nl * 0.011
	sc.add_child(back)
	var up := Vector3.ZERO
	up[others[1]] = 1.0
	if (b0 * up).y < 0.0:
		up = -up
	var ss := Vector3.ZERO
	ss[ax] = 0.025
	ss[others[0]] = 0.06
	ss[others[1]] = 0.16
	var stem := MeshInstance3D.new()
	stem.name = "Screen_Stem"
	var sm := BoxMesh.new()
	sm.size = ss
	stem.mesh = sm
	stem.material_override = mat
	stem.position = bb.get_center() - up * (dims[others[1]] * 0.5 + 0.07) - nl * 0.03
	sc.add_child(stem)

func _bind_clips() -> void:
	var src: Dictionary = model.get_meta("clips", {}) if model.has_meta("clips") else {}
	for k in src.keys():
		var a: Animation = src[k]
		var tracks := []
		for i in a.get_track_count():
			var tt := a.track_get_type(i)
			if (tt != Animation.TYPE_POSITION_3D and tt != Animation.TYPE_ROTATION_3D) or a.track_get_key_count(i) <= 1:
				continue
			var p := a.track_get_path(i)
			var nm := String(p.get_name(p.get_name_count() - 1))
			var node: Node3D = model if String(model.name) == nm else model.find_child(nm, true, false) as Node3D
			if node:
				tracks.append([node, tt, i])
		clips[k] = {"anim": a, "tracks": tracks, "last": -1.0}

func has_clip(k: String) -> bool:
	return clips.has(k) and not (clips[k]["tracks"] as Array).is_empty()

func set_clip(k: String, t: float) -> void:
	if not clips.has(k):
		return
	var c: Dictionary = clips[k]
	if absf(float(c["last"]) - t) < 1e-4:
		return
	c["last"] = t
	var a: Animation = c["anim"]
	var time := clampf(t, 0.0, 1.0) * a.length
	for tr in c["tracks"]:
		var node: Node3D = tr[0]
		if hidden_nodes.has(String(node.name)):
			continue
		if tr[1] == Animation.TYPE_ROTATION_3D:
			node.quaternion = a.rotation_track_interpolate(tr[2], time)
		else:
			node.position = a.position_track_interpolate(tr[2], time)

func _bind_nozzles() -> void:
	for nm in n.keys():
		if not String(nm).begins_with("Nozzle_"):
			continue
		var node: Node3D = n[nm]
		var group := "side" if nm.contains("_S") else ("front" if nm.contains("_F") else "rear")
		var ex := node.find_child("Exhaust_" + nm, false, false) as Node3D
		var ex_l := Vector3(0, -1, 0) if group == "side" else Vector3(0, 0, 1.0 if group == "front" else -1.0)
		if ex and ex.position.length() > 1e-6:
			ex_l = ex.position.normalized()
		var r: Transform3D = rest[nm]
		var pb := Basis.IDENTITY
		var p := node.get_parent()
		while p and p != model and p is Node3D:
			pb = (p as Node3D).basis * pb
			p = p.get_parent()
		nz_rig[nm] = {"node": node, "rest": r, "axis": (r.basis * ex_l).normalized(), "pinv": pb.inverse()}

func _make_lights() -> void:
	head_l = _spot("Lamp_Head_L")
	head_r = _spot("Lamp_Head_R")
	tail_light = OmniLight3D.new()
	tail_light.light_color = Color(1.0, 0.05, 0.02)
	tail_light.omni_range = 4.0
	tail_light.light_energy = 0.0
	tail_light.shadow_enabled = false
	var tparent: Node3D = n.get("Lamp_Tail", model)
	tparent.add_child(tail_light)
	tail_light.position = Vector3(0, 0, -0.25) if n.has("Lamp_Tail") else Vector3(0, 0.8, -2.4)
	cabin_light = OmniLight3D.new()
	cabin_light.light_color = Color(0.75, 0.85, 1.0)
	cabin_light.omni_range = 1.1
	cabin_light.light_energy = 0.0
	cabin_light.shadow_enabled = false
	var sc: Node3D = n.get("Screen", model)
	sc.add_child(cabin_light)
	cabin_light.position = Vector3(0, 0.0, -0.15)

func _spot(anchor: String) -> SpotLight3D:
	var s := SpotLight3D.new()
	s.light_color = Color(0.92, 0.95, 1.0)
	s.spot_range = 90.0
	s.spot_angle = 26.0
	s.spot_angle_attenuation = 1.6
	s.spot_attenuation = 0.6
	s.light_energy = 0.0
	s.shadow_enabled = false
	s.light_volumetric_fog_energy = 0.6
	s.spot_angle_attenuation = 2.4
	var p: Node3D = n.get(anchor, model)
	p.add_child(s)
	s.rotation = Vector3(-0.06, PI, 0.0)
	return s

func set_shadows(on: bool) -> void:
	head_l.shadow_enabled = on
	head_r.shadow_enabled = false

func set_lod_bias(b: float) -> void:
	if model == null:
		return
	for mi in model.find_children("*", "MeshInstance3D", true, false):
		(mi as MeshInstance3D).lod_bias = b

func set_wing(on: bool) -> void:
	wing_on = on
	if n.has("Wing") and has_clip("wing_deploy"):
		wing_target = 1.0 if on else 0.0
		if on:
			n["Wing"].visible = true
	elif n.has("Wing"):
		n["Wing"].visible = on
	if car:
		car.vs.wing = on

func set_roof(on: bool) -> void:
	roof_on = on
	if has_clip("targa_remove"):
		roof_target = 0.0 if on else 1.0
	elif n.has("Roof_Targa"):
		n["Roof_Targa"].visible = on and not hidden_nodes.has("Roof_Targa")

func toggle_door() -> void:
	door_target = 0.0 if door_target > 0.5 else 1.0

func _process(dt: float) -> void:
	var __t0 := Time.get_ticks_usec()
	if car == null:
		Prof.add("rig", Time.get_ticks_usec() - __t0)
		return
	if mats:
		mats.set_world_to_car(car.get_global_transform_interpolated().affine_inverse())
	var vs: VehicleSim = car.vs
	var th: Thrusters = car.th
	for w in vs.wheels:
		var corner: String = w.name.substr(6)
		var hub_y: float = w.hard.y - w.length
		if w.lost:
			continue
		var base: Vector3 = hub_offset.get(corner, Vector3.ZERO)
		if w.front:
			var st: Node3D = n.get("Steer_" + corner)
			if st:
				st.transform = Transform3D(Basis(Vector3.UP, w.steer), Vector3(base.x, hub_y, base.z))
			var wh: Node3D = n.get("Wheel_" + corner)
			if wh:
				var r0: Transform3D = rest["Wheel_" + corner]
				wh.transform = Transform3D(r0.basis * Basis(Vector3.RIGHT, w.spin), r0.origin)
		else:
			var wh2: Node3D = n.get("Wheel_" + corner)
			if wh2:
				wh2.transform = Transform3D(Basis(Vector3.RIGHT, w.spin), Vector3(base.x, hub_y, base.z))
			var br: Node3D = n.get("Brake_" + corner)
			if br:
				var rb: Transform3D = rest["Brake_" + corner]
				br.position = rb.origin + Vector3(0, hub_y - base.y, 0)
	var sw: Node3D = n.get("SteeringWheel")
	if sw:
		var r1: Transform3D = rest["SteeringWheel"]
		sw.transform = Transform3D(r1.basis * Basis(Vector3.BACK, -vs.steer_angle * STEER_RATIO), r1.origin)
	for nz in th.all:
		var rg: Dictionary = nz_rig.get(nz.name, {})
		if rg.is_empty() or not nz.attached or hidden_nodes.has(nz.name):
			continue
		var r2: Transform3D = rg["rest"]
		var tgt: Vector3 = ((rg["pinv"] as Basis) * (-nz.dir)).normalized()
		var q := Quaternion(rg["axis"], tgt)
		(rg["node"] as Node3D).transform = Transform3D(Basis(q) * r2.basis, r2.origin)
		if mats:
			var m := mats.nozzle_mat(nz.name)
			var fr: float = nz.frost
			m.albedo_color = Color(0.78, 0.6, 0.33).lerp(Color(0.85, 0.88, 0.92), fr)
			m.roughness = lerpf(0.3, 0.7, fr)
			m.metallic = lerpf(1.0, 0.2, fr)
	var mount: Node3D = n.get("NozzleMount_F")
	if has_clip("front_nozzles_deploy"):
		set_clip("front_nozzles_deploy", th.extend)
	elif mount:
		var r3: Transform3D = rest["NozzleMount_F"]
		var travel := float(Tuning.data()["thrusters"]["front"]["deploy_travel_m"])
		mount.position = r3.origin + Vector3(0, 0, travel * th.extend)
		mount.visible = th.deploy > 0.02 or not n.has("Flap_F")
	set_clip("side_nozzles_deploy", th.side_deploy)
	var flap: Node3D = n.get("Flap_F")
	if flap and not hidden_nodes.has("Flap_F"):
		if has_clip("flap_open"):
			set_clip("flap_open", th.flap)
		else:
			var r4: Transform3D = rest["Flap_F"]
			var k := th.flap
			k = k * k * (3.0 - 2.0 * k)
			flap.transform = Transform3D(r4.basis * Basis(Vector3.RIGHT, -k * FLAP_ANGLE), r4.origin)
	if has_clip("door_L_open"):
		door = move_toward(door, door_target, dt / maxf(0.1, (clips["door_L_open"]["anim"] as Animation).length))
		set_clip("door_L_open", door)
		set_clip("door_R_open", door)
	else:
		door = move_toward(door, door_target, dt * 1.6)
		var dk := door * door * (3.0 - 2.0 * door)
		for side in ["L", "R"]:
			var d: Node3D = n.get("Door_" + side)
			if d and not hidden_nodes.has("Door_" + side):
				var r5: Transform3D = rest["Door_" + side]
				d.transform = Transform3D(r5.basis * Basis(Vector3.UP, (-1.0 if side == "L" else 1.0) * dk * DOOR_ANGLE), r5.origin)
	if n.has("Wing") and has_clip("wing_deploy") and not hidden_nodes.has("Wing"):
		wing_t = move_toward(wing_t, wing_target, dt / maxf(0.1, (clips["wing_deploy"]["anim"] as Animation).length))
		set_clip("wing_deploy", wing_t)
		n["Wing"].visible = wing_t > 0.001 or wing_target > 0.0
	if n.has("Roof_Targa") and has_clip("targa_remove") and not hidden_nodes.has("Roof_Targa"):
		roof_t = move_toward(roof_t, roof_target, dt / maxf(0.1, (clips["targa_remove"]["anim"] as Animation).length))
		set_clip("targa_remove", roof_t)
		n["Roof_Targa"].visible = roof_t < 0.999
	var brake: float = clampf(car.input.brake, 0.0, 1.0) if vs.gear == "D" and vs.fwd_speed > 0.3 else 0.0
	if mats:
		var tm: ShaderMaterial = mats.mats["LED_Tail"]
		tm.set_shader_parameter("emission_energy", 2.2 + brake * 9.0 + (1.5 if lights_on else 0.0))
		var hm: ShaderMaterial = mats.mats["LED_Head"]
		hm.set_shader_parameter("emission_energy", 9.0 if lights_on else 5.0)
	head_l.light_energy = 3.2 if lights_on else 0.0
	head_r.light_energy = 3.2 if lights_on else 0.0
	head_l.visible = lights_on
	head_r.visible = lights_on
	tail_light.light_energy = (0.3 if lights_on else 0.0) + brake * 0.8
	tail_light.visible = tail_light.light_energy > 0.01
	cabin_light.light_energy = 0.25 if lights_on else 0.0
	cabin_light.visible = lights_on
	Prof.add("rig", Time.get_ticks_usec() - __t0)

func hide_part(nm: String) -> void:
	hidden_nodes[nm] = true
