# Lattice test: headless crush of the damage lattice at several speeds, prints crush depth, broken beams and solver cost.
extends SceneTree

func _initialize() -> void:
	Tuning.reload()
	var d := LatticeGen.generate()
	print("nodes ", d["nodes"].size(), " beams ", d["beams"].size())
	for spd in [13.4, 35.8, 89.4]:
		var lat := Lattice.new()
		lat.load_dict(d)
		lat.substeps = 3
		lat.window = 0.6
		var nose := 0.0
		for i in lat.n:
			nose = maxf(nose, lat.p0[i].z)
		lat.impact(Vector3(0, 0.45, nose + 0.08), Vector3(0, 0, -1), spd, 1950.0, 3.0, clampf(0.25 + spd * 0.05, 0.3, 2.6))
		var steps := 0
		var t0 := Time.get_ticks_usec()
		while lat.active and steps < 200:
			lat.step(1.0 / 60.0)
			steps += 1
			if steps <= 3 or steps % 10 == 0:
				var it: Dictionary = lat.intruders[0] if lat.intruders.size() > 0 else {}
				print("  step ", steps, " broken ", lat.broken_count, " d ", it.get("d", -1), " v ", it.get("v", -1), " f ", it.get("f", -1))
		var ms := float(Time.get_ticks_usec() - t0) / 1000.0
		print("speed ", spd, " steps ", steps, " ms total ", ms, " crush ", lat.crush_extent(), " broken ", lat.broken_count, " plastic ", lat.plastic_total)
	quit()
