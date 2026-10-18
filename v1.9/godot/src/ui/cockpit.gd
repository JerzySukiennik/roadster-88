# Cockpit: renders the touchscreen and driver display into SubViewports on the Screen and Cluster meshes, the FPP gaze dot, and turns a click into a tap at the gaze point.
extends Node

const MPH := 0.44704

var game
var screen_vp: SubViewport
var cluster_vp: SubViewport
var ui
var cluster_ui: Control
var dot_layer: CanvasLayer
var dot: Control
var tris: Array = []
var screen_node: MeshInstance3D
var tap_world := Vector3.ZERO
var tap_t := 99.0
var hover_uv := Vector2(-1, -1)
var frame := 0

class ClusterDraw extends Control:
	var cockpit
	func _process(_dt: float) -> void:
		queue_redraw()
	func _draw() -> void:
		cockpit._draw_cluster(self)

class DotDraw extends Control:
	var on := false
	func _draw() -> void:
		if on:
			var c := size * 0.5
			draw_circle(c, 3.2, Color(0, 0, 0, 0.35))
			draw_circle(c, 2.2, Color(1, 1, 1, 0.92))

var font_c: Font
var font_cs: Font

func setup(g) -> void:
	game = g
	name = "Cockpit"
	screen_vp = SubViewport.new()
	screen_vp.size = Vector2i(1280, 800)
	screen_vp.transparent_bg = false
	screen_vp.gui_disable_input = false
	screen_vp.handle_input_locally = true
	screen_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(screen_vp)
	ui = load("res://src/ui/screen_ui.gd").new()
	screen_vp.add_child(ui)
	ui.build(game)
	cluster_vp = SubViewport.new()
	cluster_vp.size = Vector2i(720, 300)
	cluster_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(cluster_vp)
	var sf := SystemFont.new()
	sf.font_names = PackedStringArray(["SF Pro Display", "SF Pro", ".AppleSystemUIFont", "Helvetica Neue"])
	sf.font_weight = 300
	var fv := FontVariation.new()
	fv.base_font = sf
	fv.opentype_features = {"tnum": 1}
	font_c = fv
	var sf2 := SystemFont.new()
	sf2.font_names = PackedStringArray(["SF Pro Text", "SF Pro", ".AppleSystemUIFont", "Helvetica Neue"])
	sf2.font_weight = 600
	font_cs = sf2
	var cd := ClusterDraw.new()
	cd.cockpit = self
	cd.size = Vector2(720, 300)
	cluster_vp.add_child(cd)
	cluster_ui = cd
	dot_layer = CanvasLayer.new()
	dot_layer.layer = 6
	add_child(dot_layer)
	dot = DotDraw.new()
	dot.set_anchors_preset(Control.PRESET_FULL_RECT)
	dot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	dot_layer.add_child(dot)
	on_car_changed(game.car)

func on_car_changed(c) -> void:
	if c == null or c.rig == null:
		return
	var m: CarMaterials = c.rig.mats
	(m.mats["Screen"] as ShaderMaterial).set_shader_parameter("tex", screen_vp.get_texture())
	(m.mats["Screen"] as ShaderMaterial).set_shader_parameter("use_tex", 1.0)
	(m.mats["Screen"] as ShaderMaterial).set_shader_parameter("tex_emit", 1.6)
	(m.mats["Cluster"] as ShaderMaterial).set_shader_parameter("tex", cluster_vp.get_texture())
	(m.mats["Cluster"] as ShaderMaterial).set_shader_parameter("use_tex", 1.0)
	(m.mats["Cluster"] as ShaderMaterial).set_shader_parameter("tex_emit", 1.6)
	screen_node = c.rig.model.find_child("Screen", true, false) as MeshInstance3D
	_cache_tris()

func _cache_tris() -> void:
	tris.clear()
	if screen_node == null or screen_node.mesh == null:
		return
	for s in screen_node.mesh.get_surface_count():
		var mat := screen_node.mesh.surface_get_material(s)
		var arr := screen_node.mesh.surface_get_arrays(s)
		var nm := mat.resource_name if mat else ""
		var ov := screen_node.get_surface_override_material(s)
		if ov != game.car.rig.mats.mats["Screen"] and nm != "Screen":
			continue
		var v: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
		var uv: PackedVector2Array = arr[Mesh.ARRAY_TEX_UV]
		var idx: PackedInt32Array = arr[Mesh.ARRAY_INDEX] if arr[Mesh.ARRAY_INDEX] != null else PackedInt32Array()
		if idx.is_empty():
			for i in v.size():
				idx.append(i)
		for i in range(0, idx.size(), 3):
			tris.append([v[idx[i]], v[idx[i + 1]], v[idx[i + 2]], uv[idx[i]], uv[idx[i + 1]], uv[idx[i + 2]]])

func on_view_changed(fpp: bool) -> void:
	dot.on = fpp
	dot.queue_redraw()

func gaze_uv() -> Vector2:
	var cam := get_viewport().get_camera_3d()
	if cam == null or screen_node == null or tris.is_empty():
		return Vector2(-1, -1)
	var inv := screen_node.global_transform.affine_inverse()
	var o := inv * cam.global_position
	var d := (inv.basis * (-cam.global_transform.basis.z)).normalized()
	var best := 1e9
	var out := Vector2(-1, -1)
	for t in tris:
		var a: Vector3 = t[0]
		var b: Vector3 = t[1]
		var c: Vector3 = t[2]
		var e1 := b - a
		var e2 := c - a
		var pv := d.cross(e2)
		var det := e1.dot(pv)
		if absf(det) < 1e-9:
			continue
		var tv := o - a
		var u := tv.dot(pv) / det
		if u < 0.0 or u > 1.0:
			continue
		var qv := tv.cross(e1)
		var v := d.dot(qv) / det
		if v < 0.0 or u + v > 1.0:
			continue
		var dist := e2.dot(qv) / det
		if dist > 0.0 and dist < best:
			best = dist
			var uva: Vector2 = t[3]
			var uvb: Vector2 = t[4]
			var uvc: Vector2 = t[5]
			out = uva * (1.0 - u - v) + uvb * u + uvc * v
	if best > 2.0:
		return Vector2(-1, -1)
	return out

func tap() -> void:
	var uv := gaze_uv()
	if uv.x < 0.0:
		return
	var pos := uv * Vector2(screen_vp.size)
	for pressed in [true, false]:
		var ev := InputEventMouseButton.new()
		ev.button_index = MOUSE_BUTTON_LEFT
		ev.pressed = pressed
		ev.position = pos
		ev.global_position = pos
		screen_vp.push_input(ev, true)
	ui.show_tap(pos)
	var cam := get_viewport().get_camera_3d()
	tap_world = cam.global_position - cam.global_transform.basis.z * 0.6
	tap_t = 0.0
	if game.driver and game.driver.has_method("reach"):
		game.driver.reach(_uv_to_world(uv))

func _uv_to_world(uv: Vector2) -> Vector3:
	if screen_node == null:
		return Vector3.ZERO
	for t in tris:
		var uva: Vector2 = t[3]
		var uvb: Vector2 = t[4]
		var uvc: Vector2 = t[5]
		var m := Transform2D(uvb - uva, uvc - uva, uva)
		var l := m.affine_inverse() * uv
		if l.x >= -0.01 and l.y >= -0.01 and l.x + l.y <= 1.01:
			var a: Vector3 = t[0]
			var b: Vector3 = t[1]
			var c: Vector3 = t[2]
			return screen_node.global_transform * (a + (b - a) * l.x + (c - a) * l.y)
	return screen_node.global_position

func _process(dt: float) -> void:
	var __t0 := Time.get_ticks_usec()
	frame += 1
	tap_t += dt
	var fpp: bool = game.cam.fpp
	screen_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS if (fpp or frame % 6 == 0) else SubViewport.UPDATE_DISABLED
	cluster_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS if (fpp or frame % 6 == 3) else SubViewport.UPDATE_DISABLED
	if fpp:
		var uv := gaze_uv()
		if uv.x >= 0.0:
			var pos := uv * Vector2(screen_vp.size)
			var ev := InputEventMouseMotion.new()
			ev.position = pos
			ev.global_position = pos
			screen_vp.push_input(ev, true)
			ui.set_gaze(pos, true)
		else:
			ui.set_gaze(Vector2(-100, -100), false)
	if frame % 15 == 0 and ui:
		ui.refresh()
	Prof.add("cockpit", Time.get_ticks_usec() - __t0)

func _draw_cluster(ctl: Control) -> void:
	var c: Car = game.car
	ctl.draw_rect(Rect2(Vector2.ZERO, ctl.size), Color(0.03, 0.032, 0.036))
	if c == null:
		return
	var spd := c.linear_velocity.length() / MPH
	var s := "%d" % int(round(spd))
	var fs := 150
	var w := font_c.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	ctl.draw_string(font_c, Vector2(ctl.size.x * 0.5 - w * 0.5, 190), s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(0.95, 0.96, 0.97))
	var mph_w := font_cs.get_string_size("MPH", HORIZONTAL_ALIGNMENT_LEFT, -1, 22).x
	ctl.draw_string(font_cs, Vector2(ctl.size.x * 0.5 - mph_w * 0.5, 228), "MPH", HORIZONTAL_ALIGNMENT_LEFT, -1, 22, Color(0.55, 0.57, 0.6))
	var gear := "P" if (c.vs.parked_t > 1.0) else c.vs.gear
	if c.vs.gear == "D" and absf(c.vs.fwd_speed) < 0.2 and c.input.throttle <= 0.0 and c.vs.parked_t <= 1.0:
		gear = "N" if c.vs.parked_t < 0.0 else "D"
	var x := ctl.size.x * 0.5 - 90
	for gch in ["P", "R", "N", "D"]:
		var on: bool = gch == gear
		ctl.draw_string(font_cs, Vector2(x, 280), gch, HORIZONTAL_ALIGNMENT_LEFT, -1, 30 if on else 24, Color(1, 1, 1, 0.95) if on else Color(1, 1, 1, 0.3))
		x += 50
	var tt = game.tt
	if tt and tt.armed:
		var prog := clampf(spd / 88.0, 0.0, 1.0)
		ctl.draw_arc(Vector2(110, 140), 60, -PI * 0.5, -PI * 0.5 + TAU * prog, 48, Color(1.0, 0.68, 0.18), 4.0, true)
		ctl.draw_string(font_cs, Vector2(70, 230), tt.dest_label_short(), HORIZONTAL_ALIGNMENT_LEFT, 140, 18, Color(1.0, 0.82, 0.55))
	var fm: String = c.fc.mode_name()
	if fm != "ground":
		ctl.draw_string(font_cs, Vector2(ctl.size.x - 200, 60), fm.to_upper(), HORIZONTAL_ALIGNMENT_LEFT, -1, 22, Color(0.6, 0.8, 1.0, 0.9))
	if not c.fc.assist:
		ctl.draw_string(font_cs, Vector2(ctl.size.x - 200, 92), "ASSIST OFF", HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color(1.0, 0.82, 0.55, 0.9))
