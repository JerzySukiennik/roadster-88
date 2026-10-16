# Tuning: loads shared/tuning.json (live file next to the project in dev, synced copy in exports) as a plain static table.
class_name Tuning
extends RefCounted

static var _data: Dictionary = {}
static var _path: String = ""

static func shared_path(file: String) -> String:
	var live := ProjectSettings.globalize_path("res://").path_join("../shared").path_join(file).simplify_path()
	if FileAccess.file_exists(live):
		return live
	return "res://ext/shared/" + file

static func load_json(file: String) -> Variant:
	var p := shared_path(file)
	if not FileAccess.file_exists(p):
		return null
	var txt := FileAccess.get_file_as_string(p)
	return JSON.parse_string(txt)

static func data() -> Dictionary:
	if _data.is_empty():
		reload()
	return _data

static func reload() -> void:
	var d: Variant = load_json("tuning.json")
	if d is Dictionary:
		_data = d
		_path = shared_path("tuning.json")
	else:
		push_error("tuning.json missing or invalid")
		_data = {}

static func path() -> String:
	return _path

static func g(section: String, key: String, fallback: Variant = 0.0) -> Variant:
	var d := data()
	if not d.has(section):
		return fallback
	var s: Variant = d[section]
	if s is Dictionary and s.has(key):
		return s[key]
	return fallback

static func f(section: String, key: String, fallback: float = 0.0) -> float:
	return float(g(section, key, fallback))

static func v3(section: String, key: String, fallback: Vector3 = Vector3.ZERO) -> Vector3:
	var a: Variant = g(section, key, null)
	if a is Array and a.size() >= 3:
		return Vector3(float(a[0]), float(a[1]), float(a[2]))
	return fallback

static func top(key: String, fallback: Variant = 0.0) -> Variant:
	var d := data()
	return d.get(key, fallback)
