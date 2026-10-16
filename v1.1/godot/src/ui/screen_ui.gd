# ScreenUI: the Tesla-style centre touchscreen (Time Circuits, Map, Car, Radio) rendered into a SubViewport and driven by gaze taps.
extends Control

const W := 1280.0
const H := 800.0
const RED := Color(1.0, 0.27, 0.23)
const GREEN := Color(0.3, 0.86, 0.45)
const AMBER := Color(1.0, 0.68, 0.18)
const BG := Color(0.055, 0.058, 0.064)
const CARD := Color(0.1, 0.105, 0.115)
const CARD2 := Color(0.14, 0.145, 0.158)
const TXT := Color(0.93, 0.94, 0.95)
const DIM := Color(0.55, 0.57, 0.6)
const ACCENT := Color(0.24, 0.52, 1.0)

var game
var font_l: Font
var font_m: Font
var font_b: Font
var pages: Dictionary = {}
var tabs: Dictionary = {}
var current := "time"
var rows: Dictionary = {}
var arm_btn: Button
var arm_lbl: Label
var entry := ""
var entry_lbl: Label
var bc := false
var map_ctl: Control
var radio_on := false
var radio_lbl: Label
var radio_btn: Button
var toggles: Dictionary = {}
var clock_lbl: Label
var last_tap := Vector2(-100, -100)
var tap_layer: Control
var tap_t := 9.0

class RollRow extends Control:
	var font: Font
	var text_now := ""
	var text_old := ""
	var t := 1.0
	var accent := Color.WHITE
	var size_px := 54
	func set_text(s: String) -> void:
		if s == text_now:
			return
		text_old = text_now
		text_now = s
		t = 0.0
	func _process(dt: float) -> void:
		if t < 1.0:
			t = minf(1.0, t + dt * 2.2)
			queue_redraw()
	func _draw() -> void:
		var e := 1.0 - pow(1.0 - t, 3.0)
		var cw := font.get_string_size("0", HORIZONTAL_ALIGNMENT_LEFT, -1, size_px).x
		var x := 0.0
		var y := size.y * 0.78
		var n := maxi(text_now.length(), text_old.length())
		for i in n:
			var cn := text_now[i] if i < text_now.length() else " "
			var co := text_old[i] if i < text_old.length() else " "
			var w := cw if (cn.is_valid_int() or co.is_valid_int()) else font.get_string_size(cn, HORIZONTAL_ALIGNMENT_LEFT, -1, size_px).x
			if cn != co and t < 1.0:
				var off := e * size_px * 0.9
				draw_string(font, Vector2(x, y - off), co, HORIZONTAL_ALIGNMENT_LEFT, -1, size_px, Color(1, 1, 1, 1.0 - e))
				draw_string(font, Vector2(x, y + size_px * 0.9 - off), cn, HORIZONTAL_ALIGNMENT_LEFT, -1, size_px, Color(1, 1, 1, e))
			else:
				draw_string(font, Vector2(x, y), cn, HORIZONTAL_ALIGNMENT_LEFT, -1, size_px, Color(1, 1, 1, 0.96))
			x += w

class MapView extends Control:
	var ui
	func _process(_dt: float) -> void:
		if is_visible_in_tree():
			queue_redraw()
	func _draw() -> void:
		ui._draw_map(self)

func _font(weight: int) -> Font:
	var sf := SystemFont.new()
	sf.font_names = PackedStringArray(["SF Pro Display", "SF Pro", ".AppleSystemUIFont", "Helvetica Neue", "Inter"])
	sf.font_weight = weight
	var fv := FontVariation.new()
	fv.base_font = sf
	fv.opentype_features = {"tnum": 1}
	return fv

func _sb(c: Color, r := 18, border := Color(0, 0, 0, 0), bw := 0) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = c
	s.set_corner_radius_all(r)
	s.anti_aliasing = true
	if bw > 0:
		s.border_color = border
		s.set_border_width_all(bw)
	return s

func _label(txt: String, f: Font, sz: int, col: Color) -> Label:
	var l := Label.new()
	l.text = txt
	l.add_theme_font_override("font", f)
	l.add_theme_font_size_override("font_size", sz)
	l.add_theme_color_override("font_color", col)
	return l

func _button(txt: String, sz := 24, bg := CARD2, fg := TXT, r := 16) -> Button:
	var b := Button.new()
	b.text = txt
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_override("font", font_m)
	b.add_theme_font_size_override("font_size", sz)
	b.add_theme_color_override("font_color", fg)
	b.add_theme_color_override("font_hover_color", fg)
	b.add_theme_color_override("font_pressed_color", fg)
	b.add_theme_stylebox_override("normal", _sb(bg, r))
	b.add_theme_stylebox_override("hover", _sb(bg.lightened(0.08), r))
	b.add_theme_stylebox_override("pressed", _sb(bg.lightened(0.18), r))
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	return b

func build(g) -> void:
	game = g
	size = Vector2(W, H)
	font_l = _font(300)
	font_m = _font(500)
	font_b = _font(650)
	var bg := Panel.new()
	bg.add_theme_stylebox_override("panel", _sb(BG, 0))
	bg.size = size
	add_child(bg)
	var top := HBoxContainer.new()
	top.position = Vector2(36, 22)
	top.size = Vector2(W - 72, 40)
	add_child(top)
	var brand := _label("ROADSTER", font_b, 20, TXT)
	top.add_child(brand)
	var sp := Control.new()
	sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(sp)
	clock_lbl = _label("14:00", font_m, 22, TXT)
	top.add_child(clock_lbl)
	for id in ["time", "map", "car", "radio"]:
		var page := Control.new()
		page.position = Vector2(0, 74)
		page.size = Vector2(W, H - 74 - 104)
		page.visible = id == current
		add_child(page)
		pages[id] = page
	_build_time(pages["time"])
	_build_map(pages["map"])
	_build_car(pages["car"])
	_build_radio(pages["radio"])
	var dock := Panel.new()
	dock.add_theme_stylebox_override("panel", _sb(Color(0.035, 0.037, 0.04), 0))
	dock.position = Vector2(0, H - 104)
	dock.size = Vector2(W, 104)
	add_child(dock)
	var names := {"time": "Time Circuits", "map": "Map", "car": "Car", "radio": "Radio"}
	var i := 0
	for id in ["time", "map", "car", "radio"]:
		var b := _button(names[id], 22, Color(0, 0, 0, 0), DIM, 14)
		b.position = Vector2(150 + i * 250, 20)
		b.size = Vector2(220, 64)
		b.pressed.connect(_show.bind(id))
		dock.add_child(b)
		tabs[id] = b
		i += 1
	tap_layer = Control.new()
	tap_layer.size = size
	tap_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(tap_layer)
	tap_layer.draw.connect(_draw_tap)
	_show(current)
	if game.tt:
		game.tt.changed.connect(refresh)
	refresh()

func _show(id: String) -> void:
	current = id
	for k in pages.keys():
		pages[k].visible = k == id
	for k in tabs.keys():
		(tabs[k] as Button).add_theme_color_override("font_color", TXT if k == id else DIM)
		(tabs[k] as Button).add_theme_stylebox_override("normal", _sb(CARD if k == id else Color(0, 0, 0, 0), 14))
	_click()

func _click() -> void:
	if game and game.audio:
		game.audio.play("ui_tap", 0.7)

func _toggle_sound() -> void:
	if game and game.audio:
		game.audio.play("ui_toggle", 0.7)

func _build_time(p: Control) -> void:
	var y := 14
	for spec in [["dest", "DESTINATION TIME", RED], ["present", "PRESENT TIME", GREEN], ["last", "LAST TIME DEPARTED", AMBER]]:
		var card := Panel.new()
		card.add_theme_stylebox_override("panel", _sb(CARD, 20))
		card.position = Vector2(36, y)
		card.size = Vector2(760, 132)
		p.add_child(card)
		var bar := ColorRect.new()
		bar.color = spec[2]
		bar.position = Vector2(0, 26)
		bar.size = Vector2(4, 80)
		card.add_child(bar)
		var lab := _label(spec[1], font_m, 17, spec[2])
		lab.position = Vector2(30, 14)
		card.add_child(lab)
		var heads := _label("MONTH    DAY       YEAR                    HOUR  MIN", font_m, 12, DIM)
		heads.position = Vector2(30, 110)
		heads.visible = false
		card.add_child(heads)
		var rr := RollRow.new()
		rr.font = font_l
		rr.size_px = 58
		rr.position = Vector2(28, 38)
		rr.size = Vector2(720, 80)
		rr.accent = spec[2]
		card.add_child(rr)
		rows[spec[0]] = rr
		y += 146
	arm_btn = _button("ARM", 30, Color(0.16, 0.12, 0.06), AMBER, 22)
	arm_btn.position = Vector2(820, 14)
	arm_btn.size = Vector2(424, 96)
	arm_btn.pressed.connect(_on_arm)
	p.add_child(arm_btn)
	arm_lbl = _label("Circuits off", font_m, 16, DIM)
	arm_lbl.position = Vector2(836, 116)
	p.add_child(arm_lbl)
	var grid := GridContainer.new()
	grid.columns = 2
	grid.position = Vector2(820, 146)
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 10)
	p.add_child(grid)
	var eras: Array = load("res://src/fx/time_travel.gd").ERAS
	for e in eras:
		var d: Dictionary = e["date"]
		var t := "%s  ·  %s" % [String(e["label"]), load("res://src/fx/time_travel.gd").fmt_year(int(d["y"]))]
		var b := _button(t, 15, CARD2, TXT, 12)
		b.custom_minimum_size = Vector2(207, 50)
		b.clip_text = true
		b.pressed.connect(_on_era.bind(e))
		grid.add_child(b)
	var kp := _button("Keypad", 15, CARD2, TXT, 12)
	kp.custom_minimum_size = Vector2(207, 50)
	kp.pressed.connect(_toggle_keypad)
	grid.add_child(kp)
	var pad := Panel.new()
	pad.name = "Keypad"
	pad.add_theme_stylebox_override("panel", _sb(Color(0.08, 0.083, 0.09, 0.98), 24, Color(1, 1, 1, 0.06), 1))
	pad.position = Vector2(300, 6)
	pad.size = Vector2(680, 600)
	pad.visible = false
	p.add_child(pad)
	var pt := _label("Enter destination  ·  MM DD YYYY HH MM", font_m, 18, DIM)
	pt.position = Vector2(30, 20)
	pad.add_child(pt)
	entry_lbl = _label("", font_l, 44, TXT)
	entry_lbl.position = Vector2(30, 52)
	pad.add_child(entry_lbl)
	var kg := GridContainer.new()
	kg.columns = 4
	kg.position = Vector2(30, 130)
	kg.add_theme_constant_override("h_separation", 12)
	kg.add_theme_constant_override("v_separation", 12)
	pad.add_child(kg)
	for k in ["1", "2", "3", "BC", "4", "5", "6", "⌫", "7", "8", "9", "Clear", "Close", "0", "Year only", "Set"]:
		var b2 := _button(k, 26, CARD2 if k != "Set" else Color(0.12, 0.22, 0.42), TXT, 16)
		b2.custom_minimum_size = Vector2(143, 98)
		b2.pressed.connect(_on_key.bind(k))
		kg.add_child(b2)

func _toggle_keypad() -> void:
	var pad: Control = pages["time"].get_node("Keypad")
	pad.visible = not pad.visible
	entry = ""
	bc = false
	_update_entry()
	_click()

func _update_entry() -> void:
	var digits := entry
	var shown := ""
	var groups := [2, 2, 4, 2, 2]
	var idx := 0
	for gsz in groups:
		var part := digits.substr(idx, gsz)
		part += "_".repeat(gsz - part.length())
		shown += part + "  "
		idx += gsz
	if digits.length() > 12:
		shown = digits + "  (year)"
	entry_lbl.text = shown.strip_edges() + ("   BC" if bc else "")

func _on_key(k: String) -> void:
	_click()
	match k:
		"⌫":
			entry = entry.substr(0, maxi(entry.length() - 1, 0))
		"Clear":
			entry = ""
			bc = false
		"Close":
			pages["time"].get_node("Keypad").visible = false
		"BC":
			bc = not bc
		"Year only":
			if entry.length() > 0:
				var y := int(entry)
				if bc:
					y = -y
				game.tt.set_destination({"y": y, "m": 6, "d": 21, "h": 12, "min": 0, "has_date": false})
				pages["time"].get_node("Keypad").visible = false
				entry = ""
		"Set":
			if entry.length() >= 8:
				var mo := clampi(int(entry.substr(0, 2)), 1, 12)
				var dd := clampi(int(entry.substr(2, 2)), 1, 31)
				var yy := int(entry.substr(4, 4))
				var hh := clampi(int(entry.substr(8, 2)) if entry.length() >= 10 else 12, 0, 23)
				var mi := clampi(int(entry.substr(10, 2)) if entry.length() >= 12 else 0, 0, 59)
				if bc:
					yy = -yy
				game.tt.set_destination({"y": yy, "m": mo, "d": dd, "h": hh, "min": mi, "has_date": not bc})
				pages["time"].get_node("Keypad").visible = false
				entry = ""
		_:
			if entry.length() < 16:
				entry += k
	_update_entry()

func _on_arm() -> void:
	if game.tt:
		game.tt.toggle_arm()
	_toggle_sound()
	refresh()

func _on_era(e: Dictionary) -> void:
	game.tt.set_destination(e["date"])
	_click()

func refresh() -> void:
	var tt = game.tt
	if tt == null:
		return
	rows["dest"].set_text(tt.fmt(tt.destination))
	rows["present"].set_text(tt.fmt(tt.present))
	rows["last"].set_text(tt.fmt(tt.last_departed))
	arm_btn.text = "ARMED" if tt.armed else "ARM"
	arm_btn.add_theme_stylebox_override("normal", _sb(Color(0.32, 0.2, 0.04) if tt.armed else Color(0.16, 0.12, 0.06), 22, AMBER if tt.armed else Color(0, 0, 0, 0), 2 if tt.armed else 0))
	arm_lbl.text = "Reach 88 mph" if tt.armed else "Circuits off"
	clock_lbl.text = "%02d:%02d" % [int(tt.present["h"]), int(tt.present["min"])]
	if radio_lbl:
		var era: Dictionary = tt.era_of_year(int(tt.present["y"]))
		radio_lbl.text = "%s  ·  %s" % [String(era["label"]), tt.fmt_year(int(tt.present["y"]))]

func _build_map(p: Control) -> void:
	var card := Panel.new()
	card.add_theme_stylebox_override("panel", _sb(CARD, 20))
	card.position = Vector2(36, 10)
	card.size = Vector2(W - 72, p.size.y - 20)
	p.add_child(card)
	map_ctl = MapView.new()
	map_ctl.ui = self
	map_ctl.position = Vector2(12, 12)
	map_ctl.size = card.size - Vector2(24, 24)
	map_ctl.clip_contents = true
	card.add_child(map_ctl)

func _draw_map(ctl: Control) -> void:
	var c: Car = game.car
	if c == null:
		return
	var center := c.global_position
	var scale := 1.1
	var sz := ctl.size
	var to_px := func(wp: Vector3) -> Vector2:
		return sz * 0.5 + Vector2(-(wp.x - center.x), -(wp.z - center.z)) * scale
	ctl.draw_rect(Rect2(Vector2.ZERO, sz), Color(0.075, 0.078, 0.085))
	var gstep := 50.0
	var gx: float = floor((center.x - sz.x / scale) / gstep) * gstep
	while gx < center.x + sz.x / scale:
		var a: Vector2 = to_px.call(Vector3(gx, 0, center.z - 2000))
		var b: Vector2 = to_px.call(Vector3(gx, 0, center.z + 2000))
		ctl.draw_line(a, b, Color(1, 1, 1, 0.035), 1.0)
		gx += gstep
	var gz: float = floor((center.z - sz.y / scale) / gstep) * gstep
	while gz < center.z + sz.y / scale:
		var a2: Vector2 = to_px.call(Vector3(center.x - 2000, 0, gz))
		var b2: Vector2 = to_px.call(Vector3(center.x + 2000, 0, gz))
		ctl.draw_line(a2, b2, Color(1, 1, 1, 0.035), 1.0)
		gz += gstep
	var zones := [[Rect2(-230, -40, 200, 360), Color(0.62, 0.2, 0.17, 0.25), "Crash"], [Rect2(30, -40, 250, 420), Color(0.17, 0.32, 0.55, 0.3), "Jumps"], [Rect2(-470, -130, 220, 450), Color(0.85, 0.6, 0.12, 0.22), "Flight"], [Rect2(40, 480, 420, 640), Color(0.2, 0.45, 0.25, 0.28), "Stunts"]]
	for z in zones:
		var r: Rect2 = z[0]
		var p0: Vector2 = to_px.call(Vector3(r.position.x, 0, r.position.y))
		var p1: Vector2 = to_px.call(Vector3(r.end.x, 0, r.end.y))
		var rr := Rect2(p0, p1 - p0).abs()
		ctl.draw_rect(rr, z[1])
		ctl.draw_string(font_m, rr.position + Vector2(10, 24), z[2], HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color(1, 1, 1, 0.55))
	var s0: Vector2 = to_px.call(Vector3(0, 0, -150))
	var s1: Vector2 = to_px.call(Vector3(0, 0, 2050))
	ctl.draw_line(s0, s1, Color(0.32, 0.34, 0.37), 24.0 * scale)
	if game.plate:
		for h in game.plate.pads.keys():
			var pp: Vector2 = to_px.call(game.plate.pads[h])
			ctl.draw_rect(Rect2(pp - Vector2(9, 9) * scale, Vector2(18, 18) * scale), Color(1.0, 0.68, 0.18, 0.6))
			ctl.draw_string(font_m, pp + Vector2(12, 5), "%d m" % int(h), HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color(1, 1, 1, 0.6))
	for wck in game.wrecks:
		if is_instance_valid(wck):
			ctl.draw_circle(to_px.call(wck.global_position), 5.0, Color(1, 1, 1, 0.3))
	var cp: Vector2 = to_px.call(center)
	var f := c.global_transform.basis.z
	var dir := Vector2(-f.x, -f.z).normalized()
	var side := Vector2(-dir.y, dir.x)
	var pts := PackedVector2Array([cp + dir * 16, cp - dir * 10 + side * 10, cp - dir * 5, cp - dir * 10 - side * 10])
	ctl.draw_colored_polygon(pts, ACCENT)
	ctl.draw_string(font_m, Vector2(18, sz.y - 18), "Test plate  ·  %.0f m, %.0f m" % [center.x, center.z], HORIZONTAL_ALIGNMENT_LEFT, -1, 16, DIM)

func _build_car(p: Control) -> void:
	var col := VBoxContainer.new()
	col.position = Vector2(36, 10)
	col.size = Vector2(560, 560)
	col.add_theme_constant_override("separation", 12)
	p.add_child(col)
	for spec in [["assist", "Flight Assist"], ["roof", "Targa roof"], ["wing", "Rear wing"]]:
		var b := _button(spec[1], 24, CARD, TXT, 18)
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.custom_minimum_size = Vector2(560, 84)
		b.pressed.connect(_on_toggle.bind(spec[0]))
		col.add_child(b)
		toggles[spec[0]] = b
	var rep := _button("Repair  ·  new Roadster", 24, CARD, TXT, 18)
	rep.alignment = HORIZONTAL_ALIGNMENT_LEFT
	rep.custom_minimum_size = Vector2(560, 84)
	rep.pressed.connect(func(): game.respawn.call_deferred())
	col.add_child(rep)
	var right := VBoxContainer.new()
	right.position = Vector2(640, 10)
	right.size = Vector2(600, 560)
	right.add_theme_constant_override("separation", 10)
	p.add_child(right)
	right.add_child(_label("Paint", font_m, 18, DIM))
	var pg := GridContainer.new()
	pg.columns = 5
	pg.add_theme_constant_override("h_separation", 12)
	right.add_child(pg)
	for pn in CarMaterials.PAINT_ORDER:
		var pc: Color = CarMaterials.PAINTS[pn]["base"]
		var b2 := _button("", 12, pc, TXT, 40)
		b2.custom_minimum_size = Vector2(100, 100)
		b2.tooltip_text = pn
		b2.pressed.connect(_on_paint.bind(pn))
		pg.add_child(b2)
	right.add_child(_label("Outfit", font_m, 18, DIM))
	var og := GridContainer.new()
	og.columns = 2
	og.add_theme_constant_override("h_separation", 12)
	og.add_theme_constant_override("v_separation", 10)
	right.add_child(og)
	for o in [["default", "AR hoodie · sweatpants · Crocs"], ["tee", "Biedronka tee"], ["af1", "Nike AF1 tee"], ["tnf", "TNF Quest jacket"], ["pigeon", "Stapleverse hoodie"], ["cap", "+ Murakami cap"]]:
		var b3 := _button(o[1], 16, CARD, TXT, 14)
		b3.custom_minimum_size = Vector2(290, 62)
		b3.clip_text = true
		b3.pressed.connect(_on_outfit.bind(o[0]))
		og.add_child(b3)
	_refresh_toggles()

func _refresh_toggles() -> void:
	var st := {"assist": game.assist, "roof": game.roof, "wing": game.wing}
	for k in toggles.keys():
		var b: Button = toggles[k]
		var on: bool = st[k]
		var base: String = {"assist": "Flight Assist", "roof": "Targa roof", "wing": "Rear wing"}[k]
		b.text = "%s        %s" % [base, "On" if on else "Off"]
		b.add_theme_stylebox_override("normal", _sb(Color(0.1, 0.2, 0.38) if on else CARD, 18))

func _on_toggle(k: String) -> void:
	match k:
		"assist":
			game.set_assist(not game.assist)
		"roof":
			game.set_roof(not game.roof)
		"wing":
			game.set_wing(not game.wing)
	_toggle_sound()
	_refresh_toggles()

func _on_paint(pn: String) -> void:
	game.set_paint(pn)
	_click()

func _on_outfit(o: String) -> void:
	if game.driver and game.driver.has_method("set_outfit"):
		game.driver.set_outfit(o)
	_click()

func _build_radio(p: Control) -> void:
	var card := Panel.new()
	card.add_theme_stylebox_override("panel", _sb(CARD, 20))
	card.position = Vector2(36, 10)
	card.size = Vector2(W - 72, 250)
	p.add_child(card)
	var t := _label("Era radio", font_m, 18, DIM)
	t.position = Vector2(30, 20)
	card.add_child(t)
	radio_lbl = _label("", font_l, 46, TXT)
	radio_lbl.position = Vector2(30, 56)
	card.add_child(radio_lbl)
	var note := _label("Music follows the present era", font_m, 16, DIM)
	note.position = Vector2(30, 130)
	card.add_child(note)
	radio_btn = _button("Play", 26, Color(0.12, 0.22, 0.42), TXT, 18)
	radio_btn.position = Vector2(30, 168)
	radio_btn.size = Vector2(200, 64)
	radio_btn.pressed.connect(_on_radio)
	card.add_child(radio_btn)

func _on_radio() -> void:
	radio_on = not radio_on
	radio_btn.text = "Pause" if radio_on else "Play"
	var era := "2026"
	if game.tt:
		era = String(game.tt.era_of_year(int(game.tt.present["y"]))["id"])
	if game.audio and game.audio.has_method("set_radio"):
		game.audio.set_radio(radio_on, era)
	_click()

func _draw_tap() -> void:
	if tap_t < 0.6:
		var a := 1.0 - tap_t / 0.6
		tap_layer.draw_circle(last_tap, 14.0 + tap_t * 60.0, Color(1, 1, 1, 0.18 * a))
	if gaze_on:
		tap_layer.draw_circle(gaze, 6.0, Color(1, 1, 1, 0.22))

func show_tap(pos: Vector2) -> void:
	last_tap = pos
	tap_t = 0.0

var gaze := Vector2(-100, -100)
var gaze_on := false

func set_gaze(p: Vector2, on: bool) -> void:
	if p.distance_to(gaze) > 0.5 or on != gaze_on:
		gaze = p
		gaze_on = on
		if tap_layer:
			tap_layer.queue_redraw()

func _process(dt: float) -> void:
	tap_t += dt
	if tap_t < 0.7 and tap_layer:
		tap_layer.queue_redraw()
