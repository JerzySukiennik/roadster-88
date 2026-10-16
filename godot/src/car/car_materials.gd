# CarMaterials: per-car material set keyed by the contract material names (paints, glass, lights, screens, nozzles) plus deforming copies of every other imported material; owns the damage-field uniforms.
class_name CarMaterials
extends RefCounted

const PAINTS := {
	"Red Multi-Coat": {"base": Color(0.56, 0.012, 0.018), "deep": Color(0.13, 0.0, 0.006), "flake": Color(1.0, 0.4, 0.34), "metal": 0.25, "rough": 0.16, "flakes": 0.5},
	"Pearl White Multi-Coat": {"base": Color(0.86, 0.86, 0.84), "deep": Color(0.72, 0.74, 0.78), "flake": Color(1.0, 0.96, 0.9), "metal": 0.08, "rough": 0.3, "flakes": 0.35},
	"Solid Black": {"base": Color(0.018, 0.018, 0.02), "deep": Color(0.008, 0.008, 0.01), "flake": Color(0.2, 0.2, 0.2), "metal": 0.0, "rough": 0.26, "flakes": 0.0},
	"Midnight Silver Metallic": {"base": Color(0.27, 0.285, 0.31), "deep": Color(0.09, 0.095, 0.11), "flake": Color(0.85, 0.88, 0.95), "metal": 0.62, "rough": 0.3, "flakes": 0.8},
	"Deep Blue Metallic": {"base": Color(0.03, 0.12, 0.42), "deep": Color(0.008, 0.025, 0.13), "flake": Color(0.55, 0.7, 1.0), "metal": 0.5, "rough": 0.28, "flakes": 0.8},
}
const PAINT_ORDER := ["Red Multi-Coat", "Pearl White Multi-Coat", "Solid Black", "Midnight Silver Metallic", "Deep Blue Metallic"]
const OWN := ["Paint", "Glass_Tint", "Glass_Clear", "Lens", "Lens_Tail", "LED_Head", "LED_Tail", "Screen", "Cluster", "Nozzle_Metal", "Nozzle_Inner"]

static var _paint_shader: Shader
static var _glass_shader: Shader
static var _generic_shader: Shader

var mats: Dictionary = {}
var nozzle_mats: Dictionary = {}
var converted: Dictionary = {}
var all_shader_mats: Array[ShaderMaterial] = []
var deform_tex: Texture3D = null
var paint_name: String = "Red Multi-Coat"

static func _shaders() -> void:
	if _paint_shader == null:
		_paint_shader = load("res://src/car/car_paint.gdshader")
		_glass_shader = load("res://src/car/car_glass.gdshader")
		_generic_shader = load("res://src/car/car_generic.gdshader")

func _init() -> void:
	_shaders()
	var paint := ShaderMaterial.new()
	paint.shader = _paint_shader
	_reg("Paint", paint)
	set_paint(paint_name)
	_reg("Paint_Black", _gen(Color(0.012, 0.012, 0.014), 0.22, 0.0, {"clearcoat": 1.0, "clearcoat_rough": 0.04}))
	_reg("Carbon", _gen(Color(0.03, 0.032, 0.036), 0.32, 0.15, {"clearcoat": 1.0, "clearcoat_rough": 0.05, "weave": 1.0}))
	_reg("Chrome", _gen(Color(0.9, 0.9, 0.9), 0.06, 1.0))
	_reg("Rubber", _gen(Color(0.02, 0.02, 0.022), 0.85, 0.0))
	_reg("Underbody", _gen(Color(0.012, 0.012, 0.013), 0.9, 0.0))
	_reg("Interior_Leather", _gen(Color(0.86, 0.85, 0.82), 0.55, 0.0, {"grain": 1.0}))
	_reg("Interior_Dark", _gen(Color(0.03, 0.03, 0.033), 0.6, 0.0, {"grain": 0.6}))
	_reg("Alcantara", _gen(Color(0.045, 0.045, 0.05), 0.92, 0.0, {"grain": 1.0}))
	_reg("LED_Head", _gen(Color(0.9, 0.95, 1.0), 0.2, 0.0, {"emission": Color(0.85, 0.92, 1.0), "emission_energy": 6.0}))
	_reg("LED_Tail", _gen(Color(0.25, 0.0, 0.0), 0.2, 0.0, {"emission": Color(1.0, 0.02, 0.01), "emission_energy": 2.5}))
	_reg("Screen", _gen(Color(0.0, 0.0, 0.0), 0.12, 0.0, {"use_tex": 0.0, "tex_emit": 1.0, "clearcoat": 1.0, "clearcoat_rough": 0.02}))
	_reg("Cluster", _gen(Color(0.0, 0.0, 0.0), 0.12, 0.0, {"use_tex": 0.0, "tex_emit": 1.0, "clearcoat": 1.0, "clearcoat_rough": 0.02}))
	var glass := ShaderMaterial.new()
	glass.shader = _glass_shader
	_reg("Glass_Tint", glass)
	var clear := ShaderMaterial.new()
	clear.shader = _glass_shader
	clear.set_shader_parameter("tint", Color(0.6, 0.62, 0.65, 0.12))
	clear.set_shader_parameter("inside_alpha", 0.06)
	_reg("Glass_Clear", clear)
	var lens := ShaderMaterial.new()
	lens.shader = _glass_shader
	lens.set_shader_parameter("tint", Color(0.5, 0.52, 0.55, 0.16))
	lens.set_shader_parameter("inside_alpha", 0.16)
	_reg("Lens", lens)
	var lens_t := ShaderMaterial.new()
	lens_t.shader = _glass_shader
	lens_t.set_shader_parameter("tint", Color(0.45, 0.02, 0.02, 0.45))
	lens_t.set_shader_parameter("inside_alpha", 0.45)
	_reg("Lens_Tail", lens_t)
	mats["Tire"] = _std(Color(0.035, 0.035, 0.038), 0.82, 0.0)
	mats["Rim"] = _std(Color(0.11, 0.115, 0.12), 0.32, 0.85)
	mats["Rim"].cull_mode = BaseMaterial3D.CULL_DISABLED
	mats["Brake_Disc"] = _std(Color(0.42, 0.42, 0.43), 0.38, 0.95)
	mats["Caliper"] = _std(Color(0.7, 0.02, 0.02), 0.35, 0.0)
	mats["Caliper"].clearcoat_enabled = true
	mats["Nozzle_Inner"] = _std(Color(0.015, 0.015, 0.016), 0.6, 0.6)
	mats["Nozzle_Inner"].cull_mode = BaseMaterial3D.CULL_DISABLED
	mats["Nozzle_Metal"] = _std(Color(0.62, 0.6, 0.58), 0.28, 1.0)

func _reg(nm: String, m: Material) -> void:
	mats[nm] = m
	if m is ShaderMaterial:
		all_shader_mats.append(m)

func _gen(c: Color, rough: float, metal: float, extra: Dictionary = {}) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = _generic_shader
	m.set_shader_parameter("albedo", c)
	m.set_shader_parameter("roughness", rough)
	m.set_shader_parameter("metallic", metal)
	for k in extra.keys():
		m.set_shader_parameter(k, extra[k])
	return m

func _std(c: Color, rough: float, metal: float) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = rough
	m.metallic = metal
	return m

func set_paint(nm: String) -> void:
	if not PAINTS.has(nm):
		nm = "Red Multi-Coat"
	paint_name = nm
	var p: Dictionary = PAINTS[nm]
	var m: ShaderMaterial = mats["Paint"]
	m.set_shader_parameter("base_color", p["base"])
	m.set_shader_parameter("deep_color", p["deep"])
	m.set_shader_parameter("flake_color", p["flake"])
	m.set_shader_parameter("metallic_amt", p["metal"])
	m.set_shader_parameter("base_roughness", p["rough"])
	m.set_shader_parameter("flake_amount", p["flakes"])

func set_deform(tex: Texture3D, on: bool) -> void:
	deform_tex = tex
	for m in all_shader_mats:
		m.set_shader_parameter("deform_tex", tex)
		m.set_shader_parameter("lattice_on", 1.0 if on else 0.0)

func set_world_to_car(xf: Transform3D) -> void:
	var proj := Projection(xf)
	for m in all_shader_mats:
		m.set_shader_parameter("world_to_car", proj)

func nozzle_mat(nm: String) -> StandardMaterial3D:
	if not nozzle_mats.has(nm):
		var m: StandardMaterial3D = mats["Nozzle_Metal"].duplicate()
		nozzle_mats[nm] = m
	return nozzle_mats[nm]

func apply(root: Node) -> void:
	_apply_rec(root, "")

static func _has_textures(m: Material) -> bool:
	if m is BaseMaterial3D:
		var b := m as BaseMaterial3D
		return b.albedo_texture != null or b.normal_texture != null or b.roughness_texture != null or b.orm_texture != null
	return false

func _convert(src: Material, key: String) -> Material:
	var id := src.get_instance_id()
	if converted.has(id):
		return converted[id]
	var out: Material = src
	if src is BaseMaterial3D:
		var b := src as BaseMaterial3D
		if b.transparency != BaseMaterial3D.TRANSPARENCY_DISABLED:
			converted[id] = src
			return src
		var lib: ShaderMaterial = mats.get(key) if mats.get(key) is ShaderMaterial else null
		var m: ShaderMaterial
		if lib and not _has_textures(src):
			m = lib
		else:
			m = ShaderMaterial.new()
			m.shader = _generic_shader
			if lib:
				for p in ["clearcoat", "clearcoat_rough", "weave", "grain"]:
					m.set_shader_parameter(p, lib.get_shader_parameter(p))
			var ac := b.albedo_color
			if key == "Carbon" and b.albedo_texture:
				ac = Color(ac.r * 0.3, ac.g * 0.3, ac.b * 0.32, ac.a)
				m.set_shader_parameter("clearcoat", 1.0)
				m.set_shader_parameter("clearcoat_rough", 0.05)
			m.set_shader_parameter("albedo", ac)
			m.set_shader_parameter("roughness", b.roughness)
			m.set_shader_parameter("metallic", b.metallic)
			if b.albedo_texture:
				m.set_shader_parameter("tex", b.albedo_texture)
				m.set_shader_parameter("use_tex", 1.0)
				m.set_shader_parameter("weave", 0.0)
			if b.normal_enabled and b.normal_texture:
				m.set_shader_parameter("normal_tex", b.normal_texture)
				m.set_shader_parameter("use_normal", 1.0)
				m.set_shader_parameter("normal_scale", b.normal_scale)
			var rt: Texture2D = b.roughness_texture
			if rt:
				m.set_shader_parameter("rough_tex", rt)
				m.set_shader_parameter("use_rough", 1.0)
				m.set_shader_parameter("rough_channel", _channel(b.roughness_texture_channel))
			if b.metallic_texture:
				m.set_shader_parameter("metal_tex", b.metallic_texture)
				m.set_shader_parameter("use_metal", 1.0)
				m.set_shader_parameter("metal_channel", _channel(b.metallic_texture_channel))
			if b.emission_enabled:
				m.set_shader_parameter("emission", b.emission)
				m.set_shader_parameter("emission_energy", b.emission_energy_multiplier)
			m.set_shader_parameter("uv_scale", b.uv1_scale)
			m.set_shader_parameter("uv_offset", b.uv1_offset)
			if b.clearcoat_enabled:
				m.set_shader_parameter("clearcoat", b.clearcoat)
				m.set_shader_parameter("clearcoat_rough", b.clearcoat_roughness)
			all_shader_mats.append(m)
			if deform_tex:
				m.set_shader_parameter("deform_tex", deform_tex)
		out = m
	converted[id] = out
	return out

static func _channel(c: int) -> Vector4:
	match c:
		BaseMaterial3D.TEXTURE_CHANNEL_RED:
			return Vector4(1, 0, 0, 0)
		BaseMaterial3D.TEXTURE_CHANNEL_GREEN:
			return Vector4(0, 1, 0, 0)
		BaseMaterial3D.TEXTURE_CHANNEL_BLUE:
			return Vector4(0, 0, 1, 0)
		BaseMaterial3D.TEXTURE_CHANNEL_ALPHA:
			return Vector4(0, 0, 0, 1)
	return Vector4(0.333, 0.333, 0.333, 0)

func _apply_rec(n: Node, nozzle: String) -> void:
	var nz := nozzle
	if String(n.name).begins_with("Nozzle_") and not String(n.name).begins_with("NozzleMount"):
		nz = String(n.name)
	if n is MeshInstance3D:
		var mi: MeshInstance3D = n
		if mi.mesh:
			for i in mi.mesh.get_surface_count():
				var src: Material = mi.mesh.surface_get_material(i)
				var key := _canonical(src.resource_name) if src else ""
				var rigid := _rigid_node(mi)
				if key == "Nozzle_Metal" and nz != "":
					mi.set_surface_override_material(i, nozzle_mat(nz))
				elif OWN.has(key):
					mi.set_surface_override_material(i, mats[key])
				elif rigid and mats.has(key) and not _has_textures(src):
					mi.set_surface_override_material(i, mats[key])
				elif rigid and src:
					mi.set_surface_override_material(i, src)
				elif src:
					mi.set_surface_override_material(i, _convert(src, key))
	for c in n.get_children():
		_apply_rec(c, nz)

static func _rigid_node(mi: Node) -> bool:
	var p: Node = mi
	while p:
		var nm := String(p.name)
		if nm.begins_with("Wheel_") or nm.begins_with("Steer_") or nm.begins_with("Brake_") or nm.begins_with("Nozzle_") or nm.begins_with("Tire_") or nm.begins_with("Rim_"):
			return true
		if nm == "Roadster":
			return false
		p = p.get_parent()
	return false

static func _canonical(nm: String) -> String:
	var s := nm
	var dot := s.find(".")
	if dot > 0:
		s = s.substr(0, dot)
	return s
