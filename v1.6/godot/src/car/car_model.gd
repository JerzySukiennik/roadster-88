# CarModel: instantiates the real roadster.glb (or the lighter roadster_lod1.glb for lod 1) when synced and imported, keeps its animation clips as "clips" meta on the root, otherwise a cached procedural placeholder with the same node names.
class_name CarModel
extends RefCounted

const GLB := "res://ext/assets/car/roadster.glb"
const GLB_LOD1 := "res://ext/assets/car/roadster_lod1.glb"

static var _template: Node3D = null
static var using_real := false

static func instantiate(lod := 0) -> Node3D:
	var path := GLB_LOD1 if lod >= 1 and ResourceLoader.exists(GLB_LOD1) else GLB
	if ResourceLoader.exists(path):
		var ps: Variant = load(path)
		if ps is PackedScene:
			var inst: Node = (ps as PackedScene).instantiate()
			var clips := {}
			for ap in inst.find_children("*", "AnimationPlayer", true, false):
				var player := ap as AnimationPlayer
				for an in player.get_animation_list():
					clips[String(an).get_file()] = player.get_animation(an)
			var root := inst.find_child("Roadster", true, false) as Node3D
			if root == null:
				root = inst as Node3D
			elif root != inst:
				root.get_parent().remove_child(root)
				root.owner = null
				for ch in root.find_children("*", "", true, false):
					ch.owner = null
				inst.queue_free()
			for ap in root.find_children("*", "AnimationPlayer", true, false):
				ap.get_parent().remove_child(ap)
				ap.queue_free()
			root.set_meta("clips", clips)
			using_real = true
			return root
	if _template == null:
		_template = CarPlaceholder.new().build()
	using_real = false
	return _template.duplicate() as Node3D
