# CarModel: instantiates the real roadster.glb when it has been synced and imported, otherwise a cached procedural placeholder with the same node names.
class_name CarModel
extends RefCounted

const GLB := "res://ext/assets/car/roadster.glb"

static var _template: Node3D = null
static var using_real := false

static func instantiate() -> Node3D:
	if ResourceLoader.exists(GLB):
		var ps: Variant = load(GLB)
		if ps is PackedScene:
			var inst: Node = (ps as PackedScene).instantiate()
			var root := inst.find_child("Roadster", true, false) as Node3D
			if root == null:
				root = inst as Node3D
			elif root != inst:
				root.get_parent().remove_child(root)
				root.owner = null
				for ch in root.find_children("*", "", true, false):
					ch.owner = null
				inst.queue_free()
			using_real = true
			return root
	if _template == null:
		_template = CarPlaceholder.new().build()
	using_real = false
	return _template.duplicate() as Node3D
