# PauseMenu: Esc overlay with quality preset, resolution scale, view options and the key list.
extends CanvasLayer

var game
var panel: Panel
var root: Control
var preset_btns: Array = []
var scale_lbl: Label
var font_m: Font
var font_l: Font

const KEYS := [
	["W", "Drive · rear thrust in the air"], ["S", "Brake · reverse · front retro in the air"], ["A / D", "Steer · yaw in the air"],
	["Shift", "Boost (Shift + S: retro on the ground)"], ["Space", "Tap: hop · hold: lift, climb, hover"], ["Ctrl", "Descend"],
	["Arrows", "Pitch and roll (tricks)"], ["Mouse", "Orbit camera · head look"], ["Click", "Tap the touchscreen (first person)"],
	["C", "First / third person"], ["T", "Arm time circuits"], ["R", "New Roadster next to the wreck"], ["F", "Doors"], ["Esc", "Pause"], ["F11", "Fullscreen"],
]

func _font(w: int) -> Font:
	var sf := SystemFont.new()
	sf.font_names = PackedStringArray(["SF Pro Display", "SF Pro", ".AppleSystemUIFont", "Helvetica Neue", "Inter"])
	sf.font_weight = w
	return sf

func _sb(c: Color, r := 18) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = c
	s.set_corner_radius_all(r)
	s.anti_aliasing = true
	return s

func _lbl(t: String, sz: int, col := Color(0.93, 0.94, 0.95), f: Font = null) -> Label:
	var l := Label.new()
	l.text = t
	l.add_theme_font_override("font", f if f else font_m)
	l.add_theme_font_size_override("font_size", sz)
	l.add_theme_color_override("font_color", col)
	return l

func _btn(t: String, cb: Callable) -> Button:
	var b := Button.new()
	b.text = t
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_override("font", font_m)
	b.add_theme_font_size_override("font_size", 17)
	b.add_theme_stylebox_override("normal", _sb(Color(1, 1, 1, 0.06), 12))
	b.add_theme_stylebox_override("hover", _sb(Color(1, 1, 1, 0.12), 12))
	b.add_theme_stylebox_override("pressed", _sb(Color(1, 1, 1, 0.2), 12))
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	b.custom_minimum_size = Vector2(120, 42)
	b.pressed.connect(cb)
	return b

func setup(g) -> void:
	game = g
	layer = 30
	process_mode = Node.PROCESS_MODE_ALWAYS
	font_m = _font(500)
	font_l = _font(300)
	root = Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.visible = false
	add_child(root)
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.45)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(dim)
	panel = Panel.new()
	panel.add_theme_stylebox_override("panel", _sb(Color(0.07, 0.072, 0.08, 0.94), 26))
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.custom_minimum_size = Vector2(760, 620)
	panel.position = Vector2(-380, -310)
	panel.size = Vector2(760, 620)
	root.add_child(panel)
	var v := VBoxContainer.new()
	v.position = Vector2(40, 32)
	v.size = Vector2(680, 560)
	v.add_theme_constant_override("separation", 12)
	panel.add_child(v)
	v.add_child(_lbl("Paused", 34, Color(0.95, 0.96, 0.97), font_l))
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 10)
	v.add_child(h)
	h.add_child(_lbl("Quality", 16, Color(0.6, 0.62, 0.66)))
	for i in 4:
		var b := _btn(SkyEnv.PRESETS[i], _set_preset.bind(i))
		h.add_child(b)
		preset_btns.append(b)
	var h2 := HBoxContainer.new()
	h2.add_theme_constant_override("separation", 10)
	v.add_child(h2)
	h2.add_child(_lbl("Resolution", 16, Color(0.6, 0.62, 0.66)))
	h2.add_child(_btn("−", _scale.bind(-0.05)))
	scale_lbl = _lbl("auto", 17)
	scale_lbl.custom_minimum_size = Vector2(90, 0)
	scale_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	h2.add_child(scale_lbl)
	h2.add_child(_btn("+", _scale.bind(0.05)))
	h2.add_child(_btn("Auto", _scale.bind(0.0)))
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 26)
	grid.add_theme_constant_override("v_separation", 5)
	v.add_child(grid)
	for k in KEYS:
		grid.add_child(_lbl(k[0], 15, Color(0.95, 0.96, 0.97)))
		grid.add_child(_lbl(k[1], 15, Color(0.6, 0.62, 0.66)))
	var h3 := HBoxContainer.new()
	h3.add_theme_constant_override("separation", 10)
	v.add_child(h3)
	h3.add_child(_btn("Resume", toggle))
	h3.add_child(_btn("Quit", func(): get_tree().quit()))
	_refresh()

func _set_preset(i: int) -> void:
	game.apply_preset(i)
	_refresh()

func _scale(d: float) -> void:
	if d == 0.0:
		game.res_scale = -1.0
	else:
		var cur: float = get_viewport().scaling_3d_scale if game.res_scale <= 0.0 else game.res_scale
		game.res_scale = clampf(cur + d, 0.35, 1.0)
	game.apply_preset(game.preset)
	_refresh()

func _refresh() -> void:
	for i in preset_btns.size():
		(preset_btns[i] as Button).add_theme_stylebox_override("normal", _sb(Color(0.24, 0.52, 1.0, 0.55) if i == game.preset else Color(1, 1, 1, 0.06), 12))
	scale_lbl.text = ("%d%%" % int(round(get_viewport().scaling_3d_scale * 100.0))) + ("" if game.res_scale > 0.0 else " auto")

func toggle() -> void:
	game.paused = not game.paused
	root.visible = game.paused
	get_tree().paused = game.paused
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if game.paused else Input.MOUSE_MODE_CAPTURED
	_refresh()
