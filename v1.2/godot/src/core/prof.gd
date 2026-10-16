# Prof: tiny accumulating CPU profiler for scenario reports (static, no nodes).
class_name Prof
extends RefCounted

static var acc: Dictionary = {}
static var cnt: Dictionary = {}
static var enabled := false

static func add(key: String, usec: int) -> void:
	if not enabled:
		return
	acc[key] = acc.get(key, 0) + usec
	cnt[key] = cnt.get(key, 0) + 1

static func report(frames: int) -> String:
	var parts := PackedStringArray()
	var keys := acc.keys()
	keys.sort_custom(func(a, b): return acc[a] > acc[b])
	for k in keys:
		parts.append("%s %.2fms/frame (%.3fms/call)" % [k, float(acc[k]) / 1000.0 / maxf(frames, 1), float(acc[k]) / 1000.0 / maxf(cnt[k], 1)])
	return ", ".join(parts)

static func reset() -> void:
	acc.clear()
	cnt.clear()
