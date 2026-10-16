# Hud: near-invisible third-person HUD (rolling speed digits lower left, six nozzle dots bottom centre, amber time-circuit arc when armed), fades after 3 s of calm.
extends CanvasLayer

const MPH := 0.44704
const FADE_AFTER := 3.0

var game
var root: Control
var speed_ctl: Control
var dots_ctl: Control
var shown := 0.0
var calm_t := 0.0
var shown_speed := 0.0
var last_speed := 0.0
var last_input := ""
var font: Font
var font_small: Font
var arm_k := 0.0
var flash := 0.0

class SpeedDraw extends Control:
	var hud
	func _draw() -> void:
		hud._draw_speed(self)

class DotsDraw extends Control:
	var hud
	func _draw() -> void:
		hud._draw_dots(self)

func setup(g) -> void:
	game = g
	layer = 5
	root = Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	var sf := SystemFont.new()
	sf.font_names = PackedStringArray(["SF Pro Display", "SF Pro", ".AppleSystemUIFont", "Helvetica Neue", "Inter"])
	sf.font_weight = 300
	sf.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_ONE_QUARTER
	var fv := FontVariation.new()
	fv.base_font = sf
	fv.opentype_features = {"tnum": 1}
	font = fv
	var sf2 := SystemFont.new()
	sf2.font_names = PackedStringArray(["SF Pro Text", "SF Pro", ".AppleSystemUIFont", "Helvetica Neue", "Inter"])
	sf2.font_weight = 500
	font_small = sf2
	speed_ctl = SpeedDraw.new()
	speed_ctl.hud = self
	speed_ctl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(speed_ctl)
	dots_ctl = DotsDraw.new()
	dots_ctl.hud = self
	dots_ctl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(dots_ctl)

func _input_sig() -> String:
	var c: Car = game.car
	if c == null:
		return ""
	var i := c.input
	return "%d%d%d%d%d%d%d%d" % [int(i.throttle > 0), int(i.brake > 0), int(i.steer * 2), int(i.boost), int(i.lift), int(i.descend), int(i.pitch * 2), int(i.roll * 2)]

func _process(dt: float) -> void:
	var __t0 := Time.get_ticks_usec()
	var c: Car = game.car
	if c == null or not is_instance_valid(c):
		Prof.add("hud", Time.get_ticks_usec() - __t0)
		return
	var vs := get_viewport().get_visible_rect().size
	var sc := vs.y / 1000.0
	speed_ctl.position = Vector2(46, vs.y - 150 * sc)
	speed_ctl.size = Vector2(420 * sc, 130 * sc)
	dots_ctl.position = Vector2(vs.x * 0.5 - 60 * sc, vs.y - 70 * sc)
	dots_ctl.size = Vector2(120 * sc, 60 * sc)
	var spd := c.linear_velocity.length() / MPH
	var sig := _input_sig()
	var accel := absf(spd - last_speed) / maxf(dt, 1e-4)
	last_speed = spd
	var tt = game.tt
	var armed: bool = tt != null and tt.armed
	var thrust := c.th.total_force.length() > 200.0
	var active: bool = sig != last_input or accel > 3.0 or thrust or armed or c.input.any_active()
	last_input = sig
	if active:
		calm_t = 0.0
	else:
		calm_t += dt
	var want := 1.0 if calm_t < FADE_AFTER else 0.0
	if game.cam.fpp or game.paused or (tt != null and tt.hide_hud):
		want = 0.0
	shown = move_toward(shown, want, dt * (3.0 if want > shown else 0.8))
	shown_speed = lerpf(shown_speed, spd, 1.0 - exp(-10.0 * dt))
	arm_k = move_toward(arm_k, 1.0 if armed else 0.0, dt * 3.0)
	root.modulate.a = shown
	root.visible = shown > 0.001
	speed_ctl.queue_redraw()
	dots_ctl.queue_redraw()
	Prof.add("hud", Time.get_ticks_usec() - __t0)

func _draw_speed(ctl: Control) -> void:
	var sc := ctl.size.y / 130.0
	var size := int(96 * sc)
	var v := maxf(shown_speed, 0.0)
	var digits := 3
	var units := fmod(v, 10.0)
	var col := Color(1, 1, 1, 0.94)
	var shadow := Color(0, 0, 0, 0.28)
	var dw := font.get_string_size("0", HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	var base_y := ctl.size.y * 0.78
	var n_needed := 1
	if v >= 9.5:
		n_needed = 2
	if v >= 99.5:
		n_needed = 3
	var x := 0.0
	for k in range(digits - 1, -1, -1):
		var place := pow(10.0, k)
		var d := 0.0
		if k == 0:
			d = units
		else:
			var below := fmod(v, place)
			var carry := clampf((below - (place - 1.0)) / 1.0, 0.0, 1.0)
			d = fmod(floor(v / place), 10.0) + carry
		if k >= n_needed and v < place - 0.5:
			continue
		var d0 := int(floor(d)) % 10
		var fr: float = d - floor(d)
		if k == 0:
			fr = smoothstep(0.0, 1.0, fr)
			fr = clampf((fr - 0.5) * 1.6 + 0.5, 0.0, 1.0)
		var d1 := (d0 + 1) % 10
		var off := fr * size * 0.82
		for pair in [[d0, -off, 1.0 - fr], [d1, size * 0.82 - off, fr]]:
			var a: float = pair[2]
			if a <= 0.01:
				continue
			var p := Vector2(x, base_y + pair[1])
			ctl.draw_string(font, p + Vector2(0, 2 * sc), str(pair[0]), HORIZONTAL_ALIGNMENT_LEFT, -1, size, Color(shadow, shadow.a * a))
			ctl.draw_string(font, p, str(pair[0]), HORIZONTAL_ALIGNMENT_LEFT, -1, size, Color(col, col.a * a))
		x += dw
	if arm_k > 0.001:
		var tt = game.tt
		var prog := clampf(shown_speed / 88.0, 0.0, 1.0)
		var cx := x + 34 * sc
		var cy := base_y - size * 0.33
		var r := 22.0 * sc
		var amber := Color(1.0, 0.68, 0.18, 0.95 * arm_k)
		ctl.draw_arc(Vector2(cx, cy), r, 0, TAU, 64, Color(1, 1, 1, 0.14 * arm_k), 1.5 * sc, true)
		ctl.draw_arc(Vector2(cx, cy), r, -PI * 0.5, -PI * 0.5 + TAU * prog, 64, amber, 2.0 * sc, true)
		var year_s: String = tt.dest_label_short() if tt else ""
		ctl.draw_string(font_small, Vector2(cx + r + 10 * sc, cy + 6 * sc), year_s, HORIZONTAL_ALIGNMENT_LEFT, -1, int(15 * sc), Color(1.0, 0.82, 0.55, 0.9 * arm_k))

func _draw_dots(ctl: Control) -> void:
	var c: Car = game.car
	if c == null:
		return
	var sc := ctl.size.y / 60.0
	var cx := ctl.size.x * 0.5
	var cy := ctl.size.y * 0.5
	for nz in c.th.all:
		var p := nz.base
		var dp := Vector2(-p.x * 52.0 * sc, -p.z * 9.5 * sc)
		var d := nz.dir
		var off: Vector2 = Vector2(-d.x, -d.z) * 3.2 * sc
		var thr := nz.valve if nz.attached else 0.0
		var base_a := 0.22 if nz.attached else 0.06
		var a := base_a + 0.78 * thr
		var r := 2.4 * sc
		var col := Color(1, 1, 1, a)
		if nz.health < 0.6 and nz.attached:
			col = Color(1.0, 0.75, 0.6, a)
		ctl.draw_circle(Vector2(cx, cy) + dp + off * thr, r + thr * 0.9 * sc, Color(0, 0, 0, a * 0.25))
		ctl.draw_circle(Vector2(cx, cy) + dp + off * thr, r, col)

func on_car_changed(_c) -> void:
	calm_t = 0.0
